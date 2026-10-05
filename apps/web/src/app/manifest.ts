// PWA manifest (Next metadata route → /manifest.webmanifest). Renkler tek kaynaktan:
// zemin Kemik, tema rengi Kemik (sistem temasını izleyen `viewport.themeColor` layout'ta).
// İkonlar: Kor zemin üstünde tek renk 48'lik sembol (public/icon-192.png, icon-512.png).

import type { MetadataRoute } from 'next'

import { tokens } from '@/design/tokens'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sarmal',
    short_name: 'Sarmal',
    description: 'Birebir koçluk: antrenman, beslenme ve ilerleme tek yerde.',
    lang: 'tr',
    start_url: '/',
    display: 'standalone',
    background_color: tokens.light.bg,
    theme_color: tokens.light.bg,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
