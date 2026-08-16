-- =============================================================================
-- 20260817110000_workout_plan_tables.sql
--
-- FAZ 1b / ADIM 1 — Antrenman planlarının normalize edilmesi.
--
-- `profiles.workout_plan` bugüne kadar JSON string olarak (`Record<gün, string>`)
-- saklanıyordu. Bu migration aynı veriyi iki normalize tabloya taşır:
--
--     public.workout_plans            (danışan başına versiyonlanmış plan başlığı)
--     public.workout_plan_exercises   (gün + sıra bazlı satırlar)
--
-- TASARIM KARARI — `raw_line` KANONİKTİR:
--   Her plan satırının ORİJİNAL metni `raw_line` kolonunda kayıpsız saklanır.
--   `name` / `target_sets` / `target_reps` / `target_weight_kg` / `video_url`
--   kolonları TÜREVDİR ve NULL olabilir; ayrıştırma "best effort"tur.
--   Bir günün metninin geri üretimi = o güne ait `raw_line` değerlerinin
--   `position` sırasıyla E'\n' ile birleştirilmesidir ve BİREBİR KAYIPSIZ olmalıdır.
--   (Tek bilinçli istisna: yalnızca boşluktan ibaret satırlar atlanır — bkz.
--   `public.explode_plan_day` ve supabase/tests/transform.test.sql senaryo 2b.)
--
-- TEK AYRIŞTIRICI KURALI:
--   `public.explode_plan_day()` hem bu migration'ın veri dönüşümü hem de
--   uygulamanın çağıracağı `public.save_workout_plan()` RPC'si tarafından
--   kullanılır. İKİNCİ BİR AYRIŞTIRICI İMPLEMENTASYONU YOKTUR.
--
-- BU MİGRATION `profiles.workout_plan` KOLONUNU **SİLMEZ**.
--   Kolon `DEPRECATED` yorumuyla yan yana yaşamaya devam eder; DROP işlemi
--   Faz 2 kapısında yapılacaktır (bkz. docs/PROGRESS.md §6b ve
--   active_planprogram.md §3.5 "eski kolonlar aynı migration'da DROP edilmez").
--
-- Idempotenttir: `create ... if not exists`, `create or replace function`,
-- `drop policy if exists` + `create policy` ve dönüşümün "aktif plan varsa atla"
-- kuralı sayesinde hem sıfırdan (`supabase db reset`) hem mevcut veritabanına
-- güvenle uygulanır.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.workout_plans — danışan başına versiyonlanmış plan başlığı
-- -----------------------------------------------------------------------------
create table if not exists public.workout_plans (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.profiles (id) on delete cascade,
  version     integer     not null default 1,
  is_active   boolean     not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint workout_plans_version_chk check (version > 0)
);

comment on table public.workout_plans
  is 'Danışan başına antrenman planı başlığı. Faz 1b: her danışanın en fazla BİR aktif planı olur; versiyon-yayınlama semantiği Faz 2''ye bırakılmıştır.';
comment on column public.workout_plans.version
  is 'Plan versiyonu (1''den başlar). Faz 1b''de her zaman 1''dir — kaydetme aktif versiyonun satırlarını değiştirir, yeni versiyon üretmez.';
comment on column public.workout_plans.is_active
  is 'Aktif plan. workout_plans_one_active_idx kısmi tekil indeksi, danışan başına en fazla bir aktif plan olmasını garanti eder.';
comment on column public.workout_plans.notes
  is 'Koçun plan geneline dair serbest notu. Ayrıştırılamayan içerik BURAYA DEĞİL, workout_plan_exercises.raw_line''a yazılır.';

-- KRİTİK: danışan başına en fazla BİR aktif plan.
-- Kısmi (partial) tekil indeks: is_active = false satırlar (gelecekteki
-- versiyon arşivi) sınırsız sayıda olabilir.
create unique index if not exists workout_plans_one_active_idx
  on public.workout_plans (client_id)
  where is_active;

create index if not exists workout_plans_client_idx
  on public.workout_plans (client_id, created_at desc);

drop trigger if exists set_workout_plans_updated_at on public.workout_plans;
create trigger set_workout_plans_updated_at
  before update on public.workout_plans
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2) public.workout_plan_exercises — gün + sıra bazlı plan satırları
-- -----------------------------------------------------------------------------
create table if not exists public.workout_plan_exercises (
  id                uuid          primary key default gen_random_uuid(),
  plan_id           uuid          not null references public.workout_plans (id) on delete cascade,
  day               text          not null,
  position          integer       not null,
  raw_line          text          not null,
  name              text,
  target_sets       integer,
  target_reps       integer,
  target_weight_kg  numeric(6, 2),
  video_url         text,
  constraint workout_plan_exercises_day_chk check (
    day in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar')
  ),
  constraint workout_plan_exercises_position_chk    check (position >= 0),
  constraint workout_plan_exercises_sets_chk        check (target_sets      is null or target_sets      > 0),
  constraint workout_plan_exercises_reps_chk        check (target_reps      is null or target_reps      > 0),
  constraint workout_plan_exercises_weight_chk      check (target_weight_kg is null or target_weight_kg >= 0),
  constraint workout_plan_exercises_day_pos_uniq    unique (plan_id, day, position)
);

comment on table public.workout_plan_exercises
  is 'Plan satırları. raw_line KANONİKTİR (orijinal metin, kayıpsız); name/target_* kolonları best-effort ayrıştırma çıktısıdır ve NULL olabilir.';
comment on column public.workout_plan_exercises.raw_line
  is 'KANONİK: kullanıcının yazdığı satırın orijinal hâli. Gün metni bu kolonların position sırasıyla E''\n'' ile birleştirilmesiyle BİREBİR geri üretilir.';
comment on column public.workout_plan_exercises.name
  is 'TÜREV: "^\d+. <ad> - <set>x<tekrar>" deseninden çıkarılan egzersiz adı. Desen tutmazsa NULL''dur ama satır yine de saklanır.';
comment on column public.workout_plan_exercises.position
  is '0''dan başlayan, gün içindeki sıra. (plan_id, day, position) tekildir.';

create index if not exists workout_plan_exercises_plan_day_pos_idx
  on public.workout_plan_exercises (plan_id, day, position);


-- -----------------------------------------------------------------------------
-- 3) Tablo düzeyi yetkiler
--    (20260816090200_rls_policies.sql'deki toplu GRANT yalnızca O ANDA var olan
--     tablolara uygulandı; yeni tablolar için tekrar edilmelidir.)
-- -----------------------------------------------------------------------------
revoke all on public.workout_plans          from anon;
revoke all on public.workout_plan_exercises from anon;

grant select, insert, update, delete on public.workout_plans          to authenticated;
grant select, insert, update, delete on public.workout_plan_exercises to authenticated;

grant all on public.workout_plans          to service_role;
grant all on public.workout_plan_exercises to service_role;


-- -----------------------------------------------------------------------------
-- 4) public.explode_plan_day(plan_id, day, text) -> integer
--
--    TEK AYRIŞTIRICI. `p_text`'i E'\n' ile böler, yalnızca boşluktan ibaret
--    satırları ATLAR ve kalan her satır için bir workout_plan_exercises kaydı
--    ekler. `position` 0'dan başlar ve eklenen satır başına artar.
--
--    Best-effort ayrıştırma deseni:
--        ^\s*\d+\.\s*(.+?)\s*-\s*(\d+)\s*[xX]\s*(\d+)
--    Örn. "1. Bench Press - 4x8" -> name='Bench Press', sets=4, reps=8.
--    Desen tutmazsa (örn. "Dinlenme") name/target_* NULL kalır ama SATIR YİNE EKLENİR.
--
--    SECURITY INVOKER: save_workout_plan() içinden çağrıldığında RLS ÇAĞIRANA
--    uygulanır. Dönüşüm fonksiyonu SECURITY DEFINER olduğu için orada
--    (postgres yetkisiyle) RLS'e takılmaz.
--
--    Dönüş: eklenen satır sayısı.
-- -----------------------------------------------------------------------------
create or replace function public.explode_plan_day(
  p_plan_id uuid,
  p_day     text,
  p_text    text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_line     text;
  v_match    text[];
  v_name     text;
  v_sets     integer;
  v_reps     integer;
  v_position integer := 0;
begin
  if p_plan_id is null or p_day is null then
    raise exception 'explode_plan_day: p_plan_id ve p_day zorunludur.' using errcode = '22023';
  end if;

  if p_text is null then
    return 0;
  end if;

  foreach v_line in array string_to_array(p_text, E'\n') loop
    continue when btrim(v_line) = '';

    v_name := null;
    v_sets := null;
    v_reps := null;

    v_match := regexp_match(v_line, '^\s*\d+\.\s*(.+?)\s*-\s*(\d+)\s*[xX]\s*(\d+)');
    if v_match is not null then
      -- Aşırı büyük sayılar (integer taşması) ayrıştırmayı bozmasın: türev
      -- kolonlar NULL'a düşer, raw_line yine kayıpsız saklanır.
      begin
        v_name := v_match[1];
        -- CHECK kısıtları > 0 ister; 0 gelirse türev kolon NULL'a düşer.
        v_sets := nullif(v_match[2]::integer, 0);
        v_reps := nullif(v_match[3]::integer, 0);
      exception
        when others then
          v_name := null;
          v_sets := null;
          v_reps := null;
      end;
    end if;

    insert into public.workout_plan_exercises
      (plan_id, day, position, raw_line, name, target_sets, target_reps)
    values
      (p_plan_id, p_day, v_position, v_line, v_name, v_sets, v_reps);

    v_position := v_position + 1;
  end loop;

  return v_position;
end;
$$;

comment on function public.explode_plan_day(uuid, text, text)
  is 'TEK plan ayrıştırıcısı. Hem veri dönüşümü hem save_workout_plan() RPC''si bunu kullanır — ikinci bir implementasyon YOKTUR.';

revoke all     on function public.explode_plan_day(uuid, text, text) from public;
grant  execute on function public.explode_plan_day(uuid, text, text) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5) public.save_workout_plan(client_ids, plan) -> integer
--
--    Uygulamanın (Faz 1b Adım 2) çağıracağı kaydetme RPC'si.
--    p_plan şekli: {"Pazartesi": "metin", ..., "Pazar": "metin"}
--
--    SECURITY INVOKER'dır: RLS ÇAĞIRANA uygulanır. Yetkisiz bir danışan
--    başkasının planını kaydetmeye kalkarsa hata YÜKSELİR (yakalanmaz) —
--    böylece tüm çağrı tek transaction içinde geri alınır (atomiklik).
--
--    Faz 1b'de YENİ VERSİYON ÜRETİLMEZ: aktif plan satırı yoksa version=1 ile
--    oluşturulur, varsa o kullanılır; planın TÜM satırları silinip yeniden
--    yazılır. Versiyon-yayınlama semantiği Faz 2'dedir.
--
--    Dönüş: etkilenen danışan sayısı.
-- -----------------------------------------------------------------------------
create or replace function public.save_workout_plan(
  p_client_ids uuid[],
  p_plan       jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_plan_id   uuid;
  v_day       text;
  v_text      text;
  v_count     integer := 0;
begin
  if p_client_ids is null or coalesce(array_length(p_client_ids, 1), 0) = 0 then
    raise exception 'save_workout_plan: en az bir danışan seçilmelidir.' using errcode = '22023';
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'save_workout_plan: p_plan bir JSON nesnesi olmalıdır.' using errcode = '22023';
  end if;

  -- Bilinmeyen gün anahtarı SESSİZCE YUTULMAZ: yazma yolunda sessiz veri kaybı
  -- kabul edilemez. (Dönüşüm yolunda ise eski veriyi kurtarmak için atlanır.)
  for v_day in select key from jsonb_each_text(p_plan) loop
    if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
      raise exception 'save_workout_plan: geçersiz gün anahtarı %.', v_day using errcode = '22023';
    end if;
  end loop;

  foreach v_client_id in array p_client_ids loop
    if v_client_id is null then
      raise exception 'save_workout_plan: client_id NULL olamaz.' using errcode = '22023';
    end if;

    -- Aktif plan var mı? (RLS: başkasının planı burada GÖRÜNMEZ -> aşağıdaki
    -- INSERT devreye girer ve WITH CHECK ihlaliyle hata yükselir.)
    select wp.id
      into v_plan_id
      from public.workout_plans wp
     where wp.client_id = v_client_id
       and wp.is_active
     limit 1;

    if v_plan_id is null then
      insert into public.workout_plans (client_id, version, is_active)
      values (v_client_id, 1, true)
      returning id into v_plan_id;
    else
      -- updated_at tazelensin (set_workout_plans_updated_at trigger'ı çalışır).
      update public.workout_plans
         set updated_at = now()
       where id = v_plan_id;
    end if;

    delete from public.workout_plan_exercises where plan_id = v_plan_id;

    for v_day, v_text in select key, value from jsonb_each_text(p_plan) loop
      perform public.explode_plan_day(v_plan_id, v_day, v_text);
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.save_workout_plan(uuid[], jsonb)
  is 'Antrenman planı kaydetme RPC''si. SECURITY INVOKER (RLS uygulanır). Faz 1b: aktif versiyonun satırları değiştirilir, yeni versiyon üretilmez.';

revoke all     on function public.save_workout_plan(uuid[], jsonb) from public;
grant  execute on function public.save_workout_plan(uuid[], jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 6) RLS politikaları
--
-- ############################################################################
-- # BİLİNÇLİ SAPMA — active_planprogram.md §3.2                              #
-- #                                                                          #
-- # Plan §3.2, "plan tablolarına yalnızca koç yazar" diyor. BURADA DANIŞANA  #
-- # DA KENDİ PLANI ÜZERİNDE YAZMA HAKKI VERİLİYOR.                           #
-- #                                                                          #
-- # Gerekçe: MEVCUT ÜRÜN DAVRANIŞINI KORUMAK. Bugün danışan, WorkoutTab      #
-- # üzerinden programını düzenleyip onaya sunabiliyor ve bu akış             #
-- # `profiles` UPDATE'i ile çalışıyor (src/hooks/usePlans.ts ->              #
-- # useSaveWorkoutPlan, src/hooks/useProgramApprovals.ts). Plan tablolarında #
-- # yazmayı koça kısıtlamak, Adım 2'deki kod cutover'ında bu akışı           #
-- # SESSİZCE KIRARDI.                                                        #
-- #                                                                          #
-- # Kapsam sınırı: danışan YALNIZCA kendi client_id'sine ait plana yazabilir #
-- # (başka danışanın planına asla). Bu kısıt hem workout_plans hem           #
-- # workout_plan_exercises (plan üzerinden EXISTS) için geçerlidir ve        #
-- # supabase/tests/rls.test.sql senaryo 22/24 ile korunur.                   #
-- #                                                                          #
-- # Faz 2'de onay akışı ayrı bir "önerilen plan" yüzeyine taşınırsa bu       #
-- # sapma geri alınıp politika §3.2'ye daraltılmalıdır.                      #
-- ############################################################################
-- -----------------------------------------------------------------------------
alter table public.workout_plans          enable row level security;
alter table public.workout_plan_exercises enable row level security;

-- --- workout_plans ---

drop policy if exists workout_plans_select on public.workout_plans;
create policy workout_plans_select
  on public.workout_plans
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists workout_plans_insert on public.workout_plans;
create policy workout_plans_insert
  on public.workout_plans
  for insert
  to authenticated
  with check (public.is_coach() or client_id = auth.uid());

drop policy if exists workout_plans_update on public.workout_plans;
create policy workout_plans_update
  on public.workout_plans
  for update
  to authenticated
  using      (public.is_coach() or client_id = auth.uid())
  with check (public.is_coach() or client_id = auth.uid());

drop policy if exists workout_plans_delete on public.workout_plans;
create policy workout_plans_delete
  on public.workout_plans
  for delete
  to authenticated
  using (public.is_coach() or client_id = auth.uid());

-- --- workout_plan_exercises (yetki plan üzerinden türetilir) ---

drop policy if exists workout_plan_exercises_select on public.workout_plan_exercises;
create policy workout_plan_exercises_select
  on public.workout_plan_exercises
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = workout_plan_exercises.plan_id
        and (wp.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists workout_plan_exercises_insert on public.workout_plan_exercises;
create policy workout_plan_exercises_insert
  on public.workout_plan_exercises
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = workout_plan_exercises.plan_id
        and (public.is_coach() or wp.client_id = auth.uid())
    )
  );

drop policy if exists workout_plan_exercises_update on public.workout_plan_exercises;
create policy workout_plan_exercises_update
  on public.workout_plan_exercises
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = workout_plan_exercises.plan_id
        and (public.is_coach() or wp.client_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = workout_plan_exercises.plan_id
        and (public.is_coach() or wp.client_id = auth.uid())
    )
  );

drop policy if exists workout_plan_exercises_delete on public.workout_plan_exercises;
create policy workout_plan_exercises_delete
  on public.workout_plan_exercises
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workout_plans wp
      where wp.id = workout_plan_exercises.plan_id
        and (public.is_coach() or wp.client_id = auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 7) public.migrate_workout_plans_from_profiles() — VERİ DÖNÜŞÜMÜ
--
--    `profiles.workout_plan` (JSON string) -> workout_plans + workout_plan_exercises
--
--    Kurallar:
--      * workout_plan NULL / boş / GEÇERSİZ JSON ise ATLANIR (hata verilmez).
--      * JSON bir nesne değilse (dizi/scalar) ATLANIR.
--      * IDEMPOTENT: danışanın zaten aktif planı varsa ATLANIR -> ikinci çalıştırma
--        satır çoğaltmaz.
--      * Bilinmeyen gün anahtarları atlanır (eski/bozuk veriyi kurtarabilmek için;
--        yazma yolunda — save_workout_plan — ise hata yükseltilir).
--
--    Bu bir FONKSİYONDUR, migration gövdesine gömülü değildir. Sebep:
--    `supabase db reset` sırasında migration'lar SEED'DEN ÖNCE koşar, yani
--    dönüşüm her zaman BOŞ tabloda çalışır (no-op). Dönüşüm mantığının gerçekten
--    doğru olduğunu kanıtlamanın tek yolu onu testten çağırabilmektir
--    (supabase/tests/transform.test.sql).
--
--    SECURITY DEFINER: dönüşüm tüm profilleri dolaşır; çağıranın RLS'ine
--    takılmamalıdır. Yürütme yetkisi yalnızca service_role'dedir.
-- -----------------------------------------------------------------------------
create or replace function public.migrate_workout_plans_from_profiles()
returns table (profiles_converted integer, exercises_inserted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile      record;
  v_plan         jsonb;
  v_plan_id      uuid;
  v_day          text;
  v_text         text;
  v_profiles     integer := 0;
  v_exercises    integer := 0;
  v_skipped      integer := 0;
  v_bad_days     integer := 0;
begin
  for v_profile in
    select p.id, p.workout_plan
      from public.profiles p
     where p.workout_plan is not null
       and btrim(p.workout_plan) <> ''
     order by p.id
  loop
    -- IDEMPOTENCY: aktif plan varsa dokunma.
    if exists (
      select 1 from public.workout_plans wp
       where wp.client_id = v_profile.id and wp.is_active
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Geçersiz JSON: atla, hata verme.
    begin
      v_plan := v_profile.workout_plan::jsonb;
    exception
      when others then
        v_skipped := v_skipped + 1;
        raise notice 'workout_plan atlandi (gecersiz JSON) profil=%: %', v_profile.id, sqlerrm;
        continue;
    end;

    if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
      v_skipped := v_skipped + 1;
      raise notice 'workout_plan atlandi (JSON nesnesi degil, tip=%) profil=%',
        coalesce(jsonb_typeof(v_plan), 'null'), v_profile.id;
      continue;
    end if;

    insert into public.workout_plans (client_id, version, is_active)
    values (v_profile.id, 1, true)
    returning id into v_plan_id;

    for v_day, v_text in select key, value from jsonb_each_text(v_plan) loop
      if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
        v_bad_days := v_bad_days + 1;
        raise notice 'workout_plan: bilinmeyen gun anahtari "%" (profil=%) atlandi', v_day, v_profile.id;
        continue;
      end if;

      v_exercises := v_exercises + public.explode_plan_day(v_plan_id, v_day, v_text);
    end loop;

    v_profiles := v_profiles + 1;
  end loop;

  raise notice 'DONUSUM OZETI: % profil donusturuldu, % egzersiz satiri eklendi, % profil atlandi, % bilinmeyen gun anahtari atlandi',
    v_profiles, v_exercises, v_skipped, v_bad_days;

  profiles_converted := v_profiles;
  exercises_inserted := v_exercises;
  return next;
end;
$$;

comment on function public.migrate_workout_plans_from_profiles()
  is 'profiles.workout_plan (JSON string) -> workout_plans/workout_plan_exercises veri dönüşümü. Idempotenttir (aktif planı olan danışan atlanır). Testten çağrılabilsin diye fonksiyon olarak yazıldı.';

revoke all     on function public.migrate_workout_plans_from_profiles() from public;
grant  execute on function public.migrate_workout_plans_from_profiles() to service_role;


-- -----------------------------------------------------------------------------
-- 8) Dönüşümü ÇALIŞTIR
--
--    NOT: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar, bu
--    yüzden burada 0 profil dönüştürülür (no-op) — bu BEKLENEN durumdur.
--    Var olan bir veritabanına uygulandığında ise gerçek veriyi taşır.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from public.migrate_workout_plans_from_profiles();
  raise notice 'workout_plan dönüşümü tamamlandı: % profil, % egzersiz satırı',
    r.profiles_converted, r.exercises_inserted;
end
$$;


-- -----------------------------------------------------------------------------
-- 9) Eski kolonu DEPRECATED olarak işaretle (SİLME!)
-- -----------------------------------------------------------------------------
comment on column public.profiles.workout_plan
  is 'DEPRECATED: workout_plans/workout_plan_exercises. Faz 2 kapısında DROP edilecek.';


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: bu script workout_plans / workout_plan_exercises içindeki TÜM
-- -- veriyi siler. Dönüşüm kaynağı olan profiles.workout_plan kolonu bu
-- -- migration tarafından silinmediği için veri kaybı YAŞANMAZ — plan verisi
-- -- eski JSON string kolonunda hâlâ durmaktadır.
-- --
-- -- Aşağıdaki bloğu olduğu gibi psql'e yapıştırarak çalıştırabilirsiniz.
-- =============================================================================
--
-- begin;
--
-- -- 1) RPC ve yardımcı fonksiyonlar
-- drop function if exists public.migrate_workout_plans_from_profiles();
-- drop function if exists public.save_workout_plan(uuid[], jsonb);
-- drop function if exists public.explode_plan_day(uuid, text, text);
--
-- -- 2) Politikalar (tablolar DROP edilince zaten düşer; açıklık için yazıldı)
-- drop policy if exists workout_plan_exercises_delete on public.workout_plan_exercises;
-- drop policy if exists workout_plan_exercises_update on public.workout_plan_exercises;
-- drop policy if exists workout_plan_exercises_insert on public.workout_plan_exercises;
-- drop policy if exists workout_plan_exercises_select on public.workout_plan_exercises;
-- drop policy if exists workout_plans_delete          on public.workout_plans;
-- drop policy if exists workout_plans_update          on public.workout_plans;
-- drop policy if exists workout_plans_insert          on public.workout_plans;
-- drop policy if exists workout_plans_select          on public.workout_plans;
--
-- -- 3) Trigger
-- drop trigger if exists set_workout_plans_updated_at on public.workout_plans;
--
-- -- 4) Tablolar (exercises -> plans sırası; CASCADE FK'yi de düşürür)
-- drop table if exists public.workout_plan_exercises;
-- drop table if exists public.workout_plans;
--
-- -- 5) profiles.workout_plan yorumunu eski hâline döndür
-- comment on column public.profiles.workout_plan
--   is 'JSON string: Record<gün, string>. Uygulama JSON.stringify ile yazar.';
--
-- commit;
--
-- =============================================================================
