// A-05 (B-006) — oturum token'larının `localStorage`'dan COOKIE'ye taşınması.
//
// KAPSAM:
//   A) `/api/auth/sign-in` başarı yanıtı gerçek `Set-Cookie` başlıkları taşır ve JSON gövdesi
//      `access_token`/`refresh_token` İÇERMEZ.
//   B) `Secure` bayrağı ORTAMDAN türetilir: düz http isteğinde YOK, https isteğinde VAR.
//      TUZAK: E2E paketi `NODE_ENV=production` altında ama `http://localhost:3000` üzerinden
//      koşar. `Secure` koşulsuz set edilseydi tarayıcı cookie'yi hiç saklamaz, oturum
//      kurulamaz ve TÜM E2E paketi düşerdi. Bu test o regresyonu sabitler.
//   C) `useSignIn` artık `setSession(tokens)` ÇAĞIRMAZ; sunucunun az önce yazdığı cookie'den
//      `getSession()` ile hidrat eder.
//
// A ve B için `@supabase/ssr` MOCK'LANMAZ — cookie üretiminin (adlandırma, parçalama,
// nitelikler) gerçek kütüphane tarafından yapıldığı doğrulanır. Yalnızca ağ katmanı
// (`globalThis.fetch`) sahte GoTrue yanıtıyla değiştirilir.

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `src/lib/supabase/server.ts` `server-only` içerir; route dosyası onu import ettiği için
// vitest (jsdom) ortamında etkisizleştirilmesi gerekir. `vi.mock` hoisting nedeniyle
// importlardan ÖNCE, dosyanın en üstünde olmalı.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => {
  const silentLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((): typeof silentLogger => silentLogger),
  }
  return {
    logger: silentLogger,
    createRequestLogger: vi.fn((): typeof silentLogger => silentLogger),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// C bölümü için: hook'un Supabase istemcisiyle ne yaptığını ölçüyoruz.
//
// Faz 4.5 commit 5 (ADR-0024): `useSignIn` istemciyi artık modül singleton'ından DEĞİL
// `<SupabaseClientProvider>`'dan alıyor — sahte istemci `vi.mock` yerine düz bir nesne olarak
// kurulup `createWrapper()` ile enjekte ediliyor. `apiFetch` mock'u ise hâlâ modül seviyesinde.
const getSessionMock = vi.fn()
const setSessionMock = vi.fn()
const onAuthStateChangeMock = vi.fn()
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))

vi.mock('@repo/api-client/api/client', () => ({
  apiFetch: apiFetchMock,
  ApiError: class ApiError extends Error {},
}))

import { POST } from '@/app/api/auth/sign-in/route'
import { resetServerEnvCache } from '@/env.server'
import { SupabaseClientProvider } from '@repo/api-client/context'
import { useSignIn } from '@repo/api-client/hooks/useSession'
import { resetRateLimit } from '@/lib/rate-limit'

import { asSupabaseClient } from './test-utils'

const supabase = asSupabaseClient({
  auth: {
    getSession: getSessionMock,
    setSession: setSessionMock,
    onAuthStateChange: onAuthStateChangeMock,
  },
})

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PASSWORD = 'Passw0rd!23'

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * GoTrue'nun döndürdüğüne benzer, İMZASI GEÇERSİZ ama yapısı doğru bir JWT. auth-js token'ı
 * yalnızca çözümler (imza doğrulaması sunucu tarafındadır), bu yüzden test için yeterlidir.
 */
function fakeAccessToken(): string {
  const header = base64url({ alg: 'HS256', typ: 'JWT' })
  const payload = base64url({
    sub: USER_ID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })
  return `${header}.${payload}.c2lnbmF0dXJl`
}

/** GoTrue `/auth/v1/token?grant_type=password` başarı gövdesi. */
function goTrueSessionBody(): Record<string, unknown> {
  return {
    access_token: fakeAccessToken(),
    refresh_token: 'refresh-token-456',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ok@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  }
}

/** Yalnızca ağ katmanını sahteler; `@supabase/ssr` ve auth-js GERÇEK çalışır. */
function stubGoTrueFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify(goTrueSessionBody()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  )
}

function buildRequest(origin: string, body: unknown): Request {
  return new Request(`${origin}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setCookieHeaders(response: Response): string[] {
  return response.headers.getSetCookie()
}

/**
 * Niteliği YALNIZCA `; ` ayracından sonra arar — cookie DEĞERİ base64 olduğu için düz
 * `includes('Secure')` yanlış pozitif verebilirdi.
 */
function hasAttribute(setCookie: string, attribute: string): boolean {
  return new RegExp(`;\\s*${attribute}(=|;|$)`, 'i').test(setCookie)
}

// ---------------------------------------------------------------------------
// A + B — sunucu tarafı
// ---------------------------------------------------------------------------

describe('POST /api/auth/sign-in — oturum cookie olarak yazılır (A-05 / B-006)', () => {
  beforeEach(() => {
    // `getServerEnv()` (`resolveTrustedClientIp` üzerinden) tarayıcıda hata fırlatır; test
    // ortamı jsdom olduğu için gerçek sunucu ortamını simüle ediyoruz.
    vi.stubGlobal('window', undefined)
    stubGoTrueFetch()
    resetRateLimit()
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetRateLimit()
    resetServerEnvCache()
  })

  it('yanıt Set-Cookie taşır ve gövde access_token/refresh_token İÇERMEZ', async () => {
    const response = await POST(
      buildRequest('http://localhost:3000', { email: 'ok@example.com', password: PASSWORD })
    )

    expect(response.status).toBe(200)

    const cookies = setCookieHeaders(response)
    // `@supabase/ssr` cookie adını `NEXT_PUBLIC_SUPABASE_URL`'den türetir (`sb-<ref>-...`);
    // adı elle vermiyoruz ki iki taraf da AYNI varsayılanı kullansın.
    expect(cookies.length).toBeGreaterThan(0)
    expect(cookies.some((cookie) => cookie.startsWith('sb-'))).toBe(true)

    const rawBody = await response.text()
    expect(JSON.parse(rawBody)).toEqual({ ok: true })
    // Asıl regresyon: token artık HİÇBİR şekilde gövdede olmamalı.
    expect(rawBody).not.toContain('access_token')
    expect(rawBody).not.toContain('refresh_token')

    // Token yalnızca cookie'de taşınır — yani cookie gerçekten oturumu içeriyor olmalı.
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('sb-')) as string
    expect(sessionCookie).toContain('Path=/')
    // Next `Set-Cookie` niteliğini küçük harfle yazar (`SameSite=lax`); büyük/küçük harf
    // HTTP'de anlamsızdır, bu yüzden karşılaştırma da duyarsız yapılır.
    expect(sessionCookie.toLowerCase()).toContain('samesite=lax')
  })

  it('cookie httpOnly DEĞİLDİR — tarayıcı istemcisi (RLS sorguları + realtime) oturumu okumak ZORUNDA', async () => {
    const response = await POST(
      buildRequest('http://localhost:3000', { email: 'ok@example.com', password: PASSWORD })
    )

    // BİLİNÇLİ KARAR: uygulama tarayıcıdan doğrudan `supabase.from(...)` çağırıyor ve
    // `useMessages` realtime `.channel(...)` kuruyor. `httpOnly` olsaydı `getSession()` null
    // döner ve RLS altındaki TÜM istemci sorguları çökerdi.
    for (const cookie of setCookieHeaders(response)) {
      expect(hasAttribute(cookie, 'HttpOnly')).toBe(false)
    }
  })

  it('Secure bayrağı http isteğinde YOKTUR (E2E tuzağı: production build + http://localhost)', async () => {
    const response = await POST(
      buildRequest('http://localhost:3000', { email: 'http@example.com', password: PASSWORD })
    )

    const cookies = setCookieHeaders(response)
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      expect(hasAttribute(cookie, 'Secure')).toBe(false)
    }
  })

  it('Secure bayrağı https isteğinde VARDIR', async () => {
    const response = await POST(
      buildRequest('https://app.example.com', { email: 'https@example.com', password: PASSWORD })
    )

    const cookies = setCookieHeaders(response)
    expect(cookies.length).toBeGreaterThan(0)
    for (const cookie of cookies) {
      expect(hasAttribute(cookie, 'Secure')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// C — istemci tarafı
// ---------------------------------------------------------------------------

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

describe('useSignIn — oturum cookie’den hidrat edilir (A-05 / B-006)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
    getSessionMock.mockReset()
    setSessionMock.mockReset()
    apiFetchMock.mockResolvedValue({ ok: true })
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'from-cookie', user: { id: USER_ID } } },
      error: null,
    })
  })

  it('setSession ÇAĞIRMAZ; POST sonrası getSession ile oturumu okur', async () => {
    const { result } = renderHook(() => useSignIn(), { wrapper: createWrapper() })

    const session = await result.current.mutateAsync({
      email: 'ok@example.com',
      password: PASSWORD,
    })

    expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/sign-in', {
      method: 'POST',
      json: { email: 'ok@example.com', password: PASSWORD },
    })
    // A-05 regresyonu: token artık gövdeyle gelmediği için `setSession` ÇAĞRILAMAZ.
    expect(setSessionMock).not.toHaveBeenCalled()
    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(session.access_token).toBe('from-cookie')

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })

  it('cookie okunamazsa (oturum yok) mevcut Türkçe hata fırlatılır', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })

    const { result } = renderHook(() => useSignIn(), { wrapper: createWrapper() })

    await expect(
      result.current.mutateAsync({ email: 'ok@example.com', password: PASSWORD })
    ).rejects.toThrow('Oturum başlatılamadı. Lütfen tekrar deneyin.')
  })
})
