# 0016 — Fonksiyonel ikon olarak emoji'nin emekli edilmesi, `lucide-react`'e geçiş

- **Durum:** Kabul edildi (uygulama Faz 2'de, mekanik iş olarak)
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi

## Bağlam

Arayüzde ikon işlevini bugün emoji görüyor: sekme başlıkları, buton etiketleri, durum
göstergeleri ve boş-durum görselleri emoji ile çiziliyor. Ölçülen mevcut durum (`src/**`,
2026-08-17): yaklaşık **60 kullanım, 15 dosya**. Yoğunluk sırasıyla
`src/components/tabs/WorkoutTab.tsx`, `src/components/DashboardTabs.tsx`,
`src/components/CoachUserManagement.tsx` ve `src/app/page.tsx` üzerinde.

Emoji'nin fonksiyonel ikon olarak üç yapısal sorunu var:

1. **Hiçbir platformda aynı render edilmiyor.** Aynı kod noktası Windows, macOS, Android ve
   Chrome'un kendi setinde farklı çizim, farklı renk ve farklı optik ağırlıkla çıkar. Tasarım
   sistemi bunu kontrol edemez.
2. **Çizgi kalınlığı, hizalama ve renk kontrolü yok.** Emoji kendi rengini taşır; metin rengine
   (`currentColor`) uymaz, dolayısıyla `0015-gorsel-kimlik-sistemi.md` ile gelen token'lara
   bağlanamaz. Koyu temada zeminle çakışan emoji'ler ayrıca elle telafi gerektirir.
3. **Faz 4.5'te taşınamaz.** Expo (React Native) tarafında emoji render'ı cihaz setine bağlıdır
   ve web ile aynı görünmez.

## Karar

Emoji, **fonksiyonel ikon rolünden emekli edilir**; yerine `lucide-react` kullanılır.

Gerekçe sıralaması:

- Tree-shakeable — yalnızca kullanılan ikonlar pakete girer.
- Tek ve tutarlı çizgi kalınlığı; boyut ve `stroke-width` kontrol edilebilir.
- `currentColor` ile çalışır, yani doğrudan `0015`'in semantik renk token'larına bağlanır.
- **Belirleyici olan:** `lucide-react-native` **aynı ikon adlarıyla** Expo'ya birebir taşınır
  (bkz. `0009-monorepo-ve-mobil-ertelendi.md`). İkon seçimi bir kez yapılır, iki platformda
  geçerlidir.

**Tek istisna kuralı:** Kutlama anları emoji ile ifade edilmez. Kutlama, imza öğenin kendisiyle
gösterilir — halka kapanır ve Kapanış yeşiline döner (bkz. `0017-imza-oge-halka.md`).

**Zamanlama:** Bu dönüşüm Faz 1.6 kimlik oturumunun kapsamında **değildir**; Faz 2'nin ilk
mekanik işidir ve E2E locator güncellemeleriyle **aynı PR'da, toplu** yapılır (bkz.
`0018-kimlik-gecisi-iki-katman-ve-ci-ratchet.md`). Bu arada emoji sayısı CI ratchet'i ile
mevcut değerin üstüne çıkamaz.

## Sonuçlar

### Olumlu

- İkon dili tek bir kaynaktan gelir ve renk/boyut olarak token sistemine bağlıdır; koyu temada
  ayrı bir telafi gerekmez.
- Erişilebilir ad açık şekilde yazılır (`aria-label` / görünür metin), emoji'nin okuyucuya ne
  söylediğine dair belirsizlik ortadan kalkar — bugün ekran okuyucu, emoji'nin platform
  adını okuyor.
- Faz 4.5 mobil işinde ikon seti yeniden seçilmez.

### Olumsuz / kabul edilen bedeller

- **Yaklaşık 60 emoji'nin sökülmesi ucuz değildir.** Asıl maliyet dosya değişikliği değil,
  **test maliyetidir**: `tests/e2e/**` senaryoları birebir Türkçe metinlere bakıyor ve emoji,
  emoji taşıyan butonların erişilebilir adının **parçası**. Emoji sökümü bu locator'ları kırar.
  Bu yüzden kural: metin veya emoji değiştiren her PR, locator güncellemesini **kendi içinde**
  taşır.
- Aynı kırılma yüzeyi, hâlâ bekleyen ürün dili düzeltmesiyle ("Öğrenci Paneli" → koç/danışan
  terminolojisi, bkz. `0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md` ve
  `docs/PROGRESS.md` §5) çakışır. İki iş ayrı ayrı yapılırsa aynı locator'lar iki kez kırılır;
  mümkünse birlikte yapılmalıdır.
- Yeni bir çalışma zamanı bağımlılığı eklenir (`lucide-react`). Tree-shaking sayesinde paket
  etkisi küçüktür ama sıfır değildir ve bakım yüzeyi bir kütüphane artar.
- Emoji'nin verdiği "sıcaklık" kaybolur; arayüz daha nötr görünür. Bunu kasıtlı olarak kabul
  ediyoruz — sıcaklık artık tipografi ve imza öğe üzerinden kurulur.

### Etkilenen dosyalar

- `package.json` (`lucide-react` bağımlılığı)
- `src/components/tabs/**`, `src/components/DashboardTabs.tsx`,
  `src/components/CoachUserManagement.tsx`, `src/app/page.tsx` ve emoji taşıyan diğer 15 dosya
- `tests/e2e/**` (locator güncellemeleri, aynı PR'da)
- `active_planprogram.md` §3b (Faz 1.6 — kapsam dışı olduğu notuyla), §4 (Faz 2)
