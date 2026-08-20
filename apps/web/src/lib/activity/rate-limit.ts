// Faz 4.8 dilim 2 — `POST /api/activity` HIZ SINIRI.
//
// `src/lib/api/auth-rate-limit.ts` ve `src/lib/api/ai-quota.ts` ile AYNI depoyu
// (`src/lib/rate-limit.ts`'teki paylaşılan sabit-pencere sayacı) kullanır; YENİ bir
// Map/depo İCAT EDİLMEZ. Bu dosya da bilerek `server-only` İÇE AKTARMAZ: saf mantık,
// birim testinden doğrudan çağrılabilsin diye (auth-rate-limit.ts'teki aynı not).
//
// ─────────────────────────────────────────────────────────────────────────────
// ANAHTAR: KULLANICI, IP DEĞİL — VE BU SEFER TARTIŞMASIZ
// ─────────────────────────────────────────────────────────────────────────────
// `auth-rate-limit.ts`'te IP birincil anahtar OLAMIYORDU çünkü giriş ucu KİMLİKSİZ
// çağrılıyor ve `TRUSTED_PROXY_COUNT=0` varsayılanında tüm istekler tek bir paylaşılan
// "unknown" kovasına düşüyor (yani IP tabanlı kilit doğrudan bir DoS koluna dönüşüyor).
// Burada o sorun YOKTUR: `/api/activity` KİMLİK DOĞRULANMADAN hiç bu noktaya gelmez,
// dolayısıyla elimizde her zaman GERÇEK, doğrulanmış ve sahtelenemez bir anahtar
// (`user.id`) vardır. Bir kullanıcının kovası başka bir kullanıcıyı ETKİLEMEZ.
//
// ─────────────────────────────────────────────────────────────────────────────
// İKİ KOVA — NEDEN VE NEDEN BU SAYILAR
// ─────────────────────────────────────────────────────────────────────────────
// Meşru istemcinin (bkz. `./tracker.tsx`) üretebileceği trafiğin TAVANI ölçülebilir:
//
//   * Heartbeat: 60 sn'de 1 (yalnızca sekme görünürken)          -> dakikada 1
//   * Görünürlük geçişleri: `visibilitychange` başına 1 sinyal;
//     istemci ardışık sinyalleri 5 sn ile boğuyor (throttle)      -> dakikada <= 12
//   * Sekme değişimi (`tab_view`) ve alan olayları (mesaj, günlük,
//     form check, AI): insan hızında, gerçekçi tavan               -> dakikada ~10
//                                                                    ─────────────
//                                                        meşru tepe ~ dakikada 23
//
// BURST kovası bu tepenin hemen üstüne konur (30/dk): "saniyede yüzlerce olay"
// senaryosu ilk saniyede takılır, meşru bir kullanıcı ise pratikte hiç değmez.
//
// SUSTAINED kovası tek başına gerekli: yalnızca burst kovası olsaydı bir istemci
// dakikada 30 istekle SÜREKLİ (saatte 1800) yazabilirdi — bu, tek kullanıcı için
// saatte 1800 satırlık bir veritabanı yazma yüküdür ve 180 günlük saklama penceresini
// çöple doldurur. Meşru saatlik tavan ~60 heartbeat + birkaç yüz etkileşimdir; 600
// bunun ~2 katı, kötüye kullanımın ise 1/3'üdür.
//
// PENCERELER SABİT (env'e BAĞLANMADI): `AI_QUOTA_DAILY_LIMIT` gibi bir ayar düğmesi
// eklemek, operatörün yanlışlıkla "sınırsız"a çekebileceği yeni bir yüzey açardı ve
// bu uç — AI proxy'sinin aksine — dışarıya PARA harcamıyor, yalnızca kendi
// veritabanımıza yazıyor. Sabit ve muhafazakâr değerler burada daha güvenli.

import { checkRateLimit, type RateLimitResult } from '@/lib/rate-limit'

/** Kısa pencere (ani patlama) — kullanıcı başına 60 sn'de 30 sinyal. */
export const ACTIVITY_BURST_LIMIT = 30
export const ACTIVITY_BURST_WINDOW_MS = 60_000

/** Uzun pencere (sürekli akış) — kullanıcı başına 1 saatte 600 sinyal. */
export const ACTIVITY_SUSTAINED_LIMIT = 600
export const ACTIVITY_SUSTAINED_WINDOW_MS = 60 * 60_000

/**
 * Rıza uçları (`/api/activity/consent`) için AYRI ve çok daha dar kova: rıza
 * verme/geri çekme NADİR bir işlemdir ve her çağrı `profiles` satırına damga basar,
 * geri çekme ise kullanıcının TÜM etkinlik satırlarını SİLER. Saatte 10, meşru bir
 * kullanıcının (fikir değiştirme dahil) asla değmeyeceği ama bir betiğin damga/silme
 * döngüsü kurmasını engelleyen bir tavandır.
 */
export const ACTIVITY_CONSENT_LIMIT = 10
export const ACTIVITY_CONSENT_WINDOW_MS = 60 * 60_000

export interface ActivityRateLimitVerdict {
  /** `false` ise istek veritabanına HİÇ gitmeden 429 ile reddedilmelidir. */
  allowed: boolean
  /** `Retry-After` başlığı için saniye (en az 1). */
  retryAfterSeconds: number
  /** Hangi kovanın dolduğu — yalnızca sunucu logu için. */
  blockedBy: 'burst' | 'sustained' | null
}

function toRetryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
}

const ALLOWED: ActivityRateLimitVerdict = {
  allowed: true,
  retryAfterSeconds: 0,
  blockedBy: null,
}

/**
 * İki kovayı da ARTIRARAK kontrol eder (tek atomik adım — `checkRateLimit` içinde
 * hiç `await` yoktur, bkz. `ai-quota.ts`'teki ATOMİKLİK notu).
 *
 * SIRA ÖNEMLİ: burst kovası ÖNCE artırılır ama sustained kovası REDDEDİLSE BİLE
 * artırılmış kalır — kasıtlı. Reddedilen istek de sunucuya iş yaptırmıştır
 * (kimlik doğrulama dahil); onu "bedava" saymak, sınıra dayanan bir istemcinin
 * sınırı sonsuza kadar sürüklemesine izin verirdi.
 *
 * @param userId `auth.getUser(accessToken)` ile İMZA DOĞRULAMALI olarak elde edilmiş
 *               kimlik. Çağıran bunu KENDİ auth adımından SONRA çağırmalıdır — JWT'nin
 *               `sub` alanı doğrulamasız okunursa saldırgan kurbanın kovasını
 *               tüketebilirdi (`ai-quota.ts`'teki aynı griefing vektörü).
 */
export function checkActivityRateLimit(userId: string): ActivityRateLimitVerdict {
  const burst: RateLimitResult = checkRateLimit(`activity-burst:${userId}`, {
    limit: ACTIVITY_BURST_LIMIT,
    windowMs: ACTIVITY_BURST_WINDOW_MS,
  })
  const sustained: RateLimitResult = checkRateLimit(`activity-sustained:${userId}`, {
    limit: ACTIVITY_SUSTAINED_LIMIT,
    windowMs: ACTIVITY_SUSTAINED_WINDOW_MS,
  })

  if (!burst.success) {
    return {
      allowed: false,
      retryAfterSeconds: toRetryAfterSeconds(burst.resetAt),
      blockedBy: 'burst',
    }
  }

  if (!sustained.success) {
    return {
      allowed: false,
      retryAfterSeconds: toRetryAfterSeconds(sustained.resetAt),
      blockedBy: 'sustained',
    }
  }

  return ALLOWED
}

/** Rıza uçları için tek kova. */
export function checkActivityConsentRateLimit(userId: string): ActivityRateLimitVerdict {
  const result = checkRateLimit(`activity-consent:${userId}`, {
    limit: ACTIVITY_CONSENT_LIMIT,
    windowMs: ACTIVITY_CONSENT_WINDOW_MS,
  })

  if (result.success) return ALLOWED

  return {
    allowed: false,
    retryAfterSeconds: toRetryAfterSeconds(result.resetAt),
    blockedBy: 'burst',
  }
}
