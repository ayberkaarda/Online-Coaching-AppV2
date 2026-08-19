// B-043 (borç; active_planprogram.md §7a "AI harcama kotası"; hardening-prompt-v2.md #22;
// Faz 4.6 dilim 2, AC-4.6.3): AI proxy uçlarına (/api/ai/workout, /api/ai/nutrition,
// /api/ai/recommendations) KULLANICI BAŞINA GÜNLÜK kota.
//
// NEDEN AYRI BİR KATMAN: `src/proxy.ts`'teki mevcut hız sınırı IP bazlıdır ve KISA pencerelidir
// (dakika, varsayılan 60 istek/dk — bkz. `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX_REQUESTS`).
// Bu modül onun ÜZERİNE, tek bir KULLANICININ (aynı IP'den bile olsa) gün boyunca ne kadar AI
// çağrısı harcayabileceğini sınırlayan AYRI ve daha uzun soluklu bir katmandır (hardening-
// prompt-v2.md #22'nin lafzı: "5. maddedeki rate limit'in üstüne kota katmanı").
//
// ENTEGRASYON — TEK AUTH ÇAĞRISI: bu modül kendi başına kimlik doğrulaması YAPMAZ. Çağıran
// (`src/lib/api/proxy.ts`'teki `handleAiProxy`), KENDİ `auth.getUser()` doğrulamasını
// yaptıktan SONRA, elde ettiği doğrulanmış `userData.user.id` ile `checkAndConsumeAiQuota`'yı
// çağırır. Önceki bir sürümde bu modül KENDİ auth adımını da ayrıca yapıyordu (dosya kapsamı
// `proxy.ts`'i içermediği için) — bu, başarılı her istekte Supabase'in `auth.getUser`'ının İKİ
// KEZ ağ çağrısı yapmasına yol açıyordu. Dosya kapsamı `proxy.ts`'i de içerecek şekilde
// genişletildiğinde bu tek çağrıya birleştirildi (bkz. `proxy.ts`'teki entegrasyon noktası).
//
// GÜVENLİK NOTU — BİLEREK YAPILMAYAN KISAYOL (aynen korunuyor): kota anahtarı YALNIZCA
// doğrulanmış kimlikten türetilir; JWT'nin `sub` alanı imza DOĞRULAMASI yapılmadan OKUNMAZ.
// Doğrulamasız okunsaydı bir saldırgan sahte (uydurma/imzasız) bir JWT'ye KURBANIN
// `user_id`'sini yazıp gönderebilir, bu istek auth adımında 401 ile reddedilse BİLE kota BİZİM
// tarafımızda çoktan tüketilmiş olurdu — başka bir kullanıcının kotasını TÜKETME (griefing/
// DoS) yüzeyi açılırdı. `checkAndConsumeAiQuota` bu yüzden yalnızca `proxy.ts`'nin auth
// adımından SONRA, doğrulanmış `userData.user.id` ile çağrılmalıdır.
//
// DEPOLAMA STRATEJİSİ — `src/lib/api/auth-rate-limit.ts`'TEN AYNEN ALINDI: YENİ bir Map/depo
// İCAT EDİLMEDİ. Bu modül `src/lib/rate-limit.ts`'teki PAYLAŞILAN, TEK-SÜREÇ bellek içi `Map`
// tabanlı sabit-pencere sayacını (`checkRateLimit`) doğrudan çağırır — auth-rate-limit.ts'nin
// giriş kaba kuvvet korumasında yaptığının BİREBİR AYNISI, yalnızca anahtar ve pencere
// hesaplama farklı (aşağıya bakın).
//
// ATOMİKLİK (AC-4.6.3'ün çekirdek iddiası — "kotanın yarışla aşılamadığı"): `checkRateLimit`
// içeride HİÇ `await` BARINDIRMAZ (bkz. rate-limit.ts). Node'un tek iş parçacıklı event
// loop'u sayesinde bu fonksiyonun bir çağrısı BAŞLAYIP BİTENE kadar başka hiçbir JS kodu
// (başka bir isteğin handler'ı dahil) araya giremez — okuma + artırma + karşılaştırma TEK bir
// mikro-adımda olur. Dolayısıyla `Promise.all` ile "aynı anda" tetiklenen N istek dahi sayaç
// artırımını KAÇIRAMAZ/ÇİFT SAYAMAZ. Kanıt: `tests/unit/ai-quota.test.ts` "yarış" bloğu —
// aynı kullanıcı için 20 eşzamanlı çağrıdan yalnızca `limit` kadarı `allowed: true` döner.
//
// KALICILIK SINIRI (bilerek kabul edilen, GÖREV KAPSAMI DIŞI borç — bkz. rate-limit.ts
// başlığındaki AYNI uyarı):
//   (1) Sayaç SÜREÇ BELLEĞİNDEDİR — süreç yeniden başladığında (deploy, crash, restart) TÜM
//       kullanıcıların kotası sıfırlanır; bir kullanıcı günün ortasında "bedava" bir gün daha
//       kazanabilir.
//   (2) YATAY ÖLÇEKte (birden fazla Node instance'ı arkasında bir yük dengeleyici) her instance
//       KENDİ sayacını tutar — gerçek toplam kota instance sayısı katına kadar aşılabilir.
// Bu repo şu an TEK instance varsayımıyla çalışıyor. Paylaşılan (Redis/Upstash) bir sayaca
// geçiş zaten ERTELENENLER kuyruğundadır; bu iki sınır o borcun gerekçesidir, burada
// GENİŞLETİLMEDİ.
//
// GÜN PENCERESİ — YEREL GÜN, UTC DEĞİL. `packages/api-client/src/date.ts`'teki `todayIsoDate()`
// bu repoda "gün" kavramının TEK KAYNAĞIdır (nutrition_logs/daily_logs/progress_entries/
// progress_photos hepsi ona göre yazar/okur; bkz. o dosyanın başlık yorumu ve
// `tests/unit/local-date-consistency.test.ts`). Ayrı bir UTC tabanlı "gün" tanımı YERİNE
// AYNI fonksiyon kullanılır — iki farklı "gün ne zaman değişir" kuralının (biri AI kotası
// için, biri geri kalan her şey için) bu güvenlik-bilinçli kod tabanında ayrışması, kendi
// başına bir tutarsızlık/kafa karışıklığı kaynağı olurdu. Kova anahtarına `todayIsoDate()`
// AÇIKÇA gömülür (aşağıdaki `aiQuotaKey`): gün değiştiğinde anahtar da değişir, dolayısıyla
// sıfırlanma `checkRateLimit`'in `resetAt` hesabına GÜVENMEDEN de garanti altındadır — ikinci
// bir bağımsız doğrulama katmanı.
//
// SUNUCU SÜRECİNİN SAAT DİLİMİ ÖNEMLİDİR: bu modül SUNUCUDA çalışır; `todayIsoDate()`'in
// "yerel"i burada SUNUCU SÜRECİNİN saat dilimidir (`TZ` ortam değişkeni / işletim sistemi
// varsayılanı), TARAYICININ saat dilimi DEĞİL. Sunucu `TZ` ayarlanmamışsa (çoğu konteyner/PaaS
// varsayılanı UTC'dir) kota gece yarısı UTC'de sıfırlanır — Türkiye'deki (UTC+3) bir kullanıcı
// için bu yerel saat 03:00 demektir. Bu, `todayIsoDate()` ile AYNI mimariyi izlemenin (repo'nun
// tek "gün" tanımına sadık kalmanın) BİLİNÇLİ bedelidir; dağıtımda `TZ=Europe/Istanbul`
// ayarlanırsa kota da kullanıcı günüyle birebir hizalanır (bkz. docs/DEPLOYMENT.md).
//
// ENV: `AI_QUOTA_DAILY_LIMIT` — `src/env.server.ts`'teki zod şemasında tanımlıdır
// (`RATE_LIMIT_MAX_REQUESTS` ile AYNI desen: `z.coerce.number().int().positive().default(20)`).
// Değer TANIMSIZSA varsayılan 20 uygulanır; sayısal olmayan/negatif bir değer verilirse
// (RATE_LIMIT_MAX_REQUESTS'te olduğu gibi) uygulama BAŞLANGIÇTA fail-fast eder — sessizce
// "sınırsız"a düşülmez.

import { NextResponse } from 'next/server'

import { getServerEnv } from '@/env.server'
import { errorResponse } from '@/lib/api/response'
import { checkRateLimit } from '@/lib/rate-limit'
import { todayIsoDate } from '@repo/api-client/date'

// ---------------------------------------------------------------------------
// Gün penceresi
// ---------------------------------------------------------------------------

/**
 * Bir sonraki YEREL gece yarısına kalan ms. `todayIsoDate()` ile AYNI kural: yerel
 * `getFullYear`/`getMonth`/`getDate` kullanılır, `toISOString`/UTC KULLANILMAZ (bkz. dosya
 * başı notu). `Date` constructor'ına yerel bileşenler (UTC değil) verildiğinde sonuç YEREL
 * saat dilimine göre yorumlanır; ay/yıl taşması (ör. 31 Ocak + 1 gün -> 1 Şubat, 31 Aralık +
 * 1 gün -> ertesi yıl 1 Ocak) `Date`'in kendisi tarafından doğru şekilde halledilir.
 *
 * Bu değer yalnızca YENİ bir kova oluşturulduğunda `checkRateLimit`'in `resetAt`'ini
 * belirlemek için kullanılır (bkz. `checkAndConsumeAiQuota`) — asıl "gün değişti mi?" kararı
 * kova ANAHTARINA gömülü `todayIsoDate()`'ten gelir (aşağıya bakın), bu yalnızca `Retry-After`
 * ve kullanıcıya gösterilen "X saat sonra" mesajının DOĞRU olmasını sağlayan ikincil bir
 * hesaptır.
 */
function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return next.getTime() - now.getTime()
}

function aiQuotaKey(userId: string, day: string): string {
  return `ai-quota:${userId}:${day}`
}

// ---------------------------------------------------------------------------
// Kota kontrolü + artırma
// ---------------------------------------------------------------------------

export interface AiQuotaCheck {
  /** `false` ise istek 429 ile reddedilmelidir. */
  allowed: boolean
  limit: number
  /** Bu istekten SONRA kalan hak (`allowed: false` iken 0). */
  remaining: number
  /** `Retry-After` başlığı için saniye (en az 1); bir sonraki yerel gece yarısına kalan süre. */
  retryAfterSeconds: number
}

/**
 * DOĞRULANMIŞ kullanıcının bugünkü AI kotasını KONTROL EDER ve ARTIRIR (tek atomik adım —
 * bkz. dosya başı "ATOMİKLİK" notu). `auth-rate-limit.ts`'teki `checkLoginQuota`/
 * `recordLoginFailure` ayrımının AKSİNE burada iki adım yoktur: her AI isteği zaten
 * "harcanmış" sayılır, giriş denemesindeki gibi yalnızca BAŞARISIZ denemeleri sayma ihtiyacı
 * bu bağlamda yok — kota amacı harcamayı (maliyeti) sınırlamaktır, saldırı tespiti değil.
 *
 * @param userId `proxy.ts`'nin `auth.getUser(accessToken)` ile İMZA DOĞRULAMALI olarak elde
 *               ettiği kullanıcı kimliği. Çağıran, bu fonksiyonu yalnızca kendi auth adımı
 *               BAŞARILI olduktan SONRA çağırmalıdır (bkz. dosya başı "GÜVENLİK NOTU").
 */
export function checkAndConsumeAiQuota(userId: string): AiQuotaCheck {
  const now = Date.now()
  const day = todayIsoDate()
  const limit = getServerEnv().AI_QUOTA_DAILY_LIMIT
  const windowMs = msUntilNextLocalMidnight(new Date(now))

  const result = checkRateLimit(aiQuotaKey(userId, day), { limit, windowMs })

  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt - now) / 1000)),
  }
}

// ---------------------------------------------------------------------------
// 429 yanıtı
// ---------------------------------------------------------------------------

/**
 * Kota aşıldığında dönülecek hazır `NextResponse`'u üretir. Saf bir biçimlendirme
 * fonksiyonudur — auth/istek durumuna DOKUNMAZ, yalnızca `checkAndConsumeAiQuota`'nın
 * `allowed: false` sonucunu bir HTTP yanıtına çevirir. `errorResponse` kullanır — mevcut hata
 * gövde biçiminden (`ApiErrorBody`) SAPMAZ; `Retry-After` başlığı taşır.
 *
 * Çağıran (`proxy.ts`), bu fonksiyonu yalnızca `checkAndConsumeAiQuota(...).allowed === false`
 * iken çağırmalıdır; loglama (güvenlik olayı) çağıranın sorumluluğundadır — bu fonksiyon
 * yalnızca YANITI üretir.
 */
export function aiQuotaExceededResponse(quota: AiQuotaCheck, requestId: string): NextResponse {
  const hours = Math.max(1, Math.ceil(quota.retryAfterSeconds / 3600))
  return errorResponse(
    429,
    'AI_QUOTA_EXCEEDED',
    `Günlük yapay zeka kullanım kotanızı doldurdunuz (günde en fazla ${quota.limit} istek). ` +
      `Kotanız yaklaşık ${hours} saat sonra yenilenecek.`,
    requestId,
    undefined,
    { 'Retry-After': String(quota.retryAfterSeconds) }
  )
}
