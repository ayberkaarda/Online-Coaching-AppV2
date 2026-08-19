import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// B-043 / AC-4.6.3 (Faz 4.6 dilim 2): AI proxy uçlarına kullanıcı başına GÜNLÜK kota.
//
// `src/lib/api/ai-quota.ts` artık `@/env.server`'ı import eder (limit oradaki zod şemasından
// okunur), o da `server-only` içerir — vitest (jsdom) ortamında etkisizleştirilmesi gerekir
// (bkz. AYNI desen: `tests/unit/env.test.ts`, `tests/unit/proxy-auth.test.ts`). `vi.mock`
// hoisting nedeniyle importlardan ÖNCE, dosyanın en üstünde olmalı.
vi.mock('server-only', () => ({}))

import { resetServerEnvCache } from '@/env.server'
import { aiQuotaExceededResponse, checkAndConsumeAiQuota } from '@/lib/api/ai-quota'
import { resetRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const ORIGINAL_LIMIT_ENV = process.env.AI_QUOTA_DAILY_LIMIT
const ORIGINAL_TZ = process.env.TZ

/**
 * Testler arasında `AI_QUOTA_DAILY_LIMIT`'i değiştirir. `getServerEnv()` modül seviyesinde
 * ÖNBELLEKLER (bkz. `env.server.ts`), bu yüzden değişikliğin bir sonraki `checkAndConsumeAiQuota`
 * çağrısına yansıması için `resetServerEnvCache()` ŞARTTIR (aynı desen: `tests/unit/env.test.ts`,
 * `tests/unit/auth-sign-in-rate-limit.test.ts`).
 */
function setLimit(n: number): void {
  process.env.AI_QUOTA_DAILY_LIMIT = String(n)
  resetServerEnvCache()
}

beforeEach(() => {
  resetRateLimit()
  resetServerEnvCache()
  // `getServerEnv()` `typeof window !== 'undefined'` iken hata fırlatır (bkz. `env.server.ts`).
  // Test ortamı `jsdom` olduğundan `window` her zaman tanımlıdır; sunucu tarafı davranışı test
  // edebilmek için `undefined`'a stub'lanır (aynı desen: `tests/unit/proxy-auth.test.ts`
  // "geçerli token + geçerli gövde" bloğu).
  vi.stubGlobal('window', undefined)
  // Not-UTC bir dilimde sabitlenir: `Europe/Istanbul` (UTC+3), böylece "yerel gün"
  // hesabının gerçekten yerel olduğu (UTC'den farklı davrandığı) doğrulanabilir — aynı
  // desen `tests/unit/local-date-consistency.test.ts`'te kullanılıyor.
  process.env.TZ = 'Europe/Istanbul'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-08-19T10:00:00.000'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  process.env.AI_QUOTA_DAILY_LIMIT = ORIGINAL_LIMIT_ENV
  process.env.TZ = ORIGINAL_TZ
  resetServerEnvCache()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// (a) limit altında geçer / (e) farklı kullanıcılar birbirini tüketmez /
// (d) gün değişince sayaç sıfırlanır
// ---------------------------------------------------------------------------

describe('checkAndConsumeAiQuota — temel kota davranışı', () => {
  it('(a) limit altındaki ardışık isteklerde allowed=true döner, remaining azalır', () => {
    setLimit(3)

    const r1 = checkAndConsumeAiQuota('user-a')
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)

    const r2 = checkAndConsumeAiQuota('user-a')
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = checkAndConsumeAiQuota('user-a')
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('(b) limit aşılınca allowed=false döner, remaining 0, retryAfterSeconds pozitif', () => {
    setLimit(2)
    checkAndConsumeAiQuota('user-b')
    checkAndConsumeAiQuota('user-b')

    const r3 = checkAndConsumeAiQuota('user-b')
    expect(r3.allowed).toBe(false)
    expect(r3.remaining).toBe(0)
    expect(r3.retryAfterSeconds).toBeGreaterThan(0)
    // Sıfırlanma bir sonraki YEREL gece yarısınadır: sistem saati 19 Ağustos 10:00 (yerel),
    // bir sonraki yerel gece yarısı 20 Ağustos 00:00 -> 14 saat = 50400 sn üst sınırdır.
    expect(r3.retryAfterSeconds).toBeLessThanOrEqual(14 * 3600)
  })

  it('(e) farklı kullanıcılar birbirinin kotasını tüketmez', () => {
    setLimit(1)

    const a1 = checkAndConsumeAiQuota('user-x')
    const b1 = checkAndConsumeAiQuota('user-y')
    expect(a1.allowed).toBe(true)
    expect(b1.allowed).toBe(true)

    const a2 = checkAndConsumeAiQuota('user-x')
    expect(a2.allowed).toBe(false)
    // user-y kendi kotasını user-x tükettiği için KAYBETMEMİŞ olmalı.
    const b2 = checkAndConsumeAiQuota('user-y')
    expect(b2.allowed).toBe(false) // kendi limitini (1) kendi tüketti, user-x'ten bağımsız
  })

  it('(d) gün değişince sayaç sıfırlanır (yerel gece yarısını geçince)', () => {
    setLimit(1)

    const r1 = checkAndConsumeAiQuota('user-d')
    expect(r1.allowed).toBe(true)
    const r2 = checkAndConsumeAiQuota('user-d')
    expect(r2.allowed).toBe(false)

    // Yerel gece yarısını (Europe/Istanbul) aş.
    vi.setSystemTime(new Date('2026-08-20T00:00:01.000'))

    const r3 = checkAndConsumeAiQuota('user-d')
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('env ile limit ayarlanabilir (§7a: "env\'den ayarlanabilir")', () => {
    setLimit(1)
    const r1 = checkAndConsumeAiQuota('user-env')
    expect(r1.limit).toBe(1)
    expect(r1.allowed).toBe(true)
    const r2 = checkAndConsumeAiQuota('user-env')
    expect(r2.allowed).toBe(false)
  })

  it('env tanımsızsa varsayılan (20) kullanılır', () => {
    delete process.env.AI_QUOTA_DAILY_LIMIT
    resetServerEnvCache()

    const r1 = checkAndConsumeAiQuota('user-default')
    expect(r1.limit).toBe(20)
  })

  it('env geçersiz (sayısal olmayan/negatif) ise fail-fast eder — sessizce sınırsıza DÜŞMEZ', () => {
    // `env.server.ts`'teki `RATE_LIMIT_MAX_REQUESTS` ile AYNI desen: `z.coerce.number().int()
    // .positive()` geçersiz bir değeri sessizce yutmaz, `getServerEnv()` fırlatır.
    process.env.AI_QUOTA_DAILY_LIMIT = 'not-a-number'
    resetServerEnvCache()
    expect(() => checkAndConsumeAiQuota('user-invalid-1')).toThrow()

    process.env.AI_QUOTA_DAILY_LIMIT = '-5'
    resetServerEnvCache()
    expect(() => checkAndConsumeAiQuota('user-invalid-2')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// (c) YARIŞ TESTİ — AC-4.6.3'ün çekirdeği: kota eşzamanlı isteklerle aşılamaz
// ---------------------------------------------------------------------------

describe('(c) yarış — eşzamanlı istekler kotayı aşamaz', () => {
  it('aynı kullanıcı için 20 eşzamanlı çağrıdan yalnızca limit kadarı allowed=true olur', async () => {
    vi.useRealTimers() // gerçek mikro-görev/zamanlayıcı iç içeliği için
    setLimit(5)

    const calls = Array.from({ length: 20 }, () =>
      Promise.resolve().then(() => checkAndConsumeAiQuota('user-race'))
    )
    const results = await Promise.all(calls)

    expect(results).toHaveLength(20)
    const allowedCount = results.filter((r) => r.allowed).length
    expect(allowedCount).toBe(5)
    const rejectedCount = results.filter((r) => !r.allowed).length
    expect(rejectedCount).toBe(15)
  })

  it('rastgele gecikmelerle iç içe geçen gerçek async çağrılarda da limit aşılmaz', async () => {
    vi.useRealTimers()
    setLimit(3)

    const calls = Array.from(
      { length: 15 },
      () =>
        new Promise<ReturnType<typeof checkAndConsumeAiQuota>>((resolve) => {
          setTimeout(() => resolve(checkAndConsumeAiQuota('user-race-2')), Math.random() * 5)
        })
    )
    const results = await Promise.all(calls)

    const allowedCount = results.filter((r) => r.allowed).length
    expect(allowedCount).toBe(3)
  })

  it('eşzamanlı yarışta bile farklı kullanıcılar birbirini etkilemez', async () => {
    vi.useRealTimers()
    setLimit(2)

    const usersACalls = Array.from({ length: 10 }, () =>
      Promise.resolve().then(() => checkAndConsumeAiQuota('user-race-a'))
    )
    const usersBCalls = Array.from({ length: 10 }, () =>
      Promise.resolve().then(() => checkAndConsumeAiQuota('user-race-b'))
    )
    const [resultsA, resultsB] = await Promise.all([
      Promise.all(usersACalls),
      Promise.all(usersBCalls),
    ])

    expect(resultsA.filter((r) => r.allowed)).toHaveLength(2)
    expect(resultsB.filter((r) => r.allowed)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// aiQuotaExceededResponse — saf 429 gövde/başlık biçimlendirmesi (auth GEREKMEZ)
// ---------------------------------------------------------------------------

describe('aiQuotaExceededResponse', () => {
  it('429 döner, AI_QUOTA_EXCEEDED kodu ve Türkçe mesaj taşır, mevcut hata gövde biçimini korur', async () => {
    const response = aiQuotaExceededResponse(
      { allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 3600 },
      'req-123'
    )

    expect(response.status).toBe(429)
    const body = (await response.json()) as {
      error: { code: string; message: string; request_id: string }
    }
    expect(body.error.code).toBe('AI_QUOTA_EXCEEDED')
    expect(body.error.request_id).toBe('req-123')
    expect(body.error.message).toMatch(/kota/i)
    expect(body.error.message).toContain('yapay zeka')
    expect(body.error.message).toContain('5 istek')
  })

  it('Retry-After başlığı saniye cinsinden taşınır', () => {
    const response = aiQuotaExceededResponse(
      { allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 42 },
      'req-456'
    )
    expect(response.headers.get('Retry-After')).toBe('42')
  })
})
