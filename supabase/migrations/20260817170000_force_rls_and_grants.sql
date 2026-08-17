-- =============================================================================
-- 20260817170000_force_rls_and_grants.sql
-- Faz 1.5 — Güvenlik Sertleştirme / Grup 5 (veritabanı yarısı)
--
-- Kapattığı bulgular (docs/security/findings-access-control.md):
--   AC-03 (Medium) — `authenticated` rolünde TRUNCATE / REFERENCES / TRIGGER
--                    yetkisi. TRUNCATE **RLS'e tabi değildir**: satır
--                    politikaları hiç devreye girmeden tablonun tamamını siler.
--   AC-06 (Low)    — `FORCE ROW LEVEL SECURITY` hiçbir tabloda açık değil.
--
-- Bu migration şema DEĞİŞTİRMEZ; yalnızca yetki (ACL) ve tablo bayrağı
-- değiştirir. Veri kaybı riski yoktur, idempotenttir (tekrar çalıştırılabilir).
-- =============================================================================


-- #############################################################################
-- ## 1) AC-03 — TRUNCATE / REFERENCES / TRIGGER yetkisinin sökülmesi         ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN "GRANT'I DARALTMAK" DEĞİL, "DEFAULT PRIVILEGES"                  #
--    #                                                                        #
--    # İlk bakışta suçlu `20260816090200_rls_policies.sql` sanılır, ama o     #
--    # dosyadaki GRANT zaten dardır:                                          #
--    #                                                                        #
--    #   grant select, insert, update, delete on all tables                   #
--    #     in schema public to authenticated;                                 #
--    #                                                                        #
--    # TRUNCATE / REFERENCES / TRIGGER oradan GELMİYOR. Kaynak, Supabase      #
--    # platformunun kurulum sırasında tanımladığı VARSAYILAN YETKİLERDİR:     #
--    #                                                                        #
--    #   alter default privileges for role postgres in schema public          #
--    #     grant all on tables to postgres, anon, authenticated, service_role;#
--    #                                                                        #
--    # Canlı kanıt (bu migration yazılırken, düzeltmeden ÖNCE):               #
--    #                                                                        #
--    #   begin;                                                               #
--    #     create table public.zz_probe (id int);                             #
--    #     select relacl from pg_class where relname = 'zz_probe';            #
--    #   rollback;                                                            #
--    #   -> postgres=arwdDxt/postgres                                         #
--    #      authenticated=Dxt/postgres      <-- D=TRUNCATE x=REFERENCES       #
--    #      service_role=Dxt/postgres           t=TRIGGER                     #
--    #                                                                        #
--    # Yani SADECE mevcut tablolardan REVOKE etmek YETMEZ: bir sonraki        #
--    # migration'da açılan HER YENİ TABLO bu üç yetkiyi kendiliğinden geri    #
--    # kazanır ve delik sessizce yeniden açılır. Bu yüzden düzeltme İKİ       #
--    # ADIMLIDIR: (a) mevcut tablolardan revoke, (b) varsayılan yetkilerin    #
--    # kendisinden revoke.                                                    #
--    #                                                                        #
--    # `service_role` ve `postgres` KISITLANMAZ (görev sözleşmesi + bu        #
--    # roller zaten `rolbypassrls = t`, kısıtlamak yanıltıcı güvenlik olurdu).#
--    ##########################################################################

-- (a) Mevcut tablolar — 13 public tablosunun tamamı.
--     `anon` bugün zaten yetkisizdir (20260816090200 §1); yine de idempotent
--     olsun ve gelecekte biri yanlışlıkla grant verirse kapansın diye yazılır.
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke truncate, references, trigger on all tables in schema public from anon;

-- (b) GELECEKTEKİ tablolar — asıl kalıcı düzeltme burasıdır.
--     Bu ifade `postgres` rolünün `public` şemasındaki varsayılan tablo
--     yetkilerinden D/x/t'yi siler. Supabase CLI migration'ları `postgres`
--     rolüyle uyguladığı için (DB_URL = postgres://postgres@...), bundan sonra
--     `create table public.<x>` ile açılan her tablo `authenticated`'a
--     HİÇBİR yetki vermez; ihtiyaç duyulan select/insert/update/delete o
--     tablonun kendi migration'ında AÇIKÇA grant edilmek zorundadır.
--     (Bu, mevcut kalıbın zaten yaptığı şeydir — bkz. workout_plan_tables.sql
--      §grant, nutrition_plan_tables.sql §grant.)
--
--     Unutulursa sonuç GÜRÜLTÜLÜ bir hatadır ("permission denied for table"),
--     sessiz bir güvenlik açığı değil. Takas bilinçlidir.
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon;

--    ##########################################################################
--    # KALAN (KAPATILAMAYAN) BOŞLUK — dürüstçe kayda geçirilir                #
--    #                                                                        #
--    # `pg_default_acl`'de İKİNCİ bir kayıt daha vardır:                      #
--    #                                                                        #
--    #   supabase_admin | public | r |                                        #
--    #     {postgres=arwdDxt, anon=arwdDxt,                                   #
--    #      authenticated=arwdDxt, service_role=arwdDxt}                      #
--    #                                                                        #
--    # Yani tablo `supabase_admin` (superuser) tarafından açılırsa yetkiler   #
--    # geri gelir. Bu kayıt bu migration'dan DEĞİŞTİRİLEMEZ — canlı kanıt:    #
--    #                                                                        #
--    #   alter default privileges for role supabase_admin in schema public    #
--    #     revoke truncate on tables from authenticated;                      #
--    #   -> ERROR: must be member of role "supabase_admin" (42501)            #
--    #                                                                        #
--    # Uygulamanın hiçbir tablosu `supabase_admin` ile açılmaz (13/13 tablo   #
--    # `pg_tables.tableowner = postgres`), dolayısıyla pratik etkisi yoktur;  #
--    # ama `public` şemasına `supabase_admin` ile kurulan bir EKLENTİ tablo   #
--    # yaratırsa o tablo bu korumanın dışında kalır. `supabase/tests/rls.test.sql`
--    # senaryo 71 tabloları `pg_tables`'tan DİNAMİK okuduğu için böyle bir    #
--    # tablo ortaya çıkarsa test KIRILIR ve durum görünür olur.               #
--    #                                                                        #
--    # Kapsam dışı (bilinçli): sequence'lerdeki `authenticated=w` (UPDATE)    #
--    # varsayılanı. AC-03 tablo yetkileriyle ilgilidir; sequence UPDATE bir   #
--    # RLS baypası değil, yalnızca `setval` yüzeyidir. Ayrı bir tur işidir.   #
--    ##########################################################################


-- #############################################################################
-- ## 2) AC-06 — FORCE ROW LEVEL SECURITY                                     ##
-- #############################################################################
--
--    ##########################################################################
--    # FORCE RLS NE YAPAR, BU PROJEDE NE DEĞİŞTİRİR                           #
--    #                                                                        #
--    # Normalde tablo SAHİBİ RLS'ten muaftır. `FORCE ROW LEVEL SECURITY`      #
--    # muafiyeti kaldırır — sahibin sorguları da politikalara tabi olur.      #
--    #                                                                        #
--    # BU PROJEDE GERÇEK KIRILMA RİSKİ VARDI: 13 tablonun tamamının sahibi    #
--    # `postgres` ve `handle_new_user()`, `sync_profile_email()`,             #
--    # `increment_streak()`, `is_coach()`, `profile_role()`,                  #
--    # `is_coach_profile()` ve tüm `*_guard_*` trigger fonksiyonları          #
--    # `SECURITY DEFINER` olarak, yani `postgres` kimliğiyle çalışıyor.       #
--    # FORCE bunları RLS'e soksaydı en az iki yol SESSİZCE ölürdü:            #
--    #   * `handle_new_user()` -> `profiles` INSERT: yeni kullanıcı kaydında  #
--    #     `auth.uid()` NULL'dır, `profiles_insert_coach` politikası          #
--    #     `is_coach()` ister -> her kayıt (ve `db reset` seed'i) çökerdi.    #
--    #   * `is_coach()` -> `profiles` SELECT: politika içinden çağrıldığı için#
--    #     `false` dönmeye başlar, koç TÜM verisini kaybederdi.               #
--    #                                                                        #
--    # KIRILMIYOR — ve bu tahmin değil, ölçüm:                                #
--    #                                                                        #
--    #   `postgres` rolünde `rolbypassrls = t`. BYPASSRLS, FORCE'u EZER.      #
--    #   Canlı kanıt (FORCE tüm tablolarda AÇIKKEN):                          #
--    #     - supabase_auth_admin (GoTrue'nun gerçek DB rolü, bypassrls = f)   #
--    #       ile `insert into auth.users` -> profil OLUŞTU (role=client,      #
--    #       full_name='Force Test'); `update auth.users set email=...`       #
--    #       -> `profiles.email` EŞİTLENDİ.                                   #
--    #     - `npm run test:rls` 70/70, `npm run test:transform` 26/26 GEÇTİ   #
--    #       (bu ikisi is_coach / profile_role / is_coach_profile /           #
--    #        increment_streak / is_end_user_write / program_approvals /      #
--    #        messages / notifications / profiles guard trigger'larını ve     #
--    #        migrate_* SECURITY DEFINER fonksiyonlarını canlı çalıştırır).   #
--    #                                                                        #
--    # DOLAYISIYLA FORCE'un BUGÜNKÜ ETKİSİ SIFIRDIR. Bu bir kusur değil,      #
--    # bu bulgunun neden **Low** olduğudur: koruma savunma derinliğidir.      #
--    # Değeri, `postgres`'ten BYPASSRLS alındığı veya tablolar BYPASSRLS'siz  #
--    # bir role devredildiği gün doğar — o gün bu satırlar zaten yerinde      #
--    # olacak. Aynı sebeple hiçbir tablo kapsam dışı bırakılmamıştır.         #
--    ##########################################################################

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select tablename
      from pg_tables
     where schemaname = 'public'
     order by tablename
  loop
    execute format('alter table public.%I force row level security', r.tablename);
    v_count := v_count + 1;
  end loop;

  raise notice 'FORCE ROW LEVEL SECURITY uygulandi: % tablo', v_count;
end $$;


-- #############################################################################
-- ## 3) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_bad_priv int;
  v_bad_force text;
begin
  -- (a) Hiçbir public tablosunda authenticated/anon için D/x/t kalmamalı.
  select count(*) into v_bad_priv
    from pg_tables t
    cross join (values ('authenticated'), ('anon')) as g(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where t.schemaname = 'public'
     and has_table_privilege(g.role_name, format('public.%I', t.tablename), p.priv);

  if v_bad_priv <> 0 then
    raise exception 'AC-03 DOGRULAMA BASARISIZ: % adet (rol,tablo,yetki) ucluisu hala acik', v_bad_priv;
  end if;

  -- (b) Her public tablosunda relforcerowsecurity = true olmalı.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad_force
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relforcerowsecurity;

  if v_bad_force is not null then
    raise exception 'AC-06 DOGRULAMA BASARISIZ: FORCE RLS kapali tablolar -> %', v_bad_force;
  end if;

  raise notice 'AC-03 / AC-06 dogrulamasi GECTI (D/x/t sifir, FORCE RLS tum tablolarda acik)';
end $$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: geri alma AC-03'ü (Medium) yeniden açar. AC-03 geri açıldığında
-- `authenticated` rolündeki HERHANGİ bir kullanıcı — bir SQL enjeksiyonu veya
-- yanlışlıkla açılmış bir dinamik-SQL RPC üzerinden —
-- `truncate table public.profiles cascade;` ile TÜM veritabanını silebilir
-- (canlı kanıt: denetim sırasında bu ifade 11 tabloya cascade etti ve geçti).
--
-- begin;
--   -- AC-06 geri alma
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_tables where schemaname = 'public' loop
--       execute format('alter table public.%I no force row level security', r.tablename);
--     end loop;
--   end $$;
--
--   -- AC-03 geri alma (Supabase varsayılan davranışına dönüş)
--   alter default privileges in schema public grant truncate, references, trigger on tables to authenticated;
--   grant truncate, references, trigger on all tables in schema public to authenticated;
--   -- NOT: `anon` BİLEREK geri verilmez; 20260816090200 §1 zaten anon'u
--   --      tamamen kilitler, bu migration'dan önceki durum da buydu.
-- commit;
-- =============================================================================
