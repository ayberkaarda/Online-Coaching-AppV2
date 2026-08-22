import { describe, expect, it } from 'vitest'
import { estimate1RM, tonnage } from './strength'

describe('estimate1RM', () => {
  it('Epley: 100kg x 5 reps ≈ 116.67kg', () => {
    expect(estimate1RM(100, 5, 'epley')).toBeCloseTo(116.67, 2)
  })

  it('Brzycki: 100kg x 5 reps = 112.5kg', () => {
    expect(estimate1RM(100, 5, 'brzycki')).toBeCloseTo(112.5, 2)
  })

  it('reps === 1 returns weightKg as-is for epley', () => {
    expect(estimate1RM(150, 1, 'epley')).toBe(150)
  })

  it('reps === 1 returns weightKg as-is for brzycki', () => {
    expect(estimate1RM(150, 1, 'brzycki')).toBe(150)
  })

  it('epley does not throw for reps >= 37 (brzycki-only guard)', () => {
    expect(estimate1RM(100, 37, 'epley')).toBeCloseTo(100 * (1 + 37 / 30), 5)
  })

  it('throws RangeError when reps < 1 (epley)', () => {
    expect(() => estimate1RM(100, 0, 'epley')).toThrow(RangeError)
  })

  it('throws RangeError when reps < 1 (brzycki)', () => {
    expect(() => estimate1RM(100, 0, 'brzycki')).toThrow(RangeError)
  })

  it('throws RangeError for brzycki when reps >= 37 (denominator <= 0)', () => {
    expect(() => estimate1RM(100, 37, 'brzycki')).toThrow(RangeError)
    expect(() => estimate1RM(100, 40, 'brzycki')).toThrow(RangeError)
  })
})

describe('tonnage', () => {
  it('returns 0 for an empty set list', () => {
    expect(tonnage([])).toBe(0)
  })

  it('sums weight_kg * reps across sets', () => {
    expect(
      tonnage([
        { weight_kg: 100, reps: 5 },
        { weight_kg: 80, reps: 8 },
      ])
    ).toBe(100 * 5 + 80 * 8)
  })
})
