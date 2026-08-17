'use client'

// Set bazlı antrenman kayıtları (tekil ve toplu ekleme).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { supabase } from '@/lib/supabase/client'
import type { TablesInsert, WorkoutLog } from '@/types'

export function useWorkoutLogs(clientId?: string) {
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

export interface CreateWorkoutLogsInput {
  clientId: string
  /** Canlı antrenman modunda tamamlanan setler. */
  sets: {
    exercise_name: string
    weight_kg?: number | null
    reps?: number | null
    rpe?: number | null
  }[]
}

/** Toplu set kaydı — tek sorguda insert eder. */
export function useCreateWorkoutLogs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, sets }: CreateWorkoutLogsInput): Promise<number> => {
      if (sets.length === 0) return 0

      const rows: TablesInsert<'workout_logs'>[] = sets.map((set) => ({
        client_id: clientId,
        exercise_name: set.exercise_name,
        weight_kg: set.weight_kg ?? null,
        reps: set.reps ?? null,
        rpe: set.rpe ?? null,
      }))

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
