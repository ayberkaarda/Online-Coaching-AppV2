import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A-09 (güvenlik denetimi, findings-app-surface.md §7 Grup 2 — ajanlar arası sözleşme):
// `src/lib/api/proxy.ts` artık her upstream çağrısında `X-User-Id: <doğrulanmış kullanıcı
// uuid'si>` başlığı gönderiyor; kimlik yalnızca `auth.getUser(token)` ile doğrulanmış
// oturumdan geliyor, istemci gövdesinden ASLA alınmıyor. Bu dosya `proxy-auth.test.ts`'in
// YANINA YENİ eklendi (mevcut dosyaya dokunulmadı); mock iskeleti oradakiyle aynı desendedir.

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

import { handleAiProxy } from '@/lib/api/proxy'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { aiWorkoutSchema } from '@/lib/validation/schemas'

const VALID_USER_ID = '22222222-2222-4222-8222-222222222222'
const VALID_WORKOUT_BODY = { split_type: 'ppl', age: 25, goal: 'cut', weight: 80 }

function setAuthenticated(): void {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: VALID_USER_ID } },
        error: null,
      }),
    },
  }
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  )
}

function mockUpstreamOk(): void {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ plan: 'ok' }),
    text: async () => '{"plan":"ok"}',
  } as unknown as Response)
}

function buildRequest(body: unknown, opts: { includeAuth?: boolean } = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.includeAuth !== false) headers.Authorization = 'Bearer valid-token'
  return new Request('http://localhost:3000/api/ai/workout', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('handleAiProxy — X-User-Id başlığı (A-09)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('window', undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('upstream isteğine doğrulanmış kullanıcının X-User-Id başlığı eklenir', async () => {
    setAuthenticated()
    mockUpstreamOk()

    const request = buildRequest(VALID_WORKOUT_BODY)
    await handleAiProxy(request, aiWorkoutSchema, '/analyze/workout')

    expect(fetch).toHaveBeenCalledTimes(1)
    const call = vi.mocked(fetch).mock.calls[0]
    if (!call) throw new Error('fetch çağrılmadı')
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['X-User-Id']).toBe(VALID_USER_ID)
  })

  it('X-User-Id istemci gövdesindeki sahte bir user_id/id alanından ASLA türetilmez — her zaman doğrulanmış oturumdan gelir', async () => {
    setAuthenticated()
    mockUpstreamOk()

    // Gövdede sahte bir kimlik alanı gönderilmeye çalışılıyor. `handleAiProxy` gövdeyi hiç
    // okumadan, yalnızca adım 0'daki doğrulanmış `userData.user.id`'yi kullanır.
    const spoofedBody = {
      ...VALID_WORKOUT_BODY,
      user_id: 'attacker-controlled-id',
      id: 'attacker-controlled-id',
    }
    const request = buildRequest(spoofedBody)
    await handleAiProxy(request, aiWorkoutSchema, '/analyze/workout')

    const call = vi.mocked(fetch).mock.calls[0]
    if (!call) throw new Error('fetch çağrılmadı')
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['X-User-Id']).toBe(VALID_USER_ID)
    expect(headers['X-User-Id']).not.toBe('attacker-controlled-id')
  })

  it('kimlik doğrulama başarısızsa upstream hiç çağrılmaz — X-User-Id de gönderilmez', async () => {
    const request = buildRequest(VALID_WORKOUT_BODY, { includeAuth: false })
    await handleAiProxy(request, aiWorkoutSchema, '/analyze/workout')
    expect(fetch).not.toHaveBeenCalled()
  })
})
