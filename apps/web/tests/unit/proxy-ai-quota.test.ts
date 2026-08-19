import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// B-043 / AC-4.6.3 (Faz 4.6 dilim 2): `handleAiProxy` artık doğrulanmış kullanıcının GÜNLÜK
// AI kotasını (`src/lib/api/ai-quota.ts`) kendi auth adımından HEMEN SONRA, upstream'e
// gitmeden ÖNCE kontrol eder — bkz. `src/lib/api/proxy.ts` "0.4) Kota" adımı. Bu dosya o
// entegrasyon noktasını `tests/unit/proxy-auth.test.ts` ile AYNI mock iskeletiyle test eder;
// `tests/unit/ai-quota.test.ts` ise `checkAndConsumeAiQuota`/`aiQuotaExceededResponse`'u SAF
// birimler olarak (auth mock'lamadan) test eder — ikisi TAMAMLAYICIdır, tekrar değildir.
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

import { resetServerEnvCache } from '@/env.server'
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

function setSupabaseAuthResult(result: AuthGetUserResult): void {
  const client = { auth: { getUser: vi.fn().mockResolvedValue(result) } }
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  )
}

function authResultFor(userId: string): AuthGetUserResult {
  return { data: { user: { id: userId } }, error: null }
}

const AUTH_FAILURE: AuthGetUserResult = {
  data: { user: null },
  error: { message: 'invalid JWT' },
}

const VALID_WORKOUT_BODY = { split_type: 'ppl', age: 25, goal: 'cut', weight: 80 }

function buildRequest(opts: { authorization?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  headers.Authorization = opts.authorization ?? 'Bearer valid-token'
  return new Request('http://localhost:3000/api/ai/workout', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? VALID_WORKOUT_BODY),
  })
}

function mockUpstreamOk(): void {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ plan: 'ok' }),
    text: async () => '{"plan":"ok"}',
  } as unknown as Response)
}

/** `getServerEnv()` yeniden okunsun diye env değiştirdikten sonra çağrılmalıdır. */
function setDailyLimit(n: number): void {
  process.env.AI_QUOTA_DAILY_LIMIT = String(n)
  resetServerEnvCache()
}

const ORIGINAL_LIMIT_ENV = process.env.AI_QUOTA_DAILY_LIMIT

describe('handleAiProxy — günlük AI kotası entegrasyonu (B-043 / AC-4.6.3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // `checkAndConsumeAiQuota` `getServerEnv()` kullanır — jsdom'da `window` her zaman
    // tanımlıdır, sunucu dalını test edebilmek için stub'lanır (bkz. proxy-auth.test.ts).
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    resetRateLimit()
    process.env.AI_QUOTA_DAILY_LIMIT = ORIGINAL_LIMIT_ENV
    resetServerEnvCache()
  })

  it('limit altındaki isteklerde upstream normal şekilde çağrılır (kota engel olmaz)', async () => {
    setDailyLimit(3)
    setSupabaseAuthResult(authResultFor('user-quota-1'))
    mockUpstreamOk()

    const response = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')

    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('limit aşılınca 429 AI_QUOTA_EXCEEDED döner, upstream HİÇ çağrılmaz', async () => {
    setDailyLimit(2)
    setSupabaseAuthResult(authResultFor('user-quota-2'))
    mockUpstreamOk()

    await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(fetch).toHaveBeenCalledTimes(2)

    const third = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    const body = (await third.json()) as {
      error: { code: string; message: string; request_id: string }
    }

    expect(third.status).toBe(429)
    expect(body.error.code).toBe('AI_QUOTA_EXCEEDED')
    expect(body.error.message).toMatch(/kota/i)
    expect(third.headers.get('Retry-After')).toBeTruthy()
    // Kota upstream'den ÖNCE reddeder — 3. çağrıda fetch SAYISI değişmemiş olmalı.
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('kimliksiz istekte kota TÜKETİLMEZ — 401 döner ve bir sonraki geçerli istek hâlâ limit dahilindedir', async () => {
    setDailyLimit(1)
    mockUpstreamOk()

    // Auth'suz 5 istek: hepsi 401, kota hiç dokunulmamalı.
    for (let i = 0; i < 5; i++) {
      const res = await handleAiProxy(
        buildRequest({ authorization: '' }),
        aiWorkoutSchema,
        '/analyze/workout'
      )
      expect(res.status).toBe(401)
    }
    expect(fetch).not.toHaveBeenCalled()

    // Şimdi GERÇEK kimlikle tek istek: limit 1 olsa da bu istek HÂLÂ geçmeli.
    setSupabaseAuthResult(authResultFor('user-quota-3'))
    const authenticated = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(authenticated.status).toBe(200)
  })

  it('Supabase auth reddederse (401) kota TÜKETİLMEZ', async () => {
    setDailyLimit(1)
    setSupabaseAuthResult(AUTH_FAILURE)
    mockUpstreamOk()

    const rejected = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(rejected.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()

    setSupabaseAuthResult(authResultFor('user-quota-4'))
    const accepted = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(accepted.status).toBe(200)
  })

  it('farklı kullanıcılar bağımsız günlük kotaya sahiptir', async () => {
    setDailyLimit(1)
    mockUpstreamOk()

    setSupabaseAuthResult(authResultFor('user-quota-a'))
    const first = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(first.status).toBe(200)

    setSupabaseAuthResult(authResultFor('user-quota-b'))
    const second = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(second.status).toBe(200)

    setSupabaseAuthResult(authResultFor('user-quota-a'))
    const thirdSameUser = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(thirdSameUser.status).toBe(429)
  })

  it('workout ve nutrition uçları AYNI kullanıcı için PAYLAŞILAN günlük kovayı tüketir', async () => {
    setDailyLimit(1)
    setSupabaseAuthResult(authResultFor('user-quota-shared'))
    mockUpstreamOk()

    const workoutResponse = await handleAiProxy(buildRequest(), aiWorkoutSchema, '/analyze/workout')
    expect(workoutResponse.status).toBe(200)

    // Aynı kullanıcı farklı bir AI ucuna (nutrition upstream path) gitse dahi kova zaten dolu.
    const nutritionResponse = await handleAiProxy(
      buildRequest(),
      aiWorkoutSchema,
      '/analyze/nutrition'
    )
    expect(nutritionResponse.status).toBe(429)
  })
})
