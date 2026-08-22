import { describe, expect, it } from 'vitest'
import { ageFromBirthDate, bmrMifflinStJeor, macroSplit, tdee } from './energy'

describe('bmrMifflinStJeor', () => {
  it('male: 80kg/180cm/30y = 1780 kcal', () => {
    expect(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBeCloseTo(
      1780,
      5
    )
  })

  it('female: 80kg/180cm/30y = 1614 kcal', () => {
    expect(bmrMifflinStJeor({ weightKg: 80, heightCm: 180, age: 30, sex: 'female' })).toBeCloseTo(
      1614,
      5
    )
  })
})

describe('tdee', () => {
  const bmr = 1780

  it.each([
    ['sedentary', 1.2],
    ['light', 1.375],
    ['moderate', 1.55],
    ['active', 1.725],
    ['very_active', 1.9],
  ] as const)('%s applies the %s multiplier', (activity, multiplier) => {
    expect(tdee(bmr, activity)).toBeCloseTo(bmr * multiplier, 5)
  })
})

describe('macroSplit', () => {
  it('bulk: 3000kcal TDEE, 80kg bodyweight', () => {
    expect(macroSplit(3000, 'bulk', 80)).toEqual({
      kcal: 3300,
      protein_g: 144,
      carb_g: 474,
      fat_g: 92,
    })
  })

  it('cut: 3000kcal TDEE, 80kg bodyweight', () => {
    expect(macroSplit(3000, 'cut', 80)).toEqual({
      kcal: 2400,
      protein_g: 176,
      carb_g: 273,
      fat_g: 67,
    })
  })

  it('recomp: 2800kcal TDEE, 70kg bodyweight', () => {
    expect(macroSplit(2800, 'recomp', 70)).toEqual({
      kcal: 2800,
      protein_g: 140,
      carb_g: 385,
      fat_g: 78,
    })
  })

  it('contest_prep: 2500kcal TDEE, 65kg bodyweight', () => {
    expect(macroSplit(2500, 'contest_prep', 65)).toEqual({
      kcal: 1875,
      protein_g: 169,
      carb_g: 183,
      fat_g: 52,
    })
  })

  it('clamps carb_g to 0 when protein+fat kcal exceed the target (extreme contest_prep)', () => {
    const result = macroSplit(800, 'contest_prep', 150)
    expect(result.carb_g).toBe(0)
    expect(result).toEqual({
      kcal: 600,
      protein_g: 390,
      carb_g: 0,
      fat_g: 17,
    })
  })
})

describe('ageFromBirthDate', () => {
  it('birthday already passed this year (age already incremented)', () => {
    expect(ageFromBirthDate('1990-06-15', '2024-07-01')).toBe(34)
  })

  it('birthday is today (counts as already had it)', () => {
    expect(ageFromBirthDate('1990-06-15', '2024-06-15')).toBe(34)
  })

  it('same month, day not yet reached', () => {
    expect(ageFromBirthDate('1990-06-15', '2024-06-14')).toBe(33)
  })

  it('earlier month, birthday not yet reached this year', () => {
    expect(ageFromBirthDate('1990-06-15', '2024-05-20')).toBe(33)
  })
})
