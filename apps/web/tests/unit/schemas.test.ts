import { describe, expect, it } from 'vitest'

import {
  aiDietSchema,
  aiWorkoutSchema,
  createClientSchema,
  dailyLogSchema,
  formatZodError,
  formCheckSchema,
  loginSchema,
  notificationSchema,
  passwordChangeSchema,
  quickAddFoodSchema,
  recommendationSchema,
  workoutLogSchema,
} from '@repo/types/schemas'

describe('loginSchema', () => {
  it('geçerli e-posta ve şifre ile geçer', () => {
    expect(loginSchema.safeParse({ email: 'test@example.com', password: '123456' }).success).toBe(
      true
    )
  })

  it('geçersiz e-postada Türkçe hata mesajıyla düşer', () => {
    const result = loginSchema.safeParse({ email: 'bad-email', password: '123456' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = formatZodError(result.error)
      const emailError = errors.find((e) => e.path === 'email')
      expect(emailError?.message).toBe('Geçerli bir e-posta adresi girin.')
    }
  })

  it('kısa şifrede düşer', () => {
    expect(loginSchema.safeParse({ email: 'test@example.com', password: '123' }).success).toBe(
      false
    )
  })
})

describe('passwordChangeSchema', () => {
  it('harf ve rakam içeren 8+ karakterli şifre geçer', () => {
    expect(passwordChangeSchema.safeParse({ password: 'abcd1234' }).success).toBe(true)
  })

  it('sadece harf içeren şifre düşer', () => {
    expect(passwordChangeSchema.safeParse({ password: 'abcdefgh' }).success).toBe(false)
  })

  it('sadece rakam içeren şifre düşer', () => {
    expect(passwordChangeSchema.safeParse({ password: '12345678' }).success).toBe(false)
  })

  it('7 karakterli şifre düşer', () => {
    expect(passwordChangeSchema.safeParse({ password: 'abc1234' }).success).toBe(false)
  })
})

describe('dailyLogSchema', () => {
  const base = { water_lt: 2, sodium_mg: 1500, protein: 150, carb: 200, fat: 70 }

  it('geçerli değerlerle geçer', () => {
    expect(dailyLogSchema.safeParse(base).success).toBe(true)
  })

  it('string sayılar coerce ile geçer ve sayıya çevrilir', () => {
    const result = dailyLogSchema.safeParse({ ...base, water_lt: '2.5' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.water_lt).toBe(2.5)
  })

  it('water_lt 20’den büyükse düşer', () => {
    expect(dailyLogSchema.safeParse({ ...base, water_lt: 25 }).success).toBe(false)
  })

  it('sodium_mg negatifse düşer', () => {
    expect(dailyLogSchema.safeParse({ ...base, sodium_mg: -1 }).success).toBe(false)
  })
})

describe('formCheckSchema', () => {
  it('weight sınır değerleri (20 ve 400) dahildir', () => {
    expect(formCheckSchema.safeParse({ weight: 20 }).success).toBe(true)
    expect(formCheckSchema.safeParse({ weight: 400 }).success).toBe(true)
  })

  it('weight sınırların dışında düşer', () => {
    expect(formCheckSchema.safeParse({ weight: 19.99 }).success).toBe(false)
    expect(formCheckSchema.safeParse({ weight: 400.01 }).success).toBe(false)
  })

  it('500 karakterden uzun notes düşer', () => {
    expect(formCheckSchema.safeParse({ weight: 80, notes: 'a'.repeat(501) }).success).toBe(false)
  })

  it('500 karakter notes geçer', () => {
    expect(formCheckSchema.safeParse({ weight: 80, notes: 'a'.repeat(500) }).success).toBe(true)
  })
})

describe('notificationSchema', () => {
  const base = { target: 'all' as const, title: 'Başlık', message: 'Mesaj içeriği' }

  it('target "all" ile geçer', () => {
    expect(notificationSchema.safeParse(base).success).toBe(true)
  })

  it('boş title düşer', () => {
    expect(notificationSchema.safeParse({ ...base, title: '' }).success).toBe(false)
  })

  it('2000 karakterden uzun message düşer', () => {
    expect(notificationSchema.safeParse({ ...base, message: 'a'.repeat(2001) }).success).toBe(false)
  })
})

describe('createClientSchema', () => {
  const base = { email: 'test@example.com', password: 'password1', fullName: 'Ali Veli' }

  it('geçerli girdiyle geçer', () => {
    expect(createClientSchema.safeParse(base).success).toBe(true)
  })

  it('kısa şifrede düşer', () => {
    expect(createClientSchema.safeParse({ ...base, password: 'abc1234' }).success).toBe(false)
  })

  it('kısa fullName’de düşer', () => {
    expect(createClientSchema.safeParse({ ...base, fullName: 'A' }).success).toBe(false)
  })
})

describe('workoutLogSchema', () => {
  const base = { exercise_name: 'Squat', weight_kg: 100, reps: 5, rpe: 8 }

  it('rpe 1-10 sınırları dahil geçer', () => {
    expect(workoutLogSchema.safeParse({ ...base, rpe: 1 }).success).toBe(true)
    expect(workoutLogSchema.safeParse({ ...base, rpe: 10 }).success).toBe(true)
  })

  it('rpe sınırların dışında düşer', () => {
    expect(workoutLogSchema.safeParse({ ...base, rpe: 11 }).success).toBe(false)
    expect(workoutLogSchema.safeParse({ ...base, rpe: 0 }).success).toBe(false)
  })

  it('reps 0 ise düşer', () => {
    expect(workoutLogSchema.safeParse({ ...base, reps: 0 }).success).toBe(false)
  })

  it('rpe opsiyoneldir, verilmezse geçer', () => {
    const withoutRpe = { exercise_name: 'Squat', weight_kg: 100, reps: 5 }
    expect(workoutLogSchema.safeParse(withoutRpe).success).toBe(true)
  })
})

describe('aiWorkoutSchema', () => {
  const base = { split_type: 'ppl' as const, age: 25, goal: 'cut' as const, weight: 80 }

  it('geçerli split_type değerleriyle geçer', () => {
    for (const split_type of ['ppl_torso_limbs', 'ppl', 'upper_lower', 'torso_limbs'] as const) {
      expect(aiWorkoutSchema.safeParse({ ...base, split_type }).success).toBe(true)
    }
  })

  it('geçersiz split_type enum değerinde düşer', () => {
    expect(aiWorkoutSchema.safeParse({ ...base, split_type: 'invalid_split' }).success).toBe(false)
  })

  it('user_prompt verilmezse varsayılan boş string olur', () => {
    const result = aiWorkoutSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.user_prompt).toBe('')
  })
})

describe('aiDietSchema', () => {
  const base = {
    age: 25,
    height_cm: 175,
    weight_kg: 75,
    gender: 'male' as const,
    steps: 8000,
    goal: 'cut' as const,
  }

  it('geçerli girdiyle geçer', () => {
    expect(aiDietSchema.safeParse(base).success).toBe(true)
  })

  it('gender "other" ise düşer', () => {
    expect(aiDietSchema.safeParse({ ...base, gender: 'other' }).success).toBe(false)
  })

  it('steps üst sınırı (100000) aşılırsa düşer, sınırda geçer', () => {
    expect(aiDietSchema.safeParse({ ...base, steps: 100_000 }).success).toBe(true)
    expect(aiDietSchema.safeParse({ ...base, steps: 100_001 }).success).toBe(false)
  })
})

describe('recommendationSchema', () => {
  it('boş girdi (yalnızca goal) varsayılanlarla geçer', () => {
    const result = recommendationSchema.safeParse({ goal: 'cut' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.recent_weights).toEqual([])
      expect(result.data.recent_macros).toEqual([])
      expect(result.data.adherence_days).toBe(0)
    }
  })

  it('366 elemanlı recent_weights dizisi düşer', () => {
    const result = recommendationSchema.safeParse({
      goal: 'cut',
      recent_weights: Array(366).fill(70),
    })
    expect(result.success).toBe(false)
  })

  it('365 elemanlı recent_weights dizisi geçer', () => {
    const result = recommendationSchema.safeParse({
      goal: 'cut',
      recent_weights: Array(365).fill(70),
    })
    expect(result.success).toBe(true)
  })
})

describe('quickAddFoodSchema', () => {
  const base = { day: 'Pazartesi' as const, foodName: 'Yumurta', grams: 100 }

  it('geçerli Türkçe gün adıyla geçer', () => {
    expect(quickAddFoodSchema.safeParse(base).success).toBe(true)
  })

  it('İngilizce gün adı ("Monday") düşer', () => {
    expect(quickAddFoodSchema.safeParse({ ...base, day: 'Monday' }).success).toBe(false)
  })

  it('grams 0 ise düşer', () => {
    expect(quickAddFoodSchema.safeParse({ ...base, grams: 0 }).success).toBe(false)
  })
})

describe('formatZodError', () => {
  it('başarısız safeParse sonucundan {path, message}[] üretir; nested path noktalı string olur', () => {
    const result = recommendationSchema.safeParse({
      goal: 'cut',
      recent_macros: [{ protein: 'abc', carb: 0, fat: 0 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = formatZodError(result.error)
      expect(errors.length).toBeGreaterThan(0)
      const nested = errors.find((e) => e.path === 'recent_macros.0.protein')
      expect(nested).toBeDefined()
      expect(typeof nested?.message).toBe('string')
      expect((nested?.message.length ?? 0) > 0).toBe(true)
    }
  })

  it('top-level bir alan hatasında path, alan adının kendisi olur', () => {
    const result = loginSchema.safeParse({ email: '', password: '123456' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = formatZodError(result.error)
      expect(errors.some((e) => e.path === 'email')).toBe(true)
    }
  })
})
