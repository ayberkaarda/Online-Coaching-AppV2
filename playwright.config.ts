import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    // CI'da build ayrı bir adımda (.github/workflows/ci.yml -> e2e job'u,
    // "Build" step'i) gerçek Supabase env değişkenleriyle zaten alınıyor;
    // burada tekrar `npm run build` çalıştırmak boşa zaman harcar ve
    // webServer.timeout'u aşma riski taşır. Yerelde ise `npm run test:e2e`
    // tek başına çalışabilsin diye build adımı komuta dahil edilir.
    command: process.env.CI ? 'npm run start' : 'npm run build && npm run start',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // ORTAM TUZAĞI KAPATILDI — `NEXT_PUBLIC_*` değişkenleri BUILD ZAMANINDA
    // bundle'a gömülür. Depoda duran `.env.local` BARINDIRILAN (uzak) Supabase
    // projesini gösteriyor; bu blok olmadan yukarıdaki `npm run build` uygulamayı
    // uzak projeye bağlar, yerel seed kullanıcıları orada bulunmadığı için TÜM
    // E2E login'leri kırılır. (Bu tuzak iki kez vakit kaybettirdi.)
    //
    // Aşağıdaki değerler yerel Supabase yığınının SABİT DEMO ANAHTARLARIDIR
    // (`npx supabase status` her kurulumda aynısını üretir) — gerçek sır DEĞİLDİR,
    // depoya yazılmalarında sakınca yoktur.
    //
    // Dışarıdan verilen değer HER ZAMAN önceliklidir: CI kendi ortam
    // değişkenleriyle (.github/workflows/ci.yml) bunları geçersiz kılar,
    // geliştirici de tek seferlik başka bir hedefe yönlendirebilir.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      // A-12 (src/env.ts) NODE_ENV=production iken AI_BACKEND_API_KEY'i zorunlu kılar
      // (fail-fast). `next start` NODE_ENV=production ile çalıştığından bu değer
      // olmadan middleware HER istekte throw eder ve e2e paketi tamamen kırılır.
      // ai_backend servisi bu webServer komutuyla ayağa kalkmadığından (yalnızca
      // Next.js `build && start`), AI uçlarına giden istekler zaten bağlantı
      // hatası alacaktır — burada gereken tek şey zod doğrulamasını geçecek
      // boş olmayan bir yerel test değeri sağlamaktır, gerçek sır DEĞİLDİR.
      AI_BACKEND_API_KEY: process.env.AI_BACKEND_API_KEY ?? 'playwright-e2e-local-test-key',
    },
    // CI'da yalnızca `next start` çalıştığı için 120 sn fazlasıyla yeterli;
    // yerelde build de dahil olduğundan daha cömert bir süre tanınıyor.
    timeout: process.env.CI ? 120_000 : 300_000,
  },
})
