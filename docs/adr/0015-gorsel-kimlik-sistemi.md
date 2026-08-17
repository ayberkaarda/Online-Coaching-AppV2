# 0015 — Görsel kimlik sistemi: "Demir & Tebeşir" paleti, tema, token mimarisi ve tipografi

- **Durum:** Kabul edildi (uygulama Faz 1.6'da)
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi
- **Revizyonlar:** 2026-08-17 — Kehribar `#B45D00` → `#A65600`; Faz 1.6 uygulamasında
  yapılan kontrast ölçümü ilk değerin AA eşiğini geçmediğini gösterdi (bkz. "Palet").

## Bağlam

Kod tabanının görsel dili bugüne kadar hiç karara bağlanmadı; varsayılanların ve tek tek
ekran kararlarının toplamı olarak oluştu. Ölçülen mevcut durum (`src/**`, 2026-08-17):

- `font-black` (ağırlık 900) **49** kullanım — hiyerarşi neredeyse tamamen ağırlıkla
  kuruluyor, boyutla değil.
- `rounded-3xl` (24px) **17** kullanım.
- `bg-gradient-to-*` **14** kullanım.
- `animate-pulse` **8** kullanım.
- Marka moru `#8b5cf6` **3 dosyada 8 yerde** ham hex olarak gömülü: `src/app/globals.css`
  (4 — scrollbar hover, `.custom-scrollbar` iki yerde, `:focus-visible` outline),
  `src/components/CoachUserManagement.tsx` (3), `src/components/tabs/StatsTab.tsx` (1).
  Tailwind tarafında yalnızca `brand-purple` / `brand-purpleHover` iki renk tanımlı
  (`tailwind.config.ts`).
- Fonksiyonel ikon olarak emoji: yaklaşık 60 kullanım, 15 dosya (bkz.
  `0016-emoji-yerine-lucide-ikon-seti.md`).
- Yazı tipi ailesi hiç tanımlanmamış: `layout.tsx` `font-sans` diyor, `next/font` kullanımı
  yok — tarayıcı/işletim sistemi varsayılanı ne veriyorsa o render ediliyor.

İki somut sorun bunun üstüne biniyor:

1. `#8b5cf6` birebir Tailwind `violet-500`'dür — yani bir marka **seçimi** değil, bir
   varsayılandır; ve beyaz üstünde yaklaşık **4.2:1** ile WCAG AA'nın 4.5:1 eşiğini
   geçmez. Aynı renk hem odak halkası (`:focus-visible`) hem birincil buton zeminidir.
2. Kimliği taşıyan değerler koda dağılmış durumda; Faz 4.5'te Expo (React Native) geldiğinde
   (bkz. `0009-monorepo-ve-mobil-ertelendi.md`) Tailwind sınıfları taşınamaz — taşınabilir
   olan tek şey renk/ölçü değerlerinin kendisidir, ve şu an böyle bir kaynak yok.

## Karar

### Palet — "Demir & Tebeşir"

Sistem **altı adlandırılmış hex** üzerine kurulur; ara tonlar (yüzey kademeleri, kenarlık,
ikincil metin) bunlardan türetilen token'lardır, yeni serbest renk eklenmez.

| Ad              | Hex                                      | Rol                               |
| --------------- | ---------------------------------------- | --------------------------------- |
| Tebeşir         | `#F4F4F1`                                | açık tema zemini                  |
| Demir           | `#14161B`                                | koyu tema zemini                  |
| Menevis         | `#5B48D9` (koyu temada durağı `#A79BFF`) | birincil / aksiyon / odak halkası |
| Kapanış         | `#0F7A4C`                                | başarı                            |
| Kehribar        | `#A65600`                                | uyarı / bekleyen                  |
| Plaka Kırmızısı | `#C22F2F`                                | hata                              |

Mor **atılmıyor, kaydırılıyor**: `#5B48D9` Tebeşir üstünde **5.65:1**, koyu temada
`#A79BFF` Demir üstünde **7.56:1** verir. Aynı ton ailesinde kalındığı için marka
sürekliliği korunur, ama kontrast borcu kapanır. 14 gradyanın tamamı sistemden çıkar.

Aynı kural Kehribar'a da uygulandı: ilk seçilen `#B45D00` Tebeşir üstünde yalnızca
**4.23:1** (kart zemininde 4.46:1) verdiği için AA'nın 4.5:1 eşiğini geçmiyordu — yani
morun kaydırılmasına yol açan hata modunun aynısını taşıyordu. Uyarı rengi kod tabanında
ezici çoğunlukla küçük punto **metin** olarak kullanıldığı için 3:1'lik UI bileşeni eşiğine
sığınmak geçerli değildir. Ton 31° ve tam doygunluk korunarak yalnızca parlaklık düşürüldü:
`#B45D00` → **`#A65600`** (Tebeşir üstünde 4.82:1, kart zemininde 5.08:1, beyaz üstünde
5.31:1) — böylece Kapanış'ın 4.88'i ve Plaka Kırmızısı'nın 5.09'uyla aynı emniyet bandına
oturur. Sistem hâlâ **altı adlandırılmış hex** üzerine kuruludur; biri kontrast ölçümü
sonucu revize edilmiştir (2026-08-17).

### Tema

- Açık ve koyu tema **ikisi de birinci sınıftır**; `next-themes` system/light/dark üçlüsü ve
  `ThemeToggle` aynen korunur (`src/app/providers.tsx`).
- **Kanonik referans açık temadır.** Gerekçe: koç masabaşında, gündüz, veri-yoğun bir ekranda
  çalışıyor. Tasarım kararları önce açık temada doğrulanır.
- Koyu zemin `#0f0f12` → `#14161B` olarak değişir. Mevcut değerin mor kastı yeni birincil
  renkle çatışıyor ve saf siyaha fazla yakın olduğu için yüzey kademeleri birbirini eziyor.
  Bu değişiklikle birlikte `src/app/layout.tsx` içindeki `viewport.themeColor` çifti ve
  `src/app/globals.css` içindeki `.dark .glass-panel` rgba değeri **aynı işte** güncellenir.
- **Canlı gym modu tema-bağımsızdır: her zaman Demir zemin.** Gerekçe kontrast değil
  **tutarlılık**tır — setler arası beyaz parlama olmaz, ekran her antrenmanda aynı görünür ve
  imza öğe (bkz. `0017-imza-oge-halka.md`) en güçlü sahnesini koyu zeminde oynar.
  Okunabilirliği polarite değil **boyut** belirler: rakamlar `clamp(64px, 18vw, 96px)`,
  beyaz-Demir kontrastı yaklaşık 17:1.

### Token mimarisi

- İsimlendirme **semantiktir**, renk adı taşımaz: `bg`, `surface`, `surface-raised`,
  `border`, `text-primary`, `text-secondary`, `accent`, `accent-contrast`, `success`,
  `warning`, `danger`, `focus-ring`.
- Tek kaynak: **`src/design/tokens.ts`** — düz bir TypeScript objesi, light ve dark için iki
  değer seti. Web'e özgü hiçbir şey (px'li `box-shadow` string'leri, CSS fonksiyonları,
  Tailwind sınıf adları) bu dosyaya sızmaz.
- `tailwind.config.ts` bu dosyayı import eder ve CSS değişkenlerine bağlar. Gömülü 8 ham hex
  bu token'lardan beslenir.
- **Faz 4.5'te Expo aynı dosyayı import eder.** Taşınabilir olan Tailwind sınıfları değil, bu
  dosyadır.

### Tipografi

Üç rol, hepsi `next/font` üzerinden, hepsi **latin-ext** alt kümesiyle (Türkçe `ı İ ş ğ ç ö ü`
tam kapsanır):

- **Display — Archivo** (variable, genişletilmiş kesim, ağırlık 600–700): yalnızca sayfa/sekme
  başlıkları, gym modu rakamları, büyük sayılar. Paragraf metninde asla.
- **Body — Hanken Grotesk** (400/500/600). Inter bilinçli olarak seçilmedi: her ürünün
  varsayılanı olduğu için kimlik taşımıyor.
- **Veri — IBM Plex Mono** (500): sayaç, kg/tekrar, gramaj, grafik eksenleri. **Tabular
  figürler şarttır** — sayaç her saniye genişlik değiştirirse titrer, kg kolonları hizalanmaz.

Ölçek: **12 / 14 / 16 / 18 / 22 / 28 / 36**; gym modu rakamları `clamp(64px, 18vw, 96px)`.
Yarıçap ölçeği **8 / 12 / 16** — `rounded-3xl` (24px) sistemden çıkar.

**Ağırlık tavanı 700'dür; 900 sistemde hiç tanımlanmaz** ki geri dönüş yolu kapansın. Mevcut
49 `font-black`'in yerine hiyerarşi **boyut + genişlik** ile kurulur.

## Sonuçlar

### Olumlu

- Odak halkası ve birincil aksiyon rengi WCAG AA'yı geçer; `globals.css`'in sonundaki kontrast
  notu (`text-gray-400`/`text-gray-500` borcu) semantik `text-secondary` token'ıyla yapısal
  olarak kapanır — tek tek sınıf avlamak gerekmez.
- Koyu temada yanlış renk kullanma ihtimali **yapısal olarak** engellenir: `accent` token'ı iki
  değer setinde farklıdır, bileşen hangi temada olduğunu bilmek zorunda değildir.
- Faz 4.5'te mobil, renk ve ölçü kararlarını sıfırdan almaz; `tokens.ts` olduğu gibi taşınır
  (bkz. `0009-monorepo-ve-mobil-ertelendi.md`).
- Kimlik bir "tema dosyası" değil, **gözden geçirilebilir bir karar** hâline gelir: yeni bir
  renk eklemek artık bu ADR'yi güncellemeyi gerektirir.

### Olumsuz / kabul edilen bedeller

- **Marka rengi kayıyor.** `#8b5cf6` → `#5B48D9` gözle görülür bir farktır; uygulamayı daha
  önce görmüş biri "renk değişmiş" der. Bunu kontrast borcunu kapatmak için kabul ediyoruz.
- Koyu zemin `#0f0f12` → `#14161B` değişimi ekran görüntüsü içeren her dokümanı ve varsa
  pazarlama materyalini eskitir.
- Üç yazı tipi ailesi ilk yüklemeye ağırlık ekler; `next/font` self-hosting ve `display: swap`
  ile sınırlanır ama sıfır değildir. Üç aile, iki aileye göre bilinçli bir lükstür — gerekçesi
  veri fontunun (tabular) gövde fontundan ayrılmak zorunda olmasıdır.
- 49 `font-black` ve 17 `rounded-3xl`'in dönüşümü bu işte **yapılmaz**; ekranlar bir süre eski
  ve yeni dili karışık taşır (bkz. `0018-kimlik-gecisi-iki-katman-ve-ci-ratchet.md`).
- `html2canvas` ile üretilen PNG dışa aktarımının CSS değişkenleriyle doğru render ettiği ayrıca
  doğrulanmalıdır; Chart.js'in `#888` eksen rengi token'dan beslenmediği sürece kimliğin dışında
  kalır.

### Etkilenen dosyalar

- `src/design/tokens.ts` (yeni)
- `tailwind.config.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/CoachUserManagement.tsx`
- `src/components/tabs/StatsTab.tsx`
- `active_planprogram.md` §3b (Faz 1.6)
