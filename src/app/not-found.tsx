// 404 sayfası: mevcut tasarım diliyle uyumlu (rounded-3xl kart, accent).

import type { JSX } from 'react'

import Link from 'next/link'

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0f0f12]">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-2xl dark:border-zinc-800 dark:bg-[#16161d]">
        <p className="text-5xl" aria-hidden="true">
          🧭
        </p>
        <h1 className="bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-3xl font-black text-transparent">
          404
        </h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Aradığınız sayfa bulunamadı.
        </p>
        <Link
          href="/"
          className="inline-block w-full rounded-xl bg-gradient-to-r from-accent to-purple-600 py-3 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-accent"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  )
}
