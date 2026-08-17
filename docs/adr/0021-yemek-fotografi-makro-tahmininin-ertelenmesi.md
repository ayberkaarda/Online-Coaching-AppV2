# 0021 — Yemek fotoğrafı makro tahmininin ertelenmesi

- **Durum:** Ertelendi
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi

## Bağlam

`active_planprogram.md` §5, Faz 3 olarak "Yemek Fotoğrafı Makro Tahmini" özelliğini
tanımlıyordu: kullanıcı öğün fotoğrafı yükler, `ai_backend` bir vision sağlayıcısına
(Anthropic Messages API, `VisionProvider` adapter deseniyle soyutlanmış) görseli gönderir,
model tahmini makroları (`items`, `totals`, `confidence`, `disclaimer_key`) döner, sonuç
`nutrition_logs`'a `status='ai_suggested'` olarak yazılır ve kullanıcı onay/düzenleme
ekranından `confirmed`'a çevirmeden makro dashboard'una dahil edilmez. Spesifikasyon
(§5.1–§5.3) küçük ve tam: 1 uç (`POST /v1/analyze/meal-photo`), 1 proxy route, 4 yeni kolon
(`photo_path`, `ai_estimate`, `user_override`, `status`), 1 private bucket (`meal-photos`,
zaten storage listesinde), 1 kullanım sayacı (`ai_usage_counters`).

Karar Fable'a danışılarak alındı, proje sahibi onayladı. Aynı oturumda spesifikasyonun
kendi içindeki bir açık soru da karara bağlandı: LLM'siz V0 dilimi ("fotoğrafı öğün
kaydına ekle, koç görsün") de **şimdi yapılmayacak** — şema Faz 4'te zaten foto
yükleme/signed URL işini yapacağı için en ucuz olduğu an Faz 4 olurdu, ama talep sinyali
olmadan "şema hazır diye yapmak" sunk-cost tuzağıdır.

### Neden "Reddedildi" değil "Ertelendi" — ADR-0019 ile karşılaştırma

ADR-0019 (laboratuvar yorumlama motoru) altı ölçütle reddedilmişti. Aynı altı ölçüt Faz
3'e uygulandığında, Faz 3 dördünden **geçiyor**; motoru düşüren yapısal kusurlar burada
yok:

| ADR-0019 ölçütü                           | Lab motoru                                                       | Faz 3                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Değer                                     | Raporda zaten yazılı bilgiyi yeniden türetiyordu → sıfıra yakın  | Fotoğrafta OLMAYAN bilgiyi (kalori/makro) üretir → zayıf ama sıfır değil                                                                |
| Keyfi çekirdek formül + yüksek sorumluluk | Kaynaksız severity formülü → hekime yönlendirme tetikliyordu     | Tahmin güvenilmez AMA hata bedeli düşük: kullanıcı onaylamadan dashboard'a girmez (`status='ai_suggested'`), tıbbi çıktı üretilmiyor    |
| Çalışmayan tasarım kararları              | İki ölümcül kusur (`multiple_subjects` reddi, boru hattı sırası) | **Yok** — spesifikasyon küçük, kanıtlanmış desenleri kullanıyor (proxy zorunluluğu, private bucket, signed URL, adapter pattern)        |
| Bloklayıcı açık soru                      | Katalog lisansı, açık rıza, saklama süresi                       | **Yok**                                                                                                                                 |
| Kalibrasyon verisi yokluğu                | Motor yazılamazdı                                                | Gerekmez — tahmini iş model kendisi yapıyor, bizim ayrı bir eşik/kalibrasyon katmanımız yok                                             |
| Maliyet çekirdek faz büyüklüğünde         | Tek başına bir faz (§11.2 L0–L5)                                 | Küçük (1 uç, 1 adapter, 4 kolon, 1 bucket zaten planlı, 1 sayaç) AMA tekrarlayan işletme maliyeti (token/istek) ekler — lab'da bu yoktu |

Sonuç: Faz 3'ün zayıf olduğu tek yer değer belirsizliği ve tekrarlayan maliyet; tasarım
kusuru veya çözülmemiş bloklayıcı yok. Bu nedenle "Reddedildi" damgası yanıltıcı olurdu —
motoru reddeden gerekçelerin hiçbiri burada geçerli değil.

### Ek gerekçeler

- Uygulama yayında değil, sıfır gerçek kullanıcı. Manuel akış bugün eksiksiz çalışıyor:
  `nutrition_logs` (serbest metin + manuel makro girişi) + 581 satırlık `food_database`
  arama asisti + hedef-vs-gerçekleşen makro dashboard'u. Faz 3'ün çözdüğü tek şey **giriş
  sürtünmesi** ve bunun gerçek bir sorun olup olmadığını ancak gerçek bir danışan
  söyleyebilir.
- `ai_backend` bugün tamamen deterministik (`nutrition_calculator`, `diet_generator`,
  `workout_generator`, `recommendation_engine` — hiçbir LLM çağrısı yok). Faz 3 bu
  backend'in karakterini değiştiren ilk LLM entegrasyonu olurdu; bunu değeri
  kanıtlanmamış bir özellik için yapmak mimari maliyeti (yeni bağımlılık sınıfı, yeni
  hata modu, yeni maliyet kalemi) gizler.
- Doğruluk bilinen biçimde zayıf (porsiyon/gizli yağ fotoğraftan güvenilir kestirilemez);
  plan bunu onay ekranı + `disclaimer_key` ile sarıyor — yani özellik fiilen "AI tahmin
  eder, kullanıcı yine de elle düzeltir"e iniyor ve manuel girişten kazanılan mesafe
  küçülüyor.

## Karar

Faz 3 (Yemek Fotoğrafı Makro Tahmini) **uygulanmayacak — ertelendi**, reddedilmedi.
`active_planprogram.md` §5 **silinmez**; başına bu ADR'ye referans veren bir durum notu
eklendi (`docs/LAB-INSIGHTS-SPEC.md`'nin ADR-0019 sonrası aldığı notla aynı desen). Faz
numaraları **kaymaz**: §3a/§3b konvansiyonu gereği Faz 4–10 aynı numarayla kalır, Faz 3
"Ertelendi" işaretli bir boşluk olarak durur.

LLM'siz V0 dilimi (`nutrition_logs.photo_path` + `meal-photos` private bucket +
yükleme/görüntüleme, ~sıfır işletme maliyeti) de bu kararla birlikte **şimdi
yapılmayacak** — talep sinyali olmadan yapılırsa sunk-cost'a düşülür.

### Geri dönüş merdiveni

- **V0 — Fotoğraf ekle, LLM yok.** `nutrition_logs.photo_path` + `meal-photos` private
  bucket + yükleme/görüntüleme. ~Sıfır işletme maliyeti. Koçun öğün fotoğrafını görmesini
  sağlar; makro tahmini yapmaz.
- **V1 — Vision tahmini.** Planın §5'teki tam spesifikasyonu (uç, adapter, `status`
  akışı, günlük limit) aynen kullanılır.
- **Tetikleyici:** gerçek danışanlar "öğün girişi zahmetli" derse V0'a geçilir; V0 da
  yetmezse V1'e geçilir. Karar yayın sonrası geri bildirime bağlı, takvime değil.
- V0'ın en ucuz uygulama zamanı **Faz 4'tür** (o faz zaten foto yükleme + signed URL işini
  yapıyor, bkz. `active_planprogram.md` §6) — ama proje sahibi V0'ın da şimdi
  yapılmamasına karar verdi. Bu not, özellik yeniden değerlendirildiğinde fırsat
  penceresinin nerede olduğunu kaydetmek için buraya yazıldı.

## Sonuçlar

### Olumlu

- Uygulamanın ilk LLM entegrasyonu, değeri kanıtlanmadan mimariye eklenmiyor;
  `ai_backend` deterministik karakterini koruyor.
- Tekrarlayan işletme maliyeti (vision API çağrı başına token) gerçek talep olmadan
  başlamıyor.
- Faz 3'e bağlı güvenlik denetim maddeleri (prompt injection, SSRF, günlük analiz limiti
  — `active_planprogram.md` §3a Kova 2 #7 ve "Kapsam dışı" listesi) uçları hiç var
  olmadığı için **açık borç olarak kalmıyor**; bu maddeler bir borcu kapatmıyor, zaten
  hiç doğmadılar (aşağıya bakın).
- `nutrition_logs`'un Faz 2b'de bilinçli olarak dar tutulan şeması (bkz.
  `supabase/migrations/20260817190100_nutrition_targets_and_logs.sql` başlığı) sayesinde
  veritabanında **geri alınacak hiçbir şey yok** — `status`/`photo_path`/`ai_estimate`/
  `user_override` kolonları, `meal-photos` bucket'ı ve `ai_usage_counters` tablosu hiç
  yaratılmadı.

### Olumsuz / kabul edilen bedeller

1. v1'in tek "vitrin AI" özelliği gidiyor. `ai_backend`'in kural tabanlı asistleri
   kalıyor ama "fotoğraf çek, makro gelsin" demosunun ilk-izlenim değeri kayboluyor. Tek
   koçlu, satış sayfası olmayan üründe bedel düşük ama sıfır değil.
2. Az yazan danışan az loglar. Manuel giriş sürtünmesi kalıyor; yazmaya üşenen danışanda
   "gerçekleşen" tarafı eksik dolar ve makro dashboard'unun değeri o danışan için düşer.
   Faz 3'ün çözmeyi hedeflediği gerçek ürün tezi buydu.
3. **Koç öğünün fotoğrafını hiç görmez** — porsiyon/kalite üzerine nitel geri bildirim
   (gerçek koçlukta yaygın bir pratik) imkânsız kalır. Bunu en ucuza geri getiren V0'dır
   (yukarıya bakın).
4. §5'e ve Faz 2b'nin ileriye-uyumluluk tasarımına (ad seçimi, backfill'siz
   `default 'confirmed'` planı) harcanan düşünce şimdilik kullanılmıyor — ama çöp değil,
   dönüş maliyetini düşürmüş durumda.

## Faz 3'e bağlı güvenlik denetim borcunun durumu

`active_planprogram.md` §3a (Faz 1.5 güvenlik denetimi), "meal-photo" ucunu iki yerde
gelecekteki bir denetim yükümlülüğü olarak işaretlemişti:

- Kova 2 #7: "prompt injection, SSRF (§5) — uç henüz yok, Faz 3'te geliyor; uygulama
  denetimi Faz 3'ün çıkış kriterine bağlanır."
- "Kapsam dışı" listesi: "Faz 3 (meal-photo: prompt injection, SSRF, günlük analiz
  limiti) ... yüzeylerinin uygulama denetimi — bu fazda yalnızca tasarım kısıtı olarak
  yazılır."

Bu iki madde **açık borç değildi** — bir ucun _ileride_ denetleneceğine dair bir
notasyondu, denetlenmeyi bekleyen var olan bir kod değildi. Uç hiç var olmadığı için
(migration'da kolonlar eklenmedi, `ai_usage_counters` hiç doğmadı, `meal_analysis.py`
hiç yazılmadı) bu notasyon **düşer** — kapatılacak bir şey yok çünkü açılan bir şey de
yok. `active_planprogram.md`'de bu iki satır bu ADR'ye referansla işaretlendi.

**Faz 3 dönerse** bu denetim maddeleri (prompt injection, SSRF, günlük analiz limiti)
yeni uygulamanın **çıkış kriteriyle birlikte** geri gelir — Faz 3'ün AC listesine bir
güvenlik denetim maddesi olarak yeniden eklenmeleri gerekir, bu ADR onları önceden
"yapıldı" saymaz.

## Veritabanı: hiçbir şey yapılmadı

`supabase/migrations/20260817190100_nutrition_targets_and_logs.sql` başlığı ve 2.
bölümündeki yorum bloğu, Faz 2b'nin bu kolonları **bilerek** eklemediğini açıkça
belgeliyor:

> "AMA Faz 3'ün ALANLARI BUGÜN KURULMAZ ... `status`, `photo_path`, `ai_estimate`,
> `user_override` YOK. Gerekçe: bugün AI yolu yoktur ..."

Migration ayrıca Faz 3'te eklemenin nasıl kolay olacağını (backfill gerektirmeyen
`default 'confirmed'` planı) planlı biçimde belgeliyor ama uygulamıyor. `meal-photos`
bucket'ı (`active_planprogram.md` §3.3'te listelenen üç bucket'tan biri) ve
`ai_usage_counters` tablosu da hiç yaratılmadı. Bu ADR gereği bu migration'da veya
şemada **hiçbir geri alma işlemi gerekmiyor** — ileriye uyumluluk (ad seçimi +
backfill'siz plan) bedava korunuyor durumda kalıyor.

## Etkilenen dosyalar

- `active_planprogram.md` §1.1, §1.3, §3.1, §3.3, §3a (Kova 2 #7 ve "Kapsam dışı"
  listesi), §5 (durum notu eklendi, içerik korunuyor), §13
- `docs/PROGRESS.md` §4, §5
- `docs/adr/README.md` (indeks satırı)
