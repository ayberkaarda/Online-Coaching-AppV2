import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'

// ---------------------------------------------------------------------------
// KATMAN 1 — UZAK (BARINDIRILAN) SUPABASE'E KARŞI E2E KOŞMAYI ENGELLEYEN İDDİA
//
// NEDEN AYRI BİR SATIR: aşağıdaki `webServer.env` bloğu da aynı tuzağı kapatıyor,
// ama o blok bir gün "env'i sadeleştirelim" diye silinirse koruma SESSİZCE kaybolur
// ve bir sonraki `npm run test:e2e` barındırılan projeye GERÇEK VERİ YAZAR
// (`daily-log` senaryosu kayıt oluşturur; bkz. docs/PROGRESS.md §5). Bu iddia
// config nesnesi kurulmadan ÖNCE, modül değerlendirme anında çalışır: tek tarayıcı
// açılmadan, `npm run build` bile alınmadan düşer. İki koruma birbirini YEDEKLER —
// biri kaybolursa diğeri hâlâ ayakta kalır, o yüzden ikisi de burada durur.
//
// KASITLI OLARAK `NODE_ENV`'E KOŞULLU DEĞİL: e2e paketi `npm run build && npm run
// start` üzerinden koşar ve `next start` NODE_ENV=production ile çalışır (bkz.
// aşağıdaki A-12 notu). `NODE_ENV !== 'production'` gibi bir koşul, korumaya
// çalıştığı senaryonun tam olarak içinde kendini kapatırdı.
const effectiveSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const supabaseHost = (() => {
  try {
    return new URL(effectiveSupabaseUrl).hostname
  } catch {
    // Ayrıştırılamayan değer (şema unutulmuş vb.): ham metni sondaki `/` ve port
    // olmadan değerlendir — hatalı biçimli bir URL yüzünden korumayı ATLATMA.
    return effectiveSupabaseUrl.replace(/\/+$/, '')
  }
})()

if (/\.supabase\.(co|com)$/.test(supabaseHost) && process.env.E2E_ALLOW_REMOTE_SUPABASE !== '1') {
  throw new Error(
    'E2E paketi BARINDIRILAN (uzak) bir Supabase projesine yönlendirilmiş: ' +
      `${supabaseHost}\n` +
      'Bu koşu uzak veritabanına GERÇEK VERİ YAZAR (ör. daily-log senaryosu kayıt oluşturur) ' +
      've yerel seed kullanıcıları orada bulunmadığı için zaten tüm login testleri kırılır.\n' +
      '\n' +
      'Ne yapmalı:\n' +
      '  - Yerele karşı koşmak için: NEXT_PUBLIC_SUPABASE_URL değişkenini ayarlamayın ' +
      '(varsayılan http://127.0.0.1:54321) ve `.env.local` dosyanızın yerel yığını ' +
      'gösterdiğinden emin olun.\n' +
      '  - Uzak hedefi GERÇEKTEN istiyorsanız: E2E_ALLOW_REMOTE_SUPABASE=1 ayarlayın.'
  )
}

/**
 * Yerel worker tavanı — YALNIZCA SUNUCU YÜKÜ İÇİN.
 *
 * NE İÇİN DEĞİL: veri çakışması. O sorun `tests/e2e/resource-lock.ts` ile
 * kaynak bazında çözülür; worker sayısını kısmak çakışmayı yalnızca
 * SEYRELTİR, ÇÖZMEZ (ve `workers: 1` geri bildirim süresini katlar).
 *
 * NE İÇİN: Playwright varsayılanı mantıksal çekirdeğin YARISIDIR (bu makinede
 * 12 -> 6). Testlerin çoğu ikinci bir tarayıcı bağlamı da açtığından bu, TEK
 * bir `next start` süreci ve tek bir yerel Supabase yığınına karşı ~12 eş
 * zamanlı tarayıcı bağlamı demek. Ölçüldü: 6 worker'da tam paket koşusunda
 * `workout.spec.ts` bir kez, hiçbir iddiada değil, koç panelini yeniden
 * yükledikten sonra (`selectClient`) sunucu doygunluğu yüzünden timeout'a
 * düştü. Tavan, doygunluğu ortadan kaldırır ama gerçek paralelliği korur.
 *
 * `PLAYWRIGHT_WORKERS` ile geçersiz kılınabilir (ör. daha güçlü bir makinede).
 */
const localWorkers = process.env.PLAYWRIGHT_WORKERS
  ? Number(process.env.PLAYWRIGHT_WORKERS)
  : Math.max(2, Math.min(4, Math.ceil(os.cpus().length / 2)))

export default defineConfig({
  testDir: './tests/e2e',
  // Koşu başında sahipsiz kalmış paylaşılan-kaynak kilitlerini siler
  // (bkz. tests/e2e/resource-lock.ts).
  globalSetup: './tests/e2e/global-setup.ts',
  // İZOLASYON: paket TEK bir veritabanına ve seed'deki iki sabit danışan
  // hesabına karşı koşuyor, ayrıca her spec AYNI anda iki projede (chromium +
  // Mobile Chrome) çalışıyor. Testler arası veri çakışması `fullyParallel`
  // kapatılarak DEĞİL, mutasyona uğrayan kaynakların testler tarafından
  // ilan edilip kilitlenmesiyle çözülür (tests/e2e/resource-lock.ts).
  // Böylece bağımsız testler tam paralel koşmaya devam eder.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : localWorkers,
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
    // bundle'a gömülür. `.env.local` eskiden BARINDIRILAN (uzak) Supabase projesini
    // gösteriyordu; bu blok olmadan yukarıdaki `npm run build` uygulamayı uzak projeye
    // bağlıyor, yerel seed kullanıcıları orada bulunmadığı için TÜM E2E login'leri
    // kırılıyor ve dahası uzak veritabanına gerçek veri yazılıyordu. (Bu tuzak iki kez
    // vakit kaybettirdi.) `.env.local` artık yerel yığını gösteriyor ve dosyanın
    // tepesindeki KATMAN 1 iddiası aynı tuzağı ikinci kez kapatıyor; bu blok ÜÇÜNCÜ
    // yedek olarak KASITLI şekilde yerinde bırakıldı — üçü birden kaybolmadıkça
    // koşu yanlış hedefe gidemez.
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
      // A-12 (src/env.server.ts) NODE_ENV=production iken AI_BACKEND_API_KEY'i zorunlu kılar
      // (fail-fast, `superRefine`). `next start` NODE_ENV=production ile çalıştığından bu değer
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
