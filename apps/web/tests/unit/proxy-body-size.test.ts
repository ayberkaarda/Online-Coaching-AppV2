import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A-08 (güvenlik denetimi, findings-app-surface.md §3.8) regresyon testleri: `handleAiProxy`
// gövdesiz sınırdı — Next.js'in sessiz 10 MB kesme davranışına kalınıyordu, kullanıcı 413 yerine
// yanıltıcı bir 400 `INVALID_JSON` alıyordu. Düzeltme iki katmanlı:
//   1) `Content-Length` başlığı VARSA ve sınırı aşıyorsa erken 413 (ucuz ön kontrol, akış hiç
//      başlamaz).
//   2) ASIL savunma: gövde `ReadableStream` üzerinden PARÇA PARÇA okunur; biriken bayt sayısı
//      sınırı AŞAR AŞMAZ `reader.cancel()` ile akış DERHAL durdurulur — `Content-Length` YOKSA
//      (chunked/streaming) veya YALAN söylüyorsa bile bu katman atlatılamaz VE saldırganın
//      gönderdiği devasa gövde asla tamamen okunup belleğe alınmaz (bkz. aşağıdaki "erken iptal"
//      testi — yalnızca 413 dönmesi değil, akışın GERÇEKTEN tüketilmediği de kanıtlanıyor).
//
// Aynı mock deseni `tests/unit/proxy-auth.test.ts`'ten alınmıştır (bkz. oradaki yorumlar).
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
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

import { getServerEnv, resetServerEnvCache } from '@/env.server'
import { handleAiProxy, MAX_BODY_BYTES } from '@/lib/api/proxy'
import { resetRateLimit } from '@/lib/rate-limit'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { aiWorkoutSchema } from '@repo/types/schemas'

interface AuthGetUserResult {
  data: { user: { id: string } | null }
  error: { message: string } | null
}

interface MockSupabaseClient {
  auth: { getUser: ReturnType<typeof vi.fn> }
}

function setSupabaseAuthResult(result: AuthGetUserResult): MockSupabaseClient {
  const client = { auth: { getUser: vi.fn().mockResolvedValue(result) } }
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  )
  return client
}

const VALID_USER_RESULT: AuthGetUserResult = {
  data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
  error: null,
}

const UPSTREAM_PATH = '/analyze/workout'

/** Gerçek `fetch` imzasına uyan minimal bir upstream `Response` taklidi kurar. */
function makeUpstreamResponse(opts: { ok: boolean; status: number; jsonBody?: unknown }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.jsonBody,
    text: async () => JSON.stringify(opts.jsonBody ?? {}),
  } as unknown as Response
}

/**
 * Belirli bir bayt uzunluğuna sahip geçerli bir JSON GÖVDESİ (JSON string literali) üretir.
 * `"` + dolgu + `"` biçiminde — dolgu tamamen ASCII olduğu için karakter sayısı = bayt sayısı,
 * bu yüzden toplam bayt uzunluğu tam olarak `targetBytes` olur (2 tırnak + (targetBytes - 2)
 * dolgu karakteri). `targetBytes >= 2` olmalıdır.
 */
function jsonStringBodyOfByteLength(targetBytes: number): string {
  const fillerLength = targetBytes - 2
  return `"${'a'.repeat(fillerLength)}"`
}

function buildRequest(opts: {
  authorization?: string
  bodyText: string
  contentLength?: number | 'omit' | 'auto'
}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.authorization !== undefined) headers.Authorization = opts.authorization
  else headers.Authorization = 'Bearer valid-token'

  if (
    opts.contentLength !== undefined &&
    opts.contentLength !== 'omit' &&
    opts.contentLength !== 'auto'
  ) {
    headers['Content-Length'] = String(opts.contentLength)
  }

  return new Request('http://localhost:3000/api/ai/workout', {
    method: 'POST',
    headers,
    body: opts.bodyText,
  })
}

describe('handleAiProxy — gövde boyutu sınırı (A-08)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // B-043 / AC-4.6.3: `handleAiProxy` artık auth başarılı olur olmaz `checkAndConsumeAiQuota`
    // çağırır, o da `getServerEnv()` kullanır — `typeof window !== 'undefined'` iken (jsdom'da
    // HER ZAMAN) fırlatır. Bu dosyanın HER testi `setSupabaseAuthResult(VALID_USER_RESULT)` ile
    // auth'u başarılı kıldığı için (aşağıdaki satır), stub outer `beforeEach`'e taşındı (eskiden
    // yalnızca "normal akış" alt bloğundaydı).
    vi.stubGlobal('window', undefined)
    setSupabaseAuthResult(VALID_USER_RESULT)
    // Kota sayacı `src/lib/rate-limit.ts`'teki PAYLAŞILAN Map'te tutulur; testler arasında
    // sızmasın diye sıfırlanır.
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
  // 1) `Content-Length` başlığı sınırı aşıyor -> erken 413
  // -------------------------------------------------------------------------

  it('Content-Length sınırı aşıyorsa 413 PAYLOAD_TOO_LARGE döner, upstream hiç çağrılmaz', async () => {
    const request = buildRequest({
      bodyText: jsonStringBodyOfByteLength(10), // gövdenin kendisi küçük — yalnızca BAŞLIK yalan
      contentLength: MAX_BODY_BYTES + 1,
    })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(body.error.message.length).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2) BYPASS REGRESYONU: `Content-Length` başlığı YOK, ama gerçek gövde sınırı aşıyor
  // -------------------------------------------------------------------------

  it('Content-Length başlığı OLMADAN 64 KB üstü gövde yine 413 döner (bypass kapalı)', async () => {
    const oversizedBody = jsonStringBodyOfByteLength(MAX_BODY_BYTES + 1)
    const request = buildRequest({ bodyText: oversizedBody, contentLength: 'omit' })

    // `new Request()` bu ortamda Content-Length'i KENDİLİĞİNDEN eklemiyor — yani bu test asıl
    // savunmanın (gerçek bayt sayımı) `Content-Length`'e bakmaksızın çalıştığını kanıtlıyor.
    expect(request.headers.get('content-length')).toBeNull()

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2.5) ERKEN İPTAL KANITI: 413 sadece dönmüyor, akış GERÇEKTEN tüketilmeden durduruluyor.
  // -------------------------------------------------------------------------

  it('Content-Length OLMADAN ~1 MB stream edilirken sınır aşılır aşılmaz iptal edilir — akışın TAMAMI çekilmez', async () => {
    const CHUNK_BYTES = 8 * 1024
    const TOTAL_BYTES = 1024 * 1024 // ~1 MB — sınırın (64 KB) çok üstünde
    const totalChunksIfFullyConsumed = Math.ceil(TOTAL_BYTES / CHUNK_BYTES)

    let producedBytes = 0
    let pullCount = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++
        if (producedBytes >= TOTAL_BYTES) {
          controller.close()
          return
        }
        const size = Math.min(CHUNK_BYTES, TOTAL_BYTES - producedBytes)
        // İçerik önemsiz — yalnızca bayt SAYISI test ediliyor.
        controller.enqueue(new Uint8Array(size).fill(97))
        producedBytes += size
      },
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    }
    // `duplex: 'half'`: Node/undici'de `ReadableStream` gövdeli bir `Request` kurmak için
    // gereken standart seçenek — gövde YOK ile karıştırılmasın.
    const request = new Request('http://localhost:3000/api/ai/workout', {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect(request.headers.get('content-length')).toBeNull()

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE')
    expect(fetch).not.toHaveBeenCalled()

    // ASIL KANIT: akışı üreten `pull()` çağrı sayısı, 1 MB'ı TAMAMEN üretmek için gereken chunk
    // sayısından (128) belirgin biçimde AZ — yani `reader.cancel()` gerçekten erken devreye
    // girdi, saldırganın gövdesi sonuna kadar okunmadı/belleğe alınmadı.
    expect(pullCount).toBeLessThan(totalChunksIfFullyConsumed)
    // Sınır 64 KB, chunk 8 KB — teorik olarak en fazla 9 `pull()` sonrasında (72 KB > 64 KB)
    // iptal gerçekleşmeli; birkaç chunk'lık tolerans bırakılıyor.
    expect(pullCount).toBeLessThanOrEqual(12)
  })

  // -------------------------------------------------------------------------
  // 3) Tam sınırda (== MAX_BODY_BYTES) -> reddedilmez, akış devam eder
  // -------------------------------------------------------------------------

  it('gövde TAM sınırda (== MAX_BODY_BYTES) ise 413 DÖNMEZ, doğrulama adımına geçilir', async () => {
    const exactBody = jsonStringBodyOfByteLength(MAX_BODY_BYTES)
    expect(new TextEncoder().encode(exactBody).byteLength).toBe(MAX_BODY_BYTES)

    const request = buildRequest({ bodyText: exactBody, contentLength: 'omit' })
    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)

    // Gövde geçerli bir JSON STRING'idir (obje değil) — şema doğrulaması 422 ile reddeder, ama
    // KRİTİK OLAN: 413 DEĞİL. Yani boyut kontrolü sınırda geçirir, sonraki adıma devreder.
    expect(response.status).not.toBe(413)
    expect(response.status).toBe(422)
  })

  // -------------------------------------------------------------------------
  // 4) Sınırın 1 bayt altında (== MAX_BODY_BYTES - 1) -> reddedilmez
  // -------------------------------------------------------------------------

  it('gövde sınırın 1 bayt ALTINDA ise 413 dönmez', async () => {
    const underBody = jsonStringBodyOfByteLength(MAX_BODY_BYTES - 1)
    const request = buildRequest({ bodyText: underBody, contentLength: 'omit' })

    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    expect(response.status).not.toBe(413)
  })

  // -------------------------------------------------------------------------
  // 5) Normal akış: küçük, geçerli gövde -> upstream'e ulaşır
  // -------------------------------------------------------------------------

  describe('normal akış (sınırın çok altında, geçerli gövde)', () => {
    // `window` stub'ı artık outer `beforeEach`'te (kota kontrolü de `getServerEnv()`
    // gerektiriyor — bkz. yukarısı); burada AYRICA tekrarlanmıyor.

    it('küçük geçerli gövde upstream’e ulaşır ve 200 döner', async () => {
      const env = getServerEnv()
      void env
      const upstreamPayload = { plan: 'örnek plan' }
      vi.mocked(fetch).mockResolvedValue(
        makeUpstreamResponse({ ok: true, status: 200, jsonBody: upstreamPayload })
      )

      const validBody = JSON.stringify({ split_type: 'ppl', age: 25, goal: 'cut', weight: 80 })
      const request = buildRequest({ bodyText: validBody, contentLength: 'omit' })
      const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)

      expect(response.status).toBe(200)
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------------------------------------------------------------
  // 6) Mevcut davranış korunuyor: bozuk JSON hâlâ 400 INVALID_JSON döner (413 değil)
  // -------------------------------------------------------------------------

  it('sınırın altında ama bozuk JSON gövdesi hâlâ 400 INVALID_JSON döner', async () => {
    const request = buildRequest({ bodyText: '{ bozuk json', contentLength: 'omit' })
    const response = await handleAiProxy(request, aiWorkoutSchema, UPSTREAM_PATH)
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_JSON')
  })
})
