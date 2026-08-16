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
-- ##     coach@example.com    -> role = admin   (KOÇ)                         ##
-- ##     client1@example.com  -> role = student (DANIŞAN)                     ##
-- ##     client2@example.com  -> role = student (DANIŞAN)                     ##
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
    '{"full_name":"Deniz Koç","role":"admin"}'::jsonb,
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
    '{"full_name":"Ahmet Yılmaz","role":"student"}'::jsonb,
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
    '{"full_name":"Elif Demir","role":"student"}'::jsonb,
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
  ('11111111-1111-1111-1111-111111111111', 'Deniz Koç',    'coach@example.com',   'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Ahmet Yılmaz', 'client1@example.com', 'student'),
  ('33333333-3333-3333-3333-333333333333', 'Elif Demir',   'client2@example.com', 'student')
on conflict (id) do nothing;

-- Koç profili
update public.profiles
   set full_name       = 'Deniz Koç',
       email           = 'coach@example.com',
       role            = 'admin',
       avatar_url      = null,
       current_streak  = 0,
       last_checkin_at = null
 where id = '11111111-1111-1111-1111-111111111111';

-- Danışan 1: yağ yakımı odaklı, aktif seri
update public.profiles
   set full_name       = 'Ahmet Yılmaz',
       email           = 'client1@example.com',
       role            = 'student',
       avatar_url      = null,
       current_streak  = 6,
       last_checkin_at = now() - interval '4 hours',
       nutrition_plan  = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g\nPirinç 150g\nYoğurt 200g","total":1850},"Salı":{"items":"Omlet (3 yumurta)\nTam Buğday Ekmeği 2 dilim\nTon Balığı 150g\nSalata","total":1780},"Çarşamba":{"items":"Yulaf Ezmesi 80g\nKıyma 150g\nBulgur 150g\nAyran","total":1900},"Perşembe":{"items":"Peynirli Omlet\nTavuk Göğsü 200g\nTatlı Patates 200g","total":1820},"Cuma":{"items":"Yulaf + Muz\nSomon 180g\nKinoa 120g","total":1950},"Cumartesi":{"items":"Serbest Öğün (kontrollü)\nTavuk Dürüm","total":2200},"Pazar":{"items":"Yumurta 3 adet\nMercimek Çorbası\nTavuk Salata","total":1700}}$json$,
       workout_plan    = $json${"Pazartesi":"1. Bench Press - 4x8\n2. Incline Dumbbell Press - 3x10\n3. Cable Fly - 3x12\n4. Triceps Pushdown - 3x12","Salı":"1. Deadlift - 4x5\n2. Barbell Row - 4x8\n3. Lat Pulldown - 3x10\n4. Barbell Curl - 3x12","Çarşamba":"Dinlenme","Perşembe":"1. Squat - 4x8\n2. Leg Press - 3x12\n3. Romanian Deadlift - 3x10\n4. Calf Raise - 4x15","Cuma":"1. Overhead Press - 4x8\n2. Lateral Raise - 3x15\n3. Face Pull - 3x15\n4. Shrug - 3x12","Cumartesi":"1. Pull Up - 4x8\n2. Dips - 3x10\n3. Plank - 3x60","Pazar":"Dinlenme"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

-- Danışan 2: kas kütlesi artışı odaklı
update public.profiles
   set full_name       = 'Elif Demir',
       email           = 'client2@example.com',
       role            = 'student',
       avatar_url      = null,
       current_streak  = 2,
       last_checkin_at = now() - interval '1 day 3 hours',
       nutrition_plan  = $json${"Pazartesi":{"items":"Yulaf Ezmesi 60g\nYumurta 2 adet\nTavuk Göğsü 150g\nPirinç 120g","total":2100},"Salı":{"items":"Smoothie (muz+yulaf+süt)\nHindi Göğsü 150g\nMakarna 150g","total":2200},"Çarşamba":{"items":"Menemen\nKöfte 150g\nBulgur Pilavı 150g","total":2150},"Perşembe":{"items":"Yulaf + Fıstık Ezmesi\nSomon 150g\nTatlı Patates 200g","total":2250},"Cuma":{"items":"Peynirli Tost\nTavuk 200g\nPirinç 150g","total":2180},"Cumartesi":{"items":"Serbest Öğün\nPizza (2 dilim)","total":2400},"Pazar":{"items":"Yumurta 3 adet\nEt Sote 200g\nSalata","total":2050}}$json$,
       workout_plan    = $json${"Pazartesi":"1. Squat - 5x5\n2. Leg Press - 3x12\n3. Leg Curl - 3x12\n4. Hip Thrust - 4x10","Salı":"1. Bench Press - 4x6\n2. Overhead Press - 3x10\n3. Lateral Raise - 3x15","Çarşamba":"Dinlenme","Perşembe":"1. Deadlift - 4x5\n2. Lat Pulldown - 4x10\n3. Seated Row - 3x12\n4. Hammer Curl - 3x12","Cuma":"1. Front Squat - 4x8\n2. Lunge - 3x12\n3. Calf Raise - 4x20","Cumartesi":"1. Pull Up - 3x6\n2. Push Up - 3x15\n3. Plank - 3x45","Pazar":"Dinlenme"}$json$
 where id = '33333333-3333-3333-3333-333333333333';


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
-- =============================================================================

insert into public.form_checks (student_id, current_weight, front_pose_url, back_pose_url, notes, created_at)
select
  '22222222-2222-2222-2222-222222222222'::uuid,
  round((92.40 - (i * 0.75))::numeric, 2),
  'https://placehold.co/600x800/png?text=Front+W' || (i + 1),
  case when i % 2 = 0 then 'https://placehold.co/600x800/png?text=Back+W' || (i + 1) else null end,
  case i
    when 0 then 'Başlangıç ölçümü. Kondisyon düşük.'
    when 1 then 'Su tüketimi arttı, ödem azaldı.'
    when 2 then 'Bel çevresinde belirgin incelme.'
    when 3 then 'Antrenman hacmi artırıldı.'
    when 4 then 'Enerji seviyesi iyi, uyku düzenli.'
    else 'Hedefe yaklaşıyoruz, karbonhidrat siklusu başlıyor.'
  end,
  now() - make_interval(weeks => (5 - i))
from generate_series(0, 5) as i
where not exists (
  select 1 from public.form_checks
  where student_id = '22222222-2222-2222-2222-222222222222'::uuid
);

insert into public.form_checks (student_id, current_weight, front_pose_url, back_pose_url, notes, created_at)
select
  '33333333-3333-3333-3333-333333333333'::uuid,
  round((61.00 + (i * 0.60))::numeric, 2),
  'https://placehold.co/600x800/png?text=Front+W' || (i + 1),
  case when i % 3 = 0 then 'https://placehold.co/600x800/png?text=Back+W' || (i + 1) else null end,
  case i
    when 0 then 'Başlangıç ölçümü. Hedef: temiz kütle artışı.'
    when 1 then 'Kalori 200 kcal artırıldı.'
    when 2 then 'Squat performansı yükseliyor.'
    when 3 then 'Bacak hacminde artış gözlendi.'
    when 4 then 'Protein alımı hedefte.'
    else 'Kuvvet artışı devam ediyor, form korunuyor.'
  end,
  now() - make_interval(weeks => (5 - i))
from generate_series(0, 5) as i
where not exists (
  select 1 from public.form_checks
  where student_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 5) GÜNLÜK KAYITLAR — danışan başına son 14 gün
--    (student_id, log_date) UNIQUE olduğu için ON CONFLICT DO NOTHING yeterli.
-- =============================================================================

insert into public.daily_logs (student_id, log_date, water_lt, sodium_mg, macros, created_at)
select
  s.student_id,
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
) as s (student_id, base_water, base_sodium, base_protein, base_carb, base_fat)
on conflict (student_id, log_date) do nothing;


-- =============================================================================
-- 6) ANTRENMAN KAYITLARI — danışan başına 20 set
-- =============================================================================

insert into public.workout_logs (student_id, exercise_name, weight_kg, reps, rpe, created_at)
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
  where student_id = '22222222-2222-2222-2222-222222222222'::uuid
);

insert into public.workout_logs (student_id, exercise_name, weight_kg, reps, rpe, created_at)
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
  where student_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 7) BİLDİRİMLER — danışan başına 3 adet
-- =============================================================================

insert into public.notifications (student_id, title, message, is_read, created_at)
select v.student_id, v.title, v.message, v.is_read, v.created_at
from (
  values
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Haftalık Form Check Hatırlatması', 'Bu haftanın poz fotoğraflarını ve kilonu yüklemeyi unutma.', true,  now() - interval '6 days'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Program Güncellendi',              'Antrenman hacmi %10 artırıldı. Yeni programı Antrenman sekmesinden kontrol et.', false, now() - interval '2 days'),
    ('22222222-2222-2222-2222-222222222222'::uuid, null,                               '✅ Koçun yeni antrenman programını onayladı! Artık kullanabilirsin.', false, now() - interval '5 hours'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Su Tüketimi',                      'Günlük su hedefin 2.5 L. Son 3 gün altında kaldın.', true,  now() - interval '4 days'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'Beslenme Planı Yenilendi',         'Kalori hedefi 2200 kcal olarak güncellendi.', false, now() - interval '1 day'),
    ('33333333-3333-3333-3333-333333333333'::uuid, null,                               '🔔 Onayına sunulan antrenman programı koç tarafından inceleniyor.', false, now() - interval '3 hours')
) as v (student_id, title, message, is_read, created_at)
where not exists (select 1 from public.notifications);


-- =============================================================================
-- 8) MESAJLAR — danışan başına koç ile 4 mesajlık sohbet
-- =============================================================================

insert into public.messages (sender_id, receiver_id, message, is_read, created_at)
select v.sender_id, v.receiver_id, v.message, v.is_read, v.created_at
from (
  values
    -- Koç <-> Danışan 1
    ('22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'Merhaba koç, bu hafta dizimde hafif bir rahatsızlık var. Squat''ı değiştirelim mi?', true,  now() - interval '3 days 4 hours'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Merhaba Ahmet. Bu hafta squat yerine leg press yapalım, ağırlığı %20 düşür.',           true,  now() - interval '3 days 3 hours'),
    ('22222222-2222-2222-2222-222222222222'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'Tamamdır, bugün öyle yaptım. Ağrı yoktu.',                                              true,  now() - interval '2 days'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Harika. Gelecek hafta kademeli olarak squat''a dönüyoruz.',                             false, now() - interval '1 day 20 hours'),
    -- Koç <-> Danışan 2
    ('33333333-3333-3333-3333-333333333333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'Koçum, kilo alımı yavaşladı. Kaloriyi artıralım mı?',                                   true,  now() - interval '2 days 6 hours'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Evet, günlük 200 kcal ekleyelim. Öğün planını güncelledim.',                            true,  now() - interval '2 days 5 hours'),
    ('33333333-3333-3333-3333-333333333333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'Gördüm, teşekkürler. Protein hedefini de tutturuyorum.',                                false, now() - interval '1 day'),
    ('11111111-1111-1111-1111-111111111111'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Süper. Cumartesi form check fotoğraflarını bekliyorum.',                                false, now() - interval '8 hours')
) as v (sender_id, receiver_id, message, is_read, created_at)
where not exists (select 1 from public.messages);


-- =============================================================================
-- 9) PROGRAM ONAY TALEPLERİ — danışan başına 1 adet 'pending'
-- =============================================================================

insert into public.program_approvals (student_id, workout_data, status, created_at)
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
  where student_id = '22222222-2222-2222-2222-222222222222'::uuid
);

insert into public.program_approvals (student_id, workout_data, status, created_at)
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
  where student_id = '33333333-3333-3333-3333-333333333333'::uuid
);


-- =============================================================================
-- 10) ÖZET
-- =============================================================================
do $$
declare
  v_profiles  bigint;
  v_checks    bigint;
  v_logs      bigint;
  v_workouts  bigint;
  v_msgs      bigint;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_checks   from public.form_checks;
  select count(*) into v_logs     from public.daily_logs;
  select count(*) into v_workouts from public.workout_logs;
  select count(*) into v_msgs     from public.messages;

  raise notice 'SEED TAMAM -> profiles=%, form_checks=%, daily_logs=%, workout_logs=%, messages=%',
    v_profiles, v_checks, v_logs, v_workouts, v_msgs;
  raise notice 'Giriş: coach@example.com / client1@example.com / client2@example.com  —  parola: Passw0rd!23';
end
$$;
