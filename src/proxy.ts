// Next.js 16 "proxy" dosya konvansiyonu — önceki adı middleware.ts idi (middleware
// konvansiyonu deprecate edildi: https://nextjs.org/docs/messages/middleware-to-proxy).
// Tüm /api/* isteklerine IP + yol bazlı hız sınırı uygular.
// AI uçları daha pahalı olduğu için daha sıkı limite tabidir; /api/health muaftır.

import { NextResponse, type NextRequest } from 'next/server'

import { getServerEnv } from '@/env'
import { checkRateLimit } from '@/lib/rate-limit'

export const config = { matcher: ['/api/:path*'] }

/** AI proxy uçları için sıkı limit: dakikada 20 istek. */
const AI_LIMIT = 20
const AI_WINDOW_MS = 60_000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return 'unknown'
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // Docker HEALTHCHECK bu ucu sürekli çağırır — sınırlamaya dahil edilmez.
  if (pathname === '/api/health') return NextResponse.next()

  const env = getServerEnv()
  const isAiRoute = pathname.startsWith('/api/ai/')

  const limit = isAiRoute ? AI_LIMIT : env.RATE_LIMIT_MAX_REQUESTS
  const windowMs = isAiRoute ? AI_WINDOW_MS : env.RATE_LIMIT_WINDOW_MS

  const ip = getClientIp(request)
  const result = checkRateLimit(`${ip}:${pathname}`, { limit, windowMs })

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
