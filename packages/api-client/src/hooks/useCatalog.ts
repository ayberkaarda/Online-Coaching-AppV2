'use client'

// Salt-okunur referans katalogları (egzersizler, besinler).
// Nadiren değiştikleri için 30 dakika taze kabul edilir.
//
// ASGARİ ÇÖZÜM NOTU — katalog sessiz kesme kusuru: `supabase/config.toml`'daki
// `max_rows = 1000` PostgREST'in TEK istekte dönebileceği satır sayısını sınırlayan
// bilinçli bir DoS/güvenlik korumasıdır ve YÜKSELTİLMEMELİDİR. Katalog importu
// `exercises`'ı 1328, `food_database`'i 591 satıra çıkarınca bu tavan eski
// `.select('*')` çağrısını hiçbir hata vermeden SESSİZCE 1000 satırda kesiyordu.
// Aşağıdaki `fetchAllRows` bu tavanı `.range()` sayfalamasıyla aşıp TÜM satırları
// istemciye çeker.
//
// BU KALICI ÇÖZÜM DEĞİL: tüm kataloğu istemciye çekmek, katalog büyüdükçe yeniden
// yavaşlayacak/ölçeklenmeyecek bir ödünç (borç). Kalıcı çözüm — sunucu taraflı arama
// + sayfalama — Faz 2 egzersiz kütüphanesi işine bağlıdır; o güne kadar bu dosya
// yalnızca "sessizce veri kaybetme" kusurunu kapatır, ilk yüklemedeki toplam veri
// hacmini azaltmaz.

import { useQuery } from '@tanstack/react-query'

import { logger } from '@repo/logger'
import { queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import type { Exercise, FoodItem } from '@repo/types'

const CATALOG_STALE_TIME = 30 * 60_000

/** PostgREST `max_rows` (bkz. supabase/config.toml) ile aynı: tek sayfada istenen satır sayısı. */
export const CATALOG_PAGE_SIZE = 1000

/**
 * Sonsuz döngü koruması: `fetchAllRows` en fazla bu kadar sayfa çeker (50 × 1000 = 50.000
 * satıra kadar). Katalog bugün bu boyuta yakın bile değil; tavan yalnızca beklenmeyen bir
 * sunucu davranışında (ör. `range` yok sayılıp her sayfa hep dolu dönerse) döngünün
 * SONSUZA gitmesini engellemek için var.
 */
export const CATALOG_MAX_PAGES = 50

interface CatalogPageResult<T> {
  data: T[] | null
  error: { message: string; code?: string } | null
}

type CatalogPageFetcher<T> = (from: number, to: number) => PromiseLike<CatalogPageResult<T>>

/**
 * `max_rows` tavanını `.range()` sayfalamasıyla aşan genel yardımcı.
 * `fetchPage(from, to)` dönen satır sayısı `pageSize`'dan AZ olana kadar art arda
 * çağrılır ve tüm sayfalar tek bir diziye birleştirilir. Hata durumunda mevcut
 * `wrapSupabaseError(error, context)` sözleşmesi (bkz. `.code` alanının korunması) aynen
 * korunur — çağıran taraf `SupabaseQueryError` alır, düz `Error` değil.
 */
export async function fetchAllRows<T>(
  fetchPage: CatalogPageFetcher<T>,
  context: { table: string; op: 'select' },
  pageSize: number = CATALOG_PAGE_SIZE,
  maxPages: number = CATALOG_MAX_PAGES
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await fetchPage(from, to)
    if (error) throw wrapSupabaseError(error, context)

    const batch = data ?? []
    rows.push(...batch)

    // Sayfa tam dolu gelmediyse bu son sayfadır — bir sonraki (muhtemelen boş)
    // isteği atmadan burada dur.
    if (batch.length < pageSize) return rows
  }

  // Buraya yalnızca `maxPages` sayfa da TAM DOLU gelirse ulaşılır — normal katalog
  // boyutlarında beklenmez. Sessizce eksik veri döndürmek yerine görünür bir uyarı bırakılır.
  logger.warn(
    { table: context.table, fetchedRows: rows.length, maxPages, pageSize },
    'Katalog sayfalama üst sınırına ulaştı — sonsuz döngü koruması devrede, sonuç eksik olabilir.'
  )
  return rows
}

export function useExercises() {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.exercises(),
    staleTime: CATALOG_STALE_TIME,
    queryFn: (): Promise<Exercise[]> =>
      fetchAllRows<Exercise>(
        (from, to) =>
          supabase.from('exercises').select('*').order('name', { ascending: true }).range(from, to),
        { table: 'exercises', op: 'select' }
      ),
  })
}

export function useFoods() {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.foods(),
    staleTime: CATALOG_STALE_TIME,
    queryFn: (): Promise<FoodItem[]> =>
      fetchAllRows<FoodItem>(
        (from, to) =>
          supabase
            .from('food_database')
            .select('*')
            .order('name', { ascending: true })
            .range(from, to),
        { table: 'food_database', op: 'select' }
      ),
  })
}
