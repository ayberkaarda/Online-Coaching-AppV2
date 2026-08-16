// TanStack Query istemcisi ve varsayılanları.
// Sunucuda her istek için yeni client, tarayıcıda tekil client kullanılır.

import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api/client'

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // 4xx istemci hatalarını tekrar denemenin anlamı yok.
        retry: (failureCount: number, error: Error) => {
          if (ApiError.isApiError(error) && error.status >= 400 && error.status < 500) return false
          return failureCount < 2
        },
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

let browserQueryClient: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Sunucu: istekler arasında önbellek paylaşılmamalı.
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
