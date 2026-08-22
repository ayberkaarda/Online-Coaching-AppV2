// Faz 2c (§4.1) — set bazlı log girişi ve `completed_at` OTURUM damgası mantığı.
//
// Şema sözleşmesi: supabase/migrations/20260817190000_workout_log_sets.sql
// ("KARAR 1 — completed_at OTURUM MU, SET Mİ?") ve supabase/README.md §4h.
// Anlam OTURUM seviyesindedir, kolon set satırında yaşar (denormalize damga).

import { describe, expect, it } from 'vitest'

import { parseDayPlan } from '@/components/tabs/WorkoutTab'
import { toEmbedUrl } from '@/components/workout/GymMode'
import {
  buildWorkoutLogRows,
  groupLogsIntoSessions,
  isSessionComplete,
} from '@repo/api-client/hooks/useWorkoutLogs'
import {
  rowsToSessionExercises,
  totalPlannedSets,
  type PlanExerciseRow,
} from '@repo/api-client/hooks/useWorkoutSession'
import type { WorkoutLog } from '@repo/types'

const CLIENT = '11111111-1111-1111-1111-111111111111'
const PLAN_EX_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PLAN_EX_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeLog(overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: crypto.randomUUID(),
    client_id: CLIENT,
    exercise_name: 'Bench Press',
    weight_kg: 60,
    reps: 8,
    rpe: null,
    set_number: 1,
    plan_exercise_id: null,
    completed_at: null,
    created_at: '2026-08-17T10:00:00.000Z',
    // İmza Dilimi (20260821120000_bb_signature_slice.sql) — workout_logs yeni
    // kolonları; şema varsayılanlarıyla (rir/session/superset/mutation NULL,
    // set_type 'working').
    session_id: null,
    rir: null,
    set_type: 'working',
    superset_group: null,
    client_mutation_id: null,
    updated_at: '2026-08-17T10:00:00.000Z',
    ...overrides,
  }
}

function makePlanRow(overrides: Partial<PlanExerciseRow> = {}): PlanExerciseRow {
  return {
    id: PLAN_EX_A,
    day: 'Pazartesi',
    position: 0,
    raw_line: '1. Bench Press - 4x8',
    name: 'Bench Press',
    target_sets: 4,
    target_reps: 8,
    video_url: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('buildWorkoutLogRows — set girişi', () => {
  it('her set için bir satır üretir ve alanları şemaya birebir eşler', () => {
    const rows = buildWorkoutLogRows({
      clientId: CLIENT,
      sets: [
        {
          exercise_name: 'Bench Press',
          set_number: 1,
          plan_exercise_id: PLAN_EX_A,
          weight_kg: 60,
          reps: 8,
          rpe: null,
        },
        {
          exercise_name: 'Bench Press',
          set_number: 2,
          plan_exercise_id: PLAN_EX_A,
          weight_kg: 62.5,
          reps: 6,
          rpe: 8,
        },
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      client_id: CLIENT,
      exercise_name: 'Bench Press',
      set_number: 1,
      plan_exercise_id: PLAN_EX_A,
      weight_kg: 60,
      reps: 8,
      rpe: null,
      completed_at: null,
    })
    expect(rows[1]?.set_number).toBe(2)
    expect(rows[1]?.weight_kg).toBe(62.5)
    expect(rows[1]?.rpe).toBe(8)
  })

  it('set_number verilmezse OTURUM sırasını (1..N) kendisi üretir', () => {
    const rows = buildWorkoutLogRows({
      clientId: CLIENT,
      sets: [{ exercise_name: 'Squat' }, { exercise_name: 'Squat' }, { exercise_name: 'Row' }],
    })
    expect(rows.map((row) => row.set_number)).toEqual([1, 2, 3])
  })

  it('plan dışı (serbest) sette plan_exercise_id NULL kalır — uydurma FK yazılmaz', () => {
    const rows = buildWorkoutLogRows({
      clientId: CLIENT,
      sets: [{ exercise_name: 'Serbest Hareket' }],
    })
    expect(rows[0]?.plan_exercise_id).toBeNull()
    expect(rows[0]?.exercise_name).toBe('Serbest Hareket')
  })
})

describe('completed_at — OTURUM damgası (denormalize)', () => {
  it('antrenman bitirildiğinde TÜM set satırlarına AYNI damga yazılır', () => {
    const stamp = '2026-08-17T18:30:00.000Z'
    const rows = buildWorkoutLogRows({
      clientId: CLIENT,
      completedAt: stamp,
      sets: [
        { exercise_name: 'Bench Press', plan_exercise_id: PLAN_EX_A },
        { exercise_name: 'Bench Press', plan_exercise_id: PLAN_EX_A },
        { exercise_name: 'Row', plan_exercise_id: PLAN_EX_B },
      ],
    })

    // KRİTİK İNVARYANT: tek bir farklı damga bile oturumu ikiye böler.
    expect(new Set(rows.map((row) => row.completed_at)).size).toBe(1)
    for (const row of rows) expect(row.completed_at).toBe(stamp)
  })

  it('antrenman bitirilmediyse damga NULL olur ("set girildi, antrenman bitirilmedi")', () => {
    const rows = buildWorkoutLogRows({
      clientId: CLIENT,
      sets: [{ exercise_name: 'Bench Press' }, { exercise_name: 'Bench Press' }],
    })
    expect(rows.every((row) => row.completed_at === null)).toBe(true)
  })

  it('damga ancak TÜM planlı setler girildiğinde basılır (§4.1 tetikleyicisi)', () => {
    expect(isSessionComplete(7, 8)).toBe(false)
    expect(isSessionComplete(8, 8)).toBe(true)
    // Kullanıcı fazladan set girerse yine tamamlanmış sayılır.
    expect(isSessionComplete(9, 8)).toBe(true)
    // Planlı set yoksa "tamamlandı" diye bir eşik de yoktur.
    expect(isSessionComplete(3, 0)).toBe(false)
  })
})

describe('groupLogsIntoSessions — oturumlar damgadan geri üretilir', () => {
  it('aynı damgayı taşıyan setler TEK oturumdur, set_number sırasına dizilir', () => {
    const stamp = '2026-08-17T18:30:00.000Z'
    const sessions = groupLogsIntoSessions([
      makeLog({ set_number: 3, completed_at: stamp, exercise_name: 'Row' }),
      makeLog({ set_number: 1, completed_at: stamp }),
      makeLog({ set_number: 2, completed_at: stamp }),
    ])

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.completedAt).toBe(stamp)
    expect(sessions[0]?.sets.map((set) => set.set_number)).toEqual([1, 2, 3])
  })

  it('farklı damgalar farklı oturumlardır ve en yeni oturum başa gelir', () => {
    const older = '2026-08-15T18:00:00.000Z'
    const newer = '2026-08-17T18:00:00.000Z'
    const sessions = groupLogsIntoSessions([
      makeLog({ completed_at: older, created_at: older }),
      makeLog({ completed_at: newer, created_at: newer }),
    ])

    expect(sessions.map((session) => session.completedAt)).toEqual([newer, older])
  })

  it('damgasız satırlar "bitirilmemiş" oturumdur ve takvim gününe göre ayrılır', () => {
    const sessions = groupLogsIntoSessions([
      makeLog({ completed_at: null, created_at: '2026-08-17T10:00:00.000Z' }),
      makeLog({ completed_at: null, created_at: '2026-08-17T10:05:00.000Z', set_number: 2 }),
      makeLog({ completed_at: null, created_at: '2026-08-16T09:00:00.000Z' }),
    ])

    expect(sessions).toHaveLength(2)
    expect(sessions.every((session) => session.completedAt === null)).toBe(true)
    expect(sessions[0]?.sets).toHaveLength(2)
    expect(sessions[1]?.sets).toHaveLength(1)
  })

  it('bitirilmiş ve bitirilmemiş setler aynı oturumda BİRLEŞMEZ', () => {
    const stamp = '2026-08-17T18:30:00.000Z'
    const sessions = groupLogsIntoSessions([
      makeLog({ completed_at: stamp, created_at: '2026-08-17T18:29:00.000Z' }),
      makeLog({ completed_at: null, created_at: '2026-08-17T18:31:00.000Z' }),
    ])
    expect(sessions).toHaveLength(2)
  })

  it('boş girdide boş liste döner', () => {
    expect(groupLogsIntoSessions([])).toEqual([])
    expect(groupLogsIntoSessions(null)).toEqual([])
  })
})

describe('rowsToSessionExercises — günün antrenmanı plan satırlarından gelir', () => {
  it('yalnızca istenen günün ayrıştırılmış satırlarını, position sırasıyla döner', () => {
    const exercises = rowsToSessionExercises(
      [
        makePlanRow({ id: PLAN_EX_B, position: 1, name: 'Row', target_sets: 3, target_reps: 12 }),
        makePlanRow({ id: PLAN_EX_A, position: 0 }),
        makePlanRow({ id: 'other', day: 'Salı', position: 0, name: 'Squat' }),
      ],
      'Pazartesi'
    )

    expect(exercises.map((exercise) => exercise.name)).toEqual(['Bench Press', 'Row'])
    expect(exercises[0]?.planExerciseId).toBe(PLAN_EX_A)
    expect(exercises[0]?.sets).toBe(4)
    expect(exercises[1]?.reps).toBe(12)
  })

  it('ayrıştırılamamış satırlar (ör. "Dinlenme") egzersiz sayılmaz — set uydurulmaz', () => {
    const exercises = rowsToSessionExercises(
      [
        makePlanRow({ raw_line: 'Dinlenme', name: null, target_sets: null, target_reps: null }),
        makePlanRow({ id: PLAN_EX_B, position: 1 }),
      ],
      'Pazartesi'
    )
    expect(exercises).toHaveLength(1)
    expect(exercises[0]?.planExerciseId).toBe(PLAN_EX_B)
  })

  it('video_url plan satırından taşınır (video embed kaynağı)', () => {
    const exercises = rowsToSessionExercises(
      [makePlanRow({ video_url: 'https://youtu.be/abc123' })],
      'Pazartesi'
    )
    expect(exercises[0]?.videoUrl).toBe('https://youtu.be/abc123')
  })

  it('toplam planlı set sayısı oturum damgasının eşiğidir', () => {
    const exercises = rowsToSessionExercises(
      [
        makePlanRow({ target_sets: 4 }),
        makePlanRow({ id: PLAN_EX_B, position: 1, target_sets: 3 }),
      ],
      'Pazartesi'
    )
    expect(totalPlannedSets(exercises)).toBe(7)
    expect(totalPlannedSets([])).toBe(0)
  })
})

describe('parseDayPlan — plan HENÜZ KAYDEDİLMEMİŞKEN kullanılan yedek yol', () => {
  it('metin satırlarını egzersize çevirir ama plan bağı (FK) kuramaz', () => {
    const exercises = parseDayPlan('1. Bench Press - 4x8 | kontrollü\n2. Row - 3x12\nDinlenme')

    expect(exercises).toHaveLength(2)
    expect(exercises[0]).toEqual({
      planExerciseId: null,
      name: 'Bench Press',
      sets: 4,
      reps: 8,
      videoUrl: null,
    })
    expect(exercises[1]?.sets).toBe(3)
  })

  it('set/tekrar okunamazsa güvenli varsayılana düşer', () => {
    const exercises = parseDayPlan('1. Plank - süreli')
    expect(exercises[0]).toMatchObject({ name: 'Plank', sets: 3, reps: 12 })
  })
})

describe('toEmbedUrl — video embed allowlist', () => {
  it('bilinen sağlayıcıların kanonik embed adresini üretir', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    )
    expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    )
    expect(toEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789'
    )
  })

  it('allowlist dışı ve tehlikeli adresler iframe e GİRMEZ (null döner)', () => {
    expect(toEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(toEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(toEmbedUrl('https://evil.example.com/video')).toBeNull()
    expect(toEmbedUrl('bozuk-url')).toBeNull()
    expect(toEmbedUrl(null)).toBeNull()
    expect(toEmbedUrl('')).toBeNull()
  })
})
