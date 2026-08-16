-- =============================================================================
-- 20260816090000_initial_schema.sql
-- Temel şema: enum'lar, tablolar, kısıtlar ve indeksler.
--
-- ROL MODELİ NOTU:
--   'admin'   = KOÇ      (tüm danışanları görür/yönetir)
--   'student' = DANIŞAN  (yalnızca kendi verisini görür)
-- Enum değerleri mevcut veriyi ve uygulama kodunu bozmamak için
-- KESİNLİKLE 'admin' / 'student' olarak kalır. "koç/danışan" sadece dokümantasyon terimidir.
--
-- Tüm ifadeler idempotenttir (IF NOT EXISTS / DO blokları).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Eklentiler
-- -----------------------------------------------------------------------------
-- Supabase'de `extensions` şeması hazır gelir; saf Postgres'te yoksa oluşturulur.
create schema if not exists extensions;

create extension if not exists "pgcrypto" with schema extensions;   -- gen_random_uuid, crypt, gen_salt
create extension if not exists "pg_trgm"  with schema extensions;   -- exercises/food isim araması


-- -----------------------------------------------------------------------------
-- 1) Enum tipleri
-- -----------------------------------------------------------------------------

-- Kullanıcı rolü: admin = koç, student = danışan
do $$
begin
  create type public.user_role as enum ('admin', 'student');
exception
  when duplicate_object then null;
end
$$;

-- Program onay durumu
do $$
begin
  create type public.approval_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end
$$;


-- -----------------------------------------------------------------------------
-- 2) profiles — auth.users ile 1:1 eşleşen uygulama profili
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text        not null default '',
  email            text,
  role             public.user_role not null default 'student',
  avatar_url       text,
  -- Beslenme planı: JSON string olarak saklanır -> Record<gün, { items, total }>
  nutrition_plan   text,
  -- Antrenman planı: JSON string olarak saklanır -> Record<gün, string>
  workout_plan     text,
  current_streak   integer     not null default 0,
  last_checkin_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.profiles                is 'Kullanıcı profilleri. role=admin koçu, role=student danışanı temsil eder.';
comment on column public.profiles.nutrition_plan is 'JSON string: Record<gün, { items: [], total: {} }>. Uygulama JSON.stringify ile yazar.';
comment on column public.profiles.workout_plan   is 'JSON string: Record<gün, string>. Uygulama JSON.stringify ile yazar.';
comment on column public.profiles.current_streak is 'Ardışık form-check gün sayısı. public.increment_streak() ile güncellenir.';

create index if not exists profiles_role_idx       on public.profiles (role);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);


-- -----------------------------------------------------------------------------
-- 3) notifications — koçtan danışana duyuru / sistem bildirimi
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid        not null references public.profiles (id) on delete cascade,
  -- title NULLABLE: WorkoutTab sistem bildirimlerini başlıksız insert ediyor.
  title       text,
  message     text        not null,
  is_read     boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on column public.notifications.title is 'NULL olabilir: WorkoutTab otomatik bildirimleri başlıksız gönderiyor.';

create index if not exists notifications_student_unread_idx on public.notifications (student_id, is_read);
create index if not exists notifications_student_recent_idx on public.notifications (student_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 4) form_checks — haftalık kilo + poz fotoğrafı takibi
-- -----------------------------------------------------------------------------
create table if not exists public.form_checks (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid          not null references public.profiles (id) on delete cascade,
  current_weight  numeric(6, 2) not null,
  front_pose_url  text,
  back_pose_url   text,
  notes           text,
  created_at      timestamptz   not null default now(),
  constraint form_checks_weight_range_chk check (current_weight > 0 and current_weight < 500)
);

create index if not exists form_checks_student_recent_idx on public.form_checks (student_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 5) daily_logs — günlük su / sodyum / makro girişi (gün başına tek kayıt)
-- -----------------------------------------------------------------------------
create table if not exists public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid          not null references public.profiles (id) on delete cascade,
  log_date    date          not null default current_date,
  water_lt    numeric(4, 2),
  sodium_mg   integer,
  -- macros: { "protein": n, "carb": n, "fat": n }
  macros      jsonb         not null default '{}'::jsonb,
  created_at  timestamptz   not null default now(),
  constraint daily_logs_water_range_chk  check (water_lt  is null or (water_lt  >= 0 and water_lt  <= 20)),
  constraint daily_logs_sodium_range_chk check (sodium_mg is null or (sodium_mg >= 0 and sodium_mg <= 50000)),
  constraint daily_logs_student_date_uniq unique (student_id, log_date)
);

comment on constraint daily_logs_student_date_uniq on public.daily_logs
  is 'Günde tek kayıt. İstemci tarafında insert yerine upsert (onConflict: student_id,log_date) kullanılmalı.';

create index if not exists daily_logs_student_date_idx on public.daily_logs (student_id, log_date desc);


-- -----------------------------------------------------------------------------
-- 6) workout_logs — set bazlı antrenman kaydı
-- -----------------------------------------------------------------------------
create table if not exists public.workout_logs (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid          not null references public.profiles (id) on delete cascade,
  exercise_name  text          not null,
  weight_kg      numeric(6, 2),
  reps           integer,
  rpe            integer,
  created_at     timestamptz   not null default now(),
  constraint workout_logs_weight_chk check (weight_kg is null or weight_kg >= 0),
  constraint workout_logs_reps_chk   check (reps      is null or reps > 0),
  constraint workout_logs_rpe_chk    check (rpe       is null or rpe between 1 and 10)
);

create index if not exists workout_logs_student_recent_idx on public.workout_logs (student_id, created_at desc);
create index if not exists workout_logs_exercise_idx       on public.workout_logs (student_id, exercise_name, created_at desc);


-- -----------------------------------------------------------------------------
-- 7) program_approvals — danışanın koç onayına sunduğu antrenman programı
-- -----------------------------------------------------------------------------
create table if not exists public.program_approvals (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid          not null references public.profiles (id) on delete cascade,
  workout_data  jsonb         not null,
  status        public.approval_status not null default 'pending',
  reviewed_by   uuid          references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz   not null default now()
);

create index if not exists program_approvals_student_status_idx on public.program_approvals (student_id, status);
create index if not exists program_approvals_pending_idx        on public.program_approvals (status, created_at desc);


-- -----------------------------------------------------------------------------
-- 8) messages — koç <-> danışan birebir sohbet
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid        not null references public.profiles (id) on delete cascade,
  receiver_id  uuid        not null references public.profiles (id) on delete cascade,
  message      text        not null,
  is_read      boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint messages_length_chk check (length(message) between 1 and 4000)
);

create index if not exists messages_thread_idx          on public.messages (sender_id, receiver_id, created_at);
create index if not exists messages_receiver_recent_idx on public.messages (receiver_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 9) exercises — referans egzersiz kataloğu (clean_exercises_v2.csv)
-- -----------------------------------------------------------------------------
create table if not exists public.exercises (
  id         bigserial primary key,
  name       text not null unique,
  body_part  text,
  target     text,
  equipment  text,
  gif_url    text,
  image      text
);

comment on table public.exercises is 'Salt-okunur referans katalog. Kaynak: src/app/clean_exercises_v2.csv';

create index if not exists exercises_name_lower_idx on public.exercises (lower(name));
create index if not exists exercises_body_part_idx  on public.exercises (body_part);
create index if not exists exercises_target_idx     on public.exercises (target);


-- -----------------------------------------------------------------------------
-- 10) food_database — referans besin kataloğu (clean_foods.csv)
-- -----------------------------------------------------------------------------
create table if not exists public.food_database (
  id                 bigserial primary key,
  name               text          not null unique,
  calories_per_100g  numeric(7, 2) not null,
  constraint food_database_calories_chk check (calories_per_100g >= 0)
);

comment on table public.food_database is 'Salt-okunur referans katalog. Kaynak: src/app/clean_foods.csv';

create index if not exists food_database_name_lower_idx on public.food_database (lower(name));


-- -----------------------------------------------------------------------------
-- 11) Trigram arama indeksleri (opsiyonel hızlandırma)
--     NutritionTab ve WorkoutTab isim üzerinden "içerir" araması yapıyor.
--     pg_trgm'in hangi şemada kurulu olduğu ortama göre değişebildiği için
--     indeks oluşturma hataları yutulur — indeks yoksa sorgular yine çalışır.
-- -----------------------------------------------------------------------------
do $$
begin
  execute 'create index if not exists exercises_name_trgm_idx on public.exercises using gin (name gin_trgm_ops)';
exception
  when others then
    raise notice 'exercises_name_trgm_idx atlandı: %', sqlerrm;
end
$$;

do $$
begin
  execute 'create index if not exists food_database_name_trgm_idx on public.food_database using gin (name gin_trgm_ops)';
exception
  when others then
    raise notice 'food_database_name_trgm_idx atlandı: %', sqlerrm;
end
$$;
