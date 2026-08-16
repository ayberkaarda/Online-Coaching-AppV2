// Merkezi HTTP istemcisi: timeout, JSON gövdesi, standart hata dönüşümü.
// Kullanıcıya gösterilebilecek tüm mesajlar TÜRKÇE'dir.

import type { ApiErrorBody } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId

    // TS'in Error alt sınıfı tuzağı: prototip zincirini elle düzelt.
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  static isApiError(e: unknown): e is ApiError {
    return e instanceof ApiError || (e instanceof Error && e.name === 'ApiError')
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** Gövde olarak gönderilecek nesne; otomatik JSON'a çevrilir. */
  json?: unknown
  /** Varsayılan 30.000 ms. */
  timeoutMs?: number
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const error = (value as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && typeof message === 'string'
}

/**
 * `fetch` sarmalayıcısı. Başarısız yanıtları her zaman `ApiError` olarak fırlatır.
 * 204 yanıtında `undefined` döner.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { json, timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, ...rest } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  // Dışarıdan gelen signal ile kendi timeout signal'imizi birleştir.
  const onExternalAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const finalHeaders = new Headers(headers)
  let body: BodyInit | undefined
  if (json !== undefined) {
    if (!finalHeaders.has('Content-Type')) finalHeaders.set('Content-Type', 'application/json')
    body = JSON.stringify(json)
  }

  let response: Response
  try {
    response = await fetch(path, {
      ...rest,
      headers: finalHeaders,
      ...(body !== undefined ? { body } : {}),
      signal: controller.signal,
    })
  } catch (cause) {
    if (signal?.aborted) {
      throw new ApiError(499, 'ABORTED', 'İstek iptal edildi.', cause)
    }
    if (controller.signal.aborted) {
      throw new ApiError(
        408,
        'TIMEOUT',
        'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
        cause
      )
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      cause
    )
  } finally {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }

  const requestId = response.headers.get('X-Request-ID') ?? undefined

  if (!response.ok) {
    const rawText = await response.text().catch(() => '')
    let parsed: unknown
    if (rawText) {
      try {
        parsed = JSON.parse(rawText) as unknown
      } catch {
        parsed = undefined
      }
    }

    if (isApiErrorBody(parsed)) {
      throw new ApiError(
        response.status,
        parsed.error.code,
        parsed.error.message,
        parsed.error.details,
        parsed.error.request_id ?? requestId
      )
    }

    const fallbackMessage =
      rawText.trim().slice(0, 300) || response.statusText || 'Beklenmeyen bir hata oluştu.'

    throw new ApiError(response.status, 'HTTP_ERROR', fallbackMessage, parsed, requestId)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  if (!text) return undefined as T

  try {
    return JSON.parse(text) as T
  } catch (cause) {
    throw new ApiError(
      response.status,
      'INVALID_JSON',
      'Sunucudan beklenmeyen bir yanıt geldi.',
      cause,
      requestId
    )
  }
}
