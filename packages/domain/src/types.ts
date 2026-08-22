// Sözleşme tipleri (Tur 2 — İmza Dilimi, teslimat 1). Sonraki migration bu tipleri
// implemente edecek; burada tanım DIŞINDA davranış yok.

export type SetType = 'warmup' | 'working' | 'drop' | 'failure'

export type Goal = 'bulk' | 'cut' | 'recomp' | 'contest_prep'

export type OneRepMaxFormula = 'epley' | 'brzycki'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export type Sex = 'male' | 'female'

export interface MacroTargets {
  kcal: number
  protein_g: number
  carb_g: number
  fat_g: number
}

export interface LoggedSet {
  weight_kg: number
  reps: number
}

// Yoğunluk: bir set RPE VEYA RIR kaydeder; converter'lar (bkz. intensity.ts) köprüler.
export type Intensity = { kind: 'rpe'; value: number } | { kind: 'rir'; value: number }

export interface MesocycleSpec {
  name: string
  weeks: number
  deloadWeek: number | null
  goal: Goal
}
