// KVKK HESAP SİLME — UÇTAN UCA (B-042 / AC-4.6.1 / AC-4.6.2).
//
// ############################################################################
// # BU DOSYA KENDİ KULLANICISINI ÜRETİR VE KENDİ SİLER                        #
// #                                                                          #
// # Paketin diğer spec'leri `supabase/seed.sql`in sabit hesaplarını kullanır. #
// # Burada bu MÜMKÜN DEĞİL: test hesabı GERÇEKTEN siliyor. Seed hesabını      #
// # silmek paketin geri kalanını (ve yerel geliştirme ortamını) yok ederdi.   #
// # Bu yüzden her koşu `service_role` ile TAZE bir kullanıcı açar, verisini   #
// # yazar, arayüzden sildirir ve artığı `afterEach`te temizler.                #
// #                                                                          #
// # `resource-lock` KULLANILMAZ: dokunulan tek kaynak bu koşuya özel, rastgele #
// # e-postalı kullanıcıdır — paylaşılan hiçbir kaynak mutasyona uğramaz.       #
// ############################################################################
//
// AC-4.6.2'nin "silme sonrası ESKİ JWT ile hiçbir veriye erişilemez" iddiası burada
// kanıtlanır: silmeden ÖNCE gerçek bir access + refresh token alınır, silmeden SONRA
// aynı token'larla PostgREST/GoTrue'ya gidilir.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from './resource-lock'

// ---------------------------------------------------------------------------
// Ortam
// ---------------------------------------------------------------------------

/** Playwright `webServer`ının servis ettiği adres (playwright.config.ts ile aynı varsayılan). */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/**
 * `service_role` anahtarını üç kaynaktan sırayla arar:
 *   1. `SUPABASE_SERVICE_ROLE_KEY` — uygulamanın kullandığı ad (yerelde `.env.local`).
 *   2. `SERVICE_ROLE_KEY`          — `supabase status -o env` çıktısının verdiği ad
 *                                    (CI bu değeri `$GITHUB_ENV`e yazar).
 *   3. `apps/web/.env.local`       — yerelde kabuk değişkeni set edilmemiş olabilir;
 *                                    `next start` dosyayı kendisi okur, test süreci
 *                                    okumaz. Burada elle ayrıştırılır.
 * Hiçbiri yoksa `null` döner ve paket ATLANIR (sessizce yeşil vermek yerine, atlama
 * gerekçesiyle birlikte raporlanır).
 */
function resolveServiceRoleKey(): string | null {
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY
  if (fromEnv) return fromEnv

  const envFile = path.resolve(__dirname, '../../.env.local')
  if (!fs.existsSync(envFile)) return null

  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+?)\s*$/.exec(line)
    if (match?.[1]) return match[1].replace(/^["']|["']$/g, '')
  }
  return null
}

const SERVICE_ROLE_KEY = resolveServiceRoleKey()

/** Arayüzde gösterilen ve sunucuda tekrar doğrulanan onay cümlesi. */
const CONFIRMATION_PHRASE = 'HESABIMI SİL'
const TEST_PASSWORD = 'Passw0rd!23'

interface CreatedUser {
  id: string
  email: string
  accessToken: string
  refreshToken: string
  avatarPath: string
}

// ---------------------------------------------------------------------------
// Yardımcılar (hepsi `service_role` ile — testin KURULUM tarafı)
// ---------------------------------------------------------------------------

function adminClient(): SupabaseClient {
  if (!SERVICE_ROLE_KEY) throw new Error('service_role anahtarı yok')
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** GoTrue'ya şifreyle giderek GERÇEK bir oturum (access + refresh token) alır. */
async function signInForTokens(email: string): Promise<{ access: string; refresh: string }> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  })
  const body = (await response.json()) as { access_token?: string; refresh_token?: string }
  if (!body.access_token || !body.refresh_token) {
    throw new Error(`Test kullanıcısı için token alınamadı: ${JSON.stringify(body)}`)
  }
  return { access: body.access_token, refresh: body.refresh_token }
}

/** PostgREST'e VERİLEN token ile gider; ham durum kodu + gövdeyi döndürür. */
async function restGet(token: string, query: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json().catch(() => null) }
}

async function createTestUser({ withStorage = true } = {}): Promise<CreatedUser> {
  const admin = adminClient()
  // `E2E ` öneki YOK: bu kullanıcı testin kendisi tarafından siliniyor ve
  // `scripts/clean-e2e-data.mjs` ölçütlerine hiç girmemeli.
  const email = `zz-account-deletion-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Silme Testi' },
  })
  if (error || !data.user) throw new Error(`Test kullanıcısı oluşturulamadı: ${error?.message}`)

  const id = data.user.id

  // Silinecek veri: birkaç tablo + GERÇEK bir storage nesnesi. Storage nesnesi
  // kritik — yalnızca satır silmenin yetmediği (fiziksel dosyanın da gitmesi
  // gerektiği) tek yer orası.
  await admin.from('notifications').insert({ client_id: id, message: 'Silme testi bildirimi' })
  await admin.from('progress_entries').insert({
    client_id: id,
    entry_date: new Date().toISOString().slice(0, 10),
    weight_kg: 77.7,
  })
  await admin
    .from('workout_logs')
    .insert({ client_id: id, exercise_name: 'Silme testi hareketi', reps: 5 })

  // Sonda (probe) hesabında storage YOKTUR: sondanın tek amacı sunucunun
  // yapılandırılıp yapılandırılmadığını ölçmek, dosya silmeyi kanıtlamak değil.
  const avatarPath = `${id}-avatar.png`
  if (withStorage) {
    const { error: uploadError } = await admin.storage
      .from('avatars')
      // 1x1 saydam PNG (magic byte doğrulaması sunucu tarafında yok; bucket private).
      .upload(
        avatarPath,
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'
        ),
        { contentType: 'image/png', upsert: true }
      )
    if (uploadError) throw new Error(`Avatar yüklenemedi: ${uploadError.message}`)
  }

  const tokens = await signInForTokens(email)
  return { id, email, accessToken: tokens.access, refreshToken: tokens.refresh, avatarPath }
}

// ---------------------------------------------------------------------------

test.describe('Hesap silme (KVKK)', () => {
  // TEST SÜRECİNDE anahtar yoksa fikstür bile kurulamaz (kullanıcı `service_role` ile
  // açılıyor). Sessizce yeşil vermek yerine gerekçesiyle atla.
  test.skip(
    !SERVICE_ROLE_KEY,
    'SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY bulunamadı — test süreci hesap silme fikstürünü kuramaz.'
  )

  // ###########################################################################
  // # SUNUCUNUN YAPILANDIRMASI, TEST SÜRECİNİNKİNDEN AYRI BİR SORUDUR          #
  // #                                                                         #
  // # Test süreci anahtarı `.env.local`dan ya da `SERVICE_ROLE_KEY` değişkenin- #
  // # den bulabilir; `next start` ise YALNIZCA `SUPABASE_SERVICE_ROLE_KEY`i    #
  // # okur. CI'da `supabase status -o env` anahtarı `SERVICE_ROLE_KEY` adıyla  #
  // # verdiği için sunucu onu GÖRMEYEBİLİR ve uç 503 döner.                    #
  // #                                                                         #
  // # Bu durumda paketin KIRMIZI vermesi yanıltıcı olurdu (ürün doğru, ortam   #
  // # eksik). Bir kerelik SONDA ile sunucunun gerçekten yapılandırılıp         #
  // # yapılandırılmadığı ÖLÇÜLÜR: tek kullanımlık bir hesap açılır ve uca      #
  // # DOĞRU onay metniyle gidilir.                                             #
  // #   * 200 -> sunucu yapılandırılmış; sonda hesabı zaten silinmiştir        #
  // #            (yani bu aynı zamanda bir duman testidir).                    #
  // #   * 503 -> anahtar sunucuda YOK; paket ATLANIR, gerekçe raporlanır.      #
  // #   * başka -> gerçek bir kusur; sonda FIRLATIR ve paket kırmızı verir.    #
  // ###########################################################################
  let serverConfigured = true
  let skipReason = ''

  test.beforeAll(async () => {
    if (!SERVICE_ROLE_KEY) return

    const probe = await createTestUser({ withStorage: false })
    const response = await fetch(`${BASE_URL}/api/account/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${probe.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmation: CONFIRMATION_PHRASE }),
    })

    if (response.status === 503) {
      serverConfigured = false
      skipReason =
        'Uygulama sunucusu SUPABASE_SERVICE_ROLE_KEY olmadan koşuyor (uç 503 ACCOUNT_DELETION_UNAVAILABLE döndü) — hesap silme bu ortamda yapılandırılmamış.'
      await adminClient()
        .auth.admin.deleteUser(probe.id)
        .catch(() => undefined)
      return
    }

    if (!response.ok) {
      const body = await response.text()
      await adminClient()
        .auth.admin.deleteUser(probe.id)
        .catch(() => undefined)
      throw new Error(`Hesap silme ucu sonda çağrısında ${response.status} döndü: ${body}`)
    }
  })

  let user: CreatedUser | null = null

  test.afterEach(async () => {
    // Test yarıda kaldıysa artık bırakma. Kullanıcı zaten silinmişse bu çağrılar
    // sessizce başarısız olur; idempotanslık sözleşmesi gereği sorun değildir.
    if (!user || !SERVICE_ROLE_KEY) return
    const admin = adminClient()
    await admin.storage.from('avatars').remove([user.avatarPath])
    await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
    user = null
  })

  test('danışan çift onayla hesabını siler; veri, dosya ve oturum gider, eski JWT hiçbir şeye erişemez', async ({
    page,
  }) => {
    test.skip(!serverConfigured, skipReason)
    // Silme + doğrulama zinciri uzun; varsayılan 30 sn dar kalabiliyor.
    test.setTimeout(90_000)

    user = await createTestUser()
    const oldAccessToken = user.accessToken
    const oldRefreshToken = user.refreshToken
    const userId = user.id

    // --- 0) BAŞLANGIÇ DURUMU: veri ve dosya GERÇEKTEN var --------------------
    const beforeNotifications = await restGet(oldAccessToken, 'notifications?select=id')
    expect(beforeNotifications.status).toBe(200)
    expect(
      Array.isArray(beforeNotifications.body) && beforeNotifications.body.length
    ).toBeGreaterThan(0)

    const admin = adminClient()
    const listBefore = await admin.storage.from('avatars').list('', { search: userId })
    expect(listBefore.data?.length ?? 0).toBeGreaterThan(0)

    // --- 1) ARAYÜZDEN GİRİŞ + PROFİL ----------------------------------------
    await page.goto('/login')
    await page.getByLabel(/e-posta/i).fill(user.email)
    // "ŞİFRE" / "GİRİŞ YAP" metinleri noktalı büyük İ içerir; `/i` bayraklı regex
    // Türkçe İ/i eşlemesini bilmez (bkz. fixtures.ts notu) — birebir metin kullanılır.
    await page.getByLabel('ŞİFRE').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()
    await page.waitForURL('/')

    await page.goto('/profile')

    // --- 2) ÇİFT ONAY --------------------------------------------------------
    // 1. adım: "Hesabımı Sil" düğmesi HİÇBİR ŞEY silmez, yalnızca paneli açar.
    const deleteSection = page.getByRole('region', { name: 'Hesabımı Sil' })
    await expect(deleteSection).toBeVisible()
    await deleteSection.getByRole('button', { name: 'Hesabımı Sil' }).click()

    // 2. adım: onay metni yazılmadan son düğme ETKİN OLMAMALI.
    const finalButton = deleteSection.getByRole('button', {
      name: 'Hesabımı kalıcı olarak sil',
    })
    await expect(finalButton).toBeDisabled()

    // Yanlış metin de yetmez.
    const confirmationInput = deleteSection.getByLabel(/Onaylamak için/)
    await confirmationInput.fill('hesabımı sil')
    await expect(finalButton).toBeDisabled()

    // Doğru metin: düğme etkinleşir.
    await confirmationInput.fill(CONFIRMATION_PHRASE)
    await expect(finalButton).toBeEnabled()

    await finalButton.click()

    // --- 3) SİLME SONRASI: /login'e düşülür ---------------------------------
    await page.waitForURL('/login', { timeout: 30_000 })

    // --- 4) VERİTABANI: kullanıcı ve verisi YOK -----------------------------
    const { data: userAfter } = await admin.auth.admin.getUserById(userId)
    expect(userAfter.user).toBeNull()

    for (const table of ['profiles', 'notifications', 'progress_entries', 'workout_logs']) {
      const column = table === 'profiles' ? 'id' : 'client_id'
      const { data: rows, error } = await admin.from(table).select('*').eq(column, userId)
      expect(error, `${table} sorgusu hata verdi`).toBeNull()
      expect(rows, `${table} tablosunda satır KALDI`).toHaveLength(0)
    }

    // --- 5) STORAGE: FİZİKSEL dosya da gitti --------------------------------
    const listAfter = await admin.storage.from('avatars').list('', { search: userId })
    expect(listAfter.data ?? [], 'avatars bucket ında yetim nesne kaldı').toHaveLength(0)

    // İmzalı adres üretilememeli (nesne yok).
    const signed = await admin.storage.from('avatars').createSignedUrl(user.avatarPath, 60)
    expect(signed.error, 'silinmiş nesne için hâlâ imzalı adres üretilebiliyor').not.toBeNull()

    // --- 6) AC-4.6.2 — ESKİ JWT İLE HİÇBİR VERİYE ERİŞİLEMEZ ----------------
    // ########################################################################
    // # DÜRÜST SINIR: Supabase erişim token'ı DURUMSUZDUR (imza doğrulanır,   #
    // # veritabanına bakılmaz). Yani token `exp`ine kadar "biçimsel olarak"   #
    // # geçerli kalır ve bunu iptal edecek bir kara liste YOKTUR. AC-4.6.2'nin#
    // # ölçülebilir hâli şudur ve BURADA ölçülür: o token'ın ARKASINDA        #
    // # OKUNACAK/YAZILACAK HİÇBİR ŞEY KALMAMIŞTIR ve YENİLENEMEZ.             #
    // # (Tam gerekçe ve azaltıcılar: ADR-0025 §"Kalan risk".)                 #
    // ########################################################################

    // (a) Kendi satırları: 0 satır.
    for (const query of [
      `profiles?select=id&id=eq.${userId}`,
      'notifications?select=id',
      'progress_entries?select=id',
      'workout_logs?select=id',
    ]) {
      const result = await restGet(oldAccessToken, query)
      expect(result.status, `${query} -> beklenmeyen durum`).toBe(200)
      expect(result.body, `${query} -> eski JWT hâlâ veri okuyabiliyor`).toEqual([])
    }

    // (b) YAZMA: eski JWT ile yeni satır AÇILAMAZ.
    const writeResponse = await fetch(`${SUPABASE_URL}/rest/v1/progress_entries`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${oldAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: userId,
        entry_date: new Date().toISOString().slice(0, 10),
        weight_kg: 66.6,
      }),
    })
    expect(
      writeResponse.ok,
      'eski JWT ile YAZMA başarılı oldu — silinen kullanıcı hâlâ veri üretebiliyor'
    ).toBe(false)

    // (c) KİMLİK: GoTrue kullanıcıyı tanımıyor.
    const whoAmI = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${oldAccessToken}` },
    })
    expect(whoAmI.ok, 'GoTrue silinen kullanıcıyı hâlâ tanıyor').toBe(false)

    // (d) YENİLEME: oturum uzatılamaz — `auth.refresh_tokens` CASCADE ile gitti.
    const refreshResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: oldRefreshToken }),
    })
    expect(refreshResponse.ok, 'silinen hesabın oturumu YENİLENEBİLDİ').toBe(false)

    // (e) Şifreyle yeniden giriş de mümkün olmamalı.
    const reLogin = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: TEST_PASSWORD }),
    })
    expect(reLogin.ok, 'silinen hesaba yeniden giriş yapılabildi').toBe(false)

    // --- 7) IDEMPOTANSLIK: aynı uçtaki ikinci çağrı çökmez ------------------
    // Eski JWT ile atılan ikinci silme isteği 401 döner (kullanıcı yok) — SUNUCU
    // TARAFI PATLAMAZ, 5xx üretmez.
    const secondAttempt = await fetch(`${BASE_URL}/api/account/delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oldAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmation: CONFIRMATION_PHRASE }),
    })
    expect(secondAttempt.status).toBe(401)

    // Korumalı sayfaya dönülemez.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)

    // Temizlik `afterEach`te bir daha denenmesin diye işaretle.
    user = null
  })

  // Tarayıcı KULLANILMIYOR: iddia tamamen sunucu tarafında ("arayüz atlansa bile").
  test('onay metni yanlışken sunucu silmeyi REDDEDER (arayüz atlansa bile)', async () => {
    test.skip(!serverConfigured, skipReason)
    test.setTimeout(60_000)

    user = await createTestUser()
    const token = user.accessToken
    const userId = user.id

    // Arayüzü hiç kullanmadan doğrudan uca gidiyoruz: "çift onay"ın ikinci
    // adımının SUNUCUDA da uygulandığını kanıtlar (istemci doğrulaması bir
    // güvenlik sınırı değildir).
    for (const confirmation of ['', 'hesabımı sil', 'HESABIMI SIL', 'evet']) {
      const response = await fetch(`${BASE_URL}/api/account/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      })
      expect(response.status, `"${confirmation}" onayı KABUL EDİLDİ`).toBe(422)
    }

    // Hesap hâlâ ayakta ve verisi yerinde.
    const admin = adminClient()
    const { data: stillThere } = await admin.auth.admin.getUserById(userId)
    expect(stillThere.user?.id).toBe(userId)

    const { data: rows } = await admin.from('notifications').select('id').eq('client_id', userId)
    expect(rows ?? []).toHaveLength(1)
  })
})
