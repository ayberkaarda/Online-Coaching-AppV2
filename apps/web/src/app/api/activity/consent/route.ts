import 'server-only'

// ETKİNLİK KAYDI RIZA UÇLARI (Faz 4.8 §7c dilim 2).
//
//   POST   /api/activity/consent   -> RIZA VER   (`grant_activity_consent`)
//   DELETE /api/activity/consent   -> RIZA GERİ ÇEK (`revoke_activity_consent`)
//
// ═════════════════════════════════════════════════════════════════════════════
// KARAR — NEDEN `DELETE`, NEDEN AYRI BİR `/revoke` YOLU DEĞİL
// ═════════════════════════════════════════════════════════════════════════════
// Görev iki biçim öneriyordu: `DELETE /api/activity/consent` ya da
// `POST /api/activity/consent/revoke`. `DELETE` seçildi:
//
//   * Kaynak AYNI kaynaktır (kullanıcının rızası); "ver" ve "geri çek" o kaynağın
//     iki halidir. İkisini tek dosyada tutmak, birinin diğerinden habersiz
//     değişmesini (ör. hız sınırı kovasının yalnızca birine eklenmesi) YAPISAL
//     olarak zorlaştırır.
//   * Geri çekme GÖVDE İSTEMEZ (`revoke_activity_consent` yalnızca `p_user_id`
//     alır ve o da JWT'den gelir). Gövdesiz bir POST, "ne gönderiliyor?" sorusunu
//     her okuyanda yeniden doğurur; `DELETE` niyeti metotta taşır.
//   * Repoda bugün DELETE metodu kullanan bir route YOK; ama bunun sebebi bir
//     kural değil, şimdiye kadar SİLME semantiği taşıyan bir uç olmamasıdır
//     (`/api/account/delete` bir POST'tur çünkü İKİNCİ ONAY CÜMLESİNİ gövdede
//     taşımak zorundadır — burada onaylanacak bir cümle yoktur).
//
// ═════════════════════════════════════════════════════════════════════════════
// "YALNIZ KENDİ HESABI" — KONTROL DEĞİL, YAPISAL İMKÂNSIZLIK
// ═════════════════════════════════════════════════════════════════════════════
// Bu uçlarda HEDEF PARAMETRESİ YOKTUR. Ne yolda (`/consent/:userId`), ne gövdede
// (`activityConsentBodySchema` `.strict()` ve yalnızca `version` taşır), ne sorgu
// dizesinde. Kimlik tek bir yerden gelir: doğrulanmış JWT. Dolayısıyla "koç
// başkasının rızasını veremez/alamaz" iddiası bir `if` bloğuna değil, ALINACAK
// PARAMETRENİN YOKLUĞUNA dayanır — ileride birinin rol kontrolünü yanlışlıkla
// gevşetmesi bu sınırı açamaz.
//
// GERİ ÇEKMENİN YIKICI YAN ETKİSİ BİLİNÇLİDİR: `revoke_activity_consent()` damgayı
// basmakla kalmaz, kullanıcının TÜM `activity_*` satırlarını AYNI transaksiyonda
// SİLER (KVKK m.7 — "kapat = durdur + sil", migration §1c). Bu yüzden uç dar bir
// hız sınırı taşır (saatte 10) ve `Cache-Control: no-store` ile döner.

import { NextResponse } from 'next/server'

import { errorResponse, logSecurityEvent } from '@/lib/api/response'
import { activityConsentBodySchema } from '@/lib/activity/contract'
import { checkActivityConsentRateLimit } from '@/lib/activity/rate-limit'
import { createRequestLogger } from '@/lib/logger'
import {
  SQLSTATE,
  UNCONFIGURED_MESSAGE,
  authenticateActivityRequest,
  createActivityAdminClient,
  sqlStateOf,
} from '../shared'
import { formatZodError } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_LIMIT_MESSAGE =
  'Rıza tercihiniz çok kısa sürede birçok kez değiştirildi. Lütfen daha sonra tekrar deneyin.'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

interface Prepared {
  userId: string
  admin: NonNullable<ReturnType<typeof createActivityAdminClient>>
}

/** İki metodun ORTAK ön adımları: kimlik -> hız sınırı -> service_role. */
async function prepare(
  request: Request,
  requestId: string,
  log: ReturnType<typeof createRequestLogger>
): Promise<Prepared | NextResponse> {
  const auth = await authenticateActivityRequest(request, requestId)
  if (auth instanceof NextResponse) {
    log.warn({ event: 'activity_consent_unauthenticated' }, 'Etkinlik rızası: kimlik yok')
    return auth
  }

  const verdict = checkActivityConsentRateLimit(auth.userId)
  if (!verdict.allowed) {
    log.warn(
      { event: 'activity_consent_rate_limited', userId: auth.userId },
      'Etkinlik rızası: hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'ACTIVITY_CONSENT_RATE_LIMIT',
      RATE_LIMIT_MESSAGE,
      requestId,
      undefined,
      {
        'Retry-After': String(verdict.retryAfterSeconds),
      }
    )
  }

  const admin = createActivityAdminClient()
  if (!admin) {
    log.error(
      { event: 'activity_consent_unconfigured' },
      'Etkinlik rızası: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
    )
    return errorResponse(503, 'ACTIVITY_UNAVAILABLE', UNCONFIGURED_MESSAGE, requestId)
  }

  return { userId: auth.userId, admin }
}

/** Rıza RPC'lerinin hata kodlarını HTTP'ye çevirir (iki metotta da aynı tablo). */
function consentErrorResponse(
  error: { message: string },
  requestId: string,
  log: ReturnType<typeof createRequestLogger>,
  userId: string
): NextResponse {
  const state = sqlStateOf(error)

  if (state === SQLSTATE.FOREIGN_KEY_VIOLATION) {
    log.warn({ event: 'activity_consent_profile_missing', userId }, 'Etkinlik rızası: profil yok')
    return errorResponse(404, 'PROFILE_NOT_FOUND', 'Profil bulunamadı.', requestId)
  }

  if (state === SQLSTATE.INVALID_PARAMETER_VALUE) {
    log.warn({ event: 'activity_consent_rejected', userId }, 'Etkinlik rızası: parametre geçersiz')
    return errorResponse(400, 'ACTIVITY_CONSENT_INVALID', 'Rıza kaydı kabul edilmedi.', requestId)
  }

  log.error(
    { event: 'activity_consent_failed', userId, err: error.message },
    'Etkinlik rızası: veritabanı hatası'
  )
  return errorResponse(
    500,
    'ACTIVITY_CONSENT_FAILED',
    'Rıza tercihiniz kaydedilemedi. Lütfen tekrar deneyin.',
    requestId
  )
}

// ---------------------------------------------------------------------------
// RIZA VER
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  const prepared = await prepare(request, requestId, log)
  if (prepared instanceof NextResponse) return prepared
  const { userId, admin } = prepared

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  // `version` ZORUNLUDUR ve tavanı `ACTIVITY_CONSENT_VERSION`'dır: istemci
  // "gelecekteki" bir aydınlatma metnini onaylamış gibi gösteremez. Veritabanı da
  // kendi tarafında `p_version >= 1` şartını 22023 ile zorluyor — iki kapı.
  const parsed = activityConsentBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Rıza metni sürümü geçersiz.',
      requestId,
      formatZodError(parsed.error)
    )
  }

  const { error } = await admin.rpc('grant_activity_consent', {
    p_user_id: userId,
    p_version: parsed.data.version,
  })

  if (error) return consentErrorResponse(error, requestId, log, userId)

  // Rıza bir KVKK olayıdır: kalıcı kaydı `profiles` damgasıdır, bu satır yalnızca
  // sunucu logunda hızlı arama içindir (`coach/reset-client-password`'daki aynı
  // "tamamlayıcı log" disiplini). Kişisel veri yazılmaz — yalnızca uid + sürüm.
  logSecurityEvent('activity_consent_granted', {
    requestId,
    userId,
    version: parsed.data.version,
  })

  return NextResponse.json(
    { ok: true, state: 'granted', version: parsed.data.version },
    { status: 200, headers: { 'X-Request-ID': requestId, ...NO_STORE } }
  )
}

// ---------------------------------------------------------------------------
// RIZA GERİ ÇEK (+ TÜM ETKİNLİK SATIRLARININ SİLİNMESİ)
// ---------------------------------------------------------------------------

export async function DELETE(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  const prepared = await prepare(request, requestId, log)
  if (prepared instanceof NextResponse) return prepared
  const { userId, admin } = prepared

  // GÖVDE OKUNMAZ. `revoke_activity_consent` yalnızca `p_user_id` alır ve o da
  // JWT'den gelir; gövdeyi okumak, ileride birinin oraya bir hedef alanı
  // eklemesine kapı aralardı.
  const { data, error } = await admin.rpc('revoke_activity_consent', { p_user_id: userId })

  if (error) return consentErrorResponse(error, requestId, log, userId)

  logSecurityEvent('activity_consent_revoked', { requestId, userId })

  // `revoke_activity_consent()` silinen satır sayılarını döndürür. RPC çıktısı
  // AYNEN geçirilmez, YALNIZCA iki sayaç PROJEKTE edilir: arayüz "kaydınız silindi"
  // iddiasını SAYIYLA gösterebilsin (kullanıcının kendi verisi hakkındaki bilgi
  // sızıntı değil şeffaflıktır) ama RPC'ye ileride eklenecek herhangi bir alan
  // yanıta KENDİLİĞİNDEN sızmasın.
  const purged = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}

  return NextResponse.json(
    {
      ok: true,
      state: 'revoked',
      events_deleted: typeof purged.events_deleted === 'number' ? purged.events_deleted : 0,
      sessions_deleted: typeof purged.sessions_deleted === 'number' ? purged.sessions_deleted : 0,
    },
    { status: 200, headers: { 'X-Request-ID': requestId, ...NO_STORE } }
  )
}
