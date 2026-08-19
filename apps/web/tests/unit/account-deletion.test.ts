// KVKK hesap silme akışının birim testleri (B-042 / AC-4.6.1 / AC-4.6.2).
//
// Kapsam:
//   * Onay cümlesi sözleşmesi — sunucu ve istemci sabitleri AYNI olmalı; Türkçe İ/ı
//     katlaması yüzünden "yaklaşık doğru" bir metin KABUL EDİLMEMELİ.
//   * `parseManifest` / `parseDeletionResult` — bozuk RPC çıktısında SESSİZCE devam
//     etmeyip `null` dönmeli (yarım silme yerine gürültülü 500).
//   * Route handler'ın kapıları: kimlik, onay, service_role yapılandırması,
//     "önce storage, sonra veritabanı" sırası ve idempotanslık.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Test edilen route `import 'server-only'` ile başlıyor; jsdom ortamında bu paket
// fırlatır. `vi.mock` hoisting nedeniyle importlardan ÖNCE, dosyanın en üstünde olmalı
// (aynı desen: tests/unit/proxy-auth.test.ts).
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/env.server', () => ({
  getServerEnv: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => {
  const silentLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((): typeof silentLogger => silentLogger),
  }
  return {
    logger: silentLogger,
    createRequestLogger: vi.fn((): typeof silentLogger => silentLogger),
  }
})

import { createClient } from '@supabase/supabase-js'

import { getServerEnv } from '@/env.server'
import {
  DELETE_CONFIRMATION_PHRASE,
  MAX_STORAGE_PASSES,
  deleteAccountBodySchema,
  parseDeletionResult,
  parseManifest,
} from '@/app/api/account/deletion-core'
import { POST } from '@/app/api/account/delete/route'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DELETE_ACCOUNT_CONFIRMATION } from '@repo/api-client'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SERVICE_ROLE_KEY = 'service-role-key-0123456789abcdef'

function makeRequest(body: unknown, token: string | null = 'valid-token'): Request {
  return new Request('http://localhost:3000/api/account/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

/** Bearer token'ı doğrulayan (GoTrue) istemciyi kurar. */
function setAuthUser(user: { id: string } | null): void {
  vi.mocked(createServerSupabaseClient).mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: 'invalid token' },
      }),
    },
  } as unknown as ReturnType<typeof createServerSupabaseClient>)
}

interface AdminMockOptions {
  /** `account_deletion_manifest` çağrılarının SIRAYLA döneceği değerler. */
  manifests?: unknown[]
  deletion?: unknown
  manifestError?: { message: string } | null
  deletionError?: { message: string } | null
  /** `storage.from(b).remove()` hata döndürsün mü? */
  removeError?: { message: string } | null
}

interface AdminMock {
  rpc: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  /** Storage silme çağrılarının, RPC çağrılarına GÖRE sırası (sıra iddiası için). */
  callOrder: string[]
}

function setAdminClient(options: AdminMockOptions = {}): AdminMock {
  const callOrder: string[] = []
  const manifests = [...(options.manifests ?? [])]

  const remove = vi.fn(async (paths: string[]) => {
    callOrder.push('storage.remove')
    if (options.removeError) return { data: null, error: options.removeError }
    return { data: paths.map((name) => ({ name })), error: null }
  })

  const rpc = vi.fn(async (fn: string) => {
    callOrder.push(fn)
    if (fn === 'account_deletion_manifest') {
      if (options.manifestError) return { data: null, error: options.manifestError }
      // Liste tükendiyse SON değeri tekrarla (tur sayısı testten teste değişiyor).
      const next = manifests.length > 1 ? manifests.shift() : manifests[0]
      return { data: next, error: null }
    }
    if (options.deletionError) return { data: null, error: options.deletionError }
    return { data: options.deletion, error: null }
  })

  vi.mocked(createClient).mockReturnValue({
    rpc,
    storage: { from: vi.fn(() => ({ remove })) },
  } as unknown as ReturnType<typeof createClient>)

  return { rpc, remove, callOrder }
}

const EMPTY_MANIFEST = {
  user_exists: true,
  role: 'client',
  rows: { profiles: 1 },
  row_total: 1,
  storage: {},
  storage_total: 0,
}

const OK_DELETION = {
  already_deleted: false,
  rows_deleted: { profiles: 1 },
  row_total: 1,
  storage_objects_deleted: 0,
}

beforeEach(() => {
  setAuthUser({ id: USER_ID })
  vi.mocked(getServerEnv).mockReturnValue({
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  } as unknown as ReturnType<typeof getServerEnv>)
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
describe('onay cümlesi sözleşmesi', () => {
  it('sunucu ve istemci sabitleri BİREBİR aynıdır', () => {
    // Sabit iki yerde yaşıyor (paket `apps/web`ten import edemez, bağımlılık yönü
    // tersine dönerdi). Biri değişip diğeri unutulursa arayüzde yazılan metin sunucuda
    // reddedilir ve hesap silme SESSİZCE kırılırdı. Bu iddia o sürüklenmeyi yakalar.
    expect(DELETE_ACCOUNT_CONFIRMATION).toBe(DELETE_CONFIRMATION_PHRASE)
  })

  it('cümle noktalı büyük İ (U+0130) içerir — katlama yapılmadığının kanıtı', () => {
    expect(DELETE_CONFIRMATION_PHRASE).toContain('İ')
  })

  it('birebir metni kabul eder, baştaki/sondaki boşluğu tolere eder', () => {
    expect(
      deleteAccountBodySchema.safeParse({ confirmation: DELETE_CONFIRMATION_PHRASE }).success
    ).toBe(true)
    expect(
      deleteAccountBodySchema.safeParse({ confirmation: `  ${DELETE_CONFIRMATION_PHRASE}\n` })
        .success
    ).toBe(true)
  })

  it.each([
    ['küçük harf', 'hesabımı sil'],
    ['noktasız I ile yazılmış', 'HESABIMI SIL'],
    ['eksik kelime', 'HESABIMI'],
    ['boş', ''],
    ['araya fazladan kelime', 'HESABIMI HEMEN SİL'],
  ])('%s onayı REDDEDİLİR', (_label, value) => {
    expect(deleteAccountBodySchema.safeParse({ confirmation: value }).success).toBe(false)
  })

  it('gövde `userId` alanı taşısa bile şema onu YOK SAYAR (kimlik yalnızca token’dan gelir)', () => {
    const parsed = deleteAccountBodySchema.safeParse({
      confirmation: DELETE_CONFIRMATION_PHRASE,
      userId: 'baskasinin-uid-si',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'userId' in parsed.data).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('parseManifest', () => {
  it('geçerli manifesti normalize eder ve BOŞ bucket’ları eler', () => {
    const result = parseManifest({
      user_exists: true,
      row_total: 7,
      storage_total: 2,
      storage: { avatars: ['a.png'], 'progress-photos': [], 'form-checks-media': ['poses/b.png'] },
    })
    expect(result).toEqual({
      userExists: true,
      rowTotal: 7,
      storageTotal: 2,
      storage: { avatars: ['a.png'], 'form-checks-media': ['poses/b.png'] },
    })
  })

  it.each([
    ['null', null],
    ['dizi', []],
    ['user_exists eksik', { row_total: 0, storage_total: 0, storage: {} }],
    ['row_total sayı değil', { user_exists: true, row_total: '0', storage_total: 0, storage: {} }],
    [
      'bucket içeriği string dizisi değil',
      { user_exists: true, row_total: 0, storage_total: 1, storage: { avatars: [42] } },
    ],
  ])('%s girdisinde null döner (sessizce devam ETMEZ)', (_label, input) => {
    expect(parseManifest(input)).toBeNull()
  })
})

describe('parseDeletionResult', () => {
  it('geçerli sonucu normalize eder', () => {
    expect(parseDeletionResult(OK_DELETION)).toEqual({
      alreadyDeleted: false,
      rowTotal: 1,
      storageObjectsDeleted: 0,
    })
  })

  it('eksik alanda null döner', () => {
    expect(parseDeletionResult({ already_deleted: true })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('POST /api/account/delete', () => {
  it('Authorization başlığı yoksa 401 döner ve service_role istemcisi HİÇ kurulmaz', async () => {
    setAdminClient()
    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }, null))

    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('token geçersizse 401 döner', async () => {
    setAuthUser(null)
    setAdminClient()
    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))

    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('onay metni yanlışsa 422 döner ve HİÇBİR silme çağrısı yapılmaz', async () => {
    const admin = setAdminClient()
    const response = await POST(makeRequest({ confirmation: 'hesabımı sil' }))

    expect(response.status).toBe(422)
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('SUPABASE_SERVICE_ROLE_KEY yoksa 503 döner — "sildim" DEMEZ', async () => {
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as unknown as ReturnType<typeof getServerEnv>)
    const admin = setAdminClient()

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(503)
    expect(body.error.code).toBe('ACCOUNT_DELETION_UNAVAILABLE')
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('mutlu yol: storage nesneleri ÖNCE silinir, silme RPC’si SONRA çağrılır', async () => {
    const admin = setAdminClient({
      manifests: [
        {
          user_exists: true,
          row_total: 3,
          storage_total: 2,
          storage: { avatars: ['u-a.png'], 'progress-photos': ['u/1.png'] },
        },
        // İkinci tur: storage temizlenmiş.
        { user_exists: true, row_total: 3, storage_total: 0, storage: {} },
      ],
      deletion: { ...OK_DELETION, row_total: 3, storage_objects_deleted: 2 },
    })

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))
    const body = (await response.json()) as {
      ok: boolean
      alreadyDeleted: boolean
      rowsDeleted: number
      storageObjectsDeleted: number
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      alreadyDeleted: false,
      rowsDeleted: 3,
      storageObjectsDeleted: 2,
    })

    // SIRA İDDİASI: `delete_account` çağrısı, storage silme çağrılarının HEPSİNDEN
    // SONRA gelmeli. Ters sıra, yarıda kalan bir koşuda YETİM dosya bırakırdı.
    const deleteIndex = admin.callOrder.indexOf('delete_account')
    const lastRemoveIndex = admin.callOrder.lastIndexOf('storage.remove')
    expect(deleteIndex).toBeGreaterThan(lastRemoveIndex)
    expect(admin.remove).toHaveBeenCalledTimes(2)

    // Silinecek kimlik GÖVDEDEN değil, doğrulanmış token'dan gelmeli.
    expect(admin.rpc).toHaveBeenCalledWith(
      'delete_account',
      expect.objectContaining({ p_user_id: USER_ID, p_storage_objects_deleted: 2 })
    )
  })

  it('storage zaten boşsa hiç remove çağrılmaz', async () => {
    const admin = setAdminClient({ manifests: [EMPTY_MANIFEST], deletion: OK_DELETION })

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))

    expect(response.status).toBe(200)
    expect(admin.remove).not.toHaveBeenCalled()
  })

  it('kullanıcı zaten silinmişse 200 + alreadyDeleted döner (idempotanslık)', async () => {
    setAdminClient({
      manifests: [{ user_exists: false, row_total: 0, storage_total: 0, storage: {} }],
      deletion: {
        already_deleted: true,
        rows_deleted: {},
        row_total: 0,
        storage_objects_deleted: 0,
      },
    })

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))
    const body = (await response.json()) as { ok: boolean; alreadyDeleted: boolean }

    expect(response.status).toBe(200)
    expect(body.alreadyDeleted).toBe(true)
  })

  it('storage temizlenemezse tur sayısı sınırlanır ve akış yine de RPC’ye devreder', async () => {
    // Her turda AYNI manifest dönüyor (nesneler bir türlü gitmiyor). Sunucu sonsuza
    // kadar denememeli; `delete_account` fail-closed reddedip 500 üretmeli.
    const admin = setAdminClient({
      manifests: [
        {
          user_exists: true,
          row_total: 1,
          storage_total: 1,
          storage: { avatars: ['u-a.png'] },
        },
      ],
      removeError: { message: 'storage down' },
      deletionError: { message: 'storage nesneleri hâlâ duruyor' },
    })

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))
    const body = (await response.json()) as { error: { code: string } }

    expect(admin.remove).toHaveBeenCalledTimes(MAX_STORAGE_PASSES)
    expect(response.status).toBe(500)
    expect(body.error.code).toBe('ACCOUNT_DELETION_FAILED')
  })

  it('manifest biçimi bozuksa 500 döner ve silme RPC’si ÇAĞRILMAZ', async () => {
    const admin = setAdminClient({ manifests: [{ nonsense: true }] })

    const response = await POST(makeRequest({ confirmation: DELETE_CONFIRMATION_PHRASE }))

    expect(response.status).toBe(500)
    expect(admin.rpc).not.toHaveBeenCalledWith('delete_account', expect.anything())
  })

  it('gövde JSON değilse 400 döner', async () => {
    setAdminClient()
    const request = new Request('http://localhost:3000/api/account/delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: 'bu json degil',
    })

    const response = await POST(request)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_JSON')
  })
})
