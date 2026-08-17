// Uygulama alan (domain) tipleri: veritabanı satırlarının okunabilir takma adları,
// haftalık plan yapıları ve bunlar için güvenli parse/normalize yardımcıları.
// Rol modeli: 'coach' = KOÇ, 'client' = DANIŞAN.

import type { Enums, Json, Tables } from './database'

export type UserRole = Enums<'user_role'>
export type ApprovalStatus = Enums<'approval_status'>

export type Profile = Tables<'profiles'>
/** Uygulama genelinde "kullanıcı" dendiğinde kastedilen profil kaydı. */
export type User = Profile

export type Notification = Tables<'notifications'>
export type FormCheck = Tables<'form_checks'>
export type WorkoutLog = Tables<'workout_logs'>
export type ProgramApproval = Tables<'program_approvals'>
export type Message = Tables<'messages'>
export type Exercise = Tables<'exercises'>
export type FoodItem = Tables<'food_database'>

// ---------------------------------------------------------------------------
// Makrolar
// ---------------------------------------------------------------------------

export interface Macros {
  protein: number
  carb: number
  fat: number
}

export type DailyLogRow = Tables<'daily_logs'>

/** `daily_logs` satırının `macros` alanı `Macros` olarak daraltılmış hâli. */
export interface DailyLog extends Omit<DailyLogRow, 'macros'> {
  macros: Macros
}

/** Sayıya çevrilemeyen/eksik değerleri 0'a düşüren güvenli makro parse'ı. */
export function parseMacros(value: Json | null | undefined): Macros {
  const empty: Macros = { protein: 0, carb: 0, fat: 0 }
  if (value === null || value === undefined) return empty

  let source: unknown = value
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source) as unknown
    } catch {
      return empty
    }
  }

  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return empty
  }

  const record = source as Record<string, unknown>
  return {
    protein: toFiniteNumber(record['protein']),
    carb: toFiniteNumber(record['carb']),
    fat: toFiniteNumber(record['fat']),
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

// ---------------------------------------------------------------------------
// Haftalık planlar
// ---------------------------------------------------------------------------

export const DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const

export type DayName = (typeof DAY_NAMES)[number]

/** Gün -> serbest metin antrenman içeriği. */
export type WorkoutPlan = Record<DayName, string>

export interface NutritionEntry {
  /** "Yulaf:80, Tavuk Göğsü:200" biçiminde besin listesi. */
  items: string
  /** Gün toplam kalorisi (kcal). */
  total: number
}

/** Gün -> beslenme içeriği + toplam kalori. */
export type NutritionPlan = Record<DayName, NutritionEntry>

export interface Plan {
  workout: WorkoutPlan | null
  nutrition: NutritionPlan | null
}

function buildEmptyWorkoutPlan(): WorkoutPlan {
  const plan = {} as WorkoutPlan
  for (const day of DAY_NAMES) plan[day] = ''
  return plan
}

function buildEmptyNutritionPlan(): NutritionPlan {
  const plan = {} as NutritionPlan
  for (const day of DAY_NAMES) plan[day] = { items: '', total: 0 }
  return plan
}

export const EMPTY_WORKOUT_PLAN: WorkoutPlan = buildEmptyWorkoutPlan()
export const EMPTY_NUTRITION_PLAN: NutritionPlan = buildEmptyNutritionPlan()

/**
 * Gün->metin şeklindeki plan JSON string'ini güvenle parse eder.
 * Bozuk JSON veya eksik günler tam bir haftalık plana tamamlanır.
 *
 * NOT (Faz 1b Adım 2): antrenman planının kaynağı artık `workout_plans` /
 * `workout_plan_exercises` tablolarıdır (bkz. src/hooks/usePlans.ts). Bu
 * fonksiyon yalnızca hâlâ JSON olarak saklanan `program_approvals.workout_data`
 * için kullanılır; DEPRECATED `profiles.workout_plan` kolonu okunmaz.
 */
export function parseWorkoutPlan(raw: string | null | undefined): WorkoutPlan {
  const plan = buildEmptyWorkoutPlan()
  if (!raw) return plan

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return plan
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return plan
  }

  const record = parsed as Record<string, unknown>
  for (const day of DAY_NAMES) {
    const value = record[day]
    plan[day] = typeof value === 'string' ? value : ''
  }
  return plan
}

export function isDayName(v: string): v is DayName {
  return (DAY_NAMES as readonly string[]).includes(v)
}

/** 'coach' = koç. Yetki kontrollerinde tek doğruluk kaynağı. */
export function isCoach(role: UserRole | null | undefined): boolean {
  return role === 'coach'
}
