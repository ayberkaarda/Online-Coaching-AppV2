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

const buckets = new Map<string, Bucket>()

/** Süresi dolmuş anahtarları temizler; Map çok büyürse tamamen boşaltır (bellek koruması). */
function sweep(now: number): void {
  if (buckets.size > MAX_KEYS) {
    buckets.clear()
    return
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
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
    buckets.set(key, { count: 1, resetAt })
    return { success: true, limit, remaining: Math.max(0, limit - 1), resetAt }
  }

  existing.count += 1
  const remaining = Math.max(0, limit - existing.count)

  return {
    success: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  }
}

/** Test yardımcısı: tüm sayaçları sıfırlar. */
export function resetRateLimit(): void {
  buckets.clear()
}
