-- =============================================================================
-- 20260816090300_storage.sql
-- Storage bucket'ları ve storage.objects politikaları.
--
-- Bucket'lar:
--   avatars            -> profil fotoğrafları  (public read)
--   form-checks-media  -> form check pozları   (public read, `poses/` ön eki altında)
--
-- DOSYA ADI KALIPLARI (uygulama koduyla birebir eşleşmeli):
--   src/app/profile/page.js           : `${user.id}-${Math.random()}.${ext}`
--                                       -> KÖK DİZİNE yazılıyor, klasör YOK.
--   src/components/tabs/FormCheckTab.js: `poses/${currentUserId}-${Math.random()}.${ext}`
--
-- Bu yüzden yaygın `(storage.foldername(name))[1] = auth.uid()::text` kalıbı
-- BU PROJEDE ÇALIŞMAZ; sahiplik dosya adı ön ekinden (`<uid>-`) doğrulanır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Bucket'lar (idempotent)
-- -----------------------------------------------------------------------------

-- avatars: herkese açık okuma, 5 MB üst sınır, yalnızca görsel MIME tipleri
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;

-- form-checks-media: herkese açık okuma (public URL kullanılıyor), 5 MB üst sınır
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'form-checks-media',
  'form-checks-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2) storage.objects politikaları
--    RLS storage.objects üzerinde Supabase tarafından zaten etkindir.
-- -----------------------------------------------------------------------------

-- ---------------------------------------------------------------- avatars ----

-- Avatar okuma herkese açıktır (bucket public=true; getPublicUrl ile servis edilir).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'avatars');

-- Avatar yükleme: dosya adı kendi kullanıcı id'nle başlamak zorunda (`<uid>-...`).
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      name like auth.uid()::text || '-%'
      or public.is_admin()
    )
  );

-- Avatar güncelleme (upsert): yalnızca kendi ön ekli dosyan veya koç.
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (name like auth.uid()::text || '-%' or public.is_admin())
  )
  with check (
    bucket_id = 'avatars'
    and (name like auth.uid()::text || '-%' or public.is_admin())
  );

-- Avatar silme: yalnızca kendi ön ekli dosyan veya koç.
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (name like auth.uid()::text || '-%' or public.is_admin())
  );


-- -------------------------------------------------------- form-checks-media ----

-- Poz fotoğrafı okuma: bucket public olduğu için anon da okuyabilir (public URL zorunluluğu).
-- Not: URL bilinmeden erişim mümkün değildir; gizlilik gerekiyorsa bucket private yapılıp
-- createSignedUrl'e geçilmelidir (uygulama kodunda da değişiklik gerektirir).
drop policy if exists "form_checks_public_read" on storage.objects;
create policy "form_checks_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'form-checks-media');

-- Poz yükleme: yalnızca `poses/<kendi-uid>-...` yoluna yazabilirsin.
drop policy if exists "form_checks_insert_own" on storage.objects;
create policy "form_checks_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'form-checks-media'
    and (
      name like 'poses/' || auth.uid()::text || '-%'
      or public.is_admin()
    )
  );

-- Poz güncelleme: yalnızca kendi dosyan veya koç.
drop policy if exists "form_checks_update_own" on storage.objects;
create policy "form_checks_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'form-checks-media'
    and (name like 'poses/' || auth.uid()::text || '-%' or public.is_admin())
  )
  with check (
    bucket_id = 'form-checks-media'
    and (name like 'poses/' || auth.uid()::text || '-%' or public.is_admin())
  );

-- Poz silme: yalnızca kendi dosyan veya koç.
drop policy if exists "form_checks_delete_own" on storage.objects;
create policy "form_checks_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'form-checks-media'
    and (name like 'poses/' || auth.uid()::text || '-%' or public.is_admin())
  );
