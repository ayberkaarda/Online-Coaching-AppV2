// Beslenme öğün logu (`nutrition_logs`) — Faz 2d (§4.2).
//
// KAPSAM:
//   A) Saf yardımcılar: `sumNutritionLogsForDate`, `todayIsoDate`.
//   B) Öğün ekleme/silme mutasyonları: doğru `.insert()`/`.delete()` çağrısı,
//      başarı/hata yolu.
//   C) "Koçun yazma denemesinin arayüzde SUNULMADIĞI": `NutritionTab`
//      koç rolünde render edildiğinde "Öğün Ekle" formu HİÇ render edilmez
//      (RLS zaten 42501 ile reddeder — bkz. supabase/README.md §4h — ama bu
//      test arayüzün o eylemi TEKLİF bile etmediğini kilitler).

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` fabrikaları dosyanın en üstüne hoist edilir; mock'lar bu yüzden
// `vi.hoisted` ile tanımlanmalı, aksi hâlde "cannot access before initialization"
// (bkz. tests/unit/storage-cleanup.test.ts — aynı desen).
const { insertMock, insertSelectSingleMock, deleteEqMock, fromMock } = vi.hoisted(() => {
  return {
    insertMock: vi.fn(),
    insertSelectSingleMock: vi.fn(),
    deleteEqMock: vi.fn(),
    fromMock: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// `@/hooks` (barrel) burada TAMAMEN mock'lanır: `NutritionTab`'in kullandığı 9
// hook'un hepsi Bölüm C'de kontrol edilir ki bileşen testi gerçek Supabase
// çağrısı YAPMASIN. Bu, Bölüm A/B'nin `@/hooks/useNutritionLogs`'tan
// (barrel'i ATLAYARAK) yaptığı DOĞRUDAN importla ÇAKIŞMAZ — farklı modül
// specifier'ı, ayrı modül kaydı.
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return {
    ...actual,
    useFoods: vi.fn(),
    useNutritionPlan: vi.fn(),
    useSaveNutritionPlan: vi.fn(),
    useGenerateDiet: vi.fn(),
    useNutritionTargets: vi.fn(),
    useSetNutritionTargets: vi.fn(),
    useNutritionLogs: vi.fn(),
    useCreateNutritionLog: vi.fn(),
    useDeleteNutritionLog: vi.fn(),
  }
})

import { toast } from 'sonner'

import NutritionTab from '@/components/tabs/NutritionTab'
import {
  useCreateNutritionLog as useCreateNutritionLogBarrel,
  useDeleteNutritionLog as useDeleteNutritionLogBarrel,
  useFoods,
  useGenerateDiet,
  useNutritionLogs as useNutritionLogsBarrel,
  useNutritionPlan,
  useNutritionTargets,
  useSaveNutritionPlan,
  useSetNutritionTargets,
} from '@/hooks'
import {
  sumNutritionLogsForDate,
  useCreateNutritionLog,
  useDeleteNutritionLog,
  type NutritionLog,
} from '@/hooks/useNutritionLogs'
// `todayIsoDate` ARTIK bu hook dosyasında DEĞİL, `src/lib/date.ts`te — dört
// yazma yolunun da paylaştığı tek kaynak (bkz. o dosyanın başı ve
// tests/unit/local-date-consistency.test.ts).
import { todayIsoDate } from '@/lib/date'

function wireNutritionLogsTable(): void {
  fromMock.mockImplementation((table: string) => {
    if (table !== 'nutrition_logs') throw new Error(`beklenmeyen tablo: ${table}`)
    return {
      insert: vi.fn((row: unknown) => {
        insertMock(row)
        return { select: vi.fn(() => ({ single: insertSelectSingleMock })) }
      }),
      delete: vi.fn(() => ({ eq: deleteEqMock })),
    }
  })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const log = (overrides: Partial<NutritionLog> = {}): NutritionLog => ({
  id: 'log-1',
  client_id: 'client-1',
  log_date: '2026-08-17',
  description: 'Izgara tavuk + pilav',
  kcal: 600,
  protein_g: 45,
  carb_g: 60,
  fat_g: 15,
  created_at: '2026-08-17T12:00:00.000Z',
  updated_at: '2026-08-17T12:00:00.000Z',
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// A) Saf yardımcılar
// ---------------------------------------------------------------------------

describe('sumNutritionLogsForDate', () => {
  it('yalnızca verilen güne ait satırları toplar, diğer günleri karışTIRMAZ', () => {
    const logs = [
      log({ id: 'a', log_date: '2026-08-17', kcal: 600, protein_g: 45, carb_g: 60, fat_g: 15 }),
      log({ id: 'b', log_date: '2026-08-17', kcal: 300, protein_g: 20, carb_g: 30, fat_g: 5 }),
      log({ id: 'c', log_date: '2026-08-16', kcal: 999, protein_g: 99, carb_g: 99, fat_g: 99 }),
    ]

    expect(sumNutritionLogsForDate(logs, '2026-08-17')).toEqual({
      kcal: 900,
      protein_g: 65,
      carb_g: 90,
      fat_g: 20,
    })
  })

  it('NULL alanları toplama 0 olarak katar (veritabanı sum() ile aynı davranış)', () => {
    const logs = [
      log({ id: 'a', log_date: '2026-08-17', kcal: 500, protein_g: null, carb_g: null, fat_g: 10 }),
    ]

    expect(sumNutritionLogsForDate(logs, '2026-08-17')).toEqual({
      kcal: 500,
      protein_g: 0,
      carb_g: 0,
      fat_g: 10,
    })
  })

  it('o güne ait kayıt yoksa hepsi 0 döner', () => {
    expect(sumNutritionLogsForDate([], '2026-08-17')).toEqual({
      kcal: 0,
      protein_g: 0,
      carb_g: 0,
      fat_g: 0,
    })
  })
})

describe('todayIsoDate', () => {
  it('YYYY-MM-DD biçiminde, YEREL tarihe göre döner (toISOString KULLANILMAZ)', () => {
    const iso = todayIsoDate()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`
    expect(iso).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// B) Öğün ekleme/silme
// ---------------------------------------------------------------------------

describe('useCreateNutritionLog', () => {
  it('açıklama + makrolarla insert() çağırır ve log_date DAİMA gönderilir (DB varsayılanına düşülmez)', async () => {
    wireNutritionLogsTable()
    insertSelectSingleMock.mockResolvedValue({ data: log(), error: null })

    const { result } = renderHook(() => useCreateNutritionLog(), { wrapper: createWrapper() })
    result.current.mutate({
      clientId: 'client-1',
      description: 'Izgara tavuk + pilav',
      kcal: 600,
      protein_g: 45,
      carb_g: 60,
      fat_g: 15,
      log_date: '2026-08-17',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // `log_date` payload'da VARDIR: alan artık zorunlu ve hook onu koşulsuz
    // gönderir. Eskiden opsiyoneldi ve gönderilmediğinde satır veritabanının
    // UTC `current_date` varsayılanını alıyordu — gece yarısı hatasının kökü
    // (bkz. tests/unit/local-date-consistency.test.ts).
    expect(insertMock).toHaveBeenCalledWith({
      client_id: 'client-1',
      description: 'Izgara tavuk + pilav',
      kcal: 600,
      protein_g: 45,
      carb_g: 60,
      fat_g: 15,
      log_date: '2026-08-17',
    })
    expect(toast.success).toHaveBeenCalledWith('Öğün eklendi.')
  })

  it('opsiyonel makro alanları NULL gönderilebilir (boş bırakma = "girilmedi", 0 DEĞİL)', async () => {
    wireNutritionLogsTable()
    insertSelectSingleMock.mockResolvedValue({
      data: log({ protein_g: null, carb_g: null, fat_g: null }),
      error: null,
    })

    const { result } = renderHook(() => useCreateNutritionLog(), { wrapper: createWrapper() })
    result.current.mutate({
      clientId: 'client-1',
      description: 'Serbest öğün',
      kcal: null,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      log_date: '2026-08-17',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ kcal: null, protein_g: null, carb_g: null, fat_g: null })
    )
  })

  it("sunucu hata dönerse (ör. RLS 42501) mutasyon başarısız olur ve hata toast'ı gösterilir", async () => {
    wireNutritionLogsTable()
    insertSelectSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
    })

    const { result } = renderHook(() => useCreateNutritionLog(), { wrapper: createWrapper() })
    result.current.mutate({
      clientId: 'someone-elses-id',
      description: 'İzinsiz deneme',
      kcal: null,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      log_date: '2026-08-17',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalled()
  })
})

describe('useDeleteNutritionLog', () => {
  it("id ile delete().eq() çağırır ve başarı toast'ı gösterir", async () => {
    wireNutritionLogsTable()
    deleteEqMock.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useDeleteNutritionLog(), { wrapper: createWrapper() })
    result.current.mutate({ id: 'log-1', clientId: 'client-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'log-1')
    expect(toast.success).toHaveBeenCalledWith('Öğün silindi.')
  })

  it('silme başkasının kaydında RLS tarafından reddedilirse hata olarak yansır', async () => {
    wireNutritionLogsTable()
    deleteEqMock.mockResolvedValue({
      error: { message: 'permission denied', code: '42501' },
    })

    const { result } = renderHook(() => useDeleteNutritionLog(), { wrapper: createWrapper() })
    result.current.mutate({ id: 'log-2', clientId: 'client-1' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// C) NutritionTab — koçun yazma denemesi arayüzde SUNULMAZ
// ---------------------------------------------------------------------------

const EMPTY_TARGETS_UI = { kcal: null, protein_g: null, carb_g: null, fat_g: null }

function mockQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isFetched: true,
    isError: false,
    error: null,
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

/** NutritionTab'in bağımlı olduğu 9 hook'u makul varsayılanlarla mock'lar; testler yalnızca ihtiyaç duyduklarını `overrides` ile değiştirir. */
function mockNutritionHooks(
  overrides: {
    nutritionLogs?: Record<string, unknown>
    createLog?: Record<string, unknown>
  } = {}
) {
  vi.mocked(useFoods).mockReturnValue(
    mockQuery({ data: [] }) as unknown as ReturnType<typeof useFoods>
  )
  vi.mocked(useNutritionPlan).mockReturnValue(
    mockQuery({ data: undefined }) as unknown as ReturnType<typeof useNutritionPlan>
  )
  vi.mocked(useSaveNutritionPlan).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useSaveNutritionPlan>
  )
  vi.mocked(useGenerateDiet).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useGenerateDiet>
  )
  vi.mocked(useNutritionTargets).mockReturnValue(
    mockQuery({ data: EMPTY_TARGETS_UI }) as unknown as ReturnType<typeof useNutritionTargets>
  )
  vi.mocked(useSetNutritionTargets).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useSetNutritionTargets>
  )
  vi.mocked(useNutritionLogsBarrel).mockReturnValue(
    mockQuery({ data: [], ...overrides.nutritionLogs }) as unknown as ReturnType<
      typeof useNutritionLogsBarrel
    >
  )
  const createMutation = mockMutation(overrides.createLog)
  vi.mocked(useCreateNutritionLogBarrel).mockReturnValue(
    createMutation as unknown as ReturnType<typeof useCreateNutritionLogBarrel>
  )
  vi.mocked(useDeleteNutritionLogBarrel).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useDeleteNutritionLogBarrel>
  )
  return { createMutation }
}

describe('NutritionTab — koçun yazma denemesi arayüzde SUNULMAZ', () => {
  it('userRole="coach" iken "Öğün Ekle" formu HİÇ render edilmez, salt-okunur geçmiş görünür', () => {
    mockNutritionHooks({ nutritionLogs: { data: [log()] } })

    render(
      createElement(NutritionTab, {
        targetId: 'client-1',
        currentUserId: 'coach-1',
        userRole: 'coach',
        selectedClientIds: ['client-1'],
        onDownloadImage: vi.fn(),
      })
    )

    // Koç hedefi GÖREBİLİR/DÜZENLEYEBİLİR (bu bir CRUD yüzeyi, §4.2 "koç: günlük
    // makro hedefi CRUD") — ama öğün EKLEME formu koç için hiç render edilmez.
    expect(screen.getByText('Günlük Makro Hedefi')).toBeInTheDocument()
    expect(screen.queryByText('Öğün Ekle')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Öğünü Ekle' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('AÇIKLAMA')).not.toBeInTheDocument()

    // Salt-okunur geçmiş görünür, ama silme eylemi SUNULMAZ.
    expect(screen.getByText('Danışanın Öğün Geçmişi (salt okunur)')).toBeInTheDocument()
    expect(screen.getByText('Izgara tavuk + pilav')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /kaydını sil/ })).not.toBeInTheDocument()
  })

  it('userRole="client" iken "Öğün Ekle" formu render edilir, hedef editörü GÖRÜNMEZ', () => {
    mockNutritionHooks()

    render(
      createElement(NutritionTab, {
        targetId: 'client-1',
        currentUserId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
        onDownloadImage: vi.fn(),
      })
    )

    expect(screen.getByText('Öğün Ekle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Öğünü Ekle' })).toBeInTheDocument()
    expect(screen.queryByText('Günlük Makro Hedefi')).not.toBeInTheDocument()
    expect(screen.queryByText('Danışanın Öğün Geçmişi (salt okunur)')).not.toBeInTheDocument()
  })

  it('danışan "Öğünü Ekle"ye bastığında kendi client_id\'siyle create mutasyonunu çağırır', async () => {
    const { createMutation } = mockNutritionHooks()
    const user = userEvent.setup()

    render(
      createElement(NutritionTab, {
        targetId: 'client-1',
        currentUserId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
        onDownloadImage: vi.fn(),
      })
    )

    await user.type(screen.getByLabelText('AÇIKLAMA'), 'Kahvaltı: yulaf')
    await user.type(screen.getByLabelText('KALORİ'), '350')
    await user.click(screen.getByRole('button', { name: 'Öğünü Ekle' }))

    // `log_date` bileşen tarafından AÇIKÇA eklenir (kullanıcının YEREL günü) —
    // DB varsayılanına bırakılmaz.
    expect(createMutation.mutate).toHaveBeenCalledWith(
      {
        clientId: 'client-1',
        description: 'Kahvaltı: yulaf',
        kcal: 350,
        protein_g: null,
        carb_g: null,
        fat_g: null,
        log_date: todayIsoDate(),
      },
      expect.anything()
    )
  })

  it('koç birden fazla danışan seçtiğinde hedef/öğün panelleri yerine tek danışan uyarısı gösterilir', () => {
    mockNutritionHooks()

    render(
      createElement(NutritionTab, {
        targetId: 'client-1',
        currentUserId: 'coach-1',
        userRole: 'coach',
        selectedClientIds: ['client-1', 'client-2'],
        onDownloadImage: vi.fn(),
      })
    )

    expect(screen.queryByText('Günlük Makro Hedefi')).not.toBeInTheDocument()
    expect(
      screen.getByText('Makro hedefi ve öğün geçmişi için tek danışan seçili bırakın.')
    ).toBeInTheDocument()
  })
})
