-- =============================================================================
-- 20260817180100_avatar_visibility.sql
--
-- FAZ 1.7 — KOÇUN AVATARI DANIŞANA GÖRÜNMÜYOR (docs/PROGRESS.md §5 borcu).
--
-- SORUN:
--   `20260817100000_private_storage.sql` §5 `avatars` bucket'ının SELECT
--   politikasını "SAHİBİ veya KOÇ" yaptı:
--
--     name like auth.uid()::text || '-%'   -- kendi dosyam
--     or public.is_coach()                 -- koç isem hepsi
--
--   Danışan, koçun avatar DOSYASININ sahibi değildir ve koç da değildir ->
--   `createSignedUrl` çağrısı RLS SELECT reddiyle başarısız olur, danışan koçun
--   avatarını GÖREMEZ. Bugün arayüz koç avatarını danışana hiç göstermediği için
--   REGRESYON YOK; ama sohbet başlığına ("Koçun: Deniz") avatar eklendiği gün
--   sessizce placeholder'a düşerdi.
--
-- ÇÖZÜM: politikaya ÜÇÜNCÜ bir dal — "hedef dosyanın sahibi bir KOÇ ise herkes
--   okuyabilir". Avatar zaten kişiye özel değil, KAMUSAL bir kimlik öğesidir;
--   koçun avatarı ürünün her ekranında görünmesi beklenen bir varlıktır.
--
-- KAPSAM: YALNIZCA `avatars`. `form-checks-media` (vücut fotoğrafları) POLİTİKASI
--   DEĞİŞMEZ — orada "sahibi veya koç" doğru ve tek doğru kuraldır.
--
-- Idempotenttir: `create or replace function`, `drop policy if exists`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) public.avatar_object_owner(text) — DOSYA ADINDAN SAHİP UID'İ         ##
-- #############################################################################
--
--    ##########################################################################
--    # DOSYA ADI AYRIŞTIRMASIYLA YETKİ VERMEK NEDEN RİSKLİ, BU NEDEN GÜVENLİ  #
--    #                                                                        #
--    # Risk gerçektir: gevşek bir ayrıştırma (`split_part(name,'-',1)`,       #
--    # `left(name, 36)::uuid`, `like '%'` vb.) yanlış bir uid üretirse ya     #
--    # hata fırlatır (politikanın TAMAMI patlar) ya da rastgele bir profile   #
--    # eşleşir. En kötü hâlde "her dosyayı herkes görür" hâline düşülür.      #
--    #                                                                        #
--    # DÖRT AYRI GÜVENCE VAR:                                                  #
--    #                                                                        #
--    # (1) KATI BİÇİM DOĞRULAMASI. `20260817100000` §5'te kayıtlı ve          #
--    #     `src/hooks/useProfile.ts:81` tarafından üretilen biçim SABİTTİR:    #
--    #     `<uid>-<uuid>.<ext>`, bucket KÖKÜNDE. Fonksiyon tam olarak bunu     #
--    #     arar: 36 karakterlik kanonik UUID + ARDINDAN '-' + isimde HİÇ '/'   #
--    #     olmaması. Desene uymayan HER ad NULL döner.                        #
--    #                                                                        #
--    # (2) CAST ASLA PATLAMAZ. `::uuid` yalnızca regex'in kanonik UUID'yi      #
--    #     doğruladığı DALDA çalışır. `case` kısa devre yapar, yani geçersiz   #
--    #     metin cast'e HİÇ ulaşmaz. (Politika içinde fırlayan bir hata,       #
--    #     `createSignedUrl`'i herkes için kırardı.)                           #
--    #                                                                        #
--    # (3) NULL GÜVENLİ. Ayrıştırma başarısızsa NULL döner ve                  #
--    #     `public.is_coach(null)` -> `exists(... where p.id = null)` -> FALSE.#
--    #     Yani "ayrıştıramadım" hâli DAİMA REDDE düşer, izne değil.          #
--    #                                                                        #
--    # (4) ÖN EK SAHTELENEMEZ. Asıl soru şu: bir danışan, adı KOÇUN uid'iyle   #
--    #     başlayan bir dosya yükleyip bu dalı sömürebilir mi? HAYIR —         #
--    #     `avatars_insert_own` / `avatars_update_own` politikaları            #
--    #     `name like auth.uid()::text || '-%'` şart koşar (bkz.               #
--    #     20260816090300_storage.sql). Danışan YALNIZCA KENDİ uid'iyle        #
--    #     başlayan ad üretebilir; o dosyanın "sahibi" de kendisidir ve        #
--    #     `is_coach(kendi uid)` FALSE'tur. Üstelik sömürü başarılı olsaydı    #
--    #     bile kazanç "kendi dosyamı başkasına gösterdim" olurdu — BAŞKASININ #
--    #     dosyasını okuma yolu açılmaz.                                        #
--    #                                                                        #
--    # NEDEN `storage.objects.owner` KOLONU KULLANILMADI: kolon MEVCUT ama     #
--    # GÜVENİLİR DEĞİL — nullable'dır, Storage API sürümüne göre `owner` /     #
--    # `owner_id` ikilisi farklı doldurulur ve `20260817100000` öncesinde      #
--    # yüklenmiş satırlarda boş olabilir. Mevcut sahiplik politikalarının      #
--    # TAMAMI (insert/update/delete/select, 6 politika) zaten AD ÖN EKİNE      #
--    # dayanıyor; okuma dalını farklı bir kaynağa dayandırmak iki ayrı         #
--    # sahiplik tanımı yaratır ve ikisi birbirinden kayabilir. Tek kaynak      #
--    # ilkesi gereği AD ÖN EKİ korundu.                                        #
--    #                                                                        #
--    # `immutable`: girdi -> çıktı deterministiktir (tablo okumaz), planlayıcı #
--    # her satır için yeniden değerlendirmek zorunda kalmaz.                   #
--    ##########################################################################
create or replace function public.avatar_object_owner(p_name text)
returns uuid
language sql
immutable
returns null on null input
set search_path = public, pg_temp
as $$
  select case
           when p_name !~ '/'
            and p_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-'
           then substring(p_name from 1 for 36)::uuid
           else null
         end;
$$;

comment on function public.avatar_object_owner(text)
  is 'avatars bucket''ındaki bir nesne adından (`<uid>-<uuid>.<ext>`, kök dizin) sahip uid''sini çıkarır. Desene UYMAYAN her ad için NULL döner (cast asla patlamaz, NULL daima redde düşer). avatars_select_own_or_coach politikasının "sahibi koç mu?" dalı bunu kullanır.';

revoke all     on function public.avatar_object_owner(text) from public;
grant  execute on function public.avatar_object_owner(text) to authenticated, service_role;


-- #############################################################################
-- ## 2) avatars SELECT politikası — ÜÇÜNCÜ DAL                               ##
-- #############################################################################
--
--    Politika adı BİLEREK korunuyor (`avatars_select_own_or_coach`):
--    `supabase/README.md` ve `20260817100000` bu adı anıyor, yeniden adlandırmak
--    dokümantasyonu sessizce yanlışlar.
--
--    DALLAR:
--      1. `name like auth.uid()::text || '-%'` -> KENDİ avatarım.
--      2. `public.is_coach()`                  -> koç isem hepsini görürüm
--                                                 (koç panelinde danışan
--                                                 avatarları gösterilir).
--      3. `public.is_coach(avatar_object_owner(name))`  -> YENİ: dosyanın sahibi
--                                                 KOÇ ise herkes okuyabilir.
--
--    DANIŞAN -> DANIŞAN HÂLÂ KAPALI: 1. dal başka bir uid için tutmaz, 2. dal
--    danışan için false, 3. dal hedef danışan olduğu için false. Bu, bu turun
--    EN KRİTİK REGRESYON TESTİDİR (rls.test.sql senaryo 82).
-- #############################################################################
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
      or public.is_coach(public.avatar_object_owner(name))
    )
  );


-- #############################################################################
-- ## 3) MIGRATION'IN KENDİ DOĞRULAMASI                                       ##
-- #############################################################################
do $$
declare
  v_qual text;
begin
  -- (a) Ayrıştırıcı SAĞLAM: bozuk girdilerde NULL, doğru girdide uid.
  if public.avatar_object_owner('kotu-ad.jpg')                    is not null then
    raise exception 'DOGRULAMA BASARISIZ: avatar_object_owner desene uymayan adi ayristirdi.';
  end if;
  if public.avatar_object_owner('poses/11111111-1111-1111-1111-111111111111-x.jpg') is not null then
    raise exception 'DOGRULAMA BASARISIZ: avatar_object_owner alt dizindeki adi ayristirdi.';
  end if;
  if public.avatar_object_owner('11111111-1111-1111-1111-111111111111.jpg') is not null then
    raise exception 'DOGRULAMA BASARISIZ: avatar_object_owner ayirici (-) olmadan ayristirdi.';
  end if;
  if public.avatar_object_owner('11111111-1111-1111-1111-111111111111-abc.jpg')
       is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'DOGRULAMA BASARISIZ: avatar_object_owner gecerli adi ayristiramadi.';
  end if;

  -- (b) Politika üçüncü dalı GERÇEKTEN içermeli.
  select qual into v_qual
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'avatars_select_own_or_coach';

  if v_qual is null then
    raise exception 'DOGRULAMA BASARISIZ: avatars_select_own_or_coach politikasi YOK.';
  end if;
  if v_qual not like '%avatar_object_owner%' then
    raise exception 'DOGRULAMA BASARISIZ: avatars politikasi koc-avatari dalini icermiyor -> %', v_qual;
  end if;

  -- (c) form-checks-media POLİTİKASI DEĞİŞMEMİŞ olmalı (kapsam sızması yok).
  select qual into v_qual
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'form_checks_select_own_or_coach';

  if v_qual like '%avatar_object_owner%' then
    raise exception 'DOGRULAMA BASARISIZ: form-checks-media politikasina avatar dali sizmis -> %', v_qual;
  end if;

  raise notice 'Avatar gorunurlugu: kocun avatari tum authenticated kullanicilara acildi; danisan-danisan KAPALI.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- Geri alma güvenlik açığı YARATMAZ, yalnızca koç avatarını danışana tekrar
-- -- görünmez kılar (bugünkü arayüzde etkisi yoktur).
-- =============================================================================
--
-- begin;
--
-- drop policy if exists "avatars_select_own_or_coach" on storage.objects;
-- create policy "avatars_select_own_or_coach"
--   on storage.objects
--   for select
--   to authenticated
--   using (
--     bucket_id = 'avatars'
--     and (
--       name like auth.uid()::text || '-%'
--       or public.is_coach()
--     )
--   );
--
-- drop function if exists public.avatar_object_owner(text);
--
-- commit;
--
-- =============================================================================
