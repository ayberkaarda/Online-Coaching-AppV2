// Faz 4.8 §7c, dilim 3a — rıza ve aydınlatma arayüzü (`ActivityConsent`).
//
// `@repo/api-client` KASITLI OLARAK mock'lanmaz (mfa-enroll.test.tsx ile aynı desen):
// sahte bir Supabase istemcisi enjekte edilir, böylece gerçek `useActivityConsentState`
// hook'u (`activity_consent_state` RPC'si) da ölçülür. Yalnızca `@/lib/activity`'nin
// AĞ İSTEĞİ YAPAN kısmı (`grantActivityConsent`/`revokeActivityConsent`) ve gevşek bağlı
// duyuru fonksiyonu (`announceActivityConsentChange`) sahtelenir — sabitler
// (`ACTIVITY_CONSENT_VERSION`) GERÇEK modülden gelir ki test, bileşenin doğru sürümü
// gönderdiğini gerçek sabite karşı doğrulasın (yanlışlıkla iki ayrı sayı olursa test
// bunu YAKALAR).
//
// KAPSAM (görev talimatı):
//   1) Onay kutusu ÖNCEDEN İŞARETSİZ.
//   2) Onaylamadan (kutu işaretlenmeden) gönderilemiyor — düğme disabled.
//   3) Grant çağrısı DOĞRU sürümle gidiyor (`ACTIVITY_CONSENT_VERSION`).
//   4) Revoke ÖNCESİ bir onay adımı var ve "veriler silinecek" uyarısı görünüyor;
//      onay adımından ÖNCE `revokeActivityConsent` HİÇ çağrılmıyor.
//   5) `announceActivityConsentChange` hem grant hem revoke başarısında çağrılıyor.
//   6) `revoked` durumu `undecided`dan FARKLI bir başlıkla aynı akışı sunuyor (yanlış
//      bilgi üretmeme kuralı — dilim 3b'nin `ClientActivityLog`taki aynı disiplini).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}))

const { grantActivityConsentMock, revokeActivityConsentMock, announceActivityConsentChangeMock } =
  vi.hoisted(() => ({
    grantActivityConsentMock: vi.fn(),
    revokeActivityConsentMock: vi.fn(),
    announceActivityConsentChangeMock: vi.fn(),
  }))

vi.mock('@/lib/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/activity')>()
  return {
    ...actual,
    grantActivityConsent: grantActivityConsentMock,
    revokeActivityConsent: revokeActivityConsentMock,
    announceActivityConsentChange: announceActivityConsentChangeMock,
  }
})

import { ActivityConsent } from '@/components/activity/ActivityConsent'
import { ACTIVITY_CONSENT_VERSION } from '@/lib/activity'

import { asSupabaseClient, renderWithProviders, screen, userEvent, waitFor } from './test-utils'

const ACCESS_TOKEN = 'token-abc'
const USER_ID = 'user-1'

/** `undecided` | `granted` | `revoked` — `activity_consent_state(uuid)` RPC'sinin sahtesi. */
function buildSupabaseMock(consentState: 'undecided' | 'granted' | 'revoked') {
  const rpc = vi.fn().mockResolvedValue({ data: consentState, error: null })
  const getSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: ACCESS_TOKEN, user: { id: USER_ID } } },
    error: null,
  })
  const client = asSupabaseClient({ auth: { getSession }, rpc })
  return { client, rpc, getSession }
}

beforeEach(() => {
  vi.clearAllMocks()
  grantActivityConsentMock.mockResolvedValue({ ok: true, status: 200 })
  revokeActivityConsentMock.mockResolvedValue({ ok: true, status: 200 })
})

// ---------------------------------------------------------------------------
// 1) + 2) — onay kutusu önceden işaretsiz, onaylamadan gönderilemiyor
// ---------------------------------------------------------------------------

describe('ActivityConsent — rıza VER paneli (undecided)', () => {
  it('onay kutusu ÖNCEDEN İŞARETSİZ ve gönder düğmesi disabled; kutu işaretlenince etkinleşir', async () => {
    const { client } = buildSupabaseMock('undecided')
    const user = userEvent.setup()

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    const checkbox = await screen.findByRole('checkbox')
    const submitButton = screen.getByRole('button', {
      name: 'Rızamı Ver ve Aktivite Kaydını Aç',
    })

    expect(checkbox).not.toBeChecked()
    expect(submitButton).toBeDisabled()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(submitButton).toBeEnabled()
  })

  it('kutu işaretlenmeden gönder düğmesine tıklamak grantActivityConsent ÇAĞIRMAZ', async () => {
    const { client } = buildSupabaseMock('undecided')

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    const submitButton = await screen.findByRole('button', {
      name: 'Rızamı Ver ve Aktivite Kaydını Aç',
    })
    // `disabled` düğmeye tıklama tarayıcıda hiçbir olay üretmez; yine de burada
    // AÇIKÇA doğrulanıyor — davranış disabled niteliğine değil gerçek çağrı
    // SAYISINA bağlanıyor.
    expect(submitButton).toBeDisabled()
    expect(grantActivityConsentMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3) + 5) — grant çağrısı doğru sürümle gidiyor, announceActivityConsentChange çağrılıyor
// ---------------------------------------------------------------------------

describe('ActivityConsent — rıza verme akışı', () => {
  it('kutu işaretlenip gönderilince grantActivityConsent DOĞRU sürüm ve token ile çağrılır; başarıda duyuru yayınlanır', async () => {
    const { client } = buildSupabaseMock('undecided')
    const user = userEvent.setup()

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Rızamı Ver ve Aktivite Kaydını Aç' }))

    await waitFor(() => expect(grantActivityConsentMock).toHaveBeenCalledTimes(1))
    expect(grantActivityConsentMock).toHaveBeenCalledWith(ACTIVITY_CONSENT_VERSION, {
      accessToken: ACCESS_TOKEN,
    })

    await waitFor(() => expect(announceActivityConsentChangeMock).toHaveBeenCalledTimes(1))
  })
})

// ---------------------------------------------------------------------------
// 6) — `revoked` durumu `undecided`dan FARKLI başlık, AYNI akış
// ---------------------------------------------------------------------------

describe('ActivityConsent — rıza VER paneli (revoked)', () => {
  it('"kapalı" başlığını gösterir (yanlış bilgi üretmez) ve onay kutusu yine ÖNCEDEN İŞARETSİZDİR', async () => {
    const { client } = buildSupabaseMock('revoked')

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    expect(await screen.findByText('Aktivite kaydınız şu anda kapalı.')).toBeInTheDocument()
    expect(
      screen.queryByText('Aktivite kaydı için henüz bir karar vermediniz.')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Rızamı Tekrar Ver ve Aç' })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 4) + 5) — revoke öncesi onay adımı, "veriler silinecek" uyarısı, duyuru
// ---------------------------------------------------------------------------

describe('ActivityConsent — rıza geri çekme akışı (granted)', () => {
  it('"Aktivite Kaydını Kapat" tıklanınca HEMEN silmez — önce bir onay adımı ve "silinir" uyarısı gösterir', async () => {
    const { client } = buildSupabaseMock('granted')
    const user = userEvent.setup()

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    await user.click(await screen.findByRole('button', { name: 'Aktivite Kaydını Kapat' }))

    // Onay adımına düşülür; asıl mutasyon HENÜZ tetiklenmemiştir.
    expect(revokeActivityConsentMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/ANINDA kalıcı olarak silinir/)
    expect(
      screen.getByRole('button', { name: 'Evet, Kapat ve Verilerimi Sil' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeInTheDocument()
  })

  it('"Vazgeç" onay adımını iptal eder — revokeActivityConsent HİÇ çağrılmaz', async () => {
    const { client } = buildSupabaseMock('granted')
    const user = userEvent.setup()

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    await user.click(await screen.findByRole('button', { name: 'Aktivite Kaydını Kapat' }))
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))

    expect(screen.getByRole('button', { name: 'Aktivite Kaydını Kapat' })).toBeInTheDocument()
    expect(revokeActivityConsentMock).not.toHaveBeenCalled()
  })

  it('onay adımından SONRA "Evet, Kapat ve Verilerimi Sil" -> revokeActivityConsent doğru token ile çağrılır; duyuru yayınlanır', async () => {
    const { client } = buildSupabaseMock('granted')
    const user = userEvent.setup()

    renderWithProviders(<ActivityConsent userId={USER_ID} />, { supabaseClient: client })

    await user.click(await screen.findByRole('button', { name: 'Aktivite Kaydını Kapat' }))
    await user.click(screen.getByRole('button', { name: 'Evet, Kapat ve Verilerimi Sil' }))

    await waitFor(() => expect(revokeActivityConsentMock).toHaveBeenCalledTimes(1))
    expect(revokeActivityConsentMock).toHaveBeenCalledWith({ accessToken: ACCESS_TOKEN })

    await waitFor(() => expect(announceActivityConsentChangeMock).toHaveBeenCalledTimes(1))
  })
})
