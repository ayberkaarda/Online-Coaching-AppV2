'use client'

// Yapay zeka üretimleri. İstekler kendi /api/ai/* proxy route'larımıza gider.

import { useMutation } from '@tanstack/react-query'

import { generateDietPlan, generateWorkoutPlan, getRecommendations } from '../api/ai'
import { ApiError } from '../api/client'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import type {
  DietGenerateInput,
  DietGenerateResult,
  RecommendationInput,
  RecommendationResult,
  WorkoutGenerateInput,
  WorkoutGenerateResult,
} from '../api/types'

function toUserMessage(error: unknown): string {
  if (ApiError.isApiError(error)) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Beklenmeyen bir hata oluştu.'
}

export function useGenerateWorkout() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()

  return useMutation<WorkoutGenerateResult, Error, WorkoutGenerateInput>({
    mutationFn: (input) => generateWorkoutPlan(supabase, input),
    onSuccess: () => {
      notify.success('Yapay zeka antrenman programını oluşturdu.')
    },
    onError: (error) => {
      notify.error(`Program oluşturulamadı: ${toUserMessage(error)}`)
    },
  })
}

export function useGenerateDiet() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()

  return useMutation<DietGenerateResult, Error, DietGenerateInput>({
    mutationFn: (input) => generateDietPlan(supabase, input),
    onSuccess: () => {
      notify.success('Yapay zeka beslenme programını oluşturdu.')
    },
    onError: (error) => {
      notify.error(`Beslenme programı oluşturulamadı: ${toUserMessage(error)}`)
    },
  })
}

export function useRecommendations() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()

  return useMutation<RecommendationResult, Error, RecommendationInput>({
    mutationFn: (input) => getRecommendations(supabase, input),
    onSuccess: () => {
      notify.success('Öneriler güncellendi.')
    },
    onError: (error) => {
      notify.error(`Öneriler alınamadı: ${toUserMessage(error)}`)
    },
  })
}
