// Next.js 16 "proxy" dosya konvansiyonu — önceki adı middleware.ts idi (middleware
// konvansiyonu deprecate edildi: https://nextjs.org/docs/messages/middleware-to-proxy).
// Tüm /api/* isteklerine IP + yol bazlı hız sınırı uygular.
// AI uçları daha pahalı olduğu için daha sıkı limite tabidir; /api/health cömert ama sınırsız
// değildir (bkz. A-17).

import { NextResponse, type NextRequest } from 'next/server'

import { getServerEnv } from '@/env'
import { resolveTrustedClientIp } from '@/lib/api/client-ip'
import { checkRateLimit } from '@/lib/rate-limit'

export const config = { matcher: ['/api/:path*'] }

/** AI proxy uçları için sıkı limit: dakikada 20 istek. */
const AI_LIMIT = 20
const AI_WINDOW_MS = 60_000

/**
 * `/api/health` için cömert ama sonsuz olmayan tavan (A-17). Docker HEALTHCHECK 30 sn'de bir
 * çağırır (dakikada 2 istek); harici bir uptime monitörü eklense bile bu limite normal
 * kullanımda ulaşılmaz, yalnızca anlamsız bir flood'u durdurur.
 */
const HEALTH_LIMIT = 120
const HEALTH_WINDOW_MS = 60_000

/**
 * IP çözümü `@/lib/api/client-ip` içindeki `resolveTrustedClientIp`'e taşındı (A-01 ile
 * `/api/auth/sign-in` route handler'ı da aynı güven modeline ihtiyaç duyduğu için). Davranış
 * aynı: güvenilir bir IP tespit edilemezse (N=0 varsayılanı ya da beklenen hop yok) sahte/
 * güvenilmeyen bir başlığa düşmek yerine TÜM bu istekler tek bir paylaşılan kovada toplanır.
 * Next.js'in proxy runtime'ı ham soket IP'sine erişim sunmaz (`NextRequest` Fetch API
 * `Request`'i sarar; `.ip`/`.socket` yoktur), bu yüzden "doğrudan bağlantı IP'sine düş"
 * pratikte budur. Aşırı sıkı (paylaşılan) bir limit, sahte XFF ile sınırsız kova
 * üretilebilmesinden (bkz. A-02 canlı kanıtı) her zaman daha güvenlidir.
 */
function getClientIp(request: NextRequest): string {
  return resolveTrustedClientIp(request.headers) ?? 'unknown'
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const env = getServerEnv()
  const isAiRoute = pathname.startsWith('/api/ai/')
  const isHealthRoute = pathname === '/api/health'

  const limit = isHealthRoute ? HEALTH_LIMIT : isAiRoute ? AI_LIMIT : env.RATE_LIMIT_MAX_REQUESTS
  const windowMs = isHealthRoute
    ? HEALTH_WINDOW_MS
    : isAiRoute
      ? AI_WINDOW_MS
      : env.RATE_LIMIT_WINDOW_MS

  const ip = getClientIp(request)
  // A-18: 3 AI route'u (workout/nutrition/recommendations) ayrı kovalarda olduğu için aynı IP
  // fiilen limit×3 istek atabiliyordu. Ortak anahtarda birleştirilince tek bir AI kotası paylaşılır.
  const bucketKey = isAiRoute ? `${ip}:ai` : `${ip}:${pathname}`
  const result = checkRateLimit(bucketKey, { limit, windowMs })

  const rateHeaders: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }

  if (!result.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))

    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Çok fazla istek gönderdiniz. Lütfen ${retryAfterSeconds} saniye sonra tekrar deneyin.`,
        },
      },
      {
        status: 429,
        headers: {
          ...rateHeaders,
          'Retry-After': String(retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      }
    )
  }

  const response = NextResponse.next()
  for (const [name, value] of Object.entries(rateHeaders)) {
    response.headers.set(name, value)
  }
  return response
}
