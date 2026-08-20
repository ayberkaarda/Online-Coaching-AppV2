// Faz 4.8 §7c, dilim 3b + 3c — etkinlik kaydının İKİ GÖRÜNÜMÜ
// (`ClientActivityLog`, `CoachActivitySummary`) + koç yolunun VERİ KATMANI.
//
// KİLİTLENEN TEK CÜMLE: koç saat/dakika GÖRMEZ, danışan GÖRÜR. Dilim 3b'de bu
// cümle yalnızca ARAYÜZ seviyesinde ölçülüyordu ("render edilen metinde
// saat:dakika yok") — ama ham satırlar zaten koçun tarayıcısına iniyordu, yani
// konsolu açan koç tam saatleri görebiliyordu. Dilim 3c toplamayı SQL'e taşıdı
// (`public.coach_activity_summary`), dolayısıyla bu dosya artık İKİ KATMANDA
// birden kilitler:
//
//   * VERİ: koç yolu ham tabloya HİÇ GİTMEZ (`supabase.from(...)` çağrılmaz),
//     tek çağrı `rpc('coach_activity_summary', ...)`tir; ve hook'un DÖNDÜRDÜĞÜ
//     veride saat/dakika taşıyan HİÇBİR alan (ne `*_at` anahtarı, ne ISO zaman
//     damgası metni, ne `HH:MM` alt dizesi) YOKTUR.
//   * RENDER: bileşenin bastığı metinde `\d{1,2}:\d{2}` deseni YOKTUR.
//
// Bir gün biri koç bileşenini danışan hook'una bağlasa (kopyala-yapıştır) ya da
// RPC'yi ham `.from('activity_events')` sorgusuna geri çevirse, bu iki kilitten
// EN AZ BİRİ kırılır.
//
// KAPSAM:
//   A) `mapCoachActivitySummary` — RPC satırı -> gün özeti (saf fonksiyon).
//   B) Danışan görünümü — üç rıza durumu üç FARKLI metin; `granted` saat/dakika GÖSTERİR.
//   C) Koç görünümü — aal1 kapısı; üç rıza durumu üç FARKLI metin; `granted` saat/dakika
//      ASLA GÖSTERMEZ (render kilidi).
//   D) Koç yolunun VERİ KATMANI — GERÇEK `useCoachActivitySummary` hook'u sahte
//      bir Supabase istemcisiyle sürülür (mahremiyet regresyon kilidi, dilim 3c).

import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return {
    ...actual,
    useActivityConsentState: vi.fn(),
    useActivitySessions: vi.fn(),
    useActivityEvents: vi.fn(),
    useCoachActivitySummary: vi.fn(),
    useMfaStatus: vi.fn(),
  }
})

import { ClientActivityLog } from '@/components/activity/ClientActivityLog'
import { CoachActivitySummary } from '@/components/activity/CoachActivitySummary'
import {
  mapCoachActivitySummary,
  useActivityConsentState,
  useActivityEvents,
  useActivitySessions,
  useCoachActivitySummary,
  useMfaStatus,
  type ActivityConsentState,
  type ActivityEvent,
  type ActivitySession,
  type CoachActivitySummary as CoachActivitySummaryData,
  type MfaStatus,
} from '@repo/api-client'
// GERÇEK hook — barrel (`@repo/api-client`) yukarıda mock'landığı için derin
// yoldan alınır; `progress-trend.test.tsx` aynı deseni kullanıyor.
import {
  COACH_ACTIVITY_SUMMARY_DAYS,
  useCoachActivitySummary as useCoachActivitySummaryReal,
  type CoachActivitySummaryRow,
} from '@repo/api-client/hooks/useActivityLog'

import { asSupabaseClient, createHookWrapper } from './test-utils'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** `UseQueryResult` yerine geçen minimal sahte — bileşenlerin okuduğu ALANLARI karşılar. */
function queryResult<T>(
  overrides: {
    data?: T
    isLoading?: boolean
    isError?: boolean
    error?: unknown
  } = {}
): {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
} {
  return {
    data: overrides.data,
    isLoading: overrides.isLoading ?? false,
    isError: overrides.isError ?? false,
    error: overrides.error ?? null,
    refetch: vi.fn(),
  }
}

function mockConsent(
  state: ActivityConsentState | undefined,
  opts: { isLoading?: boolean; isError?: boolean } = {}
): void {
  vi.mocked(useActivityConsentState).mockReturnValue(queryResult({ data: state, ...opts }) as any)
}

function mockAal2(isAal2: boolean, isLoading = false): void {
  const status: MfaStatus = {
    factors: [],
    verifiedTotpFactor: null,
    hasVerifiedFactor: true,
    currentLevel: isAal2 ? 'aal2' : 'aal1',
    nextLevel: 'aal2',
    isAal2,
    needsStepUp: !isAal2,
  }
  vi.mocked(useMfaStatus).mockReturnValue(queryResult({ data: status, isLoading }) as any)
}

function fakeSession(overrides: Partial<ActivitySession> = {}): ActivitySession {
  return {
    id: 'session-1',
    user_id: 'client-1',
    started_at: '2026-08-17T05:00:00.000Z',
    last_seen_at: '2026-08-17T05:12:00.000Z',
    platform: 'web',
    ...overrides,
  }
}

function fakeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'event-1',
    user_id: 'client-1',
    session_id: 'session-1',
    event: 'tab_view',
    tab: 'stats',
    duration_sec: 30,
    occurred_at: '2026-08-17T05:05:00.000Z',
    ...overrides,
  }
}

/** Saat:dakika biçimindeki HERHANGİ bir alt dize ("14:30", "9:05" gibi). */
const TIME_STAMP_PATTERN = /\d{1,2}:\d{2}/

/** ISO 8601 zaman damgası metni ("2026-08-17T05:00:00.000Z" gibi). */
const ISO_TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

/** RPC'nin (`public.coach_activity_summary`) döndürdüğü gün satırı. */
function summaryRow(overrides: Partial<CoachActivitySummaryRow> = {}): CoachActivitySummaryRow {
  return {
    day: '2026-08-17',
    total_seconds: 12 * 60,
    event_counts: { tab_view: 2, login: 1 },
    ...overrides,
  }
}

/**
 * *** DİLİM 3c'NİN ASIL KİLİDİ ***
 *
 * Bir değeri (nesne/dizi/ilkel) DERİNLEMESİNE gezer ve saat/dakika taşıyan
 * HERHANGİ bir iz bulursa listeye yazar. Üç iz aranır:
 *   1) `*_at` biçiminde bir ANAHTAR (`started_at`, `last_seen_at`, `occurred_at`…),
 *   2) ISO zaman damgası biçiminde bir METİN,
 *   3) `HH:MM` alt dizesi taşıyan bir METİN.
 *
 * "Render edilmiyor" demek yetmez: veri tarayıcıya İNDİYSE mahremiyet sınırı
 * yalnızca bir görüntüleme tercihidir. Bu fonksiyon sınırı VERİDE ölçer.
 */
function findClockTraces(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') {
    if (ISO_TIMESTAMP_PATTERN.test(value) || TIME_STAMP_PATTERN.test(value)) {
      return [`${path} = ${JSON.stringify(value)}`]
    }
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findClockTraces(item, `${path}[${index}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      const child = `${path}.${key}`
      const keyTrace = /_at$/.test(key) ? [`${child} (ham zaman damgasi ALANI)`] : []
      return [...keyTrace, ...findClockTraces(item, child)]
    })
  }
  return []
}

// ---------------------------------------------------------------------------
// A) SAF FONKSİYON — RPC gün satırı -> arayüz gün özeti
//
// Güne YUVARLAMA artık burada DEĞİL, SQL'de yapılıyor (`coach_activity_summary`,
// `at time zone 'Europe/Istanbul'`). İstemcide kalan iş yalnızca ÇEVİRİDİR —
// ve girdisi de zaten `day: 'YYYY-MM-DD'`dir.
// ---------------------------------------------------------------------------

describe('mapCoachActivitySummary — RPC satirlari -> gün özeti', () => {
  it('gün satırını süreye + tür kırılımlı sayaçlara çevirir ve GİRDİDE DE ÇIKTIDA DA saat/dakika yoktur', () => {
    const rows = [summaryRow()]

    // Girdi (yani ağdan gelen ham cevap) BİLE saat taşımıyor — asıl kazanç bu.
    expect(findClockTraces(rows)).toEqual([])

    const summary = mapCoachActivitySummary(rows)

    expect(summary.days).toHaveLength(1)
    const day = summary.days[0]
    expect(day?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(day?.totalDurationSec).toBe(12 * 60)
    expect(day?.eventCounts.tab_view).toBe(2)
    expect(day?.eventCounts.login).toBe(1)
    expect(day?.eventCounts.logout).toBeUndefined()
    expect(day?.unknownEventCount).toBe(0)
    expect(summary.lastActiveDate).toBe('2026-08-17')
    expect(findClockTraces(summary)).toEqual([])
  })

  it('satırları YENİDEN ESKİYE sıralar ve en yeni günü `lastActiveDate` yapar (SQL sıralaması bozulsa bile)', () => {
    const summary = mapCoachActivitySummary([
      summaryRow({ day: '2026-08-15', total_seconds: 300, event_counts: {} }),
      summaryRow({ day: '2026-08-17', total_seconds: 0, event_counts: { login: 1 } }),
    ])

    expect(summary.days.map((day) => day.date)).toEqual(['2026-08-17', '2026-08-15'])
    expect(summary.lastActiveDate).toBe('2026-08-17')
  })

  it('kapalı liste DIŞINDaki bir olay türünü `unknownEventCount`a düşürür (sessizce yutmaz)', () => {
    const summary = mapCoachActivitySummary([
      summaryRow({ event_counts: { login: 1, sifre_calindi: 3 } }),
    ])

    expect(summary.days[0]?.eventCounts.login).toBe(1)
    expect(summary.days[0]?.unknownEventCount).toBe(3)
  })

  it('boş/bozuk `event_counts` ve boş satır kümesi savunmacı biçimde ele alınır', () => {
    const empty = mapCoachActivitySummary([])
    expect(empty.days).toEqual([])
    expect(empty.lastActiveDate).toBeNull()

    const broken = mapCoachActivitySummary([
      summaryRow({ event_counts: null }),
      summaryRow({
        day: '2026-08-16',
        event_counts: [] as unknown as CoachActivitySummaryRow['event_counts'],
      }),
    ])
    expect(broken.days[0]?.eventCounts).toEqual({})
    expect(broken.days[0]?.unknownEventCount).toBe(0)
    expect(broken.days[1]?.eventCounts).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// B) DANIŞAN GÖRÜNÜMÜ — `ClientActivityLog`
// ---------------------------------------------------------------------------

describe('ClientActivityLog — danışanın KENDİ kaydı (tam ayrıntı)', () => {
  it('üç rıza durumu ÜÇ FARKLI metin üretir', () => {
    mockConsent('undecided')
    const undecided = render(<ClientActivityLog userId="client-1" />)
    expect(screen.getByText('Aktivite kaydı için henüz bir karar vermediniz.')).toBeInTheDocument()
    undecided.unmount()

    mockConsent('revoked')
    const revoked = render(<ClientActivityLog userId="client-1" />)
    expect(screen.getByText('Aktivite kaydınızı kapattınız.')).toBeInTheDocument()
    // Yanlış bilgi üreten ifade HİÇBİR yerde geçmemeli.
    expect(screen.queryByText(/hiç açmadı/i)).not.toBeInTheDocument()
    revoked.unmount()

    mockConsent('granted')
    vi.mocked(useActivitySessions).mockReturnValue(
      queryResult({ data: [] as ActivitySession[] }) as any
    )
    vi.mocked(useActivityEvents).mockReturnValue(
      queryResult({ data: [] as ActivityEvent[] }) as any
    )
    render(<ClientActivityLog userId="client-1" />)
    expect(screen.getByText('Henüz bir etkinlik kaydınız yok.')).toBeInTheDocument()
  })

  it('rıza `granted`iken oturum/olay listesi SAAT/DAKİKA damgasıyla render edilir', () => {
    mockConsent('granted')
    vi.mocked(useActivitySessions).mockReturnValue(queryResult({ data: [fakeSession()] }) as any)
    vi.mocked(useActivityEvents).mockReturnValue(queryResult({ data: [fakeEvent()] }) as any)

    const { container } = render(<ClientActivityLog userId="client-1" />)

    expect(container.textContent ?? '').toMatch(TIME_STAMP_PATTERN)
  })
})

// ---------------------------------------------------------------------------
// C) KOÇ GÖRÜNÜMÜ — `CoachActivitySummary`
// ---------------------------------------------------------------------------

describe('CoachActivitySummary — GÜN hassasiyetinde özet', () => {
  it('koç aal1\'deyken veri yerine iki adımlı doğrulama uyarısı gösterir (veri "yok" ile KARIŞTIRILMAZ)', () => {
    mockAal2(false)
    mockConsent('granted')

    render(<CoachActivitySummary clientId="client-1" />)

    expect(screen.getByText('Bu görünüm için iki adımlı doğrulama gerekli.')).toBeInTheDocument()
  })

  it('üç rıza durumu ÜÇ FARKLI metin üretir (koç, aal2)', () => {
    mockAal2(true)

    mockConsent('undecided')
    const undecided = render(<CoachActivitySummary clientId="client-1" />)
    expect(screen.getByText('Aktivite kaydı için henüz karar verilmedi.')).toBeInTheDocument()
    undecided.unmount()

    mockConsent('revoked')
    const revoked = render(<CoachActivitySummary clientId="client-1" />)
    expect(screen.getByText('Aktivite kaydı kapalı.')).toBeInTheDocument()
    // Yanlış bilgi üreten ifade HİÇBİR yerde geçmemeli (danışan ÖNCEDEN açmış olabilir).
    expect(screen.queryByText(/hiç açmadı/i)).not.toBeInTheDocument()
    revoked.unmount()

    mockConsent('granted')
    const emptySummary: CoachActivitySummaryData = { days: [], lastActiveDate: null }
    vi.mocked(useCoachActivitySummary).mockReturnValue(queryResult({ data: emptySummary }) as any)
    render(<CoachActivitySummary clientId="client-1" />)
    // Boş durum PENCEREYİ söyler: RPC son `p_days` gününü döndürür, "hiç kayıt
    // yok" demek 40 gün önce aktif olmuş bir danışan için yanlış bilgi olurdu.
    expect(
      screen.getByText(`Son ${COACH_ACTIVITY_SUMMARY_DAYS} günde etkinlik kaydı yok.`)
    ).toBeInTheDocument()
  })

  it('rıza `granted`iken bile SAAT/DAKİKA damgası ASLA render edilmez (mahremiyet sınırı — render kilidi)', () => {
    mockAal2(true)
    mockConsent('granted')

    // 47 dakikalık bir oturum + iki olay: dakika HASSASİYETİ veride VAR
    // (`total_seconds`), ama bir DAMGA olarak yok. Bileşen süreyi "47 dk" diye
    // basabilir; basmaması gereken şey "08:47" gibi bir SAAT'tir.
    const summary = mapCoachActivitySummary([
      summaryRow({ total_seconds: 47 * 60, event_counts: { tab_view: 1, login: 1 } }),
    ])
    vi.mocked(useCoachActivitySummary).mockReturnValue(queryResult({ data: summary }) as any)

    const { container } = render(<CoachActivitySummary clientId="client-1" />)

    // Sağlık kontrolü: boş durum DEĞİL, gerçekten veri render edilmiş.
    expect(
      screen.queryByText(`Son ${COACH_ACTIVITY_SUMMARY_DAYS} günde etkinlik kaydı yok.`)
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Son aktif:/)).toBeInTheDocument()
    expect(screen.getByText('47 dk')).toBeInTheDocument()
    // KİLİT 1: hiçbir yerde saat:dakika biçiminde bir alt dize YOK.
    expect(container.textContent ?? '').not.toMatch(TIME_STAMP_PATTERN)
    // KİLİT 2: bileşene GİDEN veride de saat/dakika taşıyan alan YOK.
    expect(findClockTraces(summary)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// D) KOÇ YOLUNUN VERİ KATMANI — GERÇEK hook, sahte Supabase istemcisi
//
// *** BU DİLİMİN (3c) ASIL REGRESYON KİLİDİ ***
// Buradaki hook MOCK DEĞİLDİR: `@repo/api-client/hooks/useActivityLog`ten
// doğrudan alınır ve `createHookWrapper` ile enjekte edilen sahte istemciyle
// sürülür. Ölçülen üç şey:
//   1) TEK çağrı `rpc('coach_activity_summary', …)`tir,
//   2) ham tabloya (`.from('activity_sessions' | 'activity_events')`) HİÇ
//      gidilmez — yani ham `started_at`/`occurred_at` ağdan İNMEZ,
//   3) hook'un döndürdüğü veride saat/dakika taşıyan HİÇBİR alan yoktur.
// ---------------------------------------------------------------------------

describe('useCoachActivitySummary — koç yolu ham zaman damgası ALMAZ', () => {
  const rpcMock = vi.fn()
  const fromMock = vi.fn(() => {
    throw new Error('KOC YOLU HAM TABLOYA GITTI -- mahremiyet siniri veri katmaninda delindi')
  })
  const supabase = asSupabaseClient({ rpc: rpcMock, from: fromMock })

  // `clientId` VARSAYILAN ALMAZ: `renderCoachHook(undefined)` çağrısı gerçekten
  // `undefined` göndersin diye (varsayılan değer olsaydı sorgu yine açılırdı ve
  // "devre dışı" testi kendi kurulumunu doğrulardı).
  function renderCoachHook(clientId: string | undefined) {
    const { Wrapper } = createHookWrapper({ supabaseClient: supabase })
    return renderHook(() => useCoachActivitySummaryReal(clientId), { wrapper: Wrapper })
  }

  beforeEach(() => {
    rpcMock.mockReset()
    fromMock.mockClear()
  })

  it("yalnızca `coach_activity_summary` RPC'sini çağırır; ham tabloya HİÇ gitmez", async () => {
    rpcMock.mockResolvedValue({ data: [summaryRow()], error: null })

    const { result } = renderCoachHook('client-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('coach_activity_summary', {
      p_client_id: 'client-1',
      p_days: COACH_ACTIVITY_SUMMARY_DAYS,
    })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('RPC cevabında DA hook çıktısında DA saat/dakika taşıyan alan YOKTUR', async () => {
    const payload = [
      summaryRow({ day: '2026-08-17', total_seconds: 47 * 60 }),
      summaryRow({ day: '2026-08-16', total_seconds: 0, event_counts: {} }),
    ]
    rpcMock.mockResolvedValue({ data: payload, error: null })

    const { result } = renderCoachHook('client-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // (a) Ağdan gelen ham cevap.
    expect(findClockTraces(payload)).toEqual([])
    // (b) Hook'un bileşene verdiği veri.
    expect(findClockTraces(result.current.data)).toEqual([])
    expect(result.current.data?.days.map((day) => day.date)).toEqual(['2026-08-17', '2026-08-16'])
    expect(result.current.data?.lastActiveDate).toBe('2026-08-17')

    // (c) NEGATİF KONTROL — tarayıcı gerçekten saat sızdırsaydı `findClockTraces`
    //     bunu YAKALARDI. "Hep boş dizi dönen" bir denetleyici hiçbir şeyi
    //     korumaz; bu satır denetleyicinin KENDİSİNİ ölçer.
    expect(findClockTraces({ started_at: '2026-08-17T05:00:00.000Z' })).toHaveLength(2)
  })

  it('`clientId` yokken hiç istek atmaz (sorgu devre dışı)', () => {
    const { result } = renderCoachHook(undefined)

    expect(result.current.fetchStatus).toBe('idle')
    expect(rpcMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })
})
