// Yükleme öncesi görsel doğrulama: MIME allowlist + magic-byte içerik kontrolü.
//
// Kapattığı bulgular (docs/security/findings-app-surface.md, docs/security/AUDIT.md §5 Grup 4):
// - A-07: Yüklemeden önce ilk baytlar (magic byte) doğrulanmıyordu; bildirilen `file.type`
//   herhangi bir şey olabiliyordu.
// - A-20: İstemcide boyut/tip kontrolü yoktu; kullanıcı 5 MB üstü dosyada anlamsız bir sunucu
//   hatası görüyordu.
// - A-21: Storage yoluna giden uzantı `file.name.split('.').pop()` ile dosya adından
//   türetiliyordu. Burada uzantı ASLA dosya adından türetilmez — daima magic-byte ile tespit
//   edilen gerçek MIME'den türetilir (bkz. `MIME_EXTENSION`).
//
// KAYNAK OTORİTE: `file.type` yalnızca hızlı bir ön elemedir (A-20). Kabul/ret kararı ve dönen
// `mime`/`extension` her zaman magic byte tespitinden gelir, tarayıcının bildirdiği `file.type`'dan
// değil.
//
// ─────────────────────────────────────────────────────────────────────────────
// B-028 — BU DOSYA ARTIK SUNUCUNUN DA TEK KAYNAĞIDIR
// ─────────────────────────────────────────────────────────────────────────────
// Faz 4.6 / AC-4.6.4'e kadar bu modül YALNIZCA tarayıcıda çalışıyordu; `message-attachments`
// bucket'ına giden dosyanın içeriğini sunucu tarafında HİÇBİR ŞEY doğrulamıyordu (bucket'ın
// `allowed_mime_types` listesi bile istemcinin BİLDİRDİĞİ Content-Type'a bakar — sahtelenebilir).
// `apps/web/src/app/api/attachments/verify/route.ts` artık yüklenen nesnenin İLK BAYTLARINI
// sunucuda okuyup aynı kararı bir kez daha veriyor.
//
// SİHİRLİ BAYT TABLOSU TEK YERDE DURUR (`detectImageMime`): istemci ve sunucu AYNI
// fonksiyonu çağırır. İkinci bir tablo yazmak, iki tablonun zamanla ayrışması demekti —
// ayrıştıkları gün "istemci kabul etti, sunucu reddetti" (ya da tersi) sessiz bir bozulma
// üretirdi. Bu yüzden aşağıdaki `validateImageBytes` ÇEVRE BAĞIMSIZDIR: ne `File`, ne `Blob`,
// ne `FileReader` bilir — yalnızca `Uint8Array` + bildirilen tür alır. `validateImageFile`
// (tarayıcı yolu) onun üzerine boyut kontrolü ve bayt okuma ekleyen ince bir sarmalayıcıdır.

export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number]

/** Storage bucket sınırıyla aynı: 5 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * Tespit için okunan baş bayt sayısı.
 *
 * En uzun imza AVIF'inkidir (4..12. baytlar: `ftyp` + marka), yani 12 bayt yeterdi; 32
 * seçilmesinin sebebi sunucu yolunun bu değeri HTTP `Range: bytes=0-31` başlığına birebir
 * çevirmesi ve ileride imza tablosu büyürse (ör. daha uzak ofsette duran bir format) tek
 * sabitin değişmesinin yetmesidir. İstemci de aynı sabitle `file.slice(0, N)` yapar —
 * iki taraf AYNI pencereye bakar.
 */
export const MAGIC_BYTE_SNIFF_LENGTH = 32

/** MIME -> kanonik uzantı. Uzantı ASLA dosya adından türetilmez (A-21). */
export const MIME_EXTENSION: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export type UploadRejectionCode =
  'TOO_LARGE' | 'EMPTY' | 'UNSUPPORTED_TYPE' | 'CONTENT_MISMATCH' | 'UNREADABLE'

export type UploadValidationResult =
  | { ok: true; mime: AllowedImageMime; extension: string }
  | { ok: false; code: UploadRejectionCode; message: string }

const REJECTION_MESSAGES: Record<UploadRejectionCode, string> = {
  TOO_LARGE: 'Dosya 5 MB sınırını aşıyor.',
  EMPTY: 'Dosya boş görünüyor.',
  UNSUPPORTED_TYPE: 'Yalnızca JPEG, PNG, WEBP ve AVIF görselleri yükleyebilirsiniz.',
  CONTENT_MISMATCH: 'Dosyanın içeriği bildirilen türle uyuşmuyor.',
  UNREADABLE: 'Dosya okunamadı. Lütfen tekrar deneyin.',
}

/**
 * jsdom ortamında `Blob.arrayBuffer()` bulunmayabilir (bkz. apps/web/tests/unit/utils.test.ts,
 * docs/PROGRESS.md); bu yüzden önce native metot denenir, yoksa `FileReader`'a düşülür.
 */
async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı'))
    reader.readAsArrayBuffer(blob)
  })
}

function matchesSignature(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

function bytesToAscii(bytes: Uint8Array, start: number, end: number): string {
  return Array.from(bytes.slice(start, end))
    .map((byte) => String.fromCharCode(byte))
    .join('')
}

/** İlk baytlardan gerçek görsel tipini çıkarır; tanınmazsa `null`. */
export function detectImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (matchesSignature(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'

  if (matchesSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'

  if (bytesToAscii(bytes, 0, 4) === 'RIFF' && bytesToAscii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp'
  }

  if (bytesToAscii(bytes, 4, 8) === 'ftyp') {
    const brand = bytesToAscii(bytes, 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }

  return null
}

/** Bildirilen `file.type`'ı allowlist'e karşı normalize eder; tanınmazsa `null`. */
function normalizeReportedMime(type: string): AllowedImageMime | null {
  if ((ALLOWED_IMAGE_MIME as readonly string[]).includes(type)) {
    return type as AllowedImageMime
  }
  // Yaygın yanlış yazım: bazı tarayıcı/OS kombinasyonları JPEG'i 'image/jpg' olarak bildirir.
  // Karar yine de magic byte'a dayanır; bu yalnızca allowlist ön elemesini geçirir.
  if (type === 'image/jpg') return 'image/jpeg'
  return null
}

/**
 * ÇEVRE BAĞIMSIZ ÇEKİRDEK — B-028'in istemci ve sunucu tarafından PAYLAŞILAN kararı.
 *
 * `File`/`Blob`/`FileReader` bilmez; yalnızca dosyanın İLK BAYTLARINI ve karşı tarafın
 * BİLDİRDİĞİ türü alır. Tarayıcıda bildirilen tür `file.type`, sunucuda ise depolanmış
 * nesnenin servis edilen `Content-Type` başlığıdır — ikisi de İSTEMCİ KAYNAKLIDIR ve
 * bu yüzden ikisi de yalnızca ÖN ELEMEDİR. Kabul kararı her zaman `detectImageMime`ten gelir.
 *
 * `head` en az `MAGIC_BYTE_SNIFF_LENGTH` bayt OLMAK ZORUNDA DEĞİLDİR: kısa gelirse
 * `matchesSignature` uzunluk kontrolüyle zaten `false` döner ve karar redde düşer
 * (fail-closed).
 */
export function validateImageBytes(
  head: Uint8Array,
  reportedType: string | null | undefined
): UploadValidationResult {
  if (head.length === 0) {
    return { ok: false, code: 'EMPTY', message: REJECTION_MESSAGES.EMPTY }
  }

  const reportedMime = normalizeReportedMime(reportedType ?? '')
  if (!reportedMime) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: REJECTION_MESSAGES.UNSUPPORTED_TYPE }
  }

  // KAYNAK OTORİTE magic byte'tır: tespit edilemeyen VEYA bildirilenle çelişen içerik reddedilir,
  // ve başarı durumunda dönen mime/extension her zaman buradan (reportedMime'dan değil) gelir.
  const detectedMime = detectImageMime(head)
  if (!detectedMime || detectedMime !== reportedMime) {
    return { ok: false, code: 'CONTENT_MISMATCH', message: REJECTION_MESSAGES.CONTENT_MISMATCH }
  }

  return { ok: true, mime: detectedMime, extension: MIME_EXTENSION[detectedMime] }
}

/** Tam doğrulama (tarayıcı yolu): boyut -> baş baytları oku -> `validateImageBytes`. */
export async function validateImageFile(file: File): Promise<UploadValidationResult> {
  if (file.size === 0) {
    return { ok: false, code: 'EMPTY', message: REJECTION_MESSAGES.EMPTY }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'TOO_LARGE', message: REJECTION_MESSAGES.TOO_LARGE }
  }

  let bytes: Uint8Array
  try {
    bytes = await readBytes(file.slice(0, MAGIC_BYTE_SNIFF_LENGTH))
  } catch {
    return { ok: false, code: 'UNREADABLE', message: REJECTION_MESSAGES.UNREADABLE }
  }

  return validateImageBytes(bytes, file.type)
}

/** Doğrulama başarısızsa fırlatılır; `code` alanı `UploadRejectionCode`. */
export class UploadValidationError extends Error {
  readonly code: UploadRejectionCode

  constructor(code: UploadRejectionCode, message: string) {
    super(message)
    this.name = 'UploadValidationError'
    this.code = code
  }
}

/** Doğrular; başarısızsa `UploadValidationError` fırlatır, başarılıysa `{mime, extension}` döner. */
export async function assertValidImageFile(
  file: File
): Promise<{ mime: AllowedImageMime; extension: string }> {
  const result = await validateImageFile(file)
  if (!result.ok) {
    throw new UploadValidationError(result.code, result.message)
  }
  return { mime: result.mime, extension: result.extension }
}
