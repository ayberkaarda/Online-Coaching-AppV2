import 'server-only'

// KOÇ TETİKLEMELİ ŞİFRE SIFIRLAMA (Faz 4.7 dilim 3).
//
// ─────────────────────────────────────────────────────────────────────────────
// KARAR: `generateLink` DEĞİL, `resetPasswordForEmail` — GEREKÇE
// ─────────────────────────────────────────────────────────────────────────────
// İki yol değerlendirildi:
//   (a) `supabase.auth.admin.generateLink({ type: 'recovery', email })` — service_role
//       gerektirir, bağlantıyı YANITTA DÖNDÜRÜR (`data.properties.action_link`); e-postayı
//       BİZ göndermek zorunda kalırdık (nodemailer vb.) — görev açıkça bunu YASAKLIYOR.
//       Bağlantı bir kere sunucu belleğine/yanıtına girdiği için "koç asla görmez" iddiası
//       kod incelemesine ve loglamaya bağımlı hale gelir (daha kırılgan garanti).
//   (b) `supabase.auth.resetPasswordForEmail(email, { redirectTo })` — GoTrueClient'ın
//       PUBLIC (anon key yeterli) uç noktasıdır. `@supabase/auth-js` TİP TANIMI
//       (`GoTrueClient.d.ts`) dönüş tipini AÇIKÇA `Promise<{ data: {}; error: null } |
//       { data: null; error: AuthError }>` olarak beyan eder — `data` YAPISAL OLARAK boş
//       bir nesnedir, bağlantı/token hiçbir alanda YER ALMAZ. E-postayı Supabase kendi
//       SMTP'siyle gönderir. Bu, "bağlantı hiçbir zaman uygulama sunucusundan geçmiyor"
//       iddiasını TİP SİSTEMİYLE kanıtlanabilir kılar; yalnızca disipline değil derleyiciye
//       de dayanır.
// SEÇİM: (b). Aşağıdaki `anonClient.auth.resetPasswordForEmail(...)` çağrısının dönüş
// değeri asla loglanmaz/yanıta konmaz (zaten yapısal olarak koyacak bir şeyi yoktur).
//
// ─────────────────────────────────────────────────────────────────────────────
// YETKİLENDİRME KATMANLARI
// ─────────────────────────────────────────────────────────────────────────────
//   1) KİMLİK — `Authorization: Bearer <token>` (cookie DEĞİL; `account/delete/route.ts`
//      ile AYNI gerekçe: cookie yalnızca depolama ortamıdır, CSRF yüzeyi açar).
//   2) ROL — istemciden gelen hiçbir alana güvenilmez; `public.is_coach(uid)` RPC'si
//      (SECURITY DEFINER, `profiles.role` okur) doğrulanmış `coachId` ile SUNUCUDA çağrılır.
//   3) HEDEF — `clientId` yalnızca bir UUID'dir; danışanın e-postası koçun KENDİ RLS
//      bağlamındaki `profiles` sorgusuyla (`profiles_select`: `id = auth.uid() or
//      is_coach()`) okunur ve `role = 'client'` doğrulanır. Bugün (B-058 borcu) koç-danışan
//      ATAMA TABLOSU YOK, yani her koç RLS altında TÜM danışan profillerini görebiliyor —
//      bu satır o gerçeği DEĞİŞTİRMEZ, yalnızca kabul eder. Atama tablosu geldiğinde
//      SIKILAŞTIRMA TEK YERDE yapılır: aşağıdaki `.eq('id', clientId)` sorgusuna
//      `.eq('coach_id', coachId)` (ya da eşdeğeri) eklemek yeterli olur — üstteki yorum bunu
//      işaretler.
//   4) HIZ SINIRI — bkz. aşağıdaki blok. Bu uç kötüye kullanılırsa danışana e-posta
//      bombardımanı olur; `auth-rate-limit.ts`'teki (koç, hedef) çiftine benzer bir desen.
//   5) DENETİM — İKİ TAMAMLAYICI KATMAN (Faz 4.7):
//      a) KALICI, SORGULANABİLİR — `public.coach_actions` (bkz.
//         `supabase/migrations/20260819130000_coach_action_audit.sql`). Yazma
//         `record_coach_action()` SECURITY DEFINER fonksiyonu üzerinden, SERVICE ROLE
//         istemcisiyle yapılır ve — KRİTİK — Supabase'e gönderilmeden ÖNCE, fail-closed
//         olarak. Gerekçe: iz bırakmadan yapılan bir müdahale, hiç yapılamayan bir
//         müdahaleden DAHA KÖTÜDÜR (KVKK m.12 hesap verebilirliği). Bu yüzden denetim
//         satırı yazılamazsa sıfırlama e-postası HİÇ TETİKLENMEZ, istek 500 ile döner.
//      b) GEÇİCİ, LOG ARŞİVİ — `logSecurityEvent` (bkz. `@/lib/api/response.ts`) ile
//         `coach_id`/`client_id` + `requestId` yazılır. (a)'nın YERİNE değil,
//         TAMAMLAYICISI olarak kalır — sunucu logunda hızlı arama için.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { clientEnv } from '@/env'
import { getServerEnv } from '@/env.server'
import { maskEmailForLog } from '@/lib/api/auth-rate-limit'
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
const CLIENT_NOT_FOUND_MESSAGE = 'Danışan bulunamadı.'
const RESET_FAILED_MESSAGE = 'Sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.'
const AUDIT_UNAVAILABLE_MESSAGE =
  'Bu işlem şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
const AUDIT_WRITE_FAILED_MESSAGE = 'Sıfırlama işlemi gerçekleştirilemedi. Lütfen tekrar deneyin.'

const bodySchema = z.object({
  clientId: z.string({ required_error: 'Danışan kimliği zorunludur.' }).uuid({
    message: 'Geçersiz danışan kimliği.',
  }),
})

// ---------------------------------------------------------------------------
// Hız sınırı — iki kova (`auth-rate-limit.ts`teki e-posta+IP desenine benzer):
//   * (koç, hedef danışan) çifti — AYNI danışana kısa sürede tekrar tekrar tetiklemeyi
//     engeller (yanlışlıkla çift tıklama dahil).
//   * koç geneli — bir koç hesabı ele geçirilirse/kötüye kullanılırsa TÜM danışan
//     tabanına e-posta bombardımanını sınırlar.
// Pencere 1 saat: şifre sıfırlama nadir bir işlemdir, meşru bir koç bu eşiklere
// pratikte hiç değmez.
// ---------------------------------------------------------------------------

const TARGET_LIMIT = 3
const COACH_LIMIT = 20
const WINDOW_MS = 60 * 60_000

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // 1) KİMLİK
  const authHeader = request.headers.get('authorization')
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!accessToken) {
    log.warn({ event: 'coach_reset_unauthenticated' }, 'Koç şifre sıfırlama: Authorization eksik')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  // Koçun KENDİ token'ıyla bağlı istemci: RLS altında çalışır, `profiles` sorgusu ve
  // `is_coach` RPC'si bu kimlikle değerlendirilir.
  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    log.warn({ event: 'coach_reset_invalid_session' }, 'Koç şifre sıfırlama: geçersiz oturum')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const coachId = userData.user.id

  // 2) GÖVDE
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
  const { clientId } = parsed.data

  // 3) ROL — istemciden gelen HİÇBİR ŞEYE güvenilmez; `profiles.role` sunucuda okunur.
  // `is_coach` SECURITY DEFINER'dır (bkz. supabase/migrations/20260817090000_rename_roles.sql),
  // yani RLS özyinelemesi olmadan güvenle çağrılabilir. `uid` AÇIKÇA `coachId` (doğrulanmış
  // token'dan) verilir — RPC'nin varsayılanına (`auth.uid()`) örtük güvenmek yerine.
  const { data: isCoach, error: roleError } = await authClient.rpc('is_coach', { uid: coachId })

  if (roleError || !isCoach) {
    log.warn(
      { event: 'coach_reset_forbidden', err: roleError?.message },
      'Koç şifre sıfırlama: yetkisiz çağrı (rol coach değil)'
    )
    return errorResponse(403, 'FORBIDDEN', FORBIDDEN_MESSAGE, requestId)
  }

  // 4) HIZ SINIRI — Supabase'e/DB'ye gitmeden ÖNCE reddedilir.
  const targetKey = `coach-reset-target:${coachId}:${clientId}`
  const coachKey = `coach-reset-coach:${coachId}`

  const targetResult = checkRateLimit(targetKey, { limit: TARGET_LIMIT, windowMs: WINDOW_MS })
  if (!targetResult.success) {
    log.warn(
      { event: 'coach_reset_rate_limited', blockedBy: 'target', coachId, clientId },
      'Koç şifre sıfırlama: hedef danışan hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'RESET_RATE_LIMIT_EXCEEDED',
      'Bu danışan için çok kısa sürede tekrar sıfırlama isteği gönderildi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(targetResult.resetAt)) }
    )
  }

  const coachResult = checkRateLimit(coachKey, { limit: COACH_LIMIT, windowMs: WINDOW_MS })
  if (!coachResult.success) {
    log.warn(
      { event: 'coach_reset_rate_limited', blockedBy: 'coach', coachId },
      'Koç şifre sıfırlama: koç geneli hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'RESET_RATE_LIMIT_EXCEEDED',
      'Çok fazla sıfırlama isteği gönderildi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(coachResult.resetAt)) }
    )
  }

  // 5) HEDEF DOĞRULAMA — e-posta İSTEMCİDEN ALINMAZ, koçun RLS bağlamında okunur.
  //
  // B-058 NOTU (yukarıdaki dosya başı yorumuna bakın): bugün koç-danışan atama tablosu
  // yok, bu yüzden `profiles_select` politikası altında HER koç HER danışan profilini
  // görebiliyor. Atama tablosu eklendiğinde bu satıra `.eq('coach_id', coachId)` (veya
  // eşdeğer bir join/filtre) eklemek TEK sıkılaştırma noktası olur.
  const { data: targetProfile, error: targetError } = await authClient
    .from('profiles')
    .select('id, role, email')
    .eq('id', clientId)
    .maybeSingle()

  if (targetError || !targetProfile || targetProfile.role !== 'client' || !targetProfile.email) {
    log.warn(
      { event: 'coach_reset_target_not_found', coachId, clientId, err: targetError?.message },
      'Koç şifre sıfırlama: hedef danışan bulunamadı/geçersiz'
    )
    return errorResponse(404, 'CLIENT_NOT_FOUND', CLIENT_NOT_FOUND_MESSAGE, requestId)
  }

  // 6) KALICI DENETİM SATIRI — SUPABASE'E GÖNDERMEDEN ÖNCE, FAIL-CLOSED
  //
  // ─────────────────────────────────────────────────────────────────────────────
  // SIRA BİLİNÇLİDİR: yazma, e-posta tetiklemeden ÖNCE gelir.
  // ─────────────────────────────────────────────────────────────────────────────
  // KARAR: denetim satırı yazılamazsa sıfırlama İPTAL EDİLİR (e-posta hiç gönderilmez).
  // GEREKÇE: iz BIRAKMADAN yapılan bir müdahale, hiç YAPILAMAYAN bir müdahaleden DAHA
  // KÖTÜDÜR — ikincisi yalnızca bir hizmet kesintisidir (koç tekrar dener), birincisi
  // KVKK m.12 hesap verebilirliğini SESSİZCE delen, sonradan fark edilmesi neredeyse
  // imkânsız bir durumdur. Ters sıra (önce e-posta, sonra "best-effort" denetim)
  // "müdahale oldu ama izi yok" senaryosunu MÜMKÜN kılardı; bu sıra onu YAPISAL olarak
  // kapatır — e-posta adımına hiç ulaşılmaz.
  //
  // SERVICE ROLE: `coach_actions` tablosu sıfır-politikalıdır (bkz. migration §1),
  // koçun KENDİ RLS bağlamındaki `authClient` ile yazılamaz. `account/delete/route.ts`
  // ile AYNI desen: anahtar yalnızca `getServerEnv()` üzerinden okunur, hiçbir log/hata
  // gövdesine yazılmaz.
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    log.error(
      { event: 'coach_reset_audit_unconfigured' },
      'Koç şifre sıfırlama: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
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

  const { error: auditError } = await admin.rpc('record_coach_action', {
    p_action: 'password_reset_requested',
    p_actor_id: coachId,
    p_target_id: clientId,
    p_request_id: requestId,
  })

  if (auditError) {
    log.error(
      { event: 'coach_reset_audit_failed', coachId, clientId, err: auditError.message },
      'Koç şifre sıfırlama: denetim satırı yazılamadı — sıfırlama İPTAL edildi'
    )
    return errorResponse(500, 'COACH_ACTION_AUDIT_FAILED', AUDIT_WRITE_FAILED_MESSAGE, requestId)
  }

  // 7) SUPABASE'E GÖNDER — anon-key'li, kimliksiz bir istemci yeterlidir (`resetPasswordForEmail`
  // PUBLIC bir GoTrue uç noktasıdır). `redirectTo` Supabase panelindeki "Redirect URLs"
  // allowlist'inde OLMAK ZORUNDADIR (yerelde `http://localhost:3000/reset-password`) — bkz.
  // bu dilimin agent raporu.
  const redirectTo = `${clientEnv.NEXT_PUBLIC_APP_URL}/reset-password`
  const anonClient = createServerSupabaseClient()
  const { error: resetError } = await anonClient.auth.resetPasswordForEmail(targetProfile.email, {
    redirectTo,
  })

  if (resetError) {
    log.error(
      { event: 'coach_reset_failed', coachId, clientId, err: resetError.message },
      'Koç şifre sıfırlama: Supabase reddetti'
    )
    return errorResponse(502, 'PASSWORD_RESET_FAILED', RESET_FAILED_MESSAGE, requestId)
  }

  // 8) GEÇİCİ LOG — (6)'nın YERİNE değil TAMAMLAYICISI. Sunucu logunda hızlı arama için;
  // kalıcı/sorgulanabilir kayıt zaten (6)'da `coach_actions`e yazıldı. Tam e-posta BİLEREK
  // loglanmaz (yalnızca maskelenmiş biçimi) — `auth-rate-limit.ts`teki `maskEmailForLog`
  // ile AYNI disiplin.
  logSecurityEvent('coach_triggered_password_reset', {
    requestId,
    coachId,
    clientId,
    clientEmailMasked: maskEmailForLog(targetProfile.email),
  })

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
    }
  )
}
