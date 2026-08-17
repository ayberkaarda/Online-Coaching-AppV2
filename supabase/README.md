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
│   └── 20260817130000_nutrition_plan_tables.sql  # normalize beslenme planı tabloları + dönüşüm + RPC
├── tests/
│   ├── rls.test.sql            # 35 RLS senaryosu       (npm run test:rls)
│   └── transform.test.sql      # 19 dönüşüm senaryosu   (npm run test:transform)
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
| `public.explode_plan_day` | `(p_plan_id uuid, p_day text, p_text text) -> integer` | `SECURITY INVOKER`. **TEK plan ayrıştırıcısı** — hem veri dönüşümü hem `save_workout_plan` bunu kullanır |
| `public.save_workout_plan` | `(p_client_ids uuid[], p_plan jsonb) -> integer` | `SECURITY INVOKER` (RLS uygulanır). `p_plan` = `{"Pazartesi": "metin", ...}`. Etkilenen danışan sayısını döner |
| `public.migrate_workout_plans_from_profiles` | `() -> table(profiles_converted int, exercises_inserted int)` | `SECURITY DEFINER`, yalnız `service_role`. Idempotent veri dönüşümü; `transform.test.sql` bunu çağırır |
| `public.explode_nutrition_day` | `(p_plan_id uuid, p_day text, p_entry jsonb) -> integer` | `SECURITY INVOKER`. **TEK beslenme günü yazıcısı** — hem dönüşüm hem `save_nutrition_plan` bunu kullanır. Ayrıştırma YAPMAZ |
| `public.save_nutrition_plan` | `(p_client_ids uuid[], p_plan jsonb) -> integer` | `SECURITY INVOKER` (RLS uygulanır). `p_plan` = `{"Pazartesi": {"items": "metin", "total": 1850}, ...}`. Etkilenen danışan sayısını döner |
| `public.migrate_nutrition_plans_from_profiles` | `() -> table(profiles_converted int, meals_inserted int)` | `SECURITY DEFINER`, yalnız `service_role`. Idempotent veri dönüşümü; `transform.test.sql` bunu çağırır |

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

### `save_workout_plan()` semantiği (Faz 1b)

* Aktif plan satırı yoksa `version = 1` ile oluşturulur; **varsa o kullanılır**.
* Planın **tüm** `workout_plan_exercises` satırları silinip yeniden yazılır.
* **Yeni versiyon ÜRETİLMEZ** — versiyon-yayınlama semantiği Faz 2'dedir.
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
npm run test:rls         # 35 senaryo (20–27 bu tablolara ait)
npm run test:transform   # 19 senaryo (1–10 bu tablolara ait: dönüşüm + round-trip + idempotency)
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

### `save_nutrition_plan()` semantiği (Faz 1b)

`save_workout_plan()` ile birebir aynı desendedir: aktif plan yoksa `version = 1` ile
oluşturulur (varsa o kullanılır), planın **tüm** öğün satırları silinip yeniden yazılır,
**yeni versiyon üretilmez**, `SECURITY INVOKER` olduğu için RLS ihlali hatayı yükseltir
(çağrı atomiktir). Geçersiz gün anahtarı **hata verir** ve doğrulama hiçbir satır yazılmadan
**önce, toptan** yapılır; dönüşüm yolunda ise bilinmeyen gün atlanır.

### Testler

```bash
npm run test:rls         # 35 senaryo (28–35 bu tablolara ait)
npm run test:transform   # 19 senaryo (11–19 bu tablolara ait)
```

### Geri alma

Migration dosyasının sonunda yorum bloğu hâlinde çalıştırılabilir bir `-- DOWN`
script'i vardır. Veri kaybı yaratmaz: kaynak veri `profiles.nutrition_plan` kolonunda
durmaya devam eder.

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
