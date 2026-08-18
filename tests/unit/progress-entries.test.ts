// İlerleme ölçümleri (`progress_entries`) — Faz 4c (§6).
//
// KAPSAM:
//   A) AC-4.1 — yazma yolu `upsert(..., { onConflict: 'client_id,entry_date' })`
//      olmak ZORUNDA; aynı güne ikinci giriş DUPLICATE SATIR ÜRETMEZ, mevcut
//      satırı GÜNCELLER. Mock, gerçek `ON CONFLICT` semantiğini (arbiter
//      kolonlarla eşleşen satırı bul, varsa güncelle) taklit eder — böylece
//      test yalnızca "doğru çağrı yapıldı"yı değil SONUCU da kanıtlar.
//   B) Girdi doğrulama — "sadece not" girişi ve aralık dışı değerler VERİTABANINA
//      HİÇ GİTMEDEN reddedilir (`progress_entries_not_empty_chk` = 23514 ve
//      aralık CHECK'lerinin arayüz karşılığı).
//   C) Hata sarmalaması — `wrapSupabaseError(error, { table, op })` sözleşmesi
//      korunur: merkezî 42501 yakalama (src/lib/query/queryClient.ts) buna bağlı.
//   D) Arayüz — danışan "sadece not" gönderemez (buton mutasyonu ÇAĞIRMAZ) ve
//      koç görünümünde giriş formu HİÇ render edilmez (§6 salt-okunur).

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` fabrikaları hoist edilir; mock'lar bu yüzden `vi.hoisted` ile
// tanımlanır (bkz. tests/unit/nutrition-logs.test.ts — aynı desen).
const { fromMock, upsertMock, insertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
  insertMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Fotoğraf bileşeni (Faz 4d) kendi verisini kendi çeker; bu dosyanın konusu
// DEĞİL — StatsTab render'ında yerinden edilir.
vi.mock('@/components/progress/ProgressPhotos', () => ({
  ProgressPhotos: () => null,
}))

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return { ...actual, useProgressTrend: vi.fn(), useUpsertProgressEntry: vi.fn() }
})

import { toast } from 'sonner'

import StatsTab from '@/components/tabs/StatsTab'
import { useProgressTrend, useUpsertProgressEntry } from '@/hooks'
import {
  buildTrendSeries,
  hasAnyMeasurement,
  useUpsertProgressEntry as useUpsertProgressEntryDirect,
  validateProgressEntry,
  type ProgressEntryValues,
} from '@/hooks/useProgressEntries'
import { SupabaseQueryError } from '@/lib/query/supabase-error'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

interface FakeRow {
  id: string
  client_id: string
  entry_date: string
  [column: string]: unknown
}

/**
 * `progress_entries` tablosunu GERÇEK `ON CONFLICT` semantiğiyle taklit eder:
 * `onConflict` metnindeki kolonlar ARBITER'dır; eşleşen satır varsa GÜNCELLENİR,
 * yoksa yeni satır eklenir. Böylece AC-4.1 "duplicate satır oluşmaz" iddiası
 * çağrı imzasıyla değil SONUÇLA doğrulanır.
 */
function wireProgressEntriesTable(): { rows: FakeRow[] } {
  const rows: FakeRow[] = []

  fromMock.mockImplementation((table: string) => {
    if (table !== 'progress_entries') throw new Error(`beklenmeyen tablo: ${table}`)
    return {
      // `insert` BİLEREK duruyor: çağrılırsa test patlar (AC-4.1'in yanlış yolu).
      insert: (...args: unknown[]) => {
        insertMock(...args)
        throw new Error('progress_entries için insert KULLANILMAMALI — upsert bekleniyor')
      },
      upsert: (row: Record<string, unknown>, options?: { onConflict?: string }) => {
        upsertMock(row, options)
        return {
          select: () => ({
            single: () => {
              const arbiter = (options?.onConflict ?? 'id').split(',').map((c) => c.trim())
              const index = rows.findIndex((existing) =>
                arbiter.every((column) => existing[column] === row[column])
              )
              if (index >= 0) {
                const updated = { ...(rows[index] as FakeRow), ...row } as FakeRow
                rows[index] = updated
                return Promise.resolve({ data: updated, error: null })
              }
              const inserted = { id: `row-${rows.length + 1}`, ...row } as FakeRow
              rows.push(inserted)
              return Promise.resolve({ data: inserted, error: null })
            },
          }),
        }
      },
    }
  })

  return { rows }
}

/** Tabloyu HATA döndürecek şekilde bağlar (RLS reddi / CHECK ihlali senaryoları). */
function wireProgressEntriesError(error: { message: string; code: string }): void {
  fromMock.mockImplementation(() => ({
    upsert: (row: Record<string, unknown>, options?: { onConflict?: string }) => {
      upsertMock(row, options)
      return { select: () => ({ single: () => Promise.resolve({ data: null, error }) }) }
    },
  }))
}

const VALUES: ProgressEntryValues = {
  weight_kg: 82.4,
  waist_cm: null,
  chest_cm: null,
  arm_cm: null,
  thigh_cm: null,
  hip_cm: null,
  notes: null,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// A) AC-4.1 — upsert + onConflict
// ---------------------------------------------------------------------------

describe('useUpsertProgressEntry — AC-4.1', () => {
  it("upsert'i `onConflict: 'client_id,entry_date'` ile çağırır (arbiter kısıt yoksa 42P10)", async () => {
    wireProgressEntriesTable()

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(upsertMock).toHaveBeenCalledWith(expect.anything(), {
      onConflict: 'client_id,entry_date',
    })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('BÜTÜN ölçüm kolonlarını her zaman gönderir (boş alan null gider, eski değer sessizce kalmaz)', async () => {
    wireProgressEntriesTable()

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(upsertMock).toHaveBeenCalledWith(
      {
        client_id: 'client-1',
        entry_date: '2026-08-17',
        weight_kg: 82.4,
        waist_cm: null,
        chest_cm: null,
        arm_cm: null,
        thigh_cm: null,
        hip_cm: null,
        notes: null,
      },
      expect.anything()
    )
  })

  it('AYNI güne ikinci giriş DUPLICATE SATIR ÜRETMEZ — mevcut satırı GÜNCELLER', async () => {
    const { rows } = wireProgressEntriesTable()

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rows).toHaveLength(1)

    result.current.mutate({
      clientId: 'client-1',
      entryDate: '2026-08-17',
      ...VALUES,
      weight_kg: 81.6,
    })
    await waitFor(() => expect(rows[0]?.weight_kg).toBe(81.6))

    // TEK satır kaldı ve id DEĞİŞMEDİ: yeni satır açılmadı, eskisi güncellendi.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('row-1')
    expect(rows[0]?.entry_date).toBe('2026-08-17')
  })

  it('FARKLI güne giriş yeni satır açar (tekillik yalnızca aynı gün içindir)', async () => {
    const { rows } = wireProgressEntriesTable()

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })

    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })
    await waitFor(() => expect(rows).toHaveLength(1))

    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-18', ...VALUES })
    await waitFor(() => expect(rows).toHaveLength(2))
  })

  it('güncellenen satır aynı gün olarak KALIR — trend serisi tek nokta gösterir', async () => {
    const { rows } = wireProgressEntriesTable()

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })
    await waitFor(() => expect(rows).toHaveLength(1))
    result.current.mutate({
      clientId: 'client-1',
      entryDate: '2026-08-17',
      ...VALUES,
      weight_kg: 80,
    })
    await waitFor(() => expect(rows[0]?.weight_kg).toBe(80))

    const trend = buildTrendSeries(rows as unknown as Parameters<typeof buildTrendSeries>[0], {
      rangeDays: 7,
      today: '2026-08-17',
    })
    expect(trend.measuredDays).toBe(1)
    expect(trend.points.filter((point) => point.weight_kg !== null)).toEqual([
      expect.objectContaining({ date: '2026-08-17', weight_kg: 80 }),
    ])
  })
})

// ---------------------------------------------------------------------------
// B) Girdi doğrulama — 23514 arayüzde önlenir
// ---------------------------------------------------------------------------

describe('validateProgressEntry / hasAnyMeasurement', () => {
  const EMPTY: ProgressEntryValues = {
    weight_kg: null,
    waist_cm: null,
    chest_cm: null,
    arm_cm: null,
    thigh_cm: null,
    hip_cm: null,
  }

  it('"sadece not" girişini reddeder (progress_entries_not_empty_chk = 23514)', () => {
    expect(hasAnyMeasurement({ ...EMPTY, notes: 'sadece not' })).toBe(false)
    expect(validateProgressEntry({ ...EMPTY, notes: 'sadece not' })).toBe(
      'En az bir ölçüm girin — yalnızca not kaydedilemez.'
    )
  })

  it('tek bir ölçüm yeterlidir', () => {
    expect(hasAnyMeasurement({ ...EMPTY, waist_cm: 80 })).toBe(true)
    expect(validateProgressEntry({ ...EMPTY, waist_cm: 80 })).toBeNull()
  })

  it('aralık dışı değerleri tablodaki CHECK sınırlarıyla AYNI eşikte reddeder', () => {
    expect(validateProgressEntry({ ...EMPTY, weight_kg: 0 })).toContain('Kilo')
    expect(validateProgressEntry({ ...EMPTY, weight_kg: 500 })).toContain('Kilo')
    expect(validateProgressEntry({ ...EMPTY, weight_kg: 499.9 })).toBeNull()
    expect(validateProgressEntry({ ...EMPTY, waist_cm: 300 })).toContain('Bel')
    expect(validateProgressEntry({ ...EMPTY, waist_cm: -5 })).toContain('Bel')
  })

  it('2000 karakteri aşan notu reddeder (progress_entries_notes_chk)', () => {
    expect(validateProgressEntry({ ...EMPTY, weight_kg: 80, notes: 'a'.repeat(2001) })).toBe(
      'Not en fazla 2000 karakter olabilir.'
    )
  })
})

// ---------------------------------------------------------------------------
// C) Hata sarmalaması
// ---------------------------------------------------------------------------

describe('useUpsertProgressEntry — hata yolu', () => {
  it('RLS reddini (42501) kodu KORUYARAK sarmalar (merkezî yakalama buna bağlı)', async () => {
    wireProgressEntriesError({
      message: 'new row violates row-level security policy',
      code: '42501',
    })

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({ clientId: 'baskasinin-id-si', entryDate: '2026-08-17', ...VALUES })

    await waitFor(() => expect(result.current.isError).toBe(true))
    const error = result.current.error
    expect(error).toBeInstanceOf(SupabaseQueryError)
    expect((error as SupabaseQueryError).code).toBe('42501')
    expect((error as SupabaseQueryError).table).toBe('progress_entries')
    expect((error as SupabaseQueryError).op).toBe('upsert')
    expect(toast.error).toHaveBeenCalled()
  })

  it('CHECK ihlali (23514) sunucudan gelirse de sarmalanır — mesaj kaybolmaz', async () => {
    wireProgressEntriesError({
      message: 'violates check constraint "progress_entries_not_empty_chk"',
      code: '23514',
    })

    const { result } = renderHook(() => useUpsertProgressEntryDirect(), {
      wrapper: createWrapper(),
    })
    result.current.mutate({ clientId: 'client-1', entryDate: '2026-08-17', ...VALUES })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as SupabaseQueryError).code).toBe('23514')
  })
})

// ---------------------------------------------------------------------------
// D) Arayüz — "sadece not" gönderilemez, koç formu görmez
// ---------------------------------------------------------------------------

function mockTrendQuery(measuredDays = 0) {
  return {
    data: {
      start: '2026-08-11',
      end: '2026-08-17',
      rangeDays: 7 as const,
      points: [],
      measuredDays,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }
}

describe('StatsTab — giriş yüzeyi', () => {
  it('yalnızca not yazılıp kaydedilmeye çalışılırsa mutasyon ÇAĞRILMAZ, kullanıcıya mesaj gösterilir', async () => {
    const mutate = vi.fn()
    vi.mocked(useProgressTrend).mockReturnValue(
      mockTrendQuery() as unknown as ReturnType<typeof useProgressTrend>
    )
    vi.mocked(useUpsertProgressEntry).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertProgressEntry>)

    const user = userEvent.setup()
    render(
      createElement(StatsTab, {
        targetId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
      })
    )

    await user.type(screen.getByLabelText('Not (opsiyonel)'), 'bugün tartılmadım')
    await user.click(screen.getByRole('button', { name: 'Ölçümü Kaydet' }))

    expect(mutate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('En az bir ölçüm girin — yalnızca not kaydedilemez.')
  })

  it('en az bir ölçüm girilirse mutasyon seçili tarih ve TÜM kolonlarla çağrılır', async () => {
    const mutate = vi.fn()
    vi.mocked(useProgressTrend).mockReturnValue(
      mockTrendQuery() as unknown as ReturnType<typeof useProgressTrend>
    )
    vi.mocked(useUpsertProgressEntry).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertProgressEntry>)

    const user = userEvent.setup()
    render(
      createElement(StatsTab, {
        targetId: 'client-1',
        userRole: 'client',
        selectedClientIds: [],
      })
    )

    await user.type(screen.getByLabelText('Kilo (kg)'), '82.4')
    await user.click(screen.getByRole('button', { name: 'Ölçümü Kaydet' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        weight_kg: 82.4,
        waist_cm: null,
        notes: null,
      }),
      expect.anything()
    )
  })

  it('KOÇ görünümünde giriş formu HİÇ render edilmez (§6 salt-okunur)', () => {
    vi.mocked(useProgressTrend).mockReturnValue(
      mockTrendQuery(3) as unknown as ReturnType<typeof useProgressTrend>
    )
    vi.mocked(useUpsertProgressEntry).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useUpsertProgressEntry>)

    render(
      createElement(StatsTab, {
        targetId: 'client-1',
        userRole: 'coach',
        selectedClientIds: ['client-1'],
      })
    )

    expect(screen.queryByText('Ölçüm Girişi')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ölçümü Kaydet' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Kilo (kg)')).not.toBeInTheDocument()
    expect(screen.getByText('Danışanın ölçüm geçmişi (salt okunur)')).toBeInTheDocument()
  })
})
