import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

import { E2E_BASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_URL } from './tests/e2e/e2e-env'

// ---------------------------------------------------------------------------
// KATMAN 1 — UZAK (BARINDIRILAN) SUPABASE'E KARŞI E2E KOŞMAYI ENGELLEYEN İDDİA
//
// NEDEN AYRI BİR SATIR: aşağıdaki `webServer.env` bloğu da aynı tuzağı kapatıyor,
// ama o blok bir gün "env'i sadeleştirelim" diye silinirse koruma SESSİZCE kaybolur
// ve bir sonraki `pnpm run test:e2e` barındırılan projeye GERÇEK VERİ YAZAR
// (`daily-log` senaryosu kayıt oluşturur; bkz. docs/PROGRESS.md §5). Bu iddia
// config nesnesi kurulmadan ÖNCE, modül değerlendirme anında çalışır: tek tarayıcı
// açılmadan, `pnpm run build` bile alınmadan düşer. İki koruma birbirini YEDEKLER —
// biri kaybolursa diğeri hâlâ ayakta kalır, o yüzden ikisi de burada durur.
//
// KASITLI OLARAK `NODE_ENV`'E KOŞULLU DEĞİL: e2e paketi `pnpm run build && pnpm run
// start` üzerinden koşar ve `next start` NODE_ENV=production ile çalışır (bkz.
// aşağıdaki A-12 notu). `NODE_ENV !== 'production'` gibi bir koşul, korumaya
// çalıştığı senaryonun tam olarak içinde kendini kapatırdı.
// TEK KAYNAK: aynı değerler `tests/e2e/coach-mfa.ts` (global-setup'ın Node tarafı
// Supabase istemcisi) tarafından da kullanılıyor. İki kopya olsaydı, biri
// değiştirilip diğeri unutulduğunda global-setup A projesine TOTP faktörü kurar,
// tarayıcı B projesine giderdi ve tüm koç spec'leri anlaşılmaz biçimde düşerdi.
const effectiveSupabaseUrl = E2E_SUPABASE_URL
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
 * Yerel worker tavanı — YALNIZCA SUNUCU/ÇALIŞTIRMA YÜKÜ İÇİN.
 *
 * NE İÇİN DEĞİL: veri çakışması. O sorun `tests/e2e/resource-lock.ts` ile
 * kaynak bazında çözülür; worker sayısını kısmak çakışmayı yalnızca
 * SEYRELTİR, ÇÖZMEZ (ve `workers: 1` geri bildirim süresini katlar).
 *
 * ###########################################################################
 * # TAVAN İKİNCİ KEZ AYARLANIYOR (2026-08) — TAM TEŞHİS GEÇMİŞİ             #
 * ###########################################################################
 *
 * Paket 50'den 54 teste çıkıp Faz 4 ekranları ağırlaşınca (imzalı adres
 * üretimi, trend sorgusu, 1328 satırlık katalog) eski tavan (4, bu makinede
 * `Math.max(2, Math.min(4, Math.ceil(cpus/2)))`) yerelde KARARSIZ hale geldi:
 * tam paket koşusunda düzenli olarak 5 failed/49 passed, hepsi AYNI imza
 * (`page.waitForURL: Test timeout of 30000ms exceeded — waiting for
 * navigation to "/"`, login sonrası dashboard yüklemesi). CI (`workers: 1,
 * retries: 2`) HER ZAMAN 54/54 geçti — yani bu bir ürün regresyonu ya da test
 * mantığı hatası DEĞİL, YEREL çalıştırma ortamının bir sınırı.
 *
 * SIRAYLA ELENEN HİPOTEZLER (her biri ayrıca ölçüldü):
 *
 *  1. Ürün yavaşlığı — ELENDİ. İzole (sıfır eşzamanlılık) login+dashboard
 *     açılışı `waitForURL('/')` 97-140ms, tam networkidle ~900-1300ms sürdü.
 *     16 eşzamanlı login'de bile navWaitMs tavanı ~450ms. Sunucuyu `/`
 *     reload'la döven ayrı bir stres testinde (20 eşzamanlı bağlam) taze
 *     login'ler yine ~1.6s'de kaldı. SOĞUK BAŞLANGIÇ testinde — taze
 *     `next start` hazır olur olmaz 14 eşzamanlı login + AYNI ANDA
 *     Stats/Antrenman/Beslenme/Sohbet sekmelerine tıklama (paket
 *     başlangıcının en agresif taklidi) — navWaitMs yine ~490ms'de tavan
 *     yaptı, toplam akış 2.5s'i geçmedi. 30 saniyeye yaklaşan HİÇBİR ölçüm
 *     yok. (Ayrıca doğrulandı: sekmeler koşullu render edilir — DOM'da gizli
 *     durmaz — ve katalog/trend/imzalı-adres sorguları yalnızca ilgili
 *     sekmeye TIKLANINCA çalışır, dashboard açılışında DEĞİL.)
 *  2. Video kaydı CPU maliyeti — ELENDİ. `video: 'retain-on-failure'` HER
 *     testte sürekli encode yapar (yalnızca geçerse dosya silinir); yerelde
 *     `video: 'off'` ile aynı tavanda (4) tam paket yine AYNI BÜYÜKLÜKTE
 *     başarısız oldu (5 failed/49 passed) — hatta düşen testlerin kimliği
 *     bile koşudan koşuya değişti. Video ayarı bu yüzden ESKİ HALİNE
 *     (`retain-on-failure`) geri alındı: performansa faydası yok ama yerelde
 *     bir test düşünce gerçek teşhis değeri taşıyor.
 *  3. OneDrive senkron I/O — ELENDİ. Repo `OneDrive\Masaüstü\...` altında;
 *     varsayılan `outputDir` (`test-results/`) de bu senkronlu klasörün
 *     içindeydi. Çıktı `os.tmpdir()`'a (OneDrive DIŞI, bkz. `outputDir`
 *     aşağıda) taşınıp aynı tavanda (4) tekrar koşuldu — yine AYNI
 *     BÜYÜKLÜKTE başarısız oldu (5 failed/49 passed, yine farklı testler).
 *     `outputDir` yine de OneDrive dışında BIRAKILDI (zararsız, hijyen).
 *
 * KALAN AÇIKLAMA (elenmedi, doğrulanamadı da): gerçek Playwright
 * çalıştırması bu betiklerle ölçülemeyen bir CPU yükü taşıyor olabilir —
 * birden fazla GERÇEK Chromium örneğinin (headless de olsa) JS/layout/
 * paint/GC maliyeti, iddia polling'i, ve özellikle İKİNCİ bir tarayıcı
 * bağlamı açan testlerin (6/9 spec dosyası) ikiye katlanan ayak izi. Düşen
 * testler tavan=2'de İKİ AYRI KOŞUDA BİREBİR AYNI ikiliydi
 * (`plans.spec.ts:292`, `progress.spec.ts:66` — ikisi de ikinci bağlam açan
 * testler) — rastgele çekişme olsa kurban seti değişirdi; bu, en ağır
 * testlerin CPU baskısı altında ilk açlık çekenler olduğunu düşündürüyor.
 *
 * SONUÇ: tavan=2 dahi 54/54'e HER ZAMAN ulaşmadı (ölçülen: 52/54 iki ayrı
 * koşuda, aynı iki test). Tavan=3 ve 4 daha kötüydü (sırasıyla 3 ve 5 farklı
 * başarısızlık). tavan=2, ÖLÇÜLEN en yüksek/en iyi yerel değer olduğu için
 * seçildi — "kararlı 54/54" GARANTİSİ DEĞİL. Yerelde tam paket ara sıra
 * kırmızı çıkarsa ve tekrar koşmak istemiyorsanız `CI=1 pnpm exec playwright test`
 * kullanın (bkz. tests/e2e/README.md) — CI yolu her zaman 54/54 verdi.
 *
 * Paket büyüdükçe (54'ten fazla test, daha ağır ekranlar) bu tavan yeniden
 * ölçülüp değerlendirilmeli — bu not böyle bir yeniden değerlendirmenin
 * İKİNCİ turu.
 *
 * `PLAYWRIGHT_WORKERS` ile geçersiz kılınabilir (ör. daha güçlü bir makinede,
 * ya da CPU sayısına göre yeniden ölçüm yapıldığında).
 */
const localWorkers = process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 2

export default defineConfig({
  testDir: './tests/e2e',
  // ÖLÇÜLDÜ VE ELENDİ (bkz. `localWorkers` yorumu — hipotez #3): repo
  // `OneDrive\Masaüstü\...` altında, yani OneDrive'ın canlı senkronladığı bir
  // klasörde; varsayılan `outputDir` (`test-results/`) da bu klasörün
  // içindeydi. Çıktı `os.tmpdir()`'a (OneDrive DIŞI) taşınıp aynı tavanda tam
  // paket tekrar koşuldu — 30sn'lik takılmalar AYNI BÜYÜKLÜKTE devam etti,
  // yani OneDrive I/O senkronu bunların NEDENİ değil. Taşıma yine de burada
  // BIRAKILDI: zararsız ve test artefaktlarını (video/screenshot/trace)
  // bulut-senkronlu bir klasörün dışında tutmak kendi başına hijyenik bir
  // iyileştirme — geri almanın bir gerekçesi yok.
  outputDir: path.join(os.tmpdir(), 'pw-results-my-coaching-appv2'),
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
    baseURL: E2E_BASE_URL,
    // `trace: 'on-first-retry'` yerelde zaten MALİYETSİZ: `retries: 0` olduğu için
    // hiçbir yerel test asla "ilk retry"ye ulaşmaz, trace hiç toplanmaz. CI'da
    // (`retries: 2`) tanı amacıyla ilk retry'de devreye girer — DOKUNULMADI.
    trace: 'on-first-retry',
    // `screenshot: 'only-on-failure'` zaten ucuz: yalnızca başarısızlık anında TEK
    // kare alınır, sürekli bir kayıt maliyeti yok — DOKUNULMADI.
    screenshot: 'only-on-failure',
    //
    // ÖLÇÜLDÜ VE ELENDİ — video kaydı ("her testte sürekli ffmpeg encode, yalnızca
    // hatada dosya tutulur" maliyeti) 30sn'lik yerel takılmaların nedeni DEĞİL:
    // yerelde `video: 'off'` ile mevcut worker tavanında (4) tam paket yine
    // AYNI BÜYÜKLÜKTE başarısız oldu (5 failed/49 passed, orijinal baseline'la
    // birebir aynı sayı). Video kaydının kapatılmasının performansa faydası
    // OLMADIĞI ÖLÇÜLDÜ; buna karşılık video, yerelde bir test düşünce GERÇEK
    // teşhis değeri taşır — o yüzden buradan geri alındı, eski hâli korunuyor.
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
    // burada tekrar `pnpm run build` çalıştırmak boşa zaman harcar ve
    // webServer.timeout'u aşma riski taşır. Yerelde ise `pnpm run test:e2e`
    // tek başına çalışabilsin diye build adımı komuta dahil edilir.
    command: process.env.CI ? 'pnpm run start' : 'pnpm run build && pnpm run start',
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    // ORTAM TUZAĞI KAPATILDI — `NEXT_PUBLIC_*` değişkenleri BUILD ZAMANINDA
    // bundle'a gömülür. `.env.local` eskiden BARINDIRILAN (uzak) Supabase projesini
    // gösteriyordu; bu blok olmadan yukarıdaki `pnpm run build` uygulamayı uzak projeye
    // bağlıyor, yerel seed kullanıcıları orada bulunmadığı için TÜM E2E login'leri
    // kırılıyor ve dahası uzak veritabanına gerçek veri yazılıyordu. (Bu tuzak iki kez
    // vakit kaybettirdi.) `.env.local` artık yerel yığını gösteriyor ve dosyanın
    // tepesindeki KATMAN 1 iddiası aynı tuzağı ikinci kez kapatıyor; bu blok ÜÇÜNCÜ
    // yedek olarak KASITLI şekilde yerinde bırakıldı — üçü birden kaybolmadıkça
    // koşu yanlış hedefe gidemez.
    //
    // Değerlerin kendisi `tests/e2e/e2e-env.ts` içindedir (TEK KAYNAK — global-setup
    // da aynı hedefe bağlanmak zorunda). Orada duran şey yerel Supabase yığınının
    // SABİT DEMO ANAHTARLARIDIR (`npx supabase status` her kurulumda aynısını
    // üretir) — gerçek sır DEĞİLDİR, depoya yazılmalarında sakınca yoktur.
    //
    // Dışarıdan verilen değer HER ZAMAN önceliklidir: CI kendi ortam
    // değişkenleriyle (.github/workflows/ci.yml) bunları geçersiz kılar,
    // geliştirici de tek seferlik başka bir hedefe yönlendirebilir.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
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
