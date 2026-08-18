// Tek-instance bellek içi limitleyici. Çok-instance dağıtımda Upstash Redis / @vercel/kv ile değiştirin.
// Sabit pencere (fixed window) sayacı: anahtar başına pencere içi istek sayısını tutar.

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  /** Pencerenin sıfırlanacağı epoch ms. */
  resetAt: number
}

interface Bucket {
  count: number
  resetAt: number
}

const DEFAULT_LIMIT = 60
const DEFAULT_WINDOW_MS = 60_000
const MAX_KEYS = 10_000

// `Map` insertion-order'ı korur; bu özellik LRU tahliyesi için kullanılır (bkz. `touch`).
// Bir anahtar her `checkRateLimit` çağrısında Map'in SONUNA taşınır, yani Map'in BAŞI her
// zaman "en uzun süredir kullanılmayan" anahtardır.
const buckets = new Map<string, Bucket>()

/**
 * Bir anahtarı Map'in sonuna taşır (en son kullanılan konumuna).
 * `Map.prototype.set` VAR OLAN bir anahtarın konumunu DEĞİŞTİRMEZ — bu yüzden önce silip
 * yeniden eklemek gerekir.
 */
function touch(key: string, bucket: Bucket): void {
  buckets.delete(key)
  buckets.set(key, bucket)
}

/**
 * Süresi dolmuş anahtarları temizler; hâlâ MAX_KEYS üzerindeyse LRU sırasına göre en eski
 * (en uzun süredir dokunulmamış) anahtarları taşmayı giderecek kadar tahliye eder.
 *
 * A-19 (güvenlik denetimi, findings-app-surface.md §3.2 ikincil etki): önceki davranış
 * `buckets.clear()` ile taşma anında TÜM sayaçları sıfırlıyordu — bir saldırgan 10.000 sahte
 * anahtar (ör. sahte `X-Forwarded-For` değeri) üreterek diğer TÜM kullanıcıların hız sınırı
 * durumunu da sıfırlayabiliyordu; yani sınırlayıcının kendisi bir DoS koluydu. LRU tahliyesi
 * yalnızca gerçekten atıl anahtarları siler, aktif kullanılan (yakın zamanda `touch`
 * edilmiş) anahtarların sayacı taşma sırasında SIFIRLANMAZ.
 */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }

  if (buckets.size <= MAX_KEYS) return

  const overflow = buckets.size - MAX_KEYS
  const oldestKeys = buckets.keys()
  for (let i = 0; i < overflow; i++) {
    const next = oldestKeys.next()
    if (next.done) break
    buckets.delete(next.value)
  }
}

export function checkRateLimit(
  key: string,
  opts: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const now = Date.now()

  sweep(now)

  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    // `set` yeterli: anahtar ya hiç yoktu ya da siliniyor (süresi dolmuş) — Map'te YOKKEN
    // eklenen her anahtar zaten sona (en-son-kullanılan konuma) eklenir.
    buckets.delete(key)
    buckets.set(key, { count: 1, resetAt })
    return { success: true, limit, remaining: Math.max(0, limit - 1), resetAt }
  }

  existing.count += 1
  touch(key, existing)
  const remaining = Math.max(0, limit - existing.count)

  return {
    success: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  }
}

/**
 * Bir anahtarın durumunu SAYAÇ ARTIRMADAN okur; anahtar yoksa OLUŞTURMAZ.
 *
 * A-01 (giriş kaba kuvvet koruması) için eklendi: giriş ucunda yalnızca BAŞARISIZ denemeler
 * sayılır, dolayısıyla "bu deneme yapılabilir mi?" sorusu ile "bu deneme başarısız oldu, say"
 * eylemi birbirinden AYRILMAK zorundadır. `checkRateLimit` ikisini tek adımda yaptığı için
 * giriş akışında kullanılamaz.
 *
 * DİKKAT — `success` semantiği `checkRateLimit`ten FARKLIDIR: burada `count < limit`
 * ("bir deneme daha yapılabilir"), `checkRateLimit`te ise artırım SONRASI `count <= limit`.
 *
 * Kilitli bir anahtar `peek` ile okunduğunda sayaç artmadığı için pencere UZAMAZ; yani
 * saldırgan kilitli bir hesaba istek yağdırarak kilit süresini uzatamaz.
 */
export function peekRateLimit(
  key: string,
  opts: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const now = Date.now()

  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    return { success: true, limit, remaining: limit, resetAt: now + windowMs }
  }

  return {
    success: existing.count < limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  }
}

/**
 * Tek bir anahtarın sayacını siler (diğer anahtarlara dokunmaz).
 * A-01: başarılı giriş, o e-postanın başarısız deneme sayacını sıfırlar.
 */
export function clearRateLimitKey(key: string): void {
  buckets.delete(key)
}

/** Test yardımcısı: tüm sayaçları sıfırlar. */
export function resetRateLimit(): void {
  buckets.clear()
}
