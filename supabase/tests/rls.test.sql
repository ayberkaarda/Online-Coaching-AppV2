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
--
-- 2026-08-17 GÜNCELLEMESİ (AC-05 / Faz 1.5, bkz. 20260817160200_column_guards.sql):
-- Bu senaryo eskiden SERBEST bir metin ("RLS testi - Danisan A'dan koca bildirim")
-- yazıyordu. Danışan -> koç yolunda içerik SABİT ŞABLONA bağlandığı için test,
-- uygulamanın GERÇEKTEN gönderdiği payload'a çevrilmişti.
--
-- 2026-08-17 İKİNCİ GÜNCELLEMESİ (Faz 1.7, bkz. 20260817180000_program_submission_rpc.sql):
-- Danışanın koça DOĞRUDAN `insert into notifications` yapma yolu KAPATILDI
-- (`notifications_insert` politikasından `is_coach_profile(...)` dalı kalktı).
-- Bildirimi artık `submit_program_for_approval()` RPC'si SUNUCUDA yazıyor.
-- SENARYONUN KORUDUĞU ÜRÜN GARANTİSİ DEĞİŞMEDİ — "danışan programı gönderince
-- koç haberdar oluyor mu?" — yalnızca ölçüm noktası, uygulamanın bugün kullandığı
-- yola (RPC) taşındı. Doğrudan yazma yolunun KAPALI olduğu senaryo 78'de,
-- RPC'nin dönüş sözleşmesi senaryo 77'de ayrıca doğrulanır.
-- =============================================================================
-- MUTLAK DEĞİL, FARK (delta) ÖLÇÜLÜR: veritabanında bu bildirimden önceden
-- (E2E koşusu, gerçek kullanım, seed) satır olabilir; test veriden BAĞIMSIZ olmalı.
begin;

create temp table zz_notify_base as
select count(*) as n
  from public.notifications
 where client_id = '11111111-1111-1111-1111-111111111111'
   and message   = '🔔 Yeni bir antrenman programı onayınıza sunuldu.';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_row public.program_approvals;
begin
  select * into v_row
    from public.submit_program_for_approval(
      '22222222-2222-2222-2222-222222222222'::uuid,
      '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb
    );
  if v_row.id is null then
    raise exception 'BASARISIZ [Danisan A - program gonderimi]: onay satiri olusmadi';
  end if;
end $$;

-- Bildirim KOÇ adına yazıldığı için danışan onu kendi oturumunda GÖREMEZ
-- (`notifications_select` -> client_id = auth.uid()); sayım postgres ile yapılır.
reset role;
do $$
declare
  v_base int;
  v_now  int;
begin
  select n into v_base from zz_notify_base;
  select count(*) into v_now
    from public.notifications
   where client_id = '11111111-1111-1111-1111-111111111111'
     and message   = '🔔 Yeni bir antrenman programı onayınıza sunuldu.';

  if (v_now - v_base) is distinct from 1 then
    raise exception 'BASARISIZ [Danisan A - koca bildirim gider]: beklenen +1 satir, gelen +% -- koc programdan HABERSIZ kalir', (v_now - v_base);
  end if;
  raise notice 'GECTI [Danisan A - program gonderiminde koca bildirim gider (RPC yoluyla)]';
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


-- #############################################################################
-- ## FAZ 1.5 — GÜVENLİK DENETİMİ REGRESYON SENARYOLARI (51–70)               ##
-- ##                                                                         ##
-- ## Kaynak: docs/security/findings-access-control.md §6 (G-01 … G-26).      ##
-- ## Her senaryonun başlığında karşılık geldiği boşluk numarası (G-xx) ve    ##
-- ## bulgu numarası (AC-xx) belirtilmiştir.                                  ##
-- ##                                                                         ##
-- ## Düzeltmeler:                                                            ##
-- ##   20260817160000_program_approval_guard.sql   (AC-01, AC-07)            ##
-- ##   20260817160100_signup_role_hardening.sql    (AC-02)                   ##
-- ##   20260817160200_column_guards.sql            (AC-04, AC-05, AC-08,     ##
-- ##                                                AC-09, AC-10)            ##
-- #############################################################################


-- =============================================================================
-- PROGRAM ONAYI — 51) [G-01 / AC-01] Danışan `status='approved'` ile INSERT YAPAMAZ
-- Canlı sömürü W5'in kapandığını kanıtlar: danışan tek istekle kendi programını
-- "koç onayladı" diye işaretleyemez.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    insert into public.program_approvals (client_id, workout_data, status)
    values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"sahte"}'::jsonb, 'approved');
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [G-01 Danisan approved INSERT edemez]: beklenen 42501, hata ALINMADI (onay kapisi ACIK!)';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-01 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [G-01 Danisan program_approvals a status=approved ile INSERT edemez (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI — 52) [G-02 / AC-01+AC-07] Danışan `reviewed_by` / `reviewed_at`
-- BELİRLEYEMEZ (status 'pending' olsa bile)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught_by boolean := false;
  v_caught_at boolean := false;
begin
  begin
    insert into public.program_approvals (client_id, workout_data, status, reviewed_by)
    values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"sahte"}'::jsonb, 'pending',
            '11111111-1111-1111-1111-111111111111');
  exception when insufficient_privilege then
    v_caught_by := true;
  end;

  begin
    insert into public.program_approvals (client_id, workout_data, status, reviewed_at)
    values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"sahte"}'::jsonb, 'pending', now());
  exception when insufficient_privilege then
    v_caught_at := true;
  end;

  if not v_caught_by then
    raise exception 'BASARISIZ [G-02 reviewed_by belirlenemez]: beklenen 42501, hata ALINMADI';
  end if;
  if not v_caught_at then
    raise exception 'BASARISIZ [G-02 reviewed_at belirlenemez]: beklenen 42501, hata ALINMADI';
  end if;
  raise notice 'GECTI [G-02 Danisan reviewed_by / reviewed_at belirleyemez (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI — 53) POZİTİF KONTROL: danışan NORMAL ('pending') onay talebini
-- HÂLÂ açabilir — `useSubmitProgramForApproval` (useProgramApprovals.ts:51-56)
-- payload'ının birebir aynısı. Düzeltmenin uygulamayı kırmadığını kanıtlar.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows   int;
  v_status public.approval_status;
  v_by     uuid;
  v_at     timestamptz;
begin
  insert into public.program_approvals (client_id, workout_data, status)
  values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb, 'pending');
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan pending onay talebi acar]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select status, reviewed_by, reviewed_at into v_status, v_by, v_at
    from public.program_approvals
   where client_id = '22222222-2222-2222-2222-222222222222'
     and workout_data = '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb;

  if v_status is distinct from 'pending'::public.approval_status or v_by is not null or v_at is not null then
    raise exception 'BASARISIZ [Danisan pending onay talebi]: status=%, reviewed_by=%, reviewed_at=%', v_status, v_by, v_at;
  end if;
  raise notice 'GECTI [POZITIF - Danisan normal pending onay talebini HALA acabilir]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI — 54) [G-03 / AC-01] Danışan kendi `pending` satırını SİLİP
-- `approved` olarak yeniden EKLEYEMEZ (canlı sömürü W7'nin kapanışı)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_deleted int;
  v_caught  boolean := false;
begin
  -- 1. adım: kendi BEKLEYEN talebini geri çekebilir (bilinçli olarak serbest).
  delete from public.program_approvals
   where client_id = '22222222-2222-2222-2222-222222222222'
     and status = 'pending'::public.approval_status;
  get diagnostics v_deleted = row_count;

  if v_deleted < 1 then
    raise exception 'BASARISIZ [G-03 hazirlik]: danisan kendi pending talebini silemedi (silinen=%)', v_deleted;
  end if;

  -- 2. adım: SÖMÜRÜ — aynı satırı 'approved' olarak geri yazmayı dener.
  begin
    insert into public.program_approvals (client_id, workout_data, status, reviewed_by, reviewed_at)
    values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"sahte"}'::jsonb, 'approved',
            '11111111-1111-1111-1111-111111111111', now());
  exception when insufficient_privilege then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [G-03 sil-ve-yeniden-ekle]: beklenen 42501, hata ALINMADI (W7 sömürüsü HALA acik!)';
  end if;
  raise notice 'GECTI [G-03 Danisan pending kaydini silip approved olarak yeniden EKLEYEMEZ]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI — 55) [AC-01/DELETE] Danışan KARARA BAĞLANMIŞ ('approved')
-- kaydı SİLEMEZ — denetim izi korunur (yeni program_approvals_delete politikası)
-- KURULUM: postgres kimliğiyle tutarlı bir 'approved' satır eklenir.
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status, reviewed_by, reviewed_at)
values (
  'b0000000-0000-0000-0000-000000000055'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. Squat - 5x5"}'::jsonb,
  'approved'::public.approval_status,
  '11111111-1111-1111-1111-111111111111',
  now() - interval '1 day'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_deleted int;
begin
  delete from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000055'::uuid;
  get diagnostics v_deleted = row_count;

  if v_deleted is distinct from 0 then
    raise exception 'BASARISIZ [Danisan approved kaydi silemez]: beklenen 0 satir, silinen % (denetim izi silinebiliyor!)', v_deleted;
  end if;
  raise notice 'GECTI [Danisan karara baglanmis (approved) onay kaydini SILEMEZ - denetim izi korunur]';
end $$;

rollback;


-- =============================================================================
-- PROGRAM ONAYI — 56) [G-06 / AC-07] KOÇ `status`'ü güncelleyebilir ve
-- `reviewed_by` / `reviewed_at` SUNUCUDAN dolar; koçun gönderdiği SAHTE değerler
-- EZİLİR (canlı kanıt P8'in kapanışı). `useApproveProgram` payload'ıyla birebir.
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000056'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. Deadlift - 4x5"}'::jsonb,
  'pending'::public.approval_status
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_rows   int;
  v_status public.approval_status;
  v_by     uuid;
  v_at     timestamptz;
begin
  -- Koç BİLEREK sahte bir kimlik ve geçmiş bir tarih gönderiyor; ikisi de ezilmeli.
  update public.program_approvals
     set status      = 'approved'::public.approval_status,
         reviewed_by = '22222222-2222-2222-2222-222222222222',
         reviewed_at = timestamptz '2000-01-01 00:00:00+00'
   where id = 'b0000000-0000-0000-0000-000000000056'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [G-06 Koc onaylar]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select status, reviewed_by, reviewed_at into v_status, v_by, v_at
    from public.program_approvals where id = 'b0000000-0000-0000-0000-000000000056'::uuid;

  if v_status is distinct from 'approved'::public.approval_status then
    raise exception 'BASARISIZ [G-06 status]: beklenen approved, gelen %', v_status;
  end if;
  if v_by is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'BASARISIZ [G-06 reviewed_by SUNUCUDAN dolmali]: beklenen %, gelen %',
      '11111111-1111-1111-1111-111111111111'::uuid, v_by;
  end if;
  if v_at is null or v_at <= timestamptz '2001-01-01 00:00:00+00' then
    raise exception 'BASARISIZ [G-06 sahte reviewed_at EZILMELI]: gelen %', v_at;
  end if;
  raise notice 'GECTI [G-06 Koc onaylar; reviewed_by/reviewed_at SUNUCUDA dolar, sahte degerler ezilir]';
end $$;

rollback;


-- =============================================================================
-- PROGRAM ONAYI — 57) [AC-01] Danışan mevcut satırın `status`'ünü UPDATE ile
-- değiştiremez (canlı kanıt W6; RLS + trigger iki katmanlı savunma)
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows int;
begin
  update public.program_approvals
     set status = 'approved'::public.approval_status
   where client_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan status UPDATE edemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;
  raise notice 'GECTI [Danisan mevcut onay kaydinin status unu UPDATE ile degistiremez]';
end $$;
rollback;


-- =============================================================================
-- MESAJLASMA — 58) [G-07 / AC-04] ALICI mesaj GÖVDESİNİ değiştiremez
-- Canlı kanıt M1 (etkilenen=3) kapanır. `messages` tablosunda `edited_at`
-- olmadığı için tahrifat fark edilemezdi.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message)
values (
  'e0000000-0000-0000-0000-000000000058'::uuid,
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Kocun orijinal mesaji'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    update public.messages set message = 'TAHRIF EDILMIS METIN'
     where id = 'e0000000-0000-0000-0000-000000000058'::uuid;
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [G-07 alici govdeyi degistiremez]: beklenen 42501, hata ALINMADI';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-07 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [G-07 Alici kendisine gelen mesajin govdesini DEGISTIREMEZ (42501)]';
end $$;

rollback;


-- =============================================================================
-- MESAJLASMA — 59) [G-08 / AC-04] ALICI `kind` / `created_at` değiştiremez
-- Canlı kanıt M5 (etkilenen=3) kapanır.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message)
values (
  'e0000000-0000-0000-0000-000000000059'::uuid,
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Kind ve created_at tahrifat denemesi'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught_kind boolean := false;
  v_caught_date boolean := false;
begin
  begin
    update public.messages set kind = 'system'::public.message_kind
     where id = 'e0000000-0000-0000-0000-000000000059'::uuid;
  exception when insufficient_privilege then
    v_caught_kind := true;
  end;

  begin
    update public.messages set created_at = timestamptz '2000-01-01 00:00:00+00'
     where id = 'e0000000-0000-0000-0000-000000000059'::uuid;
  exception when insufficient_privilege then
    v_caught_date := true;
  end;

  if not v_caught_kind then
    raise exception 'BASARISIZ [G-08 kind degistirilemez]: beklenen 42501, hata ALINMADI';
  end if;
  if not v_caught_date then
    raise exception 'BASARISIZ [G-08 created_at degistirilemez]: beklenen 42501, hata ALINMADI';
  end if;
  raise notice 'GECTI [G-08 Alici kind / created_at alanlarini DEGISTIREMEZ (42501)]';
end $$;

rollback;


-- =============================================================================
-- MESAJLASMA — 60) POZİTİF KONTROL: ALICI `read_at` + `is_read` alanlarını HÂLÂ
-- güncelleyebilir — `useMarkConversationRead` (useMessages.ts:269-277) payload'ı.
-- Sütun korumasının okundu işaretlemeyi kırmadığını kanıtlar.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, read_at)
values (
  'e0000000-0000-0000-0000-000000000060'::uuid,
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Okundu isaretleme regresyon testi',
  null
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows int;
  v_at   timestamptz;
  v_read boolean;
begin
  update public.messages set read_at = now(), is_read = true
   where id = 'e0000000-0000-0000-0000-000000000060'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Alici read_at/is_read gunceller]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select read_at, is_read into v_at, v_read
    from public.messages where id = 'e0000000-0000-0000-0000-000000000060'::uuid;
  if v_at is null or v_read is distinct from true then
    raise exception 'BASARISIZ [Alici read_at/is_read yazilmali]: read_at=%, is_read=%', v_at, v_read;
  end if;
  raise notice 'GECTI [POZITIF - Alici read_at + is_read alanlarini HALA guncelleyebilir]';
end $$;

rollback;


-- =============================================================================
-- MESAJLASMA — 61) [G-09 / AC-04] Danışan `kind='system'` mesaj ÜRETEMEZ
-- Canlı kanıt M4 kapanır. 'system' etiketi "bunu UYGULAMA yazdı" demektir;
-- insan eliyle üretilebilirse etiket yalan söyler.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    insert into public.messages (sender_id, receiver_id, message, kind)
    values ('22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111',
            'SISTEM: hesabiniz askiya alindi.',
            'system'::public.message_kind);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [G-09 danisan system mesaj uretemez]: beklenen 42501, hata ALINMADI';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-09 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [G-09 Danisan kind=system mesaj URETEMEZ (42501)]';
end $$;
rollback;


-- =============================================================================
-- BILDIRIM — 62) [G-10 / AC-05] Danışan koça SERBEST METİN yazamaz
-- Canlı kanıt P3 ("ACIL: Sifreni sifirla" + kötü amaçlı bağlantı) kapanır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught_msg   boolean := false;
  v_caught_title boolean := false;
  v_state        text;
begin
  -- Kimlik avı denemesi: şablon dışı gövde.
  begin
    insert into public.notifications (client_id, title, message)
    values ('11111111-1111-1111-1111-111111111111',
            'ACIL: Sifreni sifirla',
            'https://kotu-site.example/reset');
  exception when insufficient_privilege then
    v_caught_msg := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  -- Şablon gövdesi DOĞRU ama `title` ekleniyor -> yine reddedilmeli.
  begin
    insert into public.notifications (client_id, title, message)
    values ('11111111-1111-1111-1111-111111111111',
            'Sahte baslik',
            '🔔 Yeni bir antrenman programı onayınıza sunuldu.');
  exception when insufficient_privilege then
    v_caught_title := true;
  end;

  if not v_caught_msg then
    raise exception 'BASARISIZ [G-10 serbest metin reddedilmeli]: beklenen 42501, hata ALINMADI (kimlik avi yuzeyi ACIK!)';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-10 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  if not v_caught_title then
    raise exception 'BASARISIZ [G-10 sablon disi title reddedilmeli]: beklenen 42501, hata ALINMADI';
  end if;
  raise notice 'GECTI [G-10 Danisan koca SERBEST METIN bildirim yazamaz (42501)]';
end $$;
rollback;


-- =============================================================================
-- BILDIRIM — 63) POZİTİF KONTROL: KOÇ serbest metinli duyuru yazmaya DEVAM eder
-- (`useSendNotification`, useNotifications.ts:81-88). Şablon kısıtı yalnızca
-- danışan -> koç yolundadır; koçun ürün işlevi kırılmamalıdır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_rows int;
begin
  insert into public.notifications (client_id, title, message)
  values ('22222222-2222-2222-2222-222222222222',
          'Haftalik Duyuru',
          'Bu hafta bacak gunu Cumaya alindi.');
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Koc serbest duyuru yazar]: beklenen 1 satir, etkilenen %', v_rows;
  end if;
  raise notice 'GECTI [POZITIF - Koc serbest metinli duyuruyu HALA yazabilir]';
end $$;
rollback;


-- =============================================================================
-- BILDIRIM — 64) [G-11 / AC-10] Danışan KENDİ bildiriminin `title`/`message`
-- metnini değiştiremez. Canlı kanıt P4 (etkilenen=3) kapanır.
-- =============================================================================
begin;

insert into public.notifications (id, client_id, title, message)
values (
  'c0000000-0000-0000-0000-000000000064'::uuid,
  '22222222-2222-2222-2222-222222222222',
  'Kocun duyurusu',
  'Bu hafta protein hedefin 150g.'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught_msg   boolean := false;
  v_caught_title boolean := false;
begin
  begin
    update public.notifications set message = 'TAHRIF EDILMIS DUYURU'
     where id = 'c0000000-0000-0000-0000-000000000064'::uuid;
  exception when insufficient_privilege then
    v_caught_msg := true;
  end;

  begin
    update public.notifications set title = 'TAHRIF EDILMIS BASLIK'
     where id = 'c0000000-0000-0000-0000-000000000064'::uuid;
  exception when insufficient_privilege then
    v_caught_title := true;
  end;

  if not v_caught_msg or not v_caught_title then
    raise exception 'BASARISIZ [G-11 bildirim metni degistirilemez]: message yakalandi=%, title yakalandi=%',
      v_caught_msg, v_caught_title;
  end if;
  raise notice 'GECTI [G-11 Danisan kendi bildiriminin title/message metnini DEGISTIREMEZ (42501)]';
end $$;

rollback;


-- =============================================================================
-- BILDIRIM — 65) POZİTİF KONTROL: danışan kendi bildirimini `is_read` ile
-- okundu işaretlemeye DEVAM eder (`useMarkNotificationRead`, useNotifications.ts:53)
-- =============================================================================
begin;

insert into public.notifications (id, client_id, message)
values (
  'c0000000-0000-0000-0000-000000000065'::uuid,
  '22222222-2222-2222-2222-222222222222',
  'Okundu isaretleme regresyon testi'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows int;
  v_read boolean;
begin
  update public.notifications set is_read = true
   where id = 'c0000000-0000-0000-0000-000000000065'::uuid;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan bildirimi okundu isaretler]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select is_read into v_read from public.notifications
   where id = 'c0000000-0000-0000-0000-000000000065'::uuid;
  if v_read is distinct from true then
    raise exception 'BASARISIZ [Danisan is_read yazmali]: gelen %', v_read;
  end if;
  raise notice 'GECTI [POZITIF - Danisan kendi bildirimini is_read ile okundu isaretleyebilir]';
end $$;

rollback;


-- =============================================================================
-- PROFIL — 66) [G-13 / AC-08] Danışan `current_streak` / `last_checkin_at`
-- alanlarını DOĞRUDAN yazamaz. Canlı kanıt R11 (streak=9999) kapanır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught_streak  boolean := false;
  v_caught_checkin boolean := false;
  v_state          text;
begin
  begin
    update public.profiles set current_streak = 9999
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught_streak := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  begin
    update public.profiles set last_checkin_at = now() + interval '10 days'
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught_checkin := true;
  end;

  if not v_caught_streak then
    raise exception 'BASARISIZ [G-13 current_streak yazilamaz]: beklenen 42501, hata ALINMADI (seri sahtelenebilir!)';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-13 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  if not v_caught_checkin then
    raise exception 'BASARISIZ [G-13 last_checkin_at yazilamaz]: beklenen 42501, hata ALINMADI';
  end if;
  raise notice 'GECTI [G-13 Danisan current_streak / last_checkin_at alanlarini DOGRUDAN yazamaz (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROFIL — 67) POZİTİF KONTROL: `increment_streak()` RPC'si HÂLÂ ÇALIŞIR
-- Sütun sabitleme mekanizmasının (`is_end_user_write()` -> `current_user`)
-- SECURITY DEFINER RPC'yi ENGELLEMEDİĞİNİ kanıtlar. Bu senaryo, mekanizma
-- seçiminin (GUC bayrağı yerine current_user) doğruluğunun testidir.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_streak  integer;
  v_db_at   timestamptz;
  v_db_val  integer;
begin
  select public.increment_streak('22222222-2222-2222-2222-222222222222'::uuid) into v_streak;

  if v_streak is null or v_streak < 1 then
    raise exception 'BASARISIZ [increment_streak calisir]: donen deger %', v_streak;
  end if;

  select current_streak, last_checkin_at into v_db_val, v_db_at
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';

  if v_db_val is distinct from v_streak then
    raise exception 'BASARISIZ [increment_streak yazmali]: rpc=%, db=%', v_streak, v_db_val;
  end if;
  if v_db_at is null or v_db_at < now() - interval '1 minute' then
    raise exception 'BASARISIZ [increment_streak last_checkin_at tazelemeli]: gelen %', v_db_at;
  end if;
  raise notice 'GECTI [POZITIF - increment_streak() RPC si sutun sabitlemeye RAGMEN calisir (streak=%)]', v_streak;
end $$;
rollback;


-- =============================================================================
-- PROFIL — 68) [G-14 / AC-09] Danışan `profiles.email` alanını değiştiremez
-- Canlı kanıt P9 (email=sahte@example.com) kapanır; koç panelinde görünen
-- e-posta her zaman `auth.users` ile eşleşir.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
  v_email  text;
begin
  begin
    update public.profiles set email = 'sahte@example.com'
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [G-14 email degistirilemez]: beklenen 42501, hata ALINMADI';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-14 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  select email into v_email from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if v_email is distinct from 'client1@example.com' then
    raise exception 'BASARISIZ [G-14 email degismemeli]: gelen %', v_email;
  end if;
  raise notice 'GECTI [G-14 Danisan profiles.email alanini DEGISTIREMEZ (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROFIL — 69) POZİTİF KONTROL: danışan `avatar_path` ve `full_name` alanlarını
-- HÂLÂ güncelleyebilir (`useUploadAvatar`, useProfile.ts:99-101). Sütun
-- sabitlemenin profil düzenlemeyi kırmadığını kanıtlar.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows int;
  v_path text;
begin
  update public.profiles
     set avatar_path = '22222222-2222-2222-2222-222222222222-1700000000.png',
         full_name   = 'Ahmet Y.'
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [Danisan avatar_path gunceller]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  select avatar_path into v_path from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if v_path is distinct from '22222222-2222-2222-2222-222222222222-1700000000.png' then
    raise exception 'BASARISIZ [Danisan avatar_path yazilmali]: gelen %', v_path;
  end if;
  raise notice 'GECTI [POZITIF - Danisan avatar_path / full_name alanlarini HALA guncelleyebilir]';
end $$;
rollback;


-- =============================================================================
-- KAYIT (SIGNUP) — 70) [G-16 / AC-02] `raw_user_meta_data.role='coach'` ile
-- oluşan kullanıcı `client` olur.
--
-- Bu senaryo doğrudan `auth.users`'a yazar (postgres kimliğiyle) çünkü GoTrue'nun
-- `/auth/v1/signup` uç noktası `data` alanını AYNEN buraya koyar — yani bu satır,
-- saldırganın gönderebileceği payload'ın veritabanındaki tam karşılığıdır.
-- `full_name` metadata'sının HÂLÂ okunduğu da doğrulanır (yalnızca `role` yok sayılır).
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated',
  'authenticated',
  'attacker@example.com',
  'x',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Saldirgan","role":"coach"}'::jsonb,
  now(), now(), '', '', '', ''
);

do $$
declare
  v_role public.user_role;
  v_name text;
begin
  select role, full_name into v_role, v_name
    from public.profiles where id = '99999999-9999-9999-9999-999999999999';

  if v_role is null then
    raise exception 'BASARISIZ [G-16 kurulum]: handle_new_user profil olusturmadi (trigger bagli mi?)';
  end if;
  if v_role is distinct from 'client'::public.user_role then
    raise exception 'BASARISIZ [G-16 metadata rolu YOK SAYILMALI]: beklenen client, gelen % (YETKI YUKSELTME ACIK!)', v_role;
  end if;
  if v_name is distinct from 'Saldirgan' then
    raise exception 'BASARISIZ [G-16 full_name metadata si okunmali]: beklenen Saldirgan, gelen %', v_name;
  end if;
  raise notice 'GECTI [G-16 raw_user_meta_data.role=coach YOK SAYILIR; yeni kullanici client olur]';
end $$;

rollback;


-- #############################################################################
-- ## FAZ 1.5 — GRUP 5: YETKİ SÖKÜMÜ VE FORCE RLS (71–76)                     ##
-- ##                                                                         ##
-- ## Düzeltme: 20260817170000_force_rls_and_grants.sql                       ##
-- ## Boşluklar: G-17 (AC-03), G-18 (AC-06)                                   ##
-- #############################################################################


-- =============================================================================
-- YETKI — 71) [G-17 / AC-03] `authenticated` rolü TRUNCATE EDEMEZ
--
-- Düzeltmeden ÖNCE bu üç ifade de GEÇİYORDU. En yıkıcısı ilkidir: `profiles`
-- doğrudan truncate edilemiyordu (0A000, FK), ama `cascade` ile 11 tabloya
-- yayılıp TÜM veritabanını siliyordu. TRUNCATE **RLS'e tabi değildir** —
-- satır politikaları hiç çalışmaz.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_tbl    text;
  v_stmt   text;
  v_caught boolean;
  v_state  text;
begin
  foreach v_tbl in array array['public.profiles cascade', 'public.messages', 'public.form_checks']
  loop
    v_caught := false;
    v_stmt   := 'truncate table ' || v_tbl;
    begin
      execute v_stmt;
    exception when insufficient_privilege then
      v_caught := true;
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if not v_caught then
      raise exception 'BASARISIZ [G-17 TRUNCATE reddedilmeli]: "%" GECTI -- RLS BAYPAS YOLU ACIK!', v_stmt;
    end if;
    if v_state is distinct from '42501' then
      raise exception 'BASARISIZ [G-17 hata kodu / %]: beklenen 42501, gelen %', v_tbl, v_state;
    end if;
  end loop;
  raise notice 'GECTI [G-17 authenticated TRUNCATE edemez: profiles cascade / messages / form_checks (42501)]';
end $$;
rollback;


-- =============================================================================
-- YETKI — 72) [G-17b / AC-03] `authenticated` rolü TRIGGER kuramaz, tabloyu
-- ALTER edemez
--
-- TRIGGER yetkisi düzeltmeden ÖNCE gerçekten AÇIKTI: `create trigger ... on
-- public.messages` hatasız geçiyordu — yani kullanıcı, her INSERT'te kendi
-- kodunu çalıştıran bir trigger kurabiliyordu.
--
-- Not: `alter table ... add foreign key` zaten SAHİPLİK ister (authenticated
-- hiçbir tabloyu sahiplenmez), yani bu dal REFERENCES yetkisini TEK BAŞINA
-- ölçmez; REFERENCES'ın gerçekten sökülmüş olduğu senaryo 73'te
-- `has_table_privilege` ile doğrudan doğrulanır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_trg_caught boolean := false;
  v_alt_caught boolean := false;
  v_state      text;
begin
  begin
    execute 'create trigger zz_evil_trg before insert on public.messages '
         || 'for each row execute function public.set_updated_at()';
  exception when insufficient_privilege then
    v_trg_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_trg_caught then
    raise exception 'BASARISIZ [G-17b CREATE TRIGGER reddedilmeli]: hata ALINMADI -- TRIGGER yetkisi ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [G-17b trigger hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  begin
    execute 'alter table public.workout_logs add constraint zz_evil_fk '
         || 'foreign key (client_id) references public.profiles(id)';
  exception when insufficient_privilege then
    v_alt_caught := true;
  end;

  if not v_alt_caught then
    raise exception 'BASARISIZ [G-17b ALTER TABLE reddedilmeli]: hata ALINMADI';
  end if;
  raise notice 'GECTI [G-17b authenticated CREATE TRIGGER / ALTER TABLE ADD FK yapamaz (42501)]';
end $$;
rollback;


-- =============================================================================
-- YETKI — 73) [G-17 / AC-03] Toplu grant denetimi — DİNAMİK
--
-- Tablo listesi `pg_tables`'tan okunur: gelecekte eklenen bir tablo bu üç
-- yetkiyi (Supabase'in `alter default privileges` varsayılanından) geri
-- kazanırsa bu senaryo KIRILIR. Migration'ın (b) adımı tam olarak bunu
-- engellemek içindir.
--
-- POZİTİF KONTROL de aynı blokta: select/insert/update/delete HÂLÂ durmalı —
-- aksi hâlde "güvenli ama çalışmayan" bir veritabanı üretmiş olurduk.
-- =============================================================================
begin;
do $$
declare
  v_leak  text;
  v_miss  text;
  v_tabs  int;
begin
  select count(*) into v_tabs from pg_tables where schemaname = 'public';
  if v_tabs < 13 then
    raise exception 'BASARISIZ [G-17 kurulum]: public semada beklenenden az tablo var (%)', v_tabs;
  end if;

  select string_agg(format('%s/%s/%s', g.role_name, t.tablename, p.priv), ', ' order by t.tablename)
    into v_leak
    from pg_tables t
    cross join (values ('authenticated'), ('anon')) as g(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where t.schemaname = 'public'
     and has_table_privilege(g.role_name, format('public.%I', t.tablename), p.priv);

  if v_leak is not null then
    raise exception 'BASARISIZ [G-17 D/x/t yetkisi hala acik]: %', v_leak;
  end if;

  select string_agg(format('%s/%s', t.tablename, p.priv), ', ' order by t.tablename)
    into v_miss
    from pg_tables t
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where t.schemaname = 'public'
     and not has_table_privilege('authenticated', format('public.%I', t.tablename), p.priv);

  if v_miss is not null then
    raise exception 'BASARISIZ [G-17 POZITIF KONTROL]: authenticated in normal yetkileri KAYIP -> %', v_miss;
  end if;

  raise notice 'GECTI [G-17 % public tablosunda authenticated/anon icin TRUNCATE+REFERENCES+TRIGGER YOK; S/I/U/D korunuyor]', v_tabs;
end $$;
rollback;


-- =============================================================================
-- YETKI — 74) [G-18 / AC-06] Her `public` tablosunda FORCE ROW LEVEL SECURITY
--
-- Tablo listesi yine DİNAMİKTİR: ileride eklenen bir tabloda
-- `alter table ... force row level security` unutulursa bu senaryo kırılır.
-- RLS'in kendisinin (relrowsecurity) açık olduğu da aynı blokta doğrulanır —
-- FORCE, RLS kapalıyken hiçbir anlam ifade etmez.
-- =============================================================================
begin;
do $$
declare
  v_no_force text;
  v_no_rls   text;
  v_count    int;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_no_force
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relforcerowsecurity;

  if v_no_force is not null then
    raise exception 'BASARISIZ [G-18 FORCE RLS kapali tablolar]: %', v_no_force;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_no_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_no_rls is not null then
    raise exception 'BASARISIZ [G-18 RLS kapali tablolar]: %', v_no_rls;
  end if;

  select count(*) into v_count
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r';

  raise notice 'GECTI [G-18 % public tablosunda relrowsecurity=true VE relforcerowsecurity=true]', v_count;
end $$;
rollback;


-- =============================================================================
-- YETKI — 75) POZİTİF KONTROL: FORCE RLS AÇIKKEN yeni kullanıcı kaydı
-- (`handle_new_user`) HÂLÂ ÇALIŞIR
--
-- Bu senaryonun varlık sebebi: `handle_new_user()` `SECURITY DEFINER`'dır ve
-- tablo sahibi `postgres` olarak `public.profiles`'a INSERT eder. Kayıt anında
-- `auth.uid()` NULL'dır; `profiles_insert_coach` politikası `is_coach()` ister.
-- FORCE RLS sahibi de politikalara soksaydı HER KAYIT (ve `db reset` seed'i)
-- çökerdi. `postgres` rolündeki `rolbypassrls = t` bunu engeller — test
-- bunu ÖNCE doğrular, sonra akışı canlı çalıştırır.
--
-- Gerçek GoTrue yolu (`supabase_auth_admin`, bypassrls = f) ayrıca elle
-- doğrulanmıştır; oradaki bypass fonksiyonun DEFINER'ı (`postgres`) üzerinden
-- gelir, çağıran rolden değil.
-- =============================================================================
begin;

do $$
declare
  v_force  boolean;
  v_bypass boolean;
begin
  select c.relforcerowsecurity into v_force
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'profiles';
  if v_force is not true then
    raise exception 'BASARISIZ [75 kurulum]: profiles tablosunda FORCE RLS kapali -- bu senaryo anlamsiz';
  end if;

  select rolbypassrls into v_bypass from pg_roles
   where rolname = (select pg_get_userbyid(relowner) from pg_class where oid = 'public.profiles'::regclass);
  if v_bypass is not true then
    raise exception 'BASARISIZ [75 varsayim]: profiles sahibi artik BYPASSRLS degil -- handle_new_user FORCE RLS ile kirilabilir, migration yeniden degerlendirilmeli';
  end if;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '88888888-8888-8888-8888-888888888888',
  'authenticated', 'authenticated', 'forcetest@example.com', 'x', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Force Test"}'::jsonb,
  now(), now(), '', '', '', ''
);

do $$
declare
  v_role  public.user_role;
  v_name  text;
  v_email text;
begin
  select role, full_name, email into v_role, v_name, v_email
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';

  if v_role is null then
    raise exception 'BASARISIZ [75 handle_new_user FORCE RLS ile KIRILDI]: profil olusmadi -- KAYIT AKISI TAMAMEN OLU';
  end if;
  if v_role is distinct from 'client'::public.user_role then
    raise exception 'BASARISIZ [75 rol]: beklenen client, gelen %', v_role;
  end if;
  if v_name is distinct from 'Force Test' or v_email is distinct from 'forcetest@example.com' then
    raise exception 'BASARISIZ [75 alanlar]: full_name=%, email=%', v_name, v_email;
  end if;
  raise notice 'GECTI [POZITIF - FORCE RLS acikken handle_new_user yeni kullanici kaydini HALA olusturuyor]';
end $$;

-- `sync_profile_email()` de aynı sahiplik yolundan geçer: FORCE altında
-- `public.profiles` UPDATE'i hâlâ yürümeli.
update auth.users set email = 'forcetest2@example.com'
 where id = '88888888-8888-8888-8888-888888888888';

do $$
declare
  v_email text;
begin
  select email into v_email from public.profiles
   where id = '88888888-8888-8888-8888-888888888888';
  if v_email is distinct from 'forcetest2@example.com' then
    raise exception 'BASARISIZ [75 sync_profile_email FORCE RLS ile KIRILDI]: gelen %', v_email;
  end if;
  raise notice 'GECTI [POZITIF - FORCE RLS acikken sync_profile_email() profiles.email i HALA esitliyor]';
end $$;

rollback;


-- =============================================================================
-- YETKI — 76) POZİTİF KONTROL: FORCE RLS AÇIKKEN `SECURITY DEFINER` rol
-- yardımcıları doğru cevap veriyor
--
-- `is_coach()` / `profile_role()` / `is_coach_profile()` `profiles`'ı sahip
-- kimliğiyle okur ve RLS POLİTİKALARININ İÇİNDEN çağrılır. FORCE bunları
-- etkileseydi hata değil SESSİZ YANLIŞ CEVAP üretirdi: koç `is_coach() = false`
-- görüp tüm danışan verisine erişimini kaybederdi.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_is_coach_self  boolean;
  v_is_coach_coach boolean;
  v_role           public.user_role;
  v_is_coach_prof  boolean;
begin
  select public.is_coach() into v_is_coach_self;
  select public.is_coach('11111111-1111-1111-1111-111111111111') into v_is_coach_coach;
  select public.profile_role('11111111-1111-1111-1111-111111111111') into v_role;
  select public.is_coach_profile('11111111-1111-1111-1111-111111111111') into v_is_coach_prof;

  if v_is_coach_self is distinct from false then
    raise exception 'BASARISIZ [76 is_coach() danisan icin false olmali]: gelen %', v_is_coach_self;
  end if;
  if v_is_coach_coach is distinct from true then
    raise exception 'BASARISIZ [76 is_coach(koc) FORCE RLS ile KIRILDI]: beklenen true, gelen % -- kocun tum erisimi olurdu', v_is_coach_coach;
  end if;
  if v_role is distinct from 'coach'::public.user_role then
    raise exception 'BASARISIZ [76 profile_role(koc) FORCE RLS ile KIRILDI]: beklenen coach, gelen %', v_role;
  end if;
  if v_is_coach_prof is distinct from true then
    raise exception 'BASARISIZ [76 is_coach_profile(koc) FORCE RLS ile KIRILDI]: beklenen true, gelen %', v_is_coach_prof;
  end if;
  raise notice 'GECTI [POZITIF - FORCE RLS acikken is_coach / profile_role / is_coach_profile dogru cevapliyor]';
end $$;
rollback;


-- =============================================================================
-- FAZ 1.7 — AC-05 KUPLAJININ ÇÖZÜLMESİ (20260817180000_program_submission_rpc.sql)
-- =============================================================================


-- =============================================================================
-- PROGRAM GONDERIMI — 77) POZİTİF: `submit_program_for_approval()` RPC'si
-- onay satırını VE koça giden bildirimi ATOMİK yazar
--
-- `useSubmitProgramForApproval` (src/hooks/useProgramApprovals.ts) artık TAM
-- OLARAK bu çağrıyı yapar. Bildirim metni istemcide YOKTUR; şablonun tek sahibi
-- RPC gövdesidir. Bu senaryo hem akışın çalıştığını hem de metnin sunucudan
-- geldiğini kanıtlar.
-- =============================================================================
-- Senaryo 12'deki gibi FARK (delta) ölçülür — test veriden bağımsızdır.
begin;

create temp table zz_notify_base_77 as
select
  count(*) filter (where title is null)     as n_ok,
  count(*) filter (where title is not null) as n_titled
  from public.notifications
 where client_id = '11111111-1111-1111-1111-111111111111'
   and message   = '🔔 Yeni bir antrenman programı onayınıza sunuldu.';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_row public.program_approvals;
begin
  select * into v_row
    from public.submit_program_for_approval(
      '22222222-2222-2222-2222-222222222222'::uuid,
      '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb
    );

  if v_row.id is null then
    raise exception 'BASARISIZ [77 RPC onay satiri]: satir DONMEDI';
  end if;
  if v_row.client_id is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [77 RPC client_id]: gelen %', v_row.client_id;
  end if;
  if v_row.status is distinct from 'pending'::public.approval_status then
    raise exception 'BASARISIZ [77 RPC status]: beklenen pending, gelen % -- ONAY KAPISI ZAYIFLADI!', v_row.status;
  end if;
  if v_row.reviewed_by is not null or v_row.reviewed_at is not null then
    raise exception 'BASARISIZ [77 RPC denetim izi]: reviewed_by=%, reviewed_at=% (bos olmaliydi)',
      v_row.reviewed_by, v_row.reviewed_at;
  end if;
end $$;

-- Bildirimi KOÇ adına yazıldığı için danışan kendi oturumunda GÖREMEZ
-- (`notifications_select` -> client_id = auth.uid()); doğrulama postgres ile.
reset role;
do $$
declare
  v_base_ok     int;
  v_base_titled int;
  v_ok          int;
  v_titled      int;
begin
  select n_ok, n_titled into v_base_ok, v_base_titled from zz_notify_base_77;

  select
    count(*) filter (where title is null),
    count(*) filter (where title is not null)
    into v_ok, v_titled
    from public.notifications
   where client_id = '11111111-1111-1111-1111-111111111111'
     and message   = '🔔 Yeni bir antrenman programı onayınıza sunuldu.';

  if (v_ok - v_base_ok) is distinct from 1 then
    raise exception 'BASARISIZ [77 koca bildirim]: beklenen +1 satir, gelen +% -- koc habersiz kalir!', (v_ok - v_base_ok);
  end if;
  if (v_titled - v_base_titled) is distinct from 0 then
    raise exception 'BASARISIZ [77 bildirim basligi]: RPC title yazdi (beklenen NULL), fark +%', (v_titled - v_base_titled);
  end if;
  raise notice 'GECTI [77 submit_program_for_approval() onay satirini + koc bildirimini ATOMIK yazar]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM GONDERIMI — 78) [AC-05] Danışan koça DOĞRUDAN bildirim YAZAMAZ —
-- ESKİ ŞABLON METNİYLE BİLE
--
-- Kuplaj borcunun kapandığının asıl kanıtı budur: eskiden bu tam metin KABUL
-- EDİLİYORDU (trigger'daki `c_client_to_coach_messages` dizisi). Artık
-- `notifications_insert` politikasında `is_coach_profile(...)` dalı YOK ve
-- trigger da yönlendirici bir 42501 veriyor. Yani istemcinin yazabildiği
-- HİÇBİR bildirim metni kalmadı — "şablon dışı içerik" diye bir yüzey yok.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught_template boolean := false;
  v_caught_free     boolean := false;
  v_state           text;
begin
  -- (a) ESKİ ŞABLON METNİ — eskiden GEÇERDİ, artık reddedilmeli.
  begin
    insert into public.notifications (client_id, message)
    values ('11111111-1111-1111-1111-111111111111',
            '🔔 Yeni bir antrenman programı onayınıza sunuldu.');
  exception when insufficient_privilege then
    v_caught_template := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  -- (b) SERBEST METİN (kimlik avı) — zaten reddediliyordu, reddedilmeye devam.
  begin
    insert into public.notifications (client_id, title, message)
    values ('11111111-1111-1111-1111-111111111111',
            'ACIL: Sifreni sifirla', 'https://kotu-site.example/reset');
  exception when insufficient_privilege then
    v_caught_free := true;
  end;

  if not v_caught_template then
    raise exception 'BASARISIZ [78 sablon metni reddedilmeli]: hata ALINMADI -- danisan -> koc dogrudan yazma yolu HALA ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [78 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  if not v_caught_free then
    raise exception 'BASARISIZ [78 serbest metin reddedilmeli]: hata ALINMADI';
  end if;
  raise notice 'GECTI [78 Danisan koca DOGRUDAN bildirim yazamaz - eski sablon metniyle bile (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM GONDERIMI — 79) RPC BAŞKASI ADINA çağrılamaz
--
-- RPC `SECURITY DEFINER`dır, yani `program_approvals_insert` politikası
-- (`client_id = auth.uid()`) bu yolda DEVREDE DEĞİLDİR. Sahiplik kontrolü RPC
-- gövdesinde ELLE yapılır (§1b). Bu senaryo o kontrolün varlığını kanıtlar —
-- kaldırılırsa herhangi bir danışan BAŞKASI adına program gönderebilir.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
  v_row    public.program_approvals;
begin
  begin
    select * into v_row
      from public.submit_program_for_approval(
        '33333333-3333-3333-3333-333333333333'::uuid,   -- Danışan B
        '{"Pazartesi":"sahte"}'::jsonb
      );
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [79 baskasi adina gonderim]: hata ALINMADI -- SECURITY DEFINER RPC IDOR yuzeyi ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [79 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [79 submit_program_for_approval() baskasi adina cagrilamaz (42501)]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM GONDERIMI — 80) [AC-01 REGRESYONU] ONAY KAPISI HÂLÂ KAPALI:
-- `SECURITY DEFINER` bir fonksiyon BİLE `status='approved'` yazamaz
--
-- ############################################################################
-- # BU SENARYONUN VAR OLMA SEBEBİ                                            #
-- # Faz 1.7'de program gönderimi SECURITY DEFINER bir RPC'ye taşındı. SECURITY#
-- # DEFINER `postgres` kimliğiyle çalışır ve `postgres` rolü `rolbypassrls`   #
-- # taşır -> RLS POLİTİKALARI o yolda DEVREYE GİRMEZ. Akla gelen soru şudur:  #
-- # "onay kapısı da böyle atlanabilir mi?"                                    #
-- #                                                                           #
-- # HAYIR — çünkü kapı bir POLİTİKA değil, bir TRIGGER'dır                    #
-- # (`program_approvals_guard_review`, 20260817160000 §3) ve trigger'lar       #
-- # BYPASSRLS'ten etkilenmez. Bu senaryo bunu VARSAYMAZ, ÖLÇER: işlem içinde  #
-- # geçici bir SECURITY DEFINER fonksiyon kurulur, `authenticated` rolüyle    #
-- # çağrılır ve `status='approved'` INSERT'i 42501 ALMALIDIR.                 #
-- #                                                                           #
-- # Bu senaryo düşerse AC-01 (High) yeniden AÇILMIŞ demektir.                 #
-- ############################################################################
begin;

create function public.zz_definer_gate_probe(p_client uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $probe$
begin
  insert into public.program_approvals (client_id, workout_data, status, reviewed_by, reviewed_at)
  values (p_client, '{"Pazartesi":"sahte"}'::jsonb, 'approved'::public.approval_status,
          '11111111-1111-1111-1111-111111111111', now());
end;
$probe$;

grant execute on function public.zz_definer_gate_probe(uuid) to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.zz_definer_gate_probe('22222222-2222-2222-2222-222222222222'::uuid);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [80 SECURITY DEFINER onay kapisini ATLADI]: hata ALINMADI -- AC-01 YENIDEN ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [80 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [80 SECURITY DEFINER fonksiyon bile status=approved yazamaz - onay kapisi TRIGGER, politika degil]';
end $$;

rollback;


-- =============================================================================
-- FAZ 1.7 — AVATAR GÖRÜNÜRLÜĞÜ (20260817180100_avatar_visibility.sql)
--
-- KURULUM NOTU: `storage.objects` bu projede seed'lenmez (canlıda Storage API
-- doldurur). Senaryolar kendi nesnelerini `postgres` kimliğiyle yaratır ve
-- ROLLBACK ile geri alır — kalıcı satır bırakmaz.
-- =============================================================================


-- =============================================================================
-- AVATAR — 81) POZİTİF: Danışan KOÇUN avatarını GÖREBİLİR (ve kendi avatarını)
-- docs/PROGRESS.md §5 borcu: sohbet başlığına koç avatarı eklendiğinde
-- sessizce placeholder'a düşmesin.
-- =============================================================================
begin;

insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('avatars', '11111111-1111-1111-1111-111111111111-aaaaaaaa-0000-0000-0000-00000000aaaa.jpg',
              '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('avatars', '22222222-2222-2222-2222-222222222222-cccccccc-0000-0000-0000-00000000cccc.jpg',
              '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_coach_avatar int;
  v_own_avatar   int;
begin
  select count(*) into v_coach_avatar from storage.objects
   where bucket_id = 'avatars'
     and name = '11111111-1111-1111-1111-111111111111-aaaaaaaa-0000-0000-0000-00000000aaaa.jpg';

  select count(*) into v_own_avatar from storage.objects
   where bucket_id = 'avatars'
     and name = '22222222-2222-2222-2222-222222222222-cccccccc-0000-0000-0000-00000000cccc.jpg';

  if v_coach_avatar is distinct from 1 then
    raise exception 'BASARISIZ [81 danisan kocun avatarini gorur]: beklenen 1, gelen % -- createSignedUrl RLS ile reddedilir', v_coach_avatar;
  end if;
  if v_own_avatar is distinct from 1 then
    raise exception 'BASARISIZ [81 danisan KENDI avatarini gorur]: beklenen 1, gelen %', v_own_avatar;
  end if;
  raise notice 'GECTI [81 POZITIF - Danisan kocun avatarini VE kendi avatarini gorebilir]';
end $$;

rollback;


-- =============================================================================
-- AVATAR — 82) EN KRİTİK REGRESYON: Danışan BAŞKA BİR DANIŞANIN avatarını
-- GÖREMEZ; dosya adı ayrıştırıcısı SÖMÜRÜLEMEZ
--
-- Yetkiyi dosya adından çıkarmak riskli bir kalıptır: gevşek bir ayrıştırma
-- "herkes her dosyayı görür" hâline düşürür. Bu senaryo beş ayrı adı test eder:
--   (a) başka danışanın GERÇEK avatarı            -> GÖRÜNMEZ
--   (b) hiç UUID içermeyen ad                     -> GÖRÜNMEZ (NULL -> false)
--   (c) koç uid'i AMA ayırıcı '-' YOK             -> GÖRÜNMEZ (katı desen)
--   (d) koç uid'i AMA alt dizinde ('/' içeriyor)  -> GÖRÜNMEZ
--   (e) koç uid'i ORTADA geçen ad                 -> GÖRÜNMEZ (yalnızca ÖN EK)
-- Ayrıca `form-checks-media` kapsamına sızma OLMADIĞI (f) doğrulanır.
-- =============================================================================
begin;

insert into storage.objects (bucket_id, name, owner, owner_id) values
  -- (a) Danışan B'nin gerçek avatarı
  ('avatars', '33333333-3333-3333-3333-333333333333-bbbbbbbb-0000-0000-0000-00000000bbbb.jpg',
              '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333'),
  -- (b) ayrıştırılamayan ad
  ('avatars', 'kotu-ad.jpg', null, null),
  -- (c) koç uid'i ama ayırıcı yok
  ('avatars', '11111111-1111-1111-1111-111111111111.jpg', null, null),
  -- (d) koç uid'i ama alt dizinde
  ('avatars', 'gizli/11111111-1111-1111-1111-111111111111-x.jpg', null, null),
  -- (e) koç uid'i ortada
  ('avatars', 'zz-11111111-1111-1111-1111-111111111111-x.jpg', null, null),
  -- (f) koç adına yazılmış bir form-check nesnesi (kapsam sızması kontrolü)
  ('form-checks-media', 'poses/11111111-1111-1111-1111-111111111111-dddddddd-0000-0000-0000-00000000dddd.jpg',
              '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_name    text;
  v_visible int;
begin
  foreach v_name in array array[
    '33333333-3333-3333-3333-333333333333-bbbbbbbb-0000-0000-0000-00000000bbbb.jpg',
    'kotu-ad.jpg',
    '11111111-1111-1111-1111-111111111111.jpg',
    'gizli/11111111-1111-1111-1111-111111111111-x.jpg',
    'zz-11111111-1111-1111-1111-111111111111-x.jpg'
  ] loop
    select count(*) into v_visible
      from storage.objects
     where bucket_id = 'avatars' and name = v_name;

    if v_visible is distinct from 0 then
      raise exception 'BASARISIZ [82 avatar sizintisi]: "%" danisana GORUNUYOR (beklenen 0, gelen %) -- dosya adi ayristirmasi SOMURULEBILIR!',
        v_name, v_visible;
    end if;
  end loop;

  -- (f) form-checks-media kapsamı DEĞİŞMEMELİ: koçun pose dosyası da görünmez.
  select count(*) into v_visible
    from storage.objects
   where bucket_id = 'form-checks-media'
     and name = 'poses/11111111-1111-1111-1111-111111111111-dddddddd-0000-0000-0000-00000000dddd.jpg';

  if v_visible is distinct from 0 then
    raise exception 'BASARISIZ [82 kapsam sizmasi]: avatar dali form-checks-media ye sizmis (gelen %)', v_visible;
  end if;

  raise notice 'GECTI [82 Danisan BASKA DANISANIN avatarini goremez; bozuk/sahte adlar ayristiriciyi somuremez; form-checks kapsami saglam]';
end $$;

rollback;


-- =============================================================================
-- FAZ 1.7 — SEQUENCE YETKİLERİ (20260817180200_sequence_grants.sql)
-- =============================================================================


-- =============================================================================
-- SEQUENCE — 83) `authenticated` `setval` ÇALIŞTIRAMAZ, ama normal INSERT
-- (yani `nextval`) HÂLÂ ÇALIŞIR
--
-- NOT: INSERT senaryosu KOÇ kimliğiyle koşar — `exercises_insert_coach`
-- politikası yazmayı koça kilitler (senaryo 19). Ölçülen şey RLS değil,
-- sequence USAGE yetkisidir.
-- YAN ETKİ (bilinçli): `nextval` işlemsel DEĞİLDİR; ROLLBACK sonrası sayaç
-- geri gelmez, katalog id'lerinde bir boşluk kalır. Zararsızdır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_rows       int;
  v_seq        text;
  v_caught     boolean;
  v_state      text;
begin
  -- POZİTİF: nextval üzerinden INSERT çalışmalı.
  insert into public.exercises (name, body_part) values ('zz-seq-probe-83', 'test');
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [83 INSERT calismali]: beklenen 1 satir, etkilenen % -- USAGE yetkisi KAYBEDILDI', v_rows;
  end if;

  -- NEGATİF: setval her iki sequence'te de reddedilmeli.
  foreach v_seq in array array['public.exercises_id_seq', 'public.food_database_id_seq']
  loop
    v_caught := false;
    begin
      execute format('select setval(%L, 1)', v_seq);
    exception when insufficient_privilege then
      v_caught := true;
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if not v_caught then
      raise exception 'BASARISIZ [83 setval reddedilmeli]: "%" GECTI -- en-az-yetki ihlali ACIK!', v_seq;
    end if;
    if v_state is distinct from '42501' then
      raise exception 'BASARISIZ [83 hata kodu / %]: beklenen 42501, gelen %', v_seq, v_state;
    end if;
  end loop;

  raise notice 'GECTI [83 authenticated setval calistiramaz (42501) ama nextval ile INSERT HALA calisir]';
end $$;
rollback;


-- =============================================================================
-- SEQUENCE — 84) Toplu yetki denetimi — DİNAMİK
--
-- Sequence listesi `pg_class`'tan okunur: gelecekte eklenen (veya
-- `supabase_admin` varsayılanından yetki geri kazanan) bir sequence bu senaryoyu
-- KIRAR. Migration'ın §2 adımı tam olarak bunu engellemek içindir.
-- POZİTİF KONTROL aynı blokta: USAGE HÂLÂ durmalı — aksi hâlde "güvenli ama
-- INSERT edilemeyen" bir veritabanı üretmiş olurduk.
--
-- `as materialized` ZORUNLUDUR: filtre ile `has_sequence_privilege()` aynı
-- WHERE'de olursa planlayıcı fonksiyonu `relkind` filtresinden ÖNCE
-- çalıştırabilir ve bir TOAST tablosunun OID'i ile 42809 ("... is not a
-- sequence") fırlatır. Bu, migration yazılırken CANLI olarak yaşandı.
-- =============================================================================
begin;
do $$
declare
  v_leak text;
  v_miss text;
  v_seqs int;
begin
  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select count(*) into v_seqs from seqs;

  if v_seqs < 2 then
    raise exception 'BASARISIZ [84 kurulum]: public semada beklenenden az sequence var (%)', v_seqs;
  end if;

  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select string_agg(format('%s/%s', g.role_name, s.relname), ', ' order by s.relname) into v_leak
    from seqs s
    cross join (values ('authenticated'), ('anon')) as g(role_name)
   where has_sequence_privilege(g.role_name, s.oid, 'UPDATE');

  if v_leak is not null then
    raise exception 'BASARISIZ [84 setval yetkisi acik]: % -- setval ile sayac oynatilabilir', v_leak;
  end if;

  with seqs as materialized (
    select c.oid, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  )
  select string_agg(s.relname, ', ' order by s.relname) into v_miss
    from seqs s
   where not has_sequence_privilege('authenticated', s.oid, 'USAGE');

  if v_miss is not null then
    raise exception 'BASARISIZ [84 USAGE kaybi]: % -- INSERT ler kirilir', v_miss;
  end if;

  raise notice 'GECTI [84 % sequence: authenticated/anon UPDATE=yok, authenticated USAGE=var]', v_seqs;
end $$;
rollback;


-- =============================================================================
-- SEQUENCE — 85) GELECEKTEKİ sequence'ler de doğru varsayılanı alır
--
-- AC-03 turunda öğrenilen ders: mevcut nesnelerden REVOKE etmek YETMEZ; yeni
-- nesne yetkiyi platform varsayılanından geri kazanır. Bu senaryo işlem içinde
-- GERÇEKTEN yeni bir tablo + `serial` sequence yaratır ve iki şeyi birden ölçer:
--   * `authenticated` yeni sequence'te setval EDEMEZ  (varsayılan revoke tuttu)
--   * `authenticated` INSERT EDEBİLİR                 (varsayılan usage/select tuttu)
-- Her şey ROLLBACK içindedir; DDL Postgres'te işlemseldir, kalıcı iz kalmaz.
-- =============================================================================
begin;

create table public.zz_seq_default_probe (id serial primary key, v text);
grant select, insert on public.zz_seq_default_probe to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_rows   int;
  v_caught boolean := false;
  v_state  text;
begin
  insert into public.zz_seq_default_probe (v) values ('x');
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [85 yeni sequence USAGE]: INSERT calismadi (etkilenen %) -- varsayilan yetki fazla daraltilmis', v_rows;
  end if;

  begin
    perform setval('public.zz_seq_default_probe_id_seq', 1);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [85 yeni sequence setval]: hata ALINMADI -- alter default privileges TUTMADI, delik yeni nesnelerde geri aciliyor!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [85 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [85 GELECEKTEKI sequence de dogru varsayilani alir: setval YOK, nextval VAR]';
end $$;

rollback;


-- =============================================================================
-- TOPLAM ÖZET
-- Bu noktaya yalnızca YUKARIDAKİ 85 senaryonun HEPSİ GECTI verdiyse ulaşılır --
-- herhangi biri BASARISIZ olsaydı raise exception + ON_ERROR_STOP psql'i
-- daha önce sıfırdan farklı çıkış koduyla durdururdu.
--   * 1–19  : Faz 1a ve öncesi (profiles, notifications, form_checks, daily_logs,
--             workout_logs, messages, katalog)
--   * 20–27 : Faz 1b Adım 1 — workout_plans / workout_plan_exercises / save_workout_plan
--   * 28–35 : Faz 1b Adım 3a — nutrition_plans / nutrition_plan_meals / save_nutrition_plan
--   * 36–42 : Faz 1b Adım 4 — messages konuşma anahtarı (client_id / read_at / kind)
--   * 43–50 : Faz 1b Adım 5 — form_checks inceleme durumu (sütun koruması + denetim izi)
--   * 51–57 : Faz 1.5 — program_approvals onay kapısı      (AC-01, AC-07 / G-01,02,03,06)
--   * 58–61 : Faz 1.5 — messages sütun koruması            (AC-04 / G-07, G-08, G-09)
--   * 62–65 : Faz 1.5 — notifications içerik koruması      (AC-05, AC-10 / G-10, G-11)
--   * 66–69 : Faz 1.5 — profiles sunucu sütunları          (AC-08, AC-09 / G-13, G-14)
--   * 70    : Faz 1.5 — handle_new_user rol sertleştirmesi (AC-02 / G-16)
--   * 71–76 : Faz 1.5 Grup 5 — yetki sökümü + FORCE RLS   (AC-03, AC-06 / G-17, G-18)
--   * 77–80 : Faz 1.7 — AC-05 kuplajının çözülmesi        (submit_program_for_approval
--             RPC'si, danışan -> koç doğrudan yazma yolunun kapanması, SECURITY
--             DEFINER'ın onay kapısını ATLAMADIĞININ kanıtı)
--   * 81–82 : Faz 1.7 — avatar görünürlüğü                (koç avatarı açık,
--             danışan -> danışan KAPALI, dosya adı ayrıştırıcısı sömürülemez)
--   * 83–85 : Faz 1.7 — sequence yetkileri                (setval kapalı, nextval
--             açık, gelecekteki sequence'ler için varsayılan doğru)
-- =============================================================================
do $$
begin
  raise notice 'TUM RLS TESTLERI GECTI (85 senaryo)';
end $$;
