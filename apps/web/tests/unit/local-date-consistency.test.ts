// YEREL TARİH / UTC UYUŞMAZLIĞI — gece yarısı penceresi regresyonu.
//
// ###########################################################################
// # ÖLÇÜLMÜŞ HATA (bu dosyanın var olma sebebi)                              #
// #                                                                          #
// # Dört tarih kolonunun da şemada `default current_date` değeri vardır ve   #
// # o varsayılan UTC'dir:                                                     #
// #     daily_logs.log_date, nutrition_logs.log_date,                        #
// #     progress_entries.entry_date, progress_photos.taken_on                #
// # Okuma tarafı ise `todayIsoDate()` ile TARAYICININ YEREL gününü filtreler.#
// # Yazma yollarında tarih alanı OPSİYONEL olduğu için çağıran onu           #
// # göndermediğinde satır UTC gününü alıyordu.                                #
// #                                                                          #
// # Türkiye UTC+3: her gün yerel 00:00–03:00 arasında iki tarih AYRIŞIR.     #
// # Danışan gece 01:00'de öğün ekler -> satır "dün"e yazılır -> dashboard    #
// # "bugün"ü filtreler -> eklediği öğün HİÇ GÖRÜNMEZ, toplam sıfır kalır.    #
// #                                                                          #
// # DÜZELTME: istemci HER ZAMAN yerel tarihi AÇIKÇA gönderir; tarih alanı    #
// # tiplerde ZORUNLUDUR (çağıran unutamaz, derleyici uyarır). DB varsayılanı #
// # yalnızca bir güvenlik ağı olarak durur, birincil yol DEĞİLDİR.           #
// ###########################################################################
//
// KURULUM: saat dilimi `process.env.TZ` ile, an ise `vi.setSystemTime` ile
// sabitlenir. Yalnızca `Date` sahtelenir (`toFake: ['Date']`) — `setTimeout`
// GERÇEK kalır, aksi hâlde React Testing Library'nin `waitFor`u ve
// `userEvent` kilitlenirdi.
//
// `process.env.TZ` süreç genelinde etkilidir; Vitest 2'nin varsayılan havuzu
// `forks` olduğu için her test DOSYASI ayrı bir çocuk süreçte koşar ve bu
// değişiklik başka dosyalara SIZMAZ. Yine de `afterEach` içinde eski değere
// döndürülür.

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.5 commit 5 (ADR-0024): Supabase istemcisi artık modül singleton'ı DEĞİL — hook'lar
// onu `<SupabaseClientProvider>`'dan alıyor. Bu yüzden `vi.mock('@/lib/supabase/client', ...)`
// KALKTI; sahte istemci sıradan bir nesne olarak kurulup sarmalayıcıyla enjekte ediliyor.
const fromMock = vi.fn()
const uploadMock = vi.fn()

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// `importOriginal` spread'i ZORUNLU: `apps/web/src/lib/logger.ts` (ErrorBoundary üzerinden
// bileşen ağacına giriyor) bu paketten `createConsoleLogger`/`maskForConsole`/`REDACT_PATHS`
// import ediyor — yalnızca `logger` döndüren bir mock o modülü yüklenemez hâle getirirdi.
vi.mock('@repo/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// Bileşen katmanı ("çağıran tarihi AÇIKÇA veriyor mu?") için barrel mock'lanır;
// hook katmanı ("hook tarihi payload'a koyuyor mu?") barrel'i ATLAYARAK
// doğrudan modülden import edilir — iki ayrı modül specifier'ı, iki ayrı kayıt
// (bkz. tests/unit/nutrition-logs.test.ts, aynı desen).
vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
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
    useDailyLogs: vi.fn(),
    useCreateDailyLog: vi.fn(),
    useProgressTrend: vi.fn(),
    useUpsertProgressEntry: vi.fn(),
    useProgressPhotos: vi.fn(),
    useUploadProgressPhoto: vi.fn(),
    useDeleteProgressPhoto: vi.fn(),
  }
})

import { ProgressPhotos } from '@/components/progress/ProgressPhotos'
import DailyLogTab from '@/components/tabs/DailyLogTab'
import NutritionTab from '@/components/tabs/NutritionTab'
import StatsTab from '@/components/tabs/StatsTab'
import {
  useCreateDailyLog,
  useCreateNutritionLog,
  useDailyLogs,
  useDeleteNutritionLog,
  useDeleteProgressPhoto,
  useFoods,
  useGenerateDiet,
  useNutritionLogs,
  useNutritionPlan,
  useNutritionTargets,
  useProgressPhotos,
  useProgressTrend,
  useSaveNutritionPlan,
  useSetNutritionTargets,
  useUploadProgressPhoto,
  useUpsertProgressEntry,
} from '@repo/api-client'
import { useCreateDailyLog as useCreateDailyLogDirect } from '@repo/api-client/hooks/useDailyLogs'
import {
  sumNutritionLogsForDate,
  useCreateNutritionLog as useCreateNutritionLogDirect,
  type NutritionLog,
} from '@repo/api-client/hooks/useNutritionLogs'
import { useUpsertProgressEntry as useUpsertProgressEntryDirect } from '@repo/api-client/hooks/useProgressEntries'
import { useUploadProgressPhoto as useUploadProgressPhotoDirect } from '@repo/api-client/hooks/useProgressPhotos'
import { SupabaseClientProvider } from '@repo/api-client/context'

import { asSupabaseClient } from './test-utils'

const supabase = asSupabaseClient({
  from: fromMock,
  storage: { from: vi.fn(() => ({ upload: uploadMock })) },
})
import { todayIsoDate } from '@repo/api-client/date'

// ---------------------------------------------------------------------------
// Gece yarısı penceresi — hatanın BİREBİR senaryosu
// ---------------------------------------------------------------------------

/** UTC 22:30 = Europe/Istanbul (UTC+3) 01:30 — yani ERTESİ günün gecesi. */
const MIDNIGHT_WINDOW_INSTANT = new Date('2026-08-17T22:30:00.000Z')
/** Kullanıcının gördüğü gün (yerel takvim). Yazma da okuma da BUNU kullanmalı. */
const LOCAL_DAY = '2026-08-18'
/** Veritabanının `current_date` varsayılanının üreteceği gün — HATALI olan. */
const UTC_DAY = '2026-08-17'

const CLIENT_UUID = '22222222-2222-4222-8222-222222222222'

const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(16).fill(0),
])

/** Gerçek magic-byte doğrulamasından (mock’lanmadı) GEÇEN bir dosya. */
function pngFile(): File {
  return new File([PNG_BYTES as unknown as ArrayBuffer], 'photo.png', { type: 'image/png' })
}

const ORIGINAL_TZ = process.env.TZ

/** Testi UTC+3'te, yerel saat 01:30'a (gece yarısı penceresi) sabitler. */
function enterMidnightWindow(timeZone = 'Europe/Istanbul'): void {
  process.env.TZ = timeZone
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MIDNIGHT_WINDOW_INSTANT)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = ORIGINAL_TZ
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      SupabaseClientProvider,
      { client: supabase },
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
  }
}

// ---------------------------------------------------------------------------
// 1) `todayIsoDate()` YEREL takvim gününü döner — UTC'yi DEĞİL
// ---------------------------------------------------------------------------

describe('todayIsoDate — yerel gün, UTC değil', () => {
  it('UTC+3 gece 01:30 iken YEREL günü döner (UTC hâlâ ÖNCEKİ gündedir)', () => {
    enterMidnightWindow()

    // Aynı an, iki farklı takvim günü: hatanın tüm sebebi bu.
    expect(new Date().toISOString().slice(0, 10)).toBe(UTC_DAY)
    expect(todayIsoDate()).toBe(LOCAL_DAY)
    expect(todayIsoDate()).not.toBe(UTC_DAY)
  })

  it('saat dilimi UTC’nin GERİSİNDEYSE de yerel günü döner (ters yön)', () => {
    // UTC 22:30 -> New York (UTC-4) 18:30, yani HÂLÂ 17'si. Yerel gün bu kez
    // UTC gününden GERİDE; `toISOString` yine YANLIŞ cevabı verirdi.
    enterMidnightWindow('America/New_York')

    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-17')
    expect(todayIsoDate()).toBe('2026-08-17')

    // 02:30 UTC'de aynı yer hâlâ bir önceki gündedir — asimetri de korunur.
    vi.setSystemTime(new Date('2026-08-18T02:30:00.000Z'))
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-18')
    expect(todayIsoDate()).toBe('2026-08-17')
  })

  it('YYYY-MM-DD biçimindedir (Postgres `date` kolonunun beklediği metin)', () => {
    enterMidnightWindow()
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// 2) BİLEŞENLER (çağıranlar) tarihi AÇIKÇA gönderir — DB varsayılanına düşmez
// ---------------------------------------------------------------------------

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
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...overrides,
  }
}

describe('Yazma yolu 1/4 — NutritionTab -> nutrition_logs.log_date', () => {
  it('gece 01:30’da eklenen öğün YEREL günle gönderilir (UTC günüyle DEĞİL)', async () => {
    enterMidnightWindow()

    vi.mocked(useFoods).mockReturnValue(
      mockQuery({ data: [] }) as unknown as ReturnType<typeof useFoods>
    )
    vi.mocked(useNutritionPlan).mockReturnValue(
      mockQuery() as unknown as ReturnType<typeof useNutritionPlan>
    )
    vi.mocked(useSaveNutritionPlan).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useSaveNutritionPlan>
    )
    vi.mocked(useGenerateDiet).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useGenerateDiet>
    )
    vi.mocked(useNutritionTargets).mockReturnValue(
      mockQuery({
        data: { kcal: 2200, protein_g: null, carb_g: null, fat_g: null },
      }) as unknown as ReturnType<typeof useNutritionTargets>
    )
    vi.mocked(useSetNutritionTargets).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useSetNutritionTargets>
    )
    vi.mocked(useNutritionLogs).mockReturnValue(
      mockQuery({ data: [] }) as unknown as ReturnType<typeof useNutritionLogs>
    )
    const createLog = mockMutation()
    vi.mocked(useCreateNutritionLog).mockReturnValue(
      createLog as unknown as ReturnType<typeof useCreateNutritionLog>
    )
    vi.mocked(useDeleteNutritionLog).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useDeleteNutritionLog>
    )

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

    await user.type(screen.getByLabelText('AÇIKLAMA'), 'Gece atıştırması')
    await user.type(screen.getByLabelText('KALORİ'), '250')
    await user.click(screen.getByRole('button', { name: 'Öğünü Ekle' }))

    expect(createLog.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', log_date: LOCAL_DAY }),
      expect.anything()
    )
    const payload = createLog.mutate.mock.calls[0]?.[0] as { log_date?: string }
    expect(payload.log_date).not.toBe(UTC_DAY)
  })
})

describe('Yazma yolu 2/4 — DailyLogTab -> daily_logs.log_date', () => {
  it('gece 01:30’da gönderilen günlük rapor YEREL günle upsert edilir', async () => {
    enterMidnightWindow()

    vi.mocked(useDailyLogs).mockReturnValue(
      mockQuery({ data: [] }) as unknown as ReturnType<typeof useDailyLogs>
    )
    const createDailyLog = mockMutation()
    vi.mocked(useCreateDailyLog).mockReturnValue(
      createDailyLog as unknown as ReturnType<typeof useCreateDailyLog>
    )

    const user = userEvent.setup()
    render(
      createElement(DailyLogTab, {
        targetId: 'client-1',
        currentUserId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
      })
    )

    await user.type(screen.getByLabelText('SU (Litre)'), '2.5')
    await user.type(screen.getByLabelText('SODYUM (mg)'), '2000')
    await user.type(screen.getByLabelText('Protein (g)'), '150')
    await user.type(screen.getByLabelText('Karbonhidrat (g)'), '200')
    await user.type(screen.getByLabelText('Yağ (g)'), '60')
    await user.click(screen.getByRole('button', { name: 'Antrenörüme Gönder' }))

    await waitFor(() => expect(createDailyLog.mutateAsync).toHaveBeenCalledTimes(1))
    // `(client_id, log_date)` TEKİLDİR: yanlış (UTC) gün gönderilseydi bu rapor
    // DÜNÜN satırını EZERDİ — bu yüzden yalnızca "görünmüyor" değil, VERİ KAYBI.
    expect(createDailyLog.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ log_date: LOCAL_DAY })
    )
  })
})

describe('Yazma yolu 3/4 — StatsTab -> progress_entries.entry_date', () => {
  it('ölçüm tarihi kutusu YEREL günle dolar ve mutasyona o gün gider', async () => {
    enterMidnightWindow()

    vi.mocked(useProgressTrend).mockReturnValue(
      mockQuery({
        data: { start: LOCAL_DAY, end: LOCAL_DAY, rangeDays: 30, points: [], measuredDays: 0 },
      }) as unknown as ReturnType<typeof useProgressTrend>
    )
    const upsert = mockMutation()
    vi.mocked(useUpsertProgressEntry).mockReturnValue(
      upsert as unknown as ReturnType<typeof useUpsertProgressEntry>
    )
    vi.mocked(useProgressPhotos).mockReturnValue(
      mockQuery({ data: [] }) as unknown as ReturnType<typeof useProgressPhotos>
    )
    vi.mocked(useUploadProgressPhoto).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useUploadProgressPhoto>
    )
    vi.mocked(useDeleteProgressPhoto).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useDeleteProgressPhoto>
    )

    const user = userEvent.setup()
    render(
      createElement(StatsTab, {
        targetId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
      })
    )

    // Form varsayılanı (ve `max` sınırı) YEREL gündür: kullanıcı gece 01:30'da
    // "bugün"ü seçtiğinde UTC'nin dünü teklif EDİLMEZ.
    const dateInput = screen.getByLabelText('Ölçüm Tarihi') as HTMLInputElement
    expect(dateInput.value).toBe(LOCAL_DAY)
    expect(dateInput.max).toBe(LOCAL_DAY)

    await user.type(screen.getByLabelText('Kilo (kg)'), '82.4')
    await user.click(screen.getByRole('button', { name: 'Ölçümü Kaydet' }))

    expect(upsert.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-1', entryDate: LOCAL_DAY }),
      expect.anything()
    )
  })
})

describe('Yazma yolu 4/4 — ProgressPhotos -> progress_photos.taken_on', () => {
  it('yüklenen fotoğraf YEREL günle etiketlenir (galeri "dün" göstermez)', async () => {
    enterMidnightWindow()

    vi.mocked(useProgressPhotos).mockReturnValue(
      mockQuery({ data: [] }) as unknown as ReturnType<typeof useProgressPhotos>
    )
    const upload = mockMutation()
    vi.mocked(useUploadProgressPhoto).mockReturnValue(
      upload as unknown as ReturnType<typeof useUploadProgressPhoto>
    )
    vi.mocked(useDeleteProgressPhoto).mockReturnValue(
      mockMutation() as unknown as ReturnType<typeof useDeleteProgressPhoto>
    )

    const user = userEvent.setup()
    render(createElement(ProgressPhotos, { clientId: CLIENT_UUID, readOnly: false }))

    // Dosya doğrulaması ASENKRONDUR (magic-byte okur); kabul edilene kadar
    // "Fotoğrafı Yükle" boş state üzerinde çalışır. Bu yüzden tıklama
    // `waitFor` içinde tekrarlanır — doğrulama biter bitmez mutasyon çağrılır.
    await user.upload(screen.getByLabelText('FOTOĞRAF'), pngFile())
    const uploadButton = screen.getByRole('button', { name: /Fotoğrafı Yükle/ })
    await waitFor(async () => {
      await user.click(uploadButton)
      expect(upload.mutateAsync).toHaveBeenCalled()
    })

    expect(upload.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CLIENT_UUID, takenOn: LOCAL_DAY })
    )
  })
})

// ---------------------------------------------------------------------------
// 3) HOOK'LAR tarihi payload'a KOŞULSUZ koyar (alan atlanamaz)
// ---------------------------------------------------------------------------

/** `insert`/`upsert` payload'ını yakalayan tek tablo mock'u. */
function wireCapture(table: string): { payloads: Record<string, unknown>[] } {
  const payloads: Record<string, unknown>[] = []
  const respond = (row: Record<string, unknown>) => ({
    select: () => ({
      single: () => Promise.resolve({ data: { id: 'row-1', ...row }, error: null }),
    }),
  })

  fromMock.mockImplementation((requested: string) => {
    if (requested !== table) throw new Error(`beklenmeyen tablo: ${requested}`)
    return {
      insert: (row: Record<string, unknown>) => {
        payloads.push(row)
        return respond(row)
      },
      upsert: (row: Record<string, unknown>) => {
        payloads.push(row)
        return respond(row)
      },
    }
  })

  return { payloads }
}

describe('Hook katmanı — dört yazma yolu da tarihi PAYLOAD’a koyar', () => {
  it('useCreateNutritionLog -> insert payload’unda log_date VARDIR', async () => {
    enterMidnightWindow()
    const { payloads } = wireCapture('nutrition_logs')

    const { result } = renderHook(() => useCreateNutritionLogDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({
      clientId: CLIENT_UUID,
      description: 'Gece atıştırması',
      kcal: 250,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      log_date: todayIsoDate(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(payloads[0]).toHaveProperty('log_date', LOCAL_DAY)
  })

  it('useCreateDailyLog -> upsert payload’unda log_date VARDIR', async () => {
    enterMidnightWindow()
    const { payloads } = wireCapture('daily_logs')

    const { result } = renderHook(() => useCreateDailyLogDirect(), { wrapper: createWrapper() })
    result.current.mutate({
      clientId: CLIENT_UUID,
      water_lt: 2.5,
      sodium_mg: 2000,
      macros: { protein: 150, carb: 200, fat: 60 },
      log_date: todayIsoDate(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(payloads[0]).toHaveProperty('log_date', LOCAL_DAY)
  })

  it('useUpsertProgressEntry -> upsert payload’unda entry_date VARDIR', async () => {
    enterMidnightWindow()
    const { payloads } = wireCapture('progress_entries')

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({
      clientId: CLIENT_UUID,
      entryDate: todayIsoDate(),
      weight_kg: 82.4,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
      notes: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(payloads[0]).toHaveProperty('entry_date', LOCAL_DAY)
  })

  it('useUploadProgressPhoto -> insert payload’unda taken_on VARDIR', async () => {
    enterMidnightWindow()
    uploadMock.mockResolvedValue({ error: null })
    const { payloads } = wireCapture('progress_photos')

    const { result } = renderHook(() => useUploadProgressPhotoDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({
      clientId: CLIENT_UUID,
      angle: 'front',
      file: pngFile(),
      takenOn: todayIsoDate(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(payloads[0]).toHaveProperty('taken_on', LOCAL_DAY)
  })
})

// ---------------------------------------------------------------------------
// 4) YAZ-OKU TURU — hatanın birebir senaryosu
// ---------------------------------------------------------------------------

const baseLog = (overrides: Partial<NutritionLog>): NutritionLog => ({
  id: 'log-1',
  client_id: CLIENT_UUID,
  log_date: LOCAL_DAY,
  description: 'Gece atıştırması',
  kcal: 250,
  protein_g: null,
  carb_g: null,
  fat_g: null,
  created_at: MIDNIGHT_WINDOW_INSTANT.toISOString(),
  updated_at: MIDNIGHT_WINDOW_INSTANT.toISOString(),
  ...overrides,
})

describe('Yaz-oku turu — gece 01:30’da eklenen öğün AYNI GÜN toplamında görünür', () => {
  it('yazılan log_date, okuma filtresinin kullandığı günle BİREBİR AYNIDIR', async () => {
    enterMidnightWindow()
    const { payloads } = wireCapture('nutrition_logs')

    // YAZMA: bileşenin yaptığının aynısı — tarih AÇIKÇA verilir.
    const { result } = renderHook(() => useCreateNutritionLogDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({
      clientId: CLIENT_UUID,
      description: 'Gece atıştırması',
      kcal: 250,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      log_date: todayIsoDate(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const writtenDate = payloads[0]?.['log_date'] as string
    const storedRow = baseLog({ log_date: writtenDate })

    // OKUMA: dashboard'ın yaptığının aynısı — YEREL günle filtrelenir.
    const totals = sumNutritionLogsForDate([storedRow], todayIsoDate())
    expect(writtenDate).toBe(todayIsoDate())
    expect(totals.kcal).toBe(250)
  })

  it('REGRESYON: DB varsayılanına (UTC günü) düşülseydi toplam 0 kalırdı', () => {
    enterMidnightWindow()

    // Hatanın ta kendisi: satır UTC gününe yazılmış, dashboard yerel günü
    // filtreliyor -> kullanıcı eklediği öğünü GÖREMİYOR. Bu iddia, düzeltmenin
    // neyi engellediğini kilitler; `log_date` alanı yeniden opsiyonel yapılırsa
    // (ve bir çağıran onu atlarsa) gerçek davranış TAM OLARAK budur.
    const rowWrittenByDbDefault = baseLog({ log_date: UTC_DAY })

    expect(sumNutritionLogsForDate([rowWrittenByDbDefault], todayIsoDate()).kcal).toBe(0)
    expect(sumNutritionLogsForDate([baseLog({ log_date: LOCAL_DAY })], todayIsoDate()).kcal).toBe(
      250
    )
  })
})
