// KÜNYE DİLİMİ — `profiles.birth_date` + `profiles.height_cm`.
//
// Bu dosya İKİ katmanı sınar:
//
//   A) SAF KATMAN — `@/lib/body-metrics`
//      `calculateAge()` türetimi ve `bodyMetricsSchema` doğrulaması. Burası
//      DB kısıtlarının (`profiles_birth_date_chk` / `profiles_height_cm_chk`)
//      arayüz tarafındaki yansımasıdır; sınırların İKİ katmanda da aynı
//      olduğunu bu testler sabitler. (DB tarafının kendi kanıtı
//      `supabase/tests/rls.test.sql` senaryo 148'dedir — orası kısıtın
//      GERÇEKTEN 23514 fırlattığını ölçer, burası kullanıcının o hatayı
//      HİÇ GÖRMEMESİ için formun önce kendisinin reddettiğini ölçer.)
//
//   B) FORM KATMANI — `ProfilePage`'in "Künye" bölümü
//      `@repo/api-client` barrel'i TAMAMEN mock'lanarak sayfa render edilir
//      (bkz. `workout-tab-ai.test.tsx` / `messages-tab.test.tsx` ile AYNI
//      desen) — gerçek Supabase çağrısı YAPILMAZ.
//
// KAPSAM (B):
//   1) Kayıtlı künye alanlara YÜKLENİR ve yaş doğum tarihinden HESAPLANIP
//      gösterilir (yaş hiçbir yerde saklanmaz).
//   2) Geçersiz boy (birim hatası) gönderimi ENGELLER — mutasyon HİÇ çağrılmaz.
//   3) Geçerli künye `useUpdateBodyMetrics` mutasyonuna KENDİ kullanıcı
//      kimliğiyle ve doğru tiplerle (`string | null`, `number | null`) gider.
//   4) Alanlar TEMİZLENEBİLİR — boş form `null` gönderir (künye zorunlu değil).
//   5) Sunucu hatası sayfada `role="alert"` ile GÖRÜNÜR (toast kaybolur, hata
//      kullanıcıyla birlikte kalmalı).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BIRTH_DATE_FLOOR,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  bodyMetricsSchema,
  calculateAge,
} from '@/lib/body-metrics'

// ===========================================================================
// A) SAF KATMAN
// ===========================================================================

describe('calculateAge — yaş SAKLANMAZ, doğum tarihinden türetilir', () => {
  it('doğum günü GEÇMİŞSE tamamlanmış yıl sayısını döner', () => {
    expect(calculateAge('1995-03-14', new Date(2026, 7, 20))).toBe(31)
  })

  it('doğum günü HENÜZ GELMEDİYSE bir eksik döner (takvim yılı farkı DEĞİL)', () => {
    expect(calculateAge('1995-12-31', new Date(2026, 7, 20))).toBe(30)
  })

  it('doğum gününün TAM KENDİSİNDE yaş artmış sayılır', () => {
    expect(calculateAge('1995-08-20', new Date(2026, 7, 20))).toBe(31)
  })

  it('bugün doğmuş biri için 0 döner — negatife düşmez', () => {
    expect(calculateAge('2026-08-20', new Date(2026, 7, 20))).toBe(0)
  })

  it('gelecekteki tarih için null döner', () => {
    expect(calculateAge('2027-01-01', new Date(2026, 7, 20))).toBeNull()
  })

  it('boş / geçersiz / takvimde OLMAYAN tarih için null döner', () => {
    expect(calculateAge(null)).toBeNull()
    expect(calculateAge(undefined)).toBeNull()
    expect(calculateAge('')).toBeNull()
    expect(calculateAge('14.03.1995')).toBeNull()
    // Regex'ten geçer ama 31 Şubat diye bir gün YOKTUR.
    expect(calculateAge('1995-02-31', new Date(2026, 7, 20))).toBeNull()
  })

  it('YEREL alanlarla hesaplar — UTC kayması yüzünden gün atlamaz', () => {
    // Yerel gece yarısına çok yakın bir an: `toISOString()` tabanlı bir hesap
    // UTC+3'te günü bir GERİ kaydırır ve doğum gününü "gelmemiş" sayardı.
    expect(calculateAge('2000-08-20', new Date(2026, 7, 20, 0, 30))).toBe(26)
  })
})

describe('bodyMetricsSchema — arayüz sınırları DB kısıtlarıyla aynı', () => {
  it('iki alan da null olabilir — künye ZORUNLU DEĞİL', () => {
    const result = bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '' })
    expect(result.success).toBe(true)
    expect(result.success && result.data).toEqual({ birth_date: null, height_cm: null })
  })

  it('makul künye kabul edilir ve boy SAYIYA çevrilir', () => {
    const result = bodyMetricsSchema.safeParse({ birth_date: '1995-03-14', height_cm: '178.5' })
    expect(result.success).toBe(true)
    expect(result.success && result.data).toEqual({ birth_date: '1995-03-14', height_cm: 178.5 })
  })

  it(`boy alt sınırı ${HEIGHT_CM_MIN} cm — metre girilmesi (1.75) REDDEDİLİR`, () => {
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '1.75' }).success).toBe(false)
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '99.9' }).success).toBe(false)
    expect(
      bodyMetricsSchema.safeParse({ birth_date: '', height_cm: String(HEIGHT_CM_MIN) }).success
    ).toBe(true)
  })

  it(`boy üst sınırı ${HEIGHT_CM_MAX} cm — milimetre girilmesi (1750) REDDEDİLİR`, () => {
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '1750' }).success).toBe(false)
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '17500' }).success).toBe(false)
    expect(
      bodyMetricsSchema.safeParse({ birth_date: '', height_cm: String(HEIGHT_CM_MAX) }).success
    ).toBe(true)
  })

  it('boyda en fazla BİR ondalık basamak kabul edilir', () => {
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '178.5' }).success).toBe(true)
    // Kayan nokta tuzağı: 178.3 * 10 tam sayı ÇIKMAZ; şema yuvarlanmış
    // değerin kendisiyle karşılaştırdığı için bu yine de geçmelidir.
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '178.3' }).success).toBe(true)
    expect(bodyMetricsSchema.safeParse({ birth_date: '', height_cm: '178.55' }).success).toBe(false)
  })

  it(`doğum tarihi ${BIRTH_DATE_FLOOR} tarihinden sonra olmalı`, () => {
    expect(bodyMetricsSchema.safeParse({ birth_date: '1899-12-31', height_cm: '' }).success).toBe(
      false
    )
    expect(
      bodyMetricsSchema.safeParse({ birth_date: BIRTH_DATE_FLOOR, height_cm: '' }).success
    ).toBe(false)
    expect(bodyMetricsSchema.safeParse({ birth_date: '1900-01-02', height_cm: '' }).success).toBe(
      true
    )
  })

  it('gelecekteki doğum tarihi REDDEDİLİR', () => {
    const nextYear = new Date().getFullYear() + 1
    expect(
      bodyMetricsSchema.safeParse({ birth_date: `${nextYear}-01-01`, height_cm: '' }).success
    ).toBe(false)
  })

  it('serbest metin tarih REDDEDİLİR', () => {
    expect(bodyMetricsSchema.safeParse({ birth_date: '14.03.1995', height_cm: '' }).success).toBe(
      false
    )
  })
})

// ===========================================================================
// B) FORM KATMANI
// ===========================================================================

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Künye bölümünün DIŞINDA kalan ağır alt bileşenler sadeleştirilir: bu dosyanın
// konusu künye formudur, MFA kayıt akışı ve rıza arayüzünün kendi testleri var
// (`mfa-enroll.test.tsx`, `activity-consent.test.tsx`).
vi.mock('@/components/security/SecuritySection', () => ({
  SecuritySection: () => null,
}))
vi.mock('@/components/activity/ActivityConsent', () => ({
  ActivityConsent: () => null,
}))

vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return {
    ...actual,
    useDeleteAccount: vi.fn(),
    useNutritionPlan: vi.fn(),
    useProfile: vi.fn(),
    useSession: vi.fn(),
    useUpdateBodyMetrics: vi.fn(),
    useUpdatePassword: vi.fn(),
    useUploadAvatar: vi.fn(),
    useWorkoutPlan: vi.fn(),
  }
})

import ProfilePage from '@/app/profile/page'
import {
  useDeleteAccount,
  useNutritionPlan,
  useProfile,
  useSession,
  useUpdateBodyMetrics,
  useUpdatePassword,
  useUploadAvatar,
  useWorkoutPlan,
} from '@repo/api-client'

const USER_ID = '22222222-2222-4222-8222-222222222222'

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
    isError: false,
    error: null,
    ...overrides,
  }
}

function mockProfilePage(
  overrides: { profile?: Record<string, unknown>; updateBodyMetrics?: Record<string, unknown> } = {}
) {
  vi.mocked(useSession).mockReturnValue(
    mockQuery({
      data: { user: { id: USER_ID, email: 'client1@example.com' } },
    }) as unknown as ReturnType<typeof useSession>
  )
  vi.mocked(useProfile).mockReturnValue(
    mockQuery({
      data: {
        id: USER_ID,
        full_name: 'Ahmet Yılmaz',
        avatar_path: null,
        avatarSignedUrl: null,
        birth_date: null,
        height_cm: null,
        ...overrides.profile,
      },
    }) as unknown as ReturnType<typeof useProfile>
  )
  vi.mocked(useWorkoutPlan).mockReturnValue(
    mockQuery({ data: undefined }) as unknown as ReturnType<typeof useWorkoutPlan>
  )
  vi.mocked(useNutritionPlan).mockReturnValue(
    mockQuery({ data: undefined }) as unknown as ReturnType<typeof useNutritionPlan>
  )
  vi.mocked(useUploadAvatar).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useUploadAvatar>
  )
  vi.mocked(useUpdatePassword).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useUpdatePassword>
  )
  vi.mocked(useDeleteAccount).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useDeleteAccount>
  )
  const updateBodyMetrics = mockMutation(overrides.updateBodyMetrics)
  vi.mocked(useUpdateBodyMetrics).mockReturnValue(
    updateBodyMetrics as unknown as ReturnType<typeof useUpdateBodyMetrics>
  )
  return { updateBodyMetrics }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProfilePage — Künye bölümü', () => {
  it('kayıtlı künye alanlara yüklenir ve YAŞ doğum tarihinden HESAPLANIP gösterilir', () => {
    // Doğum tarihi çalışma anında "tam 30 yıl önce, 1 Ocak" olarak kurulur:
    // 1 Ocak her zaman geçmiş (veya bugün) olduğu için beklenen yaş HER GÜN
    // tam 30'dur — sabit bir yaş yazsaydık test yılbaşında kırılırdı.
    const birthDate = `${new Date().getFullYear() - 30}-01-01`
    mockProfilePage({ profile: { birth_date: birthDate, height_cm: 178.5 } })

    render(<ProfilePage />)

    expect(screen.getByLabelText('Doğum tarihi')).toHaveValue(birthDate)
    expect(screen.getByLabelText('Boy (cm)')).toHaveValue(178.5)
    expect(screen.getByText('Kayıtlı doğum tarihinize göre yaşınız: 30')).toBeInTheDocument()
  })

  it('künye BOŞKEN yaş satırı hiç gösterilmez', () => {
    mockProfilePage()

    render(<ProfilePage />)

    expect(screen.getByLabelText('Doğum tarihi')).toHaveValue('')
    expect(screen.queryByText(/Kayıtlı doğum tarihinize göre/)).not.toBeInTheDocument()
  })

  it('KİLO alanı künyede YOKTUR — tek kaynak progress_entries (B-036)', () => {
    mockProfilePage()

    render(<ProfilePage />)

    expect(screen.queryByLabelText(/^Kilo/)).not.toBeInTheDocument()
  })

  it('TELEFON alanı YOKTUR — KVKK m.4 veri minimizasyonu', () => {
    mockProfilePage()

    render(<ProfilePage />)

    expect(screen.queryByLabelText(/Telefon/i)).not.toBeInTheDocument()
  })

  it('geçersiz boy (birim hatası) gönderimi ENGELLER — mutasyon HİÇ çağrılmaz', async () => {
    const { updateBodyMetrics } = mockProfilePage()
    const user = userEvent.setup()

    render(<ProfilePage />)

    await user.type(screen.getByLabelText('Boy (cm)'), '1.75')
    await user.click(screen.getByRole('button', { name: 'Künyeyi Kaydet' }))

    expect(updateBodyMetrics.mutate).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Boy en az ${HEIGHT_CM_MIN} cm olmalıdır.`
    )
  })

  it('gelecekteki doğum tarihi gönderimi ENGELLER', async () => {
    const { updateBodyMetrics } = mockProfilePage()
    const user = userEvent.setup()

    render(<ProfilePage />)

    const future = `${new Date().getFullYear() + 1}-01-01`
    await user.type(screen.getByLabelText('Doğum tarihi'), future)
    await user.click(screen.getByRole('button', { name: 'Künyeyi Kaydet' }))

    expect(updateBodyMetrics.mutate).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('Doğum tarihi gelecekte olamaz.')
  })

  it('geçerli künye KENDİ kullanıcı kimliğiyle ve doğru tiplerle mutasyona gider', async () => {
    const { updateBodyMetrics } = mockProfilePage()
    const user = userEvent.setup()

    render(<ProfilePage />)

    await user.type(screen.getByLabelText('Doğum tarihi'), '1995-03-14')
    await user.type(screen.getByLabelText('Boy (cm)'), '178.5')
    await user.click(screen.getByRole('button', { name: 'Künyeyi Kaydet' }))

    expect(updateBodyMetrics.mutate).toHaveBeenCalledTimes(1)
    expect(updateBodyMetrics.mutate.mock.calls[0]?.[0]).toEqual({
      // `userId` HER ZAMAN oturumun kendi profilidir — koç bu formdan
      // başkasının satırını hedefleyemez (DB kapısı da ayrıca reddeder).
      userId: USER_ID,
      birth_date: '1995-03-14',
      height_cm: 178.5,
    })
  })

  it('alanlar TEMİZLENEBİLİR — boş form null gönderir (künye zorunlu değil)', async () => {
    const { updateBodyMetrics } = mockProfilePage({
      profile: { birth_date: '1995-03-14', height_cm: 178.5 },
    })
    const user = userEvent.setup()

    render(<ProfilePage />)

    await user.clear(screen.getByLabelText('Doğum tarihi'))
    await user.clear(screen.getByLabelText('Boy (cm)'))
    await user.click(screen.getByRole('button', { name: 'Künyeyi Kaydet' }))

    expect(updateBodyMetrics.mutate.mock.calls[0]?.[0]).toEqual({
      userId: USER_ID,
      birth_date: null,
      height_cm: null,
    })
  })

  it('sunucu hatası SAYFADA görünür — toast kaybolur, hata kullanıcıyla kalır', () => {
    mockProfilePage({
      updateBodyMetrics: {
        isError: true,
        error: new Error('new row violates row-level security policy'),
      },
    })

    render(<ProfilePage />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Künye kaydedilemedi: new row violates row-level security policy'
    )
  })
})
