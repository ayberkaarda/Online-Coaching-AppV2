'use client'

// Yapay zeka üretimleri. İstekler kendi /api/ai/* proxy route'larımıza gider.

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { generateDietPlan, generateWorkoutPlan, getRecommendations } from '@/lib/api/ai'
import { ApiError } from '@/lib/api/client'
import type {
  DietGenerateInput,
  DietGenerateResult,
  RecommendationInput,
  RecommendationResult,
  WorkoutGenerateInput,
  WorkoutGenerateResult,
} from '@/lib/api/types'

function toUserMessage(error: unknown): string {
  if (ApiError.isApiError(error)) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Beklenmeyen bir hata oluştu.'
}

export function useGenerateWorkout() {
  return useMutation<WorkoutGenerateResult, Error, WorkoutGenerateInput>({
    mutationFn: (input) => generateWorkoutPlan(input),
    onSuccess: () => {
      toast.success('Yapay zeka antrenman programını oluşturdu.')
    },
    onError: (error) => {
      toast.error(`Program oluşturulamadı: ${toUserMessage(error)}`)
    },
  })
}

export function useGenerateDiet() {
  return useMutation<DietGenerateResult, Error, DietGenerateInput>({
    mutationFn: (input) => generateDietPlan(input),
    onSuccess: () => {
      toast.success('Yapay zeka beslenme programını oluşturdu.')
    },
    onError: (error) => {
      toast.error(`Beslenme programı oluşturulamadı: ${toUserMessage(error)}`)
    },
  })
}

export function useRecommendations() {
  return useMutation<RecommendationResult, Error, RecommendationInput>({
    mutationFn: (input) => getRecommendations(input),
    onSuccess: () => {
      toast.success('Öneriler güncellendi.')
    },
    onError: (error) => {
      toast.error(`Öneriler alınamadı: ${toUserMessage(error)}`)
    },
  })
}
