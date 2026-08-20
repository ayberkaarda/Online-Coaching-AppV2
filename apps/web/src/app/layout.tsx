// Kök layout: global sağlayıcılar (React Query, tema, toast), skip link, üç yazı tipi
// ve genel <html>/<body> iskeleti.

import { Archivo, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import { connection } from 'next/server'

import type { Metadata, Viewport } from 'next'
import type { JSX, ReactNode } from 'react'

import { Providers } from '@/app/providers'

import './globals.css'

// ADR-0015 tipografisi. Üç ailenin de `latin-ext` alt kümesi AÇIK — Türkçe
// `ı İ ş ğ ç ö ü` karakterleri bu alt kümede yer alır.
//
// Ağırlıklar TEK TEK sayılır (`weight: 'variable'` DEĞİL): değişken kesim
// 100–900 aralığının tamamını açardı ve ADR-0015'in "ağırlık tavanı 700, 900
// sistemde hiç tanımlanmaz" kararını (AC-1.6.6) delerdi. Bedeli, Archivo'nun
// `wdth` genişlik ekseninin kullanılamamasıdır; hiyerarşi Katman B'de boyutla kurulur.

/** Display — yalnızca sayfa/sekme başlıkları ve büyük sayılar. Paragrafta asla. */
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-display',
})

/** Gövde metni. Inter bilinçli olarak seçilmedi (her ürünün varsayılanı). */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-sans',
})

/** Veri: sayaç, kg/tekrar, gramaj, grafik eksenleri. Tabular figürler globals.css'te. */
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['500'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'Sarmal',
    template: '%s | Sarmal',
  },
  description: 'Premium Birebir Koçluk ve Gelişim Paneli',
  applicationName: 'Sarmal',
  // manifest: '/manifest.json', // next-pwa tarafından üretilir
}

export const viewport: Viewport = {
  // Tebeşir / Demir — gövde zemini ve `.glass-panel` ile senkron (AC-1.6.8).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F1' },
    { media: '(prefers-color-scheme: dark)', color: '#14161B' },
  ],
  width: 'device-width',
  initialScale: 1,
}

// A-14 (borç B-007) — NONCE TABANLI CSP DİNAMİK RENDER ZORUNLU KILAR.
//
// Nonce yalnızca SUNUCUDA render edilen sayfalara uygulanabilir: build zamanında üretilmiş
// statik HTML'in bootstrap script'inde nonce olmaz ve `script-src 'self' 'nonce-<n>'` onu
// bloklar — sonuç beyaz ekrandır (kaynak:
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Static vs Dynamic
// Rendering with CSP": "When you use nonces in your CSP, all pages must be dynamically
// rendered"). Bu geçişten önce `/`, `/login`, `/profile`, `/users` ve `/_not-found` statik (○)
// üretiliyordu.
//
// NEDEN SAYFA BAŞINA DEĞİL DE KÖK LAYOUT'TA: dört sayfanın dördü de `'use client'`. Next 16
// route segment config'ini (`export const dynamic = 'force-dynamic'`) bir istemci bileşeni
// dosyasından SESSİZCE YOK SAYAR — denendi, build route tablosunda dört sayfa da `○` kaldı
// (yalnızca sunucu bileşeni olan `not-found.tsx` `ƒ`ye döndü). Dokümanın önerdiği
// `await connection()` ise yalnızca sunucu bileşenlerinde çalışır; bu ağaçtaki tek sunucu
// bileşeni kök layout'tur ve her rotanın parçasıdır — burada beklemek tüm ağacı dinamikleştirir.
//
// Bedeli ADR-0022 Karar 5'te kabul edildi: bu sayfalar zaten auth-gated, veriyi TanStack Query
// ile istemcide çeken kabuklar; build'de anlamlı içerik prerender edilmiyordu, ISR/CDN kenar
// önbelleği ve PPR hâlihazırda kullanılmıyordu.
export default async function RootLayout({
  children,
}: {
  children: ReactNode
}): Promise<JSX.Element> {
  // Gelen isteği bekle — bu segment (dolayısıyla tüm rota) artık istek anında render edilir.
  await connection()

  // A-14: `next-themes` tema-flash önleyici bir INLINE `<script>` render ediyor. `script-src`
  // artık `'unsafe-inline'` içermediği için o script nonce almazsa BLOKLANIR (her sayfada bir
  // CSP ihlali + karanlık modda FOUC). Nonce'u `src/proxy.ts` üretip `x-nonce` İSTEK başlığına
  // yazıyor; Next aynı nonce'u istek başlığındaki CSP'den ayrıştırıp kendi script'lerine zaten
  // uyguluyor, burada okunan değer onunla AYNI olandır. Proxy'nin çalışmadığı bir yol olursa
  // `undefined` iner ve `next-themes` nonce'suz (bugünkü) davranışına düşer.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${hankenGrotesk.variable} ${archivo.variable} ${ibmPlexMono.variable}`}
    >
      {/* Zemin ve metin semantik token'lardan gelir; `dark:` varyantı GEREKMEZ —
          token'ın kendisi temaya göre değişir (ADR-0015). */}
      <body className="min-h-screen bg-canvas font-sans text-fg antialiased transition-colors duration-300 selection:bg-accent/30">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-3 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
        >
          İçeriğe geç
        </a>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  )
}
