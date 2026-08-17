// A-01 (güvenlik denetimi — HIGH): sunucu tarafı giriş ucu + kaba kuvvet koruması.
//
// ÖNCESİ: `src/hooks/useSession.ts` doğrudan tarayıcıdan `supabase.auth.signInWithPassword`
// çağırıyordu, yani her giriş denemesi GoTrue'ya doğrudan gidiyordu ve uygulamanın araya
// girebileceği hiçbir nokta yoktu.
//
// NEDEN UYGULAMA KATMANI: `supabase/config.toml`'daki `[auth.rate_limit]` yapılandırması
// konteynere ULAŞIYOR (`GOTRUE_RATE_LIMIT_OTP=30` ile kanıtlandı) ama FİİLEN UYGULANMIYOR —
// aynı IP'den 180 ardışık yanlış şifre → 180/180 HTTP 400, sıfır 429. Doğrulanmış açık
// upstream hatası: github.com/supabase/supabase/issues/41947 (ayar yanlışlıkla
// `rate_limit_otp`'ye yazılıyor; `/token?grant_type=password` korunmuyor). `config.toml`
// yapılandırması KALDIRILMADI — upstream düzelirse ikinci bir savunma katmanı olarak çalışır.
//
// ─────────────────────────────────────────────────────────────────────────────
// KABUL EDİLEN ARTIK RİSK — HEDEFLİ HESAP KİLİTLEME
// ─────────────────────────────────────────────────────────────────────────────
// Hız sınırı anahtarı IP değil, NORMALİZE EDİLMİŞ E-POSTA'dır. Bunun bilinen bedeli: bir
// saldırgan, bildiği bir e-posta adresine 10 hatalı şifre göndererek o hesabı 15 dakikalığına
// kilitleyebilir (targeted account lockout).
//
// Bunu BİLEREK kabul ediyoruz. Alternatif olan IP tabanlı kilit çok daha kötüdür:
// `TRUSTED_PROXY_COUNT` varsayılanı 0 olduğu için (A-02'nin güvenli varsayılanı) hiçbir
// `X-Forwarded-For` başlığına güvenilmez ve TÜM istekler tek bir paylaşılan "unknown" kovasına
// düşer — yani IP üzerinden sınırlarsak tek bir saldırgan 10 denemede TÜM kullanıcıların
// girişini kilitler ve "koruma" doğrudan bir DoS koluna dönüşür.
// Ayrıntılı gerekçe ve ikincil IP kovası kararı: `src/lib/api/auth-rate-limit.ts`.
//
// Kilit kısa (15 dk), kendiliğinden açılır, şifre sıfırlama akışını etkilemez ve kilitli
// hesaba istek yağdırmak pencereyi UZATMAZ (sayaç yalnızca gerçekten denenen — yani limite
// takılmayan — başarısız girişlerde artar; bkz. `peekRateLimit`).

import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  checkLoginQuota,
  clearLoginFailures,
  maskEmailForLog,
  normalizeEmail,
  recordLoginFailure,
} from '@/lib/api/auth-rate-limit'
import { resolveTrustedClientIp } from '@/lib/api/client-ip'
import { errorResponse } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatZodError } from '@/lib/validation/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Giriş gövdesi. `loginSchema`'dan (istemci formu) BİLEREK ayrıdır:
 *   * `password` burada yalnızca "boş olmayan string"tir — sunucu şifre POLİTİKASINI
 *     (uzunluk vb.) sızdırmamalıdır; ayrıca mevcut eski şifreler yeni politikayı sağlamak
 *     zorunda olmadığından uzunluk dayatmak meşru kullanıcıyı kilitler.
 *   * `email` yalnızca biçim olarak doğrulanır.
 */
const signInBodySchema = z.object({
  email: z
    .string({ required_error: 'E-posta zorunludur.' })
    // `.trim()` DOĞRULAMADAN ÖNCE uygulanır: kullanıcının kopyala-yapıştır ile getirdiği
    // baştaki/sondaki boşluk 422'ye yol açmasın ve — daha önemlisi — `"  a@b.com"` ile
    // `"a@b.com"` AYNI hız sınırı kovasına düşsün.
    .trim()
    .min(1, { message: 'E-posta zorunludur.' })
    // NOT: zod'un `.email()` regex'i yerel adda ASCII DIŞI karakter kabul etmez; yani
    // `İbrahim@x.com` gibi bir adres daha hız sınırlayıcıya ULAŞMADAN 422 alır. Bu, istemci
    // formundaki `loginSchema` ile AYNI davranıştır (aynı `.email()` kontrolü), dolayısıyla
    // böyle bir hesap zaten oluşturulamaz. Türkçe normalizasyon riski ASCII girdide de
    // gerçektir ve orada ele alınır (bkz. `normalizeEmail`: `IBRAHIM@x.com` tr-TR locale'inde
    // `ıbrahim@x.com` olurdu → farklı kova → limit atlatılırdı).
    .email({ message: 'Geçerli bir e-posta adresi girin.' }),
  password: z
    .string({ required_error: 'Şifre zorunludur.' })
    .min(1, { message: 'Şifre zorunludur.' }),
})

/**
 * TEK ve JENERİK kimlik doğrulama hatası.
 *
 * Yanlış şifre ile var olmayan hesap AYNI durum kodunu, AYNI kodu ve AYNI mesajı döner —
 * kullanıcı sayımı (user enumeration) yapılamaz. Supabase'in kendi hata metni
 * ("Invalid login credentials", "Email not confirmed", "User not found", ...) istemciye ASLA
 * iletilmez; yalnızca sunucu loguna yazılır.
 *
 * Mesaj Türkçedir ve istemcide olduğu gibi gösterilir (`src/app/login/page.tsx` yalnızca
 * İngilizce "Invalid login credentials" metnini çevirir; artık o yola hiç girilmez).
 */
const GENERIC_AUTH_ERROR_CODE = 'INVALID_CREDENTIALS'
const GENERIC_AUTH_ERROR_MESSAGE = 'E-posta veya şifre hatalı!'

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // 1) Gövdeyi oku
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  // 2) Doğrula
  const parsed = signInBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Gönderilen bilgiler geçersiz. Lütfen alanları kontrol edin.',
      requestId,
      formatZodError(parsed.error)
    )
  }

  // `email` şema tarafından zaten `trim()` edilmiştir.
  const { email, password } = parsed.data
  // Supabase'e HAM (yalnızca trim edilmiş) e-posta gider; normalize edilmiş biçim SADECE
  // hız sınırı anahtarı olarak kullanılır (bkz. `normalizeEmail` doc-comment'i).
  const normalizedEmail = normalizeEmail(email)

  // `null` = güvenilebilir bir istemci IP'si YOK; bu durumda IP kovası bilerek atlanır.
  const clientIp = resolveTrustedClientIp(request.headers)

  // 3) Kota — Supabase'e HİÇ gitmeden reddet (upstream'i de korur)
  const quota = checkLoginQuota(email, clientIp)
  if (!quota.allowed) {
    // A-10: güvenlik olayı — `event` alanı korelasyon anahtarıdır. E-posta TAM olarak
    // loglanmaz, yalnızca maskelenmiş biçimi (bkz. `maskEmailForLog`) yazılır.
    log.warn(
      {
        event: 'auth_login_rate_limited',
        email: maskEmailForLog(normalizedEmail),
        blockedBy: quota.blockedBy,
      },
      'Giriş hız sınırı aşıldı'
    )

    const minutes = Math.ceil(quota.retryAfterSeconds / 60)
    return errorResponse(
      429,
      'LOGIN_RATE_LIMIT_EXCEEDED',
      `Çok fazla başarısız giriş denemesi yapıldı. Güvenliğiniz için bu hesaba giriş geçici ` +
        `olarak durduruldu. Lütfen ${minutes} dakika sonra tekrar deneyin veya şifrenizi ` +
        `sıfırlayın.`,
      requestId,
      undefined,
      { 'Retry-After': String(quota.retryAfterSeconds) }
    )
  }

  // 4) Supabase'e karşı doğrula — ANON key ile (service_role KULLANILMAZ).
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  // 5) Başarısız: sayaçları artır, JENERİK hata dön
  if (error || !data.session) {
    recordLoginFailure(email, clientIp)
    // A-10: güvenlik olayı — TAM e-posta değil, maskelenmiş biçimi loglanır (bkz.
    // `maskEmailForLog`). `err.message` GoTrue'nun ham metnidir; istemciye ASLA gitmez (yalnızca
    // burada, sunucu logunda kalır) — kullanıcı sayımını önlemek için istemci hep JENERİK hata
    // görür (bkz. `GENERIC_AUTH_ERROR_MESSAGE`).
    log.warn(
      { event: 'auth_login_failed', email: maskEmailForLog(normalizedEmail), err: error?.message },
      'Giriş başarısız'
    )
    return errorResponse(401, GENERIC_AUTH_ERROR_CODE, GENERIC_AUTH_ERROR_MESSAGE, requestId)
  }

  // 6) Başarılı: bu e-postanın başarısız deneme sayacı sıfırlanır.
  clearLoginFailures(email)
  log.info({ event: 'login_success', userId: data.session.user.id }, 'Giriş başarılı')

  // İstemci bu token'larla `supabase.auth.setSession(...)` çağırır; mevcut istemci oturum
  // yönetimi (onAuthStateChange, TanStack Query invalidation, realtime abonelikleri) aynen
  // çalışmaya devam eder.
  //
  // A-05 (Grup 5, `@supabase/ssr` httpOnly cookie geçişi) yapıldığında bu gövde BOŞALIR:
  // token'lar JSON yerine `Set-Cookie` ile httpOnly+Secure+SameSite olarak yazılacak ve
  // istemci hiç token görmeyecek. Bu route'un geri kalanı (doğrulama, hız sınırı, jenerik
  // hata) aynen kalır — sadece 6. adımın yanıt şekli değişir.
  return NextResponse.json(
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? null,
    },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
    }
  )
}
