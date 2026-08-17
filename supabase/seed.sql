-- #############################################################################
-- ##                                                                         ##
-- ##   !!!  SADECE YEREL GELİŞTİRME İÇİN — PRODUCTION'DA ÇALIŞTIRMAYIN  !!!   ##
-- ##                                                                         ##
-- ##   Bu dosya auth.users tablosuna DOĞRUDAN kullanıcı ve sabit (herkesçe    ##
-- ##   bilinen) parolalar yazar. Uzak/canlı bir veritabanında çalıştırmak     ##
-- ##   ciddi bir güvenlik açığıdır. Yalnızca `supabase db reset` ile yerel    ##
-- ##   Docker yığınında kullanın.                                            ##
-- ##                                                                         ##
-- ##   Demo hesaplar (parola hepsi için: Passw0rd!23)                         ##
-- ##     coach@example.com    -> role = coach   (KOÇ)                         ##
-- ##     client1@example.com  -> role = client (DANIŞAN)                     ##
-- ##     client2@example.com  -> role = client (DANIŞAN)                     ##
-- ##                                                                         ##
-- ##   Tüm bloklar idempotenttir: dosyayı birden çok kez çalıştırmak          ##
-- ##   veri çoğaltmaz (ON CONFLICT DO NOTHING / NOT EXISTS koruması).         ##
-- #############################################################################

set search_path = public, extensions, pg_temp;


-- =============================================================================
-- 1) AUTH KULLANICILARI
--    Sabit UUID'ler kullanılır ki tekrar çalıştırmalarda aynı hesaplar hedeflensin.
--      Koç      : 11111111-1111-1111-1111-111111111111
--      Danışan 1: 22222222-2222-2222-2222-222222222222
--      Danışan 2: 33333333-3333-3333-3333-333333333333
--    public.handle_new_user() trigger'ı profiles satırlarını otomatik oluşturur.
-- =============================================================================

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'coach@example.com',
    crypt('Passw0rd!23', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Deniz Koç","role":"coach"}'::jsonb,
    now() - interval '120 days',
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'client1@example.com',
    crypt('Passw0rd!23', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ahmet Yılmaz","role":"client"}'::jsonb,
    now() - interval '90 days',
    now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated',
    'authenticated',
    'client2@example.com',
    crypt('Passw0rd!23', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Elif Demir","role":"client"}'::jsonb,
    now() - interval '60 days',
    now(),
    '', '', '', ''
  )
on conflict (id) do nothing;


-- E-posta/parola ile girişin çalışması için auth.identities kaydı gerekir.
-- auth.identities şeması GoTrue sürümleri arasında değiştiği için hata yutulur.
do $$
begin
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    u.id::text,
    u.id,
    jsonb_build_object(
      'sub',            u.id::text,
      'email',          u.email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  from auth.users u
  where u.id in (
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333'
    )
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
    );
exception
  when others then
    raise notice 'auth.identities atlandı (şema uyumsuzluğu): %', sqlerrm;
end
$$;


-- =============================================================================
-- 2) PROFİLLERİ ZENGİNLEŞTİR
--    Trigger temel satırı oluşturdu; burada plan/streak alanlarını dolduruyoruz.
--    Trigger herhangi bir sebeple çalışmadıysa satırı biz oluşturuyoruz.
-- =============================================================================

insert into public.profiles (id, full_name, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Deniz Koç',    'coach@example.com',   'coach'),
  ('22222222-2222-2222-2222-222222222222', 'Ahmet Yılmaz', 'client1@example.com', 'client'),
  ('33333333-3333-3333-3333-333333333333', 'Elif Demir',   'client2@example.com', 'client')
on conflict (id) do nothing;

-- Koç profili
update public.profiles
   set full_name       = 'Deniz Koç',
       email           = 'coach@example.com',
       role            = 'coach',
       avatar_path     = null,
       current_streak  = 0,
       last_checkin_at = null
 where id = '11111111-1111-1111-1111-111111111111';

-- Danışan 1: yağ yakımı odaklı, aktif seri
update public.profiles
   set full_name       = 'Ahmet Yılmaz',
       email           = 'client1@example.com',
       role            = 'client',
       avatar_path     = null,
       current_streak  = 6,
       last_checkin_at = now() - interval '4 hours',
       nutrition_plan  = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g\nPirinç 150g\nYoğurt 200g","total":1850},"Salı":{"items":"Omlet (3 yumurta)\nTam Buğday Ekmeği 2 dilim\nTon Balığı 150g\nSalata","total":1780},"Çarşamba":{"items":"Yulaf Ezmesi 80g\nKıyma 150g\nBulgur 150g\nAyran","total":1900},"Perşembe":{"items":"Peynirli Omlet\nTavuk Göğsü 200g\nTatlı Patates 200g","total":1820},"Cuma":{"items":"Yulaf + Muz\nSomon 180g\nKinoa 120g","total":1950},"Cumartesi":{"items":"Serbest Öğün (kontrollü)\nTavuk Dürüm","total":2200},"Pazar":{"items":"Yumurta 3 adet\nMercimek Çorbası\nTavuk Salata","total":1700}}$json$,
       workout_plan    = $json${"Pazartesi":"1. Bench Press - 4x8\n2. Incline Dumbbell Press - 3x10\n3. Cable Fly - 3x12\n4. Triceps Pushdown - 3x12","Salı":"1. Deadlift - 4x5\n2. Barbell Row - 4x8\n3. Lat Pulldown - 3x10\n4. Barbell Curl - 3x12","Çarşamba":"Dinlenme","Perşembe":"1. Squat - 4x8\n2. Leg Press - 3x12\n3. Romanian Deadlift - 3x10\n4. Calf Raise - 4x15","Cuma":"1. Overhead Press - 4x8\n2. Lateral Raise - 3x15\n3. Face Pull - 3x15\n4. Shrug - 3x12","Cumartesi":"1. Pull Up - 4x8\n2. Dips - 3x10\n3. Plank - 3x60","Pazar":"Dinlenme"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

-- Danışan 2: kas kütlesi artışı odaklı
update public.profiles
   set full_name       = 'Elif Demir',
       email           = 'client2@example.com',
       role            = 'client',
       avatar_path     = null,
       current_streak  = 2,
       last_checkin_at = now() - interval '1 day 3 hours',
       nutrition_plan  = $json${"Pazartesi":{"items":"Yulaf Ezmesi 60g\nYumurta 2 adet\nTavuk Göğsü 150g\nPirinç 120g","total":2100},"Salı":{"items":"Smoothie (muz+yulaf+süt)\nHindi Göğsü 150g\nMakarna 150g","total":2200},"Çarşamba":{"items":"Menemen\nKöfte 150g\nBulgur Pilavı 150g","total":2150},"Perşembe":{"items":"Yulaf + Fıstık Ezmesi\nSomon 150g\nTatlı Patates 200g","total":2250},"Cuma":{"items":"Peynirli Tost\nTavuk 200g\nPirinç 150g","total":2180},"Cumartesi":{"items":"Serbest Öğün\nPizza (2 dilim)","total":2400},"Pazar":{"items":"Yumurta 3 adet\nEt Sote 200g\nSalata","total":2050}}$json$,
       workout_plan    = $json${"Pazartesi":"1. Squat - 5x5\n2. Leg Press - 3x12\n3. Leg Curl - 3x12\n4. Hip Thrust - 4x10","Salı":"1. Bench Press - 4x6\n2. Overhead Press - 3x10\n3. Lateral Raise - 3x15","Çarşamba":"Dinlenme","Perşembe":"1. Deadlift - 4x5\n2. Lat Pulldown - 4x10\n3. Seated Row - 3x12\n4. Hammer Curl - 3x12","Cuma":"1. Front Squat - 4x8\n2. Lunge - 3x12\n3. Calf Raise - 4x20","Cumartesi":"1. Pull Up - 3x6\n2. Push Up - 3x15\n3. Plank - 3x45","Pazar":"Dinlenme"}$json$
 where id = '33333333-3333-3333-3333-333333333333';


-- -----------------------------------------------------------------------------
-- 2b) ANTRENMAN PLANLARINI NORMALİZE TABLOLARA DA YAZ
--     (workout_plans + workout_plan_exercises — Faz 1b Adım 2 cutover'ı)
--
--     Uygulama artık planı `profiles.workout_plan` kolonundan DEĞİL, bu
--     tablolardan okuyor (src/hooks/usePlans.ts). Yukarıdaki `workout_plan`
--     yazımı BİLEREK korunuyor: DEPRECATED kolon, veri dönüşümü testine
--     (supabase/tests/transform.test.sql) malzeme olmaya devam ediyor.
--
--     İKİ KAYNAK AYNI İÇERİĞİ ÜRETİR: aşağıdaki blok planı elle tekrarlamaz,
--     doğrudan `profiles.workout_plan` JSON'unu okuyup TEK ayrıştırıcıdan
--     (`explode_plan_day`, `save_workout_plan` içinden) geçirir. Böylece
--     kopyala-yapıştır kayması imkânsızdır.
--
--     NOT: migration'lar `supabase db reset` sırasında seed'den ÖNCE koştuğu
--     için `migrate_workout_plans_from_profiles()` orada boş tabloda çalışır
--     (no-op). Dolum bu yüzden seed'in görevidir.
--
--     Idempotent: `save_workout_plan` aktif planın satırlarını silip yeniden
--     yazar; seed tekrar çalıştırıldığında satır çoğalmaz, içerik seed'e döner.
--     (Seed superuser ile koştuğu için RLS ve fonksiyon ACL'i engel değildir.)
-- -----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_plan jsonb;
begin
  for v_id, v_plan in
    select p.id, p.workout_plan::jsonb
      from public.profiles p
     where p.id in (
             '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333'
           )
       and p.workout_plan is not null
       and btrim(p.workout_plan) <> ''
     order by p.id
  loop
    perform public.save_workout_plan(array[v_id], v_plan);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 2c) BESLENME PLANLARINI NORMALİZE TABLOLARA DA YAZ
--     (nutrition_plans + nutrition_plan_meals — Faz 1b Adım 3b cutover'ı)
--
--     §2b'nin beslenme karşılığı, birebir aynı gerekçelerle:
--
--     Uygulama artık planı `profiles.nutrition_plan` kolonundan DEĞİL, bu
--     tablolardan okuyor (src/hooks/usePlans.ts -> useNutritionPlan). Yukarıdaki
--     `nutrition_plan` yazımı BİLEREK korunuyor: DEPRECATED kolon, veri dönüşümü
--     testine (supabase/tests/transform.test.sql) malzeme olmaya devam ediyor.
--
--     İKİ KAYNAK AYNI İÇERİĞİ ÜRETİR: aşağıdaki blok planı elle tekrarlamaz,
--     doğrudan `profiles.nutrition_plan` JSON'unu okuyup TEK yazıcıdan
--     (`explode_nutrition_day`, `save_nutrition_plan` içinden) geçirir. Böylece
--     kopyala-yapıştır kayması imkânsızdır.
--
--     NOT: migration'lar `supabase db reset` sırasında seed'den ÖNCE koştuğu
--     için `migrate_nutrition_plans_from_profiles()` orada boş tabloda çalışır
--     (no-op). Dolum bu yüzden seed'in görevidir.
--
--     Idempotent: `save_nutrition_plan` aktif planın satırlarını silip yeniden
--     yazar; seed tekrar çalıştırıldığında satır çoğalmaz, içerik seed'e döner.
--     (Seed superuser ile koştuğu için RLS ve fonksiyon ACL'i engel değildir.)
-- -----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_plan jsonb;
begin
  for v_id, v_plan in
    select p.id, p.nutrition_plan::jsonb
      from public.profiles p
     where p.id in (
             '22222222-2222-2222-2222-222222222222',
             '33333333-3333-3333-3333-333333333333'
           )
       and p.nutrition_plan is not null
       and btrim(p.nutrition_plan) <> ''
     order by p.id
  loop
    perform public.save_nutrition_plan(array[v_id], v_plan);
  end loop;
end
$$;


-- =============================================================================
-- 3) REFERANS KATALOGLARI
--    Gerçek veri src/app/clean_foods.csv ve src/app/clean_exercises_v2.csv
--    dosyalarından import edilir (bkz. supabase/README.md). Buradakiler örnektir.
-- =============================================================================

-- 10 satır besin örneği
insert into public.food_database (name, calories_per_100g) values
  ('Tavuk Göğsü (haşlanmış)',   165.00),
  ('Yumurta (bütün)',           155.00),
  ('Yulaf Ezmesi (kuru)',       389.00),
  ('Beyaz Pirinç (pişmiş)',     130.00),
  ('Tam Buğday Ekmeği',         247.00),
  ('Somon (fırında)',           208.00),
  ('Süzme Yoğurt (yağsız)',      59.00),
  ('Fıstık Ezmesi',             588.00),
  ('Tatlı Patates (fırında)',    90.00),
  ('Kırmızı Mercimek (pişmiş)',  116.00)
on conflict (name) do nothing;

-- 10 satır egzersiz örneği
insert into public.exercises (name, body_part, target, equipment, gif_url, image) values
  ('Bench Press',        'chest',      'pectorals',  'barbell',     'videos/bench-press.gif',        'images/bench-press.jpg'),
  ('Squat',              'upper legs', 'quads',      'barbell',     'videos/squat.gif',              'images/squat.jpg'),
  ('Deadlift',           'upper legs', 'glutes',     'barbell',     'videos/deadlift.gif',           'images/deadlift.jpg'),
  ('Overhead Press',     'shoulders',  'delts',      'barbell',     'videos/overhead-press.gif',     'images/overhead-press.jpg'),
  ('Barbell Row',        'back',       'upper back', 'barbell',     'videos/barbell-row.gif',        'images/barbell-row.jpg'),
  ('Lat Pulldown',       'back',       'lats',       'cable',       'videos/lat-pulldown.gif',       'images/lat-pulldown.jpg'),
  ('Leg Press',          'upper legs', 'quads',      'leverage machine', 'videos/leg-press.gif',     'images/leg-press.jpg'),
  ('Lateral Raise',      'shoulders',  'delts',      'dumbbell',    'videos/lateral-raise.gif',      'images/lateral-raise.jpg'),
  ('Barbell Curl',       'upper arms', 'biceps',     'barbell',     'videos/barbell-curl.gif',       'images/barbell-curl.jpg'),
  ('Triceps Pushdown',   'upper arms', 'triceps',    'cable',       'videos/triceps-pushdown.gif',   'images/triceps-pushdown.jpg')
on conflict (name) do nothing;


-- =============================================================================
-- 4) FORM CHECK'LER — danışan başına 6 hafta, kilo trendi
--    Danışan 1: 92.40 -> 88.65 kg (yağ yakımı)
--    Danışan 2: 61.00 -> 64.00 kg (kas kazanımı)
--
--    `front_pose_path` / `back_pose_path` artık tam URL değil, `form-checks-media`
--    bucket'ındaki YOL'dur (bkz. 20260817100000_private_storage.sql). Yol biçimi
--    storage RLS politikasıyla birebir uyumludur: `poses/<client_id>-...`.
--    DİKKAT: Bu dosyalar storage'da FİİLEN YOKTUR. Bu bilinçli bir tercihtir —
--    imzalı adres üretimi başarısız olur, uygulama `null` döner ve UI kırık görsel
--    yerine placeholder gösterir. Seed verisiyle bu yol test edilmiş olur.
--
--    İNCELEME DURUMU (20260817150000_form_check_review.sql):
--      `status` / `coach_feedback` / `reviewed_at` / `reviewed_by` BURADA AÇIKÇA
--      yazılır; backfill'e güvenilmez (`db reset` akışında migration'lar seed'den
--      önce koşar ve backfill boş tabloda no-op'tur).
--
--      Her danışanın ESKİ haftaları 'reviewed', SON haftaları BİLEREK 'pending'
--      bırakılmıştır: koçun bekleyen kuyruğu (`status = 'pending'`) gerçek veriyle
--      denenebilsin ve Faz 2'nin geri bildirim akışı boş ekranla başlamasın.
--
--      NOT: seed `postgres` rolüyle koşar, yani `auth.uid()` NULL'dır ve
--      `form_checks_guard_review` trigger'ı değerleri OLDUĞU GİBİ bırakır
--      (aksi hâlde buradaki gerçekçi `reviewed_at` tarihleri now()'a ezilirdi).
--      Tutarlılık `form_checks_review_consistency_chk` kısıtıyla korunur:
--      'reviewed' satırlarda `reviewed_at` ve `reviewed_by` DOLU olmak ZORUNDA.
-- =============================================================================

-- Danışan 1: 6 haftanın ilk 4'ü incelendi, son 2'si koçun kuyruğunda bekliyor.
insert into public.form_checks (
  client_id, current_weight, front_pose_path, back_pose_path, notes, created_at,
  status, coach_feedback, reviewed_at, reviewed_by
)
select
  '22222222-2222-2222-2222-222222222222'::uuid,
  round((92.40 - (i * 0.75))::numeric, 2),
  'poses/22222222-2222-2222-2222-222222222222-w' || (i + 1) || '-front.jpg',
  case
    when i % 2 = 0
      then 'poses/22222222-2222-2222-2222-222222222222-w' || (i + 1) || '-back.jpg'
    else null
  end,
  case i
    when 0 then 'Başlangıç ölçümü. Kondisyon düşük.'
    when 1 then 'Su tüketimi arttı, ödem azaldı.'
    when 2 then 'Bel çevresinde belirgin incelme.'
    when 3 then 'Antrenman hacmi artırıldı.'
    when 4 then 'Enerji seviyesi iyi, uyku düzenli.'
    else 'Hedefe yaklaşıyoruz, karbonhidrat siklusu başlıyor.'
  end,
  now() - make_interval(weeks => (5 - i)),
  case when i <= 3 then 'reviewed'::public.form_check_status
       else 'pending'::public.form_check_status end,
  case i
    when 0 then 'Duruş genel olarak iyi. Bu hafta kardiyoyu 3 güne çıkaralım, ağırlıklara dokunma.'
    when 1 then 'Ödemin çözülmesi güzel işaret. Su hedefini 3 lt''de sabitle.'
    when 2 then 'Bel ölçüsündeki düşüş plana uygun. Kaloriyi HENÜZ düşürmüyoruz.'
    when 3 then 'Hacim artışını iyi taşımışsın. Uyku 7 saatin altına inerse haber ver.'
    else null
  end,
  case when i <= 3 then now() - make_interval(weeks => (5 - i)) + interval '1 day'
       else null end,
  case when i <= 3 then '11111111-1111-1111-1111-111111111111'::uuid else null end
from generate_series(0, 5) as i
where not exists (
  select 1 from public.form_checks
  where client_id = '22222222-2222-2222-2222-222222222222'::uuid
);

-- Danışan 2: 6 haftanın ilk 5'i incelendi, yalnızca son hafta bekliyor.
insert into public.form_checks (
  client_id, current_weight, front_pose_path, back_pose_path, notes, created_at,
  status, coach_feedback, reviewed_at, reviewed_by
)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  round((61.00 + (i * 0.60))::numeric, 2),
  'poses/33333333-3333-3333-3333-333333333333-w' || (i + 1) || '-front.jpg',
  case
    when i % 3 = 0
      then 'poses/33333333-3333-3333-3333-333333333333-w' || (i + 1) || '-back.jpg'
    else null
  end,
  case i
    when 0 then 'Başlangıç ölçümü. Hedef: temiz kütle artışı.'
    when 1 then 'Kalori 200 kcal artırıldı.'
    when 2 then 'Squat performansı yükseliyor.'
    when 3 then 'Bacak hacminde artış gözlendi.'
    when 4 then 'Protein alımı hedefte.'
    else 'Kuvvet artışı devam ediyor, form korunuyor.'
  end,
  now() - make_interval(weeks => (5 - i)),
  case when i <= 4 then 'reviewed'::public.form_check_status
       else 'pending'::public.form_check_status end,
  case i
    when 0 then 'Başlangıç için temiz bir taban. İlk 2 hafta teknik üzerinde duracağız.'
    when 1 then 'Kalori artışını sindirim tarafında sorunsuz taşımışsın, devam.'
    when 2 then 'Squat derinliği belirgin düzeldi. Ağırlığı %5 artırabilirsin.'
    when 3 then 'Bacak gelişimi planın önünde. Üst gövde hacmini biraz artıralım.'
    when 4 then 'Protein hedefi tutuyor. Bu haftadan itibaren kreatin ekleyelim.'
    else null
  end,
  case when i <= 4 then now() - make_interval(weeks => (5 - i)) + interval '2 days'
       else null end,
  case when i <= 4 then '11111111-1111-1111-1111-111111111111'::uuid else null end
from generate_series(0, 5) as i
where not exists (
  select 1 from public.form_checks
  where client_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 5) GÜNLÜK KAYITLAR — danışan başına son 14 gün
--    (client_id, log_date) UNIQUE olduğu için ON CONFLICT DO NOTHING yeterli.
-- =============================================================================

insert into public.daily_logs (client_id, log_date, water_lt, sodium_mg, macros, created_at)
select
  s.client_id,
  (current_date - d)::date,
  round((s.base_water + ((d % 4) * 0.25))::numeric, 2),
  s.base_sodium + ((d % 5) * 220),
  jsonb_build_object(
    'protein', s.base_protein + ((d % 3) * 8),
    'carb',    s.base_carb    + ((d % 6) * 15),
    'fat',     s.base_fat     + ((d % 4) * 5)
  ),
  (current_date - d)::timestamptz + interval '21 hours'
from generate_series(0, 13) as d
cross join (
  values
    ('22222222-2222-2222-2222-222222222222'::uuid, 3.00, 2200, 180, 200, 60),
    ('33333333-3333-3333-3333-333333333333'::uuid, 2.25, 1900, 120, 250, 70)
) as s (client_id, base_water, base_sodium, base_protein, base_carb, base_fat)
on conflict (client_id, log_date) do nothing;


-- =============================================================================
-- 6) ANTRENMAN KAYITLARI — danışan başına 20 set
-- =============================================================================

insert into public.workout_logs (client_id, exercise_name, weight_kg, reps, rpe, created_at)
select
  '22222222-2222-2222-2222-222222222222'::uuid,
  e.name,
  round((e.base_kg + ((i / 4) * 2.5))::numeric, 2),
  e.base_reps - (i % 3),
  7 + (i % 3),
  now() - make_interval(days => (19 - i)) + interval '18 hours'
from generate_series(0, 19) as i
cross join lateral (
  select
    (array['Bench Press', 'Squat', 'Deadlift', 'Barbell Row', 'Overhead Press'])[(i % 5) + 1] as name,
    (array[70.0, 100.0, 120.0, 60.0, 45.0])[(i % 5) + 1]                                      as base_kg,
    (array[8, 6, 5, 10, 8])[(i % 5) + 1]                                                      as base_reps
) as e
where not exists (
  select 1 from public.workout_logs
  where client_id = '22222222-2222-2222-2222-222222222222'::uuid
);

insert into public.workout_logs (client_id, exercise_name, weight_kg, reps, rpe, created_at)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  e.name,
  round((e.base_kg + ((i / 5) * 2.0))::numeric, 2),
  e.base_reps - (i % 2),
  6 + (i % 4),
  now() - make_interval(days => (19 - i)) + interval '19 hours'
from generate_series(0, 19) as i
cross join lateral (
  select
    (array['Squat', 'Leg Press', 'Lat Pulldown', 'Lateral Raise', 'Barbell Curl'])[(i % 5) + 1] as name,
    (array[55.0, 90.0, 40.0, 8.0, 20.0])[(i % 5) + 1]                                           as base_kg,
    (array[8, 12, 10, 15, 12])[(i % 5) + 1]                                                     as base_reps
) as e
where not exists (
  select 1 from public.workout_logs
  where client_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 7) BİLDİRİMLER — danışan başına 3 adet
-- =============================================================================

insert into public.notifications (client_id, title, message, is_read, created_at)
select v.client_id, v.title, v.message, v.is_read, v.created_at
from (
  values
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Haftalık Form Check Hatırlatması', 'Bu haftanın poz fotoğraflarını ve kilonu yüklemeyi unutma.', true,  now() - interval '6 days'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Program Güncellendi',              'Antrenman hacmi %10 artırıldı. Yeni programı Antrenman sekmesinden kontrol et.', false, now() - interval '2 days'),
    ('22222222-2222-2222-2222-222222222222'::uuid, null,                               '✅ Koçun yeni antrenman programını onayladı! Artık kullanabilirsin.', false, now() - interval '5 hours'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Su Tüketimi',                      'Günlük su hedefin 2.5 L. Son 3 gün altında kaldın.', true,  now() - interval '4 days'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Beslenme Planı Yenilendi',         'Kalori hedefi 2200 kcal olarak güncellendi.', false, now() - interval '1 day'),
    ('33333333-3333-3333-3333-333333333333'::uuid, null,                               '🔔 Onayına sunulan antrenman programı koç tarafından inceleniyor.', false, now() - interval '3 hours')
) as v (client_id, title, message, is_read, created_at)
where not exists (select 1 from public.notifications);


-- =============================================================================
-- 8) MESAJLAR — danışan başına koç ile 4 mesajlık sohbet
--
-- `client_id` / `read_at` / `kind` (20260817140000_messages_conversation_key.sql)
-- BURADA AÇIKÇA YAZILIR — migration'ın backfill'ine GÜVENİLMEZ. Sebep:
-- `supabase db reset` akışında migration'lar seed'den ÖNCE koşar, yani backfill
-- bu satırları hiç görmez. (Trigger yine de her satırı doğrular; buradaki
-- client_id değerleri yanlış olsaydı seed HATA verirdi — yani bu kolonlar aynı
-- zamanda trigger'ın canlı bir dumanı testidir.)
--
-- OKUNMAMIŞ (read_at IS NULL) SATIRLAR BİLİNÇLİ OLARAK BIRAKILMIŞTIR ki
-- `useUnreadCount` / `useMarkConversationRead` gerçek veriyle denenebilsin:
--   Danışan 1 (2222…) okumadı : koçun "Harika. Gelecek hafta…" mesajı        -> 1 adet
--   Koç      (1111…) okumadı : Danışan 2'nin "Gördüm, teşekkürler…" mesajı   -> 1 adet
--   Danışan 2 (3333…) okumadı: koçun "Süper. Cumartesi…" mesajı              -> 1 adet
-- =============================================================================

insert into public.messages (sender_id, receiver_id, client_id, message, is_read, read_at, kind, created_at)
select v.sender_id, v.receiver_id, v.client_id, v.message, v.read_at is not null, v.read_at, v.kind, v.created_at
from (
  values
    -- Koç <-> Danışan 1
    ('22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Merhaba koç, bu hafta dizimde hafif bir rahatsızlık var. Squat''ı değiştirelim mi?', now() - interval '3 days 3 hours 30 minutes', 'user'::public.message_kind, now() - interval '3 days 4 hours'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Merhaba Ahmet. Bu hafta squat yerine leg press yapalım, ağırlığı %20 düşür.',           now() - interval '3 days 2 hours',            'user'::public.message_kind, now() - interval '3 days 3 hours'),
    ('22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Tamamdır, bugün öyle yaptım. Ağrı yoktu.',                                              now() - interval '1 day 22 hours',            'user'::public.message_kind, now() - interval '2 days'),
    -- OKUNMAMIŞ (danışan 1 henüz görmedi)
    ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Harika. Gelecek hafta kademeli olarak squat''a dönüyoruz.',                             null,                                         'user'::public.message_kind, now() - interval '1 day 20 hours'),
    -- Koç <-> Danışan 2
    ('33333333-3333-3333-3333-333333333333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Koçum, kilo alımı yavaşladı. Kaloriyi artıralım mı?',                                   now() - interval '2 days 5 hours 30 minutes', 'user'::public.message_kind, now() - interval '2 days 6 hours'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Evet, günlük 200 kcal ekleyelim. Öğün planını güncelledim.',                            now() - interval '2 days 4 hours',            'user'::public.message_kind, now() - interval '2 days 5 hours'),
    -- OKUNMAMIŞ (koç henüz görmedi)
    ('33333333-3333-3333-3333-333333333333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Gördüm, teşekkürler. Protein hedefini de tutturuyorum.',                                null,                                         'user'::public.message_kind, now() - interval '1 day'),
    -- OKUNMAMIŞ (danışan 2 henüz görmedi)
    ('11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Süper. Cumartesi form check fotoğraflarını bekliyorum.',                                null,                                         'user'::public.message_kind, now() - interval '8 hours')
) as v (sender_id, receiver_id, client_id, message, read_at, kind, created_at)
where not exists (select 1 from public.messages);


-- =============================================================================
-- 9) PROGRAM ONAY TALEPLERİ — danışan başına 1 adet 'pending'
-- =============================================================================

insert into public.program_approvals (client_id, workout_data, status, created_at)
select
  '22222222-2222-2222-2222-222222222222'::uuid,
  jsonb_build_object(
    'Pazartesi', '1. Bench Press - 4x8' || chr(10) || '2. Incline Dumbbell Press - 3x10',
    'Salı',      '1. Deadlift - 4x5' || chr(10) || '2. Barbell Row - 4x8',
    'Çarşamba',  'Dinlenme',
    'Perşembe',  '1. Leg Press - 4x12' || chr(10) || '2. Romanian Deadlift - 3x10',
    'Cuma',      '1. Overhead Press - 4x8' || chr(10) || '2. Lateral Raise - 3x15',
    'Cumartesi', '1. Pull Up - 4x8',
    'Pazar',     'Dinlenme'
  ),
  'pending',
  now() - interval '6 hours'
where not exists (
  select 1 from public.program_approvals
  where client_id = '22222222-2222-2222-2222-222222222222'::uuid
);

insert into public.program_approvals (client_id, workout_data, status, created_at)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  jsonb_build_object(
    'Pazartesi', '1. Squat - 5x5' || chr(10) || '2. Hip Thrust - 4x10',
    'Salı',      '1. Bench Press - 4x6' || chr(10) || '2. Lateral Raise - 3x15',
    'Çarşamba',  'Dinlenme',
    'Perşembe',  '1. Deadlift - 4x5' || chr(10) || '2. Lat Pulldown - 4x10',
    'Cuma',      '1. Front Squat - 4x8' || chr(10) || '2. Lunge - 3x12',
    'Cumartesi', '1. Push Up - 3x15',
    'Pazar',     'Dinlenme'
  ),
  'pending',
  now() - interval '3 hours'
where not exists (
  select 1 from public.program_approvals
  where client_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 10) ÖZET
-- =============================================================================
do $$
declare
  v_profiles  bigint;
  v_checks    bigint;
  v_pending   bigint;
  v_reviewed  bigint;
  v_logs      bigint;
  v_workouts  bigint;
  v_msgs      bigint;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_checks   from public.form_checks;
  select count(*) into v_logs     from public.daily_logs;
  select count(*) into v_workouts from public.workout_logs;
  select count(*) into v_msgs     from public.messages;

  select
    count(*) filter (where status = 'pending'::public.form_check_status),
    count(*) filter (where status = 'reviewed'::public.form_check_status)
    into v_pending, v_reviewed
    from public.form_checks;

  raise notice 'SEED TAMAM -> profiles=%, form_checks=% (pending=%, reviewed=%), daily_logs=%, workout_logs=%, messages=%',
    v_profiles, v_checks, v_pending, v_reviewed, v_logs, v_workouts, v_msgs;
  raise notice 'Giriş: coach@example.com / client1@example.com / client2@example.com  —  parola: Passw0rd!23';
end
$$;
