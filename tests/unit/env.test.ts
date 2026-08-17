import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// AC-11 (güvenlik denetimi, findings-access-control.md): sunucu şeması `@/env`'ten
// `@/env.server`'a taşındı; o modül `import 'server-only'` içerir. vitest (vite/esbuild) Next'in
// build-time aliasing'ini uygulamadığından ham `server-only` paketi burada değerlendirilirse
// koşulsuz fırlatır — bu yüzden diğer sunucu-tarafı testlerde kullanılan aynı desenle etkisiz
// hale getiriyoruz. `vi.mock` hoisting nedeniyle importlardan ÖNCE tanımlanmalı.
vi.mock('server-only', () => ({}))

import { getServerEnv, resetServerEnvCache } from '@/env.server'

// NOT: Test ortamı `jsdom`dır (vitest.config.ts), yani `window` global olarak HER ZAMAN
// tanımlıdır. `getServerEnv()` ilk satırda `typeof window !== 'undefined'` kontrolü yapıp
// hata fırlattığından, "sunucu env varsayılanlarını doldurma" dalını test edebilmek için
// `vi.stubGlobal('window', undefined)` ile tarayıcı olmayan bir ortam simüle edilir.

describe('getServerEnv', () => {
  beforeEach(() => {
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetServerEnvCache()
  })

  it('window tanımlıyken (tarayıcı ortamı) çağrılırsa hata fırlatır', () => {
    expect(() => getServerEnv()).toThrow('getServerEnv() sunucu dışında çağrılamaz')
  })

  it('window tanımlı değilken varsayılanları doldurur (AI_BACKEND_URL, LOG_LEVEL)', () => {
    // NOT: `.default()` yalnızca değer `undefined` iken devreye girer; boş string ('')
    // geçerli bir URL olmadığından validasyonu düşürür. Bu yüzden değişkenler stub'lanmak
    // yerine doğrudan process.env'den siliniyor ki varsayılana düşme dalı deterministik
    // biçimde test edilsin (host makinede gerçek bir değer set edilmiş olsa bile).
    const originalUrl = process.env.AI_BACKEND_URL
    const originalLevel = process.env.LOG_LEVEL
    delete process.env.AI_BACKEND_URL
    delete process.env.LOG_LEVEL
    vi.stubGlobal('window', undefined)

    try {
      const env = getServerEnv()
      expect(env.AI_BACKEND_URL).toBe('http://localhost:8000')
      expect(env.LOG_LEVEL).toBe('info')
    } finally {
      if (originalUrl !== undefined) process.env.AI_BACKEND_URL = originalUrl
      if (originalLevel !== undefined) process.env.LOG_LEVEL = originalLevel
    }
  })

  it('geçerli bir AI_BACKEND_URL verilirse o değer kullanılır (varsayılana düşülmez)', () => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('AI_BACKEND_URL', 'https://ai.example.com')

    const env = getServerEnv()
    expect(env.AI_BACKEND_URL).toBe('https://ai.example.com')
  })

  it('geçersiz AI_BACKEND_URL değerinde anlaşılır bir hata fırlatır ve hata mesajı DEĞERİ içermez', () => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('AI_BACKEND_URL', 'not-a-url')

    let caught: Error | undefined
    try {
      getServerEnv()
    } catch (e) {
      caught = e as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toContain('AI_BACKEND_URL')
    expect(caught?.message).toContain('sunucu')
    expect(caught?.message).not.toContain('not-a-url')
  })

  it('resetServerEnvCache sonrası yeni env değerleri okunur', () => {
    vi.stubGlobal('window', undefined)
    vi.stubEnv('LOG_LEVEL', 'debug')

    const first = getServerEnv()
    expect(first.LOG_LEVEL).toBe('debug')

    // Cache dolu olduğu için env değişse bile aynı (eski) sonuç döner.
    vi.stubEnv('LOG_LEVEL', 'warn')
    const cached = getServerEnv()
    expect(cached.LOG_LEVEL).toBe('debug')

    resetServerEnvCache()
    const fresh = getServerEnv()
    expect(fresh.LOG_LEVEL).toBe('warn')
  })
})

describe('clientEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('geçerli NEXT_PUBLIC_* değerleri doğrudan kullanılır (varsayılana düşülmez)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://custom.example.com')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'a'.repeat(25))
    vi.resetModules()

    const { clientEnv } = await import('@/env')
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('https://custom.example.com')
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('a'.repeat(25))
    // NEXT_PUBLIC_APP_URL verilmediği için şemadaki varsayılana düşer.
    expect(clientEnv.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
  })

  it('NODE_ENV=test iken geçersiz/eksik NEXT_PUBLIC_* değerlerinde sahte test varsayılanlarına düşer', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.resetModules()

    const { clientEnv } = await import('@/env')
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('http://localhost:54321')
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key-0123456789abcdef')
  })
})

// ---------------------------------------------------------------------------
// AC-11 kabul testi: `@/env` (istemci grafiği) artık sunucu şemasını İÇERMEZ
// ---------------------------------------------------------------------------

describe('@/env — sunucu API yüzeyi sızmıyor (AC-11)', () => {
  it('`@/env` modülü `getServerEnv` EXPORT ETMEZ (sunucu şeması `@/env.server`e taşındı)', async () => {
    const envModule: Record<string, unknown> = await import('@/env')
    expect(envModule.getServerEnv).toBeUndefined()
    expect(envModule.resetServerEnvCache).toBeUndefined()
    expect(envModule.serverSchema).toBeUndefined()
  })
})
