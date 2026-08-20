import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `useCoachResetClientPassword` hook'unun birim testleri (kardeş `useInviteClient`'ın
// invite-client-ui.test.tsx'teki iddialarına PARALEL).
//
// NEDEN AYRI/DOĞRUDAN HOOK TESTİ: bu hook henüz HİÇBİR arayüzden çağrılmıyor (koç
// arayüzüne bağlanmamış), bu yüzden piggyback edilecek bir bileşen testi YOK. Route
// (`/api/coach/reset-client-password`) kimliği YALNIZCA `Authorization: Bearer`'dan
// okur (cookie kabul etmez) — başlık gönderilmezse hook UI'a bağlandığı an 401 alırdı.
// Bu dosya iki değişmezi ölçer:
//   1) session varken `Authorization: Bearer <token>` başlığı GÖNDERİLİR,
//   2) session/token yokken hook `ApiError(401, 'NOT_AUTHENTICATED')` fırlatır ve
//      `fetch` HİÇ çağrılmaz.
//
// `api-client.test.ts`/`invite-client-ui.test.tsx`teki fetch-mock deseni izlenir
// (`vi.stubGlobal('fetch', ...)` + `makeResponse`), hook `renderHook` ile sürülür.

import { renderHook, waitFor } from '@testing-library/react'

import { ApiError } from '@repo/api-client/api/client'
import { useCoachResetClientPassword } from '@repo/api-client/hooks/useSession'

import { asSupabaseClient, createHookWrapper } from './test-utils'

/** `api-client.test.ts`teki yardımcının AYNISI — yalnızca client.ts'in kullandığı yüzey. */
function makeResponse(opts: {
  status: number
  body?: string
  headers?: Record<string, string>
}): Response {
  const headers = new Headers(opts.headers ?? {})
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    statusText: '',
    headers,
    text: async () => opts.body ?? '',
  } as unknown as Response
}

const ACCESS_TOKEN = 'fake-access-token'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'

function buildSupabaseMock(session: { access_token: string } | null) {
  const getSession = vi.fn().mockResolvedValue({ data: { session }, error: null })
  return { client: asSupabaseClient({ auth: { getSession } }), getSession }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useCoachResetClientPassword', () => {
  it('uç `/api/coach/reset-client-password`e Authorization: Bearer başlığıyla POST eder', async () => {
    const { client } = buildSupabaseMock({ access_token: ACCESS_TOKEN })
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ status: 200, body: JSON.stringify({ ok: true }) })
    )

    const { Wrapper } = createHookWrapper({ supabaseClient: client })
    const { result } = renderHook(() => useCoachResetClientPassword(), { wrapper: Wrapper })

    result.current.mutate({ clientId: CLIENT_ID })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(url).toBe('/api/coach/reset-client-password')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({ clientId: CLIENT_ID })
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)
  })

  it('oturum/token yoksa ApiError(401, NOT_AUTHENTICATED) fırlatır ve fetch HİÇ çağrılmaz', async () => {
    const { client } = buildSupabaseMock(null)

    const { Wrapper } = createHookWrapper({ supabaseClient: client })
    const { result } = renderHook(() => useCoachResetClientPassword(), { wrapper: Wrapper })

    result.current.mutate({ clientId: CLIENT_ID })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const error = result.current.error
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect((error as ApiError).code).toBe('NOT_AUTHENTICATED')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
