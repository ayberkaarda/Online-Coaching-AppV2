# Erişim Kontrolü, IDOR ve RLS Denetimi

**Faz:** 1.5 — Güvenlik Denetimi
**Kapsam:** Yatay yetki (IDOR), dikey yetki, kütlesel atama, `service_role` sızıntısı, Storage
erişim kontrolü, RLS test matrisi boşlukları
**Tarih:** 2026-08-17
**Yöntem:** Statik inceleme + canlı SQL rol taklidi (`set local role authenticated` +
`set local request.jwt.claims`) + gerçek HTTP istekleri (GoTrue / PostgREST / Storage API)
**Ortam:** Yerel Supabase yığını (`supabase_db_my-coaching-app`, PostgreSQL 15)
**Kimlikler:** koç `1111…`, danışan A `2222…`, danışan B `3333…`
**Durum:** Bu tur yalnızca denetimdir — hiçbir düzeltme uygulanmamıştır, tüm bulgular `open`.

Tüm yazma testleri `BEGIN; … ROLLBACK;` içinde çalıştırılmıştır; kalıcı veri değişikliği yoktur.

---

## 1. Özet

| Severity   | Adet   |
| ---------- | ------ |
| Critical   | 0      |
| High       | 2      |
| Medium     | 3      |
| Low        | 7      |
| **Toplam** | **12** |

En ciddi üç bulgu:

1. **AC-01 (High)** — `program_approvals` INSERT yolunda sunucu tarafı koruma yok: danışan kendi
   onay kaydını `status='approved'` ve `reviewed_by=<koç id>` ile yazabiliyor. Onay kapısı
   tamamen etkisiz.
2. **AC-02 (High)** — `public.handle_new_user()` rolü kullanıcı denetimindeki
   `raw_user_meta_data.role` alanından alıyor. Kayıt (signup) açılırsa herkes `coach` olur. Bugün
   yalnızca `GOTRUE_DISABLE_SIGNUP=true` ayarıyla engelleniyor.
3. **AC-03 (Medium)** — `authenticated` rolüne tüm `public` tablolarda `TRUNCATE` verilmiş;
   `TRUNCATE` RLS'e tabi değildir ve tüm kullanıcıların verisini siler.

---

## 2. Bulgular

| #     | Severity | Başlık                                                                    | Kanıt                                                       | Etki                                                                                                     | Düzeltme önerisi                                                                                                              | Durum |
| ----- | -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- |
| AC-01 | High     | `program_approvals` onay kapısı INSERT ile atlatılabiliyor                | Canlı SQL W5 / W6 / W7 (§3.1)                               | Danışan, koç hiç dokunmadan kendi programını "koç onayladı" kaydıyla işaretler; koçun kuyruğunu boşaltır | `form_checks_guard_review()` desenli BEFORE INSERT/UPDATE trigger + `status='pending'` zorunluluğu + review-consistency CHECK | open  |
| AC-02 | High     | `handle_new_user()` rolü kullanıcı metadata'sından alıyor                 | Fonksiyon gövdesi + canlı simülasyon (§3.2) + HTTP H10      | Signup/davet/OTP açılırsa saldırgan `coach` olur, tüm danışan verisine erişir                            | `v_role := 'client'` sabitle; koç yükseltmesi yalnızca ayrı bir admin (service_role) yolundan yapılsın                        | open  |
| AC-03 | Medium   | `authenticated` rolünde `TRUNCATE` yetkisi (RLS baypas)                   | Canlı SQL G1 + `role_table_grants` dökümü (§3.3)            | RLS'e tabi olmayan toplu silme primitifi; bugün uygulama yüzeyinden erişilebilir yol yok                 | `revoke truncate, references, trigger on all tables in schema public from authenticated;`                                     | open  |
| AC-04 | Medium   | Mesaj alıcısı gövdeyi / `kind` / `created_at` değiştirebiliyor            | Canlı SQL M1 / M5 (§3.4)                                    | Danışan koçun mesaj metnini tahrif eder; `edited_at` olmadığı için fark edilemez                         | `messages_update_receiver` yerine sütun kısıtlı trigger: yalnızca `read_at` / `is_read` değişebilsin                          | open  |
| AC-05 | Medium   | Danışan koçun bildirim akışına keyfi içerik enjekte edebiliyor            | Canlı SQL P3 (§3.5)                                         | Kimlik avı / sosyal mühendislik metni koçun bildirim listesinde görünür; hız sınırı yok                  | Danışan yolunda `title`/`message`'ı sabit şablona bağla veya RPC'ye taşı                                                      | open  |
| AC-06 | Low      | `FORCE ROW LEVEL SECURITY` hiçbir tabloda açık değil                      | `pg_class` dökümü + canlı FORCE testi (§3.6)                | Bugün **etkisiz**: sahip `postgres` zaten `BYPASSRLS`; gerçek sömürü senaryosu yok                       | Savunma derinliği için eklensin; asıl kazanç `postgres`'ten BYPASSRLS alınırsa doğar                                          | open  |
| AC-07 | Low      | `program_approvals.reviewed_by` istemciden geliyor                        | `src/hooks/useProgramApprovals.ts:105-113` + canlı SQL P8   | Denetim izi sunucudan türetilmiyor; `reviewed_by` keyfi uuid olabiliyor                                  | Trigger `reviewed_by := auth.uid()`, `reviewed_at := now()` yazsın (form_checks deseni)                                       | open  |
| AC-08 | Low      | Danışan `current_streak` / `last_checkin_at` alanlarını keyfi yazabiliyor | Canlı SQL R11 (§3.8)                                        | `increment_streak()` yetki kontrolü yapıyor ama doğrudan UPDATE yolu açık; seri sahtelenir               | Sütun sabitleme trigger'ı: streak yalnızca RPC ile değişsin                                                                   | open  |
| AC-09 | Low      | Danışan `profiles.email`'i `auth.users` ile desenkronize edebiliyor       | Canlı SQL P9 (§3.8)                                         | Koç panelinde görünen e-posta gerçek hesap e-postası olmayabilir                                         | `email` sütunu `profiles_update_self` yolunda sabitlensin; tek yazma kaynağı `sync_profile_email()` olsun                     | open  |
| AC-10 | Low      | Danışan kendi bildiriminin metnini değiştirebiliyor                       | Canlı SQL P4 (§3.8)                                         | Koçun duyuru metni danışanın kendi kopyasında tahrif edilir (başkasına sızmaz)                           | `notifications_update` yalnızca `is_read` sütununa izin versin                                                                | open  |
| AC-11 | Low      | Sunucu ortam değişkeni **adları** istemci paketinde                       | `.next/static/chunks/440-322ddb754c911b00.js` (§3.9)        | Değer sızmıyor; yalnızca `SUPABASE_SERVICE_ROLE_KEY` / `AI_BACKEND_API_KEY` isimleri görünür             | `serverSchema`'yı `import 'server-only'` işaretli ayrı modüle taşı                                                            | open  |
| AC-12 | Low      | Denetim yerel yığında yapıldı; `.env.local` uzak projeye bakıyor          | `.env.local:1` → `https://nxftmxkpmuyeelrmwofv.supabase.co` | Yapılandırmaya bağlı bulgular (özellikle AC-02) hosted projede ayrıca doğrulanmalı                       | Hosted projede `GOTRUE_DISABLE_SIGNUP`, tablo sahipliği ve grant'lar aynı sorgularla teyit edilsin                            | open  |

---

## 3. Kanıtlar

### 3.1 AC-01 — `program_approvals` onay kapısı atlatılabiliyor

Politikalar (`pg_policies`):

```
program_approvals_insert        | INSERT | (client_id = auth.uid())
program_approvals_update_coach  | UPDATE | is_coach()
program_approvals_delete        | DELETE | ((client_id = auth.uid()) OR is_coach())
```

Tabloda `status` için CHECK kısıtı **yok**, trigger **yok** (`pg_constraint` contype='c' dökümünde
`program_approvals` hiç geçmiyor; `pg_trigger` dökümünde yalnızca `form_checks`, `messages`,
`nutrition_plans`, `profiles`, `workout_plans` var).

UPDATE koça kilitli — doğru çalışıyor:

```
===== W6: A, mevcut program_approvals satirinin statusunu update edebilir mi? =====
W6 etkilenen=0
```

Ama INSERT tamamen serbest:

```
===== W5: A, kendi program_approvals satirini status=approved olarak ekleyebilir mi? =====
W5 INSERT BASARILI status=approved reviewed_by=11111111-1111-1111-1111-111111111111
INSERT 0 1
```

DELETE + yeniden INSERT ile UPDATE kısıtı tümüyle etkisiz:

```
===== W7: A, kendi program_approvals satirini SILIP approved olarak yeniden ekleyebilir mi? =====
W7 silinen=1
W7 yeniden ekleme BASARILI status=approved
INSERT 0 1
```

Yatay sınır ise sağlam:

```
===== P1: A, program_approvals a client_id=B ile satir ekleyebilir mi? =====
ERROR:  new row violates row-level security policy for table "program_approvals"
```

**Somut sömürü:** kimliği doğrulanmış herhangi bir danışan, tek bir
`POST /rest/v1/program_approvals` isteğiyle
`{"client_id":"<kendi id>","workout_data":{…},"status":"approved","reviewed_by":"<koç id>","reviewed_at":"…"}`
yazabilir. `src/components/tabs/WorkoutTab.tsx:112` → `usePendingApprovals(targetId)` yalnızca
`status='pending'` çektiği için danışan kendi bekleyen kaydını silip `approved` olarak yeniden
yazarak koçun onay kuyruğunu sessizce boşaltır; veritabanında koçun hiç dokunmadığı bir programın
"koç tarafından onaylandığını" iddia eden kayıt oluşur.

Not: danışanın kendi antrenman planına yazabilmesi ayrı bir bilinçli sapmadır (§5); bu bulgu plan
yazma yetkisi hakkında değil, **onay kaydının sahtelenebilmesi** hakkındadır.

### 3.2 AC-02 — Rol, kullanıcı denetimindeki metadata'dan geliyor

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_role public.user_role;
begin
  begin
    v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client')::public.user_role;
  exception when invalid_text_representation then v_role := 'client'::public.user_role;
  end;
  insert into public.profiles (id, email, full_name, role) values (new.id, new.email, …, v_role)
  on conflict (id) do nothing;
  return new;
end; $function$
```

Trigger: `auth.users` → `on_auth_user_created` → `handle_new_user`. `raw_user_meta_data`, GoTrue'da
`/auth/v1/signup` gövdesindeki `data` alanından doldurulur — tamamen saldırgan denetimindedir.

```
BEGIN;
insert into auth.users (…, raw_user_meta_data, …)
values (…, '{"full_name":"Saldirgan","role":"coach"}'::jsonb, …);
-- ESCALATION TEST: yeni profil rolu = coach
ROLLBACK;
```

Bugünkü tek engel yapılandırmadır:

```
$ docker exec supabase_auth_my-coaching-app printenv | grep DISABLE_SIGNUP
GOTRUE_DISABLE_SIGNUP=true

$ curl -X POST .../auth/v1/signup -d '{"email":"attacker@example.com","password":"…","data":{"role":"coach"}}'
{"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}
```

**Somut sömürü:** `enable_signup = true` yapıldığı an (veya davet/magic-link ile kullanıcı
oluşturma açıldığında), herhangi bir kişi `data.role = "coach"` göndererek koç olur ve
`is_coach()` üzerinden tüm danışanların profil, form check, mesaj, günlük, plan ve onay verisine
erişir. `docs/adr/0003-rol-enum-degerlerinin-korunmasi.md` bu riski kapsamıyor.

Doğrulanan olumlu taraf — mevcut oturumda metadata güncellemek rolü değiştirmiyor:

```
=== H8: A, kendi rolunu updateUser ile coach yapmayi deniyor ===
{"id":"22222222-…","role":"authenticated", …}       <- HTTP 200
=== H9: updateUser sonrasi profiles.role ===
[{"id":"22222222-…","role":"client"}]                <- rol DEĞİŞMEDİ
```

### 3.3 AC-03 — `authenticated` rolünde `TRUNCATE` yetkisi

`information_schema.role_table_grants` — 13 `public` tablosunun hepsinde aynı satır:

```
authenticated|daily_logs|DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated|profiles  |DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
… (13 tablo)
```

RLS yalnızca SELECT/INSERT/UPDATE/DELETE için tanımlanır; `TRUNCATE` RLS'e tabi değildir:

```
===== G1: authenticated rolu TRUNCATE ile RLS yi bypass edebilir mi? =====
TRUNCATE TABLE
G1 TRUNCATE SONRASI kalan satir = 0
ROLLBACK
G1 rollback sonrasi (postgres) workout_logs = 40
```

**Sömürülebilirlik (abartmadan):** PostgREST ham SQL çalıştırmaz; `authenticated`'a EXECUTE
verilmiş RPC'lerin (`save_workout_plan`, `save_nutrition_plan`, `explode_plan_day`,
`explode_nutrition_day`, `increment_streak`, `is_coach`, `is_coach_profile`, `profile_role`)
hiçbiri dinamik SQL kullanmıyor. Bugün uygulama yüzeyinden ulaşılabilir yol yoktur. Bu bir
en-az-yetki ihlali ve "tek enjeksiyon hatası uzaklıkta tam veri kaybı" riskidir — bu yüzden
Medium.

```
===== G2: authenticated public semasinda nesne olusturabilir mi? =====
ERROR:  permission denied for schema public
G2b public sema CREATE yetkisi (authenticated) = false
```

### 3.4 AC-04 — Mesaj alıcısı mesaj gövdesini değiştirebiliyor

```
public.messages|messages_update_receiver|UPDATE|{authenticated}|(receiver_id = auth.uid())|(receiver_id = auth.uid())
```

Politika satır seviyesindedir, sütun kısıtı yoktur:

```
===== M1: A, KENDISINE gelen mesajin metnini degistirebilir mi? =====
M1 etkilenen=3

===== M5: A, aldigi mesajin kind/created_at alanlarini degistirebilir mi? =====
M5 etkilenen=3

===== M4: A, kind=system mesaj uretebilir mi? =====
M4 BASARILI kind=system
```

`sender_id` değiştirme trigger tarafından yakalanıyor (kısmi koruma):

```
===== M6 =====
ERROR:  messages: konusmanin danisan tarafi belirlenemedi (gonderen rolu=client, alici rolu=client).
```

`messages` tablosunda `edited_at` yoktur; koç aynı satırı okuduğu için tahrif edilmiş metni
orijinal sanır. `useMarkConversationRead` (`src/hooks/useMessages.ts:269-277`) yalnızca `read_at` +
`is_read` yazıyor — uygulama doğru, açık olan **sunucu sözleşmesidir**.

### 3.5 AC-05 — Danışan koçun bildirim akışına keyfi metin yazabiliyor

```
notifications_insert|INSERT|(is_coach() OR (client_id = auth.uid()) OR is_coach_profile(client_id))
```

`is_coach_profile(client_id)` dalı danışanın koç kimliğine bildirim yazmasına izin verir; içerik
doğrulaması yoktur:

```
===== P3 (RETURNING olmadan) =====
insert into public.notifications (client_id, title, message)
values ('11111111-…','ACIL: Sifreni sifirla','https://kotu-site.example/reset');
INSERT 0 1
-- ekleme sonrasi A bu satiri gorebiliyor mu:  A nin gordugu koc bildirimi = 0
```

Not: aynı ifade `RETURNING` ile çalıştırıldığında `notifications_select` devreye girip hata verir —
akış "yaz ama okuma" biçimindedir. Bu bir engel değildir:
`supabase.from('notifications').insert(rows)` zaten `RETURNING` kullanmaz
(`src/hooks/useProgramApprovals.ts:57`, `src/hooks/useNotifications.ts:87`). Uygulamada mesaj sabit
şablondur, ama sunucuda hiçbir kısıt yoktur.

### 3.6 AC-06 — `FORCE ROW LEVEL SECURITY` yok (etkisi sınırlı)

```
daily_logs|t|f          nutrition_plan_meals|t|f      workout_logs|t|f
exercises|t|f           nutrition_plans|t|f           workout_plan_exercises|t|f
food_database|t|f       profiles|t|f                  workout_plans|t|f
form_checks|t|f         program_approvals|t|f
messages|t|f            notifications|t|f
```

| Soru                             | Cevap                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablo sahibi kim?                | 13 tablonun tamamında `postgres` (`pg_tables.tableowner`)                                                                                                   |
| Uygulama hangi rolle bağlanıyor? | `anon` / `authenticated` (PostgREST `authenticator` → `SET ROLE`); `src/lib/supabase/client.ts` ve `server.ts` yalnızca anon key kullanır, admin client yok |
| `postgres` BYPASSRLS mi?         | **Evet** (`rolbypassrls = t`)                                                                                                                               |
| `service_role` BYPASSRLS mi?     | **Evet** (`rolbypassrls = t`)                                                                                                                               |
| `authenticated` BYPASSRLS mi?    | Hayır (`rolbypassrls = f`)                                                                                                                                  |

`BYPASSRLS`, `FORCE ROW LEVEL SECURITY`'yi ezer. Canlı kanıt:

```
BEGIN;
alter table public.workout_logs force row level security;
set local role postgres;
set local request.jwt.claims = '{"sub":"22222222-…","role":"authenticated"}';
FORCE acikken postgres in gordugu workout_logs = 40 (RLS uygulansaydi 20 civari olurdu)
postgres rolbypassrls = true
ROLLBACK
```

**Sonuç:** savunma derinliği eksiği, sömürülebilir zafiyet değil. `service_role` zaten BYPASSRLS
ile baypas eder ve FORCE onu kapsamaz. Severity **Low**. FORCE'un gerçek değeri, ileride
`postgres`'ten BYPASSRLS alınırsa ortaya çıkar.

### 3.7 AC-07 — `reviewed_by` istemciden geliyor

`src/hooks/useProgramApprovals.ts:105-113`:

```ts
.from('program_approvals')
.update({
  status: 'approved',
  reviewed_by: reviewerId ?? null,
  reviewed_at: new Date().toISOString(),
})
.eq('id', approvalId)
```

```
===== P8: KOC, reviewed_by yi keyfi uuid yapabilir mi? =====
P8 etkilenen=1        (status='approved', reviewed_by='22222222-…' yazıldı)
```

Karşılaştırma: `form_checks` tarafında denetim izi sunucudan doldurulur
(`form_checks_guard_review()` → `new.reviewed_by := auth.uid()`) ve
`form_checks_review_consistency_chk` tutarlılığı zorlar. `program_approvals` bu desenden yoksundur.

### 3.8 AC-08 / AC-09 / AC-10 — `profiles` ve `notifications` sütun kısıtı eksikleri

```
===== R11 ===== R11 yeni streak=9999
===== P9  ===== P9 yeni email=sahte@example.com
===== P4  ===== P4 etkilenen=3
```

`profiles_update_self` WITH CHECK yalnızca `role` sütununu sabitler
(`(id = auth.uid()) AND (role = profile_role(auth.uid()))`); diğer tüm sütunlar serbesttir.
`increment_streak()` yetki kontrolü yapmasına rağmen (§4.3, R13) doğrudan UPDATE yolu bu kontrolü
anlamsız kılar.

### 3.9 AC-11 — İstemci paketi taraması

`.next` build mevcut (390 MB):

```
1) 'service_role' literal in client chunks:      (0 eslesme)
3) JWT taramasi (.next/static):
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24i…
   -> payload decode: {"iss":"supabase-demo","role":"anon","exp":1983812996}
5) server chunks service_role:                   (0 eslesme)
```

`service_role` JWT'si veya anahtarı istemci paketinde **yoktur**. Tek bulgu, `src/env.ts` içindeki
`serverSchema`'nın istemci grafiğine girmesi:

```js
n.Ik({SUPABASE_SERVICE_ROLE_KEY:n.Yj().min(20).optional(),AI_BACKEND_URL:…,AI_BACKEND_API_KEY:n.Yj().optional(),…})
```

Değer sızıntısı yok; `getServerEnv()` tarayıcıda çağrılırsa fırlatır. `src/lib/supabase/` altında
admin client bulunmadığı doğrulandı — yalnızca `client.ts` (anon singleton) ve `server.ts` (anon +
isteğe bağlı kullanıcı Bearer token'ı). `SUPABASE_SERVICE_ROLE_KEY` yalnızca
`scripts/import-catalog.mjs` (offline CLI) tarafından okunuyor.

---

## 4. Canlı SQL / HTTP ile doğrulanmış güvenli davranışlar

### 4.1 Yatay yetki (IDOR) — okuma

```
T0 auth.uid()=22222222-… current_user=authenticated
T1  profiles gorunen = 2      (kendisi + koç; B YOK)
T1b gorunen: 11111111-…=coach, 22222222-…=client
T2  B daily_logs = 0            T7  B nutrition_plans = 0
T3  B form_checks = 0           T8  B program_approvals = 0
T4  B workout_logs = 0          T9  B workout_plan_exercises = 0
T5  B messages = 0              T10 B nutrition_plan_meals = 0
T6  B workout_plans = 0         T11 B notifications = 0
```

Pozitif kontrol (A yalnızca kendi satırlarını sayıyor):

```
A'nin gordugu:  wpe = 15,  npm = 7,  messages = 6
Gercek toplam:  wpe = 25,  npm = 14, messages = 10
Plan sahipleri: 22222222-…(15 egzersiz), 33333333-…(10 egzersiz)
```

Koç pozitif kontrolü (ADR-0007 gereği hepsini görmeli):

```
P6 koc: profiles=3 form_checks=12 messages=10 wpe=25 npm=14 approvals=3
```

### 4.2 Yatay yetki (IDOR) — yazma

| Test                                                         | Sonuç                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| W2 — A, B profilini günceller                                | `etkilenen = 0`                                                               |
| W3 — A, B için `workout_plans` ekler                         | `ERROR: new row violates row-level security policy for table "workout_plans"` |
| R5 — A, B'nin `plan_id`'siyle `workout_plan_exercises` ekler | `ERROR: … for table "workout_plan_exercises"`                                 |
| R6 — A, B'nin `plan_id`'siyle `nutrition_plan_meals` ekler   | `ERROR: … for table "nutrition_plan_meals"`                                   |
| R7 — A, B'nin `daily_logs` satırını günceller                | `etkilenen = 0`                                                               |
| R8 — A, kendi `daily_logs.client_id`'sini B yapar            | `ERROR: … for table "daily_logs"`                                             |
| R9 — A, kendi `workout_plans.client_id`'sini B yapar         | `ERROR: … for table "workout_plans"`                                          |
| G5 — A `delete from workout_plan_exercises` (WHERE'siz)      | `silinen = 15` — yalnızca kendi satırları (B'nin 10 satırı korunur)           |
| G6 — A, B'nin `workout_plans` satırını siler                 | `silinen = 0`                                                                 |
| F4 — A, B'nin `form_checks` satırını siler                   | `silinen = 0`                                                                 |
| P1 — A, `program_approvals`'a `client_id=B` yazar            | `ERROR: … for table "program_approvals"`                                      |
| P2 — A, `daily_logs` UPSERT ile B satırını ezer              | `ERROR: … for table "daily_logs"`                                             |
| P5 — A, B'nin profilini siler                                | `silinen = 0`                                                                 |
| N1 — A, B'ye bildirim yazar                                  | `ERROR: … for table "notifications"`                                          |
| M3 — A, B'ye doğrudan mesaj gönderir                         | `ERROR: messages: konusmanin danisan tarafi belirlenemedi …`                  |

### 4.3 Dikey yetki

| Test                                                     | Sonuç                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| W1 — A kendi rolünü `coach` yapar                        | `ERROR: new row violates row-level security policy for table "profiles"` |
| H8/H9 — A, `PUT /auth/v1/user` ile `data.role='coach'`   | HTTP 200 ama `profiles.role` **`client` kalır**                          |
| F1 — A kendi form check'ini `reviewed` yapar             | `ERROR: form_checks: danisan inceleme alanlarini … degistiremez`         |
| F2 — A yeni form check'i `status='reviewed'` ile ekler   | `ERROR: … Yeni form check her zaman 'pending' olarak olusur`             |
| F3 — A yeni form check'e yalnızca `coach_feedback` verir | `ERROR: … belirleyemez`                                                  |
| M2 — A, `sender_id=koç` ile mesaj yazar                  | `ERROR: … for table "messages"`                                          |
| R10 — A, `exercises` kataloğuna satır ekler              | `ERROR: … for table "exercises"`                                         |
| R13 — A, `increment_streak(B)` çağırır                   | `ERROR: increment_streak: bu kullanıcı için yetkiniz yok.`               |
| G2 — `authenticated` `public` şemasında tablo oluşturur  | `ERROR: permission denied for schema public`                             |
| P10 — JWT claim'inde `"role":"service_role"`             | Etkisiz; `profiles gorunen = 2` (DB rolü `SET ROLE` ile belirlenir)      |

### 4.4 RPC yetki ve atomiklik

Her ikisi de `SECURITY INVOKER` (`prosecdef = f`):

```
===== R1: A, save_workout_plan ile B icin plan yazabilir mi? =====
ERROR:  new row violates row-level security policy for table "workout_plans"
CONTEXT: … PL/pgSQL function save_workout_plan(uuid[],jsonb) line 40 …

===== R4: A, save_nutrition_plan ile B icin plan yazabilir mi? =====
ERROR:  new row violates row-level security policy for table "nutrition_plans"

===== R2: A, save_workout_plan ile KENDI plani yazabilir mi? =====
R2 sonuc=1     (bilinçli sapma — §5)
```

**Karma listede atomiklik korunuyor.** `[kendi, başkası]` sırasıyla çağrıldığında kendi planı zaten
silinip yeniden yazılmış olsa bile ikinci danışandaki RLS hatası tüm çağrıyı geri alıyor:

```
===== R3b =====
R3b hata oncesi A wpe sayisi=15
NOTICE:  R3b yakalandi: new row violates row-level security policy for table "workout_plans"
R3b hata sonrasi A wpe sayisi=15        <- kısmi yazma YOK
```

### 4.5 Storage erişim kontrolü

```
avatars           | public=f | 5 MiB | image/* allowlist
form-checks-media | public=f | 5 MiB | image/* allowlist
storage.objects rls=true force=false owner=supabase_storage_admin
storage.buckets  rls=true force=false | politika sayisi=0
```

Gerçek Storage API üzerinden (danışan A'nın GoTrue token'ı ile):

```
=== H1: B kendi form-check fotografini yukluyor ===  200
=== H2: A, B nin fotografina imzali adres uretmeye calisiyor ===
{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
=== H3: A, ../ ile path kacisi deneme (yukleme) ===
{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy","code":"AccessDenied"}
=== H4: A, B nin dosyasini public yoldan okumayi deniyor ===  400
=== H5: A, kendi imzasini uretip B nin yoluna path kacisi ile kullanma ===
{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
```

DB seviyesinde aynı sonuç:

```
===== S1 ===== S1 OK: 22222222-…-a.png
===== S2 ===== ERROR: … for table "objects"
===== S3 ===== A nin gordugu form-check nesneleri: yalnızca poses/22222222-…  |  S3b B nesnesi = 0
===== S5 ===== ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead.
===== S6 ===== S6 gorunen bucket sayisi=0 ; ERROR: new row violates row-level security policy for table "buckets"
```

**Yol tabanlı sahiplik kontrolü atlatılamıyor.** Politika deseni
`name like (auth.uid())::text || '-%'` (avatars) ve
`name like 'poses/' || (auth.uid())::text || '-%'` (form-checks). Ön ek `auth.uid()` UUID'sinden
türetildiği için LIKE joker karakteri (`%`, `_`) içeremez — UUID yalnızca hex rakam ve `-` içerir;
desen enjeksiyonu mümkün değildir.

Tek gözlem (savunma derinliği notu, bulgu değil): doğrudan SQL ile `../` içeren nesne adı kabul
ediliyor —

```
===== S4 (dogrudan SQL) =====
S4 KABUL EDILDI: poses/22222222-…-/../33333333-…-x.jpg
```

— fakat gerçek yükleme yolunda Storage API anahtarı normalize ettiği için istek RLS'e takılıyor
(H3, 403). Sömürülebilir kaçış yoktur; yine de politikaların `storage.foldername(name)` tabanlı
normalize kontrole geçirilmesi bunu DB seviyesinde de garanti eder.

`src/lib/storage.ts` imzalı adresleri anon key + kullanıcının kendi oturumuyla üretir; imza üretimi
`storage.objects` SELECT politikasına tabidir (H2/H5 → 404). TTL 3600 sn, `staleTime` TTL/2.

### 4.6 `anon` rolü

```
=== H6: anon ile PostgREST profiles ===  401
===== R12 ===== ERROR:  permission denied for table profiles
```

`role_table_grants` dökümünde `anon` için hiçbir `public` tablo grant'ı yoktur; RLS'ten önce grant
seviyesinde reddediliyor.

### 4.7 Fonksiyon güvenliği

`public` şemasındaki 17 fonksiyonun tamamında `search_path = public, pg_temp` sabitlenmiş
(`proconfig`). `SECURITY DEFINER` olanlar (`is_coach`, `is_coach_profile`, `profile_role`,
`handle_new_user`, `sync_profile_email`, `increment_streak`, `messages_apply_conversation_key`)
yalnızca rol/e-posta okuması veya yetki kontrollü yazma yapıyor. `save_*_plan` ve `explode_*`
`SECURITY INVOKER`. Hiçbirinde dize birleştirmeli dinamik SQL yok.

EXECUTE ACL: `handle_new_user`, `sync_profile_email`, `set_updated_at`, `backfill_*`, `migrate_*`
fonksiyonları `authenticated`'a açık değil. `explode_plan_day` / `explode_nutrition_day` açık ama
`SECURITY INVOKER`:

```
===== G3: A, explode_plan_day ile B nin planina satir enjekte edebilir mi? =====
ERROR:  explode_plan_day: p_plan_id ve p_day zorunludur.
        (B'nin plan id'si RLS yuzunden alt sorguda NULL dondu)
```

### 4.8 Kütlesel atama (mass assignment) incelemesi

`src/hooks/**` altındaki tüm yazma çağrıları çıkarıldı. **Hiçbirinde istemci gövdesi doğrudan
geçirilmiyor** — hepsi açık alan listesi kullanıyor:

| Hook                         | Çağrı    | Yazılan alanlar                                                     | Hassas alan riski                                                  |
| ---------------------------- | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `useWorkoutLogs.ts:49,90`    | `insert` | `client_id, exercise_name, weight_kg, reps, rpe`                    | `client_id` parametreden → RLS WITH CHECK kilitli (R8 doğruladı)   |
| `useDailyLogs.ts:56`         | `upsert` | `client_id, log_date, water_lt, sodium_mg, macros`                  | UPSERT'in UPDATE dalı da RLS'e takılıyor (P2)                      |
| `useFormChecks.ts:104`       | `insert` | `client_id, current_weight, front_pose_path, back_pose_path, notes` | İnceleme alanları yazılmıyor; trigger da engelliyor (F2/F3)        |
| `useProfile.ts:97`           | `update` | yalnızca `avatar_path`                                              | `role` yazılmıyor; RLS WITH CHECK `role`'ü ayrıca sabitliyor (W1)  |
| `useMessages.ts:192`         | `insert` | `sender_id, receiver_id, message, client_id`                        | `sender_id` RLS ile, `client_id` trigger ile doğrulanıyor (M2, M6) |
| `useMessages.ts:270`         | `update` | `read_at, is_read` (+ `.eq('receiver_id', viewerId)`)               | Uygulama doğru; **sunucu sözleşmesi eksik** → AC-04                |
| `useNotifications.ts:53`     | `update` | `is_read`                                                           | Uygulama doğru; sunucu tüm sütunlara izin veriyor → AC-10          |
| `useNotifications.ts:87`     | `insert` | `client_id, title, message`                                         | Koç yolu; danışan yolunda sunucu kısıtı yok → AC-05                |
| `useProgramApprovals.ts:52`  | `insert` | `client_id, workout_data, status:'pending'`                         | `status` istemciden, **sunucu kısıtı yok** → AC-01                 |
| `useProgramApprovals.ts:107` | `update` | `status, reviewed_by, reviewed_at`                                  | `reviewed_by` istemciden → AC-07                                   |
| `usePlans.ts:213,262`        | `rpc`    | `p_client_ids, p_plan`                                              | RPC `SECURITY INVOKER`, RLS koruyor (R1/R3b/R4)                    |

`is_active`, `version`, `role`, `created_at` gibi alanlar hiçbir hook tarafından yazılmıyor.
`client_id` her yerde istemciden gelen parametredir, ancak her tabloda RLS WITH CHECK ile
`auth.uid()`'e bağlandığı canlı testlerle doğrulandı (§4.2).

### 4.9 AI proxy (kısa kontrol)

`src/lib/api/proxy.ts` `Authorization: Bearer` zorunlu kılıyor, token'ı `auth.getUser()` ile
doğruluyor, kullanıcı kimliğini istemci gövdesinden **almıyor**, upstream'e göndermiyor.
`AI_BACKEND_API_KEY` yalnızca sunucuda. (Ayrıntı `findings-app-surface.md` kapsamında.)

---

## 5. "Bulgu değil" — ADR ile kayıtlı bilinçli kararlar

Aşağıdakiler denetimde tespit edildi, ancak **zafiyet değildir**; kayıtlı mimari kararlardır.
Otomatik tarayıcıların veya sonraki denetimlerin bunları bulgu sanmaması için burada listelenir.

| Gözlem                                                                                      | Karar kaydı                                                                                             | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`'ta `coach_id` yok; koç tüm danışanları görür (`is_coach()` her politikada)       | ADR-0007 (tek koçluk model)                                                                             | §4.1 P6 çıktısı bu davranışın çalıştığını gösterir                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Koç profili tüm `authenticated` kullanıcılara görünür (`profiles_select … OR role='coach'`) | ADR-0010                                                                                                | **Kapsam doğrulandı:** danışan koçun `id, full_name, email, avatar_path, current_streak, last_checkin_at, created_at, updated_at` ve eski `nutrition_plan`/`workout_plan` metin sütunlarını görür. HTTP H7: `[{"id":"1111…","role":"coach","email":"coach@example.com"},{"id":"2222…","role":"client","email":"client1@example.com"}]`. PostgREST sütun seviyesinde filtreleyemediği için satırın tamamı okunabilir; koç e-postasının danışanlara açık olması bu takasın parçasıdır. Danışan B'nin satırı görünmüyor (T1b) |
| Danışan kendi beslenme planını yazabiliyor                                                  | ADR-0014                                                                                                | Sınırı testlerle kilitli; §4.2'de A'nın B'nin planına yazamadığı doğrulandı                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Danışan kendi antrenman planını yazabiliyor ve kendi planını silebiliyor (G7 `silinen = 1`) | `supabase/migrations/20260817110000_workout_plan_tables.sql` §6 sapma notu; ADR-0014 bunu referans alır | Numaralı ADR'si yok, yalnızca migration blok yorumu + `supabase/README.md` §4. Karar bilinçlidir; **AC-01 bu yetkiyle ilgili değildir**                                                                                                                                                                                                                                                                                                                                                                                    |
| Koç, bir danışanı `coach` yapabiliyor (P7: `yeni rol=coach`)                                | `profiles_update_coach` politikasının doğal sonucu                                                      | Koç zaten tüm veriye erişen güvenilir roldür; yetki yükseltme sayılmaz                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `service_role` RLS'i baypas ediyor                                                          | Supabase platform davranışı                                                                             | `rolbypassrls = t`; uygulama çalışma zamanında hiç kullanılmıyor (§3.9)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 6. Test boşlukları — `supabase/tests/rls.test.sql`

Mevcut 50 senaryonun kapsamı: görünürlük (1-5), satır izolasyonu (6-9), yazma yetkisi (10-15),
mesajlaşma (16-17, 36-42), katalog (18-19), antrenman planı (20-27), beslenme planı (28-35), form
check inceleme (43-50).

Kapsanmayan ve eklenmesi gereken senaryolar:

| #    | Senaryo                                                                                         | İlgili bulgu  |
| ---- | ----------------------------------------------------------------------------------------------- | ------------- |
| G-01 | `program_approvals`: danışan `status='approved'` ile INSERT **yapamaz**                         | AC-01         |
| G-02 | `program_approvals`: danışan `reviewed_by` / `reviewed_at` **belirleyemez**                     | AC-01 / AC-07 |
| G-03 | `program_approvals`: danışan kendi `pending` satırını silip `approved` olarak yeniden ekleyemez | AC-01         |
| G-04 | `program_approvals`: danışan `client_id=B` ile INSERT yapamaz (pozitif kontrol; bugün geçiyor)  | —             |
| G-05 | `program_approvals`: danışan başkasının onay kaydını göremez (bugün geçiyor, testi yok)         | —             |
| G-06 | `program_approvals`: koç `status` güncelleyebilir, `reviewed_by` **sunucudan** dolar            | AC-07         |
| G-07 | `messages`: alıcı `message` gövdesini **değiştiremez**                                          | AC-04         |
| G-08 | `messages`: alıcı `kind` / `created_at` **değiştiremez**                                        | AC-04         |
| G-09 | `messages`: danışan `kind='system'` mesaj **üretemez**                                          | AC-04         |
| G-10 | `notifications`: danışan koça yazarken içerik sabit şablona bağlıdır                            | AC-05         |
| G-11 | `notifications`: danışan kendi bildiriminin `title`/`message`'ını değiştiremez                  | AC-10         |
| G-12 | `notifications`: danışan başkasının bildirimini göremez (bugün geçiyor, testi yok)              | —             |
| G-13 | `profiles`: danışan `current_streak` / `last_checkin_at` alanlarını doğrudan yazamaz            | AC-08         |
| G-14 | `profiles`: danışan `email` alanını değiştiremez                                                | AC-09         |
| G-15 | `profiles`: danışan profil silemez / ekleyemez (bugün geçiyor, testi yok)                       | —             |
| G-16 | `handle_new_user`: `raw_user_meta_data.role='coach'` ile oluşan kullanıcı **`client`** olur     | AC-02         |
| G-17 | Grant kontrolü: `authenticated` rolünde `TRUNCATE` yok (`role_table_grants` iddiası)            | AC-03         |
| G-18 | `pg_class` kontrolü: tüm `public` tablolarında `relforcerowsecurity = true`                     | AC-06         |
| G-19 | `storage.objects`: danışan A, B'nin `poses/` nesnesini göremez (imza üretemez)                  | —             |
| G-20 | `storage.objects`: danışan A, B'nin ön ekiyle nesne yükleyemez; `../` içeren ad kabul edilmez   | —             |
| G-21 | `storage.buckets`: danışan bucket listesini göremez / bucket açamaz                             | —             |
| G-22 | `workout_plans`: danışan kendi aktif planını silebilir (bilinçli sapmanın sınırını kilitler)    | —             |
| G-23 | `daily_logs` / `workout_logs`: danışan kendi satırının `client_id`'sini başkasına çeviremez     | —             |
| G-24 | `increment_streak(B)`: danışan başkası için çağıramaz                                           | —             |
| G-25 | `explode_plan_day` / `explode_nutrition_day`: danışan başkasının `plan_id`'siyle çağıramaz      | —             |
| G-26 | JWT claim'inde `role='service_role'` göndermek etkisizdir                                       | —             |

Öncelik: G-01…G-03 (AC-01), G-16 (AC-02), G-17 (AC-03), G-07…G-09 (AC-04), G-10 (AC-05).

---

## 7. Denetim yöntemi ve tekrarlanabilirlik

Salt okunur envanter sorguları:

```bash
docker exec supabase_db_my-coaching-app psql -U postgres -d postgres -t -A -c "<SORGU>"
```

Rol taklidi deseni (tüm yazma testlerinde kullanıldı):

```sql
BEGIN;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<kullanici-uuid>","role":"authenticated"}';
  -- test ifadesi
ROLLBACK;
```

HTTP testleri yerel yığına karşı yapıldı (`http://127.0.0.1:54321`); oturumlar
`POST /auth/v1/token?grant_type=password` ile `client1@example.com` / `client2@example.com`
hesaplarından alındı. **Uzak (hosted) projeye hiçbir istek gönderilmedi** — bkz. AC-12.
