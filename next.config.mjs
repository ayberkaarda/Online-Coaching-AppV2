import path from 'node:path'
import { fileURLToPath } from 'node:url'

import withPWA from 'next-pwa'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// CSP'nin yapılandırılan Supabase örneğine (yerel yığın dahil) izin vermesi için
// NEXT_PUBLIC_SUPABASE_URL'den origin türetilir. Sabit *.supabase.co deseni
// `npx supabase start` ile gelen http://127.0.0.1:54321 adresini kapsamaz.
function supabaseCspOrigins() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return []
  try {
    const { origin } = new URL(raw)
    const wsOrigin = origin.replace(/^http/, 'ws')
    return [origin, wsOrigin]
  } catch {
    return []
  }
}

const supabaseOrigins = supabaseCspOrigins()

const isDev = process.env.NODE_ENV === 'development'

// NOT (TODO): script-src içindeki 'unsafe-inline', Next.js'in inline bootstrap
// script'i (App Router hydration verisi) nedeniyle şu an gerekli. Doğru çözüm
// nonce tabanlı CSP'ye geçmek (Next.js middleware'de nonce üretip
// `headers()` yerine response header'a enjekte etmek) — bu ayrı bir iş
// olarak takip edilmeli. 'unsafe-eval' YALNIZCA development'ta (Fast Refresh
// / webpack eval devtool) gereklidir, production build'de kaldırılır.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
  : "script-src 'self' 'unsafe-inline';"

const contentSecurityPolicy = [
  "default-src 'self';",
  scriptSrc,
  "style-src 'self' 'unsafe-inline';",
  `img-src 'self' data: blob: https://*.supabase.co https://ui-avatars.com ${supabaseOrigins[0] ?? ''};`,
  "font-src 'self' data:;",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${supabaseOrigins.join(' ')};`,
  "frame-ancestors 'none';",
  "base-uri 'self';",
  "form-action 'self';",
  "object-src 'none';",
  'upgrade-insecure-requests',
]
  .join(' ')
  .trim()

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Lint artık Next build'inin bir parçası değil; ayrı adım olarak
  // `npm run lint` (eslint .) ile ve CI'da çalıştırılıyor.
  // Ev dizinindeki başıboş bir lockfile yüzünden Next workspace kökünü yanlış
  // çıkarıyordu; standalone çıktısının doğru dosyaları toplaması için kök sabitlendi.
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Sadece antrenman loglarını (workout_logs) cache'le — asıl çevrimdışı
      // senaryo spor salonunda antrenman kaydı girmek.
      // `profiles` BİLİNÇLİ OLARAK bu listeden ÇIKARILDI: yanıt kullanıcının
      // e-postasını, beslenme planını ve antrenman programını içeriyor.
      // Paylaşılan bir cihazda bu veri logout sonrası cihazda kalıp bir
      // sonraki kullanıcı tarafından çevrimdışıyken görülebilirdi.
      urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/workout_logs.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offline-workout-data',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 1 Hafta hafızada tut
        },
      },
    },
    {
      // Form fotoğraflarını cihazda TUTMA (Hafıza dostu)
      urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public.*/i,
      handler: 'NetworkOnly',
    },
  ],
})(nextConfig)
