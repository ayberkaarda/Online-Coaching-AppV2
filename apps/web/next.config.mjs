import path from 'node:path'
import { fileURLToPath } from 'node:url'

import withPWA from 'next-pwa'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
// Faz 4.5 commit 2 (ADR-0023 madde 12b): uygulama artık `apps/web` altında.
// pnpm workspace'te bağımlılıklar REPO KÖKÜNDEKİ `node_modules/.pnpm` deposunda durur ve
// `apps/web/node_modules/*` oraya GÖRELİ symlink'lerle işaret eder. İzleme kökü `apps/web`
// bırakılırsa @vercel/nft symlink hedeflerini kökün DIŞINDA görüp standalone çıktısına
// kopyalamaz; imaj `Cannot find module` ile düşer. Bu yüzden kök, workspace kökü
// (iki dizin yukarısı) olarak sabitlenir — Next dokümantasyonundaki monorepo deseni
// (`path.join(__dirname, '../../')`, next.config `output.md` "Caveats") birebir budur.
const workspaceRoot = path.resolve(projectRoot, '..', '..')

// A-14 (borç B-007): CSP ARTIK BURADA ÜRETİLMİYOR. Nonce her istekte taze üretilmek zorunda
// olduğu için statik `headers()` yapılandırmasında üretilemez; `Content-Security-Policy`
// başlığı `src/lib/security/csp.ts` + `src/proxy.ts` ikilisine taşındı. Buradan da bir CSP
// yayılsaydı tarayıcı İKİ politikanın KESİŞİMİNİ uygulardı ve `'unsafe-inline'` içeren eski
// politika nonce'lu olanı sessizce etkisizleştirirdi. Aşağıdaki diğer güvenlik başlıkları
// (HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, X-DNS-Prefetch-Control)
// istek başına bir değere ihtiyaç duymadıkları için burada KALIR.
//
// Bu fonksiyon yalnızca aşağıdaki GÜVENLİ BAŞARISIZLIK kontrolü için duruyor; CSP'nin kendisi
// artık `src/lib/security/csp.ts` içindeki aynı isimli fonksiyondan türetiliyor.
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

// GÜVENLİ BAŞARISIZLIK (A-15): production build'de `NEXT_PUBLIC_SUPABASE_URL` ayarlanmamışsa
// (dolayısıyla `supabaseCspOrigins()` boş dizi dönerse) CSP sessizce Supabase'e bağlanmayı
// tamamen engelleyen, uygulamayı komple kıran bir hâle düşerdi — hatasız ama kullanılamaz bir
// build. Kontrol CSP üretimi taşındıktan sonra da BURADA duruyor: `src/proxy.ts` yalnızca
// ÇALIŞMA ANINDA koşar, oysa bu kontrolün amacı hatayı BUILD anında yakalamak. Sessiz
// kırılmadansa build'in kendisi anlaşılır bir hatayla patlaması tercih edildi.
if (process.env.NODE_ENV === 'production' && supabaseCspOrigins().length === 0) {
  throw new Error(
    'CSP yapılandırması başarısız: NEXT_PUBLIC_SUPABASE_URL ayarlanmamış veya geçersiz. ' +
      "Production build Supabase origin'i olmadan CSP `connect-src`/`img-src` üretemez " +
      "(bkz. docs/security/findings-app-surface.md A-15). Lütfen NEXT_PUBLIC_SUPABASE_URL'i " +
      'geçerli bir URL olarak ayarlayın.'
  )
}

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
  // Faz 4.5'ten beri bu kök `apps/web` değil MONOREPO KÖKÜ (yukarıdaki `workspaceRoot`).
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
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
