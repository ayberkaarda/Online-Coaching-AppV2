import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A-10 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5) regresyon testleri: önceden
// hız sınırı aşımı (`src/proxy.ts`) ve başarısız giriş denemeleri (`sign-in/route.ts`) HİÇ
// loglanmıyordu — brute-force/limit taşması tespit edilemiyordu. Bu dosya üç olayı doğrular:
//   1) 429 -> `event: 'rate_limit_exceeded'` (`src/proxy.ts`)
//   2) başarısız giriş -> `event: 'auth_login_failed'` (`sign-in/route.ts`)
//   3) giriş hız sınırı -> `event: 'auth_login_rate_limited'` (`sign-in/route.ts`)
// ve HİÇBİRİNDE ham şifre/token/tam e-posta bulunmadığını.
//
// `vi.mock` hoisting nedeniyle importlardan ÖNCE tanımlanmalı (bkz. mevcut proxy-auth.test.ts /
// auth-sign-in-rate-limit.test.ts'teki aynı desen).
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// Tek paylaşılan sahte logger — hem `src/proxy.ts`'in doğrudan kullandığı `logger`, hem
// `sign-in/route.ts`'in `createRequestLogger(requestId)` ile aldığı alt-logger AYNI `warn`
// mock'una yazar; böylece tek bir `vi.mocked(sharedWarn)` ile her iki çağıran da doğrulanabilir.
vi.mock('@/lib/logger', () => {
  const sharedLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((): typeof sharedLogger => sharedLogger),
  }
  return {
    logger: sharedLogger,
    createRequestLogger: vi.fn((): typeof sharedLogger => sharedLogger),
  }
})

import { POST } from '@/app/api/auth/sign-in/route'
import { resetServerEnvCache } from '@/env.server'
import { logger } from '@/lib/logger'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { proxy } from '@/proxy'

const warnMock = vi.mocked(logger.warn)

interface SignInResult {
  data: { session: Record<string, unknown> | null }
  error: { message: string } | null
}

const WRONG_PASSWORD = 'YanlisSifre123!'

const INVALID_CREDENTIALS: SignInResult = {
  data: { session: null },
  error: { message: 'Invalid login credentials' },
}

const signInWithPassword = vi.fn<(credentials: unknown) => Promise<SignInResult>>()

function setSignInResult(result: SignInResult): void {
  signInWithPassword.mockResolvedValue(result)
}

function buildSignInRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function buildProxyRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

/** Bir warn çağrısının argümanlarını (varsa) düz metne çevirir — sızıntı taraması için. */
function warnCallsAsText(): string {
  return JSON.stringify(warnMock.mock.calls)
}

describe('güvenlik olayı loglaması (A-10)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    resetServerEnvCache()
    warnMock.mockClear()
    signInWithPassword.mockReset()
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      auth: { signInWithPassword },
    } as unknown as ReturnType<typeof createServerSupabaseClient>)
    setSignInResult(INVALID_CREDENTIALS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetRateLimit()
    resetServerEnvCache()
  })

  // -------------------------------------------------------------------------
  // 1) 429 -> rate_limit_exceeded
  // -------------------------------------------------------------------------

  it('429 dönerken `event: "rate_limit_exceeded"` warn olarak loglanır, ham IP loglanmaz', () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '1')
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000')
    resetServerEnvCache()

    const rawIp = '203.0.113.55'
    const headers = { 'x-forwarded-for': rawIp }

    const first = proxy(buildProxyRequest('/api/some-route', headers))
    expect(first.status).toBe(200)
    expect(warnMock).not.toHaveBeenCalled()

    const second = proxy(buildProxyRequest('/api/some-route', headers))
    expect(second.status).toBe(429)

    expect(warnMock).toHaveBeenCalledTimes(1)
    const [fields] = warnMock.mock.calls[0] as [Record<string, unknown>, string?]
    expect(fields.event).toBe('rate_limit_exceeded')
    expect(fields.path).toBe('/api/some-route')

    // Ham IP (TRUSTED_PROXY_COUNT=0 varsayılanında zaten güvenilmez, ama her ihtimale karşı)
    // hiçbir warn çağrısının argümanlarında DÜZ METİN olarak geçmemeli.
    expect(warnCallsAsText()).not.toContain(rawIp)
  })

  // -------------------------------------------------------------------------
  // 2) Başarısız giriş -> auth_login_failed
  // -------------------------------------------------------------------------

  it('başarısız girişte `event: "auth_login_failed"` warn olarak loglanır, ham şifre/tam e-posta yok', async () => {
    const email = 'kullanici@example.com'
    const response = await POST(buildSignInRequest({ email, password: WRONG_PASSWORD }))
    expect(response.status).toBe(401)

    const failedCalls = warnMock.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>).event === 'auth_login_failed'
    )
    expect(failedCalls).toHaveLength(1)

    const fields = failedCalls[0]?.[0] as Record<string, unknown>
    expect(fields.event).toBe('auth_login_failed')

    const text = warnCallsAsText()
    // Ham şifre ASLA loglanmamalı.
    expect(text).not.toContain(WRONG_PASSWORD)
    // TAM e-posta ASLA loglanmamalı — yalnızca maskelenmiş biçimi (`ku***@example.com` gibi).
    expect(text).not.toContain(email)
    expect(String(fields.email)).toMatch(/^.{0,2}\*\*\*@example\.com$/)
  })

  // -------------------------------------------------------------------------
  // 3) Giriş hız sınırı -> auth_login_rate_limited
  // -------------------------------------------------------------------------

  it('giriş hız sınırı tetiklendiğinde `event: "auth_login_rate_limited"` warn olarak loglanır', async () => {
    const email = 'kilitlenen@example.com'

    // Eşiği aşana kadar başarısız dene (bkz. LOGIN_FAILURE_LIMIT — auth-sign-in-rate-limit.test.ts).
    for (let i = 0; i < 10; i++) {
      await POST(buildSignInRequest({ email, password: WRONG_PASSWORD }))
    }
    warnMock.mockClear()

    const blocked = await POST(buildSignInRequest({ email, password: WRONG_PASSWORD }))
    expect(blocked.status).toBe(429)

    const rateLimitedCalls = warnMock.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>).event === 'auth_login_rate_limited'
    )
    expect(rateLimitedCalls).toHaveLength(1)

    const text = warnCallsAsText()
    expect(text).not.toContain(WRONG_PASSWORD)
    expect(text).not.toContain(email)
  })

  // -------------------------------------------------------------------------
  // 4) Genel sızıntı taraması: hiçbir warn çağrısında token/Bearer değeri yok
  // -------------------------------------------------------------------------

  it('hiçbir güvenlik olayı warn’ında "Bearer" token değeri veya ham şifre metni geçmez', async () => {
    proxy(buildProxyRequest('/api/x', { 'x-forwarded-for': '198.51.100.9' }))
    await POST(buildSignInRequest({ email: 'baska@example.com', password: WRONG_PASSWORD }))

    const text = warnCallsAsText()
    expect(text).not.toContain('Bearer ')
    expect(text).not.toContain(WRONG_PASSWORD)
  })
})
