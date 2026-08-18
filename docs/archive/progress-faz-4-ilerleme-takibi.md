# Arşiv — Faz 4: İlerleme Takibi (2026-08-17/18)

**Özet.** Dört dilim (4a şema, 4b grafik tekleştirme, 4c giriş+trend, 4d
foto+önce/sonra) ve üç düzeltme turu (gece yarısı tarih hatası — gerçek
kullanıcı hatası, E2E mutlak iddiaları, RLS senaryolarının seed durumuna
bağımlılığı). Ayrıca yeni bir E2E temizlik script'i (`scripts/clean-e2e-data.mjs`)
ve dürüstçe kaydedilmiş bir yerel E2E koşum sınırı (52/54 yerel, 54/54 CI).

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Bu dosya faz kapanışında doğrudan yazılmıştır (2026-08-17'den sonraki dosya
> kuralı gereği) — `docs/PROGRESS.md`'den taşınmış bir metin değildir.

---

## Faz 4 — İlerleme Takibi (2026-08-17/18)

Dört dilim + üç düzeltme turu.

**4a — şema** (`supabase/migrations/20260817220000_progress_tracking.sql`): `progress_entries` + `progress_photos` + private `progress-photos` bucket.

- **Ölçüler `jsonb` DEĞİL ayrı kolonlar** (`waist/chest/arm/thigh/hip_cm numeric(5,2)`) — plan §3.1 `measurements jsonb` diyordu, bilinçli sapma. Gerekçe: (1) tek tüketici trend grafiği, jsonb'de `(measurements->>'waist')::numeric` satır bazında patlayabilen cast + ifade indeksi demek; (2) `db:types` jsonb'yi `Json` üretir (runtime daraltma borcu), ayrı kolon `number | null` — üretilen dosyada DOĞRULANDI; (3) jsonb anahtar beyaz listesi ister, yoksa `{"wiast": 80}` sessizce kabul edilir ve veri aylar sonra "kayıp" bulunur — ayrı kolonda `42703` ile anında ölür; (4) `add column` migration'da ve tiplerde GÖRÜNÜR, jsonb anahtarı görünmez doğar.
- **AC-4.1 şema seviyesinde:** `unique (client_id, entry_date)`.
- `angle` ENUM (`front|side|back`) — `db:types` birleşim tipi üretiyor, açı seçici derleme zamanı eksiksizlik denetimi alıyor.
- **KOÇ SALT OKUR — hem tabloda hem STORAGE'da.** Diğer üç bucket'tan bilinçli sapma: koça INSERT/UPDATE/DELETE verilmedi, çünkü koçun dosyayı silebilmesi tabloda kapatılan yazmayı storage'dan geri açardı (satır kalır, dosya kaybolur).
- RPC YOK, ek indeks YOK (unique btree aralık sorgusunu geriye tarayarak karşılıyor).
- RLS 104 → 110, üç kırmızı-yeşil kanıtı.

**4b — grafik tekleştirme (AC-4.3):** `chart.js` + `react-chartjs-2` düştü, tek kütüphane `recharts`. `grep -r "chart.js\|react-chartjs-2" src/` boş. `<Line>` yerine `<Area>` seçildi — orijinal Chart.js grafiği `fill: true` ile dolguluydu, körü körüne taklit görsel davranışı kaybettirirdi. **B-013 eksen rengi borcu kapandı** (ham `#888` → token); tema duyarlı mekanizma İCAT EDİLMEDİ, `CoachUserManagement`'ın bilinçli statik desenine uyuldu. `html2canvas` dokunulmadı (PNG dışa aktarma bağımlılığı, grafik kütüphanesi değil).

**4c — giriş + trend:** `useProgressEntries`, `StatsTab` yeniden yazıldı.

- **AC-4.1:** upsert `onConflict: 'client_id,entry_date'`; **ölçüm kolonları HER ZAMAN gönderiliyor** (boş alan `null`) — alanı göndermemek eski değeri sessizce korur ve "sildiğim ölçü hâlâ grafikte" hatası üretirdi. Üç katmanda kanıtlandı (mock gerçek `ON CONFLICT` semantiğini taklit ediyor; E2E'de "ölçüm günü" sayısı artmıyor; DB'de tek satır).
- **AC-4.2:** tek anahtar + tek `queryFn` + tek saf üretici (`buildTrendSeries`); `useProgressTrend` aynı istek üzerinden `select` ile türetiyor (ikinci ağ isteği yok). Ekrandaki özet de aynı seriden okunuyor.
- **İnterpolasyon-yok İKİ şartlı:** (1) aralıktaki HER gün için nokta üretiliyor, ölçümsüz gün `null` — yalnızca ölçüm olan günleri döndürmek kütüphane hiçbir şey interpole etmese bile sessiz interpolasyon olurdu; (2) `connectNulls={false}` AÇIKÇA yazıldı. Test gerçek SVG'de `d` niteliğindeki alt-yol sayısını sayıyor; mutasyon testi yapıldı (`true` yapınca kırılıyor).
- **`useFormChecks` grafiği KALDIRILDI:** aynı ekranda ikinci bir kilo serisini başka tablodan çizmek AC-4.2'nin yasakladığı şey; istemcide birleştirmek veri taşımayı sonsuza erteler ve taşıma sonrası "aynı kilo iki kez" üretir. Veri kaybı yok (form check kiloları iki yerde görünmeye devam ediyor).

**4d — fotoğraf + önce/sonra:** `ProgressPhotos` + `BeforeAfterSlider`, bağımsız bileşen sözleşmesiyle (`{ clientId, readOnly }`, kendi verisini kendi çeker).

- Yol sözleşmesi testi migration'daki `progress_photos_path_chk`'in **aynı regex'ine** karşı doğrulanıyor; ayrıca storage'a giden yol ile `photo_path`'in aynı olduğu iddia ediliyor — dosya ile satır ayrılamaz.
- **Slider'da `prefers-reduced-motion`:** dosyada hiç `animation`/`transition` yok, konum `useState` → inline `clip-path`. `globals.css`'in donduracağı bir şey yok. Test `matchMedia`'yı `reduce`'a ayarlayıp `clip-path`'in yeniden hesaplandığını doğruluyor (AC-1.6.7 ile aynı regresyon sınıfı).
- Native `<input type="range">` — ok tuşları/Home/End zaten çalışıyor.

### Üç düzeltme turu (planlanan işten DEĞİL, doğrulamadan çıktı)

**(1) Gece yarısı tarih hatası — gerçek kullanıcı hatası.** Bir ajan test düzeltirken tesadüfen fark etti.
Dört kolon (`daily_logs.log_date`, `nutrition_logs.log_date`, `progress_entries.entry_date`, `progress_photos.taken_on`) `CURRENT_DATE` (**UTC**) varsayılanı taşıyor; okuma tarafı `todayIsoDate()` ile **tarayıcı yerel** tarihine göre filtreliyor. Türkiye UTC+3 olduğu için her gün **00:00–03:00 arasında** danışanın eklediği öğün dashboard'a HİÇ yansımıyordu (toplam sıfır kalıyordu). Niyet kodda zaten yazılıydı ("`log_date` kullanıcının YEREL günüdür") — uygulama eksikti.
Düzeltme: `todayIsoDate()` `src/lib/date.ts`'e taşındı (tek kaynak; önce `useNutritionLogs`'ta yaşıyordu ve `useProgressEntries` oradan import ediyordu — ters bağımlılık). **Tarih alanı tipte ZORUNLU yapıldı** — hatanın SINIFINI kapatıyor: beşinci bir yazma yolu eklendiğinde `tsc` tarihi sormaya zorluyor (`tsc` düzeltme öncesi tam olarak 6 çağrı yerini işaretledi).
Kanıt tesadüfen kusursuz: E2E doğrulaması **hatanın penceresi içinde** koşuldu (host Europe/Istanbul 00:40, `psql select current_date` → 2026-08-17, tarayıcı yerel günü 2026-08-18) ve saat dilimi sabitlemesi OLMADAN geçti.
DB varsayılanı KALDIRILMADI (karar: uygulama yolu artık ona düşmüyor; kaldırmanın tek faydası "gürültülü hata" ve o fayda zaten derleme zamanında ve daha erken alındı; ayrıca 2 RLS senaryosu tarihsiz insert yapıyor).

**(2) E2E mutlak iddiaları.** `nutrition.spec.ts` `${mealKcal} / ${targetKcal} kcal` iddia ediyordu; dashboard o günün TÜM `nutrition_logs` satırlarını topluyor, önceki koşulardan kalan satırlar toplamı şişiriyordu (ölçüm: aynı danışan/gün 2 satır, 800 kcal, test 400 bekliyordu). Delta ölçümüne çevrildi (RLS senaryo 12/77 deseni). 9 spec tarandı; yalnızca bu birinde kusur vardı, diğerleri benzersiz üretilmiş değerlere baktığı için sağlam.

**(3) RLS senaryoları seed durumuna bağımlıydı.** `test:rls` kırıldı: E2E'nin `plans.spec` senaryosu seed'in `pending` onay talebini ONAYLAYARAK tüketiyor.
**G-03 tek kırık değildi — üç senaryo bozuktu (54, 92, 103)**, ama 54 ilk patladığı için diğerleri maskeleniyordu.
Ayrıca **yedi "sessizce boşa geçen" senaryo** bulundu (6, 7, 8, 16, 36, 53, 57): fikstür satırı yoksa "sızıntı yok" iddiası bedavaya geçiyordu — yani yanlış sebeple yeşil veriyorlardı.
Hepsi kendi kurulumunu yapar hâle getirildi; kurulum `set local role` çağrılmadan ÖNCE `postgres` kimliğiyle yapılıyor (kurulumu test edilen yetkiyle yapmak testi kendi kendini kanıtlar hâle getirirdi). İddia sayısı azalmadı, arttı. Dosya başlığına kalıcı "KENDİ KURULUMUNU YAPMA KURALI" sözleşmesi eklendi.
Bağımsızlık kanıtı: **beş eksen birden bozuldu** (pending yok, unread yok, form check pending yok, aktif plan yok, versiyonlar kaydırılmış), paket yine 110/110 geçti, sonra bire bir geri yüklendi.

### E2E temizlik script'i (yeni araç)

`scripts/clean-e2e-data.mjs` + `npm run db:clean-e2e`. Varsayılan `--dry-run`; gerçek silme açık bayrak ister. **Yalnızca yerel** — hedef `127.0.0.1` değilse Supabase istemcisi kurulmadan ÖNCE reddediyor (gerçek hosted config'le denendi, tek istek atılmadan `EXIT=1`).
Ölçütler şemadan değil canlı DB'den türetildi; iki incelik: `messages` için "başlar" değil **"içerir"** gerekiyor (sistem mesajı E2E metnini tırnak içinde alıntılıyor), `form_checks` için ikinci bir ölçüt gerekiyor (yarım kalmış koşunun `pending` kaydı hiçbir metin işareti taşımıyor → yol biçimi kullanıldı; seed ve üretilen yollar asla örtüşmüyor).
Seed koruması üç katmanlı; koruma sayaçları KODA GÖMÜLMEDİ (1328/591 hardcode edilseydi katalog yeniden import edilince doğrulama yalancı olurdu). FK sırası topolojik türetiliyor. Storage yetimleri DB temizliğinden SONRA hayatta kalan satırların yollarından hesaplanıyor; dry-run tuzağı kapatıldı.
"Seed durumunu geri yükle" sorumluluğu EKLENMEDİ: E2E'nin tükettiği `approved` ile koçun gerçekten onayladığı `approved` ayırt edilemez; geri almak `reviewed_by`/`reviewed_at` denetim izini yok ederdi. Bilinen sınır olarak script çıktısında basılıyor.

### E2E yerel koşum sınırı (dürüst kayıt)

Faz 4 sonrası paket yerelde kararsız. **Ürün DEĞİL, ölçüldü:** izole `waitForURL('/')` 97–140 ms; 16 eşzamanlı giriş max ~450 ms; soğuk başlangıç + eşzamanlı sekme tıklamaları max ~2.5 sn. Dashboard açılışında katalog VEYA Faz 4 sorguları tetiklenmiyor (sekmeler koşullu render).
İki hipotez ölçülerek ELENDİ: video kaydı (kapatıldı, fark yok — geri alındı çünkü teşhis değeri var) ve OneDrive senkron I/O (`outputDir` dışarı taşındı, fark yok — taşıma hijyen olarak bırakıldı).
Kalan: birden fazla gerçek Chromium örneğinin CPU maliyeti. **worker=2'de 4/4 koşuda birebir AYNI iki test düşüyor** (`plans.spec.ts:292`, `progress.spec.ts:66`) — ikisi de aynı test içinde İKİNCİ bir tarayıcı bağlamı açıyor, yani sistematik olarak en ağır ikisi.
Yerel worker tavanı 4 → **2** (ikinci kez ayarlanıyor). `CI=1 npx playwright test` (workers=1) **HER ZAMAN 54/54** verdi. README'ye çıkış yolu notu eklendi. `retries` EKLENMEDİ, timeout ŞİŞİRİLMEDİ.
**Durum dürüstçe: yerelde 52/54, CI yapılandırmasında 54/54.**

### Doğrulama (main thread koştu)

type-check temiz · vitest **598/598** (48 dosya, faz başında 511) · lint 0 hata/17 uyarı (3'ü Faz 4'ün `<img>` sınıfı) · build başarılı · ratchet 6/6 tavanla eşit · format temiz · `test:rls` **110/110** (faz başında 104) · `test:transform` 26/26 · katalog `exercises` 1328 / `food_database` 591 · **E2E: CI yapılandırması 54/54, yerel 52/54**

### Kabul kriterleri

AC-4.1 ✅ · AC-4.2 ✅ (tek seri kaynağı; "tüm ekranlar" kısmı için borç, bkz. aşağı) · AC-4.3 ✅

### Faz 4'ten doğan borçlar

- `CoachUserManagement` hâlâ kendi kilo grafiğini `form_checks`'ten çiziyor → AC-4.2'nin "tüm ekranlar" kısmı tam değil. Tam uyum, form check kilolarının `progress_entries`'e taşınması + o grafiğin `useProgressTrend`'e bağlanmasıyla kapanır. (B-036)
- E2E yerel koşum sınırı: `plans.spec.ts:292` ve `progress.spec.ts:66` paralellik > 1'de sistematik düşüyor (ikinci bağlam açan iki test). CI etkilenmiyor. (B-037)
- `progress_photos` yüklemesinde `insert` başarısız olursa storage nesnesi yetim kalıyor (telafi edici silme yok) — `useFormChecks.uploadPose`'daki mevcut takasın aynısı, yeni regresyon değil. (B-038)
- Temizlik script'i mutasyona uğramış seed satırlarının DURUMUNU geri yüklemiyor (bilinçli, gerekçesi script çıktısında). (B-039)
- `seed.sql`'in tek `pending` onay satırı hem demo verisi hem fikstür işi görüyor; E2E onu tüketiyor ve demo kuyruğu kalıcı boşalıyor. Öneri: E2E kendi `pending` satırını üretsin. (RLS paketi artık etkilenmiyor.) (B-040)
- lint uyarı tabanı 14 → 17 (Faz 4'ün fotoğraf gösterimi, bilinen `no-img-element` sınıfı). (B-041)

### Sonraki adımlar

Faz 4 tamamlandı. Sıradaki iş **Faz 4.5 — Monorepo ve Mobil Temel** (`active_planprogram.md` §7). Faz 3 ertelendi (ADR-0021).
