-- =============================================================================
-- 20260820140000_coach_activity_summary.sql
--
-- FAZ 4.8 / DİLİM 3c — KOÇUN ETKİNLİK ÖZETİ SQL TARAFINA TAŞINIYOR
--   Plan: active_planprogram.md §7c
--   Emsal: 20260820090000_activity_log.sql (dilim 1 — tablolar/RLS/aal2 kapısı),
--          20260818090000_form_check_weight_to_progress.sql (§1 —
--          `form_check_entry_date()`: timestamptz -> YEREL GÜN çevrimi),
--          20260819130000_coach_action_audit.sql (dosya üslubu, doğrulama bloğu)
--
-- #############################################################################
-- ## NEDEN BU MIGRATION VAR — ÖLÇÜLMÜŞ SORUN                                 ##
-- #############################################################################
--
--   Dilim 3b koç görünümünü yaptı ama toplamayı İSTEMCİDE yaptı:
--   `useActivityLog.ts` koç için ham `activity_sessions` / `activity_events`
--   satırlarını çekiyor, tarayıcıda gün bazına yuvarlıyordu. §7c'nin kuralı
--   "koça saat/dakika damgası GÖSTERİLMEZ" — ama ham satırlar zaten koçun
--   TARAYICISINA İNDİĞİ için bu sınır yalnızca ARAYÜZ NEZAKETİ oluyordu:
--   geliştirici konsolunu (ya da ağ sekmesini) açan koç danışanın tam
--   saatlerini görebiliyordu. Dilim 3b bunu kısıt olarak dürüstçe rapor etti
--   (o turda `supabase/**` başka bir ajandaydı).
--
--   MAHREMİYET SINIRI VERİ KATMANINDA DURMALI: koçun sorgusu ham zaman damgası
--   DÖNDÜRMEMELİ. Bu dosya o sınırı kurar.
--
--   NOT — bu bir RLS SIKILAŞTIRMASI DEĞİLDİR: `activity_*_select` politikaları
--   koçun ham satır okumasına hâlâ İZİN VERİR (dilim 1 KARAR 3, DEĞİŞTİRİLMEDİ;
--   salt-eklemeli repo kuralı). Değişen şey UYGULAMANIN OKUMA YOLUDUR: koç
--   arayüzü artık ham tabloya HİÇ gitmez, yalnızca bu fonksiyonu çağırır ve bu
--   fonksiyon gün hassasiyetinden DAHA İNCE bir şey DÖNDÜREMEZ (`date`
--   kolonunun taşıyabileceği bir saat yoktur). Sızıntı yüzeyi "RLS'in izin
--   verdiği her şey" boyutundan "üç kolonluk bir gün satırı" boyutuna iner.
--
-- Idempotenttir: tek bir `create or replace function`. İkinci koşu FARK
-- ÜRETMEZ. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## KARAR 1 — `SECURITY INVOKER` (PAZARLIK KONUSU DEĞİL)                    ##
-- #############################################################################
--
--   Fonksiyon ÇAĞIRANIN kimliğiyle koşar. Sonuç:
--     * `activity_sessions_select` / `activity_events_select` politikaları
--       AYNEN uygulanır (koç tümünü, danışan yalnızca kendisini görür),
--     * `mfa_aal2_gate` RESTRICTIVE politikası AYNEN uygulanır -> aal1'deki
--       koç bu fonksiyondan da BOŞ küme alır.
--
--   `SECURITY DEFINER` yapmak, sahibinin (`postgres`, `rolbypassrls`)
--   haklarıyla koşmak demekti: aal2 kapısı ATLANIRDI ve yalnızca parolasını
--   bilen (ikinci faktörü olmayan) bir koç tüm danışanların davranış özetini
--   okurdu. ADR-0026'nın koruduğu sınıf TAM OLARAK BUDUR. Gün hassasiyetine
--   yuvarlanmış olması bunu telafi ETMEZ: "hangi gün ne kadar çevrimiçiydi"
--   yine davranış verisidir.
--
--   Bu iddia varsayım değildir: aşağıdaki doğrulama bloğu `prosecdef = false`
--   olduğunu ÖLÇER ve `rls.test.sql` senaryo 144 aynı şeyi hem katalogdan hem
--   DAVRANIŞTAN (aal1 koç 0 satır) doğrular.
--
-- #############################################################################
-- ## KARAR 2 — DÖNÜŞ BİÇİMİ: `table(day date, total_seconds integer,         ##
-- ##            event_counts jsonb)` — düz `jsonb` DEĞİL                     ##
-- #############################################################################
--
--   Değerlendirilen alternatif: tek bir `jsonb` döndürmek (günler dizisi).
--   REDDEDİLDİ: `supabase gen types` bir `returns jsonb` fonksiyonunu `Returns:
--   Json` olarak yazar — yani istemci tarafında TİP YOKTUR ve her alan `any`
--   gibi davranır. `returns table(...)` ise satır tipini ÜRETİR
--   (`{ day: string; total_seconds: number; event_counts: Json }[]`), böylece
--   §7c'nin mahremiyet sınırı DERLEME ZAMANINDA da görünür: dönen satırda
--   `started_at` / `occurred_at` / `last_seen_at` adında bir alan YOKTUR ve
--   olmadığı TİPTEN okunur.
--
--   `event_counts` NEDEN yine de `jsonb`: olay türü KAPALI ama GENİŞLEYEBİLİR
--   bir listedir (`activity_events_event_chk`, bugün 7 değer). Her tür için
--   ayrı bir kolon (`tab_view_count`, `login_count`, …) açmak, listeye bir
--   değer eklendiği gün fonksiyonun İMZASINI değiştirmeyi (yani `drop
--   function` + tüm çağıranları güncellemeyi) zorunlu kılardı. Anahtarı olay
--   türü, değeri sayı olan bir jsonb nesnesi bu esnekliği verir ve istemci
--   tarafındaki `Partial<Record<ActivityEventType, number>>` ile BİREBİR
--   örtüşür. GÜN ve SÜRE — yani mahremiyet açısından KRİTİK iki alan —
--   `date`/`integer` olarak SIKI TİPLİ kalır; esneklik yalnızca sayaçlardadır.
--
--   `day` NEDEN `date` (metin değil): `date` tipinin taşıyabileceği bir saat
--   YOKTUR. Yuvarlama "unutulabilecek bir biçimlendirme adımı" olmaktan çıkıp
--   TİP SİSTEMİNİN garantisi olur.
--
-- #############################################################################
-- ## KARAR 3 — GÜN YUVARLAMA: `at time zone 'Europe/Istanbul'`               ##
-- #############################################################################
--
--   `20260818090000` §1 (`form_check_entry_date()`) ile AYNI çevrim:
--
--       (p_ts at time zone 'Europe/Istanbul')::date
--
--   Düz `::date` KULLANILMAZ: o, OTURUMUN `TimeZone` ayarını okur ve
--   PostgREST/psql bağlantıları UTC'dir -> Türkiye saatiyle 00:00-03:00 arası
--   olan HER etkinlik BİR ÖNCEKİ güne düşerdi. Repoda bu hata bir kez YANDI
--   (d744eee, "gece yarısı tarih kayması"); istemci tarafındaki karşılığı
--   `packages/api-client/src/date.ts`teki `todayIsoDate()`tir ve o da
--   `toISOString()` KULLANMAMA disiplinini aynı gerekçeyle taşır. Dilim 3b'nin
--   istemci toplaması da (`localDateOf`, yerel alanlar) aynı günü üretiyordu;
--   bu fonksiyon o davranışı DEĞİŞTİRMEZ, yalnızca SUNUCUYA taşır.
--
--   `form_check_entry_date(timestamptz)` DOĞRUDAN ÇAĞRILMADI: o fonksiyon
--   `STABLE` bir skalerdir ve satır başına bir fonksiyon çağrısı demektir;
--   burada ifade doğrudan yazıldı (aynı çevrim, aynı sonuç) ki gruplama
--   ifadesi planlayıcı için saydam kalsın. Çevrimin İKİ AYRI ANLAMI yoktur —
--   ikisi de `Europe/Istanbul`dur; biri değişirse diğeri de değişmelidir.
--
--   KISIT (açıkça kabul ediliyor, `form_check_entry_date` ile AYNI): TÜM
--   kullanıcıların Türkiye saatinde olduğu VARSAYIMIDIR. `profiles`ta saat
--   dilimi kolonu YOKTUR; uydurmak var olmayan bir veriye dayanmak olurdu.
--   Ürün başka saat dilimlerine açılırsa bu iki fonksiyon BİRLİKTE ele alınır.
--
-- #############################################################################
-- ## KARAR 4 — RIZA KAPALIYSA: BOŞ KÜME, HATA DEĞİL                          ##
-- #############################################################################
--
--   Rıza 'granted' değilse (`undecided` / `revoked` / profil görünmüyor ->
--   NULL) fonksiyon HİÇ SATIR DÖNDÜRMEZ ve HATA DA FIRLATMAZ.
--
--   NEDEN HATA DEĞİL: koç rıza durumunu ZATEN ayrı bir kaynaktan görüyor
--   (`activity_consent_state()`, `CoachActivitySummary.tsx`teki üç ayrı rozet
--   dalı). Buradan 42501 fırlatmak arayüze GERÇEK bir bilgi eklemez ama
--   maliyeti vardır: react-query'de `isError` dalı tetiklenir ve bileşen
--   "rıza kapalı" (normal, beklenen durum) ile "özet okunamadı" (gerçek arıza)
--   ayrımını YAPAMAZ HÂLE gelir — ikisi de kırmızı bir kutu olurdu. Rıza
--   kapalı olması bir ARIZA DEĞİLDİR.
--
--   NEDEN YİNE DE KONTROL EDİLİYOR (yani "zaten satır yok" demek yetmiyor):
--   `revoke_activity_consent()` geri çekmede satırları SİLDİĞİ ve
--   `record_activity()` rıza yokken YAZMADIĞI için pratikte küme zaten boştur.
--   Bu kontrol o iki garantiye BAĞIMLI OLMAMAK içindir: bir gün bir yol
--   (elle veri taşıma, kısmi geri alma, yeni bir yazıcı) rıza penceresi
--   dışında satır bırakırsa, koç özeti onu GÖSTERMEZ. Fail-closed.
--
--   `activity_consent_state()` de SECURITY INVOKER'dır: aal1'deki koç için
--   `profiles` üzerindeki aal2 kapısı NULL döndürür -> yine boş küme. Yani
--   kapı burada İKİ KEZ kapanır (rıza dalı + tabloların kendi RLS'i).
-- #############################################################################
create or replace function public.coach_activity_summary(
  p_client_id uuid,
  p_days      integer default 30
)
returns table (
  day           date,
  total_seconds integer,
  event_counts  jsonb
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_days integer := coalesce(p_days, 30);
  v_from date;
begin
  if p_client_id is null then
    raise exception 'coach_activity_summary: p_client_id zorunludur.' using errcode = '22023';
  end if;

  -- `p_days = 0` bir "tüm geçmiş" kısayolu DEĞİLDİR (aynı disiplin:
  -- `purge_expired_activity(0)` da 22023 ile reddedilir). Üst sınır konmadı:
  -- gerçek tavan 180 günlük SAKLAMA politikasıdır — daha eski satır zaten yoktur.
  if v_days < 1 then
    raise exception 'coach_activity_summary: p_days >= 1 olmalidir (gelen: %).', p_days
      using errcode = '22023';
  end if;

  -- Pencere BUGÜNÜ DE İÇERİR: p_days = 30 -> bugün dahil son 30 YEREL gün.
  v_from := (now() at time zone 'Europe/Istanbul')::date - (v_days - 1);

  -- KARAR 4 — rıza kapısı. `is distinct from` NULL'ı da yakalar.
  if public.activity_consent_state(p_client_id) is distinct from 'granted' then
    return;
  end if;

  -- ###########################################################################
  -- # TOPLAMA — ham zaman damgası bu bloğun DIŞINA ÇIKMAZ                     #
  -- #                                                                         #
  -- # Oturum, BAŞLADIĞI güne yazılır (dilim 3b'nin istemci toplamasıyla aynı  #
  -- # semantik). Gece yarısını AŞAN bir oturum ikiye BÖLÜNMEZ — 30 dakikalık  #
  -- # hareketsizlik kapısı (`record_activity` §4c) böyle oturumları zaten     #
  -- # nadir kılar ve bölmek, süreyi gerçekte ölçülmediği bir güne dağıtmak    #
  -- # olurdu. Ama o oturumun SON GÖRÜLDÜĞÜ gün yine de `buckets`a girer       #
  -- # (0 saniyeyle): "o gün çevrimiçiydi" gerçeği kaybolmasın diye — istemci  #
  -- # toplaması da `lastActiveDate` için aynısını yapıyordu.                  #
  -- ###########################################################################
  return query
  with sess as (
    select (s.started_at   at time zone 'Europe/Istanbul')::date as start_day,
           (s.last_seen_at at time zone 'Europe/Istanbul')::date as end_day,
           -- CHECK zaten `last_seen_at >= started_at` garanti eder; `greatest`
           -- savunmacıdır (negatif süre bir gün sızarsa toplamı BOZMAZ).
           greatest(0, round(extract(epoch from (s.last_seen_at - s.started_at))))::integer as secs
      from public.activity_sessions s
     where s.user_id = p_client_id
  ),
  evt as (
    select (e.occurred_at at time zone 'Europe/Istanbul')::date as evt_day,
           e.event                                              as evt_name
      from public.activity_events e
     where e.user_id = p_client_id
  ),
  day_secs as (
    select x.start_day as bucket, sum(x.secs)::integer as secs
      from sess x
     group by x.start_day
  ),
  day_counts as (
    select t.evt_day as bucket, jsonb_object_agg(t.evt_name, t.n) as counts
      from (
        select y.evt_day, y.evt_name, count(*)::integer as n
          from evt y
         group by y.evt_day, y.evt_name
      ) t
     group by t.evt_day
  ),
  buckets as (
    select x.start_day as bucket from sess x
    union
    select x.end_day   as bucket from sess x
    union
    select y.evt_day   as bucket from evt y
  )
  select b.bucket,
         coalesce(ds.secs,   0)::integer,
         coalesce(dc.counts, '{}'::jsonb)
    from buckets b
    left join day_secs   ds on ds.bucket = b.bucket
    left join day_counts dc on dc.bucket = b.bucket
   where b.bucket >= v_from
   order by b.bucket desc;
end;
$$;

comment on function public.coach_activity_summary(uuid, integer) is
  'Faz 4.8 (§7c) KOC gorunumunun TEK okuma yolu: bir danisanin son p_days (varsayilan 30) YEREL gununu (Europe/Istanbul) gun bazinda toplar -> (day date, total_seconds integer, event_counts jsonb). HAM ZAMAN DAMGASI DONDURMEZ (started_at / last_seen_at / occurred_at bu kumede YOKTUR) — mahremiyet siniri arayuzde degil VERI KATMANINDA durur. SECURITY INVOKER: RLS ve mfa_aal2_gate cagiranin kimligiyle uygulanir, aal1 koc BOS kume alir. Riza granted degilse HATA DEGIL BOS kume doner (koc durumu zaten activity_consent_state rozetinden gorur). EXECUTE yalnizca authenticated.';

--    ##########################################################################
--    # YETKİ — `authenticated` YETER, `service_role` GEREKMEZ                  #
--    # Fonksiyon KOÇUN KENDİ token'ıyla (PostgREST `rpc/`) çağrılır. Sunucu    #
--    # yolunun bu özete ihtiyacı YOKTUR ve `service_role`e vermek, INVOKER bir #
--    # fonksiyonu RLS'i olmayan bir rolle çalıştırılabilir kılardı — yani      #
--    # KARAR 1'in kapattığı kapıyı ikinci bir kapıdan açardı.                  #
--    ##########################################################################
revoke all     on function public.coach_activity_summary(uuid, integer) from public;
revoke all     on function public.coach_activity_summary(uuid, integer) from anon;
revoke all     on function public.coach_activity_summary(uuid, integer) from service_role;
grant  execute on function public.coach_activity_summary(uuid, integer) to authenticated;


-- #############################################################################
-- ## MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK                ##
-- #############################################################################
do $$
declare
  c_sig    constant text := 'public.coach_activity_summary(uuid, integer)';
  v_secdef boolean;
  v_config text[];
  v_result text;
  v_cnt    integer;
begin
  -- (a) Fonksiyon VAR mı.
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p where p.oid = c_sig::regprocedure;
  if v_secdef is null then
    raise exception 'DOGRULAMA BASARISIZ: % olusmadi.', c_sig;
  end if;

  -- (b) *** KARAR 1'İN KANITI *** — prosecdef = false (SECURITY INVOKER).
  if v_secdef then
    raise exception 'DOGRULAMA BASARISIZ: % SECURITY DEFINER olmus (prosecdef=true) -- aal2 kapisi ATLANIR, aal1 koc tum danisanlarin davranis ozetini okur (ADR-0026).', c_sig;
  end if;

  -- (c) `search_path` pinli.
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'DOGRULAMA BASARISIZ: % arama yolu pinlenmemis (%).', c_sig, v_config;
  end if;

  -- (d) EXECUTE yalnizca authenticated.
  if not has_function_privilege('authenticated', c_sig, 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: authenticated % yi CALISTIRAMIYOR -- koc gorunumu kirilir.', c_sig;
  end if;
  if has_function_privilege('anon', c_sig, 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: % ANON rolune ACIK.', c_sig;
  end if;
  if has_function_privilege('service_role', c_sig, 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: % service_role a ACIK -- INVOKER fonksiyon RLS siz bir rolle calistirilabilir hale gelmis.', c_sig;
  end if;

  -- (e) *** SÖZLEŞMENİN ASIL MADDESİ *** — dönüş kümesinde HAM ZAMAN DAMGASI
  --     TAŞIYAN BİR KOLON OLAMAZ. Kolon adları VE tipleri birlikte ölçülür:
  --     bir gün biri `day`i `timestamptz` yapsa ad denetimi bunu kaçırırdı.
  v_result := pg_get_function_result(c_sig::regprocedure);

  if v_result is distinct from 'TABLE(day date, total_seconds integer, event_counts jsonb)' then
    raise exception 'DOGRULAMA BASARISIZ: % donus sozlesmesi beklenenden farkli -> %. (Ham zaman damgasi tasiyan bir kolon eklenmis ya da `day` timestamptz e donusmus olabilir -- date tipinin tasiyabilecegi saat YOKTUR.)', c_sig, v_result;
  end if;

  -- (f) CANLI ÇAĞRI: rızası olmayan (var olmayan) bir kullanıcı için BOŞ küme
  --     ve HATA YOK (KARAR 4). Varsayılmaz, ÖLÇÜLÜR.
  select count(*) into v_cnt from public.coach_activity_summary(gen_random_uuid());
  if v_cnt <> 0 then
    raise exception 'DOGRULAMA BASARISIZ: rizasi olmayan kullanici icin % satir dondu (0 bekleniyordu).', v_cnt;
  end if;

  -- (g) `p_days` alt sınırı: 0 reddedilmeli.
  begin
    perform * from public.coach_activity_summary(gen_random_uuid(), 0);
    raise exception 'DOGRULAMA BASARISIZ: p_days = 0 KABUL EDILDI.';
  exception when invalid_parameter_value then
    null;
  end;

  -- (h) Ön koşul: dayandığı iki şey hâlâ yerinde mi.
  if to_regprocedure('public.activity_consent_state(uuid)') is null then
    raise exception 'ON KOSUL BASARISIZ: public.activity_consent_state(uuid) YOK -- riza kapisi kurulamaz.';
  end if;
  select count(*) into v_cnt from pg_policies
   where schemaname = 'public'
     and tablename in ('activity_sessions', 'activity_events')
     and policyname = 'mfa_aal2_gate';
  if v_cnt <> 2 then
    raise exception 'ON KOSUL BASARISIZ: activity_* tablolarinda mfa_aal2_gate EKSIK (bulunan %/2) -- INVOKER fonksiyonun dayandigi kapi yok.', v_cnt;
  end if;

  raise notice 'Faz 4.8 dilim 3c kuruldu: coach_activity_summary(uuid, integer) SECURITY INVOKER (prosecdef=false), donus (day date, total_seconds integer, event_counts jsonb), gun cevrimi Europe/Istanbul, riza kapali -> BOS kume, EXECUTE yalnizca authenticated.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `packages/api-client/src/hooks/useActivityLog.ts` içindeki
-- -- `useCoachActivitySummary` bu RPC'yi çağırır; fonksiyon düşürülürse koç
-- -- görünümü PGRST202 ile kırılır. Geri alıyorsanız o hook'u da dilim 3b'deki
-- -- (istemci tarafı toplama yapan) hâline döndürün — aksi hâlde koç panelinde
-- -- "Etkinlik özeti okunamadı" kalıcı olur.
-- --
-- -- Bu dosya HİÇBİR tablo/politika/yetki değiştirmez; geri alma VERİ KAYBI
-- -- ÜRETMEZ, yalnızca okuma yolunu kaldırır.
-- =============================================================================
--
-- begin;
--
-- drop function if exists public.coach_activity_summary(uuid, integer);
--
-- commit;
--
-- =============================================================================
