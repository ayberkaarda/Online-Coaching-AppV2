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
    // CI'da yalnızca `next start` çalıştığı için 120 sn fazlasıyla yeterli;
    // yerelde build de dahil olduğundan daha cömert bir süre tanınıyor.
    timeout: process.env.CI ? 120_000 : 300_000,
  },
})
