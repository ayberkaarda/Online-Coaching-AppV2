// Faz 4.7 dilim 1 — TOTP MFA arayüzü (`SecuritySection`, `CoachMfaGate`).
//
// `@repo/api-client` KASITLI OLARAK mock'lanmaz (progress-photos.test.tsx ile aynı desen):
// sahte bir Supabase istemcisi enjekte edilir, böylece `useMfa.ts` içindeki gerçek hook
// mantığı (listFactors/getAuthenticatorAssuranceLevel yorumu, challenge+verify sırası,
// stale faktör temizliği) da ölçülür — yalnızca bileşenin sunumu değil.
//
// KAPSAM:
//   1) Faktör yokken "Kurulumu Başlat" -> enroll() çağrılır; secret DÜZ METİN görünür,
//      QR <img> src'i 'data:' ile başlar.
//   2) 6 haneden kısa kodda "Doğrula ve Etkinleştir" disabled; 6 hane girilince etkin;
//      tıklanınca challenge() ARDINDAN verify() doğru factorId/challengeId/code ile çağrılır.
//   3) Kod alanına '12 34-56' yazılınca alanda '123456' görünür (normalize).
//   4) hasVerifiedFactor + currentLevel 'aal1' + nextLevel 'aal2' -> kayıt DEĞİL, seviye
//      yükseltme ekranı.
//   5) aal2 -> faktör listesi + "Kaldır"; onaydan sonra unenroll() doğru factorId ile çağrılır.
//   6) CoachMfaGate: is_coach true + doğrulanmamış -> replace('/profile#guvenlik').
//      is_coach false (danışan) -> replace HİÇ çağrılmaz (regresyon kapısı).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'

// `vi.mock` fabrikaları hoist edilir; `replaceMock`'a dosya genelinde erişebilmek için
// `vi.hoisted` ile tanımlanır (aksi hâlde "cannot access before initialization").
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}))

import { SecuritySection } from '@/components/security/SecuritySection'
import { CoachMfaGate } from '@/components/security/CoachMfaGate'

import { asSupabaseClient, renderWithProviders, userEvent } from './test-utils'

interface MockFactor {
  id: string
  friendly_name?: string
  factor_type: 'totp'
  status: 'verified' | 'unverified'
  created_at: string
  updated_at: string
}

const DEFAULT_ENROLLMENT = {
  id: 'factor-new',
  totp: {
    qr_code: 'data:image/png;base64,FAKE_QR_BYTES',
    secret: 'JBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/Coaching%20Hub:koc@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Coaching%20Hub',
  },
}

/** Testin ihtiyacına göre uçtan uca sahte bir Supabase istemcisi kurar. */
function buildSupabaseMock(
  options: {
    factors?: MockFactor[]
    currentLevel?: string | null
    nextLevel?: string | null
    isCoach?: boolean
    enrollResult?: typeof DEFAULT_ENROLLMENT
  } = {}
) {
  const factors = options.factors ?? []

  const listFactors = vi
    .fn()
    .mockResolvedValue({ data: { all: factors, totp: factors, phone: [] }, error: null })
  const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
    data: {
      currentLevel: options.currentLevel ?? 'aal1',
      nextLevel: options.nextLevel ?? 'aal1',
    },
    error: null,
  })
  const enroll = vi
    .fn()
    .mockResolvedValue({ data: options.enrollResult ?? DEFAULT_ENROLLMENT, error: null })
  const challenge = vi.fn().mockResolvedValue({ data: { id: 'challenge-1' }, error: null })
  const verify = vi.fn().mockResolvedValue({ data: {}, error: null })
  const unenroll = vi.fn().mockResolvedValue({ data: {}, error: null })
  const getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
    error: null,
  })
  const onAuthStateChange = vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }))
  const rpc = vi.fn().mockResolvedValue({ data: options.isCoach ?? false, error: null })

  const client = asSupabaseClient({
    auth: {
      mfa: {
        listFactors,
        getAuthenticatorAssuranceLevel,
        enroll,
        challenge,
        verify,
        unenroll,
      },
      getSession,
      onAuthStateChange,
    },
    rpc,
  })

  return {
    client,
    listFactors,
    getAuthenticatorAssuranceLevel,
    enroll,
    challenge,
    verify,
    unenroll,
    getSession,
    rpc,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1) Kayıt akışı: enroll() -> secret düz metin + QR data: adresi
// ---------------------------------------------------------------------------
describe('SecuritySection — kayıt akışı (faktör yok)', () => {
  it('"Kurulumu Başlat" tıklanınca enroll() çağrılır; secret düz metin görünür, QR data: ile başlar', async () => {
    const { client, enroll } = buildSupabaseMock({ factors: [] })
    const user = userEvent.setup()

    renderWithProviders(<SecuritySection />, { supabaseClient: client })

    const startButton = await screen.findByRole('button', { name: 'Kurulumu Başlat' })
    await user.click(startButton)

    await waitFor(() => expect(enroll).toHaveBeenCalledTimes(1))

    expect(await screen.findByText(DEFAULT_ENROLLMENT.totp.secret)).toBeInTheDocument()

    const qrImage = screen.getByAltText('TOTP kurulum QR kodu') as HTMLImageElement
    expect(qrImage.src.startsWith('data:')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2) Doğrulama: kısa kodda disabled, 6 hanede etkin, challenge -> verify sırası
// ---------------------------------------------------------------------------
describe('SecuritySection — kayıt doğrulaması', () => {
  it('6 haneden kısa kodda "Doğrula ve Etkinleştir" disabled; 6 hanede etkinleşir ve challenge ardından verify çağrılır', async () => {
    const { client, challenge, verify } = buildSupabaseMock({ factors: [] })
    const user = userEvent.setup()

    renderWithProviders(<SecuritySection />, { supabaseClient: client })

    await user.click(await screen.findByRole('button', { name: 'Kurulumu Başlat' }))
    await screen.findByText(DEFAULT_ENROLLMENT.totp.secret)

    const codeInput = screen.getByLabelText('Kimlik doğrulayıcı uygulamadaki 6 haneli kod')
    const verifyButton = screen.getByRole('button', { name: 'Doğrula ve Etkinleştir' })

    expect(verifyButton).toBeDisabled()

    await user.type(codeInput, '123')
    expect(verifyButton).toBeDisabled()

    await user.type(codeInput, '456')
    expect(verifyButton).toBeEnabled()

    await user.click(verifyButton)

    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
    expect(challenge).toHaveBeenCalledWith({ factorId: DEFAULT_ENROLLMENT.id })
    expect(verify).toHaveBeenCalledWith({
      factorId: DEFAULT_ENROLLMENT.id,
      challengeId: 'challenge-1',
      code: '123456',
    })
  })

  it('kod alanına "12 34-56" yazılınca alanda "123456" görünür (normalize)', async () => {
    const { client } = buildSupabaseMock({ factors: [] })
    const user = userEvent.setup()

    renderWithProviders(<SecuritySection />, { supabaseClient: client })

    await user.click(await screen.findByRole('button', { name: 'Kurulumu Başlat' }))
    await screen.findByText(DEFAULT_ENROLLMENT.totp.secret)

    const codeInput = screen.getByLabelText(
      'Kimlik doğrulayıcı uygulamadaki 6 haneli kod'
    ) as HTMLInputElement
    await user.type(codeInput, '12 34-56')

    expect(codeInput.value).toBe('123456')
  })
})

// ---------------------------------------------------------------------------
// 4) Doğrulanmış faktör var ama oturum aal1 -> seviye yükseltme (kayıt DEĞİL)
// ---------------------------------------------------------------------------
describe('SecuritySection — seviye yükseltme (needsStepUp)', () => {
  it('hasVerifiedFactor + aal1/aal2 kombinasyonunda kayıt yerine seviye yükseltme ekranı görünür', async () => {
    const verifiedFactor: MockFactor = {
      id: 'factor-verified',
      factor_type: 'totp',
      status: 'verified',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    }
    const { client } = buildSupabaseMock({
      factors: [verifiedFactor],
      currentLevel: 'aal1',
      nextLevel: 'aal2',
    })

    renderWithProviders(<SecuritySection />, { supabaseClient: client })

    expect(await screen.findByText(/Oturumunuz doğrulanmadı\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kurulumu Başlat' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Doğrula' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5) aal2 -> faktör listesi + kaldırma
// ---------------------------------------------------------------------------
describe('SecuritySection — faktör listesi (aal2)', () => {
  it('faktörler listelenir; "Kaldır" -> onay -> unenroll() doğru factorId ile çağrılır', async () => {
    const verifiedFactor: MockFactor = {
      id: 'factor-verified',
      friendly_name: 'iPhone 15',
      factor_type: 'totp',
      status: 'verified',
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    }
    const { client, unenroll } = buildSupabaseMock({
      factors: [verifiedFactor],
      currentLevel: 'aal2',
      nextLevel: 'aal2',
    })
    const user = userEvent.setup()

    renderWithProviders(<SecuritySection />, { supabaseClient: client })

    expect(await screen.findByText('iPhone 15')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'iPhone 15 faktörünü kaldır' }))
    expect(screen.getByText('Emin misiniz?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Evet, kaldır' }))

    await waitFor(() => expect(unenroll).toHaveBeenCalledWith({ factorId: 'factor-verified' }))
  })
})

// ---------------------------------------------------------------------------
// 6) CoachMfaGate — koçu etkiler, danışanı ASLA etkilemez (regresyon kapısı)
// ---------------------------------------------------------------------------
describe('CoachMfaGate', () => {
  it('koç + doğrulanmış faktör yok -> router.replace("/profile#guvenlik") çağrılır', async () => {
    const { client, rpc } = buildSupabaseMock({
      factors: [],
      currentLevel: 'aal1',
      nextLevel: 'aal1',
      isCoach: true,
    })

    renderWithProviders(<CoachMfaGate />, { supabaseClient: client })

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('is_coach', {}))
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/profile#guvenlik'))
  })

  it('danışan (is_coach=false) -> router.replace HİÇ çağrılmaz', async () => {
    const { client, rpc } = buildSupabaseMock({
      factors: [],
      currentLevel: 'aal1',
      nextLevel: 'aal1',
      isCoach: false,
    })

    renderWithProviders(<CoachMfaGate />, { supabaseClient: client })

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('is_coach', {}))
    // Sorgular tamamlandıktan sonra da tetiklenmediğini doğrulamak için kısa bir bekleme
    // (React state güncellemeleri `act` içinde, "not wrapped in act" uyarısı olmadan).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
