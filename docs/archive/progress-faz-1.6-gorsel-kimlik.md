# Arşiv — Faz 1.6: Görsel Kimlik Oturumu, Katman A (2026-08-17)

**Özet.** "Demir & Tebeşir" kimliği koda indi: `src/design/tokens.ts` (light/dark, 12 semantik
anahtar) + `tailwind.config.ts` bağlaması (RGB kanal + `<alpha-value>` kalıbı), 140
`brand-purple` kullanımı `accent`'e çevrildi, `next/font` ile üç yazı tipi self-host edildi,
gömülü ham hex'ler (grep'in kaçırdığı iki ondalık kullanım dahil) token'a çekildi, ADR-0015'in
Kehribar'ı AA için revize edildi ve `scripts/identity-ratchet.mjs` CI'a eklendi (6 sayaç).
Ekran restilizasyonu (Katman B) bilinçli olarak kapsam dışıydı.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 61–67, 641–758, 1471–1491 —
> 2026-08-17'de taşındı. Kaynak kararlar: ADR-0015…ADR-0018 (`docs/adr/`).

---

### Faz 1.6 — Görsel Kimlik Oturumu, Katman A (2026-08-17)

Kaynak kararlar ADR-0015/0016/0017/0018, plan `active_planprogram.md` §3b. İki commit
halinde atıldı (`599974c` token sistemi, `167f65e` ratchet).

**Token kaynağı:**

- Yeni `src/design/tokens.ts` — düz TS objesi, light + dark iki set, 12 semantik anahtar
  (`bg`, `surface`, `surfaceRaised`, `border`, `textPrimary`, `textSecondary`, `accent`,
  `accentContrast`, `success`, `warning`, `danger`, `focusRing`), tüm değerler düz
  `#RRGGBB`. Web'e özgü hiçbir değer yok — Faz 4.5'te Expo bu dosyayı aynen import edecek.
- `tailwind.config.ts` token'ları CSS değişkenlerine bağlıyor; `brand-purple` ve
  `brand-purpleHover` silindi (AC-1.6.2). CSS değişkenleri `tailwindcss/plugin`'in
  `addBase`'i ile tokens.ts'ten TEK KAYNAKTAN üretiliyor (globals.css'e elle yazılsaydı
  kaçınılmaz olarak kayardı).

**Kritik teknik karar — opaklık değiştiricileri:** CSS değişkenleri ham RGB kanalı tutuyor
(`--color-accent: 91 72 217`, `rgb()` sarmalayıcısı yok) ve config `rgb(var(--color-accent)
/ <alpha-value>)` kalıbını kullanıyor. Düz hex yazılsaydı koddaki 32 opaklık değiştiricili
kullanım (`bg-accent/10`, `border-accent/20` …) sessizce bozulurdu — hata vermez, sadece
renk üretmezdi. Üretilen CSS'te `rgb(var(--color-accent)/.3)` doğrulandı.

**Mekanik yeniden adlandırma:** 18 dosyada 140 `brand-purple` kullanımı `accent`'e çevrildi,
opaklık değiştiricileri korunarak. Token commit'iyle aynı commit'te birleştirildi — ayrı
atılsalardı aradaki commit'te 140 sınıf hiçbir CSS üretmez, uygulama görsel olarak kırık
olurdu. Sıra tuzağı: `brand-purpleHover` önce ele alındı, yoksa `brand-purple` dönüşümü onun
önekiyle eşleşip bozuk sınıf bırakırdı; tek kullanımı `hover:bg-accent/90` oldu.

**Ham renk temizliği — grep'in yakalamadığı iki kaçak:** `globals.css`'te 4 adet
`#8b5cf6`, `CoachUserManagement.tsx`'te 3 (Recharts), `StatsTab.tsx`'te 1 (Chart.js) token'a
çekildi. Ancak iki yerde eski marka moru ondalık biçimde saklanmış hâlde bulundu ve
`8b5cf6` grep'i bunları görmüyordu: `StatsTab.tsx` `rgba(139, 92, 246, 0.2)` ve
`DashboardTabs.tsx` `shadow-[0_0_8px_rgba(139,92,246,0.8)]`. 139,92,246 ondalık olarak tam
olarak `#8b5cf6`'dır; ikisi de elle bulundu. Bu keşif üzerine ratchet'a kalıcı bir ondalık
sayaç eklendi. Grafik renkleri bilerek statik bırakıldı (tema duyarlılık Faz 4, AC-4.3).

**Tipografi (AC-1.6.6):** `next/font` ile Archivo (600/700), Hanken Grotesk (400/500/600),
IBM Plex Mono (500); hepsi `latin`+`latin-ext`, `display: swap`, self-host (12 woff2).
`weight: 'variable'` kullanılmadı — değişken kesim 100–900'ün tamamını açar ve "900 sistemde
hiç tanımlanmaz" kuralını delerdi. Kabul edilen bedel: Archivo'nun `wdth` genişlik ekseni
kullanılamıyor, ADR-0015'in "hiyerarşi boyut + genişlik ile kurulur" cümlesindeki genişlik
Katman B'de yalnızca boyutla telafi edilecek. Tabular figürler `.font-mono`'da varsayılan
yapıldı (opt-in unutulabilir, ADR "şarttır" diyor).

**Görünür yan etki (borç olarak kaydedildi):** yazı tipleri 700'de tavanlandığı için mevcut
49 `font-black` (900) artık gerçek 900 kesimi bulamıyor; tarayıcı sentetik kalın üretiyor.
ADR-0015 bunu bilerek istiyor; kullanımlar Faz 2 Katman B'de sökülecek.

**Zeminler (AC-1.6.8):** `viewport.themeColor` çifti `#F4F4F1` / `#14161B`; koyu zemin
`#0f0f12` → `#14161B`, `.dark .glass-panel` ile senkron.
**Odak/seçim (AC-1.6.3):** `:focus-visible` ve `selection` token'dan besleniyor.

**ADR-0015 revizyonu — Kehribar `#B45D00` → `#A65600`:** Kontrastlar hesaplandığında altı
adlandırılmış hex'ten biri AA'yı geçmiyordu: Kehribar, Tebeşir üstünde **4.23:1** (eşik
4.5). Yalnız zeminde değil, `surface` kademesinde de kalıyordu (4.46). Karar kullanıcı
tarafından **Fable'a** danışılarak verildi. Dayanağı kod tabanındaki gerçek kullanım: uyarı
rengi bu projede rozet/ikon değil, ezici çoğunlukla METİN olarak kullanılıyor
(`WorkoutTab.tsx:519,529`, `DashboardTabs.tsx:141,148`, `NutritionTab.tsx:343`) ve çoğu
`text-xs`/`text-sm` — yani 3:1 UI eşiğine sığınmak geçersiz. Ayrıca ADR-0015'in kurucu
gerekçesi zaten "eski mor beyaz üstünde ~4.2:1 verdiği için kaydırıldı"; Kehribar'ı 4.23'te
bırakmak aynı hata modunu kalıcılaştırırdı.
`#A65600` sonuçları (iki ajan bağımsız hesapladı, birebir tuttu): bg **4.82** · surface
**5.08** · surfaceRaised **5.31**. Ton 31° ve tam doygunluk korundu, yalnız parlaklık %35.3
→ %32.5 düştü. `dark.warning` (`#F78000`) değişmedi. Reddedilen `#A85700` yalnızca 4.73 ile
sınırda kalıyordu; `#A65600` Kapanış'ın 4.88'i ve Plaka Kırmızısı'nın 5.09'uyla aynı emniyet
bandına oturuyor.
Ayrıca ADR'deki tahmini Menevis oranları ("yaklaşık 6:1 / 6.5:1") ölçülen gerçek değerlerle
(**5.65** / **7.56**) değiştirildi.

**Kontrast testi neden axe değil:** axe-core'un `color-contrast` kuralı jsdom'da çalışmıyor
(gerçek layout/boyama gerektirir, otomatik devre dışı kalır). Token seviyesinde hesaplanan
kontrast hem daha güvenilir hem de kaynağın kendisini test ediyor. AC-1.6.5 bu şekilde
karşılandı.

**CI ratchet (AC-1.6.4):** `scripts/identity-ratchet.mjs` — bağımlılıksız Node ESM,
`src/**/*.{ts,tsx,css}` tarar, baseline'lar koda gömülü (değişiklik code review'da görünsün
diye). Kilitlenen tavanlar: `font-black` 49 · `bg-gradient-to-` 14 · `rounded-3xl` 17 ·
`8b5cf6` 0 · `eski-marka-moru-ondalik` 0 · `emoji` 60.
Emoji sayımı `Intl.Segmenter` ile grafem kümesine bölünüp `\p{Extended_Pictographic}` ile
test ediliyor — naif aralık regex'i ZWJ birleşik emojileri (👨‍👩‍👧) birden çok sayar ve BMP
sembollerini (☀ ⚠) kaçırır. Ölçüm 60 emoji / 15 dosya, ADR'nin "~60, 15 dosya" tahminiyle
birebir. Kod yorumlarındaki emojiyi hariç tutmak için küçük bir sözcük çözümleyici kullanıldı
— tam TS/TSX ayrıştırıcı değil, ADR-0018'in grep tabanlı yaklaşım için kabul ettiği takas.
`allowJs: false` (ADR-0001) altında TypeScript `.mjs` kaynağından JSDoc okumadığı için elle
yazılmış `scripts/identity-ratchet.d.mts` bildirim dosyası gerekti; `tsconfig.json`'a
dokunulmadı. CI'da `frontend` job'una adım olarak eklendi.

**Kırmızı-yeşil kanıtları:** fazladan bir `font-black` eklenince ratchet `50 / tavan 49` ile
kırıldı ve suçlu dosyayı listeledi (çıkış kodu 1), geri alınınca yeşile döndü. Ondalık sayaç
için aynı kanıt üretim fonksiyonları sentetik girdiyle çalıştırılarak alındı — script yalnızca
`src/**` tarıyor ve o dizin ratchet ajanının kapsamı dışındaydı; ajan kapsamı ihlal etmek
yerine bu uyarlamayı açıkça bildirdi.

**Doğrulama (§1 tablosuna işlendi):** `npm run type-check` temiz · `npm run lint` 0 hata/12
bilinen uyarı · `npm run test` **363/363** (31 dosya, faz başında 308) · `npm run build`
başarılı, fontlar self-host edildi · `npm run test:e2e` **42/42** (21 senaryo × 2 profil) —
ekran metnine dokunulmadığı için tek locator kırılmadı (AC-1.6.9) · `npm run ratchet` 6/6
sayaç yeşil · `npm run format:check` temiz · AC-1.6.2 grep'leri: `brand-purple` 0 ·
`8b5cf6` 0 · ondalık mor 0. Veritabanı ve backend bu fazda değişmedi; `db reset`/
`test:rls`/`pytest` koşulmadı (gereksiz).

**Kaydedilen borçlar (§5'e işlendi):**

- `border` token'ı 1.52:1 (light) / 1.80:1 (dark) — dekoratif ayırıcı için yeterli, form
  input sınırı gibi anlamlı UI sınırları için WCAG 1.4.11'in 3:1'ini geçmiyor. 12 token'lık
  sözleşmede `border-strong` yok; ihtiyaç Katman B'de doğacak.
- `globals.css`'te `::-webkit-scrollbar-thumb` hâlâ ham `#3f3f46` — token'a çekmek açık
  temada scrollbar'ı belirgin biçimde açardı, bilinçli olarak sistemin dışında bırakıldı.
- Revize edilen `warning` token'ı ekranlara henüz akmıyor — bileşenler hâlâ ham
  `text-orange-*`/`amber-*` kullanıyor. Kontrast kazancı Katman B'de bu sınıflar
  `text-warning`'e çevrilince gerçekleşecek.
- AC-1.6.7 (`LoopRing`, `prefers-reduced-motion` altında bilgi kaybetmeme) tasarımı gereği
  Faz 2'ye devredildi (ADR-0017).
- Ratchet emoji sayacının sözcük çözümleyicisi tam ayrıştırıcı değil (regex literali içindeki
  `/` teorik olarak durum takibini şaşırtabilir).

**Durum:** Faz 1.6 tamamlandı (AC-1.6.7 hariç, Faz 2'ye devredildi). Sıradaki iş Faz 1.7 —
Borç Temizliği (bkz. §6), ardından Faz 2.

---

### Doğrulama tablosu — Faz 1.6 satırları

| Kontrol                                                            | Komut                  | Durum                                                                                | Tarih      |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------ | ---------- |
| Tip kontrolü (Faz 1.6 — görsel kimlik, Katman A sonrası)           | `npm run type-check`   | Temiz                                                                                | 2026-08-17 |
| Lint (Faz 1.6 — görsel kimlik, Katman A sonrası)                   | `npm run lint`         | Temiz — 0 hata, 12 bilinen uyarı                                                     | 2026-08-17 |
| Biçim (Faz 1.6 — görsel kimlik, Katman A sonrası)                  | `npm run format:check` | Temiz                                                                                | 2026-08-17 |
| Birim/bileşen testleri (Faz 1.6 — görsel kimlik, Katman A sonrası) | `npm run test`         | **363/363 (31 dosya)** — önceki tur 308                                              | 2026-08-17 |
| Production build (Faz 1.6 — görsel kimlik, Katman A sonrası)       | `npm run build`        | Başarılı, fontlar self-host edildi                                                   | 2026-08-17 |
| E2E testleri (Faz 1.6 — görsel kimlik, Katman A sonrası)           | `npm run test:e2e`     | **42/42** (21 senaryo × 2 profil) — ekran metnine dokunulmadı, tek locator kırılmadı | 2026-08-17 |
| CI ratchet (Faz 1.6 — görsel kimlik, Katman A sonrası)             | `npm run ratchet`      | **6/6 sayaç yeşil**                                                                  | 2026-08-17 |

---

## Eski §5 — görsel kimlik borçları ve Faz 1.6'da doğan borçlar

`ÇÖZÜLDÜ` işaretli satırlar kapanmıştır; kapanmayanlar canlı
[`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle izlenir.

**GÖRSEL KİMLİK BORÇLARI (Faz 1.6 / Faz 2 kapsamına alındı — `active_planprogram.md` §3b):**
Aşağıdakiler 2026-08-17'de kaynaktan ölçüldü; hiçbiri bu oturumda düzeltilmedi.

| Kısıt / borç                                                                 | Kanıt ve kapanış yeri                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mevcut marka moru `#8b5cf6` WCAG AA'yı geçmiyor                              | Birebir Tailwind `violet-500` (bir seçim değil, varsayılan); beyaz üstünde ~4.2:1 < 4.5:1. Aynı renk hem birincil aksiyon zemini hem `:focus-visible` outline'ı (`src/app/globals.css:62`). 3 dosyada 8 yerde ham hex: `globals.css` (4), `CoachUserManagement.tsx` (3), `StatsTab.tsx` (1). **ÇÖZÜLDÜ (2026-08-17, Faz 1.6):** `accent` token'ına taşındı — açık `#5B48D9` (ölçülen **5.65:1**, ADR'nin tahmini "~6:1" yerine), koyu `#A79BFF` (ölçülen **7.56:1**, tahmini "~6.5:1" yerine); `8b5cf6` grep'i sıfır.                                                                                             |
| `text-gray-400` / `text-gray-500` kontrast borcu                             | `src/app/globals.css` sonundaki kontrast notu bunu zaten kayda geçirmiş: `.text-gray-400` beyaz kart üstünde AA'yı zor geçiyor/geçmiyor, `.text-gray-500` sınırda; `text-xs` ile birlikte riskli. Tek tek sınıf avlanmadı. **KISMEN ÇÖZÜLDÜ (2026-08-17, Faz 1.6):** semantik `text-secondary` token'ı `src/design/tokens.ts`'te tanımlı ve AA doğrulamalı; ancak ekranlardaki mevcut `text-gray-400`/`text-gray-500` kullanımları **henüz `text-secondary`'ye çevrilmedi** — ekran restilizasyonu Katman A'nın kapsamı dışında (ADR-0018). Gerçek kapanış Katman B, Faz 2.                                       |
| Emoji sökümünün E2E locator maliyeti                                         | `tests/e2e/**` senaryoları birebir Türkçe metinlere bakıyor ve emoji, emoji taşıyan butonların **erişilebilir adının parçası**. ~60 emoji / 15 dosya. Aynı kırılma yüzeyi bekleyen ürün dili düzeltmesiyle ("Öğrenci Paneli" vb.) çakışıyor — ayrı yapılırsa aynı locator'lar iki kez kırılır. **Kapanış:** ADR-0016; Faz 2'nin ilk mekanik işi, locator güncellemesi aynı PR'da. Faz 1.6'nın CI ratchet'ı ölçümü **60 emoji / 15 dosya** olarak doğruladı ve tavan olarak kilitledi — sayı ADR'nin tahminiyle birebir.                                                                                           |
| Koyu zemin `#0f0f12` üç yerde ayrı ayrı yazılı                               | `src/app/layout.tsx:23` (`viewport.themeColor`), `src/app/layout.tsx:32` (`dark:bg-[#0f0f12]`), `src/app/globals.css:30` (`.dark .glass-panel` rgba). Biri değişirse diğerleri sessizce kayar. **ÇÖZÜLDÜ (2026-08-17, Faz 1.6):** üçü de `#14161B`'ye taşındı ve `src/design/tokens.ts`'ten tek kaynaktan besleniyor.                                                                                                                                                                                                                                                                                             |
| `next/font` hiç kullanılmıyor                                                | `src/app/layout.tsx` yalnızca `font-sans` diyor; yazı tipi ailesi hiç tanımlanmamış, tarayıcı/işletim sistemi varsayılanı render ediliyor. **ÇÖZÜLDÜ (2026-08-17, Faz 1.6):** `next/font` ile Archivo/Hanken Grotesk/IBM Plex Mono self-host edildi (12 woff2), `latin-ext` açık.                                                                                                                                                                                                                                                                                                                                 |
| Ekranlar Faz 1.6 ile Faz 2 arasında **iki dil** taşıyacak                    | 49 `font-black`, 17 `rounded-3xl`, 14 `bg-gradient-to-*` Katman A'da dönüştürülmüyor. Bilinçli kabul edilen ara dönem (ADR-0018); CI ratchet yalnızca **kötüleşmeyi** engeller, iyileşmeyi zorlamaz — sayaçlar Faz 2 çıkışında hâlâ sıfırlanmamış olabilir. **DOĞRULANDI (2026-08-17, Faz 1.6):** üç sayaç öngörüldüğü gibi değişmeden ratchet tavanı oldu (`font-black` 49 · `rounded-3xl` 17 · `bg-gradient-to-` 14); ayrıca yazı tipi tavanı 700'e sabitlenince mevcut 49 `font-black` artık gerçek 900 kesimi bulamıyor, tarayıcı sentetik kalın üretiyor — yeni bir görünür yan etki, Katman B'de sökülecek. |
| Chart.js eksen rengi ve `html2canvas` dışa aktarımı kimliğin dışında kalıyor | Grafik eksenlerinde ham `#888`; `html2canvas` PNG çıktısının CSS değişkenleriyle doğru render ettiği doğrulanmadı. Faz 1.6 kapsamına **alınmadı**. **Kapanış:** Faz 4 grafik tekleştirme işi (`active_planprogram.md` §6, AC-4.3)                                                                                                                                                                                                                                                                                                                                                                                 |

**YENİ BORÇLAR (Faz 1.6'da kaynaktan tespit edildi, 2026-08-17):**

| Borç                                                               | Not                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `border` token'ı anlamlı UI sınırları için WCAG 1.4.11'i geçmiyor  | 1.52:1 (light) / 1.80:1 (dark) — dekoratif ayırıcı için yeterli ama form input sınırı gibi kullanımlar için 3:1 eşiğinin altında. 12 token'lık sözleşmede `border-strong` yok; ihtiyaç Katman B'de doğacak. |
| `::-webkit-scrollbar-thumb` hâlâ ham `#3f3f46`                     | `globals.css` — token'a çekmek açık temada scrollbar'ı belirgin biçimde açardı, bilinçli olarak sistemin dışında bırakıldı.                                                                                 |
| Revize edilen `warning` token'ı ekranlara henüz akmıyor            | Bileşenler hâlâ ham `text-orange-*`/`amber-*` kullanıyor; kontrast kazancı (`#A65600`, AA) bu sınıflar `text-warning`'e çevrilince Katman B'de gerçekleşecek.                                               |
| Ratchet emoji sayacının sözcük çözümleyicisi tam ayrıştırıcı değil | Regex literali içindeki `/` teorik olarak durum takibini şaşırtabilir; tam TS/TSX ayrıştırıcı değil, ADR-0018'in grep tabanlı yaklaşım için kabul ettiği takas.                                             |
