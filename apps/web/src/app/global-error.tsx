'use client'

// Root layout çökerse devreye giren en dış hata sınırı. Kendi <html>/<body> sarmalayıcısını
// içerir ve minimum bağımlılıkla çalışır: Tailwind yüklenmemiş olabileceği için inline stil
// kullanılır, `@/lib/logger` İÇE AKTARILMAZ (yalnızca console.error).

import type { JSX } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): JSX.Element {
  console.error('Kök düzeyde kritik hata:', error)

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fef2f2',
          color: '#7f1d1d',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          role="alert"
          style={{
            backgroundColor: '#ffffff',
            padding: '2rem',
            borderRadius: '1.5rem',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            border: '1px solid #fecaca',
            maxWidth: '32rem',
            width: '100%',
          }}
        >
          <h2
            style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '1rem', color: '#dc2626' }}
          >
            Bir şeyler ters gitti
          </h2>
          <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
            Uygulama başlatılırken beklenmeyen bir hata oluştu.
          </p>
          {isDev && (
            <pre
              style={{
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                padding: '1rem',
                borderRadius: '0.75rem',
                overflow: 'auto',
                fontSize: '0.8rem',
                marginBottom: '1.5rem',
                border: '1px solid #fecaca',
              }}
            >
              {error.message}
            </pre>
          )}
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#b91c1c', marginBottom: '1.5rem' }}>
              Hata kodu: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontWeight: 700,
              borderRadius: '0.75rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Tekrar Dene
          </button>
        </div>
      </body>
    </html>
  )
}
