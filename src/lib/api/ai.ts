// AI backend çağrıları. Python servisine DOĞRUDAN gidilmez;
// istekler kendi Next.js proxy route'larımıza yapılır (API anahtarı sızmasın).

import { apiFetch } from './client'
import type {
  DietGenerateInput,
  DietGenerateResult,
  RecommendationInput,
  RecommendationResult,
  WorkoutGenerateInput,
  WorkoutGenerateResult,
} from './types'

export async function generateWorkoutPlan(
  input: WorkoutGenerateInput,
  signal?: AbortSignal
): Promise<WorkoutGenerateResult> {
  return apiFetch<WorkoutGenerateResult>('/api/ai/workout', {
    method: 'POST',
    json: input,
    ...(signal ? { signal } : {}),
  })
}

export async function generateDietPlan(
  input: DietGenerateInput,
  signal?: AbortSignal
): Promise<DietGenerateResult> {
  return apiFetch<DietGenerateResult>('/api/ai/nutrition', {
    method: 'POST',
    json: input,
    ...(signal ? { signal } : {}),
  })
}

export async function getRecommendations(
  input: RecommendationInput,
  signal?: AbortSignal
): Promise<RecommendationResult> {
  return apiFetch<RecommendationResult>('/api/ai/recommendations', {
    method: 'POST',
    json: input,
    ...(signal ? { signal } : {}),
  })
}
