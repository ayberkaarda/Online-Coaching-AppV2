import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.7 dilim 3 — şifre sıfırlama akışı birim testleri.
//
// Kapsam:
//   A) `POST /api/coach/reset-client-password` — koç tetiklemeli sıfırlama ucu:
//      kimlik/rol/hedef/hız sınırı kapıları ve yanıtta HİÇBİR bağlantı/token dönmediği.
//   B) `/forgot-password` sayfası — kullanıcı sayımı sızdırmayan nötr mesaj.
//   C) `/reset-password` sayfası — geçersiz bağlantı ve başarılı akış.
//
// `POST` route'u `import 'server-only'` ile başlıyor; jsdom ortamında bu paket fırlatır.
// `vi.mock` hoisting nedeniyle importlardan ÖNCE, dosyanın en üstünde olmalı (aynı desen:
// tests/unit/account-deletion.test.ts).
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import { createElement } from 'react'

import { createClient } from '@supabase/supabase-js'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { POST } from '@/app/api/coach/reset-client-password/route'
import { getServerEnv } from '@/env.server'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import ForgotPasswordPage from '@/app/forgot-password/page'
import ResetPasswordPage from '@/app/reset-password/page'

import { asSupabaseClient, renderWithProviders } from './test-utils'

// ---------------------------------------------------------------------------
// A) POST /api/coach/reset-client-password
// ---------------------------------------------------------------------------

const COACH_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_EMAIL = 'danisan@example.com'

interface ErrorBody {
  error: { code: string; message: string; request_id?: string; details?: unknown }
}

const getUser = vi.fn()
const rpc = vi.fn()
const fromProfiles = vi.fn()
const resetPasswordForEmail = vi.fn()
/** `service_role` istemcisinin `record_coach_action` RPC çağrısı (kalıcı denetim). */
const rpcAdmin = vi.fn()

const SERVICE_ROLE_KEY = 'test-service-role-key'

/** Koçun KENDİ token'ıyla bağlı (RLS altında çalışan) sahte istemci. */
function buildAuthClient() {
  return {
    auth: { getUser },
    rpc,
    from: fromProfiles,
  }
}

/** `resetPasswordForEmail` için kullanılan kimliksiz (anon) sahte istemci. */
function buildAnonClient() {
  return {
    auth: { resetPasswordForEmail },
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

function setTargetProfile(result: { data: unknown; error: unknown }): void {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  fromProfiles.mockReturnValue({ select })
}

function makeRequest(body: unknown, token: string | null = 'valid-coach-token'): Request {
  return new Request('http://localhost:3000/api/coach/reset-client-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/coach/reset-client-password', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    getUser.mockReset()
    rpc.mockReset()
    fromProfiles.mockReset()
    resetPasswordForEmail.mockReset()
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    rpcAdmin.mockReset()
    rpcAdmin.mockResolvedValue({ data: 'a0000000-0000-4000-8000-000000000000', error: null })

    vi.mocked(createServerSupabaseClient).mockImplementation(((token?: string) =>
      token
        ? buildAuthClient()
        : buildAnonClient()) as unknown as typeof createServerSupabaseClient)

    // Denetim yazımı için SERVICE ROLE istemcisi (`@supabase/supabase-js`'in `createClient`'ı,
    // route.ts tarafından DOĞRUDAN çağrılır — `@/lib/supabase/server` üzerinden DEĞİL).
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    } as unknown as ReturnType<typeof getServerEnv>)
    vi.mocked(createClient).mockReturnValue({
      rpc: rpcAdmin,
    } as unknown as ReturnType<typeof createClient>)

    setAuthUser({ id: COACH_ID })
    setIsCoach(true)
    setTargetProfile({ data: { id: CLIENT_ID, role: 'client', email: CLIENT_EMAIL }, error: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetRateLimit()
  })

  // -------------------------------------------------------------------------
  // Kimlik
  // -------------------------------------------------------------------------

  it('Authorization başlığı yoksa 401 döner, hiçbir yan etki tetiklenmez', async () => {
    const response = await POST(makeRequest({ clientId: CLIENT_ID }, null))
    expect(response.status).toBe(401)
    expect(((await response.json()) as ErrorBody).error.code).toBe('NOT_AUTHENTICATED')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('geçersiz token 401 döner', async () => {
    setAuthUser(null)
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(401)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Rol doğrulaması — GÖREVİN ANA GEREKSİNİMİ
  // -------------------------------------------------------------------------

  it('rolü coach OLMAYAN (is_coach=false) kimliği doğrulanmış çağrıyı 403 ile reddeder, sıfırlama TETİKLENMEZ', async () => {
    setIsCoach(false)
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))

    expect(response.status).toBe(403)
    expect(((await response.json()) as ErrorBody).error.code).toBe('FORBIDDEN')
    // Rol reddedildiğinde hedef sorgusuna ve e-posta gönderimine HİÇ gidilmemeli.
    expect(fromProfiles).not.toHaveBeenCalled()
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('rol RPC hata dönerse (ör. bağlantı sorunu) fail-CLOSED — 403, sıfırlama tetiklenmez', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(403)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it("rol istemciden gelen gövdeden DEĞİL, sunucudaki `is_coach` RPC'sinden okunur (client-supplied role yok sayılır)", async () => {
    // Gövdede `clientId` DIŞINDA bir alan (ör. sahte bir `role: "coach"`) gönderilse bile
    // route yalnızca `clientId`'yi okur (zod şeması ekstra alanları görmezden gelir) ve
    // yetki tamamen `is_coach` RPC'sinin sonucuna bağlıdır.
    setIsCoach(false)
    const response = await POST(makeRequest({ clientId: CLIENT_ID, role: 'coach', isCoach: true }))
    expect(response.status).toBe(403)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Hedef doğrulama
  // -------------------------------------------------------------------------

  it('geçersiz UUID gövdesi 422 döner, rol/hedef kontrolüne hiç gidilmez', async () => {
    const response = await POST(makeRequest({ clientId: 'not-a-uuid' }))
    expect(response.status).toBe(422)
    expect(rpc).not.toHaveBeenCalled()
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('hedef profil bulunamazsa 404 CLIENT_NOT_FOUND döner', async () => {
    setTargetProfile({ data: null, error: null })
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(404)
    expect(((await response.json()) as ErrorBody).error.code).toBe('CLIENT_NOT_FOUND')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('hedef profil role=client DEĞİLSE (ör. başka bir koç) 404 döner — koç başka koçu sıfırlatamaz', async () => {
    setTargetProfile({
      data: { id: CLIENT_ID, role: 'coach', email: 'baska-koc@example.com' },
      error: null,
    })
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(404)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Hız sınırı
  // -------------------------------------------------------------------------

  it('AYNI (koç, danışan) çifti için art arda 4. istek 429 döner (eşik: 3/saat)', async () => {
    const first = await POST(makeRequest({ clientId: CLIENT_ID }))
    const second = await POST(makeRequest({ clientId: CLIENT_ID }))
    const third = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect([first.status, second.status, third.status]).toEqual([200, 200, 200])
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(3)

    const fourth = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(fourth.status).toBe(429)
    expect(((await fourth.json()) as ErrorBody).error.code).toBe('RESET_RATE_LIMIT_EXCEEDED')
    expect(fourth.headers.get('Retry-After')).not.toBeNull()
    // 4. istek Supabase'e HİÇ gitmemeli.
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(3)
  })

  it('koç GENELİNDE eşik (20/saat) aşılınca FARKLI danışanlar için de 429 döner', async () => {
    // Her biri FARKLI bir danışan kimliğiyle — (koç, hedef) kovasına takılmadan yalnızca
    // koç-geneli kovayı doldurmak için.
    for (let i = 0; i < 20; i++) {
      const clientId = `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`
      setTargetProfile({
        data: { id: clientId, role: 'client', email: `danisan${i}@example.com` },
        error: null,
      })
      const response = await POST(makeRequest({ clientId }))
      expect(response.status).toBe(200)
    }

    const clientId21 = '33333333-3333-4333-8333-000000000021'
    setTargetProfile({
      data: { id: clientId21, role: 'client', email: 'danisan21@example.com' },
      error: null,
    })
    const blocked = await POST(makeRequest({ clientId: clientId21 }))
    expect(blocked.status).toBe(429)
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(20)
  })

  // -------------------------------------------------------------------------
  // Denetim (public.coach_actions) — Faz 4.7
  // -------------------------------------------------------------------------

  it('kalıcı denetim satırı (`record_coach_action`) doğru parametrelerle, e-posta gönderilmeden ÖNCE yazılır', async () => {
    const callOrder: string[] = []
    rpcAdmin.mockImplementation(async () => {
      callOrder.push('record_coach_action')
      return { data: 'a0000000-0000-4000-8000-000000000000', error: null }
    })
    resetPasswordForEmail.mockImplementation(async () => {
      callOrder.push('resetPasswordForEmail')
      return { data: {}, error: null }
    })

    const response = await POST(makeRequest({ clientId: CLIENT_ID }))

    expect(response.status).toBe(200)
    expect(rpcAdmin).toHaveBeenCalledWith('record_coach_action', {
      p_action: 'password_reset_requested',
      p_actor_id: COACH_ID,
      p_target_id: CLIENT_ID,
      p_request_id: expect.any(String),
    })
    // Sıra bilinçlidir: iz bırakmadan yapılan bir müdahale, hiç yapılamayan bir
    // müdahaleden daha kötüdür (bkz. route.ts §6 karar notu).
    expect(callOrder).toEqual(['record_coach_action', 'resetPasswordForEmail'])
  })

  it('denetim satırı yazılamazsa (RPC hata) sıfırlama İPTAL edilir — e-posta HİÇ gönderilmez, 500 döner', async () => {
    rpcAdmin.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

    const response = await POST(makeRequest({ clientId: CLIENT_ID }))

    expect(response.status).toBe(500)
    expect(((await response.json()) as ErrorBody).error.code).toBe('COACH_ACTION_AUDIT_FAILED')
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('SUPABASE_SERVICE_ROLE_KEY yapılandırılmamışsa 503 döner, denetim de e-posta da tetiklenmez', async () => {
    vi.mocked(getServerEnv).mockReturnValue({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    } as unknown as ReturnType<typeof getServerEnv>)

    const response = await POST(makeRequest({ clientId: CLIENT_ID }))

    expect(response.status).toBe(503)
    expect(((await response.json()) as ErrorBody).error.code).toBe('COACH_ACTION_AUDIT_UNAVAILABLE')
    expect(rpcAdmin).not.toHaveBeenCalled()
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Başarı — bağlantı/token yanıtta ASLA dönmez
  // -------------------------------------------------------------------------

  it('başarılı tetiklemede yanıt YALNIZCA `{ ok: true }`dır — bağlantı/token/e-posta İÇERMEZ', async () => {
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual({ ok: true })
    expect(Object.keys(body)).toEqual(['ok'])

    // Yanıt gövdesinin ham metninde e-posta/URL/"link"/"token" gibi sızıntı belirtisi YOK.
    const raw = JSON.stringify(body)
    expect(raw).not.toContain(CLIENT_EMAIL)
    expect(raw.toLowerCase()).not.toContain('link')
    expect(raw.toLowerCase()).not.toContain('token')
    expect(raw).not.toContain('http')
  })

  it('Supabase`e KENDİ okuduğu danışan e-postasıyla ve allowlist`teki redirectTo ile çağrı yapılır', async () => {
    await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(resetPasswordForEmail).toHaveBeenCalledWith(CLIENT_EMAIL, {
      redirectTo: 'http://localhost:3000/reset-password',
    })
  })

  it('Supabase reddederse (örn. SMTP yapılandırılmamış) 502 döner, denetim/başarı YANLIŞ raporlanmaz', async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'SMTP not configured' },
    })
    const response = await POST(makeRequest({ clientId: CLIENT_ID }))
    expect(response.status).toBe(502)
    expect(((await response.json()) as ErrorBody).error.code).toBe('PASSWORD_RESET_FAILED')
  })
})

// ---------------------------------------------------------------------------
// B) /forgot-password — kullanıcı sayımı sızdırmayan nötr mesaj
// ---------------------------------------------------------------------------

const NEUTRAL_MESSAGE_FRAGMENT = 'Bu adres kayıtlıysa'

describe('/forgot-password — nötr mesaj (kullanıcı sayımı yok)', () => {
  it('BAŞARILI istekte nötr mesaj gösterilir (hesabın var olduğu SIZDIRILMAZ)', async () => {
    const user = userEvent.setup()
    const resetMock = vi.fn().mockResolvedValue({ data: {}, error: null })
    const supabaseClient = asSupabaseClient({ auth: { resetPasswordForEmail: resetMock } })

    renderWithProviders(createElement(ForgotPasswordPage), { supabaseClient })

    await user.type(screen.getByLabelText('E-POSTA ADRESİ'), 'var-olan@example.com')
    await user.click(screen.getByRole('button', { name: 'SIFIRLAMA BAĞLANTISI GÖNDER' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(NEUTRAL_MESSAGE_FRAGMENT)
    })
    expect(resetMock).toHaveBeenCalledTimes(1)
  })

  it('BAŞARISIZ istekte de (Supabase hata dönse bile) AYNI nötr mesaj gösterilir', async () => {
    const user = userEvent.setup()
    // Supabase Auth `resetPasswordForEmail` normalde hesap yokluğunu sızdırmaz, ama arayüz
    // katmanı BAĞIMSIZ bir güvenlik ağı olarak network/hata durumunda da aynı ekranı
    // göstermek ZORUNDADIR (bkz. `useRequestPasswordReset` doc-comment'i).
    const resetMock = vi.fn().mockRejectedValue(new Error('network error'))
    const supabaseClient = asSupabaseClient({ auth: { resetPasswordForEmail: resetMock } })

    renderWithProviders(createElement(ForgotPasswordPage), { supabaseClient })

    await user.type(screen.getByLabelText('E-POSTA ADRESİ'), 'olmayan@example.com')
    await user.click(screen.getByRole('button', { name: 'SIFIRLAMA BAĞLANTISI GÖNDER' }))

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(NEUTRAL_MESSAGE_FRAGMENT)
    })
  })

  it('geçersiz e-posta biçiminde İSTEK HİÇ GÖNDERİLMEZ (istemci doğrulaması engelliyor)', async () => {
    const user = userEvent.setup()
    const resetMock = vi.fn()
    const supabaseClient = asSupabaseClient({ auth: { resetPasswordForEmail: resetMock } })

    renderWithProviders(createElement(ForgotPasswordPage), { supabaseClient })

    await user.type(screen.getByLabelText('E-POSTA ADRESİ'), 'gecersiz-eposta')
    await user.click(screen.getByRole('button', { name: 'SIFIRLAMA BAĞLANTISI GÖNDER' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Geçerli bir e-posta adresi girin.')
    })
    expect(resetMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// C) /reset-password — geçersiz bağlantı ve başarılı akış
// ---------------------------------------------------------------------------

describe('/reset-password', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('bağlantı hash`inde `error_code=otp_expired` VARSA anlaşılır Türkçe hata gösterir, form ÇIKMAZ', async () => {
    window.location.hash =
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

    const supabaseClient = asSupabaseClient({
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    })

    renderWithProviders(createElement(ResetPasswordPage), { supabaseClient })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('süresi dolmuş')
    })
    expect(screen.queryByLabelText('YENİ ŞİFRE')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'YENİ BAĞLANTI İSTE' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('geçerli kurtarma oturumu kurulduğunda form gösterilir ve `updateUser` çağrılır', async () => {
    const user = userEvent.setup()
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const supabaseClient = asSupabaseClient({
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { user: { id: 'recovered-user' } } } }),
        updateUser,
      },
    })

    renderWithProviders(createElement(ResetPasswordPage), { supabaseClient })

    const passwordInput = await screen.findByLabelText('YENİ ŞİFRE')
    await user.type(passwordInput, 'YeniSifre123')
    await user.click(screen.getByRole('button', { name: 'ŞİFREYİ GÜNCELLE' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: 'YeniSifre123' })
    })
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Şifreniz güncellendi.')
    })
  })
})
