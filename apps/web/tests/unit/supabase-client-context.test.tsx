// ADR-0024 — Supabase istemcisinin enjeksiyon sözleşmesi ve REFERANS KARARLILIĞI.
//
// NEDEN BU DOSYA VAR: ADR'nin "Riskler" bölümü tek gerçek çalışma zamanı riskini adıyla
// koyuyor — `useMessages`/`usePresence` `supabase.channel(...)` realtime aboneliğini
// `useEffect` içinde kuruyor ve istemci bağımlılık dizisinde. Sağlayıcı her render'da YENİ
// bir istemci üretseydi kanal her render'da sökülüp yeniden kurulur (bağlantı çırpınması,
// kaçırılan mesajlar), ama hiçbir test kırmızıya dönmezdi. Bu dosya o davranışı ÖLÇER:
//
//   1) Provider dışında `useSupabaseClient()` net bir hatayla fırlatır (bilinçli davranış
//      değişikliği — eski singleton her zaman sessizce vardı).
//   2) Sağlayıcı altındaki tüketici, yeniden render'lar arasında AYNI referansı görür.
//   3) Gerçek `<Providers>` ağacı `createBrowserSupabaseClient()`'ı TEK KEZ çağırır
//      (`useState` fabrikası), kaç kez yeniden render edilirse edilsin.
//   4) `createBrowserSupabaseClient()` modül seviyesinde de tekilleştirilmiştir — koruma
//      iki katmanlıdır (`apps/web/src/lib/supabase/client.ts`).
//
// Kanal aboneliğinin GERÇEKTEN tek kere kurulduğu ayrıca
// `tests/unit/messages-realtime.test.ts` içinde `useMessages` üzerinden ölçülüyor.

import { render, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SupabaseClientProvider, useSupabaseClient } from '@repo/api-client/context'
import type { Database } from '@repo/types'
import type { SupabaseClient } from '@supabase/supabase-js'

import { asSupabaseClient } from './test-utils'

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// `<Providers>` ağacını gerçek `@supabase/ssr` istemcisi kurmadan sürebilmek için fabrika
// casuslanır — testin ölçtüğü şey fabrikanın KAÇ KEZ çağrıldığıdır.
const { createBrowserSupabaseClientSpy } = vi.hoisted(() => ({
  createBrowserSupabaseClientSpy: vi.fn(() => ({ marker: 'sahte-istemci' })),
}))

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: createBrowserSupabaseClientSpy,
}))

import { Providers } from '@/app/providers'

function ClientProbe({ onClient }: { onClient: (client: SupabaseClient<Database>) => void }) {
  onClient(useSupabaseClient())
  return null
}

describe('useSupabaseClient — enjeksiyon sözleşmesi', () => {
  it('sağlayıcı olmadan çağrılırsa açık bir hatayla fırlatır', () => {
    // React hata sınırı olmadığı için konsola düşen hatayı bastırıyoruz.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useSupabaseClient())).toThrowError(/SupabaseClientProvider/)
    consoleError.mockRestore()
  })

  it('sağlayıcıya verilen istemciyi aynen döndürür', () => {
    const client = asSupabaseClient({ marker: 'enjekte' })
    const { result } = renderHook(() => useSupabaseClient(), {
      wrapper: ({ children }) => (
        <SupabaseClientProvider client={client}>{children}</SupabaseClientProvider>
      ),
    })
    expect(result.current).toBe(client)
  })

  it('yeniden render edildiğinde AYNI referansı döndürür (realtime abonelik kararlılığı)', () => {
    const client = asSupabaseClient({ marker: 'enjekte' })
    const seen: unknown[] = []
    const { rerender } = renderHook(
      () => {
        seen.push(useSupabaseClient())
      },
      {
        wrapper: ({ children }) => (
          <SupabaseClientProvider client={client}>{children}</SupabaseClientProvider>
        ),
      }
    )

    for (let i = 0; i < 5; i += 1) rerender()

    expect(seen.length).toBeGreaterThan(1)
    expect(new Set(seen).size).toBe(1)
    expect(seen[0]).toBe(client)
  })
})

describe('<Providers> — istemci TEK KEZ üretilir', () => {
  it('yeniden render sayısından bağımsız olarak createBrowserSupabaseClient bir kez çağrılır', () => {
    createBrowserSupabaseClientSpy.mockClear()
    const seen: unknown[] = []

    const { rerender } = render(
      <Providers>
        <ClientProbe onClient={(client) => seen.push(client)} />
      </Providers>
    )

    for (let i = 0; i < 5; i += 1) {
      rerender(
        <Providers>
          <ClientProbe onClient={(client) => seen.push(client)} />
        </Providers>
      )
    }

    expect(createBrowserSupabaseClientSpy).toHaveBeenCalledTimes(1)
    expect(seen.length).toBeGreaterThan(1)
    expect(new Set(seen).size).toBe(1)
  })
})

describe('createBrowserSupabaseClient — modül seviyesi tekilleştirme', () => {
  it('arka arkaya iki çağrı AYNI örneği döner (ikinci koruma katmanı)', async () => {
    // `vi.mock` yukarıda modülü casusla değiştiriyor; burada GERÇEK modül yükleniyor.
    const actual =
      await vi.importActual<typeof import('@/lib/supabase/client')>('@/lib/supabase/client')

    expect(actual.createBrowserSupabaseClient()).toBe(actual.createBrowserSupabaseClient())
  })
})
