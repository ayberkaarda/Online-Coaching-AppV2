// TanStack Query istemcisi ve varsayılanları.
// Sunucuda her istek için yeni client, tarayıcıda tekil client kullanılır.

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'

import { ApiError } from '../api/client'
import { queryKeys } from './keys'
import { logClientSecurityEvent } from './security-event'
import { SupabaseQueryError } from './supabase-error'

// ---------------------------------------------------------------------------
// A-10 kalanı (bkz. docs/security/AUDIT.md §4c): RLS reddi (`42501`) merkezi loglaması.
// ---------------------------------------------------------------------------
//
// MERKEZİ ÇÖZÜM SEÇİLDİ: `packages/api-client/src/hooks/**` altındaki ~26 sorgu/mutasyon çağrı noktasının her birine
// tekrarlayan bir `catch (err) { if (err.code === '42501') logSecurityEvent(...) }` bloğu
// eklemek yerine, TanStack Query'nin `QueryCache`/`MutationCache` `onError` kancaları TEK
// noktadan kullanılıyor — her sorgu/mutasyon hatası buradan geçer. Hook'ların tek değişikliği
// `throw new Error(error.message)` yerine `throw wrapSupabaseError(error, { table, op })`
// kullanmaları (bkz. `./supabase-error.ts`) — bu, düz `Error`'ın attığı `.code` alanını taşır;
// `.message` birebir aynı kaldığı için mevcut `notify.error` metinleri DEĞİŞMEZ.
//
// Tarayıcı-sunucu tuzağı için `./security-event.ts`'e bakın: `apps/web/src/lib/api/response.ts`'teki
// `logSecurityEvent()` burada KASITLI OLARAK kullanılmıyor (o modül `next/server` içe aktarıyor).
function reportRlsDenialIfNeeded(error: unknown, client: QueryClient): void {
  if (!(error instanceof SupabaseQueryError) || error.code !== '42501') return

  // `userId` en iyi çaba (best-effort) ile okunur: `useSession()` önbelleği doldurduysa senkron
  // olarak buradan alınır, doldurmadıysa (ör. oturum henüz yüklenmeden bir sorgu başarısız
  // olduysa) alan atlanır — spesifikasyon "userId (varsa)" diyor, zorunlu değil.
  const session = client.getQueryData<Session | null>(queryKeys.session())

  logClientSecurityEvent('rls_denied', {
    table: error.table,
    op: error.op,
    userId: session?.user.id,
  })
}

export function makeQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => reportRlsDenialIfNeeded(error, client),
    }),
    mutationCache: new MutationCache({
      onError: (error) => reportRlsDenialIfNeeded(error, client),
    }),
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

  return client
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
