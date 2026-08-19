// KOÇ OTURUMUNU `aal2`'YE ÇIKARAN MAKİNE — Faz 4.7 dilim 2.
//
// Karar kaydı : docs/adr/0026-totp-mfa-ve-aal2-kapisi.md (§Kalan risk 2 bu dosyayı ister)
// Veritabanı  : supabase/migrations/20260819120000_mfa_aal2_gate.sql
//
// #############################################################################
// ## NEDEN BU DOSYA VAR                                                      ##
// #############################################################################
//
//   `mfa_aal2_gate` politikası 14 tabloya RESTRICTIVE olarak kuruldu:
//
//       not is_coach() or (select auth.jwt() ->> 'aal') = 'aal2'
//
//   Parolayla yapılan HER giriş `aal1` verir. Yani migration'dan sonra koç
//   kimliğiyle koşan 8 spec dosyası (11 giriş noktası) BOŞ VERİ görürdü:
//   danışan listesi yok, plan yok, mesaj yok. Test paketinin koç yarısı
//   sessizce anlamsızlaşırdı.
//
//   Bu dosya kapıyı DELMEZ — kapıdan GEÇER. Fixture gerçek bir TOTP faktörü
//   kaydeder ve gerçek 6 haneli kodları üretir (RFC 6238; `otplib`).
//
// #############################################################################
// ## REDDEDİLEN ALTERNATİFLER (ve nedenleri)                                 ##
// #############################################################################
//
//   * Politikaya "test ise geç" dalı eklemek -> ADR-0026 §Reddedilen G. Üretimde
//     de açık kalan bir fail-open. Reddedildi.
//   * `service_role` ile elle `aal2` claim'i basmak -> ADR-0025'in İKİ FONKSİYONLA
//     sınırladığı yüzeyi salt test için genişletirdi. Reddedildi.
//   * Koç spec'lerini `skip` etmek -> regresyon güvencesinin yarısını süresiz
//     karartırdı. Reddedildi.
//
// #############################################################################
// ## İŞ BÖLÜMÜ: KURULUM (bir kez) vs SEVİYE YÜKSELTME (her giriş)            ##
// #############################################################################
//
//   `ensureCoachTotpFactor()` — `global-setup.ts`ten, TEK sürede, TEK kez.
//     Doğrulanmış bir TOTP faktörü YOKSA kurar (`enroll` + `challenge` + `verify`)
//     ve secret'ı diske yazar. Kurulum burada yapılır çünkü `enroll` akışı
//     doğrulanmamış faktörleri temizler: paralel worker'lar aynı anda kayıt
//     olsaydı biri diğerinin faktörünü silerdi.
//
//   `stepUpCoachSessionViaUi(page)` — koşu başına TEK KEZ, `fixtures.ts` ->
//     `createCoachAal2State()` içinden. `/profile#guvenlik` ekranındaki 6 haneli
//     kod alanı doldurulur. Doğrulamayı UYGULAMANIN KENDİSİ yapar, yani yeni
//     `aal2` token'ını oturum cookie'sine (ADR-0022) uygulamanın kendi Supabase
//     istemcisi yazar — test tarafında cookie biçimi elle ÜRETİLMEZ. Sonuç
//     `storageState` olarak diske alınır ve koç testlerine ENJEKTE edilir.
//
// #############################################################################
// ## NEDEN HER TESTTE DEĞİL, KOŞU BAŞINA TEK KEZ — ÖLÇÜLMÜŞ ZORUNLULUK       ##
// #############################################################################
//
//   İlk tasarım her koç girişinde step-up yapıyordu. Tam paket koşusunda 5 test
//   düştü ve GoTrue günlüğünde sebep göründü: `session_not_found`.
//
//   ÖLÇÜM (ham `fetch`, yerel GoTrue): aynı kullanıcı için 3 oturum açıldı, üçü
//   de `/user` 200 verdi; ÜÇÜNCÜ oturumda MFA `verify` çağrıldıktan sonra ilk
//   İKİ oturum 403 (`session_not_found`) döndü.
//
//       before verify   200 200 200
//       verify          200
//       after  verify   403 403 200
//
//   Yani GoTrue, başarılı bir MFA doğrulamasında kullanıcının DİĞER TÜM
//   oturumlarını iptal ediyor. Paralel worker'lar aynı koç hesabını kullandığı
//   için her step-up, o an çalışan diğer koç testlerinin oturumunu öldürüyordu.
//   (Sorgular bir süre daha çalışıyor gibi görünür — PostgREST JWT'yi durum
//   tutmadan doğrular — ama uygulamanın `/user` çağrısı 403 alır ve arayüz
//   kullanıcıyı `/login`e atar. Gördüğümüz kırılma tam olarak buydu.)
//
//   Bu yüzden koşu başına TEK oturum açılır, TEK kez aal2'ye çıkarılır ve o
//   oturumun cookie'leri tüm koç testlerine kopyalanır. Yan fayda: koç testleri
//   artık giriş formunu ve doğrulama ekranını tekrar tekrar sürmüyor (giriş
//   formunun kendi regresyon kapsaması `auth.spec.ts`te, danışan kimliğiyle).
//
// #############################################################################
// ## ÖLÇÜLDÜ (varsayım değil) — yerel GoTrue, 2026-08-19                     ##
// #############################################################################
//
//   1. `verify()` sonrası token: `"aal":"aal2"`, `amr:[password, totp]`.
//   2. `refreshSession()` SONRASI DA `"aal":"aal2"` — yani erişim token'ı
//      yenilendiğinde seviye KORUNUYOR (seviye oturumun kendisine yazılı).
//      Bu ölçüm önemli: korunmasaydı 900 sn'lik `jwt_expiry` sınırını aşan her
//      test yarısında düşerdi.
//   3. AYNI 30 sn'lik penceredeki AYNI kod, FARKLI oturumlarda TEKRAR TEKRAR
//      kabul ediliyor (yerel GoTrue'da faktör bazlı tekrar-kullanım engeli YOK).
//      Bu yüzden paralel worker'lar birbirinin kodunu "yakmaz" ve step-up için
//      ek bir kilit GEREKMEZ.

import fs from 'node:fs'
import path from 'node:path'

import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { generate } from 'otplib'

import { E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_URL, TEST_USERS } from './e2e-env'

/**
 * TOTP secret'ının kalıcı adresi.
 *
 * ###########################################################################
 * # NEDEN DOSYA — SEÇENEKLER VE GEREKÇE                                     #
 * #                                                                         #
 * # Kayıt VERİTABANINDA kalıcıdır (`auth.mfa_factors`): ikinci koşuda faktör #
 * # zaten "verified" durumdadır. Secret ise yalnızca `enroll()` yanıtında,   #
 * # BİR KEZ döner. Üç seçenek vardı:                                        #
 * #                                                                         #
 * #  (a) Her koşumda faktörü silip yeniden kur.                             #
 * #      REDDEDİLDİ — ÇIKMAZ: GoTrue, DOĞRULANMIŞ bir faktörün `unenroll`   #
 * #      edilmesi için oturumun zaten `aal2` olmasını ister. `aal2`ye çıkmak #
 * #      için de o faktörün secret'ı gerekir. Yani "her koşumda taze kayıt", #
 * #      atmak istediği secret'a muhtaçtır. Ayrıca yerel veritabanında CANLI #
 * #      geliştirme verisi var; her koşuda auth satırı çöpe atmak gereksiz   #
 * #      bir yan etkidir.                                                   #
 * #                                                                         #
 * #  (b) Secret'ı gitignore'lu bir dosyada sakla, yeniden kullan. SEÇİLDİ.  #
 * #      Gerçek bir koçun yaptığının AYNISI: bir kez kaydol, her girişte kod #
 * #      üret (ADR-0026 §Karar 5 kurtarma yolu da tam olarak budur — secret  #
 * #      düz metin saklanır). CI'da veritabanı her koşuda sıfırdan kurulur,  #
 * #      dosya bulunmaz, kayıt kendiliğinden yapılır: aynı kod yolu hem ilk  #
 * #      hem N'inci koşuda çalışır.                                         #
 * #                                                                         #
 * #  (c) Secret'ı `auth.mfa_factors.secret` kolonundan psql ile oku.        #
 * #      REDDEDİLDİ — konteyner adına bağımlı, CI'da taşınmaz ve testi       #
 * #      GoTrue'nun iç şemasına bağlardı.                                    #
 * #                                                                         #
 * # Dosya `.gitignore`dadır: gerçek bir ikinci faktör secret'ı hiçbir koşulda #
 * # depoya girmez (yerel demo hesabınınki bile).                             #
 * ###########################################################################
 */
export const COACH_TOTP_STORE_PATH = path.resolve(__dirname, '../../.e2e-coach-totp.json')

interface StoredCoachTotp {
  /** Hangi Supabase hedefine ait — yanlış projeye ait secret sessizce kullanılmasın. */
  supabaseUrl: string
  /** Hangi hesaba ait. */
  email: string
  /** Yalnızca teşhis için; doğrulama secret ile yapılır. */
  factorId: string
  /** Base32 TOTP secret'ı — `enroll()` yanıtından, yalnızca bir kez alınabilir. */
  secret: string
  enrolledAt: string
}

/** TOTP penceresi (RFC 6238 varsayılanı, GoTrue de bunu kullanır). */
const TOTP_PERIOD_MS = 30_000

function isStoredCoachTotp(value: unknown): value is StoredCoachTotp {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.supabaseUrl === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.factorId === 'string' &&
    typeof candidate.secret === 'string' &&
    candidate.secret.length > 0
  )
}

/**
 * Saklanan secret'ı okur.
 *
 * Öncelik sırası:
 *   1. `E2E_COACH_TOTP_SECRET` ortam değişkeni — CI/geçici hedefler için kaçış kapağı.
 *   2. `apps/web/.e2e-coach-totp.json` — yerelde ilk koşumda yazılır.
 *
 * Dosya BAŞKA bir Supabase hedefine ya da BAŞKA bir hesaba aitse `null` döner:
 * yanlış secret'la sonsuz "kod geçersiz" döngüsüne girmektense yeniden kayıt
 * yolunu açmak daha az yanıltıcıdır.
 */
export function readCoachTotpSecret(): string | null {
  const fromEnv = process.env.E2E_COACH_TOTP_SECRET
  if (fromEnv) return fromEnv

  if (!fs.existsSync(COACH_TOTP_STORE_PATH)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(COACH_TOTP_STORE_PATH, 'utf8'))
  } catch {
    return null
  }
  if (!isStoredCoachTotp(parsed)) return null
  if (parsed.supabaseUrl !== E2E_SUPABASE_URL) return null
  if (parsed.email !== TEST_USERS.coach.email) return null

  return parsed.secret
}

function writeCoachTotpSecret(factorId: string, secret: string): void {
  const payload: StoredCoachTotp = {
    supabaseUrl: E2E_SUPABASE_URL,
    email: TEST_USERS.coach.email,
    factorId,
    secret,
    enrolledAt: new Date().toISOString(),
  }
  fs.writeFileSync(COACH_TOTP_STORE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/** Şu anki 30 sn'lik pencerenin 6 haneli kodu. */
export async function coachTotpCode(secret: string): Promise<string> {
  return generate({ secret })
}

/** Bir sonraki TOTP penceresinin başına kadar bekler (+250 ms emniyet payı). */
async function waitForNextTotpWindow(): Promise<void> {
  const remaining = TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS) + 250
  await new Promise<void>((resolve) => {
    setTimeout(resolve, remaining)
  })
}

/** Erişim token'ının `aal` claim'ini okur (imza DOĞRULANMAZ — yalnızca teşhis/iddia). */
export function aalOfAccessToken(accessToken: string): string | null {
  const payload = accessToken.split('.')[1]
  if (!payload) return null
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof decoded !== 'object' || decoded === null) return null
    const aal = (decoded as Record<string, unknown>).aal
    return typeof aal === 'string' ? aal : null
  } catch {
    return null
  }
}

/** Faktörü verilen secret ile doğrular; başarılıysa yeni erişim token'ını döndürür. */
async function challengeAndVerify(
  supabase: SupabaseClient,
  factorId: string,
  secret: string
): Promise<{ accessToken: string } | { error: string }> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError || !challenge) {
    return { error: challengeError?.message ?? 'challenge() boş döndü' }
  }

  const { data: verified, error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: await coachTotpCode(secret),
  })
  if (verifyError || !verified) {
    return { error: verifyError?.message ?? 'verify() boş döndü' }
  }
  return { accessToken: verified.access_token }
}

/** Saklanan secret ile eşleşmeyen bir faktör bulunduğunda basılan, EYLEME DÖNÜK hata. */
function staleFactorError(reason: string): Error {
  return new Error(
    [
      `E2E: koç hesabında DOĞRULANMIŞ bir TOTP faktörü var ama testin elindeki secret onu açmıyor (${reason}).`,
      '',
      'NEDEN OLUR: faktör arayüzden elle kuruldu, ya da secret dosyası silindi/başka bir',
      `hedefe ait: ${COACH_TOTP_STORE_PATH}`,
      '',
      'ÇIKMAZIN SEBEBİ: GoTrue, DOĞRULANMIŞ bir faktörü silmek için oturumun zaten aal2',
      "olmasını ister; aal2 olmak için de o faktörün secret'ı gerekir. Yani test bunu",
      'kendi kendine düzeltemez.',
      '',
      'ÇÖZÜM — İKİ YOLDAN BİRİ:',
      '  1. Secret elinizdeyse ortam değişkeniyle verin:',
      '       E2E_COACH_TOTP_SECRET=<base32-secret> pnpm run test:e2e',
      '  2. Yerelde faktör satırını silin (YALNIZCA koç hesabının faktörleri; başka',
      '     hiçbir veriye dokunmaz), sonra paketi tekrar koşun — kayıt kendiliğinden',
      '     yeniden yapılır:',
      '       docker exec supabase_db_my-coaching-app psql -U postgres -d postgres -c \\',
      `         "delete from auth.mfa_factors where user_id = (select id from auth.users where email = '${TEST_USERS.coach.email}');"`,
    ].join('\n')
  )
}

/**
 * Koç hesabında DOĞRULANMIŞ bir TOTP faktörü olduğuna ve testin secret'ına sahip
 * olduğuna GARANTİ verir. `global-setup.ts` tarafından, worker'lar başlamadan
 * ÖNCE ve tek sürede çağrılır.
 *
 * Idempotanttır: ikinci (ve N'inci) koşuda faktör zaten kuruludur, yalnızca
 * secret'ın hâlâ geçerli olduğu KANITLANIR (gerçek bir `challenge`+`verify`).
 */
export async function ensureCoachTotpFactor(): Promise<void> {
  const supabase = createClient(E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: TEST_USERS.coach.email,
    password: TEST_USERS.coach.password,
  })
  if (signInError) {
    throw new Error(
      `E2E global-setup: koç girişi başarısız (${E2E_SUPABASE_URL}): ${signInError.message}\n` +
        'Yerel Supabase yığını ayakta ve seed uygulanmış olmalı (bkz. tests/e2e/README.md).'
    )
  }

  try {
    const { data: factorData, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError)
      throw new Error(`E2E global-setup: listFactors() hata verdi: ${listError.message}`)

    const totpFactors = (factorData?.all ?? []).filter((factor) => factor.factor_type === 'totp')
    const verified = totpFactors.find((factor) => factor.status === 'verified')

    let factorId: string
    let secret: string

    if (verified) {
      const stored = readCoachTotpSecret()
      if (!stored) throw staleFactorError('secret hiç bulunamadı')
      factorId = verified.id
      secret = stored
    } else {
      // Yarım kalmış (doğrulanmamış) kayıtlar aal1'de de silinebilir; GoTrue'nun
      // faktör sayısı sınırlıdır (yerelde 10) ve `enroll()` bunları temizlemezse
      // paket zamanla o sınıra dayanır.
      for (const factor of totpFactors) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Coaching Hub',
        friendlyName: `E2E ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      })
      if (enrollError || !enrolled) {
        throw new Error(
          `E2E global-setup: TOTP kaydı açılamadı: ${enrollError?.message ?? 'enroll() boş döndü'}\n` +
            'YAYGIN SEBEP: yerel GoTrue TOTP KAPALI. supabase/config.toml içinde\n' +
            '[auth.mfa.totp] enroll_enabled/verify_enabled = true olmalı VE yığın\n' +
            '`supabase stop && supabase start` ile yeniden kurulmuş olmalı (env değişkenleri\n' +
            'konteyner OLUŞTURULURKEN sabitlenir; bkz. ADR-0026 §Kalan risk 1).'
        )
      }

      factorId = enrolled.id
      secret = enrolled.totp.secret
      // SIRA ÖNEMLİ: secret ÖNCE diske yazılır. `verify()` sırasında süreç ölürse
      // faktör "unverified" kalır ve bir sonraki koşu onu temizleyip yeniden kurar;
      // ama secret yazılmadan `verify()` başarılı olsaydı faktör DOĞRULANMIŞ ve
      // secret'ı KAYIP olurdu — yani yukarıdaki çıkmaz.
      writeCoachTotpSecret(factorId, secret)
    }

    const result = await challengeAndVerify(supabase, factorId, secret)
    if ('error' in result) {
      if (verified) throw staleFactorError(result.error)
      throw new Error(`E2E global-setup: yeni kurulan faktör doğrulanamadı: ${result.error}`)
    }

    const aal = aalOfAccessToken(result.accessToken)
    if (aal !== 'aal2') {
      throw new Error(
        `E2E global-setup: verify() sonrası beklenen aal2, gelen ${aal ?? '(claim yok)'}. ` +
          "mfa_aal2_gate politikası bu oturumu reddeder; koç spec'leri boş veri görürdü."
      )
    }
  } finally {
    // `scope: 'local'` ZORUNLU: varsayılan (global) çıkış, kullanıcının TÜM
    // oturumlarını iptal eder — yerelde tarayıcıda açık geliştirme oturumunu da.
    await supabase.auth.signOut({ scope: 'local' })
  }
}

/**
 * Giriş yapmış (aal1) bir koç sayfasını `aal2`'ye çıkarır.
 *
 * Uygulamanın KENDİ ekranı kullanılır (`/profile#guvenlik` -> "İki Adımlı Doğrulama"):
 * doğrulamayı uygulamanın Supabase istemcisi yapar, dolayısıyla yeni `aal2`
 * token'ını oturum cookie'sine de O yazar. Test tarafında cookie biçimi elle
 * üretilseydi (`@supabase/ssr`'ın base64 + parçalama düzeni) kütüphanenin İÇ
 * SÖZLEŞMESİNE bağımlı, sessizce kırılan bir test altyapısı doğardı.
 *
 * KOŞU BAŞINA TEK KEZ çağrılır (bkz. dosya başlığı: her `verify`, kullanıcının
 * diğer oturumlarını iptal eder).
 */
export async function stepUpCoachSessionViaUi(page: Page): Promise<void> {
  const secret = readCoachTotpSecret()
  if (!secret) {
    throw new Error(
      "E2E: koç TOTP secret'ı yok. `global-setup.ts` -> ensureCoachTotpFactor() çalışmadı mı?\n" +
        `Beklenen dosya: ${COACH_TOTP_STORE_PATH}`
    )
  }

  // Giriş `/`de bırakır; `<CoachMfaGate />` oradan `/profile#guvenlik`e
  // yönlendirir. O yönlendirmeyi BEKLEMEK yerine doğrudan gidilir: ikisi de aynı
  // adrestir, ama böylece yarış yok ve gate'in zamanlaması testi etkilemez.
  await page.goto('/profile#guvenlik')

  const stepUpCode = page.locator('#mfa-stepup-code')
  const enrollStart = page.getByRole('button', { name: 'Kurulumu Başlat' })

  await expect(stepUpCode.or(enrollStart).first()).toBeVisible({ timeout: 30_000 })

  if (await enrollStart.isVisible()) {
    throw new Error(
      'E2E: koç hesabında doğrulanmış TOTP faktörü YOK (kayıt ekranı açıldı).\n' +
        'Beklenen: global-setup faktörü kurmuş olmalıydı. Faktör koşu sırasında ' +
        'kaldırıldıysa secret dosyasını silip paketi yeniden koşun: ' +
        COACH_TOTP_STORE_PATH
    )
  }

  // Kod pencere SINIRINDA üretilmiş olabilir. GoTrue ±1 pencere tolerans tanır,
  // yani bu pratikte görülmez; yine de tek bir yeniden deneme, 30 sn'de bir
  // gerçekleşebilecek bir flake sınıfını tamamen kapatır (bedeli: yalnızca
  // gerçekten düştüğünde bir pencere beklemek).
  const maxAttempts = 2
  for (let attempt = 1; ; attempt++) {
    await stepUpCode.fill(await coachTotpCode(secret))
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()

    try {
      // Doğrulama başarılıysa oturum aal2 olur, `useMfaStatus` tazelenir ve
      // step-up formu DOM'dan kalkar (profil satırı da okunabilir hale gelir).
      await expect(stepUpCode).toBeHidden({ timeout: 15_000 })
      break
    } catch (error) {
      if (attempt >= maxAttempts) throw error
      await waitForNextTotpWindow()
    }
  }
}
