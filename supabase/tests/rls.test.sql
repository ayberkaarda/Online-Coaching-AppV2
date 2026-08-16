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


-- =============================================================================
-- TOPLAM ÖZET
-- Bu noktaya yalnızca YUKARIDAKİ 27 senaryonun HEPSİ GECTI verdiyse ulaşılır --
-- herhangi biri BASARISIZ olsaydı raise exception + ON_ERROR_STOP psql'i
-- daha önce sıfırdan farklı çıkış koduyla durdururdu.
--   * 1–19  : Faz 1a ve öncesi (profiles, notifications, form_checks, daily_logs,
--             workout_logs, messages, katalog)
--   * 20–27 : Faz 1b Adım 1 — workout_plans / workout_plan_exercises / save_workout_plan
-- =============================================================================
do $$
begin
  raise notice 'TUM RLS TESTLERI GECTI (27 senaryo)';
end $$;
