// Panel sekmeleri, klavye navigasyonu, tema değiştirme ve rol bazlı erişim testleri.

import { expect, test } from '@playwright/test'

import { TEST_USERS, login } from './fixtures'

const TAB_NAMES = [
  'Duyurular',
  'İstatistikler',
  'Form Check',
  'Günlük Veriler',
  'Beslenme',
  'Antrenman',
  'Sohbet',
]

test.describe('Danışan Paneli', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.client)
  })

  test('tüm sekmeler görünür ve tıklanabilir, her tıklamada ilgili tabpanel değişir', async ({
    page,
  }) => {
    for (const name of TAB_NAMES) {
      const tab = page.getByRole('tab', { name: new RegExp(name, 'i') })
      await expect(tab).toBeVisible()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel')).toBeVisible()
    }
  })

  test('ok tuşlarıyla sekmeler arasında klavye ile gezinilebilir', async ({ page }) => {
    const firstTab = page.getByRole('tab', { name: new RegExp(TAB_NAMES[0] as string, 'i') })
    await firstTab.click()
    await expect(firstTab).toHaveAttribute('aria-selected', 'true')

    const before = await page.getByRole('tab', { selected: true }).textContent()
    await page.keyboard.press('ArrowRight')
    const after = await page.getByRole('tab', { selected: true }).textContent()

    expect(after).not.toBe(before)
  })

  test("tema değiştirme butonu html elemanının class'ını dark <-> açık arasında değiştirir", async ({
    page,
  }) => {
    const html = page.locator('html')
    const isDark = async (): Promise<boolean> =>
      ((await html.getAttribute('class')) ?? '').includes('dark')

    const toggle = page.getByRole('button', { name: /temaya geç/i })
    const before = await isDark()

    await toggle.click()
    await expect.poll(isDark).toBe(!before)

    await toggle.click()
    await expect.poll(isDark).toBe(before)
  })

  test("danışan /users adresine giderse /'e geri yönlendirilir", async ({ page }) => {
    await page.goto('/users')
    await page.waitForURL('/')
  })
})

test.describe('Koç Paneli', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.coach)
  })

  test('"Yönetici Paneli" başlığı ve "Kullanıcı Yönetimi" butonu görünür', async ({ page }) => {
    await expect(page.getByText('Yönetici Paneli')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kullanıcı Yönetimi' })).toBeVisible()
  })

  test('öğrenci seçilmeden içerik alanında "en az bir öğrenci seçin" mesajı görünür', async ({
    page,
  }) => {
    await expect(
      page.getByText('Lütfen yukarıdaki panelden en az bir öğrenci seçin.')
    ).toBeVisible()
  })

  test('koç /users sayfasına gidebilir', async ({ page }) => {
    await page.getByRole('button', { name: 'Kullanıcı Yönetimi' }).click()
    await page.waitForURL('/users')
    await expect(page.getByText('Kullanıcı Yönetim Merkezi')).toBeVisible()
  })
})
