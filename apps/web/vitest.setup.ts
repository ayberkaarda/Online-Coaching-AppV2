import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// next-themes ve recharts (ResponsiveContainer) `matchMedia` bekler; jsdom sağlamaz.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated API, bazı kütüphaneler hâlâ kullanıyor
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// recharts (ResponsiveContainer) `ResizeObserver` bekler; jsdom sağlamaz.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

// Bazı UI kütüphaneleri (lazy-load, viewport tespiti) `IntersectionObserver` bekler.
class IntersectionObserverStub {
  root = null
  rootMargin = ''
  thresholds: ReadonlyArray<number> = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
if (!window.IntersectionObserver) {
  window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
}

window.alert = vi.fn()
window.confirm = vi.fn(() => true)

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn()
}

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
// Yukarıdaki sahte URL `*.supabase.co` desenine UYAR, bu yüzden `src/env.server.ts` içindeki
// KATMAN 2 fail-closed guard'ı (barındırılan projeye kaza eseri sunucu tarafı erişim) tüm
// birim testlerinde tetiklenirdi. Guard KASITLI olarak `NODE_ENV`'e koşullanmadığından
// (bkz. env.server.ts'teki gerekçe) burada "test ortamı muafiyeti" gibi bir kaçış yolu
// AÇILAMAZ — o kaçış yolu guard'ın kendisini zayıflatırdı. Bunun yerine test paketi guard'ın
// AÇIK onay bayrağını kullanır. Guard'ın gerçek davranışı (bayrak yokken fırlatması dahil)
// `tests/unit/env-hosted-guard.test.ts` içinde, bayrak oradan silinerek doğrulanır.
vi.stubEnv('ALLOW_HOSTED_TARGET', '1')
