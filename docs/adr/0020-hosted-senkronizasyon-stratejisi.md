# 0020 — Barındırılan Supabase projesinin temiz baseline ile senkronlanması

- **Durum:** Kabul edildi — uygulandı (2026-08-17, bkz. "Uygulama sonucu")
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi
- **Düzeltme notu:** §5'teki bir teknik iddia 2026-08-17'de yerinde düzeltildi (üstü çizili +
  düzeltme kalıbı — append-only konvansiyonuna bilinçli ve dar bir istisna, bkz. §5).

## Bağlam

### Sürüklenmenin boyutu

`supabase/migrations/` altındaki **25 migration** (kayıtlarda yer yer geçen "21" sayısı
bayattır — dizin sayımıyla doğrulandı) bugüne kadar **yalnızca yerel Docker yığınına**
uygulandı. Barındırılan proje (`nxftmxkpmuyeelrmwofv.supabase.co`) hiçbir migration görmedi;
elle yapılmış eski düzenlemelerle bugüne geldi. `docs/HOSTED-DATA-INVENTORY.md` (2026-08-17,
salt-okunur envanter) farkı somutlaştırıyor:

- **`profiles`:** hosted'da yerelde olmayan `age`, `height_cm`, `weight_kg`, `gender`,
  `activity_level`, `goal`, `last_log_date` kolonları var; yerelde olan `email`, `updated_at`,
  `last_checkin_at` yok.
- **`notifications`:** hosted `target_student_id` kullanıyor (yerel: `client_id`), `is_read` yok.
- **`daily_logs`:** hosted'da fazla `morning_weight`/`notes`, eksik `created_at`.
- **`program_approvals`:** hosted'da `reviewed_by`/`reviewed_at` yok.
- **Legacy tablolar:** `workouts` (0 satır) ve `program_templates` (3 satır) yerel şemada hiç
  tanımlı değil.
- **Storage:** `avatars` ve `form-checks-media` bucket'ları hâlâ `public = true` — yerelde bu
  ikisi Faz 1a'da private yapılmıştı.

Yerel zincir bu arada sadece kolon eklemedi; **yeniden adlandırdı, normalize etti, tabloları
böldü** (`workout_plans`/`workout_plan_exercises`, `nutrition_plans`, `workout_log_sets`,
`message_attachments`, plan versiyonlama), rolleri `admin`/`student` → `coach`/`client` yaptı
(bkz. `0013`), `is_admin()` → `is_coach()` çevirdi, RLS'i FORCE'a çekti ve 12 storage
politikası kurdu. Yani sürüklenme "birkaç kolon" değil, **iki ayrı şema**.

### Barındırılan projede gerçek danışan verisi yok

Aynı envantere göre hosted işlemsel tablolar pratik olarak boş: **2 profil** (`admin` 1,
`student` 1), **0 form check**, **0 antrenman logu**, **0 bildirim**, **0 onay kaydı**,
**2 mesaj**, **1 günlük log**. Dolu olan tek şey referans katalogları (`exercises` 1324,
`food_database` 703) ve 3 satırlık `program_templates` serbest metni. Her iki profilin de
`workout_plan` ve `nutrition_plan` alanı `NULL` — yani hosted'da korunmaya değer, yeniden
üretilemeyen bir danışan verisi **yoktur**.

### Kayıtlı risk: `storage.objects` üzerine `CREATE POLICY`

`docs/PROGRESS.md` §5 risk kütüğü şunu taşıyordu: `20260816090300_storage.sql` doğrudan
`storage.objects` üzerine `CREATE POLICY` yazıyor; hosted'da `db push` `postgres` rolüyle
koşar ve o rol tablonun sahibi değildir, dolayısıyla `must be owner of table objects` (42501)
beklenir. Bu tek dosyalık bir sorun da değildi: aynı deyim dört migration'da geçiyor ve
Faz 3 (`meal-photos`) ile Faz 4 (`progress-photos`) yığını büyütecek.

### `.env.local` ayak tabancası

`.env.local` **barındırılan** projeyi gösteriyor ve repoda yerel-öncelikli bir varsayılan yok
(`.env.example` dışında başka env dosyası mevcut değil; `.gitignore` zaten `.env*` yok
sayıyor). `next build` / `next start` üretim modunda `.env.local`'ı okur; dolayısıyla ortam
değişkeni override'ı **unutulmuş** bir E2E veya build koşusu doğrudan barındırılan
veritabanına bağlanır ve oraya yazar (`daily-log` senaryosu kayıt oluşturur). Bu, sadece
belgelenmiş bir "bilinen kısıt" olarak bırakılamayacak kadar sessiz bir hata modu.

## Karar

### 1. Storage deyimi DEĞİŞTİRİLMEZ — kayıtlı risk yanlış alarmdır

Ölçüm yapıldı, tahmin yürütülmedi. Yerel yığın barındırılan ortamla **aynı imajı** çalıştırıyor
(`public.ecr.aws/supabase/postgres:15.8.1.085`) ve konteynerin tek bind-mount'u veri
volume'u — yani aşağıdaki yapılandırma CLI tarafından enjekte edilmiş yerel bir kolaylık
değil, **imajın kendisinden** geliyor (`/etc/postgresql-custom/supautils.conf`).

Ölçülen gerçekler:

| Ölçüm                                                       | Sonuç                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` süper kullanıcı mı?                              | **hayır** (`rolsuper = f`) — hosted ile aynı                                                                                                                                                                               |
| `storage.objects` sahibi                                    | `supabase_storage_admin`                                                                                                                                                                                                   |
| `postgres`, `supabase_storage_admin` üyesi mi?              | **hayır** (`pg_auth_members`'ta kayıt yok)                                                                                                                                                                                 |
| `supautils` nasıl yükleniyor?                               | `session_preload_libraries = supautils`                                                                                                                                                                                    |
| `supautils.policy_grants` → `postgres` için izinli tablolar | `storage.objects`, `storage.buckets`, `storage.migrations`, `storage.s3_multipart_uploads(_parts)`, `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries`, `realtime.messages` |

Yani Supabase'in kendi Postgres imajı, `postgres` rolüne `storage.objects` üzerinde
**politika yönetimini açıkça bağışlıyor**. Bu bir kaza değil, adı konmuş bir yetenek.

Mekanizmanın gerçekten bu izin listesi olduğu, listede olan ve olmayan tablolar
karşılaştırılarak kanıtlandı (hepsi `postgres` kimliğiyle, `rollback` içinde):

| Deyim                                                         | Sonuç                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `create policy … on storage.objects`                          | **CREATE POLICY** (listede)                                        |
| `create policy … on storage.buckets`                          | **CREATE POLICY** (listede)                                        |
| `drop policy … on storage.objects`                            | **DROP POLICY** (listede)                                          |
| `create policy … on auth.users`                               | **CREATE POLICY** (listede)                                        |
| `drop trigger … on auth.users`                                | **DROP TRIGGER** (`drop_trigger_grants`)                           |
| `alter publication supabase_realtime set (publish = …)`       | **ALTER PUBLICATION** (yayın sahibi `postgres`)                    |
| `insert into storage.buckets` / `update storage.buckets`      | normal DML — sorunsuz                                              |
| `create policy … on storage.buckets_analytics`                | **HATA: must be owner of table buckets_analytics** (listede değil) |
| `create policy … on auth.mfa_factors`                         | **HATA: must be owner of table mfa_factors** (listede değil)       |
| `alter table storage.objects enable/force row level security` | **HATA: must be owner of table objects**                           |

Kütükte korkulan hata mesajı gerçekten var — ama **izin listesinde olmayan** nesnelerde ve
politika deyiminde değil, `ALTER TABLE … ROW LEVEL SECURITY` deyiminde. Zincirin tamamı
tarandı (`alter table storage.*`, `grant/revoke … on storage.*`, `create/alter/drop …
storage.*`, `set role`): **migration'larımızın hiçbiri izin listesi dışına çıkmıyor.**
`storage` şemasına dokunan tüm ifadeler dört dosyada toplanıyor —
`20260816090300_storage.sql`, `20260817100000_private_storage.sql`,
`20260817180100_avatar_visibility.sql`, `20260817190200_message_attachments.sql` — ve hepsi
`create/drop policy` ya da `storage.buckets` üzerinde DML.

Değerlendirilen ve **reddedilen** alternatifler (her biri yerelde denendi):

- **`set role supabase_storage_admin`** → `permission denied to set role`. Reddedildi:
  çalışmıyor.
- **`grant supabase_storage_admin to postgres`** → `"supabase_storage_admin" role memberships
are reserved, only superusers can grant them` (`supautils.reserved_memberships`). Reddedildi:
  platform bilinçli olarak kapatmış.
- **`security definer` yardımcı fonksiyon** → fonksiyonun sahibi tablo sahibi olmadıkça bir şey
  değişmez; `alter function … owner to supabase_storage_admin` da
  `must be member of role "supabase_storage_admin"` ile düşüyor. Reddedildi: aynı duvara
  çarpıyor, üstüne bir dolaylılık katmanı ekliyor.
- **Politikaları Dashboard'dan / `config.toml`'dan yönetmek** → şema kod olmaktan çıkar, 12
  politika sürüm kontrolünün dışına düşer, `db reset` ile yeniden üretilemez hale gelir.
  Reddedildi.
- **`do $$ … exception when insufficient_privilege then raise notice … end $$;` sarmalı** →
  **sessiz başarısızlık** üretir: politika kurulmazsa `db push` yeşil görünür ama danışan vücut
  fotoğrafları korumasız kalır. Bu, düzeltmeye çalıştığımız riskten daha kötüdür. Kesinlikle
  reddedildi.

Kısacası: mevcut yazım biçimi çalışan **tek** biçim. Hosted'da doğrulanamayan bir değişikliği
körlemesine yapmak, çalışan bir deyimi bozma riskini karşılıksız almak olurdu. **Migration'lar
değiştirilmedi.**

**Ön uçuş kontrolü (tek kalan belirsizlik):** Yukarıdaki kanıt yerel imajdan alındı. Hosted
proje eski bir kurulum (`admin`/`student` rolleri, legacy tablolar) ve Postgres imajı daha eski
olabilir; `supautils.policy_grants` GUC'u o sürümde dar veya yok olabilir. `db push`'tan önce
Dashboard SQL editöründe **salt-okunur** tek sorgu bu belirsizliği kapatır:

```sql
select current_setting('supautils.policy_grants', true) as policy_grants,
       current_setting('server_version')                as pg_version;
```

Çıktı `storage.objects` içeriyorsa risk sıfırdır. İçermiyorsa doğru çözüm migration'ı
bozmak değil, **önce projeyi güncel Postgres sürümüne yükseltmek** (Dashboard → Infrastructure)
ve ardından push etmektir.

**Ön uçuş sonucu (2026-08-17, uygulamadan önce ölçüldü):** Sorgu hosted'da çalıştırıldı —
`server_version` **PG 17.6** döndü (yerel imaj **PG 15.8** — yani yerel doğrulama production'ı
sürüm olarak birebir yansıtmıyormuş; kararın kendisini değiştirmez ama ayrı bir borç olarak
kaydedildi, bkz. `docs/PROGRESS.md` §5). `supautils.policy_grants` tanımlıydı ve
**`storage.objects` listede vardı**. Yukarıdaki analiz artık bir varsayım değil, PG17'de de
ölçümle kanıtlanmış bir sonuç: risk sıfır, migration'lara dokunulmadı, `db push` bu deyimlerde
hiç hata vermedi (bkz. "Uygulama sonucu").

### 2. Temiz baseline — artımlı onarım REDDEDİLDİ

Hosted şeması sıfırlanır ve 25 migration sıfırdan uygulanır.

Artımlı onarım (hosted'ı olduğu yerden yerel şemaya doğru elle yamalamak) reddedildi:

- Yerelle **birebir parite garanti edilemez.** Envanter PostgREST OpenAPI şeması üzerinden
  çıkarıldı; kolon adlarını görür ama kısıtları, indeksleri, tetikleyicileri, RLS politika
  ifadelerini, `FORCE ROW LEVEL SECURITY` durumunu, `default privileges`'ı ve fonksiyon
  gövdelerini **görmez**. Bu katmanlarda sessiz bir fark kalması, güvenlik sınırının hosted'da
  yerelde olduğundan farklı davranması demektir — ve bu tam olarak fark edilmesi en zor hata
  sınıfıdır.
- Bu turun asıl amacı, hosted'ı "çalışır" hale getirmek değil, **zincirin sıfırdan temiz
  koştuğunu kanıtlamaktır.** Artımlı onarım bu kanıtı hiçbir zaman üretmez; hosted kalıcı
  olarak "elle bakılmış, kimsenin yeniden üretemediği" bir ortam olarak kalır.
- Maliyet tarafı zaten boş: korunacak gerçek danışan verisi yok (bkz. Bağlam), kataloglar
  `npm run db:import-catalog` ile yeniden üretilebilir.

Sıfırlama **yalnızca `public` şeması ile storage politika/bucket durumunu** kapsar;
`auth.users` **silinmez** — mevcut 2 hesap korunur.

**Bunun getirdiği zorunlu ek adım:** `handle_new_user()` tetikleyicisi `auth.users` üzerinde
`AFTER INSERT` çalışır. Şema sıfırlandığında mevcut hesaplar yeniden INSERT edilmeyeceği için
`public.profiles` **boş kalır** ve iki hesap profilsiz (dolayısıyla kırık) olur. Push'tan sonra
`auth.users`'tan `profiles`'a tek seferlik bir backfill çalıştırılmalı ve koç hesabının rolü
elle `coach` yapılmalıdır (`0013` gereği yeni enum `coach`/`client`; ayrıca
`20260817160100_signup_role_hardening.sql` yeni profilleri her zaman `client` açar).

**Kaybedilecekler, bilerek kabul ediliyor:** `program_templates`'in 3 satırlık serbest metni ve
`workouts` (zaten 0 satır). Bu iki tablo yerel şemada hiç yok; taşınmaları ayrı bir ürün
kararıdır. 3 satır sıfırlamadan **önce** JSON olarak repo dışına dışa aktarılır ki karar sonraya
bırakılabilsin.
**GÜNCELLEME (2026-08-17, "Uygulama sonucu"):** ayrı bir JSON dosyası olarak değil, zorunlu
tutulan `data.sql` dump'ının içinde tam içerikle korundu — **kayıp yok**, yalnızca planlanan
biçimden bir sapma. Detay için "Uygulama sonucu" bölümündeki ilgili nota bakın.

### 3. `.env.local` yerel yığını göstermeli

Varsayılan güvenli olan yön yereldir. `.env.local` yerel yığına (`http://127.0.0.1:54321` +
`npx supabase status`'tan alınan anahtarlar) çevrilir; barındırılan kimlik bilgileri
`.env.hosted.local` dosyasına taşınır (`.gitignore`'daki `.env*` bunu zaten kapsıyor) ve
yalnızca bilinçli hosted işlemlerinde açıkça yüklenir. Böylece override'ı unutmak "hosted'a
yazdım" değil, "yerelde koştum" ile sonuçlanır.

Ek olarak `src/env.server.ts`'e bir koruma önerilir: `NODE_ENV !== 'production'` iken
`*.supabase.co` hedefi görülürse, `ALLOW_HOSTED_TARGET=1` açıkça verilmedikçe başlatma
reddedilsin. Bu bir kod değişikliğidir ve bu ADR'nin kapsamı dışında ayrı bir iş kalemi olarak
kaydedilir.

> **Sonraki tur notu (2026-08-17):** Yukarıdaki `NODE_ENV !== 'production'` koşullu guard
> önerisi **uygulanmadı**. Fable'a danışılarak bir delik bulundu: tehlikeli yol tam olarak
> `npm run build && npm run start` üzerinden geçiyor ve `next start` **her zaman**
> `NODE_ENV=production` ile koşuyor — öneri, korumaya çalıştığı senaryoda kendini kapatırdı.
> Bunun yerine `NODE_ENV`'den bağımsız, üç katmanlı bir koruma uygulandı: config-time bir
> iddia (`playwright.config.ts`), `NODE_ENV`'e bakmayan fail-closed bir sunucu guard'ı
> (`src/env.server.ts`) ve bilinçli hosted erişimi için ayrı script'ler
> (`dev:hosted`/`build:hosted`/`start:hosted`). Detay: `docs/PROGRESS.md` §3 "Env koruması
> (üç katman) ve yerel Postgres 17 yükseltmesi".

### 4. Keşfedilen kritik bulgu — yetki yükseltme açığı (ADR yazılırken bilinmiyordu)

Zorunlu yedek alınıp şema incelendiğinde (bkz. "Uygulama sonucu"), hosted'da canlı bir yetki
yükseltme açığı bulundu:

```sql
GRANT ALL ON TABLE "public"."profiles" TO "anon";
CREATE POLICY "Herkes profil güncelleyebilir" ON "public"."profiles" FOR UPDATE USING (true);  -- WITH CHECK yok
CREATE POLICY "Profillere herkes erişebilir" ON "public"."profiles" FOR SELECT USING (true);
```

`anon` rolü `profiles` üzerinde TÜM yetkilere sahipti ve UPDATE politikası koşulsuzdu — anon
anahtarını bilen biri herhangi bir profilin `role` alanını değiştirip kendini yükseltebilirdi.
27 politikanın çoğu bu kalıptaydı (`"Herkes bildirim ekleyip görebilir" USING (true) WITH
CHECK (true)`, `"Herkes görebilir ve ekleyebilir" ON program_approvals USING (true)`).

**Şiddet (dürüst değerlendirme):** bugün sömürülebilirliği sınırlıydı — uygulama yayında
değil, anon anahtarı hiçbir yerde yayımlanmamış. Ama Supabase anon anahtarları tasarımı
gereği istemci paketine gömülür; yayına çıkıldığı gün açık anında canlı olurdu.

**Bunun kararı nasıl güçlendirdiği:** Bu ADR'nin §2'deki "temiz baseline, artımlı onarım
reddedildi" kararı zaten "envanter (`docs/HOSTED-DATA-INVENTORY.md`) PostgREST OpenAPI
şeması üzerinden çıkarıldı — kolon adlarını görür ama RLS politika ifadelerini görmez, bu
katmanlarda sessiz bir fark kalması en zor fark edilecek hata sınıfıdır" gerekçesine
dayanıyordu. Bu açığın varlığı tam olarak o gerekçenin öngördüğü senaryonun gerçekleşmiş
hâliydi — yalnız "sürüklenmiş şema farkı" değil, "aktif güvenlik açığı" biçiminde. Temiz
baseline kararı bu açığı otomatik olarak kapattı (25 migration'ın politikaları koşulsuz
`USING (true)` içermiyor, `anon`'a `GRANT ALL` yok); artımlı onarım seçilseydi bu açığın fark
edilip edilmeyeceği şansa kalırdı — envanter zaten onu göstermemişti.

Bu bulgu `docs/security/AUDIT.md`'nin AC-12 bulgusunun ("denetim yerel yığında yapıldı, hosted
proje ayrıca doğrulanmalı") işaret ettiği riskin gerçekleşmiş hâliydi ve o denetimin kapsamı
dışındaydı (denetim yalnızca yerel yığında yapılmıştı). Kapanışı: `docs/security/AUDIT.md` §2
(AC-12).

### 5. `storage.protect_delete()` — PG17'ye özgü yeni bulgu

Sıfırlama denemesinin ilk turu `storage.buckets`'tan `DELETE` ile bucket'ları temizlemeyi
denedi ve `42501` ile başarısız oldu — PG17 imajında `storage.protect_delete()` adlı bir
koruma trigger'ı `storage.buckets` üzerinde doğrudan `DELETE`'i engelliyor. İşlem
transactional yürütüldüğü için hiçbir şey kısmi uygulanmadı. Bucket'ları silip yeniden
oluşturma yolundan vazgeçildi; bunun yerine mevcut bucket satırları `UPDATE` ile hedef duruma
(`public=false`, 5 MB, 6 MIME tipi) çekildi — `DELETE` engelli ama `UPDATE` serbest.

~~Bu, ADR'nin yazıldığı sırada yerel PG15 imajında gözlenmemiş, yalnızca hosted'ın PG17
imajında ortaya çıkan bir davranış farkıydı.~~

**DÜZELTME (2026-08-17, ölçümle):** Bu iddia YANLIŞTI. `protect_buckets_delete` ve
`protect_objects_delete` trigger'ları yerel PG 15.8'de de ZATEN etkindi ve
`DELETE FROM storage.buckets` yerelde de 42501 veriyordu. Guard `storage-api`
v1.69.0'ın kendi şema migration'larıyla geliyor, Postgres sürümüyle ilgisi yok.
Hosted'daki sıfırlama reddi 15↔17 farkından kaynaklanmadı; hosted'da sürprizle
karşılaşılınca sürüm farkına yorulmuş ve ölçülmeden bulgu sanılmıştı.

## Sonuçlar

### Olumlu

- Kayıtlı en yüksek riskli belirsizlik **ölçümle** kapandı: `storage.objects` politikaları
  hosted'da çalışacak ve bu bulgu Faz 3 (`meal-photos`) ile Faz 4 (`progress-photos`) için de
  geçerli — her fazda aynı soru yeniden sorulmayacak.
- Hiçbir migration değişmediği için yerel davranış birebir korundu; zincir sıfırdan yeniden
  kuruldu ve **25 migration temiz uygulandı, `test:rls` 104/104 yeşil (çıkış kodu 0)**.
- Temiz baseline sonrası hosted, yerelin **yeniden üretilebilir** bir kopyası olur: bundan sonra
  her değişiklik `db push` ile gider, elle müdahale gerekmez.
- `.env.local` düzeltmesi, sessiz "yanlışlıkla hosted'a yazma" hata modunu ortadan kaldırır.

### Olumsuz / kabul edilen bedeller

- `program_templates`'in 3 satırı ve hosted `daily_logs`/`messages` içindeki birkaç satır
  (1 + 2) sıfırlamayla gider. Dışa aktarım yapılır ama geri yükleme **planlanmıyor** —
  smoke-test artığı oldukları değerlendirildi.
  **GÜNCELLEME (2026-08-17):** "gider" ifadesi hedef ortamdan (hosted `public` şeması) kayboldu
  anlamındadır; `program_templates`'in 3 satırı zorunlu `data.sql` dump'ı içinde tam içerikle
  korunuyor, geri yükleme teknik olarak mümkün (yalnızca planlanmıyor). Bkz. "Uygulama sonucu".
- Sıfırlama geri alınamaz. Bu nedenle push'tan önce tam `db dump` alınması adım listesinde
  **zorunlu** tutulmuştur.
- Backfill (auth.users → profiles) ve koç rolünün elle atanması manuel adımlardır; script'e
  bağlanmadılar çünkü tek seferliktir.
- Ön uçuş kontrolü hosted `supautils` yapılandırmasını beklenenden dar bulursa, iş bir Postgres
  sürüm yükseltmesiyle **bloke olur** — bu turda kapatılamayan tek artık belirsizlik budur.
- Yerel `db reset` katalog verisini sıfırladı (`exercises` ve `food_database` 10'ar demo satıra
  döndü); `npm run db:import-catalog` yeniden çalıştırılmalıdır.

### Uygulama adımları — GERÇEKLEŞTİRİLDİ (2026-08-17)

Bu ADR **kullanıcı onayı ve geçerli bir `SUPABASE_ACCESS_TOKEN` ile uygulandı**. §4 ve §5
yıkıcıydı ve `active_planprogram` / `CLAUDE.md` §6 uyarınca ayrıca ve tek tek onay istedi —
onay alındı. Aşağıdaki liste artık planlanan değil, **yürütülen** adımların kaydıdır; gerçek
sonuçlar ve ölçülen parite için bkz. "Uygulama sonucu" bölümü.

1. **Ön uçuş (salt-okunur):** Dashboard SQL editöründe `supautils.policy_grants` ve
   `server_version` sorgulanır.
2. **Bağlan:** `supabase login` → `supabase link --project-ref nxftmxkpmuyeelrmwofv`.
3. **Yedek (zorunlu):** `supabase db dump --linked -f <repo-disi>/hosted-full.sql` ve
   `--data-only` ikinci bir dump; ayrıca `program_templates`'in 3 satırı JSON olarak dışa
   aktarılır.
4. **Sıfırla (YIKICI — ayrı onay):** `public` şeması düşürülür, hosted'a özgü storage
   politikaları temizlenir, `supabase_migrations.schema_migrations` boşaltılır. `auth` şemasına
   **dokunulmaz**.
5. **Uygula:** `supabase db push` — 25 migration sırayla gider.
6. **Backfill:** `auth.users` → `public.profiles` tek seferlik ekleme; koç hesabının rolü
   `coach` yapılır.
7. **Katalog:** `npm run db:import-catalog` hosted hedefine çalıştırılır.
8. **Doğrula:** `select count(*) from supabase_migrations.schema_migrations` = 25;
   `pg_policies` içinde `storage` şeması için 12 politika; üç bucket da `public = false`;
   `profiles` satır sayısı = 2.
9. **Env:** `.env.local` yerele çevrilir, hosted kimlikleri `.env.hosted.local`'a taşınır.

## Uygulama sonucu (2026-08-17)

**Yedek:** `C:\Users\Ayber\supabase-hosted-backup-20260817\` — `schema.sql` (745 satır) +
`data.sql` (222 KB, `auth.users`/`sessions`/`identities`/`refresh_tokens` dahil). Repo
DIŞINDA tutuldu, `.gitignore` meselesi yok.

**Sıfırlama öncesi ölçülen hosted durumu (yedekten doğrulandı, `docs/HOSTED-DATA-INVENTORY.md`
ile tutarlı):** 2 bucket (`avatars`, `form-checks-media`), ikisi de `public = true`; storage
nesnesi **0** (yani public bucket'lar fiilen hiçbir şey ifşa etmemişti — mahremiyet riski
yapılandırma riskiydi, gerçekleşmiş bir veri sızıntısı değil); `supabase_migrations.schema_migrations`
tablosu **hiç yoktu** (tek migration bile push edilmemiş); roller eski enum (`admin`/`student`);
legacy tablolar `workouts`/`program_templates` mevcuttu.

**Uygulanan adımlar:**

1. `drop schema public cascade` + yeniden oluşturma + grant'lar. `auth` şemasına
   DOKUNULMADI — 2 hesap, oturumlar ve kimlikler korundu.
2. `supabase db push --include-all` → **25 migration'ın TAMAMI temiz uygulandı**, tek bir
   `must be owner` hatası yok — §1'in risk analizi PG17'de de doğrulandı.
3. **`profiles` backfill'i** (§2'nin öngördüğü zorunlu ek adım). `handle_new_user()`
   `AFTER INSERT` çalıştığı için mevcut 2 `auth.users` hesabı profilsiz kalmıştı (iki hesap
   kırıktı). E-posta `auth.users`'tan doğrudan çekilerek insert edildi; roller YEDEKTEN
   doğrulanan eşlemeyle atandı (`c6a9fa90` = eski `admin` → `coach`, `5b665098` = eski
   `student` → `client`) — tahmin edilmedi, `data.sql`'den okundu.
4. **Bucket drift'i kapatıldı** (§5'teki `protect_delete()` bulgusu nedeniyle silme değil
   güncelleme yoluyla): `on conflict (id) do nothing` mevcut bucket'ları atladığı için
   `file_size_limit` NULL kalmıştı; `avatars`/`form-checks-media` `UPDATE` ile 5 MB + 6 MIME
   tipine çekildi.
5. Katalog hosted'a import edildi: **1318 egzersiz, 581 besin**. Yerelin 1328/591'inden
   10'ar az — bu **drift DEĞİL**: fark `seed.sql`'in yalnızca yerelde koşan demo satırlarından
   geliyor, açıklanabilir ve beklenen bir fark. (İleride tekrar karşılaşılırsa yanlışlıkla
   drift sanılmasın diye burada açıkça kayda geçirilmiştir.)

**Doğrulanmış parite:**

| Ölçüm            | Yerel | Hosted |
| ---------------- | ----- | ------ |
| Tablo            | 14    | 14     |
| `FORCE RLS`      | 14    | 14     |
| Public politika  | 57    | 57     |
| Storage politika | 12    | 12     |
| Fonksiyon        | 31    | 31     |

Ayrıca hosted'da: 25 migration `supabase_migrations.schema_migrations`'ta; üç bucket da
`public = false` (5 MB, 6 MIME); `profiles` = 2 satır; **`anon` rolünün `profiles` üzerinde
HİÇBİR yetkisi kalmadı** (§4'teki açık kapandı). Kalan iki koşulsuz politika incelendi ve
meşru bulundu: `exercises_select` + `food_database_select`, yalnızca `authenticated` için
referans katalog okuması (kullanıcı verisi değil).

**Bu ADR'nin "uygulama kullanıcı onayı ve `SUPABASE_ACCESS_TOKEN` gerektirir" notu artık
karşılandı.**

**Sapma — planlanan biçim ≠ uygulanan biçim (veri kaybı YOK, 2026-08-17 doğrulandı):** §2'nin
"kaybedilecekler, bilerek kabul ediliyor" bölümü `program_templates`'in 3 satırının
sıfırlamadan **önce** ayrı bir **JSON dosyası** olarak dışa aktarılmasını öngörüyordu. Uygulamada
bu adım farklı bir biçimde gerçekleşti: ayrı bir JSON dosyası üretilmedi, ama 3 satır zaten
zorunlu tutulan `supabase db dump --data-only` çıktısının (`data.sql`) içinde **tam içeriğiyle**
korundu — doğrulandı:

```sql
INSERT INTO "public"."program_templates" ("id","title","category","content","created_at") VALUES
  ('5d0a6009-...','12 Haftalık Classic Physique Prep','nutrition','Yarışma Hazırlığı: ...'),
  ('e004cb5a-...','Push/Pull/Legs - Hipertrofi Odaklı','workout','Hacim artışı ve kas izolasyonu ...'),
  ...
```

ADR'nin §2'deki gerçek amacı — bu 3 satırın sıfırlamayla geri dönüşsüz kaybolmaması — özünde
karşılandı; yalnızca öngörülen taşıma biçimi (ayrı JSON dosyası) değil, zaten zorunlu tutulan
tam `data.sql` dump'ının bir parçası olarak. **Veri kaybı yok.** İleride bu ADR'yi okuyan biri
ayrı bir JSON dosyası aramamalı — veri `data.sql`'in içinde.

**Yedeğin konumu ve içeriği:** `C:\Users\Ayber\supabase-hosted-backup-20260817\` —
`schema.sql` (745 satır) + `data.sql` (222 KB). `data.sql`, `auth.users`/`sessions`/
`identities`/`refresh_tokens` dahil `auth` şemasını VE `program_templates` dahil tüm `public`
şeması tablolarını içeriyor. Repo DIŞINDA — `.gitignore` meselesi yok, sürüm kontrolüne hiç
girmedi.

**Yeni borç — yedeğin kırılganlığı:** Bu yedek **tek kopya**, yalnızca kullanıcının yerel
diskinde, sürüm kontrolünde değil ve düzenli bir yedekleme stratejisinin parçası değil — tek
seferlik, elle alınmış bir dump. Bugünkü rolünü (sıfırlama öncesi geri dönüşsüzlüğe karşı
güvence) karşıladı, ama hosted'da gerçek danışan verisi oluşmaya başladığında bu tek seferlik
dump **düzenli bir yedekleme stratejisinin yerini tutmaz** — disk arızası, yanlışlıkla silme
veya makine değişikliği bu tek kopyayı kaybettirebilir. Düzenli (otomatik, birden fazla
konuma giden) bir hosted yedekleme stratejisi ayrı bir iş kalemi olarak kaydedilmelidir; bkz.
`docs/PROGRESS.md` §5.

### Etkilenen dosyalar

- `docs/adr/0020-hosted-senkronizasyon-stratejisi.md` (bu dosya)
- `docs/adr/README.md` (indeks satırı)
- `supabase/migrations/**` — **değiştirilmedi** (kararın kendisi budur)
- `.env.local`, `.env.hosted.local` (uygulama sırasında)
- `src/env.server.ts` (önerilen koruma — ayrı iş kalemi)
