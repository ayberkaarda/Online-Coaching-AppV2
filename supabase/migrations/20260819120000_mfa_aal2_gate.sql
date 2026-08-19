-- =============================================================================
-- 20260819120000_mfa_aal2_gate.sql
-- Faz 4.7 dilim 1 — TOTP MFA çekirdeği: koç hesabı için aal2 KAPISI
--
-- Karar kaydı: docs/adr/0026-totp-mfa-ve-aal2-kapisi.md
-- Kanıt      : supabase/tests/rls.test.sql senaryo 127–131
--
-- #############################################################################
-- ## NE YAPAR                                                                ##
-- #############################################################################
--
--   Danışan verisi taşıyan 14 tabloya, HEPSİNE AYNI ŞEKİLDE, tek bir
--   RESTRICTIVE politika kurar:
--
--       not is_coach() or (select auth.jwt() ->> 'aal') = 'aal2'
--
--   Türkçesi: "koç DEĞİLSEN bu kapı seni hiç ilgilendirmez; koçsan oturumun
--   ikinci faktörle doğrulanmış olmak ZORUNDA."
--
-- #############################################################################
-- ## NEDEN RLS — "ROUTE'TA KONTROL ETSEYDİK" SORUSUNUN CEVABI                ##
-- #############################################################################
--
--   ADR-0022'de kayda geçen ve bu turda DEĞİŞMEYEN mimari kısıt: tarayıcı
--   Supabase'e DOĞRUDAN gidiyor (`supabase.from(...)`, realtime `.channel(...)`).
--   Arada BFF yok. Dolayısıyla Next.js tarafındaki her kapı — sayfa, proxy,
--   route handler — anon key + oturum cookie'siyle atılan düz bir `fetch`
--   tarafından ATLATILABİLİR. Bu kod tabanında yetkilendirmenin TEK gerçek
--   sınırı RLS'tir; ADR-0022 bunu zaten yazıyor ("güvenlik sınırı token'ın
--   gizliliği değil, veritabanı tarafındaki RLS'tir").
--
--   Bu yüzden "MFA zorunlu" ifadesi bir arayüz yönlendirmesi olarak YETMEZ.
--   Zorunluluk buraya, satır seviyesine yazılır.
--
-- #############################################################################
-- ## NEDEN "SALT OKUNUR BİLE DEĞİL" (fail-closed)                            ##
-- #############################################################################
--
--   Politika `for all` olarak kurulur ve `using` ifadesi `with check` olarak da
--   yazılır: aal1'deki koç 14 tablonun hiçbirini OKUYAMAZ, yazamaz, silemez.
--   "Okusun ama yazamasın" ara kararı bilerek alınmadı — koç panelinin okuduğu
--   şey zaten tüm danışanların vücut fotoğrafları, ölçümleri ve yazışmalarıdır;
--   çalınan bir parolanın açtığı en büyük kapı YAZMA değil OKUMADIR.
--
-- #############################################################################
-- ## DANIŞANA ETKİSİ: SIFIR — VE BU ÖLÇÜLÜR                                  ##
-- #############################################################################
--
--   `not is_coach()` dalı danışan için HER ZAMAN true döner; RESTRICTIVE
--   politika `true` verdiğinde mevcut PERMISSIVE politikaların sonucunu
--   değiştirmez. Danışanın `aal` claim'i `aal1` olsun, hiç olmasın — fark
--   etmez. Bu iddia varsayım değil, `rls.test.sql` senaryo 130'da ÖLÇÜLÜR
--   (ve mevcut 126 senaryonun danışan yarısı zaten `aal` claim'i OLMADAN
--   koşuyor: hepsi yeşil kalmak zorunda).
--
-- #############################################################################
-- ## `aal` CLAIM'İ YOKSA NE OLUR                                             ##
-- #############################################################################
--
--   `auth.jwt() ->> 'aal'` NULL döner; `NULL = 'aal2'` NULL'dır ve politika
--   `false` sayar -> KOÇ REDDEDİLİR. Bu BİLİNÇLİ bir fail-closed tercihidir:
--   claim'i yorumlayamadığımız her durumda kapı KAPALI kalır. Gerçek GoTrue
--   token'ları `aal`i HER ZAMAN taşır (auth-js `RequiredClaims` tipi bunu
--   zorunlu alan olarak tanımlar), yani pratikte bu dal yalnızca elle
--   üretilmiş/eksik claim setlerinde görülür — testler ve `psql` oturumları.
--
-- #############################################################################
-- ## BİLİNEN TUZAK — STUDIO'DAN "IMPERSONATE"                                ##
-- #############################################################################
--
--   Supabase Studio'nun kullanıcı taklidi (impersonation) varsayılan olarak
--   `aal1` claim'i üretir. Yani Studio'da koç olarak sorgu çalıştıran biri bu
--   migration'dan sonra BOŞ SONUÇ görür ve "RLS bozuldu" sanır. Bozulmamıştır;
--   kapı tam da tasarlandığı gibi çalışmaktadır.
--
-- #############################################################################
-- ## GERİ ALINABİLİRLİK                                                      ##
-- #############################################################################
--
--   Dosya salt EKLEMELİDİR: hiçbir tablo, kolon, politika veya yetki
--   DÜŞÜRÜLMEZ. Yalnızca 14 yeni RESTRICTIVE politika eklenir. Sonundaki DOWN
--   bloğu bu 14 politikayı düşürür ve kod tabanını bugünkü davranışına
--   döndürür.
-- =============================================================================


-- #############################################################################
-- ## 1) Ön koşul: `is_coach()` gerçekten RLS'ten muaf mı?                    ##
-- #############################################################################
--
--    Politikanın tamamı `is_coach()`in DOĞRU cevap vermesine dayanıyor. Eğer o
--    fonksiyon bir gün `SECURITY INVOKER`a çevrilirse, `profiles` üzerindeki BU
--    politikanın içinden çağrıldığında kendi kendini tetikler ve `false` dönmeye
--    başlar -> kapı SESSİZCE AÇILIR (koç aal1'de her şeyi görür). Sessiz açılma
--    en kötü kusurdur; bu yüzden ön koşul migration'ın ilk ifadesidir.
do $$
declare
  v_secdef boolean;
begin
  select p.prosecdef into v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'is_coach';

  if v_secdef is null then
    raise exception 'ON KOSUL BASARISIZ: public.is_coach() YOK -- aal2 kapisi kurulamaz.';
  end if;
  if not v_secdef then
    raise exception 'ON KOSUL BASARISIZ: public.is_coach() SECURITY INVOKER -- profiles politikasi kendi kendini tetikler ve kapi SESSIZCE ACILIR.';
  end if;

  if to_regprocedure('auth.jwt()') is null then
    raise exception 'ON KOSUL BASARISIZ: auth.jwt() YOK -- aal claim i okunamaz.';
  end if;

  raise notice 'On kosul GECTI: is_coach() SECURITY DEFINER, auth.jwt() mevcut.';
end
$$;


-- #############################################################################
-- ## 2) 14 tabloya tek kalıplı RESTRICTIVE politika                          ##
-- #############################################################################
--
--    ##########################################################################
--    # TABLO LİSTESİNİN KAYNAĞI — TAHMİN DEĞİL                                #
--    #                                                                        #
--    # Bu 14 ad, `delete_account()`in (20260819100000_account_deletion.sql    #
--    # §manifest) saydığı listeyle BİREBİR AYNIDIR ve ADR-0025 §Ölçülen       #
--    # gerçekler 1'de gerekçesiyle kayıtlıdır:                                #
--    #   * doğrudan kullanıcı kolonu taşıyan 12,                              #
--    #   * plan üzerinden dolaylı bağlı 2 (workout_plan_exercises,            #
--    #     nutrition_plan_meals).                                             #
--    #                                                                        #
--    # `public` şemasındaki DİĞER 4 tablo bilerek DIŞARIDA:                   #
--    #   * exercises, food_database   -> KATALOG; kullanıcı kolonu yok, veri  #
--    #     kişisel değil. Koçu aal1'de hareket listesinden mahrum bırakmak    #
--    #     hiçbir şey korumaz.                                                #
--    #   * account_deletions          -> denetim tablosu; RLS+FORCE açık ve   #
--    #     SIFIR politikası var (ADR-0025 §6). Zaten herkese kapalı; buraya   #
--    #     15. bir politika eklemek "kapalıyı biraz daha kapatmak" olurdu.    #
--    #   * message_attachment_verifications -> aynı desen (B-028 damga        #
--    #     tablosu): RLS+FORCE, sıfır politika.                               #
--    #                                                                        #
--    # Liste burada TEK yerde durur ve aşağıdaki §3 doğrulaması onu şemayla   #
--    # karşılaştırır: yarın 15. bir danışan tablosu eklenirse bu migration    #
--    # değil ama `rls.test.sql` senaryo 131 GÜRÜLTÜLÜ biçimde kırılır.        #
--    ##########################################################################
do $$
declare
  -- ADR-0025 §Ölçülen gerçekler 1 ile birebir aynı sıra ve içerik.
  v_tables text[] := array[
    'profiles',
    'notifications',
    'messages',
    'form_checks',
    'daily_logs',
    'workout_logs',
    'nutrition_logs',
    'program_approvals',
    'workout_plans',
    'workout_plan_exercises',
    'nutrition_plans',
    'nutrition_plan_meals',
    'progress_entries',
    'progress_photos'
  ];
  v_table  text;
  v_count  int := 0;
begin
  if array_length(v_tables, 1) <> 14 then
    raise exception 'TABLO LISTESI BOZUK: 14 bekleniyordu, % var.', array_length(v_tables, 1);
  end if;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'TABLO YOK: public.% -- liste sema ile ayrismis.', v_table;
    end if;

    -- Idempotanslık: migration tekrar çalıştırılabilir olmalı (repo kuralı).
    execute format('drop policy if exists mfa_aal2_gate on public.%I', v_table);

    -- ####################################################################
    -- # POLİTİKANIN HER PARÇASI BİR KARAR                                #
    -- #                                                                  #
    -- # `as restrictive`  : PERMISSIVE olsaydı mevcut politikalarla VEYA #
    -- #                     lanır ve HİÇBİR ŞEYİ kısıtlamazdı — kapı     #
    -- #                     kurulduğu anda etkisiz olurdu.               #
    -- # `for all`         : select/insert/update/delete DÖRDÜ birden.    #
    -- # `to authenticated`: `service_role` ve `postgres` zaten           #
    -- #                     `rolbypassrls`; onları listelemek yanıltıcı  #
    -- #                     güvenlik olurdu. `anon`un bu tablolarda      #
    -- #                     hiçbir yetkisi yok (20260816090200 §1).      #
    -- # `not (select ...)`: alt sorgu, ifadeyi satır BAŞINA değil sorgu  #
    -- #                     başına BİR KEZ çalışan bir initplan'a        #
    -- #                     çevirir. `is_coach()` her satır için         #
    -- #                     çağrılsaydı koç panelindeki liste sorguları  #
    -- #                     ölçülebilir biçimde yavaşlardı.              #
    -- # `with check` AÇIK : `for all` politikalarında `with check`       #
    -- #                     yazılmazsa Postgres `using`i kopyalar —      #
    -- #                     yani davranış aynıdır. Yine de AÇIKÇA        #
    -- #                     yazılıyor ki `pg_policies.with_check` NULL   #
    -- #                     kalmasın ve sürüklenme testi (senaryo 131)   #
    -- #                     yazma tarafını da ÖLÇEBİLSİN.                #
    -- ####################################################################
    execute format($fmt$
      create policy mfa_aal2_gate on public.%I
        as restrictive
        for all
        to authenticated
        using (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
        with check (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
    $fmt$, v_table);

    execute format(
      'comment on policy mfa_aal2_gate on public.%I is %L',
      v_table,
      'ADR-0026: koc hesabi icin ikinci faktor zorunlulugu. Danisani ETKILEMEZ (not is_coach() dali). Kaldirilirsa koc, yalnizca parolayla tum danisan verisine erisir.'
    );

    v_count := v_count + 1;
  end loop;

  raise notice 'mfa_aal2_gate kuruldu: % tablo', v_count;
end
$$;


-- #############################################################################
-- ## 3) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_expected text[] := array[
    'daily_logs', 'form_checks', 'messages', 'notifications', 'nutrition_logs',
    'nutrition_plan_meals', 'nutrition_plans', 'profiles', 'program_approvals',
    'progress_entries', 'progress_photos', 'workout_logs', 'workout_plan_exercises',
    'workout_plans'
  ];
  v_installed int;
  v_missing   text;
  v_extra     text;
begin
  -- (a) 14 politikanın HEPSİ kurulu, HEPSİ restrictive, HEPSİ ALL, HEPSİ
  --     yalnızca `authenticated` rolünde ve HEM using HEM with_check dolu mu?
  select count(*) into v_installed
    from pg_policies p
   where p.schemaname  = 'public'
     and p.policyname  = 'mfa_aal2_gate'
     and p.tablename   = any (v_expected)
     and p.permissive  = 'RESTRICTIVE'
     and p.cmd         = 'ALL'
     and p.roles       = '{authenticated}'::name[]
     and p.qual        is not null
     and p.with_check  is not null;

  if v_installed <> 14 then
    raise exception 'DOGRULAMA BASARISIZ: beklenen 14 RESTRICTIVE/ALL/authenticated politika, kurulan % -- kapi EKSIK.', v_installed;
  end if;

  -- (b) Politikanın METNİ gerçekten iki dalı da içeriyor mu? Bir gün biri
  --     `not is_coach()` dalını silerse DANIŞANLAR da kilitlenirdi; `aal2`
  --     dalını silerse kapı ANLAMSIZ kalırdı. İkisi de sessizce olamaz.
  if exists (
    select 1 from pg_policies p
     where p.schemaname = 'public'
       and p.policyname = 'mfa_aal2_gate'
       and (p.qual not like '%is_coach%' or p.qual not like '%aal2%')
  ) then
    raise exception 'DOGRULAMA BASARISIZ: politika ifadesi beklenen iki dali (is_coach / aal2) TASIMIYOR.';
  end if;

  -- (c) SÜRÜKLENME KAPISI: "danışan verisi taşıyan tablolar" kümesi, public
  --     şemasındaki tablolardan katalog (2) + denetim/damga (2) çıkarılarak
  --     türetilir. Yarın 15. bir danışan tablosu eklenip bu listeye
  --     yazılmazsa burası GÜRÜLTÜLÜ patlar — sessizce korumasız kalmaz.
  select string_agg(t.tablename, ', ' order by t.tablename) into v_extra
    from pg_tables t
   where t.schemaname = 'public'
     and t.tablename <> all (v_expected)
     and t.tablename <> all (array[
       'exercises',                          -- katalog
       'food_database',                      -- katalog
       'account_deletions',                  -- denetim (ADR-0025 §6, sifir politika)
       'message_attachment_verifications'    -- damga (B-028, sifir politika)
     ]);

  if v_extra is not null then
    raise exception 'DOGRULAMA BASARISIZ: aal2 kapisi DISINDA kalan public tablo(lar) var -> % . Danisan verisi tasiyorsa listeye ekleyin, tasimiyorsa muafiyet listesine.', v_extra;
  end if;

  select string_agg(e, ', ' order by e) into v_missing
    from unnest(v_expected) as e
   where to_regclass(format('public.%I', e)) is null;

  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ: listede olup semada olmayan tablo(lar): %', v_missing;
  end if;

  raise notice 'DOGRULAMA GECTI: 14/14 mfa_aal2_gate politikasi RESTRICTIVE+ALL+authenticated, surukleme yok.';
end
$$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: geri alma koç hesabındaki ikinci faktör zorunluluğunu TAMAMEN kaldırır.
-- O andan itibaren koçun parolasını ele geçiren biri — ikinci faktör olmadan —
-- TÜM danışanların ölçümlerine, vücut fotoğraflarına, yazışmalarına ve
-- planlarına erişir. Arayüzdeki yönlendirme bunu ENGELLEMEZ (istemci kapısıdır,
-- `fetch` ile atlanır; bkz. ADR-0026 §Karar 1).
--
-- begin;
--   do $$
--   declare
--     r record;
--   begin
--     for r in
--       select tablename from pg_policies
--        where schemaname = 'public' and policyname = 'mfa_aal2_gate'
--     loop
--       execute format('drop policy if exists mfa_aal2_gate on public.%I', r.tablename);
--     end loop;
--   end $$;
-- commit;
-- =============================================================================
