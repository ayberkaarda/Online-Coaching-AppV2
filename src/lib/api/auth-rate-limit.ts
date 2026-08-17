// A-01 (güvenlik denetimi — giriş kaba kuvvet koruması): uygulama katmanı giriş hız sınırı.
//
// NEDEN UYGULAMA KATMANI: `supabase/config.toml` içindeki `[auth.rate_limit]` yapılandırması
// konteynere doğru şekilde ULAŞIYOR (`GOTRUE_RATE_LIMIT_OTP=30` ile kanıtlandı) ama FİİLEN
// UYGULANMIYOR: aynı IP'den 180 ardışık yanlış şifre → 180/180 HTTP 400, sıfır 429. Doğrulanmış
// açık upstream hatası: github.com/supabase/supabase/issues/41947 — ayar yanlışlıkla
// `rate_limit_otp`'ye yazılıyor ve `/token?grant_type=password` fiilen korunmuyor.
// `config.toml`'daki yapılandırma KALDIRILMADI (resmi şema; upstream düzelirse çalışır);
// bu modül onun ÜZERİNE gerçek koruma koyar.
//
// Bu dosya bilinçli olarak `server-only` İÇE AKTARMAZ: saf mantık + bellek içi sayaç, birim
// testlerinden doğrudan çağrılabilsin diye. Yalnızca sunucu tarafı çağıranları vardır.

import { clearRateLimitKey, peekRateLimit, checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Eşikler
// ---------------------------------------------------------------------------

/**
 * E-posta başına izin verilen BAŞARISIZ giriş denemesi. 11. deneme reddedilir.
 * 10 deneme, gerçek bir kullanıcının şifresini hatırlamaya çalışmasına rahatça yeterken
 * (tipik insan 2-4 denemede ya girer ya sıfırlama ister) çevrimiçi sözlük saldırısını
 * pratikte anlamsız kılar: 15 dakikada 10 tahmin = saatte 40 tahmin.
 */
export const LOGIN_FAILURE_LIMIT = 10

/** Sabit pencere: 15 dakika. */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000

/**
 * IKINCIL, IP başına başarısız deneme tavanı. Bilerek ÇOK CÖMERT (bkz. aşağıdaki karar notu).
 * Amacı tek bir hesabı korumak değil — "password spraying" (bin farklı e-postaya bir-iki
 * şifre denemek) saldırısını yakalamak; bu saldırı e-posta başına kovaya asla takılmaz.
 */
export const LOGIN_IP_FAILURE_LIMIT = 300

// ---------------------------------------------------------------------------
// KARAR: birincil anahtar E-POSTA'dır, IP DEĞİLDİR
// ---------------------------------------------------------------------------
//
// `TRUSTED_PROXY_COUNT` varsayılanı 0'dır (A-02'nin güvenli varsayılanı): hiçbir
// `X-Forwarded-For` başlığına güvenilmez, dolayısıyla TÜM istekler tek bir paylaşılan
// "unknown" kovasına düşer. Girişi birincil olarak IP üzerinden sınırlasaydık tek bir
// saldırgan 10 hatalı denemede TÜM kullanıcıların girişini kilitlerdi — koruma diye
// eklediğimiz şey doğrudan bir DoS koluna dönüşürdü.
//
// Bu yüzden:
//   * Birincil kova  : `login:<normalize edilmiş e-posta>` — hedeflenen hesabı korur.
//   * İkincil kova   : `login-ip:<ip>` — YALNIZCA gerçekten bir istemci IP'si çözülebiliyorsa
//                      (yani `TRUSTED_PROXY_COUNT > 0` ve zincirde güvenilir hop varsa)
//                      uygulanır. IP çözülemiyorsa (`null`) bu kova TAMAMEN ATLANIR; aksi
//                      halde paylaşılan "unknown" kovası aynı DoS'u arka kapıdan geri
//                      getirirdi. Bu durumda ikincil savunma `src/proxy.ts`'teki mevcut
//                      `/api/**` sınırıdır (varsayılan 60 istek/dk) — o da paylaşılan bir
//                      kovadır ama pencere 15 dk değil 1 dk olduğu için kalıcı kilit yaratmaz.
//
// KABUL EDİLEN ARTIK RİSK (hedefli hesap kilitleme): bilinen bir e-posta adresine 10 hatalı
// şifre gönderen saldırgan o hesabı 15 dakikalığına kilitleyebilir. Bunu BİLEREK kabul
// ediyoruz — alternatifi olan IP tabanlı kilit, paylaşılan kova gerçeği yüzünden TÜM
// kullanıcıları aynı anda kilitlerdi; yani çok daha kötü. Kilit süresi kısadır, kendiliğinden
// açılır ve şifre sıfırlama akışı etkilenmez.

// ---------------------------------------------------------------------------
// E-posta normalizasyonu
// ---------------------------------------------------------------------------

/**
 * Hız sınırı anahtarı için e-postayı normalize eder.
 *
 * TÜRKÇE TUZAĞI: `String.prototype.toLocaleLowerCase()` ARGÜMANSIZ çağrıldığında HOST
 * locale'ini kullanır. Sunucu `tr-TR` locale'indeyse `'I'.toLocaleLowerCase()` → `'ı'`
 * (noktasız ı) döner; yani `KULLANICI@x.com` Türkçe bir makinede `kullanıcı@x.com`,
 * başka bir makinede `kullanici@x.com` olur. Aynı hesap, ORTAMA GÖRE FARKLI KOVA —
 * saldırgan yalnızca büyük/küçük harf değiştirerek limiti atlayabilirdi.
 * (Bu projede daha önce `"ŞİFRE".toLowerCase()` → `"şi̇fre"` yüzünden 12 E2E testi düşmüştü.)
 *
 * Çözüm: locale AÇIKÇA `en-US` verilir → invariant (Unicode varsayılan) katlama, host
 * locale'inden bağımsız. Öncesinde `normalize('NFC')` uygulanır ki aynı harfin birleşik ve
 * ayrık (ör. `i` + U+0307 birleşen nokta) yazımları aynı anahtara düşsün.
 *
 * NOT: Bu değer YALNIZCA hız sınırı anahtarıdır. Supabase'e gönderilen e-posta HAM
 * (yalnızca `trim()` edilmiş) haliyle iletilir — GoTrue'nun kendi normalizasyonuyla
 * çelişmeyelim ve mevcut giriş davranışı hiç değişmesin diye.
 */
export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFC').toLocaleLowerCase('en-US')
}

/** Birincil kova anahtarı. */
export function loginEmailKey(email: string): string {
  return `login:${normalizeEmail(email)}`
}

/** İkincil kova anahtarı. */
export function loginIpKey(ip: string): string {
  return `login-ip:${ip}`
}

// ---------------------------------------------------------------------------
// Kota kontrolü
// ---------------------------------------------------------------------------

export interface LoginQuota {
  /** `false` ise istek hiç Supabase'e gönderilmeden 429 ile reddedilmelidir. */
  allowed: boolean
  /** `Retry-After` başlığı için saniye (en az 1). */
  retryAfterSeconds: number
  /** Hangi kovanın dolduğunu loglamak için; `allowed === true` iken `null`. */
  blockedBy: 'email' | 'ip' | null
}

const EMAIL_OPTS = { limit: LOGIN_FAILURE_LIMIT, windowMs: LOGIN_FAILURE_WINDOW_MS }
const IP_OPTS = { limit: LOGIN_IP_FAILURE_LIMIT, windowMs: LOGIN_FAILURE_WINDOW_MS }

function toRetryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

/**
 * Bu giriş denemesine izin var mı? SAYAÇ ARTIRMAZ — yalnızca başarısız denemeler sayılır
 * (bkz. `recordLoginFailure`).
 *
 * @param ip Güvenilebilir istemci IP'si ya da `null` (çözülemiyor). `null` iken IP kovası
 *           BİLEREK atlanır — yukarıdaki karar notuna bakın.
 */
export function checkLoginQuota(email: string, ip: string | null): LoginQuota {
  const emailResult = peekRateLimit(loginEmailKey(email), EMAIL_OPTS)
  if (!emailResult.success) {
    return {
      allowed: false,
      retryAfterSeconds: toRetryAfterSeconds(emailResult.resetAt),
      blockedBy: 'email',
    }
  }

  if (ip !== null) {
    const ipResult = peekRateLimit(loginIpKey(ip), IP_OPTS)
    if (!ipResult.success) {
      return {
        allowed: false,
        retryAfterSeconds: toRetryAfterSeconds(ipResult.resetAt),
        blockedBy: 'ip',
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0, blockedBy: null }
}

/** Başarısız denemeyi kaydeder (her iki kovayı da artırır). */
export function recordLoginFailure(email: string, ip: string | null): void {
  checkRateLimit(loginEmailKey(email), EMAIL_OPTS)
  if (ip !== null) checkRateLimit(loginIpKey(ip), IP_OPTS)
}

/**
 * Başarılı giriş: o E-POSTANIN sayacı sıfırlanır.
 *
 * IP kovası BİLEREK sıfırlanmaz — aksi halde saldırgan, elindeki tek geçerli hesapla araya
 * bir başarılı giriş sıkıştırarak IP kovasını sürekli temizler ve sprey saldırısını sonsuza
 * kadar sürdürebilirdi.
 */
export function clearLoginFailures(email: string): void {
  clearRateLimitKey(loginEmailKey(email))
}
