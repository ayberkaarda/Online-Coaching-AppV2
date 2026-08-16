// Frontend <-> Python (FastAPI) AI backend sözleşmesi.
// Bu tipler ai_backend/app/schemas/*.py ile birebir eşleşmelidir.

import type { Macros } from '@/types/domain'

export type SplitType = 'ppl_torso_limbs' | 'ppl' | 'upper_lower' | 'torso_limbs'
export type Goal = 'cut' | 'bulk' | 'maintain'
export type Gender = 'male' | 'female'

// ---------------------------------------------------------------------------
// POST /analyze/workout
// ---------------------------------------------------------------------------

export interface WorkoutGenerateInput {
  split_type: SplitType
  user_prompt: string
  age: number
  goal: Goal
  weight: number
}

export interface WorkoutGenerateResult {
  status: 'success'
  message: string
  ai_analysis: string
  /** Gün adı -> serbest metin antrenman içeriği. */
  workout_plan: Record<string, string>
}

// ---------------------------------------------------------------------------
// POST /analyze/nutrition
// ---------------------------------------------------------------------------

export interface DietGenerateInput {
  age: number
  height_cm: number
  weight_kg: number
  gender: Gender
  steps: number
  goal: Goal
  user_prompt: string
}

export interface MacroTargets {
  protein_g: number
  carb_g: number
  fat_g: number
  calories: number
}

export interface DietGenerateResult {
  status: 'success'
  target_calories: number
  ai_analysis: string
  /** Gün adı -> "Besin:Gramaj, Besin:Gramaj" biçiminde liste. */
  diet_plan: Record<string, string>
  macro_targets?: MacroTargets
}

// ---------------------------------------------------------------------------
// POST /recommendations
// ---------------------------------------------------------------------------

export interface RecommendationInput {
  // AI backend tel protokolü: alan adı ai_backend/app/schemas/recommendations.py ile eşleşmeli (bkz. Faz 1a rol yeniden adlandırması).
  client_id?: string
  goal: Goal
  recent_weights: number[]
  recent_macros: Macros[]
  adherence_days: number
}

export interface Recommendation {
  category: 'nutrition' | 'workout' | 'recovery' | 'adherence'
  priority: 'low' | 'medium' | 'high'
  title: string
  detail: string
}

export interface RecommendationResult {
  status: 'success'
  summary: string
  recommendations: Recommendation[]
}

// ---------------------------------------------------------------------------
// Ortak hata gövdesi (Next.js proxy route'ları bu biçimde döner)
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    request_id?: string
    details?: unknown
  }
}
