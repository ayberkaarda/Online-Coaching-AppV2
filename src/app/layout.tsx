// Kök layout: global sağlayıcılar (React Query, tema, toast), skip link ve genel <html>/<body> iskeleti.

import type { Metadata, Viewport } from 'next'
import type { JSX, ReactNode } from 'react'

import { Providers } from '@/app/providers'

import './globals.css'

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f12' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased transition-colors duration-300 selection:bg-brand-purple/30 dark:bg-[#0f0f12] dark:text-slate-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-3 focus:rounded-lg focus:bg-brand-purple focus:px-4 focus:py-2 focus:text-white"
        >
          İçeriğe geç
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
