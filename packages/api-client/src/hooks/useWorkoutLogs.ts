'use client'

// Set bazlı antrenman kayıtları (tekil ve toplu ekleme) + oturum gruplaması.
//
// ŞEMA SÖZLEŞMESİ (20260817190000_workout_log_sets.sql, supabase/README.md §4h):
//   * Bir SATIR = BİR SET. `set_number` setin oturum içindeki sırasıdır.
//   * `plan_exercise_id` setin bağlı olduğu VERSİYONLU plan satırıdır; plan dışı
//     (serbest) setlerde ve Faz 2b öncesi geçmiş loglarda NULL'dur.
//   * `completed_at` ANLAMI OTURUM SEVİYESİNDEDİR ama kolon set satırında yaşar
//     (denormalize damga): antrenman bitirildiğinde o oturuma ait TÜM set
//     satırlarına AYNI değer yazılır. `NULL` = "set girildi, antrenman
//     bitirilmedi". Ayrı bir `workout_sessions` tablosu YOKTUR; oturumlar
//     `(client_id, completed_at)` çiftinden kayıpsız geri üretilir.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import type { TablesInsert, WorkoutLog } from '@repo/types'

export function useWorkoutLogs(clientId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.workoutLogs(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<WorkoutLog[]> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', clientId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'workout_logs', op: 'select' })
      return data
    },
  })
}

export interface CreateWorkoutLogInput {
  clientId: string
  exercise_name: string
  weight_kg?: number | null
  reps?: number | null
  rpe?: number | null
}

export function useCreateWorkoutLog() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      exercise_name,
      weight_kg,
      reps,
      rpe,
    }: CreateWorkoutLogInput): Promise<WorkoutLog> => {
      const { data, error } = await supabase
        .from('workout_logs')
        .insert({
          client_id: clientId,
          exercise_name,
          weight_kg: weight_kg ?? null,
          reps: reps ?? null,
          rpe: rpe ?? null,
        })
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'workout_logs', op: 'insert' })
      return data
    },
    onSuccess: (_log, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutLogs(clientId) })
      toast.success('Set kaydedildi.')
    },
    onError: (error: Error) => {
      toast.error(`Set kaydedilemedi: ${error.message}`)
    },
  })
}

/** Canlı antrenman modunda tamamlanan TEK bir set. */
export interface WorkoutSetInput {
  exercise_name: string
  /**
   * Setin OTURUM İÇİNDEKİ sırası (1'den başlar) — egzersiz içindeki sırası
   * DEĞİL. Gerekçe: tüm setler TEK toplu `insert` ile yazıldığı için
   * `created_at` hepsinde pratik olarak aynıdır ve setleri sıralayamaz;
   * `set_number` oturumun tek sıralama sinyalidir. Egzersiz içi sıra ise
   * `(plan_exercise_id, set_number)` üzerinden kayıpsız türetilir.
   */
  set_number?: number | null
  plan_exercise_id?: string | null
  weight_kg?: number | null
  reps?: number | null
  rpe?: number | null
}

export interface CreateWorkoutLogsInput {
  clientId: string
  sets: WorkoutSetInput[]
  /**
   * OTURUM damgası. Antrenman gerçekten bitirildiyse (tüm planlı setler
   * girildiyse) TEK bir ISO zaman damgası; bitirilmediyse `null`/verilmez.
   * Değer TÜM satırlara aynen yazılır — satır bazında farklı damga ÜRETİLMEZ.
   */
  completedAt?: string | null
}

/**
 * Set girdilerini `workout_logs` satırlarına çevirir. SAF fonksiyon —
 * `apps/web/tests/unit/workout-sets.test.ts` bunu doğrudan çağırır.
 *
 * KRİTİK İNVARYANT: `completedAt` ne verilirse verilsin, üretilen satırların
 * TAMAMI aynı `completed_at` değerini taşır (hepsi damgalı ya da hepsi NULL).
 * Kısmi damga, oturumun `(client_id, completed_at)` çiftinden geri üretilmesini
 * bozardı.
 */
export function buildWorkoutLogRows({
  clientId,
  sets,
  completedAt = null,
}: CreateWorkoutLogsInput): TablesInsert<'workout_logs'>[] {
  const stamp = completedAt ?? null

  return sets.map((set, index) => ({
    client_id: clientId,
    exercise_name: set.exercise_name,
    set_number: set.set_number ?? index + 1,
    plan_exercise_id: set.plan_exercise_id ?? null,
    weight_kg: set.weight_kg ?? null,
    reps: set.reps ?? null,
    rpe: set.rpe ?? null,
    completed_at: stamp,
  }))
}

/**
 * Antrenman bitirilmiş sayılır mı? SAF fonksiyon.
 * §4.1: "tüm setler girilince `completed_at` set edilir" — yani damga ancak
 * girilen set sayısı planlanan set sayısına ULAŞTIĞINDA basılır. Plan dışı
 * (planlı set sayısı 0) bir oturum asla "tamamlandı" damgası almaz.
 */
export function isSessionComplete(completedSetCount: number, plannedSetCount: number): boolean {
  if (plannedSetCount <= 0) return false
  return completedSetCount >= plannedSetCount
}

/** Bir antrenman oturumu — tabloda değil, `completed_at` damgasında yaşar. */
export interface WorkoutSession {
  /** React `key` ve test için kararlı kimlik. */
  key: string
  /** Oturum damgası; `null` = antrenman bitirilmemiş (devam eden setler). */
  completedAt: string | null
  /** Sıralama için oturumun en yeni anı (damga yoksa en yeni `created_at`). */
  sortedAt: string
  sets: WorkoutLog[]
}

/**
 * Set satırlarını OTURUMLARA gruplar. SAF fonksiyon.
 *
 * Gruplama anahtarı damganın kendisidir (`completed_at`). Damgasız satırlar
 * TEK bir dev yığına düşmesin diye takvim gününe göre ayrılır — bunlar
 * "bitirilmemiş oturum"dur ve bilinçli olarak damgalı oturumlardan ayrı durur.
 */
export function groupLogsIntoSessions(logs: readonly WorkoutLog[] | null | undefined) {
  if (!logs || logs.length === 0) return [] as WorkoutSession[]

  const buckets = new Map<string, WorkoutSession>()

  for (const log of logs) {
    const key =
      log.completed_at === null ? `open:${log.created_at.slice(0, 10)}` : `done:${log.completed_at}`

    const existing = buckets.get(key)
    if (existing) {
      existing.sets.push(log)
      if (log.created_at > existing.sortedAt) existing.sortedAt = log.created_at
    } else {
      buckets.set(key, {
        key,
        completedAt: log.completed_at,
        sortedAt: log.completed_at ?? log.created_at,
        sets: [log],
      })
    }
  }

  const sessions = [...buckets.values()]
  for (const session of sessions) {
    session.sets.sort(
      (a, b) =>
        (a.set_number ?? 0) - (b.set_number ?? 0) || a.created_at.localeCompare(b.created_at)
    )
  }
  sessions.sort((a, b) => b.sortedAt.localeCompare(a.sortedAt))
  return sessions
}

/** Toplu set kaydı — tek sorguda insert eder. */
export function useCreateWorkoutLogs() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateWorkoutLogsInput): Promise<number> => {
      if (input.sets.length === 0) return 0

      const rows = buildWorkoutLogRows(input)

      const { error } = await supabase.from('workout_logs').insert(rows)
      if (error) throw wrapSupabaseError(error, { table: 'workout_logs', op: 'insert' })
      return rows.length
    },
    onSuccess: (count, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutLogs(clientId) })
      if (count > 0) toast.success('Antrenmanın başarıyla kaydedildi.')
    },
    onError: (error: Error) => {
      toast.error(`Antrenman kaydedilemedi: ${error.message}`)
    },
  })
}
