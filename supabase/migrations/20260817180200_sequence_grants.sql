-- =============================================================================
-- 20260817180200_sequence_grants.sql
--
-- FAZ 1.7 — Faz 1.5 Grup 5'in AÇIKÇA KAPSAM DIŞI BIRAKILAN KALAN BORCU:
--   SEQUENCE'LERDE `authenticated` ROLÜNÜN `UPDATE` (setval) YETKİSİ.
--
-- BORÇ KAYDI (20260817170000_force_rls_and_grants.sql §1, satır 99-101):
--   "Kapsam dışı (bilinçli): sequence'lerdeki `authenticated=w` (UPDATE)
--    varsayılanı. AC-03 tablo yetkileriyle ilgilidir; sequence UPDATE bir RLS
--    baypası değil, yalnızca `setval` yüzeyidir. Ayrı bir tur işidir."
--   Bu migration O TURDUR.
--
-- ÖLÇÜLEN DURUM (düzeltmeden ÖNCE, canlı):
--   select relname, relacl from pg_class where relkind='S' and ...'public';
--     exercises_id_seq     | {postgres=rwU/postgres, authenticated=rwU/postgres, ...}
--     food_database_id_seq | {postgres=rwU/postgres, authenticated=rwU/postgres, ...}
--                                                                  ^ w = UPDATE
--
--   `w` NEREDEN GELİYOR: `20260816090200_rls_policies.sql` §grant AÇIKÇA yalnızca
--   `usage, select` verir (`grant usage, select on all sequences ... to
--   authenticated`). `w`, tablolardaki D/x/t ile AYNI KÖKTEN gelir: sequence'ler
--   o migration'dan ÖNCE (`20260816090000_initial_schema.sql`) yaratıldığı için
--   Supabase'in platform VARSAYILAN YETKİLERİNİ miras aldılar.
--
-- ZARARI (dürüstçe: küçük):
--   RLS baypası DEĞİLDİR — `setval` satır okumaz/yazmaz. En-az-yetki ihlalidir:
--   `authenticated` rolündeki herhangi biri `select setval('public.exercises_id_seq', 1)`
--   ile sayacı geri alabilir; sonraki katalog INSERT'leri `exercises_name_key`
--   (unique) veya birincil anahtar çakışmasıyla düşer -> katalog yönetimi için
--   sessiz bir DoS. `exercises`/`food_database` yazma politikaları koça kilitli
--   olduğu için doğrudan veri bozulmaz.
--
-- ÇÖZÜM — `REVOKE ALL` **DEĞİL**, cerrahi ayrım:
--   * `USAGE`  KALIR  -> `nextval()` bunu ister; alınırsa TÜM INSERT'ler kırılır.
--   * `SELECT` KALIR  -> `currval()`/`lastval()`; zararsız, mevcut grant'ın parçası.
--   * `UPDATE` GİDER  -> `setval()` yüzeyi kapanır.
--
-- Idempotenttir (revoke/grant tekrar çalıştırılabilir).
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) MEVCUT sequence'ler                                                  ##
-- #############################################################################
revoke update on all sequences in schema public from authenticated;
revoke update on all sequences in schema public from anon;   -- zaten yetkisiz; idempotentlik için


-- #############################################################################
-- ## 2) GELECEKTEKİ sequence'ler — ASIL KALICI DÜZELTME                      ##
-- #############################################################################
--
--    ##########################################################################
--    # EVET, GEREKİYOR — AC-03 TURUNDAKİ TUZAĞIN AYNISI                       #
--    #                                                                        #
--    # `20260817170000` §1'de tablolar için öğrenilen ders: sadece MEVCUT      #
--    # nesnelerden REVOKE etmek yetmez, bir sonraki migration'da açılan nesne  #
--    # yetkiyi platform varsayılanından GERİ KAZANIR ve delik sessizce yeniden #
--    # açılır. Sequence'ler için de aynısı geçerlidir.                          #
--    #                                                                        #
--    # ÖLÇÜLEN VARSAYILAN (pg_default_acl, düzeltmeden ÖNCE):                  #
--    #   S | postgres       | {postgres=rwU, authenticated=w, service_role=w}  #
--    #   S | supabase_admin | {postgres=rwU, anon=rwU, authenticated=rwU, ...} #
--    #                                                                        #
--    # `postgres` satırındaki `authenticated=w` TAM OLARAK kapatmak istediğimiz#
--    # yetkidir ve migration'lar `postgres` rolüyle koştuğu için GELECEKTEKİ   #
--    # HER sequence onu alırdı.                                               #
--    #                                                                        #
--    # NEDEN SADECE REVOKE DEĞİL, ARDINDAN `GRANT USAGE, SELECT` DA VAR:      #
--    #   Yalnız revoke edilseydi varsayılan `{postgres=rwU, service_role=w}`   #
--    #   olurdu; yani gelecekte açılan `serial`/`identity` kolonlu bir tabloya #
--    #   `authenticated` INSERT edemezdi (nextval için USAGE yok) ve sebebi    #
--    #   "permission denied for sequence ..." gibi ilgisiz görünen bir hata    #
--    #   olurdu. Tablolarda "gürültülü hata" takası BİLİNÇLİ seçilmişti çünkü  #
--    #   tablo grant'ları zaten her migration'da AÇIKÇA yazılıyor; sequence    #
--    #   grant'ları ise YAZILMIYOR (proje kalıbı `grant usage, select on all   #
--    #   sequences` ile toplu veriyor). Bu yüzden burada doğru davranış        #
--    #   varsayılanı KAPATMAK değil, DOĞRU DEĞERE SABİTLEMEKTİR: rU.           #
--    #   Sonuç: gelecekteki sequence'ler `usage, select` alır, `update` ALMAZ. #
--    ##########################################################################
alter default privileges in schema public revoke update on sequences from authenticated;
alter default privileges in schema public revoke update on sequences from anon;

--   `anon`'a HİÇBİR ŞEY verilmez: `20260816090200` §1 anon'u tamamen kilitler ve
--   `alter default privileges ... revoke all on sequences from anon` zaten
--   uygulanmıştır. Yalnızca `authenticated` için doğru varsayılan sabitlenir.
alter default privileges in schema public grant usage, select on sequences to authenticated;

--    ##########################################################################
--    # KALAN (KAPATILAMAYAN) BOŞLUK — tablolardakiyle AYNI, dürüstçe kayıtta  #
--    #                                                                        #
--    # `pg_default_acl`'deki `supabase_admin` satırı sequence'ler için de      #
--    # `anon=rwU, authenticated=rwU` verir ve bu migration'dan DEĞİŞTİRİLEMEZ #
--    # ("must be member of role supabase_admin", 42501). Yani `public`         #
--    # şemasına `supabase_admin` ile kurulan bir EKLENTİ sequence yaratırsa o  #
--    # sequence bu korumanın dışında kalır.                                    #
--    #                                                                        #
--    # Uygulamanın her iki sequence'i de `postgres` sahipliğindedir. Yeni bir  #
--    # istisna ORTAYA ÇIKARSA `supabase/tests/rls.test.sql` senaryo 84         #
--    # sequence listesini `pg_class`'tan DİNAMİK okuduğu için test KIRILIR ve  #
--    # durum görünür olur — sessiz kalmaz.                                     #
--    ##########################################################################


-- #############################################################################
-- ## 3) MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK             ##
-- #############################################################################
--    ##########################################################################
--    # `as materialized` NEDEN ZORUNLU — GERÇEK BİR HATA OLARAK YAŞANDI       #
--    #                                                                        #
--    # İlk yazımda filtre ve yetki kontrolü TEK sorgudaydı:                   #
--    #   ... where n.nspname='public' and c.relkind='S'                       #
--    #       and has_sequence_privilege(g.role_name, c.oid, 'UPDATE')          #
--    # `db reset` bunu şu hatayla PATLATTI:                                    #
--    #   ERROR: "pg_toast_16488" is not a sequence (SQLSTATE 42809)            #
--    # Sebep: WHERE yan tümcesindeki koşulların değerlendirme SIRASI garanti   #
--    # DEĞİLDİR; planlayıcı `has_sequence_privilege()`'i `relkind` filtresinden#
--    # ÖNCE çalıştırdı ve fonksiyon bir TOAST tablosunun OID'ini alınca hata   #
--    # fırlattı. Çözüm, filtreyi bir OPTİMİZASYON ÇİTİ arkasına almaktır:      #
--    # `as materialized` CTE ayrı değerlendirilir, yetki fonksiyonu YALNIZCA   #
--    # gerçek sequence OID'lerini görür. Aynı düzeltme rls.test.sql senaryo    #
--    # 84'te de uygulanmıştır.                                                 #
--    ##########################################################################
do $$
declare
  v_bad   text;
  v_miss  text;
  v_seqs  int;
begin
  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select count(*) into v_seqs from seqs;

  if v_seqs < 2 then
    raise exception 'DOGRULAMA BASARISIZ [kurulum]: public semada beklenenden az sequence var (%)', v_seqs;
  end if;

  -- (a) Hiçbir sequence'te authenticated/anon için UPDATE kalmamalı.
  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select string_agg(format('%s/%s', g.role_name, s.relname), ', ' order by s.relname) into v_bad
    from seqs s
    cross join (values ('authenticated'), ('anon')) as g(role_name)
   where has_sequence_privilege(g.role_name, s.oid, 'UPDATE');

  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: setval yetkisi hala acik -> %', v_bad;
  end if;

  -- (b) POZİTİF: USAGE korunmuş olmalı, yoksa INSERT'ler kırılır.
  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select string_agg(s.relname, ', ' order by s.relname) into v_miss
    from seqs s
   where not has_sequence_privilege('authenticated', s.oid, 'USAGE');

  if v_miss is not null then
    raise exception 'DOGRULAMA BASARISIZ: authenticated USAGE kaybetti (INSERT ler kirilir) -> %', v_miss;
  end if;

  raise notice 'Sequence yetkileri: % sequence te authenticated/anon UPDATE=yok, authenticated USAGE=var', v_seqs;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: geri alma `setval` yüzeyini yeniden açar (katalog sayaçları
-- -- oynatılabilir hâle gelir).
-- =============================================================================
--
-- begin;
--   grant update on all sequences in schema public to authenticated;
--   alter default privileges in schema public grant update on sequences to authenticated;
--   -- NOT: `anon` BİLEREK geri verilmez; 20260816090200 §1 anon'u zaten kilitler.
-- commit;
--
-- =============================================================================
