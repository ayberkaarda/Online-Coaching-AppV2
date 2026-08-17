import path from 'node:path'
import { fileURLToPath } from 'node:url'

import withPWA from 'next-pwa'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// CSP'nin yapılandırılan Supabase örneğine (yerel yığın dahil) izin vermesi için
// NEXT_PUBLIC_SUPABASE_URL'den origin türetilir. Sabit *.supabase.co deseni
// `npx supabase start` ile gelen http://127.0.0.1:54321 adresini kapsamaz.
//
// A-15 (güvenlik denetimi, findings-app-surface.md): önceden `connect-src`/`img-src` bu somut
// origin'lere EK OLARAK sabit `https://*.supabase.co` (ve `wss://*.supabase.co`) wildcard'ı da
// içeriyordu — bu, *.supabase.co altındaki HERHANGİ bir Supabase projesine (kendi projemiz
// dışında) bağlanmayı serbest bırakıyordu; wildcard gereksizdi çünkü gerçek origin zaten ayrıca
// ekleniyordu. Wildcard'lar kaldırıldı, yalnızca bu fonksiyonun ürettiği somut origin'ler kalır.
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
// `connect-src` hem http(s) hem ws(s) origin'ine ihtiyaç duyar (`supabaseOrigins` ikisini de
// içerir); `img-src` yalnızca http(s) üzerinden resim çeker, ws origin'i orada anlamsızdır.
// Önceden `supabaseOrigins[0] ?? ''` kullanılıyordu — "ilk eleman http'tir" varsayımına
// örtük/kırılgan biçimde dayanıyordu. Burada niyet AÇIKÇA belirtiliyor.
const supabaseHttpOrigin = supabaseOrigins.find((origin) => origin.startsWith('http')) ?? ''

// GÜVENLİ BAŞARISIZLIK (A-15): production build'de `NEXT_PUBLIC_SUPABASE_URL` ayarlanmamışsa
// (dolayısıyla `supabaseCspOrigins()` boş dizi dönerse) CSP sessizce Supabase'e bağlanmayı
// tamamen engelleyen, uygulamayı komple kıran bir hâle düşerdi — hatasız ama kullanılamaz bir
// build. Sessiz kırılmadansa build'in kendisi anlaşılır bir hatayla patlaması tercih edildi.
if (process.env.NODE_ENV === 'production' && supabaseOrigins.length === 0) {
  throw new Error(
    'CSP yapılandırması başarısız: NEXT_PUBLIC_SUPABASE_URL ayarlanmamış veya geçersiz. ' +
      "Production build Supabase origin'i olmadan CSP `connect-src`/`img-src` üretemez " +
      "(bkz. docs/security/findings-app-surface.md A-15). Lütfen NEXT_PUBLIC_SUPABASE_URL'i " +
      'geçerli bir URL olarak ayarlayın.'
  )
}

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

// A-15: `*.supabase.co` wildcard'ları KALDIRILDI — yalnızca yukarıda türetilen somut
// origin'ler (`supabaseHttpOrigin`, `supabaseOrigins`) izinli. `ui-avatars.com` uygulamanın
// avatar fallback'i için bilerek KALIYOR. Boş origin'lerin çift boşluk üretmemesi için
// direktifler `filter(Boolean)` ile temiz birleştirilir.
const imgSrc = ["'self'", 'data:', 'blob:', 'https://ui-avatars.com', supabaseHttpOrigin].filter(
  Boolean
)
const connectSrc = ["'self'", ...supabaseOrigins].filter(Boolean)

const contentSecurityPolicy = [
  "default-src 'self';",
  scriptSrc,
  "style-src 'self' 'unsafe-inline';",
  `img-src ${imgSrc.join(' ')};`,
  "font-src 'self' data:;",
  `connect-src ${connectSrc.join(' ')};`,
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
