'use client'

// Root layout çökerse devreye giren en dış hata sınırı. Kendi <html>/<body> sarmalayıcısını
// içerir ve minimum bağımlılıkla çalışır: Tailwind yüklenmemiş olabileceği için inline stil
// kullanılır, `@/lib/logger` İÇE AKTARILMAZ (yalnızca console.error).

import type { JSX } from 'react'

import { tokens } from '@/design/tokens'

// Tailwind olmayabilir; renkler yine tek kaynaktan (açık tema) gelir.
const t = tokens.light

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
          backgroundColor: t.bg,
          color: t.textPrimary,
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          role="alert"
          style={{
            backgroundColor: t.surface,
            padding: '2rem',
            borderRadius: '16px',
            border: `1px solid ${t.border}`,
            maxWidth: '32rem',
            width: '100%',
          }}
        >
          <h2
            style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', color: t.danger }}
          >
            Bir şeyler ters gitti
          </h2>
          <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
            Uygulama başlatılamadı. Sayfayı yeniden dene; sorun sürerse koçuna haber ver.
          </p>
          {isDev && (
            <pre
              style={{
                backgroundColor: t.surfaceSunken,
                color: t.danger,
                padding: '1rem',
                borderRadius: '10px',
                overflow: 'auto',
                fontSize: '0.8rem',
                marginBottom: '1.5rem',
                border: `1px solid ${t.border}`,
              }}
            >
              {error.message}
            </pre>
          )}
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: t.textSecondary, marginBottom: '1.5rem' }}>
              Hata kodu: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              backgroundColor: t.accent,
              color: t.accentContrast,
              fontWeight: 700,
              borderRadius: '10px',
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
