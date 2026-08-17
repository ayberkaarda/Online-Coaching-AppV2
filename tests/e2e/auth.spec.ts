// Kimlik doğrulama akışları: yönlendirme, hatalı giriş, başarılı giriş, çıkış, form doğrulama.
// NOT: test.describe.serial KULLANILMAZ — testler paralel çalışabilir, her biri kendi
// giriş adımını kurar.

import { expect, test } from '@playwright/test'

import { TEST_USERS, login, logout } from './fixtures'

test.describe('Kimlik Doğrulama', () => {
  test("giriş yapmadan / adresine gidince /login'e yönlendirilir", async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('/login')
    await expect(page.getByLabel(/e-posta/i)).toBeVisible()
  })

  test("yanlış şifreyle giriş denemesi hata mesajı gösterir ve /login'de kalınır", async ({
    page,
  }) => {
    await page.goto('/login')
    await page.getByLabel(/e-posta/i).fill(TEST_USERS.client.email)
    // "ŞİFRE" etiketindeki noktalı büyük İ (U+0130) yüzünden /şifre/i asla eşleşmez
    // (bkz. fixtures.ts notu) — birebir metin kullanılır.
    await page.getByLabel('ŞİFRE').fill('YanlisSifre123!')
    // Kaynaktaki büyük harf Türkçe "GİRİŞ YAP" metniyle birebir eşleşir (bkz. fixtures.ts notu).
    await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()

    await expect(
      page.getByRole('alert').filter({ hasText: 'E-posta veya şifre hatalı!' })
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('doğru bilgilerle giriş yapınca dashboard açılır ve "Danışan Paneli" başlığı görünür', async ({
    page,
  }) => {
    await login(page, TEST_USERS.client)

    // TÜRKÇE İ/ı TUZAĞI: "Danışan" noktasız ı (U+0131) içeriyor. `/i` bayraklı
    // regex KULLANILMAZ; kaynaktaki (src/app/page.tsx) metin birebir kopyalanır
    // ve `exact: true` ile büyük/küçük harf katlaması tamamen devre dışı bırakılır.
    await expect(page.getByText('Danışan Paneli', { exact: true })).toBeVisible()
  })

  test("çıkış yapınca /login'e döner ve korumalı sayfaya erişilemez", async ({ page }) => {
    await login(page, TEST_USERS.client)
    await logout(page)

    await expect(page).toHaveURL(/\/login/)

    // Asıl güvenlik iddiası: çıkış sonrası korumalı sayfaya doğrudan gidilemez.
    // Bu, geri tuşuna göre dayanıklıdır — tarayıcı geçmişinin derinliğine bağımlı değildir.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)

    // Ek kontrol: geri tuşu da dashboard'a geri dönmemeli. Bazı ortamlarda sığ
    // tarayıcı geçmişi yüzünden goBack() `about:blank`'e düşebilir; bu durumda
    // navigasyon gerçekleşmediğinden (response null) iddiayı atlıyoruz, çünkü
    // about:blank zaten korumalı içerik göstermiyor.
    const response = await page.goBack()
    if (response) {
      await expect(page).toHaveURL(/\/login/)
    } else {
      await expect(page.getByText('Danışan Paneli', { exact: true })).not.toBeVisible()
    }
  })

  test('boş formu göndermeye çalışınca alan doğrulama hataları görünür', async ({ page }) => {
    await page.goto('/login')
    // Kaynaktaki büyük harf Türkçe "GİRİŞ YAP" metniyle birebir eşleşir (bkz. fixtures.ts notu).
    await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()

    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
