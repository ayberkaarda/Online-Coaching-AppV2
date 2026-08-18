// Trend serisi ve grafiği — Faz 4c (§6, AC-4.2).
//
// KAPSAM:
//   A) `buildTrendSeries` — AC-4.2'nin TEK seri kaynağı. 7/30/90 aralık
//      filtresi, aralık dışı satırların elenmesi, boş günlerin `null` (GAP)
//      kalması.
//   B) İNTERPOLASYON YOK (§6 kritik kısıtı) — GERÇEK SVG çıktısı üzerinden.
//      Bu, bu dosyanın en önemli testidir: seri doğru üretilse bile grafik
//      `connectNulls` ile boşluğu KAPATABİLİR ve regresyon SESSİZ olur.
//      Test, çizilen `path`in `d` niteliğini okur ve çizginin GERÇEKTEN
//      kesildiğini (birden fazla `M` = ayrı alt-yol) doğrular.
//   C) Aralık seçici — 7/30/90 butonu TEK endpoint'i doğru parametreyle çağırır.
//   D) `summarizeMetric` — özet grafiğin çizdiği SERİDEN türetilir.

import type { ReactElement, ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom'da `ResponsiveContainer` 0x0 ölçer ve recharts HİÇBİR ŞEY çizmez —
// yani gerçek SVG'yi denetleyen bir test yazılamaz. Kapsayıcı bu yüzden sabit
// ölçüyle değiştirilir; grafiğin KENDİSİ (AreaChart/Area/connectNulls) GERÇEK
// recharts'tır, mock DEĞİLDİR. Aksi hâlde test kendi mock'unu doğrulardı.
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

vi.mock('@/components/progress/ProgressPhotos', () => ({ ProgressPhotos: () => null }))

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return { ...actual, useProgressTrend: vi.fn(), useUpsertProgressEntry: vi.fn() }
})

import StatsTab from '@/components/tabs/StatsTab'
import { useProgressTrend, useUpsertProgressEntry } from '@/hooks'
import {
  addDaysIso,
  buildTrendSeries,
  summarizeMetric,
  type ProgressEntry,
  type ProgressTrend,
} from '@/hooks/useProgressEntries'

const TODAY = '2026-08-17'

function entry(overrides: Partial<ProgressEntry> & { entry_date: string }): ProgressEntry {
  return {
    id: `e-${overrides.entry_date}`,
    client_id: 'client-1',
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

// `vitest.setup.ts` `window.matchMedia`ı bir `vi.fn()` ile kurar; aşağıdaki
// `restoreAllMocks` o mock'un GÖVDESİNİ de siler ve ikinci testten itibaren
// `matchMedia(...)` `undefined` döner -> recharts'ın `usePrefersReducedMotion`
// kancası "Cannot read properties of undefined (reading 'matches')" ile patlar.
// Bu yüzden stub her testten önce DÜZ FONKSİYONLA (mock DEĞİL) yeniden kurulur.
beforeEach(() => {
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
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// A) buildTrendSeries — tek seri kaynağı
// ---------------------------------------------------------------------------

describe('buildTrendSeries', () => {
  it('7/30/90 aralığında SERİ UZUNLUĞU aralığın gün sayısına EŞİTTİR (bugün dahil)', () => {
    for (const rangeDays of [7, 30, 90] as const) {
      const trend = buildTrendSeries([], { rangeDays, today: TODAY })
      expect(trend.points).toHaveLength(rangeDays)
      expect(trend.end).toBe(TODAY)
      expect(trend.start).toBe(addDaysIso(TODAY, -(rangeDays - 1)))
      expect(trend.points[0]?.date).toBe(trend.start)
      expect(trend.points[rangeDays - 1]?.date).toBe(TODAY)
    }
  })

  it('aralık DIŞINDAKİ satırları eler (7 günlük seride 8 gün önceki ölçüm görünmez)', () => {
    const trend = buildTrendSeries(
      [
        entry({ entry_date: addDaysIso(TODAY, -8), weight_kg: 99 }),
        entry({ entry_date: TODAY, weight_kg: 80 }),
        // Gelecek tarihli satır (DB'de CHECK ile yasaklanamaz) seriyi kaydırmaz.
        entry({ entry_date: addDaysIso(TODAY, 1), weight_kg: 70 }),
      ],
      { rangeDays: 7, today: TODAY }
    )

    expect(trend.measuredDays).toBe(1)
    expect(trend.points.map((point) => point.weight_kg)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      80,
    ])
  })

  it('ölçüm olmayan günü `null` olarak taşır — GAP burada doğar, satır ATLANMAZ', () => {
    const trend = buildTrendSeries(
      [
        entry({ entry_date: '2026-08-15', weight_kg: 82.5, waist_cm: 85 }),
        entry({ entry_date: '2026-08-17', weight_kg: 81.5 }),
      ],
      { rangeDays: 7, today: TODAY }
    )

    // Son üç gün: ölçüm / BOŞ / ölçüm.
    expect(trend.points.slice(4)).toEqual([
      {
        date: '2026-08-15',
        label: '15.08',
        weight_kg: 82.5,
        waist_cm: 85,
        chest_cm: null,
        arm_cm: null,
        thigh_cm: null,
        hip_cm: null,
      },
      {
        date: '2026-08-16',
        label: '16.08',
        weight_kg: null,
        waist_cm: null,
        chest_cm: null,
        arm_cm: null,
        thigh_cm: null,
        hip_cm: null,
      },
      {
        date: '2026-08-17',
        label: '17.08',
        weight_kg: 81.5,
        waist_cm: null,
        chest_cm: null,
        arm_cm: null,
        thigh_cm: null,
        hip_cm: null,
      },
    ])
    expect(trend.measuredDays).toBe(2)
  })

  it('ay/yıl sınırını doğru geçer (UTC aritmetiği, DST kaymasına duyarsız)', () => {
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysIso('2026-03-29', 1)).toBe('2026-03-30') // Avrupa DST günü
    const trend = buildTrendSeries([], { rangeDays: 7, today: '2026-01-03' })
    expect(trend.start).toBe('2025-12-28')
  })
})

describe('summarizeMetric', () => {
  it('özeti GRAFİĞİN ÇİZDİĞİ seriden türetir (ilk/son/net değişim)', () => {
    const trend = buildTrendSeries(
      [
        entry({ entry_date: '2026-08-15', weight_kg: 84 }),
        entry({ entry_date: '2026-08-17', weight_kg: 81.5 }),
      ],
      { rangeDays: 7, today: TODAY }
    )

    const summary = summarizeMetric(trend, 'weight_kg')
    expect(summary.count).toBe(2)
    expect(summary.first).toEqual({ date: '2026-08-15', value: 84 })
    expect(summary.last).toEqual({ date: '2026-08-17', value: 81.5 })
    expect(summary.delta).toBeCloseTo(-2.5, 5)
  })

  it('ölçülmemiş metrikte `null` döner — 0 ile KARIŞTIRILMAZ', () => {
    const trend = buildTrendSeries([entry({ entry_date: TODAY, weight_kg: 80 })], {
      rangeDays: 7,
      today: TODAY,
    })
    const summary = summarizeMetric(trend, 'waist_cm')
    expect(summary).toEqual({ count: 0, first: null, last: null, delta: null })
  })
})

// ---------------------------------------------------------------------------
// B) İNTERPOLASYON YOK — gerçek SVG üzerinden
// ---------------------------------------------------------------------------

function mockTrend(trend: ProgressTrend): void {
  vi.mocked(useProgressTrend).mockReturnValue({
    data: trend,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useProgressTrend>)
  vi.mocked(useUpsertProgressEntry).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpsertProgressEntry>)
}

/** Çizginin kaç ayrı parçadan oluştuğu: her `M` yeni bir alt-yol başlatır. */
function subPathCount(pathData: string): number {
  return (pathData.match(/M/g) ?? []).length
}

function renderStats(): HTMLElement {
  const { container } = render(
    <StatsTab targetId="client-1" userRole="client" selectedClientIds={[]} />
  )
  return container
}

describe('Trend grafiği — boş günler GAP kalır, interpolasyon YOKTUR (§6)', () => {
  it('ortadaki ölçümsüz gün çizgiyi KESER (çizgi iki ayrı parçaya bölünür)', () => {
    // 15 -> ölçüm, 16 -> YOK, 17 -> ölçüm. Ara gün null olduğu için çizgi
    // 15 ile 17'yi BİRLEŞTİRMEMELİDİR.
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-15', weight_kg: 84 }),
          entry({ entry_date: '2026-08-17', weight_kg: 81 }),
        ],
        { rangeDays: 7, today: TODAY }
      )
    )

    const container = renderStats()
    const curve = container.querySelector('.recharts-area-curve')
    expect(curve).not.toBeNull()

    const pathData = curve?.getAttribute('d') ?? ''
    expect(pathData).not.toBe('')
    // İKİ ayrı alt-yol = çizgi boşlukta kesilmiş. Tek alt-yol olsaydı 15 ile 17
    // birleştirilmiş, yani ara gün SESSİZCE interpole edilmiş olurdu.
    expect(subPathCount(pathData)).toBe(2)
  })

  it('kesintisiz günlerde çizgi TEK parçadır (kontrol testi — yukarıdaki iddia anlamlı olsun)', () => {
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-15', weight_kg: 84 }),
          entry({ entry_date: '2026-08-16', weight_kg: 83 }),
          entry({ entry_date: '2026-08-17', weight_kg: 81 }),
        ],
        { rangeDays: 7, today: TODAY }
      )
    )

    const container = renderStats()
    const pathData = container.querySelector('.recharts-area-curve')?.getAttribute('d') ?? ''
    expect(subPathCount(pathData)).toBe(1)
  })

  it('grafikte YALNIZCA ölçüm yapılan günler için nokta çizilir (boş gün noktası yok)', () => {
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-13', weight_kg: 85 }),
          entry({ entry_date: '2026-08-17', weight_kg: 81 }),
        ],
        { rangeDays: 7, today: TODAY }
      )
    )

    const container = renderStats()
    expect(container.querySelectorAll('.recharts-area-dot')).toHaveLength(2)
  })

  it('seri ekrana "N ölçüm günü" olarak da yansır (özet ile grafik AYNI kaynaktan)', () => {
    mockTrend(
      buildTrendSeries(
        [
          entry({ entry_date: '2026-08-13', weight_kg: 85 }),
          entry({ entry_date: '2026-08-17', weight_kg: 81 }),
        ],
        { rangeDays: 7, today: TODAY }
      )
    )

    renderStats()
    expect(screen.getByText('Seçili aralıkta 2 ölçüm günü kayıtlı.')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// C) Aralık seçici — 7/30/90
// ---------------------------------------------------------------------------

describe('Aralık seçici (7/30/90)', () => {
  it('varsayılan 30 gündür ve TEK endpoint aynı aralıkla çağrılır', () => {
    mockTrend(buildTrendSeries([], { rangeDays: 30, today: TODAY }))
    renderStats()

    expect(vi.mocked(useProgressTrend)).toHaveBeenCalledWith('client-1', 30)
    expect(screen.getByRole('button', { name: '30 gün' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('7 ve 90 gün butonları tek endpoint çağrısını yeni aralıkla tekrarlar', async () => {
    mockTrend(buildTrendSeries([], { rangeDays: 30, today: TODAY }))
    const user = userEvent.setup()
    renderStats()

    await user.click(screen.getByRole('button', { name: '7 gün' }))
    expect(vi.mocked(useProgressTrend)).toHaveBeenLastCalledWith('client-1', 7)
    expect(screen.getByRole('button', { name: '7 gün' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '90 gün' }))
    expect(vi.mocked(useProgressTrend)).toHaveBeenLastCalledWith('client-1', 90)
    expect(screen.getByRole('button', { name: '90 gün' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('metrik değiştirmek AYNI seriyi kullanır — ikinci bir sorgu açılmaz', async () => {
    mockTrend(
      buildTrendSeries([entry({ entry_date: TODAY, weight_kg: 81, waist_cm: 88 })], {
        rangeDays: 30,
        today: TODAY,
      })
    )
    const user = userEvent.setup()
    renderStats()

    await user.selectOptions(screen.getByLabelText('Grafik metriği'), 'waist_cm')

    // Aralık DEĞİŞMEDİĞİ için endpoint hâlâ aynı parametrelerle çağrılır.
    expect(vi.mocked(useProgressTrend)).toHaveBeenLastCalledWith('client-1', 30)
    // Grafik/özet artık bel ölçüsünü gösterir (kiloyu DEĞİL) — ikisi de AYNI
    // seriden okunur. (`getAllByText`: metin hem özet satırında hem gizli
    // tooltip şablonunda geçer.)
    expect(screen.getAllByText(/88 cm/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/81 kg/)).not.toBeInTheDocument()
  })
})
