// B-036 — koç panelindeki KİLO GRAFİĞİNİN KAYNAĞI.
//
// Bu dosyanın kilitlediği şey tek bir cümledir: koç panelinin kilo trendi
// `form_checks.current_weight`ten DEĞİL, `progress_entries`ten (yani
// `useProgressTrend` -> `buildTrendSeries`) beslenir.
//
// NEDEN BU TEST GEREKLİ: iki kaynak da "kilo" tutuyor ve ekranda ikisi de
// makul görünüyor. Grafik yanlış tabloya bağlandığında hiçbir şey PATLAMAZ —
// yalnızca koç ile danışan AYNI danışan için FARKLI eğriler görür (AC-4.2'nin
// ihlali) ve bu ancak yan yana bakıldığında fark edilir. Test tam olarak o yan
// yana bakışı otomatikleştirir: form check kilosu BİLEREK ilerleme kaydından
// FARKLI seçilir ve grafikte HANGİSİNİN çizildiği ölçülür.
//
// KAPSAM:
//   A) Grafik `useProgressTrend`ten beslenir; form check kilosu grafiğe
//      SIZMAZ (ama poz kartı etiketinde KALIR — o fotoğrafın meta verisidir).
//   B) Aralık seçici 7/30/90 GÜNDÜR; eski `1 Hafta / 1 Ay / Tümü` YOKTUR ve
//      seçim TEK endpoint'e parametre olarak gider.
//   C) İnterpolasyon yok (§6): ölçümsüz gün çizgiyi KESER — `StatsTab` ile
//      aynı sözleşme, ayrı bileşende ayrıca kilitlenir.
//   D) Ölçüm yoksa Türkçe boş durum metni gösterilir.

import type { ReactElement, ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom'da `ResponsiveContainer` 0x0 ölçer ve recharts HİÇBİR ŞEY çizmez.
// Kapsayıcı sabit ölçüyle değiştirilir; grafiğin KENDİSİ gerçek recharts'tır
// (aksi hâlde test kendi mock'unu doğrulardı).
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
            width: 640,
            height: 320,
          })
        : children,
  }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Veri hook'larının HEPSİ mock'lanır (ağ yok); `TREND_RANGE_DAYS`,
// `DEFAULT_TREND_RANGE_DAYS` ve `summarizeMetric` GERÇEK kalır — bileşenin
// aralık listesi ve özeti hakkındaki iddialar gerçek sözleşmeye kurulsun.
vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return {
    ...actual,
    useDailyLogs: vi.fn(),
    useFormChecks: vi.fn(),
    useLastCheckins: vi.fn(),
    usePendingFormChecks: vi.fn(),
    useProgressTrend: vi.fn(),
    useReviewFormCheck: vi.fn(),
    useSendNotification: vi.fn(),
    useSession: vi.fn(),
  }
})

import { CoachUserManagement } from '@/components/CoachUserManagement'
import {
  useDailyLogs,
  useFormChecks,
  useLastCheckins,
  usePendingFormChecks,
  useProgressTrend,
  useReviewFormCheck,
  useSendNotification,
  useSession,
} from '@repo/api-client'
import {
  buildTrendSeries,
  type ProgressEntry,
  type ProgressTrend,
} from '@repo/api-client/hooks/useProgressEntries'
import type { ProfileWithAvatar } from '@repo/api-client/hooks/useProfile'

const TODAY = '2026-08-17'
const CLIENT_ID = 'client-1'

const CLIENT = {
  id: CLIENT_ID,
  full_name: 'Ahmet Yılmaz',
  email: 'ahmet@example.com',
  role: 'client',
  avatarSignedUrl: null,
} as unknown as ProfileWithAvatar

function entry(overrides: Partial<ProgressEntry> & { entry_date: string }): ProgressEntry {
  return {
    id: `pe-${overrides.entry_date}`,
    client_id: CLIENT_ID,
    weight_kg: null,
    waist_cm: null,
    chest_cm: null,
    arm_cm: null,
    thigh_cm: null,
    hip_cm: null,
    notes: null,
    created_at: `${overrides.entry_date}T08:00:00.000Z`,
    updated_at: `${overrides.entry_date}T08:00:00.000Z`,
    ...overrides,
  }
}

/**
 * Form check kilosu BİLEREK ilerleme kaydından FARKLI (123.45): grafikte
 * görünürse, bileşen eski kaynağa (form_checks) geri dönmüş demektir.
 */
const FORM_CHECK_WEIGHT = 123.45

function formCheck() {
  return {
    id: 'fc-1',
    client_id: CLIENT_ID,
    current_weight: FORM_CHECK_WEIGHT,
    front_pose_path: null,
    back_pose_path: null,
    notes: null,
    created_at: `${TODAY}T09:00:00.000Z`,
    status: 'pending',
    coach_feedback: null,
    reviewed_at: null,
    reviewed_by: null,
    frontPoseSignedUrl: null,
    backPoseSignedUrl: null,
  }
}

function mockTrend(trend: ProgressTrend): void {
  vi.mocked(useProgressTrend).mockReturnValue({
    data: trend,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useProgressTrend>)
}

beforeEach(() => {
  // `vitest.setup.ts`in `matchMedia` mock'u `restoreAllMocks` ile gövdesini
  // kaybeder -> recharts'ın `usePrefersReducedMotion`u patlar. Düz fonksiyonla
  // (mock DEĞİL) yeniden kurulur.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  vi.mocked(useFormChecks).mockReturnValue({
    data: [formCheck()],
    isLoading: false,
  } as unknown as ReturnType<typeof useFormChecks>)
  vi.mocked(useDailyLogs).mockReturnValue({
    data: [],
    isLoading: false,
  } as unknown as ReturnType<typeof useDailyLogs>)
  vi.mocked(useLastCheckins).mockReturnValue({
    data: {},
  } as unknown as ReturnType<typeof useLastCheckins>)
  vi.mocked(usePendingFormChecks).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof usePendingFormChecks>)
  vi.mocked(useReviewFormCheck).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useReviewFormCheck>)
  vi.mocked(useSendNotification).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useSendNotification>)
  vi.mocked(useSession).mockReturnValue({
    data: { user: { id: 'coach-1' } },
  } as unknown as ReturnType<typeof useSession>)

  mockTrend(buildTrendSeries([], { rangeDays: 30, today: TODAY }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

/** Danışan kartına tıklayıp analiz çekmecesini açar. */
async function openDrawer(): Promise<HTMLElement> {
  const { container } = render(<CoachUserManagement clients={[CLIENT]} />)
  await userEvent.click(screen.getByRole('button', { name: /Ahmet Yılmaz/ }))
  return container
}

// ---------------------------------------------------------------------------
// A) KAYNAK — grafik `progress_entries`ten beslenir
// ---------------------------------------------------------------------------

describe('Koç paneli kilo grafiği — kaynak `progress_entries`tir (B-036)', () => {
  it('TEK endpoint (`useProgressTrend`) seçili danışan ve VARSAYILAN aralıkla çağrılır', async () => {
    await openDrawer()

    // `StatsTab` ile AYNI hook, AYNI varsayılan -> iki ekran aynı seriyi çizer.
    expect(vi.mocked(useProgressTrend)).toHaveBeenCalledWith(CLIENT_ID, 30)
  })

  it('grafik `progress_entries` ölçümlerini çizer; form check kilosu grafiğe SIZMAZ', async () => {
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-15', weight_kg: 84 }),
          entry({ entry_date: '2026-08-16', weight_kg: 83 }),
          entry({ entry_date: TODAY, weight_kg: 81.5 }),
        ],
        { rangeDays: 30, today: TODAY }
      )
    )

    const container = await openDrawer()

    // Üç ölçüm günü = üç nokta. Form check'in kilosu grafiğe DÖRDÜNCÜ bir nokta
    // EKLEYEMEZ; eklerse bileşen iki kaynağı birleştiriyor demektir.
    expect(container.querySelectorAll('.recharts-area-dot')).toHaveLength(3)

    // Grafiğin ekran okuyucu özeti SERİDEN türetilir (summarizeMetric).
    const caption = container.querySelector('figcaption')?.textContent ?? ''
    expect(caption).toContain('3 ölçüm günü')
    expect(caption).toContain('İlk ölçüm 84 kg')
    expect(caption).toContain('son ölçüm 81.5 kg')
    // Form check kilosu (123.45) grafiğin ANLATIMINDA hiç geçmez.
    expect(caption).not.toContain(String(FORM_CHECK_WEIGHT))
  })

  it('form check kilosu POZ KARTI etiketinde KALIR (fotoğrafın meta verisi, trend değil)', async () => {
    await openDrawer()

    // D4: `form_checks.current_weight` sökülmedi; yalnızca TREND kaynağı değişti.
    expect(screen.getAllByText(new RegExp(`${FORM_CHECK_WEIGHT} kg`)).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// B) ARALIK SEÇİCİ — 7/30/90
// ---------------------------------------------------------------------------

describe('Aralık seçici — 7/30/90 gün', () => {
  it('yalnızca 7/30/90 butonlarını sunar; eski `1 Hafta / 1 Ay / Tümü` KALDIRILDI', async () => {
    await openDrawer()

    const group = screen.getByRole('group', { name: 'Trend aralığı' })
    expect(group).toBeInTheDocument()
    for (const label of ['7 gün', '30 gün', '90 gün']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    for (const legacy of ['1 Hafta', '1 Ay', 'Tümü']) {
      expect(screen.queryByRole('button', { name: legacy })).not.toBeInTheDocument()
    }

    // Varsayılan aralık basılı görünür (yalnızca renkle anlatılmaz).
    expect(screen.getByRole('button', { name: '30 gün' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('aralık değişince TEK endpoint YENİ aralıkla çağrılır (istemcide yeniden dilimleme YOK)', async () => {
    await openDrawer()
    await userEvent.click(screen.getByRole('button', { name: '90 gün' }))

    expect(vi.mocked(useProgressTrend)).toHaveBeenLastCalledWith(CLIENT_ID, 90)
    expect(screen.getByRole('button', { name: '90 gün' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '7 gün' }))
    expect(vi.mocked(useProgressTrend)).toHaveBeenLastCalledWith(CLIENT_ID, 7)
  })
})

// ---------------------------------------------------------------------------
// C) İNTERPOLASYON YOK + D) BOŞ DURUM
// ---------------------------------------------------------------------------

describe('Grafik sözleşmesi — GAP korunur, boş durum Türkçedir', () => {
  it('ölçümsüz gün çizgiyi KESER (iki ayrı alt-yol) — sessiz interpolasyon yok', async () => {
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-15', weight_kg: 84 }),
          entry({ entry_date: TODAY, weight_kg: 81 }),
        ],
        { rangeDays: 7, today: TODAY }
      )
    )

    const container = await openDrawer()
    const pathData = container.querySelector('.recharts-area-curve')?.getAttribute('d') ?? ''
    expect(pathData).not.toBe('')
    // Her `M` yeni bir alt-yol başlatır: iki parça = çizgi boşlukta kesilmiş.
    expect((pathData.match(/M/g) ?? []).length).toBe(2)
  })

  it('aralıkta hiç ölçüm yoksa Türkçe boş durum metni gösterilir', async () => {
    mockTrend(buildTrendSeries([], { rangeDays: 30, today: TODAY }))

    const container = await openDrawer()
    expect(screen.getByText('Seçili aralıkta kayıtlı ölçüm yok.')).toBeInTheDocument()
    expect(container.querySelector('.recharts-area-curve')).toBeNull()
  })
})
