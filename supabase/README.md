# Supabase — Veritabanı Kılavuzu

Bu dizin uygulamanın tüm veritabanı şemasını, güvenlik politikalarını ve yerel
geliştirme verisini içerir.

```
supabase/
├── config.toml                 # Supabase CLI yerel yığın ayarları
├── migrations/
│   ├── 20260816090000_initial_schema.sql         # enum'lar, tablolar, indeksler
│   ├── 20260816090100_functions_and_triggers.sql # is_coach, handle_new_user, increment_streak
│   ├── 20260816090200_rls_policies.sql           # RLS + GRANT/REVOKE
│   ├── 20260816090300_storage.sql                # bucket'lar + storage.objects politikaları
│   ├── 20260816100000_fix_rls_visibility.sql     # koç profili görünürlüğü + danışan→koç bildirimi
│   ├── 20260817090000_rename_roles.sql           # rol yeniden adlandırma: admin→coach, student→client
│   ├── 20260817100000_private_storage.sql        # bucket'lar private + *_url → *_path + imzalı okuma
│   ├── 20260817110000_workout_plan_tables.sql    # normalize antrenman planı tabloları + dönüşüm + RPC
│   ├── 20260817130000_nutrition_plan_tables.sql  # normalize beslenme planı tabloları + dönüşüm + RPC
│   ├── 20260817140000_messages_conversation_key.sql # messages.client_id / read_at / kind + trigger
│   ├── 20260817150000_form_check_review.sql      # form_checks inceleme durumu + sütun koruması
│   ├── 20260817160000_program_approval_guard.sql # onay kapısı: CHECK + trigger + DELETE daraltma (AC-01/AC-07)
│   ├── 20260817160100_signup_role_hardening.sql  # handle_new_user rolü sabit 'client' (AC-02)
│   ├── 20260817160200_column_guards.sql          # messages/notifications/profiles sütun korumaları (AC-04/05/08/09/10)
│   ├── 20260817170000_force_rls_and_grants.sql   # TRUNCATE/REFERENCES/TRIGGER sökümü + FORCE RLS (AC-03/AC-06)
│   ├── 20260817180000_program_submission_rpc.sql # submit_program_for_approval RPC (AC-05 kuplaj borcu)
│   ├── 20260817180100_avatar_visibility.sql      # koç avatarı danışana açık (ad ayrıştırmasıyla)
│   ├── 20260817180200_sequence_grants.sql        # sequence setval kapatıldı, nextval korundu
│   ├── 20260817190000_workout_log_sets.sql       # workout_logs: set_number / plan_exercise_id / completed_at
│   ├── 20260817190100_nutrition_targets_and_logs.sql # nutrition_plans.target_* + nutrition_logs tablosu
│   ├── 20260817190200_message_attachments.sql    # messages.attachment_path + message-attachments bucket'ı
│   ├── 20260817190300_message_read_state.sql     # read_at KANONİK / is_read TÜREV (trigger + CHECK)
│   ├── 20260817190400_realtime_publication.sql   # realtime yayını insert+update (delete/truncate kapalı)
│   ├── 20260817200000_system_message_rpc.sql     # post_system_message RPC (tek kind='system' yazma kanalı)
│   └── 20260817210000_workout_plan_versioning.sql # plan yayınlama = yeni version, eski is_active=false
├── tests/
│   ├── rls.test.sql            # 104 RLS senaryosu      (npm run test:rls)
│   └── transform.test.sql      # 26 dönüşüm senaryosu   (npm run test:transform)
├── seed.sql                    # SADECE YEREL demo verisi
└── README.md
```

---

## 1. Rol Modeli

`public.user_role` enum'u doğrudan `coach` ve `client` değerlerini alır
(`20260817090000_rename_roles.sql` ile önceki `admin`/`student` etiketlerinden
yeniden adlandırıldı — `ALTER TYPE ... RENAME VALUE` kullanıldığı için mevcut
satırlar ve RLS ifadeleri otomatik olarak yeni etiketi gösterir, veri kaybı yoktur).

| Enum değeri | Türkçe karşılık | Yetki |
|---|---|---|
| `coach`  | **Koç**     | Tüm danışanların verisini görür ve yönetir, program onaylar, duyuru gönderir |
| `client` | **Danışan** | Yalnızca kendi verisini görür ve yazar |

Rol kontrolü `public.is_coach(uid uuid default auth.uid())` fonksiyonuyla yapılır
(eski adı `is_admin`; yeniden adlandırma fonksiyonun OID'ini koruduğu için RLS
politikaları bozulmadı). Bu fonksiyon **`SECURITY DEFINER`**'dır: `profiles`
üzerindeki RLS politikaları onu çağırdığı için, aksi hâlde Postgres
`infinite recursion detected in policy for relation "profiles"` hatası verirdi.

---

## 2. Migration'ları Uygulama

### Yerel (Docker) yığın

```bash
supabase start                 # yerel Postgres + API + Studio ayağa kalkar
supabase db reset              # tüm migration'ları sıfırdan uygular + seed.sql çalıştırır
```

> `supabase db reset` veritabanını **tamamen siler**. Yalnızca yerelde kullanın.

### Uzak proje

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push               # yalnızca uygulanmamış migration'ları gönderir
```

`supabase db push` **seed.sql'i çalıştırmaz** — bu kasıtlıdır (bkz. bölüm 6).

### Yeni migration ekleme

```bash
supabase migration new <ad>            # boş dosya oluşturur
supabase db diff -f <ad>               # Studio'da yapılan değişiklikleri dosyaya döker
```

---

## 3. TypeScript Tip Üretimi

```bash
# Uzak projeden
supabase gen types typescript --project-id <project-id> --schema public > src/types/database.ts

# Yerel yığından
supabase gen types typescript --local --schema public > src/types/database.ts
```

> Not: Proje şu an düz JavaScript (`.js`) kullanıyor. Tip dosyası üretmek zararsızdır;
> TypeScript'e geçildiğinde `src/types/database.ts` hazır olur.

---

## 4. RLS Özeti

Tüm tablolarda RLS **açıktır** ve **`FORCE ROW LEVEL SECURITY`** ile tablo sahibini de
kapsar (bkz. 4f). Politikalar yalnızca `authenticated` rolüne verilmiştir;
`anon` (giriş yapmamış ziyaretçi) rolünden `public` şemadaki tüm tablo/sequence/fonksiyon
yetkileri **REVOKE** edilmiştir. `authenticated` rolünde tablo düzeyinde yalnızca
`SELECT/INSERT/UPDATE/DELETE` vardır — `TRUNCATE`, `REFERENCES` ve `TRIGGER` sökülmüştür
(bkz. 4f; `TRUNCATE` RLS'e tabi olmadığı için bir baypas yoluydu).

Kısaltmalar: **S** = satır sahibi (`client_id`/`id` = `auth.uid()`), **K** = koç (`is_coach()`)

| Tablo | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | S veya K **veya satırın rolü `coach`** (koç profili herkese görünür) | Sadece K (normalde trigger yapar) | S (**rol sütunu değiştirilemez**) veya K — **`email` / `current_streak` / `last_checkin_at` hiçbir oturumdan yazılamaz** (trigger, bkz. 4e) | Sadece K |
| `notifications` | S veya K | K **veya** kendi adına (`client_id = auth.uid()`) **veya alıcı koçsa** (`is_coach_profile(client_id)`) — **danışan → koç yolunda içerik sabit şablona bağlıdır** (trigger, bkz. 4e) | S veya K — **ama son kullanıcı yalnızca `is_read`** (trigger, bkz. 4e) | Sadece K |
| `form_checks` | S veya K | Sadece kendi adına | S veya K — **ama inceleme sütunları (`status`, `coach_feedback`, `reviewed_*`) yalnızca K** (trigger, bkz. 4d) | S veya K |
| `daily_logs` | S veya K | Sadece kendi adına | S veya K | S veya K |
| `workout_logs` | S veya K | Sadece kendi adına | S veya K | S veya K |
| `program_approvals` | S veya K | Sadece kendi adına — **her zaman `status='pending'`, `reviewed_*` boş** (trigger, bkz. 4e) | **Sadece K** (onay/ret; `reviewed_by`/`reviewed_at` **sunucudan** dolar) | K **veya** S ama **yalnızca `status='pending'` satırında** (bkz. 4e) |
| `messages` | gönderen **veya** alıcı veya K | `sender_id = auth.uid()` + `client_id` trigger doğrulaması — **`kind='system'` istemciden üretilemez** (bkz. 4e); `attachment_path` **satırın kendi konuşmasına** ait olmak zorunda (CHECK, bkz. 4h) | **Sadece alıcı** — **ve yalnızca `read_at` / `is_read`**; `attachment_path` dahil diğer her sütun dokunulmaz (trigger, bkz. 4e/4h) | gönderen veya K |
| `nutrition_logs` | S veya K | **Sadece kendi adına** | **Sadece S** — koç danışanın öğün loguna YAZAMAZ (§3.2, bkz. 4h) | **Sadece S** |
| `exercises` | Tüm `authenticated` | Sadece K | Sadece K | Sadece K |
| `food_database` | Tüm `authenticated` | Sadece K | Sadece K | Sadece K |
| `workout_plans` | S veya K | K **veya** kendi planı | K veya kendi planı | K veya kendi planı |
| `workout_plan_exercises` | plan üzerinden S veya K (`EXISTS`) | plan üzerinden K veya kendi planı | plan üzerinden K veya kendi planı | plan üzerinden K veya kendi planı |
| `nutrition_plans` | S veya K | K **veya** kendi planı | K veya kendi planı | K veya kendi planı |
| `nutrition_plan_meals` | plan üzerinden S veya K (`EXISTS`) | plan üzerinden K veya kendi planı | plan üzerinden K veya kendi planı | plan üzerinden K veya kendi planı |

### Koç görünürlüğü (`20260816100000_fix_rls_visibility.sql`)

İki politika bu migration'da genişletildi:

* **`profiles_select`** artık `id = auth.uid() OR is_coach() OR role = 'coach'` .
  Kimliği doğrulanmış herkes **koç profillerini** görebilir — `useCoachId()` bu sayede
  koçun id'sini bulabiliyor ve mesajlaşma çalışıyor. Danışanlar **birbirini görmez**.
  `role` ifadesi satırın kendi kolonudur (alt sorgu değil), bu yüzden özyineleme oluşmaz.
  > **Görünürlük etkisi (bilinçli karar):** Koçun profil satırının tamamı — e-posta, ad,
  > avatar ve `profiles`'taki diğer kolonlar — tüm danışanlara açılır. Kabul edilebilir
  > görülmüştür (koç zaten danışanın muhatabıdır). `profiles`'a ileride koça ait hassas
  > bir kolon eklenirse bu politika kolon bazlı bir görünüme daraltılmalıdır.

* **`notifications_insert`** artık `is_coach() OR client_id = auth.uid() OR is_coach_profile(client_id)`.
  Danışan, alıcısı **koç** olan bildirim oluşturabilir (program onaya sunulduğunda).
  Danışandan danışana bildirim hâlâ reddedilir (spam koruması).
  > `notifications_select` **değiştirilmedi**: danışan koça yazdığı bildirimi geri okuyamaz.
  > Bu yüzden bu insert'e `.select()` / `RETURNING` zincirlenmemelidir — aksi hâlde satır
  > yazılsa bile sorgu `new row violates row-level security policy` ile döner.

### Antrenman planı tablolarında bilinçli sapma (`20260817110000_workout_plan_tables.sql`)

`active_planprogram.md` §3.2 "plan tablolarına **yalnızca koç** yazar" diyor.
**Bu uygulanmadı** — danışan kendi planına da yazabilir.

* **Gerekçe:** mevcut ürün davranışında danışan `WorkoutTab` üzerinden kendi programını
  düzenleyip onaya sunabiliyor (`src/hooks/usePlans.ts` → `useSaveWorkoutPlan`,
  `src/hooks/useProgramApprovals.ts`) ve bu akış `profiles` UPDATE'i ile çalışıyor.
  Yazmayı koça kısıtlamak, Faz 1b Adım 2'deki kod cutover'ında bu akışı **sessizce**
  kırardı.
* **Kapsam sınırı:** danışan **yalnızca kendi** `client_id`'sine ait plana yazabilir.
  Başka danışanın planına insert/update/delete **reddedilir**
  (`rls.test.sql` senaryo 23, 26, 27).
* **Geri alma koşulu:** Faz 2'de onay akışı ayrı bir "önerilen plan" yüzeyine taşınırsa
  politika §3.2'ye daraltılmalıdır.

### Beslenme planı tablolarında bilinçli sapma (`20260817130000_nutrition_plan_tables.sql`)

Aynı sapma beslenme tarafında da geçerlidir — danışan kendi beslenme planına yazabilir.
Tam gerekçe ve sonuçlar: **`docs/adr/0014-danisanin-kendi-beslenme-planini-kaydedebilmesi.md`**.

* **Gerekçe:** "Beslenme Tablosunu Kaydet" butonu `src/components/tabs/NutritionTab.tsx`'te
  role bakılmaksızın render ediliyor ve `handleSaveProgram` danışan için
  `clientIds = [currentUserId]` kuruyor. Antrenmandaki onay akışının (`program_approvals`)
  beslenme karşılığı **yok**; davranış `tests/e2e/plans.spec.ts` ile kilitli.
* **Kapsam sınırı:** danışan **yalnızca kendi** planına yazabilir
  (`rls.test.sql` senaryo 30, 31, 34, 35).
* **Kabul edilen bedel:** danışan koçun verdiği beslenme planını değiştirebilir ve
  **koç için denetim izi yoktur** (satırı kimin yazdığı tutulmuyor, yalnızca `updated_at` var).
* **Gözden geçirme koşulu:** beslenmeye de bir onay akışı gelirse ADR 0014 gözden geçirilip
  politika §3.2'ye daraltılmalıdır.

### Yetki yükseltme koruması

`profiles` UPDATE politikasının `WITH CHECK` ifadesi
`role = public.profile_role(auth.uid())` kontrolünü yapar — yani bir danışan kendi
satırını güncelleyebilir ama **rolünü `coach`'a çeviremez**. Yalnızca koç rol değiştirebilir.
(`public.profile_role()` de özyinelemeyi önlemek için `SECURITY DEFINER`'dır.)

### Storage politikaları

Her iki bucket da **PRIVATE**'tır (`20260817100000_private_storage.sql`).

| Bucket | Public | Okuma (SELECT) | Yazma / Silme |
|---|---|---|---|
| `avatars` | **hayır** | sahibi (`<auth.uid()>-...`), **koçun avatarı (herkese)**, veya koç; `anon` **hiç** | dosya adı `<auth.uid()>-...` ile başlamalı, veya koç |
| `form-checks-media` | **hayır** | sahibi (`poses/<auth.uid()>-...`) veya koç; `anon` **hiç** | yol `poses/<auth.uid()>-...` olmalı, veya koç |
| `message-attachments` | **hayır** | **sohbetin iki tarafı**: klasör `<auth.uid()>/…` (danışan) veya koç; `anon` **hiç** (bkz. 4h) | klasör kendi konuşman (koç: her konuşma) **ve** dosya adı `<auth.uid()>-…` ile başlamalı; silme: yükleyen veya koç |

> **Neden private?** Public bucket'ta `storage.objects` SELECT politikası okuma yolunu
> hiç etkilemez: `/storage/v1/object/public/<bucket>/<yol>` adresi kimlik doğrulamasız
> servis edilir. Danışan vücut fotoğrafları için bu kabul edilemez. Private bucket'ta
> aynı adres **400 (`NoSuchBucket`)** döner.

**Okuma nasıl çalışır (imzalı adres):**

1. Kolonlar tam URL değil **yol** saklar: `form_checks.front_pose_path`,
   `form_checks.back_pose_path`, `profiles.avatar_path` (eskiden `*_url`).
2. İstemci `src/lib/storage.ts` üzerinden `createSignedUrl` / `createSignedUrls`
   çağırır; Storage API imzayı üretmeden **önce** RLS SELECT yetkisini doğrular.
3. Üretilen adres `SIGNED_URL_TTL_SECONDS = 3600` (1 saat) sonra geçersiz olur.
   İmzalı adres içeren TanStack Query sorguları `staleTime`'ı TTL'in yarısı
   (30 dk) tutar ki önbellekteki adres süresi dolmadan tazelensin.
4. İmza üretilemezse (dosya yok / yetki yok) uygulama `null` döner ve UI kırık
   görsel yerine placeholder gösterir — `supabase/seed.sql` bu yolu bilinçli
   olarak tetikler (seed'deki poz yolları storage'da fiilen yoktur).

> **Neden `storage.foldername(name)[1]` değil?**
> Uygulama kodu dosyaları `${user.id}-${Math.random()}.${ext}` biçiminde
> (avatars için **kök dizine**, form-check için `poses/` altına) yazıyor. Yaygın
> "ilk klasör = kullanıcı id" kalıbı bu projede çalışmaz; sahiplik **dosya adı ön ekinden**
> doğrulanır. Yükleme yolunu değiştirirseniz `20260816090300_storage.sql` de güncellenmelidir.

### RPC

| Fonksiyon | İmza | Not |
|---|---|---|
| `public.is_coach` | `(uid uuid default auth.uid()) -> boolean` | `SECURITY DEFINER`, `STABLE`. Eski adı `is_admin` (`20260817090000_rename_roles.sql` ile yeniden adlandırıldı, aynı OID) |
| `public.profile_role` | `(uid uuid default auth.uid()) -> user_role` | `SECURITY DEFINER`, `STABLE` |
| `public.is_coach_profile` | `(target uuid) -> boolean` | `SECURITY DEFINER`, `STABLE`. Faz 1.7'den beri **yalnız `notifications_guard_content()` trigger'ında** kullanılır (politikadan çıkarıldı); `profiles` politikalarında **çağrılmamalıdır** (özyineleme) |
| `public.submit_program_for_approval` | `(p_client_id uuid, p_workout_data jsonb) -> program_approvals` | `SECURITY DEFINER`. Onay satırını **ve** koça giden bildirimi atomik yazar; koça giden bildirim metninin **tek sahibi** bu gövdedir. Sahiplik gövdede elle doğrulanır (bkz. §4g) |
| `public.avatar_object_owner` | `(p_name text) -> uuid` | `IMMUTABLE`. `avatars` nesne adından sahip uid'i çıkarır; desene uymayan adda **NULL** (bkz. §4g) |
| `public.increment_streak` | `(user_id uuid) -> integer` | **İmza değiştirilemez** — kod `rpc('increment_streak', { user_id })` çağırıyor |
| `public.explode_plan_day` | `(p_plan_id uuid, p_day text, p_text text) -> integer` | `SECURITY INVOKER`. **TEK plan ayrıştırıcısı** — hem veri dönüşümü hem `save_workout_plan` bunu kullanır |
| `public.save_workout_plan` | `(p_client_ids uuid[], p_plan jsonb) -> integer` | `SECURITY INVOKER` (RLS uygulanır). `p_plan` = `{"Pazartesi": "metin", ...}`. Etkilenen danışan sayısını döner. **Faz 2'den beri versiyonlu yayınlar** (bkz. §4j) |
| `public.workout_plan_has_history` | `(p_plan_id uuid) -> boolean` | `SECURITY DEFINER`, `STABLE`. "Bu planın satırlarına bağlı bir `workout_logs` satırı var mı?" — `save_workout_plan()`'ın yayınla/taslak dallanma koşulu. DEFINER olmak **zorunda**: INVOKER'da RLS körlüğü **fail-open** olurdu (§4j) |
| `public.migrate_workout_plans_from_profiles` | `() -> table(profiles_converted int, exercises_inserted int)` | `SECURITY DEFINER`, yalnız `service_role`. Idempotent veri dönüşümü; `transform.test.sql` bunu çağırır |
| `public.explode_nutrition_day` | `(p_plan_id uuid, p_day text, p_entry jsonb) -> integer` | `SECURITY INVOKER`. **TEK beslenme günü yazıcısı** — hem dönüşüm hem `save_nutrition_plan` bunu kullanır. Ayrıştırma YAPMAZ |
| `public.save_nutrition_plan` | `(p_client_ids uuid[], p_plan jsonb) -> integer` | `SECURITY INVOKER` (RLS uygulanır). `p_plan` = `{"Pazartesi": {"items": "metin", "total": 1850}, ...}`. Etkilenen danışan sayısını döner |
| `public.migrate_nutrition_plans_from_profiles` | `() -> table(profiles_converted int, meals_inserted int)` | `SECURITY DEFINER`, yalnız `service_role`. Idempotent veri dönüşümü; `transform.test.sql` bunu çağırır |
| `public.message_attachment_conversation` | `(p_name text) -> uuid` | `IMMUTABLE`. `message-attachments` nesne adından konuşma anahtarını (client_id) çıkarır; desene uymazsa **NULL** (fail-closed, bkz. §4h) |
| `public.message_attachment_uploader` | `(p_name text) -> uuid` | `IMMUTABLE`. Aynı addan yükleyenin uid'ini çıkarır; desene uymazsa **NULL** (fail-closed, bkz. §4h) |
| `public.post_system_message` | `(p_client_id uuid, p_event_type text, p_ref_id uuid default null) -> messages` | `SECURITY DEFINER`. **Tek** `kind='system'` yazma kanalı; yalnız koç çağırabilir. Serbest metin **almaz** — mesaj metni `p_event_type`'a göre gövdede şablondan üretilir (bkz. §4i) |

`increment_streak` mantığı: `last_checkin_at` bugünse seri değişmez, dünse +1,
daha eski/`NULL` ise 1'e sıfırlanır; her durumda `last_checkin_at = now()`.
Yalnızca `auth.uid() = user_id` veya koç çalıştırabilir, aksi hâlde `42501` hatası.

> **Politika adları:** `*_admin` ile biten tüm RLS politika adları da aynı migration'da
> `*_coach` olarak yeniden adlandırıldı (ör. `profiles_insert_admin` → `profiles_insert_coach`,
> `exercises_update_admin` → `exercises_update_coach`). Bu yalnızca kozmetiktir — politika
> ifadeleri (yukarıdaki tablo) değişmedi.

---

## 4a. Antrenman Planı Tabloları ve Veri Dönüşümü

`20260817110000_workout_plan_tables.sql` (Faz 1b / Adım 1). `profiles.workout_plan`
JSON string kolonu **silinmedi**; `DEPRECATED` yorumuyla yan yana yaşıyor ve Faz 2
kapısında DROP edilecek.

| Tablo | Kolonlar |
|---|---|
| `workout_plans` | `id, client_id, version (>0), is_active, notes, created_at, updated_at` |
| `workout_plan_exercises` | `id, plan_id, day, position (>=0), raw_line, name, target_sets, target_reps, target_weight_kg, video_url` |

* **Aktif plan tekilliği:** `workout_plans_one_active_idx` — `unique (client_id) where is_active`.
  Danışan başına en fazla **bir** aktif plan; `is_active = false` arşiv satırları sınırsızdır.
* **Gün kısıtı:** `day` yalnızca 7 Türkçe gün adını kabul eder
  (`Pazartesi … Pazar`); `(plan_id, day, position)` tekildir.
* **`updated_at`:** mevcut `public.set_updated_at()` trigger'ı ile tazelenir.

### `raw_line` kanoniktir

Her satırın **orijinal metni** `raw_line`'da kayıpsız saklanır. `name` / `target_*`
kolonları **türevdir** ve NULL olabilir — ayrıştırma best-effort'tur
(`^\s*\d+\.\s*(.+?)\s*-\s*(\d+)\s*[xX]\s*(\d+)`). Desen tutmazsa (örn. `Dinlenme`)
satır **yine de eklenir**, yalnızca türev kolonlar NULL kalır.

Bir günün metni şu ifadeyle **birebir** geri üretilir:

```sql
select string_agg(raw_line, E'\n' order by position)
  from public.workout_plan_exercises
 where plan_id = :plan and day = :day;
```

> **Tek bilinçli kayıp:** yalnızca boşluktan ibaret satırlar atılır
> (`explode_plan_day` sözleşmesi). `transform.test.sql` senaryo 2 bu round-trip'i
> birebir, senaryo 2b ise boş satır sınırını test eder.

### Tek ayrıştırıcı kuralı

`public.explode_plan_day()` **tek** ayrıştırıcıdır: hem veri dönüşümü
(`migrate_workout_plans_from_profiles`) hem yazma RPC'si (`save_workout_plan`) onu
çağırır. İkinci bir implementasyon yazılmamalıdır — `transform.test.sql` senaryo 9
iki yolun **birebir aynı** satırları ürettiğini doğrular.

### `save_workout_plan()` semantiği

> **Bu bölüm Faz 2'de DEĞİŞTİ.** Faz 1b'de her kaydetme aktif planın satırlarını
> silip yeniden yazıyordu ve **yeni versiyon üretmiyordu**. Güncel (versiyonlu)
> davranış ve gerekçesi için bkz. **§4j** —
> `20260817210000_workout_plan_versioning.sql`. Özet: aktif plana bağlı bir
> antrenman logu **varsa** kaydetme bir **yayınlamadır** (eski plan
> `is_active=false`, satırları korunur, `version+1` ile yeni aktif plan);
> **yoksa** plan hâlâ taslaktır ve satırları yerinde yeniden yazılır.

* `SECURITY INVOKER`: RLS ihlalinde hata **yükselir** (yakalanmaz) → çağrı atomiktir.
* Geçersiz gün anahtarı **hata verir** (yazma yolunda sessiz veri kaybı kabul edilmez);
  dönüşüm yolunda ise atlanır (eski/bozuk veriyi kurtarabilmek için).

### Veri dönüşümü neden ayrı test ister

`supabase db reset` akışında migration'lar **seed'den önce** koşar, yani dönüşüm her
zaman **boş** `profiles` tablosunda çalışır ve no-op'tur. "db reset temiz geçti"
ifadesi dönüşüm mantığı hakkında hiçbir şey kanıtlamaz. Bu yüzden mantık
`public.migrate_workout_plans_from_profiles()` fonksiyonuna çıkarıldı ve
`supabase/tests/transform.test.sql` içinden çağrılıyor.

Dönüşüm kuralları: NULL / boş / geçersiz JSON / JSON-nesnesi-olmayan içerik **atlanır**
(hata verilmez); danışanın zaten aktif planı varsa **atlanır** (idempotency).

### Testler

```bash
npm run test:rls         # 104 senaryo (20–27 bu tablolara ait)
npm run test:transform   # 26 senaryo (1–10 bu tablolara ait: dönüşüm + round-trip + idempotency)
```

Her iki script de `BEGIN … ROLLBACK` kullanır, kalıcı veri bırakmaz ve başarısızlıkta
`raise exception` + `ON_ERROR_STOP=1` ile psql'i **sıfırdan farklı** çıkış koduyla
durdurur.

### Geri alma

Migration dosyasının sonunda yorum bloğu hâlinde çalıştırılabilir bir `-- DOWN`
script'i vardır (fonksiyonlar → politikalar → trigger → tablolar → eski kolon yorumu).
Veri kaybı yaratmaz: kaynak veri `profiles.workout_plan` kolonunda durmaya devam eder.

---

## 4b. Beslenme Planı Tabloları ve Veri Dönüşümü

`20260817130000_nutrition_plan_tables.sql` (Faz 1b / Adım 3a). `profiles.nutrition_plan`
JSON string kolonu **silinmedi**; `DEPRECATED` yorumuyla yan yana yaşıyor ve Faz 2
kapısında DROP edilecek. Kod tarafının bu tablolara geçirilmesi (cutover) **Adım 3b**'dedir.

| Tablo | Kolonlar |
|---|---|
| `nutrition_plans` | `id, client_id, version (>0), is_active, notes, created_at, updated_at` |
| `nutrition_plan_meals` | `id, plan_id, day, position (>=0, varsayılan 0), description, kcal (>=0 veya NULL)` |

* **Aktif plan tekilliği:** `nutrition_plans_one_active_idx` — `unique (client_id) where is_active`.
* **Gün kısıtı:** `day` yalnızca 7 Türkçe gün adını kabul eder; `(plan_id, day, position)` tekildir.
* **`updated_at`:** mevcut `public.set_updated_at()` trigger'ı ile tazelenir.

### `description` kanoniktir — yapısal ayrıştırma YOK

Antrenman tarafındaki `raw_line` ile aynı rolü `description` üstlenir, ama burada
**satır/öğün bazlı ayrıştırma yapılmaz**. Sebep: `items` alanı sahada **iki lehçede**
yazılmış serbest metindir —

| Lehçe | Örnek | Nerede |
|---|---|---|
| A | `Yulaf:80, Tavuk Göğsü:200` | kod tabanının varsaydığı biçim (`sumCalories`) |
| B | `Yulaf Ezmesi 80g\nTavuk Göğsü 200g` | `supabase/seed.sql`'deki gerçek veri |

Hangi lehçe olduğu güvenilir biçimde bilinemediği (ve `80g`'nin miktar mı kalori mi olduğu
belirsiz olduğu) için besin seviyesine inmek **uydurma veri** üretirdi. Bu yüzden Faz 1b'de
gün başına **tek satır** (`position = 0`) saklanır: ham metin + kcal.

> `position` kolonu bugün her zaman `0`'dır. İleride öğün granülerliği (kahvaltı / ara öğün /
> akşam) geldiğinde **şema değişmeden** gün içinde birden çok satır tutulabilsin diye
> şimdiden konulmuştur.

### Round-trip sözleşmesi

Bir günün orijinal JSON değeri şu ifadeyle **birebir** geri üretilir:

```sql
select jsonb_object_agg(day, jsonb_build_object('items', description, 'total', kcal))
  from public.nutrition_plan_meals
 where plan_id = :plan;
```

`transform.test.sql` senaryo 12 bunu **her iki lehçe için** doğrular (baştaki/sondaki boşluk
dahil; `btrim` uygulanmaz).

Bilinen sınırlar (bilinçli): `total` sayı değilse / negatifse / **tam sayı değilse** `kcal`
`NULL`'a düşer — satır yine eklenir, `description` kayıpsızdır (senaryo 13). Tam sayı şartı
kasıtlıdır: `1850.5` gibi bir değeri integer'a yuvarlamak sessiz veri kaybı olurdu.
Gün nesnesinde `items`/`total` dışında ek anahtar varsa o anahtar saklanmaz.

### Tek yazıcı kuralı

`public.explode_nutrition_day()` **tek** yazıcıdır: hem veri dönüşümü
(`migrate_nutrition_plans_from_profiles`) hem yazma RPC'si (`save_nutrition_plan`) onu çağırır.
`transform.test.sql` senaryo 18 iki yolun `EXCEPT ALL` ile **birebir aynı** satırları
ürettiğini doğrular.

### `save_nutrition_plan()` semantiği

Aktif plan yoksa `version = 1` ile oluşturulur (varsa o kullanılır), planın **tüm** öğün
satırları silinip yeniden yazılır, **yeni versiyon üretilmez**, `SECURITY INVOKER` olduğu
için RLS ihlali hatayı yükseltir (çağrı atomiktir). Geçersiz gün anahtarı **hata verir** ve
doğrulama hiçbir satır yazılmadan **önce, toptan** yapılır; dönüşüm yolunda ise bilinmeyen
gün atlanır.

> **Antrenman tarafı Faz 2'de versiyonlu yayınlamaya geçti; beslenme tarafı BİLİNÇLİ
> OLARAK GEÇMEDİ** (`20260817210000_workout_plan_versioning.sql` KARAR 2, bkz. §4j).
> Kısa gerekçe: `nutrition_plan_meals` satırlarına işaret eden **hiçbir FK yoktur** —
> `nutrition_logs` plana bağlı değildir, serbest metin `description` tutar. Antrenman
> tarafındaki veri kaybının (`workout_logs.plan_exercise_id` `ON DELETE SET NULL`)
> beslenme karşılığı **yoktur**, dolayısıyla versiyonlamanın koruyacağı bir geçmiş de
> yoktur; aynı kural buraya kopyalansaydı hiçbir zaman tetiklenmeyen ölü kod olurdu.
>
> **Gözden geçirme koşulu:** `nutrition_plan_meals`'e işaret eden bir FK eklendiği gün
> (ör. `nutrition_logs.plan_meal_id`) bu fonksiyon da §4j'deki copy-on-write desenine
> çevrilmelidir. Koşul `nutrition_plans` tablo yorumuna da yazılmıştır.

### Testler

```bash
npm run test:rls         # 104 senaryo (28–35 bu tablolara ait)
npm run test:transform   # 26 senaryo (11–19 bu tablolara ait)
```

### Geri alma

Migration dosyasının sonunda yorum bloğu hâlinde çalıştırılabilir bir `-- DOWN`
script'i vardır. Veri kaybı yaratmaz: kaynak veri `profiles.nutrition_plan` kolonunda
durmaya devam eder.

---

## 4c. Mesajlaşma: Konuşma Anahtarı, Okundu Bilgisi ve Realtime Filtresi

`20260817140000_messages_conversation_key.sql` `public.messages` tablosuna üç kolon ekler:

| Kolon | Tip | Anlamı |
|---|---|---|
| `client_id` | `uuid NOT NULL` → `profiles(id)` | **Konuşma anahtarı**: sohbetin danışan tarafı |
| `read_at`   | `timestamptz` | Alıcının okuduğu an. `NULL` = okunmadı |
| `kind`      | `public.message_kind` (`user` \| `system`) | Mesaj türü; Faz 1b'de hep `user` |

### Neden `conversations` tablosu YOK

`useMessages` eskiden **tüm** `messages` INSERT'lerini dinleyip konuşmaya ait olup
olmadığını **istemcide** eliyordu. Sebep teknikti: `postgres_changes` filtresi
`sender_id=eq.X OR receiver_id=eq.X` gibi bir **OR ifadesini desteklemez**. Sonuç: her
mesaj trafiği her istemciye ulaşıyordu (RLS satırın içeriğini gizler, ama **olayın kendisi
yine de gider**) — ölçeklenmez.

Tek koçlu modelde bir sohbet `(koç, danışan)` çiftidir, yani **danışan tarafı konuşmayı
tek başına tanımlar**. Bu yüzden ayrı bir `conversations` tablosu (ve onun senkronizasyon
trigger'ları, ek RLS yüzeyi, `last_message_at` bakımı) yerine tek bir `client_id` kolonu
eklendi. Abonelik artık sunucuda filtrelenir:

```ts
// src/hooks/useMessages.ts
{ event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` }
```

Aynı kolon okunmamış sayacını da (`client_id` + `read_at is null`) tek indeksle
karşılar: `messages_client_recent_idx (client_id, created_at desc)`.

### `client_id`'yi kim doldurur — `messages_apply_conversation_key` trigger'ı

İstemci `client_id`'yi kendi gönderir, ama **doğruluğunu sunucu belirler**:

* `client_id` **NULL** gelirse gönderen/alıcı çiftinden **türetilir**.
* `client_id` **dolu** gelirse türetilenle karşılaştırılır; **eşleşmezse hata** (`22023`).
* Çiftin tam olarak biri `role = 'client'` değilse (koç↔koç, danışan↔danışan) **hata**.

Bu olmasaydı `messages_insert` politikası (`sender_id = auth.uid()`) yalnızca kimlik
taklidini engellerdi: danışan kendi adına yazıp `client_id`'yi **başka bir danışanınki**
yaparak o kişinin realtime kanalına olay düşürebilirdi.

Trigger `BEFORE INSERT OR UPDATE OF sender_id, receiver_id, client_id` olarak tanımlıdır —
`read_at` güncellemeleri (toplu "okundu işaretle") trigger'ı **hiç tetiklemez**.

### `read_at` backfill'i bir YAKLAŞIKTIR

Eski şema okunma **anını** hiç saklamıyordu; elde yalnızca `is_read` bayrağı vardı.
`public.backfill_messages_conversation_key()` bu yüzden `is_read = true` satırlara
`read_at = created_at` yazar. Alternatif (NULL bırakmak) **tarihsel olarak okunmuş tüm
mesajları okunmamış sayacında hortlatırdı**. Yani migration öncesi satırlar için `read_at`
"en geç bu tarihte okunmuştu" demektir, gerçek okuma anı değil.

Backfill fonksiyonu **idempotenttir** (yalnızca `client_id is null` / `read_at is null`
satırlara dokunur) ve çözülemeyen satırları `raise notice` ile bildirip **atlar**;
hiç NULL kalmadıysa `client_id` `NOT NULL` yapılır.

### `is_read` SİLİNMEDİ

Kolon `DEPRECATED: read_at kullanın` yorumuyla yerinde durur; DROP işlemi Faz 2
kapısındadır. `useMarkConversationRead` iki kolonu da tutarlı tutar.

### Testler

```bash
npm run test:rls         # 104 senaryo (36–42 mesajlaşma konuşma anahtarına ait)
npm run test:transform   # 26 senaryo (20–22 backfill: temel + idempotency + atlanan satır)
```

### Geri alma

Migration dosyasının sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır. `is_read`
silinmediği için "okundu mu" bilgisi korunur; yalnızca (zaten yaklaşık olan) okuma anı
ve `kind` kaybolur.

---

## 4d. Form Check İnceleme Durumu (Faz 2'nin şema ön koşulu)

`20260817150000_form_check_review.sql` `public.form_checks` tablosuna dört kolon ekler:

| Kolon | Tip | Anlamı |
|---|---|---|
| `status`         | `public.form_check_status` (`pending` \| `reviewed`) `NOT NULL DEFAULT 'pending'` | İnceleme durumu |
| `coach_feedback` | `text` | Koçun yazılı geri bildirimi |
| `reviewed_at`    | `timestamptz` | İnceleme anı (**sunucu doldurur**) |
| `reviewed_by`    | `uuid` → `profiles(id) ON DELETE SET NULL` | İnceleyen koç (**sunucu doldurur**) |

Bu migration **yalnızca şemadır**; alanları okuyan/yazan UI akışı Faz 2'nin işidir.

### Tutarlılık kısıtı: "incelendi ama kim/ne zaman belli değil" hali İMKÂNSIZ

```sql
constraint form_checks_review_consistency_chk check (
  (status = 'pending'  and reviewed_at is null     and reviewed_by is null)
  or
  (status = 'reviewed' and reviewed_at is not null and reviewed_by is not null)
)
```

Kısıt olmadan şema üç yalan söyleyebilirdi: kim/ne zaman incelediği cevapsız `reviewed`
satırlar, ve `pending` olduğu hâlde kalıntı zaman damgası taşıyan satırlar. Sonuncusu
Faz 2'nin **bekleyen kuyruğunu** (`where status = 'pending'`) sessizce yanlış gösterirdi.

> **`ON DELETE SET NULL` ile bilinçli gerilim:** koç profili silinirse `set null` bu
> kısıtı ihlal eder ve **silme hata verir**. Tek koçlu üründe bu yol ancak hesabın
> tamamen kapatılmasıyla tetiklenir; günlük veri bütünlüğünden ödün vermektense bu uç
> durumda operatöre "önce bu satırları ele al" demek tercih edilmiştir.

### Sütun bazlı koruma: `form_checks_guard_review` trigger'ı

`form_checks_update` politikası `client_id = auth.uid() OR is_coach()` — yani **danışan
kendi satırını güncelleyebilir** (notunu/kilosunu düzeltebilmeli). Ama RLS **satır**
bazlıdır, **sütun** bazlı değildir: aynı politika danışanın `status`'ü `reviewed` yapmasına
ve kendine `coach_feedback` yazmasına da izin verirdi — bekleyen kuyruk danışan tarafından
boşaltılabilir hâle gelirdi.

Postgres'te RLS'e sütun listesi verilemez. UPDATE'i danışana tamamen kapatmak kendi
notunu düzeltme akışını kırardı, bu yüzden kontrol **BEFORE INSERT OR UPDATE** trigger'ına
taşındı:

* **Danışan** (`not is_coach()`) `status` / `coach_feedback` / `reviewed_at` / `reviewed_by`
  alanlarını değiştirirse **`42501`** (PostgREST → **403**). Diğer kolonlar (notes,
  current_weight, pozlar) serbesttir.
* **Koç** `status = 'reviewed'` yaptığında `reviewed_at` ve `reviewed_by` **sunucuda**
  (`now()` / `auth.uid()`) doldurulur; istemcinin gönderdiği değerler **ezilir** — koç bile
  geçmiş bir tarih veya başka bir koç kimliği yazamaz. Zaten `reviewed` olan satırda ilk
  incelemenin izi korunur (geri bildirim metni düzeltilebilir).
* `'pending'`e dönüşte `reviewed_at`/`reviewed_by` **temizlenir** (kısıt bunu şart koşar).
* **`auth.uid()` NULL ise** (service_role / seed / migration) trigger değerlere **dokunmaz** —
  aksi hâlde `seed.sql`in yazdığı gerçekçi tarihler `now()`a ezilirdi. Tutarlılığı bu yolda
  CHECK kısıtı korur.

### Backfill: geçmiş UYDURULMAZ

Migration'dan önce tabloda inceleme ile ilgili **hiçbir kolon yoktu** — `coach_feedback`
bile. Yani "bu form check daha önce incelenmiş miydi?" sorusunu cevaplayacak tek bir veri
noktası bile yok. Dönüşüm kuralı bu yüzden fiilen kolon varsayılanıdır: **mevcut tüm
satırlar `pending`**.

`public.backfill_form_check_review()` bunun ötesinde **onarım** yapar (kısıt düşürülmüş
bir veritabanına uygulandığında): kanıtsız `reviewed` satırları (`reviewed_at` ve
`reviewed_by` ikisi de NULL) `pending`e çekilir, `pending` satırlardaki kalıntı alanlar
temizlenir. **Kısmen** dolu satırlar (yalnızca biri NULL) bilerek **dokunulmadan** bırakılıp
`raise warning` ile bildirilir: orada gerçek bir iz var, silmek veri kaybı, tamamlamak
uydurma olurdu. Fonksiyon idempotenttir.

### Kısmi (partial) indeks

```sql
create index form_checks_pending_queue_idx
  on public.form_checks (status, created_at desc)
  where status = 'pending';
```

Zamanla satırların ezici çoğunluğu `reviewed` olacak; tam indeks bu ölü ağırlığı da
taşırdı. Kısmi indeksin boyutu **kuyruk uzunluğuyla** orantılıdır, arşivle değil.

### Testler

```bash
npm run test:rls         # 104 senaryo (43–50 form check incelemesine ait)
npm run test:transform   # 26 senaryo (23–26 backfill + tutarlılık kısıtı)
```

### Geri alma

Migration dosyasının sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** `coach_feedback` metinleri ve tüm inceleme geçmişi geri alma ile kalıcı olarak
kaybolur — bu bilgiyi tutan başka bir kolon yoktur. DOWN bloğu önce yedek almayı gösterir.

---

## 4e. Faz 1.5 Güvenlik Sertleştirmeleri (erişim kontrolü denetimi)

Kaynak: `docs/security/findings-access-control.md`. Üç migration, denetimde bulunan yedi
bulguyu kapatır. **Ortak kök neden:** Postgres'te RLS **satır** bazlıdır; politikaya
**sütun listesi verilemez**. "Bu satıra dokunabilir misin?" doğru cevaplanıyordu, "bu
satırın hangi sütununa dokunabilirsin?" hiç sorulmuyordu. Çözüm her yerde aynı: sütun
kontrolü `BEFORE` trigger'ına taşınır ve **42501** (`insufficient_privilege`) ile
reddedilir — PostgREST bunu **403**'e çevirir. Desen `form_checks_guard_review()`
(bkz. 4d) ile birebir aynıdır.

| Migration | Bulgu | Ne değişti |
|---|---|---|
| `20260817160000_program_approval_guard.sql` | AC-01 (High), AC-07 (Low) | `program_approvals_review_consistency_chk` kısıtı + `program_approvals_guard_review` trigger'ı + DELETE politikasının daraltılması |
| `20260817160100_signup_role_hardening.sql` | AC-02 (High) | `handle_new_user()` rolü artık `raw_user_meta_data`'dan **almaz**; `'client'` sabittir |
| `20260817160200_column_guards.sql` | AC-04, AC-05, AC-08, AC-09, AC-10 | `is_end_user_write()` yardımcısı + `messages` / `notifications` / `profiles` sütun koruma trigger'ları |

### Onay kapısı sunucuda zorlanır (AC-01 / AC-07)

Denetimde danışan tek bir `POST /rest/v1/program_approvals` isteğiyle
`status='approved'`, `reviewed_by=<koç id>` yazabiliyordu; UPDATE koça kilitli olsa da
**DELETE + yeniden INSERT** ile kısıt anlamsızdı. Yeni sözleşme:

* **INSERT her zaman `pending`** ve `reviewed_at`/`reviewed_by` **boş**tur — koç dahil
  herkes için. ("Onay kaydı her zaman kuyruktan başlar" tek cümlelik değişmez.)
* `status`'ü `pending` dışına **yalnızca koç** çıkarabilir.
* Koç yolunda `reviewed_by := auth.uid()`, `reviewed_at := now()` **sunucuda ezilir**;
  istemcinin gönderdiği değer (bugün `useProgramApprovals.ts` gönderiyor) **kabul edilmez**.
* **DELETE daraltıldı:** `is_coach() OR (client_id = auth.uid() AND status = 'pending')`.
  Danışan yanlışlıkla gönderdiği, koçun **henüz bakmadığı** talebi geri çekebilir; ama
  karara bağlanmış (`approved`/`rejected`) bir kaydı silip **denetim izini yok edemez**.
  `src/hooks/useProgramApprovals.ts` bu tabloda hiç `.delete()` çağırmaz — daraltma
  mevcut hiçbir akışı kırmaz.

### Rol artık kullanıcı metadata'sından gelmez (AC-02)

`handle_new_user()` rolü `raw_user_meta_data ->> 'role'` alanından alıyordu; bu alan
GoTrue'da `/auth/v1/signup` gövdesindeki `data`'dan dolar, yani **tamamen istemci
denetimindedir**. Kayıt/davet akışı açıldığı gün herkes `coach` olurdu. Artık
`'client'` **sabittir** ve `role` alanı okunmaz bile (`full_name` okunmaya devam eder).

> **Koç yükseltmesi yalnızca ayrıcalıklı yoldan yapılır:** ya `service_role`/`postgres`
> ile doğrudan `update public.profiles set role='coach' …` (seed §2 bunu yapar), ya da
> **mevcut bir koç** üzerinden (`profiles_update_coach`). `seed.sql` zaten trigger'a
> güvenmiyor, rolü trigger'dan sonra açık bir UPDATE ile sabitliyordu — bu yüzden
> seed'e **hiçbir değişiklik gerekmedi**.

### `is_end_user_write()` — neden `current_user`, neden GUC bayrağı değil

Sütun korumalarının çekilmesi gereken bir "sunucu bağlamı" vardır (seed, migration,
`service_role`, `SECURITY DEFINER` RPC'ler). `form_checks` deseni bunu `auth.uid() IS NULL`
ile ayırır; `profiles` için bu **yetmez**: `increment_streak()` ve `sync_profile_email()`
`SECURITY DEFINER`'dır ama **kullanıcının oturumunda** çalışır — `auth.uid()` onların
içinde de doludur. Sadece `auth.uid()`'e bakılsaydı sütun sabitlemesi `increment_streak()`
RPC'sini de engellerdi.

Seçilen ayrım **`current_user`**'dır: PostgREST istemcisinde `authenticated`, postgres'e ait
bir `SECURITY DEFINER` fonksiyonun içinde `postgres`. Oturum değişkeni (`set_config('app.…')`)
**seçilmedi**, çünkü özel GUC'lar rezerve değildir — `authenticated` rolü de onu set
edebilir, yani koruma sahtelenebilir bir bayrağa dayanırdı. `current_user` ise rol
sisteminin kendisidir: taklit etmek için zaten `postgres` olmak gerekir.

> ⚠️ `public.is_end_user_write()` **`SECURITY INVOKER` olmak zorundadır**. `DEFINER`
> yapılırsa `current_user` içeride her zaman `postgres` olur, fonksiyon her zaman `false`
> döner ve **tüm sütun korumaları sessizce kapanır**. Senaryo 67 (`increment_streak`
> hâlâ çalışıyor mu?) bu mekanizmanın canlı testidir.

### Sütun sözleşmeleri (AC-04, AC-05, AC-08, AC-09, AC-10)

* **`messages`** — son kullanıcı UPDATE'te yalnızca `read_at` / `is_read` değiştirebilir;
  `message`, `kind`, `created_at`, `sender_id`, `receiver_id`, `client_id` **dokunulmazdır**
  (tabloda `edited_at` yok, tahrifat fark edilemezdi). INSERT'te `kind='system'`
  **üretilemez**: o etiket "bunu uygulama yazdı" demektir, sunucu yolundan üretilir.
  Bu kural **koç için de** geçerlidir — mesaj gövdesinde "yetkili tahrifat" diye bir şey yoktur.
* **`notifications`** — UPDATE'te son kullanıcı yalnızca `is_read` yazabilir (AC-10).
  INSERT'te **danışan → koç** yolu (AC-05, kimlik avı yüzeyi) kapalıdır.
  > **Bu madde Faz 1.7'de DEĞİŞTİ.** Faz 1.5'te seçilen çözüm şablon eşleştirmeydi ve
  > kabul edilen bedeli şablon metninin **iki yerde** (trigger + `useProgramApprovals.ts`)
  > yaşamasıydı. O borç `20260817180000_program_submission_rpc.sql` ile kapatıldı;
  > güncel tasarım için bkz. **§4g**. Trigger'da artık **hiçbir şablon metni yoktur**.
* **`profiles`** — `email`, `current_streak`, `last_checkin_at` **sunucuya aittir**;
  hiçbir `authenticated` oturumu (koç dahil) bunları UPDATE ile yazamaz. Tek yazma
  kaynakları `sync_profile_email()` ve `increment_streak()`'tir. `full_name`,
  `avatar_path`, `nutrition_plan`, `workout_plan` serbest kalır.

### Trigger sırası notu

`messages` tablosunda iki `BEFORE` trigger'ı vardır ve Postgres bunları **ad sırasına**
göre çalıştırır: `messages_apply_conversation_key` → `messages_guard_columns`. Pratik
sonuç, alıcı `sender_id`'yi bozuk bir değere çekmeye çalışırsa 42501 yerine 22023
almasıdır — her iki durumda da istek reddedilir, yalnızca hata kodu farklıdır.

### Testler

```bash
npm run test:rls   # 104 senaryo (51–70 Faz 1.5 güvenlik regresyonlarına ait)
```

Kapsanan boşluklar (`findings-access-control.md` §6): G-01, G-02, G-03, G-06 (51–57),
G-07, G-08, G-09 (58–61), G-10, G-11 (62–65), G-13, G-14 (66–69), G-16 (70). Her bulgu
senaryosunun yanında bir **pozitif kontrol** vardır (53, 60, 63, 65, 67, 69): düzeltmenin
meşru uygulama akışını kırmadığını kanıtlar.

> **Senaryo 12 iki kez güncellendi.** Eskiden danışanın koça **serbest metinli** bildirim
> yazdığını doğruluyordu; AC-05'ten sonra uygulamanın **gerçekten gönderdiği** şablon
> payload'ına çevrildi; Faz 1.7'den sonra ise ölçüm noktası
> `submit_program_for_approval()` RPC'sine taşındı (doğrudan yazma yolu kapatıldığı için).
> Koruduğu **ürün garantisi** üç sürümde de aynı: "danışan programı gönderince koç
> haberdar oluyor mu?"

### Geri alma

Üç migration dosyasının da sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** geri alma ilgili bulguları (AC-01 High ve AC-02 High dahil) yeniden açar.

---

## 4f. Tablo Yetkileri ve FORCE RLS (AC-03 / AC-06)

`20260817170000_force_rls_and_grants.sql`. Şema değiştirmez; yalnızca **yetki (ACL)**
ve **tablo bayrağı** değiştirir.

### `authenticated` artık TRUNCATE / REFERENCES / TRIGGER yapamaz (AC-03)

RLS yalnızca SELECT/INSERT/UPDATE/DELETE'i filtreler — **`TRUNCATE` RLS'e tabi
değildir**. Denetimde `authenticated` rolünde bu yetki açıktı ve tek ifadeyle tüm
veritabanı silinebiliyordu:

```
-- düzeltmeden ÖNCE, danışan A oturumunda:
truncate table public.profiles cascade;
-- NOTICE: truncate cascades to ... (11 tablo) -> GEÇTİ
```

Düzeltme sonrası aynı ifade `42501 permission denied for table profiles` verir.

> **Asıl düzeltme `revoke` değil, `alter default privileges`.**
> `20260816090200_rls_policies.sql`'deki GRANT zaten dardı
> (`select, insert, update, delete`). Üç fazla yetkinin kaynağı Supabase'in
> platform seviyesindeki varsayılanıdır
> (`alter default privileges for role postgres in schema public grant all on tables to …`).
> Bu yüzden yalnızca mevcut tablolardan REVOKE etmek yetmez: **bir sonraki
> migration'da açılan her yeni tablo yetkiyi kendiliğinden geri kazanırdı.**
> Migration bu yüzden varsayılan yetkilerin kendisinden de söker. Canlı doğrulama:
> düzeltme sonrası `create table public.zz (id int)` → ACL
> `postgres=arwdDxt | service_role=Dxt` (authenticated **yok**).

**Pratik sonuç:** `public` şemasına eklenen her yeni tablo, kendi migration'ında
`grant select, insert, update, delete on public.<tablo> to authenticated;`
satırını **açıkça** içermek zorundadır (mevcut kalıp zaten budur). Unutulursa
uygulama `permission denied for table` ile **gürültülü** kırılır — sessiz bir
güvenlik açığı oluşmaz.

`service_role` ve `postgres` **kısıtlanmadı** (ikisi de zaten `rolbypassrls = t`).

**Kapatılamayan boşluk:** `pg_default_acl`'de bir de `supabase_admin` kaydı vardır
(`authenticated=arwdDxt`). Onu değiştirmek `must be member of role "supabase_admin"`
ile reddedilir. Uygulamanın 13 tablosunun tamamı `postgres` sahipli olduğu için
pratik etkisi yoktur; ama `public` şemasına `supabase_admin` ile kurulan bir
**eklenti** tablo yaratırsa o tablo kapsam dışı kalır. Test senaryosu 73 tablo
listesini `pg_tables`'tan dinamik okuduğu için böyle bir tablo ortaya çıkarsa
**test kırılır**.

### `FORCE ROW LEVEL SECURITY` tüm tablolarda açık (AC-06)

Normalde tablo **sahibi** RLS'ten muaftır; `FORCE` muafiyeti kaldırır. Bu projede
13 tablonun da sahibi `postgres`'tir ve `handle_new_user()`, `sync_profile_email()`,
`increment_streak()`, `is_coach()`, `profile_role()`, `is_coach_profile()` ile tüm
`*_guard_*` trigger fonksiyonları `SECURITY DEFINER` olarak **`postgres` kimliğiyle**
çalışır. FORCE bunları RLS'e soksaydı en az iki yol ölürdü:

* `handle_new_user()` → `profiles` INSERT: kayıt anında `auth.uid()` NULL'dır,
  `profiles_insert_coach` politikası `is_coach()` ister → **her kullanıcı kaydı ve
  `db reset` seed'i çökerdi**.
* `is_coach()` → `profiles` SELECT: politikaların içinden çağrıldığı için `false`
  dönmeye başlar → **koç tüm verisine erişimini sessizce kaybederdi**.

**Kırılmıyor — çünkü `postgres` rolünde `rolbypassrls = t` ve BYPASSRLS, FORCE'u
ezer.** Bu tahmin değil, ölçüm: FORCE tüm tablolarda açıkken GoTrue'nun gerçek DB
rolü (`supabase_auth_admin`, `bypassrls = f`) ile `insert into auth.users` çalıştı
ve profil oluştu; `POST /auth/v1/admin/users` gerçek HTTP çağrısı `200` döndü ve
`role=client` profil yazıldı; `test:rls` 76/76, `test:transform` 26/26 geçti.

> **Bugünkü etkisi sıfırdır** — bulgunun **Low** olmasının sebebi budur. Değeri,
> `postgres`'ten BYPASSRLS alındığı veya tablolar BYPASSRLS'siz bir role
> devredildiği gün doğar. Aynı sebeple **hiçbir tablo kapsam dışı bırakılmadı**.
> Senaryo 75 bu varsayımı açıkça test eder: sahibin BYPASSRLS'i kalkarsa test
> "migration yeniden değerlendirilmeli" mesajıyla kırılır.

### Testler

```bash
npm run test:rls   # 104 senaryo (71–76 bu migration'a ait)
```

* **71** — `authenticated` TRUNCATE edemez (`profiles cascade`, `messages`, `form_checks`)
* **72** — `authenticated` `create trigger` / `alter table ... add foreign key` yapamaz
* **73** — dinamik grant denetimi: her `public` tablosunda `authenticated`/`anon` için
  TRUNCATE+REFERENCES+TRIGGER yok, S/I/U/D **var** (pozitif kontrol)
* **74** — dinamik `pg_class` denetimi: her `public` tablosunda
  `relrowsecurity = relforcerowsecurity = true`
* **75** — pozitif: FORCE açıkken `handle_new_user()` ve `sync_profile_email()` çalışıyor
* **76** — pozitif: FORCE açıkken `is_coach()` / `profile_role()` / `is_coach_profile()`
  doğru cevaplıyor

### Geri alma

Migration dosyasının sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** geri alma AC-03'ü yeniden açar — `authenticated` rolündeki herhangi bir
kullanıcı yeniden `truncate table public.profiles cascade` ile tüm veritabanını
silebilir hâle gelir. `anon` bilerek geri verilmez.

---

## 4g. Faz 1.7 — Kuplaj Borcu, Avatar Görünürlüğü, Sequence Yetkileri

Üç migration: `20260817180000_program_submission_rpc.sql`,
`20260817180100_avatar_visibility.sql`, `20260817180200_sequence_grants.sql`.

### Program gönderimi tek bir RPC'ye taşındı (AC-05 kuplaj borcu)

Faz 1.5'te danışan → koç bildirim metni **iki yerde** yaşıyordu: trigger'daki
`c_client_to_coach_messages` dizisi ve `src/hooks/useProgramApprovals.ts`. Biri
diğerinden bağımsız değişirse program gönderimi `42501` ile kırılırdı. Faz 1.5 o turda
RPC'ye geçemedi çünkü uygulama kodu başka bir ajanın sahipliğindeydi.

Yeni akış — `public.submit_program_for_approval(p_client_id, p_workout_data)`:

1. `program_approvals` satırını **her zaman `pending`**, `reviewed_*` boş yazar.
2. `role = 'coach'` olan **tüm** profillere bildirimi yazar (metin RPC gövdesindeki
   `c_coach_notification` sabiti — **tek sahip**). Koç bulunamazsa onay kaydı yine
   oluşur, sunucu günlüğüne `warning` düşer.
3. İkisi de tek çağrıda, tek işlemde: **atomik**.

Politika değişikliği: `notifications_insert` içinden `is_coach_profile(client_id)` dalı
**kaldırıldı**. Danışan artık `notifications` tablosuna **yalnızca kendi satırını**
yazabilir. Grep ile doğrulandı: bu dalı kullanan tek çağrı taşınan çağrıydı
(`useNotifications.ts`'teki koç duyurusu `is_coach()` dalından geçer, `ai_backend`
`notifications`'a hiç yazmaz, `seed.sql` `postgres` ile yazar).

> **Onay kapısı (AC-01) ATLANMIYOR — bu ölçüldü, varsayılmadı.** RPC `SECURITY DEFINER`
> olduğu için `postgres` kimliğiyle çalışır ve `postgres` `rolbypassrls` taşır: **RLS
> politikaları** bu yolda devrede değildir (bu yüzden sahiplik kontrolü —
> `p_client_id = auth.uid()` — gövdede **elle** yapılır). Ama onay kapısı bir politika
> değil, bir **trigger**'dır (`program_approvals_guard_review`) ve trigger'lar
> BYPASSRLS'ten etkilenmez; ayrıca `auth.uid()` `SECURITY DEFINER` içinde de doludur
> (`request.jwt.claims` bir oturum GUC'udur). RLS testi **senaryo 80** bunu canlı kanıtlar:
> işlem içinde geçici bir `SECURITY DEFINER` fonksiyon kurulup `status='approved'`
> INSERT'i denenir ve `42501` alır.

`notifications_guard_content()` **korundu ama şablonu söküldü**: UPDATE dalı (AC-10) hâlâ
gereklidir (`useMarkAsRead` bu yolu kullanıyor, RLS sütun kısıtı yazamaz). INSERT dalı
artık metin içermez; danışan → koç yolunda **rol tabanlı** bir 42501 verir. Bu, RLS'in
söylediğini tekrarlar — kasıtlı: (1) biri politikaya dalı geri koyarsa delik **sessizce**
açılmaz, (2) hata mesajı geliştiriciyi doğrudan RPC'ye yönlendirir.

### Koçun avatarı danışana açıldı

`avatars` SELECT politikasına üçüncü bir dal eklendi: **dosyanın sahibi koçsa herkes
okuyabilir**. Sahiplik dosya adından çıkarılır (`public.avatar_object_owner(text)`), çünkü
bu bucket'ta ad biçimi `<uid>-<uuid>.<ext>` ve mevcut altı politikanın hepsi zaten ad ön
ekine dayanıyor.

> **Ad ayrıştırmasıyla yetki vermek neden burada güvenli:** (1) desen **katı** — kanonik
> 36 karakterlik UUID + ardından `-`, ve adda hiç `/` olmaması; (2) `::uuid` cast'i
> yalnızca regex'in doğruladığı dalda çalışır, yani **asla patlamaz** (politika içinde
> fırlayan hata `createSignedUrl`'i herkes için kırardı); (3) ayrıştırma başarısızsa
> `NULL` döner ve `is_coach(NULL)` **false**'tur — belirsizlik daima **redde** düşer;
> (4) ön ek **sahtelenemez**: `avatars_insert_own`/`avatars_update_own` politikaları adın
> `auth.uid()` ile başlamasını şart koşar, yani danışan koçun uid'iyle başlayan bir dosya
> **yaratamaz**. `form-checks-media` politikası **değişmedi**.

RLS testi **senaryo 82** en kritik regresyonu kapatır: danışan başka bir danışanın
avatarını göremez; ayrıca ayrıştırıcıyı sömürmeye çalışan dört bozuk ad (UUID'siz,
ayırıcısız, alt dizinli, uid'i ortada geçen) ve `form-checks-media`'ya sızma denenir.

### Sequence yetkileri: `setval` kapatıldı, `nextval` korundu

`authenticated` rolü `exercises_id_seq` ve `food_database_id_seq` üzerinde `UPDATE`
(`setval`) yetkisine sahipti — Supabase platform varsayılanından miras. RLS baypası değil
ama en-az-yetki ihlali: sayacı geri alıp sonraki katalog INSERT'lerini benzersizlik
çakışmasıyla düşürmek mümkündü (bu, kırmızı-yeşil kanıtı sırasında **gerçekten yaşandı**).

`REVOKE ALL` **yapılmadı** — ayrım cerrahidir: `USAGE` (nextval için zorunlu) ve `SELECT`
kalır, yalnızca `UPDATE` gider. Ayrıca `alter default privileges` ile **gelecekteki**
sequence'ler için varsayılan `usage, select`'e sabitlendi; sadece mevcut nesneleri
düzeltmek yetmezdi (AC-03 turunda tablolarda aynı tuzağa düşülmüştü). Senaryo **85** bunu
işlem içinde gerçek bir `serial` tablo yaratarak ölçer.

> **Kapatılamayan boşluk (tablolardakiyle aynı):** `pg_default_acl`'deki `supabase_admin`
> satırı sequence'ler için de `anon=rwU, authenticated=rwU` verir ve `postgres` bunu
> değiştiremez ("must be member of role supabase_admin"). Uygulamanın iki sequence'i de
> `postgres` sahipliğinde olduğu için pratik etkisi yoktur; senaryo **84** listeyi
> `pg_class`'tan **dinamik** okuduğu için bir istisna doğarsa test kırılır.

> **`as materialized` neden zorunlu:** `has_sequence_privilege()` ile `relkind='S'` filtresi
> aynı `WHERE`'de olursa planlayıcı fonksiyonu filtreden **önce** çalıştırabilir ve bir
> TOAST tablosunun OID'iyle `42809 ("... is not a sequence")` fırlatır. Bu, migration
> yazılırken `db reset`'i gerçekten patlattı; hem migration hem senaryo 84 CTE çitiyle
> düzeltildi.

### Testler

```bash
npm run test:rls   # 104 senaryo (77–85 bu üç migration'a ait)
```

* **77** — pozitif: RPC onay satırını + koç bildirimini atomik yazar (`title` NULL)
* **78** — danışan koça **doğrudan** bildirim yazamaz — **eski şablon metniyle bile**
* **79** — RPC başkası adına çağrılamaz (SECURITY DEFINER IDOR koruması)
* **80** — **AC-01 regresyonu**: `SECURITY DEFINER` bir fonksiyon bile `status='approved'`
  yazamaz — kapı politika değil trigger olduğu için
* **81** — pozitif: danışan koçun avatarını (ve kendi avatarını) görür
* **82** — danışan **başka danışanın** avatarını göremez; ayrıştırıcı sömürülemez
* **83** — `setval` reddedilir (42501), `nextval` üzerinden INSERT çalışır
* **84** — dinamik sequence yetki denetimi (UPDATE yok, USAGE var)
* **85** — **gelecekteki** sequence de doğru varsayılanı alır

### Geri alma

Üç migration dosyasının da sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** `20260817180000`'in geri alınması, `src/hooks/useProgramApprovals.ts`'nin de
eski `.from('notifications').insert(...)` hâline döndürülmesini **gerektirir** — yoksa
program gönderimi bildirimsiz kalır ve koç habersiz olur. Avatar geri alması güvenlik
açığı yaratmaz (yalnızca koç avatarını tekrar görünmez kılar); sequence geri alması
`setval` yüzeyini yeniden açar.

---

## 4h. Faz 2b — Şema Tamamlama (Faz 2'nin ön koşulu)

Beş migration: `20260817190000_workout_log_sets.sql`,
`20260817190100_nutrition_targets_and_logs.sql`,
`20260817190200_message_attachments.sql`,
`20260817190300_message_read_state.sql`,
`20260817190400_realtime_publication.sql`.

Bu tur **yalnızca şemadır**; alanları okuyan/yazan UI akışı Faz 2'nin işidir.
Kapsam bilinçli olarak "planın gerektirdiği kadarı"dır — Faz 3/4 tabloları
(`ai_usage_counters`, `progress_entries`, `recovery_scores` …) **kurulmadı**.

### `workout_logs` set bazlı oldu — ve `completed_at` bir OTURUM damgasıdır

| Kolon | Tip | Anlamı |
|---|---|---|
| `set_number` | `integer` | Gün/oturum içindeki set sırası. `NULL` = Faz 2b öncesi satırlar |
| `plan_exercise_id` | `uuid` → `workout_plan_exercises(id)` `ON DELETE SET NULL` | Setin bağlı olduğu **versiyonlu** plan satırı. `NULL` = plan dışı set / geçmiş log |
| `completed_at` | `timestamptz` | **Antrenman oturumunun** tamamlanma anı |

Plan §4.1 iki şeyi aynı anda söylüyordu: kolonun adresi `workout_logs.completed_at`
(satır = **bir set**) ama tetikleyicisi "**tüm setler** girilince" (bu bir **oturum**
kavramı). Ayrı bir `workout_sessions` tablosu **açılmadı**: bu, `workout_logs`'u bir
başlık tablosuna çevirip `src/hooks/useWorkoutLogs.ts`'in ve tüketicilerinin
"satır = set" sözleşmesini kırardı. Seçilen çözüm **denormalize damga**dır — bir
antrenman bitirildiğinde o oturuma ait **tüm** set satırlarına **aynı** `completed_at`
yazılır. `completed_at IS NULL` = "set girildi, antrenman henüz bitirilmedi".
Karar **kayıpsız yükseltilebilir**: oturumlar
`select distinct client_id, completed_at ... where completed_at is not null` ile
tam olarak geri üretilir.

* **`exercise_name` DEPRECATED ama DROP EDİLMEDİ** (§3.5): plan dışı setlerin ve tüm
  geçmiş logların **tek** etiketi odur. FK bu yüzden **NULLABLE**'dır — mevcut
  satırların hiçbirinde plan bağı kurulacak bilgi yoktu, uydurulmadı.
* **`ON DELETE SET NULL`, `CASCADE` değil:** `save_workout_plan()` planın tüm egzersiz
  satırlarını silip yeniden yazar; CASCADE olsaydı koç planı her kaydettiğinde danışanın
  **geçmiş logları silinirdi**.
* **`workout_logs_guard_plan_exercise` trigger'ı (SECURITY DEFINER):** log satırı
  **başka bir danışanın** plan satırına bağlanamaz (42501). RLS bunu kapatmaz —
  `workout_logs_insert` yalnızca `client_id`'ye bakar. Kural bir **yetki** değil
  **bütünlük** kuralı olduğu için **koç için de** geçerlidir (senaryo 87b).

### Beslenme: plan seviyesinde hedef, ayrı bir log tablosu

`nutrition_plans` dört yeni kolon aldı: `target_kcal`, `target_protein_g`,
`target_carb_g`, `target_fat_g` (hepsi `integer`, `NULL` serbest, `CHECK >= 0`).
Hedef **günlüktür ve plan seviyesindedir** (§4.2 "koç: günlük makro hedefi");
`nutrition_plan_meals`'a konsaydı aynı hedef 7 kez tekrarlanır ve satırlar
çeliştiğinde "günlük hedef" tanımsız kalırdı. `target_` ön eki plandan tek
sapmadır ve **yalnızca addadır**: `nutrition_plan_meals.kcal` zaten var ve o bir
hedef değil şablon kalorisidir.

`public.nutrition_logs` **yeni** tablodur — "gerçekleşen" makroyu tutan hiçbir yer
yoktu, dolayısıyla §4.2'nin "hedef vs gerçekleşen" dashboard'u yazılamıyordu.

| Kolon | Not |
|---|---|
| `client_id, log_date, description` | `log_date` gruplama anahtarı; **günde tekillik YOK** (bir günde çok öğün) |
| `kcal, protein_g, carb_g, fat_g` | `integer`, `NULL` = girilmedi (**0 değil**), `CHECK >= 0` |
| `created_at, updated_at` | `set_updated_at()` trigger'ı |

* **Ad Faz 3 için ileriye uyumlu, alanları DEĞİL.** Faz 3 (§5.3) bu tabloya
  `status='ai_suggested'` yazacak; tabloyu bugün başka adla açıp sonra yeniden
  adlandırmak gereksiz bir kırılma turu olurdu. Ama `status` / `photo_path` /
  `ai_estimate` / `user_override` **bugün kurulmadı**: AI yolu yok, `status` tüm
  satırlarda tek değeri taşırdı. Faz 3'te `add column status ... default 'confirmed'`
  **backfill gerektirmez** — bugünkü satırların semantiği zaten `confirmed`'dır.
* **RLS'te ADR-0014 sapması YOK.** `workout_logs`/`daily_logs` UPDATE/DELETE'i koça da
  açar; bu, **mevcut** davranışı kırmama kararının mirasıdır. `nutrition_logs` yeni bir
  yüzeydir, kıracak bir akış yoktur, bu yüzden plan §3.2 birebir uygulandı: **koç salt
  okur**, yazamaz. Koçun beslenme yazma yüzeyi `nutrition_plans` /
  `nutrition_plan_meals` (şablon) tablolarıdır.
* Tablo `FORCE ROW LEVEL SECURITY`'yi **kendisi alır**: `20260817170000` §2 bir `DO`
  döngüsüydü ve yalnızca o an var olan tabloları gezdi.

### Mesaj eki: `message-attachments` bucket'ı

`messages.attachment_path` **yol saklar, URL değil** (I-4). Yol sözleşmesi:

```
message-attachments/<conversation_client_id>/<uploader_uid>-<uuid>.<ext>
                     ^^^ konuşma anahtarı      ^^^ yükleyen
```

Mevcut iki bucket da uymuyordu: `avatars` okuma politikası "koçun dosyası **herkese**
açık" der — koçun gönderdiği her foto **tüm danışanlara** açılırdı. `form-checks-media`
ise sahibi + koç ile sınırlıdır; danışan **koçun gönderdiği** eki göremezdi.

Sızdırmama **beş kilide** dayanır: (1) SELECT klasörü `auth.uid()` ile kıyaslar
(`anon` için politika yok, hiç okuyamaz); (2) INSERT klasörü sahtelenemez kılar —
danışan başkasının klasörüne dosya **bırakamaz**; (3) ayrıştırıcı **katı ve
fail-closed**tır (kanonik 36 karakterlik UUID, tek seviye klasör; desen tutmazsa
`NULL` → politika **false**); (4) bucket **private**, okuma yalnızca signed URL
(TTL 3600 sn); (5) `messages_attachment_path_chk` **veritabanında** yolun ilk
segmentinin satırın `client_id`'sine eşit olmasını şart koşar — bir mesaj **başka bir
konuşmanın** ekini işaret **edemez**.

> **`messages_guard_columns()` GENİŞLETİLDİ.** O fonksiyon sütun listesini **açıkça
> sayar**; yeni bir kolon otomatik kapsanmaz. Genişletilmeseydi alıcı, gelen mesajın
> **ekini** değiştirebilirdi ve tabloda `edited_at` olmadığı için karşı taraf bunu fark
> edemezdi — AC-04'ün kapattığı deliğin birebir aynısı. Regresyon: senaryo 89b.

### `read_at` KANONİK, `is_read` TÜREV

`docs/PROGRESS.md` §6b'deki ikilik karara bağlandı. `read_at` kanoniktir çünkü daha
fazla bilgi taşır: ondan `is_read` **kayıpsız** türer (`read_at is not null`), tersi
**türetilemez** (bir bayrak zaman üretemez). Garanti **iki katmanlıdır**:

* **`messages_sync_read_state` trigger'ı — NORMALLEŞTİRİR.** Hangi alan yazılırsa
  yazılsın diğerini türetir (yalnız `is_read=true` yazan eski istemci yolunda `read_at`
  `now()`a terfi eder; `read_at` yazıldığında bayrak **ezilir**). **Koşulsuzdur** —
  `is_end_user_write()` guard'ı yoktur, çünkü bu bir yetki değil **veri modeli**
  kuralıdır; seed ve `service_role` da tutarsız satır yazamamalıdır.
* **`messages_read_state_chk` kısıtı — KANITLAR.** Trigger devre dışı bırakılsa bile
  tutarsız satır tabloya **giremez** (senaryo 92d).

Tek başına CHECK yetmezdi (eski istemciyi 23514 ile **kırardı**), tek başına trigger da
yetmezdi (sessizce kapatılabilir). **Ad sırası önemlidir:**
`messages_apply_conversation_key` < `messages_guard_columns` < `messages_sync_read_state`
— normalleştirme **en son** koşar, yani sütun koruması hâlâ **istemcinin gönderdiği**
değerleri denetler.

`is_read` **DROP EDİLMEDİ** (§3.5) — `src/hooks/useMessages.ts` ve
`src/types/database.ts` hâlâ okuyor. **Yeni kod bu kolona yazmamalı.**

> **`transform.test.sql` senaryo 20/21 buna göre güncellendi:** simüle ettikleri eski
> şekilli satır (`is_read = true` iken `read_at IS NULL`) artık imkânsız olduğu için,
> normalleştirme trigger'ı ve kısıt **işlem süresince** kaldırılır (`rollback` geri
> getirir). `backfill_messages_conversation_key()` eski dünyanın aracıdır ve eski
> dünyada test edilmelidir.

### Realtime: ölçüldü, yayın daraltıldı, `replica identity` DEĞİŞMEDİ

Yerel yığında gerçek WebSocket bağlantılarıyla üç aktör (koç, danışan A, danışan B)
abone edilip `messages` üzerinde INSERT/UPDATE/DELETE tetiklendi.

| Olay | Abone (filtre) | Ulaştı mı | Gecikme |
|---|---|---|---|
| INSERT | A (`client_id=eq.A`) | **evet** | 78 ms |
| INSERT | koç (`client_id=eq.A`) | **evet** | 440 ms |
| INSERT | **B** (`client_id=eq.A`) | hayır | — (RLS) |
| UPDATE (`read_at`) | A / koç | **evet** | 80 / 934 ms |
| UPDATE | **B** | hayır | — (RLS) |
| DELETE | A (`client_id=eq.A`) | **hayır** | filtre eşleşemez |
| DELETE | **B (filtresiz abone)** | **EVET (sızıntı)** | 92 ms |

* **`replica identity = 'd'` INSERT ve UPDATE için YETERLİDİR** — WAL kaydı yeni
  tuple'ı **tam** taşır (ölçüm: 10/10 kolon), Realtime hem `filter`ı hem RLS
  görünürlüğünü onun üzerinde değerlendirir. `full`'a geçmek yalnızca `payload.old`u
  doldururdu; `src/hooks/useMessages.ts` onu **hiç okumuyor**. AC-2.2'nin 2 sn bütçesi
  78–934 ms ile zaten karşılanıyor. **Değişiklik yapılmadı.**
* **DELETE `d` altında güvenli DEĞİLDİR:** eski kayıt yalnızca birincil anahtarı taşır,
  yani (a) konuşmanın kendi abonesi olayı **alamaz** (filtre eşleşemez), (b) **filtresiz**
  abone olan ilgisiz bir danışan olayı **alır** — RLS değerlendirilecek sütun bulamaz.
  İçerik sızmaz (`{id}`), ama **başka bir konuşmada bir mesajın silindiği bilgisi ve
  zamanı** sızar.
* **Çözüm: yayın daraltıldı** —
  `alter publication supabase_realtime set (publish = 'insert, update')`.
  `full`'a geçmek, planın Faz 2'de istemediği bir yetenek için her UPDATE'in WAL
  maliyetini kalıcı olarak artırırdı. Daraltma hiçbir tüketiciyi kaybettirmez: kod
  tabanında **tek** `postgres_changes` aboneliği vardır (`useMessages`, `messages`,
  `event: 'INSERT'`) ve DELETE zaten kimseye ulaşmıyordu.
* **İleride realtime silme gerekirse** `publish`'i genişletmek **tek başına yetmez** —
  o tabloda `replica identity full` **ön koşuldur**. Bu bir tercih değil, WAL'ın
  fiziksel kısıtıdır.
* **`nutrition_logs` yayına EKLENMEDİ:** §4.2 dashboard'u bir **sorgu**dur, canlı akış
  değil; tek yazıcısı danışanın kendisidir.

### Testler

```bash
npm run test:rls         # 99 senaryo (86–95 bu beş migration'a ait, 96–99 §4i'ye ait)
npm run test:transform   # 26 senaryo (20/21 Faz 2b invaryantına göre güncellendi)
```

* **86–88** — `workout_logs` yeni kolonları: pozitif yazma; çapraz danışan plan bağı
  **kapalı** (koç dahil); görünürlük değişmedi; koç danışanın loguna INSERT edemez
* **89–91** — mesaj eki: yol sözleşmesi (geçerli / çapraz konuşma / tam URL), alıcı eki
  **değiştiremez**, bucket okuma-yazma sınırları, ad ayrıştırıcısı sömürülemez
* **92** — `read_at`/`is_read` invaryantı: her iki yön normalleştirilir; trigger
  kapalıyken CHECK reddeder
* **93–94** — `nutrition_logs` erişim matrisi (koç **salt okur**) + günlük makro hedefi
* **95** — realtime yayın sözleşmesi (sürüklenme testi)
* **96–99** — `post_system_message()` RPC'si (bkz. §4i)

`nutrition_logs` ayrıca **dinamik** senaryo 73 (yetki) ve 74 (RLS + FORCE) tarafından
otomatik kapsanır.

### Geri alma

Beş migration dosyasının da sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** `nutrition_logs` ve `workout_logs`'un yeni kolonları geri alınırsa o veriyi
tutan **başka bir yer yoktur** (DOWN blokları önce yedek almayı gösterir);
`20260817190400`'ün geri alınması ölçülen DELETE sızıntısını yeniden açar.

---

## 4i. Faz 2e/f — Sistem Mesajı RPC'si (`kind='system'` yazma kanalı)

Faz 2e `messages_guard_columns()`'in (§4e) `kind='system'`'i PostgREST üzerinden gelen
**hiçbir** oturumdan (koç dahil) kabul etmediğini keşfetti ve bunu **kapsam dışı**
bıraktı: `src/hooks/useFormChecks.ts` best-effort bir `.insert()` deniyor, `42501`'i
BEKLENEN sayıp yutuyordu — plan §4.3/§4.4'ün "form check incelendi -> sistem mesajı"
akışı sessizce **inert**ti. `20260817200000_system_message_rpc.sql` bu kanalı açar.

### `public.post_system_message(p_client_id uuid, p_event_type text, p_ref_id uuid default null) -> messages`

* **Kim çağırabilir: yalnızca koç.** `auth.uid() is null` (service_role / migration /
  seed) zaten doğrudan INSERT ile serbesttir (`is_end_user_write()` false); bu RPC'nin
  muhatabı PostgREST'ten gelen bir **koç** oturumudur (`is_coach(auth.uid())`).
  Danışan — kendi adına ya da başkası adına fark etmez — `42501` alır (senaryo 97).
* **Serbest metin YOK — AC-05'in dersi tekrarlanmadı.** RPC bir "mesaj metni"
  parametresi almaz; yalnızca bir **olay türü** (`p_event_type`) ve o olayın sunucuda
  zaten var olan kaydına bir **referans** (`p_ref_id`) alır. Metin RPC gövdesinde,
  referansın sunucuda doğrulanmış alanlarından üretilir — AC-05'te (`notifications`,
  §4e) aynı hata "şablonu sunucuya taşı" ile kapatılmıştı; burada bir adım öteye
  gidilip **şablon parametresi hiç açılmadı**. Bugün tek olay türü:
  `'form_check_reviewed'` (`p_ref_id = form_checks.id`) — `useFormChecks.ts`'in tek
  ihtiyacı budur. Yeni bir olay türü eklemek yeni bir migration'da `create or replace
  function` + CASE'e yeni bir `when` dalıdır; **imza değişmez**.
* **`form_check_reviewed` doğrulaması** (hepsi gövdede, RLS'e güvenilmez —
  `SECURITY DEFINER` onu zaten baypas eder): hedef gerçek bir `role='client'` profili
  olmalı; `form_checks.id = p_ref_id` bulunmalı; o kaydın `client_id`'si
  `p_client_id` ile eşleşmeli; `status = 'reviewed'` olmalı; `reviewed_by` **çağıran
  koçun kendisi** olmalı. Dördü de düşerse `42501`; bilinmeyen `p_event_type` `22023`
  alır (senaryo 99).
* **Trigger'larla uyum: ATLAMA yok, GEÇME var.** RPC düz bir `insert into messages`
  yapar; `messages_apply_conversation_key`, `messages_guard_columns`,
  `messages_sync_read_state` bu INSERT'te de **ad sırasına göre** ateşlenir.
  `messages_guard_columns` `is_end_user_write()`'ı `SECURITY DEFINER` sayesinde
  `false` görüp çekilir (guard zayıflamadı — **koç dahil hiç kimse hâlâ doğrudan
  `.insert()` ile `kind='system'` yazamaz**, senaryo 98); `messages_sync_read_state`
  koşulsuz çalışıp yeni mesajı "okunmamış" (`read_at is null` / `is_read=false`)
  bırakır. `attachment_path` bilerek `null` yazılır.
* **`src/hooks/useFormChecks.ts`** artık `.rpc('post_system_message', { p_client_id,
  p_event_type: 'form_check_reviewed', p_ref_id: formCheckId })` çağırır. Hata artık
  **BEKLENMİYOR** (`42501` regresyonu değil, gerçek arıza) — `logger.error` +
  görünür bir `toast.error` ile yüzeye çıkar. Yine de mutasyonu `throw` ile
  **bloke etmez**: asıl işlem (`form_checks.status='reviewed'`) o ana kadar zaten
  yazılmıştır ve geri alınmaz; hatayı `throw` etmek "geri bildirim kaydedilmedi"
  gibi yanlış bir sinyal verirdi.

### Testler

```bash
npm run test:rls   # senaryo 96–99
```

* **96** — POZİTİF: koç RPC ile sistem mesajı yazar; `kind='system'`, `client_id`
  doğru, ek yok, `read_at`/`is_read` invaryantı sistem mesajında da tutuyor
* **97** — danışan RPC'yi çağıramaz — ne kendi adına ne başkası adına (`42501`)
* **98** — **kritik regresyon**: koç dahi doğrudan `.insert()` ile `kind='system'`
  yazamaz (senaryo 61 aynısını danışan tarafında zaten kapatıyordu)
* **99** — şablon dışı / sahte referans reddedilir: bilinmeyen olay türü (`22023`),
  başka danışanın kaydı / henüz incelenmemiş / başka koç tarafından incelenmiş
  (`42501`)

### Geri alma

`20260817200000_system_message_rpc.sql`'in sonundaki `-- DOWN` bloğu fonksiyonu
düşürür. **UYARI:** bu, `kind='system'` yazma kanalını yeniden kapatır —
`useFormChecks.ts`'in de eski best-effort `.insert()` yoluna döndürülmesi gerekir,
aksi hâlde `useReviewFormCheck` her çağrıda gürültülü bir hata verir (bilerek).

---

## 4j. Faz 2 — Plan Versiyonlama (`save_workout_plan` copy-on-write)

`20260817210000_workout_plan_versioning.sql`. `active_planprogram.md` §4.1 madde 1:
"plan yayınlama = yeni `version`, eski versiyon `is_active=false`
(**geçmiş loglar eski versiyona bağlı kalır — FK versiyonlu satıra**)".

### Kapatılan gerçek veri kaybı

`workout_logs.plan_exercise_id` FK'si **`ON DELETE SET NULL`**'dur (§4h).
Faz 1b'nin `save_workout_plan()`'i her çağrıda planın **tüm**
`workout_plan_exercises` satırlarını **silip yeniden yazıyordu** — yani koç bir plan
üzerinde çalışırken her "Kaydet" tıklaması, o satırlara bağlı **tüm geçmiş antrenman
loglarının plan bağını NULL'a düşürüyordu**. Log satırı yaşıyor, geriye yalnızca serbest
metin `exercise_name` etiketi kalıyordu. Plandaki parantez içi garanti **sağlanmıyordu**.

### Copy-on-write: bir versiyon, üzerine geçmiş düştüğü an DONAR

Danışan başına üç dal:

| Durum | Davranış |
|---|---|
| Aktif plan **yok** | `max(version)+1` (arşiv varsa onun üstünden) ile yeni aktif plan |
| Aktif plan var, satırlarına bağlı **log VAR** | **YAYINLAMA**: eski plan `is_active=false`, **satırlarına DOKUNULMAZ**, `version+1` ile yeni aktif plan açılır (`notes` taşınır) |
| Aktif plan var, bağlı log **YOK** | **TASLAK**: satırlar yerinde silinip yeniden yazılır (Faz 1b davranışı); kimse bağlı olmadığı için kayıp yoktur |

Dallanma koşulu `public.workout_plan_has_history(plan_id)`'dir.

**Neden "her kaydetme = yeni versiyon" DEĞİL:** üründe ayrı bir "Yayınla" eylemi yok
(tek yazma yolu `save_workout_plan`), bu yüzden her tıklama yeni versiyon üretseydi
`version` "koç kaç kez kaydetti"yi ölçen anlamsız bir sayıya döner ve arşiv görünmez çöple
şişerdi. Copy-on-write ile `version` **anlamlıdır**: v3 = danışan bu plandan üç kez geçti.
Çift tıklama **kendiliğinden** elenir — yayından hemen sonra yeni aktif versiyonun henüz
logu yoktur, ikinci kaydetme taslak dalına düşer.

**Neden RPC imzası değişmedi:** `(uuid[], jsonb) -> integer` korundu; ayrım
parametreden değil **veriden** türetilir. `src/hooks/usePlans.ts` ve
`src/hooks/useWorkoutSession.ts` hiç değişmedi.

**Toplu atama:** `version` GLOBAL değil **danışan başına** sayaçtır — aynı çağrıda
danışan A v3'e, danışan B v1'e gidebilir. Yeni
`workout_plans_client_version_uniq` (`unique (client_id, version)`) bunu şemada kilitler.

**Sıralama:** `workout_plans_one_active_idx` (`unique (client_id) where is_active`) ihlal
edilmez çünkü gövde **önce** eskiyi `is_active=false` yapar, **sonra** yenisini ekler.

### `workout_plan_has_history()` neden `SECURITY DEFINER`

Bu bir **görünürlük** değil **bütünlük** sorusudur — desen
`workout_logs_guard_plan_exercise()` (§4h) ile aynıdır. `INVOKER` olsaydı ve
`workout_logs` RLS'i çağırandan tek bir satırı bile gizleseydi, fonksiyon "geçmiş yok"
der ve `save_workout_plan()` **tam da önlemek için yazıldığı veri kaybını** yapardı:
hata modu **fail-open** olurdu. Döndürdüğü tek şey bir boolean'dır.

### Okuma yolları etkilenmez

`useWorkoutPlan` / `useWorkoutPlanExercises` zaten `.eq('is_active', true).maybeSingle()`
ile okuyor; arşiv satırları bu filtreden geçmez. Arşiv **okunabilir** olmaya devam eder
(danışan kendi arşivini görür) — geçmiş logun bağlı olduğu satır aksi hâlde
çözümlenemezdi.

### Testler

```bash
npm run test:rls   # 104 senaryo (100–104 bu migration'a ait)
```

* **100** — yayınlama: eski plan arşivlenir, satırları korunur, yeni plan `version = eski+1`
* **101** — **EN KRİTİK:** geçmiş `workout_logs.plan_exercise_id` **NULL'a düşmez** ve
  arşiv (eski) versiyona bağlı kalır
* **102** — okuma yolları yayından sonra da **tek** aktif planı görür (`maybeSingle()`
  kırılmaz); arşiv okunabilir ama aktif değil
* **103** — toplu atamada versiyon danışan başına bağımsız ilerler (A v2, B v1); çift
  kaydetme versiyon şişirmez
* **104** — `workout_plans_one_active_idx` ve `workout_plans_client_version_uniq` ihlal
  edilmez; elle ikinci aktif plan yazma denemesi `23505`

> Kırmızı-yeşil doğrulandı: migration'ın `-- DOWN` bloğu uygulanınca 100, 101, 102b ve 103
> **başarısız olur** (101 tam olarak "GECMIS LOGUN PLAN BAGI NULL A DUSTU" mesajıyla).
> 104 bir **koruma** testidir (indeksler zaten vardı), değişiklik dedektörü değildir.

### Geri alma

Migration dosyasının sonunda çalıştırılabilir bir `-- DOWN` bloğu vardır.
**UYARI:** geri alma yukarıdaki veri kaybını **yeniden açar**. Zaten oluşmuş arşiv
versiyonları silinmez (onlara bağlı loglar vardır); okuma yolları `is_active=true`
filtrelediği için görünmezler.

---

## 5. CSV Import (referans katalogları)

Kaynak dosyalar repoda `data/` altındadır (bkz. `data/README.md`):

| CSV | Hedef tablo | Sütunlar |
|---|---|---|
| `data/clean_exercises_v2.csv` | `public.exercises` | `name, body_part, target, equipment, gif_url, image` |
| `data/clean_foods.csv` | `public.food_database` | `name, calories_per_100g` |

### Yöntem A — Studio (uzak proje için en pratik)

Supabase Studio → **Table Editor** → ilgili tablo → **Insert → Import data from CSV**.
`id` sütunu `bigserial` olduğu için CSV'de bulunmamalıdır (zaten yok).

### Yöntem B — `psql \copy` (yerel)

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "\copy public.exercises (name, body_part, target, equipment, gif_url, image) \
      FROM 'data/clean_exercises_v2.csv' WITH (FORMAT csv, HEADER true)"

psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "\copy public.food_database (name, calories_per_100g) \
      FROM 'data/clean_foods.csv' WITH (FORMAT csv, HEADER true)"
```

> **Kodlama uyarısı:** `clean_exercises_v2.csv` içinde `45Â° side bend` gibi
> bozuk mojibake kayıtlar var (UTF-8 verinin latin1 olarak yeniden kodlanması).
> Import öncesi dosyayı UTF-8'e normalize etmek isterseniz `\copy ... ENCODING 'UTF8'`
> kullanın veya CSV'yi düzeltin.

> **Tekrarlı import:** `name` sütunu `UNIQUE` olduğu için aynı CSV'yi ikinci kez
> yüklemek çakışma hatası verir. Önce geçici tabloya alıp
> `INSERT ... ON CONFLICT (name) DO NOTHING` ile aktarmak en güvenlisidir.

---

## 6. seed.sql

`supabase/seed.sql` **yalnızca yerel geliştirme içindir**. Dosya `auth.users` tablosuna
sabit UUID'ler ve herkesçe bilinen bir parola ile doğrudan kullanıcı yazar.

| E-posta | Rol | Parola |
|---|---|---|
| `coach@example.com` | `coach` (koç) | `Passw0rd!23` |
| `client1@example.com` | `client` (danışan) | `Passw0rd!23` |
| `client2@example.com` | `client` (danışan) | `Passw0rd!23` |

Her danışan için üretilen veri: 6 form check (6 haftalık kilo trendi), 14 günlük log,
20 antrenman seti, 3 bildirim, 4 mesaj ve 1 bekleyen program onayı. Ayrıca 10 örnek
besin ve 10 örnek egzersiz eklenir.

Mesajlarda `client_id` / `read_at` / `kind` **açıkça** yazılır (backfill'e güvenilmez:
`db reset` akışında migration'lar seed'den önce koşar). En az bir **okunmamış**
(`read_at IS NULL`) mesaj bilerek bırakılmıştır ki okunmamış sayacı gerçek veriyle
denenebilsin.

Form check'lerde `status` / `coach_feedback` / `reviewed_at` / `reviewed_by` de aynı
sebeple **açıkça** yazılır: Danışan 1'in ilk 4 haftası ve Danışan 2'nin ilk 5 haftası
`reviewed` (koç kimliği + gerçekçi tarih + geri bildirim metniyle), kalanlar bilerek
`pending` bırakılmıştır — böylece koçun **bekleyen kuyruğu** (`status = 'pending'`)
`db reset` sonrası boş olmaz. Seed `postgres` rolüyle koştuğu için `auth.uid()` NULL'dır
ve `form_checks_guard_review` trigger'ı bu tarihleri `now()`a **ezmez** (bkz. 4d).

Tüm bloklar idempotenttir (`ON CONFLICT DO NOTHING` / `NOT EXISTS`), dosyayı birden çok
kez çalıştırmak veri çoğaltmaz.

Çalıştırma:

```bash
supabase db reset      # migration'lar + seed
```

---

## 7. Bilinen Uyumsuzluklar (kod tarafında düzeltilmeli)

1. **[Düzeltildi] `daily_logs` günde tek kayıt.** `(client_id, log_date)` UNIQUE'tir
   (kısıt adı `daily_logs_client_date_uniq`; eski kolon adı `student_id`,
   `20260817090000_rename_roles.sql` ile `client_id` oldu). Daha önce `DailyLogTab`
   düz `insert` kullanıyor, aynı gün ikinci girişte `23505 duplicate key` hatası
   veriyordu. Artık `src/hooks/useDailyLogs.ts` içindeki `useCreateDailyLog`,
   `upsert(payload, { onConflict: 'client_id,log_date' })` kullanıyor ve
   `src/components/tabs/DailyLogTab.tsx` bu hook üzerinden yazıyor.

2. **[Düzeltildi] `sendNotificationAction` var olmayan sütuna yazıyordu.**
   Eskiden `notifications` tablosuna şemada olmayan `target_student_id` alanı insert
   ediliyordu (doğru sütun o zaman `student_id`'ydi, `20260817090000_rename_roles.sql`
   ile `client_id` oldu). `src/app/actions.ts` dosyasına (artık TypeScript) taşınan
   `sendNotificationAction` artık doğru `client_id` sütununu kullanıyor;
   `target === 'all'` durumunda `role='client'` profilleri sorgulanıp toplu insert
   ediliyor. (Aktif form bileşeni `src/components/NotificationForm.tsx`.)

3. **`createStudentAction` çift profil oluşturuyor.** `auth.admin.createUser` sonrası
   trigger zaten profil açıyor; ardından gelen `insert` çakışırdı. Trigger
   `ON CONFLICT (id) DO NOTHING` ile korumalı, ancak `full_name` boş kalabilir —
   `insert` yerine `update` kullanmak daha doğru olur.
   Ayrıca `createUser` çağrısına `user_metadata: { full_name, role: 'client' }`
   eklenirse trigger doğru adı ilk seferde yazar.

4. **[Düzeltildi] Danışan koçun profilini göremiyordu** (`docs/DISCOVERY.md` §15.2 #1).
   `profiles_select` yalnızca `id = auth.uid() OR is_coach()` idi; `useCoachId()`
   (`src/hooks/useMessages.ts`) `null` dönüyor, `MessagesTab`'da `chatPartnerId` boş
   kalıyor ve danışan koçla hiç mesajlaşamıyordu.
   `20260816100000_fix_rls_visibility.sql` politikaya `OR role = 'coach'` koşulunu ekledi
   (o migration zamanında henüz `admin` etiketiydi; `20260817090000_rename_roles.sql`
   enum'u `coach` olarak yeniden adlandırdığında ifade otomatik güncellendi).

5. **[Düzeltildi] Danışan koça bildirim oluşturamıyordu** (`docs/DISCOVERY.md` §15.2 #2).
   `notifications_insert` `WITH CHECK` alıcının `auth.uid()` olmasını şart koşuyordu, bu
   yüzden `useSubmitProgramForApproval` koça "onay bekliyor" bildirimi yazamıyordu.
   `20260816100000_fix_rls_visibility.sql` `public.is_coach_profile(client_id)` koşulunu
   ekledi (o zamanki kolon adıyla `student_id`, sonradan `client_id` oldu); danışandan
   danışana bildirim hâlâ reddedilir.

6. **`anon` rolü kilitli.** Giriş yapmamış istemci `public` şemadaki hiçbir tabloyu
   okuyamaz. Server-side render'da veri çekmek gerekirse `getSupabaseAdmin()`
   (service_role) veya kullanıcı oturumunu taşıyan bir server client kullanılmalıdır.
