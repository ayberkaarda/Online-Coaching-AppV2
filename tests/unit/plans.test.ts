// `usePlans.ts` içindeki SAF plan dönüşüm mantığının birim testleri.
//
// Faz 1b Adım 2 cutover'ından sonra antrenman planı `workout_plan_exercises`
// satırlarından geri üretiliyor. Bu dönüşüm artık gerçek iş yapıyor (gruplama +
// sıralama + birleştirme), bu yüzden hook'u mock'lamak yerine mantık saf
// fonksiyonlara (`rowsToWorkoutPlan`, `planToRpcPayload`) çıkarıldı ve burada
// doğrudan test ediliyor.

import { describe, expect, it } from 'vitest'

import { planToRpcPayload, rowsToWorkoutPlan, type WorkoutPlanExerciseRow } from '@/hooks/usePlans'
import { DAY_NAMES, EMPTY_WORKOUT_PLAN, type WorkoutPlan } from '@/types'

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
