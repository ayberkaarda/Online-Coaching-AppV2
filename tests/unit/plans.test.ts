// `usePlans.ts` içindeki SAF plan dönüşüm mantığının birim testleri.
//
// Faz 1b Adım 2 cutover'ından sonra antrenman planı `workout_plan_exercises`
// satırlarından, Adım 3b cutover'ından sonra beslenme planı da
// `nutrition_plan_meals` satırlarından geri üretiliyor. Bu dönüşümler gerçek iş
// yapıyor (gruplama + sıralama + birleştirme), bu yüzden hook'ları mock'lamak
// yerine mantık saf fonksiyonlara (`rowsToWorkoutPlan`, `planToRpcPayload`,
// `rowsToNutritionPlan`, `nutritionPlanToRpcPayload`) çıkarıldı ve burada
// doğrudan test ediliyor.

import { describe, expect, it } from 'vitest'

import {
  nutritionPlanToRpcPayload,
  planToRpcPayload,
  rowsToNutritionPlan,
  rowsToWorkoutPlan,
  type NutritionPlanMealRow,
  type WorkoutPlanExerciseRow,
} from '@/hooks/usePlans'
import {
  DAY_NAMES,
  EMPTY_NUTRITION_PLAN,
  EMPTY_WORKOUT_PLAN,
  type NutritionPlan,
  type WorkoutPlan,
} from '@/types'

const row = (day: string, position: number, raw_line: string): WorkoutPlanExerciseRow => ({
  day,
  position,
  raw_line,
})

/**
 * `public.explode_plan_day()` SQL fonksiyonunun İSTEMCİ TARAFI AYNASI —
 * yalnızca round-trip senaryosunda kullanılır, üretim kodunda İKİNCİ BİR
 * AYRIŞTIRICI YOKTUR (bkz. 20260817110000_workout_plan_tables.sql §4).
 * Kurallar: '\n' ile böl, yalnızca boşluktan ibaret satırları ATLA,
 * position 0'dan başlayıp eklenen satır başına artar.
 */
function explodePlanDay(day: string, text: string): WorkoutPlanExerciseRow[] {
  const rows: WorkoutPlanExerciseRow[] = []
  let position = 0
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    rows.push(row(day, position, line))
    position += 1
  }
  return rows
}

describe('rowsToWorkoutPlan', () => {
  it('satır yoksa 7 günü de boş olan bir plan döner', () => {
    expect(rowsToWorkoutPlan([])).toEqual(EMPTY_WORKOUT_PLAN)
    expect(rowsToWorkoutPlan(null)).toEqual(EMPTY_WORKOUT_PLAN)
    expect(rowsToWorkoutPlan(undefined)).toEqual(EMPTY_WORKOUT_PLAN)
  })

  it('dönen planda her zaman 7 günün tamamı bulunur', () => {
    const plan = rowsToWorkoutPlan([row('Cuma', 0, '1. Squat - 5x5')])
    expect(Object.keys(plan).sort()).toEqual([...DAY_NAMES].sort())
  })

  it('tek günün çok satırını position sırasıyla "\\n" ile birleştirir', () => {
    const plan = rowsToWorkoutPlan([
      row('Pazartesi', 0, '1. Bench Press - 4x8'),
      row('Pazartesi', 1, '2. Cable Fly - 3x12'),
      row('Pazartesi', 2, '3. Triceps Pushdown - 3x12'),
    ])
    expect(plan.Pazartesi).toBe(
      '1. Bench Press - 4x8\n2. Cable Fly - 3x12\n3. Triceps Pushdown - 3x12'
    )
  })

  it('satırlar karışık sırada gelse bile position değerine göre sıralar', () => {
    const plan = rowsToWorkoutPlan([
      row('Salı', 2, 'üçüncü'),
      row('Salı', 0, 'birinci'),
      row('Salı', 1, 'ikinci'),
    ])
    expect(plan['Salı']).toBe('birinci\nikinci\nüçüncü')
  })

  it('farklı günlerin satırları birbirine karışmaz', () => {
    const plan = rowsToWorkoutPlan([
      row('Pazar', 0, 'Dinlenme'),
      row('Perşembe', 1, '2. Lat Pulldown - 4x10'),
      row('Perşembe', 0, '1. Deadlift - 4x5'),
    ])
    expect(plan['Perşembe']).toBe('1. Deadlift - 4x5\n2. Lat Pulldown - 4x10')
    expect(plan.Pazar).toBe('Dinlenme')
    expect(plan.Cuma).toBe('')
  })

  it('bilinmeyen gün adını yok sayar (plan yine 7 günlük kalır)', () => {
    const plan = rowsToWorkoutPlan([
      row('Monday', 0, 'yok sayılmalı'),
      row('', 0, 'yok sayılmalı'),
      row('Cuma', 0, '1. Front Squat - 4x8'),
    ])
    expect(plan.Cuma).toBe('1. Front Squat - 4x8')
    expect(Object.values(plan).join('')).toBe('1. Front Squat - 4x8')
  })

  it('position boşluklu (0, 5, 9) gelse de sıra korunur', () => {
    const plan = rowsToWorkoutPlan([
      row('Cumartesi', 9, 'c'),
      row('Cumartesi', 0, 'a'),
      row('Cumartesi', 5, 'b'),
    ])
    expect(plan.Cumartesi).toBe('a\nb\nc')
  })

  it('paylaşılan EMPTY_WORKOUT_PLAN sabitini MUTASYONA UĞRATMAZ', () => {
    const plan = rowsToWorkoutPlan([row('Pazartesi', 0, 'x')])
    expect(plan).not.toBe(EMPTY_WORKOUT_PLAN)
    expect(EMPTY_WORKOUT_PLAN.Pazartesi).toBe('')
  })
})

describe('planToRpcPayload', () => {
  it('yalnızca 7 geçerli gün anahtarını gönderir', () => {
    const payload = planToRpcPayload({ ...EMPTY_WORKOUT_PLAN, Cuma: 'a' }) as Record<string, string>
    expect(Object.keys(payload).sort()).toEqual([...DAY_NAMES].sort())
  })

  it('bilinmeyen anahtarları eler, eksik günleri boş string ile doldurur', () => {
    const dirty = { Pazartesi: 'a', Monday: 'b' } as unknown as WorkoutPlan
    const payload = planToRpcPayload(dirty) as Record<string, string>
    expect(payload.Monday).toBeUndefined()
    expect(payload.Pazartesi).toBe('a')
    expect(payload.Pazar).toBe('')
  })
})

describe('round-trip: plan -> RPC girdisi -> satırlar -> plan', () => {
  it('boş olmayan satırlardan oluşan plan birebir geri üretilir', () => {
    const original: WorkoutPlan = {
      ...EMPTY_WORKOUT_PLAN,
      Pazartesi: '1. Bench Press - 4x8\n2. Incline Dumbbell Press - 3x10',
      Çarşamba: 'Dinlenme',
      Cuma: '1. Overhead Press - 4x8\n2. Lateral Raise - 3x15\n3. Shrug - 3x12',
    }

    const payload = planToRpcPayload(original) as Record<string, string>
    const rows = DAY_NAMES.flatMap((day) => explodePlanDay(day, payload[day] ?? ''))

    expect(rowsToWorkoutPlan(rows)).toEqual(original)
  })

  it('yalnızca boşluktan ibaret satırlar atlanır (SQL ayrıştırıcısının tek bilinçli kaybı)', () => {
    const original: WorkoutPlan = {
      ...EMPTY_WORKOUT_PLAN,
      // Ortadaki boş satır SQL tarafında da atlanır; round-trip bu yüzden
      // "birebir metin" değil, "boş satırsız metin" üretir.
      Salı: '1. Squat - 5x5\n\n2. Leg Press - 3x12',
    }

    const payload = planToRpcPayload(original) as Record<string, string>
    const rows = DAY_NAMES.flatMap((day) => explodePlanDay(day, payload[day] ?? ''))

    expect(rowsToWorkoutPlan(rows)['Salı']).toBe('1. Squat - 5x5\n2. Leg Press - 3x12')
  })
})

// ---------------------------------------------------------------------------
// BESLENME (Faz 1b Adım 3b)
// ---------------------------------------------------------------------------

const meal = (
  day: string,
  position: number,
  description: string,
  kcal: number | null
): NutritionPlanMealRow => ({ day, position, description, kcal })

/**
 * `public.explode_nutrition_day()` SQL fonksiyonunun İSTEMCİ TARAFI AYNASI —
 * yalnızca round-trip senaryosunda kullanılır, üretim kodunda İKİNCİ BİR YAZICI
 * YOKTUR (bkz. 20260817130000_nutrition_plan_tables.sql §4).
 * Kurallar: gün başına TEK satır (position = 0), `items` HAM hâliyle
 * `description`'a yazılır (btrim/satır bölme YOK), `total` yalnızca negatif
 * olmayan TAM SAYI ise `kcal` olur; aksi hâlde `kcal = NULL`.
 */
function explodeNutritionDay(
  day: string,
  entry: { items: string; total: number }
): NutritionPlanMealRow {
  const valid = Number.isInteger(entry.total) && entry.total >= 0
  return meal(day, 0, entry.items, valid ? entry.total : null)
}

describe('rowsToNutritionPlan', () => {
  it('satır yoksa 7 günü de boş olan bir plan döner', () => {
    expect(rowsToNutritionPlan([])).toEqual(EMPTY_NUTRITION_PLAN)
    expect(rowsToNutritionPlan(null)).toEqual(EMPTY_NUTRITION_PLAN)
    expect(rowsToNutritionPlan(undefined)).toEqual(EMPTY_NUTRITION_PLAN)
  })

  it('7 günün tamamı doluysa hepsini birebir geri üretir', () => {
    const rows = DAY_NAMES.map((day, index) => meal(day, 0, `${day} menüsü`, 1800 + index))
    const plan = rowsToNutritionPlan(rows)

    expect(Object.keys(plan).sort()).toEqual([...DAY_NAMES].sort())
    for (const [index, day] of DAY_NAMES.entries()) {
      expect(plan[day]).toEqual({ items: `${day} menüsü`, total: 1800 + index })
    }
  })

  it('eksik günler { items: "", total: 0 } olarak tamamlanır', () => {
    const plan = rowsToNutritionPlan([meal('Cuma', 0, 'Somon 180g', 1950)])

    expect(Object.keys(plan).sort()).toEqual([...DAY_NAMES].sort())
    expect(plan.Cuma).toEqual({ items: 'Somon 180g', total: 1950 })
    expect(plan.Pazartesi).toEqual({ items: '', total: 0 })
    expect(plan.Pazar).toEqual({ items: '', total: 0 })
  })

  it('bilinmeyen gün adını yok sayar (plan yine 7 günlük kalır)', () => {
    const plan = rowsToNutritionPlan([
      meal('Monday', 0, 'yok sayılmalı', 999),
      meal('', 0, 'yok sayılmalı', 999),
      meal('Salı', 0, 'Ton Balığı 150g', 1780),
    ])

    expect(Object.keys(plan).sort()).toEqual([...DAY_NAMES].sort())
    expect(plan['Salı']).toEqual({ items: 'Ton Balığı 150g', total: 1780 })
    expect(DAY_NAMES.map((d) => plan[d].items).join('')).toBe('Ton Balığı 150g')
    expect(DAY_NAMES.reduce((sum, d) => sum + plan[d].total, 0)).toBe(1780)
  })

  it('kcal NULL ise total 0 olur ama ham metin KAYBOLMAZ', () => {
    // SQL tarafı `total` sayı değil/negatif/kesirli ise kcal'i NULL'a düşürür ama
    // satırı yine ekler (bkz. explode_nutrition_day). Eski `parseNutritionPlan`
    // da sayıya çevrilemeyen `total` için 0 döndürüyordu — davranış korunur.
    const plan = rowsToNutritionPlan([meal('Perşembe', 0, 'Peynirli Omlet', null)])
    expect(plan['Perşembe']).toEqual({ items: 'Peynirli Omlet', total: 0 })
  })

  it('aynı güne birden çok satır düşerse position sırasıyla birleştirir ve kcal toplar', () => {
    // Faz 1b'de oluşmaz (gün başına tek satır), ama şema öğün granülerliğine
    // şimdiden izin veriyor: dönüşüm hiçbir satırı sessizce DÜŞÜRMEMELİ.
    const plan = rowsToNutritionPlan([
      meal('Pazartesi', 2, 'Akşam: Somon 180g', 700),
      meal('Pazartesi', 0, 'Kahvaltı: Yulaf 80g', 400),
      meal('Pazartesi', 1, 'Öğle: Tavuk 200g', null),
    ])
    expect(plan.Pazartesi).toEqual({
      items: 'Kahvaltı: Yulaf 80g\nÖğle: Tavuk 200g\nAkşam: Somon 180g',
      total: 1100,
    })
  })

  it('paylaşılan EMPTY_NUTRITION_PLAN sabitini MUTASYONA UĞRATMAZ', () => {
    const plan = rowsToNutritionPlan([meal('Pazartesi', 0, 'x', 1)])
    expect(plan).not.toBe(EMPTY_NUTRITION_PLAN)
    // Sığ kopya tuzağı: gün nesneleri de taze olmalı, sabitle paylaşılmamalı.
    expect(plan.Pazar).not.toBe(EMPTY_NUTRITION_PLAN.Pazar)
    expect(EMPTY_NUTRITION_PLAN.Pazartesi).toEqual({ items: '', total: 0 })
  })
})

describe('nutritionPlanToRpcPayload', () => {
  it('yalnızca 7 geçerli gün anahtarını gönderir', () => {
    const payload = nutritionPlanToRpcPayload({
      ...EMPTY_NUTRITION_PLAN,
      Cuma: { items: 'a', total: 1 },
    }) as Record<string, { items: string; total: number }>
    expect(Object.keys(payload).sort()).toEqual([...DAY_NAMES].sort())
  })

  it('bilinmeyen anahtarları eler, eksik günleri { items: "", total: 0 } ile doldurur', () => {
    const dirty = {
      Pazartesi: { items: 'a', total: 12 },
      Monday: { items: 'b', total: 34 },
    } as unknown as NutritionPlan
    const payload = nutritionPlanToRpcPayload(dirty) as Record<
      string,
      { items: string; total: number }
    >
    expect(payload.Monday).toBeUndefined()
    expect(payload.Pazartesi).toEqual({ items: 'a', total: 12 })
    expect(payload.Pazar).toEqual({ items: '', total: 0 })
  })
})

describe('round-trip: beslenme planı -> RPC girdisi -> satırlar -> plan', () => {
  it('geçerli tam sayı kalorili plan birebir geri üretilir', () => {
    const original: NutritionPlan = {
      ...EMPTY_NUTRITION_PLAN,
      // Lehçe A (virgül + "ad:gram") ve Lehçe B (satır sonu) birlikte test edilir:
      // `description` HAM saklandığı için ikisi de kayıpsız dönmelidir.
      Pazartesi: { items: 'Yulaf:80, Tavuk Göğsü:200', total: 1850 },
      Çarşamba: { items: 'Yulaf Ezmesi 80g\nKıyma 150g\nBulgur 150g', total: 1900 },
      Cumartesi: { items: 'Serbest Öğün (kontrollü)', total: 0 },
    }

    const payload = nutritionPlanToRpcPayload(original) as Record<
      string,
      { items: string; total: number }
    >
    const rows = DAY_NAMES.map((day) =>
      explodeNutritionDay(day, payload[day] ?? { items: '', total: 0 })
    )

    expect(rowsToNutritionPlan(rows)).toEqual(original)
  })

  it('kesirli/negatif total round-trip sonrası 0 olur (SQL tarafının tek bilinçli kaybı)', () => {
    // explode_nutrition_day: 1850.5 gibi bir değeri integer'a YUVARLAMAZ, kcal'i
    // NULL'a düşürür (sessiz veri kaybı yerine gürültüsüz ama görünür kayıp).
    // `items` her iki durumda da kayıpsızdır.
    const original: NutritionPlan = {
      ...EMPTY_NUTRITION_PLAN,
      Salı: { items: 'Omlet (3 yumurta)', total: 1780.5 },
      Perşembe: { items: 'Tavuk Göğsü 200g', total: -5 },
    }

    const payload = nutritionPlanToRpcPayload(original) as Record<
      string,
      { items: string; total: number }
    >
    const roundTripped = rowsToNutritionPlan(
      DAY_NAMES.map((day) => explodeNutritionDay(day, payload[day] ?? { items: '', total: 0 }))
    )

    expect(roundTripped['Salı']).toEqual({ items: 'Omlet (3 yumurta)', total: 0 })
    expect(roundTripped['Perşembe']).toEqual({ items: 'Tavuk Göğsü 200g', total: 0 })
  })
})
