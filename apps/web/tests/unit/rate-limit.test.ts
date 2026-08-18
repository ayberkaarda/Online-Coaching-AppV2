import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimit()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('limit altında ardışık çağrılarda success true döner ve remaining azalır', () => {
    const r1 = checkRateLimit('user-1', { limit: 3 })
    expect(r1.success).toBe(true)
    expect(r1.remaining).toBe(2)

    const r2 = checkRateLimit('user-1', { limit: 3 })
    expect(r2.success).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = checkRateLimit('user-1', { limit: 3 })
    expect(r3.success).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('limit aşılınca success false, remaining 0 ve resetAt gelecekte olur', () => {
    const now = Date.now()
    checkRateLimit('user-2', { limit: 1 })
    const r = checkRateLimit('user-2', { limit: 1 })

    expect(r.success).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.resetAt).toBeGreaterThan(now)
  })

  it('farklı anahtarlar birbirini etkilemez', () => {
    checkRateLimit('key-a', { limit: 1 })
    checkRateLimit('key-a', { limit: 1 })
    const rb = checkRateLimit('key-b', { limit: 1 })
    expect(rb.success).toBe(true)
    expect(rb.remaining).toBe(0)
  })

  it('pencere süresi dolduktan sonra sayaç sıfırlanır', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T00:00:00.000'))

    const r1 = checkRateLimit('windowed', { limit: 1, windowMs: 1000 })
    expect(r1.success).toBe(true)

    const r2 = checkRateLimit('windowed', { limit: 1, windowMs: 1000 })
    expect(r2.success).toBe(false)

    vi.setSystemTime(new Date('2026-08-16T00:00:01.001'))

    const r3 = checkRateLimit('windowed', { limit: 1, windowMs: 1000 })
    expect(r3.success).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('özel limit ve windowMs seçenekleri saygı görür', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T00:00:00.000'))

    const r = checkRateLimit('custom', { limit: 5, windowMs: 5000 })
    expect(r.limit).toBe(5)
    expect(r.resetAt).toBe(new Date('2026-08-16T00:00:05.000').getTime())
  })

  it('seçenek verilmezse varsayılan limit (60) kullanılır', () => {
    const r = checkRateLimit('default-opts')
    expect(r.limit).toBe(60)
    expect(r.remaining).toBe(59)
  })
})
