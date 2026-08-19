// B-045 — eski (cookie geçişi öncesi) Supabase oturum anahtarlarının `localStorage`'dan
// temizlenmesi. Kapsam: docs/archive/progress-a05-a14-cookie-nonce-csp.md "Doğan borçlar".
//
// `importOriginal` spread'i ZORUNLU: `apps/web/src/lib/logger.ts` (ErrorBoundary üzerinden
// bileşen ağacına giriyor) `@repo/logger`'dan `createConsoleLogger`/`maskForConsole`/
// `REDACT_PATHS` import ediyor — yalnızca `logger` döndüren bir mock o modülü yüklenemez
// hâle getirir (bkz. tests/unit/storage-cleanup.test.ts aynı desen).
vi.mock('@repo/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@repo/logger'

import { clearLegacySupabaseAuthStorage } from '@/lib/legacy-auth-cleanup'

// ---------------------------------------------------------------------------
// TUZAK (ölçüldü): bu monorepo Node 26 altında koşuyor ve Node'un YERLEŞİK deneysel global
// `localStorage`'ı (`--experimental-webstorage`, `--localstorage-file` bayrağı olmadan
// `undefined`) vitest'in `populateGlobal` mekanizmasında jsdom'un GERÇEK `window.localStorage`
// uygulamasını GÖLGELİYOR — `'localStorage' in global` zaten true döndüğü ve vitest'in KEYS
// allowlist'inde bu anahtar olmadığı için jsdom sürümü hiç kopyalanmıyor. Sonuç:
// `window.localStorage` bu test ortamında `undefined` (gerçek tarayıcıda böyle DEĞİL —
// `src/app/providers.tsx`'teki gerçek çağrı gerçek bir `Storage` nesnesiyle çalışır). Bu,
// `vitest.config.ts`'in kapsamı dışında bir ortam tuzağı; onu değiştirmek yerine burada,
// yalnızca bu test dosyasına özel minimal bir `Storage` polyfill'i kuruluyor.
class FakeLocalStorage implements Storage {
  private readonly store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

let fakeLocalStorage = new FakeLocalStorage()

beforeEach(() => {
  fakeLocalStorage = new FakeLocalStorage()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fakeLocalStorage,
  })
  vi.clearAllMocks()
})

describe('clearLegacySupabaseAuthStorage', () => {
  it('eşleşen sb-*-auth-token anahtarlarını siler ve doğru sayıyı döner', () => {
    fakeLocalStorage.setItem('sb-abcdefghij-auth-token', 'gizli-jwt-payload')
    fakeLocalStorage.setItem('theme', 'dark')

    const removed = clearLegacySupabaseAuthStorage()

    expect(removed).toBe(1)
    expect(fakeLocalStorage.getItem('sb-abcdefghij-auth-token')).toBeNull()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
      expect.any(String)
    )
  })

  it('eşleşmeyen anahtarları (theme, sb- ile başlayan ama -auth-token OLMAYAN, uygulamanın kendi anahtarları) korur', () => {
    fakeLocalStorage.setItem('theme', 'dark')
    fakeLocalStorage.setItem('sb-something-else', 'zararsız-veri')
    fakeLocalStorage.setItem('app-user-preferences', '{"lang":"tr"}')
    fakeLocalStorage.setItem('sb-abcdefghij-auth-token', 'gizli-jwt-payload')

    const removed = clearLegacySupabaseAuthStorage()

    expect(removed).toBe(1)
    expect(fakeLocalStorage.getItem('theme')).toBe('dark')
    expect(fakeLocalStorage.getItem('sb-something-else')).toBe('zararsız-veri')
    expect(fakeLocalStorage.getItem('app-user-preferences')).toBe('{"lang":"tr"}')
    expect(fakeLocalStorage.getItem('sb-abcdefghij-auth-token')).toBeNull()
  })

  it('parçalı (.0/.1) anahtarları da siler', () => {
    fakeLocalStorage.setItem('sb-abc-auth-token.0', 'parca-0')
    fakeLocalStorage.setItem('sb-abc-auth-token.1', 'parca-1')
    fakeLocalStorage.setItem('theme', 'light')

    const removed = clearLegacySupabaseAuthStorage()

    expect(removed).toBe(2)
    expect(fakeLocalStorage.getItem('sb-abc-auth-token.0')).toBeNull()
    expect(fakeLocalStorage.getItem('sb-abc-auth-token.1')).toBeNull()
    expect(fakeLocalStorage.getItem('theme')).toBe('light')
  })

  it('localStorage erişimi fırlatırsa (ör. gizli sekme SecurityError) patlamaz, 0 döner', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get(): never {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
    })

    expect(() => clearLegacySupabaseAuthStorage()).not.toThrow()
    expect(clearLegacySupabaseAuthStorage()).toBe(0)
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('hiçbir eşleşen anahtar yoksa loglamadan 0 döner', () => {
    fakeLocalStorage.setItem('theme', 'dark')

    const removed = clearLegacySupabaseAuthStorage()

    expect(removed).toBe(0)
    expect(logger.info).not.toHaveBeenCalled()
  })
})
