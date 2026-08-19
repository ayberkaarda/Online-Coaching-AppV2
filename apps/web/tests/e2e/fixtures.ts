// Playwright E2E ortak yardımcıları: test kullanıcıları, giriş/çıkış akışları.
// Seçicilerde rol/etiket tabanlı locator kullanılır (Tailwind sınıflarına bağımlı DEĞİLDİR).

import fs from 'node:fs'
import path from 'node:path'

import { chromium, expect, type Cookie, type Page } from '@playwright/test'

import { stepUpCoachSessionViaUi } from './coach-mfa'
import { E2E_BASE_URL, TEST_USERS, type TestUser } from './e2e-env'
import { LOCK_ROOT, withResourceLock } from './resource-lock'

// Test kullanıcıları `e2e-env.ts`e TAŞINDI (döngüsel import'u önlemek için:
// `coach-mfa.ts` koçun e-postasını bilmek zorunda, ama bu dosya da ondan
// `stepUpCoachSessionViaUi` alıyor). Spec dosyalarının import satırları
// DEĞİŞMESİN diye buradan aynen yeniden dışa aktarılır.
export { TEST_USERS }
export type { TestUser }

/** `/login`'e gider, formu doldurup gönderir ve `/`'e yönlendirmeyi bekler. */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/e-posta/i).fill(user.email)
  // "ŞİFRE" etiketi noktalı büyük İ (U+0130) içerir. JS'in case-insensitive regex
  // motoru İ'yi düz "i" ile eşleştirmez (ECMAScript Canonicalize, Türkçe'ye özgü
  // İ/i - I/ı eşlemesini bilmez), bu yüzden /şifre/i HİÇBİR ZAMAN eşleşmez.
  // Kaynaktaki metin birebir (aynı harf biçimiyle) kullanılır.
  await page.getByLabel('ŞİFRE').fill(user.password)
  // Not: buton metni tamamı büyük harf Türkçe "GİRİŞ YAP" içerir (noktalı büyük İ).
  // Case-insensitive regex'te büyük/küçük İ/I dönüşümü güvenilir olmadığından
  // kaynaktaki metin birebir (aynı harf biçimiyle) kullanılır.
  await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()
  await page.waitForURL('/')
}

// ---------------------------------------------------------------------------
// KOÇ OTURUMU — koşu başına TEK aal2 oturumu, tüm koç testlerine kopyalanır
// ---------------------------------------------------------------------------

/**
 * Koç `aal2` oturumunun `storageState` dosyası.
 *
 * `LOCK_ROOT` ALTINDA OLMASI KASITLI: `global-setup.ts` her koşunun başında bu
 * kökü siliyor, yani durum dosyası KOŞU BAŞINA kendiliğinden tazeleniyor. Depoya
 * ya da `apps/web` altına konsaydı, önceki koşudan kalmış ve süresi dolmuş bir
 * token'la yeni koşuya girilir; hata da "oturum yok" gibi anlaşılmaz bir yerde
 * patlardı. (`os.tmpdir()` seçimi ayrıca OneDrive senkronunun dışında kalır —
 * `resource-lock.ts` aynı gerekçeyi kilitler için yazıyor.)
 */
const COACH_STATE_PATH = path.join(LOCK_ROOT, 'coach-aal2-state.json')

/** Durum üretimini süreçler arası tekilleştiren kilit anahtarı. */
const COACH_STATE_LOCK = 'coach-aal2-state'

/**
 * Durumun "taze" sayıldığı süre.
 *
 * Yerel GoTrue'da `jwt_expiry` 900 sn (15 dk). Bu eşik ondan BELİRGİN biçimde
 * kısa tutuldu: süresi dolmak üzere olan bir token enjekte edilirse uygulama
 * kendi kendine yenilemeye kalkar ve AYNI refresh token'ı paylaşan diğer
 * bağlamlar rotasyon yüzünden oturumu kaybedebilir. Yerel tam paket ~3 dk
 * sürüyor, yani pratikte bu dal HİÇ çalışmaz; uzun (CI, `workers: 1`,
 * `retries: 2`) koşularda ise durum sessizce ölmek yerine YENİDEN üretilir.
 */
const COACH_STATE_MAX_AGE_MS = 8 * 60_000

interface SavedStorageState {
  cookies: Cookie[]
}

function coachStateAgeMs(): number | null {
  try {
    return Date.now() - fs.statSync(COACH_STATE_PATH).mtimeMs
  } catch {
    return null
  }
}

function readCoachState(): SavedStorageState {
  return JSON.parse(fs.readFileSync(COACH_STATE_PATH, 'utf8')) as SavedStorageState
}

/**
 * Koç için TEK bir `aal2` oturumu açar ve cookie'lerini diske alır.
 *
 * Kendi tarayıcısını açar (test'in `page`ini KULLANMAZ): oluşan oturum tek bir
 * teste ait olmamalı, tüm koç testlerine kopyalanacak PAYLAŞILAN durum olmalıdır.
 *
 * `global-setup.ts` bunu koşu başında bir kez çağırır. `loginAsCoach` ayrıca
 * savunma amaçlı çağırabilir (durum yoksa/bayatladıysa) — o yol kilit altındadır.
 */
export async function createCoachAal2State(): Promise<void> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ baseURL: E2E_BASE_URL })
    try {
      const page = await context.newPage()
      await login(page, TEST_USERS.coach)
      await stepUpCoachSessionViaUi(page)

      // Doğrulamanın GERÇEKTEN aal2 verdiğini ölç: `profiles` satırı `mfa_aal2_gate`
      // politikasının içinde, yani "Koç Paneli" başlığı ancak kapı açıldığında
      // render edilir (aal1'de rol okunamaz ve panel "Danışan Paneli" olur).
      await page.goto('/')
      await expect(page.getByText('Koç Paneli', { exact: true })).toBeVisible({ timeout: 30_000 })

      await context.storageState({ path: COACH_STATE_PATH })
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

/** Durum yoksa/bayatladıysa üretir; üretimi süreçler arası tekilleştirir. */
async function ensureCoachAal2State(force = false): Promise<SavedStorageState> {
  const age = coachStateAgeMs()
  if (!force && age !== null && age < COACH_STATE_MAX_AGE_MS) return readCoachState()

  return withResourceLock(COACH_STATE_LOCK, async () => {
    // Kilidi beklerken başka bir worker durumu üretmiş olabilir — tekrar bak.
    const ageAfterWait = coachStateAgeMs()
    if (ageAfterWait !== null && ageAfterWait < COACH_STATE_MAX_AGE_MS) return readCoachState()

    await createCoachAal2State()
    return readCoachState()
  })
}

/**
 * KOÇ GİRİŞİ — `aal2` oturumu ENJEKTE edilerek. Koç kimliğiyle koşan HER test
 * bunu kullanmalıdır.
 *
 * ###########################################################################
 * # NEDEN DÜZ `login(page, TEST_USERS.coach)` YETMEZ                        #
 * #                                                                         #
 * # `supabase/migrations/20260819120000_mfa_aal2_gate.sql` 14 tabloya        #
 * # RESTRICTIVE bir politika kurdu:                                          #
 * #     not is_coach() or (select auth.jwt() ->> 'aal') = 'aal2'             #
 * # Parolayla yapılan giriş HER ZAMAN `aal1` verir. Yani düz `login()` ile   #
 * # gelen koç; danışan listesini, planları, mesajları, fotoğrafları GÖREMEZ. #
 * # Testler kırılmaz, DAHA KÖTÜSÜ olur: boş ekranlarla "geçer" gibi durup    #
 * # hiçbir şey ölçmezlerdi.                                                  #
 * #                                                                         #
 * # NEDEN HER TESTTE STEP-UP YAPILMIYOR: GoTrue başarılı bir MFA             #
 * # doğrulamasında kullanıcının DİĞER TÜM oturumlarını iptal ediyor          #
 * # (ölçüldü — bkz. coach-mfa.ts başlığı). Paralel worker'lar aynı koç       #
 * # hesabını kullandığı için her step-up, o an koşan diğer koç testinin      #
 * # oturumunu öldürürdü. Bu yüzden koşu başına TEK oturum üretilir ve        #
 * # cookie'leri buradan kopyalanır.                                          #
 * #                                                                         #
 * # DANIŞAN TARAFI BİLEREK DOKUNULMADI: kapının `not is_coach()` dalı        #
 * # danışan için her zaman true döner. Danışan testleri `aal1`de kalır ve    #
 * # yeşil kalmaları politikanın danışanı etkilemediğinin KANITIDIR.          #
 * ###########################################################################
 */
export async function loginAsCoach(page: Page): Promise<void> {
  const coachPanel = page.getByText('Koç Paneli', { exact: true })
  const loginButton = page.getByRole('button', { name: 'GİRİŞ YAP' })

  for (const force of [false, true]) {
    const state = await ensureCoachAal2State(force)
    await page.context().addCookies(state.cookies)
    await page.goto('/')

    // İki olası son: panel açıldı (oturum geçerli ve aal2) ya da uygulama bizi
    // `/login`e attı (durum bayat — enjekte edilen oturum sunucuda artık yok).
    await expect(coachPanel.or(loginButton).first()).toBeVisible({ timeout: 30_000 })
    if (await coachPanel.isVisible()) {
      await page.waitForURL('/')
      return
    }
  }

  throw new Error(
    'E2E: koç aal2 oturumu enjekte edilemedi — durum yeniden üretildikten sonra da ' +
      'uygulama `/login`e yönlendirdi. GoTrue oturumu iptal edilmiş olabilir (başka bir ' +
      'MFA doğrulaması ya da global `signOut`).'
  )
}

/** "Çıkış Yap" butonuna tıklar ve `/login`'e yönlendirmeyi bekler. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /çıkış yap/i }).click()
  await page.waitForURL('/login')
}
