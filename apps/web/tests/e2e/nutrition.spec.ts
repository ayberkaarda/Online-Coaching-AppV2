// Beslenme akışı — Faz 2d (`active_planprogram.md` §4.2, AC-2.1).
//
// AKIŞ: koç günlük makro hedefi belirler -> danışan (ikinci bir tarayıcı
// bağlamında) hedefi görür -> öğün ekler -> dashboard (hedef vs gerçekleşen)
// güncellenir -> danışan kaydı siler -> dashboard ÖNCEKİ (silme öncesi) değere
// döner. Dashboard iddiaları MUTLAK değil, DELTA'dır (bkz. `readActualKcal`
// yorumu ve tests/e2e/README.md) — bugünün nutrition_logs toplamı önceki
// koşulardan kalan satırları da kapsayabildiği için "0'dan başlar" varsayılmaz.
//
// Ayrıca koçun beslenme LOG'una (nutrition_logs) hiçbir yazma eylemi
// SUNULMADIĞINI (RLS: koç salt okur, bkz. supabase/README.md §4h) gerçek
// tarayıcıda doğrular — tests/unit/nutrition-logs.test.ts'teki bileşen testinin
// uçtan uca karşılığı.
//
// `tests/e2e/plans.spec.ts`'in "beslenme" senaryoları client2 (Elif Demir)
// kullanıyor (`nutrition_plan_meals` gün içeriği — ŞABLON). Bu dosya BİLEREK
// client1'i (Ahmet Yılmaz) kullanır: hedef (`nutrition_plans.target_*`) ve
// öğün LOGU (`nutrition_logs`) o dosyanın dokunduğu satır/tablolardan
// TAMAMEN ayrı olsa da, aynı danışanın aktif `nutrition_plans` satırını
// paylaşan (farklı KOLONLARA yazan) testlerin ayrı worker'larda çakışmasını
// önlemek için farklı danışan seçildi.
//
// TÜRKÇE İ/ı TUZAĞI (bkz. tests/e2e/README.md): `/i` bayraklı regex İ/ı içeren
// metinlerde KULLANILMAZ. Aşağıdaki locator'lar ya birebir string ya da `i`
// bayrağı olmayan regex'tir (kaynaktan birebir kopyalandı).

import { type Page } from '@playwright/test'

import { TEST_USERS, login, loginAsCoach } from './fixtures'
import { expect, resource, test } from './resource-lock'

// Testin kendi ürettiği rastgele sayı: tekrarlanan koşularda hedef değeri
// önceki koşudan ayrışsın (messaging.spec.ts/plans.spec.ts ile aynı kalıp).
const randomSuffix = (): number => Math.floor(Math.random() * 900) + 1500 // 1500-2399 aralığı

// supabase/seed.sql: client1 -> "Ahmet Yılmaz", client2 -> "Elif Demir".
const CLIENT1_FULL_NAME = 'Ahmet Yılmaz'
const CLIENT2_FULL_NAME = 'Elif Demir'

/** Koç panelinde bir danışanı arayıp seçer (bkz. plans.spec.ts — aynı desen). */
async function selectClient(page: Page, fullName: string): Promise<void> {
  const firstName = fullName.split(' ')[0] as string
  await page.getByLabel('Danışan Ara').fill(firstName)
  await page
    .getByRole('button', { name: `${fullName} seç` })
    .last()
    .click()
}

/** Aktif sekme paneli — strict-mode ihlallerini önlemek için tüm seçiciler buna kapsanır. */
const panelOf = (page: Page) => page.getByRole('tabpanel')

/**
 * Panelde "{gerçekleşen} / {hedef} kcal" satırındaki GERÇEKLEŞEN sayıyı okur.
 *
 * MUTLAK DEĞİL, FARK (delta) ÖLÇÜLÜR — bkz. tests/e2e/README.md ve
 * `supabase/tests/rls.test.sql` senaryo 12/77 (aynı desen): `sumNutritionLogsForDate`
 * (packages/api-client/src/hooks/useNutritionLogs.ts) BUGÜNÜN nutrition_logs satırlarının TAMAMINI
 * toplar, yani önceki (başarısız/yarım kalmış) koşulardan kalan satırlar da
 * toplama girer — "henüz öğün girilmedi -> 0 kcal" varsayımı ÖLÇÜLEREK kırıldı
 * (kalıntı: 2 satır/800 kcal, test 400 kcal bekliyordu, bkz. git geçmişi).
 * `targetKcal` bu koşuya özgü rastgele bir değer olduğu için satırı benzersiz
 * hedefler; ayrıca regex'in tam sayıyı araması hedefin GERÇEKTEN sayısal bir
 * değer olduğunu (0 ile "hedef belirlenmedi" karışmadığını) da doğrular.
 */
async function readActualKcal(
  panel: ReturnType<typeof panelOf>,
  targetKcal: number
): Promise<number> {
  const row = panel.getByText(new RegExp(`/ ${targetKcal} kcal`))
  await expect(row).toBeVisible()
  const text = (await row.textContent()) ?? ''
  const match = /^\s*(\d+)\s*\//.exec(text)
  if (!match?.[1]) throw new Error(`Kalori satırı ayrıştırılamadı: "${text}"`)
  return Number(match[1])
}

test.describe('Beslenme Akışı (§4.2)', () => {
  // SAAT DİLİMİ — `test.use({ timezoneId: 'UTC' })` KALDIRILDI (bilerek).
  //
  // Bu dosyada bir süre tarayıcı bağlamı UTC'ye sabitlenmişti, çünkü öğün
  // eklerken `log_date` GÖNDERİLMİYOR, veritabanının `current_date` (UTC)
  // varsayılanına düşülüyordu; dashboard ise `todayIsoDate()` ile YEREL günü
  // filtreliyordu. UTC+3'te yerel gece 00:00–03:00 penceresinde ikisi FARKLI
  // takvim günü üretiyor ve eklenen öğün toplamda hiç görünmüyordu (ÖLÇÜLDÜ).
  // Tarayıcıyı veritabanıyla aynı dilime sabitlemek yalnızca SEMPTOMU
  // gizliyordu — gerçek kullanıcıyı korumuyordu.
  //
  // Hata ÜRÜN KODUNDA düzeltildi: dört yazma yolu da (nutrition_logs,
  // daily_logs, progress_entries, progress_photos) tarihi İSTEMCİDEN, yerel
  // gün olarak AÇIKÇA gönderir ve tarih alanları tiplerde ZORUNLUDUR
  // (`@repo/api-client/date` + tests/unit/local-date-consistency.test.ts). Yazma ve
  // okuma artık AYNI kaynağı kullandığı için senaryo tarayıcının saat
  // diliminden BAĞIMSIZDIR; sabitlemeye gerek yoktur ve sabitlemek, aynı
  // hatanın geri gelmesini bu testten SAKLARDI.
  //
  // DOĞRULANDI: bu spec, host makinesi Europe/Istanbul (UTC+3) iken ve yerel
  // saat gece yarısı penceresinin İÇİNDEYKEN (yerel ~00:45 / UTC ~21:45,
  // yani yerel gün UTC gününden İLERİDE) sabitleme olmadan koşuldu ve GEÇTİ.

  // İZOLASYON: aşağıdaki senaryo client1'in TEK aktif `nutrition_plans`
  // satırının hedef kolonlarına ve `nutrition_logs` kayıtlarına yazar. Dosya içi
  // `mode: 'default'` YETMİYORDU, çünkü her spec AYNI anda iki projede
  // (chromium + Mobile Chrome) koşuyor ve iki kopya aynı hedefi eziyordu.
  // Kaynak kilidi (tests/e2e/resource-lock.ts) bunu süreçler VE projeler arası
  // kapatır. İkinci senaryo salt-okunur olduğu için kilit ALMAZ ve paralel koşar.

  test(
    'koç hedef belirler, danışan görür, öğün ekler, dashboard günceller, kaydı siler',
    { annotation: [resource('nutrition-plan:client1'), resource('nutrition-logs:client1')] },
    async ({ page, browser }) => {
      const targetKcal = randomSuffix()
      const mealDescription = `E2E Öğün ${randomSuffix()}`
      const mealKcal = 400

      // --- 1) Koç: danışanı seç, Beslenme sekmesinde günlük hedefi gir ve kaydet ---
      await loginAsCoach(page)
      await selectClient(page, CLIENT1_FULL_NAME)
      await page.getByRole('tab', { name: /Beslenme/ }).click()

      const coachPanel = panelOf(page)
      await expect(coachPanel.getByText('Günlük Makro Hedefi')).toBeVisible()

      const kcalInput = coachPanel.getByLabel('Günlük Kalori Hedefi (kcal)')
      await expect(kcalInput).toBeVisible()
      await kcalInput.fill(String(targetKcal))
      await coachPanel.getByRole('button', { name: 'Hedefi Kaydet' }).click()

      // useNutritionLogs.ts -> useSetNutritionTargets onSuccess toast'ı.
      await expect(page.getByText('Günlük makro hedefi kaydedildi.')).toBeVisible()

      // Koç öğün EKLEME formunu HİÇ görmez (RLS: koç nutrition_logs'a yazamaz,
      // bkz. supabase/README.md §4h) — salt-okunur geçmiş görünür.
      await expect(coachPanel.getByText('Öğün Ekle')).toHaveCount(0)
      await expect(coachPanel.getByText('Danışanın Öğün Geçmişi (salt okunur)')).toBeVisible()

      // --- 2) Danışan: ikinci bir tarayıcı bağlamında hedefi görmeli ---
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await login(clientPage, TEST_USERS.client)
        await clientPage.getByRole('tab', { name: /Beslenme/ }).click()

        const clientPanel = panelOf(clientPage)
        await expect(clientPanel.getByText('Günlük Makro Durumu')).toBeVisible()
        // MUTLAK DEĞİL, FARK (delta) ÖLÇÜLÜR (bkz. `readActualKcal` yorumu): bugünkü
        // gerçekleşen kcal önceki (başarısız/yarım kalmış) koşulardan kalan
        // satırları da içerebilir, bu yüzden burada 0 VARSAYILMAZ — okunur.
        const baseActualKcal = await readActualKcal(clientPanel, targetKcal)

        // Danışan koç değildir -> hedef editörünü GÖRMEZ.
        await expect(clientPanel.getByText('Günlük Makro Hedefi')).toHaveCount(0)

        // --- 3) Danışan: öğün ekler ---
        await clientPanel.getByLabel('AÇIKLAMA').fill(mealDescription)
        await clientPanel.getByLabel('KALORİ').fill(String(mealKcal))
        await clientPanel.getByRole('button', { name: 'Öğünü Ekle' }).click()

        // useNutritionLogs.ts -> useCreateNutritionLog onSuccess toast'ı.
        await expect(clientPage.getByText('Öğün eklendi.')).toBeVisible()

        // --- 4) Dashboard güncellenir: gerçekleşen ÖNCEKİ DEĞER + mealKcal olmalı (delta) ---
        await expect
          .poll(() => readActualKcal(clientPanel, targetKcal), {
            message: 'öğün eklendikten sonra dashboard güncellemesini beklerken',
          })
          .toBe(baseActualKcal + mealKcal)
        await expect(clientPanel.getByText(mealDescription)).toBeVisible()

        // --- 5) Danışan kaydı siler, dashboard ÖNCEKİ DEĞERE (baseActualKcal) döner ---
        // (0'a DEĞİL — birikmiş kalıntı varsa dashboard o kalıntıya geri döner;
        // bu test yalnızca KENDİ eklediği satırı siler.)
        await clientPanel.getByRole('button', { name: `${mealDescription} kaydını sil` }).click()
        await expect(clientPage.getByText('Öğün silindi.')).toBeVisible()
        await expect
          .poll(() => readActualKcal(clientPanel, targetKcal), {
            message: 'öğün silindikten sonra dashboard güncellemesini beklerken',
          })
          .toBe(baseActualKcal)
        await expect(clientPanel.getByText(mealDescription)).toHaveCount(0)
      } finally {
        await clientContext.close()
      }
    }
  )

  test('koç birden fazla danışan seçtiğinde hedef/dashboard paneli yerine uyarı görür', async ({
    page,
  }) => {
    // Danışan seçim butonları `aria-pressed` ile ÇOKLU seçimi destekler
    // (bkz. src/components/DashboardTabs.tsx `selectedClientIds`) — art arda
    // iki `{isim} seç` tıklaması ikisini de seçili bırakır (arama filtresi
    // yalnızca GÖRÜNÜR listeyi daraltır, seçim durumunu ETKİLEMEZ).
    await loginAsCoach(page)
    await selectClient(page, CLIENT1_FULL_NAME)
    await selectClient(page, CLIENT2_FULL_NAME)

    await page.getByRole('tab', { name: /Beslenme/ }).click()
    const coachPanel = panelOf(page)
    await expect(
      coachPanel.getByText('Makro hedefi ve öğün geçmişi için tek danışan seçili bırakın.')
    ).toBeVisible()
    await expect(coachPanel.getByText('Günlük Makro Hedefi')).toHaveCount(0)
  })
})
