'use client'

// React hata sınırı. Beklenmeyen render hatalarında uygulamanın tamamen çökmesini engeller.
// GÜVENLİK: hata detayı yalnızca geliştirme ortamında gösterilir.

import { TriangleAlert } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { logger } from '@/lib/logger'

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(
      { err: { name: error.name, message: error.message }, componentStack: info.componentStack },
      'Bileşen hatası yakalandı'
    )
    this.props.onError?.(error, info)
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const isDev = process.env.NODE_ENV === 'development'

    return (
      <div
        role="alert"
        className="space-y-3 rounded-card border border-danger/30 bg-danger/10 p-6 text-center"
      >
        <TriangleAlert aria-hidden="true" className="mx-auto h-7 w-7 text-danger" />
        <h2 className="text-base font-bold text-danger">Bir şeyler ters gitti</h2>
        <p className="text-sm text-fg-muted">
          Bu bölüm yüklenirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </p>
        {isDev && (
          <pre className="overflow-x-auto rounded-lg bg-surface-sunken p-3 text-left font-mono text-[11px] text-danger">
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="rounded-control bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg transition-transform active:scale-[0.97]"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }
}
