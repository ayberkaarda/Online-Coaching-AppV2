// Next.js 16 "proxy" dosya konvansiyonu — önceki adı middleware.ts idi (middleware
// konvansiyonu deprecate edildi: https://nextjs.org/docs/messages/middleware-to-proxy).
//
// İKİ AYRI SORUMLULUK, İKİ AYRI DAL:
//   1. /api/*  -> IP + yol bazlı hız sınırı. AI uçları daha pahalı olduğu için daha sıkı
//      limite tabidir; /api/health cömert ama sınırsız değildir (bkz. A-17).
//   2. Sayfalar -> istek başına taze CSP nonce'u (A-14 / borç B-007).
//
// Sayfa istekleri hız sınırı kovalarına BİLİNÇLİ OLARAK GİRMEZ: normal gezinme (her sayfa
// gezinmesi + RSC isteği) aynı kovayı doldurup kullanıcıyı 429'a düşürürdü.

import { NextResponse, type NextRequest } from 'next/server'

import { getServerEnv } from '@/env.server'
import { resolveTrustedClientIp } from '@/lib/api/client-ip'
import { logger } from '@/lib/logger'
import { checkRateLimit } from '@/lib/rate-limit'
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp'

export const config = {
  matcher: [
    // (a) Hız sınırı yolu — davranışı A-14 ile DEĞİŞMEDİ.
    '/api/:path*',
    // (b) CSP nonce'u için sayfa yolları. Next dokümanının önerdiği nesne biçimli matcher:
    // API, statik dosyalar, resim optimizasyonu ve favicon hariç TÜM yollar; prefetch
    // istekleri (`next/link`) `missing` koşuluyla dışarıda bırakılır — onların HTML'i
    // render edilmez, nonce'a ihtiyaçları yoktur.
    // Kaynak: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}

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

/**
 * A-10 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5): hız sınırı kovası anahtarı
 * IP içerir; loglarda ham IP saklanmasın diye kaba bir kısaltma uygulanır. Tersine çevrilemez
 * bir hash DEĞİL — amaç yalnızca düz metin log satırından ham IP'yi çıkarmak, yine de olay
 * korelasyonu için (aynı kova mı?) yeterli bir önek/sonek bırakır. Format IPv4/IPv6/`unknown`
 * hepsinde çalışsın diye anahtarın kendisi (ip:suffix) üzerinde, ayrıştırmadan çalışır.
 */
function maskRateLimitKey(key: string): string {
  if (key.length <= 6) return `${key.slice(0, 2)}***`
  return `${key.slice(0, 4)}***${key.slice(-2)}`
}

/**
 * A-14 (borç B-007): nonce tabanlı CSP. Mekanik Next dokümanındaki sırayla uygulanır —
 * sıralamanın her adımı gerekli:
 *   1. Her istekte TAZE nonce üretilir (öngörülebilir bir nonce hiçbir şey korumaz).
 *   2. Nonce hem `x-nonce` hem de `Content-Security-Policy` İSTEK başlığına yazılır. İkincisi
 *      atlanırsa nonce hiçbir script'e uygulanmaz: Next, render sırasında İSTEK başlığındaki
 *      CSP'yi ayrıştırıp `'nonce-{değer}'` desenini oradan çıkarır.
 *   3. `NextResponse.next({ request: { headers } })` ile değiştirilmiş başlıklar upstream'e
 *      (render'a) iletilir — `NextResponse.next({ headers })` DEĞİL, o istemciye gider.
 *   4. Aynı CSP YANIT başlığına da yazılır; tarayıcıya uygulanan politika budur.
 *
 * Not: nonce yalnızca DİNAMİK render edilen sayfalara uygulanabilir. Build zamanında üretilmiş
 * statik HTML'in bootstrap script'inde nonce olmaz ve bu politika onu bloklardı (beyaz ekran).
 *
 * TUZAK — `export const dynamic = 'force-dynamic'` BU PROJEDE İŞE YARAMAZ: `/`, `/login`,
 * `/profile` ve `/users` dosyalarının dördü de `'use client'` ve Next 16 route segment
 * config'ini istemci bileşenlerinde SESSİZCE yok sayıyor (beş sayfaya da eklenip build
 * alınarak ölçüldü — yalnızca sunucu bileşeni olan `/_not-found` dinamikleşti). Dinamik
 * render bu yüzden ağaçtaki tek sunucu bileşeni olan KÖK LAYOUT'ta `await connection()` ile
 * sağlanıyor (`src/app/layout.tsx`); sonuç olarak tüm rota ağacı dinamiktir.
 * Bkz. ADR-0022 Karar 5 + "Uygulama notu" ve
 * `docs/archive/progress-a05-a14-cookie-nonce-csp.md`.
 */
function applyCspNonce(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const csp = buildContentSecurityPolicy({ nonce })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // Sayfa dalı: hız sınırı kovalarına HİÇ dokunmaz (bkz. dosya başındaki not).
  if (!pathname.startsWith('/api')) {
    return applyCspNonce(request)
  }

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

    // A-10: hız sınırı aşımı görünür bir güvenlik olayı olarak loglanır (korelasyon: `event` +
    // maskelenmiş kova anahtarı). Önceden bu dosyada hiç `logger` importu yoktu — 429'lar
    // tamamen sessizdi (brute-force/limit taşması tespit edilemiyordu).
    logger.warn(
      { event: 'rate_limit_exceeded', path: pathname, key: maskRateLimitKey(bucketKey) },
      'Hız sınırı aşıldı'
    )

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
