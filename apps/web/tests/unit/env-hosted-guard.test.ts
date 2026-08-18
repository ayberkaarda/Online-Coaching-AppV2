import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `@/env.server` `import 'server-only'` içerir; vitest ham paketi koşulsuz fırlatan haliyle
// çalıştırdığından (Next'in build-time aliasing'i burada devrede değil) diğer sunucu-tarafı
// testlerdeki aynı desenle etkisiz hale getiriyoruz. `vi.mock` hoisting nedeniyle importlardan
// ÖNCE tanımlanmalı.
vi.mock('server-only', () => ({}))

import { getServerEnv, resetServerEnvCache } from '@/env.server'

const HOSTED_URL = 'https://nxftmxkpmuyeelrmwofv.supabase.co'

/**
 * KATMAN 2 — barındırılan (hosted) Supabase projesine kaza eseri SUNUCU TARAFI erişim guard'ı.
 *
 * `vitest.setup.ts` tüm paket için `NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co` ve
 * `ALLOW_HOSTED_TARGET=1` stub'lar. Bu dosya guard'ın gerçek davranışını görebilmek için
 * bayrağı `process.env`'den SİLER (`vi.stubEnv` yalnızca üzerine yazar, silmez) ve her testin
 * sonunda geri koyar — `vitest.setup.ts` yalnızca bir kez çalıştığı için stub'ı elle geri
 * yüklemek zorundayız.
 *
 * NOT: test ortamı `jsdom`dır, `window` her zaman tanımlıdır; `getServerEnv()` sunucu dışı
 * ortamda hata fırlattığından `vi.stubGlobal('window', undefined)` ile sunucu simüle edilir
 * (bkz. `env.test.ts`/`env-production.test.ts` içindeki aynı desen).
 */
describe('getServerEnv — barındırılan Supabase hedefi guard (KATMAN 2)', () => {
  let originalAllow: string | undefined

  beforeEach(() => {
    resetServerEnvCache()
    vi.stubGlobal('window', undefined)
    originalAllow = process.env.ALLOW_HOSTED_TARGET
    delete process.env.ALLOW_HOSTED_TARGET
  })

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_HOSTED_TARGET
    } else {
      process.env.ALLOW_HOSTED_TARGET = originalAllow
    }
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetServerEnvCache()
  })

  it('barındırılan URL + ALLOW_HOSTED_TARGET yokken fırlatır', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)

    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)
  })

  it('`.supabase.com` alan adini da yakalar', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proje.supabase.com')

    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)
  })

  it('barındırılan URL + ALLOW_HOSTED_TARGET=1 iken fırlatmaz (bilinçli erişim)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)
    process.env.ALLOW_HOSTED_TARGET = '1'

    expect(() => getServerEnv()).not.toThrow()
  })

  it('yerel URL (127.0.0.1) iken fırlatmaz', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')

    expect(() => getServerEnv()).not.toThrow()
  })

  it('adinda "supabase" gecen ama barındırılan olmayan bir hostu (self-hosted) engellemez', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.sirket-ic-agi.local')

    expect(() => getServerEnv()).not.toThrow()
  })

  // KRİTİK REGRESYON TESTİ — guard'ın `NODE_ENV`'e KOŞULLANMADIĞININ kanıtı.
  //
  // ADR-0020'nin ilk önerisi olan `NODE_ENV !== 'production'` koşullu guard İŞE YARAMAZDI:
  // kaza eseri yazmanın gerçek yolu `pnpm run build && pnpm run start` üzerinden geçiyor ve
  // `next start` NODE_ENV=production ile koşuyor (e2e paketi de öyle). Guard, korumaya
  // çalıştığı senaryonun tam ortasında kendini kapatırdı. Bu test o hatanın geri gelmesini
  // engeller: birisi guard'ı `NODE_ENV` ile koşullarsa BU TEST KIRILIR.
  it('NODE_ENV=production iken DE fırlatır (guard NODE_ENV koşuluna bağlı degil)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AI_BACKEND_API_KEY', 'prod-key-0123456789-yeterince-uzun')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)

    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)
  })

  it('NODE_ENV=test iken de fırlatır (hicbir ortam muaf degil)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)

    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)
  })

  it('hata mesaji COZUM YOLUNU soyler (ALLOW_HOSTED_TARGET, dev:hosted, DEPLOYMENT.md)', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)

    let caught: Error | undefined
    try {
      getServerEnv()
    } catch (e) {
      caught = e as Error
    }

    expect(caught).toBeDefined()
    expect(caught?.message).toContain('ALLOW_HOSTED_TARGET=1')
    expect(caught?.message).toContain('pnpm run dev:hosted')
    expect(caught?.message).toContain('.env.local')
    expect(caught?.message).toContain('docs/DEPLOYMENT.md')
    // Hedef host teşhis için mesajda olmalı; hicbir ANAHTAR DEGERI (JWT) olmamalı.
    expect(caught?.message).toContain('nxftmxkpmuyeelrmwofv.supabase.co')
    expect(caught?.message).not.toContain('eyJ')
  })

  it('guard fırlattığında hicbir sey onbellege alinmaz — duzeltilince sonraki cagri gecer', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOSTED_URL)
    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)
    // İkinci kez de fırlatmalı (fail-closed, "bir kez geçtiyse hep geçer" olmamalı).
    expect(() => getServerEnv()).toThrow(/BARINDIRILAN/)

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    expect(() => getServerEnv()).not.toThrow()
  })
})
