import { beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.9 dilim 1 — danışan daveti ucu birim testleri.
//
// Kapsam: `POST /api/coach/invite-client` — kimlik/rol/aal2/gövde/hız sınırı
// kapıları, "önce denetim satırı, sonra davet" fail-closed sırası ve yanıtta
// bağlantı/token/e-posta gibi hiçbir hassas alanın SIZMADIĞI.
//
// `password-reset.test.ts`teki (A) bölümünün (yalnızca POST route testi, jsdom/React
// GEREKTİRMEYEN kısmı) mock desenini birebir izler: `vi.mock('server-only')`,
// `@/lib/supabase/server`, `@/env.server`, `@supabase/supabase-js`, `@/lib/logger`.
//
// `POST` route'u `import 'server-only'` ile başlıyor; jsdom ortamında bu paket
// fırlatır. `vi.mock` hoisting nedeniyle importlardan ÖNCE, dosyanın en üstünde
// olmalı (aynı desen: tests/unit/password-reset.test.ts, tests/unit/account-deletion.test.ts).
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

import { POST } from '@/app/api/coach/invite-client/route'
import { getServerEnv } from '@/env.server'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const INVITED_USER_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_EMAIL = 'yeni-danisan@example.com'

interface ErrorBody {
  error: { code: string; message: string; request_id?: string; details?: unknown }
}

const getUser = vi.fn()
const rpc = vi.fn()
const fromProfiles = vi.fn()
/** `service_role` istemcisinin `record_coach_action` / `link_coach_action_target` RPC çağrıları. */
const rpcAdmin = vi.fn()
const inviteUserByEmail = vi.fn()

const SERVICE_ROLE_KEY = 'test-service-role-key'
const AUDIT_ID = 'a0000000-0000-4000-8000-000000000000'

/** Koçun KENDİ token'ıyla bağlı (RLS altında çalışan) sahte istemci. */
function buildAuthClient() {
  return {
    auth: { getUser },
    rpc,
    from: fromProfiles,
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

function setExistingProfile(result: { data: unknown; error: unknown }): void {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  fromProfiles.mockReturnValue({ select })
}

/**
 * DOĞRULANMIŞ bir access token'ın `aal` claim'ini taşıyan sahte bir JWT üretir.
 *
 * İmza test EDİLMEZ (bilerek `'imza-yok'`): token'ın gerçekliği `getUser` mock'u
 * tarafından "doğrulanmış" kabul edilir (GoTrue'nun işi budur). Bu yardımcı yalnızca
 * route'un OKUMA + FAIL-CLOSED disiplinini ölçmek için payload üretir; imza doğrulaması
 * bu testin kapsamında DEĞİLDİR.
 */
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
  return new Request('http://localhost:3000/api/coach/invite-client', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/coach/invite-client', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    getUser.mockReset()
    rpc.mockReset()
    fromProfiles.mockReset()
    rpcAdmin.mockReset()
    inviteUserByEmail.mockReset()

    rpcAdmin.mockImplementation(async (fn: string) => {
      if (fn === 'record_coach_action') return { data: AUDIT_ID, error: null }
      if (fn === 'link_coach_action_target') return { data: true, error: null }
      return { data: null, error: null }
    })
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: INVITED_USER_ID } },
      error: null,
    })

    vi.mocked(createServerSupabaseClient).mockImplementation((() =>
      buildAuthClient()) as unknown as typeof createServerSupabaseClient)

    // Denetim yazımı ve davet için SERVICE ROLE istemcisi (`@supabase/supabase-js`'in
    // `createClient`'ı, route.ts tarafından DOĞRUDAN çağrılır — `@/lib/supabase/server`
    // üzerinden DEĞİL).
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    } as unknown as ReturnType<typeof getServerEnv>)
    vi.mocked(createClient).mockReturnValue({
      rpc: rpcAdmin,
      auth: { admin: { inviteUserByEmail } },
    } as unknown as ReturnType<typeof createClient>)

    setAuthUser({ id: COACH_ID })
    setIsCoach(true)
    setExistingProfile({ data: null, error: null })
  })

  // -------------------------------------------------------------------------
  // Kimlik
  // -------------------------------------------------------------------------

  it('Authorization başlığı yoksa 401 NOT_AUTHENTICATED döner', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }, null))
    expect(response.status).toBe(401)
    expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_AUTHENTICATED')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('`getUser` geçersiz oturum dönerse 401 NOT_AUTHENTICATED döner', async () => {
    setAuthUser(null)
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(401)
    expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_AUTHENTICATED')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Rol doğrulaması
  // -------------------------------------------------------------------------

  it('`is_coach` false dönerse 403 FORBIDDEN döner', async () => {
    setIsCoach(false)
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('FORBIDDEN')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('`is_coach` RPC hata dönerse fail-CLOSED — 403 FORBIDDEN', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('FORBIDDEN')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // aal2 — fail-closed
  // -------------------------------------------------------------------------

  it('token `aal1` ise 403 MFA_REQUIRED döner, denetim/davet HİÇ tetiklenmez', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }, AAL1_TOKEN))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('token`da `aal` claim`i hiç yoksa fail-CLOSED — 403 MFA_REQUIRED', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }, NO_AAL_TOKEN))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('token çözümlenemeyen bir dize ise (ör. `abc`) fail-CLOSED — 403 MFA_REQUIRED', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }, 'abc'))
    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('MFA_REQUIRED')
    expect(rpcAdmin).not.toHaveBeenCalled()
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Gövde doğrulama
  // -------------------------------------------------------------------------

  it('gövdeye `role: "coach"` konursa `.strict()` reddeder — 422 VALIDATION_ERROR', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL, role: 'coach' }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('geçersiz e-posta 422 VALIDATION_ERROR döner', async () => {
    const response = await POST(makeRequest({ email: 'gecersiz-eposta' }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // E-posta zaten kayıtlı
  // -------------------------------------------------------------------------

  it('`profiles` ön kontrolü bir satır dönerse 409 EMAIL_ALREADY_REGISTERED döner', async () => {
    setExistingProfile({ data: { id: INVITED_USER_ID }, error: null })
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(409)
    expect(((await response.json()) as ErrorBody).error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('ön kontrol boş ama `inviteUserByEmail` "already been registered" hatası dönerse 409 döner', async () => {
    inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered' },
    })
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(409)
    expect(((await response.json()) as ErrorBody).error.code).toBe('EMAIL_ALREADY_REGISTERED')
  })

  // -------------------------------------------------------------------------
  // Hız sınırı
  // -------------------------------------------------------------------------

  it('AYNI (koç, e-posta) çifti için 3. istek 429 döner, `Retry-After` başlığı VAR', async () => {
    const first = await POST(makeRequest({ email: CLIENT_EMAIL }))
    const second = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect([first.status, second.status]).toEqual([200, 200])
    expect(inviteUserByEmail).toHaveBeenCalledTimes(2)

    const third = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(third.status).toBe(429)
    expect(((await third.json()) as ErrorBody).error.code).toBe('INVITE_RATE_LIMIT_EXCEEDED')
    expect(third.headers.get('Retry-After')).not.toBeNull()
    expect(inviteUserByEmail).toHaveBeenCalledTimes(2)
  })

  it('koç GENELİNDE eşik (10/saat) aşılınca 11. FARKLI e-posta için 429 döner', async () => {
    // Her biri FARKLI bir e-postayla — (koç, hedef) kovasına takılmadan yalnızca koç-geneli
    // kovayı doldurmak için (o kovada her e-postanın kendi 2 hakkı var).
    for (let i = 0; i < 10; i++) {
      const response = await POST(makeRequest({ email: `danisan${i}@example.com` }))
      expect(response.status).toBe(200)
    }
    expect(inviteUserByEmail).toHaveBeenCalledTimes(10)

    const blocked = await POST(makeRequest({ email: 'danisan10@example.com' }))
    expect(blocked.status).toBe(429)
    expect(((await blocked.json()) as ErrorBody).error.code).toBe('INVITE_RATE_LIMIT_EXCEEDED')
    expect(inviteUserByEmail).toHaveBeenCalledTimes(10)
  })

  // -------------------------------------------------------------------------
  // Service role / denetim
  // -------------------------------------------------------------------------

  it('SUPABASE_SERVICE_ROLE_KEY yoksa 503 COACH_ACTION_AUDIT_UNAVAILABLE döner', async () => {
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as unknown as ReturnType<typeof getServerEnv>)

    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(503)
    expect(((await response.json()) as ErrorBody).error.code).toBe('COACH_ACTION_AUDIT_UNAVAILABLE')
    expect(inviteUserByEmail).not.toHaveBeenCalled()
  })

  it('`record_coach_action` hata dönerse 500 COACH_ACTION_AUDIT_FAILED döner ve `inviteUserByEmail` HİÇ çağrılmaz (fail-closed sıra)', async () => {
    rpcAdmin.mockImplementation(async (fn: string) => {
      if (fn === 'record_coach_action') return { data: null, error: { message: 'insert failed' } }
      return { data: true, error: null }
    })

    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(500)
    expect(((await response.json()) as ErrorBody).error.code).toBe('COACH_ACTION_AUDIT_FAILED')
    expect(inviteUserByEmail).toHaveBeenCalledTimes(0)
  })

  it('`inviteUserByEmail` tanınmayan bir hata dönerse 502 INVITE_FAILED döner', async () => {
    inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'unexpected SMTP failure' },
    })
    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(502)
    expect(((await response.json()) as ErrorBody).error.code).toBe('INVITE_FAILED')
  })

  // -------------------------------------------------------------------------
  // Mutlu yol
  // -------------------------------------------------------------------------

  it('mutlu yol: denetim satırı `p_target_id` OLMADAN yazılır, davet doğru argümanlarla çağrılır, hedef sonradan bağlanır, yanıt TAM OLARAK `{ ok: true }`dır', async () => {
    const response = await POST(makeRequest({ email: CLIENT_EMAIL, full_name: 'Ayşe Yılmaz' }))

    expect(response.status).toBe(200)

    expect(rpcAdmin).toHaveBeenCalledWith('record_coach_action', {
      p_action: 'client_invited',
      p_actor_id: COACH_ID,
      p_request_id: expect.any(String),
    })
    // `p_target_id` anahtarı HİÇ gönderilmemeli (henüz var olmayan bir kullanıcı).
    const recordCall = rpcAdmin.mock.calls.find(([fn]) => fn === 'record_coach_action')
    expect(recordCall?.[1]).not.toHaveProperty('p_target_id')

    expect(inviteUserByEmail).toHaveBeenCalledWith(CLIENT_EMAIL, {
      data: { full_name: 'Ayşe Yılmaz' },
      redirectTo: 'http://localhost:3000/reset-password',
    })
    // `data` içinde `role` YOK.
    const inviteCall = inviteUserByEmail.mock.calls[0] as [
      string,
      { data: Record<string, unknown> },
    ]
    expect(inviteCall[1].data).not.toHaveProperty('role')

    expect(rpcAdmin).toHaveBeenCalledWith('link_coach_action_target', {
      p_action_id: AUDIT_ID,
      p_target_id: INVITED_USER_ID,
    })

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true })
    expect(Object.keys(body)).toEqual(['ok'])
  })

  it('`link_coach_action_target` hata dönse bile yanıt YİNE 200 döner (best-effort)', async () => {
    rpcAdmin.mockImplementation(async (fn: string) => {
      if (fn === 'record_coach_action') return { data: AUDIT_ID, error: null }
      if (fn === 'link_coach_action_target')
        return { data: null, error: { message: 'link failed' } }
      return { data: null, error: null }
    })

    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true })
  })

  // -------------------------------------------------------------------------
  // Sızıntı testi
  // -------------------------------------------------------------------------

  it('mutlu yolda `inviteUserByEmail` cevabı `action_link`/`hashed_token` içerse bile yanıt gövdesinde/başlıklarında SIZMAZ', async () => {
    inviteUserByEmail.mockResolvedValue({
      data: {
        user: { id: INVITED_USER_ID },
        properties: {
          action_link: 'http://localhost:54321/auth/v1/verify?token=gizli-token',
          hashed_token: 'gizli-hashed-token-degeri',
        },
      },
      error: null,
    })

    const response = await POST(makeRequest({ email: CLIENT_EMAIL }))
    expect(response.status).toBe(200)

    const rawBody = await response.text()
    const lowerBody = rawBody.toLowerCase()
    expect(lowerBody).not.toContain('action_link')
    expect(lowerBody).not.toContain('token')
    expect(lowerBody).not.toContain('password')
    expect(lowerBody).not.toContain('http')

    const headerText = JSON.stringify([...response.headers.entries()]).toLowerCase()
    expect(headerText).not.toContain('action_link')
    expect(headerText).not.toContain('gizli-token')
    expect(headerText).not.toContain('gizli-hashed-token-degeri')
    expect(headerText).not.toContain('password')
  })
})
