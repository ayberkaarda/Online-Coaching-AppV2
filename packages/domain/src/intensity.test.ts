import { describe, expect, it } from 'vitest'
import { rirToRpe, rpeToPercent, rpeToRir } from './intensity'

describe('rirToRpe', () => {
  it('converts rir to rpe (10 - rir)', () => {
    expect(rirToRpe(2)).toBe(8)
  })

  it('accepts boundary values 0 and 10', () => {
    expect(rirToRpe(0)).toBe(10)
    expect(rirToRpe(10)).toBe(0)
  })

  it('throws RangeError below 0', () => {
    expect(() => rirToRpe(-1)).toThrow(RangeError)
  })

  it('throws RangeError above 10', () => {
    expect(() => rirToRpe(11)).toThrow(RangeError)
  })
})

describe('rpeToRir', () => {
  it('converts rpe to rir (10 - rpe)', () => {
    expect(rpeToRir(7)).toBe(3)
  })

  it('accepts boundary values 0 and 10', () => {
    expect(rpeToRir(0)).toBe(10)
    expect(rpeToRir(10)).toBe(0)
  })

  it('throws RangeError below 0', () => {
    expect(() => rpeToRir(-1)).toThrow(RangeError)
  })

  it('throws RangeError above 10', () => {
    expect(() => rpeToRir(11)).toThrow(RangeError)
  })
})

describe('rpeToPercent', () => {
  it('computes percent from rpe + reps via the transparent two-step formula', () => {
    // totalReps = 5 + (10 - 8) = 7 ; percent = 100 / (1 + 7/30)
    expect(rpeToPercent(8, 5)).toBeCloseTo(81.08, 2)
  })

  it('accepts boundary rpe values 1 and 10', () => {
    expect(rpeToPercent(1, 5)).toBeCloseTo(100 / (1 + (5 + 9) / 30), 5)
    expect(rpeToPercent(10, 5)).toBeCloseTo(100 / (1 + 5 / 30), 5)
  })

  it('throws RangeError when rpe < 1', () => {
    expect(() => rpeToPercent(0, 5)).toThrow(RangeError)
  })

  it('throws RangeError when rpe > 10', () => {
    expect(() => rpeToPercent(11, 5)).toThrow(RangeError)
  })

  it('throws RangeError when reps < 1', () => {
    expect(() => rpeToPercent(8, 0)).toThrow(RangeError)
  })
})
