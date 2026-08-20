// README ekran görüntülerini üreten TEK SEFERLİK ARAÇ (test DEĞİLDİR).
//
// #############################################################################
// ## NEDEN BİR TEST DEĞİL, NEDEN `scripts/` ALTINDA                          ##
// #############################################################################
//
//   Kareler `docs/screenshots/` altında DEPODA durur: README'nin GitHub'da
//   render olması gerekiyor, CI artefaktı bu amacı öldürür. Bunun sonucu olarak
//   üretim de CI'a BAĞLANMAZ — her koşuda yeniden çekilen ikili dosyalar hem
//   flake hem diff gürültüsü demektir, kazancı yoktur. Görüntüler yalnızca
//   arayüz gerçekten değiştiğinde, elle tazelenir:
//
//       node scripts/capture-screenshots.mjs
//       node scripts/capture-screenshots.mjs --only=trend-charts
//
//   Bu yüzden dosya `apps/web/tests/e2e/` altında DEĞİL: orada olsaydı
//   `pnpm run test:e2e` paketine (ve dolayısıyla CI'a) girer, 54 testlik
//   tabanı ikili dosya yazan bir "test" ile kirletirdi.
//
// #############################################################################
// ## ÖN KOŞULLAR                                                             ##
// #############################################################################
//
//   1. Yerel Supabase yığını ayakta ve seed uygulanmış olmalı.
//   2. Uygulama AYAKTA olmalı (`pnpm run build && pnpm run start`, :3000).
//      Bu betik sunucu BAŞLATMAZ — Playwright'ın `webServer`i gibi davranıp
//      arka planda süreç yönetmek, elle koşulan bir araç için gereksiz karmaşa.
//   3. Koçun TOTP faktörü kurulu olmalı (`apps/web/.e2e-coach-totp.json`).
//      Dosya yoksa bir kez `pnpm run test:e2e` koşmak yeterlidir: E2E
//      `global-setup`ı faktörü kurar ve secret'ı oraya yazar.
//
// #############################################################################
// ## NEDEN E2E FİKSTÜRLERİ DOĞRUDAN İMPORT EDİLMİYOR                         ##
// #############################################################################
//
//   `apps/web/tests/e2e/fixtures.ts` TypeScript'tir ve uzantısız görece
//   import'lar kullanır (`./coach-mfa`) — Node'un ESM çözümleyicisi bunları
//   olduğu gibi yükleyemez. Bu yüzden İHTİYAÇ DUYULAN İKİ PARÇA (parola girişi
//   ve koçun `aal2` step-up'ı) burada YENİDEN YAZILDI; davranış birebir aynı
//   kalsın diye seçiciler ve akış o dosyalardan BİREBİR kopyalandı:
//     * giriş formu  -> tests/e2e/fixtures.ts   (`login`)
//     * TOTP step-up -> tests/e2e/coach-mfa.ts  (`stepUpCoachSessionViaUi`)
//   Kaynak dosyalar değişirse burası da elle güncellenmelidir; bedeli düşüktür
//   (iki kısa fonksiyon) ve karşılığında araç, test paketinden BAĞIMSIZ kalır.
//
// #############################################################################
// ## SABİT ANAHTAR YOKTUR                                                    ##
// #############################################################################
//
//   Bu betik Supabase'e DOĞRUDAN bağlanmaz (yalnızca tarayıcıyı sürer), yani
//   anon anahtarına hiç ihtiyacı yoktur — anahtar tek yerde, uygulamanın kendi
//   `.env.local`ındadır. Depoya sabit JWT yazmak gitleaks'i iki kez kırdı
//   (bkz. `apps/web/tests/e2e/e2e-env.ts`); o kapı burada baştan kapalıdır.
//   TOTP secret'ı da yalnızca `.gitignore`lu dosyadan/ortamdan OKUNUR.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const WEB_ROOT = path.join(REPO_ROOT, 'apps', 'web')
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'screenshots')

// Playwright ve otplib `apps/web`in bağımlılıklarıdır; pnpm izolasyonu yüzünden
// kök `node_modules`ta GÖRÜNMEZLER. Çözüm o paketin kendi require kökünden
// yapılır — kök `package.json`a yalnızca bu araç için bağımlılık eklemek
// (ve kilit dosyasını büyütmek) gereksizdir.
const webRequire = createRequire(path.join(WEB_ROOT, 'package.json'))

// `import()` DEĞİL `require()`: `@playwright/test` bir CommonJS paketidir ve
// dinamik import edildiğinde ad alanı yalnızca `default`u (test nesnesini)
// taşır — `chromium` oradan GÖRÜNMEZ. `require` paketin gerçek dışa
// aktarımlarını verir.
function requireFromWeb(specifier) {
  try {
    return webRequire(specifier)
  } catch (error) {
    throw new Error(
      `Bağımlılık çözülemedi: ${specifier}\n` +
        `Beklenen konum: ${WEB_ROOT}/node_modules\n` +
        'Ne yapmalı: depo kökünde `pnpm install` çalıştırın.\n' +
        `Ayrıntı: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ---------------------------------------------------------------------------
// AYARLAR
// ---------------------------------------------------------------------------

/**
 * SABİT MASAÜSTÜ BOYUTU — kareler yan yana konduğunda tutarlı görünsün diye
 * `fullPage` KULLANILMAZ: sayfa yüksekliği içerikle değişir, README'de her
 * görsel farklı en/boy oranıyla dururdu. Bunun yerine viewport kadar kare
 * alınır ve gerekli yere `scrollIntoViewIfNeeded` ile kaydırılır.
 */
const VIEWPORT = { width: 1440, height: 900 }

/**
 * ÇIKTI ÖLÇEĞİ — düzeni DEĞİL, yalnızca piksel yoğunluğunu etkiler.
 *
 * Sayfa yine 1440 CSS pikseli genişliğinde (masaüstü kırılım noktalarıyla)
 * render edilir; kare 0.75 ölçekle, 1080x675 olarak yazılır. GEREKÇE: bu
 * dosyalar DEPODA duruyor ve README'de en fazla ~900 px genişlikte
 * gösteriliyor — 1:1 ölçekte üretilen kareler görünür bir kazanç sağlamadan
 * dosya boyutunu ~%60 artırıyordu. Depoya `sharp`/`pngquant` gibi bir
 * optimizasyon bağımlılığı EKLEMEMEK için boyut, tek ayarla burada kontrol
 * edilir.
 */
const DEVICE_SCALE_FACTOR = Number(process.env.SHOT_SCALE ?? '0.75')

const BASE_URL =
  process.env.SHOT_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

// Hesaplar `supabase/seed.sql`den. VARSAYILAN DANIŞAN client2'DİR (Elif Demir):
// client1'in satırlarına E2E paketi yazıyor (rastgele 300+ kg form check'ler,
// yüzlerce "E2E mesaj ..." satırı), yani vitrin değeri taşımaz. client2'ye
// hiçbir spec dokunmaz — seed'deki gerçekçi seri orada bozulmadan durur.
const COACH = {
  email: process.env.SHOT_COACH_EMAIL ?? 'coach@example.com',
  password: process.env.SHOT_PASSWORD ?? process.env.E2E_PASSWORD ?? 'Passw0rd!23',
}
const CLIENT = {
  email: process.env.SHOT_CLIENT_EMAIL ?? 'client2@example.com',
  password: process.env.SHOT_PASSWORD ?? process.env.E2E_PASSWORD ?? 'Passw0rd!23',
}

// Koç karesinde portföy kartını hedeflemek için gerekir (`supabase/seed.sql`).
const CLIENT_FULL_NAME = process.env.SHOT_CLIENT_FULL_NAME ?? 'Elif Demir'

const COACH_TOTP_STORE_PATH = path.join(WEB_ROOT, '.e2e-coach-totp.json')

// ---------------------------------------------------------------------------
// ARGÜMANLAR
// ---------------------------------------------------------------------------

const FRAME_NAMES = ['coach-panel', 'trend-charts', 'form-check-compare', 'messaging', 'verilerim']

/**
 * VARSAYILAN KOŞUDA ATLANANLAR — yalnızca `--only=<ad>` ile çekilir.
 *
 * `form-check-compare` (öncesi/sonrası kıyaslaması) buradadır çünkü YEREL VERİDE
 * GÖSTERECEK FOTOĞRAF YOK: `supabase/seed.sql` `form_checks` satırlarına poz
 * YOLU yazar (`poses/<uuid>-w1-front.jpg`) ama `form-checks-media` bucket'ına
 * bu adlarla NESNE KOYMAZ, dolayısıyla imzalı adres üretilemez ve iki pano da
 * "Bu kayıt için fotoğraf bulunamadı." boş durumunu gösterir. Depodaki tek
 * gerçek nesneler E2E paketinin yüklediği 1x1 ŞEFFAF PNG'lerdir (üstelik
 * 300+ kg'lık rastgele kayıtlara bağlı) — onlar da boş bir kutu olarak çıkar.
 *
 * Boş durumu README'ye koymak arayüzü BOZUKMUŞ gibi gösterirdi; sahte "öncesi/
 * sonrası" fotoğrafı üretmek ise vitrini uydurma veriyle doldurmak olurdu.
 * Bu yüzden kare README'ye GİRMEDİ. Seed'e (ya da bucket'a) gerçek demo poz
 * görselleri eklendiği gün tek komutla üretilebilir:
 *
 *     node scripts/capture-screenshots.mjs --only=form-check-compare
 */
const OPT_IN_FRAMES = new Set(['form-check-compare'])

function parseArgs(argv) {
  let only = null
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Kullanım: node scripts/capture-screenshots.mjs [--only=<ad>]',
          '',
          'Kareler:',
          ...FRAME_NAMES.map(
            (name) => `  ${name}${OPT_IN_FRAMES.has(name) ? '   (yalnızca --only ile)' : ''}`
          ),
          '',
          'Ortam değişkenleri:',
          '  SHOT_BASE_URL        (varsayılan http://localhost:3000)',
          '  SHOT_COACH_EMAIL / SHOT_CLIENT_EMAIL / SHOT_PASSWORD',
          '  E2E_COACH_TOTP_SECRET (yoksa apps/web/.e2e-coach-totp.json okunur)',
        ].join('\n')
      )
      process.exit(0)
    }
    const match = /^--only=(.+)$/.exec(arg)
    if (match) {
      only = match[1]
      continue
    }
    throw new Error(`Bilinmeyen argüman: ${arg} (yardım için --help)`)
  }

  if (only !== null && !FRAME_NAMES.includes(only)) {
    throw new Error(`Bilinmeyen kare: ${only}\nGeçerli adlar: ${FRAME_NAMES.join(', ')}`)
  }
  return { only }
}

// ---------------------------------------------------------------------------
// GİRİŞ YARDIMCILARI (tests/e2e/fixtures.ts + coach-mfa.ts ile aynı seçiciler)
// ---------------------------------------------------------------------------

/**
 * Parolayla giriş. Etiket metinleri KAYNAKTAN BİREBİR alınır: "ŞİFRE" ve
 * "GİRİŞ YAP" noktalı büyük İ (U+0130) içerir ve JS'in `/i` bayrağı Türkçe
 * İ/i eşlemesini BİLMEZ (bkz. tests/e2e/fixtures.ts'teki aynı gerekçe).
 */
async function login(page, user) {
  await page.goto(`${BASE_URL}/login`)
  await page.getByLabel(/e-posta/i).fill(user.email)
  await page.getByLabel('ŞİFRE').fill(user.password)
  await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()
  await page.waitForURL(`${BASE_URL}/`)
}

/** `.gitignore`lu depodan (ya da ortamdan) koçun TOTP secret'ını okur. */
function readCoachTotpSecret() {
  const fromEnv = process.env.E2E_COACH_TOTP_SECRET
  if (fromEnv) return fromEnv

  if (!fs.existsSync(COACH_TOTP_STORE_PATH)) {
    throw new Error(
      [
        "Koç TOTP secret'ı bulunamadı — koç oturumu `aal2`ye çıkarılamaz ve",
        'koç ekranları (mfa_aal2_gate politikası) BOŞ görünürdü.',
        '',
        `Beklenen dosya: ${COACH_TOTP_STORE_PATH}`,
        '',
        'Ne yapmalı: bir kez `pnpm run test:e2e` koşun — E2E global-setup faktörü',
        'kurar ve secret dosyasını yazar. Ya da secret elinizdeyse:',
        '  E2E_COACH_TOTP_SECRET=<base32> node scripts/capture-screenshots.mjs',
      ].join('\n')
    )
  }

  const parsed = JSON.parse(fs.readFileSync(COACH_TOTP_STORE_PATH, 'utf8'))
  if (typeof parsed?.secret !== 'string' || parsed.secret.length === 0) {
    throw new Error(`TOTP secret dosyası okunamadı/biçimi beklenmedik: ${COACH_TOTP_STORE_PATH}`)
  }
  return parsed.secret
}

/**
 * Koç oturumunu `aal2`'ye çıkarır — uygulamanın KENDİ ekranından
 * (`/profile#guvenlik`), tıpkı `tests/e2e/coach-mfa.ts` gibi: doğrulamayı
 * uygulamanın Supabase istemcisi yaptığı için oturum cookie'sini de o yazar,
 * burada cookie biçimi elle ÜRETİLMEZ.
 *
 * NOT: GoTrue başarılı bir MFA doğrulamasında kullanıcının DİĞER oturumlarını
 * iptal eder (ölçüm: coach-mfa.ts başlığı). Yani bu betik, tarayıcıda açık bir
 * koç geliştirme oturumunu düşürebilir — E2E paketi de aynısını yapar.
 */
async function stepUpCoach(page, generateTotp) {
  const secret = readCoachTotpSecret()

  await page.goto(`${BASE_URL}/profile#guvenlik`)

  const stepUpCode = page.locator('#mfa-stepup-code')
  const enrollStart = page.getByRole('button', { name: 'Kurulumu Başlat' })
  await stepUpCode.or(enrollStart).first().waitFor({ state: 'visible', timeout: 30_000 })

  if (await enrollStart.isVisible()) {
    throw new Error(
      'Koç hesabında DOĞRULANMIŞ TOTP faktörü yok (kayıt ekranı açıldı).\n' +
        'Bir kez `pnpm run test:e2e` koşun; global-setup faktörü kurar.'
    )
  }

  // Kod 30 sn'lik pencerenin SINIRINDA üretilmiş olabilir. GoTrue ±1 pencere
  // tolerans tanıdığı için pratikte görülmez; tek bir yeniden deneme yine de
  // bu flake sınıfını tamamen kapatır (bedeli: bir pencere beklemek).
  for (let attempt = 1; ; attempt++) {
    await stepUpCode.fill(await generateTotp({ secret }))
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    try {
      await stepUpCode.waitFor({ state: 'hidden', timeout: 15_000 })
      break
    } catch (error) {
      if (attempt >= 2) throw error
      await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 250)
    }
  }

  await page.goto(`${BASE_URL}/`)
  await page.getByText('Koç Paneli', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
}

// ---------------------------------------------------------------------------
// ORTAK KARE YARDIMCILARI
// ---------------------------------------------------------------------------

/**
 * Kareyi diske yazar. `animations: 'disabled'` ZORUNLU: panelde `animate-ping`
 * / `animate-pulse` / `animate-bounce` sınıfları var ve durdurulmazsa aynı ekran
 * her koşuda FARKLI piksellerle çıkar — depoda duran ikili dosyalar için
 * gereksiz diff gürültüsü demektir.
 */
async function shoot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
  const { size } = fs.statSync(file)
  console.log(`  ✓ ${name}.png  (${(size / 1024).toFixed(0)} KB)`)
  return size
}

/** Toast bildirimlerinin kareye girmesini engeller (rıza verildiğinde çıkıyor). */
async function dismissToasts(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-sonner-toaster], [data-sonner-toast]').forEach((node) => {
      node.remove()
    })
  })
}

/** Sekmeye geçer ve panelin gerçekten boyandığını bekler. */
async function openTab(page, namePattern) {
  await page.getByRole('tab', { name: namePattern }).click()
  await page.getByRole('tabpanel').waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')
}

// ---------------------------------------------------------------------------
// KARELER
// ---------------------------------------------------------------------------

/**
 * 1) KOÇ PANELİ — `/users` (Kullanıcı Yönetim Merkezi).
 *
 * `/` yerine BURASI seçildi: `/` koçta da danışanla AYNI sekme şeridini
 * gösteriyor, yani "koça özgü" olan tek şey danışan seçici oluyor. `/users`
 * ise koçun gerçek çalışma ekranı: bekleyen form check kuyruğu, danışan
 * portföyü ve seçili danışanın GÜN HASSASİYETLİ etkinlik özeti bir arada.
 */
async function captureCoachPanel(page) {
  await page.goto(`${BASE_URL}/users`)
  await page.getByText('Danışan Portföyü', { exact: true }).waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')

  // Portföy kartına tıklamak seçili danışanın slide-over'ını açar; koçun asıl
  // "özet" yüzeyi burasıdır (trend + makro + etkinlik özeti tek yerde).
  await page
    .getByRole('button', { name: new RegExp(CLIENT_FULL_NAME) })
    .first()
    .click()
  const drawer = page.getByRole('dialog')
  await drawer.waitFor({ state: 'visible' })
  await drawer.getByText('Etkinlik Özeti', { exact: true }).waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')

  // Etkinlik özeti kartının ALTI viewport'un altına hizalanır: üstte makro
  // grafiği kalır, altta (poz fotoğrafı olmayan) kıyaslama bölümü kadraja
  // girmez. `scrollIntoViewIfNeeded` bunu garanti etmez — minimum kaydırma
  // yapar ve sonuç, kartın drawer'daki konumuna göre değişir.
  await drawer.evaluate((node) => {
    const heading = Array.from(node.querySelectorAll('h3')).find((element) =>
      element.textContent?.trim().startsWith('Etkinlik Özeti')
    )
    heading?.closest('div')?.scrollIntoView({ block: 'end' })
  })
  await page.waitForTimeout(500)
  await dismissToasts(page)
  return shoot(page, 'coach-panel')
}

/** 2) TREND GRAFİKLERİ — danışanın İstatistikler sekmesi, 90 günlük aralık. */
async function captureTrendCharts(page) {
  await page.goto(`${BASE_URL}/`)
  await openTab(page, /İstatistikler/)

  const panel = page.getByRole('tabpanel')
  // Seed serisi 6 hafta uzunluğunda; varsayılan 30 günlük aralık onu KIRPAR.
  await panel.getByRole('button', { name: '90 gün', exact: true }).click()
  await page.waitForLoadState('networkidle')

  await panel.getByText('Gelişim Analizi', { exact: true }).scrollIntoViewIfNeeded()
  await dismissToasts(page)
  return shoot(page, 'trend-charts')
}

/** 3) FORM CHECK ÖNCESİ/SONRASI — kıyaslama görünümü. */
async function captureFormCheckCompare(page) {
  await page.goto(`${BASE_URL}/`)
  await openTab(page, /Form Check/)

  const panel = page.getByRole('tabpanel')
  await panel.getByRole('button', { name: 'Öncesi / Sonrası Yap', exact: true }).click()
  await panel.getByText('Öncesi', { exact: true }).waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')

  await panel.getByText('Form Geçmişi ve Kıyaslama', { exact: true }).scrollIntoViewIfNeeded()
  await dismissToasts(page)
  return shoot(page, 'form-check-compare')
}

/** 4) MESAJLAŞMA — danışan/koç sohbeti. */
async function captureMessaging(page) {
  await page.goto(`${BASE_URL}/`)
  await openTab(page, /Sohbet/)

  const panel = page.getByRole('tabpanel')
  await panel.getByRole('log', { name: 'Mesajlar' }).waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')
  // Sohbet paneli viewport'a sığıyor: sayfa BAŞA sarılır ki başlık kırpılmasın.
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  await dismissToasts(page)
  return shoot(page, 'messaging')
}

/**
 * 5) `/verilerim` — etkinlik kaydı + rıza ekranı.
 *
 * RIZA GEREKLİDİR: `activity_events` yalnızca AÇIK RIZA varken yazılır (KVKK),
 * yani rıza kapalıyken bu ekran BOŞTUR ve vitrin değeri taşımaz. Betik rızayı
 * uygulamanın KENDİ ekranından, kutuyu işaretleyip düğmeye basarak verir —
 * veritabanına elle satır YAZILMAZ, gösterilen kayıt gerçek gezinme sırasında
 * gerçekten üretilmiş olaylardan oluşur.
 */
async function ensureActivityConsent(page) {
  await page.goto(`${BASE_URL}/verilerim`)
  await page.getByRole('heading', { name: 'Aktivite Kaydı' }).waitFor({ state: 'visible' })

  const consentSection = page.locator('section', { hasText: 'Aktivite Kaydı' }).first()
  const grantButton = consentSection.getByRole('button', {
    name: /Aktivite Kaydını Aç|Rızamı Tekrar Ver ve Aç/,
  })
  const alreadyOn = consentSection.getByText('Aktivite kaydınız açık.', { exact: true })

  await grantButton.or(alreadyOn).first().waitFor({ state: 'visible', timeout: 30_000 })
  if (await alreadyOn.isVisible()) return false

  await consentSection.getByRole('checkbox').check()
  await grantButton.click()
  await alreadyOn.waitFor({ state: 'visible', timeout: 30_000 })
  return true
}

async function captureVerilerim(page) {
  await page.goto(`${BASE_URL}/verilerim`)
  await page.getByRole('heading', { name: 'Verilerim' }).waitFor({ state: 'visible' })
  await page.getByText('Oturumlar', { exact: true }).waitFor({ state: 'visible' })
  await page.waitForLoadState('networkidle')

  // KADRAJ SAYFANIN BAŞINDA BIRAKILIR — kaydırılıp "Olaylar" listesine
  // odaklanmak CAZİP ama YANLIŞ olurdu: sayfanın kendi açıklama paragrafı
  // ("...koçunuz aynı bilgiyi yalnızca GÜN hassasiyetinde, saat/dakika olmadan
  // görür") karenin anlattığı asimetriyi birinci ağızdan söylüyor ve hemen
  // altındaki oturum listesi zaten saat/dakika damgası taşıyor. Ayrıca oturum
  // sayısı her koşuda arttığı için "olaylara kaydır" çapası kararsızdır.
  await page.evaluate(() => {
    window.scrollTo(0, 0)
  })
  await dismissToasts(page)
  return shoot(page, 'verilerim')
}

// ---------------------------------------------------------------------------
// ANA AKIŞ
// ---------------------------------------------------------------------------

async function assertAppIsUp() {
  let response
  try {
    response = await fetch(`${BASE_URL}/login`, { redirect: 'manual' })
  } catch (error) {
    throw new Error(
      [
        `Uygulamaya ulaşılamadı: ${BASE_URL}`,
        '',
        'Bu betik sunucu BAŞLATMAZ. Ayrı bir terminalde:',
        '  pnpm run build && pnpm run start',
        '',
        `Ayrıntı: ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n')
    )
  }
  if (!response.ok) {
    throw new Error(
      `Uygulama ${BASE_URL}/login için ${response.status} döndü — sunucu sağlıklı mı?`
    )
  }
}

async function main() {
  const { only } = parseArgs(process.argv.slice(2))
  const wanted = (name) => (only === null ? !OPT_IN_FRAMES.has(name) : only === name)

  await assertAppIsUp()

  const { chromium } = requireFromWeb('@playwright/test')
  const generateTotp = requireFromWeb('otplib').generate
  if (typeof generateTotp !== 'function') {
    throw new Error("otplib'den `generate` alınamadı — paket sürümü değişmiş olabilir.")
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const sizes = []
  try {
    // --- DANIŞAN OTURUMU: 2, 3, 4 ve 5. kareler ---------------------------
    if (
      wanted('trend-charts') ||
      wanted('form-check-compare') ||
      wanted('messaging') ||
      wanted('verilerim')
    ) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        // README'de okunaklı olsun diye AÇIK TEMA sabitlenir: uygulama
        // `next-themes` ile `defaultTheme="system"` kullanıyor, yani tema
        // `prefers-color-scheme`ten türüyor.
        colorScheme: 'light',
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        reducedMotion: 'reduce',
      })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(30_000)
        console.log(`• Danışan oturumu: ${CLIENT.email}`)
        await login(page, CLIENT)

        // Rıza SIRAYLA ÖNCE verilir: `tab_view` olayları ancak rıza açıkken
        // yazılır, yani aşağıdaki sekme gezintisi 5. karenin verisini üretir.
        if (wanted('verilerim')) {
          const granted = await ensureActivityConsent(page)
          console.log(`  · aktivite rızası: ${granted ? 'bu koşuda AÇILDI' : 'zaten açıktı'}`)
        }

        if (wanted('trend-charts')) sizes.push(await captureTrendCharts(page))
        if (wanted('form-check-compare')) sizes.push(await captureFormCheckCompare(page))
        if (wanted('messaging')) sizes.push(await captureMessaging(page))
        if (wanted('verilerim')) {
          // Son sekme görüntülemesi ancak BAŞKA bir sekmeye geçilince
          // `duration_sec` ile kapatılıp gönderilir (bkz. lib/activity/controller.ts).
          await page.goto(`${BASE_URL}/`)
          await openTab(page, /Duyurular/)
          await openTab(page, /İstatistikler/)
          sizes.push(await captureVerilerim(page))
        }
      } finally {
        await context.close()
      }
    }

    // --- KOÇ OTURUMU: 1. kare ---------------------------------------------
    if (wanted('coach-panel')) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        colorScheme: 'light',
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        reducedMotion: 'reduce',
      })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(30_000)
        console.log(`• Koç oturumu: ${COACH.email} (aal2 step-up)`)
        await login(page, COACH)
        await stepUpCoach(page, generateTotp)
        sizes.push(await captureCoachPanel(page))
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  const total = sizes.reduce((sum, size) => sum + size, 0)
  console.log(`\n${sizes.length} kare üretildi — toplam ${(total / 1024).toFixed(0)} KB`)
  console.log(`Konum: ${OUT_DIR}`)
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
