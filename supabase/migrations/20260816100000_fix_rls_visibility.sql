-- =============================================================================
-- 20260816100000_fix_rls_visibility.sql
--
-- İki işlevsel RLS kırığını düzeltir (bkz. docs/DISCOVERY.md §15.2 #1 ve #2):
--
--   KIRIK 1 — Danışan koçun `profiles` satırını göremiyordu.
--     Eski politika: profiles_select USING (id = auth.uid() OR public.is_admin())
--     Sonuç zinciri: useAdminId() (src/hooks/useMessages.ts) role='admin' profilini
--     sorguluyor -> null dönüyor -> MessagesTab'da chatPartnerId boş kalıyor ->
--     danışan koçla HİÇ mesajlaşamıyor.
--
--   KIRIK 2 — Danışan koça bildirim oluşturamıyordu.
--     Eski politika: notifications_insert WITH CHECK (public.is_admin() OR student_id = auth.uid())
--     useSubmitProgramForApproval, coachId'ye bildirim yazmak istiyor ama politika
--     alıcının kendisi olmasını şart koşuyor -> koç "onay bekliyor" bildirimini hiç almıyor.
--
-- Bu migration YALNIZCA `profiles_select` ve `notifications_insert` politikalarını
-- yeniden tanımlar; diğer politikalara dokunmaz. Idempotenttir
-- (DROP POLICY IF EXISTS + CREATE POLICY, CREATE OR REPLACE FUNCTION), bu yüzden
-- `supabase db reset` ile sıfırdan da, mevcut veritabanına da güvenle uygulanır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Yardımcı: public.is_coach_profile(target uuid) -> boolean
--
-- Verilen profil id'si bir koça (role = 'admin') mı ait?
-- SECURITY DEFINER'dır: politikanın içinden yapılan `profiles` sorgusu böylece
-- çağıranın RLS'ine takılmaz. Aksi hâlde notifications politikası, danışanın
-- koç satırını görebilmesine (yani Kırık 1'in düzeltmesine) dolaylı olarak
-- bağımlı olurdu; bu bağımlılığı kaldırıyoruz.
-- `profiles` üzerindeki politikalarda ÇAĞRILMAZ (orada özyineleme yaratırdı),
-- yalnızca notifications politikasında kullanılır.
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
      and p.role = 'admin'::public.user_role
  );
$$;

comment on function public.is_coach_profile(uuid)
  is 'Hedef profil koç (admin) mu? notifications_insert politikasında, danışanın koça bildirim yazabilmesi için kullanılır. SECURITY DEFINER: profiles RLS''ine bağımlılığı kaldırır.';

revoke all on function public.is_coach_profile(uuid) from public;
grant execute on function public.is_coach_profile(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2) KIRIK 1 — profiles_select
--
-- Kimliği doğrulanmış herkes koç (role='admin') profillerini görebilir; böylece
-- useAdminId() koçun id'sini bulabilir ve mesajlaşma çalışır. Danışanlar
-- birbirinin satırını görmeye DEVAM ETMEZ.
--
-- ÖZYİNELEME NOTU: Burada `role` ifadesi, politikanın değerlendirildiği SATIRIN
-- kendi kolonudur — `profiles` tablosuna alt sorgu DEĞİLDİR. Bu yüzden
-- "infinite recursion detected in policy for relation profiles" hatası oluşmaz.
-- (Bir alt sorgu ya da is_coach_profile() çağrısı burada özyineleme yaratırdı.)
--
-- BİLİNÇLİ GÖRÜNÜRLÜK KARARI: Bu değişiklik koçun profil satırının tamamını
-- (e-posta, ad, avatar ve profildeki diğer kolonlar) tüm danışanlara açar.
-- Kabul edilebilir görülmüştür: koç zaten danışanın muhatabıdır ve mesajlaşma
-- ekranında adı/avatarı gösterilir. Yine de bu, düzeltmenin açtığı YENİ bir
-- görünürlük yüzeyidir; profiles tablosuna ileride hassas kolon eklenirse
-- (ör. koçun telefon/adres/ödeme bilgisi) bu politika kolon bazlı bir görünüme
-- daraltılmalıdır.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()                       -- kendi satırı
    or public.is_admin()                  -- koç herkesi görür
    or role = 'admin'::public.user_role   -- herkes koçu görür (satırın kendi kolonu; alt sorgu değil)
  );


-- -----------------------------------------------------------------------------
-- 3) KIRIK 2 — notifications_insert
--
-- Danışan artık alıcısı KOÇ olan bir bildirim oluşturabilir (program onaya
-- sunulduğunda koç haberdar olsun diye). Danışandan danışana bildirim hâlâ
-- reddedilir — bu kasıtlıdır, aksi hâlde danışanlar arası bildirim spam'ine
-- kapı açılırdı.
-- -----------------------------------------------------------------------------
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert
  on public.notifications
  for insert
  to authenticated
  with check (
    public.is_admin()                            -- koç herkese yazabilir
    or student_id = auth.uid()                   -- kendi adına sistem bildirimi
    or public.is_coach_profile(student_id)       -- danışan -> koç bildirimi
  );
