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
// BESLENME PLANI: hâlâ `profiles.nutrition_plan` JSON string'idir (Faz 1b kapsamı dışı).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import {
  DAY_NAMES,
  EMPTY_WORKOUT_PLAN,
  isDayName,
  parseNutritionPlan,
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
      if (error) throw new Error(error.message)
      // Aktif plan yoksa (yeni danışan) boş hafta döner — eski davranışla aynı.
      return rowsToWorkoutPlan(data?.workout_plan_exercises)
    },
  })
}

export function useNutritionPlan(clientId?: string) {
  return useQuery({
    queryKey: [...queryKeys.profile(clientId), 'nutrition-plan'] as const,
    enabled: Boolean(clientId),
    queryFn: async (): Promise<NutritionPlan> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('nutrition_plan')
        .eq('id', clientId ?? '')
        .single()
      if (error) throw new Error(error.message)
      return parseNutritionPlan(data.nutrition_plan)
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
      if (error) throw new Error(error.message)

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

      const { error } = await supabase
        .from('profiles')
        .update({ nutrition_plan: JSON.stringify(plan) })
        .in('id', clientIds)
      if (error) throw new Error(error.message)

      return clientIds.length
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profiles })
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
