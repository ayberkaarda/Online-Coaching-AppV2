// Faz 2e — Form check akışı (active_planprogram.md §4.3):
//   danışan form check gönderir -> koç bekleyen kuyrukta görür -> geri bildirim
//   yazar -> danışan "reviewed" ve geri bildirimi görür.
//
// Beslenme/antrenman/mesaj yarıları ayrı spec dosyalarındadır; bu dosya yalnızca
// form check akışına dokunur ve mevcut spec'leri DEĞİŞTİRMEZ (YENİ dosya).
//
// TÜRKÇE İ/ı TUZAĞI (bkz. tests/e2e/fixtures.ts, tests/e2e/workout.spec.ts):
// İ (U+0130) / ı (U+0131) içeren metinlerde `/i` bayraklı regex KULLANILMAZ.
// "Danışan" ı içerir; locator'larda birebir (aynı harf biçimiyle) kullanılır.
//
// Kaynaklar (metinler birebir buradan alındı, tahmin yürütülmedi):
//   src/components/tabs/FormCheckTab.tsx
//   src/components/CoachUserManagement.tsx
//   src/hooks/useFormChecks.ts (toast metinleri)

import { type Page } from '@playwright/test'

import { TEST_USERS, login } from './fixtures'
import { expect, resource, test } from './resource-lock'

// supabase/seed.sql: client1 -> "Ahmet Yılmaz".
const CLIENT1_FULL_NAME = 'Ahmet Yılmaz'

// 1x1 şeffaf PNG (magic-byte doğrulamasını (assertValidImageFile) geçecek gerçek
// bir PNG imzası taşır — sahte bir uzantı/mime DEĞİLDİR).
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

const randomSuffix = (): number => Math.floor(Math.random() * 1_000_000_000)

test.describe('Form check akışı (AC-2.3 kanıtı curl ile ayrıca doğrulandı — bkz. rapor)', () => {
  test(
    'danışan form check gönderir, koç kuyrukta görüp geri bildirim yazar, danışan reviewed görür',
    // İZOLASYON: bu senaryo client1 için `form_checks` satırı yaratır ve koç
    // tarafında bekleyen kuyruğu tüketir. chromium + Mobile Chrome projeleri
    // aynı hesapla EŞ ZAMANLI koştuğu için iki kopya aynı kuyruğa yazıyordu.
    // Kaynak kilidi (tests/e2e/resource-lock.ts) ikisini sıraya sokar.
    { annotation: resource('form-checks:client1') },
    async ({ page, browser }) => {
      // İki oturum (danışan + koç), bir dosya yüklemesi ve bir sayfa yenilemesi
      // içeren üç adımlı bir akış — varsayılan 30 sn bazı ortamlarda (özellikle
      // `next dev` derleme gecikmesi altında) yetersiz kalabiliyor.
      test.setTimeout(90_000)

      // Kaydı hem danışan listesinde hem koç kuyruğunda AYIRT ETMEK için ondalıklı,
      // rastgele bir kilo değeri üretilir. Geniş aralık (20-400 şema sınırı) ve
      // `Math.random()` BİLİNÇLİ: geçmiş koşulardan kalan kayıtlarla da çakışmamak
      // gerekir. (Kaynak kilidi artık iki projenin aynı anda yazmasını da engelliyor;
      // bu aralık ek bir emniyet katmanıdır.)
      //
      // ONDALIK HANE ASLA 0 OLMAZ — ÖLÇÜLEN HATA:
      //   `form_checks.current_weight` kolonu `numeric(6,2)`. PostgREST bu değeri
      //   JSON SAYISI olarak döndürür ve JS sondaki sıfırı ATAR: DB'deki `274.00`
      //   arayüze `274` olarak basılır. Eski üretici `(60 + Math.random() * 300)
      //   .toFixed(1)` ~10 denemede bir `"274.0"` gibi bir dize üretiyordu; test
      //   `aria-label="Form check kaydı, 274.0 kg"` ararken DOM'da
      //   `"... 274 kg"` bulunuyordu ve test KIRILIYORDU. Bu, izolasyondan
      //   BAĞIMSIZ, gerçek bir test hatasıydı (tam paket koşularında canlı olarak
      //   iki kez gözlemlendi: 273.0 ve 274.0).
      //   Çözüm iddiayı GEVŞETMEK değil, gidiş-dönüşü KAYIPSIZ olan bir değer
      //   üretmektir: ondalık hane 1-9 arasında kalırsa `x.y` -> `x.y` aynen döner.
      // Benzersizlik: 300 tam sayı x 9 ondalık = 2700 farklı değer.
      const weightWholePart = 60 + Math.floor(Math.random() * 300) // 60-359
      const weightDecimalDigit = 1 + Math.floor(Math.random() * 9) // 1-9 (0 ASLA)
      const uniqueWeight = `${weightWholePart}.${weightDecimalDigit}`

      const clientPage = page

      // --- 1) Danışan: Form Check sekmesine gider, kilo + poz fotoğrafı gönderir ---
      await login(clientPage, TEST_USERS.client)
      await clientPage.getByRole('tab', { name: 'Form Check', exact: true }).click()

      await clientPage.getByLabel('GÜNCEL KİLO (KG)', { exact: true }).fill(uniqueWeight)
      await clientPage.getByLabel('PODYUM FOTOĞRAFI', { exact: true }).setInputFiles({
        name: 'pose.png',
        mimeType: 'image/png',
        buffer: ONE_PIXEL_PNG,
      })
      await clientPage
        .getByRole('button', { name: 'Formu Antrenörüme Gönder', exact: true })
        .click()

      await expect(clientPage.getByText('Formunuz koçunuza iletildi.')).toBeVisible()

      // Yeni kayıt PENDING olarak listede görünür ("Beklemede" rozeti). Kart
      // `role="group"` + benzersiz `aria-label` ile hedeflenir (bkz.
      // FormCheckTab.tsx) — metin bazlı `div`+`filter` YAKLAŞIMI aynı dosyanın koç
      // tarafındaki ilk denemede sessiz bir hang'e yol açmıştı (bkz. aşağıdaki not).
      const clientRecordCard = clientPage.getByRole('group', {
        name: `Form check kaydı, ${uniqueWeight} kg`,
        exact: true,
      })
      await expect(clientRecordCard).toBeVisible()
      await expect(clientRecordCard.getByText('Beklemede')).toBeVisible()

      // --- 2) Koç: /users sayfasında bekleyen kuyruğunda kaydı görür, geri bildirim yazar ---
      const coachContext = await browser.newContext()
      const feedback = `E2E geri bildirim ${randomSuffix()}`
      try {
        const coachPage: Page = await coachContext.newPage()
        await login(coachPage, TEST_USERS.coach)
        await coachPage.goto('/users')

        await expect(
          coachPage.getByRole('heading', { name: /Bekleyen Form Checkler/ })
        ).toBeVisible()

        // Kuyruk kartı: `role="group"` + benzersiz `aria-label` ile TAM OLARAK hedeflenir
        // (bkz. CoachUserManagement.tsx — kart konteyneri `aria-label={"${ad} form check
        // kaydı, ${kilo} kg"}`). Seed/önceki koşulardan client1 için BAŞKA bekleyen
        // kayıtlar da kalmış olabilir; isim + BU KOŞUYA ÖZGÜ kilo bileşimi bunları ayırt eder.
        // NOT: metin bazlı `div`+`filter({hasText})` YAKLAŞIMI KASITLI OLARAK KULLANILMADI —
        // ilk denemede ad+kilo'yu saran EN İÇ `div` yalnızca metni sarıyordu, `textarea`/
        // `button` KARDEŞ öğelerdi ve `.fill()`/`.click()` sessizce (hata vermeden) test
        // timeout'una kadar beklemişti. `role="group"` kartın KENDİSİNİ (tüm alt öğeleriyle
        // birlikte) tek, belirsizliksiz bir hedefe indirger.
        const queueCard = coachPage.getByRole('group', {
          name: `${CLIENT1_FULL_NAME} form check kaydı, ${uniqueWeight} kg`,
          exact: true,
        })
        await expect(queueCard).toBeVisible()

        await queueCard.getByPlaceholder('Geri bildiriminizi yazın...').fill(feedback)
        await queueCard.getByRole('button', { name: 'İncele ve Gönder', exact: true }).click()

        await expect(coachPage.getByText('Geri bildirim danışana iletildi.')).toBeVisible()

        // İncelenen kayıt kuyruktan DÜŞER (status artık 'pending' değil) — client1
        // için BAŞKA bekleyen kayıt kalmış olsa bile BU kart (isim + bu kilo) artık YOKTUR.
        await expect(queueCard).toHaveCount(0, { timeout: 15_000 })
      } finally {
        await coachContext.close()
      }

      // --- 3) Danışan: sayfayı tazeler, kaydın artık "reviewed" olduğunu ve koçun
      //        geri bildirimini gördüğünü doğrular ---
      await clientPage.reload()
      await clientPage.getByRole('tab', { name: 'Form Check', exact: true }).click()

      const reviewedCard = clientPage.getByRole('group', {
        name: `Form check kaydı, ${uniqueWeight} kg`,
        exact: true,
      })
      await expect(reviewedCard).toBeVisible()
      await expect(reviewedCard.getByText('Beklemede')).toHaveCount(0)
      await expect(reviewedCard.getByText(feedback)).toBeVisible()
    }
  )
})
