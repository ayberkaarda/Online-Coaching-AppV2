import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '@/lib/api/client'

/** Basit bir `Response` benzeri nesne kurar (yalnızca client.ts'in kullandığı yüzey). */
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

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('başarılı JSON yanıtını parse edip döner; Content-Type header ve JSON gövdesi gönderir', async () => {
    const payload = { hello: 'world' }
    vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 200, body: JSON.stringify(payload) }))

    const result = await apiFetch<typeof payload>('/x', { json: { a: 1 } })
    expect(result).toEqual(payload)

    const call = vi.mocked(fetch).mock.calls[0]
    const init = call?.[1]
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ a: 1 }))
  })

  it('204 yanıtında undefined döner', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ status: 204 }))
    const result = await apiFetch('/x')
    expect(result).toBeUndefined()
  })

  it('4xx + {error:{code,message}} gövdesinde ApiError fırlatır', async () => {
    const body = JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Geçersiz istek.' } })
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ status: 422, body, headers: { 'X-Request-ID': 'req-1' } })
    )

    let caught: unknown
    try {
      await apiFetch('/x')
    } catch (e) {
      caught = e
    }

    expect(ApiError.isApiError(caught)).toBe(true)
    const err = caught as ApiError
    expect(err.status).toBe(422)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('Geçersiz istek.')
    expect(err.requestId).toBe('req-1')
  })

  it('5xx + JSON olmayan gövdede yine ApiError fırlatır, makul bir mesaj içerir', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ status: 500, body: 'Internal Server Error garbage' })
    )

    let caught: unknown
    try {
      await apiFetch('/x')
    } catch (e) {
      caught = e
    }

    expect(ApiError.isApiError(caught)).toBe(true)
    const err = caught as ApiError
    expect(err.status).toBe(500)
    expect(err.code).toBe('HTTP_ERROR')
    expect(err.message).toContain('Internal Server Error garbage')
  })

  it('fetch reddedilirse (ağ hatası) ApiError status:0 code:NETWORK_ERROR fırlatır', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    let caught: unknown
    try {
      await apiFetch('/x')
    } catch (e) {
      caught = e
    }

    expect(ApiError.isApiError(caught)).toBe(true)
    const err = caught as ApiError
    expect(err.status).toBe(0)
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.message).toBe(
      'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    )
  })

  it('zaman aşımında AbortError üretilip TIMEOUT (status 408) koduna çevrilir', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const promise = apiFetch('/x', { timeoutMs: 100 })
    const assertion = expect(promise).rejects.toMatchObject({ status: 408, code: 'TIMEOUT' })

    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })

  it('dışarıdan verilen signal iletilir: dış signal iptal edilince istek ABORTED ile düşer', async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const externalController = new AbortController()
    const promise = apiFetch('/x', { signal: externalController.signal })
    const assertion = expect(promise).rejects.toMatchObject({ status: 499, code: 'ABORTED' })

    externalController.abort()
    await assertion
  })

  it('zaten iptal edilmiş bir dış signal ile çağrılırsa yine ABORTED ile düşer', async () => {
    vi.mocked(fetch).mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const externalController = new AbortController()
    externalController.abort()

    await expect(apiFetch('/x', { signal: externalController.signal })).rejects.toMatchObject({
      status: 499,
      code: 'ABORTED',
    })
  })
})
