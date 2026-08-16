-- =============================================================================
-- 20260816090200_rls_policies.sql
-- Row Level Security: tüm public tablolarında RLS + politikalar.
--
-- Genel ilkeler:
--   * Politikalar yalnızca `authenticated` rolüne verilir; `anon` hiçbir tabloya erişemez.
--   * "sahibi veya koç" kalıbı: student_id = auth.uid() OR public.is_admin()
--   * public.is_admin() SECURITY DEFINER'dır (özyineleme koruması, bkz. 090100).
--   * Her politika DROP POLICY IF EXISTS ile öncelenir -> yeniden çalıştırılabilir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0) RLS'i tüm tablolarda etkinleştir
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.notifications     enable row level security;
alter table public.form_checks       enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.program_approvals enable row level security;
alter table public.messages          enable row level security;
alter table public.exercises         enable row level security;
alter table public.food_database     enable row level security;


-- -----------------------------------------------------------------------------
-- 1) Rol bazlı sertleştirme: anon kilitli, authenticated'a gerekli GRANT'ler
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- anon (giriş yapmamış ziyaretçi) public şemadaki hiçbir nesneye erişemez.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Giriş yapmış kullanıcılar tablo düzeyinde yetkilidir; asıl filtre RLS politikalarıdır.
grant select, insert, update, delete on all tables    in schema public to authenticated;
grant usage, select                  on all sequences in schema public to authenticated;

-- NOT: exercises / food_database üzerinde tablo düzeyinde REVOKE yapılmaz;
-- koç (admin) de `authenticated` rolüyle bağlandığı için revoke onu da keserdi.
-- Katalog yazma kısıtı aşağıdaki RLS politikalarıyla (public.is_admin()) sağlanır.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;


-- =============================================================================
-- 2) profiles
-- =============================================================================

-- Kendi profilini veya koç isen tüm profilleri görebilirsin.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- Profil satırı normalde trigger ile açılır; elle ekleme yalnızca koça açıktır.
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

-- Kendi profilini güncelleyebilirsin ama ROL SÜTUNUNU DEĞİŞTİREMEZSİN (yetki yükseltme koruması).
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.profile_role(auth.uid())
  );

-- Koç her profili (rol dahil) güncelleyebilir.
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Profil silme yalnızca koça açıktır (asıl silme auth.users cascade ile olur).
drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());


-- =============================================================================
-- 3) notifications
-- =============================================================================

-- Kendi bildirimlerini veya koç isen tümünü okuyabilirsin.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select
  on public.notifications
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Koç herkese bildirim atabilir; danışan yalnızca kendi adına sistem bildirimi oluşturabilir (mevcut davranış).
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert
  on public.notifications
  for insert
  to authenticated
  with check (public.is_admin() or student_id = auth.uid());

-- Okundu işaretleme: bildirimin sahibi veya koç.
drop policy if exists notifications_update on public.notifications;
create policy notifications_update
  on public.notifications
  for update
  to authenticated
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

-- Bildirim silme yalnızca koça açıktır.
drop policy if exists notifications_delete_admin on public.notifications;
create policy notifications_delete_admin
  on public.notifications
  for delete
  to authenticated
  using (public.is_admin());


-- =============================================================================
-- 4) form_checks
-- =============================================================================

-- Kendi form check'lerini veya koç isen tümünü görebilirsin.
drop policy if exists form_checks_select on public.form_checks;
create policy form_checks_select
  on public.form_checks
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Form check yalnızca kendi adına oluşturulabilir.
drop policy if exists form_checks_insert on public.form_checks;
create policy form_checks_insert
  on public.form_checks
  for insert
  to authenticated
  with check (student_id = auth.uid());

-- Güncelleme: sahibi veya koç.
drop policy if exists form_checks_update on public.form_checks;
create policy form_checks_update
  on public.form_checks
  for update
  to authenticated
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

-- Silme: sahibi veya koç.
drop policy if exists form_checks_delete on public.form_checks;
create policy form_checks_delete
  on public.form_checks
  for delete
  to authenticated
  using (student_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 5) daily_logs
-- =============================================================================

-- Kendi günlüklerini veya koç isen tümünü görebilirsin.
drop policy if exists daily_logs_select on public.daily_logs;
create policy daily_logs_select
  on public.daily_logs
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Günlük kaydı yalnızca kendi adına oluşturulabilir.
drop policy if exists daily_logs_insert on public.daily_logs;
create policy daily_logs_insert
  on public.daily_logs
  for insert
  to authenticated
  with check (student_id = auth.uid());

-- Güncelleme (upsert dahil): sahibi veya koç.
drop policy if exists daily_logs_update on public.daily_logs;
create policy daily_logs_update
  on public.daily_logs
  for update
  to authenticated
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

-- Silme: sahibi veya koç.
drop policy if exists daily_logs_delete on public.daily_logs;
create policy daily_logs_delete
  on public.daily_logs
  for delete
  to authenticated
  using (student_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 6) workout_logs
-- =============================================================================

-- Kendi antrenman kayıtlarını veya koç isen tümünü görebilirsin.
drop policy if exists workout_logs_select on public.workout_logs;
create policy workout_logs_select
  on public.workout_logs
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Antrenman kaydı yalnızca kendi adına oluşturulabilir.
drop policy if exists workout_logs_insert on public.workout_logs;
create policy workout_logs_insert
  on public.workout_logs
  for insert
  to authenticated
  with check (student_id = auth.uid());

-- Güncelleme: sahibi veya koç.
drop policy if exists workout_logs_update on public.workout_logs;
create policy workout_logs_update
  on public.workout_logs
  for update
  to authenticated
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

-- Silme: sahibi veya koç.
drop policy if exists workout_logs_delete on public.workout_logs;
create policy workout_logs_delete
  on public.workout_logs
  for delete
  to authenticated
  using (student_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 7) program_approvals
-- =============================================================================

-- Kendi onay taleplerini veya koç isen tümünü görebilirsin.
drop policy if exists program_approvals_select on public.program_approvals;
create policy program_approvals_select
  on public.program_approvals
  for select
  to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Onay talebi yalnızca danışanın kendisi tarafından açılır.
drop policy if exists program_approvals_insert on public.program_approvals;
create policy program_approvals_insert
  on public.program_approvals
  for insert
  to authenticated
  with check (student_id = auth.uid());

-- Onaylama/reddetme yalnızca koça aittir.
drop policy if exists program_approvals_update_admin on public.program_approvals;
create policy program_approvals_update_admin
  on public.program_approvals
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Silme: talebin sahibi veya koç.
drop policy if exists program_approvals_delete on public.program_approvals;
create policy program_approvals_delete
  on public.program_approvals
  for delete
  to authenticated
  using (student_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 8) messages
-- =============================================================================

-- Yalnızca kendi sohbetlerini (gönderen ya da alıcı) görebilirsin; koç tümünü görür.
drop policy if exists messages_select on public.messages;
create policy messages_select
  on public.messages
  for select
  to authenticated
  using (
    sender_id = auth.uid()
    or receiver_id = auth.uid()
    or public.is_admin()
  );

-- Mesaj yalnızca kendi adına gönderilebilir (kimlik taklidi engellenir).
drop policy if exists messages_insert on public.messages;
create policy messages_insert
  on public.messages
  for insert
  to authenticated
  with check (sender_id = auth.uid());

-- Güncelleme yalnızca alıcıya açıktır (is_read işaretleme).
drop policy if exists messages_update_receiver on public.messages;
create policy messages_update_receiver
  on public.messages
  for update
  to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

-- Silme: mesajı gönderen veya koç.
drop policy if exists messages_delete on public.messages;
create policy messages_delete
  on public.messages
  for delete
  to authenticated
  using (sender_id = auth.uid() or public.is_admin());


-- =============================================================================
-- 9) exercises — referans katalog
-- =============================================================================

-- Giriş yapmış herkes egzersiz kataloğunu okuyabilir.
drop policy if exists exercises_select on public.exercises;
create policy exercises_select
  on public.exercises
  for select
  to authenticated
  using (true);

-- Katalog yazma işlemleri yalnızca koça açıktır.
drop policy if exists exercises_insert_admin on public.exercises;
create policy exercises_insert_admin
  on public.exercises
  for insert
  to authenticated
  with check (public.is_admin());

-- Katalog güncelleme yalnızca koça açıktır.
drop policy if exists exercises_update_admin on public.exercises;
create policy exercises_update_admin
  on public.exercises
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Katalog silme yalnızca koça açıktır.
drop policy if exists exercises_delete_admin on public.exercises;
create policy exercises_delete_admin
  on public.exercises
  for delete
  to authenticated
  using (public.is_admin());


-- =============================================================================
-- 10) food_database — referans katalog
-- =============================================================================

-- Giriş yapmış herkes besin veritabanını okuyabilir.
drop policy if exists food_database_select on public.food_database;
create policy food_database_select
  on public.food_database
  for select
  to authenticated
  using (true);

-- Besin ekleme yalnızca koça açıktır.
drop policy if exists food_database_insert_admin on public.food_database;
create policy food_database_insert_admin
  on public.food_database
  for insert
  to authenticated
  with check (public.is_admin());

-- Besin güncelleme yalnızca koça açıktır.
drop policy if exists food_database_update_admin on public.food_database;
create policy food_database_update_admin
  on public.food_database
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Besin silme yalnızca koça açıktır.
drop policy if exists food_database_delete_admin on public.food_database;
create policy food_database_delete_admin
  on public.food_database
  for delete
  to authenticated
  using (public.is_admin());


-- =============================================================================
-- 11) Realtime — MessagesTab canlı abonelik kullanıyor
-- =============================================================================
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;   -- zaten yayında
  when undefined_object then null;   -- publication yoksa (self-hosted) sessizce geç
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
