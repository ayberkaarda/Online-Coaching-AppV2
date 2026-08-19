// Panel sekmeleri, klavye navigasyonu, tema değiştirme ve rol bazlı erişim testleri.

import { TEST_USERS, login, loginAsCoach } from './fixtures'
// Bu dosyadaki testler SALT OKUNUR (sekme gezinme, tema, rol bazlı yönlendirme):
// hiçbir paylaşılan kaynağa yazmadıkları için `resource(...)` ilan ETMEZLER ve
// kilit fixture'ı onlar için no-op'tur — tam paralel koşmaya devam ederler.
// `test` yine de ortak sarmalayıcıdan alınır ki ileride yazan bir senaryo
// eklenirse kilit mekanizması hazır olsun (bkz. tests/e2e/resource-lock.ts).
import { expect, test } from './resource-lock'

// Sekme adları DashboardTabs.tsx'ten birebir alınır. Faz 2a'da sekme başlarındaki
// emoji `lucide-react` ikonlarıyla değiştirildi; ikonlar `aria-hidden="true"`
// taşıdığı için sekmelerin ERİŞİLEBİLİR ADI değişmedi (eskiden de emoji span'i
// aria-hidden'dı) — bu liste bu yüzden aynı kaldı.
//
// TÜRKÇE İ/ı TUZAĞI: "İstatistikler" noktalı büyük İ (U+0130) ile başlıyor.
// Aşağıdaki regex'lerde `i` bayrağı BİLEREK YOK; ECMAScript Canonicalize İ/i
// katlamasını Türkçe'ye göre yapmaz, bu yüzden büyük/küçük harf duyarlı
// (birebir) eşleşme kullanılır.
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
      const tab = page.getByRole('tab', { name: new RegExp(name) })
      await expect(tab).toBeVisible()
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel')).toBeVisible()
    }
  })

  test('ok tuşlarıyla sekmeler arasında klavye ile gezinilebilir', async ({ page }) => {
    const firstTab = page.getByRole('tab', { name: new RegExp(TAB_NAMES[0] as string) })
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
    await loginAsCoach(page)
  })

  test('"Koç Paneli" başlığı ve "Kullanıcı Yönetimi" butonu görünür', async ({ page }) => {
    await expect(page.getByText('Koç Paneli', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kullanıcı Yönetimi' })).toBeVisible()
  })

  test('danışan seçilmeden içerik alanında "en az bir danışan seçin" mesajı görünür', async ({
    page,
  }) => {
    // Kaynak: DashboardTabs.tsx. Metin birebir kopyalandı ("danışan" ı içerir,
    // bu yüzden `/i` bayraklı regex kullanılmaz).
    await expect(
      page.getByText('Lütfen yukarıdaki panelden en az bir danışan seçin.')
    ).toBeVisible()
  })

  test('koç /users sayfasına gidebilir', async ({ page }) => {
    await page.getByRole('button', { name: 'Kullanıcı Yönetimi' }).click()
    await page.waitForURL('/users')
    await expect(page.getByText('Kullanıcı Yönetim Merkezi')).toBeVisible()
  })
})
