// Yetim storage dosyası temizliği — avatar yükleme akışı.
//
// Kapsam: docs/PROGRESS.md §5 "Yetim storage dosyaları temizlenmiyor". Kullanıcı yeni
// avatar yüklediğinde eski dosya bucket'ta kalıyordu; bu test dosyası hem yeni
// `removeStoredObject` yardımcısını (`@repo/api-client/storage`) hem de `useUploadAvatar`
// mutasyonunun (`@repo/api-client/hooks/useProfile`) doğru SIRADA çalıştığını doğrular.
//
// VERİ KAYBI REGRESYONU (en kritik senaryo): `profiles.avatar_path` güncellemesi
// BAŞARISIZ olursa eski dosya SİLİNMEMELİDİR — aksi hâlde kullanıcı hem eski hem
// yeni avatarını kaybeder.

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.5 commit 5 (ADR-0024): Supabase istemcisi artık modül singleton'ı DEĞİL, enjekte
// edilen bir nesne. `vi.mock('@/lib/supabase/client', ...)` + `vi.hoisted` bloğu bu yüzden
// KALKTI — mock'lar sıradan `const` olarak kurulup `createHookWrapper` ile enjekte ediliyor.
// `importOriginal` spread'i ZORUNLU: `apps/web/src/lib/logger.ts` (ErrorBoundary üzerinden
// bileşen ağacına giriyor) bu paketten `createConsoleLogger`/`maskForConsole`/`REDACT_PATHS`
// import ediyor — yalnızca `logger` döndüren bir mock o modülü yüklenemez hâle getirirdi.
vi.mock('@repo/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Gerçek magic-byte doğrulaması bu testin kapsamı dışında (tests/unit/upload-validation.test.ts
// zaten kapsıyor); burada sabit bir sonuç dönülür ki senaryolar yalnızca temizlik mantığına
// odaklansın.
vi.mock('@repo/api-client/upload-validation', () => ({
  assertValidImageFile: vi.fn().mockResolvedValue({ mime: 'image/png', extension: 'png' }),
}))

import { logger } from '@repo/logger'
import { useUploadAvatar } from '@repo/api-client/hooks/useProfile'
import { AVATAR_BUCKET, removeStoredObject } from '@repo/api-client/storage'

import { asSupabaseClient, createHookWrapper } from './test-utils'

const removeMock = vi.fn()
const uploadMock = vi.fn()
const singleMock = vi.fn()
const selectEqSingleMock = vi.fn()
const updateEqMock = vi.fn()
const fromMock = vi.fn()

const supabase = asSupabaseClient({
  storage: { from: vi.fn(() => ({ upload: uploadMock, remove: removeMock })) },
  from: fromMock,
})

const USER_ID = '11111111-1111-4111-8111-111111111111'

function makeFile(): File {
  return new File(['x'], 'avatar.png', { type: 'image/png' })
}

/** `.from('profiles').select('avatar_path').eq('id', userId).single()` zincirini kurar. */
function mockExistingAvatarPath(path: string | null) {
  singleMock.mockResolvedValue({ data: { avatar_path: path }, error: null })
  selectEqSingleMock.mockReturnValue({ single: singleMock })
}

function mockProfileUpdate(error: { message: string } | null) {
  updateEqMock.mockResolvedValue({ error })
}

function wireProfilesTable() {
  fromMock.mockImplementation((table: string) => {
    if (table !== 'profiles') throw new Error(`beklenmeyen tablo: ${table}`)
    return {
      select: vi.fn(() => ({ eq: vi.fn(() => selectEqSingleMock()) })),
      update: vi.fn(() => ({ eq: updateEqMock })),
    }
  })
}

function createWrapper() {
  return createHookWrapper({ supabaseClient: supabase }).Wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  wireProfilesTable()
  uploadMock.mockResolvedValue({ error: null })
  removeMock.mockResolvedValue({ error: null })
})

describe('removeStoredObject', () => {
  it('geçerli bir bucket yolunda remove() çağırır ve true döner', async () => {
    removeMock.mockResolvedValue({ error: null })
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, 'uid-old.png')).resolves.toBe(true)
    expect(removeMock).toHaveBeenCalledWith(['uid-old.png'])
  })

  it('null/boş yolda istek atmadan false döner', async () => {
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, null)).resolves.toBe(false)
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, undefined)).resolves.toBe(false)
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, '   ')).resolves.toBe(false)
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('storage dışı mutlak URL için istek atmadan false döner', async () => {
    await expect(
      removeStoredObject(supabase, AVATAR_BUCKET, 'https://placehold.co/200x200')
    ).resolves.toBe(false)
    await expect(
      removeStoredObject(supabase, AVATAR_BUCKET, 'http://example.com/eski-avatar.png')
    ).resolves.toBe(false)
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('silme hata dönerse fırlatmaz, false döner ve loglar', async () => {
    removeMock.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, 'uid-old.png')).resolves.toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('istek fırlatırsa (ağ hatası) yakalar, false döner', async () => {
    removeMock.mockRejectedValue(new Error('network down'))
    await expect(removeStoredObject(supabase, AVATAR_BUCKET, 'uid-old.png')).resolves.toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})

describe('useUploadAvatar — yetim dosya temizliği', () => {
  it('yeni avatar yüklendiğinde eski dosya silinir', async () => {
    mockExistingAvatarPath('uid-old.png')
    mockProfileUpdate(null)

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledWith(['uid-old.png'])
  })

  it('profil güncellemesi BAŞARISIZ olursa eski dosya SİLİNMEZ (veri kaybı regresyonu)', async () => {
    mockExistingAvatarPath('uid-old.png')
    mockProfileUpdate({ message: 'update failed' })

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(uploadMock).toHaveBeenCalledTimes(1) // yeni dosya yine de yüklendi
    expect(removeMock).not.toHaveBeenCalled() // ama eski dosya silinmedi
  })

  it('eski yol NULL iken silme denenmez', async () => {
    mockExistingAvatarPath(null)
    mockProfileUpdate(null)

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('eski yol storage dışı mutlak URL iken silme denenmez', async () => {
    mockExistingAvatarPath('https://placehold.co/200x200')
    mockProfileUpdate(null)

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('silme başarısız olsa da mutasyon BAŞARILI sayılır (kullanıcıya hata gösterilmez)', async () => {
    mockExistingAvatarPath('uid-old.png')
    mockProfileUpdate(null)
    removeMock.mockResolvedValue({ error: { message: 'object not found' } })

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })

  it('silme başarısızlığı loglanır', async () => {
    mockExistingAvatarPath('uid-old.png')
    mockProfileUpdate(null)
    removeMock.mockResolvedValue({ error: { message: 'object not found' } })

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() })
    result.current.mutate({ userId: USER_ID, file: makeFile() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: AVATAR_BUCKET, path: 'uid-old.png' }),
      expect.any(String)
    )
  })
})
