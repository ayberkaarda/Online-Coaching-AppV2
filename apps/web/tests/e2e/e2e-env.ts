// E2E paketinin ORTAM SABİTLERİ — tek kaynak.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN AYRI BİR MODÜL
// ─────────────────────────────────────────────────────────────────────────────
// Bu iki değer (Supabase adresi + anon anahtar) artık İKİ AYRI süreçte lazım:
//
//   1. `playwright.config.ts` -> `webServer.env`  : uygulamayı build edip başlatan
//      Next.js süreci (NEXT_PUBLIC_* değerleri BUILD ZAMANINDA bundle'a gömülür).
//   2. `coach-mfa.ts`         -> `global-setup`   : koçun TOTP faktörünü kuran
//      Node tarafı Supabase istemcisi (Faz 4.7 dilim 2).
//
// İkisi AYNI hedefi göstermek ZORUNDA: global-setup A projesine faktör kurup
// tarayıcı B projesine giderse, koç "faktörün yok" ekranında kalır ve tüm koç
// spec'leri anlaşılmaz biçimde düşer. Değerler iki dosyaya kopyalansaydı bu
// ayrışma SESSİZ olurdu; burada tek yerde durur.
//
// Test kullanıcıları da (`TEST_USERS`) buraya taşındı: `coach-mfa.ts` koçun
// e-postasını bilmek zorunda ve `fixtures.ts`ten alsaydı iki modül DÖNGÜSEL
// import ederdi (fixtures -> coach-mfa -> fixtures). `fixtures.ts` bunları
// yeniden dışa aktarır, yani spec dosyalarının import satırları DEĞİŞMEDİ.

/**
 * Aşağıdaki değerler yerel Supabase yığınının SABİT DEMO ANAHTARLARIDIR
 * (`npx supabase status` her kurulumda aynısını üretir) — gerçek sır DEĞİLDİR.
 * Dışarıdan verilen değer HER ZAMAN önceliklidir (CI kendi ortam değişkenlerini
 * geçirir; geliştirici tek seferlik başka bir hedefe yönlendirebilir).
 */
export const E2E_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

export const E2E_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/**
 * Uygulamanın E2E koşusundaki adresi. `playwright.config.ts` bunu hem `use.baseURL`
 * hem `webServer.url` olarak kullanır; `fixtures.ts` -> `createCoachAal2State()` de
 * kendi tarayıcısını buna bağlar (o tarayıcı `use.baseURL`'i devralmaz, çünkü
 * global-setup içinde elle açılır).
 */
export const E2E_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export interface TestUser {
  email: string
  password: string
}

// E-postalar supabase/seed.sql'den; env ile geçersiz kılınabilir (bkz. tests/e2e/README.md).
export const TEST_USERS: { client: TestUser; coach: TestUser } = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? 'client1@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
  coach: {
    email: process.env.E2E_COACH_EMAIL ?? 'coach@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
}
