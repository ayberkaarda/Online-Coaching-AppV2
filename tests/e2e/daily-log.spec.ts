// Ana akış: giriş -> günlük veri ekleme -> kaydın rapor listesinde görünmesi.
// Benzersiz değerler kullanılır ki assertion'lar önceki koşulardan kalan kayıtlarla çakışmasın.

import { expect, test } from '@playwright/test'

import { TEST_USERS, login } from './fixtures'

test.describe('Günlük Veriler', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.client)
    await page.getByRole('tab', { name: /günlük veriler/i }).click()
  })

  test('geçerli bir günlük veri girişi kaydedilir ve rapor listesinde görünür', async ({
    page,
  }) => {
    const protein = Math.floor(Math.random() * 100) + 100 // 100-199
    const carb = Math.floor(Math.random() * 100) + 200 // 200-299
    const fat = Math.floor(Math.random() * 50) + 30 // 30-79
    const water = (Math.random() * 8 + 1).toFixed(1) // 1.0-9.0
    const sodium = Math.floor(Math.random() * 3000) + 500 // 500-3499

    await page.getByLabel('SU (Litre)').fill(water)
    await page.getByLabel('SODYUM (mg)').fill(String(sodium))
    await page.getByLabel('Protein (g)').fill(String(protein))
    await page.getByLabel('Karbonhidrat (g)').fill(String(carb))
    await page.getByLabel('Yağ (g)').fill(String(fat))

    await page.getByRole('button', { name: 'Antrenörüme Gönder' }).click()

    await expect(page.getByText('Günlük veriler kaydedildi.')).toBeVisible()

    // Rapor listesi `log_date` DESC sıralanır ve kayıt UPSERT edildiği için
    // az önce gönderilen kayıt her zaman listenin en üstündeki karttır.
    // Seed verisinde aynı makro değerlerini paylaşan geçmiş kartlar olabileceğinden
    // (bkz. tests/e2e/daily-log.spec.ts strict-mode hatası), assertion'ları sayfa
    // genelinde değil yalnızca bu en yeni karta kapsayarak yapıyoruz.
    const logCards = page.locator('div.rounded-3xl.border.bg-gray-50', {
      has: page.locator('[role="img"]'),
    })
    const latestCard = logCards.first()

    await expect(latestCard.getByText(`Pro: ${protein}g`)).toBeVisible()
    await expect(latestCard.getByText(`Karb: ${carb}g`)).toBeVisible()
    await expect(latestCard.getByText(`Yağ: ${fat}g`)).toBeVisible()
  })

  test('geçersiz değer (su = 25 L) doğrulama hatası gösterir ve kayıt oluşmaz', async ({
    page,
  }) => {
    await page.getByLabel('SU (Litre)').fill('25')
    await page.getByRole('button', { name: 'Antrenörüme Gönder' }).click()

    await expect(page.getByText('Su miktarı en fazla 20 litre olabilir.')).toBeVisible()
    await expect(page.getByText('Günlük veriler kaydedildi.')).not.toBeVisible()
  })
})
