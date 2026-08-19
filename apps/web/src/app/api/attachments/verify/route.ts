import 'server-only'

// B-028 — MESAJ EKİ İÇİN SUNUCU TARAFI MAGIC-BYTE DOĞRULAMASI (AC-4.6.4).
// Veritabanı yarısı: supabase/migrations/20260819110000_attachment_magic_byte_verification.sql
//
// ─────────────────────────────────────────────────────────────────────────────
// AKIŞ
// ─────────────────────────────────────────────────────────────────────────────
//   1. Tarayıcı dosyayı DOĞRUDAN Storage'a yükler (mimari DEĞİŞMEDİ; gerekçe
//      migration başlığındaki "KATMAN SEÇİMİ" bölümünde ölçümleriyle duruyor).
//   2. Tarayıcı bu uca yolu bildirir.
//   3. Bu uç, nesnenin İLK 32 BAYTINI KENDİ okur (`Range: bytes=0-31`) ve kararı
//      istemcinin kullandığı FONKSİYONLA (`validateImageBytes`) verir.
//   4. Uymuyorsa nesne SİLİNİR ve 422 döner; uyuyorsa `record_attachment_verification`
//      ile doğrulama damgası yazılır.
//   5. Mesaj INSERT'inde veritabanı o damgayı ARAR (AFTER INSERT tetikleyicisi).
//      Damga yoksa satır GİRMEZ — yani bu ucu ATLAMAK bir kaçış yolu DEĞİLDİR.
//      "Sunucu tarafında doğrulanıyor" iddiasını gerçek kılan adım budur.
//
// ─────────────────────────────────────────────────────────────────────────────
// BAYTLAR VE eTag AYNI YANITTAN OKUNUR — TOCTOU BUNUN İÇİN KAPALI
// ─────────────────────────────────────────────────────────────────────────────
// Tek bir GET, üç kanıtı ATOMİK olarak verir: baş baytlar (gövde), `etag`
// (içerik özeti) ve `content-type`. Damgaya eTag de yazılır; mesaj INSERT'inde
// veritabanı `storage.objects.metadata->>'eTag'` ile karşılaştırır. Doğrulamadan
// sonra içerik değiştirilirse (aynı yola yeniden yükleme, sil + yeniden yükleme)
// eTag değişir ve INSERT reddedilir.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN `service_role`
// ─────────────────────────────────────────────────────────────────────────────
// Yalnızca SON adım için: damgayı yazan `record_attachment_verification` RPC'sinin
// EXECUTE'u yalnızca `service_role`dedir — aksi hâlde tarayıcıdaki kod kendi kendini
// "doğrulanmış" ilan edebilirdi. BAYTLARI OKUMA ve UYUMSUZ NESNEYİ SİLME adımları
// KULLANICININ KENDİ token'ıyla yapılır (RLS yürürlükte): bu uç, kullanıcının zaten
// erişebildiğinden fazlasını okumaz. Anahtar disiplini ADR-0025 ile aynıdır.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { clientEnv } from '@/env'
import { getServerEnv } from '@/env.server'
import { errorResponse, logSecurityEvent } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  ATTACHMENT_SNIFF_BYTES,
  MESSAGE_ATTACHMENT_BUCKET,
  encodeStoragePath,
  evaluateAttachment,
  parseAttachmentPath,
  parseContentRangeTotal,
  verifyAttachmentBodySchema,
} from '../verification-core'
import type { Database } from '@repo/types'
import { formatZodError } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_AUTHENTICATED_MESSAGE = 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
const GENERIC_FAILURE_MESSAGE =
  'Fotoğraf doğrulanamadı. Lütfen tekrar deneyin veya başka bir dosya seçin.'

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // ---------------------------------------------------------------------------
  // 1) KİMLİK — `Authorization: Bearer <token>` (cookie DEĞİL; gerekçe
  //    api/account/delete/route.ts §1 ile aynı: cookie CSRF yüzeyi açar).
  // ---------------------------------------------------------------------------
  const accessToken = request.headers
    .get('authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim()

  if (!accessToken) {
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const userId = userData.user.id

  // ---------------------------------------------------------------------------
  // 2) GÖVDE + YOL SÖZLEŞMESİ
  // ---------------------------------------------------------------------------
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  const parsedBody = verifyAttachmentBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Ek yolu geçersiz.',
      requestId,
      formatZodError(parsedBody.error)
    )
  }

  const path = parsedBody.data.path
  const parsedPath = parseAttachmentPath(path)

  if (!parsedPath) {
    return errorResponse(400, 'INVALID_ATTACHMENT_PATH', 'Ek yolu geçersiz.', requestId)
  }

  // YÜKLEYEN KAPISI: kimse BAŞKASININ yüklediği nesneyi doğrulatamaz. (Aynı kısıt
  // `consume_attachment_verification` içinde veritabanında da var — iki kat.)
  if (parsedPath.uploaderId !== userId) {
    logSecurityEvent('attachment_verify_foreign_path', { requestId })
    return errorResponse(403, 'FORBIDDEN', 'Bu dosyayı doğrulama yetkiniz yok.', requestId)
  }

  // ---------------------------------------------------------------------------
  // 3) BAYTLARI SUNUCU OKUR — kullanıcının KENDİ token'ıyla (RLS yürürlükte)
  //
  //    `Range: bytes=0-31` tek bir kısa yanıt getirir: 5 MB'lık bir dosyayı
  //    sunucuya çekmeye gerek yoktur. Aynı yanıt `etag` ve `content-type`
  //    başlıklarını da taşır -> üç kanıt tek atomik gözlemden gelir.
  // ---------------------------------------------------------------------------
  const objectUrl =
    `${clientEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/` +
    `${MESSAGE_ATTACHMENT_BUCKET}/${encodeStoragePath(path)}`

  let objectResponse: Response
  try {
    objectResponse = await fetch(objectUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Range: `bytes=0-${ATTACHMENT_SNIFF_BYTES - 1}`,
      },
      cache: 'no-store',
    })
  } catch (err) {
    log.error(
      {
        event: 'attachment_verify_fetch_failed',
        err: err instanceof Error ? err.message : 'bilinmiyor',
      },
      'Ek doğrulama: nesne okunamadı'
    )
    return errorResponse(502, 'ATTACHMENT_UNREADABLE', GENERIC_FAILURE_MESSAGE, requestId)
  }

  if (!objectResponse.ok) {
    // 400/404: nesne yok. 403: RLS reddi (kullanıcı o konuşmanın tarafı değil).
    // İkisi de istemci hatasıdır ve AYRINTI SIZDIRILMAZ.
    log.warn(
      { event: 'attachment_verify_object_missing', status: objectResponse.status },
      'Ek doğrulama: nesne okunamadı'
    )
    return errorResponse(
      404,
      'ATTACHMENT_NOT_FOUND',
      'Yüklenen dosya bulunamadı. Lütfen tekrar deneyin.',
      requestId
    )
  }

  const head = new Uint8Array(await objectResponse.arrayBuffer())
  const etag = objectResponse.headers.get('etag')

  // ---------------------------------------------------------------------------
  // 4) KARAR — istemcinin kullandığı FONKSİYONUN AYNISI
  // ---------------------------------------------------------------------------
  const decision = evaluateAttachment({
    head,
    declaredType: objectResponse.headers.get('content-type'),
    extension: parsedPath.extension,
    totalBytes: parseContentRangeTotal(objectResponse.headers.get('content-range')),
  })

  if (!decision.ok) {
    // ###########################################################################
    // # UYMAYAN NESNE BUCKET'TA BIRAKILMAZ                                       #
    // # Silme KULLANICININ KENDİ token'ıyla yapılır: `message_attachments_        #
    // # delete_own_or_coach` yükleyene kendi nesnesini sildirir, yani bu adım    #
    // # `service_role` GEREKTİRMEZ. Silme başarısız olsa bile akış değişmez —    #
    // # damga YAZILMADIĞI için o nesne hiçbir mesaja bağlanamaz (öksüz kalır).   #
    // ###########################################################################
    const { error: removeError } = await authClient.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .remove([path])

    logSecurityEvent('attachment_magic_byte_rejected', {
      requestId,
      code: decision.code,
      removed: !removeError,
    })

    return errorResponse(422, decision.code, decision.message, requestId)
  }

  if (!etag) {
    // eTag olmadan TOCTOU kapısı kurulamaz. Damga yazmaktansa reddetmek doğrudur:
    // "doğrulandı" damgası, arkasında duramayacağımız bir iddia olurdu.
    log.error({ event: 'attachment_verify_no_etag' }, 'Ek doğrulama: nesne eTag başlığı yok')
    return errorResponse(502, 'ATTACHMENT_UNREADABLE', GENERIC_FAILURE_MESSAGE, requestId)
  }

  // ---------------------------------------------------------------------------
  // 5) DAMGA — YALNIZCA burada `service_role`
  // ---------------------------------------------------------------------------
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    // Fail-closed: anahtar yoksa damga yazılamaz, damga yoksa mesaj da yazılamaz.
    // Sessizce "doğrulandı" demek en kötü davranış olurdu.
    log.error(
      { event: 'attachment_verify_unconfigured' },
      'Ek doğrulama: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
    )
    return errorResponse(
      503,
      'ATTACHMENT_VERIFICATION_UNAVAILABLE',
      'Fotoğraf gönderimi şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.',
      requestId
    )
  }

  const admin = createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error: recordError } = await admin.rpc('record_attachment_verification', {
    p_bucket: MESSAGE_ATTACHMENT_BUCKET,
    p_path: path,
    p_mime: decision.mime,
    p_etag: etag,
  })

  if (recordError) {
    // En olası sebep: nesne, baytları okuduğumuz AN ile damga arasında değişti
    // (RPC bunu eTag ile fail-closed reddeder).
    log.warn(
      { event: 'attachment_verify_record_failed', err: recordError.message },
      'Ek doğrulama: damga yazılamadı'
    )
    return errorResponse(
      409,
      'ATTACHMENT_CHANGED',
      'Dosya doğrulama sırasında değişti. Lütfen tekrar deneyin.',
      requestId
    )
  }

  log.info({ event: 'attachment_verified', mime: decision.mime }, 'Ek doğrulandı')

  return NextResponse.json(
    { ok: true, mime: decision.mime },
    { status: 200, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } }
  )
}
