-- =============================================================================
-- 20260817090000_rename_roles.sql
-- Faz 1a — Rol modelini ürün diline hizalar (active_planprogram.md §3.1, R4).
--
--   ENUM   : user_role  'admin'   -> 'coach'
--                       'student' -> 'client'
--   KOLON  : <tablo>.student_id   -> <tablo>.client_id
--            (notifications, form_checks, daily_logs, workout_logs, program_approvals)
--   FONKSİYON: public.is_admin(uuid) -> public.is_coach(uuid)
--
-- NEDEN GÜVENLİ:
--   * `ALTER TYPE ... RENAME VALUE` etiketin pg_enum OID'ini KORUR. Satır verisi
--     ve politika ifadelerindeki enum sabitleri OID ile saklandığı için hem
--     mevcut satırlar hem de RLS ifadeleri otomatik olarak yeni etiketi gösterir.
--   * `ALTER TABLE ... RENAME COLUMN` politika ifadelerini, indeksleri, kısıtları
--     ve yabancı anahtarları attnum üzerinden takip eder; hepsi otomatik güncellenir.
--   * `ALTER FUNCTION ... RENAME TO` fonksiyonun OID'ini korur. RLS politikaları
--     fonksiyona OID ile referans verdiği için hiçbir politika bozulmaz
--     (public: 37, storage.objects: 8); `pg_policies` çıktısında ifade artık
--     `is_coach(...)` olarak görünür.
--
-- NE OTOMATİK DEĞİL (bu dosyada elle yapılır):
--   * Fonksiyon GÖVDELERİNDEKİ 'admin' / 'student' string literalleri.
--   * plpgsql gövdesinden AD İLE yapılan `public.is_admin()` çağrısı
--     (increment_streak) — ad ile çözüldüğü için yeniden adlandırma sonrası
--     kırılırdı, bu yüzden CREATE OR REPLACE ile güncellenir.
--   * İndeks / kısıt / politika ADLARI (kozmetik, tutarlılık için yeniden adlandırılır).
--   * Nesne yorumları (COMMENT).
--
-- Dosya tamamen idempotenttir: mevcut duruma bakılarak her adım atlanabilir,
-- böylece hem `supabase migration up` hem `supabase db reset` ile güvenle çalışır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Enum değerleri: 'admin' -> 'coach', 'student' -> 'client'
--    RENAME VALUE transaction içinde çalışır ve satır verisini korur.
--    Etiket zaten yeniyse (tekrar çalıştırma) adım atlanır.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role'
      and t.typnamespace = 'public'::regnamespace
      and e.enumlabel = 'admin'
  ) then
    alter type public.user_role rename value 'admin' to 'coach';
  end if;

  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role'
      and t.typnamespace = 'public'::regnamespace
      and e.enumlabel = 'student'
  ) then
    alter type public.user_role rename value 'student' to 'client';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 2) Kolon adları: student_id -> client_id
--    Postgres politikaları / indeksleri / kısıtları otomatik günceller.
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'notifications',
    'form_checks',
    'daily_logs',
    'workout_logs',
    'program_approvals'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = v_table
        and column_name  = 'student_id'
    ) then
      execute format('alter table public.%I rename column student_id to client_id', v_table);
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 3) İndeks adları (kozmetik — kolon yeniden adlandırma indeks ADINI değiştirmez)
-- -----------------------------------------------------------------------------
do $$
declare
  v_pair text[];
begin
  foreach v_pair slice 1 in array array[
    ['notifications_student_unread_idx',     'notifications_client_unread_idx'],
    ['notifications_student_recent_idx',     'notifications_client_recent_idx'],
    ['form_checks_student_recent_idx',       'form_checks_client_recent_idx'],
    ['daily_logs_student_date_idx',          'daily_logs_client_date_idx'],
    ['workout_logs_student_recent_idx',      'workout_logs_client_recent_idx'],
    ['program_approvals_student_status_idx', 'program_approvals_client_status_idx']
  ] loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_pair[1] and c.relkind = 'i'
    ) then
      execute format('alter index public.%I rename to %I', v_pair[1], v_pair[2]);
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 4) Kısıt adı: daily_logs_student_date_uniq -> daily_logs_client_date_uniq
--
--    KARAR: Kısıt adı işlevsel olarak kozmetiktir — istemci `upsert`'ünde
--    `onConflict` KOLON LİSTESİ ("client_id,log_date") verilir, kısıt adı değil.
--    Yine de yeniden adlandırılıyor: aksi hâlde `client_id` kolonunu koruyan
--    kısıtın adı `student` derdi ve hata mesajlarında (23505) yanıltıcı olurdu.
--    `ALTER TABLE ... RENAME CONSTRAINT` kısıtı ve onu destekleyen benzersiz
--    indeksi birlikte yeniden adlandırır.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_logs'::regclass
      and conname  = 'daily_logs_student_date_uniq'
  ) then
    alter table public.daily_logs
      rename constraint daily_logs_student_date_uniq to daily_logs_client_date_uniq;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4b) Yabancı anahtar adları: <tablo>_student_id_fkey -> <tablo>_client_id_fkey
--     (Kolon yeniden adlandırma kısıt ADINI değiştirmez; yalnızca kozmetik.)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname like '%\_student\_id\_fkey'
  loop
    execute format(
      'alter table %s rename constraint %I to %I',
      r.tbl,
      r.conname,
      replace(r.conname, '_student_id_fkey', '_client_id_fkey')
    );
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 5) Politika adları: *_admin -> *_coach (kozmetik)
--    İfadeler değişmez; yalnızca ad hizalanır.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like '%\_admin'
  loop
    execute format(
      'alter policy %I on %I.%I rename to %I',
      r.policyname,
      r.schemaname,
      r.tablename,
      left(r.policyname, length(r.policyname) - length('_admin')) || '_coach'
    );
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 6) public.is_admin(uuid) -> public.is_coach(uuid)
--
--    Yeniden adlandırma OID'i korur; RLS politikaları fonksiyona OID ile bağlı
--    olduğu için hiçbiri bozulmaz (`pg_policies` çıktısı `is_coach` gösterir).
--    Ardından gövdedeki 'admin' literali 'coach' ile değiştirilir.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin(uuid)') is not null
     and to_regprocedure('public.is_coach(uuid)') is null then
    alter function public.is_admin(uuid) rename to is_coach;
  end if;
end
$$;

create or replace function public.is_coach(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'coach'::public.user_role
  );
$$;

comment on function public.is_coach(uuid)
  is 'RLS politikalarında kullanılır. SECURITY DEFINER: profiles politikalarında sonsuz özyinelemeyi önler.';

revoke all on function public.is_coach(uuid) from public;
grant execute on function public.is_coach(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 7) public.is_coach_profile(uuid) — gövdedeki 'admin' literali 'coach' olur
-- -----------------------------------------------------------------------------
create or replace function public.is_coach_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target
      and p.role = 'coach'::public.user_role
  );
$$;

comment on function public.is_coach_profile(uuid)
  is 'Hedef profil koç mu? notifications_insert politikasında, danışanın koça bildirim yazabilmesi için kullanılır. SECURITY DEFINER: profiles RLS''ine bağımlılığı kaldırır.';

revoke all on function public.is_coach_profile(uuid) from public;
grant execute on function public.is_coach_profile(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 8) public.handle_new_user() — varsayılan rol artık 'client'
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
begin
  -- Geçersiz/boş rol metadata'sı gelirse güvenli varsayılana ('client') düş.
  begin
    v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client')::public.user_role;
  exception
    when invalid_text_representation then
      v_role := 'client'::public.user_role;
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    v_role
  )
  on conflict (id) do nothing;   -- service_role ile ayrıca profil insert edilse bile patlamasın

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 9) public.increment_streak(uuid) — gövdesindeki is_admin() çağrısı is_coach()
--
--    KRİTİK: plpgsql gövdesi fonksiyonu AD İLE çözer (OID ile değil). Adım 6'daki
--    yeniden adlandırmadan sonra bu çağrı "function public.is_admin() does not
--    exist" hatası verirdi. İmza (parametre adı 'user_id') DEĞİŞMEZ — uygulama
--    kodu rpc('increment_streak', { user_id }) çağırıyor.
-- -----------------------------------------------------------------------------
create or replace function public.increment_streak(user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_date date;
  v_streak    integer;
begin
  if user_id is null then
    raise exception 'increment_streak: user_id zorunludur.' using errcode = '22023';
  end if;

  -- Yetki: yalnızca kullanıcının kendisi veya koç çalıştırabilir.
  if not (auth.uid() = user_id or public.is_coach()) then
    raise exception 'increment_streak: bu kullanıcı için yetkiniz yok.' using errcode = '42501';
  end if;

  select (p.last_checkin_at at time zone 'utc')::date, p.current_streak
    into v_last_date, v_streak
  from public.profiles p
  where p.id = user_id
  for update;

  if not found then
    raise exception 'increment_streak: profil bulunamadı (%).', user_id using errcode = 'P0002';
  end if;

  v_streak := coalesce(v_streak, 0);

  if v_last_date = (now() at time zone 'utc')::date then
    -- Aynı gün tekrar check-in: seriyi artırma, en az 1 olsun.
    v_streak := greatest(v_streak, 1);
  elsif v_last_date = ((now() at time zone 'utc')::date - 1) then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.profiles
     set current_streak  = v_streak,
         last_checkin_at = now()
   where id = user_id;

  return v_streak;
end;
$$;

comment on function public.increment_streak(uuid)
  is 'Form-check sonrası çağrılan RPC. İmza uygulama koduna bağlıdır: rpc(''increment_streak'', { user_id }).';

revoke all on function public.increment_streak(uuid) from public;
grant execute on function public.increment_streak(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 10) Eski auth metadata'sı: raw_user_meta_data->>'role' değerlerini hizala.
--     handle_new_user() yalnızca INSERT anında okur, bu yüzden işlevsel etkisi
--     yoktur; ama metadata ile profiles arasındaki tutarsızlığı bırakmamak için
--     güncellenir. auth şeması sürüm farklarına karşı hata yutulur.
-- -----------------------------------------------------------------------------
do $$
begin
  update auth.users
     set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"coach"'::jsonb)
   where raw_user_meta_data ->> 'role' = 'admin';

  update auth.users
     set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{role}', '"client"'::jsonb)
   where raw_user_meta_data ->> 'role' = 'student';
exception
  when others then
    raise notice 'auth.users metadata rol hizalaması atlandı: %', sqlerrm;
end
$$;


-- -----------------------------------------------------------------------------
-- 11) Yorumlar (COMMENT) — rol terminolojisini güncelle
-- -----------------------------------------------------------------------------
comment on type public.user_role is 'Kullanıcı rolü: coach (koç) veya client (danışan).';

comment on table public.profiles
  is 'Kullanıcı profilleri. role=coach koçu, role=client danışanı temsil eder.';

comment on constraint daily_logs_client_date_uniq on public.daily_logs
  is 'Günde tek kayıt. İstemci tarafında insert yerine upsert (onConflict: client_id,log_date) kullanılmalı.';
