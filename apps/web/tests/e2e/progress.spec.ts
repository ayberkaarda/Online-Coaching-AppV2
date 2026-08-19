// İlerleme takibi — Faz 4c (`active_planprogram.md` §6, AC-4.1 / AC-4.2).
//
// AKIŞ: danışan kilo/ölçü girer -> trendde görür -> AYNI GÜNE ikinci giriş
// yapar -> kayıt SAYISI ARTMAZ (duplicate satır oluşmaz), değer GÜNCELLENİR
// (AC-4.1 uçtan uca) -> koç ikinci bir tarayıcı bağlamında aynı danışanı seçip
// AYNI seriyi görür ama giriş formunu GÖRMEZ (§6 "koç görünümü salt-okunur").
//
// İZOLASYON (tests/e2e/README.md "paylaşılan kaynak kilidi" — ZORUNLU):
// bu senaryo client1'in `progress_entries` satırlarına YAZAR. Kaynak
// `progress-entries:client1` olarak İLAN EDİLİR; aksi hâlde aynı spec chromium
// ve "Mobile Chrome" projelerinde AYNI ANDA koşup aynı günün satırını karşılıklı
// ezerdi (testin ölçtüğü şey tam olarak "aynı gün tek satır" olduğu için bu
// sessiz bir yanlış-pozitif/negatif üretirdi). Başka hiçbir spec bu kaynağa
// dokunmadığından paketin geri kalanı tam paralel koşmaya devam eder.
//
// TÜRKÇE İ/ı TUZAĞI (tests/e2e/README.md): `/i` bayraklı regex KULLANILMAZ ve
// metin eşleşmeleri `{ exact: true }` ile birebir yapılır — Playwright'ın
// varsayılan "büyük/küçük harf duyarsız alt dize" eşleşmesi de İ/ı için
// güvenilir değildir.

import { type Locator, type Page } from '@playwright/test'

import { TEST_USERS, login, loginAsCoach } from './fixtures'
import { expect, resource, test } from './resource-lock'

// supabase/seed.sql: client1 -> "Ahmet Yılmaz".
const CLIENT1_FULL_NAME = 'Ahmet Yılmaz'

/**
 * Ondalık hane BİLEREK 1-9 arasında: `numeric` kolonlar JSON'a SAYI olarak
 * döner ve JS sondaki sıfırı atar (`82.40` -> `82.4`, hatta `82.00` -> `82`).
 * Bu tuzak `tests/e2e/README.md`'de kayıtlıdır; sıfır olmayan bir hane
 * kullanmak onu tamamen kapatır.
 */
function randomWeight(): string {
  return `${70 + Math.floor(Math.random() * 20)}.${1 + Math.floor(Math.random() * 9)}`
}

/** "Son ölçüm: 18.08.2026 · 82.4 kg" satırını değere göre yakalar. */
function lastMeasurementRe(weight: string): RegExp {
  return new RegExp(`Son ölçüm:.*·\\s*${weight.replace('.', '\\.')} kg`)
}

/** "Seçili aralıkta N ölçüm günü kayıtlı." metnindeki N. */
async function readMeasuredDays(panel: Locator): Promise<number> {
  const text = (await panel.getByText(/ölçüm günü kayıtlı/).textContent()) ?? ''
  const match = /(\d+) ölçüm günü kayıtlı/.exec(text)
  if (!match?.[1]) throw new Error(`Ölçüm günü sayısı okunamadı: "${text}"`)
  return Number(match[1])
}

/** Koç panelinde bir danışanı arayıp seçer (bkz. nutrition.spec.ts — aynı desen). */
async function selectClient(page: Page, fullName: string): Promise<void> {
  const firstName = fullName.split(' ')[0] as string
  await page.getByLabel('Danışan Ara').fill(firstName)
  await page
    .getByRole('button', { name: `${fullName} seç` })
    .last()
    .click()
}

/** Aktif sekme paneli — strict-mode ihlallerini önlemek için tüm seçiciler buna kapsanır. */
const panelOf = (page: Page): Locator => page.getByRole('tabpanel')

test.describe('İlerleme Takibi (§6)', () => {
  test(
    'danışan ölçüm girer ve trendde görür; aynı güne ikinci giriş duplicate üretmez, günceller; koç salt okur',
    { annotation: resource('progress-entries:client1') },
    async ({ page, browser }) => {
      const firstWeight = randomWeight()
      let secondWeight = randomWeight()
      while (secondWeight === firstWeight) secondWeight = randomWeight()

      // --- 1) Danışan: İstatistikler sekmesinde ilk ölçümü girer ---
      await login(page, TEST_USERS.client)
      await page.getByRole('tab', { name: 'İstatistikler' }).click()

      const panel = panelOf(page)
      await expect(panel.getByText('Ölçüm Girişi', { exact: true })).toBeVisible()

      await panel.getByLabel('Kilo (kg)', { exact: true }).fill(firstWeight)
      await panel.getByRole('button', { name: 'Ölçümü Kaydet' }).click()

      // useProgressEntries.ts -> useUpsertProgressEntry onSuccess toast'ı.
      await expect(page.getByText('Ölçüm kaydedildi.').first()).toBeVisible()

      // --- 2) Trend, girilen değeri gösterir ---
      await expect(panel.getByText(lastMeasurementRe(firstWeight))).toBeVisible()
      const daysAfterFirst = await readMeasuredDays(panel)
      expect(daysAfterFirst).toBeGreaterThan(0)

      // --- 3) AYNI GÜNE ikinci giriş (AC-4.1) ---
      await panel.getByLabel('Kilo (kg)', { exact: true }).fill(secondWeight)
      await panel.getByRole('button', { name: 'Ölçümü Kaydet' }).click()

      // Değer GÜNCELLENDİ...
      await expect(panel.getByText(lastMeasurementRe(secondWeight))).toBeVisible()
      await expect(panel.getByText(lastMeasurementRe(firstWeight))).toHaveCount(0)

      // ...ve ölçüm GÜNÜ sayısı ARTMADI: ikinci giriş yeni satır AÇMADI.
      // (Sayı mutlak bir değere göre değil, KENDİ önceki değerine göre
      // kıyaslanır — daha eski koşulardan kalan günler bu testi etkilemez.)
      expect(await readMeasuredDays(panel)).toBe(daysAfterFirst)

      // --- 4) Koç: AYNI seriyi görür, giriş formunu GÖRMEZ (§6 salt-okunur) ---
      const coachContext = await browser.newContext()
      try {
        const coachPage = await coachContext.newPage()
        await loginAsCoach(coachPage)
        await selectClient(coachPage, CLIENT1_FULL_NAME)
        await coachPage.getByRole('tab', { name: 'İstatistikler' }).click()

        const coachPanel = panelOf(coachPage)
        // Danışanın az önce yazdığı DEĞER — koç aynı seriyi okur (AC-4.2).
        await expect(coachPanel.getByText(lastMeasurementRe(secondWeight))).toBeVisible()
        await expect(
          coachPanel.getByText('Danışanın ölçüm geçmişi (salt okunur)', { exact: true })
        ).toBeVisible()

        // Yazma yüzeyi HİÇ render edilmez (RLS zaten 42501 ile reddeder,
        // ama arayüz eylemi TEKLİF bile etmez).
        await expect(coachPanel.getByText('Ölçüm Girişi', { exact: true })).toHaveCount(0)
        await expect(coachPanel.getByRole('button', { name: 'Ölçümü Kaydet' })).toHaveCount(0)
        await expect(coachPanel.getByLabel('Kilo (kg)', { exact: true })).toHaveCount(0)
      } finally {
        await coachContext.close()
      }
    }
  )

  test('aralık seçici 7/30/90 gün arasında geçiş yapar (varsayılan 30)', async ({ page }) => {
    // SALT OKUNUR: hiçbir satır yazılmaz -> kaynak kilidi ALINMAZ, test tam
    // paralel koşar (tests/e2e/README.md kuralı).
    await login(page, TEST_USERS.client)
    await page.getByRole('tab', { name: 'İstatistikler' }).click()

    const panel = panelOf(page)
    await expect(panel.getByRole('button', { name: '30 gün' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await panel.getByRole('button', { name: '7 gün' }).click()
    await expect(panel.getByRole('button', { name: '7 gün' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(panel.getByRole('button', { name: '30 gün' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )

    await panel.getByRole('button', { name: '90 gün' }).click()
    await expect(panel.getByRole('button', { name: '90 gün' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
