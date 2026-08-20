import 'server-only'

// DANIŞAN DAVETİ (Faz 4.9 dilim 1).
//
// Karar kaydı : docs/adr/0027-danisan-daveti.md
// Veritabanı  : supabase/migrations/20260820160000_coach_invite_action.sql
// Kanıt       : supabase/tests/rls.test.sql senaryo 145,
//               apps/web/tests/unit/invite-client.test.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// KARAR: `admin.inviteUserByEmail` — REDDEDİLEN ÜÇ ALTERNATİF
// ─────────────────────────────────────────────────────────────────────────────
//   (a) `admin.createUser({ email, password })` + geçici şifre — REDDEDİLDİ:
//       koç şifreyi GÖRÜR. Koç-danışan ilişkisindeki güç dengesizliği
//       düşünüldüğünde bu, koçun danışan olarak giriş yapabilmesi demektir;
//       danışanın kendi verisi üzerindeki tek gizliliği ortadan kalkar.
//   (b) `admin.generateLink({ type: 'invite' })` — REDDEDİLDİ: bağlantıyı
//       YANITTA döndürür (`data.properties.action_link`) ve e-postayı BİZ
//       göndermek zorunda kalırdık. "Koç bağlantıyı asla görmez" iddiası tip
//       sistemine değil kod incelemesi + loglama disiplinine bağımlı hale
//       gelirdi. AYNI seçenek AYNI gerekçeyle `../reset-client-password/
//       route.ts` satır 9-13'te ZATEN reddedilmişti; bu dosya o emsali sürdürür.
//   (c) Self-servis kayıt (`enable_signup = true`) — REDDEDİLDİ:
//       `supabase/config.toml`'daki `enable_signup = false` BİLİNÇLİ bir
//       karardır (tek-koçluk model, ADR-0007). Açmak ürün modelini değiştirir.
//
//   SEÇİLEN: `admin.inviteUserByEmail(email, { data, redirectTo })`. Dönüş tipi
//   `UserResponse`tur — `action_link` diye bir alanı YOKTUR; bağlantı sunucu
//   yanıtına/belleğine HİÇ GİRMEZ, e-postayı Supabase kendi SMTP'siyle gönderir
//   ve danışan şifresini KENDİ belirler. Yani "bağlantı koçtan geçmiyor"
//   iddiası, uç #5'teki gibi, TİP SEVİYESİNDE doğrudur.
//
// ─────────────────────────────────────────────────────────────────────────────
// ROL GARANTİSİ BU DOSYADAN GELMEZ — TETİKLEYİCİDEN GELİR
// ─────────────────────────────────────────────────────────────────────────────
//   `on_auth_user_created` -> `public.handle_new_user()` (bkz.
//   `supabase/migrations/20260817160100_signup_role_hardening.sql`) yeni
//   profilin rolünü KOŞULSUZ `'client'` yazar; `raw_user_meta_data ->> 'role'`
//   alanını OKUMAZ BİLE (AC-02). Yani davetle doğan bir kullanıcının koç
//   OLAMAMASI, bu route'un disiplinli davranmasına DEĞİL, veritabanı
//   tetikleyicisinin YAPISINA dayanır.
//
//   Buna rağmen üç kat savunma vardır:
//     1) zod şeması `.strict()`tir ve `role` diye bir alan İÇERMEZ -> gövdeye
//        `role` konursa istek 422 ile reddedilir (sessizce yok sayılmaz).
//     2) Aşağıdaki `data` nesnesine yalnızca `full_name` konur.
//     3) Tetikleyici, ilk ikisi bir gün delinse bile rolü yine `'client'` yazar.
//   ASIL garanti (3)'tür; (1) ve (2) yalnızca gürültülü erken uyarıdır. Bu
//   iddia `rls.test.sql` senaryo 145'te — metadata'ya BİLEREK `role: coach`
//   konarak — ÖLÇÜLÜR.
//
// ─────────────────────────────────────────────────────────────────────────────
// KRİTİK: `aal2` BURADA AÇIKÇA DOĞRULANIR — "TESADÜFİ KORUMA" ANALİZİ
// ─────────────────────────────────────────────────────────────────────────────
//   `reset-client-password` ucundaki MFA koruması TESADÜFİDİR: o uç hedef
//   danışanın profilini KOÇUN KENDİ RLS bağlamında okur ve `mfa_aal2_gate`
//   RESTRICTIVE politikası (ADR-0026) `profiles` tablosunu DA kapsar — yani
//   aal1'deki koç 0 satır görür ve doğal olarak 404'e takılır. Kapı orada
//   niyetle değil, akışın şekliyle kapanır.
//
//   BU UÇTA O DOĞAL KAPI YOKTUR:
//     * Hedef HENÜZ VAR DEĞİLDİR — okunacak, dolayısıyla RLS'in reddedeceği bir
//       satır yoktur.
//     * `is_coach()` SECURITY DEFINER'dır ve RLS'i BYPASS eder; aal1'deki bir
//       koç için de `true` döner.
//     * `inviteUserByEmail` `service_role` ile çağrılır — `service_role`
//       `rolbypassrls`tir, hiçbir politika ona uygulanmaz.
//   Yani açık bir kontrol OLMASAYDI, çalınmış bir parola TEK BAŞINA sisteme
//   yeni kullanıcı yaratmaya (ve bir yabancıya "koçunuz sizi davet etti"
//   e-postası göndertmeye) yeterdi.
//
//   NASIL: `getUser()` token'ın GERÇEKLİĞİNİ GoTrue'ya doğrulattıktan SONRA,
//   AYNI dizenin payload'ı çözülür ve `aal` claim'i okunur. Çözümleme
//   imzasız/keyfi bir girdi üzerinde YAPILMAZ — token'ın imzası bir adım önce
//   auth sunucusu tarafından kanıtlanmıştır. Claim yoksa, çözümleme
//   başarısızsa veya değer `aal2` değilse -> 403, FAIL-CLOSED.

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
const MFA_REQUIRED_MESSAGE =
  'Danışan davet etmek için oturumunuzun iki adımlı doğrulamadan geçmiş olması gerekir.'
const EMAIL_TAKEN_MESSAGE = 'Bu e-posta adresi zaten kayıtlı. Danışan listenizden kontrol edin.'
const INVITE_FAILED_MESSAGE = 'Davet gönderilemedi. Lütfen tekrar deneyin.'
const AUDIT_UNAVAILABLE_MESSAGE =
  'Bu işlem şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
const AUDIT_WRITE_FAILED_MESSAGE = 'Davet gerçekleştirilemedi. Lütfen tekrar deneyin.'

// ---------------------------------------------------------------------------
// GÖVDE ŞEMASI — `.strict()`
//
// `role` alanı BİLEREK YOKTUR (yukarıdaki "ROL GARANTİSİ" bloğu). `.strict()`
// sayesinde gövdeye `role` (ya da başka bir bilinmeyen alan) konursa istek
// SESSİZCE yok sayılmaz, 422 ile GÜRÜLTÜLÜ reddedilir — birinin metadata
// üzerinden rol geçirmeye çalıştığı loglarda görünür.
// ---------------------------------------------------------------------------
const bodySchema = z
  .object({
    email: z
      .string({ required_error: 'E-posta adresi zorunludur.' })
      .trim()
      .toLowerCase()
      .email({ message: 'Geçerli bir e-posta adresi girin.' })
      .max(254, { message: 'E-posta adresi çok uzun.' }),
    full_name: z
      .string()
      .trim()
      .max(120, { message: 'Ad soyad en fazla 120 karakter olabilir.' })
      .optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// HIZ SINIRI — iki kova (`reset-client-password` deseninin AYNISI, farklı eşik).
//
// Davet ŞİFRE SIFIRLAMADAN daha nadir ve daha KALICI bir eylemdir: sisteme yeni
// bir kullanıcı YARATIR ve geri alınamaz. Bu yüzden eşikler daha sıkı:
//   * (koç, hedef e-posta) çifti — 2 / 24 saat. Yanlışlıkla çift tıklama ve
//     "aynı adrese davet bombardımanı" kapanır; meşru bir tekrar denemeye
//     (ilk e-posta spam'a düştü) yer bırakır.
//   * koç geneli — 10 / saat. Koç hesabı ele geçirilirse toplu kullanıcı
//     üretimini sınırlar.
// NOT: yerel GoTrue'nun kendi `email_sent` global sınırı (2/saat) BUNUN ÜSTÜNE
// gelir ve davetleri de sayar — e-posta testi bu yüzden veritabanı sonuçlarıyla
// yapılır, gerçek gönderimle değil (ADR-0027 §Bedeller).
// ---------------------------------------------------------------------------
const TARGET_LIMIT = 2
const TARGET_WINDOW_MS = 24 * 60 * 60_000
const COACH_LIMIT = 10
const COACH_WINDOW_MS = 60 * 60_000

function retryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

/**
 * DOĞRULANMIŞ bir access token'ın `aal` claim'ini okur.
 *
 * ÖN KOŞUL: çağıran, bu token'ı `auth.getUser(token)` ile GoTrue'ya ZATEN
 * doğrulatmış olmalıdır. Bu fonksiyon imza doğrulaması YAPMAZ ve yapmamalıdır —
 * tek işi, gerçekliği kanıtlanmış bir dizenin payload'ından tek bir alanı
 * çıkarmaktır. Çözümlenemeyen her durumda `null` döner (fail-closed; çağıran
 * `null`u REDDETMEK zorundadır).
 */
function readAalClaim(accessToken: string): string | null {
  const segments = accessToken.split('.')
  if (segments.length !== 3) return null

  const payload = segments[1]
  if (!payload) return null

  try {
    // base64url -> base64 (JWT payload'ı base64url'dir; `Buffer`'ın 'base64url'
    // kodlaması Node 16+'da mevcut, ama açık dönüşüm daha taşınabilir).
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

/**
 * GoTrue'nun "bu e-posta zaten kayıtlı" cevabını tanır.
 *
 * Sürüm boyunca üç ayrı işaret kullanıldı (`code`, HTTP durumu, mesaj metni);
 * ÜÇÜ DE kontrol edilir. Tanıyamazsak 409'a DÜŞMEYİZ — genel 502'ye düşeriz,
 * yani "zaten kayıtlı" iddiası ancak GERÇEKTEN öyleyse üretilir.
 */
function isEmailAlreadyRegistered(error: {
  code?: string
  status?: number
  message: string
}): boolean {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true
  if (/already\s+(been\s+)?registered/i.test(error.message)) return true
  if (/already\s+exists/i.test(error.message)) return true
  return false
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // 1) KİMLİK — `Authorization: Bearer` (cookie DEĞİL; `account/delete/route.ts`
  //    ve `reset-client-password` ile AYNI gerekçe: cookie yalnızca depolama
  //    ortamıdır, kimlik ortamı değildir ve CSRF yüzeyi açar).
  const authHeader = request.headers.get('authorization')
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!accessToken) {
    log.warn({ event: 'coach_invite_unauthenticated' }, 'Danışan daveti: Authorization eksik')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    log.warn({ event: 'coach_invite_invalid_session' }, 'Danışan daveti: geçersiz oturum')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const coachId = userData.user.id

  // 2) ROL — istemciden gelen HİÇBİR ŞEYE güvenilmez; `profiles.role` SUNUCUDA
  //    okunur. `is_coach` SECURITY DEFINER'dır; `uid` AÇIKÇA verilir (RPC'nin
  //    `auth.uid()` varsayılanına örtük güvenmek yerine).
  const { data: isCoach, error: roleError } = await authClient.rpc('is_coach', { uid: coachId })

  if (roleError || !isCoach) {
    log.warn(
      { event: 'coach_invite_forbidden', err: roleError?.message },
      'Danışan daveti: yetkisiz çağrı (rol coach değil)'
    )
    return errorResponse(403, 'FORBIDDEN', FORBIDDEN_MESSAGE, requestId)
  }

  // 3) aal2 — AÇIK KAPI, FAIL-CLOSED. (Dosya başındaki "TESADÜFİ KORUMA"
  //    bloğu bu kontrolün neden zorunlu olduğunu anlatır: bu uçta hedef henüz
  //    yok, `is_coach()` RLS'i bypass ediyor ve davet `service_role` ile
  //    yapılıyor — `mfa_aal2_gate` politikası bu akışın HİÇBİR adımına
  //    değmiyor.)
  const aal = readAalClaim(accessToken)
  if (aal !== 'aal2') {
    log.warn(
      { event: 'coach_invite_mfa_required', coachId, aal: aal ?? 'missing' },
      'Danışan daveti: oturum aal2 değil — REDDEDİLDİ'
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
  const { email, full_name: fullName } = parsed.data

  // 5) HIZ SINIRI — Supabase'e/DB'ye gitmeden ÖNCE reddedilir.
  const targetResult = checkRateLimit(`coach-invite-target:${coachId}:${email}`, {
    limit: TARGET_LIMIT,
    windowMs: TARGET_WINDOW_MS,
  })
  if (!targetResult.success) {
    log.warn(
      { event: 'coach_invite_rate_limited', blockedBy: 'target', coachId },
      'Danışan daveti: hedef e-posta hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'INVITE_RATE_LIMIT_EXCEEDED',
      'Bu e-posta adresine kısa süre içinde zaten davet gönderildi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(targetResult.resetAt)) }
    )
  }

  const coachResult = checkRateLimit(`coach-invite-coach:${coachId}`, {
    limit: COACH_LIMIT,
    windowMs: COACH_WINDOW_MS,
  })
  if (!coachResult.success) {
    log.warn(
      { event: 'coach_invite_rate_limited', blockedBy: 'coach', coachId },
      'Danışan daveti: koç geneli hız sınırına takıldı'
    )
    return errorResponse(
      429,
      'INVITE_RATE_LIMIT_EXCEEDED',
      'Çok fazla davet gönderildi. Lütfen daha sonra tekrar deneyin.',
      requestId,
      undefined,
      { 'Retry-After': String(retryAfterSeconds(coachResult.resetAt)) }
    )
  }

  // 6) E-POSTA ZATEN KAYITLI MI — KOÇA AÇIKÇA SÖYLENİR (409)
  //
  //    ##########################################################################
  //    # ENUMERATION KARARI — VE NEDEN `forgot-password`TAN FARKLI               #
  //    # Burada çağıran: kimliği doğrulanmış, `aal2`de, hız sınırlı ve           #
  //    # `coach_actions`a iz bırakan bir KOÇTUR. Ayrıca `profiles_select`        #
  //    # politikası altında ZATEN tüm danışan profillerini (e-postalar dahil)    #
  //    # görebiliyor (B-058: koç-danışan atama tablosu yok) — yani 409 YENİ      #
  //    # bilgi sızdırmaz, zaten görünen bir gerçeği tekrarlar. Buna karşılık     #
  //    # nötr bir "davet gönderildi" yanıtı koçu YANILTIR: yanlış yazılmış bir   #
  //    # e-posta sessizce kaybolur, koç danışanın gelmemesini "spam'a düşmüş"    #
  //    # sanır.                                                                  #
  //    # KAMUSAL `/forgot-password` akışı NÖTR KALIR ve bu karar ONA             #
  //    # UYGULANMAZ: orada çağıran KİMLİKSİZDİR ve enumeration gerçek bir        #
  //    # tehdittir.                                                              #
  //    ##########################################################################
  //
  //    Ön kontrol KOÇUN KENDİ RLS bağlamında yapılır — `service_role` yüzeyini
  //    büyütmemek için (ADR-0025 §İleriye dönük kural). Kaçırdığı tek durum,
  //    profili olmayan bir `auth.users` satırıdır (tetikleyici o kullanıcıda
  //    başarısız olmuşsa); o durum aşağıda, davet çağrısının KENDİ hatası
  //    üzerinden yine 409'a eşlenir.
  const { data: existingProfile, error: existingError } = await authClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingError) {
    log.error(
      { event: 'coach_invite_precheck_failed', coachId, err: existingError.message },
      'Danışan daveti: e-posta ön kontrolü başarısız'
    )
    return errorResponse(502, 'INVITE_FAILED', INVITE_FAILED_MESSAGE, requestId)
  }

  if (existingProfile) {
    log.warn(
      { event: 'coach_invite_email_taken', coachId, emailMasked: maskEmailForLog(email) },
      'Danışan daveti: e-posta zaten kayıtlı'
    )
    return errorResponse(409, 'EMAIL_ALREADY_REGISTERED', EMAIL_TAKEN_MESSAGE, requestId)
  }

  // 7) SERVICE ROLE — anahtar yoksa fail-closed 503 (ADR-0025 disiplini).
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    log.error(
      { event: 'coach_invite_audit_unconfigured' },
      'Danışan daveti: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
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

  // 8) DENETİM SATIRI — DAVETTEN ÖNCE, FAIL-CLOSED (FAZ 1)
  //
  //    Sıra `reset-client-password` ile AYNIDIR: iz BIRAKMADAN yapılan bir
  //    müdahale, hiç YAPILAMAYAN bir müdahaleden DAHA KÖTÜDÜR (KVKK m.12).
  //    Denetim satırı yazılamazsa davet HİÇ tetiklenmez.
  //
  //    `p_target_id` NULL'dır: davet edilen kullanıcı HENÜZ YOKTUR ve
  //    `coach_actions.target_id` -> `profiles(id)` FK'si var olmayan bir uid'yi
  //    KABUL ETMEZ. Migration 20260820160000 bu tek durum için `NOT NULL`ı
  //    KISMİ bir CHECK'e çevirdi (`target_id is not null or action =
  //    'client_invited'`), yani gevşeme YALNIZCA buraya aittir. Hedef, davet
  //    başarılı olduktan sonra adım 10'da bağlanır.
  //    `p_target_id` argümanı HİÇ GÖNDERİLMEZ (migration ona `default null`
  //    verdi) — üretilen tipte `p_target_id?: string` olduğu için `null`
  //    sokuşturmak adına tip zorlaması yazmak GEREKMEZ.
  const { data: auditId, error: auditError } = await admin.rpc('record_coach_action', {
    p_action: 'client_invited',
    p_actor_id: coachId,
    p_request_id: requestId,
  })

  if (auditError || !auditId) {
    log.error(
      { event: 'coach_invite_audit_failed', coachId, err: auditError?.message },
      'Danışan daveti: denetim satırı yazılamadı — davet İPTAL edildi'
    )
    return errorResponse(500, 'COACH_ACTION_AUDIT_FAILED', AUDIT_WRITE_FAILED_MESSAGE, requestId)
  }

  // 9) DAVET
  //
  //    `redirectTo` Supabase panelindeki "Redirect URLs" allowlist'inde OLMAK
  //    ZORUNDADIR — yerelde `http://localhost:3000/reset-password`. Davet
  //    bağlantısı danışanı doğrudan şifre belirleme sayfasına düşürür.
  //
  //    `data` içine YALNIZCA `full_name` konur. `role` BİLEREK YOKTUR ve
  //    konsaydı bile `handle_new_user()` onu okumazdı (dosya başı bloğu).
  const inviteData: Record<string, string> = {}
  if (fullName) inviteData.full_name = fullName

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: inviteData,
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/reset-password`,
  })

  if (inviteError) {
    // Ön kontrolün kaçırdığı durum (profilsiz `auth.users` satırı / yarış):
    // GoTrue'nun kendi cevabı da 409'a eşlenir.
    if (isEmailAlreadyRegistered(inviteError)) {
      log.warn(
        { event: 'coach_invite_email_taken', coachId, emailMasked: maskEmailForLog(email) },
        'Danışan daveti: e-posta zaten kayıtlı (GoTrue cevabı)'
      )
      return errorResponse(409, 'EMAIL_ALREADY_REGISTERED', EMAIL_TAKEN_MESSAGE, requestId)
    }

    log.error(
      { event: 'coach_invite_failed', coachId, err: inviteError.message },
      'Danışan daveti: Supabase reddetti'
    )
    return errorResponse(502, 'INVITE_FAILED', INVITE_FAILED_MESSAGE, requestId)
  }

  // 10) DENETİM SATIRININ HEDEFİNİ BAĞLA (FAZ 2) — BEST-EFFORT, BİLEREK
  //
  //     Adım 8'in fail-closed'luğunun BURAYA TAŞINMAMASI bilinçlidir: e-posta
  //     çoktan gitti, davet GERİ ALINAMAZ. Burada 500 dönmek koça "davet
  //     gitmedi" dedirtirdi — YANLIŞ ve zararlı bir bilgi (koç tekrar dener,
  //     danışan iki e-posta alır). İz ZATEN vardır (adım 8); kaybolan tek şey
  //     "kime" bağlantısıdır ve o da sunucu logundaki `requestId` ile
  //     kurtarılabilir. Bu bedel ADR-0027 §Bedeller'de kayıtlıdır.
  const invitedUserId = invited?.user?.id
  if (invitedUserId) {
    const { data: linked, error: linkError } = await admin.rpc('link_coach_action_target', {
      p_action_id: auditId,
      p_target_id: invitedUserId,
    })
    if (linkError || linked !== true) {
      log.warn(
        { event: 'coach_invite_audit_link_failed', coachId, auditId, err: linkError?.message },
        'Danışan daveti: denetim satırının hedefi bağlanamadı (iz yerinde, bağlantı eksik)'
      )
    }
  } else {
    log.warn(
      { event: 'coach_invite_no_user_id', coachId, auditId },
      'Danışan daveti: Supabase kullanıcı kimliği döndürmedi — denetim satırı hedefsiz kaldı'
    )
  }

  // 11) GEÇİCİ LOG — adım 8'in YERİNE değil TAMAMLAYICISI. Tam e-posta BİLEREK
  //     loglanmaz (`maskEmailForLog`); bağlantı/token zaten dönüş tipinde YOK.
  logSecurityEvent('coach_invited_client', {
    requestId,
    coachId,
    invitedUserId: invitedUserId ?? null,
    emailMasked: maskEmailForLog(email),
  })

  // YANIT — bağlantı, token, şifre veya davet edilen kullanıcının e-postası
  // DÖNMEZ. `{ ok: true }` (uç #5 ile aynı sözleşme).
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
    }
  )
}
