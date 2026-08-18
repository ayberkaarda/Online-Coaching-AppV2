// Bileşen testleri için ortak render/QueryClient yardımcıları.
// Global mock'lar (ör. `vi.mock('sonner', ...)`) BURAYA konmaz — `vi.mock` hoisting
// dosya bazlıdır, bu yüzden her test dosyası kendi mock'unu kurar.

import type { ReactElement, ReactNode } from 'react'

import { SupabaseClientProvider } from '@repo/api-client/context'
import type { Database } from '@repo/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'

/**
 * Faz 4.5 commit 5 (ADR-0024): `@repo/api-client` hook'ları Supabase istemcisini artık
 * modül singleton'ından DEĞİL `<SupabaseClientProvider>`'dan alıyor. Testler bu yüzden
 * `vi.mock('@/lib/supabase/client', ...)` yerine sahte bir istemci NESNESİ kurup enjekte
 * eder — hoisting sorunu olmadığı için `vi.hoisted` da gerekmez.
 *
 * Yalnızca testin gerçekten kullandığı metotları taşıyan kısmi bir nesneyi tam istemci
 * tipine daraltır; `as unknown as` her test dosyasında tekrarlanmasın diye burada.
 */
export function asSupabaseClient(stub: unknown): SupabaseClient<Database> {
  return stub as SupabaseClient<Database>
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export interface RenderWithProvidersOptions {
  queryClient?: QueryClient
  /** Enjekte edilecek sahte Supabase istemcisi (bkz. `asSupabaseClient`). */
  supabaseClient?: SupabaseClient<Database>
}

/**
 * `renderHook` için sarmalayıcı: QueryClient + (verilirse) SupabaseClientProvider.
 * Bileşen değil hook süren testler `renderWithProviders` yerine bunu kullanır.
 */
export function createHookWrapper(options: RenderWithProvidersOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient()
  const supabaseClient = options.supabaseClient

  function Wrapper({ children }: { children: ReactNode }) {
    const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    if (!supabaseClient) return tree
    return <SupabaseClientProvider client={supabaseClient}>{tree}</SupabaseClientProvider>
  }

  return { Wrapper, queryClient }
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {}
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options.queryClient ?? createTestQueryClient()

  const tree = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {ui}
      </ThemeProvider>
    </QueryClientProvider>
  )

  const result = render(
    options.supabaseClient ? (
      <SupabaseClientProvider client={options.supabaseClient}>{tree}</SupabaseClientProvider>
    ) : (
      tree
    )
  )

  return { ...result, queryClient }
}

export { screen, waitFor, within, fireEvent } from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
