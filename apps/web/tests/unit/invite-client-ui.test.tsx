import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.9 dilim 2 — danışan davet FORMUNUN (arayüz) birim testleri.
//
// Sunucu ucu (`/api/coach/invite-client`) ve hız sınırı/aal2/rol mantığı
// `invite-client.test.ts`te ÖLÇÜLÜR — BU dosyanın kapsamı DEĞİLDİR. Burada
// yalnızca `InviteClientForm` bileşeninin GERÇEK `useInviteClient` hook'unu
// (mocklanmamış) çağırdığı, `fetch`i doğru gövdeyle tetiklediği ve sunucudan
// dönen `ApiError`ları (409/403 MFA_REQUIRED/429) anlaşılır Türkçe metne
// çevirdiği ölçülür — `api-client.test.ts`teki `apiFetch` fetch-mock deseni
// izlenir (`vi.stubGlobal('fetch', ...)` + `makeResponse`).
//
// `@repo/api-client` KASITLI OLARAK mock'lanmaz (mfa-enroll.test.tsx ile aynı
// desen): sahte bir Supabase istemcisi (`getSession`) enjekte edilir, gerçek
// `useInviteClient` -> `apiFetch` -> `fetch` zinciri uçtan uca çalışır.

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { InviteClientForm } from '@/components/InviteClientForm'

import { asSupabaseClient, renderWithProviders } from './test-utils'

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

function errorBody(code: string, message: string): string {
  return JSON.stringify({ error: { code, message, request_id: 'req-1' } })
}

const ACCESS_TOKEN = 'fake-access-token'

function buildSupabaseMock() {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: ACCESS_TOKEN, user: { id: 'coach-1' } } },
    error: null,
  })
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }))
  return { client: asSupabaseClient({ auth: { getSession, onAuthStateChange } }), getSession }
}

async function fillAndSubmit(options: { email?: string; fullName?: string } = {}): Promise<void> {
  const user = userEvent.setup()
  if (options.email) {
    await user.type(screen.getByLabelText('E-posta'), options.email)
  }
  if (options.fullName) {
    await user.type(screen.getByLabelText('Ad Soyad (opsiyonel)'), options.fullName)
  }
  await user.click(screen.getByRole('button', { name: /Davet Gönder/ }))
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  // `renderWithProviders` sarmalayıcısı `next-themes`in `ThemeProvider`ını da kurar; o
  // `window.matchMedia`ya bağımlıdır ve jsdom'da varsayılan YOKTUR (`CoachUserManagement.
  // test.tsx`teki AYNI gerekçe/çözüm).
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// A) Boş e-postayla gönderim ENGELLENİR
// ---------------------------------------------------------------------------

describe('InviteClientForm — istemci doğrulaması', () => {
  it('e-posta boşken "Davet Gönder" tıklanırsa istek HİÇ gönderilmez, alan hatası gösterilir', async () => {
    const { client } = buildSupabaseMock()
    renderWithProviders(<InviteClientForm />, { supabaseClient: client })

    await fillAndSubmit()

    await waitFor(() => {
      expect(screen.getByText('E-posta adresi zorunludur.')).toBeInTheDocument()
    })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// B) Başarılı gönderim — doğru gövde, doğru başlık, bağlantı/token GÖSTERİLMEZ
// ---------------------------------------------------------------------------

describe('InviteClientForm — başarılı gönderim', () => {
  it('uç `/api/coach/invite-client`e doğru gövde ve Authorization başlığıyla POST edilir; başarı metni gösterilir, bağlantı/token YOK', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ status: 200, body: JSON.stringify({ ok: true }) })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })

    await fillAndSubmit({ email: 'danisan@ornek.com', fullName: 'Ayşe Yılmaz' })

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    })

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(url).toBe('/api/coach/invite-client')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'danisan@ornek.com',
      full_name: 'Ayşe Yılmaz',
    })
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Davet e-postası gönderildi.')
    })

    // Yanıtta bağlantı/token YOK ({ ok: true } dışında hiçbir şey) — ekranda da
    // hiçbir URL/token benzeri metin GÖRÜNMEZ.
    expect(screen.queryByText(/https?:\/\//)).not.toBeInTheDocument()
    expect(screen.queryByText(/token/i)).not.toBeInTheDocument()
  })

  it('ad soyad boş bırakılırsa gövdede `full_name` alanı GÖNDERİLMEZ', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({ status: 200, body: JSON.stringify({ ok: true }) })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })

    await fillAndSubmit({ email: 'danisan2@ornek.com' })

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1))
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? []
    const sentBody = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(sentBody).toEqual({ email: 'danisan2@ornek.com' })
    expect('full_name' in sentBody).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// C) Sunucu hataları — 409 / 403 MFA_REQUIRED / 429 doğru Türkçe metne çevrilir
// ---------------------------------------------------------------------------

describe('InviteClientForm — hata durumları', () => {
  it('409 EMAIL_ALREADY_REGISTERED -> "zaten kayıtlı" mesajı gösterilir', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({
        status: 409,
        body: errorBody(
          'EMAIL_ALREADY_REGISTERED',
          'Bu e-posta adresi zaten kayıtlı. Danışan listenizden kontrol edin.'
        ),
      })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })
    await fillAndSubmit({ email: 'zaten-var@ornek.com' })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('zaten kayıtlı')
    })
    // 409'da Güvenlik bölümü bağlantısı GÖSTERİLMEZ (yalnızca MFA_REQUIRED'a özgü).
    expect(screen.queryByRole('link', { name: 'Güvenlik bölümüne git' })).not.toBeInTheDocument()
  })

  it('403 MFA_REQUIRED -> iki adımlı doğrulama mesajı VE Güvenlik bölümüne bağlantı gösterilir', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({
        status: 403,
        body: errorBody(
          'MFA_REQUIRED',
          'Danışan davet etmek için oturumunuzun iki adımlı doğrulamadan geçmiş olması gerekir.'
        ),
      })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })
    await fillAndSubmit({ email: 'herhangi@ornek.com' })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('iki adımlı doğrulama')
    })
    expect(screen.getByRole('link', { name: 'Güvenlik bölümüne git' })).toHaveAttribute(
      'href',
      '/profile#guvenlik'
    )
  })

  it('429 hız sınırı -> bekleme metni gösterilir', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({
        status: 429,
        body: errorBody(
          'INVITE_RATE_LIMIT_EXCEEDED',
          'Bu e-posta adresine kısa süre içinde zaten davet gönderildi. Lütfen daha sonra tekrar deneyin.'
        ),
      })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })
    await fillAndSubmit({ email: 'yine@ornek.com' })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('daha sonra tekrar deneyin')
    })
  })

  it('503 yapılandırma eksik -> yapılandırma mesajı gösterilir', async () => {
    const { client } = buildSupabaseMock()
    vi.mocked(fetch).mockResolvedValue(
      makeResponse({
        status: 503,
        body: errorBody(
          'COACH_ACTION_AUDIT_UNAVAILABLE',
          'Bu işlem şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.'
        ),
      })
    )

    renderWithProviders(<InviteClientForm />, { supabaseClient: client })
    await fillAndSubmit({ email: 'ucuncu@ornek.com' })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('yapılandırılmamış')
    })
  })
})
