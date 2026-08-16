-- =============================================================================
-- 20260816090100_functions_and_triggers.sql
-- Yardımcı fonksiyonlar, RPC'ler ve trigger'lar.
--
-- ÖNEMLİ: is_admin() ve profile_role() SECURITY DEFINER'dır.
-- Sebep: profiles üzerindeki RLS politikaları bu fonksiyonları çağırıyor.
-- Fonksiyon SECURITY INVOKER olsaydı, politika içinden profiles'a yapılan
-- sorgu tekrar aynı politikayı tetikler ve Postgres
-- "infinite recursion detected in policy for relation profiles" hatası verirdi.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.is_admin(uid) -> boolean
--    Verilen kullanıcı (varsayılan: oturum sahibi) koç/admin mi?
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
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
      and p.role = 'admin'::public.user_role
  );
$$;

comment on function public.is_admin(uuid)
  is 'RLS politikalarında kullanılır. SECURITY DEFINER: profiles politikalarında sonsuz özyinelemeyi önler.';

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2) public.profile_role(uid) -> user_role
--    Kullanıcının mevcut rolünü döndürür.
--    profiles UPDATE politikasının WITH CHECK'inde "rol değiştirilemez"
--    kuralını özyinelemesiz uygulamak için gerekli.
-- -----------------------------------------------------------------------------
create or replace function public.profile_role(uid uuid default auth.uid())
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = uid;
$$;

comment on function public.profile_role(uuid)
  is 'Kullanıcının kayıtlı rolü. profiles UPDATE WITH CHECK içinde rol yükseltmesini engellemek için kullanılır.';

revoke all on function public.profile_role(uuid) from public;
grant execute on function public.profile_role(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 3) public.handle_new_user() — auth.users INSERT sonrası profil oluşturur
--    role, raw_user_meta_data->>'role' yoksa 'student' olur.
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
  -- Geçersiz/boş rol metadata'sı gelirse güvenli varsayılana ('student') düş.
  begin
    v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'student')::public.user_role;
  exception
    when invalid_text_representation then
      v_role := 'student'::public.user_role;
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

comment on function public.handle_new_user() is 'auth.users -> public.profiles otomatik profil oluşturma trigger fonksiyonu.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- 4) public.set_updated_at() — updated_at sütununu otomatik tazeler
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 5) public.increment_streak(user_id uuid) -> integer
--    Uygulama çağrısı: supabase.rpc('increment_streak', { user_id })
--    İMZAYI DEĞİŞTİRME — parametre adı 'user_id' olmak zorunda.
--
--    Mantık:
--      last_checkin_at bugün ise -> streak değişmez (aynı gün ikinci check-in)
--      last_checkin_at dün ise   -> streak + 1
--      daha eski veya NULL ise   -> streak 1'e sıfırlanır
--    Her durumda last_checkin_at = now(). Yeni streak değeri döner.
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

  -- Yetki: yalnızca kullanıcının kendisi veya koç (admin) çalıştırabilir.
  if not (auth.uid() = user_id or public.is_admin()) then
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
-- 6) public.sync_profile_email() — auth.users.email değişince profiles'ı eşitle
-- -----------------------------------------------------------------------------
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
       set email = new.email
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function public.sync_profile_email();
