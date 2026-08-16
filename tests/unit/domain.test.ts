import { describe, expect, it } from 'vitest'

import {
  DAY_NAMES,
  EMPTY_NUTRITION_PLAN,
  EMPTY_WORKOUT_PLAN,
  isCoach,
  isDayName,
  parseMacros,
  parseNutritionPlan,
  parseWorkoutPlan,
} from '@/types/domain'

describe('parseMacros', () => {
  it('sayısal alanları olduğu gibi döner', () => {
    expect(parseMacros({ protein: 1, carb: 2, fat: 3 })).toEqual({ protein: 1, carb: 2, fat: 3 })
  })

  it('string sayıları sayıya çevirir', () => {
    expect(parseMacros({ protein: '30', carb: '40', fat: '10' })).toEqual({
      protein: 30,
      carb: 40,
      fat: 10,
    })
  })

  it('null/undefined için tüm alanlar 0 olur', () => {
    expect(parseMacros(null)).toEqual({ protein: 0, carb: 0, fat: 0 })
    expect(parseMacros(undefined)).toEqual({ protein: 0, carb: 0, fat: 0 })
  })

  it("geçersiz JSON string ('abc') için tüm alanlar 0 olur", () => {
    expect(parseMacros('abc')).toEqual({ protein: 0, carb: 0, fat: 0 })
  })

  it('dizi girdisi için tüm alanlar 0 olur', () => {
    expect(parseMacros([1, 2, 3])).toEqual({ protein: 0, carb: 0, fat: 0 })
  })

  it('eksik alanlar 0 ile doldurulur', () => {
    expect(parseMacros({ protein: 5 })).toEqual({ protein: 5, carb: 0, fat: 0 })
  })

  it('sayıya çevrilemeyen değerler NaN üretmez, 0 olur', () => {
    const result = parseMacros({ protein: 'xyz', carb: 10, fat: 5 })
    expect(Number.isNaN(result.protein)).toBe(false)
    expect(result.protein).toBe(0)
  })
})

describe('parseWorkoutPlan', () => {
  it('geçerli JSON verildiğinde 7 günün tamamı mevcut olur, eksikler boş string olur', () => {
    const plan = parseWorkoutPlan('{"Pazartesi":"Push"}')
    expect(Object.keys(plan)).toHaveLength(7)
    expect(plan.Pazartesi).toBe('Push')
    expect(plan.Salı).toBe('')
    expect(plan.Pazar).toBe('')
  })

  it('bozuk JSON için tüm günler boş string olur', () => {
    const plan = parseWorkoutPlan('{bozuk json')
    for (const day of DAY_NAMES) expect(plan[day]).toBe('')
  })

  it('null için tüm günler boş string olur', () => {
    const plan = parseWorkoutPlan(null)
    for (const day of DAY_NAMES) expect(plan[day]).toBe('')
  })

  it('bilinmeyen fazladan anahtarlar yok sayılır', () => {
    const plan = parseWorkoutPlan('{"Pazartesi":"Push","Monday":"Ignored","foo":"bar"}')
    expect(plan.Pazartesi).toBe('Push')
    expect(Object.keys(plan)).toHaveLength(7)
    expect((plan as Record<string, string>)['Monday']).toBeUndefined()
  })

  it('gün değeri string değilse boş string olur', () => {
    const plan = parseWorkoutPlan('{"Pazartesi": 123}')
    expect(plan.Pazartesi).toBe('')
  })
})

describe('parseNutritionPlan', () => {
  it('geçerli JSON verildiğinde 7 günün tamamı mevcut olur, eksikler {items:"",total:0} olur', () => {
    const plan = parseNutritionPlan('{"Pazartesi":{"items":"Yulaf:80","total":450}}')
    expect(Object.keys(plan)).toHaveLength(7)
    expect(plan.Pazartesi).toEqual({ items: 'Yulaf:80', total: 450 })
    expect(plan.Salı).toEqual({ items: '', total: 0 })
    expect(typeof plan.Pazartesi.total).toBe('number')
  })

  it('bozuk JSON için tüm günler varsayılan olur', () => {
    const plan = parseNutritionPlan('{bozuk json')
    for (const day of DAY_NAMES) expect(plan[day]).toEqual({ items: '', total: 0 })
  })

  it('null için tüm günler varsayılan olur', () => {
    const plan = parseNutritionPlan(null)
    for (const day of DAY_NAMES) expect(plan[day]).toEqual({ items: '', total: 0 })
  })

  it('total string olarak gelirse sayıya çevrilir', () => {
    const plan = parseNutritionPlan('{"Pazartesi":{"items":"x","total":"450"}}')
    expect(plan.Pazartesi.total).toBe(450)
    expect(typeof plan.Pazartesi.total).toBe('number')
  })

  it('gün değeri obje değilse (örn. dizi) o gün varsayılanda kalır', () => {
    const plan = parseNutritionPlan('{"Pazartesi":["x"]}')
    expect(plan.Pazartesi).toEqual({ items: '', total: 0 })
  })
})

describe('isDayName', () => {
  it('geçerli bir Türkçe gün adında true döner', () => {
    expect(isDayName('Pazartesi')).toBe(true)
  })

  it('İngilizce gün adında false döner', () => {
    expect(isDayName('Monday')).toBe(false)
  })

  it('boş string için false döner', () => {
    expect(isDayName('')).toBe(false)
  })
})

describe('isCoach', () => {
  it('"coach" rolünde true döner', () => {
    expect(isCoach('coach')).toBe(true)
  })

  it('"client" rolünde false döner', () => {
    expect(isCoach('client')).toBe(false)
  })

  it('null/undefined için false döner', () => {
    expect(isCoach(null)).toBe(false)
    expect(isCoach(undefined)).toBe(false)
  })
})

describe('DAY_NAMES', () => {
  it('7 eleman içerir, Pazartesi ile başlar Pazar ile biter', () => {
    expect(DAY_NAMES).toHaveLength(7)
    expect(DAY_NAMES[0]).toBe('Pazartesi')
    expect(DAY_NAMES[DAY_NAMES.length - 1]).toBe('Pazar')
  })
})

describe('EMPTY_WORKOUT_PLAN / EMPTY_NUTRITION_PLAN', () => {
  it('her ikisi de 7 anahtar içerir', () => {
    expect(Object.keys(EMPTY_WORKOUT_PLAN)).toHaveLength(7)
    expect(Object.keys(EMPTY_NUTRITION_PLAN)).toHaveLength(7)
  })

  it('parseWorkoutPlan(null) her çağrıda yeni bir nesne döner; mutasyon paylaşılan sabiti bozmaz', () => {
    const plan = parseWorkoutPlan(null)
    expect(plan).not.toBe(EMPTY_WORKOUT_PLAN)
    plan.Pazartesi = 'Değiştirildi'
    expect(EMPTY_WORKOUT_PLAN.Pazartesi).toBe('')
  })

  it('parseNutritionPlan(null) her çağrıda yeni bir nesne döner; mutasyon paylaşılan sabiti bozmaz', () => {
    const plan = parseNutritionPlan(null)
    expect(plan).not.toBe(EMPTY_NUTRITION_PLAN)
    plan.Pazartesi.total = 999
    expect(EMPTY_NUTRITION_PLAN.Pazartesi.total).toBe(0)
  })

  it('NOT: EMPTY_WORKOUT_PLAN Object.freeze ile korunmuyor; doğrudan referansı mutasyona uğratmak paylaşılan sabiti bozar (gizli hata sınıfı)', () => {
    const original = EMPTY_WORKOUT_PLAN.Pazartesi
    EMPTY_WORKOUT_PLAN.Pazartesi = 'mutasyona-uğradı'
    expect(EMPTY_WORKOUT_PLAN.Pazartesi).toBe('mutasyona-uğradı')
    // Diğer testleri etkilememesi için geri al.
    EMPTY_WORKOUT_PLAN.Pazartesi = original
  })
})
