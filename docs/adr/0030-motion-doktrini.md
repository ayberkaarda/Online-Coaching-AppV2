# ADR-0030 — Motion Doktrini (web + mobil hareket disiplini)

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-21
- **Karar verenler:** Fable (dış görüş turu)
- **İlgili:** ADR-0015 (görsel kimlik sistemi — "Demir & Tebeşir") · ADR-0017 (imza öğe:
  halka, tek anlam kuralı)

---

## Bağlam

Sarmal'a akıcılık kazandırmak için hareket eklenmesi gündeme geliyor: route geçişleri,
liste girişleri, buton geri bildirimleri. Bunun kendi başına iki riski var.

Birincisi, jenerik "AI-üretimi arayüz" hissi. Scroll-reveal stagger, hover'da scale/lift,
sayı count-up, spring/bounce geçişler — bunların hepsi hazır component kütüphanelerinin
varsayılanlarıdır ve kuralsız eklendiğinde ürünü **hiçbir** üründen ayırt edilemez hale
getirir; tam olarak ADR-0015'in çözmeye çalıştığı "varsayılanların toplamı" sorununu hareket
ekseninde yeniden üretir.

İkincisi, kimlik ihlali. ADR-0015 Palet bölümü altı adlandırılmış hex dışında serbest renk
eklenmesini, ADR-0017 ise halkanın **yalnızca döngü/çevrim durumu** kodlamasını, dekorasyon
olarak asla kullanılmamasını karara bağladı. Hareket bu iki kararı ihlal etmenin yeni bir
yoludur: yeni bir gradient'i "animasyonlu vurgu" diye sokmak identity-ratchet'i (ADR-0018)
hareket üzerinden atlatmak olur; halkaya bir "kutlama" pulse'ı eklemek tek-anlam kuralını
bozar — animasyon burada halkaya **ikinci bir anlam** yükler, oysa ADR-0017'nin tüm amacı
halkanın tek anlama sahip kalmasıdır.

Aşırı animasyon kimliği güçlendirmez, sulandırır. Bu ADR web ve mobili birlikte bağlar (bu
yüzden ADR-0015'e ek değil, ayrı bir ADR'dir): iki platformda ayrışan hareket dili, aynı
ürünün iki farklı üründen geliyormuş hissini vermesi riskini taşır.

---

## Karar

### 1) Motion token'ları — tek kaynak, iki dosya, aynı değerler

Süre ve easing değerleri koda serpiştirilmez; her platformda tek bir `motion.ts`
dosyasından okunur:

- Web: `apps/web/src/design/motion.ts` (ADR-0015'in `tokens.ts`'iyle aynı dizin).
- Mobil: `apps/mobile/lib/motion.ts`.

İki dosya **aynı sayısal değerleri** taşır:

| Token               | Değer                        | Kullanım                       |
| ------------------- | ---------------------------- | ------------------------------ |
| `duration.fast`     | 120ms                        | mikro-etkileşim (buton press)  |
| `duration.base`     | 200ms                        | standart geçiş                 |
| `duration.slow`     | 450ms                        | route cross-fade, halka çizimi |
| `easing.standard`   | `cubic-bezier(0.2, 0, 0, 1)` | başlayıp-biten geçişler        |
| `easing.decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | ekrana giren öğeler            |

Sabit süre/easing değerini bir bileşen içine gömüp bu tablonun dışına çıkmak yasaktır — tıpkı
ADR-0015'in ham hex gömmeyi yasaklaması gibi, burada da tek kaynak token dosyasıdır.

### 2) İmza hareket tavanı = 2

ADR-0017'nin halkayı üç görünme yeriyle sınırlaması gibi, hareket de sayıyla sınırlanır.
Toplamda **yalnızca iki** imza hareket vardır, platform başına birer tane değil, ürün
genelinde iki:

1. **Route cross-fade (web) / buton press (mobil).**
2. **LoopRing çizim animasyonu** — ADR-0017 Karar'daki `stroke-dashoffset` güncellemesinin
   kendisi, iki platformda da (web CSS, mobil Reanimated).

Bu tavan sabittir. Üçüncü bir "imza hareket" önerisi bu ADR'nin revize edilmesini gerektirir;
sessizce eklenemez. Gerekçe: imza hareket ne kadar çoğalırsa "imza" kelimesi o kadar
anlamsızlaşır — ikiden fazlası artık tanınırlık değil, dekorasyon üretir.

### 3) Yasak listesi

Aşağıdakiler kod tabanına **girmez**:

- Yeni gradient veya shimmer efekti (identity-ratchet — ADR-0018 ihlali).
- Scroll-reveal stagger.
- Parallax.
- Spring/bounce geçiş eğrisi.
- Sayı count-up animasyonu.
- Hover'da scale/lift.
- Shared-element geçiş.
- Lottie (veya eşdeğeri harici animasyon dosyası formatı).
- Pulse/loop/kutlama animasyonu **halka üzerinde** — ADR-0017'nin tek-anlam kuralını
  doğrudan ihlal eder: animasyon halkaya döngü durumunun **dışında** bir anlam
  (kutlama, dikkat çekme) yükler, oysa doğru yön animasyonun döngü durumunu daha net
  anlatmasıdır, ikinci bir anlam eklemesi değil.

Bu liste kapalıdır, örnek değildir. Listede olmayan yeni bir hareket önerisi geldiğinde
varsayılan cevap "hayır"dır; "evet" bu ADR'nin revizyonunu gerektirir.

### 4) Reduced-motion yapısal olmalı, çağrı yerinde değil

- **Web:** tek global `@media (prefers-reduced-motion: reduce)` bloğu (`globals.css`
  içindeki mevcut blok — bkz. ADR-0017 "KRİTİK KISIT"). Yeni bir bileşen bu bloğun
  kapsamına otomatik girer; bileşen içine ayrıca `if (prefersReducedMotion)` yazılmaz.
- **Mobil:** tek bir `useReducedMotion` helper'ı (`apps/mobile/lib/motion.ts` içinde,
  `react-native-reanimated`'ın `useReducedMotion` primitive'i üzerine ince bir sarmalayıcı).
  Çağrı yerlerinde koşul dallanması yazılmaz; helper'ın kendisi süre/easing değerini
  reduced-motion'a göre çözüp döndürür.

Gerekçe iki yönlü: (a) ADR-0017'nin halka için zaten kurduğu disiplinin — animasyonun
donmasının yanlış bilgi göstermemesi — her yeni hareket için tekrar tekrar elle
uygulanmasını önler; (b) çağrı yerinde dallanma serpiştirilirse bir gün bir bileşen
unutulur ve reduced-motion sessizce delinir. Tek nokta, tek denetim yeri demektir.

### 5) Web route geçişi: client-nav uyumlu mekanizma

Next.js'in saf `@view-transition` MPA CSS mekanizması yalnızca tam sayfa (MPA) geçişlerinde
tetiklenir; bu kod tabanı client-side navigation kullanır (App Router), dolayısıyla route
cross-fade'i **client-nav'a uygun** bir mekanizmayla (View Transitions API'nin JS tetikleyici
yolu veya eşdeğer bir geçiş kancası) kurmak zorundadır. Saf CSS `@view-transition` bloğu
tek başına yazılıp "route geçişi çözüldü" sanılmaz — client nav'da hiçbir şey yapmaz.

---

## Sonuçlar

**Kazanımlar**

- Gelecekteki "şuraya da animasyon ekleyelim" isteklerine karşı somut bir fren: istek imza
  hareket tavanına mı giriyor, yoksa yasak listesinde mi — cevap kararsız kalmadan verilir.
- Web ve mobil aynı süre/easing değerlerini paylaştığı için platformlar arası hareket hissi
  tutarlı kalır.
- Reduced-motion'ın yapısal olarak tek noktadan çözülmesi, ADR-0017'nin halka için zaten
  kurduğu "donma = yanlış bilgi" disiplinini tüm gelecekteki hareketlere otomatik olarak
  yayar.
- **Sıfır yeni bağımlılık.** Web mevcut CSS mekanizmalarıyla, mobil zaten kurulu olan
  `react-native-reanimated` ile karşılanır.

**Bedeller**

- İmza hareket tavanı (2) yeni bir "vurgulu" özellik isteğini reddetmek anlamına
  gelebilir; bu bilinçli bir kısıtlamadır, eksiklik değildir.
- `motion.ts`'in iki platformda ayrı dosya olarak tutulması (paylaşılan `packages/` yerine)
  değerlerin elle senkron tutulmasını gerektirir — sürüklenme riski, bu ADR'nin gelecekte bir
  code-review kontrolüyle (iki dosyanın değerlerini karşılaştıran bir test) kapatılması
  gereken açık bir nokta olarak kayda geçirilir.

---

## Reddedilen alternatifler

**(A) Motion token'larını `packages/` altında paylaşılan tek dosyada tutmak.** Reddedildi:
web CSS custom property'leri, mobil ise JS/TS obje değerleri tüketir; ortak bir formatı ikisi
için de yeniden üretmek (build adımı, iki farklı tüketim şekli) bu ADR'nin kapsamındaki
kazanımdan daha pahalı. İki dosya + aynı sayısal değerler daha ucuz ve yeterince güvenli.

**(B) İmza hareket sayısına sınır koymamak, her PR'de ayrı ayrı değerlendirmek.**
Reddedildi: sınırsız değerlendirme, zamanla "bir tane daha eklesek zararı olmaz" sürüklenmesine
yol açar — tam olarak ADR-0018'in identity ratchet'inin uyardığı örüntü. Sabit bir sayı
(2), tartışmayı "bu ikiden biri mi" sorusuna indirger.

**(C) Reduced-motion kontrolünü her bileşende ayrı ayrı yazmak.** Reddedildi: ADR-0017'nin
halka için yaşadığı riskin (donma = yanlış bilgi) her yeni hareket için tekrar tekrar elle
çözülmesi anlamına gelir; bir bileşenin unutulması sessiz bir erişilebilirlik regresyonudur.
Yapısal tek nokta bu riski ortadan kaldırır.
