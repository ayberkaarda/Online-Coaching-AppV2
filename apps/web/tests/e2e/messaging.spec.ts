// Mesajlaşma akışı: danışan <-> koç sohbeti (regresyon koruması).
//
// ARKA PLAN: `profiles_select` RLS politikası danışanın koçun profil satırını
// görmesine izin vermiyordu. Zincir: useCoachId() null döner -> MessagesTab'da
// chatPartnerId boş kalır -> danışan hiç sohbet edemez. Bu hata hiçbir testte
// yakalanmıyordu çünkü mesajlaşma akışı test edilmiyordu.
// `supabase/migrations/20260816100000_fix_rls_visibility.sql` bunu düzeltti.
// Bu dosyadaki testler politika tekrar daralırsa (veya chatPartnerId çözümü
// başka bir şekilde bozulursa) kırmızı vermelidir.

import { TEST_USERS, login } from './fixtures'
import { expect, resource, test } from './resource-lock'

// Date.now() yerine testin kendi ürettiği rastgele sayı: paralel/tekrarlanan
// koşularda mesaj metinleri çakışmasın.
const randomSuffix = (): number => Math.floor(Math.random() * 1_000_000_000)

test.describe('Mesajlaşma Akışı', () => {
  test(
    'danışan koça mesaj gönderebiliyor ve koç realtime yanıt verebiliyor',
    // İZOLASYON: client1 <-> koç sohbet dizisine YAZAR. Mesajlar benzersiz metin
    // taşıdığı için içerik çakışması olmaz; kilidin asıl görevi AC-2.2 SÜRE
    // ÖLÇÜMÜNÜ korumak: kilit olmadan aynı test chromium + Mobile Chrome'da eş
    // zamanlı koşuyor, aynı realtime kanalını ve aynı sekme çiftini yükleyip
    // ölçümü kendi ikizinin gürültüsüyle bozuyordu. İDDİA (< 2 sn) AYNEN DURUYOR.
    { annotation: resource('messages:client1') },
    async ({ page, browser }) => {
      // --- 1) Danışan olarak giriş yap ve "Sohbet" sekmesine geç ---
      await login(page, TEST_USERS.client)
      await page.getByRole('tab', { name: /sohbet/i }).click()

      // "Gönder" butonu sayfada tek başına değil: sayfa genelinde başka formlarda
      // (ör. koç tarafında bildirim formu) da aynı metinli buton olabilir, bu yüzden
      // aktif sekme panelinin içine kapsanır (strict-mode ihlalini önler).
      const tabPanel = page.getByRole('tabpanel')
      const messageInput = tabPanel.getByLabel('Mesajınız')
      const sendButton = tabPanel.getByRole('button', { name: 'Gönder' })

      // Sohbet arayüzü gerçekten kullanılabilir olmalı: giriş alanı ve gönder
      // butonu görünür olmalı, "kişi bulunamadı" hatası (eski bug'ın belirtisi)
      // görünmemeli.
      await expect(messageInput).toBeVisible()
      await expect(sendButton).toBeVisible()
      await expect(page.getByText('Sohbet edilecek kişi bulunamadı.')).not.toBeVisible()

      const clientMessage = `E2E mesaj ${randomSuffix()}`
      await messageInput.fill(clientMessage)
      // Metin girildikten sonra gönder butonu etkin (disabled değil) olmalı.
      await expect(sendButton).toBeEnabled()
      await sendButton.click()

      // Gönderim sonrası hata toast'ı görünmemeli (eski bug'da RLS nedeniyle
      // chatPartnerId boş kalıp bu hatayı üretiyordu).
      await expect(page.getByText('Sohbet edilecek kişi bulunamadı.')).not.toBeVisible()

      const clientChatLog = page.getByRole('log', { name: 'Mesajlar' })
      const clientOwnMessage = clientChatLog.locator('li').filter({ hasText: clientMessage })
      await expect(clientOwnMessage).toBeVisible()
      // MessagesTab.tsx: kendi mesajların li'si sr-only "Sen: " önekiyle işaretlenir
      // ve `justify-end` ile sağa hizalanır.
      await expect(clientOwnMessage).toContainText('Sen:')

      // --- 2) Koç ikinci bir tarayıcı bağlamında giriş yapıp danışanı seçsin ---
      const coachContext = await browser.newContext()
      try {
        const coachPage = await coachContext.newPage()
        await login(coachPage, TEST_USERS.coach)

        // supabase/seed.sql: client1@example.com -> "Ahmet Yılmaz". Arama ile
        // filtreleyip seç; ".last()" kullanılır çünkü current_streak === 0 olan
        // danışanlar ayrıca "Acil İlgilenilmesi Gerekenler" hızlı erişim
        // panelinde de aynı aria-label ile tekrar görünebilir (DashboardTabs.tsx)
        // — asıl "Danışan Yönetimi" listesindeki buton DOM'da her zaman sonda yer alır.
        //
        // TÜRKÇE İ/ı TUZAĞI: "Danışan Ara" noktasız ı içeriyor; etiket metni
        // kaynaktan (DashboardTabs.tsx sr-only label) birebir kopyalandı,
        // `/i` bayraklı regex kullanılmadı.
        await coachPage.getByLabel('Danışan Ara').fill('Ahmet')
        await coachPage.getByRole('button', { name: 'Ahmet Yılmaz seç' }).last().click()

        await coachPage.getByRole('tab', { name: /sohbet/i }).click()

        // Koç tarafında da "Gönder" sayfada tek olmayabilir (ör. bildirim formu),
        // bu yüzden aktif sekme paneliyle kapsanır.
        const coachTabPanel = coachPage.getByRole('tabpanel')

        const coachChatLog = coachPage.getByRole('log', { name: 'Mesajlar' })
        const coachSeesClientMessage = coachChatLog.locator('li').filter({ hasText: clientMessage })
        await expect(coachSeesClientMessage).toBeVisible()
        // Koç tarafında bu danışanın mesajı "Karşı taraf: " öneki ile işaretlenir.
        await expect(coachSeesClientMessage).toContainText('Karşı taraf:')

        // --- 3) Koç yanıtlasın ---
        const coachReply = `E2E yanit ${randomSuffix()}`
        const coachInput = coachTabPanel.getByLabel('Mesajınız')
        const coachSendButton = coachTabPanel.getByRole('button', { name: 'Gönder' })
        await expect(coachInput).toBeVisible()
        await expect(coachSendButton).toBeVisible()

        await coachInput.fill(coachReply)
        await expect(coachSendButton).toBeEnabled()
        // AC-2.2: "İki tarayıcı sekmesi arasında mesaj < 2 sn'de realtime düşer."
        // Zamanlayıcı GÖNDER'e tıklanan anda başlar (Faz 2b ölçümü: INSERT 78-934
        // ms, bkz. supabase/README.md §4h "Realtime") — aşağıdaki `toBeVisible()`
        // otomatik polling ile koşulun sağlandığı ANDA döner, sabit bir bekleme
        // (`waitForTimeout`) DEĞİLDİR; ölçülen süre gerçek realtime gecikmesidir.
        const sendClickedAt = Date.now()
        await coachSendButton.click()

        const coachOwnReply = coachChatLog.locator('li').filter({ hasText: coachReply })
        await expect(coachOwnReply).toBeVisible()
        await expect(coachOwnReply).toContainText('Sen:')

        // --- 4) Danışanın sayfasında (ilk bağlam) yanıt realtime belirmeli ---
        // expect(...).toBeVisible() otomatik olarak bekler (polling); waitForTimeout kullanılmaz.
        const clientSeesReply = clientChatLog.locator('li').filter({ hasText: coachReply })
        await expect(clientSeesReply).toBeVisible()
        const deliveredAfterMs = Date.now() - sendClickedAt
        await expect(clientSeesReply).toContainText('Karşı taraf:')

        // AC-2.2'nin kendisi: koçun GÖNDER'e tıklamasından danışanın (ayrı tarayıcı
        // bağlamı, ayrı sekme) yanıtı GÖRMESİNE kadar geçen süre 2 sn'nin altında
        // olmalı. Bu ölçüm ağ/DB gidiş-dönüşünü VE React render'ını kapsar —
        // supabase/README.md §4h'deki 78-934 ms sunucu-taraflı ölçümden daha geniş
        // (ve daha gerçekçi) bir üst sınırdır.
        // eslint-disable-next-line no-console -- AC-2.2 ölçümü CI/yerel çıktıda görünür kalsın diye kasıtlı.
        console.log(`[AC-2.2] koç -> danışan realtime teslim: ${deliveredAfterMs} ms`)
        expect(deliveredAfterMs).toBeLessThan(2000)
      } finally {
        await coachContext.close()
      }
    }
  )

  test('koç danışan seçmeden sohbet arayüzünü kullanamıyor', async ({ page }) => {
    await login(page, TEST_USERS.coach)
    await page.getByRole('tab', { name: /sohbet/i }).click()

    // NOT (kaynağa uydurmak zorunda kalınan beklenti): MessagesTab.tsx kendi
    // içinde `userRole === 'coach' && selectedClientIds.length !== 1` durumunda
    // "Sohbet etmek için sadece 1 danışan seçili bırakın." metnini basıyor
    // (bkz. src/components/tabs/MessagesTab.tsx, satır ~63-69). Ancak HİÇ
    // danışan seçilmediğinde (length === 0) DashboardTabs.tsx bu bileşeni hiç
    // render etmeden kendi geçiş ekranını gösteriyor (satır ~400-406) ve
    // MessagesTab'a hiç ulaşılmıyor. Yani "sadece 1 danışan seçili bırakın"
    // metni sadece 2+ danışan seçiliyken görünür; 0 danışan seçiliyken
    // gerçekte görünen metin DashboardTabs kaynaklıdır. Bu test gerçek DOM
    // davranışını doğrular.
    await expect(
      page.getByText('Lütfen yukarıdaki panelden en az bir danışan seçin.')
    ).toBeVisible()

    // Sohbet arayüzü (mesaj giriş alanı) hiç render edilmemiş olmalı.
    await expect(page.getByLabel('Mesajınız')).toHaveCount(0)
  })
})
