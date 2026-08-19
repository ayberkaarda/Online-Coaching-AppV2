// B-028 (sunucu tarafı magic-byte doğrulaması) + B-008 (indirme davranışı) — AC-4.6.4.
//
// ─────────────────────────────────────────────────────────────────────────────
// BU DOSYANIN ASIL SORUSU: "SAHTE MIME"
// ─────────────────────────────────────────────────────────────────────────────
// B-028'den önce sunucunun `message-attachments` hakkında bildiği TEK şey, yüklemeyi yapan
// istemcinin BİLDİRDİĞİ Content-Type'tı. Bucket'ın `allowed_mime_types` listesi bile o
// beyana bakar (20260817190200 §3). Yani `contentType: 'image/png'` diyip HTML/JS yükleyen
// bir betik hiçbir engele takılmıyordu.
//
// Aşağıdaki negatif testler tam olarak bu senaryoyu kurar: BEYAN allowlist'tedir
// (`image/png`), BAYTLAR değildir. Karar `reject` olmak ZORUNDADIR. `beyan allowlist'te`
// iddiası testin içinde AYRICA ölçülür — yani test "yanlış türü reddetti" demiyor,
// "DOĞRU GÖRÜNEN türü, içeriği yüzünden reddetti" diyor.
//
// KIRMIZI-YEŞİL: `evaluateAttachment`in gövdesinden `validateImageBytes` çağrısı çıkarılıp
// yerine yalnızca `declaredType` allowlist kontrolü konulduğunda (yani B-028 ÖNCESİ davranış)
// "sahte MIME" testleri KIRMIZI olur; magic-byte kararı geri konunca YEŞİL. Ölçüm bu dosyanın
// yazımı sırasında yapıldı (bkz. görev raporu).

import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@repo/types'

// `importOriginal` spread'i ZORUNLU: `apps/web/src/lib/logger.ts` bu paketten
// `createConsoleLogger`/`maskForConsole`/`REDACT_PATHS` import ediyor.
vi.mock('@repo/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
  ATTACHMENT_SNIFF_BYTES,
  MESSAGE_ATTACHMENT_BUCKET,
  encodeStoragePath,
  evaluateAttachment,
  parseAttachmentPath,
  parseContentRangeTotal,
  verifyAttachmentBodySchema,
} from '@/app/api/attachments/verification-core'
import {
  ALLOWED_IMAGE_MIME,
  MAGIC_BYTE_SNIFF_LENGTH,
  MAX_UPLOAD_BYTES,
  validateImageBytes,
} from '@repo/api-client/upload-validation'
import {
  MESSAGE_ATTACHMENT_BUCKET as STORAGE_MESSAGE_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  attachmentFileNameFromPath,
  createSignedDownloadUrl,
  createSignedUrl,
} from '@repo/api-client/storage'

// ---------------------------------------------------------------------------
// Fikstürler — GERÇEK imzalar (tests/unit/upload-validation.test.ts ile aynı baytlar)
// ---------------------------------------------------------------------------
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const WEBP_HEAD = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
])

/** `image/png` DİYE yüklenen ama aslında HTML olan içerik — saldırının ta kendisi. */
const HTML_BYTES = new TextEncoder().encode('<html><script>alert(1)</script></html>')
/** Yürütülebilir (PE) başlığı — "resim" diye yüklenmiş bir ikili. */
const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
/** GIF: gerçek bir görsel ama allowlist DIŞI (liste bu turda GENİŞLETİLMEDİ). */
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])

const CLIENT_ID = '22222222-2222-2222-2222-222222222222'
const UPLOADER_ID = '11111111-1111-1111-1111-111111111111'
const VALID_PATH = `${CLIENT_ID}/${UPLOADER_ID}-a0000000-0000-0000-0000-00000000000a.png`

// ===========================================================================
// 1) PAYLAŞILAN ÇEKİRDEK — imza tablosu TEK YERDE
// ===========================================================================
describe('validateImageBytes — istemci ve sunucunun PAYLAŞTIĞI karar', () => {
  it('sunucunun okuduğu pencere istemciyle AYNI sabitten gelir', () => {
    expect(ATTACHMENT_SNIFF_BYTES).toBe(MAGIC_BYTE_SNIFF_LENGTH)
  })

  it('gerçek PNG baytlarını kabul eder', () => {
    expect(validateImageBytes(PNG_HEAD, 'image/png')).toEqual({
      ok: true,
      mime: 'image/png',
      extension: 'png',
    })
  })

  it('gerçek JPEG baytlarını kabul eder', () => {
    expect(validateImageBytes(JPEG_HEAD, 'image/jpeg')).toEqual({
      ok: true,
      mime: 'image/jpeg',
      extension: 'jpg',
    })
  })

  it('gerçek WEBP baytlarını kabul eder', () => {
    expect(validateImageBytes(WEBP_HEAD, 'image/webp')).toEqual({
      ok: true,
      mime: 'image/webp',
      extension: 'webp',
    })
  })

  it('SAHTE MIME: beyan image/png ama baytlar HTML -> CONTENT_MISMATCH', () => {
    // Beyanın allowlist'te olduğu AYRICA ölçülür: reddin sebebi "tür listede yok"
    // DEĞİL, "içerik beyanı tutmuyor".
    expect(ALLOWED_IMAGE_MIME).toContain('image/png')
    expect(validateImageBytes(HTML_BYTES, 'image/png')).toMatchObject({
      ok: false,
      code: 'CONTENT_MISMATCH',
    })
  })

  it('bir görselin baytları BAŞKA bir görsel türü diye bildirilirse reddedilir', () => {
    expect(validateImageBytes(PNG_HEAD, 'image/jpeg')).toMatchObject({
      ok: false,
      code: 'CONTENT_MISMATCH',
    })
  })

  it('boş içerik EMPTY, allowlist dışı beyan UNSUPPORTED_TYPE üretir', () => {
    expect(validateImageBytes(new Uint8Array(), 'image/png')).toMatchObject({
      ok: false,
      code: 'EMPTY',
    })
    expect(validateImageBytes(PNG_HEAD, 'text/html')).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_TYPE',
    })
    expect(validateImageBytes(PNG_HEAD, null)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_TYPE',
    })
  })

  it('kabul edilen tür listesi bu turda DEĞİŞMEDİ (dört tür)', () => {
    expect(ALLOWED_IMAGE_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  })
})

// ===========================================================================
// 2) YOL SÖZLEŞMESİ — fail-closed ayrıştırıcı
// ===========================================================================
describe('parseAttachmentPath', () => {
  it('sözleşmeye uyan yolu konuşma / yükleyen / uzantı olarak çözer', () => {
    expect(parseAttachmentPath(VALID_PATH)).toEqual({
      conversationId: CLIENT_ID,
      uploaderId: UPLOADER_ID,
      extension: 'png',
    })
  })

  it('uzantıyı küçük harfe indirger', () => {
    const parsed = parseAttachmentPath(
      `${CLIENT_ID}/${UPLOADER_ID}-a0000000-0000-0000-0000-00000000000a.PNG`
    )
    expect(parsed?.extension).toBe('png')
  })

  it.each([
    ['klasörsüz ad', 'kotu-ad.jpg'],
    ['iki seviye klasör', `${CLIENT_ID}/gizli/${UPLOADER_ID}-x.jpg`],
    ['klasör UUID değil', `zz-${CLIENT_ID}/${UPLOADER_ID}-x.jpg`],
    ['yükleyen UUID değil', `${CLIENT_ID}/kullanici-x.jpg`],
    ['tam URL', 'http://127.0.0.1:54321/storage/v1/object/public/message-attachments/x.jpg'],
    ['boş', ''],
  ])('%s -> null (fail-closed)', (_label, path) => {
    expect(parseAttachmentPath(path)).toBeNull()
  })

  it('gövde şeması yalnızca yol kabul eder, uid/tür KABUL ETMEZ', () => {
    const parsed = verifyAttachmentBodySchema.parse({
      path: `  ${VALID_PATH}  `,
      userId: 'saldirgan',
      mime: 'image/png',
    })
    expect(parsed).toEqual({ path: VALID_PATH })
    expect(verifyAttachmentBodySchema.safeParse({}).success).toBe(false)
    expect(verifyAttachmentBodySchema.safeParse({ path: '   ' }).success).toBe(false)
  })
})

// ===========================================================================
// 3) SUNUCU KARARI — sahte MIME negatif testi (B-028'in kapanış koşulu)
// ===========================================================================
describe('evaluateAttachment — SAHTE MIME NEGATİF TESTİ', () => {
  it('Content-Type image/png diyen ama baytları PNG OLMAYAN dosyayı REDDEDER', () => {
    const decision = evaluateAttachment({
      head: HTML_BYTES,
      declaredType: 'image/png',
      extension: 'png',
      totalBytes: HTML_BYTES.byteLength,
    })

    expect(decision.ok).toBe(false)
    expect(decision).toMatchObject({ code: 'CONTENT_MISMATCH' })
    // Kullanıcıya dönen metin TÜRKÇE'dir (route bunu 422 gövdesine koyar).
    if (!decision.ok) {
      expect(decision.message).toBe('Dosyanın içeriği bildirilen türle uyuşmuyor.')
    }
  })

  it('yürütülebilir (MZ) içerik image/jpeg diye bildirilse de REDDEDİLİR', () => {
    expect(
      evaluateAttachment({
        head: EXE_BYTES,
        declaredType: 'image/jpeg',
        extension: 'jpg',
        totalBytes: 4096,
      })
    ).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
  })

  it('GERÇEK bir GIF bile allowlist dışı olduğu için REDDEDİLİR (liste genişlemedi)', () => {
    expect(
      evaluateAttachment({
        head: GIF_BYTES,
        declaredType: 'image/gif',
        extension: 'gif',
        totalBytes: 100,
      })
    ).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' })
  })

  it('sıfır baytlık nesne EMPTY ile reddedilir', () => {
    expect(
      evaluateAttachment({
        head: new Uint8Array(),
        declaredType: 'image/png',
        extension: 'png',
        totalBytes: 0,
      })
    ).toMatchObject({ ok: false, code: 'EMPTY' })
  })
})

describe('evaluateAttachment — POZİTİF: gerçek PNG/JPEG kabul edilir', () => {
  it('gerçek PNG kabul edilir ve tespit edilen tür dönülür', () => {
    expect(
      evaluateAttachment({
        head: PNG_HEAD,
        declaredType: 'image/png',
        extension: 'png',
        totalBytes: 68,
      })
    ).toEqual({ ok: true, mime: 'image/png' })
  })

  it('gerçek JPEG kabul edilir; uzantı `jpg` beklenir', () => {
    expect(
      evaluateAttachment({
        head: JPEG_HEAD,
        declaredType: 'image/jpeg',
        extension: 'jpg',
        totalBytes: 4096,
      })
    ).toEqual({ ok: true, mime: 'image/jpeg' })
  })

  it('bazı tarayıcıların bildirdiği `image/jpg` yazımı ön elemeyi geçer, karar yine baytlarındır', () => {
    expect(
      evaluateAttachment({
        head: JPEG_HEAD,
        declaredType: 'image/jpg',
        extension: 'jpg',
        totalBytes: 4096,
      })
    ).toEqual({ ok: true, mime: 'image/jpeg' })
  })

  it('Content-Type başlığı beklenmedik bir ek taşıyorsa (charset) fail-closed reddedilir', () => {
    // Storage nesne için charset eklemez; eklenirse beyan allowlist'te SAYILMAZ ve
    // fail-closed davranırız (belirsizlik redde düşer).
    expect(
      evaluateAttachment({
        head: PNG_HEAD,
        declaredType: 'image/png; charset=binary',
        extension: 'png',
        totalBytes: 68,
      })
    ).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' })
  })
})

describe('evaluateAttachment — uzantı tutarlılığı ve boyut', () => {
  it('içerik JPEG iken yol `.png` diyorsa REDDEDİLİR (istemci yolu uydurmuş)', () => {
    expect(
      evaluateAttachment({
        head: JPEG_HEAD,
        declaredType: 'image/jpeg',
        extension: 'png',
        totalBytes: 4096,
      })
    ).toMatchObject({ ok: false, code: 'EXTENSION_MISMATCH' })
  })

  it('uzantı bilinmiyorsa tutarlılık ölçülmez (yalnızca içerik kararı)', () => {
    expect(
      evaluateAttachment({
        head: PNG_HEAD,
        declaredType: 'image/png',
        extension: null,
        totalBytes: 68,
      })
    ).toEqual({ ok: true, mime: 'image/png' })
  })

  it('5 MB üstü nesne baytlarına bakılmadan TOO_LARGE ile reddedilir', () => {
    expect(
      evaluateAttachment({
        head: PNG_HEAD,
        declaredType: 'image/png',
        extension: 'png',
        totalBytes: MAX_UPLOAD_BYTES + 1,
      })
    ).toMatchObject({ ok: false, code: 'TOO_LARGE' })
  })
})

describe('HTTP kanıtlarının okunması', () => {
  it('content-range başlığından TAM boyut çıkarılır', () => {
    expect(parseContentRangeTotal('bytes 0-31/68')).toBe(68)
    expect(parseContentRangeTotal('bytes 0-31/5242880')).toBe(5_242_880)
  })

  it('başlık yoksa / biçim tanınmazsa boyut ölçülmez (null)', () => {
    expect(parseContentRangeTotal(null)).toBeNull()
    expect(parseContentRangeTotal('bytes 0-31/*')).toBeNull()
    expect(parseContentRangeTotal('')).toBeNull()
  })

  it('storage yolu segment segment kodlanır — `/` ayırıcı kalır', () => {
    expect(encodeStoragePath(VALID_PATH)).toBe(VALID_PATH)
    expect(encodeStoragePath('a b/c d.png')).toBe('a%20b/c%20d.png')
  })

  it('bucket adı migration ve storage yardımcısıyla AYNIDIR', () => {
    expect(MESSAGE_ATTACHMENT_BUCKET).toBe('message-attachments')
    expect(MESSAGE_ATTACHMENT_BUCKET).toBe(STORAGE_MESSAGE_BUCKET)
  })
})

// ===========================================================================
// 4) B-008 — İNDİRME DAVRANIŞI
// ===========================================================================
const createSignedUrlMock = vi.fn()
const fromMock = vi.fn(() => ({ createSignedUrl: createSignedUrlMock }))
const client = { storage: { from: fromMock } } as unknown as SupabaseClient<Database>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('B-008 — imzalı adresin indirme davranışı', () => {
  it('indirme adresi `download` seçeneğiyle üretilir (dosya adı yoldan gelir)', async () => {
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://x/sign?token=t&download=foto.png' },
      error: null,
    })

    await expect(
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH, 'foto.png')
    ).resolves.toBe('https://x/sign?token=t&download=foto.png')

    expect(fromMock).toHaveBeenCalledWith(STORAGE_MESSAGE_BUCKET)
    expect(createSignedUrlMock).toHaveBeenCalledWith(VALID_PATH, SIGNED_URL_TTL_SECONDS, {
      download: 'foto.png',
    })
  })

  it('dosya adı verilmezse `download: true` gönderilir — boş string GÖNDERİLMEZ', () => {
    // TUZAK: storage-js `if (options?.download)` diye bakar; `''` FALSY olduğu için
    // parametre hiç eklenmez ve adres SESSİZCE inline'a döner. Bu yüzden boş/whitespace
    // ad `true`'ya düşürülür.
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://x/s' }, error: null })

    return Promise.all([
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH),
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH, '   '),
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH, null),
    ]).then(() => {
      for (const call of createSignedUrlMock.mock.calls) {
        expect(call[2]).toEqual({ download: true })
      }
    })
  })

  it('GÖSTERİM adresi `download` ALMAZ — `<img>` yolu kırılmaz', async () => {
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://x/inline' }, error: null })

    await createSignedUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH)

    // Üçüncü argüman HİÇ verilmez: aynı yol için iki farklı adres üretilir ve
    // yalnızca indirme yolunda `Content-Disposition: attachment` zorlanır.
    expect(createSignedUrlMock).toHaveBeenCalledWith(VALID_PATH, SIGNED_URL_TTL_SECONDS)
    expect(createSignedUrlMock.mock.calls[0]).toHaveLength(2)
  })

  it('sözleşme korunur: hata/boş yol fırlatmaz, `null` döner', async () => {
    await expect(createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, '  ')).resolves.toBeNull()
    expect(createSignedUrlMock).not.toHaveBeenCalled()

    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await expect(
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH)
    ).resolves.toBeNull()

    createSignedUrlMock.mockRejectedValue(new Error('network down'))
    await expect(
      createSignedDownloadUrl(client, STORAGE_MESSAGE_BUCKET, VALID_PATH)
    ).resolves.toBeNull()
  })

  it('indirme adı yolun son segmentidir (klasör sızmaz)', () => {
    expect(attachmentFileNameFromPath(VALID_PATH)).toBe(
      `${UPLOADER_ID}-a0000000-0000-0000-0000-00000000000a.png`
    )
    expect(attachmentFileNameFromPath(null)).toBeNull()
    expect(attachmentFileNameFromPath('   ')).toBeNull()
  })
})
