'use client'

// GÜNÜN ANTRENMANI — plan satırlarının KİMLİKLİ hâli (Faz 2c, §4.1).
//
// NEDEN AYRI BİR HOOK:
//   `usePlans.ts` -> `useWorkoutPlan()` planı `Record<gün, string>` (düz metin)
//   olarak geri üretir; bu şekil koçun düzenleme tablosu için doğrudur ama
//   §4.1'in danışan yarısı için YETMEZ:
//     * `workout_logs.plan_exercise_id` FK'si için satırın `id`'si gerekir,
//     * "video embed" için `video_url` gerekir,
//     * hedef set/tekrar için `target_sets` / `target_reps` gerekir.
//   Bu üç alanın hiçbiri metne geri üretilirken KORUNMAZ. Bu yüzden gym modu
//   planı METİNDEN YENİDEN AYRIŞTIRMAZ; doğrudan `workout_plan_exercises`
//   satırlarını okur — ayrıştırıcı TEK ve SQL'dedir (`explode_plan_day`,
//   20260817110000), istemcide ikinci bir ayrıştırıcı YOKTUR.
//
// AC-2.4 / AC-4.5.5: `supabase.from(` yalnızca `packages/api-client` içinde geçebilir
// (Faz 4.5 commit 5 öncesi kural `packages/api-client/src/hooks/**` diyordu); bu dosya o kuralın içindedir,
// bileşenler bu hook üzerinden okur.

import { useQuery } from '@tanstack/react-query'

import type { DayName } from '@repo/types'

import { useSupabaseClient } from '../context'
import { queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'

/** `workout_plan_exercises` satırının gym modu için gereken alanları. */
export interface PlanExerciseRow {
  id: string
  day: string
  position: number
  raw_line: string
  name: string | null
  target_sets: number | null
  target_reps: number | null
  video_url: string | null
  target_rpe: number | null
  target_percent_1rm: number | null
}

/** Gym modunun tükettiği, plan satırına BAĞLI egzersiz. */
export interface SessionExercise {
  /** `workout_logs.plan_exercise_id` FK'sine yazılır. Plan dışı sette `null`. */
  planExerciseId: string | null
  name: string
  sets: number
  reps: number
  videoUrl: string | null
}

/**
 * Plan satırlarını bir günün antrenman oturumuna çevirir. SAF fonksiyon.
 *
 * `explode_plan_day` her satırı saklar ama YALNIZCA
 * `^\d+. <ad> - <set>x<tekrar>` desenine uyanlarda `name`/`target_sets`/
 * `target_reps` doludur. Deseni tutmayan satırlar (ör. "Dinlenme", serbest not)
 * bir egzersiz DEĞİLDİR ve oturuma alınmaz — uydurma set sayısı üretilmez.
 */
export function rowsToSessionExercises(
  rows: readonly PlanExerciseRow[] | null | undefined,
  day: DayName
): SessionExercise[] {
  if (!rows || rows.length === 0) return []

  return rows
    .filter((row) => row.day === day)
    .filter(
      (row): row is PlanExerciseRow & { name: string; target_sets: number; target_reps: number } =>
        typeof row.name === 'string' &&
        row.name.trim() !== '' &&
        typeof row.target_sets === 'number' &&
        row.target_sets > 0 &&
        typeof row.target_reps === 'number' &&
        row.target_reps > 0
    )
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      planExerciseId: row.id,
      name: row.name,
      sets: row.target_sets,
      reps: row.target_reps,
      videoUrl: row.video_url,
    }))
}

/** Oturumdaki TOPLAM planlı set sayısı — `completed_at` damgasının eşiği budur. */
export function totalPlannedSets(exercises: readonly { sets: number }[]): number {
  return exercises.reduce((sum, exercise) => sum + Math.max(0, exercise.sets), 0)
}

/**
 * Aktif planın egzersiz satırları (kimlik + hedef + video ile).
 *
 * ANAHTAR: `[...queryKeys.workoutPlan(clientId), 'exercises']` — bilinçli olarak
 * `workoutPlan` anahtarının ALTINDA. `useSaveWorkoutPlan` ön ek (prefix)
 * invalidate ettiği için koç planı kaydettiğinde bu sorgu da otomatik tazelenir;
 * ``@repo/api-client/query/keys`` dosyasına dokunmadan tutarlılık sağlanır.
 */
export function useWorkoutPlanExercises(clientId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: [...queryKeys.workoutPlan(clientId), 'exercises'] as const,
    enabled: Boolean(clientId),
    queryFn: async (): Promise<PlanExerciseRow[]> => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select(
          'id, workout_plan_exercises(id, day, position, raw_line, name, target_sets, target_reps, video_url, target_rpe, target_percent_1rm)'
        )
        .eq('client_id', clientId ?? '')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw wrapSupabaseError(error, { table: 'workout_plans', op: 'select' })
      return data?.workout_plan_exercises ?? []
    },
  })
}
