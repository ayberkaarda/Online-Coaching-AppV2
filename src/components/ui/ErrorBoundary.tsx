'use client'

// React hata sınırı. Beklenmeyen render hatalarında uygulamanın tamamen çökmesini engeller.
// GÜVENLİK: hata detayı yalnızca geliştirme ortamında gösterilir.

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
        className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/40 dark:bg-red-950/20"
      >
        <p className="text-2xl" aria-hidden="true">
          ⚠️
        </p>
        <h2 className="text-base font-black text-red-600 dark:text-red-400">
          Bir şeyler ters gitti
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Bu bölüm yüklenirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.
        </p>
        {isDev && (
          <pre className="overflow-x-auto rounded-lg bg-white p-3 text-left text-[11px] text-red-500 dark:bg-black">
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={this.reset}
          className="rounded-xl bg-brand-purple px-5 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
        >
          Tekrar Dene
        </button>
      </div>
    )
  }
}
