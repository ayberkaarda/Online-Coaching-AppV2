import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DailyLogTab from '@/components/tabs/DailyLogTab'
import { useCreateDailyLog, useDailyLogs } from '@/hooks'
import { getMacroPercentage } from '@/lib/utils'
import type { DailyLog } from '@/types'

import { screen, userEvent, waitFor } from '../test-utils'

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return { ...actual, useDailyLogs: vi.fn(), useCreateDailyLog: vi.fn() }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// DailyLogTab yalnızca bu alanları okur; tip birleşimini (union) taklit etmek yerine
// gerçekten kullanılan alanları modelleyip sonunda gerçek dönüş tipine cast ediyoruz.
interface MockDailyLogsResult {
  data: DailyLog[] | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

function mockDailyLogsQuery(
  overrides: Partial<MockDailyLogsResult> = {}
): ReturnType<typeof useDailyLogs> {
  const base: MockDailyLogsResult = {
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }
  return { ...base, ...overrides } as unknown as ReturnType<typeof useDailyLogs>
}

interface MockCreateDailyLogResult {
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
}

function mockCreateDailyLogMutation(
  overrides: Partial<MockCreateDailyLogResult> = {}
): ReturnType<typeof useCreateDailyLog> {
  const base: MockCreateDailyLogResult = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }
  return { ...base, ...overrides } as unknown as ReturnType<typeof useCreateDailyLog>
}

function makeLog(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: 'log-1',
    client_id: 'std-1',
    log_date: '2026-08-10',
    water_lt: 3,
    sodium_mg: 2000,
    macros: { protein: 150, carb: 200, fat: 60 },
    created_at: '2026-08-10T21:00:00.000Z',
    ...overrides,
  }
}

describe('DailyLogTab', () => {
  it('userRole="client" iken form görünür', () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery())
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    expect(screen.getByLabelText('SU (Litre)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Antrenörüme Gönder' })).toBeInTheDocument()
  })

  it('userRole="coach" iken form görünmez', () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery())
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="coach-1"
        userRole="coach"
        selectedClientIds={['std-1']}
      />
    )

    expect(screen.queryByLabelText('SU (Litre)')).not.toBeInTheDocument()
  })

  it('geçersiz değerle gönderim (su = 25) hata mesajı gösterir ve mutation çağrılmaz', async () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery())
    const mutation = mockCreateDailyLogMutation()
    vi.mocked(useCreateDailyLog).mockReturnValue(mutation)
    const user = userEvent.setup()

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    await user.type(screen.getByLabelText('SU (Litre)'), '25')
    await user.click(screen.getByRole('button', { name: 'Antrenörüme Gönder' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Su miktarı en fazla 20 litre olabilir.')
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
  })

  it('geçerli gönderimde mutation SAYISAL makrolarla çağrılır (string değil)', async () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery())
    const mutation = mockCreateDailyLogMutation()
    vi.mocked(useCreateDailyLog).mockReturnValue(mutation)
    const user = userEvent.setup()

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    await user.type(screen.getByLabelText('SU (Litre)'), '2.5')
    await user.type(screen.getByLabelText('SODYUM (mg)'), '2000')
    await user.type(screen.getByLabelText('Protein (g)'), '150')
    await user.type(screen.getByLabelText('Karbonhidrat (g)'), '200')
    await user.type(screen.getByLabelText('Yağ (g)'), '60')
    await user.click(screen.getByRole('button', { name: 'Antrenörüme Gönder' }))

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1))
    // `toHaveBeenCalledWith` derin eşitlik yapar: sayı yerine string ('150') gönderilseydi
    // bu assertion başarısız olurdu — bu, sayısal makro regresyonunun testidir.
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      clientId: 'std-1',
      water_lt: 2.5,
      sodium_mg: 2000,
      macros: { protein: 150, carb: 200, fat: 60 },
    })
  })

  it("kayıt listesi render edilir ve makro yüzde çubuğunun aria-label'ı yüzdeleri içerir", () => {
    const log = makeLog()
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery({ data: [log] }))
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    const percent = getMacroPercentage(log.macros.protein, log.macros.carb, log.macros.fat)
    const expectedLabel = `Protein %${Math.round(percent.p)}, karbonhidrat %${Math.round(
      percent.c
    )}, yağ %${Math.round(percent.f)}`

    expect(screen.getByRole('img', { name: expectedLabel })).toBeInTheDocument()
  })

  it('isLoading true iken iskelet gösterilir', () => {
    vi.mocked(useDailyLogs).mockReturnValue(
      mockDailyLogsQuery({ data: undefined, isLoading: true })
    )
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('boş liste iken boş durum mesajı gösterilir', () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery({ data: [] }))
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId="std-1"
        currentUserId="std-1"
        userRole="client"
        selectedClientIds={[]}
      />
    )

    expect(screen.getByText('Kayıt bulunamadı.')).toBeInTheDocument()
  })

  it('coach + birden fazla seçili öğrenci iken uyarı metni gösterilir', () => {
    vi.mocked(useDailyLogs).mockReturnValue(mockDailyLogsQuery({ data: [makeLog()] }))
    vi.mocked(useCreateDailyLog).mockReturnValue(mockCreateDailyLogMutation())

    render(
      <DailyLogTab
        targetId={undefined}
        currentUserId="coach-1"
        userRole="coach"
        selectedClientIds={['std-1', 'std-2']}
      />
    )

    expect(screen.getByText('Sadece 1 öğrenci seçili bırakın.')).toBeInTheDocument()
    expect(screen.queryByText('Rapor Geçmişi ve Makro Dağılımı')).not.toBeInTheDocument()
  })
})
