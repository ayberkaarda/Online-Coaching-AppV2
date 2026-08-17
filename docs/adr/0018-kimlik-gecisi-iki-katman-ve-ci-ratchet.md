# 0018 — Görsel kimlik geçişinin iki katmana bölünmesi ve CI ratchet'i

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

`0015-gorsel-kimlik-sistemi.md`, `0016-emoji-yerine-lucide-ikon-seti.md` ve
`0017-imza-oge-halka.md` yeni bir görsel dil tanımlıyor. Mevcut kod tabanı eski dili
ölçülebilir bir hacimde taşıyor: **49** `font-black`, **17** `rounded-3xl`, **14**
`bg-gradient-to-*`, **8** ham `#8b5cf6`, yaklaşık **60** emoji.

İki uçtan da kaçınmak gerekiyor:

- **Büyük patlama:** tüm ekranları tek bir "restyle" PR'ında dönüştürmek. Bu PR gözden
  geçirilemez, Faz 1.5 (güvenlik) ve Faz 1b ile aynı dosyalarda çakışır ve E2E paketini toptan
  kırar.
- **Kontrolsüz sızma:** kimliği tanımlayıp uygulamayı "zamanla" bırakmak. Eski dil yeni
  ekranlara sızmaya devam eder, iki dil kalıcı olarak yan yana yaşar ve kimlik hiçbir zaman
  gerçekleşmez.

## Karar

Geçiş **iki katmana** bölünür ve aradaki mesafe bir **CI ratchet**'i ile korunur.

### Katman A — kimlik oturumu (Faz 1.6, tek oturum, tek PR)

Yalnızca sistemin kendisi kurulur:

- `src/design/tokens.ts` (light/dark iki değer seti)
- `tailwind.config.ts` bağlaması (token → CSS değişkeni)
- `next/font` ile üç yazı tipi (Archivo / Hanken Grotesk / IBM Plex Mono, `latin-ext`)
- Gömülü 8 ham `#8b5cf6`'nın token'a çekilmesi
- `src/app/layout.tsx` `viewport.themeColor` çifti ve gövde zemini
- `globals.css` odak halkası (`:focus-visible`) ve seçim (`selection`) renginin token'a
  bağlanması

**Ekran restilizasyonu bu katmanın kapsamı DEĞİLDİR.**

### CI ratchet — tek yönlü mandal

Basit bir grep script'i (`scripts/` altında) aşağıdaki sayaçları ölçer ve **mevcut değerlerin
üstüne çıkılmasını CI'da hata sayar**:

| Sayaç               | Kilitlenen tavan                            |
| ------------------- | ------------------------------------------- |
| `font-black`        | 49                                          |
| `bg-gradient-to-`   | 14                                          |
| `rounded-3xl`       | 17                                          |
| ham `#8b5cf6`       | 8 → hedef 0                                 |
| JSX emoji kullanımı | ~60 (baseline script tarafından sabitlenir) |

Tavan **asla yükselmez**; her PR onu düşürebilir ve düşürdüğünde yeni değer baseline olur.
Ham `#8b5cf6` sayacı Katman A sonrasında **0'a** çekilir ve orada kilitlenir.

### Katman B — ekran yeniden yazımı (Faz 2)

49 `font-black`, 17 `rounded-3xl` ve 14 gradyan, Faz 2'de ekranlar zaten yeniden yazılırken
**doğal olarak** dönüşür. **Ayrı bir "restyle PR"ı yoktur.**

- Emoji → Lucide değişimi Faz 2'nin **ilk mekanik işidir** ve E2E locator güncellemeleriyle
  aynı PR'da, toplu yapılır (bkz. `0016`).
- `LoopRing` bileşeni önceden değil, **ilk göründüğü ekranla birlikte** (gym modu dinlenme
  sayacı) yazılır (bkz. `0017`).

### Faz 4.5

`src/design/tokens.ts` aynen import edilir; `@expo-google-fonts/archivo` vb. paketler ve
`lucide-react-native` kullanılır (bkz. `0009-monorepo-ve-mobil-ertelendi.md`).

## Sonuçlar

### Olumlu

- Kimlik **bir oturumda** gerçek olur (token + font + odak halkası), ama diff gözden
  geçirilebilir kalır; Faz 1.5 ve Faz 1b ile dosya çakışması olmaz.
- Ratchet, "yeni kod eski dili getiremez" kuralını **makineye** devreder; kod incelemesinde
  hatırlamaya bağlı kalmaz.
- Restilizasyonun maliyeti ayrı bir iş kalemi olarak ödenmez — Faz 2 zaten o ekranlara
  dokunuyor.
- Emoji sökümünün E2E maliyeti tek bir PR'da, bilinçli olarak ödenir; damla damla kırılan
  testler oluşmaz.

### Olumsuz / kabul edilen bedeller

- **Uygulama bir süre iki dil taşır.** Faz 1.6 ile Faz 2 arasında yeni renkler ve yeni fontlar
  eski `font-black` başlıklar ve gradyanlarla yan yana görünür. Bu, tutarsız görünen bir ara
  dönem demektir ve kabul ediliyor.
- Ratchet grep tabanlıdır; yorum satırındaki veya string içindeki eşleşmeleri de sayabilir ve
  yanlış pozitif üretebilir. Basitliği (ek bağımlılık yok) bu riske tercih edildi.
- Emoji sayacının baseline'ı script'in emoji regex'ine bağlıdır; farklı bir aralık tanımı
  farklı bir sayı verir. Bu yüzden sayı ADR'de mutlak olarak değil, **script'in kendi
  ölçümüyle** sabitlenir.
- Katman B'nin ne zaman biteceği takvimlenmiyor; ratchet yalnızca kötüleşmeyi engeller,
  iyileşmeyi **zorlamaz**. Sayaçlar Faz 2 çıkışında hâlâ sıfırlanmamış olabilir.

### Etkilenen dosyalar

- `scripts/` (ratchet script'i — yeni)
- `.github/workflows/ci.yml` (ratchet adımı)
- `active_planprogram.md` §3b (Faz 1.6), §4 (Faz 2)
