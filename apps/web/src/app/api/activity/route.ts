import 'server-only'

// ETKİNLİK KAYDI YAZMA UCU — `POST /api/activity` (Faz 4.8 §7c dilim 2).
//
// Veritabanı yarısı: supabase/migrations/20260820090000_activity_log.sql
// İstemci yarısı:    src/lib/activity/tracker.tsx
//
// §7c: "Yazma yolu Next route: POST /api/activity — tarayıcıdan doğrudan Supabase
// yazımı YOK (B-031'in bu yüzeydeki ilk kapanışı)." Bu dosya o yolun tamamıdır.
//
// ═════════════════════════════════════════════════════════════════════════════
// KARAR — RIZA YOKKEN (SQLSTATE 42501) NE DÖNÜLÜR: **204 No Content**
// ═════════════════════════════════════════════════════════════════════════════
// Görev iki seçenek sunuyordu (204 veya sessiz kabul). 204 seçildi; gerekçe ÜÇ
// katmanlı:
//
//   1) BU BİR HATA DEĞİL. Rıza başka bir sekmede/cihazda geri çekilmiş olabilir ve
//      yoldaki heartbeat buna yetişemez. 4xx dönmek, kullanıcının hiçbir yanlış
//      yapmadığı bir durumu istemcide hata olarak (toast, konsol gürültüsü, React
//      Query retry'ı) yüzeye çıkarırdı — heartbeat "bozuk" görünürdü.
//
//   2) "SESSİZ KABUL" (200 + `{ session_id }`) SEÇİLMEDİ ÇÜNKÜ O BİR YALANDIR.
//      Hiçbir satır yazılmadı; uydurulmuş bir `session_id` döndürmek istemcinin
//      elindeki durumu ZEHİRLERDİ (var olmayan bir oturumu sonsuza kadar geri
//      göndermeye çalışırdı). 204'ün gövdesi TANIMI GEREĞİ yoktur: uydurulacak bir
//      alan da yoktur.
//
//   3) SIZINTI YÜZEYİ YOK. Veritabanının hata metni üç durumu AYIRT EDİYOR
//      ("durum: undecided" / "durum: revoked" / "oturum baska bir kullaniciya ait").
//      Bu metin İSTEMCİYE ASLA GEÇMEZ — yalnızca sunucu loguna yazılır. İstemci tek
//      ve ayrımsız bir sinyal alır: "yazılmadı, dur". Doğru davranış zaten ikisinde
//      de AYNIDIR (sinyal göndermeyi bırak, rıza durumunu yeniden oku), dolayısıyla
//      ayrımı istemciye vermenin bir faydası da yoktur.
//
// 42501'in İKİNCİ ANLAMI (başkasının oturumu) da aynı 204'e düşer ve bu KASITLIDIR:
// saldırgan, gönderdiği rastgele bir `session_id`'nin "var ama başkasına ait" mi
// yoksa "hiç yok" mu olduğunu yanıttan ÖĞRENEMEZ (oturum kimliği numaralandırma
// kanalı kapalı). Meşru istemci ise 204'te elindeki `session_id`'yi ATAR; rıza
// hâlâ açıksa bir sonraki sinyal `session_id: null` ile gider ve sunucu taze bir
// oturum açar — iki durum da KENDİ KENDİNİ ONARIR.
//
// ═════════════════════════════════════════════════════════════════════════════
// SUNUCU NEYE KARAR VERİR, İSTEMCİ NEYE KARAR VERMEZ
// ═════════════════════════════════════════════════════════════════════════════
// 30 dk bayatlama, platform değişiminde yeni oturum ve fırsatçı purge TAMAMEN
// veritabanındadır (`record_activity` §4c/§4e). Bu route o kararların HİÇBİRİNİ
// tekrarlamaz; istemcinin saati veya uykuya dalmış bir sekmesi oturum sınırını
// belirleyemez.

import { NextResponse } from 'next/server'

import { errorResponse } from '@/lib/api/response'
import { activityBodySchema, parseRecordActivityResult } from '@/lib/activity/contract'
import { checkActivityRateLimit } from '@/lib/activity/rate-limit'
import { createRequestLogger } from '@/lib/logger'
import {
  SQLSTATE,
  UNCONFIGURED_MESSAGE,
  authenticateActivityRequest,
  createActivityAdminClient,
  sqlStateOf,
} from './shared'
import { formatZodError } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Gövde tavanı. Meşru gövde ~200 bayttır (bir olay adı, bir uuid, bir sekme etiketi);
 * 4 KB cömert bir tavandır. `proxy.ts`'teki 64 KB burada gereksizce büyük olurdu —
 * bu uç dakikada onlarca kez çağrılıyor. `Content-Length` İSTEMCİDEN gelir ve
 * güvenilmezdir; asıl savunma `request.text()` sonrası bayt sayımıdır (aşağıda).
 */
const MAX_BODY_BYTES = 4 * 1024

const NO_CONTENT_HEADERS = { 'Cache-Control': 'no-store' } as const

/** Rıza yokken dönülen ayrımsız sinyal (bkz. dosya başındaki KARAR bloğu). */
function silentlyAccepted(requestId: string): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { 'X-Request-ID': requestId, ...NO_CONTENT_HEADERS },
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // 1) KİMLİK — gövdedeki hiçbir alandan DEĞİL, doğrulanmış JWT'den.
  const auth = await authenticateActivityRequest(request, requestId)
  if (auth instanceof NextResponse) {
    log.warn({ event: 'activity_unauthenticated' }, 'Etkinlik kaydı: kimlik doğrulanamadı')
    return auth
  }
  const { userId } = auth

  // 2) HIZ SINIRI — gövde okunmadan ve veritabanına gidilmeden ÖNCE.
  //    Parametrelerin gerekçesi: src/lib/activity/rate-limit.ts başlığı.
  const verdict = checkActivityRateLimit(userId)
  if (!verdict.allowed) {
    log.warn(
      { event: 'activity_rate_limited', userId, blockedBy: verdict.blockedBy },
      'Etkinlik kaydı: hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'ACTIVITY_RATE_LIMIT_EXCEEDED',
      'Çok fazla etkinlik sinyali gönderildi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(verdict.retryAfterSeconds) }
    )
  }

  // 3) GÖVDE
  const bodyText = await request.text().catch(() => null)
  if (bodyText === null) {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
    log.warn({ event: 'activity_body_too_large', userId }, 'Etkinlik kaydı: gövde çok büyük')
    return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'İstek gövdesi çok büyük.', requestId)
  }

  let rawBody: unknown
  try {
    // Gövdesiz istek de SAF HEARTBEAT sayılır: `{}` varsayılanlarla doğrulanır.
    rawBody = bodyText.trim() === '' ? {} : JSON.parse(bodyText)
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  const parsed = activityBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    log.warn({ event: 'activity_validation_failed', userId }, 'Etkinlik kaydı: gövde geçersiz')
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Gönderilen bilgiler geçersiz.',
      requestId,
      formatZodError(parsed.error)
    )
  }

  // 4) SERVICE ROLE — fail-closed.
  const admin = createActivityAdminClient()
  if (!admin) {
    log.error(
      { event: 'activity_unconfigured' },
      'Etkinlik kaydı: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
    )
    return errorResponse(503, 'ACTIVITY_UNAVAILABLE', UNCONFIGURED_MESSAGE, requestId)
  }

  // 5) YAZ — `record_activity()` rıza kapısını, oturum bayatlamasını, kapalı listeyi
  //    ve fırsatçı purge'ü TEK transaksiyonda yapar.
  const { event, session_id, tab, duration_sec, occurred_at, platform } = parsed.data

  const { data, error } = await admin.rpc('record_activity', {
    p_user_id: userId,
    p_platform: platform,
    p_event: event ?? undefined,
    p_session_id: session_id ?? undefined,
    p_tab: tab ?? undefined,
    p_duration_sec: duration_sec ?? undefined,
    p_occurred_at: occurred_at ?? undefined,
  })

  if (error) {
    const state = sqlStateOf(error)

    if (state === SQLSTATE.INSUFFICIENT_PRIVILEGE) {
      // Hata METNİ yalnızca sunucu logunda kalır — üç durumu ayırt eden tek yer orası.
      log.info(
        { event: 'activity_denied', userId, reason: error.message },
        'Etkinlik kaydı: rıza yok veya oturum sahibi değil — sessizce kabul edildi'
      )
      return silentlyAccepted(requestId)
    }

    if (state === SQLSTATE.INVALID_PARAMETER_VALUE || state === SQLSTATE.CHECK_VIOLATION) {
      // `23514`'e pratikte ULAŞILMAMALI: kapalı listeler zaten zod ile kapatıldı
      // (`contract.ts`). Buraya düşmesi, iki listenin AYRIŞTIĞININ kanıtıdır — bu
      // yüzden `warn` seviyesinde ve ayırt edilebilir bir kodla loglanır.
      log.warn(
        { event: 'activity_rejected', userId, sqlstate: state },
        'Etkinlik kaydı: veritabanı parametreyi reddetti'
      )
      return errorResponse(
        400,
        'ACTIVITY_INVALID_SIGNAL',
        'Etkinlik sinyali kabul edilmedi.',
        requestId
      )
    }

    if (state === SQLSTATE.FOREIGN_KEY_VIOLATION) {
      // JWT geçerli ama profil yok: hesap istek yoldayken silinmiş olabilir.
      log.warn({ event: 'activity_profile_missing', userId }, 'Etkinlik kaydı: profil yok')
      return errorResponse(404, 'PROFILE_NOT_FOUND', 'Profil bulunamadı.', requestId)
    }

    log.error(
      { event: 'activity_failed', userId, err: error.message },
      'Etkinlik kaydı: veritabanı hatası'
    )
    return errorResponse(500, 'ACTIVITY_FAILED', 'Etkinlik kaydedilemedi.', requestId)
  }

  const result = parseRecordActivityResult(data)
  if (!result) {
    log.error({ event: 'activity_result_shape', userId }, 'Etkinlik kaydı: sonuç biçimi bozuk')
    return errorResponse(500, 'ACTIVITY_FAILED', 'Etkinlik kaydedilemedi.', requestId)
  }

  // Yanıt İSTEMCİNİN DURUM MAKİNESİDİR: `session_id` saklanır ve bir sonraki
  // sinyalde geri gönderilir; `session_started` true ise istemcinin elindeki oturum
  // bayatlamıştı (ya da hiç yoktu) ve yeni id benimsenir.
  return NextResponse.json(
    {
      session_id: result.sessionId,
      event_id: result.eventId,
      session_started: result.sessionStarted,
    },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, ...NO_CONTENT_HEADERS },
    }
  )
}
