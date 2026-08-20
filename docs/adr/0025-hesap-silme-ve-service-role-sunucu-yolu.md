# ADR-0025 — Hesap silme akışı ve `service_role`'ün ilk çalışma zamanı sunucu yolu

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-19
- **Karar verenler:** Faz 4.6 dilim 1 (KVKK hesap silme) turu
- **İlgili:** `active_planprogram.md` §7a (AC-4.6.1, AC-4.6.2) · `docs/security/hardening-prompt-v2.md` #21 ·
  borç **B-042** · ADR-0007 (tek koçlu model) · ADR-0022 (oturum depolaması) ·
  ADR-0024 (`@repo/api-client` enjeksiyonu) · B-010 (denetim izi borcu)
- **Uygulama:** `supabase/migrations/20260819100000_account_deletion.sql` ·
  `apps/web/src/app/api/account/delete/route.ts` ·
  `apps/web/src/app/api/account/deletion-core.ts` ·
  `packages/api-client/src/hooks/useAccount.ts` · `apps/web/src/app/profile/page.tsx`
- **Kanıt:** `supabase/tests/rls.test.sql` senaryo 119–124 ·
  `apps/web/tests/unit/account-deletion.test.ts` · `apps/web/tests/e2e/account-deletion.spec.ts`

---

## Bağlam

Uygulamada hesap silme diye bir yol yoktu. Bir danışan "hesabımı ve verilerimi silin" dediğinde
yapılabilecek tek şey elle SQL yazmaktı; KVKK m.7 ve GDPR m.17 ("unutulma hakkı") karşılanmıyordu.
Borç kütüğünde **B-042** olarak izleniyordu ve tetikleyicisi açıktı: _hosted ortamda ilk gerçek
danışan verisi oluşmadan kapanmalı._

Bu iş, projede bir ilki gerektiriyor: **`service_role` anahtarının çalışma zamanında,
uygulama süreci içinde kullanılması.** Bugüne kadar `SUPABASE_SERVICE_ROLE_KEY` yalnızca depo
dışı bakım script'lerinde (`scripts/import-catalog.mjs`, `scripts/clean-e2e-data.mjs`)
kullanılıyordu; Next.js süreci onu hiç okumuyordu. `service_role` RLS'i **tamamen** baypas ettiği
için, onu bir HTTP ucunun arkasına koymak bu kod tabanındaki en yüksek riskli tek adımdır ve
`active_planprogram.md` §7a bu yüzden ayrı bir ADR şart koştu.

### Ölçülen gerçekler (varsayım değil)

Kararlar aşağıdaki dört ölçüme dayanıyor; hepsi yerel yığında bu tur sırasında yapıldı.

1. **Danışan verisi taşıyan tablo sayısı: 14.** `public` şemasında 16 tablo vardı; ikisi
   (`exercises`, `food_database`) kullanıcı kolonu taşımayan **katalogdur**. §7a'daki "14 tablo"
   ifadesi ölçümle birebir tutuyor:
   - doğrudan `client_id`/`id` (12): `profiles`, `notifications`, `messages`, `form_checks`,
     `daily_logs`, `workout_logs`, `nutrition_logs`, `program_approvals`, `workout_plans`,
     `nutrition_plans`, `progress_entries`, `progress_photos`
   - plan üzerinden dolaylı (2): `workout_plan_exercises`, `nutrition_plan_meals`

   (Bu tur eklenen `account_deletions` denetim tablosu 17. tablodur ama danışan verisi taşımaz;
   sayıma girmez.)

2. **Cascade zinciri hazır.** `public.profiles.id → auth.users(id) ON DELETE CASCADE` ve diğer 13
   tablonun tamamı `profiles`'a (ya da bir plana) `ON DELETE CASCADE` ile bağlı. Yani
   `delete from auth.users where id = ?` tek ifadesi 14 tablonun tamamını süpürüyor.
   `form_checks.reviewed_by`, `program_approvals.reviewed_by` ve `workout_logs.plan_exercise_id`
   `SET NULL`'dır — bunlar koç/plan referanslarıdır, danışan silmesinde tetiklenmez.

3. **`storage.objects`'ten SQL ile satır silmek PLATFORM TARAFINDAN YASAK.** İlk taslakta
   denendi ve canlı olarak şu hatayı verdi:

   ```
   ERROR:  Direct deletion from storage tables is not allowed. Use the Storage API instead.
   HINT:   This prevents accidental data loss from orphaned objects.
   CONTEXT: PL/pgSQL function storage.protect_delete()
   ```

   Trigger (`protect_objects_delete`) tam olarak bizim de kaçınmak istediğimiz şeyi yasaklıyor:
   satırı silip diskteki/S3'teki baytı bırakmak. Bir kaçış kapısı var
   (`set local storage.allow_delete_query = 'true'`) ve **kullanılmadı**.

4. **Danışan kendi storage nesnelerinin tamamını silemiyor.** `message-attachments`
   politikası (`message_attachments_delete_own_or_coach`) danışana yalnızca **kendi yüklediği**
   nesneyi sildiriyor. Koçun o konuşmaya yüklediği ekleri danışan silemez; mesaj satırları
   cascade ile giderken dosya yetim kalırdı.

---

## Karar

### 1) İş bölümü: sunucu route handler'ı **artı** Postgres fonksiyonu — ikisi de, farklı işler için

| Adım                                        | Nerede çalışır                | Hangi yetkiyle                                  | Neden orada                                                                                                  |
| ------------------------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Kimlik doğrulama (Bearer JWT → uid)         | Next.js route handler         | `anon` key + GoTrue `getUser()`                 | Kimlik istemciden **alınmaz**; uid yalnızca doğrulanmış token'dan türetilir                                  |
| Onay cümlesinin doğrulanması                | Next.js route handler         | —                                               | Arayüz doğrulaması güvenlik sınırı değildir; `fetch` ile atlanabilir                                         |
| Silinecek storage nesnelerinin listelenmesi | Postgres (`..._manifest()`)   | `SECURITY DEFINER`, EXECUTE: `service_role`     | Ad sözleşmeleri dört bucket'ta farklı ve zaten politikalarda yazılı; ikinci bir ayrıştırıcı ayrışırdı        |
| **Fiziksel dosyaların silinmesi**           | Next.js route handler         | **`service_role`** + Storage API                | SQL'den yapılamaz (ölçüm 3); danışanın kendi yetkisi yetmez (ölçüm 4)                                        |
| **`auth.users` satırının silinmesi**        | Postgres (`delete_account()`) | **`SECURITY DEFINER`**, EXECUTE: `service_role` | `authenticated` `auth.users`'a DELETE edemez; ayrıca 14 tablo + denetim satırı tek transaksiyonda olsun diye |
| 14 tablodaki satırların silinmesi           | Postgres — **FK CASCADE**     | Fonksiyon sahibinin (`postgres`) hakkıyla       | Elle 14 `delete` yazmak, 15. tablo eklendiğinde sessizce eksik silerdi                                       |
| Silme sonrası eksiksizlik kanıtı            | Postgres (`delete_account()`) | aynı transaksiyon                               | "Sildim" demeden önce sayım; kalan satır varsa `raise` → tüm işlem geri sarılır                              |
| Denetim satırı                              | Postgres (`delete_account()`) | aynı transaksiyon                               | Silme geri sarılırsa denetim satırı da geri sarılır; "sildim" diyen ama silmeyen kayıt oluşamaz              |

**Özet kural:** _Veritabanında yapılabilen her şey veritabanında ve tek transaksiyonda yapılır;
sunucu yalnızca (a) kimlik/onay kapısı ve (b) veritabanının yapamayacağı tek iş olan fiziksel
dosya silme için vardır._

### 2) Sıra: **önce dosyalar, sonra veritabanı** — ve bu şema seviyesinde dayatılır

Fiziksel dosya silme, veritabanı transaksiyonunun dışında kalan tek adımdır. Bu yüzden **önce**
çalışır: yarıda kalırsa hesap hâlâ ayaktadır, kullanıcı tekrar dener, hiçbir şey kaybolmamıştır.
Ters sırada yarıda kalan bir koşu, sahibi artık var olmayan ve hiçbir sorgunun bulamayacağı
**yetim fotoğraflar** bırakırdı.

`delete_account()` bu sözleşmeye güvenmez, **dayatır**: çağrıldığında geriye storage nesnesi
kalmışsa `raise` eder ve hiçbir şey silinmez (fail-closed). Yarım silme — "auth kullanıcısı gitti
ama vücut fotoğrafı duruyor" — şema seviyesinde imkânsızdır. Route, storage temizliğini en fazla
3 tur dener (`MAX_STORAGE_PASSES`); yarışta yüklenen yeni bir nesne ikinci turda yakalanır,
sonsuz döngü yoktur.

### 3) `service_role` anahtarının disiplini

- **Nerede yaşar:** yalnızca sunucu ortam değişkeni `SUPABASE_SERVICE_ROLE_KEY`.
  `NEXT_PUBLIC_` öneki **yoktur**; `apps/web/src/env.server.ts` içinde tanımlıdır ve o dosya
  `import 'server-only'` taşır (AC-11) — adı bile istemci paketine girmez.
- **Route da `server-only`'dir:** `api/account/delete/route.ts` ilk satırında
  `import 'server-only'` bulunur. Yanlışlıkla bir istemci bileşeninden import edilirse
  **build-time** hatası verir, çalışma zamanında sızmaz.
- **Yapılandırılmamışsa fail-closed:** anahtar yoksa uç `503 ACCOUNT_DELETION_UNAVAILABLE`
  döner. **Sessizce "sildim" demek en kötü davranıştır** — kullanıcı hesabının gittiğini sanır,
  veri yerinde durur.
- **Loglara asla yazılmaz.** Bu yolun ürettiği hiçbir log satırı anahtarı, token'ı ya da hata
  gövdesini taşımaz; yalnızca `event` + sayı alanları loglanır. Mevcut redaction katmanı
  (`REDACT_PATHS`, `tests/unit/logger-redact.test.ts`) ikinci bir savunma olarak yerindedir ama
  bu yol **ona güvenmez**: hassas alan log'a hiç konulmaz.
- **Ne kadar yüzey açar:** `service_role` yalnızca **iki** fonksiyonu çalıştırabilir
  (`account_deletion_manifest`, `delete_account`) ve Storage API'yi kullanır. `account_deletions`
  denetim tablosunda **doğrudan tablo yetkisi bile yoktur** (bkz. §5).

### 4) Yetki modeli: `EXECUTE` yalnızca `service_role`'de

Her iki fonksiyon da `SECURITY DEFINER` + pinli `search_path = public, pg_temp`; `PUBLIC`, `anon`
ve `authenticated` rollerinden `revoke all`, yalnızca `service_role`'e `grant execute`.

Sonuç: **danışan bu fonksiyonları hiç çağıramaz** — ne başkası ne de kendisi için. "Danışan
başkasının hesabını silemez" iddiasının dayanağı bir RLS politikası değil, EXECUTE yetkisidir; tek
meşru yol sunucu ucudur ve o uç uid'yi gövdeden değil doğrulanmış Bearer token'dan alır.

**Koç hesabı bu yoldan silinemez.** Tek koçlu modelde (ADR-0007) koç silinirse `is_coach()` hiç
kimseye `TRUE` dönmez; tüm danışanların onay/mesaj/plan yolları ölür ve `reviewed_by` alanları
`SET NULL` ile tüm inceleme denetim izi silinir. Kapı sunucuda değil **fonksiyonun içinde**
durur: route bypass edilse bile geçilemez (`42501`).

### 5) İdempotanslık sözleşmesi

- `delete_account(uid)` var olmayan bir kullanıcı için **hata üretmez**;
  `{"already_deleted": true, "row_total": 0, ...}` döner.
- **İkinci bir denetim satırı yazılmaz** — yazsaydı "kaç hesap silindi" istatistiği yeniden
  denemelerle şişerdi.
- HTTP katmanında ikinci çağrı `401` alır (token'ın arkasındaki kullanıcı yok); sunucu **5xx
  üretmez**, patlamaz.
- Manifest turu da idempotenttir: kullanıcı arada silinmişse akış sessizce silme adımına düşer.

### 6) Denetim kaydı: `public.account_deletions` — kişisel veri **içermez**

| Kolon                     | İçerik                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `id`                      | `gen_random_uuid()`                                           |
| `deleted_at`              | zaman damgası                                                 |
| `subject_role`            | `client` / `coach` (iki değerli enum)                         |
| `rows_deleted`            | `{"messages": 12, "workout_logs": 40, …}` — tablo başına adet |
| `storage_objects_deleted` | silinen fiziksel nesne sayısı                                 |
| `request_id`              | sunucu logunun korelasyon anahtarı (rastgele üretilir)        |

**uid yok, e-posta yok, ad yok, IP yok.** Silinen kişinin uid'sini saklamak takma adlı veri olurdu
ve KVKK anlamında hâlâ kişisel veridir — silme kaydının kendisi silinen kişiyi işaret ediyorsa
unutulma hakkı yerine gelmemiş olur.

Aynı disiplin **sunucu logunda da** geçerlidir: AI proxy'si log'a `userId` eklerken bu yol
**eklemez**. Korelasyon `requestId` üzerinden yapılır ve o değer denetim satırına da yazılır, yani
"hangi log satırı hangi silmeye ait" sorusu uid olmadan cevaplanabilir.

Tablo `authenticated`'a da `service_role`'e de kapalıdır: RLS + FORCE açık, **sıfır politika**
(grant var, politika yok → her işlem reddedilir) ve `service_role`'ün doğrudan tablo yetkisi
yoktur. Tek yazan, `SECURITY DEFINER` olan `delete_account()`tir; operatör kaydı doğrudan
veritabanı erişimiyle okur.

**B-010 ile ilişkisi:** B-010 ("plan tablolarında satırı kimin yazdığı tutulmuyor", ADR-0014'ün
kabul edilen bedeli) bu tabloyla **kapanmaz** ve kapanmaya çalışılmadı. B-010 _yazma_ denetimi
ister ("kim yazdı"); buradaki kayıt _silme_ denetimidir ve tam tersine "kim" bilgisini bilerek
tutmaz. İki gereksinim zıt yönlüdür, aynı mekanizmayla çözülemez. **B-010 açık kalır.**

### 7) Arayüz: çift onay

1. **Niyet:** "Hesabımı Sil" düğmesi hiçbir şey silmez, yalnızca uyarı panelini açar. Yanlış
   tıklamanın bedeli sıfırdır.
2. **Yazarak doğrulama:** kullanıcı `HESABIMI SİL` cümlesini birebir yazmadan son düğme
   etkinleşmez. Bu, "onaylıyor musunuz? [Evet]" tipi bir diyalogdan bilerek daha zordur; geri
   dönüşü olmayan bir işlemde kas hafızasıyla tıklanabilen bir onay, onay değildir.

Cümle **sunucuda tekrar doğrulanır** — arayüz doğrulaması yalnızca kazayı önler, kötü niyeti
değil.

**Türkçe İ/ı tuzağı:** cümle noktalı büyük İ (U+0130) içerir ve üzerinde hiçbir
`toUpperCase()`/`toLowerCase()` çağrılmaz. JS'in katlaması Türkçe İ/ı eşlemesini bilmez ve
kullanıcının ekranda gördüğü metni yazmasına rağmen reddedilmesine yol açardı (aynı tuzak
`tests/e2e/fixtures.ts` ve `normalizeEmail`'de daha önce iki kez ısırdı). Karşılaştırma yalnızca
`trim()` sonrası bayt bayt eşitliktir; giriş alanında `autoCapitalize`/`autoCorrect` kapalıdır.

### 8) Kimlik doğrulama: cookie değil **Bearer**

Uç, oturumu `Authorization: Bearer <access_token>` başlığından okur. `src/lib/supabase/server.ts`
başındaki not bunu zaten karara bağlamıştı: cookie yalnızca depolama ortamıdır, kimlik doğrulama
ortamı değil — cookie'ye dayanan bir uç CSRF yüzeyi açar. Tarayıcı üçüncü taraf bir sayfadan
`Authorization` başlığı gönderemez; uygulamanın en yıkıcı ucu için doğru seçim budur. Aynı desen
`/api/ai/*`'te zaten kullanılıyor.

---

## Kalan risk (dürüstçe kayda geçirilir)

**Supabase erişim token'ı durumsuzdur:** imzası doğrulanır, veritabanına bakılmaz. Silme
sonrasında `auth.sessions` ve `auth.refresh_tokens` `CASCADE` ile gider — yani oturum
**yenilenemez** ve şifreyle yeniden giriş yapılamaz — ama elde duran access token `exp`ine kadar
biçimsel olarak geçerli kalır. Supabase'de bir token kara listesi yoktur.

Bunun **pratik etkisi ölçüldü ve sıfıra yakındır**, çünkü token'ın arkasında okunacak ya da
yazılacak hiçbir şey kalmaz:

- kendi satırlarının hepsi gitmiştir → RLS 0 satır döner,
- yazma denemeleri `profiles` satırı olmadığı için FK/RLS ile reddedilir,
- `/auth/v1/user` kullanıcıyı tanımaz,
- token yenilenemez, yeniden giriş yapılamaz.

Okunabilir kalan tek şey, `profiles_select` politikasının **tüm** authenticated kullanıcılara açtığı
koç profil satırıdır (ADR-0010, bilinçli karar) — kişisel veri değil, uygulamanın kamuya açık
kabul ettiği koç kartıdır.

Azaltıcılar: `jwt_expiry = 900` (15 dk, `supabase/config.toml`) ve istemcinin silme sonrası
`signOut()` + `queryClient.clear()` yapması. Bu artık risk **kabul edilmiştir**; kapatmanın tek
yolu her istekte veritabanına bakan bir token kara listesi kurmaktır ve o, tüm uygulamanın okuma
yoluna sabit bir maliyet ekler.

İkinci artık risk: `storage.protect_delete()` yerinde bırakıldığı için, Storage API üç turda da
başarısız olursa silme **tamamlanmaz** (fail-closed). Kullanıcı anlaşılır bir hata alır ve tekrar
dener. Bu, yetim dosya bırakmaya tercih edilmiştir: KVKK açısından yetim bir vücut fotoğrafı,
silinmemiş bir satır kadar ağır bir kusurdur.

---

## Reddedilen alternatifler

**(A) Her şeyi route handler'da yapmak (`auth.admin.deleteUser()` + 14 tablo için ayrı
`delete` çağrıları).** Reddedildi: HTTP istekleri transaksiyonel değildir. Ağ kopması ya da
sekmenin kapanması, yarısı silinmiş bir hesap bırakırdı ve telafisi yazılamazdı — B-019'un
(koç onay yolu) tam olarak bu sebeple atomikleştirildiği ders hâlâ tazedir.

**(B) Her şeyi Postgres'te yapmak.** Reddedildi: fiziksel dosya SQL'den silinemez (ölçüm 3).
`storage.allow_delete_query` kaçış kapısını kullanmak satırı silip baytı bırakırdı — platformun
yasakladığı şeyi bilerek yapmak, hiçbir şey kazandırmadan yetim dosya riskini geri açardı.

**(C) `SECURITY DEFINER` + `grant execute to authenticated`, gövdede `auth.uid()` kullanmak
(`service_role`'e hiç dokunmamak).** Cazipti: "başkasının hesabını silemez" iddiası yapısal
olurdu (parametre yok). Reddedildi çünkü fiziksel dosya sorununu **çözmüyor** ve danışanın kendi
yetkisi koçun yüklediği ekleri silmeye yetmiyor (ölçüm 4). Ayrıca silmeyi tek bir RPC çağrısına
indirger; onay cümlesi, hız sınırı ve denetim korelasyonu için sunucu katmanı yine gerekirdi.

**(D) Yumuşak silme (soft delete: `profiles.deleted_at`, satırlar yerinde).** Reddedildi:
KVKK/GDPR "unutulma hakkı" **gerçek** silme ister. Yumuşak silme veriyi yerinde tutar, yalnızca
görünmez yapar; ilk denetimde kusur olarak döner. Ayrıca her okuma yoluna bir `where deleted_at
is null` koşulu ekler ve unutulan tek bir sorgu sessiz bir sızıntıdır.

**(E) Denetim satırında silinen kullanıcının uid'sini saklamak.** Reddedildi: takma adlı veri
hâlâ kişisel veridir. "Hangi kullanıcıydı" sorusunun cevabı, tam da silinmesi istenen şeydir.
İstatistik (rol + tablo başına sayı) hiçbir kişisel veri saklamadan aynı operasyonel soruyu
cevaplıyor.

**(F) 14 tablo için elle `delete` yazmak (cascade'e güvenmemek).** Reddedildi: yarın 15. tablo
eklenip listeye yazılmazsa silme **sessizce** eksik kalırdı. Cascade zinciri şemanın kendisinden
gelir. Güven yerine **ölçüm** konuldu: migration FK'lerin gerçekten `CASCADE` olduğunu doğrular ve
`delete_account()` silme sonrası yeniden sayarak kalan satır varsa patlar.

**(G) Kullanıcıya "verilerimi indir" (data export) adımı eklemek.** Bu turun kapsamı dışında
bırakıldı — KVKK m.11 "erişim hakkı" ayrı bir gereksinimdir ve silme akışını bloklamamalıdır.
Ayrı bir borç olarak açılması önerilir.

---

## Sonuçlar

**Kazanımlar**

- B-042 kapandı: danışan kendi hesabını arayüzden, çift onayla, geri dönüşsüz olarak silebiliyor.
- Silme eksiksiz ve **kanıtlı**: 14 tablo + auth kullanıcısı + oturum/refresh token'ları +
  fiziksel storage nesneleri. Eksiklik sessizce geçemez (silme sonrası sayım + `raise`).
- Yarım silme şema seviyesinde imkânsız; idempotanslık sözleşmesi yazılı ve testli.
- Denetim izi var ama kişisel veri yok — KVKK açısından ikinci bir kusur üretmiyor.

**Bedeller**

- Uygulama süreci artık `service_role` anahtarını okuyor. Yüzey iki fonksiyon + Storage API ile
  sınırlı ve bu ADR'nin §3/§4'ü o sınırı yazılı hâle getiriyor, ama sınır **artık var**.
  Bu yüzeye yeni bir uç eklenmesi bu ADR'nin güncellenmesini gerektirir.
- CI'ın E2E job'ında `SUPABASE_SERVICE_ROLE_KEY` tanımlı olmadığı sürece (`supabase status -o env`
  değişkeni `SERVICE_ROLE_KEY` adıyla veriyor) hesap silme spec'i **atlanır**. Spec sessizce yeşil
  vermez; atlama gerekçesini raporlar.
- Koç hesabı bu yoldan silinemiyor; koç için silme, elle yürütülen ayrı bir işlem olarak açık
  kalıyor.
- Access token'ın `exp`ine kadar biçimsel geçerliliği kabul edilen bir artık risktir
  (bkz. "Kalan risk").

---

## Uygulama sonrası ek (2026-08-20) — yüzey denetimi

Bu ADR §5/§Bedeller kararı şuydu: `service_role` yüzeyi **iki fonksiyon + Storage API** ile
sınırlı kalır ve _"bu yüzeye yeni bir uç eklenmesi bu ADR'nin güncellenmesini gerektirir."_
Sonraki üç fazda (4.6, 4.7, 4.8) üç uç daha eklendi — her biri kendi turunda tek başına
gerekçeliydi, ama **hiçbiri bu ADR'ye karşı denetlenmedi ve ADR hiç güncellenmedi.** Bu bölüm
o denetimi şimdi, geriye dönük olarak yapar. Karar (§Karar, §5.3/§4) **değiştirilmiyor** —
aşağıdaki yalnızca bir ölçüm ve bir değerlendirmedir.

### Altı uç — tam liste

`grep -rl SUPABASE_SERVICE_ROLE_KEY apps/web/src` bugün tam olarak yedi dosyada eşleşiyor —
altı uca karşılık gelir (`apps/web/src/app/api/activity/route.ts` ve
`apps/web/src/app/api/activity/shared.ts` aynı ucun, #3'ün, iki parçasıdır) — artı okuma
tanımının kendisi, `apps/web/src/env.server.ts` (toplam sekiz dosya). Faz 4.9 dilim 1
(danışan daveti) altıncı ucu ekledi; bu ek o satırı **aynı turda** kayda geçiriyor.

| #   | Dosya                                                                                | Faz / borç                          | `service_role` ile çağrılan RPC(ler)                                                             | Gerekçe (kaynaktan)                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/web/src/app/api/account/delete/route.ts`                                       | Bu ADR'nin kendisi (Faz 4.6, B-042) | `account_deletion_manifest`, `delete_account` + Storage API (dosya silme)                        | `auth.users` satırını `authenticated` silemez; koçun danışan konuşmasına yüklediği ekleri danışanın kendi yetkisi silemez (ölçüm 4)                                                                                                                                                                                     |
| 2   | `apps/web/src/app/api/attachments/verify/route.ts`                                   | Faz 4.6, B-028 (AC-4.6.4)           | `record_attachment_verification`                                                                 | Doğrulama damgasını yazan RPC'nin EXECUTE'u yalnızca `service_role`'de olmalı — aksi hâlde tarayıcıdaki kod kendi kendini "doğrulanmış" ilan edebilirdi (dosya başı yorum, §"NEDEN service_role")                                                                                                                       |
| 3   | `apps/web/src/app/api/activity/route.ts` + `apps/web/src/app/api/activity/shared.ts` | Faz 4.8 dilim 2 (§7c)               | `record_activity`                                                                                | §7c'nin "tarayıcıdan doğrudan Supabase yazımı yok" kararının şema seviyesindeki karşılığı; `activity_sessions`/`activity_events`'e ve rıza damgalarına yazan TEK yol bu route'lardır (`shared.ts` dosya başı yorumu)                                                                                                    |
| 4   | `apps/web/src/app/api/activity/consent/route.ts`                                     | Faz 4.8 dilim 2                     | `grant_activity_consent`, `revoke_activity_consent`                                              | Aynı gerekçe (3) ile aynı `shared.ts` çekirdeğini paylaşır; `revoke` ayrıca kullanıcının tüm `activity_*` satırlarını aynı transaksiyonda siler (KVKK m.7)                                                                                                                                                              |
| 5   | `apps/web/src/app/api/coach/reset-client-password/route.ts`                          | Faz 4.7 dilim 3                     | `record_coach_action`                                                                            | `coach_actions` sıfır politikalı (grant var, politika yok); denetim satırı yazılamazsa müdahale (şifre sıfırlama e-postası) **hiç tetiklenmez** — iz bırakmadan yapılan müdahale, hiç yapılamayan müdahaleden daha kötü kabul edildi                                                                                    |
| 6   | `apps/web/src/app/api/coach/invite-client/route.ts`                                  | Faz 4.9 dilim 1                     | `record_coach_action`, `link_coach_action_target` + `admin.inviteUserByEmail` (GoTrue Admin API) | Davet edilen kullanıcı HENÜZ YOKTUR — `authenticated` hiçbir bağlamda `auth.users`'a satır ekleyemez; `coach_actions` sıfır politikalıdır; ayrıca hedef profil hiç okunmadığı için `mfa_aal2_gate`'in TESADÜFİ koruması (bkz. uç #5'in altındaki not) bu uçta YOKTUR — `aal2` route içinde AÇIKÇA doğrulanır (ADR-0027) |

Beşinci satırda dikkat: `resetPasswordForEmail` çağrısının kendisi **anon key** ile,
kimliksiz bir istemciyle yapılır (dosya başı yorum, "KARAR" bloğu) — `service_role` bu route'ta
yalnızca denetim satırını yazmak için kullanılır, e-posta tetikleme adımına hiç girmez. Aynı
şekilde uç #2'de baytları okuma ve uyumsuz nesneyi silme adımları da kullanıcının **kendi**
token'ıyla (RLS altında) yapılır; `service_role` yalnızca son damga yazımı için devreye girer.

Altıncı satırda dikkat — ve bu, beşinci uçtan **açıkça farklıdır, gizlenmez**: uç #6'da
`service_role` yalnızca denetim satırları için değil, **davetin/kullanıcı oluşturmanın kendisi
için de** kullanılır — `admin.inviteUserByEmail` çağrısının kendisi `service_role` ile kurulan
`admin` istemcisiyle yapılır (`route.ts` satır 415). Uç #5'te e-posta tetikleme adımı **anon
key** ile kimliksiz bir istemciden yapılıyordu (yukarıdaki paragraf); burada öyle değildir —
GoTrue'nun kullanıcı davet/oluşturma uç noktası zaten yalnızca `service_role` ile çağrılabilir,
anon key ile çağrılabilecek bir eşdeğeri yoktur. Sonuç: uç #6, bu ADR'nin listelediği altı ucun
içinde `service_role`'ü hem denetim izi hem de asıl iş (kullanıcı yaratma) için kullanan **tek**
uçtur.

### Disiplin denetimi (ölçüldü, varsayılmadı)

| Kontrol                                                                                                                                                                                                  |                             #1 delete                              |           #2 attachments/verify            |                 #3 activity                  |                  #4 activity/consent                  |           #5 coach/reset-client-password           |                                                                                #6 coach/invite-client                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------: | :----------------------------------------: | :------------------------------------------: | :---------------------------------------------------: | :------------------------------------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `import 'server-only'` dosya başında                                                                                                                                                                     |                            ✓ (satır 1)                             |                ✓ (satır 1)                 |    ✓ (satır 1, `route.ts` + `shared.ts`)     |                      ✓ (satır 1)                      |                    ✓ (satır 1)                     |                                                                                      ✓ (satır 1)                                                                                      |
| Anahtar `getServerEnv()` üzerinden okunuyor (doğrudan `process.env` değil)                                                                                                                               |                                 ✓                                  |                     ✓                      |          ✓ (`shared.ts` üzerinden)           |               ✓ (`shared.ts` üzerinden)               |                         ✓                          |                                                                                     ✓ (satır 357)                                                                                     |
| Anahtar yoksa fail-closed 503 (sessiz "başarılı" yok)                                                                                                                                                    |                  ✓ `ACCOUNT_DELETION_UNAVAILABLE`                  |  ✓ `ATTACHMENT_VERIFICATION_UNAVAILABLE`   |           ✓ `ACTIVITY_UNAVAILABLE`           |               ✓ `ACTIVITY_UNAVAILABLE`                |         ✓ `COACH_ACTION_AUDIT_UNAVAILABLE`         |                                                       ✓ `COACH_ACTION_AUDIT_UNAVAILABLE` (satır 356-369, aynı sabit uç #5 ile)                                                        |
| EXECUTE yalnızca `service_role` (migration: `revoke all ... from public/anon/authenticated` + `grant execute ... to service_role`, ve migration içinde `has_function_privilege` ile runtime doğrulaması) | ✓ (20260819100000 / 20260820090000 §6, satır 1036-1039, 1133-1136) | ✓ (20260819110000, satır 238-241, 418-422) | ✓ (20260820090000, satır 795-798, 1244-1267) | ✓ (aynı migration, satır 280-283, 346-349, 1244-1267) |     ✓ (20260819130000, satır 193-196, 430-436)     | ✓ `record_coach_action` yeniden bildirimi (20260820160000, satır 267-270) + YENİ `link_coach_action_target` (aynı migration, satır 331-334) + runtime doğrulama §5(e) (satır 469-476) |
| `SECURITY DEFINER` + pinli `search_path = public, pg_temp`                                                                                                                                               |                                 ✓                                  |                     ✓                      |                      ✓                       |                           ✓                           |                         ✓                          |                                                 ✓ `record_coach_action` (satır 238-240) + `link_coach_action_target` (satır 303-305)                                                  |
| Anahtar/token log satırına, hata gövdesine veya yanıt başlığına yazılmıyor                                                                                                                               |           ✓ (uid de yazılmaz, yalnızca sayı/`requestId`)           |                     ✓                      |                      ✓                       |                           ✓                           | ✓ (e-posta yalnızca `maskEmailForLog` ile maskeli) |                               ✓ (e-posta yalnızca `maskEmailForLog` ile maskeli, satır 350/425/471; davet bağlantısı `UserResponse` tipinde zaten yok)                                |

Yedi ölçüm de **yeşil** (altı ucun her birinde — bkz. yukarıdaki tablonun #6 sütunu). Tabloda
altı satır var ama "yedi" doğrudur: dördüncü satır (`EXECUTE yalnızca service_role`) tek hücrede
İKİ ayrı ölçümü bir arada taşır — migration'ın **bildirimsel** `revoke`/`grant` çiftini VE ayrıca
migration'ın kendi doğrulama bloğundaki **runtime** `has_function_privilege` kontrolünü. #6
sütunu bu ikiliği aynen korur: `record_coach_action`in yeniden bildirimi (satır 267-270) ve
`link_coach_action_target`in bildirimi (satır 331-334) bildirimsel yarıyı, migration §5(e)'deki
`has_function_privilege` çağrıları (satır 469-476) runtime yarıyı karşılar — yani 6 satır ×
(diğer beşi 1'er + bu satır 2) = 7 ölçüm. Ek bulgu (gri alan — ne ihlal ne göz ardı edilecek):
`service_role`'e EXECUTE verilmiş **dokuzuncu** bir fonksiyon daha var — `purge_expired_activity`
(aynı migration, satır 857-860; bu satırın kendisi değişmedi, yalnızca sıradaki yeri kaydı). Bu,
yukarıdaki altı uçtan hiçbirinin `admin.rpc(...)` ile **çağırmadığı** tek fonksiyondur; yalnızca
`pg_cron` (birincil) ve `record_activity()`'nin içinden fırsatçı çağrıyla (ikincil, satır ~780)
tetiklenir — yani HTTP isteği yoluyla asla `service_role` istemcisinden geçmez. Buna karşılık
Faz 4.9 dilim 1'in eklediği `link_coach_action_target`
(`20260820160000_coach_invite_action.sql` satır 298-326) **çağrılan** bir fonksiyondur: uç #6
adım 10'da `admin.rpc('link_coach_action_target', ...)` ile onu doğrudan tetikler (`route.ts`
satır 448). Uygulama süreci `purge_expired_activity`'yi hiç
çağırmadığı için "altı uç" sayımını değiştirmez, ama veritabanı düzeyinde `service_role`
anahtarının **çalıştırabileceği** fonksiyon kümesi (yani sızmış bir anahtarla yapılabilecekler)
sekiz değil **dokuz**'dur (`account_deletion_manifest`, `delete_account`,
`record_attachment_verification`, `record_activity`, `grant_activity_consent`,
`revoke_activity_consent`, `purge_expired_activity`, `record_coach_action`,
`link_coach_action_target`). Bu, "iki fonksiyon" diyen orijinal ADR metninin bugün için eksik
olduğu tek nokta — güvenlik açığı değil, sayım farkı.

### Değerlendirme

**Yüzey büyüdü, disiplin gevşemedi.** Altı ucun da yedi kontrolü de geçmesi — hepsi
`server-only`, hepsi fail-closed, hepsi migration-seviyesinde `has_function_privilege` ile
kendi kendini doğrulayan dar bir EXECUTE grant'i, hepsi anahtarı/uid'yi/e-postayı asla açık
loglamıyor — tesadüf değil: her yeni uç, önceki ucun (çoğunlukla bu ADR'nin ya da
`account/delete/route.ts`'nin) dosya başı yorumunda **açıkça "AYNI gerekçe" diyerek** deseni
kopyaladı (`attachments/verify`: "Anahtar disiplini ADR-0025 ile aynıdır"; `activity/shared.ts`:
"ANAHTAR DİSİPLİNİ ... birebir aynı"; `coach/reset-client-password`: "AYNI gerekçe:
`account/delete/route.ts`"; `coach/invite-client`: "`account/delete/route.ts` ve
`reset-client-password` ile AYNI gerekçe"). Yani **kod disiplini** organik olarak korundu —
geliştirici(ler) her seferinde bu ADR'yi örnek aldı.

Gevşeyen şey daha önce **süreç** disipliniydi: ADR'nin kendi yazdığı "yeni uç eklenirse bu ADR
güncellenir" kuralı üç kez arka arkaya çiğnenmişti (Faz 4.6, 4.7, 4.8 — hiçbiri bu dosyaya
dokunmamıştı). Bu ek o borcu geriye dönük olarak kapattı. **Faz 4.9 dilim 1 ise bu kuralın ilk
kez zamanında uygulandığı turdur:** altıncı uç (`coach/invite-client`) kendi migration'ı ve
route'uyla **aynı commit'te** bu ADR'ye bir satır olarak eklendi — üç kez çiğnenen kural burada
ilk kez tam olarak işledi, geriye dönük bir düzeltme gerekmedi.

### İleriye dönük kural

`SUPABASE_SERVICE_ROLE_KEY` çalışma zamanında (yeni bir Next.js route/dosyada) okunan her yeni
uç eklendiğinde, **aynı commit'te** yukarıdaki iki tabloya bir satır eklenir (dosya, faz/borç,
çağrılan RPC, gerekçe, yedi kontrolün sonucu). Satır eklenmeden yeni bir `service_role` ucu
"tamamlandı" sayılmaz — tıpkı `account_deletions`/`coach_actions` gibi denetim tablolarının
"iz bırakmadan yapılan müdahale, hiç yapılamayandan kötüdür" ilkesinin belge karşılığı.
