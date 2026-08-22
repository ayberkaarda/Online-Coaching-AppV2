import type { LoggedSet, OneRepMaxFormula } from './types'

/**
 * Tek set ağırlık+tekrardan tahmini 1RM (bir tekrarlık maksimum) hesaplar.
 *
 * - Epley: weightKg * (1 + reps/30)
 * - Brzycki: weightKg * 36 / (37 - reps)
 *
 * `reps === 1` özel durumdur: gerçek 1RM zaten ağırlığın kendisidir. Brzycki formülü bunu
 * matematiksel olarak zaten üretir (36/36 = 1) ama Epley üretmez (1 + 1/30 ≠ 1) — bu yüzden
 * iki formül için de reps===1 kısayolu açıkça uygulanır.
 */
export function estimate1RM(weightKg: number, reps: number, formula: OneRepMaxFormula): number {
  if (reps < 1) {
    throw new RangeError('reps must be >= 1')
  }

  if (formula === 'brzycki' && reps >= 37) {
    throw new RangeError('Brzycki formülü reps >= 37 için tanımsız (payda <= 0)')
  }

  if (reps === 1) {
    return weightKg
  }

  if (formula === 'epley') {
    return weightKg * (1 + reps / 30)
  }

  return (weightKg * 36) / (37 - reps)
}

/** Verilen setlerin toplam tonajı: Σ weight_kg * reps. Boş dizi için 0. */
export function tonnage(sets: readonly LoggedSet[]): number {
  return sets.reduce((total, set) => total + set.weight_kg * set.reps, 0)
}
