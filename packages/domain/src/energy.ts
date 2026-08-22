import type { ActivityLevel, Goal, MacroTargets, Sex } from './types'

export interface MifflinStJeorInput {
  weightKg: number
  heightCm: number
  age: number
  sex: Sex
}

/**
 * Mifflin-St Jeor formülüyle bazal metabolizma hızı (BMR, kcal/gün).
 * Erkek:  10*kg + 6.25*cm - 5*yaş + 5
 * Kadın:  10*kg + 6.25*cm - 5*yaş - 161
 */
export function bmrMifflinStJeor({ weightKg, heightCm, age, sex }: MifflinStJeorInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/** BMR'yi aktivite seviyesi çarpanıyla TDEE'ye (toplam günlük enerji harcaması) çevirir. */
export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity]
}

const GOAL_KCAL_MULTIPLIERS: Record<Goal, number> = {
  bulk: 1.1,
  cut: 0.8,
  recomp: 1.0,
  contest_prep: 0.75,
}

const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = {
  bulk: 1.8,
  recomp: 2.0,
  cut: 2.2,
  contest_prep: 2.6,
}

const FAT_KCAL_SHARE = 0.25
const PROTEIN_KCAL_PER_G = 4
const CARB_KCAL_PER_G = 4
const FAT_KCAL_PER_G = 9

/**
 * TDEE + hedef + vücut ağırlığından makro hedeflerini türetir:
 * 1. Hedef kalori = tdeeKcal * hedefe göre çarpan (bulk/cut/recomp/contest_prep).
 * 2. Protein (g) = hedefe göre g/kg * vücut ağırlığı, yuvarlanmış.
 * 3. Yağ (g) = hedef kalorinin %25'i / 9 kcal/g, yuvarlanmış.
 * 4. Karbonhidrat (g) = kalan kalori (protein ve yağ kcal'i düşülmüş) / 4 kcal/g,
 *    yuvarlanmış; negatif çıkarsa 0'a kırpılır.
 */
export function macroSplit(tdeeKcal: number, goal: Goal, bodyweightKg: number): MacroTargets {
  const targetKcal = tdeeKcal * GOAL_KCAL_MULTIPLIERS[goal]

  const protein_g = Math.round(GOAL_PROTEIN_G_PER_KG[goal] * bodyweightKg)
  const fat_g = Math.round((targetKcal * FAT_KCAL_SHARE) / FAT_KCAL_PER_G)
  const remainingKcal = targetKcal - protein_g * PROTEIN_KCAL_PER_G - fat_g * FAT_KCAL_PER_G
  const carb_g = Math.max(0, Math.round(remainingKcal / CARB_KCAL_PER_G))

  return {
    kcal: Math.round(targetKcal),
    protein_g,
    carb_g,
    fat_g,
  }
}

/**
 * İki `YYYY-MM-DD` tarihinden (doğum tarihi, bugün) tam yaşı hesaplar. Saf: `Date.now()`
 * KULLANMAZ, `todayISO` parametre olarak alınır (test edilebilirlik için).
 */
export function ageFromBirthDate(birthDateISO: string, todayISO: string): number {
  // `noUncheckedIndexedAccess` `split('-')` sonucunun her elemanını `number | undefined`
  // yapar; format `YYYY-MM-DD` olarak garanti edildiğinden (sözleşme, doğrulama YOK)
  // destructuring varsayılanları TS'i tatmin eder ve pratikte hiç devreye girmez.
  const [birthYear = 0, birthMonth = 0, birthDay = 0] = birthDateISO.split('-').map(Number)
  const [todayYear = 0, todayMonth = 0, todayDay = 0] = todayISO.split('-').map(Number)

  let age = todayYear - birthYear
  const birthdayNotYetReachedThisYear =
    todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)
  if (birthdayNotYetReachedThisYear) {
    age -= 1
  }

  return age
}
