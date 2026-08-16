// src/lib/storage.ts — imzalı adres üretimi.
//
// Bu modülün SÖZLEŞMESİ: asla fırlatmaz. Private bucket'ta eksik/silinmiş dosya ya
// da yetki hatası bir liste sorgusunu düşürmemeli; `null` dönüp UI placeholder
// göstermeli. Testler tam olarak bunu ve N+1 istek atılmadığını doğrular.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` fabrikaları dosyanın en üstüne hoist edilir; mock'lar bu yüzden
// `vi.hoisted` ile tanımlanmalı, aksi hâlde "cannot access before initialization".
const { createSignedUrlMock, createSignedUrlsMock, fromMock } = vi.hoisted(() => {
  const createSignedUrl = vi.fn()
  const createSignedUrls = vi.fn()
  return {
    createSignedUrlMock: createSignedUrl,
    createSignedUrlsMock: createSignedUrls,
    fromMock: vi.fn(() => ({ createSignedUrl, createSignedUrls })),
  }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { storage: { from: fromMock } },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  AVATAR_BUCKET,
  FORM_CHECK_BUCKET,
  SIGNED_URL_STALE_TIME_MS,
  SIGNED_URL_TTL_SECONDS,
  createSignedUrl,
  createSignedUrls,
} from '@/lib/storage'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sabitler', () => {
  it('TTL en fazla 1 saattir (plan I-4)', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(3600)
  })

  it('staleTime TTL’den kısadır — önbellekteki adres süresi dolmadan tazelenir', () => {
    expect(SIGNED_URL_STALE_TIME_MS).toBeLessThan(SIGNED_URL_TTL_SECONDS * 1000)
  })

  it('bucket adları migration ile aynıdır', () => {
    expect(AVATAR_BUCKET).toBe('avatars')
    expect(FORM_CHECK_BUCKET).toBe('form-checks-media')
  })
})

describe('createSignedUrl', () => {
  it('yolu TTL ile imzalar ve adresi döner', async () => {
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null })

    await expect(createSignedUrl(AVATAR_BUCKET, 'uid-1.jpg')).resolves.toBe('https://x/signed')
    expect(fromMock).toHaveBeenCalledWith(AVATAR_BUCKET)
    expect(createSignedUrlMock).toHaveBeenCalledWith('uid-1.jpg', SIGNED_URL_TTL_SECONDS)
  })

  it('boş/null yolda istek atmadan null döner', async () => {
    await expect(createSignedUrl(AVATAR_BUCKET, null)).resolves.toBeNull()
    await expect(createSignedUrl(AVATAR_BUCKET, undefined)).resolves.toBeNull()
    await expect(createSignedUrl(AVATAR_BUCKET, '   ')).resolves.toBeNull()
    expect(createSignedUrlMock).not.toHaveBeenCalled()
  })

  it('dosya yoksa fırlatmaz, null döner', async () => {
    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await expect(createSignedUrl(FORM_CHECK_BUCKET, 'poses/yok.jpg')).resolves.toBeNull()
  })

  it('ağ hatası fırlatsa bile null döner', async () => {
    createSignedUrlMock.mockRejectedValue(new Error('network down'))
    await expect(createSignedUrl(FORM_CHECK_BUCKET, 'poses/a.jpg')).resolves.toBeNull()
  })
})

describe('createSignedUrls', () => {
  it('tüm yolları TEK istekte imzalar (N+1 yok) ve tekrarları teke indirir', async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: 'poses/a.jpg', signedUrl: 'https://x/a', error: null },
        { path: 'poses/b.jpg', signedUrl: 'https://x/b', error: null },
      ],
      error: null,
    })

    const map = await createSignedUrls(FORM_CHECK_BUCKET, [
      'poses/a.jpg',
      null,
      'poses/b.jpg',
      'poses/a.jpg',
      undefined,
    ])

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1)
    expect(createSignedUrlsMock).toHaveBeenCalledWith(
      ['poses/a.jpg', 'poses/b.jpg'],
      SIGNED_URL_TTL_SECONDS
    )
    expect(map.get('poses/a.jpg')).toBe('https://x/a')
    expect(map.get('poses/b.jpg')).toBe('https://x/b')
    expect(map.size).toBe(2)
  })

  it('yol listesi boşsa istek atmaz', async () => {
    const map = await createSignedUrls(FORM_CHECK_BUCKET, [null, undefined, ''])
    expect(createSignedUrlsMock).not.toHaveBeenCalled()
    expect(map.size).toBe(0)
  })

  it('tek dosyanın hatası diğerlerini düşürmez — hatalı yol haritada yer almaz', async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: 'poses/a.jpg', signedUrl: 'https://x/a', error: null },
        { path: 'poses/silinmis.jpg', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    })

    const map = await createSignedUrls(FORM_CHECK_BUCKET, ['poses/a.jpg', 'poses/silinmis.jpg'])
    expect(map.get('poses/a.jpg')).toBe('https://x/a')
    expect(map.has('poses/silinmis.jpg')).toBe(false)
  })

  it('istek tamamen başarısız olursa fırlatmaz, boş harita döner', async () => {
    createSignedUrlsMock.mockResolvedValue({ data: null, error: { message: 'forbidden' } })
    await expect(createSignedUrls(AVATAR_BUCKET, ['a.jpg'])).resolves.toEqual(new Map())

    createSignedUrlsMock.mockRejectedValue(new Error('network down'))
    await expect(createSignedUrls(AVATAR_BUCKET, ['a.jpg'])).resolves.toEqual(new Map())
  })
})
