/**
 * RIR (Reps in Reserve) → RPE (Rate of Perceived Exertion) dönüşümü: `10 - rir`.
 * Geçerli aralık 0–10 (dahil); dışı RangeError.
 */
export function rirToRpe(rir: number): number {
  if (rir < 0 || rir > 10) {
    throw new RangeError('rir must be between 0 and 10')
  }
  return 10 - rir
}

/**
 * RPE → RIR dönüşümü: `10 - rpe`. Geçerli aralık 0–10 (dahil); dışı RangeError.
 */
export function rpeToRir(rpe: number): number {
  if (rpe < 0 || rpe > 10) {
    throw new RangeError('rpe must be between 0 and 10')
  }
  return 10 - rpe
}

/**
 * RPE + gerçekleşen tekrar sayısından, o setin tahmini 1RM yüzdesini hesaplar.
 *
 * Şeffaf, iki adımlı formül (nasıl hesaplandığı açık):
 * 1. RIR = 10 - rpe kabulüyle, başarısızlığa kalan TOPLAM tekrar sayısı bulunur:
 *    `totalReps = reps + (10 - rpe)` (yani reps + RIR).
 * 2. Bu toplam tekrar sayısı, Epley 1RM formülünün tersine (weightKg=1RM=100 kabulüyle)
 *    sokularak yüzdeye çevrilir: `percent = 100 / (1 + totalReps/30)`.
 *
 * `rpe` 1–10 (dahil), `reps >= 1` olmalı; aksi RangeError.
 */
export function rpeToPercent(rpe: number, reps: number): number {
  if (rpe < 1 || rpe > 10) {
    throw new RangeError('rpe must be between 1 and 10')
  }
  if (reps < 1) {
    throw new RangeError('reps must be >= 1')
  }

  const totalReps = reps + (10 - rpe)
  return 100 / (1 + totalReps / 30)
}
