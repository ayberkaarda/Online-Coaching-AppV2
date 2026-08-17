// Kök layout: global sağlayıcılar (React Query, tema, toast), skip link, üç yazı tipi
// ve genel <html>/<body> iskeleti.

import { Archivo, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google'

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
    default: 'Closed-Loop Coaching Hub',
    template: '%s | Coaching Hub',
  },
  description: 'Premium Birebir Koçluk ve Gelişim Paneli',
  applicationName: 'Coaching Hub',
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

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
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
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
