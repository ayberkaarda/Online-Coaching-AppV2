import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getServerEnv, resetServerEnvCache } from '@/env'

// A-12 (güvenlik denetimi, findings-app-surface.md §3.4, §7 Grup 1): `AI_BACKEND_API_KEY`
// production'da opsiyonel bırakılırsa, ai_backend tarafındaki A-04 (anahtar yokken guard'ın
// no-op/fail-open olması) ile birleşip her iki uç da SESSİZCE kimliksiz çalışabiliyordu.
// `getServerEnv()` artık `NODE_ENV === 'production'` iken zod `superRefine` ile fail-fast eder.
// Bu dosya `env.test.ts`'in YANINA YENİ eklendi (mevcut dosyaya dokunulmadı).
//
// NOT: Test ortamı `jsdom`dır, `window` her zaman tanımlıdır; `getServerEnv()` sunucu dışı
// ortamda hata fırlattığından `vi.stubGlobal('window', undefined)` ile simüle ediyoruz
// (bkz. env.test.ts'teki aynı desen).
describe('getServerEnv — production modda AI_BACKEND_API_KEY zorunluluğu (A-12)', () => {
  beforeEach(() => {
    resetServerEnvCache()
    vi.stubGlobal('window', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetServerEnvCache()
  })

  it('NODE_ENV=production ve AI_BACKEND_API_KEY eksikken fail-fast eder; hata mesajı sebebi açıklar (DEĞERİ değil)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const original = process.env.AI_BACKEND_API_KEY
    delete process.env.AI_BACKEND_API_KEY

    try {
      let caught: Error | undefined
      try {
        getServerEnv()
      } catch (e) {
        caught = e as Error
      }

      expect(caught).toBeDefined()
      expect(caught?.message).toContain('AI_BACKEND_API_KEY')
      expect(caught?.message).toContain('Production')
    } finally {
      if (original !== undefined) process.env.AI_BACKEND_API_KEY = original
    }
  })

  it('NODE_ENV=production ve AI_BACKEND_API_KEY set edilmişse hata fırlatmaz', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AI_BACKEND_API_KEY', 'a-real-production-key-0123456789')

    expect(() => getServerEnv()).not.toThrow()
    expect(getServerEnv().AI_BACKEND_API_KEY).toBe('a-real-production-key-0123456789')
  })

  it('NODE_ENV=development iken AI_BACKEND_API_KEY eksik olsa da hata fırlatmaz (mevcut geliştirme akışı kırılmaz)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const original = process.env.AI_BACKEND_API_KEY
    delete process.env.AI_BACKEND_API_KEY

    try {
      expect(() => getServerEnv()).not.toThrow()
    } finally {
      if (original !== undefined) process.env.AI_BACKEND_API_KEY = original
    }
  })

  it('NODE_ENV=test iken AI_BACKEND_API_KEY eksik olsa da hata fırlatmaz (mevcut test zinciri kırılmaz)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const original = process.env.AI_BACKEND_API_KEY
    delete process.env.AI_BACKEND_API_KEY

    try {
      expect(() => getServerEnv()).not.toThrow()
    } finally {
      if (original !== undefined) process.env.AI_BACKEND_API_KEY = original
    }
  })
})
