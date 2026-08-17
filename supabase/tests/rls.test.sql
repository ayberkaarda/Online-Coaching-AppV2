-- =============================================================================
-- supabase/tests/rls.test.sql
--
-- RLS (Row Level Security) politikalarını doğrulayan, tekrar çalıştırılabilir
-- SQL test script'i. active_planprogram.md AC-1.2'nin karşılığıdır:
-- "RLS test script'i ile senaryolar doğrulanır".
--
-- Bu script iki bilinen regresyona karşı kalıcı koruma sağlar
-- (bkz. supabase/migrations/20260816100000_fix_rls_visibility.sql):
--   KIRIK 1 — Danışan koçun profil satırını göremiyordu (useCoachId() null dönüyordu).
--   KIRIK 2 — Danışan koça bildirim (program onay talebi) yazamıyordu.
--
-- ÇALIŞTIRMA:
--   npm run test:rls
--   (veya doğrudan) docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls.test.sql
--
-- TASARIM:
--   * Her senaryo kendi BEGIN; ... ROLLBACK; bloğu içinde çalışır -> veri
--     KALICI DEĞİŞMEZ. Yazma senaryoları dahil hiçbir satır gerçek tabloda kalmaz.
--   * Rol taklidi: SET LOCAL ROLE authenticated + SET LOCAL request.jwt.claims
--     (auth.uid() bu ayarı okur, bkz. auth.uid() tanımı).
--   * Her senaryo "beklenen vs gerçek" karşılaştırması yapar; uyuşmazlıkta
--     `raise exception` ile BİLE İSTEMEYEREK GEÇMEZ (sessiz PASS yok).
--   * `raise exception` psql'i sıfırdan farklı çıkış koduyla durdurur
--     (ON_ERROR_STOP=1 ile) -> CI'da kırmızı verir.
--   * "İzin reddedilmeli" senaryolarında (RLS ihlali / permission denied)
--     hata plpgsql BEGIN/EXCEPTION bloğuyla YAKALANIR ve beklenen davranış
--     olarak doğrulanır; script kırılmaz.
--
-- Seed kimlikleri (bkz. supabase/seed.sql):
--   Koç (coach)  : 11111111-1111-1111-1111-111111111111 (Deniz Koç)
--   Danışan A    : 22222222-2222-2222-2222-222222222222 (Ahmet Yılmaz)
--   Danışan B    : 33333333-3333-3333-3333-333333333333 (Elif Demir)
-- =============================================================================

\set ON_ERROR_STOP on

\echo '=== RLS TEST SUITE BASLIYOR ==='


-- =============================================================================
-- GORUNURLUK — 1) Danışan A -> profiles satır sayısı = 2 (kendisi + koç)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles) is distinct from (2) then
    raise exception 'BASARISIZ [Danisan A - profiles satir sayisi 2]: beklenen %, gelen %', 2, (select count(*) from public.profiles);
  end if;
  raise notice 'GECTI [Danisan A - profiles satir sayisi 2]';
end $$;
rollback;


-- =============================================================================
-- GORUNURLUK — 2) Danışan A -> role='coach' sorgusu koçun id'sini döndürür
-- REGRESYON KORUMASI: bu senaryo 2026-08-16'da kırıktı, bkz. 20260816100000_fix_rls_visibility.sql
-- (useCoachId() src/hooks/useMessages.ts tam olarak bu sorguyu çalıştırır)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_coach_id uuid;
begin
  select id into v_coach_id from public.profiles where role = 'coach'::public.user_role;
  if v_coach_id is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'BASARISIZ [Danisan A - useCoachId koc id dondurur]: beklenen %, gelen %',
      '11111111-1111-1111-1111-111111111111'::uuid, v_coach_id;
  end if;
  raise notice 'GECTI [Danisan A - useCoachId koc id dondurur]';
end $$;
rollback;


-- =============================================================================
-- GORUNURLUK — 3) Danışan A -> Danışan B'nin profilini göremez (0 satır)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333') is distinct from (0) then
    raise exception 'BASARISIZ [Danisan A - Danisan B profilini goremez]: beklenen %, gelen %',
      0, (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333');
  end if;
  raise notice 'GECTI [Danisan A - Danisan B profilini goremez]';
end $$;
rollback;


-- =============================================================================
-- GORUNURLUK — 4) Koç -> profiles satır sayısı = 3
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.profiles) is distinct from (3) then
    raise exception 'BASARISIZ [Koc - profiles satir sayisi 3]: beklenen %, gelen %', 3, (select count(*) from public.profiles);
  end if;
  raise notice 'GECTI [Koc - profiles satir sayisi 3]';
end $$;
rollback;


-- =============================================================================
-- GORUNURLUK — 5) anon rolü -> profiles okuyamaz (permission denied yakalanmalı)
-- =============================================================================
begin;
set local role anon;
do $$
declare
  v_count   int;
  v_caught  boolean := false;
begin
  begin
    select count(*) into v_count from public.profiles;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - profiles okuyamaz]: beklenen permission denied, hata alinmadi (v_count=%)', v_count;
  end if;
  raise notice 'GECTI [anon - profiles okuyamaz]';
end $$;
rollback;


-- =============================================================================
-- SATIR IZOLASYONU — 6) Danışan A -> Danışan B'nin form_checks kayıtlarını göremez
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.form_checks where client_id = '33333333-3333-3333-3333-333333333333') is distinct from (0) then
    raise exception 'BASARISIZ [Danisan A - Danisan B form_checks goremez]: beklenen %, gelen %',
      0, (select count(*) from public.form_checks where client_id = '33333333-3333-3333-3333-333333333333');
  end if;
  raise notice 'GECTI [Danisan A - Danisan B form_checks goremez]';
end $$;
rollback;


-- =============================================================================
-- SATIR IZOLASYONU — 7) Danışan A -> Danışan B'nin daily_logs kayıtlarını göremez
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.daily_logs where client_id = '33333333-3333-3333-3333-333333333333') is distinct from (0) then
    raise exception 'BASARISIZ [Danisan A - Danisan B daily_logs goremez]: beklenen %, gelen %',
      0, (select count(*) from public.daily_logs where client_id = '33333333-3333-3333-3333-333333333333');
  end if;
  raise notice 'GECTI [Danisan A - Danisan B daily_logs goremez]';
end $$;
rollback;


-- =============================================================================
-- SATIR IZOLASYONU — 8) Danışan A -> Danışan B'nin workout_logs kayıtlarını göremez
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.workout_logs where client_id = '33333333-3333-3333-3333-333333333333') is distinct from (0) then
    raise exception 'BASARISIZ [Danisan A - Danisan B workout_logs goremez]: beklenen %, gelen %',
      0, (select count(*) from public.workout_logs where client_id = '33333333-3333-3333-3333-333333333333');
  end if;
  raise notice 'GECTI [Danisan A - Danisan B workout_logs goremez]';
end $$;
rollback;


-- =============================================================================
-- SATIR IZOLASYONU — 9) Koç -> tüm form_checks / daily_logs kayıtlarını görür
-- Dayanıklı iddia: sabit sayı beklemek yerine (a) toplam > 0 ve (b) toplam,
-- yalnızca Danışan A'ya ait satır sayısından fazla -- yani koç en az bir
-- başka danışanın (B'nin) satırlarını da görüyor.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_fc_total   int;
  v_fc_a_only  int;
  v_dl_total   int;
  v_dl_a_only  int;
begin
  select count(*) into v_fc_total  from public.form_checks;
  select count(*) into v_fc_a_only from public.form_checks where client_id = '22222222-2222-2222-2222-222222222222';
  if v_fc_total <= 0 or v_fc_total <= v_fc_a_only then
    raise exception 'BASARISIZ [Koc - tum form_checks gorur]: toplam=%, sadece_A=% (toplam A''dan buyuk olmali)', v_fc_total, v_fc_a_only;
  end if;

  select count(*) into v_dl_total  from public.daily_logs;
  select count(*) into v_dl_a_only from public.daily_logs where client_id = '22222222-2222-2222-2222-222222222222';
  if v_dl_total <= 0 or v_dl_total <= v_dl_a_only then
    raise exception 'BASARISIZ [Koc - tum daily_logs gorur]: toplam=%, sadece_A=% (toplam A''dan buyuk olmali)', v_dl_total, v_dl_a_only;
  end if;

  raise notice 'GECTI [Koc - tum form_checks/daily_logs gorur]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 10) Danışan A -> kendi daily_logs kaydını yazabilir
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_id uuid;
begin
  insert into public.daily_logs (client_id, log_date, water_lt)
  values ('22222222-2222-2222-2222-222222222222', '2000-01-01', 1.50)
  returning id into v_id;

  if v_id is null then
    raise exception 'BASARISIZ [Danisan A - kendi daily_log yazar]: insert basarisiz oldu';
  end if;
  raise notice 'GECTI [Danisan A - kendi daily_log yazar]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 11) Danışan A -> Danışan B adına daily_logs yazamaz (RLS ihlali)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    insert into public.daily_logs (client_id, log_date, water_lt)
    values ('33333333-3333-3333-3333-333333333333', '2000-01-02', 1.00);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B adina daily_log yazamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;
  raise notice 'GECTI [Danisan A - Danisan B adina daily_log yazamaz]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 12) Danışan A -> koça bildirim yazabilir
-- REGRESYON KORUMASI: bu senaryo 2026-08-16'da kırıktı, bkz. 20260816100000_fix_rls_visibility.sql
-- (useSubmitProgramForApproval koça "onay bekliyor" bildirimi yazar)
--
-- NOT: `RETURNING ... INTO` kasıtlı olarak KULLANILMAZ. Postgres RLS'de INSERT
-- ... RETURNING, eklenen satırı SELECT politikasıyla da doğrular; notifications_select
-- yalnızca "client_id = auth.uid() OR is_coach()" olduğundan Danışan A, koça ait
-- (client_id=koç) satırı INSERT edebilse de RETURNING ile GERİ OKUYAMAZ (ayrı,
-- beklenen bir RLS davranışı). Gerçek uygulama kodu da (useProgramApprovals.ts)
-- bu insert'te `.select()` çağırmaz -> davranış eşleşiyor. Bu yüzden burada
-- yalnızca satırın gerçekten eklendiği GET DIAGNOSTICS ROW_COUNT ile doğrulanır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows int;
begin
  insert into public.notifications (client_id, message)
  values ('11111111-1111-1111-1111-111111111111', 'RLS testi - Danisan A''dan koca bildirim');
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - koca bildirim yazar]: beklenen 1 satir eklendi, gelen %', v_rows;
  end if;
  raise notice 'GECTI [Danisan A - koca bildirim yazar]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 13) Danışan A -> Danışan B'ye bildirim yazamaz (spam koruması)
-- Kırık 2 düzeltmesinin açtığı yüzeyin (danışan -> koç bildirimi) danışandan
-- danışana genişlemediğini kanıtlar.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    insert into public.notifications (client_id, message)
    values ('33333333-3333-3333-3333-333333333333', 'RLS testi - spam denemesi');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B''ye bildirim yazamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;
  raise notice 'GECTI [Danisan A - Danisan B''ye bildirim yazamaz]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 14) Danışan A -> kendi rolünü coach yapamaz (yetki yükseltme koruması)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    update public.profiles set role = 'coach'::public.user_role
    where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - kendi rolunu coach yapamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;
  raise notice 'GECTI [Danisan A - kendi rolunu coach yapamaz]';
end $$;
rollback;


-- =============================================================================
-- YAZMA YETKISI — 15) Danışan A -> koçun profilini güncelleyemez (0 satır etkilenir)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows int;
begin
  update public.profiles set full_name = 'RLS TEST - HACKED'
  where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - koc profilini guncelleyemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;
  raise notice 'GECTI [Danisan A - koc profilini guncelleyemez]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA — 16) Danışan A -> yalnızca kendi konuşmalarındaki mesajları görür
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_foreign int;
begin
  select count(*) into v_foreign
  from public.messages
  where sender_id   <> '22222222-2222-2222-2222-222222222222'
    and receiver_id <> '22222222-2222-2222-2222-222222222222';

  if v_foreign is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - sadece kendi konusmalarini gorur]: beklenen 0 yabanci mesaj, gelen %', v_foreign;
  end if;
  raise notice 'GECTI [Danisan A - sadece kendi konusmalarini gorur]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA — 17) Danışan A -> sender_id'yi başkası göstererek mesaj yazamaz
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    insert into public.messages (sender_id, receiver_id, message)
    values (
      '33333333-3333-3333-3333-333333333333',
      '11111111-1111-1111-1111-111111111111',
      'RLS testi - kimlik taklidi denemesi'
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - sender_id taklidi ile mesaj yazamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;
  raise notice 'GECTI [Danisan A - sender_id taklidi ile mesaj yazamaz]';
end $$;
rollback;


-- =============================================================================
-- KATALOG — 18) Danışan A -> exercises ve food_database okuyabilir
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_exercises int;
  v_foods     int;
begin
  select count(*) into v_exercises from public.exercises;
  select count(*) into v_foods     from public.food_database;

  if v_exercises <= 0 or v_foods <= 0 then
    raise exception 'BASARISIZ [Danisan A - katalog okur]: exercises=%, food_database=% (ikisi de > 0 olmali)', v_exercises, v_foods;
  end if;
  raise notice 'GECTI [Danisan A - katalog okur]';
end $$;
rollback;


-- =============================================================================
-- KATALOG — 19) Danışan A -> exercises tablosuna yazamaz
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    insert into public.exercises (name, body_part) values ('RLS Test Exercise - basarisiz olmali', 'test');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - exercises tablosuna yazamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;
  raise notice 'GECTI [Danisan A - exercises tablosuna yazamaz]';
end $$;
rollback;


-- #############################################################################
-- FAZ 1b / ADIM 1 — ANTRENMAN PLANI TABLOLARI (20260817110000_workout_plan_tables.sql)
--
-- Bu bölümdeki senaryolar `public.workout_plans` ve
-- `public.workout_plan_exercises` tablolarının RLS politikalarını ve
-- `public.save_workout_plan()` RPC'sinin (SECURITY INVOKER) yetki sınırını
-- doğrular.
--
-- KURULUM DESENİ: bu tablolar `supabase db reset` sonrasında BOŞTUR (migration'lar
-- seed'den önce koştuğu için dönüşüm no-op'tur). Bu yüzden her senaryo, rol
-- taklidine GEÇMEDEN ÖNCE `postgres` (superuser, RLS bypass) kimliğiyle kendi
-- verisini kurar; `set local role` çağrısı bundan SONRA gelir. Tümü ROLLBACK ile
-- geri alınır.
--
-- Sabit plan kimlikleri (yalnızca test içi):
--   Danışan A planı : aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--   Danışan B planı : bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- #############################################################################


-- =============================================================================
-- ANTRENMAN PLANI — 20) Danışan A kendi planını okur, Danışan B'ninkini OKUYAMAZ
-- =============================================================================
begin;

delete from public.workout_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.workout_plans (id, client_id, version, is_active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 1, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line, name, target_sets, target_reps) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pazartesi', 0, '1. Bench Press - 4x8', 'Bench Press', 4, 8),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pazartesi', 0, '1. Squat - 5x5',       'Squat',       5, 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_own_plans   int;
  v_other_plans int;
  v_own_ex      int;
  v_other_ex    int;
begin
  select count(*) into v_own_plans   from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_other_plans from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';
  select count(*) into v_own_ex      from public.workout_plan_exercises where plan_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into v_other_ex    from public.workout_plan_exercises where plan_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  if v_own_plans is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi antrenman planini okur]: beklenen 1 plan, gelen %', v_own_plans;
  end if;
  if v_own_ex is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi plan satirlarini okur]: beklenen 1 satir, gelen %', v_own_ex;
  end if;
  if v_other_plans is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B planini goremez]: beklenen 0 plan, gelen %', v_other_plans;
  end if;
  if v_other_ex is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B plan satirlarini goremez]: beklenen 0 satir, gelen %', v_other_ex;
  end if;

  raise notice 'GECTI [Danisan A - kendi antrenman planini okur, Danisan B''ninkini okuyamaz]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 21) Koç her iki danışanın planını da okur
-- =============================================================================
begin;

delete from public.workout_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.workout_plans (id, client_id, version, is_active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 1, true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pazartesi', 0, '1. Bench Press - 4x8'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pazartesi', 0, '1. Squat - 5x5');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_plans int;
  v_ex    int;
begin
  select count(*) into v_plans
    from public.workout_plans
   where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

  select count(*) into v_ex
    from public.workout_plan_exercises
   where plan_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

  if v_plans is distinct from 2 then
    raise exception 'BASARISIZ [Koc - her iki plani okur]: beklenen 2 plan, gelen %', v_plans;
  end if;
  if v_ex is distinct from 2 then
    raise exception 'BASARISIZ [Koc - her iki planin satirlarini okur]: beklenen 2 satir, gelen %', v_ex;
  end if;

  raise notice 'GECTI [Koc - her iki danisanin antrenman planini okur]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 22) Danışan A KENDİ planına yazabilir
-- BİLİNÇLİ SAPMA KORUMASI: plan §3.2 "yalnız koç yazar" der; mevcut ürün
-- davranışında danışan kendi programını düzenleyip onaya sunabiliyor. Bu senaryo
-- o davranışın korunduğunu kanıtlar (bkz. migration §6 sapma notu).
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_plan_id uuid;
  v_rows    int;
begin
  -- Plan başlığı
  insert into public.workout_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 1, true)
  returning id into v_plan_id;

  if v_plan_id is null then
    raise exception 'BASARISIZ [Danisan A - kendi planini olusturur]: insert basarisiz';
  end if;

  -- Plan satırı
  insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
  values (v_plan_id, 'Pazartesi', 0, '1. Bench Press - 4x8');
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi plan satirini yazar]: beklenen 1, gelen %', v_rows;
  end if;

  -- Güncelleme ve silme de kendi planında serbest olmalı
  update public.workout_plan_exercises set raw_line = '1. Bench Press - 5x5' where plan_id = v_plan_id;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi plan satirini gunceller]: beklenen 1, gelen %', v_rows;
  end if;

  delete from public.workout_plan_exercises where plan_id = v_plan_id;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi plan satirini siler]: beklenen 1, gelen %', v_rows;
  end if;

  raise notice 'GECTI [Danisan A - kendi antrenman planina yazabilir]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 23) Danışan A, Danışan B'nin planına YAZAMAZ
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';

insert into public.workout_plans (id, client_id, version, is_active) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pazartesi', 0, '1. Squat - 5x5');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_rows   int;
begin
  -- a) Başkası adına plan başlığı açamaz
  begin
    insert into public.workout_plans (client_id, version, is_active)
    values ('33333333-3333-3333-3333-333333333333', 1, true);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B adina plan acamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- b) Başkasının planına satır ekleyemez
  v_caught := false;
  begin
    insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Salı', 0, 'RLS testi - olmamali');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B planina satir ekleyemez]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- c) Başkasının planındaki satırları GÜNCELLEYEMEZ/SİLEMEZ (satırlar görünmediği
  --    için 0 satır etkilenir -- sessiz veri bozulması olmaz).
  update public.workout_plan_exercises set raw_line = 'HACKED'
   where plan_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B plan satirini guncelleyemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;

  delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B planini silemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;

  raise notice 'GECTI [Danisan A - Danisan B''nin antrenman planina yazamaz]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 24) anon rolü plan tablolarını OKUYAMAZ
-- =============================================================================
begin;
set local role anon;
do $$
declare
  v_count  int;
  v_caught boolean := false;
begin
  begin
    select count(*) into v_count from public.workout_plans;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - workout_plans okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;

  v_caught := false;
  begin
    select count(*) into v_count from public.workout_plan_exercises;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - workout_plan_exercises okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;

  raise notice 'GECTI [anon - antrenman plani tablolarini okuyamaz]';
end $$;
rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 25) save_workout_plan() danışan olarak KENDİ id'si için çalışır
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_affected int;
  v_plan_id  uuid;
  v_rows     int;
begin
  v_affected := public.save_workout_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object('Pazartesi', E'1. Bench Press - 4x8\n2. Cable Fly - 3x12', 'Çarşamba', 'Dinlenme')
  );

  if v_affected is distinct from 1 then
    raise exception 'BASARISIZ [save_workout_plan - kendi id]: beklenen 1 danisan, gelen %', v_affected;
  end if;

  select id into v_plan_id from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;
  if v_plan_id is null then
    raise exception 'BASARISIZ [save_workout_plan - kendi id]: aktif plan olusmadi';
  end if;

  select count(*) into v_rows from public.workout_plan_exercises where plan_id = v_plan_id;
  if v_rows is distinct from 3 then
    raise exception 'BASARISIZ [save_workout_plan - kendi id]: beklenen 3 satir, gelen %', v_rows;
  end if;

  raise notice 'GECTI [save_workout_plan - danisan kendi id''si icin calistirabilir]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 26) save_workout_plan() BAŞKASININ id'siyle RLS hatası verir
-- (fonksiyon SECURITY INVOKER'dır ve hatayı YAKALAMAZ -> tüm çağrı geri alınır)
-- =============================================================================
begin;

delete from public.workout_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.save_workout_plan(
      array['33333333-3333-3333-3333-333333333333']::uuid[],
      jsonb_build_object('Pazartesi', '1. Squat - 5x5')
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [save_workout_plan - baskasinin id''si]: beklenen RLS ihlali, hata alinmadi';
  end if;

  raise notice 'GECTI [save_workout_plan - baskasinin id''si icin RLS hatasi verir]';
end $$;

rollback;


-- =============================================================================
-- ANTRENMAN PLANI — 27) save_workout_plan() ATOMİKTİR
-- Karma liste (kendi id + başkasının id) verildiğinde hata yükselir ve
-- KENDİ planı da yazılmaz -- yani kısmi yazma olmaz.
-- =============================================================================
begin;

delete from public.workout_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_plans  int;
begin
  begin
    perform public.save_workout_plan(
      array['22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333']::uuid[],
      jsonb_build_object('Pazartesi', '1. Squat - 5x5')
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [save_workout_plan - atomiklik]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- plpgsql BEGIN/EXCEPTION bir subtransaction acar; hata yakalandiginda
  -- blogun ICINDEKI tum yazmalar (kendi planinin olusturulmasi dahil) geri alinir.
  select count(*) into v_plans from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222';
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [save_workout_plan - atomiklik]: kismi yazma olustu, % plan satiri kaldi', v_plans;
  end if;

  raise notice 'GECTI [save_workout_plan - atomik: kismi yazma yok]';
end $$;

rollback;


-- #############################################################################
-- FAZ 1b / ADIM 3a — BESLENME PLANI TABLOLARI (20260817130000_nutrition_plan_tables.sql)
--
-- Bu bölümdeki senaryolar `public.nutrition_plans` ve
-- `public.nutrition_plan_meals` tablolarının RLS politikalarını ve
-- `public.save_nutrition_plan()` RPC'sinin (SECURITY INVOKER) yetki sınırını
-- doğrular. Politikalar antrenman tarafının BİREBİR aynısıdır.
--
-- BİLİNÇLİ SAPMA (bkz. docs/adr/0014-danisanin-kendi-beslenme-planini-kaydedebilmesi.md):
--   Danışan KENDİ beslenme planına yazabilir. Senaryo 30 bu davranışı,
--   senaryo 31/34/35 ise sınırını (başkasının planına asla) kilitler.
--
-- KURULUM DESENİ: senaryolar rol taklidine GEÇMEDEN ÖNCE `postgres` (superuser,
-- RLS bypass) kimliğiyle kendi verisini kurar; `set local role` bundan SONRA
-- gelir. Tümü ROLLBACK ile geri alınır.
--
-- Sabit plan kimlikleri (yalnızca test içi):
--   Danışan A beslenme planı : cccccccc-cccc-cccc-cccc-cccccccccccc
--   Danışan B beslenme planı : dddddddd-dddd-dddd-dddd-dddddddddddd
-- #############################################################################


-- =============================================================================
-- BESLENME PLANI — 28) Danışan A kendi planını okur, Danışan B'ninkini OKUYAMAZ
-- =============================================================================
begin;

delete from public.nutrition_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.nutrition_plans (id, client_id, version, is_active) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 1, true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pazartesi', 0, E'Yulaf Ezmesi 80g\nTavuk Göğsü 200g', 1850),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Pazartesi', 0, 'Yulaf:60, Yumurta:2', 2100);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_own_plans   int;
  v_other_plans int;
  v_own_meals   int;
  v_other_meals int;
begin
  select count(*) into v_own_plans   from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_other_plans from public.nutrition_plans where client_id = '33333333-3333-3333-3333-333333333333';
  select count(*) into v_own_meals   from public.nutrition_plan_meals where plan_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  select count(*) into v_other_meals from public.nutrition_plan_meals where plan_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  if v_own_plans is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi beslenme planini okur]: beklenen 1 plan, gelen %', v_own_plans;
  end if;
  if v_own_meals is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi ogun satirlarini okur]: beklenen 1 satir, gelen %', v_own_meals;
  end if;
  if v_other_plans is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B beslenme planini goremez]: beklenen 0 plan, gelen %', v_other_plans;
  end if;
  if v_other_meals is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B ogun satirlarini goremez]: beklenen 0 satir, gelen %', v_other_meals;
  end if;

  raise notice 'GECTI [Danisan A - kendi beslenme planini okur, Danisan B''ninkini okuyamaz]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 29) Koç her iki danışanın beslenme planını da okur
-- =============================================================================
begin;

delete from public.nutrition_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.nutrition_plans (id, client_id, version, is_active) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 1, true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pazartesi', 0, 'Yulaf 80g', 1850),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Pazartesi', 0, 'Yulaf 60g', 2100);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_plans int;
  v_meals int;
begin
  select count(*) into v_plans
    from public.nutrition_plans
   where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

  select count(*) into v_meals
    from public.nutrition_plan_meals
   where plan_id in ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

  if v_plans is distinct from 2 then
    raise exception 'BASARISIZ [Koc - her iki beslenme planini okur]: beklenen 2 plan, gelen %', v_plans;
  end if;
  if v_meals is distinct from 2 then
    raise exception 'BASARISIZ [Koc - her iki planin ogun satirlarini okur]: beklenen 2 satir, gelen %', v_meals;
  end if;

  raise notice 'GECTI [Koc - her iki danisanin beslenme planini okur]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 30) Danışan A KENDİ beslenme planına yazabilir
-- BİLİNÇLİ SAPMA KORUMASI: plan §3.2 "yalnız koç yazar" der; bugün "Beslenme
-- Tablosunu Kaydet" butonu NutritionTab.tsx'te role bakılmaksızın render
-- ediliyor ve danışan kendi planını kaydedebiliyor (tests/e2e/plans.spec.ts bu
-- davranışı kilitliyor). Bkz. docs/adr/0014-....md
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_plan_id uuid;
  v_rows    int;
begin
  -- Plan başlığı
  insert into public.nutrition_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 1, true)
  returning id into v_plan_id;

  if v_plan_id is null then
    raise exception 'BASARISIZ [Danisan A - kendi beslenme planini olusturur]: insert basarisiz';
  end if;

  -- Öğün satırı
  insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal)
  values (v_plan_id, 'Pazartesi', 0, E'Yulaf Ezmesi 80g\nTavuk Göğsü 200g', 1850);
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi ogun satirini yazar]: beklenen 1, gelen %', v_rows;
  end if;

  -- Güncelleme ve silme de kendi planında serbest olmalı
  update public.nutrition_plan_meals set description = 'Yulaf:80, Tavuk:200', kcal = 1900
   where plan_id = v_plan_id;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi ogun satirini gunceller]: beklenen 1, gelen %', v_rows;
  end if;

  delete from public.nutrition_plan_meals where plan_id = v_plan_id;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi ogun satirini siler]: beklenen 1, gelen %', v_rows;
  end if;

  raise notice 'GECTI [Danisan A - kendi beslenme planina yazabilir]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 31) Danışan A, Danışan B'nin beslenme planına YAZAMAZ
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '33333333-3333-3333-3333-333333333333';

insert into public.nutrition_plans (id, client_id, version, is_active) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Pazartesi', 0, 'Yulaf 60g', 2100);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_rows   int;
begin
  -- a) Başkası adına plan başlığı açamaz
  begin
    insert into public.nutrition_plans (client_id, version, is_active)
    values ('33333333-3333-3333-3333-333333333333', 1, true);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B adina beslenme plani acamaz]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- b) Başkasının planına satır ekleyemez
  v_caught := false;
  begin
    insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Salı', 0, 'RLS testi - olmamali', 100);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - Danisan B planina ogun ekleyemez]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- c) Başkasının planındaki satırları GÜNCELLEYEMEZ/SİLEMEZ (satırlar görünmediği
  --    için 0 satır etkilenir -- sessiz veri bozulması olmaz).
  update public.nutrition_plan_meals set description = 'HACKED'
   where plan_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B ogun satirini guncelleyemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;

  delete from public.nutrition_plans where client_id = '33333333-3333-3333-3333-333333333333';
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - Danisan B beslenme planini silemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;

  raise notice 'GECTI [Danisan A - Danisan B''nin beslenme planina yazamaz]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 32) anon rolü beslenme plan tablolarını OKUYAMAZ
-- =============================================================================
begin;
set local role anon;
do $$
declare
  v_count  int;
  v_caught boolean := false;
begin
  begin
    select count(*) into v_count from public.nutrition_plans;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - nutrition_plans okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;

  v_caught := false;
  begin
    select count(*) into v_count from public.nutrition_plan_meals;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - nutrition_plan_meals okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;

  raise notice 'GECTI [anon - beslenme plani tablolarini okuyamaz]';
end $$;
rollback;


-- =============================================================================
-- BESLENME PLANI — 33) save_nutrition_plan() danışan olarak KENDİ id'si için çalışır
-- (NutritionTab'daki "Beslenme Tablosunu Kaydet" akışının veritabanı karşılığı)
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_affected int;
  v_plan_id  uuid;
  v_rows     int;
begin
  v_affected := public.save_nutrition_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object(
      'Pazartesi', jsonb_build_object('items', E'Yulaf Ezmesi 80g\nTavuk Göğsü 200g', 'total', 1850),
      'Çarşamba',  jsonb_build_object('items', 'Yulaf:80, Tavuk:200',                 'total', 1900)
    )
  );

  if v_affected is distinct from 1 then
    raise exception 'BASARISIZ [save_nutrition_plan - kendi id]: beklenen 1 danisan, gelen %', v_affected;
  end if;

  select id into v_plan_id from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;
  if v_plan_id is null then
    raise exception 'BASARISIZ [save_nutrition_plan - kendi id]: aktif plan olusmadi';
  end if;

  select count(*) into v_rows from public.nutrition_plan_meals where plan_id = v_plan_id;
  if v_rows is distinct from 2 then
    raise exception 'BASARISIZ [save_nutrition_plan - kendi id]: beklenen 2 satir, gelen %', v_rows;
  end if;

  raise notice 'GECTI [save_nutrition_plan - danisan kendi id''si icin calistirabilir]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 34) save_nutrition_plan() BAŞKASININ id'siyle RLS hatası verir
-- (fonksiyon SECURITY INVOKER'dır ve hatayı YAKALAMAZ -> tüm çağrı geri alınır)
-- =============================================================================
begin;

delete from public.nutrition_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.save_nutrition_plan(
      array['33333333-3333-3333-3333-333333333333']::uuid[],
      jsonb_build_object('Pazartesi', jsonb_build_object('items', 'Yulaf 60g', 'total', 2100))
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [save_nutrition_plan - baskasinin id''si]: beklenen RLS ihlali, hata alinmadi';
  end if;

  raise notice 'GECTI [save_nutrition_plan - baskasinin id''si icin RLS hatasi verir]';
end $$;

rollback;


-- =============================================================================
-- BESLENME PLANI — 35) save_nutrition_plan() ATOMİKTİR
-- Karma liste (kendi id + başkasının id) verildiğinde hata yükselir ve
-- KENDİ planı da yazılmaz -- yani kısmi yazma olmaz.
-- =============================================================================
begin;

delete from public.nutrition_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_plans  int;
  v_meals  int;
begin
  begin
    perform public.save_nutrition_plan(
      array['22222222-2222-2222-2222-222222222222',
            '33333333-3333-3333-3333-333333333333']::uuid[],
      jsonb_build_object('Pazartesi', jsonb_build_object('items', 'Yulaf 80g', 'total', 1850))
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [save_nutrition_plan - atomiklik]: beklenen RLS ihlali, hata alinmadi';
  end if;

  -- plpgsql BEGIN/EXCEPTION bir subtransaction acar; hata yakalandiginda
  -- blogun ICINDEKI tum yazmalar (kendi planinin olusturulmasi dahil) geri alinir.
  select count(*) into v_plans from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222';
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [save_nutrition_plan - atomiklik]: kismi yazma olustu, % plan satiri kaldi', v_plans;
  end if;

  select count(*) into v_meals from public.nutrition_plan_meals m
    join public.nutrition_plans p on p.id = m.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222';
  if v_meals is distinct from 0 then
    raise exception 'BASARISIZ [save_nutrition_plan - atomiklik]: kismi yazma olustu, % ogun satiri kaldi', v_meals;
  end if;

  raise notice 'GECTI [save_nutrition_plan - atomik: kismi yazma yok]';
end $$;

rollback;


-- #############################################################################
-- FAZ 1b / ADIM 4 — MESAJLARIN KONUSMA ANAHTARI (client_id / read_at / kind)
-- (supabase/migrations/20260817140000_messages_conversation_key.sql)
--
-- DIKKAT: bu bolumdeki senaryolar mesaj SAYISINA degil ILISKISEL iddialara
-- (yabanci satir sayisi = 0, count > 0 gibi) dayanir -- npm run test:rls
-- reset'siz de kosabildigi ve e2e testleri ek satir birakabildigi icin sabit
-- mesaj sayimi KIRILGAN olurdu (bkz. seed.sql §8 yorumu).
-- #############################################################################


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 36) Danışan A -> gördüğü TÜM mesajların client_id'si kendisidir
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_foreign int;
begin
  select count(*) into v_foreign
  from public.messages
  where client_id <> '22222222-2222-2222-2222-222222222222';

  if v_foreign is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A - gordugu mesajlarin client_id si kendisi]: beklenen 0 yabanci client_id, gelen %', v_foreign;
  end if;
  raise notice 'GECTI [Danisan A - gordugu mesajlarin client_id si kendisi]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 37) Koç -> hem A hem B konuşmasının mesajlarını görür
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_a int;
  v_b int;
begin
  select count(*) into v_a from public.messages where client_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_b from public.messages where client_id = '33333333-3333-3333-3333-333333333333';

  if v_a <= 0 then
    raise exception 'BASARISIZ [Koc - Danisan A konusmasini gorur]: beklenen > 0, gelen %', v_a;
  end if;
  if v_b <= 0 then
    raise exception 'BASARISIZ [Koc - Danisan B konusmasini gorur]: beklenen > 0, gelen %', v_b;
  end if;
  raise notice 'GECTI [Koc - hem A hem B konusmasinin mesajlarini gorur]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 38) Danışan A -> client_id'yi Danışan B yaparak mesaj YAZAMAZ
-- Trigger messages_apply_conversation_key, gonderilen client_id turetilenle
-- eslesmiyorsa errcode 22023 ile hata verir (bkz. migration §6).
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_msg    text;
begin
  begin
    insert into public.messages (sender_id, receiver_id, client_id, message)
    values (
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      'RLS testi - yanlis client_id denemesi'
    );
  exception when others then
    v_caught := true;
    v_msg := sqlerrm;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - client_id Danisan B yaparak yazamaz]: beklenen trigger hatasi, hata alinmadi';
  end if;
  if v_msg not like '%client_id%' then
    raise exception 'BASARISIZ [Danisan A - client_id Danisan B yaparak yazamaz]: hata mesaji client_id icermiyor: %', v_msg;
  end if;
  raise notice 'GECTI [Danisan A - client_id Danisan B yaparak mesaj yazamaz]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 39) Danışan A -> client_id NULL gönderince trigger doğru türetir
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_id        uuid;
  v_client_id uuid;
begin
  insert into public.messages (sender_id, receiver_id, message)
  values (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'RLS testi - client_id turetme'
  )
  returning id, client_id into v_id, v_client_id;

  if v_id is null then
    raise exception 'BASARISIZ [Danisan A - client_id NULL gonderince turetilir]: insert basarisiz oldu';
  end if;
  if v_client_id is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [Danisan A - client_id NULL gonderince turetilir]: beklenen %, gelen %',
      '22222222-2222-2222-2222-222222222222'::uuid, v_client_id;
  end if;
  raise notice 'GECTI [Danisan A - client_id NULL gonderince dogru turetiliyor]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 40) ALICI kendisine gelen mesajın read_at'ini güncelleyebilir
-- KURULUM: postgres kimligiyle A'dan koca, read_at NULL bir mesaj eklenir;
-- set local role BUNDAN SONRA gelir.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, read_at)
values (
  'e0000000-0000-0000-0000-000000000040'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'RLS testi - okundu isaretleme (alici)',
  null
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_rows int;
begin
  update public.messages set read_at = now()
   where id = 'e0000000-0000-0000-0000-000000000040'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Koc(alici) - read_at gunceller]: beklenen 1 satir, etkilenen %', v_rows;
  end if;
  raise notice 'GECTI [Koc(alici) - kendine gelen mesajin read_at ini gunceller]';
end $$;

rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 41) GÖNDEREN read_at güncelleyemez (0 satır etkilenir)
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, read_at)
values (
  'e0000000-0000-0000-0000-000000000041'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'RLS testi - gonderen read_at guncelleme denemesi',
  null
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows int;
begin
  update public.messages set read_at = now()
   where id = 'e0000000-0000-0000-0000-000000000041'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan A(gonderen) - read_at guncelleyemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;
  raise notice 'GECTI [Danisan A(gonderen) - kendi gonderdigi mesajin read_at ini guncelleyemez]';
end $$;

rollback;


-- =============================================================================
-- MESAJLASMA (KONUSMA ANAHTARI) — 42) anon rolü messages tablosunu OKUYAMAZ
-- =============================================================================
begin;
set local role anon;
do $$
declare
  v_count  int;
  v_caught boolean := false;
begin
  begin
    select count(*) into v_count from public.messages;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - messages okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;
  raise notice 'GECTI [anon - messages tablosunu okuyamaz]';
end $$;
rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 43) Danışan KENDİ form check'lerini ve inceleme
-- alanlarını GÖRÜR (senaryo 6'nın pozitif eşi)
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes, status, coach_feedback, reviewed_at, reviewed_by)
values (
  'a0000000-0000-0000-0000-000000000043'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.00,
  'RLS testi - danisan kendi form checkini gorur',
  'reviewed'::public.form_check_status,
  'Koc geri bildirimi (gorunurluk testi)',
  now() - interval '1 day',
  '11111111-1111-1111-1111-111111111111'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_status   public.form_check_status;
  v_feedback text;
  v_by       uuid;
begin
  select status, coach_feedback, reviewed_by
    into v_status, v_feedback, v_by
    from public.form_checks
   where id = 'a0000000-0000-0000-0000-000000000043'::uuid;

  if v_status is distinct from 'reviewed'::public.form_check_status then
    raise exception 'BASARISIZ [Danisan A - kendi form checkini gorur]: satir okunamadi (status=%)', v_status;
  end if;
  if v_feedback is distinct from 'Koc geri bildirimi (gorunurluk testi)' then
    raise exception 'BASARISIZ [Danisan A - coach_feedback okuyabilmeli]: gelen %', v_feedback;
  end if;
  if v_by is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'BASARISIZ [Danisan A - reviewed_by okuyabilmeli]: gelen %', v_by;
  end if;

  raise notice 'GECTI [Danisan A - kendi form checkini ve inceleme alanlarini gorur]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 44) Danışan KENDİ satırına `coach_feedback` YAZAMAZ
-- (RLS satırı geçirir; form_checks_guard_review trigger'ı 42501 ile reddeder)
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values (
  'a0000000-0000-0000-0000-000000000044'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.10,
  'RLS testi - danisan coach_feedback yazma denemesi'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    update public.form_checks
       set coach_feedback = 'Kendime harika diyorum'
     where id = 'a0000000-0000-0000-0000-000000000044'::uuid;
  exception when insufficient_privilege then
    v_caught := true;
    v_state  := sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - coach_feedback yazamaz]: beklenen 42501, UPDATE BASARILI OLDU';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [Danisan A - coach_feedback yazamaz]: beklenen sqlstate 42501, gelen %', v_state;
  end if;

  raise notice 'GECTI [Danisan A - kendi form checkine coach_feedback YAZAMAZ (42501)]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 45) Danışan `status`'ü 'reviewed' YAPAMAZ
-- (bekleyen kuyruğu danışan boşaltamaz)
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values (
  'a0000000-0000-0000-0000-000000000045'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.20,
  'RLS testi - danisan status reviewed denemesi'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught   boolean := false;
  v_state    text;
  v_status   public.form_check_status;
  v_caught2  boolean := false;
begin
  -- 45a) status -> 'reviewed'
  begin
    update public.form_checks
       set status = 'reviewed'::public.form_check_status
     where id = 'a0000000-0000-0000-0000-000000000045'::uuid;
  exception when insufficient_privilege then
    v_caught := true;
    v_state  := sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [Danisan A - status reviewed yapamaz]: beklenen 42501, UPDATE BASARILI OLDU';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [Danisan A - status reviewed yapamaz]: beklenen sqlstate 42501, gelen %', v_state;
  end if;

  -- 45b) reviewed_at / reviewed_by taklidi de reddedilmeli
  begin
    update public.form_checks
       set reviewed_at = now(), reviewed_by = '11111111-1111-1111-1111-111111111111'
     where id = 'a0000000-0000-0000-0000-000000000045'::uuid;
  exception when insufficient_privilege then
    v_caught2 := true;
  end;

  if not v_caught2 then
    raise exception 'BASARISIZ [Danisan A - reviewed_at/reviewed_by taklidi]: beklenen 42501, UPDATE BASARILI OLDU';
  end if;

  select status into v_status from public.form_checks
   where id = 'a0000000-0000-0000-0000-000000000045'::uuid;
  if v_status is distinct from 'pending'::public.form_check_status then
    raise exception 'BASARISIZ [Danisan A - satir pending kalmali]: gelen %', v_status;
  end if;

  raise notice 'GECTI [Danisan A - status/reviewed_at/reviewed_by DEGISTIREMEZ (42501)]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 46) REGRESYON KORUMASI: sütun koruması danışanın KENDİ
-- alanlarını (notes / current_weight) güncellemesini ENGELLEMEZ
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values (
  'a0000000-0000-0000-0000-000000000046'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.30,
  'RLS testi - danisan kendi notunu duzeltir (eski)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows  int;
  v_notes text;
begin
  update public.form_checks
     set notes = 'RLS testi - duzeltilmis not', current_weight = 89.90
   where id = 'a0000000-0000-0000-0000-000000000046'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - kendi notunu duzeltebilir]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select notes into v_notes from public.form_checks
   where id = 'a0000000-0000-0000-0000-000000000046'::uuid;
  if v_notes is distinct from 'RLS testi - duzeltilmis not' then
    raise exception 'BASARISIZ [Danisan A - not guncellenmeli]: gelen %', v_notes;
  end if;

  raise notice 'GECTI [Danisan A - kendi notes/current_weight alanlarini HALA guncelleyebilir]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 47) KOÇ `coach_feedback` yazabilir ve `status`'ü
-- 'reviewed' yapabilir
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values (
  'a0000000-0000-0000-0000-000000000047'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.40,
  'RLS testi - koc inceleme yapar'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_rows     int;
  v_status   public.form_check_status;
  v_feedback text;
begin
  update public.form_checks
     set status = 'reviewed'::public.form_check_status,
         coach_feedback = 'Duruş iyi, bel çevresi hedefte.'
   where id = 'a0000000-0000-0000-0000-000000000047'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Koc - inceleme yapar]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select status, coach_feedback into v_status, v_feedback
    from public.form_checks where id = 'a0000000-0000-0000-0000-000000000047'::uuid;

  if v_status is distinct from 'reviewed'::public.form_check_status then
    raise exception 'BASARISIZ [Koc - status reviewed olmali]: gelen %', v_status;
  end if;
  if v_feedback is distinct from 'Duruş iyi, bel çevresi hedefte.' then
    raise exception 'BASARISIZ [Koc - coach_feedback yazilmali]: gelen %', v_feedback;
  end if;

  raise notice 'GECTI [Koc - coach_feedback yazar ve status u reviewed yapar]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 48) DENETİM İZİ SUNUCUDAN: koç 'reviewed' yapınca
-- `reviewed_at`/`reviewed_by` OTOMATİK dolar; koçun gönderdiği SAHTE değerler EZİLİR
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values (
  'a0000000-0000-0000-0000-000000000048'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.50,
  'RLS testi - denetim izi otomatik dolar'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_at   timestamptz;
  v_by   uuid;
begin
  -- Koç BİLEREK sahte bir tarih ve BAŞKA bir kimlik gönderiyor; ikisi de ezilmeli.
  update public.form_checks
     set status      = 'reviewed'::public.form_check_status,
         reviewed_at = timestamptz '2000-01-01 00:00:00+00',
         reviewed_by = '22222222-2222-2222-2222-222222222222'
   where id = 'a0000000-0000-0000-0000-000000000048'::uuid;

  select reviewed_at, reviewed_by into v_at, v_by
    from public.form_checks where id = 'a0000000-0000-0000-0000-000000000048'::uuid;

  if v_at is null then
    raise exception 'BASARISIZ [Koc - reviewed_at otomatik dolar]: NULL geldi';
  end if;
  if v_at <= timestamptz '2001-01-01 00:00:00+00' then
    raise exception 'BASARISIZ [Koc - sahte reviewed_at EZILMELI]: gelen %', v_at;
  end if;
  if v_by is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'BASARISIZ [Koc - reviewed_by auth.uid() olmali]: beklenen %, gelen %',
      '11111111-1111-1111-1111-111111111111'::uuid, v_by;
  end if;

  raise notice 'GECTI [Koc - reviewed_at/reviewed_by SUNUCUDA dolar, istemcinin gonderdigi degerler ezilir]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 49) 'reviewed' -> 'pending' dönüşünde denetim izi TEMİZLENİR
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes, status, coach_feedback, reviewed_at, reviewed_by)
values (
  'a0000000-0000-0000-0000-000000000049'::uuid,
  '22222222-2222-2222-2222-222222222222',
  90.60,
  'RLS testi - reviewed ten pending e donus',
  'reviewed'::public.form_check_status,
  'Ilk inceleme',
  now() - interval '2 days',
  '11111111-1111-1111-1111-111111111111'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_at     timestamptz;
  v_by     uuid;
  v_status public.form_check_status;
begin
  update public.form_checks
     set status = 'pending'::public.form_check_status
   where id = 'a0000000-0000-0000-0000-000000000049'::uuid;

  select status, reviewed_at, reviewed_by into v_status, v_at, v_by
    from public.form_checks where id = 'a0000000-0000-0000-0000-000000000049'::uuid;

  if v_status is distinct from 'pending'::public.form_check_status then
    raise exception 'BASARISIZ [Koc - pending e donus]: gelen status %', v_status;
  end if;
  if v_at is not null or v_by is not null then
    raise exception 'BASARISIZ [Koc - pending e donuste denetim izi temizlenmeli]: reviewed_at=%, reviewed_by=%', v_at, v_by;
  end if;

  raise notice 'GECTI [Koc - reviewed -> pending donusunde reviewed_at/reviewed_by temizlenir]';
end $$;

rollback;


-- =============================================================================
-- FORM CHECK INCELEME — 50) anon rolü form_checks tablosunu OKUYAMAZ
-- =============================================================================
begin;
set local role anon;
do $$
declare
  v_count  int;
  v_caught boolean := false;
begin
  begin
    select count(*) into v_count from public.form_checks;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [anon - form_checks okuyamaz]: beklenen permission denied, gelen v_count=%', v_count;
  end if;
  raise notice 'GECTI [anon - form_checks tablosunu okuyamaz]';
end $$;
rollback;


-- =============================================================================
-- TOPLAM ÖZET
-- Bu noktaya yalnızca YUKARIDAKİ 50 senaryonun HEPSİ GECTI verdiyse ulaşılır --
-- herhangi biri BASARISIZ olsaydı raise exception + ON_ERROR_STOP psql'i
-- daha önce sıfırdan farklı çıkış koduyla durdururdu.
--   * 1–19  : Faz 1a ve öncesi (profiles, notifications, form_checks, daily_logs,
--             workout_logs, messages, katalog)
--   * 20–27 : Faz 1b Adım 1 — workout_plans / workout_plan_exercises / save_workout_plan
--   * 28–35 : Faz 1b Adım 3a — nutrition_plans / nutrition_plan_meals / save_nutrition_plan
--   * 36–42 : Faz 1b Adım 4 — messages konuşma anahtarı (client_id / read_at / kind)
--   * 43–50 : Faz 1b Adım 5 — form_checks inceleme durumu (sütun koruması + denetim izi)
-- =============================================================================
do $$
begin
  raise notice 'TUM RLS TESTLERI GECTI (50 senaryo)';
end $$;
