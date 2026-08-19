import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `src/lib/api/proxy.ts` (test edilen modülün KENDİSİ) ilk satırda `import 'server-only'`
// içeriyor — `src/lib/supabase/server.ts`'i mock'lamak bunu ortadan kaldırmıyor, çünkü
// proxy.ts onu doğrudan da import ediyor. Bu paket tarayıcı/test ortamında (vitest
// `jsdom`) import edilince hata fırlatır, bu yüzden etkisizleştiriyoruz.
// `vi.mock` hoisting nedeniyle importlardan önce, dosyanın en üstünde olmalı.
vi.mock('server-only', () => ({}))

// `createServerSupabaseClient`'ı senaryo bazlı (getUser dönüşü testten teste değişiyor)
// mock'lamamız gerektiğinden modülü tamamen mock'luyoruz.
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// `src/lib/api/proxy.ts` logger'ı `createRequestLogger(requestId)` ile alıp
// `.child({ userId })` ile zincirliyor (bkz. proxy.ts satır 51, 85). Testlerin konsolu
// kirletmemesi ve zincirleme çağrıların patlamaması için sessiz, kendine referans veren
// bir mock kuruyoruz.
vi.mock('@/lib/logger', () => {
  const silentLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    // NOT: implementasyon `vi.fn()` çağrılırken DOĞRUDAN veriliyor (sonradan
    // `.mockReturnValue(...)` ile değil). `afterEach`'teki `vi.restoreAllMocks()`
    // mock'u "orijinal" implementasyonuna döndürür; sonradan eklenen `mockReturnValue`
    // override'ları ise silinip mock'u `undefined` dönen boş bir fonksiyona düşürür.
    // Implementasyonu constructor'a vermek, restore sonrası da doğru davranışın
    // korunmasını sağlar.
    child: vi.fn((): typeof silentLogger => silentLogger),
  }
  return {
    logger: silentLogger,
    createRequestLogger: vi.fn((): typeof silentLogger => silentLogger),
  }
})

import { getServerEnv, resetServerEnvCache } from '@/env.server'
import { handleAiProxy } from '@/lib/api/proxy'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { aiWorkoutSchema } from '@repo/types/schemas'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

interface AuthGetUserResult {
  data: { user: { id: string } | null }
  error: { message: string } | null
}

interface MockSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn> }
}

function makeSupabaseClient(result: AuthGetUserResult): MockSupabaseClient {
  return { auth: { getUser: vi.fn().mockResolvedValue(result) } }
}

function setSupabaseAuthResult(result: AuthGetUserResult): MockSupabaseClient {
  const client = makeSupabaseClient(result)
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  )
  return client
}

const VALID_USER_RESULT: AuthGetUserResult = {
  data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
  error: null,
}

const VALID_WORKOUT_BODY = {
  split_type: 'ppl',
  age: 25,
  goal: 'cut',
  weight: 80,
}

const INVALID_WORKOUT_BODY = {
  split_type: 'not-a-real-split',
  age: 3,
  goal: 'bad-goal',
  weight: -10,
}

function buildRequest(opts: { authorization?: string; body?: unknown; url?: string }): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.authorization !== undefined) headers.Authorization = opts.authorization
  return new Request(opts.url ?? 'http://localhost:3000/api/ai/workout', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? {}),
  })
}

/** Gerçek `fetch` imzasına uyan minimal bir upstream `Response` taklidi kurar. */
function makeUpstreamResponse(opts: {
  ok: boolean
  status: number
  jsonBody?: unknown
  textBody?: string
}): Response {
  const text = opts.textBody ?? (opts.jsonBody !== undefined ? JSON.stringify(opts.jsonBody) : '')
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.jsonBody,
    text: async () => text,
  } as unknown as Response
}

const UPSTREAM_PATH = '/analyze/workout'

describe('handleAiProxy — oturum doğrulama', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // B-043 / AC-4.6.3: `handleAiProxy` artık auth başarılı olur olmaz `checkAndConsumeAiQuota`
    // çağırır, o da `getServerEnv()` kullanır — `typeof window !== 'undefined'` iken (jsdom'da
    // HER ZAMAN) fırlatır. Bu dosyanın "geçerli token" senaryoları (auth adımını geçen HER test)
    // artık bu yola girdiği için stub outer `beforeEach`'e taşındı (eskiden yalnızca "upstream
    // çağrısı gerektiren senaryolar" alt bloğundaydı).
    vi.stubGlobal('window', undefined)
    // Kota sayacı `src/lib/rate-limit.ts`'teki PAYLAŞILAN Map'te tutulur; testler arasında
    // sızmasın diye sıfırlanır (varsayılan limit 20, bu dosyadaki auth-başarılı test sayısı
    // çok altında olsa da açıkça izole etmek daha sağlamdır).
    resetRateLimit()
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    resetRateLimit()
    resetServerEnvCache()
  })

  // -------------------------------------------------------------------------
  // 1) Authorization başlığı yok
  // -------------------------------------------------------------------------

  it('Authorization başlığı yoksa 401 NOT_AUTHENTICATED döner ve upstream hiç çağrılmaz', async () => {
    const request = buildRequest({ body: VALID_WORKOUT_BODY })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('NOT_AUTHENTICATED')
    expect(body.error.message).toBe('Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.')
    expect(fetch).not.toHaveBeenCalled()
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2) Bozuk Authorization başlığı
  // -------------------------------------------------------------------------

  it.each([
    { label: 'Basic şeması (Bearer değil)', authorization: 'Basic abc' },
    { label: 'yalnızca "Bearer" (token yok)', authorization: 'Bearer' },
    { label: '"Bearer" + yalnızca boşluk', authorization: 'Bearer    ' },
    { label: 'boş string', authorization: '' },
    { label: 'yalnızca boşluk', authorization: '   ' },
  ])(
    'bozuk Authorization başlığında ($label) 401 döner, upstream çağrılmaz',
    async ({ authorization }) => {
      const request = buildRequest({ authorization, body: VALID_WORKOUT_BODY })

      const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
      const body = (await response.json()) as { error: { code: string } }

      expect(response.status).toBe(401)
      expect(body.error.code).toBe('NOT_AUTHENTICATED')
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  // -------------------------------------------------------------------------
  // 3) Geçerli biçimde token ama Supabase reddediyor
  // -------------------------------------------------------------------------

  it('Supabase getUser hata dönerse 401 döner, upstream çağrılmaz', async () => {
    setSupabaseAuthResult({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    const request = buildRequest({ authorization: 'Bearer some-token', body: VALID_WORKOUT_BODY })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('NOT_AUTHENTICATED')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('Supabase getUser hatasız ama user null dönerse 401 döner, upstream çağrılmaz', async () => {
    setSupabaseAuthResult({ data: { user: null }, error: null })
    const request = buildRequest({ authorization: 'Bearer some-token', body: VALID_WORKOUT_BODY })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('NOT_AUTHENTICATED')
    expect(fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 4) Geçerli token — auth'u geçip zod doğrulamasına ulaşır
  // -------------------------------------------------------------------------

  it('geçerli token + geçersiz gövde ile 401 DEĞİL, 422 VALIDATION_ERROR döner (auth geçildiğinin kanıtı)', async () => {
    setSupabaseAuthResult(VALID_USER_RESULT)
    const request = buildRequest({
      authorization: 'Bearer valid-token',
      body: INVALID_WORKOUT_BODY,
    })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).not.toBe(401)
    expect(response.status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 5) Geçerli token + geçerli gövde + upstream başarılı
  // -------------------------------------------------------------------------

  describe('geçerli token + geçerli gövde (upstream çağrısı gerektiren senaryolar)', () => {
    // `window` stub'ı artık outer `beforeEach`'te (kota kontrolü de `getServerEnv()` gerektiriyor
    // — bkz. yukarısı); burada AYRICA tekrarlanmıyor.

    it('upstream başarılı yanıt dönerse: doğru URL, X-Request-ID başlığı, gövdede user_id/userId YOK, yanıt aynen iletilir', async () => {
      setSupabaseAuthResult(VALID_USER_RESULT)
      const env = getServerEnv()
      const upstreamPayload = { plan: 'örnek plan' }
      vi.mocked(fetch).mockResolvedValue(
        makeUpstreamResponse({ ok: true, status: 200, jsonBody: upstreamPayload })
      )

      const request = buildRequest({
        authorization: 'Bearer valid-token',
        body: VALID_WORKOUT_BODY,
      })
      const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)

      expect(fetch).toHaveBeenCalledTimes(1)
      const call = vi.mocked(fetch).mock.calls[0]
      if (!call) throw new Error('fetch çağrılmadı')
      const [calledUrl, calledInit] = call
      expect(calledUrl).toBe(`${env.AI_BACKEND_URL.replace(/\/+$/, '')}${UPSTREAM_PATH}`)

      const init = calledInit as RequestInit
      expect(init.method).toBe('POST')
      const sentHeaders = init.headers as Record<string, string>
      const requestIdHeader = sentHeaders['X-Request-ID']
      if (!requestIdHeader) throw new Error('X-Request-ID başlığı eksik')
      expect(requestIdHeader.length).toBeGreaterThan(0)
      expect(sentHeaders['Content-Type']).toBe('application/json')

      const sentBody = JSON.parse(init.body as string) as Record<string, unknown>
      expect(sentBody).not.toHaveProperty('user_id')
      expect(sentBody).not.toHaveProperty('userId')
      expect(sentBody).not.toHaveProperty('id')

      expect(response.status).toBe(200)
      const responseHeader = response.headers.get('X-Request-ID')
      expect(responseHeader).toBe(requestIdHeader)
      const responseBody = await response.json()
      expect(responseBody).toEqual(upstreamPayload)
    })

    // -----------------------------------------------------------------------
    // 6) Upstream 5xx
    // -----------------------------------------------------------------------

    it('upstream 5xx dönerse 502 AI_BACKEND_ERROR döner, upstream hata detayı istemciye sızmaz', async () => {
      setSupabaseAuthResult(VALID_USER_RESULT)
      const leakedSecret = 'Traceback (most recent call last): gizli-detay-12345'
      vi.mocked(fetch).mockResolvedValue(
        makeUpstreamResponse({ ok: false, status: 500, textBody: leakedSecret })
      )

      const request = buildRequest({
        authorization: 'Bearer valid-token',
        body: VALID_WORKOUT_BODY,
      })
      const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
      const rawText = await response.clone().text()
      const body = (await response.json()) as { error: { code: string; message: string } }

      expect(response.status).toBe(502)
      expect(body.error.code).toBe('AI_BACKEND_ERROR')
      expect(body.error.message).toBe('Yapay zeka servisi şu anda yanıt vermiyor.')
      expect(rawText).not.toContain(leakedSecret)
      expect(rawText).not.toContain('gizli-detay')
    })

    // -----------------------------------------------------------------------
    // 7) Upstream'e ulaşılamıyor
    // -----------------------------------------------------------------------

    it('upstream fetch reddedilirse (ağ hatası) 503 AI_BACKEND_UNAVAILABLE döner', async () => {
      setSupabaseAuthResult(VALID_USER_RESULT)
      vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))

      const request = buildRequest({
        authorization: 'Bearer valid-token',
        body: VALID_WORKOUT_BODY,
      })
      const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
      const body = (await response.json()) as { error: { code: string; message: string } }

      expect(response.status).toBe(503)
      expect(body.error.code).toBe('AI_BACKEND_UNAVAILABLE')
      // A-16 (güvenlik denetimi, findings-app-surface.md §3.11): eski mesaj "Python AI
      // sunucusuna ulaşılamadı..." iç mimariyi (upstream'in Python/FastAPI olduğunu) ifşa
      // ediyordu. Yeni mesaj jenerik olmalı — hiçbir teknoloji/dil/framework adı geçmemeli.
      expect(body.error.message).toBe(
        'Yapay zeka servisine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.'
      )
      expect(body.error.message).not.toContain('Python')
      expect(body.error.message.toLowerCase()).not.toContain('fastapi')
    })
  })
})
