// AC-2.1'in ANTRENMAN yarısı (active_planprogram.md §4.1):
//   koç plan yayınlar -> danışan görür -> set logu girer -> koç logu görür.
//
// Beslenme/form-check/mesaj yarıları ayrı spec dosyalarındadır; bu dosya
// yalnızca antrenman akışına dokunur ve mevcut spec'leri DEĞİŞTİRMEZ.
//
// TÜRKÇE İ/ı TUZAĞI (bkz. tests/e2e/README.md): İ (U+0130) / ı (U+0131) içeren
// metinlerde `/i` bayraklı regex KULLANILMAZ ve `getByRole(..., { name })`
// varsayılan olarak büyük/küçük harf duyarsız eşleştiği için burada HER YERDE
// `exact: true` verilir — böylece eşleşme birebir dizedir, katlama yapılmaz.
//
// Kaynaklar (metinler birebir buradan alındı, tahmin yürütülmedi):
//   src/components/tabs/WorkoutTab.tsx
//   src/components/workout/GymMode.tsx
//   packages/api-client/src/hooks/useWorkoutLogs.ts (toast metinleri)

import { type Page } from '@playwright/test'

import { TEST_USERS, login, loginAsCoach } from './fixtures'
import { expect, resource, test } from './resource-lock'

// src/lib/utils.ts `getTodayName()` ile AYNI eşleme (0 = Pazar).
const WEEKDAY_BY_INDEX = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const

/** Testin koştuğu günün adı — gym modu YALNIZCA bugünün planını başlatır. */
function todayName(): string {
  return WEEKDAY_BY_INDEX[new Date().getDay()] ?? 'Pazartesi'
}

const randomSuffix = (): number => Math.floor(Math.random() * 1_000_000_000)

// supabase/seed.sql: client1 -> "Ahmet Yılmaz".
const CLIENT1_FULL_NAME = 'Ahmet Yılmaz'

/** Aktif sekme paneli — strict-mode ihlallerini önlemek için seçiciler buna kapsanır. */
const panelOf = (page: Page) => page.getByRole('tabpanel')

/**
 * Koç panelinde bir danışanı arayıp seçer.
 * `.last()` gerekli: aynı aria-label "Acil İlgilenilmesi Gerekenler" panelinde de
 * görünebilir (plans.spec.ts ile aynı kalıp ve aynı gerekçe).
 */
async function selectClient(page: Page, fullName: string): Promise<void> {
  const firstName = fullName.split(' ')[0] as string
  await page.getByLabel('Danışan Ara').fill(firstName)
  await page
    .getByRole('button', { name: `${fullName} seç`, exact: true })
    .last()
    .click()
}

const workoutDayField = (page: Page, day: string) =>
  panelOf(page).getByLabel(`${day} antrenman içeriği`, { exact: true })

/**
 * Bekleyen program onaylarını temizler.
 *
 * GEREKÇE: seed her danışan için bir 'pending' onay bırakır; o kayıt dururken
 * danışanın "BUGÜNÜ BAŞLAT" butonu HİÇ render edilmez (WorkoutTab
 * `isWaitingMyApproval`) ve senaryo başlayamaz. `toPass` döngüsü, önceki yarım
 * kalmış koşulardan birden çok bekleyen kayıt kalmışsa hepsini tüketir.
 */
async function clearPendingApprovals(coachPage: Page): Promise<void> {
  const approveButton = coachPage.getByRole('button', { name: /Onayla ve Profiline İşle/ })
  await expect(async () => {
    if ((await approveButton.count()) > 0) await approveButton.first().click()
    await expect(approveButton).toHaveCount(0)
  }).toPass({ timeout: 30_000 })
}

test.describe('Antrenman akışı (AC-2.1 — antrenman yarısı)', () => {
  // ÖLÇÜLEN YARIŞ (ve nasıl kapatıldı):
  //   `save_workout_plan` RPC'si planın YEDİ GÜNÜNÜ BİRDEN değiştirir; yani
  //   client1'in planına yazan her test bir diğerinin kaydını ezebilir.
  //   `plans.spec.ts`'in ilk iki senaryosu da client1'in planına (Pazartesi /
  //   Salı) yazıyor. Kök yapılandırma `fullyParallel: true` ve HER spec ayrıca
  //   İKİ projede (chromium + Mobile Chrome) eş zamanlı koşuyor -> bu test ile
  //   plans.spec.ts aynı anda aynı plana yazıyordu. Ölçülen kanıt (düzeltme
  //   öncesi tam paket koşusu): plans.spec "E2E Antrenman ..." beklerken
  //   BU dosyanın "1. E2E Gym ... - 2x5" satırını okudu.
  //
  //   ESKİ ÇÖZÜM `retries: 2` İDİ ve KALDIRILDI: yeniden deneme çakışmayı
  //   yalnızca GİZLER (ve gerçek bir regresyonu da gizleyebilir). Yerine
  //   mutasyona uğrayan kaynaklar `resource(...)` ile ilan edilir; kilit
  //   fixture'ı (tests/e2e/resource-lock.ts) aynı kaynağa dokunan testleri
  //   süreçler VE projeler arası sıraya sokar, çakışmayı ORTADAN KALDIRIR.

  test(
    'koç plan yayınlar, danışan set logu girer, koç logu görür',
    {
      annotation: [
        // Koç bu danışanın 7 günlük planını baştan yazar.
        resource('workout-plan:client1'),
        // `clearPendingApprovals` bekleyen onayları TÜKETİR (ve onaylandığında
        // onayın içeriği planın üzerine yazılır).
        resource('program-approvals:client1'),
        // Gym modu bu danışan için `workout_logs` satırları üretir.
        resource('workout-logs:client1'),
      ],
    },
    async ({ page, browser }) => {
      const day = todayName()
      // Ad ASCII: locator'lar Türkçe harf katlamasına takılmaz.
      const exerciseName = `E2E Gym ${randomSuffix()}`
      // Gym modu bu satırı 2 set x 5 tekrar olarak okur (`explode_plan_day`
      // deseni: "^\d+. <ad> - <set>x<tekrar>").
      const planLine = `1. ${exerciseName} - 2x5`

      const coachPage = page

      // --- 1) Koç: bekleyen onayları temizle, bugünün planını yayınla ----------
      await loginAsCoach(coachPage)
      await selectClient(coachPage, CLIENT1_FULL_NAME)
      await coachPage.getByRole('tab', { name: /Antrenman/ }).click()
      await clearPendingApprovals(coachPage)

      const coachField = workoutDayField(coachPage, day)
      await expect(coachField).toBeVisible()
      // Plan verisi gelmeden yazarsak taslak sıfırlaması yazdığımızı ezer.
      await expect(coachField).not.toHaveValue('')
      await coachField.fill(planLine)

      await coachPage
        .getByRole('button', { name: 'Antrenman Tablosunu Güncelle', exact: true })
        .click()
      await expect(coachPage.getByText(/Antrenman programı kaydedildi\./)).toBeVisible()

      // --- 2) Danışan: planı görür ve gym modunda setleri girer ---------------
      const clientContext = await browser.newContext()
      try {
        const clientPage = await clientContext.newPage()
        await login(clientPage, TEST_USERS.client)
        await clientPage.getByRole('tab', { name: /Antrenman/ }).click()

        await expect(workoutDayField(clientPage, day)).toHaveValue(planLine)

        const startButton = clientPage.getByRole('button', { name: 'BUGÜNÜ BAŞLAT', exact: true })
        await expect(startButton).toBeEnabled()
        await startButton.click()

        // Gym modu açıldı: hareket adı ve set sayacı görünür.
        await expect(
          clientPage.getByRole('heading', { name: exerciseName, exact: true })
        ).toBeVisible()

        const weightField = clientPage.getByLabel('KİLO (KG)', { exact: true })
        const repsField = clientPage.getByLabel('TEKRAR', { exact: true })

        // --- Set 1/2 ---
        await weightField.fill('40')
        await repsField.fill('5')
        await clientPage.getByRole('button', { name: 'Seti Tamamla', exact: true }).click()

        // DİNLENME HALKASI (ADR-0017): dolgu state'ten gelen bir `progressbar`tır.
        const restRing = clientPage.getByRole('progressbar', {
          name: 'Dinlenme döngüsü',
          exact: true,
        })
        await expect(restRing).toBeVisible()
        await clientPage.getByRole('button', { name: 'Süreyi Atla', exact: true }).click()

        // --- Set 2/2 (son set) ---
        await weightField.fill('42.5')
        await repsField.fill('5')
        await clientPage.getByRole('button', { name: 'Son Seti Tamamla', exact: true }).click()

        // KUTLAMA: halka kapanır (LoopRing, Kapanış yeşili) — emoji YOK.
        await expect(clientPage.getByText('DÖNGÜ KAPANDI', { exact: true })).toBeVisible()
        await expect(
          clientPage.getByRole('progressbar', { name: 'Antrenman döngüsü', exact: true })
        ).toBeVisible()

        await clientPage
          .getByRole('button', { name: 'Antrenmanı Kaydet ve Bitir', exact: true })
          .click()

        // useWorkoutLogs.ts -> useCreateWorkoutLogs onSuccess toast'ı.
        await expect(clientPage.getByText(/Antrenmanın başarıyla kaydedildi\./)).toBeVisible()

        // --- 3) Danışan kendi kayıt listesinde iki seti görmeli ---------------
        const clientLogEntries = panelOf(clientPage).getByText(exerciseName, { exact: true })
        await expect(clientLogEntries).toHaveCount(2)
        // Tüm setler girildiği için oturum `completed_at` damgası aldı.
        await expect(
          panelOf(clientPage).getByText('Tamamlandı', { exact: true }).first()
        ).toBeVisible()

        // --- 4) Koç aynı logu görmeli (AC-2.1'in kapanışı) --------------------
        // Reload gerekli: koç sayfası zaten açıkken workout_logs sorgusu
        // kendiliğinden tazelenmeyebilir; reload danışan seçimini de sıfırlar.
        await coachPage.reload()
        await selectClient(coachPage, CLIENT1_FULL_NAME)
        await coachPage.getByRole('tab', { name: /Antrenman/ }).click()

        await expect(panelOf(coachPage).getByText(exerciseName, { exact: true })).toHaveCount(2)
        await expect(
          panelOf(coachPage).getByText('Tamamlandı', { exact: true }).first()
        ).toBeVisible()
      } finally {
        await clientContext.close()
      }
    }
  )
})
