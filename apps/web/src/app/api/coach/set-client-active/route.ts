import 'server-only'

// HESAP AKTİF/PASİF DURUMU — koç danışanı pasifleştirir/yeniden aktifleştirir (Faz 4.10).
//
// Karar kaydı : Fable kararı (agent talimatı, 2026-08-20), ADR-0026 kardeş kapı
// Veritabanı  : supabase/migrations/20260820180000_account_active_state.sql
// Kanıt       : supabase/tests/rls.test.sql senaryo 149–152,
//               apps/web/tests/unit/set-client-active.test.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// EMSAL: DAVET UCU (`../invite-client/route.ts`) — AYNI DİSİPLİN
// ─────────────────────────────────────────────────────────────────────────────
// Bu uç, davet ucunun yetkilendirme iskeletini BİREBİR izler:
//   1) KİMLİK — `Authorization: Bearer` (cookie DEĞİL; CSRF yüzeyi açmamak için,
//      `account/delete` ile aynı gerekçe).
//   2) ROL — `is_coach(coachId)` SUNUCUDA, doğrulanmış token'dan gelen `coachId`
//      ile (gövdeye güvenilmez).
//   3) aal2 — AÇIK, FAIL-CLOSED. Bu uçta da davet ucundaki gibi DOĞAL bir kapı
//      YOKTUR: `set_client_active_state` `service_role` ile çağrılır
//      (`rolbypassrls`), `is_coach()` SECURITY DEFINER'dır ve RLS'i bypass eder.
//      Açık bir kontrol olmasaydı, çalınmış bir parola (aal1) TEK BAŞINA bir
//      danışanı pasifleştirip verisine erişimini kesebilirdi. Kontrol
//      davet ucundaki `readAalClaim` deseninin AYNISIDIR.
//   4) HIZ SINIRI — davet/şifre-sıfırlama iki-kova deseni.
//   5) SERVICE ROLE — `set_client_active_state` RPC'si (SECURITY DEFINER,
//      EXECUTE yalnız `service_role`). RPC fail-closed olarak ÖNCE denetim
//      satırını (`client_deactivated`/`client_reactivated`) yazar, SONRA
//      `is_active`i günceller (bkz. migration §6).
//
// KOÇ KİMLİĞİ RPC'YE PARAMETRE OLARAK GEÇİLMEZ: `service_role` bağlamında
// `auth.uid()` NULL'dır, ve RPC actor'ı tek-koçluk invaryantından türetir
// (migration §6). Route yalnızca hedef `client_id` + `active` gönderir.
//
// ─────────────────────────────────────────────────────────────────────────────
// GERİ DÖNÜŞÜ OLAN İŞLEM — TEK ONAY
// ─────────────────────────────────────────────────────────────────────────────
// Pasifleştirme/yeniden aktifleştirme GERİ ALINABİLİR (koç istediğinde tersine
// çevirir), bu yüzden hesap silme gibi "yazarak doğrulama" gerektirmez; arayüz
// tek bir onay adımıyla yeter (bkz. CoachUserManagement).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { clientEnv } from '@/env'
import { getServerEnv } from '@/env.server'
import { errorResponse, logSecurityEvent } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@repo/types'
import { formatZodError } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_AUTHENTICATED_MESSAGE = 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
const FORBIDDEN_MESSAGE = 'Bu işlem için koç yetkisi gerekir.'
const MFA_REQUIRED_MESSAGE =
  'Danışan durumunu değiştirmek için oturumunuzun iki adımlı doğrulamadan geçmiş olması gerekir.'
const CLIENT_NOT_FOUND_MESSAGE = 'Danışan bulunamadı.'
const STATE_FAILED_MESSAGE = 'Danışan durumu güncellenemedi. Lütfen tekrar deneyin.'
const AUDIT_UNAVAILABLE_MESSAGE =
  'Bu işlem şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'

// ---------------------------------------------------------------------------
// GÖVDE ŞEMASI — `.strict()` (davet ucuyla aynı disiplin: bilinmeyen alan 422).
// ---------------------------------------------------------------------------
const bodySchema = z
  .object({
    client_id: z.string({ required_error: 'Danışan kimliği zorunludur.' }).uuid({
      message: 'Geçersiz danışan kimliği.',
    }),
    active: z.boolean({ required_error: 'Durum bilgisi zorunludur.' }),
  })
  .strict()

// ---------------------------------------------------------------------------
// HIZ SINIRI — iki kova (şifre-sıfırlama deseni). Bu eylem nadir ve geri
// alınabilirdir; eşikler makul:
//   * (koç, hedef danışan) çifti — aynı danışanı kısa sürede tekrar tekrar
//     değiştirmeyi (çift tıklama dahil) engeller.
//   * koç geneli — koç hesabı ele geçirilirse toplu pasifleştirmeyi sınırlar.
// ---------------------------------------------------------------------------
const TARGET_LIMIT = 5
const COACH_LIMIT = 30
const WINDOW_MS = 60 * 60_000

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

/**
 * DOĞRULANMIŞ bir access token'ın `aal` claim'ini okur (davet ucuyla AYNI).
 *
 * ÖN KOŞUL: çağıran token'ı `auth.getUser(token)` ile ZATEN doğrulatmış olmalı.
 * İmza doğrulaması YAPILMAZ. Çözümlenemeyen her durumda `null` (fail-closed).
 */
function readAalClaim(accessToken: string): string | null {
  const segments = accessToken.split('.')
  if (segments.length !== 3) return null
  const payload = segments[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = Buffer.from(normalized, 'base64').toString('utf8')
    const claims: unknown = JSON.parse(decoded)
    if (typeof claims !== 'object' || claims === null) return null
    const aal = (claims as Record<string, unknown>).aal
    return typeof aal === 'string' ? aal : null
  } catch {
    return null
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // 1) KİMLİK
  const authHeader = request.headers.get('authorization')
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!accessToken) {
    log.warn({ event: 'coach_set_active_unauthenticated' }, 'Aktiflik: Authorization eksik')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    log.warn({ event: 'coach_set_active_invalid_session' }, 'Aktiflik: geçersiz oturum')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const coachId = userData.user.id

  // 2) ROL — sunucuda, doğrulanmış `coachId` ile.
  const { data: isCoach, error: roleError } = await authClient.rpc('is_coach', { uid: coachId })

  if (roleError || !isCoach) {
    log.warn(
      { event: 'coach_set_active_forbidden', err: roleError?.message },
      'Aktiflik: yetkisiz çağrı (rol coach değil)'
    )
    return errorResponse(403, 'FORBIDDEN', FORBIDDEN_MESSAGE, requestId)
  }

  // 3) aal2 — AÇIK KAPI, FAIL-CLOSED (dosya başı "aal2" bloğu).
  const aal = readAalClaim(accessToken)
  if (aal !== 'aal2') {
    log.warn(
      { event: 'coach_set_active_mfa_required', coachId, aal: aal ?? 'missing' },
      'Aktiflik: oturum aal2 değil — REDDEDİLDİ'
    )
    return errorResponse(403, 'MFA_REQUIRED', MFA_REQUIRED_MESSAGE, requestId)
  }

  // 4) GÖVDE
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Gönderilen bilgiler geçersiz. Lütfen alanları kontrol edin.',
      requestId,
      formatZodError(parsed.error)
    )
  }
  const { client_id: clientId, active } = parsed.data

  // 5) HIZ SINIRI — Supabase'e/DB'ye gitmeden ÖNCE.
  const targetResult = checkRateLimit(`coach-set-active-target:${coachId}:${clientId}`, {
    limit: TARGET_LIMIT,
    windowMs: WINDOW_MS,
  })
  if (!targetResult.success) {
    log.warn(
      { event: 'coach_set_active_rate_limited', blockedBy: 'target', coachId, clientId },
      'Aktiflik: hedef danışan hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'SET_ACTIVE_RATE_LIMIT_EXCEEDED',
      'Bu danışan için çok kısa sürede tekrar durum değişikliği istendi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(targetResult.resetAt)) }
    )
  }

  const coachResult = checkRateLimit(`coach-set-active-coach:${coachId}`, {
    limit: COACH_LIMIT,
    windowMs: WINDOW_MS,
  })
  if (!coachResult.success) {
    log.warn(
      { event: 'coach_set_active_rate_limited', blockedBy: 'coach', coachId },
      'Aktiflik: koç geneli hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'SET_ACTIVE_RATE_LIMIT_EXCEEDED',
      'Çok fazla durum değişikliği istendi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(coachResult.resetAt)) }
    )
  }

  // 6) SERVICE ROLE — anahtar yoksa fail-closed 503 (ADR-0025 disiplini).
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    log.error(
      { event: 'coach_set_active_audit_unconfigured' },
      'Aktiflik: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
    )
    return errorResponse(
      503,
      'COACH_ACTION_AUDIT_UNAVAILABLE',
      AUDIT_UNAVAILABLE_MESSAGE,
      requestId
    )
  }

  const admin = createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // 7) RPC — denetim ÖNCE, is_active SONRA (fail-closed, migration §6 içinde).
  //    RPC hedefin gerçekten bir danışan olduğunu (`role='client'`) DOĞRULAR;
  //    değilse `42501` fırlatır -> 404'e eşlenir (koç/var-olmayan hedef).
  const { error: rpcError } = await admin.rpc('set_client_active_state', {
    p_client_id: clientId,
    p_active: active,
    p_request_id: requestId,
  })

  if (rpcError) {
    // Hedef danışan değil / bulunamadı -> 404 (koça sızıntı yapmayan mesaj).
    if (rpcError.code === '42501' || rpcError.code === 'P0002') {
      log.warn(
        { event: 'coach_set_active_target_invalid', coachId, clientId, err: rpcError.message },
        'Aktiflik: hedef geçersiz (danışan değil / bulunamadı)'
      )
      return errorResponse(404, 'CLIENT_NOT_FOUND', CLIENT_NOT_FOUND_MESSAGE, requestId)
    }
    log.error(
      { event: 'coach_set_active_failed', coachId, clientId, err: rpcError.message },
      'Aktiflik: RPC reddetti'
    )
    return errorResponse(500, 'SET_ACTIVE_FAILED', STATE_FAILED_MESSAGE, requestId)
  }

  // 8) GEÇİCİ LOG — kalıcı/sorgulanabilir kayıt zaten (7)'de coach_actions'a yazıldı.
  logSecurityEvent('coach_set_client_active_state', {
    requestId,
    coachId,
    clientId,
    active,
  })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
    }
  )
}
