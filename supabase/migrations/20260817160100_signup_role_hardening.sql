-- =============================================================================
-- 20260817160100_signup_role_hardening.sql
--
-- FAZ 1.5 / GÜVENLİK — AC-02 (High):
-- `public.handle_new_user()` ROLÜ ARTIK KULLANICI METADATA'SINDAN ALMAZ.
--
-- BULGU (docs/security/findings-access-control.md §3.2):
--   Fonksiyon rolü şu satırla belirliyordu:
--
--     v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role',''),'client')
--                 ::public.user_role;
--
--   `raw_user_meta_data`, GoTrue'da `/auth/v1/signup` gövdesindeki `data` alanından
--   doldurulur — yani TAMAMEN SALDIRGAN DENETİMİNDEDİR. `enable_signup = true`
--   yapıldığı (ya da davet / magic-link ile kullanıcı oluşturma açıldığı) an
--   herhangi bir kişi `{"data":{"role":"coach"}}` göndererek KOÇ olur ve
--   `is_coach()` üzerinden TÜM danışanların profil, form check, mesaj, günlük,
--   plan ve onay verisine erişir.
--
--   Bugünkü tek engel YAPILANDIRMADIR (`GOTRUE_DISABLE_SIGNUP=true`). Güvenlik
--   sınırı bir ortam değişkeninin kapalı kalmasına bağlı olmamalıdır: o değişken
--   ürünün büyümesiyle (kayıt açma, davet akışı) neredeyse kesinlikle açılacaktır
--   ve o gün bu satır sessizce bir yetki yükseltme yoluna dönüşür.
--
-- ÇÖZÜM:
--   `v_role := 'client'` SABİTLENİR. `raw_user_meta_data ->> 'role'` alanı
--   TÜMÜYLE YOK SAYILIR — okunmaz bile. (`full_name` okunmaya devam eder: o alan
--   yalnızca gösterim amaçlıdır, hiçbir yetki kararı ona bağlı değildir.)
--
-- ############################################################################
-- # KOÇ YÜKSELTMESİ ARTIK YALNIZCA AYRICALIKLI YOLDAN YAPILIR                #
-- #                                                                          #
-- # Bu migration'dan sonra "yeni kullanıcı koç olarak doğar" diye bir yol     #
-- # KALMAMIŞTIR. Bir hesabın koç olması için AÇIK ve AYRICALIKLI bir işlem    #
-- # gerekir; bunun İKİ meşru yolu vardır:                                     #
-- #                                                                          #
-- #   1) `service_role` / `postgres` ile doğrudan:                            #
-- #        update public.profiles set role = 'coach' where id = '<uuid>';     #
-- #      (`supabase/seed.sql` §2 tam olarak bunu yapar — aşağıya bakınız.)    #
-- #                                                                          #
-- #   2) MEVCUT bir koç üzerinden: `profiles_update_coach` politikası koçun   #
-- #      bir danışanı `coach` yapmasına izin verir (findings §5'te bilinçli   #
-- #      karar olarak kayıtlıdır — koç zaten tüm veriye erişen güvenilir      #
-- #      roldür). Yani "ilk koç" ayrıcalıklı yoldan doğar, sonrakiler ondan.  #
-- #                                                                          #
-- # SEED KIRILMADI — DOĞRULANDI: `supabase/seed.sql` koç profilini trigger'ın #
-- # yazdığı role GÜVENMİYOR; trigger'dan SONRA açık bir UPDATE ile rolü       #
-- # sabitliyor (seed.sql §2, "Koç profili" bloğu):                            #
-- #                                                                          #
-- #     update public.profiles                                               #
-- #        set ..., role = 'coach', ...                                       #
-- #      where id = '11111111-1111-1111-1111-111111111111';                   #
-- #                                                                          #
-- # Bu yüzden seed'e HİÇBİR DEĞİŞİKLİK GEREKMEDİ. `auth.users` satırındaki    #
-- # `raw_user_meta_data.role = "coach"` değeri artık İŞLEVSİZ bir kalıntıdır; #
-- # BİLEREK bırakılıyor (silmek seed'i değiştirmek olurdu ve hiçbir şey       #
-- # kazandırmaz — fonksiyon o alanı artık okumuyor).                          #
-- #                                                                          #
-- # 50+ RLS senaryosunun TAMAMI koçun gerçekten koç olmasına bağlıdır;        #
-- # `npm run test:rls` bu migration'dan sonra bunu her çalıştırmada kanıtlar. #
-- ############################################################################
--
-- Idempotenttir: yalnızca `create or replace function`.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- ROL SABİTTİR. `new.raw_user_meta_data ->> 'role'` BİLEREK OKUNMAZ:
  -- o alan istemci denetimindedir ve bir yetki kararının girdisi olamaz (AC-02).
  -- Koç yükseltmesi yalnızca ayrıcalıklı yoldan yapılır (dosya başlığına bakınız).
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    'client'::public.user_role
  )
  on conflict (id) do nothing;   -- service_role ile ayrıca profil insert edilse bile patlamasın

  return new;
end;
$$;

comment on function public.handle_new_user()
  is 'auth.users -> public.profiles otomatik profil oluşturma trigger''ı. ROL HER ZAMAN ''client''tir: raw_user_meta_data.role istemci denetimindedir ve YOK SAYILIR (AC-02). Koç yükseltmesi yalnızca service_role/postgres ya da mevcut bir koç tarafından yapılır.';

-- Trigger'ın hâlâ bağlı olduğunu garanti et (fonksiyon gövdesi değişti, bağ değil).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- DOĞRULAMA — koç profili hâlâ yerinde mi?
--
-- Bu migration'ın en büyük riski, koç profilinin (`is_coach()`) kaybolmasıdır:
-- o kaybolursa TÜM koç yolları (RLS politikaları dahil) sessizce çöker. Migration
-- sırasında `profiles` genellikle BOŞTUR (`supabase db reset` -> migration'lar
-- seed'den ÖNCE koşar), o yüzden bu bir HATA değil UYARI'dır; dolu bir
-- veritabanına uygulandığında ise operatöre anında geri bildirim verir.
-- -----------------------------------------------------------------------------
do $$
declare
  v_profiles integer;
  v_coaches  integer;
begin
  select count(*), count(*) filter (where role = 'coach'::public.user_role)
    into v_profiles, v_coaches
    from public.profiles;

  if v_profiles = 0 then
    raise notice 'handle_new_user sertlestirildi (rol sabit ''client''). profiles bos -> koc kontrolu atlandi (seed henuz kosmadi).';
  elsif v_coaches = 0 then
    raise warning 'handle_new_user sertlestirildi AMA profiles tablosunda HIC koc YOK (% profil). is_coach() her yerde false doner; koc yukseltmesini ayricalikli yoldan (service_role) yapin.', v_profiles;
  else
    raise notice 'handle_new_user sertlestirildi (rol sabit ''client''). Mevcut koc sayisi=% (toplam profil=%).', v_coaches, v_profiles;
  end if;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma AC-02'yi (High) YENİDEN AÇAR. Kayıt/davet akışı açıksa
-- -- herkes kendini koç yapabilir hâle gelir. Geri almayın; gerekiyorsa önce
-- -- `enable_signup = false` olduğunu doğrulayın.
-- =============================================================================
--
-- create or replace function public.handle_new_user()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_role public.user_role;
-- begin
--   begin
--     v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'client')::public.user_role;
--   exception
--     when invalid_text_representation then
--       v_role := 'client'::public.user_role;
--   end;
--
--   insert into public.profiles (id, email, full_name, role)
--   values (
--     new.id,
--     new.email,
--     coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
--     v_role
--   )
--   on conflict (id) do nothing;
--
--   return new;
-- end;
-- $$;
--
-- =============================================================================
