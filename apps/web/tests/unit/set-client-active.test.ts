import { beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.10 — hesap aktif/pasif ucu birim testleri.
//
// Kapsam: `POST /api/coach/set-client-active` — kimlik/rol/aal2/gövde/hız sınırı
// kapıları, `set_client_active_state` RPC'sinin doğru argümanlarla çağrılması,
// RPC hata kodlarının (42501/P0002 -> 404, diğer -> 500) doğru eşlenmesi ve
// yanıtta yalnızca `{ ok: true }` dönmesi.
//
// `invite-client.test.ts`in mock desenini BİREBİR izler.

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

vi.mock('@/env.server', () => ({
  getServerEnv: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

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

import { createClient } from '@supabase/supabase-js'

import { POST } from '@/app/api/coach/set-client-active/route'
import { getServerEnv } from '@/env.server'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'

interface ErrorBody {
  error: { code: string; message: string; request_id?: string; details?: unknown }
}

const getUser = vi.fn()
const rpc = vi.fn()
/** `service_role` istemcisinin `set_client_active_state` RPC çağrısı. */
const rpcAdmin = vi.fn()

const SERVICE_ROLE_KEY = 'test-service-role-key'

function buildAuthClient() {
  return {
    auth: { getUser },
    rpc,
  }
}

function setAuthUser(user: { id: string } | null): void {
  getUser.mockResolvedValue({
    data: { user },
    error: user ? null : { message: 'invalid token' },
  })
}

function setIsCoach(value: boolean): void {
  rpc.mockResolvedValue({ data: value, error: null })
}

function makeToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.imza-yok`
}

const AAL2_TOKEN = makeToken({ aal: 'aal2' })
const AAL1_TOKEN = makeToken({ aal: 'aal1' })
const NO_AAL_TOKEN = makeToken({})

function makeRequest(body: unknown, token: string | null = AAL2_TOKEN): Request {
  return new Request('http://localhost:3000/api/coach/set-client-active', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/coach/set-client-active', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    getUser.mockReset()
    rpc.mockReset()
    rpcAdmin.mockReset()

    rpcAdmin.mockResolvedValue({ data: null, error: null })

    vi.mocked(createServerSupabaseClient).mockImplementation((() =>
      buildAuthClient()) as unknown as typeof createServerSupabaseClient)

    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    } as unknown as ReturnType<typeof getServerEnv>)
    vi.mocked(createClient).mockReturnValue({
      rpc: rpcAdmin,
    } as unknown as ReturnType<typeof createClient>)

    setAuthUser({ id: COACH_ID })
    setIsCoach(true)
  })

  // -------------------------------------------------------------------------
  // Kimlik
  // -------------------------------------------------------------------------

  it('Authorization başlığı yoksa 401 NOT_AUTHENTICATED döner', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }, null))
    expect(response.status).toBe(401)
    expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_AUTHENTICATED')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('`getUser` geçersiz oturum dönerse 401 NOT_AUTHENTICATED döner', async () => {
    setAuthUser(null)
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(401)
    expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_AUTHENTICATED')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Rol
  // -------------------------------------------------------------------------

  it('`is_coach` false dönerse 403 FORBIDDEN döner', async () => {
    setIsCoach(false)
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('FORBIDDEN')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('`is_coach` RPC hata dönerse fail-CLOSED — 403 FORBIDDEN', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('FORBIDDEN')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // aal2 — fail-closed
  // -------------------------------------------------------------------------

  it('token `aal1` ise 403 MFA_REQUIRED döner, RPC HİÇ çağrılmaz', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }, AAL1_TOKEN))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('token`da `aal` claim`i hiç yoksa fail-CLOSED — 403 MFA_REQUIRED', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }, NO_AAL_TOKEN))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('token çözümlenemeyen bir dize ise (ör. `abc`) fail-CLOSED — 403 MFA_REQUIRED', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }, 'abc'))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Gövde
  // -------------------------------------------------------------------------

  it('geçersiz UUID 422 VALIDATION_ERROR döner', async () => {
    const response = await POST(makeRequest({ client_id: 'gecersiz', active: false }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('`active` alanı eksikse 422 VALIDATION_ERROR döner', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('gövdeye bilinmeyen alan konursa `.strict()` reddeder — 422 VALIDATION_ERROR', async () => {
    const response = await POST(
      makeRequest({ client_id: CLIENT_ID, active: false, coach_id: COACH_ID })
    )
    expect(response.status).toBe(422)
    expect(((await response.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Service role / RPC hataları
  // -------------------------------------------------------------------------

  it('SUPABASE_SERVICE_ROLE_KEY yoksa 503 COACH_ACTION_AUDIT_UNAVAILABLE döner', async () => {
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as unknown as ReturnType<typeof getServerEnv>)

    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(503)
    expect(((await response.json()) as ErrorBody).error.code).toBe('COACH_ACTION_AUDIT_UNAVAILABLE')
    expect(rpcAdmin).not.toHaveBeenCalled()
  })

  it('RPC 42501 (hedef danışan değil) dönerse 404 CLIENT_NOT_FOUND döner', async () => {
    rpcAdmin.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'hedef danisan degil' },
    })
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(404)
    expect(((await response.json()) as ErrorBody).error.code).toBe('CLIENT_NOT_FOUND')
  })

  it('RPC P0002 (hedef bulunamadı) dönerse 404 CLIENT_NOT_FOUND döner', async () => {
    rpcAdmin.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'hedef bulunamadi' },
    })
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: true }))
    expect(response.status).toBe(404)
    expect(((await response.json()) as ErrorBody).error.code).toBe('CLIENT_NOT_FOUND')
  })

  it('RPC tanınmayan bir hata dönerse 500 SET_ACTIVE_FAILED döner', async () => {
    rpcAdmin.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'beklenmeyen' } })
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(500)
    expect(((await response.json()) as ErrorBody).error.code).toBe('SET_ACTIVE_FAILED')
  })

  // -------------------------------------------------------------------------
  // Hız sınırı
  // -------------------------------------------------------------------------

  it('AYNI (koç, danışan) çifti için 6. istek 429 döner, `Retry-After` başlığı VAR', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest({ client_id: CLIENT_ID, active: i % 2 === 0 }))
      expect(ok.status).toBe(200)
    }
    expect(rpcAdmin).toHaveBeenCalledTimes(5)

    const blocked = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(blocked.status).toBe(429)
    expect(((await blocked.json()) as ErrorBody).error.code).toBe('SET_ACTIVE_RATE_LIMIT_EXCEEDED')
    expect(blocked.headers.get('Retry-After')).not.toBeNull()
    expect(rpcAdmin).toHaveBeenCalledTimes(5)
  })

  // -------------------------------------------------------------------------
  // Mutlu yol
  // -------------------------------------------------------------------------

  it('mutlu yol (pasifleştir): RPC doğru argümanlarla çağrılır, yanıt TAM OLARAK `{ ok: true }`dır', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: false }))
    expect(response.status).toBe(200)

    expect(rpcAdmin).toHaveBeenCalledWith('set_client_active_state', {
      p_client_id: CLIENT_ID,
      p_active: false,
      p_request_id: expect.any(String),
    })

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true })
    expect(Object.keys(body)).toEqual(['ok'])
  })

  it('mutlu yol (yeniden aktifleştir): `p_active: true` gönderilir', async () => {
    const response = await POST(makeRequest({ client_id: CLIENT_ID, active: true }))
    expect(response.status).toBe(200)
    expect(rpcAdmin).toHaveBeenCalledWith('set_client_active_state', {
      p_client_id: CLIENT_ID,
      p_active: true,
      p_request_id: expect.any(String),
    })
  })
})
