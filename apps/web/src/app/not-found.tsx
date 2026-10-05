// 404 sayfası: mevcut tasarım diliyle uyumlu (kart, accent).

import { Compass } from 'lucide-react'
import type { JSX } from 'react'

import Link from 'next/link'

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface p-8 text-center">
        <Compass aria-hidden="true" className="mx-auto h-12 w-12 text-accent" />
        <h1 className="font-display text-3xl font-bold text-fg">404</h1>
        <p className="text-sm font-medium text-fg-muted">Aradığınız sayfa bulunamadı.</p>
        <Link
          href="/"
          className="inline-block w-full rounded-control bg-accent py-3 text-sm font-bold text-accent-fg transition-colors hover:bg-accent/90"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  )
}
