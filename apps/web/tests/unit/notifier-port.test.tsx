// Bildirim portu (`@repo/api-client/notify`) — borç B-050.
//
// KAPSAM:
//   A) Sağlayıcı VARKEN: hook'un ürettiği metin ENJEKTE EDİLEN notifier'a düşer; paket
//      hiçbir web toast kütüphanesini kendisi çağırmaz.
//   B) Sağlayıcı YOKKEN: hook PATLAMAZ (`useSupabaseClient`'ın aksine fırlatmaz), mutasyon
//      normal biter ve bildirim sessizce yutulur — mobil ekranlar ve sağlayıcı kurmayan
//      testler bu sayede sarmalayıcısız çalışabilir.
//   C) No-op fallback MODÜL SEVİYESİNDE TEK sabittir (referans kararlılığı): sağlayıcısız
//      iki ayrı render aynı nesneyi görür, yoksa notifier'ı bağımlılık dizisinde taşıyan
//      yerler her render'da yeniden kurulurdu.

import type { ReactNode } from 'react'

import { NotifierProvider, useNotifier, type Notifier } from '@repo/api-client/notify'
import { useCreateDailyLog } from '@repo/api-client/hooks/useDailyLogs'
import { SupabaseClientProvider } from '@repo/api-client/context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asSupabaseClient } from './test-utils'

const upsertSingle = vi.fn()

const supabase = asSupabaseClient({
  from: (table: string) => {
    if (table !== 'daily_logs') throw new Error(`beklenmeyen tablo: ${table}`)
    return {
      upsert: () => ({ select: () => ({ single: upsertSingle }) }),
    }
  },
})

const DAILY_LOG_INPUT = {
  clientId: 'client-1',
  water_lt: 2.5,
  sodium_mg: 1800,
  macros: { protein: 150, carb: 200, fat: 60 },
  log_date: '2026-08-17',
}

function createWrapper(notifier?: Notifier) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <SupabaseClientProvider client={supabase}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SupabaseClientProvider>
    )
    // Sağlayıcı KASITLI olarak atlanabilir — B bölümü tam olarak bu hâli sınar.
    return notifier ? <NotifierProvider notifier={notifier}>{tree}</NotifierProvider> : tree
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('bildirim portu — enjeksiyon', () => {
  it('sağlayıcı varken başarı metni ENJEKTE EDİLEN notifier’a düşer', async () => {
    const notifier: Notifier = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
    upsertSingle.mockResolvedValue({
      data: { id: 'log-1', macros: { protein: 150, carb: 200, fat: 60 } },
      error: null,
    })

    const { result } = renderHook(() => useCreateDailyLog(), { wrapper: createWrapper(notifier) })
    result.current.mutate(DAILY_LOG_INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(notifier.success).toHaveBeenCalledWith('Günlük veriler kaydedildi.')
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('sağlayıcı varken hata metni de aynı porttan geçer', async () => {
    const notifier: Notifier = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
    upsertSingle.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    })

    const { result } = renderHook(() => useCreateDailyLog(), { wrapper: createWrapper(notifier) })
    result.current.mutate(DAILY_LOG_INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(notifier.error).toHaveBeenCalledWith(
      expect.stringContaining('Günlük veriler kaydedilemedi:')
    )
  })
})

describe('bildirim portu — sağlayıcısız çalışma', () => {
  it('sağlayıcı yokken hook FIRLATMAZ ve mutasyon normal tamamlanır', async () => {
    upsertSingle.mockResolvedValue({
      data: { id: 'log-1', macros: { protein: 150, carb: 200, fat: 60 } },
      error: null,
    })

    const { result } = renderHook(() => useCreateDailyLog(), { wrapper: createWrapper() })
    result.current.mutate(DAILY_LOG_INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.error).toBeNull()
  })

  it('no-op fallback her çağrıda AYNI nesnedir (referans kararlılığı)', () => {
    const first = renderHook(() => useNotifier(), { wrapper: createWrapper() })
    const second = renderHook(() => useNotifier(), { wrapper: createWrapper() })

    expect(first.result.current).toBe(second.result.current)
    // Çağrılabilir olmalı: yutulan bildirim hata üretmez.
    expect(() => first.result.current.info('yutulacak')).not.toThrow()
  })
})
