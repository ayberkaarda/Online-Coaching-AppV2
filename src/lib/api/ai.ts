// AI backend çağrıları. Python servisine DOĞRUDAN gidilmez;
// istekler kendi Next.js proxy route'larımıza yapılır (API anahtarı sızmasın).
//
// GÜVENLİK: `/api/ai/*` uçları sunucuda oturum doğrulaması yapar (bkz. `handleAiProxy`
// içindeki auth kontrolü). Bu yüzden her istekte tarayıcı oturumunun access token'ı
// `Authorization: Bearer <token>` başlığıyla gönderilir. Oturum yoksa istek hiç
// atılmaz; kullanıcı anlamlı bir hata görsün diye `ApiError` fırlatılır.

import { supabase } from '@/lib/supabase/client'

import { ApiError, apiFetch } from './client'
import type {
  DietGenerateInput,
  DietGenerateResult,
  RecommendationInput,
  RecommendationResult,
  WorkoutGenerateInput,
  WorkoutGenerateResult,
} from './types'

/** Aktif oturumun `Authorization: Bearer <token>` başlığını üretir; oturum yoksa `ApiError` fırlatır. */
async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new ApiError(
      401,
      'NOT_AUTHENTICATED',
      'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
    )
  }

  return { Authorization: `Bearer ${session.access_token}` }
}

export async function generateWorkoutPlan(
  input: WorkoutGenerateInput,
  signal?: AbortSignal
): Promise<WorkoutGenerateResult> {
  return apiFetch<WorkoutGenerateResult>('/api/ai/workout', {
    method: 'POST',
    json: input,
    headers: await getAuthHeaders(),
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
    headers: await getAuthHeaders(),
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
    headers: await getAuthHeaders(),
    ...(signal ? { signal } : {}),
  })
}
