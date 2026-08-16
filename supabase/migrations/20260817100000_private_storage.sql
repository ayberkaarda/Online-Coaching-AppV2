-- =============================================================================
-- 20260817100000_private_storage.sql
-- Faz 1a — Storage mahremiyeti (active_planprogram.md, I-4).
--
-- SORUN:
--   `avatars` ve `form-checks-media` bucket'ları `public = true` idi. Public
--   bucket'ta `storage.objects` SELECT politikası okuma yolunu HİÇ etkilemez:
--   `/storage/v1/object/public/<bucket>/<yol>` adresi kimlik doğrulaması
--   yapmadan servis edilir. Yani bir danışanın vücut fotoğrafı, URL'i bilen
--   (veya `<uid>-<uuid>.<ext>` kalıbını tahmin eden) HERKES tarafından
--   indirilebiliyordu. Kolonlarda tam public URL saklandığı için bu adresler
--   ayrıca veritabanına da yazılıyordu.
--
-- ÇÖZÜM (üç parça):
--   1. Bucket'lar `public = false` yapılır  -> `/object/public/...` yolu 400 döner.
--   2. Kolonlar tam URL yerine YOL saklar   -> ad da bunu yansıtsın diye
--      `*_url` -> `*_path` olarak yeniden adlandırılır; mevcut satırlardaki
--      public URL'lerden yol kısmı çıkarılır.
--   3. `storage.objects` SELECT politikaları daraltılır: bir nesneyi yalnızca
--      SAHİBİ veya KOÇ okuyabilir. Okuma artık istemcide `createSignedUrl` ile
--      üretilen, süresi dolan imzalı adres üzerinden yapılır (bkz. src/lib/storage.ts).
--
-- NEDEN SELECT POLİTİKASI HÂLÂ GEREKLİ:
--   Storage API `createSignedUrl` çağrısında imzayı üretmeden ÖNCE nesne için
--   SELECT yetkisini RLS ile doğrular. Politika yoksa hiç kimse (koç dahil)
--   imzalı adres üretemez. İmzalı adres bir kez üretildikten sonra token'ın
--   kendisi yetkidir; süresi dolunca (TTL, uygulamada 3600 sn) geçersiz olur.
--
-- YAZMA (INSERT/UPDATE/DELETE) POLİTİKALARI DEĞİŞMEZ:
--   `20260816090300_storage.sql` içindeki `*_insert_own` / `*_update_own` /
--   `*_delete_own` politikaları aynen korunur (yalnızca kendi ön ekine yazma).
--   Bu politikaların gövdesindeki `public.is_admin()` çağrısı
--   `20260817090000_rename_roles.sql` sonrası OID üzerinden otomatik olarak
--   `public.is_coach()` göstermektedir; dokunmaya gerek yoktur.
--
-- Dosya tamamen idempotenttir (kolon adı guard'ları, `drop policy if exists`,
-- yalnızca eşleşen satırları güncelleyen dönüşüm); hem `supabase migration up`
-- hem `supabase db reset` ile güvenle çalışır.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Bucket'lar private
-- -----------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  update storage.buckets
     set public = false
   where id in ('avatars', 'form-checks-media')
     and public is distinct from false;

  get diagnostics v_count = row_count;
  raise notice 'private_storage: % bucket private yapildi.', v_count;
end
$$;


-- -----------------------------------------------------------------------------
-- 2) Kolon adları: *_url -> *_path
--    (Kolon yeniden adlandırma politikaları/indeksleri otomatik takip eder.)
-- -----------------------------------------------------------------------------
do $$
declare
  v_spec text[];
begin
  foreach v_spec slice 1 in array array[
    ['form_checks', 'front_pose_url', 'front_pose_path'],
    ['form_checks', 'back_pose_url',  'back_pose_path'],
    ['profiles',    'avatar_url',     'avatar_path']
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = v_spec[1]
        and column_name  = v_spec[2]
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = v_spec[1]
        and column_name  = v_spec[3]
    ) then
      execute format('alter table public.%I rename column %I to %I', v_spec[1], v_spec[2], v_spec[3]);
      raise notice 'private_storage: public.%.% -> % yeniden adlandirildi.', v_spec[1], v_spec[2], v_spec[3];
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- 3) Veri dönüşümü: tam public URL -> yol
--
--    Eski kod `getPublicUrl()` sonucunu saklıyordu:
--      http://127.0.0.1:54321/storage/v1/object/public/form-checks-media/poses/<uid>-<uuid>.jpg
--    Bize yalnızca `poses/<uid>-<uuid>.jpg` kısmı lazım. Yalnızca desene UYAN
--    satırlar güncellenir; zaten yol olan değerlere dokunulmaz (idempotent).
--    Sondaki sorgu parametresi (`?t=...`) varsa o da atılır.
-- -----------------------------------------------------------------------------
do $$
declare
  v_fc_pattern      text := '^.*/storage/v1/object/(public|sign)/form-checks-media/';
  v_avatar_pattern  text := '^.*/storage/v1/object/(public|sign)/avatars/';
  v_front  integer;
  v_back   integer;
  v_avatar integer;
  v_left   integer;
begin
  update public.form_checks
     set front_pose_path = split_part(regexp_replace(front_pose_path, v_fc_pattern, ''), '?', 1)
   where front_pose_path ~ v_fc_pattern;
  get diagnostics v_front = row_count;

  update public.form_checks
     set back_pose_path = split_part(regexp_replace(back_pose_path, v_fc_pattern, ''), '?', 1)
   where back_pose_path ~ v_fc_pattern;
  get diagnostics v_back = row_count;

  update public.profiles
     set avatar_path = split_part(regexp_replace(avatar_path, v_avatar_pattern, ''), '?', 1)
   where avatar_path ~ v_avatar_pattern;
  get diagnostics v_avatar = row_count;

  raise notice 'private_storage: yola cevrilen satirlar -> front_pose_path=%, back_pose_path=%, avatar_path=%',
    v_front, v_back, v_avatar;

  -- Storage dışı (ör. placeholder servisi) mutlak URL'ler dönüştürülemez; silmek
  -- yerine oldukları gibi bırakılır. İmzalı adres üretimi bunlar için başarısız
  -- olur ve UI placeholder gösterir (uygulama tarafında `null` dönülür).
  select count(*) into v_left
  from (
    select front_pose_path as v from public.form_checks
    union all
    select back_pose_path from public.form_checks
    union all
    select avatar_path from public.profiles
  ) s
  where v ~ '^https?://';

  if v_left > 0 then
    raise notice 'private_storage: DIKKAT — % deger hala mutlak URL (storage disi); imzali adres uretilemeyecek.', v_left;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4) Kolon yorumları
-- -----------------------------------------------------------------------------
comment on column public.form_checks.front_pose_path
  is 'form-checks-media bucket''ındaki YOL (ör. poses/<uid>-<uuid>.jpg). Tam URL DEĞİL — okuma anında createSignedUrl ile imzalanır.';
comment on column public.form_checks.back_pose_path
  is 'form-checks-media bucket''ındaki YOL (ör. poses/<uid>-<uuid>.jpg). Tam URL DEĞİL — okuma anında createSignedUrl ile imzalanır.';
comment on column public.profiles.avatar_path
  is 'avatars bucket''ındaki YOL (ör. <uid>-<uuid>.jpg, kök dizin). Tam URL DEĞİL — okuma anında createSignedUrl ile imzalanır.';


-- -----------------------------------------------------------------------------
-- 5) storage.objects SELECT politikaları — herkese açık okuma KALDIRILIR
--
--    Sahiplik dosya adı ön ekinden doğrulanır (bkz. 20260816090300_storage.sql):
--      avatars           -> `<uid>-...`        (kök dizin, klasör yok)
--      form-checks-media -> `poses/<uid>-...`
--    `anon` artık hiçbir nesneyi seçemez: imzasız okuma yolu tamamen kapalıdır.
-- -----------------------------------------------------------------------------

-- Eski "herkese açık okuma" politikaları
drop policy if exists "avatars_public_read"     on storage.objects;
drop policy if exists "form_checks_public_read" on storage.objects;

-- avatars: sahibi veya koç
drop policy if exists "avatars_select_own_or_coach" on storage.objects;
create policy "avatars_select_own_or_coach"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      name like auth.uid()::text || '-%'
      or public.is_coach()
    )
  );

-- form-checks-media: sahibi veya koç
drop policy if exists "form_checks_select_own_or_coach" on storage.objects;
create policy "form_checks_select_own_or_coach"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'form-checks-media'
    and (
      name like 'poses/' || auth.uid()::text || '-%'
      or public.is_coach()
    )
  );
