-- =============================================================================
-- 20260821120000_bb_signature_slice.sql
--
-- "İMZA DİLİMİ" TURU / TESLİMAT 2 — packages/domain tiplerinin DB implementasyonu
--   (contract-first). Sarmal v1 donduruldu (ADR-0029). bodybuilding_app.md
--   Rule 9: HER YENİ TABLO RLS İLE GELİR. Fable: koçluk katmanı korunur
--   (hibrit self-servis + koç).
--
-- Emsal desenler (BİREBİR izlendi; yeni implementasyon üretilmedi):
--   * 20260816090100_functions_and_triggers.sql  -> public.set_updated_at()
--   * 20260816090200_rls_policies.sql             -> workout_logs koç↔danışan RLS
--   * 20260817110000_workout_plan_tables.sql      -> plan tabloları RLS + koç-yazımı
--   * 20260817170000_force_rls_and_grants.sql     -> D/x/t revoke doktrini
--   * 20260819120000_mfa_aal2_gate.sql            -> RESTRICTIVE aal2 kapısı
--   * 20260820180000_account_active_state.sql     -> RESTRICTIVE aktif/pasif kapısı
--   * 20260820090000_activity_log.sql             -> yeni tabloyu İKİ kapıya ekleme
--
-- ##########################################################################
-- ## NE EKLER                                                             ##
-- ##########################################################################
--   ENUM : set_type · training_goal · workout_source
--   TABLO: workout_sessions (offline oturum konteyneri)
--          mesocycles       (periyodizasyon)
--   KOLON: workout_logs          += session_id, rir, set_type, superset_group,
--                                    client_mutation_id, updated_at
--          workout_plans         += owner_id (self-servis yazarlık, backfill)
--          workout_plan_exercises += target_rpe, target_percent_1rm
--   RLS  : iki yeni tablo -> enable + FORCE + PERMISSIVE (danışan/koç) +
--          İKİ RESTRICTIVE kapı (mfa_aal2_gate 16->18, account_active_gate 16->18)
--          workout_plans -> owner_id için EK permissive politikalar (koç yolu KORUNUR)
--
-- ##########################################################################
-- ## OFFLINE IDEMPOTENCY                                                   ##
-- ##########################################################################
--   workout_sessions ve workout_logs, `client_mutation_id` taşır. İstemci
--   çevrimdışıyken ürettiği her mutasyona bir uuid basar; bağlantı gelince
--   aynı satırı ikinci kez göndermesi UNIQUE (client_id, client_mutation_id)
--   WHERE client_mutation_id IS NOT NULL kısmi tekil indeksiyle REDDEDİLİR
--   (23505). NULL serbesttir (çevrimiçi/eski satırlar). Böylece "gönderdim mi
--   göndermedim mi" belirsizliğinde ikinci deneme veri ÇOĞALTMAZ.
--
-- ##########################################################################
-- ## KRİTİK — workout_sessions.client_id ON DELETE CASCADE (KVKK/silme)   ##
-- ##########################################################################
--   `delete_account()` (20260819100000) auth.users'ı siler; bu profiles'a
--   cascade eder ve fonksiyon silme SONRASI kalan satır varsa "silme EKSİK"
--   ile PATLAR. Yeni bir danışan-verisi tablosu profiles'a CASCADE OLMADAN
--   bağlanırsa hesap silme kırılırdı. Bu yüzden client_id -> profiles(id)
--   ON DELETE CASCADE'tir (activity_sessions / workout_plans ile aynı desen).
--   mesocycles -> workout_plans ON DELETE CASCADE, workout_plans -> profiles
--   zaten CASCADE olduğu için periyodizasyon da hesap silmede temizlenir.
--
-- Idempotenttir: enum'lar duplicate_object yutar, `create table if not exists`,
-- `add column if not exists`, FK/constraint guard'ları, `drop policy if exists`
-- + `create policy`, `create index if not exists`. İkinci koşu FARK ÜRETMEZ.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 0) ENUM TİPLERİ (repo deseni: duplicate_object yutulur)                 ##
-- #############################################################################
do $$
begin
  create type public.set_type as enum ('warmup', 'working', 'drop', 'failure');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.training_goal as enum ('bulk', 'cut', 'recomp', 'contest_prep');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.workout_source as enum ('program', 'freestyle');
exception when duplicate_object then null;
end $$;


-- #############################################################################
-- ## 1) public.workout_sessions — OFFLINE OTURUM KONTEYNERİ                  ##
-- #############################################################################
create table if not exists public.workout_sessions (
  id                   uuid                  primary key default gen_random_uuid(),
  client_id            uuid                  not null references public.profiles (id) on delete cascade,
  started_at           timestamptz           not null default now(),
  ended_at             timestamptz,                         -- null = oturum DEVAM EDİYOR
  source               public.workout_source not null default 'freestyle',
  perceived_difficulty smallint,
  notes                text,
  client_mutation_id   uuid,                                -- offline idempotency
  created_at           timestamptz           not null default now(),
  updated_at           timestamptz           not null default now(),
  deleted_at           timestamptz,                         -- soft delete
  constraint workout_sessions_difficulty_chk
    check (perceived_difficulty is null or perceived_difficulty between 1 and 10),
  constraint workout_sessions_window_chk
    check (ended_at is null or ended_at >= started_at)
);

comment on table public.workout_sessions is
  'Faz "Imza Dilimi": offline antrenman oturumu konteyneri. workout_logs.session_id bu tabloya baglanir. client_mutation_id ile cevrimdisi idempotent upsert. Yazma: danisan KENDI oturumunu (client_id = auth.uid()); koc gunceller/siler (workout_logs deseni). client_id -> profiles CASCADE (hesap silme kirilmasin).';
comment on column public.workout_sessions.ended_at is
  'NULL = oturum devam ediyor. Doldugunda >= started_at (window_chk).';
comment on column public.workout_sessions.client_mutation_id is
  'Offline idempotency anahtari. UNIQUE (client_id, client_mutation_id) WHERE NOT NULL: ayni mutasyonun ikinci gonderimi 23505 ile reddedilir. NULL serbesttir.';
comment on column public.workout_sessions.deleted_at is
  'Soft delete damgasi. NULL = aktif. RLS bunu filtrelemez; gizleme uygulama sorumlulugudur.';

create index if not exists workout_sessions_client_started_idx
  on public.workout_sessions (client_id, started_at desc);

-- OFFLINE IDEMPOTENCY: ayni (client_id, client_mutation_id) ikinci kez yazilamaz.
create unique index if not exists workout_sessions_client_mutation_uniq
  on public.workout_sessions (client_id, client_mutation_id)
  where client_mutation_id is not null;

drop trigger if exists set_workout_sessions_updated_at on public.workout_sessions;
create trigger set_workout_sessions_updated_at
  before update on public.workout_sessions
  for each row
  execute function public.set_updated_at();


-- #############################################################################
-- ## 2) public.mesocycles — PERİYODİZASYON                                   ##
-- #############################################################################
create table if not exists public.mesocycles (
  id          uuid                  primary key default gen_random_uuid(),
  plan_id     uuid                  not null references public.workout_plans (id) on delete cascade,
  name        text                  not null,
  weeks       smallint              not null,
  deload_week smallint,
  goal        public.training_goal  not null,
  position    integer               not null default 0,
  created_at  timestamptz           not null default now(),
  updated_at  timestamptz           not null default now(),
  constraint mesocycles_weeks_chk       check (weeks > 0),
  constraint mesocycles_deload_week_chk check (deload_week is null or (deload_week > 0 and deload_week <= weeks))
);

comment on table public.mesocycles is
  'Faz "Imza Dilimi": periyodizasyon mezosiklu. Sahiplik PLANDAN turetilir (workout_plans.client_id / owner_id / is_coach). plan_id -> workout_plans CASCADE (plan silinince mezosikluler de gider; hesap silme plan uzerinden zincirlenir).';
comment on column public.mesocycles.deload_week is
  'Deload haftasi (1..weeks). NULL = deload yok.';
comment on column public.mesocycles.position is
  'Plan icindeki mezosiklu sirasi (0''dan baslar).';

create index if not exists mesocycles_plan_position_idx
  on public.mesocycles (plan_id, position);

drop trigger if exists set_mesocycles_updated_at on public.mesocycles;
create trigger set_mesocycles_updated_at
  before update on public.mesocycles
  for each row
  execute function public.set_updated_at();


-- #############################################################################
-- ## 3) workout_logs GENİŞLETME (mevcut set tablosu — kolonlara DOKUNULMAZ)  ##
-- #############################################################################
--   rpe zaten var; rir YANINA eklenir (domain converter'lari kopruler).
alter table public.workout_logs
  add column if not exists session_id         uuid,
  add column if not exists rir                smallint,
  add column if not exists set_type           public.set_type not null default 'working',
  add column if not exists superset_group     smallint,
  add column if not exists client_mutation_id uuid,
  add column if not exists updated_at         timestamptz not null default now();

-- FK ayri ekleniyor: `add column ... references` idempotent degildir
-- (20260817190000 §1 ile ayni guard deseni).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_session_id_fkey'
       and conrelid = 'public.workout_logs'::regclass
  ) then
    alter table public.workout_logs
      add constraint workout_logs_session_id_fkey
      foreign key (session_id)
      references public.workout_sessions (id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_rir_chk'
       and conrelid = 'public.workout_logs'::regclass
  ) then
    alter table public.workout_logs
      add constraint workout_logs_rir_chk check (rir is null or rir between 0 and 10);
  end if;
end
$$;

comment on column public.workout_logs.session_id is
  'Setin ait oldugu antrenman oturumu (workout_sessions.id). NULLABLE: oturumsuz/eski setler. ON DELETE SET NULL — oturum silinince set yasar, yalnizca baglanti kopar (workout_logs.completed_at denormalize damgasi ile ayni felsefe).';
comment on column public.workout_logs.rir is
  'Reps In Reserve (0..10). rpe''nin yanindadir; domain rpeToRir/rirToRpe koprusu ikisini iliskilendirir. NULLABLE.';
comment on column public.workout_logs.set_type is
  'Set turu (warmup/working/drop/failure). Varsayilan working — mevcut satirlarin tamami working''e backfill edilir.';
comment on column public.workout_logs.superset_group is
  'Ayni superset icinde gruplanan setlerin ortak etiketi (NULL = superset degil).';
comment on column public.workout_logs.client_mutation_id is
  'Offline idempotency anahtari. UNIQUE (client_id, client_mutation_id) WHERE NOT NULL: ayni set mutasyonunun ikinci gonderimi 23505 ile reddedilir.';

create index if not exists workout_logs_session_idx
  on public.workout_logs (session_id)
  where session_id is not null;

-- OFFLINE IDEMPOTENCY (idempotent offline upsert): ayni set iki kez yazilamaz.
create unique index if not exists workout_logs_client_mutation_uniq
  on public.workout_logs (client_id, client_mutation_id)
  where client_mutation_id is not null;

-- updated_at trigger (workout_logs'ta bugune kadar YOKTU).
drop trigger if exists set_workout_logs_updated_at on public.workout_logs;
create trigger set_workout_logs_updated_at
  before update on public.workout_logs
  for each row
  execute function public.set_updated_at();


-- #############################################################################
-- ## 4) workout_plans GENİŞLETME — owner_id (self-servis yazarlık)           ##
-- #############################################################################
--   ############################################################################
--   # Fable: HİBRİT self-servis + koç. Koç-atama yolu (20260817110000 §6 RLS)  #
--   # OLDUĞU GİBİ KALIR; owner_id EK bir yazarlik yoludur. owner kendi planini  #
--   # gorur/yazar. PERMISSIVE politikalar VEYA'landigi icin bu EKLEME mevcut    #
--   # koc/danisan yollarini KISITLAMAZ — yalnizca genisletir.                  #
--   ############################################################################
alter table public.workout_plans
  add column if not exists owner_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_plans_owner_id_fkey'
       and conrelid = 'public.workout_plans'::regclass
  ) then
    alter table public.workout_plans
      add constraint workout_plans_owner_id_fkey
      foreign key (owner_id)
      references public.profiles (id)
      on delete set null;
  end if;
end
$$;

comment on column public.workout_plans.owner_id is
  'Self-servis yazar (planin sahibi). Mevcut satirlar owner_id := client_id ile backfill edildi. Koc-atama yolunda NULL kalabilir; koc yolu is_coach() ile korunur. ON DELETE SET NULL.';

-- BACKFILL: mevcut planlarin yazari sahibidir.
update public.workout_plans set owner_id = client_id where owner_id is null;

create index if not exists workout_plans_owner_idx
  on public.workout_plans (owner_id)
  where owner_id is not null;

-- --- owner_id için EK PERMISSIVE politikalar (mevcut workout_plans_* KORUNUR) ---
--     Ayri adlar kullanilir: mevcut (immutable) politikalari EZMEDEN eklenir.
drop policy if exists workout_plans_owner_select on public.workout_plans;
create policy workout_plans_owner_select
  on public.workout_plans
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists workout_plans_owner_insert on public.workout_plans;
create policy workout_plans_owner_insert
  on public.workout_plans
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists workout_plans_owner_update on public.workout_plans;
create policy workout_plans_owner_update
  on public.workout_plans
  for update
  to authenticated
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists workout_plans_owner_delete on public.workout_plans;
create policy workout_plans_owner_delete
  on public.workout_plans
  for delete
  to authenticated
  using (owner_id = auth.uid());


-- #############################################################################
-- ## 5) workout_plan_exercises GENİŞLETME — periyodizasyon hedefleri         ##
-- #############################################################################
alter table public.workout_plan_exercises
  add column if not exists target_rpe         numeric,
  add column if not exists target_percent_1rm numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_plan_exercises_target_rpe_chk'
       and conrelid = 'public.workout_plan_exercises'::regclass
  ) then
    alter table public.workout_plan_exercises
      add constraint workout_plan_exercises_target_rpe_chk
      check (target_rpe is null or target_rpe between 1 and 10);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_plan_exercises_target_percent_1rm_chk'
       and conrelid = 'public.workout_plan_exercises'::regclass
  ) then
    alter table public.workout_plan_exercises
      add constraint workout_plan_exercises_target_percent_1rm_chk
      check (target_percent_1rm is null or target_percent_1rm between 1 and 100);
  end if;
end
$$;

comment on column public.workout_plan_exercises.target_rpe is
  'Periyodizasyon hedefi: hedef RPE (1..10). domain rpeToPercent besler. NULLABLE.';
comment on column public.workout_plan_exercises.target_percent_1rm is
  'Periyodizasyon hedefi: 1RM yuzdesi (1..100). NULLABLE.';


-- #############################################################################
-- ## 6) TABLO YETKİLERİ (20260817110000 §3 + 20260817170000 §1 doktrini)     ##
-- #############################################################################
--   Yeni tablolar toplu GRANT'tan (20260816090200) SONRA olusuyor; yetkiler
--   tablo-ozel tekrar edilmeli. D/x/t (TRUNCATE/REFERENCES/TRIGGER) authenticated/
--   anon'a ASLA verilmez (senaryo 73 dinamik kontrolu).
revoke all on public.workout_sessions from anon;
revoke all on public.mesocycles       from anon;

grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.mesocycles       to authenticated;

revoke truncate, references, trigger on public.workout_sessions from authenticated;
revoke truncate, references, trigger on public.mesocycles       from authenticated;

grant all on public.workout_sessions to service_role;
grant all on public.mesocycles       to service_role;


-- #############################################################################
-- ## 7) RLS — PERMISSIVE (danışan/koç) + FORCE                               ##
-- #############################################################################
alter table public.workout_sessions enable row level security;
alter table public.workout_sessions force  row level security;
alter table public.mesocycles       enable row level security;
alter table public.mesocycles       force  row level security;

-- --- workout_sessions: workout_logs deseni BİREBİR ---
--     select: sahibi + koç · insert: YALNIZCA sahibi (koç INSERT edemez,
--     senaryo 88 ile ayni sinir) · update/delete: sahibi + koç.
drop policy if exists workout_sessions_select on public.workout_sessions;
create policy workout_sessions_select
  on public.workout_sessions
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists workout_sessions_insert on public.workout_sessions;
create policy workout_sessions_insert
  on public.workout_sessions
  for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists workout_sessions_update on public.workout_sessions;
create policy workout_sessions_update
  on public.workout_sessions
  for update
  to authenticated
  using      (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists workout_sessions_delete on public.workout_sessions;
create policy workout_sessions_delete
  on public.workout_sessions
  for delete
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

-- --- mesocycles: yetki PLAN üzerinden türetilir (workout_plan_exercises deseni) ---
--     owner_id de yola dahildir (self-servis yazarlik).
drop policy if exists mesocycles_select on public.mesocycles;
create policy mesocycles_select
  on public.mesocycles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = mesocycles.plan_id
        and (wp.client_id = auth.uid() or wp.owner_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists mesocycles_insert on public.mesocycles;
create policy mesocycles_insert
  on public.mesocycles
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = mesocycles.plan_id
        and (public.is_coach() or wp.client_id = auth.uid() or wp.owner_id = auth.uid())
    )
  );

drop policy if exists mesocycles_update on public.mesocycles;
create policy mesocycles_update
  on public.mesocycles
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = mesocycles.plan_id
        and (public.is_coach() or wp.client_id = auth.uid() or wp.owner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = mesocycles.plan_id
        and (public.is_coach() or wp.client_id = auth.uid() or wp.owner_id = auth.uid())
    )
  );

drop policy if exists mesocycles_delete on public.mesocycles;
create policy mesocycles_delete
  on public.mesocycles
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = mesocycles.plan_id
        and (public.is_coach() or wp.client_id = auth.uid() or wp.owner_id = auth.uid())
    )
  );


-- #############################################################################
-- ## 8) RESTRICTIVE KAPILAR — mfa_aal2_gate + account_active_gate            ##
-- #############################################################################
--   ############################################################################
--   # 20260819120000 / 20260820180000 DEĞİŞTİRİLMEZ (salt-eklemeli repo kurali).#
--   # AYNI kalip, AYNI politika adiyla bu iki yeni tabloya EKLENIR — tipki      #
--   # 20260820090000_activity_log.sql'in 14->16 yaptigi gibi, burada 16->18.    #
--   # Yeni danisan-verisi tablolari da aal1 koca KAPALI, pasif danisana KAPALI  #
--   # olmalidir (portfolyo RLS hikayesi tutarliliga dayanir). Eski migration'lar#
--   # replay'de KIRILMAZ — onlar kostugunda bu tablolar henuz yok.             #
--   # Danisana etkisi SIFIR (not is_coach() / is_active_user dallari).          #
--   ############################################################################
do $$
declare
  v_table text;
begin
  foreach v_table in array array['workout_sessions', 'mesocycles'] loop
    -- mfa_aal2_gate: koç aal1'de yeni tabloları GÖREMEZ (fail-closed).
    execute format('drop policy if exists mfa_aal2_gate on public.%I', v_table);
    execute format($fmt$
      create policy mfa_aal2_gate on public.%I
        as restrictive
        for all
        to authenticated
        using (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
        with check (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
    $fmt$, v_table);
    execute format(
      'comment on policy mfa_aal2_gate on public.%I is %L',
      v_table,
      'ADR-0026 kalibi (Imza Dilimi''nde 16 -> 18 tabloya genisletildi): koc hesabi icin ikinci faktor zorunlulugu. Danisani ETKILEMEZ. Kaldirilirsa koc, yalnizca parolayla tum danisanlarin oturum/periyodizasyon verisini okur.'
    );

    -- account_active_gate: pasif danışan yeni tabloları okuyamaz/yazamaz.
    execute format('drop policy if exists account_active_gate on public.%I', v_table);
    execute format($fmt$
      create policy account_active_gate on public.%I
        as restrictive
        for all
        to authenticated
        using ((select public.is_active_user()))
        with check ((select public.is_active_user()))
    $fmt$, v_table);
    execute format(
      'comment on policy account_active_gate on public.%I is %L',
      v_table,
      'Faz 4.10 kalibi (Imza Dilimi''nde 16 -> 18): pasif danisan (is_active=false) engeli. Cagiran aktifse gecer (koc HER ZAMAN aktif). Kaldirilirsa pasif danisan tekrar oturum/periyodizasyon verisini gorur.'
    );
  end loop;
end
$$;


-- #############################################################################
-- ## 9) MIGRATION'IN KENDİ DOĞRULAMASI — SESSİZ BAŞARISIZLIK YOK             ##
-- #############################################################################
do $verify$
declare
  v_missing text;
  v_mfa     int;
  v_active  int;
begin
  -- (a) Enum'lar kuruldu mu?
  select string_agg(t, ', ' order by t) into v_missing
    from unnest(array['set_type', 'training_goal', 'workout_source']) as t
   where to_regtype(format('public.%I', t)) is null;
  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ (a): enum tip(ler)i yok -> %', v_missing;
  end if;

  -- (b) Yeni tablolar var mı?
  if to_regclass('public.workout_sessions') is null then
    raise exception 'DOGRULAMA BASARISIZ (b): public.workout_sessions olusmadi.';
  end if;
  if to_regclass('public.mesocycles') is null then
    raise exception 'DOGRULAMA BASARISIZ (b): public.mesocycles olusmadi.';
  end if;

  -- (c) Genişletilen kolonlar geldi mi?
  select string_agg(x.tbl || '.' || x.col, ', ') into v_missing
    from (values
      ('workout_logs', 'session_id'), ('workout_logs', 'rir'),
      ('workout_logs', 'set_type'), ('workout_logs', 'superset_group'),
      ('workout_logs', 'client_mutation_id'), ('workout_logs', 'updated_at'),
      ('workout_plans', 'owner_id'),
      ('workout_plan_exercises', 'target_rpe'),
      ('workout_plan_exercises', 'target_percent_1rm')
    ) as x(tbl, col)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = x.tbl and c.column_name = x.col
   );
  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ (c): eklenen kolon(lar) eksik -> %', v_missing;
  end if;

  -- (d) client_id -> profiles CASCADE mi? (hesap silme kirilmasin)
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.workout_sessions'::regclass
       and contype = 'f'
       and confrelid = 'public.profiles'::regclass
       and confdeltype = 'c'   -- 'c' = CASCADE
  ) then
    raise exception 'DOGRULAMA BASARISIZ (d): workout_sessions.client_id -> profiles ON DELETE CASCADE DEGIL -- hesap silme kirilir.';
  end if;

  -- (e) İki RESTRICTIVE kapı da 18 tabloda mı?
  select count(*) into v_mfa
    from pg_policies where schemaname='public' and policyname='mfa_aal2_gate';
  if v_mfa <> 18 then
    raise exception 'DOGRULAMA BASARISIZ (e): mfa_aal2_gate % tabloda (18 bekleniyordu).', v_mfa;
  end if;

  select count(*) into v_active
    from pg_policies where schemaname='public' and policyname='account_active_gate';
  if v_active <> 18 then
    raise exception 'DOGRULAMA BASARISIZ (e): account_active_gate % tabloda (18 bekleniyordu).', v_active;
  end if;

  -- (f) Yeni tablolarda İKİ kapı da RESTRICTIVE+ALL+authenticated, using+with_check dolu mu?
  select count(*) into v_mfa
    from pg_policies p
   where p.schemaname='public'
     and p.tablename in ('workout_sessions', 'mesocycles')
     and p.policyname in ('mfa_aal2_gate', 'account_active_gate')
     and p.permissive='RESTRICTIVE' and p.cmd='ALL'
     and p.roles='{authenticated}'::name[]
     and p.qual is not null and p.with_check is not null;
  if v_mfa <> 4 then
    raise exception 'DOGRULAMA BASARISIZ (f): yeni tablolarda 4 dogru RESTRICTIVE kapi bekleniyordu, % var.', v_mfa;
  end if;

  -- (g) Offline idempotency kismi tekil indeksleri kuruldu mu?
  if to_regclass('public.workout_sessions_client_mutation_uniq') is null
     or to_regclass('public.workout_logs_client_mutation_uniq') is null then
    raise exception 'DOGRULAMA BASARISIZ (g): client_mutation_id kismi tekil indeks(ler)i eksik.';
  end if;

  raise notice 'DOGRULAMA GECTI: enum(3) + workout_sessions/mesocycles + genisletmeler + CASCADE + mfa/active kapi 18/18 + idempotency indeksleri.';
end
$verify$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: workout_sessions ve mesocycles içindeki TÜM veriyi siler. workout_logs
-- genişletme kolonları (session_id/rir/set_type/superset_group/client_mutation_id/
-- updated_at) ve bu kolonlardaki veri KALICI kaybolur. Önce yedek alın.
--
-- begin;
--   -- 8) RESTRICTIVE kapılar
--   do $$ declare v_t text; begin
--     foreach v_t in array array['workout_sessions','mesocycles'] loop
--       execute format('drop policy if exists mfa_aal2_gate on public.%I', v_t);
--       execute format('drop policy if exists account_active_gate on public.%I', v_t);
--     end loop;
--   end $$;
--
--   -- 7) PERMISSIVE politikalar (tablolar DROP edilince zaten düşer)
--   drop policy if exists mesocycles_delete       on public.mesocycles;
--   drop policy if exists mesocycles_update       on public.mesocycles;
--   drop policy if exists mesocycles_insert       on public.mesocycles;
--   drop policy if exists mesocycles_select       on public.mesocycles;
--   drop policy if exists workout_sessions_delete on public.workout_sessions;
--   drop policy if exists workout_sessions_update on public.workout_sessions;
--   drop policy if exists workout_sessions_insert on public.workout_sessions;
--   drop policy if exists workout_sessions_select on public.workout_sessions;
--
--   -- 4) workout_plans owner politikaları + kolon
--   drop policy if exists workout_plans_owner_delete on public.workout_plans;
--   drop policy if exists workout_plans_owner_update on public.workout_plans;
--   drop policy if exists workout_plans_owner_insert on public.workout_plans;
--   drop policy if exists workout_plans_owner_select on public.workout_plans;
--   alter table public.workout_plans drop constraint if exists workout_plans_owner_id_fkey;
--   alter table public.workout_plans drop column if exists owner_id;
--
--   -- 5) workout_plan_exercises kolonları
--   alter table public.workout_plan_exercises
--     drop constraint if exists workout_plan_exercises_target_percent_1rm_chk,
--     drop constraint if exists workout_plan_exercises_target_rpe_chk,
--     drop column if exists target_percent_1rm,
--     drop column if exists target_rpe;
--
--   -- 3) workout_logs genişletme
--   drop trigger if exists set_workout_logs_updated_at on public.workout_logs;
--   drop index if exists public.workout_logs_client_mutation_uniq;
--   drop index if exists public.workout_logs_session_idx;
--   alter table public.workout_logs
--     drop constraint if exists workout_logs_session_id_fkey,
--     drop constraint if exists workout_logs_rir_chk,
--     drop column if exists updated_at,
--     drop column if exists client_mutation_id,
--     drop column if exists superset_group,
--     drop column if exists set_type,
--     drop column if exists rir,
--     drop column if exists session_id;
--
--   -- 2) mesocycles, 1) workout_sessions
--   drop table if exists public.mesocycles;
--   drop table if exists public.workout_sessions;
--
--   -- 0) enum'lar (bağımlı kolonlar düştükten SONRA)
--   drop type if exists public.workout_source;
--   drop type if exists public.training_goal;
--   drop type if exists public.set_type;
-- commit;
-- =============================================================================
