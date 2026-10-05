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
        className="space-y-3 rounded-card border border-danger/30 bg-danger/10 p-5 text-center"
      >
        <p className="text-sm font-bold text-danger">{toMessage(error)}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-control bg-accent px-5 py-2 text-xs font-bold text-accent-fg transition-transform active:scale-[0.97]"
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
