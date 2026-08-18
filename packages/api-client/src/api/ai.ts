// AI backend çağrıları. Python servisine DOĞRUDAN gidilmez;
// istekler kendi Next.js proxy route'larımıza yapılır (API anahtarı sızmasın).
//
// GÜVENLİK: `/api/ai/*` uçları sunucuda oturum doğrulaması yapar (bkz. `handleAiProxy`
// içindeki auth kontrolü). Bu yüzden her istekte tarayıcı oturumunun access token'ı
// `Authorization: Bearer <token>` başlığıyla gönderilir. Oturum yoksa istek hiç
// atılmaz; kullanıcı anlamlı bir hata görsün diye `ApiError` fırlatılır.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@repo/types'

import { ApiError, apiFetch } from './client'
import type {
  DietGenerateInput,
  DietGenerateResult,
  RecommendationInput,
  RecommendationResult,
  WorkoutGenerateInput,
  WorkoutGenerateResult,
} from './types'

/**
 * Aktif oturumun `Authorization: Bearer <token>` başlığını üretir; oturum yoksa `ApiError`
 * fırlatır.
 *
 * Bu modül HOOK DEĞİLDİR, dolayısıyla `useSupabaseClient()` çağıramaz — istemci ADR-0024
 * Ek-1'in `storage.ts` için sabitlediği desenle (açık ilk parametre) geçer; tek çağıran
 * `hooks/useAi.ts` onu context'ten alıp iletir.
 */
async function getAuthHeaders(client: SupabaseClient<Database>): Promise<HeadersInit> {
  const {
    data: { session },
  } = await client.auth.getSession()

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
  client: SupabaseClient<Database>,
  input: WorkoutGenerateInput,
  signal?: AbortSignal
): Promise<WorkoutGenerateResult> {
  return apiFetch<WorkoutGenerateResult>('/api/ai/workout', {
    method: 'POST',
    json: input,
    headers: await getAuthHeaders(client),
    ...(signal ? { signal } : {}),
  })
}

export async function generateDietPlan(
  client: SupabaseClient<Database>,
  input: DietGenerateInput,
  signal?: AbortSignal
): Promise<DietGenerateResult> {
  return apiFetch<DietGenerateResult>('/api/ai/nutrition', {
    method: 'POST',
    json: input,
    headers: await getAuthHeaders(client),
    ...(signal ? { signal } : {}),
  })
}

export async function getRecommendations(
  client: SupabaseClient<Database>,
  input: RecommendationInput,
  signal?: AbortSignal
): Promise<RecommendationResult> {
  return apiFetch<RecommendationResult>('/api/ai/recommendations', {
    method: 'POST',
    json: input,
    headers: await getAuthHeaders(client),
    ...(signal ? { signal } : {}),
  })
}
