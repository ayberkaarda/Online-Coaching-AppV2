'use client'

// Route segment hata sınırı. GÜVENLİK: ham hata mesajı yalnızca development'ta gösterilir.

import { TriangleAlert } from 'lucide-react'
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
      className="flex min-h-screen flex-col items-center justify-center bg-danger/10 p-8 text-danger"
    >
      <div className="w-full max-w-2xl rounded-card border border-danger/30 bg-surface p-8">
        <h2 className="mb-4 flex items-center gap-3 text-3xl font-bold text-danger">
          {isDev ? (
            <>
              <TriangleAlert aria-hidden="true" className="h-7 w-7 shrink-0" />
              Kritik Çökme Tespit Edildi!
            </>
          ) : (
            'Bir şeyler ters gitti'
          )}
        </h2>

        {isDev ? (
          <>
            <p className="mb-2 font-bold">Beyaz ekranın sebebi şu:</p>
            <div className="mb-6 w-full overflow-auto rounded-control border border-danger/30 bg-danger/15 p-4 font-mono text-sm text-danger">
              {error.message}
            </div>
            {error.digest && <p className="mb-6 text-xs text-danger">Hata kodu: {error.digest}</p>}
          </>
        ) : (
          <>
            <p className="mb-2 font-bold">
              Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin veya destek ekibiyle iletişime
              geçin.
            </p>
            {error.digest && <p className="mb-6 text-xs text-danger">Hata kodu: {error.digest}</p>}
          </>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="flex-1 rounded-control bg-danger px-6 py-3 font-bold text-surface transition-all hover:bg-danger/90"
          >
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="flex-1 rounded-control border border-danger/30 bg-surface px-6 py-3 text-center font-bold text-danger transition-all hover:bg-danger/10"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  )
}
