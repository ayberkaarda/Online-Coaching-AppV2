// Faz 4.8 dilim 2 — İSTEMCİ HEARTBEAT'İNİN birim testleri.
//
// Kapsam:
//   * `createActivityController` durum makinesi: 60 sn tik, görünürlük, sekme
//     süresi (`duration_sec`), 204/401/429 davranışı, otomatik sinyal boğma.
//   * `postActivitySignal` taşıma katmanı: `fetch(keepalive)`, `sendBeacon` YOK,
//     `Authorization` başlığı, HTTP kodlarının sonuçlara eşlenmesi.
//   * `emit.ts` kapısı: alıcı yokken SESSİZ NO-OP (bileşenler bu yüzden güvenle
//     `recordActivityEvent` çağırabiliyor).
//   * `ActivityTracker`: rıza kapalıyken SIFIR ağ trafiği.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { render, waitFor } from '@testing-library/react'

import { SupabaseClientProvider } from '@repo/api-client/context'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@repo/types'

import {
  HEARTBEAT_INTERVAL_MS,
  MAX_BACKOFF_MS,
  MIN_AUTO_SIGNAL_GAP_MS,
  createActivityController,
  type ActivityPostOutcome,
} from '@/lib/activity/controller'
import type { ActivityBody } from '@/lib/activity/contract'
import {
  ACTIVITY_CONSENT_CHANGED_EVENT,
  announceActivityConsentChange,
  recordActivityEvent,
  recordTabView,
  registerActivitySink,
} from '@/lib/activity/emit'
import {
  ACTIVITY_CONSENT_ENDPOINT,
  ACTIVITY_ENDPOINT,
  grantActivityConsent,
  postActivitySignal,
  revokeActivityConsent,
} from '@/lib/activity/transport'
import { ActivityTracker } from '@/lib/activity/tracker'

const SESSION_A = '55555555-5555-4555-8555-555555555555'
const SESSION_B = '66666666-6666-4666-8666-666666666666'
const USER_ID = '77777777-7777-4777-8777-777777777777'

/** Sahte saat + sahte taşıma ile denetleyici kurar. */
function makeHarness(outcome: () => ActivityPostOutcome = () => ({ kind: 'error' })) {
  let clock = 1_000_000
  const calls: Array<{ body: ActivityBody; keepalive: boolean }> = []
  let stored: string | null = null
  const onDenied = vi.fn()

  const controller = createActivityController({
    now: () => clock,
    loadSessionId: () => stored,
    saveSessionId: (value) => {
      stored = value
    },
    post: async (body, options) => {
      calls.push({ body, keepalive: options.keepalive })
      return outcome()
    },
    onDenied,
  })

  return {
    controller,
    calls,
    onDenied,
    advance: (ms: number) => {
      clock += ms
    },
    seedStorage: (value: string | null) => {
      stored = value
    },
    readStorage: () => stored,
    /** Fire-and-forget `post` zincirinin çözülmesini bekler. */
    flush: async () => {
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

// ---------------------------------------------------------------------------
// Durum makinesi
// ---------------------------------------------------------------------------

describe('createActivityController', () => {
  it('start(): elindeki oturum kimliğiyle SAF HEARTBEAT gönderir (olay yok)', () => {
    const h = makeHarness()
    h.seedStorage(SESSION_A)
    h.controller.start()

    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]?.body).toEqual({ session_id: SESSION_A, platform: 'web' })
    expect(h.calls[0]?.keepalive).toBe(false)
  })

  it('200 sonrası sunucunun oturum kimliği BENİMSENİR ve saklanır', async () => {
    const h = makeHarness(() => ({ kind: 'ok', sessionId: SESSION_B, sessionStarted: true }))
    h.seedStorage(SESSION_A)
    h.controller.start()
    await h.flush()

    expect(h.readStorage()).toBe(SESSION_B)
    expect(h.controller.snapshot().sessionId).toBe(SESSION_B)
  })

  it('otomatik sinyaller boğulur, KULLANICI OLAYLARI boğulmaz', () => {
    const h = makeHarness()
    h.controller.start()
    expect(h.calls).toHaveLength(1)

    // Boğma penceresi içinde: ikinci otomatik sinyal DÜŞER.
    h.advance(MIN_AUTO_SIGNAL_GAP_MS - 1)
    h.controller.tick()
    expect(h.calls).toHaveLength(1)

    // Aynı pencerede bir KULLANICI olayı yine de gider — düşürülmesi veri kaybı olurdu.
    h.controller.event('message_sent')
    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]?.body.event).toBe('message_sent')

    // Pencere geçince otomatik sinyal yeniden serbest.
    h.advance(MIN_AUTO_SIGNAL_GAP_MS)
    h.controller.tick()
    expect(h.calls).toHaveLength(3)
  })

  it('60 sn’lik tik aralığı §7c ile aynıdır', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(60_000)
  })

  it('sekme değişiminde ÖNCEKİ sekmenin `tab_view` satırı süresiyle KAPATILIR', () => {
    const h = makeHarness()
    h.controller.start()
    h.controller.tab('formCheck')
    expect(h.calls).toHaveLength(1) // ilk sekmede kapatılacak bir şey yok

    h.advance(42_000)
    h.controller.tab('messages')

    expect(h.calls).toHaveLength(2)
    expect(h.calls[1]?.body).toMatchObject({
      event: 'tab_view',
      tab: 'formCheck',
      duration_sec: 42,
    })
    expect(h.controller.snapshot().currentTab).toBe('messages')
  })

  it('aynı sekme yeniden bildirilirse sinyal ÜRETİLMEZ', () => {
    const h = makeHarness()
    h.controller.start()
    h.controller.tab('daily')
    const before = h.calls.length
    h.controller.tab('daily')
    expect(h.calls).toHaveLength(before)
  })

  it('onHidden(): açık sekme süresi keepalive ile kapatılır, sekme ADI korunur', () => {
    const h = makeHarness()
    h.controller.start()
    h.controller.tab('workout')

    h.advance(10_000)
    h.controller.onHidden({ keepalive: true })

    const last = h.calls[h.calls.length - 1]
    expect(last?.body).toMatchObject({ event: 'tab_view', tab: 'workout', duration_sec: 10 })
    expect(last?.keepalive).toBe(true)
    // Geri dönüldüğünde aynı sekmede YENİ bir pencere başlar.
    expect(h.controller.snapshot().currentTab).toBe('workout')
  })

  it('onVisible(): süre sayacı SIFIRLANIR — arka planda geçen süre sayılmaz', () => {
    const h = makeHarness()
    h.controller.start()
    h.controller.tab('stats')

    h.advance(5_000)
    h.controller.onHidden()
    h.advance(600_000) // arka planda 10 dk
    h.controller.onVisible()
    h.advance(3_000)
    h.controller.onHidden()

    const durations = h.calls
      .filter((c) => c.body.event === 'tab_view')
      .map((c) => c.body.duration_sec)
    expect(durations).toEqual([5, 3])
  })

  it('204 (denied): oturum kimliği ATILIR, denetleyici DURUR ve onDenied çağrılır', async () => {
    const h = makeHarness(() => ({ kind: 'denied' }))
    h.seedStorage(SESSION_A)
    h.controller.start()
    await h.flush()

    expect(h.readStorage()).toBeNull()
    expect(h.onDenied).toHaveBeenCalledTimes(1)
    expect(h.controller.snapshot().running).toBe(false)

    const before = h.calls.length
    h.advance(HEARTBEAT_INTERVAL_MS)
    h.controller.tick()
    expect(h.calls).toHaveLength(before)
  })

  it('401: denetleyici durur, yeni sinyal gitmez', async () => {
    const h = makeHarness(() => ({ kind: 'unauthenticated' }))
    h.controller.start()
    await h.flush()

    const before = h.calls.length
    h.advance(HEARTBEAT_INTERVAL_MS)
    h.controller.tick()
    expect(h.calls).toHaveLength(before)
  })

  it('429: Retry-After boyunca susulur, sonra devam edilir', async () => {
    const h = makeHarness(() => ({ kind: 'rate-limited', retryAfterMs: 30_000 }))
    h.controller.start()
    await h.flush()

    const before = h.calls.length
    h.advance(20_000)
    h.controller.tick()
    expect(h.calls).toHaveLength(before) // hâlâ askıda

    h.advance(15_000)
    h.controller.tick()
    expect(h.calls.length).toBeGreaterThan(before)
  })

  it('429: saçma bir Retry-After tavanla sınırlanır', async () => {
    const h = makeHarness(() => ({ kind: 'rate-limited', retryAfterMs: 10 * MAX_BACKOFF_MS }))
    h.controller.start()
    await h.flush()

    const { suspendedUntil } = h.controller.snapshot()
    expect(suspendedUntil).toBeLessThanOrEqual(1_000_000 + MAX_BACKOFF_MS)
  })

  it('ağ hatası tek sinyali düşürür ama durum makinesini BOZMAZ', async () => {
    const h = makeHarness(() => ({ kind: 'error' }))
    h.controller.start()
    await h.flush()

    expect(h.controller.snapshot().running).toBe(true)
    h.advance(HEARTBEAT_INTERVAL_MS)
    h.controller.tick()
    expect(h.calls).toHaveLength(2)
  })

  it('start() ÇAĞRILMADAN hiçbir sinyal gitmez', () => {
    const h = makeHarness()
    h.controller.event('login')
    h.controller.tick()
    expect(h.calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Taşıma katmanı
// ---------------------------------------------------------------------------

describe('postActivitySignal', () => {
  const body: ActivityBody = { platform: 'web', session_id: null }

  function fetchReturning(response: Response): typeof fetch {
    return vi.fn(async () => response) as unknown as typeof fetch
  }

  it('`fetch(keepalive)` + Bearer kullanır; sendBeacon’a HİÇ dokunmaz', async () => {
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ session_id: SESSION_A, session_started: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof fetch

    const outcome = await postActivitySignal(body, {
      accessToken: 'tok',
      keepalive: true,
      fetchImpl,
    })

    expect(outcome).toEqual({ kind: 'ok', sessionId: SESSION_A, sessionStarted: false })
    expect(beacon).not.toHaveBeenCalled()

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(ACTIVITY_ENDPOINT)
    expect(init.keepalive).toBe(true)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('204 -> denied', async () => {
    const outcome = await postActivitySignal(body, {
      accessToken: 'tok',
      keepalive: false,
      fetchImpl: fetchReturning(new Response(null, { status: 204 })),
    })
    expect(outcome).toEqual({ kind: 'denied' })
  })

  it('401 -> unauthenticated', async () => {
    const outcome = await postActivitySignal(body, {
      accessToken: 'tok',
      keepalive: false,
      fetchImpl: fetchReturning(new Response('{}', { status: 401 })),
    })
    expect(outcome).toEqual({ kind: 'unauthenticated' })
  })

  it('429 -> Retry-After saniyeden ms’ye çevrilir', async () => {
    const outcome = await postActivitySignal(body, {
      accessToken: 'tok',
      keepalive: false,
      fetchImpl: fetchReturning(
        new Response('{}', { status: 429, headers: { 'Retry-After': '45' } })
      ),
    })
    expect(outcome).toEqual({ kind: 'rate-limited', retryAfterMs: 45_000 })
  })

  it('ağ hatası ve bozuk gövde FIRLATMAZ, `error` döner', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    await expect(
      postActivitySignal(body, { accessToken: 't', keepalive: false, fetchImpl: throwing })
    ).resolves.toEqual({ kind: 'error' })

    await expect(
      postActivitySignal(body, {
        accessToken: 't',
        keepalive: false,
        fetchImpl: fetchReturning(new Response('{"session_id": 7}', { status: 200 })),
      })
    ).resolves.toEqual({ kind: 'error' })
  })
})

// ---------------------------------------------------------------------------
// Rıza uçlarının istemci sarmalayıcıları
// ---------------------------------------------------------------------------

describe('rıza istemci sarmalayıcıları', () => {
  it('grant: POST + Bearer + sürüm gövdesi gönderir', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as unknown as typeof fetch

    const result = await grantActivityConsent(1, { accessToken: 'tok', fetchImpl })

    expect(result).toEqual({ ok: true, status: 200 })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe(ACTIVITY_CONSENT_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ version: 1 }))
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('revoke: DELETE, GÖVDESİZ (hedef parametresi yok)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    ) as unknown as typeof fetch

    await revokeActivityConsent({ accessToken: 'tok', fetchImpl })

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
  })

  it('ağ hatası FIRLATMAZ, `status: 0` döner', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    await expect(revokeActivityConsent({ accessToken: 't', fetchImpl: throwing })).resolves.toEqual(
      {
        ok: false,
        status: 0,
      }
    )
  })
})

// ---------------------------------------------------------------------------
// Yayınlama kapısı
// ---------------------------------------------------------------------------

describe('emit kapısı', () => {
  afterEach(() => registerActivitySink(null))

  it('alıcı yokken SESSİZ NO-OP’tur (bileşenler bu yüzden güvenle çağırabilir)', () => {
    registerActivitySink(null)
    expect(() => recordActivityEvent('login')).not.toThrow()
    expect(() => recordTabView('daily')).not.toThrow()
  })

  it('announceActivityConsentChange() window olayını yayar (dilim 3 ile gevşek bağ)', () => {
    const listener = vi.fn()
    window.addEventListener(ACTIVITY_CONSENT_CHANGED_EVENT, listener)
    announceActivityConsentChange()
    window.removeEventListener(ACTIVITY_CONSENT_CHANGED_EVENT, listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('kayıtlı alıcıya iletir; SON kayıt kazanır', () => {
    const first = { event: vi.fn(), tab: vi.fn() }
    const second = { event: vi.fn(), tab: vi.fn() }

    registerActivitySink(first)
    registerActivitySink(second)

    recordActivityEvent('ai_generated')
    recordTabView('nutrition')

    expect(first.event).not.toHaveBeenCalled()
    expect(second.event).toHaveBeenCalledWith('ai_generated')
    expect(second.tab).toHaveBeenCalledWith('nutrition')
  })
})

// ---------------------------------------------------------------------------
// ActivityTracker — rıza kapısı
// ---------------------------------------------------------------------------

describe('ActivityTracker', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  function makeSupabase(consentState: string | null): SupabaseClient<Database> {
    return {
      auth: {
        getSession: vi.fn(async () => ({
          data: {
            session: { access_token: 'tok', user: { id: USER_ID } },
          },
        })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      rpc: vi.fn(async () => ({
        data: consentState,
        error: consentState === null ? { message: 'boom' } : null,
      })),
    } as unknown as SupabaseClient<Database>
  }

  function renderTracker(client: SupabaseClient<Database>) {
    return render(createElement(SupabaseClientProvider, { client }, createElement(ActivityTracker)))
  }

  beforeEach(() => {
    fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ session_id: SESSION_A, session_started: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    vi.stubGlobal('fetch', fetchSpy)
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    registerActivitySink(null)
  })

  it('rıza `undecided` ise TEK BİR /api/activity isteği bile atılmaz', async () => {
    const client = makeSupabase('undecided')
    renderTracker(client)

    await waitFor(() =>
      expect(client.rpc).toHaveBeenCalledWith('activity_consent_state', {
        p_user_id: USER_ID,
      })
    )

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rıza durumu OKUNAMAZSA fail-closed davranır (istek yok)', async () => {
    const client = makeSupabase(null)
    renderTracker(client)

    await waitFor(() => expect(client.rpc).toHaveBeenCalled())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rıza `granted` ise heartbeat başlar ve `login` olayı BİR KEZ yayınlanır', async () => {
    const client = makeSupabase('granted')
    renderTracker(client)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    const bodies = fetchSpy.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string) as ActivityBody
    )
    // İlk sinyal SAF heartbeat, ardından `login`.
    expect(bodies[0]?.event).toBeUndefined()
    await waitFor(() => {
      const events = fetchSpy.mock.calls.map(
        (call) => (JSON.parse((call[1] as RequestInit).body as string) as ActivityBody).event
      )
      expect(events).toContain('login')
    })

    // Bayrak sekme kapsamında saklandı: ikinci bir mount `login`i TEKRAR yayınlamaz.
    expect(window.sessionStorage.getItem(`activity:login-sent:${USER_ID}`)).toBe('1')
  })
})
