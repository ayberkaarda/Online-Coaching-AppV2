// `useMessages` realtime aboneliğinin KONUŞMA BAZINDA izole olduğunun kanıtı.
//
// BAĞLAM (bkz. supabase/migrations/20260817190400_realtime_publication.sql ve
// supabase/README.md §4h "Realtime"): sunucu tarafı ölçüm üç aktörle (koç,
// danışan A, danışan B) yapıldı ve `client_id=eq.<id>` filtresi + RLS'in
// başka bir konuşmanın olayını GERÇEKTEN engellediği kanıtlandı. Bu birim testi
// SUNUCUYU simüle etmez (mock'tur) — onun yerine İSTEMCİ TARAFINDAKİ izolasyon
// sözleşmesini kanıtlar: (a) her konuşma KENDİ kanalına ve KENDİ filtresine
// abone olur (`messages:client:<clientId>`, `client_id=eq.<clientId>`), (b) bir
// konuşmanın kendi callback'i tetiklendiğinde yalnızca O KONUŞMANIN react-query
// önbelleği güncellenir — başka bir açık konuşmanın önbelleği DOKUNULMAZ kalır.
//
// `src/hooks/useMessages.ts`'teki yorum bilerek şunu söylüyor: "İSTEMCİ TARAFI
// KONUŞMA FİLTRESİ KALDIRILDI — satırın bu konuşmaya ait olduğunu sunucu garanti
// ediyor." Yani istemcide ikinci bir savunma katmanı YOKTUR; izolasyonun tek
// kanıtı, her konuşmanın kendi (kanal, filtre, önbellek anahtarı) üçlüsüne sahip
// olmasıdır — bu test tam olarak bunu ölçer.

import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}))

// `vi.mock` fabrikaları dosyanın en üstüne hoist edilir (bkz. tests/unit/storage.test.ts
// aynı deseni kullanıyor) — mock durumu bu yüzden `vi.hoisted` içinde tutulur.
const { channelMock, removeChannelMock, fromMock, channelRegistry } = vi.hoisted(() => {
  interface HandlerEntry {
    filter?: string
    cb: (payload: { new: unknown }) => void
  }
  interface ChannelEntry {
    handlers: Map<string, HandlerEntry>
  }

  const registry = new Map<string, ChannelEntry>()

  const channel = vi.fn((name: string) => {
    const entry: ChannelEntry = { handlers: new Map() }
    registry.set(name, entry)
    const chan = {
      on: vi.fn(
        (
          _type: string,
          config: { event: string; filter?: string },
          cb: (payload: { new: unknown }) => void
        ) => {
          entry.handlers.set(config.event, { filter: config.filter, cb })
          return chan
        }
      ),
      subscribe: vi.fn(() => chan),
    }
    return chan
  })

  // Basit thenable sorgu inşacısı: `.select().eq()...` zinciri her adımda kendini
  // döner, sonunda `await` edildiğinde (veya `.maybeSingle()` çağrıldığında)
  // yapılandırılmış sonucu verir. Gerçek supabase-js query builder'ı da thenable'dır.
  function makeQueryBuilder(result: { data: unknown; error: unknown }) {
    const builder: Record<string, unknown> = {}
    const chain = () => builder
    builder.select = vi.fn(chain)
    builder.eq = vi.fn(chain)
    builder.or = vi.fn(chain)
    builder.order = vi.fn(chain)
    builder.limit = vi.fn(chain)
    builder.maybeSingle = vi.fn(() => Promise.resolve(result))
    builder.then = (resolve: (value: typeof result) => void, reject: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject)
    return builder
  }

  // `vi.hoisted` içinde tanımlanmalı: dosya seviyesindeki `COACH_ID` (aşağıda)
  // henüz TANIMLANMAMIŞ olurdu — hoisting `vi.mock`/`vi.hoisted` fabrikalarını
  // TÜM importlardan önce çalıştırır.
  const COACH_ID_HOISTED = '11111111-1111-1111-1111-111111111111'

  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return makeQueryBuilder({ data: { id: COACH_ID_HOISTED }, error: null })
    }
    if (table === 'messages') {
      return makeQueryBuilder({ data: [], error: null })
    }
    throw new Error(`beklenmeyen tablo: ${table}`)
  })

  return {
    channelMock: channel,
    removeChannelMock: vi.fn(),
    fromMock: from,
    channelRegistry: registry,
  }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: channelMock,
    removeChannel: removeChannelMock,
    from: fromMock,
  },
}))

import { QueryClient } from '@tanstack/react-query'

import { queryKeys } from '@/lib/query/keys'
import type { Message } from '@repo/types'

import { useMessages } from '@/hooks/useMessages'

const COACH_ID = '11111111-1111-1111-1111-111111111111'
const CLIENT_A = '22222222-2222-2222-2222-222222222222'
const CLIENT_B = '33333333-3333-3333-3333-333333333333'

function makeMessageRow(overrides: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    sender_id: COACH_ID,
    receiver_id: CLIENT_A,
    client_id: CLIENT_A,
    message: 'merhaba',
    is_read: false,
    read_at: null,
    kind: 'user',
    created_at: new Date().toISOString(),
    attachment_path: null,
    ...overrides,
  }
}

describe('useMessages realtime aboneliği — konuşma bazında izolasyon', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    channelRegistry.clear()
    channelMock.mockClear()
    removeChannelMock.mockClear()
    fromMock.mockClear()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    })
  })

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  it('her konuşma KENDİ kanalına ve `client_id=eq.<clientId>` filtresine abone olur', async () => {
    renderHook(() => useMessages(CLIENT_A, COACH_ID), { wrapper })
    renderHook(() => useMessages(CLIENT_B, COACH_ID), { wrapper })

    await waitFor(() => {
      expect(channelRegistry.has(`messages:client:${CLIENT_A}`)).toBe(true)
      expect(channelRegistry.has(`messages:client:${CLIENT_B}`)).toBe(true)
    })

    const channelA = channelRegistry.get(`messages:client:${CLIENT_A}`)
    const channelB = channelRegistry.get(`messages:client:${CLIENT_B}`)

    expect(channelA?.handlers.get('INSERT')?.filter).toBe(`client_id=eq.${CLIENT_A}`)
    expect(channelB?.handlers.get('INSERT')?.filter).toBe(`client_id=eq.${CLIENT_B}`)
    // İki konuşmanın filtresi/kanalı BİRBİRİNDEN FARKLIDIR — bu, sunucunun
    // (RLS + filter) hangi olayı kime teslim edeceğinin istemci tarafındaki
    // ön koşuludur.
    expect(channelA?.handlers.get('INSERT')?.filter).not.toBe(
      channelB?.handlers.get('INSERT')?.filter
    )
  })

  it('UPDATE olayı için de aynı konuşma filtresine abone olunur (okundu bilgisinin canlı düşmesi için)', async () => {
    renderHook(() => useMessages(CLIENT_A, COACH_ID), { wrapper })

    await waitFor(() => {
      expect(channelRegistry.has(`messages:client:${CLIENT_A}`)).toBe(true)
    })

    const channelA = channelRegistry.get(`messages:client:${CLIENT_A}`)
    expect(channelA?.handlers.get('UPDATE')?.filter).toBe(`client_id=eq.${CLIENT_A}`)
  })

  it('bir konuşmanın INSERT olayı YALNIZCA o konuşmanın önbelleğine yazılır; başka açık konuşmanın önbelleği dokunulmaz kalır', async () => {
    const { result: resultA } = renderHook(() => useMessages(CLIENT_A, COACH_ID), { wrapper })
    const { result: resultB } = renderHook(() => useMessages(CLIENT_B, COACH_ID), { wrapper })

    await waitFor(() => {
      expect(channelRegistry.has(`messages:client:${CLIENT_A}`)).toBe(true)
      expect(channelRegistry.has(`messages:client:${CLIENT_B}`)).toBe(true)
    })

    // İkisinin de geçmiş sorgusu (mock: boş liste) çözülsün.
    await waitFor(() => {
      expect(resultA.current.data).toEqual([])
      expect(resultB.current.data).toEqual([])
    })

    const insertHandlerA = channelRegistry
      .get(`messages:client:${CLIENT_A}`)
      ?.handlers.get('INSERT')?.cb
    expect(insertHandlerA).toBeDefined()

    const newRowForA = makeMessageRow({
      sender_id: COACH_ID,
      receiver_id: CLIENT_A,
      client_id: CLIENT_A,
      message: 'A için özel mesaj',
    })

    insertHandlerA?.({ new: newRowForA })

    await waitFor(() => {
      const cacheA = queryClient.getQueryData<Message[]>(queryKeys.messages(CLIENT_A, COACH_ID))
      expect(cacheA?.some((m) => m.id === newRowForA.id)).toBe(true)
    })

    // B'NİN ÖNBELLEĞİ DOKUNULMAZ KALIR — A'nın kanalı üzerinden tetiklenen bir
    // olay B'nin sorgu anahtarına ASLA yazmamalıdır (ayrı kanal, ayrı filtre,
    // ayrı anahtar).
    const cacheB = queryClient.getQueryData<Message[]>(queryKeys.messages(CLIENT_B, COACH_ID))
    expect(cacheB).toEqual([])
    expect(cacheB?.some((m) => m.id === newRowForA.id)).toBe(false)
  })

  it('aynı mesaj iki kez INSERT edilirse önbellekte TEKİL kalır (id ile dedupe)', async () => {
    const { result } = renderHook(() => useMessages(CLIENT_A, COACH_ID), { wrapper })

    await waitFor(() => {
      expect(channelRegistry.has(`messages:client:${CLIENT_A}`)).toBe(true)
    })
    await waitFor(() => expect(result.current.data).toEqual([]))

    const insertHandler = channelRegistry
      .get(`messages:client:${CLIENT_A}`)
      ?.handlers.get('INSERT')?.cb
    const row = makeMessageRow({ client_id: CLIENT_A, receiver_id: CLIENT_A })

    insertHandler?.({ new: row })
    insertHandler?.({ new: row })

    await waitFor(() => {
      const cache = queryClient.getQueryData<Message[]>(queryKeys.messages(CLIENT_A, COACH_ID))
      expect(cache?.filter((m) => m.id === row.id)).toHaveLength(1)
    })
  })

  it('UPDATE olayı yalnızca eşleşen id satırının read_at/is_read alanını yansıtır, listedeki diğer satırlara dokunmaz', async () => {
    const { result } = renderHook(() => useMessages(CLIENT_A, COACH_ID), { wrapper })
    await waitFor(() => {
      expect(channelRegistry.has(`messages:client:${CLIENT_A}`)).toBe(true)
    })
    await waitFor(() => expect(result.current.data).toEqual([]))

    const handlers = channelRegistry.get(`messages:client:${CLIENT_A}`)?.handlers
    const insertHandler = handlers?.get('INSERT')?.cb
    const updateHandler = handlers?.get('UPDATE')?.cb

    const rowOne = makeMessageRow({ client_id: CLIENT_A, message: 'ilk' })
    const rowTwo = makeMessageRow({ client_id: CLIENT_A, message: 'ikinci' })
    insertHandler?.({ new: rowOne })
    insertHandler?.({ new: rowTwo })

    await waitFor(() => {
      const cache = queryClient.getQueryData<Message[]>(queryKeys.messages(CLIENT_A, COACH_ID))
      expect(cache).toHaveLength(2)
    })

    const readAt = new Date().toISOString()
    updateHandler?.({ new: { ...rowOne, read_at: readAt, is_read: true } })

    await waitFor(() => {
      const cache = queryClient.getQueryData<Message[]>(queryKeys.messages(CLIENT_A, COACH_ID))
      const updated = cache?.find((m) => m.id === rowOne.id)
      const untouched = cache?.find((m) => m.id === rowTwo.id)
      expect(updated?.read_at).toBe(readAt)
      expect(untouched?.read_at).toBeNull()
    })
  })
})
