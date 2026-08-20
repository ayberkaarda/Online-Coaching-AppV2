# Arşiv — Faz 4.8: Etkinlik Kaydı (2026-08-20)

**Özet.** Koç panelinde danışan aktivitesinin (sekme görüntüleme, günlük giriş, form
check yükleme, mesaj gönderme, AI üretimi, giriş/çıkış) gün hassasiyetinde görünür
olması: iki yeni tablo + tek yazma RPC'si + `aal2` kapısına eklenme (`supabase/
migrations/20260820090000_activity_log.sql`), heartbeat + rıza kapılı uç (`POST /api/
activity`, `POST/DELETE /api/activity/consent`), danışan için tam ayrıntılı kendi görünümü
(`/verilerim`), koç için gün bazlı özet (`CoachUserManagement` içinde), açık rıza arayüzü
(`ActivityConsent.tsx`) ve mahremiyet sınırının istemciden veri katmanına taşınması
(`coach_activity_summary()` RPC'si, `supabase/migrations/20260820140000_
coach_activity_summary.sql`). Dördüncü dilim — B-009'un bu uçla kapatılabilirliği —
değerlendirildi ve **bilinçli olarak kapatılmadı** (gerekçe altta). Bu fazın
`active_planprogram.md`'de tanımlı bir AC tablosu yoktu — Faz 4.7 formatı izlenerek
aşağıda dilim bazlı anlatı ve kanıtlar kullanılıyor.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md) §3/§5.
> Plan kaynağı: `active_planprogram.md` §7c ("Faz 4.8 — Etkinlik Kaydı").

---

## Dilim 1 — Şema

`supabase/migrations/20260820090000_activity_log.sql`:

- `activity_sessions` (`id`, `user_id` → `profiles` `ON DELETE CASCADE`, `started_at`,
  `last_seen_at`, `platform` `CHECK (platform in ('web','mobile'))`,
  `CHECK (last_seen_at >= started_at)`) ve `activity_events` (+ `session_id` →
  `activity_sessions` `ON DELETE CASCADE`, `event` 7'li **kapalı liste** CHECK
  (`tab_view`, `daily_log_submitted`, `form_check_uploaded`, `message_sent`,
  `ai_generated`, `login`, `logout`), `tab` ≤ 40 karakter, `duration_sec ≥ 0`,
  `occurred_at`). `profiles`'a `activity_consent_granted_at`,
  `activity_consent_revoked_at`, `activity_consent_version` eklendi + guard trigger.
  **IP/user-agent/olay içeriği hiç yok** — migration'ın kendi doğrulama bloğu her iki
  tablonun tam kolon listesini string olarak karşılaştırıyor, yani ileride bu alanlardan
  biri sessizce eklenirse migration testinin kendisi kırılır.
- Üç rıza durumu (`undecided` / `granted` / `revoked`) **tek yerde** türetiliyor:
  `activity_consent_state(uuid)` — beraberlik (`granted_at = revoked_at` veya ikisi de
  dolu ama sıralaması belirsiz) fail-closed `revoked`'a düşüyor. `SECURITY INVOKER`
  (koç hepsini, danışan yalnız kendini yoklayabiliyor — RLS'e tabi).
- Yazma yolu tek fonksiyon: `record_activity(p_user_id, p_platform, p_event default
null, p_session_id, p_tab, p_duration_sec, p_occurred_at)` → `jsonb`; `SECURITY
DEFINER`, `EXECUTE` yalnızca `service_role`'e verildi. **Rıza kapısı fonksiyonun
  İÇİNDE, fail-closed** — rıza `granted` değilse `42501` fırlatıyor, böylece "route'ta
  rıza kontrolü unutulursa ne olur" sorusu hiç doğmuyor. İki tabloda da `authenticated`
  için yazma politikası **yok**, `service_role`'ün doğrudan tablo yetkisi de **yok** —
  tek yazma yolu bu fonksiyon.
- **30 dakika bayatlama ve platform değişimi VERİTABANINDA** yeni oturum açıyor —
  istemci "yeni oturum mu" kararını vermiyor, `record_activity` mevcut oturumu
  `last_seen_at`/`platform` kriteriyle değerlendirip gerekirse kendisi yeni satır açıyor.
- `aal2` kapısı (ADR-0026): iki yeni tablo da RESTRICTIVE politikaya girdi, senaryo
  131'in listesi **14 → 16**.
- `delete_account()` manifesti **15 → 17**; fonksiyon gövdesi değişmedi, yalnızca
  manifest listesi iki tabloyla genişledi.
- pg_cron ölçüldü: `shared_preload_libraries`'te ön yüklü, sürüm **1.6.4**.
  `activity_log_purge_daily` job'u `17 3 * * *` kuruldu; migration'ın doğrulama bloğu
  ikinci koşuda job'un çoğalmadığını ve "extension var ama job yok" durumunda
  exception fırlatıldığını kontrol ediyor. Ek güvenlik ağı: `record_activity`
  **oturum açılışlarında** (heartbeat'te değil, yalnızca yeni oturum açıldığında)
  fırsatçı bir purge tetikliyor — pg_cron zamanlayıcısı hiç çalışmasa bile 180 günden
  eski satırlar birikmiyor.
- RLS senaryo sayısı **136 → 143**.

---

## Dilim 2 — Uç + heartbeat

`POST /api/activity` (`apps/web/src/app/api/activity/route.ts`), `POST`/`DELETE
/api/activity/consent` (`apps/web/src/app/api/activity/consent/route.ts`), paylaşılan
mantık `apps/web/src/app/api/activity/shared.ts`.

- **Rıza yokken 204 No Content** — üç gerekçeyle: (1) hata değil, rıza başka bir
  sekmede geri çekilmiş olabilir; (2) "sessiz kabul" (200 + uydurma `session_id`)
  yalan olurdu ve istemci durumunu zehirlerdi; (3) DB'nin üç durumu ayırt eden hata
  metni yalnızca sunucu loguna yazılıyor, istemci ayrımsız tek sinyal alıyor. `42501`'in
  ikinci anlamı (yabancı `session_id`) **kasten** aynı 204'e düşüyor — oturum kimliği
  bir numaralandırma kanalı olarak kapatıldı; istemci `session_id`'yi atıp kendini
  onarıyor (`MAX_SELF_HEAL_ATTEMPTS = 3`).
- Hız sınırı üç kova, anahtar `user.id`: burst 30/60sn (ölçülen meşru tepe ~23/dk),
  sustained 600/60dk, consent 10/60dk (rıza geri çekme tüm satırları sildiği için
  damga/silme döngüsünü keser). `apps/web/src/lib/activity/rate-limit.ts`; env'e
  bağlanmadı — sabit.
- **"Yalnız kendi hesabı" bir `if` değil, yapısal imkânsızlık:** uçlarda hedef
  parametresi hiç yok (ne yolda ne gövdede — şemalar `.strict()`), kimlik tek
  kaynaktan (JWT'den çözülen `user.id`).
- Heartbeat: `<ActivityTracker />` (`apps/web/src/lib/activity/tracker.tsx`)
  `providers.tsx`'te monte ediliyor; karar mantığı React'ten ayrıştırıldı
  (`apps/web/src/lib/activity/controller.ts`, %100 kapsam — saf fonksiyonlar test
  edilebilir). 60 sn'lik tik yalnızca `document.visibilityState === 'visible'`
  iken çalışıyor; `visibilitychange`/`pagehide`'da kapanış sinyali
  `fetch(keepalive: true)` — **`sendBeacon` hiç kullanılmadı**, çünkü `sendBeacon`
  `Authorization` başlığı taşıyamıyor; `activity-heartbeat.test.ts` bu seçimi ayrıca
  iddia ediyor (negatif kontrol: `navigator.sendBeacon` hiç çağrılmıyor). `session_id`
  `sessionStorage`'da tutuluyor; 429 alınırsa `Retry-After` süresi kadar susuluyor.
  **Rıza `granted` değilse tek bir istek bile çıkmıyor**, rıza durumu okunamazsa
  fail-closed davranılıyor (istek atılmıyor).
- Olay yayınlama `apps/web` tarafından, çalışma zamanı bağımlılığı sıfır bir kapıdan
  (`apps/web/src/lib/activity/emit.ts`) yapılıyor — alıcı yokken sessiz no-op, bu
  yüzden mevcut bileşen testleri (`DailyLogTab`, `FormCheckTab`, `MessagesTab`,
  `NutritionTab`, `WorkoutTab`, `CoachUserManagement`, `DashboardTabs`) etkilenmedi;
  bu bileşenler yalnızca `emit()` çağrısı eklemek için değiştirildi.
  `login`/`logout` olayları `onAuthStateChange` üzerinden yayınlanıyor.
- Sözleşme (`.strict()` zod şemaları) `apps/web/src/lib/activity/contract.ts`'te,
  taşıma katmanı `apps/web/src/lib/activity/transport.ts`'te.

---

## Dilim 3b — İki görünüm

Danışan `/verilerim` (`apps/web/src/app/verilerim/page.tsx`,
`apps/web/src/components/activity/ClientActivityLog.tsx`) — tam ayrıntı, saat/dakika
damgası dahil (kendi verisi, KVKK erişim hakkı gereği kısıtlanmıyor). Koç görünümü
`CoachUserManagement` içine gömülü `CoachActivitySummary.tsx` — gün bazlı özet, saat
damgası hiç yok.

Üç rıza durumu (`undecided`/`granted`/`revoked`) üç ayrı metinle gösteriliyor;
**"hiç açmadı" ifadesi hiçbir yerde kullanılmadı** — "aktivite kaydı açık değil" /
"aktivite kaydı kapatıldı" / "aktivite kaydı için karar verilmedi" ayrımı korunuyor.
Koç `aal1`'deyken RLS sessizce 0 satır döndürdüğü için (ADR-0026 kapısı) ayrı bir
"iki adımlı doğrulama gerekli" uyarısı eklendi — bu durum "veri yok" ile
karıştırılmıyor, iki farklı boş-durum metni var.

---

## Dilim 3c — Mahremiyet sınırı veri katmanına taşındı

3b'de toplama istemci tarafındaydı: koçun tarayıcısına ham `activity_events` satırları
zaman damgalarıyla iniyor, "koç saat görmez" kuralı yalnızca arayüzün nezaketiydi —
DevTools'tan ham veri okunabilirdi. Bu dilimde yeni bir Postgres fonksiyonu
(`supabase/migrations/20260820140000_coach_activity_summary.sql`) mahremiyet sınırını
veritabanına taşıdı:

- `coach_activity_summary(p_client_id, p_days default 30)` **`returns table(day date,
total_seconds integer, event_counts jsonb)`** — `returns jsonb` bilerek seçilmedi,
  çünkü üretilen istemci tipi `Json` olurdu ve "ham damga döndürmüyoruz" iddiası
  derleme zamanında görünmez kalırdı; `table(...)` seçimi bu iddiayı tip sisteminde
  görünür kılıyor.
- `day` sütununun tipi **`date`** — `date` saat taşıyamaz; bu bir biçimlendirme kolaylığı
  değil, **tip garantisi** (yuvarlama unutulabilir bir adım olmaktan çıktı).
- **`SECURITY INVOKER`** (`prosecdef = false` sorguyla doğrulandı) — `DEFINER` olsaydı
  `aal1`'deki bir koça RLS'i atlayan bir kapı açılmış olurdu. `service_role`'e
  `EXECUTE` **verilmedi** (açıkça `revoke`) — `INVOKER`'ı RLS'siz bir rolle
  çalıştırmak, kapatılan kapıyı ikinci bir kapıdan yeniden açmak olurdu.
- Gün yuvarlaması `(ts at time zone 'Europe/Istanbul')::date` ile yapılıyor — düz
  `::date` PostgREST oturumunda `TimeZone` UTC olduğu için UTC okur ve TR saatiyle
  00:00–03:00 arası etkinliği **önceki güne** düşürür (repoda daha önce Faz 4'te bir
  kez gerçekten yanmış hata — bkz. `docs/PROGRESS.md` §4 yeni tuzak maddesi).
- Rıza kapalıyken **boş küme dönüyor, hata değil** — react-query tarafında "rıza
  kapalı" durumu ile "okunamadı" hatası arasındaki ayrım korunsun diye.
- Ham satır toplayan eski istemci-taraflı kod (`buildCoachActivityDaySummary`)
  **silindi** — ölü koddu, artık tüm agregasyon RPC'de.
- Mahremiyet regresyon testi iki katmanlı (`apps/web/tests/unit/activity-views.test.tsx`
  içinde): gerçek hook sahte Supabase istemcisiyle sürülüyor; testler (a) tek çağrının
  RPC (`coach_activity_summary`) olduğunu, (b) `.from('activity_events')`'e hiç
  gidilmediğini, (c) ağ cevabında ve hook çıktısında hiçbir saat/dakika izinin
  bulunmadığını doğruluyor — üçüncüsü negatif kontrol içeriyor (bilerek saat içeren
  bir sahte satır enjekte edilip hook'un onu asla üretmediği kanıtlanıyor).
- RLS senaryo sayısı **143 → 144**.

---

## Dilim 3a — Rıza arayüzü

`apps/web/src/components/activity/ActivityConsent.tsx`. Onay kutusu **önceden
işaretsiz** geliyor; onaylanmadan form gönderilemiyor.

**Zorunlu ilk-giriş modalı REDDEDİLDİ.** Gerekçe: zorunlu bir ara ekranın kendisi
hafif bir zorlamadır ve "reddedene her girişte tekrar sorma" ilkesiyle çelişir.
Kontrol, kullanıcının kendi isteğiyle gittiği iki yere kondu: `/profile` ve
`/verilerim`.

Kapatma (rıza geri çekme) akışı **kur-ve-onayla** deseniyle — hesap silmedeki
"yazarak doğrula" deseni (ADR-0025) burada orantısız bulundu, çünkü kaybedilen 180
günlük aktivite kaydıdır, hesap değil, ve rıza istenirse yeniden verilebilir. Onay
bloğunda `role="alert"` ile "verileriniz ANINDA silinir, 180 gün beklemez" uyarısı
gösteriliyor.

Aydınlatma metni altı başlık altında: ne toplanıyor · **ne toplanmıyor** (IP, cihaz/
tarayıcı bilgisi, tıklanan yer, günlük/mesaj içeriği) · kim görüyor (koç gün bazında,
danışan kendisi tam ayrıntı) · saklama süresi (180 gün) · geri çekmenin sonucu ·
**rıza vermezseniz hiçbir özellik kısıtlanmaz**.

`apps/web/tests/unit/activity-consent.test.tsx` bu davranışları (önceden işaretsiz
kutu, kur-ve-onayla akışı, altı başlıklı aydınlatma metni) doğruluyor.

---

## Dilim 4 — B-009 değerlendirildi, KAPATILMADI

Kod yazılmadı; bu bir değerlendirme kaydıdır.

**Değerlendirilen fikir:** `POST /api/activity`'nin loglama altyapısı (rıza kapısı,
hız sınırı, tek yazma yolu) zaten kurulu olduğu için, B-009'un konusu olan `42501`
(RLS reddi) sinyalinin sunucuya ulaşmasını da aynı uçla kapatmak mümkün mü.

**Gerekçe (bilinçli olarak kapatılmadı):**

- Uç teknik olarak temiz yazılabilirdi — sinyal zaten sınıflandırılmış durumda
  (`table` + `op`, ham metin yok), tek dallanma noktası
  `packages/api-client/src/query-client.ts` içindeki `reportRlsDenialIfNeeded`
  (satır ~27).
- Ama bu, **borcun güvenlik yarısını kapatmıyor**: rapor bizim istemcimizden geliyor;
  RLS'i sondalayan kişi doğrudan PostgREST'e gider ve hiçbir şey raporlamaz. Yani
  "izinsiz erişim denemesi görünür oluyor" iddiası yanlış güven verirdi.
- Daha kötüsü: kimlikli **her** kullanıcıya, bugün %100 sunucu-gözlemli olan güvenlik
  log akışına **sahte satır yazma yetkisi** verirdi — hız sınırı yalnızca hacmi
  sınırlar, uydurma içeriği sınırlamaz. Log bütünlüğü zayıflardı.
- Kök neden **B-031**'dir (tarayıcıdan doğrudan Supabase erişimi tasarım gereği
  sunucu guard'ıyla kesilemiyor). Dürüst kapanış ya orada (mimari faz — API route'a
  alma) ya da DB tarafı log okumasında (`pgaudit` veya Supabase proje logları).
- Ayrıca bugün hiçbir log agregasyon/alarm tüketicisi yok
  (`docs/DEPLOYMENT.md` §APM: Sentry vb. entegrasyonu yok) — yeni olay kimsenin
  okumadığı bir akışa düşerdi. Yeni bir tablo da gerekmiyordu; sunucu logu yeterli
  olurdu.

**Gelecekte yeniden açılırsa iki ön koşul:** (1) olay adı kaynağı belli olmalı
(`client_reported_rls_denied` + `source: 'client'`), sunucu-gözlemli olaylarla aynı
isim alanını paylaşmamalı — karışırsa "sunucu gördü" ile "istemci iddia etti" ayrımı
kaybolur; (2) önce bir log tüketicisi kurulmalı, aksi halde olay hiç okunmaz.

B-009 satırı `docs/PROGRESS.md` §3'te bu değerlendirme özetiyle **açık** kalmaya
devam ediyor.

---

## Doğrulama tablosu

| Kapı                                            | Sonuç                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm run test` / `test:coverage`               | 68 dosya / **868 test** · lines+stmts **%67.17** · branch 80.78 · funcs 70.44 (eşik 60/60/55)          |
| `pnpm run test:rls`                             | **144 senaryo** (136 → +8)                                                                             |
| `node scripts/identity-ratchet.mjs`             | exit 0, tüm sayaçlar tavanla eşit                                                                      |
| `pnpm run lint` / `type-check` / `format:check` | temiz                                                                                                  |
| `pnpm run build`                                | Compiled successfully                                                                                  |
| `pnpm audit --prod --audit-level=high`          | exit 0                                                                                                 |
| `pnpm run test:e2e`                             | **54 passed, 4 skipped** (1.7 dk), exit 0 — atlanan 4 test önceden de atlanıyordu, yeni bir atlama yok |

---

**Ölçülmüş gözlem — heartbeat E2E paketini gürültülemedi.** `<ActivityTracker />`
`providers.tsx`'e eklendiği hâlde E2E paketinin sonucu değişmedi (54 passed, 4
skipped — turdan önceki taban ile birebir). Neden: E2E test kullanıcılarının rıza
durumu `undecided`; Dilim 2'nin kararı gereği rıza `granted` değilken **tek bir
`/api/activity` isteği bile çıkmıyor**. Yani "rıza yoksa hiç istek atma" kararı
yalnızca gizlilik açısından değil, test/ağ gürültüsü açısından da karşılığını verdi —
heartbeat mantığı E2E koşularında sessizce devre dışı kalıyor, ayrı bir mock/stub
gerekmedi.

---

## Faz 4.8 sonucu

**TAMAMLANDI (2026-08-20).** İki yeni tablo + tek yazma RPC'si + `aal2` kapısına
eklenme (Dilim 1), rıza kapılı `POST /api/activity` + heartbeat (Dilim 2), danışan
tam ayrıntılı (`/verilerim`) ve koç gün bazlı iki görünüm (Dilim 3b), mahremiyet
sınırının `coach_activity_summary()` RPC'siyle veri katmanına taşınması (Dilim 3c) ve
açık rıza arayüzü (Dilim 3a) teslim edildi. RLS 136 → **144 senaryo**, vitest 793 →
**868 test** (64 → 68 dosya). Dilim 4 (B-009 fırsatı) **değerlendirildi ve bilinçli
olarak kapatılmadı** — kök neden B-031'de kalıyor, B-009 açık borç olarak duruyor.
Sırada bekleyen kullanıcı aksiyonları (alan adı + Resend geçişi/B-062, B-033
anahtar rotasyonu, B-030 gerçek yedek kanıtı, repo'nun OneDrive'dan çıkarılması,
dependabot'un kalan majör PR'ları) ve ardından **Faz 5 — Sağlık Verisi
Senkronizasyonu**. Ayrıntı: `docs/PROGRESS.md` §5.
