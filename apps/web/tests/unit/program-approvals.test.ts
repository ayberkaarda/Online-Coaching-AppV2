// `useProgramApprovals.ts` — koç onay yolunun ATOMİKLEŞTİRİLMESİ (borç B-019).
//
// NE ÖLÇÜLÜYOR:
//   A) `useApproveProgram` artık TEK bir `rpc('approve_program', …)` çağrısı yapar.
//      Kritik iddia "bir RPC çağrıldı" değil, **başka hiçbir yazma yapılmadığı**dır:
//      eski akış `save_workout_plan` RPC'si + `program_approvals` UPDATE'i +
//      `notifications` INSERT'i olmak üzere ÜÇ AYRI ağ çağrısıydı ve ikincisi ya da
//      üçüncüsü düştüğünde yarım durum KALICI oluyordu. Bu yüzden testler
//      `supabase.from(...)`'un HİÇ çağrılmadığını da doğrular — birisi "küçük bir
//      ek yazma" diye üçüncü adımı geri koyarsa atomiklik sessizce kaybolurdu.
//   B) Bildirim metni İSTEMCİDE ARTIK YOK: tek sahibi RPC gövdesindeki
//      `c_client_notification` sabitidir (20260819090000 §1). Bu dosyada o metnin
//      GEÇMEDİĞİ de sınanır; geçseydi şablon yine iki yerde yaşardı (AC-05'in
//      `submit_program_for_approval` ile kapatılan kuplajının aynısı).
//   C) `p_plan` sözleşmesi: `planToRpcPayload()` 7 günün HEPSİNİ gönderir
//      (doldurulmayanlar boş string) ve plan dışı anahtarlar SIZMAZ —
//      `save_workout_plan()` bilinmeyen gün anahtarında 22023 ile patlar.
//   D) Hata yolu: RPC hatası `SupabaseQueryError` olarak sarılır (`.code`
//      korunur -> merkezî 42501 kancası çalışır) ve `notify.error` metni değişmez.
//
// SUNUCU TARAFI KANITI BURADA DEĞİL: atomikliğin kendisi SQL'de ölçülür
// (supabase/tests/rls.test.sql senaryo 114–118). Burada ölçülen, istemcinin o
// sözleşmeye UYDUĞUDUR.

import type { ReactNode } from 'react'
import { createElement } from 'react'

import { useApproveProgram, useSubmitProgramForApproval } from '@repo/api-client/hooks'
import { SupabaseClientProvider } from '@repo/api-client/context'
import { NotifierProvider, type Notifier } from '@repo/api-client/notify'
import { queryKeys, queryKeyRoots } from '@repo/api-client/query/keys'
import { SupabaseQueryError } from '@repo/api-client/query/supabase-error'
import { EMPTY_WORKOUT_PLAN, DAY_NAMES, type WorkoutPlan } from '@repo/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { asSupabaseClient } from './test-utils'

const APPROVAL_ID = 'appr-114'
const CLIENT_ID = 'client-a'

const PLAN: WorkoutPlan = {
  ...EMPTY_WORKOUT_PLAN,
  Pazartesi: '1. Squat - 5x5',
  Çarşamba: '1. Bench Press - 4x8',
}

const rpc = vi.fn()
const from = vi.fn()

const supabase = asSupabaseClient({ rpc, from })

/**
 * `vi.spyOn(queryClient, 'invalidateQueries')`ın dönüş tipi jenerik olduğu için
 * `ReturnType<typeof vi.spyOn>` ile yazılamaz; casusu üreten yardımcının dönüş
 * tipini kullanmak tek satırda ve `any` KULLANMADAN çözer.
 */
function spyOnInvalidate(client: QueryClient) {
  return vi.spyOn(client, 'invalidateQueries')
}

let notifier: Notifier
let queryClient: QueryClient
let invalidateSpy: ReturnType<typeof spyOnInvalidate>

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SupabaseClientProvider,
    { client: supabase },
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(NotifierProvider, { notifier }, children)
    )
  )
}

beforeEach(() => {
  notifier = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  invalidateSpy = spyOnInvalidate(queryClient)
  from.mockImplementation((table: string) => {
    throw new Error(`useApproveProgram artik .from() kullanmamali (cagrilan tablo: ${table})`)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useApproveProgram — tek atomik RPC (B-019)', () => {
  it('onayı TEK bir approve_program çağrısına indirir', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('approve_program', {
      p_approval_id: APPROVAL_ID,
      p_client_id: CLIENT_ID,
      p_plan: expect.any(Object),
    })
  })

  it('ESKİ ÜÇ ADIM GERİ GELMEZ: save_workout_plan RPC’si ve hiçbir tablo yazması yapılmaz', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // `from()` mock'u çağrılırsa FIRLATIR; mutasyon da hata verirdi. Yine de
    // niyeti açıkça yazıyoruz: program_approvals UPDATE'i ve notifications
    // INSERT'i artık SUNUCUDA, aynı transaksiyonda yapılıyor.
    expect(from).not.toHaveBeenCalled()
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['approve_program'])
    expect(rpc).not.toHaveBeenCalledWith('save_workout_plan', expect.anything())
  })

  it('p_plan 7 günün HEPSİNİ taşır ve plan dışı anahtar SIZMAZ', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const dirtyPlan = { ...PLAN, Bilinmeyen: 'sızmamalı' } as unknown as WorkoutPlan

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: dirtyPlan })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const payload = rpc.mock.calls[0]?.[1]?.p_plan as Record<string, string>
    expect(Object.keys(payload).sort()).toEqual([...DAY_NAMES].sort())
    expect(payload).not.toHaveProperty('Bilinmeyen')
    expect(payload.Pazartesi).toBe('1. Squat - 5x5')
    expect(payload.Çarşamba).toBe('1. Bench Press - 4x8')
    expect(payload.Salı).toBe('')
  })

  it('bildirim metni İSTEMCİDEN gitmiyor — payload’da hiçbir mesaj alanı yok', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(args).sort()).toEqual(['p_approval_id', 'p_client_id', 'p_plan'])
    expect(JSON.stringify(args)).not.toContain('onayladı')
  })

  it('başarıda üç önbellek anahtarını tazeler ve başarı metnini portundan geçirir', async () => {
    rpc.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.programApprovals(CLIENT_ID),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.workoutPlan(CLIENT_ID) })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeyRoots.notifications })
    expect(notifier.success).toHaveBeenCalledWith(
      'Program onaylandı ve danışanın profiline işlendi.'
    )
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('RPC hatasını .code’u KORUYARAK sarar ve hata metnini değiştirmez', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: 'approve_program: onay kaydı güncellenemedi (id=appr-114).',
        code: '42501',
      },
    })

    const { result } = renderHook(() => useApproveProgram(), { wrapper })
    result.current.mutate({ approvalId: APPROVAL_ID, clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error
    expect(error).toBeInstanceOf(SupabaseQueryError)
    expect((error as SupabaseQueryError).code).toBe('42501')
    expect((error as SupabaseQueryError).table).toBe('approve_program')
    expect((error as SupabaseQueryError).op).toBe('rpc')
    expect(notifier.error).toHaveBeenCalledWith(
      expect.stringContaining('Program onaylanamadı: approve_program: onay kaydı güncellenemedi')
    )
    // Hata yolunda önbellek TAZELENMEZ: sunucuda hiçbir şey değişmedi.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

describe('useSubmitProgramForApproval — gönderim yolu değişmedi', () => {
  it('tek bir submit_program_for_approval çağrısı yapar (regresyon koruması)', async () => {
    rpc.mockResolvedValue({ data: { id: 'appr-1', client_id: CLIENT_ID }, error: null })

    const { result } = renderHook(() => useSubmitProgramForApproval(), { wrapper })
    result.current.mutate({ clientId: CLIENT_ID, plan: PLAN })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[0]).toBe('submit_program_for_approval')
    expect(notifier.success).toHaveBeenCalledWith('Program taslağı koçuna gönderildi.')
  })
})
