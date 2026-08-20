-- =============================================================================
-- 20260820180000_account_active_state.sql
-- Faz 4.10 — HESAP AKTİF/PASİF DURUMU: koç, danışanlık hizmeti biten danışanı
-- pasifleştirebilir. Pasif danışan sisteme GİRER (KVKK silme hakkı korunur) ama
-- VERİ GÖREMEZ ve yalnızca hesabını silebilir/çıkabilir.
--
-- Karar kaydı: docs/adr/0026-totp-mfa-ve-aal2-kapisi.md (kardeş kapı deseni),
--              Fable kararı (agent talimatı, 2026-08-20)
-- Kanıt      : supabase/tests/rls.test.sql senaryo 149–152
-- Tüketici   : apps/web/src/app/api/coach/set-client-active/route.ts
--
-- #############################################################################
-- ## NEDEN VERİ SEVİYESİNDE ENGEL — AUTH BAN DEĞİL                           ##
-- #############################################################################
--   Değerlendirilen ve REDDEDİLEN alternatif: `auth.users.banned_until` ile
--   GoTrue tarafında giriş engeli. Reddedildi çünkü giriş engellenirse pasif
--   danışan KVKK "unutulma hakkı" (`delete_account` akışı) için sisteme HİÇ
--   ulaşamaz — hesabını silemez. Oysa yasal gereklilik tam tersini ister:
--   pasif danışan giriş YAPABİLMELİ, sadece VERİ görememeli.
--
--   Bu yüzden engel, `mfa_aal2_gate`in (20260819120000) KARDEŞİ olarak SATIR
--   seviyesine yazılır: aynı 16 tabloya ikinci bir RESTRICTIVE politika
--   (`account_active_gate`). `delete_account` yolu `service_role` route'undan
--   geçtiği için RLS'ten ETKİLENMEZ — pasif danışan silme akışına HER ZAMAN
--   ulaşır.
--
-- #############################################################################
-- ## KRİTİK İSTİSNA — PASİF DANIŞAN KENDİ profiles SATIRINI OKUYABİLMELİ     ##
-- #############################################################################
--   Pasif ekranı çizilebilsin diye (`role`/`is_active` okunur) danışan KENDİ
--   `profiles` satırını (`id = auth.uid()`) pasifken bile OKUYABİLİR. Bu tek
--   istisna `profiles` politikasının `using` dalındadır; `with check` dalı bu
--   istisnayı TAŞIMAZ (pasif danışan kendi profilini de YAZAMAZ). Diğer 15
--   tablo hem okuma hem yazmaya kapalıdır.
--
-- #############################################################################
-- ## NEDEN SECURITY DEFINER YARDIMCI (`is_active_user`)                       ##
-- #############################################################################
--   Politika ifadesi "çağıran aktif mi?" sorusunu `profiles.is_active`den
--   okumak zorunda. Ama RLS'in KENDİSİ `profiles`i kısıtlıyor (bu migration
--   dahil): inline bir `(select is_active from profiles where id = auth.uid())`
--   `profiles` üzerindeki politikaların içinden çağrıldığında ÖZYİNELEME/kapı
--   çatışması üretir. Bu yüzden okuma, RLS'i bypass eden bir SECURITY DEFINER
--   yardımcıya taşınır — `is_coach()` ile BİREBİR aynı gerekçe (o da politika
--   içinden RLS'siz okumak için DEFINER'dır, 20260817090000).
--
--   Politika mantığı: `not is_client_row_of_inactive_user()` yerine olumlu
--   biçimde `is_active_user()` yazılır (çağıran aktifse geç). Koç HER ZAMAN
--   aktiftir (tek-koçluk, `is_active` default true) -> gate koçu ETKİLEMEZ.
--   Pasif danışan -> `is_active_user()` false -> 15 tablo kapalı, profiles'ta
--   yalnızca kendi satırı okunur.
--
-- #############################################################################
-- ## GERİ ALINABİLİRLİK / IDEMPOTANSLIK                                       ##
-- #############################################################################
--   Salt EKLEMELİDİR: 1 kolon (is_active), 1 DEFINER yardımcı, 16 RESTRICTIVE
--   politika, 1 RPC; `coach_actions` CHECK'i genişletilir; guard fonksiyonu
--   `is_active`i de kapsayacak şekilde CREATE OR REPLACE edilir. İkinci koşu
--   fark üretmez (`add column if not exists`, `drop policy if exists`,
--   `create or replace`, `drop/add constraint`). DOWN bloğu dosyanın sonunda.
-- =============================================================================


-- #############################################################################
-- ## 0) ÖN KOŞUL — üzerine inşa ettiğimiz şey GERÇEKTEN yerinde mi?          ##
-- #############################################################################
do $precond$
declare
  v_secdef boolean;
begin
  -- (a) is_coach() DEFINER olmalı: account_active_gate'in `profiles` üzerindeki
  --     kolu, mfa_aal2_gate gibi, is_coach()'un RLS'ten muaf DOĞRU cevabına
  --     dayanmıyor — ama is_active_user() de AYNI DEFINER disiplininde yazılıyor
  --     ve bu ön koşul o disiplinin hâlâ geçerli olduğunu (biri INVOKER'a
  --     çevirmediğini) doğrular.
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_coach';
  if v_secdef is null then
    raise exception 'ON KOSUL BASARISIZ: public.is_coach() YOK.';
  end if;
  if not v_secdef then
    raise exception 'ON KOSUL BASARISIZ: public.is_coach() SECURITY INVOKER.';
  end if;

  -- (b) is_end_user_write() — is_active guard'ının dayanağı (20260817160200).
  if to_regprocedure('public.is_end_user_write()') is null then
    raise exception 'ON KOSUL BASARISIZ: public.is_end_user_write() YOK -- 20260817160200 uygulanmamis.';
  end if;

  -- (c) coach_actions + record_coach_action — denetim yolu (20260819130000).
  if to_regclass('public.coach_actions') is null then
    raise exception 'ON KOSUL BASARISIZ: public.coach_actions YOK -- 20260819130000 uygulanmamis.';
  end if;
  if to_regprocedure('public.record_coach_action(text, uuid, uuid, uuid)') is null then
    raise exception 'ON KOSUL BASARISIZ: public.record_coach_action YOK.';
  end if;

  -- (d) mfa_aal2_gate zaten 16 tabloda kurulu olmalı: is_active gate AYNI 16'yı
  --     kapsayacak, o yüzden kardeşi burada olmalı.
  if (select count(*) from pg_policies
       where schemaname = 'public' and policyname = 'mfa_aal2_gate') <> 16 then
    raise exception 'ON KOSUL BASARISIZ: mfa_aal2_gate 16 tabloda degil -- is_active gate ayni 16 yi kapsayamaz.';
  end if;

  raise notice 'On kosul GECTI.';
end
$precond$;


-- #############################################################################
-- ## 1) profiles.is_active — hesap aktiflik bayrağı                          ##
-- #############################################################################
--   NOT NULL default true: mevcut TÜM satırlar (koç + danışanlar) aktif başlar.
--   Son-kullanıcı yazımına KAPALIDIR (§4 guard) — yalnızca RPC/service_role
--   yazar. Koçun `is_active`i de default true ve hiçbir yol onu false yapmaz
--   (RPC yalnızca `role='client'` hedefi kabul eder) -> koç asla pasifleşemez.
alter table public.profiles add column if not exists is_active boolean not null default true;

comment on column public.profiles.is_active is
  'Hesap aktif mi? false = KOÇLUK HIZMETI SONA ERMIS pasif danisan: sisteme girer (KVKK silme hakki icin) ama account_active_gate ile 15 tablonun HICBIRINI okuyamaz/yazamaz; yalnizca KENDI profiles satirini okur (pasif ekran) ve hesabini silebilir/cikabilir. Son-kullanici YAZAMAZ (profiles_guard_server_columns) -- tek yazici set_client_active_state RPC si (service_role). Koc icin HER ZAMAN true (RPC yalnizca role=client hedef alir).';


-- #############################################################################
-- ## 2) is_active_user() — RLS'siz okuma yardımcısı (DEFINER)                ##
-- #############################################################################
--   Politika içinden `profiles.is_active` okumak için TEK güvenli yol.
--   SECURITY DEFINER + pinli search_path (is_coach ile aynı disiplin). Profil
--   yoksa (yarış/henüz oluşmamış) `true` döner: kolon NOT NULL default true'dur
--   ve "bilmiyorsam engelleme" tercihi mfa gate'in fail-closed'unun TERSİDİR —
--   burada fail-OPEN bilinçlidir: is_active bir KOÇ EYLEMİdir, kimlik/rol
--   doğrulaması değil; bilinmeyen durumda kullanıcıyı yanlışlıkla KİLİTLEMEK,
--   yeni bir kullanıcının kendi verisini görememesi gibi bir REGRESYON üretirdi.
create or replace function public.is_active_user(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_active from public.profiles p where p.id = uid),
    true
  );
$$;

comment on function public.is_active_user(uuid) is
  'Cagiran (veya verilen uid) AKTIF bir hesap mi? account_active_gate politikalari bunu kullanir. SECURITY DEFINER: profiles i RLS siz okur (politika ozyinelemesini onler, is_coach ile ayni gerekce). Profil yoksa true (fail-open: is_active koc eylemidir, kimlik dogrulamasi degil). SECURITY INVOKER a cevrilirse profiles politikasi kendi kendini tetikler.';

revoke all     on function public.is_active_user(uuid) from public;
grant  execute on function public.is_active_user(uuid) to authenticated, service_role;


-- #############################################################################
-- ## 3) 16 tabloya account_active_gate RESTRICTIVE politikası                ##
-- #############################################################################
--   mfa_aal2_gate (20260819120000 §2) deseni BİREBİR: aynı 16 tablo, aynı
--   `array[...]` + `foreach ... loop`, `as restrictive for all to authenticated`.
--   TEK FARK: `profiles` tablosunda `using` dalı, pasif danışanın KENDİ satırını
--   okuyabilmesi için `or id = (select auth.uid())` istisnasını taşır; `with
--   check` dalı bu istisnayı TAŞIMAZ (pasif danışan kendi profilini de yazamaz).
do $$
declare
  -- mfa_aal2_gate'in 16 tablosuyla BİREBİR aynı küme (ölçülmüş gerçek).
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
    'progress_photos',
    'activity_sessions',
    'activity_events'
  ];
  v_table text;
  v_using text;
  v_check text;
  v_count int := 0;
begin
  if array_length(v_tables, 1) <> 16 then
    raise exception 'TABLO LISTESI BOZUK: 16 bekleniyordu, % var.', array_length(v_tables, 1);
  end if;

  foreach v_table in array v_tables loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'TABLO YOK: public.% -- liste sema ile ayrismis.', v_table;
    end if;

    execute format('drop policy if exists account_active_gate on public.%I', v_table);

    -- ####################################################################
    -- # POLİTİKANIN HER PARÇASI mfa_aal2_gate İLE AYNI KARARI TAŞIR       #
    -- #  as restrictive : PERMISSIVE olsaydı VEYA'lanır, etkisiz kalırdı. #
    -- #  for all        : select/insert/update/delete DÖRDÜ.              #
    -- #  to authenticated: service_role/postgres zaten rolbypassrls.      #
    -- #  (select ...)    : ifadeyi satır BAŞINA değil sorgu başına BİR    #
    -- #                    KEZ koşan initplan'a çevirir.                  #
    -- # profiles İSTİSNASI: `using`e `or id = auth.uid()` -> pasif        #
    -- #  danışan KENDİ satırını okur (pasif ekran). `with check` bunu     #
    -- #  taşımaz -> kendi profilini YAZAMAZ.                              #
    -- ####################################################################
    if v_table = 'profiles' then
      v_using := '(select public.is_active_user()) or (id = (select auth.uid()))';
      v_check := '(select public.is_active_user())';
    else
      v_using := '(select public.is_active_user())';
      v_check := '(select public.is_active_user())';
    end if;

    execute format($fmt$
      create policy account_active_gate on public.%I
        as restrictive
        for all
        to authenticated
        using (%s)
        with check (%s)
    $fmt$, v_table, v_using, v_check);

    execute format(
      'comment on policy account_active_gate on public.%I is %L',
      v_table,
      'Faz 4.10: pasif danisan (is_active=false) engeli. Cagiran aktifse gecer (koc HER ZAMAN aktif -> etkilenmez). Kaldirilirsa pasif danisan tekrar tum verisini gorur.'
    );

    v_count := v_count + 1;
  end loop;

  raise notice 'account_active_gate kuruldu: % tablo', v_count;
end
$$;


-- #############################################################################
-- ## 4) is_active SON-KULLANICI YAZIMINA KAPALI                              ##
-- #############################################################################
--   `profiles_guard_server_columns()` (20260817160200 §3) email/current_streak/
--   last_checkin_at'i sabitliyordu. `is_active` de aynı sınıfa girer: hiçbir
--   `authenticated` oturumu (danışan KENDİ satırında bile) `is_active`i UPDATE
--   ile yazamaz -> danışan kendini YENİDEN AKTİFLEŞTİREMEZ. Tek yazıcı
--   set_client_active_state RPC'si (SECURITY DEFINER, is_end_user_write() false
--   alır -> guard çekilir). Fonksiyon CREATE OR REPLACE ile mevcut üç kolon
--   korunarak genişletilir (idempotent).
create or replace function public.profiles_guard_server_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı: increment_streak() / sync_profile_email() /
  -- set_client_active_state() / seed / migration.
  if not public.is_end_user_write() then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles: e-posta adresi profil uzerinden degistirilemez. Tek kaynak auth.users hesabidir (degisiklik oraya yazilir, sunucu profili esitler).'
      using errcode = '42501';
  end if;

  if new.current_streak is distinct from old.current_streak
     or new.last_checkin_at is distinct from old.last_checkin_at then
    raise exception 'profiles: seri (current_streak / last_checkin_at) dogrudan yazilamaz. Bu alanlar yalnizca increment_streak() RPC si ile guncellenir.'
      using errcode = '42501';
  end if;

  -- FAZ 4.10: hesap aktiflik durumu son-kullanici tarafindan degistirilemez.
  -- Danisan kendini yeniden aktiflestiremez; tek yazici set_client_active_state
  -- RPC si (service_role, SECURITY DEFINER -> is_end_user_write() false).
  if new.is_active is distinct from old.is_active then
    raise exception 'profiles: hesap aktiflik durumu (is_active) profil uzerinden degistirilemez. Yalnizca kocun set_client_active_state RPC si (service_role) yazar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_server_columns()
  is 'profiles sütun sabitlemesi (AC-08/AC-09 + Faz 4.10): hiçbir authenticated oturumu email / current_streak / last_checkin_at / is_active sütunlarını UPDATE ile yazamaz (42501). increment_streak() / sync_profile_email() / set_client_active_state() SECURITY DEFINER oldukları için is_end_user_write() false alır ve etkilenmez.';

-- Trigger zaten kurulu (20260817160200); fonksiyon güncellendi, tetikleyici
-- yeniden bağlanmaya gerek duymaz. Yine de idempotanslık için sabitlenir.
drop trigger if exists profiles_guard_server_columns on public.profiles;
create trigger profiles_guard_server_columns
  before update
  on public.profiles
  for each row
  execute function public.profiles_guard_server_columns();


-- #############################################################################
-- ## 5) coach_actions KAPALI LİSTESİ GENİŞLETİLİR                            ##
-- #############################################################################
--   20260820160000'in AYNI yöntemi: `create table if not exists` gövdesindeki
--   kısıt metni MEVCUT kısıtı güncellemez, o yüzden AÇIK drop/add. Kısıt ADI
--   korunur (rls.test.sql ve gelecekteki migration'lar bu ada göre arıyor).
--   `target_id` invaryantı DEĞİŞMEZ: client_deactivated/client_reactivated
--   HER ZAMAN var olan bir danışanı hedefler -> target NOT NULL kalır (yalnızca
--   client_invited NULL hedefe izinli, coach_actions_target_required_chk aynen).
alter table public.coach_actions
  drop constraint if exists coach_actions_action_chk;

alter table public.coach_actions
  add  constraint coach_actions_action_chk
  check (action in (
    'password_reset_requested',
    'client_invited',
    'client_deactivated',
    'client_reactivated'
  ));


-- #############################################################################
-- ## 6) set_client_active_state() — TEK YAZMA YOLU (SECURITY DEFINER)        ##
-- #############################################################################
--
--   ##########################################################################
--   # YETKİ MODELİ — DAVET RPC'SİNİN DİSİPLİNİ                               #
--   #                                                                        #
--   # EXECUTE yalnız `service_role`. Route (set-client-active/route.ts) davet #
--   # ucuyla AYNI şekilde koçu KENDİ token'ıyla doğrular: is_coach(auth.uid) #
--   # + aal2 AÇIK kontrolü (fail-closed 403). Yani "koç aal1'de reddedilir"  #
--   # kararı ROUTE'ta yaşar — davet ucundaki record_coach_action'da olduğu   #
--   # gibi (o da aal2 kontrolünü route'a bırakır; RPC service_role'dedir).   #
--   #                                                                        #
--   # KOÇ KİMLİĞİ PARAMETRE DEĞİLDİR: service_role bağlamında auth.uid() NULL #
--   # olduğu için (davet ucunun record_coach_action'a p_actor_id GEÇMESİNİN  #
--   # ta sebebi budur) actor, TEK-KOÇLUK invaryantından TÜRETİLİR: role=     #
--   # 'coach' satırı (tam 1 olmalı, ADR-0007 / rls.test 145d). Böylece actor #
--   # ne bir gövde parametresinden ne de sahte bir uid'den gelir.            #
--   #                                                                        #
--   # FAIL-CLOSED SIRA: denetim ÖNCE (record_coach_action), aktiflik SONRA.  #
--   # Aynı transaksiyonda: denetim yazılamazsa is_active HİÇ değişmez -- "iz  #
--   # birakmadan yapilan mudahale, hic yapilamayandan daha kotudur".         #
--   ##########################################################################
create or replace function public.set_client_active_state(
  p_client_id  uuid,
  p_active     boolean,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_coach     uuid;
  v_coach_n   int;
  v_role      public.user_role;
  v_action    text;
  v_request   uuid;
begin
  if p_client_id is null then
    raise exception 'set_client_active_state: p_client_id zorunludur.' using errcode = '22023';
  end if;
  if p_active is null then
    raise exception 'set_client_active_state: p_active zorunludur.' using errcode = '22023';
  end if;

  -- TEK-KOÇLUK: actor koç, gövdeden/uid'den DEĞİL şemadan türetilir. Tam 1 koç
  -- olmalı (ADR-0007); değilse fail-closed (denetimin "kim" alanı belirsizken
  -- müdahale YAPILMAZ).
  select count(*) into v_coach_n from public.profiles where role = 'coach'::public.user_role;
  if v_coach_n <> 1 then
    raise exception 'set_client_active_state: tek-kocluk invaryanti bozuk (% koc) -- aktiflik degistirilemez.', v_coach_n
      using errcode = 'P0001';
  end if;
  select id into v_coach from public.profiles where role = 'coach'::public.user_role;

  -- HEDEF gerçekten bir DANIŞAN mı? (koç/bilinmeyen hedef reddedilir -> koç
  -- kendini veya var olmayan bir satırı pasifleştiremez.)
  select role into v_role from public.profiles where id = p_client_id;
  if v_role is null then
    raise exception 'set_client_active_state: hedef profil bulunamadi (%).', p_client_id
      using errcode = 'P0002';
  end if;
  if v_role <> 'client'::public.user_role then
    raise exception 'set_client_active_state: hedef bir danisan degil (rol=%). Yalnizca danisan aktifligi degistirilebilir.', v_role
      using errcode = '42501';
  end if;

  v_action  := case when p_active then 'client_reactivated' else 'client_deactivated' end;
  v_request := nullif(p_request_id, '')::uuid;

  -- DENETİM ÖNCE (fail-closed) — TEK yazma yolu record_coach_action.
  perform public.record_coach_action(v_action, v_coach, p_client_id, v_request);

  -- Aktifliği güncelle. SECURITY DEFINER -> is_end_user_write() false ->
  -- profiles_guard_server_columns is_active kapisi CEKILIR; RLS bypass edilir.
  update public.profiles set is_active = p_active where id = p_client_id;
end;
$fn$;

comment on function public.set_client_active_state(uuid, boolean, text) is
  'Faz 4.10: kocun danisani pasiflestirmesi/yeniden aktiflestirmesi. SECURITY DEFINER, search_path pinli, EXECUTE yalnizca service_role. Actor tek-kocluk invaryantindan turetilir (parametre degil). Denetim ONCE (record_coach_action, client_deactivated/client_reactivated), is_active SONRA -- fail-closed. Route aal2 + is_coach kontrolunu yapar (davet ucu disiplini).';

revoke all     on function public.set_client_active_state(uuid, boolean, text) from public;
revoke all     on function public.set_client_active_state(uuid, boolean, text) from anon;
revoke all     on function public.set_client_active_state(uuid, boolean, text) from authenticated;
grant  execute on function public.set_client_active_state(uuid, boolean, text) to service_role;


-- #############################################################################
-- ## 7) MIGRATION'IN KENDİ DOĞRULAMASI — SESSİZ BAŞARISIZLIK YOK            ##
-- #############################################################################
do $verify$
declare
  v_installed     int;
  v_total         int;
  v_extra         text;
  v_missing       text;
  v_prof_using    text;
  v_prof_check    text;
  v_def           text;
  v_manifest_keys text;
  v_keys          int;
  v_expected text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos', 'activity_sessions', 'activity_events'
  ];
  v_client uuid;
begin
  -- (a) is_active kolonu NOT NULL default true mi?
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'is_active' and is_nullable = 'NO'
  ) then
    raise exception 'DOGRULAMA BASARISIZ (a): profiles.is_active YOK veya NULLABLE.';
  end if;

  -- (b) 16 politikanın HEPSİ RESTRICTIVE/ALL/authenticated, using+with_check dolu.
  select count(*) into v_installed
    from pg_policies p
   where p.schemaname = 'public'
     and p.policyname = 'account_active_gate'
     and p.tablename  = any (v_expected)
     and p.permissive = 'RESTRICTIVE'
     and p.cmd        = 'ALL'
     and p.roles      = '{authenticated}'::name[]
     and p.qual       is not null
     and p.with_check is not null;
  if v_installed <> 16 then
    select string_agg(e, ', ' order by e) into v_missing
      from unnest(v_expected) e
     where not exists (
       select 1 from pg_policies p
        where p.schemaname='public' and p.tablename=e and p.policyname='account_active_gate'
          and p.permissive='RESTRICTIVE' and p.cmd='ALL'
          and p.roles='{authenticated}'::name[]
          and p.qual is not null and p.with_check is not null
     );
    raise exception 'DOGRULAMA BASARISIZ (b): 16 beklenirken % dogru politika. Eksik/bozuk: %', v_installed, coalesce(v_missing, '(bilinmiyor)');
  end if;

  -- (c) `account_active_gate` adıyla BAŞKA tabloya sızmış mı? (tam 16)
  select count(*) into v_total
    from pg_policies where schemaname='public' and policyname='account_active_gate';
  if v_total <> 16 then
    raise exception 'DOGRULAMA BASARISIZ (c): account_active_gate politika sayisi % (16 bekleniyordu).', v_total;
  end if;

  -- (d) HEPSİ is_active_user() dalını taşıyor mu? (biri silinirse kapı anlamsız
  --     veya herkesi kilitler.)
  if exists (
    select 1 from pg_policies p
     where p.schemaname='public' and p.policyname='account_active_gate'
       and (p.qual not like '%is_active_user%' or p.with_check not like '%is_active_user%')
  ) then
    raise exception 'DOGRULAMA BASARISIZ (d): bir account_active_gate politikasi is_active_user dalini TASIMIYOR.';
  end if;

  -- (e) profiles İSTİSNASI: using `auth.uid()` içerir, with_check İÇERMEZ.
  select qual, with_check into v_prof_using, v_prof_check
    from pg_policies
   where schemaname='public' and tablename='profiles' and policyname='account_active_gate';
  if v_prof_using not like '%uid%' then
    raise exception 'DOGRULAMA BASARISIZ (e): profiles account_active_gate using dali auth.uid() istisnasini TASIMIYOR -- pasif ekran cizilemez.';
  end if;
  if v_prof_check like '%uid%' then
    raise exception 'DOGRULAMA BASARISIZ (e): profiles account_active_gate with_check dali auth.uid() istisnasini TASIYOR -- pasif danisan kendi profilini YAZABILIR.';
  end if;

  -- (f) ŞEMA SÜRÜKLENMESİ: kapılı 16 + bilinen muafiyetler dışında public tablo?
  select string_agg(t.tablename, ', ' order by t.tablename) into v_extra
    from pg_tables t
   where t.schemaname='public'
     and t.tablename <> all (v_expected)
     and t.tablename <> all (array[
       'exercises', 'food_database', 'account_deletions',
       'message_attachment_verifications', 'coach_actions'
     ]);
  if v_extra is not null then
    raise exception 'DOGRULAMA BASARISIZ (f): account_active_gate ve muafiyet listesi DISINDA public tablo(lar) var -> %.', v_extra;
  end if;

  -- (g) is_active_user() SECURITY DEFINER + pinli search_path.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='is_active_user' and p.prosecdef
       and p.proconfig::text like '%search_path%'
  ) then
    raise exception 'DOGRULAMA BASARISIZ (g): is_active_user SECURITY DEFINER veya search_path pinli DEGIL.';
  end if;

  -- (h) coach_actions kapalı listesi 4 değerli.
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid='public.coach_actions'::regclass and c.conname='coach_actions_action_chk';
  if v_def is null
     or v_def not like '%client_deactivated%'
     or v_def not like '%client_reactivated%'
     or v_def not like '%password_reset_requested%'
     or v_def not like '%client_invited%' then
    raise exception 'DOGRULAMA BASARISIZ (h): coach_actions_action_chk 4 degeri TASIMIYOR -> %', coalesce(v_def, '(yok)');
  end if;

  -- (i) is_active guard: profiles_guard_server_columns is_active i kapsiyor mu?
  v_def := pg_get_functiondef(to_regprocedure('public.profiles_guard_server_columns()'));
  if v_def not like '%is_active%' then
    raise exception 'DOGRULAMA BASARISIZ (i): profiles_guard_server_columns is_active kapisini TASIMIYOR.';
  end if;

  -- (j) set_client_active_state YETKİ YÜZEYİ dar mı?
  if has_function_privilege('authenticated', 'public.set_client_active_state(uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_client_active_state(uuid, boolean, text)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ (j): set_client_active_state authenticated/anon a ACIK.';
  end if;
  if not has_function_privilege('service_role', 'public.set_client_active_state(uuid, boolean, text)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ (j): service_role set_client_active_state i CALISTIRAMIYOR.';
  end if;

  -- (k) MANİFEST ETKİLENMEDİ: yeni TABLO yok (yalnız kolon) -> hesap silme
  --     manifesti hâlâ 17 tablo (20260820160000 §5d ile aynı kume).
  select id into v_client from public.profiles where role='client'::public.user_role limit 1;
  if v_client is not null then
    select string_agg(k, ',' order by k) into v_manifest_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows') k;
    if v_manifest_keys is distinct from
       'activity_events,activity_sessions,coach_actions,daily_logs,form_checks,'
       || 'messages,notifications,nutrition_logs,nutrition_plan_meals,nutrition_plans,'
       || 'profiles,program_approvals,progress_entries,progress_photos,workout_logs,'
       || 'workout_plan_exercises,workout_plans' then
      raise exception 'DOGRULAMA BASARISIZ (k): hesap silme manifest tablo kumesi DEGISMIS -> %', v_manifest_keys;
    end if;
    select count(*) into v_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows');
    if v_keys <> 17 then
      raise exception 'DOGRULAMA BASARISIZ (k): manifest tablo sayisi 17 DEGIL -> %', v_keys;
    end if;
  else
    raise notice 'Manifest olcumu ATLANDI: danisan yok (seed henuz kosmamis olabilir).';
  end if;

  raise notice 'DOGRULAMA GECTI: is_active kolonu + 16/16 account_active_gate (profiles istisnasi dogru) + guard + kapali liste(4) + RPC(dar) + manifest(17) DEGISMEDI.';
end
$verify$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: geri alma pasif danışan engelini TAMAMEN kaldırır — o andan itibaren
-- pasifleştirilmiş her danışan tüm verisine yeniden erişir. `is_active` kolonu
-- BİLEREK düşürülmez (koç, danışan pasiflik durumunu kaybetmesin); yalnızca
-- politikalar, RPC, guard genişletmesi ve CHECK genişletmesi geri alınır.
--
-- begin;
--   do $$
--   declare r record;
--   begin
--     for r in select tablename from pg_policies
--               where schemaname='public' and policyname='account_active_gate'
--     loop
--       execute format('drop policy if exists account_active_gate on public.%I', r.tablename);
--     end loop;
--   end $$;
--
--   drop function if exists public.set_client_active_state(uuid, boolean, text);
--   drop function if exists public.is_active_user(uuid);
--
--   -- guard: is_active dalini cikar (20260817160200 halina dondur).
--   create or replace function public.profiles_guard_server_columns()
--   returns trigger language plpgsql set search_path = public, pg_temp as $g$
--   begin
--     if not public.is_end_user_write() then return new; end if;
--     if new.email is distinct from old.email then
--       raise exception 'profiles: e-posta ...' using errcode='42501'; end if;
--     if new.current_streak is distinct from old.current_streak
--        or new.last_checkin_at is distinct from old.last_checkin_at then
--       raise exception 'profiles: seri ...' using errcode='42501'; end if;
--     return new;
--   end; $g$;
--
--   alter table public.coach_actions drop constraint if exists coach_actions_action_chk;
--   alter table public.coach_actions add  constraint coach_actions_action_chk
--     check (action in ('password_reset_requested','client_invited'));
--
--   -- Kolonu tutmak istemiyorsaniz (VERI KAYBI):
--   -- alter table public.profiles drop column if exists is_active;
-- commit;
-- =============================================================================
