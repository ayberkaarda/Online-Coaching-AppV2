# 0019 — Laboratuvar yorumlama motorunun kapsam dışı bırakılması

- **Durum:** Reddedildi
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi

## Bağlam

Danışanların kan/hormon tahlili PDF'i yükleyebildiği, sistemin değerleri kendi referans
kataloğuna göre yorumlayıp (`status`, `severity`) koçu referans dışı sonuçlardan haberdar
ettiği bir "laboratuvar içgörüleri" özelliği için ayrıntılı bir mühendislik spesifikasyonu
yazıldı: `docs/LAB-INSIGHTS-SPEC.md` (PDF alım hattı, Türkçe-duyarlı isim doğrulaması,
analit kataloğu + versiyonlanmış referans aralıkları, deterministik yorumlama motoru,
kalıcı sorumluluk metni, koç bildirimi — toplam 14 ana bölüm + 16 açık soru). Spesifikasyon
kendi içinde tutarlı ve `recommendation_engine.py` desenini (saf, deterministik, LLM'siz)
doğru biçimde taklit ediyordu; ancak bir uygulama emri değil, "bir sonraki ajanın migration
ve servis yazabilmesi için gereken kararları tanımlayan" bir taslaktı (spesifikasyonun
kendi 1. satırı).

Özellik `active_planprogram.md`'ye hiçbir noktada işlenmedi: dokümanda özelliğe ayrılmış
bir faz, bölüm veya kabul kriteri yoktur; tek eşleşen madde Faz 1.5 güvenlik bulgu
tablosundaki alakasız bir "dosya yüklemede magic-byte doğrulaması yok" satırıdır. Yani
özellik plana girmeden, yalnızca spesifikasyon aşamasında, bağımsız bir değerlendirmeyle
kapsam dışı bırakıldı.

Bağımsız değerlendirme altı gerekçe ortaya koydu:

1. **Değer zayıf.** Türk laboratuvar raporları referans aralığını ve aralık dışı işaretini
   (H/L, yıldız, kalın yazım) istisnasız zaten yazdırır. Spesifikasyonun §4.11 kararı
   gereği yorum yalnızca kendi kataloğumuzdan geldiği için, sistem raporun "normal"
   dediğine "referans dışı" diyebilirdi (veya tersi).
2. **Severity formülü (§5.4) keyfi.** `d = sapma / aralık genişliği` formülü, dar aralıklı
   analitleri (ör. TSH 0.4–4.0) sistematik olarak fazla, geniş aralıklıları (ör. ferritin
   30–400) az işaretler. Spesifikasyon eşiklerin (`t1=0.10`, `t2=0.50`) tıbbi bir kaynaktan
   gelmediğini kendisi itiraf ediyordu (§5.4 gerekçe metni, açık soru A-5) — keyfi olduğu
   bilinen bir formülün `critical` etiketiyle hekime yönlendirme (§6.2, Y-6) tetiklemesi en
   yüksek sorumluluk üreten çıktıyı en zayıf temele oturtuyordu.
3. **İki tasarım kararı pratikte çalışmazdı.** `multiple_subjects` reddi (P-4, §3.4) her
   raporda basılı isteyen hekim/onaylayan uzman adını ikinci kişi adayı sayıp gerçek
   raporların büyük kısmını **beyan yolu kapalı** şekilde reddederdi. Boru hattı sırası
   (§2.1, adım 3 vs. adım 6) dosyayı isim kapısından önce bucket'a yazıyordu; "kapıdan
   geçilmeden hiçbir sağlık verisi saklanmaz" iddiası (§2.1 gerekçe) dosyanın kendisi için
   doğru değildi.
4. **Bloklayıcı açık sorular (§12) çözülmemişti.** A-1 (referans aralığı kaynağı ve
   lisansı — katalog tablosu olmadan yazılamaz), A-3 (başlangıç analit seti), A-11 (veri
   saklama süresi ve silme hakkı), A-12 (açık rıza/bilgilendirme metni) bloklayıcıydı; son
   ikisi mühendislik kararı değil, özel nitelikli sağlık verisi işlemenin yayın ön koşulu.
5. **Kalibrasyon verisi yoktu.** `text_layer` eşiği (§2.4), isim eşleştirme eşikleri (§3.4,
   A-15) ve OCR gerekliliği oranı (A-13) "gerçek belgelerle kalibre edilmeli" notuyla
   bırakılmıştı; elde tek bir örnek rapor yok.
6. **Maliyet çekirdek fazlarla kıyaslanabilir.** PDF ayrıştırma, Türkçe isim eşleştirme,
   referans kataloğu, birim dönüşüm tablosu, demografi migration'ı (§4.14), yeni motor, yeni
   bildirim akışı, 60+ test senaryosu (§10) — spesifikasyonun kendi fazlama önerisinde
   (§11.2) L0–L5 tek başına bir faz büyüklüğünde.

## Karar

Laboratuvar yorumlama motoru **uygulanmayacak**. `docs/LAB-INSIGHTS-SPEC.md` **tarihsel
kayıt olarak korunuyor** — dosyanın en başına bu kararı ve gözden geçirme koşullarını
belirten bir durum notu eklendi, içeriğin geri kalanı değiştirilmedi.

## Sonuçlar

### Olumlu

- Belgenin içinde zaten yazılı olan bir bilgiyi yeniden türetmenin ayrıştırma riski ve
  sorumluluk yükü kaçınıldı.
- Kaynağı olmayan bir severity formülüyle hekime yönlendirme üretme riski kaçınıldı.
- `multiple_subjects` reddi ve dosya/isim-kapısı sıralaması gibi, üretime çıksaydı raporların
  büyük kısmını kullanılamaz kılacak iki tasarım kusuru kod hâline gelmeden yakalandı.
- Katalog lisansı, saklama süresi ve açık rıza gibi çözülmemiş bloklayıcılar özel nitelikli
  sağlık verisi işlemeye başlamadan **önce** tespit edildi.
- PDF ayrıştırma + Türkçe isim eşleştirme + referans kataloğu + birim dönüşümü + yeni motor +
  60'tan fazla test senaryosu büyüklüğünde bir iş kalemi (§11.2 L0–L5) plana hiç girmedi.

### Olumsuz / kabul edilen bedeller

- Danışan tahlil sonucunu uygulamaya giremiyor; kilo/beslenme/antrenman verisinin yanına
  laboratuvar verisi eklenmiyor.
- Koç, danışanın referans dışı laboratuvar sonuçlarından haberdar edilmiyor (§7'nin
  hedeflediği senaryo karşılanmıyor).
- Spesifikasyona harcanan emek (14 bölüm, tam veri modeli, motor tasarımı, test stratejisi)
  şu an için kullanılmıyor; yalnızca ileride yeniden değerlendirilirse başlangıç noktası
  olarak değer taşıyor.

## Gözden geçirme koşulları

Özellik geri gelirse başlangıç noktası **en alt kademe** olmalı — üç kademeli bir merdiven:

- **V0 — Belge kasası.** Yalnızca PDF yükleme (spesifikasyonun §2.2/§2.3 kabul kriterleri ve
  saklama kuralları sağlam, aynen kullanılabilir), private bucket, koça "yeni tahlil belgesi
  yüklendi" bildirimi, koçun belgeyi açıp okuması. Ayrıştırma yok, motor yok, katalog yok.
  Kullanıcının "koç bilgilendirilsin" isteğini tam karşılar.
- **V1 — Yapılandırılmış değer + laboratuvarın kendi basılı aralığı.** Kendi katalog yok,
  severity yok. Zaman içi eğilim grafiği bu kademede neredeyse bedavaya gelir ve koçluk
  bağlamında asıl değerli şey odur.
- **V2 — Yorumlama motoru.** Ancak katalog kaynağı (§12 A-1) çözülür, gerçek rapor korpusu
  toplanır (§12 A-13) ve bir hekim gözden geçirmesi (§12 A-5) yapılırsa.

Ayrıca: özellik geri gelirse referans aralığı olarak **laboratuvarın raporda basılı kendi
aralığı** esas alınmalı — kendi kataloğumuz değil. Aralıklar yönteme ve cihaza özgüdür; bu
tek karar katalog lisansı, LOINC eşlemesi, yaş/cinsiyet aralık seçimi, demografi ön koşulu
(§4.14) ve birim dönüşümünün (§4.5, §4.13) büyük kısmını gereksizleştirir.

### Etkilenen dosyalar

- `docs/LAB-INSIGHTS-SPEC.md` (başına durum notu eklendi, içerik değişmedi)
- `docs/PROGRESS.md` §4 (karar kaydı satırı)
