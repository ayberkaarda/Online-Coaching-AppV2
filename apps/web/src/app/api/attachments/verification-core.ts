// Mesaj eki doğrulama akışının SAF (I/O'suz) çekirdeği — yol ayrıştırma, gövde şeması ve
// bayt kararı.
//
// NEDEN AYRI DOSYA: `verify/route.ts` içinde `server-only` modüller import ediliyor ve dosya
// bir Next.js route handler'ı olarak değerlendiriliyor. Buradaki mantık ise TAMAMEN saf;
// birim testi (`tests/unit/attachment-validation.test.ts`) bunu hiçbir sunucu bağlamı kurmadan
// doğrudan çağırabilsin diye ayrıldı. Aynı desen `api/account/deletion-core.ts` ile
// `api/account/delete/route.ts` arasında da var.
//
// ─────────────────────────────────────────────────────────────────────────────
// B-028 — SİHİRLİ BAYT TABLOSU BURADA DEĞİL
// ─────────────────────────────────────────────────────────────────────────────
// Bu dosya imza tablosunun bir KOPYASINI TUTMAZ. Karar `@repo/api-client/upload-validation`
// içindeki `validateImageBytes`ten gelir — istemcinin kullandığı FONKSİYONUN TA KENDİSİ.
// İki tablo tutulsaydı ayrıştıkları gün "istemci kabul etti, sunucu reddetti" (ya da tersi)
// sessiz bir bozulma üretirdi.

import { z } from 'zod'

import {
  MAGIC_BYTE_SNIFF_LENGTH,
  MAX_UPLOAD_BYTES,
  MIME_EXTENSION,
  validateImageBytes,
  type AllowedImageMime,
} from '@repo/api-client/upload-validation'

/** B-028 kapısının bugün kapsadığı tek bucket (bkz. migration §1 CHECK). */
export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments'

/** Sunucunun okuduğu baş bayt sayısı = istemcinin baktığı pencere. */
export const ATTACHMENT_SNIFF_BYTES = MAGIC_BYTE_SNIFF_LENGTH

/**
 * Yol sözleşmesi — `messages_attachment_path_chk` (20260817190200) ile BİREBİR aynı desen:
 *   `<conversation_client_id>/<uploader_uid>-<uuid>.<ext>`
 * Katıdır ve FAIL-CLOSED'dır: uymayan her değer `null` üretir, çağıran 400 döner.
 */
const ATTACHMENT_PATH_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([^/]+)$/

export interface ParsedAttachmentPath {
  /** Konuşma anahtarı (danışan tarafı) — yolun İLK segmenti. */
  conversationId: string
  /** Yükleyenin uid'si — dosya adının ön eki. */
  uploaderId: string
  /** Nokta sonrası uzantı (küçük harfe indirgenmiş); yoksa `null`. */
  extension: string | null
}

/** Yolu ayrıştırır; sözleşmeye uymuyorsa `null` (fail-closed). */
export function parseAttachmentPath(path: string): ParsedAttachmentPath | null {
  const match = ATTACHMENT_PATH_RE.exec(path)
  if (!match) return null

  // `noUncheckedIndexedAccess` açık: yakalama grupları `string | undefined` gelir.
  // Desen üç grubu da ZORUNLU kıldığı için burada `undefined` imkânsızdır; yine de
  // varsayım yapmak yerine fail-closed dönülür.
  const conversationId = match[1]
  const uploaderId = match[2]
  const rest = match[3]
  if (!conversationId || !uploaderId || !rest) return null

  const dot = rest.lastIndexOf('.')
  const extension = dot > 0 && dot < rest.length - 1 ? rest.slice(dot + 1).toLowerCase() : null

  return { conversationId, uploaderId, extension }
}

/**
 * İstek gövdesi: SADECE yol.
 *
 * Kullanıcı kimliği gövdeden ALINMAZ — doğrulanmış Bearer token'dan gelir ve yolun
 * yükleyen segmentiyle karşılaştırılır (plan §5.3: "client'tan user_id kabul etme").
 * Beklenen türü ya da "bu dosya PNG" iddiasını da gövdeden ALMAYIZ; alsaydık doğrulamanın
 * kaynağı yine istemci olurdu.
 */
export const verifyAttachmentBodySchema = z.object({
  path: z
    .string({ required_error: 'Ek yolu zorunludur.' })
    .trim()
    .min(1, 'Ek yolu boş olamaz.')
    .max(512, 'Ek yolu çok uzun.'),
})

export type VerifyAttachmentBody = z.infer<typeof verifyAttachmentBodySchema>

export type AttachmentRejectionCode =
  'CONTENT_MISMATCH' | 'UNSUPPORTED_TYPE' | 'EMPTY' | 'TOO_LARGE' | 'EXTENSION_MISMATCH'

export type AttachmentDecision =
  | { ok: true; mime: AllowedImageMime }
  | { ok: false; code: AttachmentRejectionCode; message: string }

export interface AttachmentEvidence {
  /** Nesnenin İLK baytları (sunucunun kendi okuduğu). */
  head: Uint8Array
  /** Storage'ın servis ettiği Content-Type — İSTEMCİ KAYNAKLIDIR, yalnızca ön elemedir. */
  declaredType: string | null
  /** Yoldan gelen uzantı; `null` ise uzantı tutarlılığı ölçülmez. */
  extension: string | null
  /** Nesnenin TAM boyutu (Content-Range'ten); bilinmiyorsa `null`. */
  totalBytes: number | null
}

/**
 * SUNUCUNUN KARARI.
 *
 * Sıra bilinçlidir ve istemci tarafındaki sırayla aynıdır: boyut -> bildirilen tür ->
 * magic byte -> tutarlılık. Sonuncu adım (uzantı tutarlılığı) yalnızca SUNUCUDA vardır:
 * yol istemci tarafından üretilir ve `.png` derken içerik JPEG olabilir. İkisi de kabul
 * listesindedir ama uyuşmazlık, yolu üretenin `upload-validation` çıktısını KULLANMADIĞINI
 * gösterir — yani istemci ya eskidir ya da sahtedir. Her iki hâlde de reddedilir.
 */
export function evaluateAttachment(evidence: AttachmentEvidence): AttachmentDecision {
  const { head, declaredType, extension, totalBytes } = evidence

  if (totalBytes !== null && totalBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: 'Dosya 5 MB sınırını aşıyor.',
    }
  }

  const result = validateImageBytes(head, declaredType)
  if (!result.ok) {
    // `UNREADABLE` bu yolda üretilemez (baytlar zaten elimizde), ama tip birleşimi
    // taşıdığı için güvenli bir eşlemeye düşürülür.
    const code: AttachmentRejectionCode =
      result.code === 'UNSUPPORTED_TYPE'
        ? 'UNSUPPORTED_TYPE'
        : result.code === 'EMPTY'
          ? 'EMPTY'
          : result.code === 'TOO_LARGE'
            ? 'TOO_LARGE'
            : 'CONTENT_MISMATCH'
    return { ok: false, code, message: result.message }
  }

  if (extension !== null && extension !== MIME_EXTENSION[result.mime]) {
    return {
      ok: false,
      code: 'EXTENSION_MISMATCH',
      message: 'Dosyanın uzantısı içeriğiyle uyuşmuyor.',
    }
  }

  return { ok: true, mime: result.mime }
}

/**
 * `content-range: bytes 0-31/68` başlığından TAM boyutu çıkarır.
 * Başlık yoksa/biçim tanınmazsa `null` (boyut ölçülmez — bucket tavanı zaten 5 MB'tır).
 */
export function parseContentRangeTotal(header: string | null | undefined): number | null {
  if (!header) return null
  const match = /\/\s*(\d+)\s*$/.exec(header)
  const digits = match?.[1]
  if (!digits) return null
  const total = Number.parseInt(digits, 10)
  return Number.isFinite(total) ? total : null
}

/**
 * Storage nesne adresinin yol kısmını güvenli biçimde kodlar.
 * Segment segment kodlanır ki `/` ayırıcı olarak KALSIN (tümünü `encodeURIComponent`'ten
 * geçirmek yolu tek bir segmente çevirirdi).
 */
export function encodeStoragePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}
