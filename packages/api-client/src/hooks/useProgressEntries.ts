'use client'

// İlerleme takibi — kilo/ölçü girişi ve TREND SERİSİ (Faz 4c, §6).
//
// Bu dosya `progress_entries` tablosunun TEK istemci giriş kapısıdır
// (20260817220000_progress_tracking.sql). İki yükümlülüğü vardır:
//
//   AC-4.1 "Aynı güne ikinci kilo girişi eskisini GÜNCELLER, duplicate satır
//          OLUŞMAZ."
//     -> `upsert(..., { onConflict: 'client_id,entry_date' })`. Tekillik kısıtı
//        (`progress_entries_client_date_uniq`) ŞEMADA vardır; `onConflict` o
//        kısıtı arbiter olarak seçer. Kısıt olmasaydı çağrı `42P10` ile
//        kırılırdı — yani AC-4.1 iki katmanda birden garantidir.
//
//   AC-4.2 "Grafik verisi TEK ENDPOINT'ten gelir ve TÜM EKRANLAR AYNI SERİYİ
//          çizer."
//     -> Migration KARAR 5 bunun bir RPC OLMAYACAĞINI, İSTEMCİ VERİ KATMANINDA
//        yaşayacağını yazıyor. Somut karşılığı şudur:
//          * TEK sorgu anahtarı  — `queryKeys.progressEntries(clientId, rangeDays)`
//          * TEK sorgu fonksiyonu — `progressEntriesQueryOptions()`
//          * TEK seri üreticisi   — `buildTrendSeries()` (SAF fonksiyon)
//        `useProgressEntries` ham satırları, `useProgressTrend` ise AYNI
//        anahtar/AYNI istek üzerinden `select` ile TÜRETİLMİŞ seriyi döner —
//        yani ikinci bir ağ isteği YOKTUR ve iki ekran aynı anahtarı
//        paylaştığı için AYNI seriyi çizer. Yeni bir ekran trend çizmek
//        isterse `useProgressTrend`i (ya da saf `buildTrendSeries`i) çağırır;
//        kendi sorgusunu YAZMAZ.
//
// KOÇ SALT OKUR (§6, migration KARAR 3). RLS: SELECT `client_id = auth.uid()
// or is_coach()`, INSERT/UPDATE/DELETE yalnızca `client_id = auth.uid()`.
// Bu dosyadaki mutasyon İSTEMCİ TARAFINDA rol kontrolü YAPMAZ — tek doğruluk
// kaynağı RLS'tir (42501). Arayüzün koça yazma eylemini hiç SUNMAMASI
// `StatsTab.tsx`'in görevidir (`NutritionTab` ile aynı desen).

import type { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { todayIsoDate } from '../date'
import { queryKeyRoots, queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import type { Database, Tables } from '@repo/types'

export type ProgressEntry = Tables<'progress_entries'>

// ---------------------------------------------------------------------------
// Metrik sözlüğü — kolon adı TEK yerde tanımlanır (I-3)
// ---------------------------------------------------------------------------
//
// Ölçüler `jsonb` DEĞİL ayrı kolondur (migration KARAR 1), bu yüzden anahtarlar
// doğrudan `Tables<'progress_entries'>` kolon adlarıdır: yazım hatası derleme
// zamanında ölür. `max` değerleri tablodaki CHECK kısıtlarıyla BİREBİR aynıdır
// (`weight < 500`, çevreler `< 300`) — arayüz aynı sınırı ÖNCEDEN uygular ki
// kullanıcı ham `23514` görmesin.

export interface ProgressMetricMeta {
  key: ProgressMetricKey
  label: string
  unit: string
  /** Tablodaki CHECK kısıtının üst sınırı (bu değer DAHİL DEĞİL). */
  max: number
}

export type ProgressMetricKey =
  'weight_kg' | 'waist_cm' | 'chest_cm' | 'arm_cm' | 'thigh_cm' | 'hip_cm'

// `as const` (dizi DEĞİL DEMET) BİLİNÇLİ: `noUncheckedIndexedAccess` açık olduğu
// için düz bir `readonly ProgressMetricMeta[]`te `PROGRESS_METRICS[0]` bile
// `| undefined` olurdu ve her tüketici boş olmayan bir listeyi runtime'da
// yeniden kanıtlamak zorunda kalırdı. `satisfies` ise şeklin ProgressMetricMeta
// sözleşmesine uyduğunu derleme zamanında doğrular.
export const PROGRESS_METRICS = [
  { key: 'weight_kg', label: 'Kilo', unit: 'kg', max: 500 },
  { key: 'waist_cm', label: 'Bel', unit: 'cm', max: 300 },
  { key: 'chest_cm', label: 'Göğüs', unit: 'cm', max: 300 },
  { key: 'arm_cm', label: 'Kol', unit: 'cm', max: 300 },
  { key: 'thigh_cm', label: 'Uyluk', unit: 'cm', max: 300 },
  { key: 'hip_cm', label: 'Kalça', unit: 'cm', max: 300 },
] as const satisfies readonly ProgressMetricMeta[]

/** §6: aralık seçici 7/30/90 gün. Başka bir değer YOKTUR (tip seviyesinde). */
export const TREND_RANGE_DAYS = [7, 30, 90] as const
export type TrendRangeDays = (typeof TREND_RANGE_DAYS)[number]

export const DEFAULT_TREND_RANGE_DAYS: TrendRangeDays = 30

// ---------------------------------------------------------------------------
// Tarih aritmetiği — YEREL GÜN, UTC hesabı
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * `YYYY-MM-DD` + gün. Hesap `Date.UTC` üzerinde yapılır: yerel saat diliminde
 * `new Date('2026-03-29') + 1 gün` DST geçişinde 23 veya 25 saat sürebilir ve
 * gün ATLAYABİLİR/TEKRARLAYABİLİR. UTC'de gün DAİMA 86400 saniyedir.
 * Girdi zaten YEREL takvim günüdür (bkz. `todayIsoDate`), yalnızca aritmetik
 * UTC'de yapılır — tarih kayması olmaz.
 */
export function addDaysIso(isoDate: string, delta: number): string {
  const parts = isoDate.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  const shifted = new Date(Date.UTC(year, month - 1, day) + delta * 86_400_000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

// ---------------------------------------------------------------------------
// TREND SERİSİ — AC-4.2'nin TEK kaynağı (saf fonksiyon)
// ---------------------------------------------------------------------------

/** Grafikteki TEK bir gün. Ölçüm yoksa TÜM metrikler `null`'dır (= GAP). */
export interface TrendPoint {
  /** Gün (`YYYY-MM-DD`). Sıralama ve test karşılaştırması bunun üzerinden yapılır. */
  date: string
  /** Eksen etiketi (`GG.AA`). Locale'e bağlı DEĞİLDİR — test çıktısı deterministiktir. */
  label: string
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  hip_cm: number | null
}

export interface ProgressTrend {
  /** Aralığın ilk günü (dahil). */
  start: string
  /** Aralığın son günü (dahil) — normalde bugün. */
  end: string
  rangeDays: TrendRangeDays
  /** Aralığın HER günü için tam olarak bir nokta (uzunluk === rangeDays). */
  points: TrendPoint[]
  /** Aralıkta gerçekten ölçüm bulunan gün sayısı (boş günler sayılmaz). */
  measuredDays: number
}

export interface BuildTrendSeriesOptions {
  rangeDays: TrendRangeDays
  /** Aralığın son günü (`YYYY-MM-DD`). Verilmezse tarayıcının YEREL günü. */
  today?: string
}

/**
 * Ham `progress_entries` satırlarından grafik serisini üretir.
 *
 * ####################################################################
 * # İNTERPOLASYON YOK (§6) — BU FONKSİYONUN VAR OLMA SEBEBİ           #
 * #                                                                    #
 * # §6: "boş günler grafikte GAP olarak kalır, interpolasyon           #
 * # YAPILMAZ". Bunun İKİ ayrı şartı vardır ve İKİSİ DE gereklidir:     #
 * #                                                                    #
 * #  1) SERİ, aralıktaki HER GÜN için bir nokta taşımalıdır ve ölçüm   #
 * #     olmayan günün değeri `null` OLMALIDIR. Yalnızca ölçüm olan     #
 * #     günleri döndürmek (naif yol) grafikte iki komşu noktayı        #
 * #     DOĞRUDAN birleştirir — kütüphane hiçbir şey "interpole         #
 * #     etmemiş" olsa bile kullanıcı 10 gün boyunca düz bir çizgi      #
 * #     görür, yani SESSİZ interpolasyon.                              #
 * #  2) Grafik `connectNulls` DAVRANIŞINI KAPALI tutmalıdır            #
 * #     (`StatsTab.tsx`; recharts varsayılanı zaten `false`, ama       #
 * #     AÇIKÇA yazılır ki bir yükseltmede sessizce dönmesin).          #
 * #                                                                    #
 * # `apps/web/tests/unit/progress-trend.test.tsx` ikisini de kilitler.          #
 * ####################################################################
 *
 * Aralık dışındaki satırlar (sunucu filtresi kaçırırsa) burada da elenir:
 * serinin uzunluğu DAİMA `rangeDays`'tir.
 */
export function buildTrendSeries(
  entries: readonly ProgressEntry[],
  options: BuildTrendSeriesOptions
): ProgressTrend {
  const end = options.today ?? todayIsoDate()
  const { rangeDays } = options
  // `rangeDays` gün = bugün DAHİL geriye doğru `rangeDays` gün.
  const start = addDaysIso(end, -(rangeDays - 1))

  const byDate = new Map<string, ProgressEntry>()
  for (const entry of entries) {
    if (entry.entry_date < start || entry.entry_date > end) continue
    // Tekillik kısıtı yüzünden bir gün EN FAZLA bir satır taşır; yine de
    // savunmacı davranıp son geleni kullanıyoruz (deterministik).
    byDate.set(entry.entry_date, entry)
  }

  const points: TrendPoint[] = []
  for (let offset = 0; offset < rangeDays; offset++) {
    const date = addDaysIso(start, offset)
    const entry = byDate.get(date)
    points.push({
      date,
      label: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
      weight_kg: entry?.weight_kg ?? null,
      waist_cm: entry?.waist_cm ?? null,
      chest_cm: entry?.chest_cm ?? null,
      arm_cm: entry?.arm_cm ?? null,
      thigh_cm: entry?.thigh_cm ?? null,
      hip_cm: entry?.hip_cm ?? null,
    })
  }

  return { start, end, rangeDays, points, measuredDays: byDate.size }
}

export interface MetricSummary {
  /** Aralıkta bu metriğin ölçüldüğü gün sayısı. */
  count: number
  /** İlk (en eski) ölçüm — yoksa `null`. */
  first: { date: string; value: number } | null
  /** Son (en yeni) ölçüm — yoksa `null`. */
  last: { date: string; value: number } | null
  /** `last - first`; ikisinden biri yoksa `null` (0 İLE KARIŞTIRILMAZ). */
  delta: number | null
}

/**
 * Tek bir metriğin özetini çıkarır (ekran okuyucu metni + "son ölçüm" satırı).
 * Seriden türetilir, ham satırlardan DEĞİL — böylece özet ile grafik ASLA
 * birbirinden ayrışamaz (AC-4.2'nin "aynı seri" şartının küçük kardeşi).
 */
export function summarizeMetric(trend: ProgressTrend, metric: ProgressMetricKey): MetricSummary {
  const measured = trend.points
    .map((point) => ({ date: point.date, value: point[metric] }))
    .filter((item): item is { date: string; value: number } => item.value !== null)

  const first = measured[0] ?? null
  const last = measured[measured.length - 1] ?? null
  return {
    count: measured.length,
    first,
    last,
    delta: first && last ? last.value - first.value : null,
  }
}

// ---------------------------------------------------------------------------
// GİRDİ DOĞRULAMA — `progress_entries` CHECK kısıtlarının arayüz karşılığı
// ---------------------------------------------------------------------------

export interface ProgressEntryValues {
  weight_kg: number | null
  waist_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  hip_cm: number | null
  notes?: string | null
}

/**
 * `progress_entries_not_empty_chk`'in istemci karşılığı: en az BİR ölçüm
 * gerekir. `notes` TEK BAŞINA bir giriş DEĞİLDİR (migration yorumu: "bu tablo
 * ölçüm tablosudur").
 */
export function hasAnyMeasurement(values: ProgressEntryValues): boolean {
  return PROGRESS_METRICS.some((metric) => values[metric.key] !== null)
}

/**
 * Geçerliyse `null`, değilse kullanıcıya GÖSTERİLECEK Türkçe mesaj döner.
 *
 * NEDEN ARAYÜZDE DE VAR: kısıtlar veritabanında ZATEN duruyor, ama oradan
 * dönen şey `new row for relation "progress_entries" violates check
 * constraint "progress_entries_not_empty_chk"` gibi ham bir `23514` metnidir.
 * Bu kontrol aynı kuralı KULLANICI DİLİNDE, istek gönderilmeden önce
 * uygular; veritabanı yine de son sözü söyler (savunma katmanı kaldırılmadı).
 */
export function validateProgressEntry(values: ProgressEntryValues): string | null {
  for (const metric of PROGRESS_METRICS) {
    const value = values[metric.key]
    if (value === null) continue
    if (!Number.isFinite(value) || value <= 0 || value >= metric.max) {
      return `${metric.label}: 0 ile ${metric.max} ${metric.unit} arasında bir değer girin.`
    }
  }

  if (!hasAnyMeasurement(values)) {
    return 'En az bir ölçüm girin — yalnızca not kaydedilemez.'
  }

  const notes = values.notes
  if (notes !== undefined && notes !== null && notes.length > 2000) {
    return 'Not en fazla 2000 karakter olabilir.'
  }

  return null
}

// ---------------------------------------------------------------------------
// OKUMA — TEK sorgu (AC-4.2)
// ---------------------------------------------------------------------------

/**
 * Aralık sorgusu. Migration KARAR 4 tam olarak bu sorguyu ölçtü:
 * `where client_id = $1 and entry_date >= $2 order by entry_date` —
 * `progress_entries_client_date_uniq` btree'si onu karşılar, EK İNDEKS YOKTUR.
 *
 * `lte(end)` de yazılır: gelecek tarihli bir satır (DB'de CHECK ile
 * yasaklanamaz — `current_date` IMMUTABLE değildir, bkz. migration) seriyi
 * KAYDIRMAMALI, aralığın dışında kalmalıdır.
 */
function progressEntriesQueryOptions(
  client: SupabaseClient<Database>,
  clientId: string | undefined,
  rangeDays: TrendRangeDays
) {
  return {
    queryKey: queryKeys.progressEntries(clientId, rangeDays),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ProgressEntry[]> => {
      const end = todayIsoDate()
      const start = addDaysIso(end, -(rangeDays - 1))

      const { data, error } = await client
        .from('progress_entries')
        .select('*')
        .eq('client_id', clientId ?? '')
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date', { ascending: true })
      if (error) throw wrapSupabaseError(error, { table: 'progress_entries', op: 'select' })
      return data
    },
  }
}

/** Seçili aralıktaki HAM satırlar (eskiden yeniye). Grafik için `useProgressTrend` kullanın. */
export function useProgressEntries(
  clientId?: string,
  rangeDays: TrendRangeDays = DEFAULT_TREND_RANGE_DAYS
) {
  const supabase = useSupabaseClient()
  return useQuery(progressEntriesQueryOptions(supabase, clientId, rangeDays))
}

/**
 * AC-4.2'NİN TEK ENDPOINT'İ. Grafik çizen her ekran BUNU çağırır.
 *
 * `useProgressEntries` ile AYNI anahtarı ve AYNI `queryFn`'i kullanır; fark
 * yalnızca `select`tir (TanStack Query'de `select` gözlemci başınadır, sorgu
 * başına değil) -> iki hook aynı anda kullanılsa bile TEK ağ isteği yapılır ve
 * seri TEK yerde (`buildTrendSeries`) üretilir.
 */
export function useProgressTrend(
  clientId?: string,
  rangeDays: TrendRangeDays = DEFAULT_TREND_RANGE_DAYS
) {
  const supabase = useSupabaseClient()
  return useQuery({
    ...progressEntriesQueryOptions(supabase, clientId, rangeDays),
    select: (entries: ProgressEntry[]): ProgressTrend => buildTrendSeries(entries, { rangeDays }),
  })
}

// ---------------------------------------------------------------------------
// YAZMA — AC-4.1 (upsert)
// ---------------------------------------------------------------------------

export interface UpsertProgressEntryInput extends ProgressEntryValues {
  clientId: string
  /**
   * `YYYY-MM-DD` — ölçümün ait olduğu YEREL gün. Arayüz varsayılanı
   * `todayIsoDate()`tir (`@repo/api-client/date`), ama kullanıcı geçmiş bir gün de
   * seçebilir (StatsTab tarih kutusu).
   *
   * ZORUNLU (opsiyonel DEĞİL): opsiyonelken çağıran boş bırakırsa satır
   * veritabanının `default current_date` (UTC) değerini alırdı; okuma tarafı
   * (`progressEntriesQueryOptions`, `buildTrendSeries`) YEREL güne göre
   * filtrelediği için gece yarısı penceresinde ölçüm grafikte kaybolurdu.
   */
  entryDate: string
}

/**
 * Günün ölçümünü kaydeder. AC-4.1: aynı güne ikinci giriş YENİ SATIR AÇMAZ,
 * mevcut satırı GÜNCELLER.
 *
 * `insert` DEĞİL `upsert` + `onConflict: 'client_id,entry_date'`:
 *   * `insert` olsaydı ikinci giriş `23505` ile REDDEDİLİRDİ (kullanıcı
 *     "bugünü düzeltemem" derdi);
 *   * `onConflict` verilmeseydi PostgREST birincil anahtarı arbiter seçerdi ve
 *     `id` üretilen bir uuid olduğu için çakışma HİÇ oluşmaz, yani her çağrı
 *     yeni satır dener -> yine `23505`.
 * Doğru arbiter `progress_entries_client_date_uniq` kısıtıdır.
 *
 * TÜM ölçüm kolonları HER ZAMAN gönderilir (boş bırakılan alan `null` gider):
 * upsert kısmi değil TAM satır semantiğindedir — "bugünün kaydı ekranda ne
 * görünüyorsa odur". Alanı göndermemek eski değeri sessizce KORURDU ve
 * kullanıcı sildiğini sandığı ölçüyü grafikte görmeye devam ederdi.
 */
export function useUpsertProgressEntry() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertProgressEntryInput): Promise<ProgressEntry> => {
      const { data, error } = await supabase
        .from('progress_entries')
        .upsert(
          {
            client_id: input.clientId,
            // DAİMA istemciden gelir — DB varsayılanına (UTC) ASLA düşülmez.
            entry_date: input.entryDate,
            weight_kg: input.weight_kg,
            waist_cm: input.waist_cm,
            chest_cm: input.chest_cm,
            arm_cm: input.arm_cm,
            thigh_cm: input.thigh_cm,
            hip_cm: input.hip_cm,
            notes: input.notes ?? null,
          },
          { onConflict: 'client_id,entry_date' }
        )
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'progress_entries', op: 'upsert' })
      return data
    },
    onSuccess: () => {
      // ÖN EK ile süpürülür: aynı danışanın 7/30/90 aralıkları AYRI anahtarlardır
      // ve yeni ölçüm ÜÇÜNÜ de etkiler. Tek tek invalidate etmek, kullanıcı
      // aralığı değiştirdiğinde bayat seri göstermek demekti.
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.progressEntries })
      notify.success('Ölçüm kaydedildi.')
    },
    onError: (error: Error) => {
      notify.error(`Ölçüm kaydedilemedi: ${error.message}`)
    },
  })
}
