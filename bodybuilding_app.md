# CLAUDE CODE PROMPT — Online-Coaching-AppV2 → Mobil Vücut Geliştirme Ürünü

> Çalışma dili: Türkçe iletişim, İngilizce kod/commit/identifier.
> Model ataması: Ana thread orkestratör. Alt-agent'lar yalnızca açıkça belirtilen görevlerde, model adı yazılarak çağrılır.

---

## 0. ROL VE GÖREV TANIMI

Sen bu repoda **kıdemli mobil + backend mühendisisin**. Görevin sıfırdan ürün yazmak değil; mevcut Online-Coaching-AppV2 altyapısını (Next.js App Router + Supabase + FastAPI AI backend + Docker Compose) **mobil-öncelikli bir vücut geliştirme uygulamasına** genişletmek.

Referans ürün kategorisi: App Store'daki "KASHUB – Vücut Geliştirme" sınıfı uygulamalar. Referans, **özellik kapsamı ve kullanıcı akışı** içindir. Marka, isim, ikon, metin, ekran görüntüsü veya herhangi bir varlık kopyalanmaz. Ürün adı, görsel kimlik ve copy tamamen özgün olacak; çalışma adı `ironlog` (değiştirilebilir, FAZ 0'da sorulacak).

Hedef çıktı: iOS + Android'de çalışan, offline-first, Türkçe birincil dil (i18n ile EN ikincil), abonelik modelli, AI destekli bir mobil uygulama ve onu besleyen backend genişlemeleri.

---

## 1. KESİN KURALLAR (İHLAL EDİLEMEZ)

1. **FAZ 0 tamamlanıp onaylanmadan hiçbir dosya değiştirilmez.** Keşif salt-okunurdur.
2. **Git komutları (commit, branch, push, rebase, stash) yalnızca benim açık onayımla** çalıştırılır. Alt-agent'lar hiçbir koşulda git komutu çalıştıramaz.
3. Her faz sonunda **`DUR ve RAPORLA`**: ne yapıldı, ne doğrulandı (komut çıktısıyla), ne açık kaldı, bir sonraki faz için karar noktaları. Onay gelmeden sonraki faza geçilmez.
4. **Varsayım yasağı.** Bir dosyanın, tablonun, endpoint'in veya paketin var olduğunu iddia etmeden önce oku/listele. "Muhtemelen var" kabul edilmez.
5. **Mevcut mekanizmayı doğrula, boşluğu doldur.** Zaten var olan bir şeyi (RLS policy, rate limiter, outbox, theming token'ları vb.) yeniden yazmak yerine tekrar kullan veya genişlet. Yeniden yazma gerekiyorsa gerekçesini raporda yaz ve onay iste.
6. Her faz sonunda uygulama **derlenir ve çalışır** halde bırakılır (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `expo doctor`, FastAPI `pytest` — hangisi mevcutsa).
7. **Scope dışı (dokunma):** ödeme sağlayıcı seçimi dışında gerçek para akışı testleri, App Store/Play Store submission, pazarlama metinleri, sosyal ağ (feed/takip/yorum) altyapısı, canlı koç–danışan chat'i.
8. **Sağlık/hukuk sınırları:** Uygulama tıbbi tavsiye vermez. AI asistanlar ilaç, hormon, performans artırıcı madde, dozaj veya "döngü" (PED anlamında) konularında içerik üretmez; bu konu geldiğinde standart bir yönlendirme mesajı döner. "Döngü Modülü" bu projede **antrenman periyodizasyonu** (mezo/mikro döngü, deload, peak haftası) anlamına gelir, başka anlam taşımaz.
9. Tüm yeni tablolar RLS ile gelir. RLS'siz migration kabul edilmez.
10. Token ekonomisi: Büyük dosyaları (`package-lock.json`, dataset CSV'leri, `public/`) tamamen okuma; `head`/`grep`/`wc` ile özetle.

---

## 2. FAZ 0 — KEŞİF VE BOŞLUK ANALİZİ (salt-okunur, zorunlu)

### 2.1 Repo envanteri
- Kök yapıyı listele. Monorepo mu (`pnpm-workspace.yaml`, `turbo.json`, `apps/`, `packages/`) yoksa tek Next.js projesi mi (`src/`, `jsconfig.json`)?
- TypeScript durumu: `tsconfig.json` var mı, `.js/.jsx` vs `.ts/.tsx` dosya sayısı (`find | wc -l`).
- Expo/React Native projesi var mı (`apps/mobile`, `app.json`, `expo` bağımlılığı)?
- Paket yöneticisi: `package-lock.json` mı, `pnpm-lock.yaml` mı? Çelişki varsa raporla.
- `tailwind.config.js` **ve** `tailwind.config.mjs` birlikte duruyorsa hangisi aktif, hangisi artık? Raporla.

### 2.2 Supabase envanteri
- `supabase/migrations/` var mı? Yoksa şema nerede tanımlı (SQL dosyası, README, sadece dashboard)?
- Mevcut tabloları, RLS policy'lerini, storage bucket'larını, edge function'ları listele.
- Auth yöntemi: email/password, OAuth, magic link — hangileri aktif?
- Rol modeli: `coach` / `client` / `admin` ayrımı nasıl yapılıyor (claim, tablo, her ikisi)?

### 2.3 FastAPI AI backend envanteri
- `ai_backend/` içindeki router'lar, endpoint listesi, kullanılan model sağlayıcı(lar), mevcut rate limit ve kota mekanizması.
- Meal photo macro estimation, recovery scoring, push notification outbox — **gerçekten mevcut mu**, yoksa sadece planda mı kaldı? Dosya yoluyla kanıtla.
- Dataset CSV'leri: hangi veri, hangi lisans, repo içinde mi (boyut)?

### 2.4 Mevcut domain modeli
- Beslenme, antrenman, istatistik için mevcut tablolar/tipler. Egzersiz kataloğu var mı (kas grubu, ekipman, medya alanları)?
- Tema/tasarım token'ları: iki katmanlı semantik token sistemi var mı? Varsa mobile taşınabilir mi?

### 2.5 Çıktı
`docs/mobile/00-gap-analysis.md` yazma — **henüz dosya yazma yetkisi yok**; raporu sohbet içinde ver. Raporda:
- Her modül için `VAR / KISMEN / YOK` tablosu.
- Aşağıdaki fazların hangilerinin kısaltılabileceği, hangilerinin genişletileceği.
- **Karar soruları** (örnek): Ürün adı? Expo SDK sürümü? Abonelik için RevenueCat mı, doğrudan StoreKit/Play Billing mi? AI sağlayıcı mevcut mu kalacak? Egzersiz medya kaynağı (kendi çekimi / lisanslı kütüphane / placeholder)?

**`DUR ve RAPORLA`.** Onay ve cevaplar gelmeden FAZ 1'e geçme.

---

## 3. HEDEF MİMARİ (FAZ 0 sonucuna göre revize edilecek)

```
apps/
  web/            # mevcut Next.js (koç paneli + web client)
  mobile/         # Expo (React Native), expo-router, TypeScript strict
packages/
  db/             # Supabase tipleri (supabase gen types), zod şemaları
  domain/         # saf TS: hesaplamalar (1RM, volume, TDEE, RPE→%), tarih/yardımcılar — UI bağımsız
  ui-tokens/      # semantik design token'ları (web + mobile ortak)
  api-client/     # FastAPI + Supabase çağrıları için tip güvenli istemci
ai_backend/       # FastAPI (mevcut), yeni router'lar eklenir
supabase/
  migrations/     # tüm şema değişiklikleri buradan
```

Monorepo yoksa FAZ 1'de kurulur. Varsa bu yapıya **yakınsanır**, zorla yeniden düzenlenmez.

Mobil teknik kararlar (FAZ 0'da teyit edilecek):
- **Expo + expo-router**, TypeScript strict, **NativeWind** (token'ları Tailwind üzerinden paylaşmak için) veya Tamagui — tek biri, gerekçeyle.
- State: **TanStack Query** (sunucu) + **Zustand** (UI/yerel). Web ile aynı query key konvansiyonu.
- Offline: **expo-sqlite** + yerel yazma kuyruğu (`sync_queue` tablosu), çevrimiçi olunca Supabase'e flush. Çakışma çözümü: **last-write-wins + `updated_at` + `client_mutation_id`** (idempotent upsert). Supabase Realtime yalnızca koç→danışan program güncellemeleri için.
- Auth: Supabase Auth, `expo-secure-store` ile token saklama, biyometrik kilit opsiyonel.
- Abonelik: **RevenueCat** (varsayılan öneri; iOS+Android tek SDK, webhook → Supabase `entitlements` tablosu). Sunucu taraflı entitlement kontrolü zorunlu, istemci güvenilmez.
- Bildirim: Expo Push + mevcut outbox pattern (varsa), yoksa outbox FAZ 6'da kurulur.
- Medya: egzersiz görsel/videoları Supabase Storage, CDN üzerinden, imzalı URL; upload yalnızca koç/admin.
- Telemetri: Sentry (crash) + minimal event log tablosu; üçüncü taraf tracking SDK'sı **yok** (KVKK).

---

## 4. FAZLAR

Her faz: **Amaç → Teslimatlar → Kabul Kriterleri → Doğrulama komutları → `DUR ve RAPORLA`**.
Alt-agent kullanımı her fazda belirtilmiştir; belirtilmeyen yerde ana thread yapar.

### FAZ 1 — Temel: monorepo, paylaşılan paketler, mobil iskelet
**Amaç:** Mobil uygulamanın açılıp Supabase'e login olabildiği, web'in bozulmadığı taban.

Teslimatlar:
- Monorepo (yoksa): pnpm workspaces + Turborepo; `apps/web` mevcut Next.js taşınır, `git mv` ile geçmiş korunur. Tüm web testleri/yapıları taşınma sonrası geçer.
- `packages/db`: `supabase gen types typescript` çıktısı + zod şemaları. Tip üretimi `turbo` task'ı.
- `packages/ui-tokens`: mevcut semantik token'lar (varsa) tek kaynaktan hem Tailwind (web) hem NativeWind (mobile) config'ine aktarılır. Dark/light/system.
- `apps/mobile`: Expo, expo-router, strict TS, ESLint/Prettier web ile aynı config'i extend eder. Ekranlar: Splash → Auth (login/register/reset) → boş tab bar (`Home / Train / Nutrition / Progress / More`).
- `apps/mobile/.env.example`, `app.config.ts` (env'den `EXPO_PUBLIC_SUPABASE_URL` vb.).
- i18n altyapısı: `i18next` + `tr` (varsayılan) / `en`. Hard-coded string yasağı ESLint kuralıyla.
- CI: mevcut GitHub Actions pipeline'ına `mobile: typecheck + lint + jest` job'u.

Kabul:
- `pnpm turbo typecheck lint test` yeşil.
- iOS simulator ve Android emulator'de login → boş tab bar. (Erişimin yoksa `expo export` + `expo doctor` ile doğrula ve bunu raporda belirt.)
- Web'de regresyon yok (smoke: login, dashboard açılır).

Alt-agent: `packages/ui-tokens` taşımasını **Sonnet** alt-agent'a ver; `git mv` dışında git yok.

---

### FAZ 2 — Veri modeli: bodybuilding domain'i
**Amaç:** Tüm modüllerin ihtiyaç duyduğu şema, RLS ile birlikte, tek migration setiyle.

Yeni/genişletilen tablolar (mevcutla çakışanı **genişlet**, yenisini ekleme):

| Alan | Tablolar |
|---|---|
| Onboarding | `user_profiles` (hedef: bulk/cut/recomp/contest_prep, deneyim seviyesi, antrenman günü sayısı, ekipman, yaralanma notları, birim sistemi), `onboarding_answers` (soru id, cevap jsonb, sürüm) |
| Egzersiz kataloğu | `exercises` (isim tr/en, birincil/ikincil kas grupları, ekipman, hareket paterni, medya referansları, `is_custom`, `owner_id`), `muscle_groups` (hiyerarşik) |
| Program & periyodizasyon | `programs`, `mesocycles` (hafta sayısı, hedef, deload haftası), `program_days`, `program_day_exercises` (set/rep/RPE/%1RM hedefleri, tempo, dinlenme), `program_assignments` (koç→danışan) |
| Antrenman günlüğü | `workout_sessions` (başlangıç/bitiş, kaynak: program/freestyle, notlar, algılanan zorluk), `workout_sets` (ağırlık, tekrar, RPE/RIR, set tipi: warmup/working/drop/failure, `client_mutation_id` UNIQUE) |
| Kardiyo | `cardio_sessions` (tip, süre, mesafe, ort. nabız, kalori tahmini, zone dağılımı jsonb, kaynak: manuel/HealthKit/Health Connect) |
| Beslenme | mevcut tabloları kullan; eksikse `meals`, `meal_items`, `foods` (Türk gıda veri seti uyumlu), `nutrition_targets` (faz bazlı makro hedefleri, geçerlilik aralığı), `body_weight_logs` |
| Vücut ölçüleri & pozlama | `body_measurements` (çevre ölçüleri, yağ oranı tahmini, yöntem), `progress_photos` (storage path, poz tipi enum: front_relaxed/front_double_biceps/side_chest/back_lat_spread/…, ışık/açı notu), `posing_sessions` (pratik süresi, poz listesi, öz-değerlendirme) |
| Sağlık | `health_daily` (uyku süresi/kalite, dinlenik nabız, HRV, adım, kaynak), mevcut `recovery_scores` varsa bağla |
| Süreçler | `processes` (örn. "12 haftalık cut", "yarışma hazırlığı": başlangıç/bitiş, milestone'lar jsonb, durum), `process_checkins` (haftalık: kilo, foto seti, ölçü, uyum yüzdesi, koç notu) |
| Abonelik | `entitlements` (user_id, product_id, store, aktif mi, bitiş, kaynak webhook id) |
| Senkron | istemci tarafı `sync_queue` (SQLite, Postgres değil) |

Kurallar:
- Her tabloda `id uuid`, `user_id`, `created_at`, `updated_at`, `deleted_at` (soft delete), `updated_at` trigger'ı.
- RLS: danışan yalnızca kendi satırları; koç yalnızca `program_assignments`/`coach_clients` ile bağlı danışanların satırları (SELECT + sınırlı UPDATE); admin service role.
- Ağır sorgular için index'ler: `(user_id, performed_at DESC)`, `(user_id, exercise_id, performed_at)`.
- Türetilmiş metrikler için **materialized view** veya zamanlanmış fonksiyon: `exercise_prs` (e1RM, en iyi set), `weekly_volume_by_muscle`.
- Seed: 150+ temel egzersiz (kas grubu ve ekipman etiketli, medya alanı boş), kas grubu hiyerarşisi, poz tipleri. Seed verisi özgün/serbest lisanslı olmalı; kaynak belirtilmeli.
- `packages/db` tipleri yeniden üretilir; `packages/domain`'de hesaplamalar: `estimate1RM(Epley|Brzycki)`, `tonnage`, `rpeToPercent`, `tdee(Mifflin-St Jeor)`, `macroSplit(goal, phase)`. Hepsi unit test'li.

Kabul: migration'lar temiz DB'ye sıfırdan uygulanır; RLS testleri (`pgTAP` veya Supabase test harness) koç/danışan sınırlarını kanıtlar; domain paketi %100 test coverage.

Alt-agent: RLS testlerini **Opus 4.8** alt-agent'a yazdır (kritik). Seed dosyasını **Sonnet**'e.

---

### FAZ 3 — Onboarding + Antrenman modülü (çekirdek deneyim)
**Amaç:** Kullanıcı kayıt olur, anketi tamamlar, program alır, antrenmanı **çevrimdışı** loglar.

Onboarding:
- 8–12 soruluk, **ilerleme kaydedilen** (her adım yerel + sunucuya yazılır, çıkıp dönünce kaldığı yerden) anket. Referans üründeki "3. soruda takılma" sınıfı hatalara karşı: her adım `ScrollView` içinde, klavye kaçınma, her cevap tipi için ayrı bileşen ve snapshot testi.
- Anket sonunda `packages/domain` ile ilk hedefler (TDEE, makrolar, program şablonu önerisi) hesaplanır ve gösterilir; kullanıcı düzenleyebilir.

Antrenman:
- Program görünümü: mezo-döngü → hafta → gün → egzersiz. Deload haftaları işaretli.
- **Aktif antrenman ekranı:** set girişi (ağırlık/tekrar/RPE), önceki seansın aynı egzersizdeki değerleri referans olarak, dinlenme zamanlayıcısı (arka planda çalışır, bildirimle), set tipi etiketi, egzersiz değiştirme, süper-set desteği. Ekran kilidi sırasında kayıt kaybı yok (her set anında SQLite'a).
- Offline senkron: `sync_queue` → çevrimiçi olunca sıralı flush, `client_mutation_id` ile idempotent upsert, hata durumunda exponential backoff; kullanıcıya "senkron bekliyor" göstergesi.
- Serbest antrenman (programsız) ve özel egzersiz oluşturma.
- Egzersiz detay: kas haritası (SVG, ortak token'lar), medya (varsa), kişisel PR geçmişi.
- Koç tarafı (web, minimal): program oluşturma/atama ekranları mevcut dashboard'a sekme olarak.

Kabul: uçak modunda 3 antrenman loglanır → çevrimiçi olunca tamamı çift kayıt olmadan Supabase'de; dinlenme zamanlayıcısı arka planda doğru tetiklenir; onboarding her adımdan çıkılıp devam edilebilir (E2E: Maestro veya Detox — FAZ 0'da seçilecek).

---

### FAZ 4 — Beslenme + Kardiyo + Sağlık modülleri
**Amaç:** Günlük girdilerin tamamı tek akışta; mevcut AI yeteneklerinin mobile açılması.

Beslenme:
- Günlük makro halkası, öğün bazlı giriş, gıda arama (Türk gıda veri seti + kullanıcı özel gıdaları), barkod okuma (`expo-camera`) — veri yoksa manuel giriş.
- **Meal photo macro estimation**: mevcut FastAPI endpoint'i varsa mobile bağlanır; yoksa FastAPI'de `/v1/nutrition/estimate-from-photo` eklenir, mevcut rate limit + kota mekanizmasının arkasına. Sonuç "tahmin" etiketiyle gösterilir, kullanıcı düzeltebilir.
- Faz bazlı hedef değişimi (cut haftası 4'te kalori düşürme) `nutrition_targets` geçerlilik aralığıyla.

Kardiyo:
- Manuel giriş + zamanlayıcı modu; HealthKit (iOS) / Health Connect (Android) ile adım, nabız, seans içe aktarma. İzin akışı açıkça gerekçeli; reddedilirse manuel mod bozulmaz.

Sağlık:
- Günlük uyku/dinlenik nabız/HRV; mevcut recovery scoring varsa bağlanır, yoksa `packages/domain`'de basit ağırlıklı skor (şeffaf formül, UI'da açıklanır).
- Sağlık verisi **hiçbir üçüncü tarafa** gitmez; AI'ya gönderilecekse FAZ 6'daki redaksiyon katmanından geçer.

Kabul: foto → makro tahmini ≤ 8 sn p95 (stub sağlayıcıyla); HealthKit izni reddedildiğinde tüm ekranlar çalışır; rate limit aşımında kullanıcıya anlamlı mesaj.

Alt-agent: HealthKit/Health Connect köprüsünü **Opus 4.8**'e; gıda arama UI'ını **Sonnet**'e.

---

### FAZ 5 — İlerleme, Pozlama ve Süreçler
**Amaç:** Kas gelişimi takibi ve "Kashub sınıfı" analitik.

İlerleme:
- Grafikler (`victory-native` veya `react-native-skia` tabanlı — FAZ 0'da seçilecek): e1RM trendi/egzersiz, haftalık kas grubu hacmi (ısı haritası), vücut ağırlığı 7-günlük hareketli ortalama, ölçüler, yağ oranı tahmini.
- "Kas gelişimi analizi": kas grubu başına hacim + yoğunluk + frekans → zayıf/güçlü bölge raporu. Formül `packages/domain`'de, test'li, UI'da "nasıl hesaplandı" açıklaması.
- PR kutlama bildirimleri (FAZ 6 outbox ile).

Pozlama:
- Poz kütüphanesi (zorunlu pozlar + klasik fizik vb. kategorileri), her poz için açıklama ve referans çizim (özgün SVG/illüstrasyon; fotoğraf kopyalama yok).
- Pratik modu: poz sırası + süre + kamera önizleme; isteğe bağlı kayıt → `progress_photos`. Yan yana karşılaştırma (tarih A vs B, aynı poz), silüet hizalama kılavuzu.
- Fotoğraflar yalnızca kullanıcının private bucket'ında, imzalı URL 10 dk, koç erişimi yalnızca kullanıcı paylaşımı açarsa.

Süreçler:
- Süreç oluşturma sihirbazı (hedef, süre, check-in günü), haftalık check-in akışı (kilo, foto seti, ölçü, uyum, not), zaman çizelgesi görünümü, koç yorumu (web'den).
- Sosyal paylaşım **yalnızca** dışa aktarma: kullanıcı seçtiği metrik/foto ile görsel kart üretir (`react-native-view-shot`), sistem paylaşım menüsüne verir. Uygulama içi feed yok (scope dışı).

Kabul: 12 haftalık sahte süreç verisiyle tüm grafikler 60 fps scroll; foto bucket RLS testi başka kullanıcıya sızıntı olmadığını kanıtlar.

---

### FAZ 6 — AI koç asistanları + bildirim + motivasyon
**Amaç:** Mevcut FastAPI AI backend'in modüler asistanlara dönüşmesi, güvenli ve maliyeti sınırlı.

- FastAPI'de `/v1/assistant/{module}` (module ∈ `training | nutrition | cardio | posing | health | periodization | process`). Her modülün ayrı sistem promptu, ayrı bağlam derleyicisi (yalnızca o modüle ait son N gün verisi), ayrı kota.
- **Bağlam redaksiyonu:** isim/e-posta/cihaz id AI'ya gitmez; sağlık verisi agregat olarak (ör. "son 7 gün ort. uyku 6.2 sa") gider.
- **Güvenlik katmanı:** Madde 1.8'deki PED/dozaj konuları için istek öncesi sınıflandırıcı + sabit yanıt; tıbbi semptom ifadelerinde "sağlık profesyoneline danışın" kalıbı.
- Streaming yanıt (SSE) → mobile'da akıcı gösterim; yanıtlar `assistant_messages` tablosuna, kullanıcı silebilir.
- Maliyet: mevcut AI provider kota mekanizması yoksa kur — kullanıcı/gün token bütçesi, entitlement katmanına bağlı (free: küçük, pro: büyük).
- Bildirim: outbox pattern (varsa kullan) → Expo Push. Tipler: antrenman hatırlatma (kullanıcının seçtiği saat), check-in günü, PR kutlaması, streak tehlikede. Sessiz saat ayarı. Tüm bildirimler opt-in.
- Motivasyon: streak, haftalık hedef tamamlama, rozetler — sunucu tarafında hesaplanır, istemci yalnızca gösterir.

Kabul: redaksiyon unit testleri (PII sızıntısı 0); PED konulu 20 test promptu → hepsi sabit yanıt; kota aşımı 429 + mobile'da uygun ekran; bildirim outbox'ı çift gönderim yapmaz (idempotency test).

Alt-agent: redaksiyon + güvenlik sınıflandırıcıyı **Opus 4.8**; bildirim tiplerini **Sonnet**.

---

### FAZ 7 — Abonelik, release hazırlığı, sertleştirme
**Amaç:** Mağazaya gidebilecek kalite; para akışı mimarisi hazır, gerçek ödeme testleri scope dışı.

- RevenueCat (veya seçilen) entegrasyonu: ürün katmanları `free / pro_monthly / pro_yearly / coaching_monthly`. Webhook → `entitlements`. Paywall ekranı (A/B altyapısı yok, tek ekran). **Tüm premium kapılar sunucu tarafında** (`entitlements` kontrolü RLS veya edge function'da), istemci yalnızca UI gizler.
- Hesap silme (KVKK/GDPR): mevcut mekanizma varsa mobile bağlanır; yoksa tek endpoint: tüm tablolar + storage + entitlements iptali, 30 gün gecikmeli hard delete.
- Gizlilik: `docs/mobile/privacy-data-map.md` — hangi veri, nerede, ne kadar, kiminle. App Store "Privacy Nutrition Label" ve Play "Data Safety" cevapları bu dokümandan türetilir. Üçüncü taraf tracking SDK'sı **yok**.
- Sertleştirme: certificate pinning (opsiyonel, FAZ 0'da karar), jailbreak/root tespiti yalnızca uyarı, secure-store dışında token yok, deep link doğrulama, `expo-updates` imzalı OTA.
- Performans: soğuk açılış ≤ 2 sn (orta segment Android), liste ekranları `FlashList`, görseller `expo-image` + cache.
- Erişilebilirlik: tüm dokunma hedefleri ≥ 44pt, dinamik yazı boyutu, VoiceOver/TalkBack etiketleri.
- EAS Build profilleri (`development / preview / production`), CI'da `eas build --platform all --non-interactive` preview job'u (secret'lar GitHub'da).
- Dokümantasyon: `docs/mobile/architecture.md`, `docs/mobile/sync-protocol.md`, `docs/mobile/runbook.md`, ADR'ler (`docs/adr/NNNN-*.md`) — özellikle offline çakışma çözümü, abonelik sağlayıcı, AI güvenlik katmanı kararları.

Kabul: `eas build` preview başarılı; Lighthouse-benzeri mobil performans kontrol listesi raporlanır; entitlement bypass denemesi (istemci flag'i elle değiştirme) sunucu tarafından reddedilir; hesap silme E2E testi.

---

## 5. RAPOR FORMATI (her `DUR ve RAPORLA` için)

```
## FAZ N RAPORU
### Yapılanlar
- dosya yolu → ne değişti (1 satır)
### Doğrulama
- komut → çıktı özeti (yeşil/kırmızı)
### Açık kalanlar / riskler
### Karar gerektirenler (numaralı, her biri için önerim + gerekçe)
### Sonraki faz için tahmini dosya/etki alanı
```

Git onayı ayrı satırda istenir: `GIT ONAYI: <önerilen branch> / <commit mesajı (conventional)>`.

---

## 6. BAŞLA

FAZ 0 ile başla. Salt-okunur keşif yap, raporu ver, karar sorularını sor, dur.
