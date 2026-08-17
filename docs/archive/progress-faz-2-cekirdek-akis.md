# Arşiv — Faz 2: Koç-Danışan Çekirdek Akışı (2026-08-17)

**Özet.** On dilim (2a–2j): emoji → Lucide mekanik süpürmesi (59 → 0) ve ürün dili + E2E
locator güncellemesi tek atomik turda; şema tamamlama (realtime'da gerçek bir sızıntı bulunup
kapatıldı); antrenman akışı ve `LoopRing` (AC-1.6.7 kapandı); beslenme akışı; form check
kuyruğu; mesajlaşma (AC-2.2 419 ms ölçüldü); `post_system_message` RPC'si; versiyonlu plan
yayınlamanın copy-on-write ile düzeltilmesi (eski `save_workout_plan()` her kayıtta geçmiş
logların plan bağını koparıyordu); entegrasyon temizliği ve E2E izolasyonu (kaynak kilidi).

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 80–90, 939–1138, 1505–1516 —
> 2026-08-17'de taşındı.

---

### Faz 2 — Koç-Danışan Çekirdek Akışı (2026-08-17)

Yedi dilim halinde yürütüldü. Sıralama kritikti: 2a tüm ekranlara dokunduğu için ATOMİK ve
YALNIZ çalıştı; 2b şema temeli; 2c–2f özellik akışları paralel; ardından entegrasyon.

**2a — mekanik süpürme (atomik).** ADR-0016 emoji→Lucide dönüşümünü, ürün dili düzeltmesini
ve E2E locator güncellemelerini AYNI PR'a bağlamıştı: üçü de aynı locator yüzeyini kırıyor.

- Emoji **59 → 0**, ratchet tavanı 0'da kilitlendi. 53 emoji 35 ikona; 6'sı düz metne indi
  (2'si DB'ye yazılan bildirim metni, 2'si `<option>` içinde, 🧂 için lucide'de ikon yok,
  🎉 kutlama anı ADR-0016'nın tek istisnası → `LoopRing`'e devredildi).
- **`lucide-react` v1 eski takma adları kaldırmış**: `AlertTriangle`/`BarChart3`/
  `CheckCircle` yok, yerlerine `TriangleAlert`/`ChartColumn`/`CircleCheck`. Her ad
  kullanılmadan önce `lucide-react.d.ts`'e karşı doğrulandı.
- **GREP TUZAĞI (kayda değer):** Git Bash'te `grep -i "öğrenci"` büyük `Ö`'yü SESSİZCE
  kaçırıyor (çok baytlı büyük/küçük harf katlaması). İlk envanter eksik çıktı, açık
  alternasyonla yeniden tarandı.
- **GİZLİ İ TUZAĞI SÖKÜLDÜ:** `dashboard.spec.ts` sekme locator'larını `new RegExp(name,
'i')` ile kuruyordu ve liste `İstatistikler` (U+0130) içeriyordu — tesadüfen çalışıyordu
  ama bu, projeyi daha önce yakan kalıbın ta kendisiydi (bkz. §3 "E2E doğrulaması ve ortaya
  çıkardığı hatalar", 2026-08-16 üçüncü oturum).
- **GERÇEK ERİŞİLEBİLİRLİK HATASI:** `users/page.tsx` geri butonu metnini `sm` altında
  gizliyor ama `aria-label`'ı yoktu — mobilde erişilebilir adı çıplak `←` idi. Hiçbir test
  yakalamıyordu.

**2b — şema tamamlama.** 5 migration.

- **REALTIME'DA SIZINTI BULUNDU VE KAPATILDI.** Yayın zaten `messages`/`notifications`
  içeriyordu ama davranışı hiç ölçülmemişti. Gerçek WebSocket ile üç aktör abone edildi:
  INSERT → A ve koç alıyor (78/440 ms), B ALMIYOR. UPDATE → aynı. **DELETE → B (filtresiz
  abone) A'NIN SİLME OLAYINI ALDI (92 ms).** Sebep: `replica identity = 'd'` altında eski
  kayıt yalnızca birincil anahtarı taşır, RLS DEĞERLENDİRİLEMEZ. Çözüm `full`a geçmek değil
  (planın istemediği bir yetenek için her UPDATE'in WAL maliyetini artırırdı); yayın
  `insert, update` ile daraltıldı.
- `workout_logs`: `set_number`, `plan_exercise_id` FK, `completed_at`. **`ON DELETE SET
NULL`** seçildi çünkü `save_workout_plan()` plan satırlarını silip yeniden yazıyor —
  CASCADE olsaydı koç her plan kaydettiğinde danışanın TÜM geçmiş logları silinirdi.
  `completed_at` belirsizliği (plan hem "satır=set" hem "tüm setler girilince" diyor): ayrı
  `workout_sessions` tablosu reddedildi, anlam oturum seviyesinde/kolon set satırında
  denormalize damga; karar kayıpsız yükseltilebilir. RLS boşluğu kapatıldı:
  `plan_exercise_id`'nin kime ait olduğu denetlenmiyordu.
- `nutrition_plans.target_*` hedef makrolar (NULL = "hedef verilmedi", 0 bir hedeftir).
- Yeni `nutrition_logs`. **ADR-0014 sapması tekrarlanmadı** — yeni yüzey olduğu için planın
  §3.2 matrisi birebir uygulandı: koç SALT OKUR.
- `messages.attachment_path` + yeni private bucket `message-attachments`. Mevcut bucket'lar
  reddedildi: `avatars` politikası koçun dosyasını herkese açıyordu; `form-checks-media` ise
  danışanın koçtan gelen eki görmesini engellerdi.
  **KRİTİK YAN BULGU:** `messages_guard_columns()` sütunları AÇIKÇA sayıyor → yeni kolon
  otomatik korunmuyordu; genişletilmeseydi alıcı gelen mesajın EKİNİ değiştirebilirdi
  (AC-04 deliğinin aynısı, bkz. §3 "Faz 1.5 — düzeltme turu, Grup 1–3").
- `is_read`/`read_at` tekilleştirildi: `read_at` kanonik, trigger normalleştirir (koşulsuz —
  veri modeli kuralı), CHECK kanıtlar. Ölçüm: 68 satırda 0 tutarsızlık vardı ama bu
  TESADÜFTÜ (seed türetiyordu), şema garantisine çevrildi.
- Kırmızı-yeşil: 10 ayrı red koşusu. RLS senaryo sayısı bu dilimle **85 → 95**'e çıktı.

**2c — antrenman akışı.**

- **`LoopRing` yazıldı (ADR-0017) ve AC-1.6.7 KAPANDI.** Dolgu SVG sunum özniteliği olarak
  yazılan `stroke-dashoffset`; dosyada tek bir `@keyframes`/`animation` yok, yani
  `globals.css`'in `animation-duration: 0.01ms !important` kuralının donduracağı bir şey
  yok. En sert test iddiası: **reduced-motion açıkken ve kapalıyken üretilen
  `stroke-dashoffset` BİREBİR aynı string** — %70 dolu halka her iki halde de %70
  gösteriyor. `LoopRing` tek anlam kuralını çalışma zamanında da kilitliyor: dekoratif
  `purpose` ile çağrılırsa `throw` eder.
- **`useWorkoutLogs` çağrılıyor ama HİÇBİR YERDE GÖSTERİLMİYORDU** — AC-2.1'in "koç logu
  görür" adımı bu yüzden hiç kapanamıyordu. Oturumlara gruplu panel eklendi.
- Gym modu ayrı bileşene çıkarıldı; `video_url` için allowlist'li embed (yalnız
  YouTube/Vimeo; `javascript:`/`data:`/bilinmeyen host → düz bağlantı).
- Faz 2a'nın işaretlediği iki kutlama noktası `LoopRing` ile tamamlandı.

**2d — beslenme akışı.**

- **ADR-0017 kesintisine uyuldu: makro dashboard HALKA DEĞİL YATAY BAR.** Halka yalnızca
  döngü durumu kodlar; makro bir döngü değil BÜTÇEDİR. Regresyon testi halkanın çizim
  mekanizmasını (`stroke-dashoffset`) arıyor — dekoratif `Target` ikonundaki `<circle>`'lara
  yanlış pozitif vermeyecek şekilde düzeltildi.
- Aşım: bar dolgusu [0,100]'e kırpılır ama gerçek sayılar gizlenmez (`danger` + "+X aşım");
  %90'da erken `warning`.
- **Gerçek hata bulundu:** hedef state'i `{} as NutritionTargets` ile kuruluyordu, ilk
  render'da kutucuklarda literal `undefined` görünecekti.
- `save_nutrition_plan()` RPC'sine dokunulmadı (hedef parametresi almıyor, genişletmek onu
  yeniden yazmak olurdu) — hedefler ayrı tablo yazımıyla yönetiliyor.

**2e — form check akışı.**

- Danışan gönderimi (`capture="environment"` ile mobil kamera), koç bekleyenler kuyruğu
  (`CoachUserManagement.tsx`'te — o ekran zaten koçun çapraz-danışan triyaj yüzeyi), toplu
  imzalı adres (`createSignedUrls`, N+1 yok), geri bildirim → `reviewed`.
- **MİMARİ ENGEL KEŞFEDİLDİ:** `messages_guard_columns()` `kind='system'` yazımını
  PostgREST üzerinden kimlik doğrulamış HER çağırana kapatıyor — koç dahil. Yani sistem
  mesajı kanalı hiçbir hook'tan yazılamıyordu. Kendi kapsamı dışında olduğu için belgelenip
  bırakıldı, 2g ile kapatıldı (aşağıda).
- AC-2.3 curl ile yeniden kanıtlandı: kimliksiz `400 NoSuchBucket`, imzalı adres `200`.

**2f — mesajlaşma.**

- **AC-2.2 ÖLÇÜLDÜ: 419 ms** (koç "Gönder"e bastığından danışanın sekmesinde göründüğü ana
  kadar, iki gerçek tarayıcı bağlamıyla). 2 sn bütçesinin çok altında; sayı artık testin
  kendisi tarafından loglanıyor.
- "Görüntülendi" tespiti: `IntersectionObserver` + `document.visibilityState`. İki uç nokta
  açıkça reddedildi ("mount = hepsi okundu" ve realtime payload'ında istemci tarafı
  filtre).
- Foto eki magic-byte ile doğrulanıyor, yol sözleşmesi DB CHECK'ine karşı test edildi.
- `kind='system'` mesajlar ayrı stille render ediliyor (arayüz hazır).

**2g — sistem mesajı RPC'si (2e'nin engelini kapatan ek iş).**
`post_system_message(p_client_id, p_event_type, p_ref_id)` `SECURITY DEFINER`.
**AC-05 dersi bir adım öteye taşındı: RPC HİÇ METİN PARAMETRESİ ALMIYOR.** Yalnızca olay
türü + referans id; metin sunucuda zaten sunucu-doğrulamalı alanlardan üretiliyor. Yani koç,
gerçekten olmamış bir şey için "sistem" mesajı uyduramıyor. Dört sahiplik kontrolü gövdede.
Guard zayıflamadı: doğrudan `.insert()` ile `kind='system'` hem danışan (senaryo 61) hem
KOÇ (yeni senaryo 98) için hâlâ reddediliyor. RLS senaryo sayısı bu dilimle **95 → 99**'a
çıktı.

**2h — versiyonlu plan yayınlama (§4.1 madde 2).**
Ölçülen eski davranış: `save_workout_plan()` yeni `version` üretmiyor, eskiyi
`is_active=false` yapmıyor, plan satırlarını SİLİP YENİDEN YAZIYORDU. Sonuç: `ON DELETE SET
NULL` üzerinden **her plan kaydında danışanın geçmiş antrenman loglarının plan bağı
kopuyordu** — §4.1'in "geçmiş loglar eski versiyona bağlı kalır" garantisi sağlanmıyordu.
**COPY-ON-WRITE seçildi:** aktif planın satırlarına bağlı en az bir log VARSA kaydetme bir
yayınlamadır (eski arşivlenir, satırları korunur, `version+1` ile yeni aktif plan); YOKSA
plan hâlâ taslaktır ve satırları yerinde yazılır. Böylece `version` "koç kaç kez tıkladı"yı
değil "danışan kaç plandan geçti"yi ölçer; çift tıklama kendiliğinden elenir.
RPC imzası KORUNDU — ayrım parametreden değil VERİDEN türetildiği için `src/hooks/**` ve
`src/components/**` hiç değişmedi.
Beslenme tarafı bilerek değiştirilmedi: `nutrition_plan_meals`'e işaret eden HİÇBİR FK yok,
aynı kod oraya kopyalansa ölü kod olurdu. Geri dönüş koşulu şema yorumuna yazıldı.
En kritik kanıt senaryo 101: migration'sız hâlde "GECMIS LOGUN PLAN BAGI NULL A DUSTU — plan
kaydetmek antrenman gecmisini KOPARIYOR" diye kırılıyor. RLS senaryo sayısı bu dilimle
**99 → 104**'e çıktı — Faz 2'nin kapanış değeri.

**2i — entegrasyon temizliği.** Dört dilim paylaşılan dosyalara dokunamadığı için bilinçli
sapmalar bırakmıştı: sorgu anahtarları `src/lib/query/keys.ts`'e, `MESSAGE_ATTACHMENT_BUCKET`
`src/lib/storage.ts`'e taşındı; barrel export'lar eklendi; ölü `coachId` kaldırıldı; kırık iki
test düzeltildi (kök neden: `rpcMock`'a varsayılan çözümlenmiş değer verilmemişti).
Invalidate zinciri kanıtlandı: `['workout-plan', id]` ön eki `['workout-plan', id,
'exercises']` ile eşleştiği için gym modu hâlâ tazeleniyor — kırılsaydı sessizce bayat plan
gösterirdi.
Ratchet tavanları ölçülen değerlere indirildi: `font-black` 49→**25**, `bg-gradient-to-`
14→**12**, `rounded-3xl` 17→**15** (Katman B, ADR-0018'in öngördüğü gibi ekranlar yeniden
yazılırken DOĞAL olarak dönüştü).

**2j — E2E test izolasyonu.** Faz 2 sonrası tam paket yerelde 6 düştü. Ürün hatası değildi.
**Kök neden ilk teşhisten farklı çıktı:** sorun dosya içi paralellik değil,
`projects: [chromium, 'Mobile Chrome']` — **her spec aynı anda İKİ kez koşuyor**, aynı
hesaplara yazarak. Dosya içi hiçbir `describe.serial` bunu kapatamaz; danışan ayrıştırması
da yetmez çünkü proje ikizi aynı danışanı seçer.
Çözüm: kaynak bazlı, süreçler+projeler arası kilit (`tests/e2e/resource-lock.ts`). Kuyrukta
geçen süre `testInfo.setTimeout` ile geri veriliyor, gövde bütçesi şişirilmedi.
**İki ek gerçek hata bulundu:** (a) `numeric(6,2)` ondalık tuzağı — DB `274.00`, PostgREST
JSON sayısı döndürüyor, JS sondaki sıfırı atıyor, DOM `274 kg` ama test `274.0 kg` arıyordu
(~1/10 kararsızlık); iddia gevşetilmedi, test verisi düzeltildi. (b) 12 çekirdekte 6 worker
× ikinci tarayıcı bağlamı → tek `next start`'a ~12 eş zamanlı bağlam; yerel worker tavanı 4
yapıldı, config yorumunda bunun YALNIZCA yük için olduğu, veri çakışmasının kilitlerle
çözüldüğü yazıldı. `retries` EKLENMEDİ — aksine 2c'nin koyduğu `retries: 2` KALDIRILDI.

**Doğrulama (main thread bağımsız koştu, gerçek sayılar; §1 tablosuna işlendi):**

- `npm run type-check` → temiz
- `npm run test` → **502/502** (42 dosya) — faz başında 426
- `npm run lint` → 0 hata, 14 uyarı
- `npm run build` → başarılı
- `npx supabase db reset` → 0 hata, 21 migration + seed
- `npm run test:rls` → **104/104** — faz başında 85 (zincir: 2b 85→95, 2g 95→99, 2h 99→104,
  bkz. aşağıdaki dilim anlatıları)
- `npm run test:transform` → 26/26
- `npm run ratchet` → 6 sayaç da yeşil (emoji 0/0, `font-black` 25/25, `bg-gradient-to-`
  12/12, `rounded-3xl` 15/15, `8b5cf6` 0/0, ondalık 0/0)
- `npm run format:check` → temiz
- `npm run test:e2e` → **50/50, iki ardışık koşu** (43.9s / 43.4s) + **CI yapılandırmasıyla**
  (`CI=1`, workers=1, retries=2) **50/50** (56.6s)
- Katalog: `exercises` 1328, `food_database` 591 (değişmedi)

**Kabul kriterleri:** AC-2.1 ✅ (uçtan uca akış Playwright'ta) · AC-2.2 ✅ (419 ms ölçüldü,
bütçe 2 sn) · AC-2.3 ✅ (curl ile yeniden kanıtlandı) · AC-2.4 ✅ (`supabase.from(` yalnızca
`src/hooks/**`) · **AC-1.6.7 ✅ — Faz 1.6'dan devredilmişti, `LoopRing` ile kapandı.**

**Kaydedilen borçlar (§5'e işlendi):**

- Yerel E2E veritabanı birikiyor ve hiç temizlenmiyor (`form_checks` 25, `workout_logs` 60,
  `messages` 42, `daily_logs` 28). `FormCheckTab` her render'da SATIR BAŞINA bir imzalı URL
  üretiyor — bu yük her koşuda büyüyor ve uzun vadede yeniden yük kaynaklı kararsızlık
  üretecek. Temizlik script'i gerekiyor (destructive, açık onay ister). Sonraki iş kalemi.
- E2E kilit ilanı zorunlu tutulmuyor: yeni bir test paylaşılan kayda yazıp `resource(...)`
  ilan etmezse sessizce yarışa girer. Tek koruma README kuralı, otomatik denetim yok.
- AC-2.2 payı ~2x (ölçümler 233-1005 ms, sınır 2000) ama yük duyarlı; DB birikimi büyürse
  ilk burası sıkışır.
- Arşiv plan versiyonları için GC yok; versiyon gezgini UI'ı yok (şema hazır, yüzey yok).
- `video_url` hiçbir yerde doldurulmuyor — embed yolu yazıldı ve testli ama pratikte uykuda.
- `message-attachments` için magic-byte doğrulaması storage tarafında yok (Faz 1.5 K3 borcu,
  storage seviyesinde hâlâ kapanmadı — istemci tarafı doğrulama var, sunucu tarafı yok).
- `useApproveProgram` (koç yolu) hâlâ 3 atomik olmayan çağrı yapıyor (Faz 1.7'den taşınan
  borç, bu turda da kapsanmadı).
- Koçun ara plan düzenlemeleri arşivlenmiyor (copy-on-write'ın bilinçli bedeli).

**Durum:** Faz 2 tamamlandı. Sıradaki iş **Faz 3 — Yemek Fotoğrafı Makro Tahmini**
(`active_planprogram.md` §5). Faz 3'ün `ai_backend/**` yarısı Faz 2'nin kalanıyla
çakışmadan yürüyebilir ama bir UI kuyruğu var (`ai_suggested` → `confirmed` onay ekranı,
makro dashboard entegrasyonu). `nutrition_logs` tablosu Faz 3 için ileriye uyumlu kuruldu:
`status` kolonu eklendiğinde `default 'confirmed'` ile backfill GEREKTİRMEYECEK.

---

### Doğrulama tablosu — Faz 2 satırları

| Kontrol                                                                | Komut                    | Durum                                                                                                                                    | Tarih      |
| ---------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Tip kontrolü (Faz 2 — koç-danışan çekirdek akışı sonrası)              | `npm run type-check`     | Temiz                                                                                                                                    | 2026-08-17 |
| Lint (Faz 2 — koç-danışan çekirdek akışı sonrası)                      | `npm run lint`           | Temiz — 0 hata, 14 uyarı                                                                                                                 | 2026-08-17 |
| Biçim (Faz 2 — koç-danışan çekirdek akışı sonrası)                     | `npm run format:check`   | Temiz                                                                                                                                    | 2026-08-17 |
| Birim/bileşen testleri (Faz 2 — koç-danışan çekirdek akışı sonrası)    | `npm run test`           | **502/502 (42 dosya)** — faz başında 426                                                                                                 | 2026-08-17 |
| Production build (Faz 2 — koç-danışan çekirdek akışı sonrası)          | `npm run build`          | Başarılı                                                                                                                                 | 2026-08-17 |
| Veritabanı migration'ları (Faz 2 — koç-danışan çekirdek akışı sonrası) | `npx supabase db reset`  | 0 hata — 21 migration + seed                                                                                                             | 2026-08-17 |
| RLS politika testleri (Faz 2 — koç-danışan çekirdek akışı sonrası)     | `npm run test:rls`       | **104/104** — faz başında 85                                                                                                             | 2026-08-17 |
| Plan transform testleri (Faz 2 — koç-danışan çekirdek akışı sonrası)   | `npm run test:transform` | 26/26                                                                                                                                    | 2026-08-17 |
| CI ratchet (Faz 2 — koç-danışan çekirdek akışı sonrası)                | `npm run ratchet`        | **6/6 sayaç yeşil** — emoji 59→**0**, `font-black` 49→**25**, `bg-gradient-to-` 14→**12**, `rounded-3xl` 17→**15**, `8b5cf6`/ondalık 0/0 | 2026-08-17 |
| Katalog (Faz 2 — koç-danışan çekirdek akışı sonrası, değişmedi)        | —                        | `exercises` 1328, `food_database` 591                                                                                                    | 2026-08-17 |
| E2E testleri (Faz 2 — koç-danışan çekirdek akışı sonrası)              | `npm run test:e2e`       | **50/50, iki ardışık koşu** (43.9s / 43.4s) + **CI yapılandırmasıyla** (`CI=1`, workers=1, retries=2) **50/50** (56.6s)                  | 2026-08-17 |

---

## Eski §5 — Faz 2'de doğan borçlar

Kapanmayanlar canlı [`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle
izlenir.

**YENİ BORÇLAR (Faz 2'de kaynaktan tespit edildi, 2026-08-17):**

| Borç                                                                    | Not                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yerel E2E veritabanı birikiyor, hiç temizlenmiyor                       | `form_checks` 25, `workout_logs` 60, `messages` 42, `daily_logs` 28 (Faz 2 sonu ölçümü). `FormCheckTab` her render'da SATIR BAŞINA bir imzalı URL üretiyor — yük her koşuda büyüyor, uzun vadede yeniden yük kaynaklı kararsızlık üretecek. Temizlik script'i gerekiyor (destructive, açık onay ister). **Sonraki iş kalemi.** |
| E2E kilit ilanı zorunlu tutulmuyor                                      | `tests/e2e/resource-lock.ts` yeni eklendi (bkz. §3 "Faz 2" 2j) ama bir test paylaşılan kayda yazıp `resource(...)` ilan etmezse sessizce yarışa girer. Tek koruma README kuralı, otomatik denetim yok.                                                                                                                         |
| AC-2.2 payı ~2x, yük duyarlı                                            | Ölçümler 233-1005 ms aralığında, sınır 2000 ms. DB birikimi (yukarıdaki madde) büyürse bütçeyi ilk burası zorlayacak.                                                                                                                                                                                                          |
| Arşiv plan versiyonları için GC yok, versiyon gezgini UI'ı yok          | 2h'nin copy-on-write kararının doğal sonucu: şema versiyonları saklıyor ama eskileri temizleyen iş yok, geçmiş versiyonları görüntüleyen bir yüzey de yok.                                                                                                                                                                     |
| `video_url` hiçbir yerde doldurulmuyor                                  | Embed yolu (allowlist'li YouTube/Vimeo, 2c) yazıldı ve test edildi ama pratikte hiçbir plan satırı bu alanı doldurmuyor — kod uykuda.                                                                                                                                                                                          |
| `message-attachments` için magic-byte doğrulaması storage tarafında yok | Faz 1.5'in K3 borcu bu bucket için hâlâ kapanmadı — istemci tarafı `upload-validation.ts` doğrulaması var, sunucu/storage tarafında yok.                                                                                                                                                                                       |
| `useApproveProgram` (koç yolu) hâlâ 3 atomik olmayan çağrı yapıyor      | Faz 1.7'den taşınan borç; Faz 2'nin 2g/2h RPC'leri danışan→koç ve plan yayınlama yollarını kapattı ama koçun onay yolu bu turda da kapsanmadı.                                                                                                                                                                                 |
| Koçun ara plan düzenlemeleri arşivlenmiyor                              | 2h'nin copy-on-write kararının bilinçli bedeli: yalnızca log'a bağlı aktif planlar arşivlenip yeni versiyona geçiyor, log'suz taslak düzenlemeleri yerinde üzerine yazılıyor — geçmişi yok.                                                                                                                                    |
