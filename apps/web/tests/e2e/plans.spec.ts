// Plan akışları (antrenman + beslenme + koç onayı) için KARAKTERİZASYON testleri.
//
// AMAÇ: Bu dosya "olması gereken" davranışı değil, BUGÜNKÜ davranışı kilitler.
// Faz 1b şema göçü plan verisinin nerede/nasıl saklandığını değiştirecek
// (`profiles.workout_plan` / `profiles.nutrition_plan` JSON string'leri ve
// `program_approvals.workout_data`). Göçten önce bu testler yeşil olmalı; göç
// sonrası kırılırlarsa regresyon anında görülür. Bu yüzden aşağıda "tuhaf"
// görünen davranışlar bile (ör. danışanın kendi beslenme planını kaydedebilmesi)
// düzeltilmeden, olduğu gibi doğrulanır — bkz. `// NOT:` yorumları.
//
// Kaynaklar (birebir metin/rol/etiket buradan alındı, tahmin yürütülmedi):
//   src/components/tabs/WorkoutTab.tsx
//   src/components/tabs/NutritionTab.tsx
//   src/components/DashboardTabs.tsx
//   packages/api-client/src/hooks/usePlans.ts, packages/api-client/src/hooks/useProgramApprovals.ts
//
// TÜRKÇE İ/ı TUZAĞI (bkz. tests/e2e/README.md): İ (U+0130) veya ı (U+0131) içeren
// metinlerde `/i` bayraklı regex KULLANILMAZ. Aşağıdaki tüm locator'larda ya
// birebir string ya da `i` bayrağı olmayan, kaynaktan birebir kopyalanmış regex var.

import { type Page } from '@playwright/test'

import { TEST_USERS, login, type TestUser } from './fixtures'
import { expect, resource, test } from './resource-lock'

// Date.now() yerine testin kendi ürettiği rastgele sayı: tekrarlanan/paralel
// koşularda plan içerikleri çakışmasın (messaging.spec.ts ile aynı kalıp).
const randomSuffix = (): number => Math.floor(Math.random() * 1_000_000_000)

// fixtures.ts yalnızca `client1` ve `coach` tanımlıyor; ikinci danışan burada
// tanımlanır (fixtures.ts bu görevde salt-okunur). E-posta/parola supabase/seed.sql'den.
const SECOND_CLIENT: TestUser = {
  email: process.env.E2E_CLIENT2_EMAIL ?? 'client2@example.com',
  password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
}

// supabase/seed.sql: client1 -> "Ahmet Yılmaz", client2 -> "Elif Demir".
const CLIENT1_FULL_NAME = 'Ahmet Yılmaz'
const CLIENT2_FULL_NAME = 'Elif Demir'

/**
 * Koç panelinde bir danışanı arayıp seçer.
 *
 * `.last()` gerekli: current_streak === 0 olan danışanlar "Acil İlgilenilmesi
 * Gerekenler" panelinde de aynı aria-label ile göründüğü için strict-mode
 * ihlali oluşabilir; asıl "Danışan Yönetimi" listesindeki buton DOM'da sonda
 * yer alır (DashboardTabs.tsx). Aynı kalıp messaging.spec.ts'te de kullanılıyor.
 *
 * "Danışan Ara" etiketi noktasız ı (U+0131) içerir; kaynaktaki sr-only label
 * metni birebir kopyalandı, `/i` bayraklı regex KULLANILMADI.
 */
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
 * Bir gün textarea'sını (WorkoutTab) döndürür.
 * Etiket sr-only: `<label htmlFor="workout-{gün}">{gün} antrenman içeriği</label>`.
 */
const workoutDayField = (page: Page, day: string) =>
  panelOf(page).getByLabel(`${day} antrenman içeriği`, { exact: true })

/**
 * Bir gün input'unu (NutritionTab) döndürür.
 * Etiket sr-only: `<label htmlFor="nutrition-{gün}">{gün} besinleri</label>`.
 */
const nutritionDayField = (page: Page, day: string) =>
  panelOf(page).getByLabel(`${day} besinleri`, { exact: true })

/**
 * Plan verisi sunucudan gelene kadar bekler.
 *
 * WorkoutTab/NutritionTab, `targetId + planQuery.isFetched` anahtarı değişince
 * düzenleme taslağını SIFIRLAR. Veri gelmeden yazarsak yazdığımız metin
 * ezilir -> flake. Seed her gün için dolu içerik verdiğinden "boş değil"
 * beklemesi bu yarışı kapatır (waitForTimeout kullanılmaz, auto-waiting assertion).
 */
async function waitForPlanLoaded(field: ReturnType<typeof workoutDayField>): Promise<void> {
  await expect(field).toBeVisible()
  await expect(field).not.toHaveValue('')
}

// İZOLASYON NOTU (tüm dosya için):
// Buradaki senaryolar danışanların antrenman/beslenme planına YAZIYOR ve
// `save_workout_plan` RPC'si planın TAMAMINI (7 gün) yeniden yazıyor — yani
// benzersiz metin üretmek YETMEZ, aynı plana yazan iki test birbirinin kaydını
// tamamen ezer. Eski çözüm (`test.describe.configure({ mode: 'default' })`)
// YETERSİZDİ, çünkü sadece BU DOSYA içindeki sırayı garanti ediyordu:
//   (a) `workout.spec.ts` de client1'in antrenman planına yazıyor (ayrı dosya,
//       ayrı worker -> eş zamanlı),
//   (b) her spec AYNI anda iki projede (chromium + Mobile Chrome) koşuyor.
// Ölçülen kanıt: plans.spec "E2E Antrenman ..." beklerken workout.spec'in
// "1. E2E Gym ... - 2x5" satırını okudu.
// Yeni çözüm: her test dokunduğu kaynağı `resource(...)` ile ilan eder;
// tests/e2e/resource-lock.ts kilidi süreçler VE projeler arası uygular.
// Farklı kaynaklara dokunan senaryolar (beslenme <-> antrenman, client1 <->
// client2) paralel koşmaya DEVAM eder.
test.describe('Plan Akışları (karakterizasyon)', () => {
  test(
    'koç antrenman planını kaydeder, danışan aynı içeriği görür',
    { annotation: resource('workout-plan:client1') },
    async ({ page, browser }) => {
      // Bu senaryo client1'i (Ahmet Yılmaz) kullanır. Gerekçe: onay akışı testi
      // (aşağıda) client2 üzerinde program_approvals kayıtlarını değiştirir;
      // farklı danışan seçmek kilit kuyruğunu da kısaltır.
      const uniquePlan = `E2E Antrenman ${randomSuffix()}`
      const day = 'Pazartesi'

      // --- 1) Koç: danışanı seç, Antrenman sekmesinde planı yaz, kaydet ---
      await login(page, TEST_USERS.coach)
      await selectClient(page, CLIENT1_FULL_NAME)
      await page.getByRole('tab', { name: /Antrenman/ }).click()

      const coachField = workoutDayField(page, day)
      await waitForPlanLoaded(coachField)
      await coachField.fill(uniquePlan)

      // WorkoutTab.tsx: koç rolünde kaydet butonunun metni birebir budur.
      await page.getByRole('button', { name: 'Antrenman Tablosunu Güncelle' }).click()

      // usePlans.ts -> useSaveWorkoutPlan onSuccess toast'ı (tek danışan hali).
      // `i` bayrağı YOK: "programı" ı (U+0131) içeriyor.
      await expect(page.getByText(/Antrenman programı kaydedildi\./)).toBeVisible()

      // --- 2) Danışan ikinci bir tarayıcı bağlamında aynı içeriği görmeli ---
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await login(clientPage, TEST_USERS.client)
        await clientPage.getByRole('tab', { name: /Antrenman/ }).click()

        // NOT (bugünkü davranış): seed'de client1 için 'pending' bir program onayı
        // olduğu sürece danışanın gün textarea'ları DISABLED render edilir
        // (WorkoutTab.tsx `isWaitingMyApproval`). Değer yine de görünür; bu test
        // sadece içeriğin danışana ulaştığını kilitler, etkin/pasif olmasını değil.
        await expect(workoutDayField(clientPage, day)).toHaveValue(uniquePlan)
      } finally {
        await clientContext.close()
      }
    }
  )

  // REGRESYON KORUMASI (Faz 1b Adım 2): `/profile` sayfasındaki "Antrenman
  // Programım" kartı DEPRECATED `profiles.workout_plan` kolonundan besleniyordu;
  // plan `workout_plans` tablolarına taşındıktan sonra bu kart bayat (veya boş)
  // veri gösteriyordu. Kart artık `useWorkoutPlan()` ile besleniyor. Aşağıdaki
  // senaryo kartın gerçekten canlı plandan okuduğunu kilitler.
  test(
    'koç antrenman planını kaydeder, danışan profil sayfasında aynı içeriği görür',
    { annotation: resource('workout-plan:client1') },
    async ({ page, browser }) => {
      // 1. senaryo ile aynı danışan (client1) ve aynı KAYNAK kilidi kullanılır;
      // ikisi bu yüzden asla eş zamanlı koşmaz. Yine de farklı bir gün yazılır.
      const uniquePlan = `E2E Profil ${randomSuffix()}`
      const day = 'Salı'

      // --- 1) Koç: planı "Antrenman" sekmesinden kaydeder ---
      await login(page, TEST_USERS.coach)
      await selectClient(page, CLIENT1_FULL_NAME)
      await page.getByRole('tab', { name: /Antrenman/ }).click()

      const coachField = workoutDayField(page, day)
      await waitForPlanLoaded(coachField)
      await coachField.fill(uniquePlan)
      await page.getByRole('button', { name: 'Antrenman Tablosunu Güncelle' }).click()
      await expect(page.getByText(/Antrenman programı kaydedildi\./)).toBeVisible()

      // --- 2) Danışan: kendi profil sayfasında aynı içeriği görmeli ---
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await login(clientPage, TEST_USERS.client)
        await clientPage.goto('/profile')

        // Kart başlığı kaynakta (src/app/profile/page.tsx) artık
        // `<Dumbbell aria-hidden /> Antrenman Programım` — ikon aria-hidden
        // olduğu için erişilebilir ad yalnızca metindir. Substring regex,
        // `i` bayrağı YOK ("Programım" ı içerir).
        await expect(clientPage.getByRole('heading', { name: /Antrenman Programım/ })).toBeVisible()

        // Boş durum metni GÖRÜNMEMELİ: kart canlı plandan besleniyorsa dolu gelir.
        await expect(
          clientPage.getByText('Koçunuz henüz bir antrenman programı atamadı.')
        ).toHaveCount(0)

        // Gün satırı: `<li><span>Salı: </span><span>{içerik}</span></li>`.
        // `uniquePlan` ASCII olduğu için filtre Türkçe harf tuzağına takılmaz.
        const dayItem = clientPage.getByRole('listitem').filter({ hasText: uniquePlan })
        await expect(dayItem).toHaveCount(1)
        // toContainText: büyük/küçük harf duyarlı, birebir alt dize — İ/ı tuzağı yok.
        await expect(dayItem).toContainText(day)
        await expect(dayItem).toContainText(uniquePlan)
      } finally {
        await clientContext.close()
      }
    }
  )

  test(
    'danışan kendi beslenme planını kaydeder ve yenilemeden sonra da görür',
    { annotation: resource('nutrition-plan:client2') },
    async ({ page }) => {
      // NOT (bugünkü davranış, bilinçli olarak kilitleniyor): "Beslenme Tablosunu
      // Kaydet" butonu NutritionTab.tsx'te role'e bakılmaksızın render ediliyor ve
      // `handleSaveProgram` danışan için clientIds = [currentUserId] kuruyor. Yani
      // danışan KENDİ beslenme planını koç onayı olmadan kaydedebiliyor
      // (antrenman tarafındaki onay akışının beslenme karşılığı YOK). Bu testin
      // görevi mevcut davranışı kilitlemek; doğru/yanlış yorumu yapılmıyor.
      //
      // client2 kullanılır: antrenman senaryoları client1'in planına yazıyor,
      // burada farklı bir danışanın beslenme planı yazılıyor — farklı kilit
      // anahtarı, dolayısıyla bu senaryo onlarla PARALEL koşabilir.
      const uniqueMeal = `E2E Beslenme ${randomSuffix()}`
      const day = 'Perşembe'

      await login(page, SECOND_CLIENT)
      await page.getByRole('tab', { name: /Beslenme/ }).click()

      const field = nutritionDayField(page, day)
      await waitForPlanLoaded(field)
      await field.fill(uniqueMeal)

      await page.getByRole('button', { name: 'Beslenme Tablosunu Kaydet' }).click()

      // usePlans.ts -> useSaveNutritionPlan onSuccess toast'ı (tek danışan hali).
      await expect(page.getByText(/Beslenme programı kaydedildi\./)).toBeVisible()

      // --- Kalıcılık: sayfa yenilendikten sonra da aynı içerik gelmeli ---
      await page.reload()
      await page.getByRole('tab', { name: /Beslenme/ }).click()
      await expect(nutritionDayField(page, day)).toHaveValue(uniqueMeal)
    }
  )

  // REGRESYON KORUMASI (Faz 1b Adım 3b): `/profile` sayfasındaki "Beslenme
  // Programım" kartı DEPRECATED `profiles.nutrition_plan` kolonundan besleniyordu;
  // plan `nutrition_plans` tablolarına taşındıktan sonra bu kart bayat (veya boş)
  // veri gösteriyordu. Kart artık `useNutritionPlan()` ile besleniyor. Aşağıdaki
  // senaryo kartın gerçekten canlı plandan okuduğunu kilitler. (Antrenman
  // karşılığı: "koç antrenman planını kaydeder, danışan profil sayfasında...")
  test(
    'danışan beslenme planını kaydeder, profil sayfasında aynı içeriği görür',
    { annotation: resource('nutrition-plan:client2') },
    async ({ page }) => {
      // Yukarıdaki beslenme senaryosuyla aynı danışan (client2) ve aynı KAYNAK
      // kilidi kullanılır; ikisi bu yüzden asla eş zamanlı koşmaz. Yine de farklı
      // bir gün yazılır. Kaydetmeyi danışanın kendisi yapar: NutritionTab'te
      // kaydet butonu role bakılmaksızın render ediliyor (bkz. yukarıdaki NOT).
      const uniqueMeal = `E2E Beslenme Profil ${randomSuffix()}`
      const day = 'Cumartesi'

      // --- 1) Danışan: "Beslenme" sekmesinden planı kaydeder ---
      await login(page, SECOND_CLIENT)
      await page.getByRole('tab', { name: /Beslenme/ }).click()

      const field = nutritionDayField(page, day)
      await waitForPlanLoaded(field)
      await field.fill(uniqueMeal)
      await page.getByRole('button', { name: 'Beslenme Tablosunu Kaydet' }).click()
      await expect(page.getByText(/Beslenme programı kaydedildi\./)).toBeVisible()

      // --- 2) Aynı danışan kendi profil sayfasında aynı içeriği görmeli ---
      await page.goto('/profile')

      // Kart başlığı kaynakta (src/app/profile/page.tsx) artık
      // `<Salad aria-hidden /> Beslenme Programım` — ikon aria-hidden olduğu için
      // erişilebilir ad yalnızca metindir. Substring regex, `i` bayrağı YOK
      // ("Programım" ı içerir).
      await expect(page.getByRole('heading', { name: /Beslenme Programım/ })).toBeVisible()

      // Boş durum metni GÖRÜNMEMELİ: kart canlı plandan besleniyorsa dolu gelir.
      await expect(page.getByText('Koçunuz henüz bir beslenme programı atamadı.')).toHaveCount(0)

      // Gün satırı: `<li><span>Cumartesi: </span><span>{içerik} ({kcal} kcal)</span></li>`.
      // `uniqueMeal` ASCII olduğu için filtre Türkçe harf tuzağına takılmaz.
      const dayItem = page.getByRole('listitem').filter({ hasText: uniqueMeal })
      await expect(dayItem).toHaveCount(1)
      // toContainText: büyük/küçük harf duyarlı, birebir alt dize — İ/ı tuzağı yok.
      await expect(dayItem).toContainText(day)
      await expect(dayItem).toContainText(uniqueMeal)
    }
  )

  test(
    'danışan programı onaya gönderir, koç onaylar ve plan danışanın profiline işlenir',
    {
      // İki kaynak: onay kuyruğu (`program_approvals`) VE onaylandığında
      // danışanın planına işlenen antrenman planı (`useApproveProgram` planı
      // yeniden yazar). İkisi de client2 üzerinde.
      annotation: [resource('program-approvals:client2'), resource('workout-plan:client2')],
    },
    async ({ page, browser }) => {
      // Bu senaryo client2 (Elif Demir) üzerinde çalışır; antrenman senaryoları
      // client1'i kullandığı için onay kuyrukları birbirine karışmaz.
      const uniquePlan = `E2E Onay ${randomSuffix()}`
      const day = 'Cuma'

      // Koç varsayılan `page` bağlamında, danışan ikinci bir bağlamda çalışır.
      const coachPage = page
      await login(coachPage, TEST_USERS.coach)
      await selectClient(coachPage, CLIENT2_FULL_NAME)
      await coachPage.getByRole('tab', { name: /Antrenman/ }).click()

      // WorkoutTab.tsx: onay butonundaki ikon (`<Check aria-hidden />`) erişilebilir
      // ada girmez; yine de metnin başına/sonuna ekleme yapılabildiği için
      // substring regex kullanılır (`i` bayrağı YOK: "İşle" noktalı büyük İ içeriyor).
      const approveButton = coachPage.getByRole('button', { name: /Onayla ve Profiline İşle/ })

      // --- 0) Ön koşul: bekleyen onayları temizle ---
      // supabase/seed.sql her danışan için 1 adet 'pending' onay yaratıyor. Bu
      // kayıt dururken danışanın "onaya gönder" butonu DISABLED olur, yani senaryo
      // hiç başlayamaz. Testin tekrar tekrar koşabilmesi için kuyruk önce
      // boşaltılır. `toPass` ile döngü: birden fazla bekleyen kayıt varsa (önceki
      // yarım kalmış bir koşumdan) hepsi onaylanana kadar tekrarlanır.
      //
      // B-040 DÜZELTMESİ: bu adım eskiden seed'in DEMO `pending` kaydını kalıcı
      // olarak tüketiyordu (onaylayıp bir daha asla geri koymuyordu) — koçun demo
      // kuyruğu bu test bir kez koşunca sonsuza dek boşalıyordu. `supabase/seed.sql`'e
      // DOKUNULMADI; bunun yerine testin SONUNDA (adım 5) danışan AYNI akışla yeni
      // bir 'pending' kayıt üretir, yani kuyruk test biterken yine 1 bekleyen kayıtla
      // kalır — ister seed'in ilk kaydı ister bu testin önceki koşusunun bıraktığı
      // kayıt olsun, davranış aynı: testi kendi ürettiği fikstürle "kendi temizler".
      await expect(async () => {
        if ((await approveButton.count()) > 0) await approveButton.first().click()
        await expect(approveButton).toHaveCount(0)
      }).toPass({ timeout: 30_000 })

      // --- 1) Danışan: benzersiz plan yaz ve koç onayına gönder ---
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await login(clientPage, SECOND_CLIENT)
        await clientPage.getByRole('tab', { name: /Antrenman/ }).click()

        const clientField = workoutDayField(clientPage, day)
        await waitForPlanLoaded(clientField)
        await expect(clientField).toBeEnabled()
        await clientField.fill(uniquePlan)

        // WorkoutTab.tsx (danışan hali): buton içeriği artık
        // `<Send aria-hidden /> Bu Programı Koça Onaya Gönder`. Faz 2a öncesinde
        // baştaki "📨" emoji'si aria-hidden DEĞİLDİ ve erişilebilir adın parçasıydı;
        // ikona geçişle ad yalnızca metne indi. Substring regex her iki halde de
        // eşleşir (`i` bayrağı yok: "Programı" ı içeriyor).
        const submitButton = clientPage.getByRole('button', {
          name: /Bu Programı Koça Onaya Gönder/,
        })
        await expect(submitButton).toBeEnabled()
        await submitButton.click()

        // useProgramApprovals.ts -> useSubmitProgramForApproval onSuccess toast'ı.
        await expect(clientPage.getByText(/Program taslağı koçuna gönderildi\./)).toBeVisible()

        // --- 2) Danışan tarafı bekleme durumuna geçmeli ---
        // Aynı buton `<Clock aria-hidden /> Koçun Onayı Bekleniyor...` olur ve disabled edilir
        // (WorkoutTab.tsx `isWaitingMyApproval`). Textarea da devre dışı kalır.
        const waitingButton = clientPage.getByRole('button', {
          name: /Koçun Onayı Bekleniyor/,
        })
        await expect(waitingButton).toBeVisible()
        await expect(waitingButton).toBeDisabled()
        await expect(workoutDayField(clientPage, day)).toBeDisabled()

        // --- 3) Koç: sayfayı tazeleyip onay kutusunu görmeli ve onaylamalı ---
        // Reload gerekli: koç sayfası zaten açıkken usePendingApprovals sorgusu
        // kendiliğinden tazelenmeyebilir; reload state'i (danışan seçimi dahil)
        // sıfırladığı için danışan yeniden seçilir.
        await coachPage.reload()
        await selectClient(coachPage, CLIENT2_FULL_NAME)
        await coachPage.getByRole('tab', { name: /Antrenman/ }).click()

        await expect(coachPage.getByText('ONAY BEKLEYEN PROGRAM VAR')).toBeVisible()
        await expect(approveButton).toBeVisible()
        await approveButton.click()

        // useProgramApprovals.ts -> useApproveProgram onSuccess toast'ı.
        await expect(
          coachPage.getByText(/Program onaylandı ve danışanın profiline işlendi\./)
        ).toBeVisible()
        // Onay kutusu kaybolmalı (bekleyen kayıt kalmadı).
        await expect(approveButton).toHaveCount(0)

        // --- 4) Danışan: yenileme sonrası onaylanan plan görünür, bekleme kalkar ---
        await clientPage.reload()
        await clientPage.getByRole('tab', { name: /Antrenman/ }).click()

        const clientFieldAfter = workoutDayField(clientPage, day)
        await expect(clientFieldAfter).toHaveValue(uniquePlan)
        await expect(clientFieldAfter).toBeEnabled()
        await expect(submitButton).toBeEnabled()
        await expect(waitingButton).toHaveCount(0)

        // --- 5) B-040: demo kuyruğunu test SONUNDA yeniden doldur ---
        // Adım 0 seed'in (veya önceki bir koşunun) `pending` kaydını onaylayarak
        // tüketti. Kuyruğu kalıcı boş bırakmamak için danışan onaylanmış planını
        // (ekranda hâlâ dolu duran `clientFieldAfter`) AYNI akışla yeniden koça
        // onaya gönderir — test biterken client2 için tekrar TAM OLARAK 1 `pending`
        // kayıt vardır, tıpkı seed'in bıraktığı gibi. Bir sonraki koşunun adım 0'ı
        // bu kaydı tüketip aynı döngüyü tekrarlar — self-sustaining fikstür.
        await submitButton.click()
        await expect(clientPage.getByText(/Program taslağı koçuna gönderildi\./)).toBeVisible()
        await expect(waitingButton).toBeVisible()
        await expect(clientFieldAfter).toBeDisabled()
      } finally {
        await clientContext.close()
      }
    }
  )
})
