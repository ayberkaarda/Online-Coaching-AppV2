# 0017 — İmza öğe: Halka, tek anlam kuralıyla

- **Durum:** Kabul edildi (uygulama Faz 2'de, `LoopRing` bileşeniyle)
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi

## Bağlam

`0015-gorsel-kimlik-sistemi.md` paleti, temayı ve tipografiyi karara bağladı; ama bunlar bir
ürünü **tanınır** kılmaya yetmez. Ürünün adı "Closed-Loop Coaching Hub" ve çekirdek vaadi
kapalı döngüdür: koç plan atar → danışan uygular → rapor gelir → koç geri bildirim verir →
döngü kapanır. Bu kavramın görsel bir karşılığı yok.

Aynı anda somut bir risk var: halka/dairesel ilerleme göstergesi fitness ürünlerinde
fazlasıyla tanıdık bir formdur. Kuralsız kullanılırsa ürün "Apple Watch benzeri" görünür ve
imza olmaktan çıkıp klişe olur. Ayrıca `active_planprogram.md` §4.2 beslenme makro
dashboard'ını "halka grafik" olarak tarif ediyordu — yani halka daha baştan iki farklı anlamı
birden taşımaya aday durumdaydı.

Üçüncü bir kısıt teknik: `src/app/globals.css` içinde global bir `prefers-reduced-motion`
kuralı var ve tüm animasyonları `animation-duration: 0.01ms` ile fiilen dondurur. Bu kural
kod tabanındaki bolca `animate-pulse` kullanımı için bilinçli olarak yazıldı.

## Karar

Ürünün imza öğesi **halka**dır ve **tek anlam kuralına** tabidir:

> Halka **yalnızca döngü/çevrim durumu** kodlar. Dekorasyon olarak asla kullanılmaz — avatar
> çerçevesi, buton süsü, arka plan deseni **yasaktır**.

Halkanın **üç** görünme yeri vardır, fazlası yok:

1. **Danışan panosu — haftalık döngü halkası.** Streak sayısının yerine geçer; 7 segment, dolu
   segment = rapor girilmiş gün.
2. **Gym modu dinlenme sayacı.** En görünür sahne; koyu (Demir) zemin üstünde, `0015`'in
   `clamp(64px, 18vw, 96px)` rakam ölçeğiyle.
3. **Koç triyaj kartı — 4 yaylı döngü rozeti.** Yaylar: plan atandı → uygulanıyor → rapor geldi
   → geri bildirim verildi. Eksik yay Kehribar (`#B45D00`) ile boyanır ve "sıra kimde"yi
   gösterir.

**Bilinçli kesinti:** `NutritionTab` makro gösterimi halka **olmaz**. İki gerekçe: (a) Apple
Watch klişesine kayar; (b) tek anlam kuralını bozar — **makro bir döngü değil, bir bütçedir**.
Makrolar **yatay bar** ile gösterilir. Bu, `active_planprogram.md` §4.2'nin "halka grafik"
ifadesinin yerini alır.

Ayrıca `0015` gereği yarıçap ölçeği 8/12/16'dır ve `rounded-3xl` sistemden çıkar: **daire
yalnızca halkadır.** Bu, halkanın formunu arayüzde biricik kılar.

### KRİTİK KISIT — hareket azaltma

Halka **bilgi taşır, süs değildir.** İlerleme CSS animasyonuyla (`@keyframes` + `animation`)
çizilirse, `globals.css`'teki global `prefers-reduced-motion` kuralı onu **dondurur ve yanlış
bilgi gösterir** — kullanıcı %20'de donmuş bir halkaya bakıp %80 tamamlanmış bir haftayı
kaçırır. Bu bir estetik tercih değil, **doğruluk** meselesidir.

Bu nedenle:

- Halkanın dolgusu **state kaynaklı `stroke-dashoffset` güncellemesi** olmak zorundadır;
  değer, animasyondan bağımsız olarak her zaman gerçek veriyi gösterir.
- Kutlama dönüşü (halka kapanır, Kapanış yeşiline `#0F7A4C` döner) hareket azaltma altında
  **geçişsiz düz renk değişimi** olarak gerçekleşir — bilgi aynı kalır, yalnızca geçiş düşer.

## Sonuçlar

### Olumlu

- Ürünün adı ("closed loop") ile arayüzünün gösterdiği şey aynı kavramı işaret eder; imza öğe
  dekoratif değil **anlamsal** olur.
- Halkayı gören kullanıcı ne göreceğini bilir: her yerde aynı şeyi söyler. Bu, ikinci ve
  üçüncü kullanımda öğrenme maliyetini sıfırlar.
- Erişilebilirlik sözü korunur: hareket azaltma tercihi olan kullanıcı **eksik bilgi görmez**,
  yalnızca daha az hareket görür.
- Kutlama emoji'ye ihtiyaç duymaz (bkz. `0016-emoji-yerine-lucide-ikon-seti.md`).

### Olumsuz / kabul edilen bedeller

- **Halkanın üç yerle sınırlanması gerçek bir kısıttır.** İlerleyen fazlarda "buraya da bir
  halka koysak" denecek yerler çıkacak (ilerleme fotoğrafı karşılaştırması, recovery skoru —
  Faz 6, haftalık uyum yüzdesi). Kural gereği hayır denir; dördüncü bir yer eklemek bu ADR'yi
  güncellemeyi gerektirir. Kuralın değeri tam olarak bu sürtünmedir.
- Makro gösteriminde halka klişesi yerine yatay bar seçildiği için, o ekran ilk bakışta daha
  "sıradan" görünür. Anlam netliğini görsel çarpıcılığa tercih ediyoruz.
- `LoopRing` bileşeni CSS ile değil state ile çizilmek zorunda olduğundan, saf CSS bir
  çözümden daha fazla React kodu ve daha fazla test gerektirir; ilerleme değerinin doğru
  `stroke-dashoffset`'e dönüştüğü birim testle kilitlenmelidir.
- Faz 6'da gelecek recovery skoru gibi metrikler için ayrı bir görsel dil bulunması gerekir;
  halka o boşluğu dolduramaz.

### Uygulama notu

`LoopRing` bileşeni ayrı bir "bileşen kütüphanesi" işi olarak **önceden** yazılmaz; ilk
göründüğü ekranla — gym modu dinlenme sayacı — **birlikte** yazılır (bkz.
`0018-kimlik-gecisi-iki-katman-ve-ci-ratchet.md`). Hareket azaltma davranışının doğrulanması
o işin kabul kriteridir (`active_planprogram.md` AC-1.6.7 üzerinden Faz 2'ye bağlanmıştır).

### Etkilenen dosyalar

- `src/components/ui/LoopRing.tsx` (yeni, Faz 2)
- `src/components/tabs/NutritionTab.tsx` (halka değil, yatay bar)
- `src/app/globals.css` (mevcut `prefers-reduced-motion` kuralı — değişmez, kısıtın kaynağı)
- `active_planprogram.md` §4.2 (halka grafik ifadesi bu ADR ile düzeltildi), §3b
