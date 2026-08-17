// Faz 2e — koç form check kuyruğu (src/hooks/useFormChecks.ts: usePendingFormChecks,
// useReviewFormCheck) + danışan gönderim sözleşmesi (useSubmitFormCheck).
//
// Üç senaryo (bkz. görev talimatı):
//   1) Kuyruk yalnızca `status = 'pending'` gösterir — sorgu doğru filtreyle atılır.
//   2) Koç geri bildirimi `form_checks`'i `reviewed`'a çevirir; `reviewed_at`/
//      `reviewed_by` İSTEMCİDEN GÖNDERİLMEZ (yalnızca `status`/`coach_feedback`).
//   3) Danışanın gönderimi (`useSubmitFormCheck`) inceleme alanlarını
//      (`status`/`coach_feedback`/`reviewed_at`/`reviewed_by`) HİÇ GÖNDERMEZ —
//      gerçek trigger (`form_checks_guard_review`, 42501) yalnızca canlı DB'de
//      test edilebilir (bkz. `supabase/tests/rls.test.sql`); burada doğrulanan,
//      istemcinin bu alanları hiç DENEMEDİĞİdir.

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.mock` fabrikaları dosyanın en üstüne hoist edilir; mock'lar bu yüzden
// `vi.hoisted` ile tanımlanmalı, aksi hâlde "cannot access before initialization".
const { fromMock, rpcMock, uploadMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  uploadMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    storage: {
      from: vi.fn(() => ({ upload: uploadMock })),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Gerçek magic-byte doğrulaması bu testin kapsamı dışında
// (tests/unit/upload-validation.test.ts zaten kapsıyor); sabit bir sonuç dönülür.
vi.mock('@/lib/upload-validation', () => ({
  assertValidImageFile: vi.fn().mockResolvedValue({ mime: 'image/png', extension: 'png' }),
}))

// `createSignedUrls` gerçek storage isteği atmaz; hangi yolların imzalandığını
// ve dönen adresleri testin kendisi kontrol eder.
const createSignedUrlsMock = vi.fn()
vi.mock('@/lib/storage', () => ({
  FORM_CHECK_BUCKET: 'form-checks-media',
  SIGNED_URL_STALE_TIME_MS: 1_800_000,
  createSignedUrls: (...args: unknown[]) => createSignedUrlsMock(...args),
}))

import { logger } from '@/lib/logger'
import { usePendingFormChecks, useReviewFormCheck, useSubmitFormCheck } from '@/hooks/useFormChecks'

const COACH_ID = 'coach-11111111-1111-4111-8111-111111111111'
const CLIENT_ID = 'client-2222222-2222-4222-8222-222222222222'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  createSignedUrlsMock.mockResolvedValue(new Map())
})

describe('usePendingFormChecks — koç kuyruğu', () => {
  it('yalnızca status=pending filtresiyle sorgular ve dönen satırları imzalı adresle döner', async () => {
    const pendingRow = {
      id: 'fc-pending-1',
      client_id: CLIENT_ID,
      current_weight: 82.4,
      front_pose_path: 'poses/front.jpg',
      back_pose_path: null,
      notes: null,
      created_at: '2026-08-10T09:00:00.000Z',
      status: 'pending',
      coach_feedback: null,
      reviewed_at: null,
      reviewed_by: null,
    }

    const orderMock = vi.fn().mockResolvedValue({ data: [pendingRow], error: null })
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'form_checks') return { select: selectMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })
    createSignedUrlsMock.mockResolvedValue(
      new Map([['poses/front.jpg', 'https://signed/front.jpg']])
    )

    const { result } = renderHook(() => usePendingFormChecks(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Sorgu gerçekten `status = 'pending'` ile filtrelenmiş — kuyruk reviewed
    // kayıtları döndürecek bir sorgu YAZMAZ.
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('status', 'pending')
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: true })

    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.status).toBe('pending')
    expect(result.current.data?.[0]?.frontPoseSignedUrl).toBe('https://signed/front.jpg')
    expect(result.current.data?.[0]?.backPoseSignedUrl).toBeNull()
  })

  it('kuyruk boşsa (bekleyen yok) boş dizi döner, imzalama isteği atılmaz', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const eqMock = vi.fn(() => ({ order: orderMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    fromMock.mockImplementation(() => ({ select: selectMock }))

    const { result } = renderHook(() => usePendingFormChecks(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
    expect(createSignedUrlsMock).toHaveBeenCalledWith('form-checks-media', [])
  })
})

describe("useReviewFormCheck — koç geri bildirimi reviewed'a çevirir", () => {
  // Sistem mesajı artık `.from('messages').insert()` DEĞİL, `SECURITY DEFINER`
  // `post_system_message` RPC'si ile yazılır (bkz. useFormChecks.ts §
  // publishFormCheckReviewedEvent). `rpcMock` her çağrıda çözümlenmiş bir değer
  // dönmelidir — aksi hâlde `{ error }` destructure edilirken `undefined` patlar.
  function wireReviewChain(returnedRow: Record<string, unknown>) {
    const singleMock = vi.fn().mockResolvedValue({ data: returnedRow, error: null })
    const selectMock = vi.fn(() => ({ single: singleMock }))
    const eqMock = vi.fn(() => ({ select: selectMock }))
    const updateMock = vi.fn(() => ({ eq: eqMock }))

    const notificationsInsertMock = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'form_checks') return { update: updateMock }
      if (table === 'notifications') return { insert: notificationsInsertMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })

    return { updateMock, eqMock, notificationsInsertMock }
  }

  it('yalnızca status + coach_feedback günceller — reviewed_at/reviewed_by İSTEMCİDEN GÖNDERİLMEZ', async () => {
    const { updateMock, eqMock, notificationsInsertMock } = wireReviewChain({
      id: 'fc-1',
      client_id: CLIENT_ID,
      status: 'reviewed',
      coach_feedback: 'Dirseklerini daha az kilitle.',
      reviewed_at: '2026-08-17T12:00:00.000Z',
      reviewed_by: COACH_ID,
    })
    rpcMock.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useReviewFormCheck(), { wrapper: createWrapper() })
    result.current.mutate({
      formCheckId: 'fc-1',
      clientId: CLIENT_ID,
      coachFeedback: 'Dirseklerini daha az kilitle.',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // TAM OLARAK bu iki alan — reviewed_at/reviewed_by İÇERMEZ (sunucu trigger'ı dolduracak).
    expect(updateMock).toHaveBeenCalledWith({
      status: 'reviewed',
      coach_feedback: 'Dirseklerini daha az kilitle.',
    })
    expect(eqMock).toHaveBeenCalledWith('id', 'fc-1')
    expect(result.current.data?.status).toBe('reviewed')

    // Sistem mesajı artık RPC ile denenir (bilinçli best-effort — bkz. useFormChecks.ts yorumu).
    // Mesaj metni İSTEMCİDEN GÖNDERİLMEZ: RPC yalnızca olay türü + referansı alır.
    expect(rpcMock).toHaveBeenCalledWith('post_system_message', {
      p_client_id: CLIENT_ID,
      p_event_type: 'form_check_reviewed',
      p_ref_id: 'fc-1',
    })
    // Bildirim kanalı çalışır (bugünkü "push event yayınla" karşılığı).
    expect(notificationsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID })
    )
  })

  it('sistem mesajı RPC hata dönse bile inceleme BAŞARILI sayılır (bloke etmez)', async () => {
    wireReviewChain({
      id: 'fc-1',
      client_id: CLIENT_ID,
      status: 'reviewed',
      coach_feedback: 'Harika form.',
      reviewed_at: '2026-08-17T12:00:00.000Z',
      reviewed_by: COACH_ID,
    })
    rpcMock.mockResolvedValue({ error: { message: 'unexpected failure', code: '500' } })

    const { result } = renderHook(() => useReviewFormCheck(), { wrapper: createWrapper() })
    result.current.mutate({
      formCheckId: 'fc-1',
      clientId: CLIENT_ID,
      coachFeedback: 'Harika form.',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    // RPC artık 42501'i "beklenen" saymıyor — bir hata gerçek bir arızadır ve
    // `logger.error` ile yüzeye çıkar (bkz. useFormChecks.ts "NEDEN BLOKE ETMİYOR" notu).
    expect(logger.error).toHaveBeenCalled()
  })
})

describe('useSubmitFormCheck — danışan inceleme alanlarını GÖNDERMEZ', () => {
  it('insert payload’ında status/coach_feedback/reviewed_at/reviewed_by hiç YOKTUR', async () => {
    uploadMock.mockResolvedValue({ error: null })
    const insertedRow = {
      id: 'fc-new',
      client_id: CLIENT_ID,
      current_weight: 80,
      front_pose_path: 'poses/x.jpg',
      back_pose_path: null,
      notes: 'Yeni form',
      created_at: '2026-08-17T08:00:00.000Z',
      status: 'pending',
      coach_feedback: null,
      reviewed_at: null,
      reviewed_by: null,
    }
    const singleMock = vi.fn().mockResolvedValue({ data: insertedRow, error: null })
    const selectMock = vi.fn(() => ({ single: singleMock }))
    const insertMock = vi.fn((_payload: Record<string, unknown>) => ({ select: selectMock }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'form_checks') return { insert: insertMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })
    rpcMock.mockResolvedValue({ error: null })

    const frontFile = new File(['x'], 'front.png', { type: 'image/png' })
    const { result } = renderHook(() => useSubmitFormCheck(), { wrapper: createWrapper() })
    result.current.mutate({
      clientId: CLIENT_ID,
      currentWeight: 80,
      frontFile,
      notes: 'Yeni form',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0]?.[0]
    expect(payload).not.toBeUndefined()
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('coach_feedback')
    expect(payload).not.toHaveProperty('reviewed_at')
    expect(payload).not.toHaveProperty('reviewed_by')
    // Yalnızca danışanın yazma yetkisi olan alanlar gönderilir.
    expect(payload).toEqual(
      expect.objectContaining({
        client_id: CLIENT_ID,
        current_weight: 80,
        front_pose_path: expect.any(String),
        back_pose_path: null,
        notes: 'Yeni form',
      })
    )
  })
})
