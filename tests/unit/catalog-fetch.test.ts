// `fetchAllRows` (src/hooks/useCatalog.ts) birim testleri.
//
// SORUN: PostgREST `max_rows = 1000` (supabase/config.toml) tek istekte en fazla 1000
// satır döner — hata FIRLATMADAN sessizce keser. Katalog importu `exercises`'ı 1328,
// `food_database`'i 591 satıra çıkarınca eski `.select('*')` çağrısı 328 egzersizi
// sessizce kaybediyordu. `fetchAllRows` bu tavanı `.range()` sayfalamasıyla aşar; bu
// dosya sayfalama mantığını gerçek Supabase istemcisine dokunmadan, sahte bir
// `fetchPage` fonksiyonuyla test eder.

import { describe, expect, it, vi } from 'vitest'

import { CATALOG_MAX_PAGES, CATALOG_PAGE_SIZE, fetchAllRows } from '@/hooks/useCatalog'
import { logger } from '@/lib/logger'
import { SupabaseQueryError } from '@/lib/query/supabase-error'

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

interface Row {
  id: number
  name: string
}

function makeRows(count: number, startId = 0): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: startId + i, name: `row-${startId + i}` }))
}

describe('fetchAllRows', () => {
  it('1000 den fazla satır olduğunda birden fazla istek atar ve tümünü birleştirir (sessiz kesme regresyonu)', async () => {
    // 1328 satır: gerçek katalog importundaki exercises satır sayısıyla aynı senaryo.
    const page0 = makeRows(1000, 0)
    const page1 = makeRows(328, 1000)
    const fetchPage = vi.fn(async (from: number, to: number) => {
      if (from === 0 && to === 999) return { data: page0, error: null }
      if (from === 1000 && to === 1999) return { data: page1, error: null }
      throw new Error(`beklenmeyen aralık: ${from}-${to}`)
    })

    const result = await fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(1328)
    expect(result[0]).toEqual({ id: 0, name: 'row-0' })
    expect(result[1327]).toEqual({ id: 1327, name: 'row-1327' })
  })

  it('tam olarak sayfa boyutu kadar satır dönerse fazladan bir istek atılır, boş gelince durulur', async () => {
    const fullPage = makeRows(CATALOG_PAGE_SIZE, 0)
    const fetchPage = vi.fn(async (from: number) => {
      if (from === 0) return { data: fullPage, error: null }
      return { data: [], error: null }
    })

    const result = await fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(CATALOG_PAGE_SIZE)
  })

  it('sayfa boyutundan az satır dönerse tek istekle biter', async () => {
    const rows = makeRows(591, 0)
    const fetchPage = vi.fn(async () => ({ data: rows, error: null }))

    const result = await fetchAllRows<Row>(fetchPage, { table: 'food_database', op: 'select' })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(591)
  })

  it('boş tablo için tek istekle boş dizi döner', async () => {
    const fetchPage = vi.fn(async () => ({ data: [], error: null }))

    const result = await fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result).toEqual([])
  })

  it('data null dönerse boş sayfa gibi davranır ve döngüyü bitirir', async () => {
    const fetchPage = vi.fn(async () => ({ data: null, error: null }))

    const result = await fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(result).toEqual([])
  })

  it('hata durumunda SupabaseQueryError fırlatır ve .code alanını korur', async () => {
    const fetchPage = vi.fn(async () => ({
      data: null,
      error: { message: 'permission denied for table exercises', code: '42501' },
    }))

    await expect(
      fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })
    ).rejects.toMatchObject({
      name: 'SupabaseQueryError',
      code: '42501',
      table: 'exercises',
      op: 'select',
      message: 'permission denied for table exercises',
    })

    // Fırlatılan nesnenin gerçekten SupabaseQueryError sınıfından olduğu (instanceof) da
    // doğrulanır — yalnızca şekil değil, prototip zinciri de korunmalı.
    try {
      await fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })
      expect.unreachable('hata fırlatılmalıydı')
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseQueryError)
    }
  })

  it('ikinci sayfada hata olursa ilk sayfanın verisi sessizce yutulmaz, hata fırlatılır', async () => {
    const page0 = makeRows(CATALOG_PAGE_SIZE, 0)
    const fetchPage = vi.fn(async (from: number) => {
      if (from === 0) return { data: page0, error: null }
      return { data: null, error: { message: 'network error' } }
    })

    await expect(
      fetchAllRows<Row>(fetchPage, { table: 'exercises', op: 'select' })
    ).rejects.toBeInstanceOf(SupabaseQueryError)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('sonsuz döngü koruması: maxPages sınırına ulaşınca durur ve kısmi sonucu döner', async () => {
    // Her sayfa hep tam dolu döner — koruma olmasaydı sonsuza kadar sürerdi.
    const fetchPage = vi.fn(async () => ({ data: makeRows(CATALOG_PAGE_SIZE, 0), error: null }))

    const maxPages = 3
    const result = await fetchAllRows<Row>(
      fetchPage,
      { table: 'exercises', op: 'select' },
      CATALOG_PAGE_SIZE,
      maxPages
    )

    expect(fetchPage).toHaveBeenCalledTimes(maxPages)
    expect(result).toHaveLength(CATALOG_PAGE_SIZE * maxPages)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('varsayılan CATALOG_MAX_PAGES makul bir üst sınır tanımlar (0 değil, aşırı büyük de değil)', () => {
    expect(CATALOG_MAX_PAGES).toBeGreaterThan(0)
    expect(CATALOG_MAX_PAGES * CATALOG_PAGE_SIZE).toBeGreaterThan(1328)
  })
})
