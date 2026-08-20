// B-056: `WorkoutTab`'in "Akıllı Antrenör (AI)" paneli yaş/hedef/kilo'yu SABİT
// (age: 20, goal: 'bulk', weight: 75) gönderiyordu — her danışan başkası için
// hesaplanmış program alıyordu. Çözüm `NutritionTab.tsx`'teki "AI diyetisyen"
// deseninin (useForm + zodResolver(aiWorkoutSchema)) BİREBİR kopyasıdır.
//
// Bu dosya bileşeni `@repo/api-client` barrel'ini TAMAMEN mock'layarak render
// eder (bkz. messages-tab.test.tsx / nutrition-logs.test.ts Bölüm C ile AYNI
// desen) — gerçek Supabase çağrısı YAPILMAZ, yalnızca AI formunun doğrulama +
// gönderim mantığı test edilir.
//
// KAPSAM:
//   1) Form doldurulmadan gönderim ENGELLENİR — `generateWorkout.mutateAsync`
//      hiç çağrılmaz, alan bazlı hata mesajları görünür.
//   2) Form doldurulup gönderilince `generateWorkout.mutateAsync` FORMDAKİ
//      değerlerle (sayıya çevrilmiş) çağrılır — sabit 20/bulk/75 ARTIK GİTMİYOR.
//   3) Danışanın son `progress_entries` kaydı varsa kilo alanı ONUNLA
//      doldurulur (sahte varsayılan değil, gerçek veri).
//   4) KÜNYE DİLİMİ: danışanın `profiles.birth_date` alanı doluysa yaş alanı
//      ONDAN HESAPLANIP ön doldurulur; künye boşsa alan BOŞ kalır (fallback).
//      `goal` ön doldurulmaz — plan-anlık tercihtir, profil verisi değildir.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return {
    ...actual,
    useApproveProgram: vi.fn(),
    useCreateWorkoutLogs: vi.fn(),
    useExercises: vi.fn(),
    useGenerateWorkout: vi.fn(),
    usePendingApprovals: vi.fn(),
    useProfile: vi.fn(),
    useProgressEntries: vi.fn(),
    useSaveWorkoutPlan: vi.fn(),
    useSubmitProgramForApproval: vi.fn(),
    useWorkoutLogs: vi.fn(),
    useWorkoutPlan: vi.fn(),
  }
})

vi.mock('@repo/api-client/hooks/useWorkoutSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client/hooks/useWorkoutSession')>()
  return {
    ...actual,
    useWorkoutPlanExercises: vi.fn(),
  }
})

import WorkoutTab from '@/components/tabs/WorkoutTab'
import {
  useApproveProgram,
  useCreateWorkoutLogs,
  useExercises,
  useGenerateWorkout,
  usePendingApprovals,
  useProfile,
  useProgressEntries,
  useSaveWorkoutPlan,
  useSubmitProgramForApproval,
  useWorkoutLogs,
  useWorkoutPlan,
} from '@repo/api-client'
import { useWorkoutPlanExercises } from '@repo/api-client/hooks/useWorkoutSession'
import type { WorkoutGenerateResult } from '@repo/api-client/api/types'

const CLIENT_ID = 'client-2222222-2222-4222-8222-222222222222'

function mockQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetched: true,
    refetch: vi.fn(),
    ...overrides,
  }
}

function mockMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    ...overrides,
  }
}

/** WorkoutTab'in bağımlı olduğu hook'ları makul varsayılanlarla mock'lar. */
function mockWorkoutHooks(
  overrides: {
    plan?: Record<string, unknown>
    planExercises?: Record<string, unknown>
    approvals?: Record<string, unknown>
    logs?: Record<string, unknown>
    exercises?: Record<string, unknown>
    profile?: Record<string, unknown>
    progressEntries?: Record<string, unknown>
    generateWorkout?: Record<string, unknown>
  } = {}
) {
  vi.mocked(useWorkoutPlan).mockReturnValue(
    mockQuery({ data: undefined, ...overrides.plan }) as unknown as ReturnType<
      typeof useWorkoutPlan
    >
  )
  vi.mocked(useWorkoutPlanExercises).mockReturnValue(
    mockQuery({ data: [], ...overrides.planExercises }) as unknown as ReturnType<
      typeof useWorkoutPlanExercises
    >
  )
  vi.mocked(usePendingApprovals).mockReturnValue(
    mockQuery({ data: [], ...overrides.approvals }) as unknown as ReturnType<
      typeof usePendingApprovals
    >
  )
  vi.mocked(useWorkoutLogs).mockReturnValue(
    mockQuery({ data: [], ...overrides.logs }) as unknown as ReturnType<typeof useWorkoutLogs>
  )
  vi.mocked(useExercises).mockReturnValue(
    mockQuery({ data: [], ...overrides.exercises }) as unknown as ReturnType<typeof useExercises>
  )
  vi.mocked(useProfile).mockReturnValue(
    mockQuery({ data: undefined, ...overrides.profile }) as unknown as ReturnType<typeof useProfile>
  )
  vi.mocked(useProgressEntries).mockReturnValue(
    mockQuery({ data: [], ...overrides.progressEntries }) as unknown as ReturnType<
      typeof useProgressEntries
    >
  )
  vi.mocked(useSaveWorkoutPlan).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useSaveWorkoutPlan>
  )
  vi.mocked(useSubmitProgramForApproval).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useSubmitProgramForApproval>
  )
  vi.mocked(useApproveProgram).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useApproveProgram>
  )
  vi.mocked(useCreateWorkoutLogs).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useCreateWorkoutLogs>
  )
  const generateWorkoutResult: WorkoutGenerateResult = {
    status: 'success',
    message: 'ok',
    ai_analysis: '',
    workout_plan: {},
  }
  const generateWorkout = mockMutation({
    mutateAsync: vi.fn().mockResolvedValue(generateWorkoutResult),
    ...overrides.generateWorkout,
  })
  vi.mocked(useGenerateWorkout).mockReturnValue(
    generateWorkout as unknown as ReturnType<typeof useGenerateWorkout>
  )
  return { generateWorkout }
}

function tabElement() {
  return (
    <WorkoutTab
      targetId={CLIENT_ID}
      currentUserId={CLIENT_ID}
      userRole="client"
      selectedClientIds={[]}
      onDownloadImage={vi.fn()}
    />
  )
}

function renderTab() {
  return render(tabElement())
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorkoutTab — Akıllı Antrenör (AI) doğrulama', () => {
  it('form doldurulmadan gönderim engellenir, generateWorkout.mutateAsync ÇAĞRILMAZ', async () => {
    const { generateWorkout } = mockWorkoutHooks()
    const user = userEvent.setup()

    renderTab()

    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(generateWorkout.mutateAsync).not.toHaveBeenCalled()
    // Şablon ve hedef seçilmediği için zod enum hatası, yaş/kilo için min hatası görünür.
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
  })
})

describe('WorkoutTab — Akıllı Antrenör (AI) gönderim', () => {
  it('formdaki DEĞERLER taşınır — sabit 20/bulk/75 ARTIK GİTMİYOR', async () => {
    const { generateWorkout } = mockWorkoutHooks()
    const user = userEvent.setup()

    renderTab()

    await user.selectOptions(screen.getByLabelText('Antrenman şablonu'), 'ppl')
    await user.type(screen.getByLabelText('Yaş'), '28')
    await user.type(screen.getByLabelText('Kilo (kg)'), '82')
    await user.selectOptions(screen.getByLabelText('Hedef'), 'cut')
    await user.type(
      screen.getByLabelText('ÜRETİCİYE TALİMAT VER (PROMPT)'),
      'Sadece dumbell kullanacağım'
    )

    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(generateWorkout.mutateAsync).toHaveBeenCalledTimes(1)
    expect(generateWorkout.mutateAsync).toHaveBeenCalledWith({
      split_type: 'ppl',
      user_prompt: 'Sadece dumbell kullanacağım',
      age: 28,
      goal: 'cut',
      weight: 82,
    })
  })

  it('danışanın son progress_entries kaydı varsa kilo alanı ONUNLA doldurulur', async () => {
    // `progress_entries` sorgusu GERÇEK kullanımda ÖNCE `isFetched: false` ile
    // başlar, veri gelince `true`'ya döner — bileşendeki render-sırası senkronu
    // (workoutData'daki `planKey` deseniyle AYNI) bu geçişe bağlıdır. Statik
    // `isFetched: true` mock'u ilk render'da state'i ZATEN eşit başlatır ve
    // senkron hiç TETİKLENMEZ; bu yüzden burada gerçek asenkron geçiş simüle edilir.
    mockWorkoutHooks({ progressEntries: { isFetched: false, data: undefined } })

    const { rerender } = renderTab()
    expect(screen.getByLabelText('Kilo (kg)')).toHaveValue(null)

    vi.mocked(useProgressEntries).mockReturnValue(
      mockQuery({
        isFetched: true,
        data: [
          { entry_date: '2026-08-01', weight_kg: 79 },
          { entry_date: '2026-08-10', weight_kg: 77.5 },
        ],
      }) as unknown as ReturnType<typeof useProgressEntries>
    )
    rerender(tabElement())

    expect(await screen.findByLabelText('Kilo (kg)')).toHaveValue(77.5)
  })
})

// ---------------------------------------------------------------------------
// KÜNYE ÖN DOLDURMA — sahte zamansız, yine de deterministik
//
// Yaş her yıl artar; sabit bir doğum tarihi + sabit beklenen yaş yazan bir test
// yılbaşında KENDİLİĞİNDEN kırılırdı (yaşın neden SAKLANMADIĞININ testteki
// yansıması). `vi.setSystemTime` ise sahte zamanlayıcı gerektirir ve
// `userEvent` ile birlikte kırılgandır. Bunun yerine doğum tarihi ÇALIŞMA
// ANINDA "tam 30 yıl önce, 1 Ocak" olarak kurulur: 1 Ocak her zaman geçmiş
// (veya bugün) olduğu için beklenen yaş HER GÜN tam olarak 30'dur.
// ---------------------------------------------------------------------------
const EXPECTED_AGE = 30
const BIRTH_DATE = `${new Date().getFullYear() - EXPECTED_AGE}-01-01`

describe('WorkoutTab — Akıllı Antrenör (AI) künye ön doldurma', () => {
  it('künyedeki doğum tarihinden HESAPLANAN yaş alana doldurulur', async () => {
    // Kilo prefill testiyle AYNI gerekçe: sorgu GERÇEK kullanımda önce
    // `isFetched: false` ile başlar, veri gelince `true`'ya döner. Statik bir
    // `isFetched: true` mock'u render-sırası senkronunu hiç TETİKLEMEZ.
    mockWorkoutHooks({ profile: { isFetched: false, data: undefined } })

    const { rerender } = renderTab()
    expect(screen.getByLabelText('Yaş')).toHaveValue(null)

    vi.mocked(useProfile).mockReturnValue(
      mockQuery({
        isFetched: true,
        data: { id: CLIENT_ID, birth_date: BIRTH_DATE, height_cm: 178.5 },
      }) as unknown as ReturnType<typeof useProfile>
    )
    rerender(tabElement())

    expect(await screen.findByLabelText('Yaş')).toHaveValue(EXPECTED_AGE)
  })

  it('künye BOŞSA yaş alanı boş kalır — form eskisi gibi çalışır (fallback)', async () => {
    mockWorkoutHooks({ profile: { isFetched: false, data: undefined } })

    const { rerender } = renderTab()

    vi.mocked(useProfile).mockReturnValue(
      mockQuery({
        isFetched: true,
        data: { id: CLIENT_ID, birth_date: null, height_cm: null },
      }) as unknown as ReturnType<typeof useProfile>
    )
    rerender(tabElement())

    expect(await screen.findByLabelText('Yaş')).toHaveValue(null)
  })

  it('ön doldurulan yaş EZİLMEZ — kullanıcı değiştirebilir ve gönderilen değer onunkidir', async () => {
    const { generateWorkout } = mockWorkoutHooks({
      profile: { isFetched: false, data: undefined },
    })
    const user = userEvent.setup()

    const { rerender } = renderTab()

    vi.mocked(useProfile).mockReturnValue(
      mockQuery({
        isFetched: true,
        data: { id: CLIENT_ID, birth_date: BIRTH_DATE, height_cm: 178.5 },
      }) as unknown as ReturnType<typeof useProfile>
    )
    rerender(tabElement())

    const ageField = await screen.findByLabelText('Yaş')
    expect(ageField).toHaveValue(EXPECTED_AGE)

    await user.clear(ageField)
    await user.type(ageField, '40')

    await user.selectOptions(screen.getByLabelText('Antrenman şablonu'), 'ppl')
    await user.type(screen.getByLabelText('Kilo (kg)'), '82')
    await user.selectOptions(screen.getByLabelText('Hedef'), 'cut')
    await user.click(screen.getByRole('button', { name: 'Oluştur' }))

    expect(generateWorkout.mutateAsync).toHaveBeenCalledWith({
      split_type: 'ppl',
      user_prompt: '',
      age: 40,
      goal: 'cut',
      weight: 82,
    })
  })
})
