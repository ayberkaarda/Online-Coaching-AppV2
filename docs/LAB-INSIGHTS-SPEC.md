# Laboratuvar Sonuçları — Mühendislik Spesifikasyonu

> **DURUM (2026-08-17): UYGULANMADI — kapsam dışı bırakıldı.**
> Bu özellik `docs/adr/0019-laboratuvar-yorumlama-motoru-kapsam-disi.md` kararıyla plandan
> çıkarıldı. Aşağıdaki spesifikasyonun **hiçbir kısmı hayata geçirilmedi** — ne migration, ne
> servis, ne uç, ne test yazıldı. Belge **tarihsel kayıt** olarak korunuyor ve özellik
> ileride yeniden değerlendirilirse başlangıç noktası olacak; ADR'deki "gözden geçirme
> koşulları" bölümüne bakın (V0/V1/V2 kademeleri ve referans aralığı kararı). Aşağıdaki
> içerik bu not dışında **değiştirilmedi**.

> **Durum:** Taslak (tasarım). Bu belge **kod, migration veya tablo üretmez**; bir sonraki
> ajanın migration ve servis yazabilmesi için gereken kararları ve sözleşmeleri tanımlar.
> **Kaynak hiyerarşisi:** `active_planprogram.md` > `docs/adr/**` > bu belge > mevcut kod.
> **Tarih:** 2026-08-17

**Bağlayıcı kullanıcı kararları (bu belgenin temeli):**

| #   | Karar                                                                                                                               | Nerede işlendi |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| K1  | Girdi yolu **yalnızca PDF yüklemedir**. Ayrıştırma v1 kapsamındadır; risk ertelenerek değil **kuşatılarak** çözülür.                | §2             |
| K2  | Yüklenen raporun o danışana ait olduğu **isim doğrulamasıyla** kontrol edilir; Türkçe-duyarlı normalizasyon zorunludur.             | §3             |
| K3  | Yorumlamanın göründüğü **her** yüzeyde kalıcı ve görünür sorumluluk metni bulunur; bu bir arayüz sabitidir, motor çıktısı değildir. | §6             |

---

## 0. Sorumluluk çerçevesi (ADR ADAYI — faz girişinde ADR yazılacak)

Bu bölüm spesifikasyonun omurgasıdır. Aşağıdaki her tasarım kararı bu çerçeveye uyar;
çerçeveyle çelişen bir tasarım önerisi **reddedilir**, tartışılmaz.

> **ADR adayı.** Bu çerçeve tek başına bir mimari karardır (geri dönüşü pahalı, birden çok
> katmanı etkiler, gelecekte tekrar sorgulanacaktır). Fazın **girişinde**
> `docs/adr/NNNN-laboratuvar-yorumlama-sinirlari.md` olarak yazılacaktır; numara
> `docs/adr/README.md` indeksindeki en yüksek `No` + 1 ile o gün belirlenir (bugün en
> yüksek numara `0018`'dir). Numara **burada verilmez** — paralel ajanlar da ADR yazıyor
> olabilir.

### 0.1 Sistem NE YAPAR

| #   | Yetenek                 | Tanım                                                                                                                           |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Y-1 | Ölçüm + aralık gösterir | Ölçülen değeri, o analite ait **seçilmiş** referans aralığıyla ve aralığın kaynağıyla birlikte gösterir.                        |
| Y-2 | Konum belirtir          | Değerin aralığın `altında` / `içinde` / `üstünde` olduğunu söyler.                                                              |
| Y-3 | Sapmayı niteler         | Sapmanın büyüklüğünü **aralık genişliğine oranla** niteler: `borderline` / `notable` / `critical` (§5.4 formülü).               |
| Y-4 | Bilgilendirir           | Analitenin ne ölçtüğünü ve değeri **etkileyebilecek** faktörleri nötr dille anlatır (açlık, ölçüm saati, antrenman, hidrasyon). |
| Y-5 | Doğru aralığı seçer     | Danışanın **doğum tarihinden hesaplanan yaşı** ve **biyolojik cinsiyetine** göre katalogdan aralık seçer.                       |
| Y-6 | Hekime yönlendirir      | `critical` sapmalarda kullanıcıya hekime başvurma metni gösterilir.                                                             |
| Y-7 | Koçu bilgilendirir      | Koç, danışanın referans dışı sonuçları olduğundan haberdar edilir (§7 gizlilik kuralıyla).                                      |
| Y-8 | Kimliği doğrular        | Yüklenen raporun danışana ait olduğunu isim eşleştirmesiyle kontrol eder; şüphede **işlemez** (§3).                             |
| Y-9 | Sınırını söyler         | Yorumun göründüğü her yerde, kalıcı ve kapatılamaz bir sorumluluk metni gösterir (§6).                                          |

### 0.2 Sistem NE YAPMAZ (yasak)

| #    | Yasak                               | Kapsam                                                                                                                                                                                                                                         |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y-10 | Teşhis koymaz                       | Hastalık adı, sendrom adı, "şuna işaret eder" ifadesi hiçbir şablonda geçmez. Şablon sözlüğü bu kurala karşı testle korunur (§10.5).                                                                                                           |
| Y-11 | Tedavi/supplement önermez           | "D vitamini düşük, şu dozu al" **yasaktır**. İlaç, doz, supplement, diyet reçetesi üretilmez. Supplement/beslenme verisi yalnızca **bağlam** olarak gösterilir ("bu değer ölçülürken şunları kullanıyordunuz"); **nedensellik iddia edilmez**. |
| Y-12 | Serbest LLM metni göstermez         | Kullanıcıya gösterilen her cümle **kural tabanlı şablondan** gelir. Motor `explanation_key` döner, cümle döndürmez (§5.3). Bu, `active_planprogram.md` §9'daki recovery skoru kuralının aynısıdır.                                             |
| Y-13 | Triyaj yapmaz                       | `critical` etiketi **hekime yönlendirme** metnidir; aciliyet derecelendirmesi, "acile git/gitme" ayrımı değildir. Şablonlarda aciliyet ifadesi geçmez.                                                                                         |
| Y-14 | Aralık uydurmaz                     | Katalogda uygun aralık yoksa `status: unknown` + gerekçe döner. Yaklaşık, komşu yaş grubundan devşirilmiş veya karşı cinsiyetin aralığı **kullanılmaz**.                                                                                       |
| Y-15 | Ayrıştırdığına körü körüne güvenmez | PDF'ten çıkarılan hiçbir değer, kullanıcı onaylamadan yorumlanmaz veya kalıcı sonuç olarak yazılmaz (§2.5).                                                                                                                                    |

### 0.3 Çerçevenin kod karşılıkları

| Çerçeve maddesi | Nerede zorlanır                                                                      |
| --------------- | ------------------------------------------------------------------------------------ |
| Y-12            | `LabInsightResult` şemasında **serbest metin alanı yoktur** (Pydantic + zod, §9)     |
| Y-14            | Motor `ReferenceRangeSet` dışından aralık türetemez; girdi eksikse `unknown` (§5.5)  |
| Y-11            | `context_factors` yalnızca **kod** listesidir; her kod nötr şablona bağlıdır (§5.3)  |
| Y-10/Y-13       | Şablon sözlüğü üzerinde yasaklı-terim testi (§10.5)                                  |
| Y-15            | Ayrıştırıcı `lab_results`'a **yazamaz**; yalnızca `lab_import_drafts`'a yazar (§4.7) |
| Y-9             | Sorumluluk metni motor çıktısından değil arayüz sabitinden gelir; kaldırılamaz (§6)  |

### 0.4 Mevcut kodda doğrulanmış bir tuzak

`ai_backend/app/services/recommendation_engine.py` **deterministik ve saf**tır (LLM
çağrısı yok) — bu yönüyle taklit edilecek desendir. Ancak `Recommendation.title` /
`Recommendation.detail` alanlarına **doğrudan Türkçe cümle** yazar
(`recommendation_engine.py:80-84`, `92-101` vb.). Bu, `active_planprogram.md` §9'un
recovery skoru için şart koştuğu `advice_key` desenine **uymayan** eski bir seçimdir.

**Kural:** Laboratuvar motoru `recommendation_engine.py`'nin _saflığını ve
determinizmini_ taklit eder, _metin üretimini_ taklit **etmez**. Yanıt şemasında
`title`/`detail` benzeri serbest `str` alanı bulunmaz.

---

## 1. Kapsam ve sınırlar

### 1.1 v1 kapsamı

- **PDF alım hattı:** yalnızca PDF kabul eden, sunucuda doğrulanan, private bucket'a yazan
  yükleme yolu (§2).
- **İsim doğrulaması:** raporun danışana ait olduğunun Türkçe-duyarlı kontrolü (§3).
- **Metin katmanlı PDF ayrıştırması:** analit/değer/birim çıkarımı + kaynağa izlenebilirlik.
- **Onay ekranı:** ayrıştırılan her satırın kullanıcı tarafından düzeltilip onaylanması.
  Onaylanmayan satır sisteme **girmez**.
- Analit referans kataloğu ve **versiyonlanmış** referans aralıkları.
- Deterministik yorumlama motoru: `status`, `severity`, seçilen aralık, şablon anahtarları.
- Kalıcı sorumluluk metni (§6).
- Koça referans dışı sonuç bildirimi (§7).
- `profiles` demografi kolonları (`birth_date`, `sex`, `height_cm`, `weight_kg`).

**Manuel giriş nerede?** Manuel yapılandırılmış giriş **birincil yol değildir**; onay
ekranının içinde bir **düzeltme ve tamamlama yüzeyi** olarak vardır. Ayrıştırıcının
bulamadığı bir analit oraya elle eklenebilir, yanlış okunan bir değer düzeltilebilir. Bir
belge hiç ayrıştırılamadığında (ör. taranmış PDF, v1'de OCR yok) kullanıcı aynı ekranı
belgesine bakarak elle doldurur — özellik bu durumda **çıkmaza girmez**. Her sonuç satırı
`origin` kolonuyla (`parsed` / `edited` / `manual`) izlenir.

### 1.2 Kapsam dışı (v1)

| Kapsam dışı                                           | Nereye ait                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **OCR — taranmış (metin katmansız) PDF**              | Alt adım L6 (§11). v1'de tespit edilir, reddedilmez, elle doldurma yoluna düşülür. |
| PDF dışı formatlar (JPEG/PNG foto, DOCX, HL7/FHIR)    | v2 backlog                                                                         |
| Trend/zaman serisi grafikleri, analit karşılaştırması | v2 backlog                                                                         |
| Laboratuvar kurum API'si entegrasyonu                 | v2 backlog                                                                         |
| Aile/geçmiş hastalık, ilaç listesi yönetimi           | v2 backlog                                                                         |
| Push bildirimi (Expo)                                 | Faz 7'ye bağlanır; v1 yalnızca `notifications`                                     |
| Referans aralığı kaynağının lisans yönetimi           | §12 A-1 — kullanıcı kararı                                                         |
| Gebelik/laktasyon, pediatrik (<18) aralıkları         | v1'de `unknown`; ayrı karar gerektirir                                             |

---

## 2. PDF alım hattı

### 2.1 Boru hattı (uçtan uca)

```
1.  İstemci        PDF seçer, /api/lab/documents'a multipart POST eder
2.  Sunucu         Kabul kriterleri (§2.2) — HERHANGİ biri düşerse dosya HİÇ saklanmaz
3.  Sunucu         Private bucket'a yazar; yolu SUNUCU üretir (§2.3)
4.  Sunucu         lab_documents satırı: status = 'uploaded'
5.  ai_backend     Metin çıkarımı + tür tespiti: text_layer | scanned (§2.4)
6.  ai_backend     İSİM DOĞRULAMASI (§3)  ---- KAPI ----
        matched / overridden  -> 7'ye devam
        failed                -> DUR. Ayrıştırma ÇALIŞMAZ. Metin atılır.
7.  ai_backend     Analit ayrıştırma -> taslak satırlar (§2.5)
8.  Sunucu         lab_import_drafts'a yazar; status = 'parsed'
9.  Kullanıcı      ONAY EKRANI: her satırı görür, düzeltir, onaylar veya reddeder
10. Sunucu         Onaylanan satırlardan lab_panels + lab_results yazılır
11. Sunucu         Yorumlama motoru (§5) -> lab_result_insights
12. Sunucu         Koç bildirimi (§7)
```

**Kapı 6 neden ayrıştırmadan önce:** İsim eşleşmezse belge başka birine ait olabilir. O
belgeyi ayrıştırıp analit listesini ekranda göstermek, **üçüncü bir kişinin özel nitelikli
sağlık verisini işlemek** demektir. Bu yüzden isim doğrulaması bir gösterim filtresi değil,
bir **işleme kapısıdır**: geçilmeden hiçbir sağlık verisi çıkarılmaz, saklanmaz veya
gösterilmez.

**Adım 9 neden zorunlu:** Ayrıştırma olasılıksaldır; yorumlama deterministiktir. Olasılıksal
bir katmanın çıktısı, deterministik motora **insan onayı olmadan** girerse sistemin tüm
güvenilirlik iddiası çöker (Y-15).

### 2.2 Kabul kriterleri (sunucuda, sırayla)

| #   | Kontrol          | Kural                                                                                                                                   | Düşerse                      |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| K-1 | Kimlik           | `Authorization: Bearer` zorunlu; kullanıcı `auth.getUser()` ile çözülür (I-1, ADR-0011).                                                | 401 `NOT_AUTHENTICATED`      |
| K-2 | Boyut            | **≤ 10 MB, sunucuda ölçülür.** Bucket seviyesindeki limit yalnızca ikinci savunma hattıdır; sunucu **önce** reddeder.                   | 413 `FILE_TOO_LARGE`         |
| K-3 | Bildirilen MIME  | `application/pdf` olmalı — ama yalnızca **ön eleme**dir. İstemcinin bildirdiği `Content-Type` ve dosya adı uzantısı **kanıt sayılmaz**. | 415 `UNSUPPORTED_MEDIA_TYPE` |
| K-4 | **Magic byte**   | Dosyanın **ilk 5 baytı** `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`) olmalı. Offset 0'dan okunur.                                              | 415 `NOT_A_PDF`              |
| K-5 | Yapısal bütünlük | Dosyanın son 1 KB'ında `%%EOF` bulunmalı; PDF ayrıştırıcı belgeyi açabilmeli.                                                           | 422 `CORRUPT_PDF`            |
| K-6 | Şifreleme        | Parola korumalı / şifreli PDF **reddedilir** (açılamaz, ayrıştırılamaz).                                                                | 422 `ENCRYPTED_PDF`          |
| K-7 | Sayfa sayısı     | **≤ 30 sayfa.** Ayrıştırma maliyetini ve DoS yüzeyini sınırlar.                                                                         | 422 `TOO_MANY_PAGES`         |
| K-8 | Kullanım kotası  | Kullanıcı başına **günde 10 belge**; sayaç Postgres'te atomik (`ai_usage_counters` deseni, plan §5.3).                                  | 429 `DAILY_LIMIT_EXCEEDED`   |
| K-9 | Tekilleştirme    | `sha256` daha önce aynı danışan için yüklendiyse yeni belge açılmaz, mevcut belgeye yönlendirilir.                                      | 200 + mevcut `document_id`   |

- K-2..K-7 **başarısız olursa dosya bucket'a hiç yazılmaz.** Doğrulama, saklamadan öncedir.
- **Faz 1.5 bağlantısı:** K-4 ve §2.3, Kova 3 #4'ün ("dosya yüklemede magic-byte
  doğrulaması yok; uzantı kullanıcı dosya adından türetiliyor") tam karşılığıdır. Bu
  özellik o bulguyu **kendi yüzeyinde baştan kapalı** kurar; mevcut `avatars` /
  `form-checks-media` yüzeylerinin düzeltilmesi yine Faz 1.5'in işidir (§11.1).

### 2.3 Saklama

| Kural               | Detay                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bucket              | `lab-documents`, `public = false`. Public okuma yolu (`/storage/v1/object/public/...`) kapalı.                                                                                                                                                                                                                                                                                                                                    |
| Yol                 | **Sunucu üretir:** `<client_id>/<uuid>.pdf`. Kullanıcının dosya adı ve uzantısı yola **hiç girmez**; uzantı sabittir (`.pdf`), whitelist'ten değil tek değerden gelir.                                                                                                                                                                                                                                                            |
| Sahiplik kontrolü   | Bu **yeni** bucket'ta klasör tabanlı sahiplik kullanılır: `storage.foldername(name)[1] = auth.uid()::text`. Bu, plan §3.3'ün yol sözleşmesidir (`<user_id>/<uuid>.<ext>`) ve mevcut iki bucket'ın ön-ek tabanlı deseninden **bilinçli olarak farklıdır** — `supabase/README.md` "Neden `storage.foldername(name)[1]` değil?" notu eski bucket'lardaki _mevcut_ dosya adlandırmasından kaynaklanır; yeni bucket'ta o kısıt yoktur. |
| Kolonda ne saklanır | Tam URL değil **YOL** (`lab_documents.storage_path`) — `20260817100000_private_storage.sql` kuralı.                                                                                                                                                                                                                                                                                                                               |
| Okuma               | Yalnızca `createSignedUrl`; `SIGNED_URL_TTL_SECONDS = 3600` (I-4: TTL ≤ 1 saat). İmzalı adres içeren sorgularda `staleTime = SIGNED_URL_STALE_TIME_MS`.                                                                                                                                                                                                                                                                           |
| Servis başlığı      | İmzalı adres `Content-Disposition: attachment` ve `Content-Type: application/pdf` ile üretilir (Faz 1.5 Kova 3 #5).                                                                                                                                                                                                                                                                                                               |
| Orijinal ad         | `original_filename` kolonunda **yalnızca gösterim için** saklanır: uzunluk sınırı 255, kontrol karakterleri temizlenir, yol üretiminde **asla** kullanılmaz. React'in varsayılan escape'i XSS'i keser (Faz 1.5 Kova 1 #18).                                                                                                                                                                                                       |
| Storage RLS         | SELECT: sahibi veya koç. INSERT/UPDATE/DELETE: yalnızca kendi klasörüne, veya koç. `anon`: hiç.                                                                                                                                                                                                                                                                                                                                   |

### 2.4 İki PDF türü — ayrı boru hatları

| Tür                               | Tespit                                                                        | v1'de                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Metin katmanlı** (`text_layer`) | Gömülü metin katmanından çıkarılan karakter sayısının **sayfa medyanı ≥ 100** | **Kapsam içi.** Deterministik metin çıkarımı + kural tabanlı ayrıştırma (§2.5).                                                                  |
| **Taranmış görüntü** (`scanned`)  | Sayfa medyanı < 100 karakter (veya metin katmanı hiç yok)                     | **Kapsam dışı (OCR yok).** Belge saklanır, `kind='scanned'` işaretlenir, kullanıcı onay ekranını **elle doldurur**.                              |
| **Karma**                         | Bazı sayfalar metinli, bazıları görüntü                                       | Metinli sayfalar ayrıştırılır; görüntü sayfaları `scanned_pages` listesinde bildirilir ve kullanıcıya "bu sayfalar okunamadı" olarak gösterilir. |

- Eşik (`100 karakter/sayfa medyanı`) bir sezgisel değerdir ve `lab_documents.kind` ile
  birlikte saklanır; gerçek belgelerle kalibre edilmelidir (§12 A-13).
- **İsim doğrulaması `scanned` belgelerde çalışmaz** (metin yok) → `name_match_status`
  `failed`, sebep `no_text_layer`. Kullanıcı §3.5'teki beyan yolunu kullanır. Bu, taranmış
  belgelerin özelliği kilitlememesini garanti eder.
- OCR (L6) geldiğinde bu ayrım **şema değişmeden** çalışır: OCR yalnızca metin üretme
  adımını değiştirir, sonraki adımlar aynıdır.

### 2.5 Ayrıştırma ve zorunlu korumalar

**Sıra:** önce kural tabanlı, sonra (gerekirse) LLM destekli.

1. **Kural tabanlı çıkarım (v1 birincil).** Metin satır satır taranır; her satırda
   `<etiket> <değer> <birim>` deseni ve laboratuvarın kendi aralık sütunu aranır. Etiket,
   `lab_analyte_synonyms` tablosundaki **normalize edilmiş** eşanlamlılarla eşleştirilir
   (normalizasyon §3.2 ile **birebir aynı** fonksiyondur — "Serbest T4", "SERBEST T4",
   "sT4" aynı koda düşer).
2. **LLM destekli çıkarım (opsiyonel, §12 A-14).** Kural tabanlı kapsama yetersizse
   devreye girer ve şu kısıtlara tabidir:
   - Çıktı **katı Pydantic şemasına** parse edilir; parse hatasında **1 retry** (düzeltme
     talimatıyla), sonra hata. Bu, plan §5.2'nin meal-photo için koyduğu kuralın aynısıdır.
   - Model **yalnızca** `{raw_label, value, unit, page_number, line_index, confidence}`
     üretir. `status`, `severity`, referans aralığı, yorum, öneri, tavsiye **üretmez** ve
     şemada bu alanlar **yoktur**.
   - Serbest metin uygulama akışına **hiç girmez**; ekrana yalnızca `raw_excerpt` (belgeden
     birebir alıntı) çıkar, model cümlesi değil.
   - Yorumlama **her koşulda** deterministik motorun işidir (§5).

**Zorunlu korumalar:**

| #   | Koruma                           | Uygulama                                                                                                                                                                                                         |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | **Onaysız yorum yok**            | Ayrıştırıcının çıktısı `lab_import_drafts`'a yazılır. `lab_results`'a yazma **yalnızca** onay eyleminden geçer. Ayrıştırıcının `lab_results`'a yazma yetkisi yoktur (§8.1) ve bu testle kanıtlanır.              |
| P-2 | **Düşük güven = yorum yok**      | `confidence < 0.80` veya analit koduna eşlenemeyen satır → `state = 'unparsed'`. Ayrı bir "okunamadı" listesinde gösterilir, **varsayılan olarak seçili değildir**, tahmin yürütülmez.                           |
| P-3 | **Kaynağa izlenebilirlik**       | Her taslak satırı `page_number`, `line_index` ve `raw_excerpt` (belgedeki ham satır) saklar. Onay ekranı her satırın yanında kaynağı gösterir; kullanıcı PDF'i açıp doğrulayabilir.                              |
| P-4 | **Toplu rapor koruması**         | Metinde birden çok farklı kişi adı adayı bulunursa belge `multiple_subjects` ile **reddedilir** (§3.4). Yalnızca doğrulanan kişiye ait bölüm işlenir; belirsizse hiçbiri işlenmez.                               |
| P-5 | **Birim tahmini yok**            | Birim okunamazsa `unit_parsed = NULL` → satır `unparsed`. Analitin kanonik birimi **varsayılmaz** (yanlış birim, sapmanın yönünü tersine çevirebilir).                                                           |
| P-6 | **Ondalık ayracı**               | Türkçe raporlarda ondalık ayracı virgüldür (`1,5`). Ayrıştırıcı hem `,` hem `.` kabul eder; **binlik ayracı belirsizse** (`1.234`) satır `unparsed` olur, tahmin edilmez.                                        |
| P-7 | **Aralık sütunu karıştırma yok** | Laboratuvarın referans aralığı sütunu ölçüm değeri olarak alınamaz: değer ile aralık aynı satırda ise değer **ilk sayısal alan** kuralıyla değil, sütun konumu/etiket bağlamıyla seçilir; belirsizse `unparsed`. |

**Onay ekranı sözleşmesi:**

- Her satır için: analit adı (katalog adı + belgedeki ham etiket), değer, birim, kaynak
  (sayfa/satır), güven göstergesi.
- Kullanıcı: onaylar / düzeltir (`state='edited'`) / reddeder (`state='rejected'`) / elle
  satır ekler (`origin='manual'`).
- **Hiçbir satır varsayılan olarak onaylı gelmez** — kullanıcı her satır için açık bir
  eylemde bulunur veya "tümünü onayla" der. Onaylanmamış satır panele girmez.
- Onay tamamlanmadan yorumlama **hiç çalışmaz** ve panel kullanıcıya "yorumlandı" olarak
  gösterilmez.

---

## 3. İsim doğrulaması

### 3.1 Amaç ve asimetrik risk

Yüklenen raporun danışana ait olduğunu doğrular. İki hata türünün maliyeti **eşit
değildir**:

| Hata                                                 | Sonuç                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Yanlış pozitif** — başkasının raporu eşleşir       | Üçüncü bir kişinin özel nitelikli sağlık verisi işlenir, saklanır, koça bildirilir. **Geri alınamaz.** |
| **Yanlış negatif** — danışanın kendi raporu eşleşmez | Kullanıcı bir ek onay adımı atar (§3.5 beyan yolu). Maliyet: bir tık ve bir rozet.                     |

Bu asimetri, eşiğin **yüksek** seçilmesini ve otomatik kabul bandının dar tutulmasını
zorunlu kılar. Yanlış negatifin bedeli beyan yoluyla sıfıra yakın tutulduğu için eşiği
gevşetmenin hiçbir gerekçesi yoktur.

### 3.2 Türkçe-duyarlı normalizasyon (kritik)

**Bu projede aynı sınıf hata daha önce yaşandı ve doğrulanmıştır.** `tests/e2e/README.md`
§"Tuzak: Türkçe İ/ı case-insensitive eşleşme" (satır 48-61):

- `"ŞİFRE".toLowerCase()` → `"şi̇fre"` üretir; `İ`'den sonra görünmez bir
  **U+0307 COMBINING DOT ABOVE** karakteri eklenir.
- ECMAScript `Canonicalize` aynı davranır: `/şifre/i` deseni `ŞİFRE` metniyle **asla**
  eşleşmez.
- Bu tek satır (`page.getByLabel(/şifre/i)`) **12 E2E testinin tamamını** bozmuştu.

Laboratuvar raporlarında ad-soyad neredeyse her zaman **tamamı büyük harf** yazılır
(`AYBERK ARDA`, `IŞIL ŞAHİN`). Yani bu tuzak burada **kaçınılmazdır**, kenar durum değildir.

**Kural: naif `toLowerCase()` / `toUpperCase()` ve `/i` bayraklı regex YASAKTIR.**

Normalizasyon adımları (bu **tam sırayla** uygulanır):

```
1. Unicode NFKC normalize
2. Kombine işaretleri kaldır (U+0300–U+036F; özellikle U+0307)
3. AÇIK KARAKTER HARİTASI (case işleminden ÖNCE):
       İ i I ı  -> I
       Ş ş      -> S
       Ğ ğ      -> G
       Ü ü      -> U
       Ö ö      -> O
       Ç ç      -> C
       Â â Î î Û û -> A I U
4. Kalan ASCII harfleri büyüt (artık İ/ı kalmadığı için güvenli)
5. Unvanları at: SAYIN, SN, DR, PROF, DOC, OP, UZM, BAY, BAYAN, MR, MRS
6. Noktalama ve rakamları at; ardışık boşlukları teke indir; baş/son boşluk kırp
7. Boşluktan token'lara böl
```

**Tek implementasyon kuralı.** Normalizasyon **yalnızca**
`ai_backend/app/services/text_normalize.py` içinde yazılır. İsim eşleştirmesi de analit
eşanlamlı eşleştirmesi de aynı fonksiyonu çağırır. TypeScript tarafında **ikinci bir
implementasyon yazılmaz** — iki dilde iki Türkçe normalizasyon, iki farklı hata demektir.
Bunu mümkün kılmak için beklenen ad (`expected_full_name`) `ai_backend`'e istekle
gönderilir (§9.2); PDF'in tamamı zaten oraya gittiği için ek bir PII yüzeyi doğmaz.

### 3.3 Eşleştirme algoritması

Girdi: `profiles.full_name` (beklenen) ve PDF metninden çıkarılan ad adayı/adayları.

Aday ad çıkarımı: metinde `Ad Soyad`, `Hasta Adı`, `Adı Soyadı`, `Hasta` gibi etiketlerin
karşısındaki değer; etiket bulunamazsa ilk sayfanın üst bloğundaki büyük harfli 2-4
token'lık diziler.

Skorlama (normalize edilmiş token'lar üzerinde, **sıra bağımsız**):

| Bileşen                   | Ağırlık | Kural                                                                                                                                                          |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Soyad**                 | 0.50    | Profildeki **son** token, aday token'lardan biriyle Jaro-Winkler ≥ **0.90** eşleşmeli. Eşleşmezse toplam skor **doğrudan 0** kabul edilir.                     |
| **En iyi ön ad**          | 0.35    | Profildeki ön adlardan en az biri, bir aday token'ıyla Jaro-Winkler ≥ 0.90. Tek harf + nokta (`A.`) ise **baş harf eşleşmesi** kabul edilir (kısmi puan 0.20). |
| **Kalan token kapsaması** | 0.15    | Eşleşen token sayısı / profildeki toplam token sayısı.                                                                                                         |

- **Algoritma: Jaro-Winkler.** Kısa adlarda ve ön-ek hatalarında (transliterasyon, eksik
  harf) Levenshtein'dan daha kararlıdır; 0..1 aralığında normalize skorludur.
- **Soyad kapısı** bilinçlidir: soyadı tutmayan bir raporun ön adı tutsa bile (yaygın adlar)
  otomatik kabulü, yanlış pozitif riskinin ana kaynağıdır.
- Aday adlardan **en yüksek** skorlu olan alınır.

### 3.4 Karar tablosu

| Skor / durum                              | `name_match_status` | `name_match_reason`        | Davranış                                                                                                                                 |
| ----------------------------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Normalize token kümeleri **birebir aynı** | `matched`           | `exact`                    | Devam. Ekranda ek bir şey gösterilmez.                                                                                                   |
| Skor **≥ 0.92**                           | `matched`           | `high_similarity`          | Devam. `name_match_score` saklanır.                                                                                                      |
| **0.75 ≤ skor < 0.92**                    | `failed` (geçici)   | `low_similarity`           | Ayrıştırma **çalışmaz**. Kullanıcıya sorulur: "Bu rapor size mi ait?" → beyan ederse `overridden`.                                       |
| **Skor < 0.75**                           | `failed`            | `no_match`                 | Aynı: yalnızca beyan yolu veya belgeyi silme.                                                                                            |
| Metinde ad adayı **hiç yok**              | `failed`            | `name_not_found`           | Aynı.                                                                                                                                    |
| Metin katmanı yok (taranmış)              | `failed`            | `no_text_layer`            | Aynı. (§2.4)                                                                                                                             |
| **Birden çok farklı kişi adayı**          | `failed`            | `multiple_subjects`        | **Beyan yolu KAPALI.** Belge reddedilir: "Bu belge birden fazla kişinin sonucunu içeriyor görünüyor; yalnızca size ait raporu yükleyin." |
| Kullanıcı beyanı                          | `overridden`        | beyan öncesi sebep korunur | Devam. Koç bunu görür (§3.5).                                                                                                            |

Eşiklerin gerekçesi: 0.92 bandı, aynı soyadı taşıyan farklı ön adların (aile üyeleri —
gerçekçi ve tehlikeli senaryo) otomatik geçmesini engelleyecek kadar dardır; 0.75 alt
bandı ise "muhtemelen aynı kişi ama emin değiliz" durumunu `no_match`'ten ayırarak
kullanıcıya daha anlaşılır bir soru sorulmasını sağlar. **Her iki eşik de ürün kararıdır ve
onaylanmalıdır (§12 A-15).**

### 3.5 Beyan yolu (`overridden`) — yanlış negatif kilitlemesi olmaz

- Kullanıcı "Bu rapor bana ait" beyanında bulunabilir. Kayıt `name_match_status =
'overridden'` olur ve beyan zamanı (`name_override_at`) ile beyan eden
  (`name_override_by`) saklanır.
- **Koç bunu görür.** Panel görünümünde kalıcı bir rozet: "Kimlik doğrulaması kullanıcı
  beyanına dayanıyor." Koç bildirimi metnine **girmez** (§7.3 gizlilik kuralı), panelde
  görünür.
- Beyan yolu `multiple_subjects` durumunda **kapalıdır** — orada sorun kimliğin
  doğrulanamaması değil, belgenin başkalarının verisini de içermesidir.
- Beyan, ayrıştırmayı açar; yorumlamayı ve koç bildirimini normal akışa sokar.

### 3.6 Gizlilik kuralları

| Kural                                                                                                 | Gerekçe                                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `extracted_name_raw` **loglanmaz**; `src/lib/logger.ts` redact listesine eklenir (§8.4).              | Kişisel veri; üstelik başkasına ait olabilir.                         |
| `failed` durumunda çıkarılan ad **kullanıcıya gösterilmez**.                                          | Belge başkasına aitse, adını yükleyene göstermek yeni bir sızıntıdır. |
| `extracted_name_raw` yalnızca belge sahibi ve koç tarafından, belge detayında görülebilir.            | Denetlenebilirlik için gerekli, ama dar yüzeyde.                      |
| Skor ve durum saklanır; ham metnin tamamı **saklanmaz** (yalnızca taslak satırların `raw_excerpt`'i). | Gereksiz veri tutmama.                                                |

---

## 4. Veri modeli

Tüm tablolar `public` şemasındadır. Ortak kurallar: `id uuid primary key default
gen_random_uuid()`, `created_at timestamptz not null default now()`, her FK'ye indeks,
`enable row level security` **ve** `force row level security` (§8.5), `revoke all ... from
anon`.

### 4.1 `lab_analytes` — analit kataloğu (referans veri)

| Kolon                  | Tip             | Kısıt / Not                                                                                |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `code`                 | `text`          | **PK.** Kanonik analit kodu (`TSH`, `VITAMIN_D_25OH`, `FERRITIN`). LOINC eşlemesi §12 A-2. |
| `display_name_tr`      | `text`          | `not null`.                                                                                |
| `canonical_unit`       | `text`          | `not null`. Motorun hesap yaptığı **tek** birim.                                           |
| `description_key`      | `text`          | `not null`. "Bu ne ölçer" şablon anahtarı (§5.3). Metin burada **tutulmaz**.               |
| `context_factor_codes` | `text[]`        | `not null default '{}'`. Bu analiti etkileyebilecek faktör kodları (§5.6).                 |
| `plausible_min`        | `numeric(14,4)` | Kanonik birimde. Dışı = giriş/ayrıştırma hatası şüphesi → `unknown` (§5.5).                |
| `plausible_max`        | `numeric(14,4)` | Aynı.                                                                                      |
| `severity_t1`          | `numeric(4,3)`  | Nullable. Analite özel `borderline/notable` eşiği; NULL ise global varsayılan (§5.4).      |
| `severity_t2`          | `numeric(4,3)`  | Nullable. Analite özel `notable/critical` eşiği.                                           |
| `is_active`            | `boolean`       | `not null default true`. Emekliye ayrılan analit silinmez, pasifleştirilir.                |

### 4.2 `lab_analyte_synonyms` — ayrıştırıcı etiket sözlüğü

| Kolon                | Tip    | Kısıt / Not                                                                                             |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `analyte_code`       | `text` | `not null references lab_analytes(code) on delete cascade`.                                             |
| `synonym_normalized` | `text` | **§3.2 normalizasyonundan geçmiş** hâli. PK: `(synonym_normalized)` — bir etiket iki analite eşlenemez. |
| `synonym_display`    | `text` | `not null`. Orijinal yazım (denetim için).                                                              |
| `locale`             | `text` | `not null default 'tr'`.                                                                                |

> PK'nin `synonym_normalized` tek başına olması bilinçlidir: aynı normalize etiketin iki
> analite eşlenmesi **belirsiz ayrıştırma** demektir ve veritabanı seviyesinde engellenir.

### 4.3 `lab_reference_range_sets` — aralık kaynağı ve versiyonu

| Kolon            | Tip       | Kısıt / Not                                                                          |
| ---------------- | --------- | ------------------------------------------------------------------------------------ |
| `id`             | `uuid`    | PK.                                                                                  |
| `source_name`    | `text`    | `not null`. Kaynağın adı (§12 A-1'de karara bağlanacak).                             |
| `source_version` | `text`    | `not null`. Kaynağın kendi sürüm/yayın etiketi.                                      |
| `source_url`     | `text`    | Nullable.                                                                            |
| `published_at`   | `date`    | `not null`.                                                                          |
| `is_active`      | `boolean` | `not null default false`. **Aynı anda en fazla bir aktif set** — kısmi tekil indeks. |
| `notes`          | `text`    | Kapsam sınırı notları (ör. "yalnızca 18+ yetişkin").                                 |

Kısıtlar: `unique (source_name, source_version)`;
`create unique index lab_range_sets_one_active_idx on lab_reference_range_sets ((true)) where is_active`
(desen: `workout_plans_one_active_idx`).

### 4.4 `lab_reference_ranges` — cinsiyet/yaş kırılımlı aralıklar

| Kolon           | Tip             | Kısıt / Not                                                                                         |
| --------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`          | PK.                                                                                                 |
| `range_set_id`  | `uuid`          | `not null references lab_reference_range_sets on delete cascade`.                                   |
| `analyte_code`  | `text`          | `not null references lab_analytes(code)`.                                                           |
| `sex`           | `lab_sex_scope` | `not null`. Enum: `female` \| `male` \| `any`.                                                      |
| `age_min_years` | `integer`       | `not null default 0`. **Dahil.**                                                                    |
| `age_max_years` | `integer`       | `not null default 200`. **Hariç** — yarı açık `[min, max)`, sınır çakışması olmasın.                |
| `unit`          | `text`          | `not null`. `lab_analytes.canonical_unit` ile aynı olmalı — katalog yükleme testi doğrular (§10.4). |
| `lower_bound`   | `numeric(14,4)` | Nullable (tek yönlü aralık için).                                                                   |
| `upper_bound`   | `numeric(14,4)` | Nullable.                                                                                           |
| `critical_low`  | `numeric(14,4)` | Nullable. Kaynak açıkça veriyorsa; formülü **ezer** (§5.4).                                         |
| `critical_high` | `numeric(14,4)` | Nullable. Aynı.                                                                                     |

Kısıtlar:

- `check (lower_bound is not null or upper_bound is not null)`.
- `check (lower_bound is null or upper_bound is null or lower_bound < upper_bound)`.
- `check (age_min_years >= 0 and age_max_years > age_min_years)`.
- `unique (range_set_id, analyte_code, sex, age_min_years, age_max_years)`.
- **Örtüşme kısıtı:** aynı `(range_set_id, analyte_code, sex)` için yaş aralıkları
  örtüşmemelidir. `btree_gist` + `exclude using gist (... with =, int4range(age_min_years,
age_max_years) with &&)` ile zorlanır. Uzantı istenmiyorsa §10.4 testi yüklemeyi düşürür.
  **Belirsiz bırakılmaz:** iki eşleşen aralık = deterministik olmayan seçim.

### 4.5 `lab_unit_conversions` — birim dönüşümü

Birim dönüşümü **analite özeldir** (mg/dL ↔ mmol/L katsayısı molekül ağırlığına bağlıdır);
genel bir birim tablosu yanlış olur.

| Kolon          | Tip              | Kısıt / Not                                          |
| -------------- | ---------------- | ---------------------------------------------------- |
| `analyte_code` | `text`           | `not null references lab_analytes(code)`.            |
| `from_unit`    | `text`           | `not null`.                                          |
| `to_unit`      | `text`           | `not null`. v1'de daima `canonical_unit`.            |
| `factor`       | `numeric(20,10)` | `not null check (factor > 0)`.                       |
| `offset_value` | `numeric(20,10)` | `not null default 0`. Afin dönüşümler için ayrılmış. |

PK: `(analyte_code, from_unit, to_unit)`. Kural: `to = from * factor + offset_value`.
`from_unit = to_unit` satırı **gerekmez**; motor eşitlikte dönüşüm aramaz.

### 4.6 `lab_documents` — yüklenen PDF

| Kolon                | Tip                     | Kısıt / Not                                                                                        |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                 | `uuid`                  | PK.                                                                                                |
| `client_id`          | `uuid`                  | `not null references profiles(id) on delete cascade`. Belgenin ait olduğu danışan.                 |
| `uploaded_by`        | `uuid`                  | `not null references profiles(id)`. **Denetim izi** — trigger `auth.uid()`'e zorlar (§8.2).        |
| `storage_path`       | `text`                  | `not null`. Bucket içi **yol** (tam URL değil). `unique`.                                          |
| `original_filename`  | `text`                  | Nullable, ≤ 255. **Yalnızca gösterim.**                                                            |
| `byte_size`          | `integer`               | `not null check (byte_size > 0 and byte_size <= 10485760)`.                                        |
| `page_count`         | `integer`               | `not null check (page_count between 1 and 30)`.                                                    |
| `sha256`             | `text`                  | `not null`. `unique (client_id, sha256)` — aynı belge iki kez yüklenmez (K-9).                     |
| `kind`               | `lab_document_kind`     | `not null default 'unknown'`. Enum: `text_layer` \| `scanned` \| `mixed` \| `unknown`.             |
| `scanned_pages`      | `integer[]`             | `not null default '{}'`. Okunamayan sayfa numaraları (`mixed` için).                               |
| `status`             | `lab_document_status`   | `not null`. Enum: `uploaded` \| `extracted` \| `blocked` \| `parsed` \| `confirmed` \| `rejected`. |
| `name_match_status`  | `lab_name_match_status` | `not null`. Enum: `matched` \| `overridden` \| `failed`.                                           |
| `name_match_reason`  | `text`                  | Nullable. §3.4 sebep kodu.                                                                         |
| `name_match_score`   | `numeric(4,3)`          | Nullable. `check (name_match_score between 0 and 1)`.                                              |
| `extracted_name_raw` | `text`                  | Nullable. **Kişisel veri** — loglanmaz (§3.6, §8.4).                                               |
| `name_override_at`   | `timestamptz`           | Nullable.                                                                                          |
| `name_override_by`   | `uuid`                  | Nullable `references profiles(id)`.                                                                |

Kısıt: `check (name_match_status <> 'overridden' or name_override_at is not null)`.
İndeks: `(client_id, created_at desc)`, `(status)`.

### 4.7 `lab_import_drafts` — ayrıştırma taslağı (onay öncesi)

| Kolon          | Tip                | Kısıt / Not                                                                                          |
| -------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `id`           | `uuid`             | PK.                                                                                                  |
| `document_id`  | `uuid`             | `not null references lab_documents on delete cascade`.                                               |
| `page_number`  | `integer`          | `not null check (page_number >= 1)`. **İzlenebilirlik (P-3).**                                       |
| `line_index`   | `integer`          | `not null check (line_index >= 0)`.                                                                  |
| `raw_excerpt`  | `text`             | `not null`. Belgedeki ham satır. **Sağlık verisi — loglanmaz.**                                      |
| `raw_label`    | `text`             | Nullable. Belgedeki analit etiketi.                                                                  |
| `analyte_code` | `text`             | Nullable `references lab_analytes(code)`. Eşlenemezse NULL.                                          |
| `value_parsed` | `numeric(14,4)`    | Nullable.                                                                                            |
| `unit_parsed`  | `text`             | Nullable. **Tahmin edilmez** (P-5).                                                                  |
| `confidence`   | `numeric(3,2)`     | `not null check (confidence between 0 and 1)`.                                                       |
| `source`       | `lab_draft_source` | `not null`. Enum: `text_rule` \| `llm` \| `manual`.                                                  |
| `state`        | `lab_draft_state`  | `not null default 'pending'`. Enum: `pending` \| `accepted` \| `edited` \| `rejected` \| `unparsed`. |

İndeks: `(document_id, page_number, line_index)`.

### 4.8 `lab_panels` — bir tahlil olayı

| Kolon           | Tip                 | Kısıt / Not                                                                                                                                                                              |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`              | PK.                                                                                                                                                                                      |
| `client_id`     | `uuid`              | `not null references profiles(id) on delete cascade`.                                                                                                                                    |
| `document_id`   | `uuid`              | `not null references lab_documents`. **v1'de her panel bir belgeden doğar** (K1). `unique` — bir belge bir panel.                                                                        |
| `collected_at`  | `timestamptz`       | `not null`. Kan alma anı — **saat önemlidir** (kortizol, testosteron diurnaldir). Belgeden ayrıştırılır, kullanıcı onaylar/düzeltir. `check (collected_at <= now() + interval '1 day')`. |
| `lab_name`      | `text`              | Nullable.                                                                                                                                                                                |
| `fasting_state` | `lab_fasting_state` | `not null default 'unknown'`. Enum: `fasting` \| `non_fasting` \| `unknown`. Belgede yazmıyorsa kullanıcıya sorulur.                                                                     |
| `notes`         | `text`              | Nullable. **Yoruma girdi değildir.**                                                                                                                                                     |
| `confirmed_at`  | `timestamptz`       | Nullable. Onay ekranının tamamlandığı an. **NULL ise panel yorumlanmaz.**                                                                                                                |
| `confirmed_by`  | `uuid`              | Nullable `references profiles(id)`.                                                                                                                                                      |
| `updated_at`    | `timestamptz`       | `not null default now()`; mevcut `public.set_updated_at()` trigger'ı.                                                                                                                    |

İndeks: `(client_id, collected_at desc)`.

### 4.9 `lab_results` — panel içindeki tek ölçüm

| Kolon                | Tip                 | Kısıt / Not                                                                                           |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                 | `uuid`              | PK.                                                                                                   |
| `panel_id`           | `uuid`              | `not null references lab_panels on delete cascade`.                                                   |
| `analyte_code`       | `text`              | `not null references lab_analytes(code)`. Katalog dışı analit v1'de kaydedilemez (§12 A-3).           |
| `value_raw`          | `numeric(14,4)`     | `not null`. **KANONİK** — onaylanan değer, hiç dönüştürülmeden.                                       |
| `unit_raw`           | `text`              | `not null`. **KANONİK** — onaylanan birim.                                                            |
| `value_canonical`    | `numeric(14,4)`     | Nullable. **TÜREV** — dönüşüm bilinmiyorsa NULL. Motor bunu kullanır.                                 |
| `lab_ref_lower_text` | `text`              | Nullable. Laboratuvarın **kendi** alt sınırı, **metin olarak** (`"< 5,0"`). Sayıya çevrilmez (§4.11). |
| `lab_ref_upper_text` | `text`              | Nullable. Aynı.                                                                                       |
| `lab_ref_unit`       | `text`              | Nullable.                                                                                             |
| `origin`             | `lab_result_origin` | `not null`. Enum: `parsed` \| `edited` \| `manual`. **İzlenebilirlik.**                               |
| `draft_id`           | `uuid`              | Nullable `references lab_import_drafts on delete set null`. `origin='manual'` ise NULL.               |
| `position`           | `integer`           | `not null default 0`.                                                                                 |

Kısıtlar: `unique (panel_id, analyte_code)`; `check (origin = 'manual' or draft_id is not null)`.
İndeks: `(panel_id, position)`, `(analyte_code)`.

> **`value_raw`/`unit_raw` neden kanonik:** `workout_plan_exercises.raw_line` ile aynı
> gerekçe (`20260817110000_workout_plan_tables.sql` başlığı). Türev alan
> (`value_canonical`) NULL olabilir; kaynak veri **asla** kaybolmaz. `draft_id` üzerinden
> zincir PDF'in sayfa/satırına kadar gider.

### 4.10 `lab_result_insights` — yorum anlık görüntüsü (değiştirilemez)

Yorumlama sonucu **saklanır**, her görüntülemede yeniden hesaplanmaz. Sebep: referans
kataloğu güncellendiğinde geçmiş yorumların değişmemesi gerekir (§4.12).

| Kolon                | Tip                  | Kısıt / Not                                                                         |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `id`                 | `uuid`               | PK.                                                                                 |
| `result_id`          | `uuid`               | `not null references lab_results on delete cascade`.                                |
| `revision`           | `integer`            | `not null default 1`. Yeniden yorumlama yeni satır üretir; eski satır **silinmez**. |
| `range_set_id`       | `uuid`               | `not null references lab_reference_range_sets`.                                     |
| `reference_range_id` | `uuid`               | Nullable `references lab_reference_ranges`. `unknown` durumunda NULL.               |
| `range_lower`        | `numeric(14,4)`      | Nullable. **Kopyalanmış** sınır — katalog değişse bile yorum sabit kalır.           |
| `range_upper`        | `numeric(14,4)`      | Nullable.                                                                           |
| `status`             | `lab_status`         | `not null`. Enum: `below` \| `within` \| `above` \| `unknown`.                      |
| `severity`           | `lab_severity`       | Nullable. Enum: `borderline` \| `notable` \| `critical`. `within`/`unknown` → NULL. |
| `deviation_ratio`    | `numeric(10,4)`      | Nullable. §5.4'teki `d`. Denetlenebilirlik için saklanır.                           |
| `unknown_reason`     | `lab_unknown_reason` | Nullable; `status='unknown'` ise `not null` (CHECK). Enum §5.5.                     |
| `explanation_keys`   | `text[]`             | `not null default '{}'`. Şablon anahtarları (§5.3).                                 |
| `context_factors`    | `text[]`             | `not null default '{}'`. Geçerli faktör kodları (§5.6).                             |
| `engine_version`     | `text`               | `not null`. Formül değişirse eski yorum ayırt edilebilsin.                          |
| `computed_at`        | `timestamptz`        | `not null default now()`.                                                           |

Kısıt: `unique (result_id, revision)`.
İndeks: `(result_id, revision desc)`; koç bildirimi için
`(status, severity) where status in ('below','above')`.

### 4.11 Kritik tasarım noktası — laboratuvarın kendi aralığı vs bizimki

| Soru                                           | Karar                                                                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`/`severity` hangisinden gelir?         | **Yalnızca bizim katalogdan** (`lab_reference_ranges`). Laboratuvarın aralığı yoruma **hiç girmez**.                                                                                                            |
| Laboratuvarın aralığı gösterilir mi?           | **Evet**, ayrı satırda, "laboratuvarın bildirdiği aralık" etiketiyle, ayrıştırıldığı **metin** hâliyle.                                                                                                         |
| İkisi farklıysa?                               | Sistem hangisinin doğru olduğunu **söylemez**. Nötr bağlam notu: `lab.factor.lab_range_differs` — "Laboratuvarınızın bildirdiği aralık burada kullanılandan farklı; laboratuvarlar farklı yöntem kullanabilir." |
| Katalogda aralık yoksa lab'ınki kullanılır mı? | **Hayır.** `status: unknown`, `unknown_reason: no_reference_range`. Laboratuvarın aralığı yine gösterilir.                                                                                                      |

Gerekçe: laboratuvarın aralığı serbest metindir (`"< 5,0"`, `"5.0 - 10.0"`, `"Negatif"`),
birimi ve kaynağı belirsizdir ve sayıya çevirmek §2.5'teki ayrıştırma riskini **yorum
katmanına** geri sokar. Yorum tekrarlanabilir ve versiyonlanabilir olmalıdır. Bu yüzden
`lab_ref_*_text` kolonları `text`tir, `numeric` değil.

### 4.12 Kritik tasarım noktası — versiyonlama ve geçmiş yorumların korunması

Zincir: `lab_result_insights.range_set_id` + kopyalanmış `range_lower`/`range_upper` +
`engine_version`.

- Katalog güncellenir → **yeni** `lab_reference_range_sets` satırı; eski set `is_active = false`.
- Eski `lab_reference_ranges` satırları **silinmez veya güncellenmez**.
- Mevcut `lab_result_insights` satırlarına **dokunulmaz**. Geçmiş panel açıldığında hangi
  kaynak/sürümle yorumlandığı ekranda görünür.
- Yeniden yorumlama **açık bir eylemdir** (koç veya danışan tetikler): `revision + 1` ile
  yeni satır yazılır, eski satır kalır. Otomatik toplu yeniden yorumlama **yapılmaz** —
  bir kullanıcının geçmişte gördüğü "normal" değerin bir gün habersizce "referans dışı"
  olması kabul edilemez.

### 4.13 Kritik tasarım noktası — birim dönüşümü akışı

```
girdi: (analyte_code, value_raw, unit_raw)    [onay ekranından ONAYLANMIŞ değerler]
  unit_raw == canonical_unit    -> value_canonical = value_raw
  lab_unit_conversions satırı var -> value_canonical = value_raw * factor + offset_value
  satır yok                     -> value_canonical = NULL
                                   status = unknown
                                   unknown_reason = unit_not_convertible
```

- Dönüşüm **yazma anında** hesaplanır ve `lab_results.value_canonical`'a yazılır; motor
  dönüşüm yapmaz (motor saftır, veritabanına bakmaz — §5.1).
- Dönüşüm tablosu sonradan genişletilirse, `value_canonical is null` satırlar için **açık**
  bir yeniden hesaplama işi çalıştırılır; sonuç yeni `revision` üretir.
- Onay ekranında birim **serbest metin değil**, analite göre filtrelenmiş bir seçimdir
  (`canonical_unit` + o analit için tanımlı `from_unit` değerleri). Ayrıştırıcının bulduğu
  birim bu listede yoksa satır `unparsed` olur (P-5).

### 4.14 `profiles`'a eklenecek demografi kolonları

| Kolon        | Tip              | Kısıt                                                                        | Neden                                                      |
| ------------ | ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `birth_date` | `date`           | Nullable. `check (birth_date > '1900-01-01' and birth_date <= current_date)` | Yaş **türetilir**, saklanmaz — `age int` her yıl bayatlar. |
| `sex`        | `public.lab_sex` | Nullable. Enum: `female` \| `male` \| `undisclosed`.                         | Biyolojik referans aralığı seçimi (§4.15).                 |
| `height_cm`  | `numeric(5,1)`   | Nullable. `check (height_cm between 80 and 260)` — `aiDietSchema` ile aynı   | Bağlam; ayrıca mevcut diyet üretimi kullanıyor.            |
| `weight_kg`  | `numeric(5,2)`   | Nullable. `check (weight_kg between 20 and 400)` — `aiDietSchema` ile aynı   | Aynı.                                                      |

**Barındırılan projeyle karşılaştırma** (`docs/HOSTED-DATA-INVENTORY.md` §5.1):

| Alan         | Yerel migration (`20260816090000`) | Barındırılan `profiles` | Sonuç                                                                                                                                             |
| ------------ | ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `birth_date` | yok                                | **yok** (`age` var)     | **Yeni kolon.** Hosted `age` int'inden `birth_date` türetilemez (doğum günü bilinmez) — geriye dönük doldurma **yapılmaz**, kullanıcıdan istenir. |
| `sex`        | yok                                | **`gender` var**        | Ad ve **değer alanı farklı**. Hosted `gender`'ın gerçek değer kümesi envanterde yok; migration yazılmadan **önce** okunmalı (§12 A-4).            |
| `height_cm`  | yok                                | **var**                 | Hosted'da mevcut; yerelde eklenecek. Tip/kısıt uyumu doğrulanmalı.                                                                                |
| `weight_kg`  | yok                                | **var**                 | Aynı.                                                                                                                                             |

> `docs/HOSTED-DATA-INVENTORY.md` §6 madde 3 zaten "hosted'daki fazla kolonlar
> (`age`/`height_cm`/`weight_kg`/`gender`/...) ayrı bir iş kalemidir" diyor. Bu
> spesifikasyon o iş kalemini **ön koşul** hâline getirir (§11 L0).

### 4.15 `sex` alanının ürün dili — açık karar

| Soru                            | Karar                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zorunlu mu?                     | **Kayıt sırasında hayır.** Yalnızca **cinsiyete bağlı bir analit yorumlanacağı anda** istenir; istendiği yerde niçin istendiği yazılır: "Bazı laboratuvar değerlerinin referans aralığı biyolojik cinsiyete göre değişir."                    |
| "Belirtmek istemiyorum" var mı? | **Evet** — `undisclosed`. NULL ("hiç sorulmadı") ile `undisclosed` ("soruldu, paylaşmak istemedi") **farklı** değerlerdir; ikisi de yorumu aynı şekilde `unknown` yapar ama UI'da farklı davranır (NULL'a sorulur, `undisclosed`'a sorulmaz). |
| Aralık seçilemezse ne olur?     | `status: unknown`, `unknown_reason: sex_required`. Değer, birimi ve laboratuvarın kendi aralığı **yine gösterilir**; yalnızca bizim yorumumuz gösterilmez. Düzeltici eylem: "Cinsiyet bilgisini eklerseniz bu değer yorumlanabilir."          |
| Cinsiyetten bağımsız analitler? | Katalog satırı `sex = 'any'`; bu analitler `sex` NULL olsa da **normal yorumlanır**. Danışan cinsiyet vermeden panelinin büyük kısmını görebilir.                                                                                             |
| Kimlik/hitap cinsiyeti?         | **Ayrı konudur ve v1 kapsamı dışıdır.** `comment on column` metni açıkça yazar: "Yalnızca biyolojik referans aralığı seçimi içindir; hitap/kimlik alanı değildir."                                                                            |
| Türetme?                        | **Yasak.** `sex`, addan, boydan, kilodan, avatardan veya başka bir analitten **asla çıkarılmaz**. Girilmemişse bilinmiyordur.                                                                                                                 |
| Kim değiştirebilir?             | Danışan kendi satırında; koç danışanın satırında (mevcut `profiles` UPDATE politikası "S veya K" — `supabase/README.md` §4). Değişiklik geçmiş `lab_result_insights` satırlarını **etkilemez** (§4.12).                                       |

---

## 5. Yorumlama motoru

### 5.1 Konum ve saflık

`ai_backend/app/services/lab_insights.py` — `recommendation_engine.py` desenini izler:

- **Saf fonksiyon.** Veritabanına, dosya sistemine, ağa, saate erişmez. Aynı girdi → aynı çıktı.
- **Rastgelelik yok, LLM yok, vision sağlayıcı yok.** Bu uç bir model çağırmaz.
- Girdi/çıktı Pydantic v2 (`ai_backend/app/schemas/lab.py`), `extra="forbid"`.

```python
def compute_lab_insights(
    inputs: LabInsightInputs,
    ranges: ReferenceRangeSet,
) -> LabInsightResult: ...
```

> Ayrıştırıcı (`lab_extraction.py`) ile yorumlayıcı (`lab_insights.py`) **ayrı
> modüllerdir** ve birbirini import etmez. Ayrıştırıcı olasılıksal olabilir; yorumlayıcı
> asla. Bu sınır, mimari testle korunur (§10.2).

### 5.2 Girdi ve çıktı şekli

`LabInsightInputs`:

| Alan             | Tip                                     | Not                                                                      |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `age_years`      | `int \| None`                           | Doğum tarihinden **sunucuda** hesaplanır; motor tarih aritmetiği yapmaz. |
| `sex`            | `'female'\|'male'\|'undisclosed'\|None` |                                                                          |
| `fasting_state`  | `'fasting'\|'non_fasting'\|'unknown'`   |                                                                          |
| `collected_hour` | `int \| None`                           | 0–23. Diurnal analitler için bağlam faktörü (§5.6).                      |
| `measurements`   | `list[LabMeasurement]`                  | `max_length=200`.                                                        |
| `context`        | `LabContext`                            | §5.6.                                                                    |

`LabMeasurement`: `analyte_code: str`, `value_canonical: float | None`, `unit_canonical: str | None`.
(Ham değer/birim motora **girmez** — motor dönüşüm yapmaz, §4.13.)

`LabContext`: `supplement_codes: list[str]`, `recent_training_load: 'none'|'light'|'moderate'|'heavy'|None`,
`nutrition_summary_codes: list[str]`. **Hepsi kod listesidir; serbest metin yoktur.**

`ReferenceRangeSet`: `set_id`, `source_name`, `source_version`, `ranges: list[ReferenceRange]`,
`analytes: list[AnalyteMeta]`. Motor **yalnızca** bu nesnedeki aralıkları kullanır (Y-14).

`LabInsightResult`: `engine_version`, `range_set_id`, `insights: list[LabInsight]`,
`summary: LabInsightSummary`.

`LabInsight`:

| Alan               | Tip                                          | Not                                                                                           |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `analyte_code`     | `str`                                        |                                                                                               |
| `status`           | `'below'\|'within'\|'above'\|'unknown'`      |                                                                                               |
| `severity`         | `'borderline'\|'notable'\|'critical'\| None` | `within`/`unknown` → `None`.                                                                  |
| `deviation_ratio`  | `float \| None`                              |                                                                                               |
| `reference_range`  | `SelectedRange \| None`                      | `lower`, `upper`, `unit`, `sex_scope`, `age_min`, `age_max`, `source_name`, `source_version`. |
| `explanation_keys` | `list[str]`                                  | §5.3.                                                                                         |
| `context_factors`  | `list[str]`                                  | §5.6.                                                                                         |
| `unknown_reason`   | `str \| None`                                | §5.5.                                                                                         |

`LabInsightSummary`: `total`, `out_of_range`, `max_severity`, `unknown_count`.
**Serbest özet cümlesi yoktur** (Y-12; `RecommendationResponse.summary` deseni burada
**taklit edilmez**).

### 5.3 Metin: yalnızca şablon anahtarı

Motor cümle üretmez. `explanation_keys` sabit, nokta ayraçlı anahtarlardır:

| Anahtar deseni                   | Ne anlatır                                    |
| -------------------------------- | --------------------------------------------- |
| `lab.analyte.<CODE>.description` | Analit ne ölçer (nötr, tanımlayıcı).          |
| `lab.status.<status>.<severity>` | Konum + sapma niteliği.                       |
| `lab.factor.<factor_code>`       | Bağlam faktörü (§5.6).                        |
| `lab.unknown.<unknown_reason>`   | Neden yorumlanamadı + düzeltici eylem.        |
| `lab.action.consult_physician`   | Yalnızca `severity = 'critical'` ile eklenir. |

- Türkçe metinler **frontend'de** tek sözlükte: `src/lib/lab/messages.ts`
  (`Record<string, string>`). Motor tarafında metin **hiç yoktur**.
- Sözlükte karşılığı olmayan bir anahtar gelirse UI **anahtarı ham göstermez**; satırı
  gizler ve `logger.warn` üretir. Eksik anahtar testle yakalanır (§10.5).
- Şablonlar parametre alabilir (`{value}`, `{lower}`, `{upper}`, `{unit}`); parametreler
  motor çıktısındaki **sayısal alanlardan** doldurulur, motordan metin olarak gelmez.
- **Sorumluluk metni bir `explanation_key` DEĞİLDİR** — §6.

### 5.4 Severity formülü

Kanonik birimde, seçilmiş aralık `[L, U]` için:

```
status:
  v < L                    -> below
  v > U                    -> above
  aksi                     -> within        (severity = None)

sapma oranı (yalnızca below/above):
  W = U - L                                  (iki uçlu aralık; W > 0)
  d = (L - v) / W          eğer v < L
  d = (v - U) / W          eğer v > U

severity:
  d <= t1                  -> borderline
  t1 < d <= t2             -> notable
  d > t2                   -> critical

varsayılan eşikler (config'den değiştirilebilir):
  t1 = 0.10
  t2 = 0.50
analite özel ezme: lab_analytes.severity_t1 / severity_t2 (NULL değilse kullanılır)
```

**Kaynak açık kritik sınır verdiyse formül ezilir** (öncelik sırası):

```
1. critical_low / critical_high dolu ise:
       v <= critical_low  veya  v >= critical_high   -> critical
   (bu kontrol HER ZAMAN önce yapılır)
2. aksi hâlde yukarıdaki d formülü
```

**Tek yönlü aralık** (`lower_bound` veya `upper_bound` NULL):

- `W` tanımsızdır → `d` hesaplanamaz.
- `critical_low`/`critical_high` doluysa yalnızca `critical` / değilse `notable` verilir.
- İkisi de yoksa: `status` doğru üretilir (`below`/`above`), `severity = None`,
  `deviation_ratio = None`. **Uydurulmuş bir severity üretilmez.**

Eşiklerin gerekçesi: `d` boyutsuzdur ve analit ölçeğinden bağımsızdır; aynı eşik `mmol/L`
ile `ng/mL` analitlerinde aynı anlamı taşır. `t1 = 0.10` "aralık genişliğinin %10'u kadar
dışında" (analitik ölçüm değişkenliği mertebesi), `t2 = 0.50` "aralık genişliğinin yarısı
kadar dışında" demektir. Bu eşikler **tıbbi bir kaynaktan gelmemektedir**; ürün içi sapma
niteleme eşikleridir ve kaynak açık kritik sınır verdiğinde (kural 1) **her zaman** ona
bırakılır. §12 A-5'te gözden geçirilmelidir.

### 5.5 Eksik veri → `unknown`

| Değer                    | Koşul                                                           | UI davranışı                                          |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------- |
| `analyte_not_in_catalog` | `analyte_code` `ReferenceRangeSet.analytes` içinde yok          | Değer gösterilir, yorum yok.                          |
| `no_reference_range`     | Analit katalogda var, uygun `(sex, age)` aralığı yok            | Değer + laboratuvarın aralığı gösterilir.             |
| `sex_required`           | Eşleşen aralıklar cinsiyete özel, `sex` NULL veya `undisclosed` | Düzeltici eylem: cinsiyet ekleme çağrısı (§4.15).     |
| `age_required`           | Eşleşen aralıklar yaşa özel, `age_years` NULL                   | Düzeltici eylem: doğum tarihi ekleme çağrısı.         |
| `age_out_of_catalog`     | `age_years` hiçbir yaş aralığına düşmüyor (ör. <18)             | Kapsam dışı bilgisi gösterilir.                       |
| `unit_not_convertible`   | `value_canonical is null` (§4.13)                               | Ham değer + birim gösterilir; birim düzeltme çağrısı. |
| `value_implausible`      | `value_canonical` `plausible_min..max` dışında                  | "Girilen değeri kontrol edin" — **`critical` DEĞİL.** |

**Kurallar:**

- Öncelik sırası yukarıdaki tablo sırasıdır; ilk eşleşen sebep döner.
- `unknown` **hiçbir zaman** koç bildirimi tetiklemez (§7.1) — bilmediğimiz şey bulgu değildir.
- `value_implausible` bilinçli olarak `critical`'dan **önce** değerlendirilir: 1000 kat
  yanlış ayrıştırılmış/girilmiş bir değeri "kritik" diye hekime yönlendirmek, sistemin
  üretebileceği en kötü yanlış pozitiftir. Bu, §2.5'teki ayrıştırma riskine karşı **son
  savunma hattıdır**.
- Motor `unknown` durumunda **hiçbir aralık uydurmaz**: `reference_range = None`.

### 5.6 Bağlam faktörleri (`context_factors`)

Amaç: Y-4'ü karşılamak, Y-11'i ihlal etmeden.

- `lab_analytes.context_factor_codes` = bu analiti **etkileyebilecek** faktör kodları
  (katalog verisi, kaynağıyla birlikte yüklenir).
- Motor bu listeyi, bu danışan için **fiilen geçerli** olanlarla kesiştirir:

| Faktör kodu örneği      | Geçerlilik kaynağı                                              |
| ----------------------- | --------------------------------------------------------------- |
| `fasting_unknown`       | `panel.fasting_state = 'unknown'`                               |
| `non_fasting`           | `panel.fasting_state = 'non_fasting'`                           |
| `sample_time_evening`   | `collected_hour >= 18` (diurnal analitlerde)                    |
| `recent_heavy_training` | `context.recent_training_load = 'heavy'`                        |
| `supplement_present`    | `context.supplement_codes` ∩ analitin ilgili supplement kodları |
| `lab_range_differs`     | Laboratuvarın aralığı bizimkinden farklı (§4.11)                |

- Çıktı **kod listesidir**; her kod `lab.factor.<code>` şablonuna bağlanır.
- Şablon dili **nötr ve koşulludur**: "Bu ölçüm sırasında yoğun antrenman yapılmış
  görünüyor; bazı değerler bundan **etkilenebilir**." — "bu yüzden yüksek çıkmış"
  **yasaktır** (Y-11).
- Supplement bilgisi yalnızca bir **varlık** bildirimidir; hangi supplementin hangi analiti
  nasıl değiştirdiği **söylenmez**.

---

## 6. Sorumluluk metni (arayüz sabiti)

### 6.1 Kural

Yorumlama çıktısının göründüğü **her** yüzeyde, kalıcı ve görünür bir uyarı bulunur.

**Öz (korunması şart olan anlam):**

> Ben sadece bir önerme robotuyum. Koçunuza ve doktorunuza danışın.

Bu öz şunları taşır ve nihai metin bunları **kaybedemez**: (1) sistem öneri/gözlem üretir,
(2) teşhis koymaz, (3) muhatap koç ve hekimdir. Birebir cümle ürün dili çalışmasında
cilalanacaktır; **anlam ve yerleşim burada sabitlenir.**

### 6.2 Yerleşim ve davranış

| Kural                                                                                                                                              | Gerekçe                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Metin **motor çıktısından gelmez**; `src/lib/lab/disclaimer.ts` arayüz sabitidir.                                                                  | Motor bir gün anahtarı unutursa uyarı kaybolmamalı. Uyarı, verinin değil arayüzün özelliğidir. |
| **Kapatılamaz, gizlenemez, "bir daha gösterme" seçeneği yoktur.**                                                                                  | Tek seferlik onay, altı ay sonraki bir `critical` bulguda hiçbir koruma sağlamaz.              |
| Sonuçlarla **aynı ekranda ve görünür alanda**; yalnızca sayfa dibinde küçük punto değil.                                                           | Uyarının işlevi görülmesidir.                                                                  |
| **Danışan paneli, koç panel görünümü ve her dışa aktarım** (PDF/görsel) çıktısında bulunur.                                                        | Koç da bu çıktının sınırlarını bilerek okumalıdır; paylaşılan bir görüntü bağlamsız dolaşır.   |
| `severity = 'critical'` bulgu varsa uyarı **daha belirgin** sunulur (yükseltilmiş görsel ağırlık) ve `lab.action.consult_physician` metni eklenir. | Y-6.                                                                                           |
| Belirginleştirme **aciliyet dili kullanmaz** ("acil", "derhal", "hemen" yasak).                                                                    | Y-13 — triyaj yapılmıyor.                                                                      |
| Görsel dil ADR-0015 token'larından gelir (`warning` / `danger`, `text-secondary`); ham renk kullanılmaz.                                           | Faz 1.6 AC-1.6.2 (ham `#8b5cf6` sıfır) ile tutarlılık.                                         |

### 6.3 Test edilebilirlik

- Bileşen testi: yorumlama gösteren her bileşen render edildiğinde uyarı metni DOM'da
  bulunur (§10.6).
- E2E: uyarı görünür ve **kapatma kontrolü yoktur** (negatif assertion).
- `critical` içeren panelde `lab.action.consult_physician` metni de bulunur.

---

## 7. Koç bildirimi

### 7.1 Tetikleme kuralı

| Durum                                                  | Bildirim                                     |
| ------------------------------------------------------ | -------------------------------------------- |
| `within`                                               | Hayır                                        |
| `unknown` (her sebep)                                  | Hayır                                        |
| `below`/`above` + `severity = borderline`              | **Hayır**                                    |
| `below`/`above` + `severity = notable`                 | **Evet**                                     |
| `below`/`above` + `severity = critical`                | **Evet**                                     |
| `below`/`above` + `severity = None` (tek yönlü aralık) | **Evet** — sapma var, büyüklüğü nitelenemedi |

Ayrıca: bildirim **yalnızca `lab_panels.confirmed_at IS NOT NULL`** olan panellerde
tetiklenir. Onaylanmamış (ayrıştırılmış ama doğrulanmamış) bir panel koça bildirilmez —
aksi hâlde yanlış ayrıştırılmış bir değer koça "bulgu" olarak gider.

Gerekçe (`borderline` neden hariç): `d <= 0.10` analitik ölçüm değişkenliği mertebesindedir;
her panelde birkaç analit bu bantta olur. Koçu her panelde bildirimle doldurmak, gerçek bir
`critical` bildirimini görünmez kılar. Danışan `borderline` sonuçları panelinde **görür**;
yalnızca koç bildirimi tetiklenmez.

### 7.2 Kanal

**Mevcut `notifications` tablosu üzerinden gönderilir; ayrı kuyruk açılmaz.**

Doğrulanmış uyum:

- `notifications` bugün `(id, client_id, title, message, is_read, created_at)` kolonlarına
  sahiptir (`20260816090000_initial_schema.sql:78-86`; `student_id` → `client_id` yeniden
  adlandırması `20260817090000_rename_roles.sql`).
- `client_id` **alıcıdır**. Koça bildirim yazmak mevcut politikayla **zaten mümkündür**:
  `notifications_insert` = `is_coach() OR client_id = auth.uid() OR is_coach_profile(client_id)`
  (`supabase/README.md` §4; `20260816100000_fix_rls_visibility.sql`).
- **Uyarı (mevcut, doğrulanmış):** `notifications_select` değiştirilmemiştir — danışan koça
  yazdığı bildirimi geri **okuyamaz**. Bu yüzden insert'e `.select()` / `RETURNING`
  **zincirlenmemelidir**, aksi hâlde satır yazılsa bile sorgu RLS hatasıyla döner.

`notifications` tablosuna laboratuvara özel kolon **eklenmez**. Meta veri ve idempotency
ayrı tabloda:

`lab_panel_coach_alerts`

| Kolon                | Tip            | Not                                                     |
| -------------------- | -------------- | ------------------------------------------------------- |
| `id`                 | `uuid`         | PK.                                                     |
| `panel_id`           | `uuid`         | `not null references lab_panels on delete cascade`.     |
| `coach_id`           | `uuid`         | `not null references profiles(id)`.                     |
| `content_hash`       | `text`         | `not null`. §7.4.                                       |
| `out_of_range_count` | `integer`      | `not null`.                                             |
| `max_severity`       | `lab_severity` | Nullable.                                               |
| `notification_id`    | `uuid`         | Nullable `references notifications on delete set null`. |
| `created_at`         | `timestamptz`  | `not null default now()`.                               |

Kısıt: `unique (panel_id, coach_id, content_hash)`.

### 7.3 Gizlilik — bildirim metninde ne geçer

**Karar: ham laboratuvar değeri, analit adı ve severity etiketi bildirim metninde GEÇMEZ.**

Metin şablonu (`lab.notify.coach.out_of_range`):

> "{client_name} — {collected_date} tarihli laboratuvar paneli. {count} sonuç referans
> aralığının dışında. Ayrıntı için panele bakın."

| İçerik                  | Geçer mi  | Gerekçe                                                                                                                              |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Danışan adı             | Evet      | Koçun eyleme geçmesi için zorunlu; koç zaten bu danışanın verisini görmeye yetkilidir.                                               |
| Panel tarihi            | Evet      | Aynı danışanın iki paneli ayırt edilebilsin.                                                                                         |
| Referans dışı sayısı    | Evet      | Düşük özgüllükte, eyleme dönük. Hiçbir sağlık hipotezi taşımaz.                                                                      |
| **Analit adı**          | **Hayır** | "TSH referans dışı" tek başına **spesifik bir sağlık hipotezi** açıklar; bildirim satırı panelden çok daha geniş yüzeylerde görünür. |
| **Ham değer/birim**     | **Hayır** | Aynı gerekçe, daha güçlü.                                                                                                            |
| **Severity etiketi**    | **Hayır** | "kritik" kelimesi bildirim listesinde/kilit ekranında bağlamsız okunur ve Y-13'ü ihlal eden bir aciliyet algısı üretir.              |
| **`overridden` rozeti** | **Hayır** | Panelde gösterilir (§3.5), bildirimde değil.                                                                                         |

Gerekçenin somut dayanakları (hepsi doğrulandı):

1. **Bildirim gövdesi maskelenmiyor.** `src/lib/logger.ts:20-28` redact listesi yalnızca
   kimlik bilgisi alanlarını içerir; `message`, `email`, `full_name`, sağlık alanları
   listede yoktur (Faz 1.5 Kova 3 #7, açık bulgu).
2. **Bildirim ileride push'a bağlanacak.** Plan §10 (Faz 7) olay bazlı push'u
   `notification_outbox` üzerinden Expo Push Service'e gönderiyor. Payload üçüncü taraf bir
   servisten geçer ve **kilit ekranında** görünür.
3. **PWA runtime cache.** `next.config.mjs` runtime cache'i yanıtları cihazda tutuyor
   (Faz 1.5 Kova 3 #17). Paylaşılan cihaz senaryosunda bildirim listesi, panel ekranından
   çok daha kolay görülür.
4. Panelin kendisi RLS + oturum arkasındadır ve koç oraya bir tık uzaktadır; ham veriyi
   bildirime taşımanın **ürün kazancı yok denecek kadar azdır.**

Aynı kural danışana giden bildirimler için de geçerlidir (v1'de danışana bildirim yoktur;
eklenirse aynen uygulanır).

### 7.4 Gürültü kontrolü ve idempotency

- **Idempotency anahtarı:** `content_hash` = `(panel_id, sıralı [analyte_code, status,
severity] üçlüleri, max_severity)` üzerinden üretilen kararlı hash. Aynı hash ile ikinci
  satır **yazılamaz** (`unique`), dolayısıyla ikinci bildirim gitmez.
- Panel düzenlenir / yeniden yorumlanır ve bulgu kümesi **değişirse** hash değişir → yeni
  bildirim. Bulgu kümesi aynıysa (ör. yalnızca not düzenlendi) gitmez.
- **Panel bazlı toplama:** bir panelde 7 referans dışı sonuç varsa **tek** bildirim gider.
- Bildirim yazımı, panel yorumlamasıyla **aynı transaction'da** yapılır; yorumlama geri
  alınırsa bildirim de alınır.
- Aynı danışan için kısa aralıklarla birden çok panel girilirse ek zaman penceresi kısıtı
  v1'de **yoktur** (ayrı paneller ayrı olaylardır).

---

## 8. RLS ve gizlilik

### 8.1 Matris

Kısaltmalar `supabase/README.md` §4 ile aynı: **S** = satır sahibi (`client_id = auth.uid()`),
**K** = koç (`public.is_coach()`).

| Tablo                      | SELECT                              | INSERT                   | UPDATE                   | DELETE                   |
| -------------------------- | ----------------------------------- | ------------------------ | ------------------------ | ------------------------ |
| `lab_documents`            | S veya K                            | S veya K                 | S veya K                 | S veya K                 |
| `lab_import_drafts`        | belge üzerinden S veya K (`EXISTS`) | **service_role**         | belge üzerinden S veya K | belge üzerinden S veya K |
| `lab_panels`               | S veya K                            | S veya K                 | S veya K                 | S veya K                 |
| `lab_results`              | panel üzerinden S veya K (`EXISTS`) | panel üzerinden S veya K | panel üzerinden S veya K | panel üzerinden S veya K |
| `lab_result_insights`      | sonuç→panel üzerinden S veya K      | **service_role** (motor) | **yok** (değiştirilemez) | **yok**                  |
| `lab_analytes`             | tüm `authenticated`                 | **service_role**         | **service_role**         | **service_role**         |
| `lab_analyte_synonyms`     | tüm `authenticated`                 | **service_role**         | **service_role**         | **service_role**         |
| `lab_reference_range_sets` | tüm `authenticated`                 | **service_role**         | **service_role**         | **service_role**         |
| `lab_reference_ranges`     | tüm `authenticated`                 | **service_role**         | **service_role**         | **service_role**         |
| `lab_unit_conversions`     | tüm `authenticated`                 | **service_role**         | **service_role**         | **service_role**         |
| `lab_panel_coach_alerts`   | K                                   | **service_role**         | **yok**                  | **yok**                  |

- **P-1'in RLS karşılığı:** `lab_import_drafts` INSERT yalnızca `service_role`'dedir
  (ayrıştırıcı yazar), `lab_results` INSERT ise onay akışından geçen kullanıcı
  oturumundadır. Ayrıştırıcının `lab_results`'a yazma yolu **yoktur**.
- Tek koçlu model (ADR-0007): koç **tüm** danışanların laboratuvar verisini görür.
- `lab_results` / `lab_import_drafts` yetkisi üst tablo üzerinden `EXISTS` ile türetilir
  (`20260817110000` §6'daki `workout_plan_exercises` deseni).
- `anon`: **tüm** yeni tablolarda `revoke all` (`20260817110000:122-123` deseni).
- Referans katalog tabloları `exercises` / `food_database` desenini izler ama **daha
  sıkıdır**: oralarda koç yazabiliyor, burada **koç da yazamaz.** Gerekçe: katalog,
  versiyonlanmış ve kaynağı belli bilimsel bir artefakttır (§4.12); elle düzenlenmesi
  geçmiş yorumların denetlenebilirliğini bozar. Yükleme yolu `service_role` ile çalışan bir
  script'tir (`scripts/import-catalog.mjs` deseni).
- `lab_result_insights` **değiştirilemez**: yeniden yorumlama yeni `revision` satırıdır.

### 8.2 Denetim izi baştan

`lab_documents.uploaded_by`, `lab_panels.confirmed_by` ve `lab_results.origin` **not
null**'dır (`origin` her zaman dolu). Gerekçe: Faz 1.5 Kova 3 #16 "plan tablolarında denetim
izi yok" bulgusu (ADR-0014'ün kabul edilen bedeli). Sağlık verisinde aynı bedeli kabul
etmiyoruz — bir sonucun PDF'ten mi geldiği, düzeltildiği mi, elle mi girildiği ve kimin
onayladığı baştan kayıtlıdır. Trigger `uploaded_by`/`confirmed_by` değerlerini `auth.uid()`
ile doğrular; istemciden gelen değer **kabul edilmez** (`messages_apply_conversation_key`
trigger deseni, `20260817140000`).

### 8.3 Storage

§2.3'teki kurallar. MIME whitelist yalnızca `application/pdf`; boyut sınırı 10 MB (bucket
seviyesinde de ayarlanır, ama sunucu doğrulaması birincildir).

### 8.4 Loglama — sağlık verisi ve kişisel veri maskeleme

`src/lib/logger.ts` `REDACT_PATHS` listesine **eklenecek** alanlar (bugün listede yalnızca
kimlik bilgisi alanları var — `logger.ts:20-28`):

```
'*.value_raw', '*.value_canonical', '*.analyte_code',
'*.measurements', '*.insights', '*.lab_results',
'*.raw_excerpt', '*.raw_label',
'*.extracted_name_raw', '*.original_filename',
'*.birth_date', '*.sex'
```

Kurallar:

- Laboratuvar değeri, PDF'ten çıkarılan ham satır ve çıkarılan ad **hiçbir** log satırında,
  hata mesajında veya `ApiError.details` içinde görünmez.
- `handleAiProxy` upstream hata gövdesini logluyor (`proxy.ts:145-149`,
  `body: upstreamText.slice(0, 2000)`). Laboratuvar uçlarında bu gövde **loglanmaz**;
  yalnızca status kodu ve `request_id` loglanır. Bu, jenerik proxy'den **bilinçli bir
  sapmadır** ve route dosyasında yorumla belgelenir.
- Zod/Pydantic doğrulama hataları `formatZodError` ile `{path, message}` döner — `message`
  alanı **değeri yansıtmamalıdır**.
- Belge içeriği (PDF baytları veya çıkarılmış tam metin) **hiçbir yerde** kalıcı olarak
  loglanmaz; çıkarılmış metin yalnızca istek ömrü boyunca bellekte tutulur ve `raw_excerpt`
  dışında saklanmaz (§3.6).
- Faz 1.5 AC-1.5.8 zaten "loglarda sağlık verisi maskeli — redact testiyle kanıtlı" diyor;
  bu tablolar o testin kapsamına dahil edilir.

### 8.5 `FORCE ROW LEVEL SECURITY`

Bu spesifikasyondaki **her** tablo `enable` **ve** `force row level security` ile kurulur.

Gerekçe: Faz 1.5 Kova 3 #1 açık bulgusudur (`supabase/**` genelinde `force row level
security` grep'i 0 sonuç; 13 tabloda yalnızca `enable`). AC-1.5.2 şu sorgunun boş dönmesini
şart koşuyor:

```sql
select relname from pg_class where relrowsecurity and not relforcerowsecurity;
```

Yeni tablolar bu kriteri **ilk günden** karşılamalıdır; aksi hâlde bu özellik Faz 1.5'in
kapattığı bulguyu yeniden açar.

---

## 9. API sözleşmesi

### 9.1 Uçlar

| Uç                                  | Katman  | Amaç                                                                      |
| ----------------------------------- | ------- | ------------------------------------------------------------------------- |
| `POST /api/lab/documents`           | Next.js | PDF yükleme + doğrulama + saklama + isim doğrulama + ayrıştırma tetikleme |
| `POST /api/lab/panels/{id}/confirm` | Next.js | Onay ekranı çıktısını `lab_results`'a yazar, yorumlamayı tetikler         |
| `POST /api/ai/lab-insights`         | Next.js | Onaylanmış bir paneli yorumlar                                            |
| `POST /analyze/lab-document`        | FastAPI | Metin çıkarımı + tür tespiti + isim skoru + taslak analit listesi         |
| `POST /analyze/lab-panel`           | FastAPI | Deterministik yorumlama motoru                                            |

### 9.2 `POST /api/lab/documents` (multipart)

| Kural           | Detay                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kimlik          | Bearer zorunlu (I-1, ADR-0011); doğrulama `proxy.ts:58-85` bloğunun aynısı.                                                                                                                    |
| Gövde           | `file` (tek PDF). **Başka alan yok.**                                                                                                                                                          |
| `client_id`     | **İstemciden alınmaz.** Sunucu `auth.getUser()` ile çözer. Koç başka danışan adına yüklüyorsa `client_id` ayrı bir yoldan (koç panelinden seçim) gelir ve `is_coach()` kontrolüyle doğrulanır. |
| Doğrulama       | §2.2 K-1..K-9, **sırayla**, saklamadan önce.                                                                                                                                                   |
| Upstream        | Baytlar sunucudan sunucuya FastAPI'ye multipart iletilir; `expected_full_name` form alanı olarak eklenir (§3.2).                                                                               |
| Yanıt           | `{ document_id, kind, page_count, name_match_status, name_match_reason, draft_count, unparsed_count }`                                                                                         |
| **Yanıtta yok** | `extracted_name_raw` (§3.6), tam metin, PDF baytları.                                                                                                                                          |

**Neden imzalı URL değil, baytlar:** FastAPI'ye bir URL verip indirtmek, backend'e istek
tetikleyen bir girdi verir (SSRF sınıfı yüzey) ve `ai_backend`'e storage erişimi
gerektirir. Baytları sunucudan sunucuya taşımak bu yüzeyi hiç açmaz.

### 9.3 `POST /api/ai/lab-insights`

`src/app/api/ai/lab-insights/route.ts`

| Kural        | Detay                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Gövde        | `{ "panel_id": "<uuid>" }` — **başka hiçbir alan yok.**                      |
| `client_id`  | **İstemciden alınmaz** (plan §5.3). Panelin sahibi RLS ile doğrulanır.       |
| Ön koşul     | `lab_panels.confirmed_at IS NOT NULL`; değilse 409 `PANEL_NOT_CONFIRMED`.    |
| Runtime      | `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`. |
| Yanıt        | `LabInsightResult` + `X-Request-ID`, `Cache-Control: no-store`.              |
| Hata gövdesi | Mevcut `ApiErrorBody` (`src/lib/api/types.ts`).                              |

**Bilinçli sapma — jenerik `handleAiProxy` kullanılmaz.** Mevcut yardımcı
(`src/lib/api/proxy.ts`) yalnızca doğrular ve gövdeyi **aynen** iletir; veri
zenginleştirmesi yapmaz. Bu uçta gövde sunucuda kurulur:

```
1. Bearer doğrula -> user
2. Kullanıcının OTURUMUYLA (RLS altında) yükle:
     lab_panels(panel_id)   -> yoksa/erişilemiyorsa 404 (403 değil - varlık sızdırma)
     lab_results(panel_id)
     profiles(panel.client_id).birth_date, sex
     aktif lab_reference_range_sets + ilgili lab_reference_ranges + lab_analytes
3. age_years'ı SUNUCUDA hesapla — collected_at anına göre, now()'a göre DEĞİL
4. LabInsightInputs + ReferenceRangeSet gövdesini kur, FastAPI'ye POST et
5. Yanıtı lab_result_insights'a yaz (yeni revision)
6. §7 kuralına göre koç bildirimi
7. LabInsightResult'ı istemciye dön
```

- Adım 2 **kullanıcının oturumuyla** yapılır → yetkisiz panel zaten görünmez (I-2).
- Adım 5/6 yükseltilmiş yetki gerektirir. `src/lib/supabase/admin.ts` **silinmiştir** (Faz
  1.5 Kova 1 #10: uygulama kodunda `SUPABASE_SERVICE_ROLE_KEY` tüketicisi yok). Bu ucun
  service_role istemcisini geri getirmesi **yeni bir güvenlik yüzeyidir**; **önerilen
  alternatif** yazmayı `SECURITY DEFINER` bir RPC'ye devretmektir (`save_workout_plan`
  deseni) — service_role anahtarı Next.js sürecine hiç girmez. Nihai karar §12 A-7.
- `age_years`'ın `collected_at`'a göre hesaplanması **kritiktir**: 3 yıl önceki bir panel
  bugünkü yaşla yorumlanırsa yaş bandı yanlış seçilir.

### 9.4 FastAPI uçları

`ai_backend/app/routers/lab.py`, `app/schemas/lab.py`,
`app/services/{lab_extraction,lab_insights,text_normalize}.py`.

```python
router = APIRouter(tags=["lab"], dependencies=[Depends(api_key_guard)])

@router.post("/analyze/lab-document", response_model=LabDocumentExtractResponse)
@limiter.limit("5/minute")
async def analyze_lab_document(request: Request, ...) -> LabDocumentExtractResponse: ...

@router.post("/analyze/lab-panel", response_model=LabInsightResponse)
@limiter.limit("10/minute")
async def analyze_lab_panel(request: Request, payload: LabInsightRequest) -> LabInsightResponse: ...
```

- Yol ön eki mevcut yönlendiricilerle uyumludur: bugün `/analyze/workout`
  (`routers/workout.py:22`) ve `/recommendations` (`routers/recommendations.py:15`)
  **ön eksizdir**; `main.py` hiçbir router'a `prefix` vermez. Plan §5.1'in bahsettiği `/v1`
  ön eki **henüz yoktur** — §12 A-8.
- Tüm modeller `model_config = ConfigDict(extra="forbid")`.
- Alan adları **snake_case** ve TS tarafıyla birebir (`src/lib/api/types.ts` sözleşmesi).
- `LabInsightRequest`'te `client_id` alanı **yoktur.** (Mevcut `RecommendationRequest`'te
  `client_id: str | None` vardır — `schemas/recommendations.py:27`. Bu, planın §5.3
  kuralıyla çelişen eski bir alandır ve yeni uçlarda **tekrarlanmaz**.)
- FastAPI **veritabanına bağlanmaz**; `ReferenceRangeSet`'i ve `expected_full_name`'i
  istekten alır.

`LabDocumentExtractResponse`:

| Alan                 | Tip                          | Not                                                                     |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `kind`               | `text_layer\|scanned\|mixed` |                                                                         |
| `page_count`         | `int`                        |                                                                         |
| `scanned_pages`      | `list[int]`                  |                                                                         |
| `name_match_status`  | `matched\|failed`            | `overridden` bir kullanıcı eylemidir, backend üretmez.                  |
| `name_match_reason`  | `str \| None`                | §3.4 sebep kodu.                                                        |
| `name_match_score`   | `float \| None`              |                                                                         |
| `extracted_name_raw` | `str \| None`                | Yalnızca `matched` durumunda döner; `failed` durumunda **None** (§3.6). |
| `drafts`             | `list[LabDraftRow]`          | `name_match_status = 'failed'` ise **boş liste**.                       |

### 9.5 Rate limit ve kota

| Katman          | Sınır                                | Yer                                                                                                |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Next.js proxy   | `/api/*` mevcut sınır; AI için 20/dk | `src/proxy.ts` (IP bazlı, ADR-0005 bilinen kısıtı)                                                 |
| FastAPI belge   | 5/dk                                 | `@limiter.limit("5/minute")`                                                                       |
| FastAPI yorum   | 10/dk                                | `@limiter.limit("10/minute")`                                                                      |
| **Günlük kota** | **Kullanıcı başına 10 belge/gün**    | Postgres sayacı, atomik `INSERT ... ON CONFLICT ... UPDATE` (plan §5.3 `ai_usage_counters` deseni) |

`AI_BACKEND_API_KEY` şu anda **opsiyoneldir** ve `api_key_guard` anahtar yoksa no-op'tur
(`ai_backend/app/core/security.py:22-24` — Faz 1.5 Kova 3 #15, fail-open). Bu uçlar
AC-1.5.6 (fail-closed) karşılanmadan **devreye alınmaz** (§11.1).

### 9.6 Hata kodları

| Kod                      | HTTP | Anlam                                                          |
| ------------------------ | ---- | -------------------------------------------------------------- |
| `NOT_AUTHENTICATED`      | 401  | Bearer yok/geçersiz (mevcut kod).                              |
| `FILE_TOO_LARGE`         | 413  | K-2.                                                           |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | K-3.                                                           |
| `NOT_A_PDF`              | 415  | K-4 magic byte.                                                |
| `CORRUPT_PDF`            | 422  | K-5.                                                           |
| `ENCRYPTED_PDF`          | 422  | K-6.                                                           |
| `TOO_MANY_PAGES`         | 422  | K-7.                                                           |
| `DAILY_LIMIT_EXCEEDED`   | 429  | K-8.                                                           |
| `NAME_MISMATCH`          | 409  | §3.4 `failed` — beyan yolu sunulur.                            |
| `MULTIPLE_SUBJECTS`      | 409  | §3.4 — beyan yolu **kapalı**.                                  |
| `PANEL_NOT_CONFIRMED`    | 409  | Onay ekranı tamamlanmadan yorumlama istendi.                   |
| `PANEL_NOT_FOUND`        | 404  | Panel yok **veya** görme yetkisi yok. Ayrım yapılmaz.          |
| `VALIDATION_ERROR`       | 422  | Zod/Pydantic. `details` **değer içermez** (§8.4).              |
| `NO_ACTIVE_RANGE_SET`    | 409  | Aktif referans seti yok — yorum yapılamaz. Uydurma aralık yok. |
| `AI_BACKEND_UNAVAILABLE` | 503  | Mevcut kod.                                                    |
| `AI_BACKEND_ERROR`       | 502  | Mevcut kod; upstream gövdesi **loglanmaz** (§8.4).             |

---

## 10. Test stratejisi

### 10.1 PDF alım hattı (pytest + `tests/unit`)

| #   | Senaryo                                                       | Beklenen                                             |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| A-1 | `.pdf` uzantılı ama içeriği JPEG olan dosya                   | `NOT_A_PDF`; **bucket'a yazılmadı**                  |
| A-2 | `Content-Type: application/pdf` bildirilen ama magic byte yok | `NOT_A_PDF`                                          |
| A-3 | 10 MB + 1 bayt                                                | `FILE_TOO_LARGE`; sunucu bucket limitine güvenmedi   |
| A-4 | Parola korumalı PDF                                           | `ENCRYPTED_PDF`                                      |
| A-5 | 31 sayfa                                                      | `TOO_MANY_PAGES`                                     |
| A-6 | Dosya adı `../../etc/passwd.pdf`                              | Yol `<client_id>/<uuid>.pdf`; `..` ve `/` yolda yok  |
| A-7 | Dosya adı `x.pdf%00.exe` / çok uzun ad                        | Yol etkilenmiyor; `original_filename` temizlenmiş    |
| A-8 | Aynı dosya iki kez                                            | Tek `lab_documents` satırı (K-9), tek panel          |
| A-9 | 11. yükleme (aynı gün)                                        | `DAILY_LIMIT_EXCEEDED`; ertesi gün geçer (saat mock) |

### 10.2 Ayrıştırıcı ve mimari sınır

| #    | Senaryo                                                             | Beklenen                                                            |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| B-1  | Metin katmanlı örnek PDF                                            | `kind='text_layer'`; taslak satırlar `page_number`/`line_index` ile |
| B-2  | Metinsiz (taranmış) PDF                                             | `kind='scanned'`; `drafts` boş; hata **değil**                      |
| B-3  | Karma PDF                                                           | `kind='mixed'`; `scanned_pages` dolu                                |
| B-4  | Ondalık virgüllü değer (`1,5`)                                      | `1.5` olarak ayrıştırılır                                           |
| B-5  | Belirsiz binlik ayracı (`1.234`)                                    | `unparsed` (P-6) — tahmin yok                                       |
| B-6  | Birim okunamıyor                                                    | `unit_parsed = NULL`, `unparsed` (P-5)                              |
| B-7  | Satırda hem değer hem laboratuvar aralığı var                       | Değer doğru seçilir; belirsizse `unparsed` (P-7)                    |
| B-8  | Bilinmeyen etiket                                                   | `analyte_code = NULL`, `unparsed`                                   |
| B-9  | `confidence < 0.80`                                                 | `unparsed`; onay ekranında **varsayılan seçili değil** (P-2)        |
| B-10 | **Mimari:** `lab_extraction` modülü `lab_insights`'ı import etmiyor | Import grafiği testi                                                |
| B-11 | **Mimari:** ayrıştırıcı yolunda `lab_results` yazma çağrısı yok     | Statik kontrol + RLS testi (§10.7 R-8)                              |
| B-12 | LLM ayrıştırıcı bozuk JSON döndürüyor                               | 1 retry, sonra hata; serbest metin akışa **girmiyor**               |
| B-13 | LLM yanıtında `status`/`severity`/öneri alanı                       | Pydantic `extra="forbid"` ile **reddedilir**                        |

### 10.3 İsim doğrulaması (pytest — normalizasyon Python'da tek yerde)

| #    | Senaryo                                          | Beklenen                                             |
| ---- | ------------------------------------------------ | ---------------------------------------------------- |
| N-1  | `AYBERK ARDA` vs `Ayberk Arda`                   | `matched` / `exact`                                  |
| N-2  | `IŞIL ŞAHİN` vs `Işıl Şahin`                     | `matched` — **U+0307 tuzağı geçilmiş olmalı**        |
| N-3  | `"ŞİFRE"` benzeri girdide `toLowerCase()` sonucu | Normalizasyon U+0307 üretmiyor (birim testi)         |
| N-4  | `ARDA AYBERK` (sıra ters)                        | `matched` (sıra bağımsız)                            |
| N-5  | `A. ARDA`                                        | Baş harf eşleşmesi; skor bandına göre karar          |
| N-6  | `SAYIN AYBERK ARDA`                              | Unvan atılır, `matched`                              |
| N-7  | `AYBERK KAYA` (soyad farklı)                     | Skor 0 → `failed` (soyad kapısı)                     |
| N-8  | `MEHMET ARDA` (aynı soyad, farklı ön ad)         | `failed` — **aile üyesi yanlış pozitifi engellendi** |
| N-9  | Ad hiç yok                                       | `failed` / `name_not_found`                          |
| N-10 | İki farklı kişi adı                              | `multiple_subjects`; beyan yolu **kapalı**           |
| N-11 | `failed` durumunda yanıt                         | `drafts` boş **ve** `extracted_name_raw` None        |
| N-12 | Beyan sonrası                                    | `overridden`; ayrıştırma çalışır; koç rozeti görünür |
| N-13 | `extracted_name_raw` log çıktısında              | **Yok** (redact testi)                               |

### 10.4 Katalog bütünlüğü

- Her `lab_reference_ranges.unit` = ilgili `lab_analytes.canonical_unit`.
- Aynı `(range_set_id, analyte_code, sex)` içinde yaş aralıkları **örtüşmez** (§4.4).
- Her `analyte_code` için en az bir aralık vardır **veya** analit `is_active = false`.
- `lower_bound < upper_bound`; `critical_low <= lower_bound`; `critical_high >= upper_bound`.
- `lab_analyte_synonyms.synonym_normalized` gerçekten normalize edilmiş hâldedir
  (fonksiyondan geçirince değişmez) ve **tekildir**.
- Her `description_key` / `context_factor_codes` girdisinin sözlükte karşılığı vardır.

### 10.5 Şablon sözlüğü (`tests/unit/lab-messages.test.ts`)

- Motorun üretebileceği **her** anahtarın `src/lib/lab/messages.ts` içinde karşılığı vardır.
- Sözlükte **yasaklı terim** yoktur: hastalık/sendrom adları, "teşhis", "tanı", "tedavi",
  "doz", "kullanın", "alın", "önerilir" gibi reçete fiilleri, "acil", "derhal", "hemen"
  gibi aciliyet ifadeleri. Yasaklı liste dosyada sabittir; ihlal testi kırar (Y-10, Y-11, Y-13).
- Her `lab.status.*.critical` anahtarı `lab.action.consult_physician` ile birlikte kullanılır.

### 10.6 Sorumluluk metni

- Yorumlama gösteren **her** bileşen için: metin DOM'da var (bileşen testi).
- Kapatma/gizleme kontrolü **yok** (negatif assertion).
- `critical` bulgu varsa yükseltilmiş sunum + `lab.action.consult_physician` var.
- Koç görünümünde de var.

### 10.7 RLS senaryoları (`supabase/tests/rls.test.sql`'e eklenecek)

Mevcut desen: her senaryo `begin; set local role authenticated; set local
request.jwt.claims = ...; do $$ ... raise exception ... $$; rollback;`. Seed kimlikleri
(koç `1111...`, danışan A `2222...`, danışan B `3333...`).

| #    | Senaryo                                                | Beklenen                      |
| ---- | ------------------------------------------------------ | ----------------------------- |
| R-1  | Danışan A kendi belgesini/panelini okur                | PASS                          |
| R-2  | Danışan A, danışan B'nin belgesini okur                | 0 satır                       |
| R-3  | Danışan A, danışan B'nin `lab_results` satırını okur   | 0 satır                       |
| R-4  | Koç tüm panelleri okur                                 | PASS                          |
| R-5  | Danışan A, B'nin paneline sonuç yazar                  | RLS ihlali                    |
| R-6  | Danışan `lab_reference_ranges`'e yazar                 | `permission denied`           |
| R-7  | **Koç** `lab_reference_ranges`'e yazar                 | `permission denied`           |
| R-8  | Danışan/koç `lab_import_drafts`'a INSERT               | `permission denied` (P-1)     |
| R-9  | Danışan `lab_result_insights`'a yazar                  | `permission denied`           |
| R-10 | Danışan `lab_panel_coach_alerts` okur                  | 0 satır / denied              |
| R-11 | `anon` herhangi bir lab tablosunu okur                 | `permission denied`           |
| R-12 | Tablo sahibi bağlamında `FORCE RLS` etkin              | AC-1.5.2 sorgusu boş          |
| R-13 | `uploaded_by` istemciden farklı bir uid ile gönderilir | Trigger `auth.uid()`'e zorlar |

### 10.8 Motor birim testleri (`ai_backend/tests/test_lab_insights.py`)

| #    | Senaryo                                         | Beklenen                                               |
| ---- | ----------------------------------------------- | ------------------------------------------------------ |
| M-1  | `v == lower_bound`                              | `within`, `severity = None`                            |
| M-2  | `v == upper_bound`                              | `within`, `severity = None`                            |
| M-3  | `v` alt sınırın epsilon altında                 | `below`, `borderline`                                  |
| M-4  | `v` üst sınırın epsilon üstünde                 | `above`, `borderline`                                  |
| M-5  | `d == t1` tam eşitlik                           | `borderline` (sınır dahil)                             |
| M-6  | `d == t2` tam eşitlik                           | `notable` (sınır dahil)                                |
| M-7  | `d` t2'nin hemen üstünde                        | `critical`                                             |
| M-8  | `critical_high` dolu, `d` küçük                 | `critical` (kural 1 formülü ezer)                      |
| M-9  | Tek yönlü aralık, kritik sınır yok              | `above`, `severity`/`deviation_ratio` = None           |
| M-10 | `sex = None`, aralıklar cinsiyete özel          | `unknown` / `sex_required`, `reference_range = None`   |
| M-11 | `sex = 'undisclosed'`, aralıklar cinsiyete özel | M-10 ile **aynı**                                      |
| M-12 | `sex = None`, aralık `sex = 'any'`              | Normal yorumlanır                                      |
| M-13 | `age_years = None`, aralıklar yaşa özel         | `unknown` / `age_required`                             |
| M-14 | Yaş hiçbir banda düşmüyor                       | `unknown` / `age_out_of_catalog`                       |
| M-15 | Analit katalogda yok                            | `unknown` / `analyte_not_in_catalog`                   |
| M-16 | `value_canonical = None`                        | `unknown` / `unit_not_convertible`                     |
| M-17 | Plausible dışında **ve** aralığın çok üstünde   | `unknown` / `value_implausible` — **`critical` DEĞİL** |
| M-18 | Yaş bandı sınırı `[min, max)`                   | `age_min` dahil, `age_max` hariç                       |
| M-19 | Boş `measurements`                              | Boş `insights`, `summary.total = 0`, hata yok          |
| M-20 | Aynı girdi iki kez                              | **Bit düzeyinde aynı çıktı** (determinizm)             |
| M-21 | `context_factors` — supplement var              | Yalnızca ilgili analitlerde faktör kodu döner          |
| M-22 | Motor çıktısında serbest metin                  | Şemada `str` metin alanı **yok** (yapısal doğrulama)   |

### 10.9 Birim dönüşümü

- Aynı analitin `mg/dL` ve `mmol/L` girişleri **aynı** `value_canonical`'ı üretir (tolerans dahilinde).
- `unit_raw == canonical_unit` → dönüşüm aranmaz, `value_raw == value_canonical`.
- Tanımsız birim → `value_canonical is null`, yazma **başarısız olmaz**.
- `value_raw`/`unit_raw` dönüşümden **hiç etkilenmez** (round-trip; `raw_line` testlerinin muadili).

### 10.10 Versiyonlama regresyon testi (zorunlu)

`supabase/tests/transform.test.sql` desenine (BEGIN…ROLLBACK, `raise exception`) eklenir:

1. Aktif set `S1` ile bir sonucu yorumla → `insight(revision=1)`.
2. `S2` setini yükle (aynı analit, **farklı** sınırlar), `S1.is_active = false`.
3. Adım 1'in satırını yeniden oku: `range_lower`, `range_upper`, `status`, `severity`,
   `range_set_id` **değişmemiş** olmalı.
4. Açık yeniden yorumlama → `revision = 2` oluşur, `revision = 1` **durur**.
5. Panel görüntüsü hangi sürümle yorumlandığını gösterir.

### 10.11 E2E (`tests/e2e/lab.spec.ts`, Playwright)

Mevcut fixture deseni (`tests/e2e/fixtures.ts`, seed kullanıcıları). **Türkçe locator
kuralı:** `tests/e2e/README.md` §"Tuzak" gereği İ/ı içeren metinlerde `/i` bayrağı
kullanılmaz, birebir metin locator'ı kullanılır.

1. Danışan giriş yapar → PDF yükler → onay ekranını görür.
2. Ayrıştırılan satırlarda kaynak (sayfa/satır) görünür; bir değeri düzeltir; bir satırı reddeder.
3. Onaylar → panel oluşur; referans dışı değer, seçilen aralık ve sapma niteliği görünür.
4. **Sorumluluk metni görünür ve kapatılamaz** (§6 kanıtı).
5. Kaynak/sürüm bilgisi görünür.
6. Koç giriş yapar → bildirimi görür.
7. **Gizlilik kontrolü:** bildirim metninde analit adı, sayısal değer, severity kelimesi
   **geçmez** (negatif assertion — §7.3'ün otomatik kanıtı).
8. Koç paneli açar → ham değerleri ve (varsa) `overridden` rozetini görür.
9. **Negatif akış:** isim eşleşmeyen bir PDF yüklenir → analit listesi **hiç görünmez**,
   yalnızca beyan/silme seçeneği çıkar.

---

## 11. Fazlama önerisi

### 11.1 Konum — mevcut plandaki hangi fazdan sonra

**Öneri: Faz 2'den sonra, Faz 3'ten önce — "Faz 2.5" olarak.** Bölüm numarası
`§3a`/`§3b` konvansiyonuyla eklenir; §4–§14 numaraları ve tüm çapraz referanslar kaymaz.

| Ön koşul                                                                | Neden zorunlu                                                                                                                                                               |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Faz 1 / 1b** — `profiles` demografi kolonları + hosted şema uzlaşması | `birth_date`/`sex` olmadan aralık seçilemez. Hosted `gender`/`age` sürüklenmesi zaten Faz 1b'nin borcu (`HOSTED-DATA-INVENTORY.md` §6 madde 3).                             |
| **Faz 1.5 — güvenlik denetimi (KESİNLİKLE ÖNCE)**                       | Aşağıya bakınız.                                                                                                                                                            |
| **Faz 1.6 — görsel kimlik**                                             | Onay ekranı ve panel ekranı Katman A token'ları hazır değilken yazılırsa Faz 2'de ikinci kez elden geçer (ADR-0018). §6'nın görsel yükseltmesi token gerektirir.            |
| **Faz 2 — çekirdek akış**                                               | Koç inceleme kuyruğu deseni (form check kuyruğu), sistem mesajı (`kind='system'`) ve bildirim yüzeyleri Faz 2'de olgunlaşıyor; laboratuvar paneli bunları yeniden kullanır. |

**Faz 1.5 sağlık verisi eklenmeden ÖNCE mi sonra mı? — ÖNCE. Tartışmasız.**
PDF yükleme kararı (K1) bu bağımlılığı **daha da güçlendirdi**:

| Faz 1.5 bulgusu                                                  | Bu özellikteki karşılığı                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kova 3 #4 — Dosya yüklemede magic-byte doğrulaması yok           | §2.2 K-4 ve §2.3 tam olarak AC-1.5.5'in kapsamıdır. İki yerde iki kez yazmak yerine, sertleştirme deseni önce Faz 1.5'te kurulur, burada **yeniden kullanılır**. |
| Kova 3 #5 — Yüklenen dosya inline servis ediliyor                | §2.3 `Content-Disposition: attachment`. PDF inline açılan bir formattır; bu bulgu burada doğrudan sömürülebilir.                                                 |
| Kova 3 #1 — `FORCE ROW LEVEL SECURITY` yok                       | §8.5. Kriter ve test Faz 1.5'te üretilir.                                                                                                                        |
| Kova 3 #7 — Loglarda PII/sağlık verisi maskelenmiyor             | §8.4. Redact listesi genişletilmeden laboratuvar değeri ve çıkarılan ad loglara akar.                                                                            |
| Kova 3 #15 — `ai_backend` auth **fail-open**                     | §9.5. Anahtar yoksa `api_key_guard` no-op; PDF yükleyen uç korumasız kalır.                                                                                      |
| Kova 3 #2/#3 — Token `localStorage`'da, brute-force koruması yok | Sağlık verisi içeren bir hesabın ele geçirilme maliyeti çok daha yüksektir.                                                                                      |
| Kova 3 #6 — Güvenlik olay günlüğü yok                            | İsim doğrulaması `failed` olan yüklemeler bir güvenlik/kötüye kullanım sinyalidir; kaydedilebilmelidir.                                                          |
| Kova 3 #11 — Hosted proje sertleşmemiş                           | Hosted bucket'lar hâlâ public; oraya PDF gitmeden sertleştirme planı uygulanmalı.                                                                                |

Ters sıralama iki yönlü zarar verir: kod tabanının en hassas veri kümesi denetlenmemiş
temele oturur **ve** Faz 1.5'in denetim yüzeyi denetim sürerken büyür.

### 11.2 Alt adımlar ve kabul kriterleri

| Adım                                         | İçerik                                                                                                                                                 | Kabul kriteri                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0 — Demografi (ön koşul)**                | `profiles`: `birth_date`, `sex`, `height_cm`, `weight_kg` + hosted `gender`/`age` uzlaşması. Profil formu + ürün dili (§4.15).                         | `supabase db reset` temiz; hosted kolon eşlemesi belgelenmiş; `sex` NULL ile `undisclosed` UI'da farklı davranıyor; kolon yorumu "hitap alanı değildir" ibaresini içeriyor.                        |
| **L1 — Katalog**                             | `lab_analytes`, `lab_analyte_synonyms`, `lab_reference_range_sets`, `lab_reference_ranges`, `lab_unit_conversions` + RLS + `FORCE` + yükleme script'i. | §10.4 testleri yeşil; `authenticated` okur / **koç dahil hiç kimse yazamaz**; AC-1.5.2 sorgusu yeni tablolar için boş; kaynak adı+sürümü kayıtlı.                                                  |
| **L2 — PDF alım + isim doğrulama**           | `lab-documents` bucket, `lab_documents`, yükleme ucu, §2.2 kabul kriterleri, §3 isim doğrulama, elle doldurulabilir onay ekranı (ayrıştırma **yok**).  | §10.1 A-1..A-9 ve §10.3 N-1..N-13 yeşil; public URL ile PDF'e erişilemiyor (curl kanıtı, AC-2.3 deseni); `failed` durumunda hiçbir sağlık verisi çıkarılmıyor; beyan yolu çalışıyor.               |
| **L3 — Metin katmanı ayrıştırma**            | `lab_import_drafts`, kural tabanlı çıkarım, tür tespiti, onay ekranının ayrıştırma ile dolması, `lab_panels`/`lab_results` yazımı.                     | §10.2 B-1..B-11 yeşil; ayrıştırıcının `lab_results`'a yazma yolu yok (R-8 + mimari test); her sonuçtan PDF sayfa/satırına zincir kurulabiliyor; `unparsed` satırlar varsayılan seçili değil.       |
| **L4 — Yorumlama + sorumluluk metni**        | `lab_insights.py`, `schemas/lab.py`, `lab_result_insights`, `/api/ai/lab-insights`, şablon sözlüğü, §6 uyarısı.                                        | §10.8 M-1..M-22, §10.5, §10.6 ve §10.10 yeşil; motor yanıtında serbest metin alanı yok; onaysız panel yorumlanmıyor (`PANEL_NOT_CONFIRMED`); `NO_ACTIVE_RANGE_SET` yolu test edilmiş.              |
| **L5 — Koç bildirimi**                       | `lab_panel_coach_alerts`, tetikleme kuralı, idempotency, gizlilik metni.                                                                               | Aynı panel iki kez yorumlanınca **tek** bildirim; bulgu değişince yeni bildirim; E2E adım 7 (metinde analit/değer/severity yok) yeşil; `borderline` bildirim üretmiyor; onaysız panel bildirmiyor. |
| **L6 — OCR (taranmış PDF)**                  | Görüntü sayfalarından metin üretimi; sonraki adımlar değişmez.                                                                                         | `kind='scanned'` belgeler ayrıştırılabiliyor; isim doğrulaması OCR metniyle çalışıyor; OCR güveni düşük satırlar `unparsed`; maliyet/kota loglanıyor.                                              |
| **L7 — LLM destekli ayrıştırma (opsiyonel)** | Kural tabanlı kapsam yetersizse; §2.5'teki kısıtlarla.                                                                                                 | §10.2 B-12/B-13 yeşil; model çıktısı katı şemaya parse ediliyor; serbest metin akışa girmiyor; token kullanımı structured log'a yazılıyor.                                                         |

- L0–L5 v1'dir. L6 ve L7 ayrı ve **ertelenebilir** çalışmalardır.
- L6/L7 en erken Faz 3'ten (yemek fotoğrafı) **sonra** gelir: vision sağlayıcı adapter'ı
  (`app/services/vision/base.py`), `ai_usage_counters` günlük limiti ve maliyet loglaması
  orada kurulacak ve burada yeniden kullanılacaktır.
- Her adım kendi faz kapısını geçer (`active_planprogram.md` §0.2 komutları) ve
  `docs/PROGRESS.md`'ye işlenir.

---

## 12. Açık sorular (kullanıcı kararı gerekiyor — cevap uydurulmadı)

| #    | Soru                                                                                                                                                                                                           | Neden bloklayıcı                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1  | **Referans aralığı kaynağı ve lisansı.** Hangi kaynak? Yeniden dağıtımına izin veriyor mu (ticari ürün içinde saklama/gösterme)? Türkiye'deki laboratuvar pratiğiyle uyumlu mu?                                | Katalog verisi olmadan L1 yazılamaz. Lisans, veriyi repoda tutup tutamayacağımızı belirler. **Bu belgede hiçbir sayısal aralık uydurulmadı.**                    |
| A-2  | **Analit kodlaması.** Kendi kodlarımız mı (`VITAMIN_D_25OH`), LOINC mu? LOINC seçilirse lisans/kayıt yükümlülüğü var mı?                                                                                       | `lab_analytes.code` birincil anahtardır; sonradan değiştirmek tüm geçmiş veriyi taşımayı gerektirir.                                                             |
| A-3  | **Başlangıç analit seti.** Hangi analitlerle başlanacak? Katalog dışı analit kaydedilebilmeli mi (yorumsuz)?                                                                                                   | Katalog dışına izin verilirse `lab_results.analyte_code` FK'si gevşemeli ve `analyte_not_in_catalog` yolu ürünleşmeli. Ayrıca ayrıştırıcının kapsamını belirler. |
| A-4  | **Hosted `profiles.gender` kolonunun gerçek değer kümesi nedir?** (`HOSTED-DATA-INVENTORY.md` kolonu listeliyor, değerlerini listelemiyor.)                                                                    | `sex` migration'ının eşleme mantığı buna bağlı. Salt okunur bir sorgu ile öğrenilmeli; **tahminle migration yazılmamalı.**                                       |
| A-5  | **Severity eşikleri `t1 = 0.10` / `t2 = 0.50` uygun mu?** Tıbbi kaynaktan değil, ürün içi sapma niteleme eşikleridir.                                                                                          | Kullanıcıya gösterilen "kritik" etiketini bu sayılar belirliyor. Bir hekim/uzman gözden geçirmesi isteniyor mu?                                                  |
| A-6  | **Motor nerede yaşamalı — `ai_backend` (HTTP) mi, Postgres `SECURITY DEFINER` fonksiyonu mu?** Postgres seçeneği sağlık verisinin süreç sınırı dışına çıkmamasını sağlar; `ai_backend` mevcut deseni sürdürür. | ADR konusudur ve §9'un tamamını değiştirir. (Not: PDF ayrıştırma zaten Python gerektirir, bu dengeyi `ai_backend` lehine bozar.)                                 |
| A-7  | **Yazma yolu:** `service_role` istemcisini Next.js'e geri getirmek mi (`admin.ts` silinmişti), yoksa `SECURITY DEFINER` RPC mi? Bu belge RPC'yi öneriyor.                                                      | Faz 1.5 Kova 1 #10 "uygulama kodunda service_role tüketicisi yok" kanıtını korumak isteyip istemediğiniz kararı.                                                 |
| A-8  | **API sürümleme.** Uçlar bugün ön eksiz (`/analyze/workout`, `/recommendations`); plan §5.1 Faz 3 için `/v1/...` diyor. Laboratuvar uçları hangisini kullansın?                                                | Sonradan ön ek eklemek proxy route'larını ve testleri toptan değiştirir.                                                                                         |
| A-9  | **Belgeyi kim yükler — danışan mı, koç mu, ikisi de?** Bu belge ikisine de izin veriyor (`uploaded_by` ile ayırt ediliyor).                                                                                    | RLS politikalarını ve yükleme ekranının konumunu belirler.                                                                                                       |
| A-10 | **Danışan kendi panelini/belgesini silebilmeli mi?** Bu belge `S veya K` (silebilir) diyor. "Soft delete" (arşivleme) tercih edilir mi?                                                                        | Silme, koç bildirimi gönderilmiş bir bulgunun izini de siler.                                                                                                    |
| A-11 | **Saklama süresi ve silme hakkı.** PDF ve sonuçlar ne kadar saklanacak? Hesap silindiğinde ne olacak (`on delete cascade` bugünkü desen)? Dışa aktarma gerekli mi?                                             | KVKK/GDPR özel nitelikli veri yükümlülükleri.                                                                                                                    |
| A-12 | **Onam metni.** Danışan bu özelliği ilk kullanırken açık bir bilgilendirme/onam ekranı görmeli mi? §6'nın kalıcı uyarısı yeterli mi? Hukuki metni kim yazacak?                                                 | §0 çerçevesinin kullanıcıya görünen yüzü; hukuki metin mühendislik kararı değildir.                                                                              |
| A-13 | **OCR gerekliliği hangi oranda bekleniyor?** Çalıştığınız laboratuvarlar metin katmanlı PDF mi veriyor, taranmış görüntü mü? En az 5-10 gerçek örnek belgeyle ölçülmeli.                                       | L6'nın öncelik sırasını ve `text_layer` eşiğinin (100 karakter/sayfa) kalibrasyonunu belirler. Çoğunluk taranmışsa L6 v1'e çekilmelidir.                         |
| A-14 | **LLM destekli ayrıştırma kullanılacak mı?** Kural tabanlı kapsam yetersizse hangi sağlayıcı, hangi maliyet tavanı, hangi günlük limit? PDF içeriği üçüncü taraf bir modele gönderilmesi kabul mü?             | L7'nin varlığını ve sağlık verisinin dışarı çıkıp çıkmayacağını belirler — bu bir gizlilik kararıdır, teknik tercih değil.                                       |
| A-15 | **İsim doğrulama eşiklerinin (0.92 otomatik kabul / 0.75 alt bant) nihai değerini kim onaylayacak?** Ve gerçek raporlarla kalibrasyon yapılacak mı?                                                            | Yanlış pozitif = başkasının sağlık verisinin işlenmesi. Eşik bir ürün/risk kararıdır; mühendislik tek başına sabitlememeli.                                      |
| A-16 | **Şifreli/parola korumalı PDF gelirse ne olacak?** Bu belge reddediyor. Kullanıcıdan parola isteyip açmak istenir mi (parolanın saklanmaması şartıyla)?                                                        | Bazı laboratuvarlar raporları TC kimlik numarasıyla şifreliyor; reddetme oranı yüksek çıkarsa özellik kullanılamaz hâle gelebilir.                               |
