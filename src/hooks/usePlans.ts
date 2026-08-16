'use client'

// Haftalık antrenman/beslenme planları. Planlar profiles tablosunda JSON string olarak tutulur.
// Kaydetme birden fazla öğrenciye TEK sorguda uygulanır (.in('id', studentIds)).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import { parseNutritionPlan, parseWorkoutPlan, type NutritionPlan, type WorkoutPlan } from '@/types'

export function useWorkoutPlan(studentId?: string) {
  return useQuery({
    queryKey: [...queryKeys.profile(studentId), 'workout-plan'] as const,
    enabled: Boolean(studentId),
    queryFn: async (): Promise<WorkoutPlan> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('workout_plan')
        .eq('id', studentId ?? '')
        .single()
      if (error) throw new Error(error.message)
      return parseWorkoutPlan(data.workout_plan)
    },
  })
}

export function useNutritionPlan(studentId?: string) {
  return useQuery({
    queryKey: [...queryKeys.profile(studentId), 'nutrition-plan'] as const,
    enabled: Boolean(studentId),
    queryFn: async (): Promise<NutritionPlan> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('nutrition_plan')
        .eq('id', studentId ?? '')
        .single()
      if (error) throw new Error(error.message)
      return parseNutritionPlan(data.nutrition_plan)
    },
  })
}

export interface SaveWorkoutPlanInput {
  studentIds: string[]
  plan: WorkoutPlan
}

export function useSaveWorkoutPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ studentIds, plan }: SaveWorkoutPlanInput): Promise<number> => {
      if (studentIds.length === 0) throw new Error('En az bir öğrenci seçmelisiniz.')

      const { error } = await supabase
        .from('profiles')
        .update({ workout_plan: JSON.stringify(plan) })
        .in('id', studentIds)
      if (error) throw new Error(error.message)

      return studentIds.length
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profiles })
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
  studentIds: string[]
  plan: NutritionPlan
}

export function useSaveNutritionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ studentIds, plan }: SaveNutritionPlanInput): Promise<number> => {
      if (studentIds.length === 0) throw new Error('En az bir öğrenci seçmelisiniz.')

      const { error } = await supabase
        .from('profiles')
        .update({ nutrition_plan: JSON.stringify(plan) })
        .in('id', studentIds)
      if (error) throw new Error(error.message)

      return studentIds.length
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
