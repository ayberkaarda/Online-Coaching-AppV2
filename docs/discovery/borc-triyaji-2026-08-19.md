# Borç Tablosu Triyajı — 2026-08-19

**Tarih:** 2026-08-19
**Üretim gerekçesi:** `docs/PROGRESS.md` §3'teki borç tablosu 44 açık satıra ulaştı ve
**ayıklanmamış** durumda: gerçek risk taşıyan maddelerle kozmetik maddeler, bilinçli ürün
kararlarıyla açık işler aynı düzlemde duruyor. Bu dosya **karar önerisi**dir — karar
kullanıcı + main thread'e aittir; hiçbir satır bu turda tablodan silinmedi.

**Yöntem.** 44 maddenin **tamamı** için (a) `Kaynak` sütunundaki arşiv dosyasındaki tam
metin okundu, (b) mümkün olan her yerde iddia **kaynak koddan** doğrulandı. Aşağıdaki her
"çözülmüş / geçersiz / hâlâ geçerli" iddiasının yanında dosya:satır veya komut çıktısı
vardır. Şüphede kalınan hiçbir madde A'ya konmadı.

**Bu turda hiçbir kod dosyası değiştirilmedi, hiçbir git komutu çalıştırılmadı.** Biçim
`docs/discovery/faz-4.5-tasima-envanteri.md` konvansiyonunu takip eder.

**Kapsam notu.** Bugün kapanan B-019/B-045/B-046/B-050/B-055 tabloda yok, aranmadı.
Bugün açılan B-056/B-057/B-058 ve kısmi B-030 dahildir. Şu an paralel ajanların üzerinde
çalıştığı dört borç (**B-040, B-042, B-043, B-056**) triyajda **"ÜZERİNDE ÇALIŞILIYOR"**
olarak işaretlidir ve **çözülmüş sayılmamıştır** — üçü için kodda başlamış iş görüldü
(`apps/web/src/lib/api/ai-quota.ts` ve `WorkoutTab.tsx`'teki B-056 yorumu commit
edilmemiş durumda), ancak hiçbiri doğrulanmış/commit'lenmiş değildir.

---

## 1. Yönetici özeti

### Sınıf dağılımı

| Sınıf                                        | Adet   | Öneri                                                  |
| -------------------------------------------- | ------ | ------------------------------------------------------ |
| **A — Zaten çözülmüş**                       | **0**  | —                                                      |
| **B — Kabul edilmiş takas ("yapmayacağız")** | **14** | Tablodan çıkar → yeni "Bilinçli takaslar" listesi      |
| **C — Birleştirilebilir**                    | **4**  | 4 satır → 1 satır (+1 satır başka bir maddeye eklenir) |
| **D — Gerçek ve açık**                       | **24** | Tabloda kalır, risk × maliyet × faz ile                |
| **E — İzleme maddesi, borç değil**           | **2**  | Tablodan çıkar → yeni "İzleme" bölümü                  |
| **Toplam**                                   | **44** |                                                        |

### Tabloda kaç satır kalır

**44 → 25 satır** (24 adet D + B-011/B-012/B-016'nın birleştiği 1 yeni satır).
**%43 daralma.** Ayrıca 14 satır "bilinçli takaslar" listesine, 2 satır "izleme"
bölümüne taşınır — hiçbir bilgi kaybolmaz, yalnızca **borç** olmayanlar borç
tablosundan çıkar.

### A sınıfı neden boş?

Bu, tablonun dürüst tutulduğunun kanıtıdır: 44 maddenin hiçbiri araya giren fazlarda
sessizce kapanmamış. En yakın üç aday da tam kapanmadı:

- **B-001** — istenen iki aksiyon (`profiles` cache'inin kaldırılması, logout temizliği)
  kodda **tam** uygulanmış (`apps/web/next.config.mjs:125-148`,
  `packages/api-client/src/hooks/useSession.ts:21-31,136-143`), ama kalan 7 günlük
  `workout_logs` tutması bilinçli bir takas → **B**, A değil.
- **B-013** — Chart.js gerçekten kaldırıldı ve eksen rengi token'a çekildi
  (`StatsTab.tsx:297,304`), ama `html2canvas` hâlâ kullanımda
  (`DashboardTabs.tsx:92-96`) → **D**, A değil.
- **B-016** — `text-warning` artık 6 yerde/4 dosyada kullanılıyor; ham `orange-`/`amber-`
  yalnızca **tek** dosyada 4 kullanıma düşmüş (`DashboardTabs.tsx:152,154,162,303`).
  Borcun metni ("token ekranlara akmıyor") artık **yanlış**, ama kalan 4 kullanım
  yüzünden tam kapanmadı → **C**, A değil.

Ek doğrulama: `apps/web/src`, `packages/*/src` ve `apps/mobile/app` altında **sıfır**
`TODO`/`FIXME`/`HACK` işareti var — borç kaydı gerçekten tek noktada, bu tabloda tutuluyor.

### En tehlikeli 5 madde (D sınıfı, sıralı)

| #     | ID        | Neden bu sırada                                                                                                                                                                                                                                        |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **B-042** | Hesap silme akışı **hiç yok** (`delete-account`/`deleteAccount` için repoda 0 eşleşme). KVKK/GDPR "unutulma hakkı" yasal bir yükümlülük ve tetikleyici hosted'da ilk gerçek danışan verisinin oluşması. **ÜZERİNDE ÇALIŞILIYOR (Faz 4.6).**            |
| **2** | **B-033** | `apps/web/.env.hosted.local` diskte **düz metin `service_role`** anahtarı taşıyor — bu anahtar RLS'i tamamen bypass eder. `.gitignore:44` (`.env*`) git'i durdurur ama **repo yolu OneDrive altındadır**; dosya bulut senkronuna açık olabilir.        |
| **3** | **B-030** | Hosted yedeğin **gerçek koşusu ve restore kanıtı yok**. Altyapı hazır (`scripts/backup-hosted.mjs`, `docs/ops/hosted-backup.md`) ama hiç çalıştırılmadı. Faz 4.6 **geri dönüşsüz silme** getiriyor — bu, o fazın ilan edilmiş ön koşuludur (§5).       |
| **4** | **B-043** | AI uçlarında kullanıcı başına günlük kota yok; tek koruma IP/kullanıcı hız sınırı. Faturalanabilir bir dış servisin önünde kota yokluğu doğrudan maliyet/suistimal riskidir. **ÜZERİNDE ÇALIŞILIYOR (Faz 4.6).**                                       |
| **5** | **B-028** | `message-attachments` yüklemesinde magic-byte doğrulaması **yalnızca istemcide** (`useMessages.ts:259-267`); bucket sunucu tarafında sadece istemcinin bildirdiği MIME'a bakıyor (`20260817190200_message_attachments.sql:172-184`) — SDK ile atlanır. |

Sıralamayı kıl payı kaçıranlar: **B-009** (RLS reddi operatöre hiç ulaşmıyor — saldırı
denemesinin sunucu tarafında izi yok) ve **B-031** (tarayıcıdan hosted'a doğrudan yazma
yolu; sunucu guard'ı tasarım gereği kesemiyor).

---

## 2. Sınıf tabloları

### A — ZATEN ÇÖZÜLMÜŞ (0 madde)

Yok. Gerekçesi ve en yakın üç aday yukarıda §1'de.

### B — KABUL EDİLMİŞ TAKAS: "yapmayacağız" (14 madde)

Bunlar teknik olarak doğru tespitlerdir ama **ürün/mimari kararı gereği kapatılmayacaktır**.
Borç olarak taşımak yanıltıcıdır: tablo "yapılacak iş" listesi olmalı. Öneri: hepsi
tablodan çıkarılıp §3'ün altına yeni bir **"Bilinçli takaslar (borç değil)"** listesine
taşınsın — mevcut "Ertelenenler" paragrafının kardeşi olarak.

| ID    | Tek cümle                                                             | Gerekçe (neden "yapmayacağız")                                                                                                                             | Kanıt                                                                                                                                                                                                                       |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-001 | PWA `workout_logs` yanıtlarını 7 gün cihazda tutuyor                  | Talep edilen iki düzeltme **tamamlandı**; kalan tutma süresi salonda çevrimdışı antrenman kaydı için gereken bilinçli mahremiyet takası                    | `apps/web/next.config.mjs:125-148` (yalnızca `workout_logs`, `profiles` yorumla dışlanmış); `useSession.ts:136-143`                                                                                                         |
| B-002 | `npm/pnpm audit` dev ağacında zafiyet var                             | `next-pwa` salt build-zamanı aracı, prod bundle'a girmiyor; gerçek çözüm (`@ducanh2912/next-pwa`/Turbopack) **zaten "Ertelenenler" listesinde**            | `apps/web/package.json:61` (`devDependencies`); `pnpm-lock.yaml:213-218`; PROGRESS.md:358-363                                                                                                                               |
| B-010 | Plan tablolarında denetim izi yok                                     | **ADR-0014'ün açıkça yazılı kabul edilen bedeli**, üstelik ADR'de bir "gözden geçirme koşulu" da tanımlı (beslenmeye onay akışı gelirse)                   | `docs/adr/0014-...md:69-73` ("kabul edilen bedeller") ve `:81-86` (gözden geçirme koşulu)                                                                                                                                   |
| B-015 | `::-webkit-scrollbar-thumb` ham `#3f3f46`                             | Arşivde "bilinçli olarak token sisteminin dışında" diye kayıtlı; token'a çekmek açık temada scrollbar'ı istenmeyen biçimde belirginleştirirdi              | `apps/web/src/app/globals.css:17-19`; `archive/progress-faz-1.6-gorsel-kimlik.md:124-125,176`                                                                                                                               |
| B-017 | Ratchet emoji sayacı tam ayrıştırıcı değil                            | **ADR-0018'in açıkça kabul ettiği** yanlış-pozitif riski; script kendi yorumunda itiraf ediyor. Emoji tavanı zaten 0'da kilitli — pratik etki ~sıfır       | `scripts/identity-ratchet.mjs:185-195` (kendi dokümantasyonu), `:94-106` (tavan 0)                                                                                                                                          |
| B-020 | `pg_default_acl`'deki `supabase_admin` kaydı değiştirilemiyor         | **Platform sınırı** (`must be member of role supabase_admin`), kod hatası değil; migration bunu "KAPATILAMAYAN BOŞLUK" olarak kabul edip izliyor           | `supabase/migrations/20260817180200_sequence_grants.sql:91-98`; izleyici `supabase/tests/rls.test.sql:3591-3603`                                                                                                            |
| B-021 | RLS senaryo 83 `exercises` id'lerinde 1 boşluk bırakıyor              | `nextval()` **işlemsel değildir** — Postgres semantiği; test dosyası bunu "YAN ETKİ (bilinçli) … Zararsızdır" diye belgeliyor                              | `supabase/tests/rls.test.sql:3541-3549`                                                                                                                                                                                     |
| B-027 | `video_url` hiçbir yerde doldurulmuyor                                | Okuma/embed yolu hazır ve testli, yazma yolu yok — bu bir **ertelenmiş özellik**, borç değil. Öneri: "Ertelenenler" kuyruğuna taşı (aşağıdaki not)         | Kolon `20260817110000_workout_plan_tables.sql:93`; embed `GymMode.tsx:74-80`; `usePlans.ts` yazma yolunda yok                                                                                                               |
| B-029 | Koçun ara plan düzenlemeleri arşivlenmiyor                            | Migration'da **gerekçeli "KARAR"** olarak yazılı: taslak/yayın ayrımı; copy-on-write'ın bilinçli bedeli                                                    | `supabase/migrations/20260817210000_workout_plan_versioning.sql:44-68`, `:325`                                                                                                                                              |
| B-035 | Supabase CLI global PATH'te yok                                       | CLI **bilinçli olarak workspace-yerel** tutuluyor; doğru çağrı `npx`/`pnpm exec` ve bu üç ayrı yerde belgelenmiş. Bu bir ortam notu, borç değil            | `scripts/backup-hosted.mjs:183-187` (B-035'i adıyla çözüyor); `docs/ops/hosted-backup.md:24-41`                                                                                                                             |
| B-039 | `clean-e2e-data.mjs` mutasyona uğramış seed durumlarını geri sarmıyor | Script'in içinde **iki maddelik gerekçe** yazılı: geri sarmak seed'in beklenen durumunu koda gömer ve gerçek bir denetim izini yok ederdi                  | `scripts/clean-e2e-data.mjs:313-326`                                                                                                                                                                                        |
| B-041 | Lint uyarı tabanı `no-img-element` sınıfı                             | `next/image` harici/dinamik URL'lerde (Supabase imzalı adresler, `ui-avatars.com`) **bilerek tercih edilmedi**; sayı turdan tura değişir, sıfır hedefi yok | PROGRESS.md:122-128; kaynakta 16 `<img` kullanımı, lint tabanı **17 (c7b, PROGRESS.md:266)**                                                                                                                                |
| B-044 | `style-src 'unsafe-inline'` kalıcı boşluk                             | **ADR-0022 Karar 4**: nonce `style-src-attr`'a uygulanmaz; kaldırılırsa `recharts` grafikleri ve 18 `style={{}}` kırılır. ADR bunu "kalıcı boşluk" diyor   | `apps/web/src/lib/security/csp.ts:71-74,101`; `docs/adr/0022-...md:174-175`                                                                                                                                                 |
| B-058 | Koç-danışan atama tablosu yok, çok-koçlu izolasyon eksik              | **ADR-0007** (tek koçlu model) `profiles.coach_id`'yi ve çok-koç RLS katmanını **açıkça reddetti**; bu, o kararın doğrudan sonucudur                       | `docs/adr/0007-tek-kocluk-model.md` (Karar + "Geri dönüşü pahalı" bedeli); `supabase/migrations`'ta atama tablosu 0 eşleşme; yükseltme yolu bilinçli karar olarak kayıtlı: `20260817160100_signup_role_hardening.sql:41-44` |

> **B-027 için ayrık öneri.** Diğer 13 madde belgelenmiş bir karara dayanıyor; B-027'nin
> yazılı bir kabul gerekçesi **yok** — yalnızca kullanılmayan bir yetenek. Bu yüzden
> "bilinçli takaslar" yerine mevcut **"Ertelenenler (bilinçli v2 kuyruğu)"** paragrafına
> taşınması ve orada bir cümleyle gerekçelendirilmesi önerilir. Şüphe varsa D'de bırakılabilir
> (risk: kozmetik, maliyet S) — ama borç olarak tutulacaksa yazma yolunun kim tarafından
> yazılacağı belirtilmelidir.

### C — BİRLEŞTİRİLEBİLİR (4 madde → 1 satır + 1 ekleme)

**Birleşme 1: B-011 + B-012 + B-016 → tek satır.**
Kök neden üçünde de aynı: **Katman B ekran restilizasyonu tamamlanmadı**. Üçü ayrı satır
olarak durduğu için tablo aynı işi üç kez sayıyor.

| ID    | Tek cümle                                         | Ölçüm (2026-08-19)                                                                                                                               |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-011 | `text-gray-400/500` → semantik token'a çevrilmedi | **39 kullanım / 14 dosya**. Not: PROGRESS.md'deki `text-secondary` adı **yanlış** — kodda karşılığı `text-fg-muted` (`tailwind.config.ts:31,63`) |
| B-012 | Katman B restilizasyonu tamamlanmadı              | `font-black` **25**, `rounded-3xl` **15**, `bg-gradient-to-` **12** — PROGRESS.md'deki 25/15/12 ile **birebir**; ratchet tavanları da bu değerde |
| B-016 | Revize `warning` token'ı ekranlara akmıyor        | **Metin artık yanlış:** `text-warning` 6 kullanım/4 dosya; ham `orange-`/`amber-` yalnızca `DashboardTabs.tsx`'te 4 kullanım kaldı               |

> **Önerilen tek satır:** `B-011` ID'si korunur (en eski), metin: _"Katman B ekran
> restilizasyonu tamamlanmadı: `text-gray-*` 39, `font-black` 25, `rounded-3xl` 15,
> gradyan 12, ham `orange/amber` 4 kullanım — ratchet yalnızca kötüleşmeyi engelliyor."_
> B-012/B-016 arşive kapanış notuyla taşınır (§4).

**Birleşme 2: B-038 → B-005'e eklenir.**
İkisi de aynı kök nedene sahip: **storage yetim nesne hijyeni**. B-038'in arşiv metni zaten
"`useFormChecks.uploadPose`'daki mevcut takasın aynısı, yeni değil" diyor.

| ID    | Tek cümle                                                        | Kanıt                                                                                                                             |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| B-038 | `progress_photos` insert'i düşerse storage nesnesi yetim kalıyor | `packages/api-client/src/hooks/useFormChecks.ts:127-128` (önce upload) → `:145` (insert `throw`) arasında hiçbir telafi silme yok |

> **Öneri:** B-005'in metnine _"…ve yükleme sonrası insert düşerse üretilen yeni yetimler
> (`useFormChecks.ts:127-145`)"_ eklenir; B-038 satırı silinir.

### D — GERÇEK VE AÇIK (24 madde)

**Risk ölçeği:** `kullanıcı verisi/güvenlik` > `işlevsellik` > `geliştirici konforu` >
`kozmetik`. **Maliyet:** S / M / L.

| ID        | Tek cümle                                                            | Risk                       | Maliyet | Doğal fazı                                | Kanıt / not                                                                                                                                                        |
| --------- | -------------------------------------------------------------------- | -------------------------- | ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B-042** | Hesap silme akışı yok (KVKK/GDPR unutulma hakkı)                     | **kullanıcı verisi/hukuk** | L       | **Faz 4.6 — ÜZERİNDE ÇALIŞILIYOR**        | Repoda `delete-account`/`deleteAccount` için **0 eşleşme**; kapsam `active_planprogram.md:1088-1092`, AC-4.6.1/2                                                   |
| **B-033** | `.env.hosted.local` düz metin `service_role` taşıyor                 | **güvenlik**               | M       | Faz 4.6 sınıfı (gerçek veri öncesi)       | Dosya `apps/web/.env.hosted.local`'da (**yol PROGRESS.md'de eski**); `.gitignore:44` kapsıyor; **repo OneDrive altında**                                           |
| **B-030** | Hosted yedeğin gerçek koşusu ve restore kanıtı yok                   | **kullanıcı verisi**       | S       | **Faz 4.6 ön koşulu**                     | `scripts/backup-hosted.mjs` (varsayılan dry-run, `:115-118`), `docs/ops/hosted-backup.md` var; koşu yok — kullanıcıda                                              |
| **B-043** | AI uçlarında kullanıcı başına günlük kota yok                        | **güvenlik/maliyet**       | M       | **Faz 4.6 — ÜZERİNDE ÇALIŞILIYOR**        | `apps/web/src/lib/api/ai-quota.ts` commit edilmemiş hâlde mevcut; AC-4.6.3                                                                                         |
| **B-028** | `message-attachments` sunucu tarafı magic-byte doğrulaması yok       | **güvenlik**               | M       | **Faz 4.6 (AC-4.6.4)**                    | Bucket yalnızca MIME allowlist: `20260817190200_message_attachments.sql:172-184`; byte kontrolü istemcide: `useMessages.ts:259-267`                                |
| **B-008** | Yüklenen dosya inline servis ediliyor (`Content-Disposition` yok)    | **güvenlik**               | S       | **Faz 4.6 (AC-4.6.4)**                    | `packages/api-client/src/storage.ts:69-81` — `createSignedUrl(path, TTL)`, üçüncü `{ download }` parametresi yok                                                   |
| **B-009** | RLS reddi (`42501`) yalnızca kullanıcının kendi konsoluna yazılıyor  | **güvenlik**               | M       | Faz 4.6 / güvenlik turu                   | Merkezî yakalama var (`queryClient.ts:26-38`) ama `security-event.ts:11-19` kendi yorumunda "SUNUCUYA ULAŞAN kayıt DEĞİLDİR" diyor                                 |
| **B-031** | Tarayıcıdan hosted'a doğrudan yazma yolunu sunucu guard'ı kesemiyor  | **kullanıcı verisi**       | L       | Ayrı mimari faz (API route'a alma)        | `apps/web/src/env.server.ts:73-77` (guard'ın kendi "NEYİ KAPATMAZ" notu); `supabase/client.ts:22,50`                                                               |
| **B-032** | Guard regex'i custom domain'li hosted projeyi yakalamıyor            | **güvenlik**               | S       | Custom domain gündeme gelirse             | Aynı sınırlı regex **iki katmanda**: `env.server.ts:91` ve `playwright.config.ts:31`                                                                               |
| **B-005** | Birikmiş yetim storage dosyaları için toplu temizlik yok             | kullanıcı verisi (düşük)   | S/M     | Bağımsız ops dilimi                       | Sıra-garantili silme var (`useProfile.ts:110-142`); toplu temizlik script'i **yok** (`scripts/` taraması). Bucket private → sızıntı yok. **B-038 buraya birleşir** |
| **B-052** | AC-4.5.6 kapanamıyor: mobilde gerçek ekran/auth/veri katmanı yok     | işlevsellik                | L       | Mobil veri katmanı turu                   | `apps/mobile/app` **toplam 152 satır**, 8 dosya; `supabase`/`@repo/api-client` tüketimi 0 (yalnızca `sign-in.tsx:5`'te "bilerek yok" notu)                         |
| **B-018** | Katalog (1328+591) mount anında tümüyle istemciye çekiliyor          | işlevsellik (performans)   | M       | Katalog turu (PROGRESS.md §5'te kayıtlı)  | `packages/api-client/src/hooks/useCatalog.ts:6-18` (dosyanın kendi "BU KALICI ÇÖZÜM DEĞİL" notu), `:86-116`                                                        |
| **B-026** | Arşiv plan versiyonları için GC yok; versiyon gezgini UI'ı yok       | işlevsellik                | M       | Faz 5 / backlog                           | Arşiv satırları "SİLİNMEZ": `20260817210000_workout_plan_versioning.sql:340-341`; UI için grep 0 sonuç                                                             |
| **B-056** | AI antrenman üretimi sabit yaş/hedef/kilo gönderiyor                 | işlevsellik                | S/M     | **ÜZERİNDE ÇALIŞILIYOR (Faz 4.6 turu)**   | `WorkoutTab.tsx:197-223`'te düzeltme **başlamış ama commit edilmemiş** (`useForm`+`aiWorkoutSchema`, kilo `progress_entries`'ten)                                  |
| **B-013** | `html2canvas` dışa aktarımı ve grafik renkleri kimlik dışı           | kozmetik/işlevsellik       | S→M     | Katman B veya bağımsız dilim              | Chart.js **gitti**, eksen token'a bağlandı (`StatsTab.tsx:297,304`); `html2canvas` duruyor (`DashboardTabs.tsx:92-96`)                                             |
| **B-014** | `border` token'ı WCAG 1.4.11'i (3:1) geçmiyor, `border-strong` yok   | kozmetik/erişilebilirlik   | S       | İhtiyaç Katman B'de doğduğunda            | `apps/web/src/design/tokens.ts:32,63` değerleri Faz 1.6'dan beri aynı; `border-strong` için repo genelinde 0 eşleşme                                               |
| **B-004** | Türkçe arayüz metinlerinin ürün diliyle hizası doğrulanmadı          | kozmetik                   | M       | İçerik denetimi dilimi (Katman B komşusu) | Eski dil temiz ("Öğrenci"/"Yönetici Paneli" → 0 eşleşme, `page.tsx:194` güncel), ama **ölçülebilir bir denetim yok**                                               |
| **B-023** | Yerel E2E veritabanı birikiyor, otomatik temizlenmiyor               | geliştirici konforu        | S       | E2E hijyen turu (**kullanıcı onayı**)     | `scripts/clean-e2e-data.mjs:493-519,863-871` — varsayılan dry-run, gerçek silme elle `--yes` ister                                                                 |
| **B-040** | `seed.sql`'in tek `pending` satırı hem demo hem fikstür              | geliştirici konforu        | S       | **ÜZERİNDE ÇALIŞILIYOR (paralel ajan)**   | `supabase/seed.sql:550-584` (danışan başına 1 `pending`); E2E'de 3 spec tüketiyor                                                                                  |
| **B-024** | E2E kilit ilanı (`resource(...)`) zorunlu değil                      | geliştirici konforu        | S       | Yeni E2E spec turu / Faz 10               | `apps/web/tests/e2e/resource-lock.ts:145-193` — fixture yalnızca **ilan edilmiş** anahtarı kilitliyor; lint kuralı yok                                             |
| **B-037** | `plans.spec.ts:292`/`progress.spec.ts:66` yerel paralellikte düşüyor | geliştirici konforu        | M       | Faz 10 (kalite altyapısı)                 | `apps/web/playwright.config.ts:141-144` + `:48-75` tam teşhis geçmişi; CI (`workers:1`) etkilenmiyor                                                               |
| **B-025** | AC-2.2 payı ~2x ve yük duyarlı                                       | geliştirici konforu        | S/M     | B-023 ile birlikte                        | `apps/web/tests/e2e/messaging.spec.ts:128` — sınır hâlâ `2000`; B-023 büyürse ilk burası sıkışır                                                                   |
| **B-057** | `expo start` `apps/mobile/tsconfig.json`'ı sessizce yeniden yazıyor  | geliştirici konforu        | S       | Mobil veri katmanı turu                   | Dosya **şu an doğru hâlde** (yorumlar + `.expo/types` include duruyor); koruyucu mekanizma **yok** (`.husky` yok, git hook yok)                                    |
| **B-022** | `exercises.csv` (8.7 MB ham) hâlâ repoda                             | geliştirici konforu        | S       | Herhangi bir temizlik dilimi              | `data/exercises.csv` **8.693.873 bayt**; kanonik kaynak `clean_exercises_v2.csv` (150 KB); LFS önerisi `data/README.md:12,128-137` uygulanmadı                     |

### E — İZLEME MADDESİ, BORÇ DEĞİL (2 madde)

Bunlar **süreli istisnalar / gözden geçirme tarihi olan** kalemlerdir; kapatılacak bir iş
yok, yalnızca zamanı gelince bakılması gerekiyor. Öneri: §3'ün altına küçük bir
**"İzleme (gözden geçirme tarihli)"** bölümü.

| ID    | Tek cümle                                                         | Gözden geçirme tetiği                                            | Kanıt                                                                                   |
| ----- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| B-053 | `image-size` için `pnpm.auditConfig.ignoreGhsas` süreli istisnası | **2026-11-19** — o tarihte yama çıkmışsa istisna kaldırılır      | `package.json:54-59` (iki GHSA: `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`)           |
| B-034 | PostgREST v14.5 eşleşmesi `.temp` manifestine bağlı               | Hosted bir gün yükseltilirse — `supabase link` yeniden koşulmalı | `supabase/.temp/rest-version` = `v14.5`, `postgres-version` = `17.6.1.141` (bugün eşit) |

---

## 3. Önerilen yeni §3 tablosu (25 satır)

Triyaj uygulanırsa borç tablosu şu satırlardan oluşur — **risk sırasına göre**, ID'ler
korunarak:

| #   | ID      | Tek cümle                                                             |
| --- | ------- | --------------------------------------------------------------------- |
| 1   | B-042   | Hesap silme akışı yok (KVKK/GDPR unutulma hakkı)                      |
| 2   | B-033   | `.env.hosted.local` diskte düz metin `service_role` taşıyor           |
| 3   | B-030   | Hosted yedeğin gerçek koşusu ve restore kanıtı yok                    |
| 4   | B-043   | AI uçlarında kullanıcı başına günlük kota yok                         |
| 5   | B-028   | `message-attachments` sunucu tarafı magic-byte doğrulaması yok        |
| 6   | B-008   | İmzalı adres `Content-Disposition: attachment` üretmiyor              |
| 7   | B-009   | RLS reddi (`42501`) sunucu tarafına hiç ulaşmıyor                     |
| 8   | B-031   | Tarayıcıdan hosted'a yazma yolunu sunucu guard'ı kesemiyor            |
| 9   | B-032   | Guard regex'i custom domain'li hosted projeyi yakalamıyor             |
| 10  | B-005   | Yetim storage dosyaları için toplu temizlik yok (**B-038 dahil**)     |
| 11  | B-052   | Mobilde gerçek ekran/auth/veri katmanı yok (AC-4.5.6)                 |
| 12  | B-018   | Katalog mount anında tümüyle istemciye çekiliyor                      |
| 13  | B-026   | Arşiv plan versiyonları için GC ve versiyon gezgini UI'ı yok          |
| 14  | B-056   | AI antrenman üretimi sabit yaş/hedef/kilo gönderiyor                  |
| 15  | B-013   | `html2canvas` dışa aktarımı ve grafik renkleri kimlik sistemi dışında |
| 16  | B-014   | `border` token'ı WCAG 1.4.11'i geçmiyor, `border-strong` yok          |
| 17  | B-011\* | **Katman B ekran restilizasyonu tamamlanmadı** (B-012+B-016 birleşti) |
| 18  | B-004   | Türkçe arayüz metinlerinin ürün diliyle hizası ölçülmedi              |
| 19  | B-023   | Yerel E2E veritabanı birikiyor, otomatik temizlenmiyor                |
| 20  | B-040   | `seed.sql`'in tek `pending` satırı hem demo hem fikstür               |
| 21  | B-024   | E2E kilit ilanı (`resource(...)`) zorunlu değil                       |
| 22  | B-037   | İki E2E spec'i yerel paralellikte sistematik düşüyor                  |
| 23  | B-025   | AC-2.2 payı ~2x ve yük duyarlı                                        |
| 24  | B-057   | `expo start` `apps/mobile/tsconfig.json`'ı sessizce yeniden yazıyor   |
| 25  | B-022   | `exercises.csv` (8.7 MB ham) hâlâ repoda                              |

\* B-011 ID'si korunur (en eski), metni birleştirilmiş hâle güncellenir.

**Ayrıca tabloya eklenmesi önerilen iki işaret sütunu değeri:** B-040, B-042, B-043, B-056
için `Durum` alanına **"ÜZERİNDE ÇALIŞILIYOR (Faz 4.6 turu, 2026-08-19)"** yazılmalı ki
paralel turlar aynı borcu ikinci kez açmasın.

---

## 4. Kapanış notu taslakları

A sınıfı boş olduğu için yalnızca **B** (14 madde) ve C'de başka bir satıra birleşen üç
madde (B-012, B-016, B-038) için taslak var.
Biçim `docs/archive/progress-borc-turu-2026-08-19.md`'nin "Kapanan borçlar" bölümüyle aynı
(`### B-0XX — <başlık>` + 1-2 cümle). Öneri: hepsi tek bir yeni arşiv dosyasına
(`docs/archive/progress-borc-triyaji-2026-08-19.md`) yazılsın, orijinal kaynak arşivlere
dokunulmasın — çapraz referans bu triyaj dosyasına verilir.

### B-001 — PWA `workout_logs` cache'i bilinçli takas olarak kapatıldı

Borcun istediği iki düzeltme uygulanmış durumda: `profiles` yanıtları `runtimeCaching`'ten
çıkarıldı (`apps/web/next.config.mjs:129-132`) ve logout'ta `offline-`/`workbox-` önekli tüm
cache'ler siliniyor (`packages/api-client/src/hooks/useSession.ts:21-31,136-143`). Kalan
7 günlük `workout_logs` tutması, salonda çevrimdışı antrenman kaydı yeteneği için bilinçli
kabul edilen bir mahremiyet takasıdır; borç olarak izlenmesine gerek yoktur.

### B-002 — dev ağacı audit bulgusu takas olarak kabul edildi

`next-pwa` yalnızca build-zamanı aracıdır ve `apps/web/package.json:61`'de
`devDependencies` altındadır; `pnpm audit --prod` exit 0 verir. `npm audit fix --force`
Next 16'yı düşüreceği için bilinçli olarak koşulmaz. Gerçek çözüm (`@ducanh2912/next-pwa`
veya Turbopack geçişi) zaten §3'ün "Ertelenenler" kuyruğunda ayrı bir kalem olarak duruyor.

### B-010 — plan denetim izi eksikliği ADR-0014'ün yazılı bedelidir

`docs/adr/0014-danisanin-kendi-beslenme-planini-kaydedebilmesi.md:69-73` bu eksikliği
"kabul edilen bedel" olarak açıkça kaydediyor ve `:81-86`'da gözden geçirme koşulunu da
tanımlıyor: beslenmeye `program_approvals` benzeri bir onay akışı gelirse ADR yeniden
değerlendirilecek. Borç tablosunda ayrıca izlenmesi çift kayıttır.

### B-012 — Katman B sayaçları B-011'de birleştirildi

Ölçüm 2026-08-19'da tekrarlandı: `font-black` 25, `rounded-3xl` 15, `bg-gradient-to-` 12 —
`scripts/identity-ratchet.mjs:42-67`'deki tavanlarla birebir aynı. Kök neden B-011 ve
B-016 ile aynı olduğundan (Katman B ekran restilizasyonu tamamlanmadı) üç satır tek satırda
(B-011) toplandı; ratchet tavanları bu maddenin fiili ölçüm mekanizması olarak kalıyor.

### B-016 — `warning` token'ı ekranlara akmaya başladı, kalanı B-011'de izleniyor

Borcun metni artık yanlıştır: `text-warning` bugün 6 yerde/4 dosyada kullanılıyor
(`WorkoutTab.tsx`, `NutritionTab.tsx`, `FormCheckTab.tsx`, `CoachUserManagement.tsx`); ham
`orange-`/`amber-` yalnızca `DashboardTabs.tsx:152,154,162,303`'te 4 kullanıma düşmüş.
Kalan iş Katman B'nin genel restilizasyonundan ayrı değildir, bu yüzden B-011'e birleştirildi.

### B-015 — scrollbar rengi bilinçli olarak token sistemi dışında

`apps/web/src/app/globals.css:17-19`'daki `#3f3f46` değeri Faz 1.6'da bilinçli olarak ham
bırakıldı (`archive/progress-faz-1.6-gorsel-kimlik.md:124-125,176`); token'a çekmek açık
temada scrollbar'ı istenmeyen biçimde belirginleştirirdi. Değişmedi ve değişmesi planlanmıyor.

### B-017 — ratchet lexer'ının sınırı ADR-0018'in kabul ettiği takastır

`scripts/identity-ratchet.mjs:185-195` fonksiyonun kendi dokümantasyonunda "Tam bir parser
DEĞİLDİR … ADR-0018 bu tür yanlış pozitif riskini zaten kabul ediyor" yazıyor. Emoji tavanı
Faz 2a Lucide dönüşümünden beri 0'da kilitli (`:94-106`), yani yanlış pozitifin pratik
etkisi de yok.

### B-020 — `pg_default_acl` kaydı platform sınırıdır, kapatılamaz

`supabase/migrations/20260817180200_sequence_grants.sql:91-98` bunu "KALAN (KAPATILAMAYAN)
BOŞLUK" olarak zaten kabul ediyor; `supabase_admin` rolüne üye olunmadan değiştirilemez.
İzleme mekanizması RLS senaryo 84'tür (`supabase/tests/rls.test.sql:3591-3603`) — PROGRESS.md'nin
"senaryo 73/84" ifadesindeki 73 yanlış çapraz referanstır, doğrusu 84'tür (yan etkisi 83).

### B-021 — sequence boşluğu Postgres semantiğinin sonucudur

`nextval()` işlemsel değildir; testin `ROLLBACK`'i INSERT'i geri alır ama sayacı geri
sarmaz. `supabase/tests/rls.test.sql:3541-3549` bunu "YAN ETKİ (bilinçli) … Zararsızdır"
diye belgeliyor. Düzeltilebilir bir kod hatası değildir.

### B-027 — `video_url` yazma yolu ertelenmiş özellik olarak kuyruğa alındı

Kolon (`20260817110000_workout_plan_tables.sql:93`) ve allowlist'li embed yolu
(`GymMode.tsx:74-80`, testli) hazır; hiçbir yazma yolu (`usePlans.ts`, `explode_plan_day`)
alanı doldurmuyor. Bu, zararsız ölü kod ve bitmemiş bir özelliktir — borç tablosundan
"Ertelenenler (bilinçli v2 kuyruğu)" listesine taşınır; video embed ürün önceliği olduğunda
yeniden açılır.

### B-029 — ara düzenlemelerin arşivlenmemesi gerekçeli bir KARAR'dır

`supabase/migrations/20260817210000_workout_plan_versioning.sql:44-68` taslak/yayın ayrımını
ayrıntılı gerekçesiyle anlatıyor: yalnızca en az bir `workout_logs` satırına bağlanmış planlar
"yayın" sayılıp donduruluyor, loglanmamış taslaklar yerinde üzerine yazılıyor. Copy-on-write'ın
bilinçli bedelidir.

### B-035 — Supabase CLI'ın workspace-yerel kalması bilinçli bir karardır

CLI kökün `devDependency`'sidir; doğru çağrı `npx supabase` / `pnpm exec supabase` /
doğrudan `node_modules/.bin` yoludur ve bu üç yol `docs/ops/hosted-backup.md:24-41`'de
belgelidir. `scripts/backup-hosted.mjs:183-187` borcu adıyla anıp ikiliyi kendisi çözüyor.
Bu bir ortam notudur; borç tablosu yerine §4 "tuzaklar" listesinde tek satır olarak durmalıdır.

### B-038 — `progress_photos` yetim nesnesi B-005'e birleştirildi

`packages/api-client/src/hooks/useFormChecks.ts:127-128`'de pozlar yükleniyor, `:145`'te
insert hata fırlatıyor ve arada telafi eden bir silme yok — yani üretilen yetim, B-005'in
tarif ettiği yetim sınıfının aynısıdır. İki ayrı satır aynı işi (storage hijyeni) iki kez
sayıyordu; B-005'in metnine eklendi.

### B-039 — seed durumlarının geri sarılmaması script'te gerekçeli karardır

`scripts/clean-e2e-data.mjs:313-326` iki gerekçe veriyor: (1) geri sarmak `seed.sql`'in
beklenen durumunu koda gömer ve seed değişince sessizce bayatlar, (2) "E2E tüketti" ile
"koç gerçekten onayladı" ayırt edilemez — `approved` bir satırı `pending`'e çekmek gerçek bir
denetim izini yok ederdi. Gerçek taban çizgisi gerektiğinde doğru araç `npx supabase db reset`'tir.

### B-041 — `no-img-element` uyarıları bilinçli tercihtir

`next/image` harici ve dinamik URL'lerde (Supabase imzalı adresler, `ui-avatars.com`)
bilerek kullanılmıyor; uyarı sayısı turdan tura kapsamla değişiyor (13 ↔ 17) ve sıfırlanması
hedeflenmiyor. Bu, PROGRESS.md §1'de zaten "lint uyarıları bilinçlidir" başlığıyla anlatılan
davranışın borç tablosundaki gereksiz ikizidir.

### B-044 — `style-src 'unsafe-inline'` ADR-0022 Karar 4'ün kalıcı boşluğudur

`apps/web/src/lib/security/csp.ts:71-74` nedeni kaynakta anlatıyor: nonce'lar inline `style`
**niteliklerine** uygulanmaz (ayrı direktif `style-src-attr`) ve Next'in nonce mekanizması
onu kapsamaz; kaldırılırsa `recharts` çalışma anı stilleri ve 18 `style={{}}` kullanımı
kırılır. ADR-0022 bunu "kalıcı bir boşluk" olarak ilan etmiştir. Not: ADR "ayrı bir borç
olarak izlenmesi gerekiyor" da diyor — bu yüzden tablodan çıkarmak yerine **izleme**
bölümüne alınması da savunulabilir; karar kullanıcıya bırakılıyor.

### B-058 — çok-koç izolasyonu ADR-0007 ile reddedilmiş bir kapsamdır

`docs/adr/0007-tek-kocluk-model.md` `profiles.coach_id` kolonunu ve çok-koç RLS katmanını
kullanıcı kararıyla açıkça reddetti; "geri dönüşü pahalı" bedeli aynı ADR'de yazılı.
Bugünkü tek-koç ürün varsayımı geçerli olduğu sürece bu bir borç değil, kabul edilmiş bir
kapsam kararıdır. Ürün bir koçluk ajansı modeline geçerse ADR-0007 gözden geçirilir ve borç
o zaman yeniden açılır. **Koşul notu:** ikinci bir koçun doğduğu yol da bilinçli karardır —
`supabase/migrations/20260817160100_signup_role_hardening.sql:41-44` `profiles_update_coach`
politikasının bir koça herhangi bir danışanı `coach` yapma izni verdiğini, koçun "zaten tüm
veriye erişen güvenilir rol" sayıldığını kaydediyor. Ancak ikinci koçun doğmasını teknik
olarak engelleyen bir bariyer yoktur ve doğduğu an izolasyon sıfırdır; bu yüzden B
sınıflandırması "tek koç" varsayımının geçerliliğine **koşulludur** — varsayım değişirse
madde doğrudan D'ye döner.

---

## 5. Ölçtüğüm ama borç tablosunda OLMAYAN sorunlar

Aşağıdakiler triyaj sırasında kodda/dokümanda **gerçekten karşılaşılan**, kayıtlı olmayan
kalemlerdir. Hiçbiri uydurulmadı; her birinin dosya:satır kanıtı var. Hiçbiri kritik değil.

1. **Grafik renkleri tema duyarlı değil — kaynakta itiraf edilmiş, hiçbir yerde kayıtlı değil.**
   `apps/web/src/components/tabs/StatsTab.tsx:294-296` yorumu birebir şöyle diyor: _"tema
   duyarlı grafik renkleri ayrı bir iştir"_. Sonuç: eksenler her iki temada da
   `tokens.light.textSecondary` (`:297,304`), tooltip ise her iki temada `tokens.dark.*`
   (`:312-315`); `CoachUserManagement.tsx:562-566,627` aynı deseni tekrarlıyor. Karanlık
   temada eksen etiketleri, aydınlık temada tooltip kontrastı zayıflar. B-013'ün komşusu ama
   B-013 `html2canvas`'ı anlatıyor, bunu değil. **Öneri:** B-013'ün metnine eklenmeli.

2. **PROGRESS.md §3'te B-011'in token adı yanlış.** Satır 320 `text-secondary`'ye çevirmekten
   söz ediyor; kod tabanında böyle bir Tailwind sınıfı **yok** — karşılığı `text-fg-muted`
   (`apps/web/tailwind.config.ts:31,63`, token `src/design/tokens.ts:36`). Borcu kapatmaya
   çalışan bir ajan var olmayan bir sınıfı arayacak.

3. **B-033'ün dosya yolu bayat.** Tablo `.env.hosted.local` diyor; dosya monorepo taşımasından
   sonra **`apps/web/.env.hosted.local`** konumunda (`find . -name ".env*"` ile ölçüldü).
   `.gitignore:44`'teki `.env*` deseni yeni yolu da kapsıyor — güvenlik açığı yok, yalnızca
   referans hatası.

4. **PROGRESS.md §3'te B-020'nin çapraz referansı yanlış.** "RLS senaryo 73/84 izliyor"
   deniyor; `supabase_admin` `pg_default_acl` kaydını izleyen senaryo **84**
   (`supabase/tests/rls.test.sql:3591-3603`), yan etkisini ölçen **83**. Senaryo 73 REFERENCES
   yetkisiyle ilgilidir, bu borçla ilgisi yok.

5. **`docs/ops/hosted-backup.md` kendi `.gitignore` durumunu yanlış anlatıyor.** Doküman
   satır 199-200 `backups/`'ın "bu turda eklenmedi" diyor, ama `.gitignore:86-87`'de B-030
   yorumuyla birlikte **eklenmiş** durumda. Zararsız ama doküman geride kalmış.

6. **B-044'ün sayımı 17 → 18'e çıkmış.** `csp.ts:73` ve PROGRESS.md:351 "17 `style={{}}`"
   diyor; bugünkü ölçüm `apps/web/src` altında **18**. Sayı zaten yaklaşık bir gösterge, ama
   sabit sayı yazmak turdan tura bayatlıyor — sayı yerine "ölçüm komutu" yazmak daha dayanıklı.

7. **`apps/mobile` için hiçbir tsconfig koruması yok (B-057'nin bilinen sonucu).** `.husky`
   dizini ve özel git hook'u yok; tek koruma `git status` disiplini. Kayıtlı olan borç
   olgunun kendisi, koruma mekanizmasının yokluğu değil — B-057'nin metnine "commit öncesi
   otomatik kontrol yok" cümlesi eklenmeli.

8. **§3'ün "Ertelenenler" paragrafı bayat.** Paragraf hâlâ **Turborepo** ve **Expo mobil**'i
   "bilinçli v2 kuyruğu" olarak listeliyor, oysa ikisi de Faz 4.5'te teslim edildi: kökte
   `turbo.json` var ve `package.json:16-27` tüm kapı komutlarını `turbo run` üzerinden
   çalıştırıyor (`package.json:67` `turbo ^2.10.11`); `apps/mobile/` diskte mevcut.
   Paragrafın içindeki "(pnpm'e geçiş Faz 4.5 commit 1'de tamamlandı)" parantezi yalnızca
   pnpm'i düzeltmiş, Turborepo satırını düzeltmemiş. **Öneri:** iki kalem paragraftan
   çıkarılmalı.

**Olumlu bulgu:** `apps/web/src`, `packages/*/src` ve `apps/mobile/app` altında **hiç**
`TODO`/`FIXME`/`HACK`/`XXX:` işareti yok. Borç kaydı gerçekten `docs/PROGRESS.md` §3'te
merkezî tutuluyor; kodda gizli, izlenmeyen bir borç birikimi bulunamadı.
