'use client'

// TanStack Query durumlarını (yükleniyor / hata / boş / veri) tek yerden yöneten sarmalayıcı.

import type { ReactNode } from 'react'

import { ApiError } from '@repo/api-client/api/client'

import { EmptyState } from './EmptyState'
import { SkeletonCard } from './Skeleton'

export interface QueryStateProps {
  isLoading: boolean
  isError: boolean
  error?: unknown
  isEmpty?: boolean
  skeleton?: ReactNode
  emptyMessage?: string
  onRetry?: () => void
  children: ReactNode
}

const GENERIC_ERROR = 'Veriler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.'

function toMessage(error: unknown): string {
  if (ApiError.isApiError(error)) return error.message
  return GENERIC_ERROR
}

export function QueryState({
  isLoading,
  isError,
  error,
  isEmpty = false,
  skeleton,
  emptyMessage,
  onRetry,
  children,
}: QueryStateProps): ReactNode {
  if (isLoading) return skeleton ?? <SkeletonCard />

  if (isError) {
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900/40 dark:bg-red-950/20"
      >
        <p className="text-sm font-bold text-red-600 dark:text-red-400">{toMessage(error)}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white transition-transform active:scale-95"
          >
            Tekrar Dene
          </button>
        ) : null}
      </div>
    )
  }

  if (isEmpty) {
    return <EmptyState title={emptyMessage ?? 'Kayıt bulunamadı.'} />
  }

  return children
}
