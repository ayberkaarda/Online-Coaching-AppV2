'use client'

// Haftalık antrenman/beslenme planları.
//
// ANTRENMAN PLANI (Faz 1b Adım 2 — cutover tamamlandı):
//   Kaynak `public.workout_plans` + `public.workout_plan_exercises` tablolarıdır.
//   Okuma: aktif planın satırları gün+position sırasıyla `raw_line` birleştirilerek
//          `WorkoutPlan` (Record<gün, string>) şekline geri üretilir.
//   Yazma: `save_workout_plan(uuid[], jsonb)` RPC'si — TEK ayrıştırıcı SQL'dedir
//          (`explode_plan_day`), istemcide ikinci bir ayrıştırıcı YOKTUR.
//   `profiles.workout_plan` kolonu DEPRECATED'tır; buradan ne okunur ne yazılır.
//
// BESLENME PLANI (Faz 1b Adım 3b — cutover tamamlandı):
//   Kaynak `public.nutrition_plans` + `public.nutrition_plan_meals` tablolarıdır.
//   Okuma: aktif planın satırları gün bazında `NutritionPlan`
//          (Record<gün, { items, total }>) şekline geri üretilir.
//   Yazma: `save_nutrition_plan(uuid[], jsonb)` RPC'si — TEK yazıcı SQL'dedir
//          (`explode_nutrition_day`), istemcide ikinci bir yazıcı YOKTUR.
//   `profiles.nutrition_plan` kolonu DEPRECATED'tır; buradan ne okunur ne yazılır.
//
// SÖZLEŞME: `src/components/tabs/**` bu cutover'da DEĞİŞMEDİ. `useNutritionPlan`
//   eskisiyle birebir aynı şekli döndürür, `useSaveNutritionPlan` eskisiyle
//   birebir aynı girdiyi alır ve aynı toast metinlerini üretir.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { supabase } from '@/lib/supabase/client'
import {
  DAY_NAMES,
  EMPTY_WORKOUT_PLAN,
  isDayName,
  type Json,
  type NutritionPlan,
  type WorkoutPlan,
} from '@/types'

/** `workout_plan_exercises` satırının gün metnini geri üretmek için gereken alanları. */
export interface WorkoutPlanExerciseRow {
  day: string
  position: number
  raw_line: string
}

/**
 * Plan satırlarını `WorkoutPlan` (Record<gün, string>) şekline geri üretir.
 *
 * Sözleşme (bkz. 20260817110000_workout_plan_tables.sql):
 *   Bir günün metni = o güne ait `raw_line` değerlerinin `position` sırasıyla
 *   '\n' ile birleştirilmesidir. Eksik günler boş string olur; bilinmeyen gün
 *   adları (şema CHECK'i sayesinde normalde oluşamaz) sessizce yok sayılır.
 *
 * Saf fonksiyondur — hook'tan bağımsız test edilebilir (tests/unit/plans.test.ts).
 */
export function rowsToWorkoutPlan(
  rows: readonly WorkoutPlanExerciseRow[] | null | undefined
): WorkoutPlan {
  const plan: WorkoutPlan = { ...EMPTY_WORKOUT_PLAN }
  if (!rows || rows.length === 0) return plan

  const buckets = new Map<string, WorkoutPlanExerciseRow[]>()
  for (const row of rows) {
    if (!isDayName(row.day)) continue
    const bucket = buckets.get(row.day)
    if (bucket) bucket.push(row)
    else buckets.set(row.day, [row])
  }

  for (const day of DAY_NAMES) {
    const bucket = buckets.get(day)
    if (!bucket) continue
    plan[day] = bucket
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((row) => row.raw_line)
      .join('\n')
  }

  return plan
}

/**
 * `save_workout_plan` RPC'sinin beklediği jsonb yükünü üretir.
 * YALNIZCA bilinen 7 gün anahtarı gönderilir: RPC bilinmeyen anahtarda hata
 * yükseltir (sessiz veri kaybı yerine gürültülü hata — bilinçli tasarım).
 */
export function planToRpcPayload(plan: WorkoutPlan): Json {
  const payload: Record<string, string> = {}
  for (const day of DAY_NAMES) payload[day] = plan[day] ?? ''
  return payload as unknown as Json
}

export function useWorkoutPlan(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.workoutPlan(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<WorkoutPlan> => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select('id, workout_plan_exercises(day, position, raw_line)')
        .eq('client_id', clientId ?? '')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw wrapSupabaseError(error, { table: 'workout_plans', op: 'select' })
      // Aktif plan yoksa (yeni danışan) boş hafta döner — eski davranışla aynı.
      return rowsToWorkoutPlan(data?.workout_plan_exercises)
    },
  })
}

/** `nutrition_plan_meals` satırının gün içeriğini geri üretmek için gereken alanları. */
export interface NutritionPlanMealRow {
  day: string
  position: number
  description: string
  kcal: number | null
}

/** Her çağrıda TAZE gün nesneleri üretir (paylaşılan sabit mutasyona uğramasın). */
function emptyNutritionPlan(): NutritionPlan {
  const plan = {} as NutritionPlan
  for (const day of DAY_NAMES) plan[day] = { items: '', total: 0 }
  return plan
}

/**
 * Öğün satırlarını `NutritionPlan` (Record<gün, { items, total }>) şekline geri üretir.
 *
 * Sözleşme (bkz. 20260817130000_nutrition_plan_tables.sql):
 *   Faz 1b'de gün başına TEK satır vardır (`position = 0`); o günün değeri
 *   `{ items: description, total: kcal ?? 0 }` olur. `kcal` NULL ise (kaynak
 *   `total` sayı değildi/negatifti/kesirliydi) 0'a düşer — eski
 *   `parseNutritionPlan` davranışıyla aynı.
 *
 *   İleride öğün granülerliği gelip bir güne birden çok satır düşerse (şema buna
 *   şimdiden izin veriyor) satırlar `position` sırasıyla '\n' ile birleştirilir ve
 *   `kcal` değerleri toplanır. Böylece bu dönüşüm HİÇBİR satırı sessizce
 *   düşürmez; tek satırlı bugünkü hâlde ise yukarıdaki sözleşmeye birebir indirgenir.
 *
 * Eksik günler `{ items: '', total: 0 }` olur; bilinmeyen gün adları (şema CHECK'i
 * sayesinde normalde oluşamaz) sessizce yok sayılır.
 *
 * Saf fonksiyondur — hook'tan bağımsız test edilebilir (tests/unit/plans.test.ts).
 */
export function rowsToNutritionPlan(
  rows: readonly NutritionPlanMealRow[] | null | undefined
): NutritionPlan {
  const plan = emptyNutritionPlan()
  if (!rows || rows.length === 0) return plan

  const buckets = new Map<string, NutritionPlanMealRow[]>()
  for (const row of rows) {
    if (!isDayName(row.day)) continue
    const bucket = buckets.get(row.day)
    if (bucket) bucket.push(row)
    else buckets.set(row.day, [row])
  }

  for (const day of DAY_NAMES) {
    const bucket = buckets.get(day)
    if (!bucket) continue
    const sorted = bucket.slice().sort((a, b) => a.position - b.position)
    plan[day] = {
      items: sorted.map((row) => row.description).join('\n'),
      total: sorted.reduce((sum, row) => sum + (row.kcal ?? 0), 0),
    }
  }

  return plan
}

/**
 * `save_nutrition_plan` RPC'sinin beklediği jsonb yükünü üretir.
 * YALNIZCA bilinen 7 gün anahtarı gönderilir: RPC bilinmeyen anahtarda hata
 * yükseltir (sessiz veri kaybı yerine gürültülü hata — bilinçli tasarım).
 */
export function nutritionPlanToRpcPayload(plan: NutritionPlan): Json {
  const payload: Record<string, { items: string; total: number }> = {}
  for (const day of DAY_NAMES) {
    const entry = plan[day]
    payload[day] = { items: entry?.items ?? '', total: entry?.total ?? 0 }
  }
  return payload as unknown as Json
}

export function useNutritionPlan(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.nutritionPlan(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<NutritionPlan> => {
      const { data, error } = await supabase
        .from('nutrition_plans')
        .select('id, nutrition_plan_meals(day, position, description, kcal)')
        .eq('client_id', clientId ?? '')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_plans', op: 'select' })
      // Aktif plan yoksa (yeni danışan) boş hafta döner — eski davranışla aynı.
      return rowsToNutritionPlan(data?.nutrition_plan_meals)
    },
  })
}

export interface SaveWorkoutPlanInput {
  clientIds: string[]
  plan: WorkoutPlan
}

export function useSaveWorkoutPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientIds, plan }: SaveWorkoutPlanInput): Promise<number> => {
      if (clientIds.length === 0) throw new Error('En az bir öğrenci seçmelisiniz.')

      // Tek RPC = tek transaction: bir danışanda RLS/CHECK hatası olursa TÜM
      // kaydetme geri alınır (kısmi yazma yok).
      const { error } = await supabase.rpc('save_workout_plan', {
        p_client_ids: clientIds,
        p_plan: planToRpcPayload(plan),
      })
      if (error) throw wrapSupabaseError(error, { table: 'save_workout_plan', op: 'rpc' })

      return clientIds.length
    },
    onSuccess: (count, { clientIds }) => {
      for (const id of clientIds) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.workoutPlan(id) })
      }
      toast.success(
        count > 1
          ? `Antrenman programı ${count} öğrenciye kaydedildi.`
          : 'Antrenman programı kaydedildi.'
      )
    },
    onError: (error: Error) => {
      toast.error(`Antrenman programı kaydedilemedi: ${error.message}`)
    },
  })
}

export interface SaveNutritionPlanInput {
  clientIds: string[]
  plan: NutritionPlan
}

export function useSaveNutritionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientIds, plan }: SaveNutritionPlanInput): Promise<number> => {
      if (clientIds.length === 0) throw new Error('En az bir öğrenci seçmelisiniz.')

      // Tek RPC = tek transaction: bir danışanda RLS/CHECK hatası olursa TÜM
      // kaydetme geri alınır (kısmi yazma yok).
      const { error } = await supabase.rpc('save_nutrition_plan', {
        p_client_ids: clientIds,
        p_plan: nutritionPlanToRpcPayload(plan),
      })
      if (error) throw wrapSupabaseError(error, { table: 'save_nutrition_plan', op: 'rpc' })

      return clientIds.length
    },
    onSuccess: (count, { clientIds }) => {
      for (const id of clientIds) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.nutritionPlan(id) })
      }
      toast.success(
        count > 1
          ? `Beslenme programı ${count} öğrenciye kaydedildi.`
          : 'Beslenme programı kaydedildi.'
      )
    },
    onError: (error: Error) => {
      toast.error(`Beslenme programı kaydedilemedi: ${error.message}`)
    },
  })
}
