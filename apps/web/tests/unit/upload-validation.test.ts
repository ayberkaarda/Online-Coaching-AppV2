import { describe, expect, it } from 'vitest'

import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  UploadValidationError,
  assertValidImageFile,
  detectImageMime,
  validateImageFile,
} from '@repo/api-client/upload-validation'

// Gerçek magic-byte imzaları. `padding` yalnızca dosyayı gerçekçi bir uzunluğa taşır; imza
// kararı yalnızca ilk baytlara bakar (bkz. `@repo/api-client/upload-validation` detectImageMime).
const JPEG_BYTES = new Uint8Array([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  0x4a,
  0x46,
  0x49,
  0x46,
  ...new Array(16).fill(0),
])
const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(16).fill(0),
])
const WEBP_BYTES = new Uint8Array([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x00,
  0x00,
  0x00,
  0x00, // size (arbitrary)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
  ...new Array(8).fill(0),
])
const AVIF_BYTES = new Uint8Array([
  0x00,
  0x00,
  0x00,
  0x20, // box size (arbitrary)
  0x66,
  0x74,
  0x79,
  0x70, // ftyp
  0x61,
  0x76,
  0x69,
  0x66, // avif
  ...new Array(8).fill(0),
])
const HTML_BYTES = new TextEncoder().encode('<html><body>evil</body></html>')
const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

// `@types/node`'un global `Uint8Array`'i `ArrayBufferLike` üzerinden genellemesi yüzünden
// `BlobPart` (ArrayBuffer bekler) ile doğrudan uyuşmuyor; test yardımcısında tek noktadan cast edilir.
function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type })
}

describe('detectImageMime', () => {
  it('JPEG imzasını tanır', () => {
    expect(detectImageMime(JPEG_BYTES)).toBe('image/jpeg')
  })

  it('PNG imzasını tanır', () => {
    expect(detectImageMime(PNG_BYTES)).toBe('image/png')
  })

  it('WEBP imzasını tanır', () => {
    expect(detectImageMime(WEBP_BYTES)).toBe('image/webp')
  })

  it('AVIF imzasını tanır', () => {
    expect(detectImageMime(AVIF_BYTES)).toBe('image/avif')
  })

  it('tanınmayan baytlar için null döner', () => {
    expect(detectImageMime(HTML_BYTES)).toBeNull()
  })
})

describe('validateImageFile — dört formatın kabulü', () => {
  it('JPEG dosyasını kabul eder ve extension "jpg" döner', async () => {
    const file = makeFile(JPEG_BYTES, 'photo.jpg', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result).toEqual({ ok: true, mime: 'image/jpeg', extension: 'jpg' })
  })

  it('PNG dosyasını kabul eder ve extension "png" döner', async () => {
    const file = makeFile(PNG_BYTES, 'photo.png', 'image/png')
    const result = await validateImageFile(file)
    expect(result).toEqual({ ok: true, mime: 'image/png', extension: 'png' })
  })

  it('WEBP dosyasını kabul eder ve extension "webp" döner', async () => {
    const file = makeFile(WEBP_BYTES, 'photo.webp', 'image/webp')
    const result = await validateImageFile(file)
    expect(result).toEqual({ ok: true, mime: 'image/webp', extension: 'webp' })
  })

  it('AVIF dosyasını kabul eder ve extension "avif" döner', async () => {
    const file = makeFile(AVIF_BYTES, 'photo.avif', 'image/avif')
    const result = await validateImageFile(file)
    expect(result).toEqual({ ok: true, mime: 'image/avif', extension: 'avif' })
  })
})

describe('validateImageFile — A-21 regresyonu: uzantı içerikten türetilir', () => {
  it('.png adlı ama JPEG baytlı dosya extension: "jpg" döner (dosya adı yok sayılır)', async () => {
    const file = makeFile(JPEG_BYTES, 'sneaky.png', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mime).toBe('image/jpeg')
      expect(result.extension).toBe('jpg')
    }
  })
})

describe('validateImageFile — A-07 regresyonu: magic byte tutarlılığı', () => {
  it('image/jpeg etiketli ama SVG gövdeli dosyayı CONTENT_MISMATCH ile reddeder', async () => {
    const file = makeFile(SVG_BYTES, 'evil.jpg', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
  })

  it('image/jpeg etiketli ama HTML gövdeli dosyayı CONTENT_MISMATCH ile reddeder', async () => {
    const file = makeFile(HTML_BYTES, 'evil.jpg', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
  })

  it('image/png etiketli ama gerçekte JPEG olan dosyayı CONTENT_MISMATCH ile reddeder', async () => {
    const file = makeFile(JPEG_BYTES, 'mislabeled.png', 'image/png')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
  })
})

describe('validateImageFile — boyut sınırları', () => {
  it('boş dosyayı EMPTY ile reddeder', async () => {
    const file = makeFile(new Uint8Array(0), 'empty.jpg', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'EMPTY' })
  })

  it('5 MB + 1 baytı TOO_LARGE ile reddeder', async () => {
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    oversized.set(JPEG_BYTES, 0)
    const file = makeFile(oversized, 'big.jpg', 'image/jpeg')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'TOO_LARGE' })
  })
})

describe('validateImageFile — MIME allowlist', () => {
  it('text/plain dosyasını UNSUPPORTED_TYPE ile reddeder', async () => {
    const file = makeFile(new TextEncoder().encode('hello'), 'note.txt', 'text/plain')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' })
  })

  it('image/gif dosyasını UNSUPPORTED_TYPE ile reddeder', async () => {
    const file = makeFile(new Uint8Array([0x47, 0x49, 0x46, 0x38]), 'anim.gif', 'image/gif')
    const result = await validateImageFile(file)
    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' })
  })

  it('ALLOWED_IMAGE_MIME tam olarak dört türü listeler', () => {
    expect(ALLOWED_IMAGE_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  })
})

describe('assertValidImageFile', () => {
  it('geçerli dosyada {mime, extension} döner', async () => {
    const file = makeFile(PNG_BYTES, 'photo.png', 'image/png')
    await expect(assertValidImageFile(file)).resolves.toEqual({
      mime: 'image/png',
      extension: 'png',
    })
  })

  it('geçersiz dosyada UploadValidationError fırlatır, code doğru set edilir', async () => {
    const file = makeFile(new Uint8Array(0), 'empty.jpg', 'image/jpeg')

    await expect(assertValidImageFile(file)).rejects.toBeInstanceOf(UploadValidationError)

    try {
      await assertValidImageFile(file)
      expect.unreachable('assertValidImageFile boş dosyada fırlatmalıydı')
    } catch (err) {
      expect(err).toBeInstanceOf(UploadValidationError)
      expect((err as UploadValidationError).code).toBe('EMPTY')
      expect((err as UploadValidationError).message).toBe('Dosya boş görünüyor.')
    }
  })

  it('içerik/tür uyuşmazlığında code: CONTENT_MISMATCH fırlatır', async () => {
    const file = makeFile(SVG_BYTES, 'evil.jpg', 'image/jpeg')
    try {
      await assertValidImageFile(file)
      expect.unreachable('assertValidImageFile içerik uyuşmazlığında fırlatmalıydı')
    } catch (err) {
      expect(err).toBeInstanceOf(UploadValidationError)
      expect((err as UploadValidationError).code).toBe('CONTENT_MISMATCH')
    }
  })
})
