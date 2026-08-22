// "İmza Dilimi" Tur 2 C1 — offline oturum/set yazma katmanı (`@repo/api-client/api/workout-session`)
// + mezosiklü sıralama (`@repo/api-client/hooks/useWorkoutSessions`).
//
// KAPSAM:
//   A) `sortMesocyclesByPosition` — saf sıralama fonksiyonu.
//   B) `insertWorkoutSetIdempotent` — İDEMPOTENCY: neden `upsert` DEĞİL düz
//      `insert` + 23505 no-op kullanıldığı (bkz. workout-session.ts dosya başı
//      notu: `workout_logs_client_mutation_uniq` KISMİ bir indekstir, PostgREST
//      `.upsert(..., { onConflict })` bunu arbiter olarak ÇÖZEMEZ).
//   C) `insertWorkoutSession` — `onConflict: 'id'` (PK, kısmi DEĞİL) ile upsert;
//      PK çakışmasında (`ignoreDuplicates` -> RETURNING sıfır satır) geri
//      dönüşün MEVCUT satırı ayrı bir `select` ile getirdiğini doğrular.

import { describe, expect, it, vi } from 'vitest'

import {
  completeWorkoutSession,
  insertWorkoutSession,
  insertWorkoutSetIdempotent,
  type WorkoutLogInsert,
  type WorkoutSession,
  type WorkoutSessionInsert,
} from '@repo/api-client/api/workout-session'
import {
  sortMesocyclesByPosition,
  type MesocycleRow,
} from '@repo/api-client/hooks/useWorkoutSessions'
import { SupabaseQueryError } from '@repo/api-client/query/supabase-error'

import { asSupabaseClient } from './test-utils'

const CLIENT = '11111111-1111-1111-1111-111111111111'
const PLAN = '22222222-2222-2222-2222-222222222222'
const SESSION_ID = '33333333-3333-3333-3333-333333333333'

function makeMesocycle(overrides: Partial<MesocycleRow> = {}): MesocycleRow {
  return {
    id: crypto.randomUUID(),
    plan_id: PLAN,
    name: 'Hipertrofi Bloğu',
    weeks: 4,
    deload_week: null,
    goal: 'bulk',
    position: 0,
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T00:00:00.000Z',
    ...overrides,
  }
}

function makeWorkoutSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: SESSION_ID,
    client_id: CLIENT,
    started_at: '2026-08-22T10:00:00.000Z',
    ended_at: null,
    source: 'freestyle',
    perceived_difficulty: null,
    notes: null,
    client_mutation_id: null,
    created_at: '2026-08-22T10:00:00.000Z',
    updated_at: '2026-08-22T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// A) sortMesocyclesByPosition — saf fonksiyon
// ---------------------------------------------------------------------------

describe('sortMesocyclesByPosition', () => {
  it('position sırasına göre dizer, kaynağı MUTASYONA UĞRATMAZ', () => {
    const third = makeMesocycle({ id: 'c', position: 2 })
    const first = makeMesocycle({ id: 'a', position: 0 })
    const second = makeMesocycle({ id: 'b', position: 1 })
    const source = [third, first, second]

    const sorted = sortMesocyclesByPosition(source)

    expect(sorted.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(source.map((row) => row.id)).toEqual(['c', 'a', 'b'])
  })

  it('null/undefined/boş girdide boş dizi döner', () => {
    expect(sortMesocyclesByPosition(null)).toEqual([])
    expect(sortMesocyclesByPosition(undefined)).toEqual([])
    expect(sortMesocyclesByPosition([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// B) insertWorkoutSetIdempotent — düz insert + 23505 no-op
// ---------------------------------------------------------------------------

describe('insertWorkoutSetIdempotent', () => {
  const ROW: WorkoutLogInsert = {
    client_id: CLIENT,
    exercise_name: 'Bench Press',
    weight_kg: 60,
    reps: 8,
    set_number: 1,
    set_type: 'working',
    client_mutation_id: 'mut-1',
  }

  it('`upsert` DEĞİL düz `insert` çağırır (kısmi indeks arbiter OLAMAZ — bkz. dosya başı notu)', async () => {
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const upsertMock = vi.fn()
    const supabase = asSupabaseClient({
      from: () => ({ insert: insertMock, upsert: upsertMock }),
    })

    await insertWorkoutSetIdempotent(supabase, ROW)

    expect(insertMock).toHaveBeenCalledWith(ROW)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('23505 (unique_violation — aynı client_mutation_id ikinci gönderim) NO-OP sayılır, FIRLATMAZ', async () => {
    const supabase = asSupabaseClient({
      from: () => ({
        insert: () =>
          Promise.resolve({
            data: null,
            error: { message: 'duplicate key value violates unique constraint', code: '23505' },
          }),
      }),
    })

    await expect(insertWorkoutSetIdempotent(supabase, ROW)).resolves.toBeUndefined()
  })

  it('23505 DIŞINDAKİ hatalar `SupabaseQueryError` olarak FIRLATILIR (ör. RLS reddi 42501)', async () => {
    const supabase = asSupabaseClient({
      from: () => ({
        insert: () =>
          Promise.resolve({
            data: null,
            error: { message: 'permission denied', code: '42501' },
          }),
      }),
    })

    await expect(insertWorkoutSetIdempotent(supabase, ROW)).rejects.toBeInstanceOf(
      SupabaseQueryError
    )
  })
})

// ---------------------------------------------------------------------------
// C) insertWorkoutSession — PK upsert + çakışmada geri-getirme
// ---------------------------------------------------------------------------

describe('insertWorkoutSession', () => {
  const ROW: WorkoutSessionInsert = { id: SESSION_ID, client_id: CLIENT, source: 'freestyle' }

  it("`onConflict: 'id'` + `ignoreDuplicates: true` ile upsert eder (id PRIMARY KEY — kısmi DEĞİL)", async () => {
    const created = makeWorkoutSession()
    const upsertMock = vi.fn()
    const supabase = asSupabaseClient({
      from: () => ({
        upsert: (row: unknown, options: unknown) => {
          upsertMock(row, options)
          return {
            select: () => ({ maybeSingle: () => Promise.resolve({ data: created, error: null }) }),
          }
        },
      }),
    })

    const result = await insertWorkoutSession(supabase, ROW)

    expect(upsertMock).toHaveBeenCalledWith(ROW, { onConflict: 'id', ignoreDuplicates: true })
    expect(result).toEqual(created)
  })

  it('PK çakışmasında (RETURNING sıfır satır -> maybeSingle null) MEVCUT satırı ayrı select ile getirir', async () => {
    const existing = makeWorkoutSession({ started_at: '2026-08-22T09:00:00.000Z' })
    const selectEqSingleMock = vi.fn().mockResolvedValue({ data: existing, error: null })
    const supabase = asSupabaseClient({
      from: () => ({
        upsert: () => ({
          select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
        select: () => ({
          eq: (column: string, value: string) => ({
            single: () => selectEqSingleMock(column, value),
          }),
        }),
      }),
    })

    const result = await insertWorkoutSession(supabase, ROW)

    expect(selectEqSingleMock).toHaveBeenCalledWith('id', SESSION_ID)
    expect(result).toEqual(existing)
  })
})

// ---------------------------------------------------------------------------
// D) completeWorkoutSession — yalnızca verilen alanlar update edilir
// ---------------------------------------------------------------------------

describe('completeWorkoutSession', () => {
  it('opsiyonel alanlar verilmezse update gövdesine EKLENMEZ (eski değer sessizce ezilmez)', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    const supabase = asSupabaseClient({ from: () => ({ update: updateMock }) })

    await completeWorkoutSession(supabase, { id: SESSION_ID, ended_at: '2026-08-22T11:00:00.000Z' })

    expect(updateMock).toHaveBeenCalledWith({ ended_at: '2026-08-22T11:00:00.000Z' })
    expect(eqMock).toHaveBeenCalledWith('id', SESSION_ID)
  })

  it('verilen opsiyonel alanlar (perceived_difficulty/notes) update gövdesine EKLENİR', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    const supabase = asSupabaseClient({ from: () => ({ update: updateMock }) })

    await completeWorkoutSession(supabase, {
      id: SESSION_ID,
      ended_at: '2026-08-22T11:00:00.000Z',
      perceived_difficulty: 7,
      notes: 'Zor bir gündü.',
    })

    expect(updateMock).toHaveBeenCalledWith({
      ended_at: '2026-08-22T11:00:00.000Z',
      perceived_difficulty: 7,
      notes: 'Zor bir gündü.',
    })
  })
})
