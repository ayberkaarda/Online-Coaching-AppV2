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
│   └── 20260817100000_private_storage.sql        # bucket'lar private + *_url → *_path + imzalı okuma
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

Tüm tablolarda RLS **açıktır**. Politikalar yalnızca `authenticated` rolüne verilmiştir;
`anon` (giriş yapmamış ziyaretçi) rolünden `public` şemadaki tüm tablo/sequence/fonksiyon
yetkileri **REVOKE** edilmiştir.

Kısaltmalar: **S** = satır sahibi (`client_id`/`id` = `auth.uid()`), **K** = koç (`is_coach()`)

| Tablo | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | S veya K **veya satırın rolü `coach`** (koç profili herkese görünür) | Sadece K (normalde trigger yapar) | S (**rol sütunu değiştirilemez**) veya K | Sadece K |
| `notifications` | S veya K | K **veya** kendi adına (`client_id = auth.uid()`) **veya alıcı koçsa** (`is_coach_profile(client_id)`) | S veya K (`is_read`) | Sadece K |
| `form_checks` | S veya K | Sadece kendi adına | S veya K | S veya K |
| `daily_logs` | S veya K | Sadece kendi adına | S veya K | S veya K |
| `workout_logs` | S veya K | Sadece kendi adına | S veya K | S veya K |
| `program_approvals` | S veya K | Sadece kendi adına | **Sadece K** (onay/ret) | S veya K |
| `messages` | gönderen **veya** alıcı veya K | `sender_id = auth.uid()` | **Sadece alıcı** (`is_read`) | gönderen veya K |
| `exercises` | Tüm `authenticated` | Sadece K | Sadece K | Sadece K |
| `food_database` | Tüm `authenticated` | Sadece K | Sadece K | Sadece K |

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

### Yetki yükseltme koruması

`profiles` UPDATE politikasının `WITH CHECK` ifadesi
`role = public.profile_role(auth.uid())` kontrolünü yapar — yani bir danışan kendi
satırını güncelleyebilir ama **rolünü `coach`'a çeviremez**. Yalnızca koç rol değiştirebilir.
(`public.profile_role()` de özyinelemeyi önlemek için `SECURITY DEFINER`'dır.)

### Storage politikaları

Her iki bucket da **PRIVATE**'tır (`20260817100000_private_storage.sql`).

| Bucket | Public | Okuma (SELECT) | Yazma / Silme |
|---|---|---|---|
| `avatars` | **hayır** | sahibi (`<auth.uid()>-...`) veya koç; `anon` **hiç** | dosya adı `<auth.uid()>-...` ile başlamalı, veya koç |
| `form-checks-media` | **hayır** | sahibi (`poses/<auth.uid()>-...`) veya koç; `anon` **hiç** | yol `poses/<auth.uid()>-...` olmalı, veya koç |

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
| `public.is_coach_profile` | `(target uuid) -> boolean` | `SECURITY DEFINER`, `STABLE`. Yalnız `notifications_insert` içinde kullanılır; `profiles` politikalarında **çağrılmamalıdır** (özyineleme) |
| `public.increment_streak` | `(user_id uuid) -> integer` | **İmza değiştirilemez** — kod `rpc('increment_streak', { user_id })` çağırıyor |

`increment_streak` mantığı: `last_checkin_at` bugünse seri değişmez, dünse +1,
daha eski/`NULL` ise 1'e sıfırlanır; her durumda `last_checkin_at = now()`.
Yalnızca `auth.uid() = user_id` veya koç çalıştırabilir, aksi hâlde `42501` hatası.

> **Politika adları:** `*_admin` ile biten tüm RLS politika adları da aynı migration'da
> `*_coach` olarak yeniden adlandırıldı (ör. `profiles_insert_admin` → `profiles_insert_coach`,
> `exercises_update_admin` → `exercises_update_coach`). Bu yalnızca kozmetiktir — politika
> ifadeleri (yukarıdaki tablo) değişmedi.

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
