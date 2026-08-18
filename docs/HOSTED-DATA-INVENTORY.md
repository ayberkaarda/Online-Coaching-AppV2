# Barındırılan (Hosted) Veri Envanteri — Faz 1b Adım 0

> **GÜNCELLEME (2026-08-17, hosted senkronizasyonu — bkz.
> `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`):** Bu envanterin tarif ettiği durum
> **GEÇERSİZDİR**. Aynı gün, bu envanterden sonra, `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`
> kararı uygulandı: barındırılan projenin `public` şeması ve storage politika/bucket durumu
> **sıfırlandı** (`auth` şemasına dokunulmadı, 2 hesap korundu) ve yerel zincirin birebir
> aynısı olan **25 migration** sıfırdan `db push` ile uygulandı. Aşağıda belgelenen her şey —
> eski `admin`/`student` enum'u, `notifications.target_student_id`, `daily_logs`'taki
> `morning_weight`/`notes`, eksik `reviewed_by`/`reviewed_at`, legacy `workouts`/
> `program_templates` tabloları, public bucket'lar — artık **tarihsel bir kayıttır**, hosted'ın
> BUGÜNKÜ durumunu yansıtmaz. Aşağıdaki içerik bu nedenle **SİLİNMEDİ**, olduğu gibi
> korunuyor. Hosted'ın güncel durumu (25 migration, `coach`/`client` rolleri, yerel ile birebir
> şema/politika/fonksiyon paritesi, private bucket'lar, kapatılmış bir yetki yükseltme açığı)
> için bkz. `docs/PROGRESS.md` §3 "Hosted senkronizasyonu — ADR-0020 uygulaması" ve
> `docs/adr/0020-hosted-senkronizasyon-stratejisi.md` "Uygulama sonucu".

**Tarih:** 2026-08-17
**Kaynak:** Barındırılan Supabase projesi (`nxftmxkpmuyeelrmwofv.supabase.co`), yalnızca
`SUPABASE_SERVICE_ROLE_KEY` ile **salt okunarak** (PostgREST `select` / `head:true` count /
`storage.listBuckets` / PostgREST kök OpenAPI şeması) sorgulanmıştır. Hiçbir `INSERT`,
`UPDATE`, `DELETE`, `ALTER`, migration veya `supabase link`/`db push` çalıştırılmamıştır.

**Kişisel veri notu:** Bu belge hiçbir gerçek danışan adı, e-posta adresi, kimlik (`uuid`
hariç — rastgele üretilmiş ve tek başına kimliklendirici değildir) veya ham plan içeriği
içermez. Yalnızca satır sayıları, kolon adları, veri şekli ve istatistik bilgisi verilmiştir.
Sorgulama sırasında `daily_logs` gibi tablolardan tek satır çekilip kolon adları çıkarılmış,
değerler diske yazılmadan atılmıştır.

**Sorgulama yöntemi:** Geçici bir Node.js betiği (`@supabase/supabase-js`) **repo dışında**,
makineye özel geçici bir dizinde oluşturulup çalıştırılmış ve orada bırakılmıştır — repoya
hiçbir betik veya ham veri dosyası eklenmemiştir.

---

## 0. Kritik ön bulgu — plan verisi yok

Barındırılan projede **`profiles` tablosunda toplam 2 satır** vardır ve **her ikisinde de
`workout_plan` ve `nutrition_plan` alanları `NULL`'dır**. Yani bu ortamda incelenecek gerçek
bir antrenman/beslenme planı **hiç yok**. Aşağıdaki §2 ve §3 bu nedenle "veri yok" olarak
işaretlenmiştir; format/regex uygunluk analizi bu ortamdaki veriyle yapılamamıştır (bkz. §6).

---

## 1. Genel durum

### 1.1 `profiles`

| Metrik                    | Değer                    |
| ------------------------- | ------------------------ |
| Toplam satır              | 2                        |
| Rol dağılımı              | `admin`: 1, `student`: 1 |
| `workout_plan` dolu       | 0                        |
| `workout_plan` NULL/boş   | 2                        |
| `nutrition_plan` dolu     | 0                        |
| `nutrition_plan` NULL/boş | 2                        |

### 1.2 Diğer tablo satır sayıları

| Tablo                                  | Satır sayısı |
| -------------------------------------- | ------------ |
| `form_checks`                          | 0            |
| `daily_logs`                           | 1            |
| `workout_logs`                         | 0            |
| `messages`                             | 2            |
| `notifications`                        | 0            |
| `program_approvals`                    | 0            |
| `exercises`                            | 1324         |
| `food_database`                        | 703          |
| `workouts` (§5 — yerelde yok)          | 0            |
| `program_templates` (§5 — yerelde yok) | 3            |

Yorum: Referans katalog tabloları (`exercises`, `food_database`) doldurulmuş durumda; işlemsel
tablolar (danışan aktivitesi üreten tablolar) neredeyse tamamen boş. Bu ortam üretim
kullanıcı verisi içeren bir ortam değil, muhtemelen erken kurulum/deneme aşamasındaki bir
proje görünümü veriyor.

---

## 2. `workout_plan` şekli

**Veri yok.** İki `profiles` satırının ikisinde de `workout_plan = NULL`. Ayrıştırma/JSON
geçerliliği, gün anahtarları, satır formatı (`N. Ad - SxT` deseni) gibi hiçbir alt analiz bu
ortamda yapılamaz. Aşağıdaki tüm alt maddeler bu nedenle boş:

| Alt analiz                         | Sonuç      |
| ---------------------------------- | ---------- |
| Geçerli JSON olan satır sayısı     | 0/0 (N/A)  |
| Bozuk JSON sayısı                  | 0/0 (N/A)  |
| Gün anahtarı deseni                | Gözlem yok |
| `N. Ad - SxT` regex uygunluk oranı | Gözlem yok |
| `"Dinlenme"` benzeri özel değer    | Gözlem yok |

---

## 3. `nutrition_plan` şekli

**Veri yok.** Aynı gerekçeyle (`nutrition_plan = NULL` her iki satırda da) `{items, total}`
yapısı, `items` ayraç formatı (virgül+iki nokta vs. satır sonu), `total` alan tipi ve miktar
birim yazımı hakkında bu ortamdan hiçbir gözlem elde edilememiştir.

| Alt analiz                     | Sonuç      |
| ------------------------------ | ---------- |
| Geçerli JSON olan satır sayısı | 0/0 (N/A)  |
| `{items, total}` şekli         | Gözlem yok |
| `items` ayraç formatı dağılımı | Gözlem yok |
| `total` alan tipi              | Gözlem yok |
| Miktar birim yazımı            | Gözlem yok |

**Yakın-ilişkili gözlem (kişisel değil):** Yerelde olmayan `program_templates` tablosunda
(3 satır) koç tarafından yazılmış serbest metin şablon açıklamaları bulunuyor (örn. kategori:
`nutrition`/`workout`, içerik: birkaç cümlelik serbest metin — "Yüksek protein, kademeli
karbonhidrat döngüsü", "PPL sistemi, RPE 8-9 aralığı" gibi). Bunlar **yapılandırılmış
`{gün: ...}` plan formatında değil**, düz açıklama metni; dönüşüm SQL'i için doğrudan girdi
olarak kullanılamaz.

---

## 4. Dönüşüm riski değerlendirmesi

- **Regex uygunluk yüzdesi hesaplanamıyor:** Hosted ortamda sıfır adet dolu `workout_plan`
  satırı olduğu için `N. Ad - SxT` regex'inin gerçek veri üzerindeki başarı oranı **ölçülemez**.
  Yüzde raporlamak yerine bu durumun kendisi risk olarak işaretlenmelidir: dönüşüm SQL'i,
  hosted ortamdan **doğrulanmamış** bir varsayımla (yalnızca yerel seed verisine dayanarak)
  yazılacaktır.
- **Beslenme `items` ayrıştırma kararı ertelenmeli:** Aynı gerekçeyle `items` alanının
  virgül+iki nokta mı yoksa satır-sonu mu olduğu bilinmiyor. Yapısal ayrıştırma yerine, ilk
  aşamada ham metni bozmadan taşıyıp (`text`/`jsonb` olarak) geriye dönük ayrıştırmayı
  uygulama katmanında (mevcut render mantığı neyi destekliyorsa) yapmak daha düşük risklidir.
- **Veri kaybı riski — somut durumlar:**
  - Hosted'da gelecekte gerçek kullanıcı verisi girildiğinde, yerel seed'e dayanan regex
    hosted'daki gerçek serbest-metin varyasyonlarını (ör. `"<HAREKET> - 3x10 | RIR 2"`,
    `"Dinlenme"`, koçun elle yazdığı notlar) karşılamayabilir; eşleşmeyen satırlar
    ayrıştırma sırasında sessizce kaybolabilir veya boş geçebilir.
  - `total` alanının sayı mı string mi olacağı bilinmediğinden, hedef şemada tip zorlaması
    (`numeric` cast vb.) hosted'da farklı bir tip gelirse hataya veya sessiz veri kaybına yol
    açabilir.
- **Öneri:** Dönüşüm SQL'i yazılmadan önce, hosted projeye gerçek (veya en azından temsili,
  anonim) plan verisi girilene kadar bu şekil envanteri **eksik** kabul edilmeli. SQL,
  yalnızca yerel seed formatına göre değil, en az bir hosted örnek üzerinde de test
  edilmelidir; hosted'da örnek yoksa üretime çıkmadan önce personel/koç hesabıyla en az
  birkaç gerçek plan girilip bu envanter tekrar çıkarılmalıdır.

---

## 5. Diğer bulgular

### 5.1 Şema farkları — `information_schema` yerine PostgREST kök OpenAPI şeması üzerinden

Not: Hosted PostgREST `information_schema`'yı REST uç noktası olarak açığa çıkarmıyor
(standart davranış); bunun yerine PostgREST'in kök `/rest/v1/` OpenAPI (Swagger) tanımı
salt-okunur şekilde sorgulanarak tam kolon listesi elde edilmiştir. Karşılaştırma, yerel
migration `supabase/migrations/20260816090000_initial_schema.sql` ile yapılmıştır.

**`profiles`**

| Yerel migration'da olan, hosted'da OLMAYAN | Hosted'da olan, yerel migration'da OLMAYAN                                |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `email`                                    | `age`                                                                     |
| `updated_at`                               | `height_cm`                                                               |
| `last_checkin_at`                          | `weight_kg`                                                               |
|                                            | `gender`                                                                  |
|                                            | `activity_level`                                                          |
|                                            | `goal`                                                                    |
|                                            | `last_log_date` (yerelde `last_checkin_at` karşılığı olabilir, ad farklı) |

**`notifications`**

| Fark        | Detay                                                               |
| ----------- | ------------------------------------------------------------------- |
| Kolon adı   | Hosted `target_student_id` kullanıyor, yerel migration `student_id` |
| Eksik kolon | Hosted'da `is_read` yok                                             |

**`daily_logs`**

| Fark            | Detay                     |
| --------------- | ------------------------- |
| Hosted'da fazla | `morning_weight`, `notes` |
| Hosted'da eksik | `created_at`              |

**`program_approvals`**

| Fark            | Detay                        |
| --------------- | ---------------------------- |
| Hosted'da eksik | `reviewed_by`, `reviewed_at` |

**`form_checks`, `workout_logs`, `messages`, `exercises`, `food_database`**

Yerel migration ile hosted kolon listeleri **birebir eşleşiyor** — fark yok.

### 5.2 Yerelde olmayan tablolar (hosted'a özgü, muhtemelen eski/legacy)

| Tablo               | Kolonlar                                                       | Satır sayısı |
| ------------------- | -------------------------------------------------------------- | ------------ |
| `workouts`          | `id, student_id, title, description, is_completed, created_at` | 0            |
| `program_templates` | `id, title, category, content, created_at`                     | 3            |

Bu iki tablo yerel `20260816090000_initial_schema.sql` migration'ında **hiç tanımlı değil**.
`workouts` boş (0 satır) — güvenle yok sayılabilir/kaldırılabilir görünüyor. `program_templates`
3 satır serbest-metin içeriyor (bkz. §3) — plan JSON dönüşümüyle doğrudan ilgisi yok, ayrı bir
karar konusu (taşınacak mı, bırakılacak mı) olarak işaretlenmeli.

### 5.3 `storage.buckets` durumu

| Bucket              | `public` |
| ------------------- | -------- |
| `form-checks-media` | **true** |
| `avatars`           | **true** |

Faz 1a'da bu iki bucket **yerel** ortamda private yapılmıştı; hosted projeye henüz migration
uygulanmadığı belirtildiği gibi, hosted'daki bucket'lar hâlâ **public**. Bu, hosted'ın
yerelden şema/politika olarak geride olduğunu doğrulayan bağımsız bir sinyal.

### 5.4 Diğer tutarsızlıklar / sürprizler

- Barındırılan projede işlemsel veri (form_checks, workout_logs, notifications,
  program_approvals) tamamen boş; yalnızca 1 `daily_logs` ve 2 `messages` satırı var. Bu,
  ortamın gerçek kullanım görmediğini, kurulum/smoke-test amaçlı olduğunu düşündürüyor.
- `profiles.role` enum değerleri görevde belirtildiği gibi `admin`/`student` — yerel yeni
  şemayla enum değeri olarak uyumlu (roller aynı, sadece diğer kolonlarda sürüklenme var).

---

## 6. Faz 1b dönüşümü için sonuçlar

1. **Bu ortamda gerçek plan verisi yok — dönüşüm SQL'i "kör" yazılacak.** `workout_plan` ve
   `nutrition_plan` için hazırlanacak parse/regex mantığı hosted'da doğrulanamaz; yalnızca
   yerel seed verisi ve kod içi varsayımlara (`profiles.workout_plan` yorum satırındaki
   `Record<gün, string>` ve `nutrition_plan` için `Record<gün, {items, total}>`) dayanacaktır.
   Dönüşüm SQL'i **idempotent ve hataya toleranslı** yazılmalı (regex eşleşmezse satırı olduğu
   gibi bırak/loglama yap, sessizce atma) — çünkü hosted'da hangi varyasyonların çıkacağı
   bilinmiyor.
2. **`total` alanı ve `items` ayraç formatı için tip zorlaması yapılmamalı.** Şekli
   doğrulanamadığından, hedef kolon tipleri (`numeric`, `jsonb` alt alanları) esnek/nullable
   tutulmalı; ilk aşamada ham metni kaybetmeden taşımak, agresif normalize etmekten önceliklidir.
3. **Şema farkları önce ele alınmalı.** `notifications.target_student_id` → `student_id`
   rename ve eksik `is_read`; `daily_logs`'ta eksik `created_at`, fazla `morning_weight`/`notes`;
   `program_approvals`'ta eksik `reviewed_by`/`reviewed_at`; `profiles`'ta eksik
   `email`/`updated_at`/`last_checkin_at` ve fazla `age`/`height_cm`/`weight_kg`/`gender`/
   `activity_level`/`goal`/`last_log_date` — bunların hepsi plan JSON dönüşümünden **önce**
   hosted migration'ıyla çözülmesi gereken ayrı bir iş kalemi. Aksi halde dönüşüm SQL'i
   olmayan kolonlara yazmaya çalışıp hata verebilir.
4. **`workouts` ve `program_templates` tabloları dönüşüm kapsamı dışında tutulmalı.**
   `workouts` boş, göz ardı edilebilir. `program_templates` farklı bir veri modeli (serbest
   metin şablon) taşıyor; plan JSON dönüşümüyle karıştırılmamalı, ayrı karar gerektirir.
5. **Bucket public/private senkronizasyonu** Faz 1b'nin değil ama yakın vadeli bir migration
   uygulama adımının (hosted'a `db push`) parçası olmalı — hosted bucket'lar hâlâ public.
6. **Önerilen sıralama:** (a) hosted'a en azından birkaç temsili/anonim plan verisi girilip bu
   envanter tekrarlanmalı **veya** (b) dönüşüm SQL'i "en kötü durum" varsayımıyla (regex
   eşleşmeyen her şeyi kaybetmeden saklayan bir fallback ile) yazılıp, hosted'a ilk gerçek
   veri geldiğinde ayrıca doğrulanmalı. Şu an elde veri olmadığı için (a) tercih edilir.
