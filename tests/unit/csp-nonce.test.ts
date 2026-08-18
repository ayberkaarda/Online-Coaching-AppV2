import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// `src/proxy.ts` `@/env.server`i import ediyor (o modül `import 'server-only'` içerir).
// vitest ham `server-only` paketini koşulsuz fırlatan haliyle çalıştırır, bu yüzden diğer
// sunucu-tarafı testlerdeki aynı desenle etkisiz hale getiriyoruz (bkz.
// tests/unit/proxy-rate-limit.test.ts). `vi.mock` hoisting nedeniyle importlardan ÖNCE olmalı.
vi.mock('server-only', () => ({}))

// --- Kök layout testi için mock'lar (aşağıdaki ikinci describe bloğu) -------------------
// `vi.mock` fabrikaları hoist edildiği için dışarıdaki değişkenlere `vi.hoisted` olmadan
// erişilemez; nonce başlığını testten teste değiştirebilmek için bu kutuyu kullanıyoruz.
const layoutMocks = vi.hoisted(() => ({ nonceHeader: null as string | null }))

vi.mock('next/headers', () => ({
  headers: async (): Promise<Headers> =>
    new Headers(layoutMocks.nonceHeader ? { 'x-nonce': layoutMocks.nonceHeader } : {}),
}))

// `connection()` istek kapsamı dışında fırlatır; NextRequest/NextResponse'un GERÇEK
// implementasyonu (yukarıdaki proxy testleri onu kullanıyor) korunsun diye modül tamamen
// değil, yalnızca bu tek export üzerinden gölgeleniyor.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, connection: async (): Promise<void> => undefined }
})

// Kök layout modül tepe seviyesinde üç Google font'u çağırıyor; testte ağ/dosya erişimi yok.
vi.mock('next/font/google', () => {
  const font = (): { variable: string; className: string } => ({
    variable: 'mock-font-variable',
    className: 'mock-font',
  })
  return { Archivo: font, Hanken_Grotesk: font, IBM_Plex_Mono: font }
})

// Gerçek `Providers` React Query / next-themes / sonner ağacını sürüklerdi; bize yalnızca
// LAYOUT'UN ONA HANGİ PROP'LARI GEÇTİĞİ lazım.
vi.mock('@/app/providers', () => ({
  Providers: function ProvidersMock(): null {
    return null
  },
}))

import { isValidElement, type ReactElement, type ReactNode } from 'react'

import RootLayout from '@/app/layout'
import { Providers } from '@/app/providers'
import { resetServerEnvCache } from '@/env.server'
import { resetRateLimit } from '@/lib/rate-limit'
import { proxy } from '@/proxy'

// A-14 (güvenlik denetimi; borç B-007) regresyon paketi.
//
// KIRMIZI-YEŞİL KANITI: düzeltmeden ÖNCE CSP `next.config.mjs` içinde statik olarak üretiliyor
// ve `script-src 'self' 'unsafe-inline'` içeriyordu; proxy sayfa isteklerine hiç dokunmuyordu.
// Aşağıdaki testlerin tamamı o kodla KIRMIZI olur (sayfa yanıtında CSP başlığı yok, nonce yok).
//
// Bu dosya aynı zamanda üç BİLİNÇLİ kararın regresyon kilidi:
//   - `style-src 'unsafe-inline'` KALIR (ADR-0022 Karar 4) — kaldırılırsa recharts kırılır.
//   - `'strict-dynamic'` KULLANILMAZ (ADR-0022 Karar 6).
//   - Hiçbir direktifte `*.supabase.co` wildcard'ı YOKTUR (A-15).

const SUPABASE_URL = 'http://127.0.0.1:54321'

function buildRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

/** Yanıt CSP'sini direktif adı -> değer listesi biçiminde ayrıştırır. */
function parseCsp(csp: string): Record<string, string[]> {
  const directives: Record<string, string[]> = {}
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/).filter(Boolean)
    if (!name) continue
    directives[name] = values
  }
  return directives
}

function nonceFromCsp(csp: string): string | null {
  return /'nonce-([^']+)'/.exec(csp)?.[1] ?? null
}

describe('proxy — nonce tabanlı CSP (A-14 / B-007)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    resetRateLimit()
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetRateLimit()
    resetServerEnvCache()
  })

  it("sayfa isteği CSP taşır; script-src bir 'nonce-...' içerir ve 'unsafe-inline' İÇERMEZ", () => {
    const response = proxy(buildRequest('/login'))
    const csp = response.headers.get('content-security-policy')

    expect(csp).toBeTruthy()
    const scriptSrc = parseCsp(csp as string)['script-src'] ?? []
    expect(scriptSrc.length).toBeGreaterThan(0)
    expect(scriptSrc.some((token) => /^'nonce-.+'$/.test(token))).toBe(true)
    // A-14'ün ÖZÜ: bu satır düzeltmeden önceki politikayla KIRMIZI olurdu.
    expect(scriptSrc).not.toContain("'unsafe-inline'")
  })

  it("style-src HÂLÂ 'unsafe-inline' içerir — bu bilinçli bir karardır (ADR-0022 Karar 4)", () => {
    const response = proxy(buildRequest('/'))
    const csp = response.headers.get('content-security-policy') as string

    // Nonce'lar inline `style="..."` NİTELİKLERİNE uygulanmaz (`style-src-attr`); kod tabanında
    // 17 `style={{...}}` var ve recharts çalışma anında inline stil yazıyor. Bu belirteç
    // kaldırılırsa grafikler kırılır — bu yüzden bilinçli olarak KİLİTLENİYOR.
    expect(parseCsp(csp)['style-src']).toContain("'unsafe-inline'")
  })

  it("script-src 'strict-dynamic' İÇERMEZ (ADR-0022 Karar 6)", () => {
    const response = proxy(buildRequest('/profile'))
    const csp = response.headers.get('content-security-policy') as string

    // `'strict-dynamic'` host kaynak listelerini ('self') yok sayar ve Next'in nonce vermediği
    // script'leri sessizce kırar; bu turun kapsamında değil.
    expect(csp).not.toContain('strict-dynamic')
  })

  it('iki ardışık istek FARKLI nonce üretir', () => {
    const first = nonceFromCsp(
      proxy(buildRequest('/')).headers.get('content-security-policy') ?? ''
    )
    const second = nonceFromCsp(
      proxy(buildRequest('/')).headers.get('content-security-policy') ?? ''
    )

    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    // Öngörülebilir/tekrar eden bir nonce hiçbir şey korumaz.
    expect(first).not.toBe(second)
  })

  it('nonce İSTEK başlıklarına da yazılır (x-nonce + Content-Security-Policy) ve yanıttakiyle AYNIDIR', () => {
    const response = proxy(buildRequest('/users'))
    const responseCsp = response.headers.get('content-security-policy') as string

    // `NextResponse.next({ request: { headers } })` değiştirilmiş istek başlıklarını
    // `x-middleware-override-headers` + `x-middleware-request-*` çiftiyle upstream'e taşır.
    const overridden = (response.headers.get('x-middleware-override-headers') ?? '').split(',')
    expect(overridden).toContain('x-nonce')
    expect(overridden).toContain('content-security-policy')

    const requestNonce = response.headers.get('x-middleware-request-x-nonce')
    expect(requestNonce).toBeTruthy()
    expect(nonceFromCsp(responseCsp)).toBe(requestNonce)

    // Next nonce'u İSTEK başlığındaki CSP'den `'nonce-{değer}'` desenini ayrıştırarak çıkarır;
    // bu başlık atlanırsa nonce HİÇBİR script'e uygulanmaz (sessiz başarısızlık).
    const requestCsp = response.headers.get('x-middleware-request-content-security-policy')
    expect(requestCsp).toBe(responseCsp)
  })

  it("connect-src supabase http VE ws origin'lerini içerir; hiçbir direktifte *.supabase.co wildcard'ı YOKTUR (A-15)", () => {
    const response = proxy(buildRequest('/'))
    const csp = response.headers.get('content-security-policy') as string
    const directives = parseCsp(csp)

    expect(directives['connect-src']).toContain('http://127.0.0.1:54321')
    expect(directives['connect-src']).toContain('ws://127.0.0.1:54321')
    expect(directives['img-src']).toContain('http://127.0.0.1:54321')
    // Avatar fallback'i bilerek kalır.
    expect(directives['img-src']).toContain('https://ui-avatars.com')

    // A-15 kilidi: wildcard bir daha ASLA geri gelmemeli.
    expect(csp).not.toContain('*.supabase.co')
    expect(csp).not.toContain('*')
  })

  it('/api/* isteği hız sınırı başlıklarını almaya devam eder ve CSP dalına DÜŞMEZ', () => {
    const response = proxy(buildRequest('/api/health'))

    expect(response.headers.get('X-RateLimit-Limit')).toBe('120')
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('119')
    // CSP sayfalara özgüdür; API yanıtları HTML render etmez, nonce'a ihtiyaçları yoktur.
    expect(response.headers.get('content-security-policy')).toBeNull()
  })

  it('sayfa istekleri hız sınırı kovasına GİRMEZ — normal gezinme kullanıcıyı 429a düşürmemeli', () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '2')
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000')
    resetServerEnvCache()

    for (let i = 0; i < 5; i++) {
      const response = proxy(buildRequest('/login'))
      expect(response.status).toBe(200)
      expect(response.headers.get('X-RateLimit-Limit')).toBeNull()
      expect(response.headers.get('X-RateLimit-Remaining')).toBeNull()
    }

    // Sayfa gezinmeleri kovaya dokunmadığı için API kotası el değmemiş olmalı.
    const apiResponse = proxy(buildRequest('/api/some-route'))
    expect(apiResponse.status).toBe(200)
    expect(apiResponse.headers.get('X-RateLimit-Remaining')).toBe('1')
  })
})

/**
 * A-14 REGRESYON KİLİDİ — `next-themes` inline script'inin nonce zinciri.
 *
 * `next-themes` (v0.4.6) tema-flash'ını (FOUC) engellemek için hydration'dan önce çalışan bir
 * INLINE `<script>` render ediyor. `script-src`'tan `'unsafe-inline'` kaldırıldığı için bu
 * script nonce almazsa tarayıcı onu BLOKLAR: her sayfa yüklemesinde bir CSP ihlali + karanlık
 * modda beyaz flash. Zincir üç halkalı — `src/proxy.ts` nonce'u `x-nonce` istek başlığına
 * yazar, kök layout `headers()` ile okur, `Providers` onu `ThemeProvider`'a geçirir.
 *
 * Bu testler zincirin ORTA halkasını kilitler: biri `nonce` prop'unu silerse KIRMIZI olur.
 * (Ölçülen kanıt: yama öncesi 5 sayfanın hepsinde nonce'suz `<script>` sayısı 1'di, sonrasında 0.)
 */
function findElementByType(
  node: ReactNode,
  type: unknown
): ReactElement<{ nonce?: string }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType(child as ReactNode, type)
      if (found) return found
    }
    return null
  }
  if (!isValidElement(node)) return null
  if (node.type === type) return node as ReactElement<{ nonce?: string }>
  const props = node.props as { children?: ReactNode }
  return findElementByType(props.children ?? null, type)
}

describe('kök layout — next-themes inline script nonce zinciri (A-14)', () => {
  afterEach(() => {
    layoutMocks.nonceHeader = null
  })

  it("x-nonce istek başlığını okur ve Providers'a `nonce` prop'u olarak geçirir", async () => {
    layoutMocks.nonceHeader = 'TEST-NONCE-A14'

    const tree = await RootLayout({ children: null })
    const providers = findElementByType(tree, Providers)

    expect(providers).not.toBeNull()
    // Prop silinirse burası `undefined` olur -> test KIRMIZI.
    expect(providers?.props.nonce).toBe('TEST-NONCE-A14')
  })

  it('x-nonce başlığı yoksa nonce `undefined` kalır — layout çökmez, next-themes eski davranışına düşer', async () => {
    layoutMocks.nonceHeader = null

    const tree = await RootLayout({ children: null })
    const providers = findElementByType(tree, Providers)

    expect(providers).not.toBeNull()
    expect(providers?.props.nonce).toBeUndefined()
  })
})
