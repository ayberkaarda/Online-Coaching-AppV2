'use client'

// Route segment hata sınırı. GÜVENLİK: ham hata mesajı yalnızca development'ta gösterilir.

import { useEffect } from 'react'
import type { JSX } from 'react'

import Link from 'next/link'

import { logger } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): JSX.Element {
  useEffect(() => {
    logger.error({ err: error, digest: error.digest }, 'Sayfa hatası')
  }, [error])

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center bg-red-50 p-8 text-red-900 dark:bg-red-950/20 dark:text-red-200"
    >
      <div className="w-full max-w-2xl rounded-3xl border border-red-200 bg-white p-8 shadow-2xl dark:border-red-900 dark:bg-zinc-900">
        <h2 className="mb-4 text-3xl font-black text-red-600 dark:text-red-500">
          {isDev ? '🚨 Kritik Çökme Tespit Edildi!' : 'Bir şeyler ters gitti'}
        </h2>

        {isDev ? (
          <>
            <p className="mb-2 font-bold">Beyaz ekranın sebebi şu:</p>
            <div className="mb-6 w-full overflow-auto rounded-xl border border-red-200 bg-red-100 p-4 font-mono text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error.message}
            </div>
            {error.digest && <p className="mb-6 text-xs text-red-500">Hata kodu: {error.digest}</p>}
          </>
        ) : (
          <>
            <p className="mb-2 font-bold">
              Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin veya destek ekibiyle iletişime
              geçin.
            </p>
            {error.digest && <p className="mb-6 text-xs text-red-500">Hata kodu: {error.digest}</p>}
          </>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="flex-1 rounded-xl bg-red-600 px-6 py-3 font-bold text-white transition-all hover:bg-red-700"
          >
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="flex-1 rounded-xl border border-red-200 bg-white px-6 py-3 text-center font-bold text-red-600 transition-all hover:bg-red-50 dark:border-red-900 dark:bg-zinc-800 dark:text-red-400 dark:hover:bg-zinc-700"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  )
}
