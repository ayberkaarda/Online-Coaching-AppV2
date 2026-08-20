// Faz 4.8 dilim 2 — `POST /api/activity` ve rıza uçlarının birim testleri.
//
// Kapsam:
//   * Sözleşme: kapalı listeler veritabanındaki CHECK kısıtlarıyla BİREBİR mi;
//     gövde `user_id` kabul ediyor mu (etmemeli).
//   * Kimlik: kimlik YALNIZCA doğrulanmış JWT'den; gövdedeki `user_id` 422.
//   * 42501 -> 204 (ayrımsız, gövdesiz) ve hata METNİNİN sızmaması.
//   * Hız sınırı: burst kovası dolunca 429 + `Retry-After`, veritabanına HİÇ
//     gidilmemesi.
//   * Rıza uçları: yalnızca kendi hesabı (hedef parametresi YOK), sürüm tavanı,
//     geri çekmede silinen satır sayılarının projeksiyonu.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route'lar `import 'server-only'` ile başlıyor; jsdom'da o paket fırlatır.
// `vi.mock` hoisting nedeniyle importlardan ÖNCE olmalı (aynı desen:
// tests/unit/account-deletion.test.ts).
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

import { POST } from '@/app/api/activity/route'
import { DELETE as CONSENT_DELETE, POST as CONSENT_POST } from '@/app/api/activity/consent/route'
import { getServerEnv } from '@/env.server'
import {
  ACTIVITY_CONSENT_VERSION,
  ACTIVITY_EVENTS,
  ACTIVITY_PLATFORMS,
  TAB_PATTERN,
  activityBodySchema,
  parseRecordActivityResult,
} from '@/lib/activity/contract'
import {
  ACTIVITY_BURST_LIMIT,
  ACTIVITY_CONSENT_LIMIT,
  ACTIVITY_SUSTAINED_LIMIT,
} from '@/lib/activity/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resetRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const USER_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333'
const SESSION_ID = '44444444-4444-4444-8444-444444444444'
const SERVICE_ROLE_KEY = 'service-role-key-0123456789abcdef'

interface PgError {
  code: string
  message: string
}

function makeRequest(
  body: unknown,
  { token = 'valid-token', url = 'http://localhost:3000/api/activity', method = 'POST' } = {}
): Request {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

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

interface AdminMock {
  rpc: ReturnType<typeof vi.fn>
}

function setAdminClient(
  handler: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: PgError | null }
): AdminMock {
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    const result = handler(fn, args)
    return { data: result.data ?? null, error: result.error ?? null }
  })
  vi.mocked(createClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createClient>)
  return { rpc }
}

/** Mutlu yol: `record_activity` beklenen jsonb'yi döner. */
function setHappyAdmin(overrides: Partial<Record<string, unknown>> = {}): AdminMock {
  return setAdminClient(() => ({
    data: {
      session_id: SESSION_ID,
      event_id: null,
      session_started: false,
      ...overrides,
    },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  resetRateLimit()
  setAuthUser({ id: USER_ID })
  vi.mocked(getServerEnv).mockReturnValue({
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  } as unknown as ReturnType<typeof getServerEnv>)
})

afterEach(() => {
  resetRateLimit()
})

// ---------------------------------------------------------------------------
// Sözleşme
// ---------------------------------------------------------------------------

describe('etkinlik sözleşmesi', () => {
  it('kapalı olay listesi migration’daki CHECK ile BİREBİR aynıdır', () => {
    // supabase/migrations/20260820090000_activity_log.sql -> activity_events_event_chk
    expect([...ACTIVITY_EVENTS]).toEqual([
      'tab_view',
      'daily_log_submitted',
      'form_check_uploaded',
      'message_sent',
      'ai_generated',
      'login',
      'logout',
    ])
    expect([...ACTIVITY_PLATFORMS]).toEqual(['web', 'mobile'])
  })

  it('gövde `user_id` alanını REDDEDER — kimlik yalnızca token’dan gelir', () => {
    const parsed = activityBodySchema.safeParse({ user_id: OTHER_USER_ID })
    expect(parsed.success).toBe(false)
  })

  it('`tab` bir URL / sorgu dizesi / serbest metin OLAMAZ', () => {
    expect(TAB_PATTERN.test('formCheck')).toBe(true)
    expect(TAB_PATTERN.test('daily_log-1')).toBe(true)
    expect(TAB_PATTERN.test('/users?id=3')).toBe(false)
    expect(TAB_PATTERN.test('sekme adı')).toBe(false)
    expect(TAB_PATTERN.test('a'.repeat(41))).toBe(false)
    expect(TAB_PATTERN.test('')).toBe(false)
  })

  it('boş gövde SAF HEARTBEAT’tir (platform varsayılanı `web`)', () => {
    const parsed = activityBodySchema.parse({})
    expect(parsed.platform).toBe('web')
    expect(parsed.event).toBeUndefined()
  })

  it('`parseRecordActivityResult` bozuk biçimde null döner', () => {
    expect(parseRecordActivityResult({ session_id: SESSION_ID, event_id: null })).toBeNull()
    expect(parseRecordActivityResult(null)).toBeNull()
    expect(parseRecordActivityResult('x')).toBeNull()
    expect(
      parseRecordActivityResult({ session_id: SESSION_ID, event_id: null, session_started: true })
    ).toEqual({ sessionId: SESSION_ID, eventId: null, sessionStarted: true })
  })
})

// ---------------------------------------------------------------------------
// POST /api/activity
// ---------------------------------------------------------------------------

describe('POST /api/activity', () => {
  it('Authorization yoksa 401 ve service_role istemcisi HİÇ kurulmaz', async () => {
    const response = await POST(makeRequest({}, { token: '' }))
    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('token geçersizse 401 döner', async () => {
    setAuthUser(null)
    const response = await POST(makeRequest({}))
    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('mutlu yol: kimlik JWT’den alınır, gövdedeki `user_id` ASLA kullanılmaz', async () => {
    const admin = setHappyAdmin({ session_started: true })
    // Gövde `user_id` taşımıyor (şema reddediyor) — burada kanıtlanan şey RPC’ye
    // giden `p_user_id`’nin doğrulanmış kimlik olduğudur.
    const response = await POST(makeRequest({ event: 'message_sent' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      session_id: SESSION_ID,
      event_id: null,
      session_started: true,
    })
    expect(admin.rpc).toHaveBeenCalledWith(
      'record_activity',
      expect.objectContaining({
        p_user_id: USER_ID,
        p_platform: 'web',
        p_event: 'message_sent',
      })
    )
  })

  it('gövdeye `user_id` sızdırmaya çalışan istemci 422 alır ve RPC ÇAĞRILMAZ', async () => {
    const admin = setHappyAdmin()
    const response = await POST(makeRequest({ user_id: OTHER_USER_ID }))
    expect(response.status).toBe(422)
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('kapalı liste dışı olay 422 ile durur — veritabanına GİTMEZ', async () => {
    const admin = setHappyAdmin()
    const response = await POST(makeRequest({ event: 'password_changed' }))
    expect(response.status).toBe(422)
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('SAF HEARTBEAT: `p_event` gönderilmez (undefined -> DB varsayılanı)', async () => {
    const admin = setHappyAdmin()
    await POST(makeRequest({ session_id: SESSION_ID }))

    const args = admin.rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_event).toBeUndefined()
    expect(args.p_session_id).toBe(SESSION_ID)
  })

  it('42501 -> 204, GÖVDESİZ; veritabanı hata METNİ istemciye SIZMAZ', async () => {
    setAdminClient(() => ({
      error: {
        code: '42501',
        message: 'record_activity: etkinlik kaydi icin ACIK RIZA yok (durum: revoked).',
      },
    }))

    const response = await POST(makeRequest({}))

    expect(response.status).toBe(204)
    const text = await response.text()
    expect(text).toBe('')
    // "revoked" / "undecided" ayrımı hiçbir başlıkta da görünmemeli.
    expect(JSON.stringify([...response.headers])).not.toMatch(/revoked|undecided|RIZA/i)
  })

  it('42501 “başkasının oturumu” da AYNI 204’e düşer (oturum numaralandırma kapalı)', async () => {
    setAdminClient(() => ({
      error: {
        code: '42501',
        message: 'record_activity: oturum baska bir kullaniciya ait (session=...).',
      },
    }))
    const response = await POST(makeRequest({ session_id: SESSION_ID }))
    expect(response.status).toBe(204)
  })

  it('22023 -> 400, 23514 -> 400, 23503 -> 404, bilinmeyen -> 500', async () => {
    const cases: Array<[string, number]> = [
      ['22023', 400],
      ['23514', 400],
      ['23503', 404],
      ['XX000', 500],
    ]
    for (const [code, status] of cases) {
      resetRateLimit()
      setAdminClient(() => ({ error: { code, message: 'db' } }))
      const response = await POST(makeRequest({}))
      expect(response.status, `SQLSTATE ${code}`).toBe(status)
    }
  })

  it('RPC sonucu bozuk biçimdeyse 500 döner — uydurma `session_id` DÖNMEZ', async () => {
    setAdminClient(() => ({ data: { session_id: 42 } }))
    const response = await POST(makeRequest({}))
    expect(response.status).toBe(500)
  })

  it('SUPABASE_SERVICE_ROLE_KEY yoksa 503 döner', async () => {
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as unknown as ReturnType<typeof getServerEnv>)

    const response = await POST(makeRequest({}))
    expect(response.status).toBe(503)
  })

  it('gövde JSON değilse 400 döner', async () => {
    setHappyAdmin()
    const request = new Request('http://localhost:3000/api/activity', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
      body: 'not-json',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('gövde 4 KB tavanını aşarsa 413 döner ve RPC ÇAĞRILMAZ', async () => {
    const admin = setHappyAdmin()
    const response = await POST(makeRequest({ tab: 'x'.repeat(5000) }))
    expect(response.status).toBe(413)
    expect(admin.rpc).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Hız sınırı
// ---------------------------------------------------------------------------

describe('POST /api/activity hız sınırı', () => {
  it(`burst kovası ${ACTIVITY_BURST_LIMIT} sinyalden sonra 429 + Retry-After döner`, async () => {
    const admin = setHappyAdmin()

    for (let i = 0; i < ACTIVITY_BURST_LIMIT; i += 1) {
      const ok = await POST(makeRequest({}))
      expect(ok.status, `sinyal ${i + 1}`).toBe(200)
    }

    const callsBefore = admin.rpc.mock.calls.length
    const blocked = await POST(makeRequest({}))

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
    // Reddedilen istek veritabanına HİÇ gitmemeli.
    expect(admin.rpc.mock.calls.length).toBe(callsBefore)
  })

  it('kovalar KULLANICI başınadır — bir kullanıcının sınırı diğerini kilitlemez', async () => {
    setHappyAdmin()

    for (let i = 0; i < ACTIVITY_BURST_LIMIT + 1; i += 1) await POST(makeRequest({}))

    setAuthUser({ id: OTHER_USER_ID })
    const other = await POST(makeRequest({}))
    expect(other.status).toBe(200)
  })

  it('sürekli akış kovası burst kovasından KAT KAT geniştir (saatlik tavan)', () => {
    expect(ACTIVITY_SUSTAINED_LIMIT).toBeGreaterThan(ACTIVITY_BURST_LIMIT)
  })
})

// ---------------------------------------------------------------------------
// Rıza uçları
// ---------------------------------------------------------------------------

describe('/api/activity/consent', () => {
  it('POST: rıza YALNIZCA doğrulanmış kullanıcı için verilir (hedef parametresi yok)', async () => {
    const admin = setAdminClient(() => ({ data: { state: 'granted' } }))

    const response = await CONSENT_POST(
      makeRequest(
        { version: ACTIVITY_CONSENT_VERSION },
        { url: 'http://localhost:3000/api/activity/consent' }
      )
    )

    expect(response.status).toBe(200)
    expect(admin.rpc).toHaveBeenCalledWith('grant_activity_consent', {
      p_user_id: USER_ID,
      p_version: ACTIVITY_CONSENT_VERSION,
    })
  })

  it('POST: gövdeye BAŞKA bir kullanıcı konulamaz — `.strict()` 422 verir', async () => {
    const admin = setAdminClient(() => ({ data: {} }))

    const response = await CONSENT_POST(
      makeRequest(
        { version: ACTIVITY_CONSENT_VERSION, user_id: OTHER_USER_ID },
        { url: 'http://localhost:3000/api/activity/consent' }
      )
    )

    expect(response.status).toBe(422)
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('POST: bilinmeyen (gelecekteki) rıza sürümü 422 ile reddedilir', async () => {
    const admin = setAdminClient(() => ({ data: {} }))
    const response = await CONSENT_POST(
      makeRequest(
        { version: ACTIVITY_CONSENT_VERSION + 1 },
        { url: 'http://localhost:3000/api/activity/consent' }
      )
    )
    expect(response.status).toBe(422)
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('POST: kimliksiz istek 401', async () => {
    const response = await CONSENT_POST(
      makeRequest(
        { version: ACTIVITY_CONSENT_VERSION },
        { url: 'http://localhost:3000/api/activity/consent', token: '' }
      )
    )
    expect(response.status).toBe(401)
  })

  it('DELETE: gövde OKUNMAZ, yalnızca JWT kimliğiyle geri çekilir', async () => {
    const admin = setAdminClient(() => ({
      data: {
        user_id: USER_ID,
        state: 'revoked',
        revoked_at: '2026-08-20T10:00:00Z',
        events_deleted: 12,
        sessions_deleted: 3,
      },
    }))

    const response = await CONSENT_DELETE(
      makeRequest(
        { user_id: OTHER_USER_ID },
        { url: 'http://localhost:3000/api/activity/consent', method: 'DELETE' }
      )
    )

    expect(response.status).toBe(200)
    expect(admin.rpc).toHaveBeenCalledWith('revoke_activity_consent', { p_user_id: USER_ID })

    // RPC çıktısı AYNEN geçirilmez: yalnızca iki sayaç projekte edilir.
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({
      ok: true,
      state: 'revoked',
      events_deleted: 12,
      sessions_deleted: 3,
    })
    expect(body.revoked_at).toBeUndefined()
  })

  it(`rıza kovası ${ACTIVITY_CONSENT_LIMIT} işlemde dolar (damga/silme döngüsü engellenir)`, async () => {
    setAdminClient(() => ({ data: { events_deleted: 0, sessions_deleted: 0 } }))

    for (let i = 0; i < ACTIVITY_CONSENT_LIMIT; i += 1) {
      const ok = await CONSENT_DELETE(
        makeRequest(undefined, {
          url: 'http://localhost:3000/api/activity/consent',
          method: 'DELETE',
        })
      )
      expect(ok.status, `geri çekme ${i + 1}`).toBe(200)
    }

    const blocked = await CONSENT_DELETE(
      makeRequest(undefined, {
        url: 'http://localhost:3000/api/activity/consent',
        method: 'DELETE',
      })
    )
    expect(blocked.status).toBe(429)
  })

  it('profil yoksa 404 döner (23503)', async () => {
    setAdminClient(() => ({ error: { code: '23503', message: 'profil bulunamadi' } }))
    const response = await CONSENT_DELETE(
      makeRequest(undefined, {
        url: 'http://localhost:3000/api/activity/consent',
        method: 'DELETE',
      })
    )
    expect(response.status).toBe(404)
  })
})
