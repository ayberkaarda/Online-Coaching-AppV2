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
-- ### KENDİ KURULUMUNU YAPMA KURALI (2026-08-18) ####################
--   Bu paket kendi yazdığını ROLLBACK ile geri alır. O yüzden KURULUM için de
--   DIŞARIDAKİ duruma güvenemez: seed'in bir satırı `pending` bıraktığını,
--   bir mesajın okunmamış kaldığını veya bir danışanın planının hâlâ v1
--   olduğunu VARSAYAN her senaryo, E2E koşusu / elle kullanım / başka bir test
--   tarafından SESSİZCE kırılabilir. (Gerçekten yaşandı: E2E'nin
--   "danışan programı onaya sunar, koç onaylar" senaryosu seed'in tek `pending`
--   `program_approvals` satırını TÜKETİYOR ve senaryo 54'ün kurulumunu
--   çökertiyordu. Aynı şekilde koçun sohbeti okuması senaryo 92'nin, plan
--   yayınlama senaryo 103'ün kurulumunu bozuyordu.)
--
--   KURAL: bir senaryo ihtiyaç duyduğu satırı KENDİ işleminde üretir.
--     * Kurulum satırları `set local role` ÇAĞRILMADAN ÖNCE, `postgres`
--       kimliğiyle yazılır (RLS bypass + guard trigger'ları `auth.uid()` NULL
--       iken çekilir, bkz. 20260817150000 §6a / 20260817160000 §3a).
--     * Kurulumun KİM tarafından yapıldığı ölçümün parçası DEĞİLDİR; ölçülen
--       şey her zaman rol taklidinden SONRA gelen ifadedir. Bunun tersi
--       (kurulumu test edilen yetkiyle yapmak) testi kendini kanıtlar hâle
--       getirirdi — bu yüzden kurulum ile iddia BİLİNÇLİ olarak ayrılmıştır.
--     * Kurulum satırları sabit (senaryo numarası taşıyan) UUID'ler kullanır ki
--       iddia, veritabanında rastgele bulunan bir satıra değil ÜRETİLEN satıra
--       kurulsun.
--   Sonuç: `npm run test:rls` E2E'den sonra, `db reset` OLMADAN da yeşildir.
-- ###################################################################
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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
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
-- KURULUM: gizlenmesi GEREKEN satır burada üretilir. Aksi hâlde iddia B'nin
-- seed satırlarına dayanırdı ve tablo boşalsa SESSİZCE geçerdi (boş küme her
-- zaman "sızıntı yok" der).
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes)
values ('a0000000-0000-0000-0000-000000000006'::uuid,
        '33333333-3333-3333-3333-333333333333', 61.00, 'zz-06 Danisan B form check');

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
-- KURULUM: senaryo 6 ile aynı gerekçe — gizlenmesi gereken satır burada üretilir.
-- =============================================================================
begin;

insert into public.daily_logs (client_id, log_date, water_lt)
values ('33333333-3333-3333-3333-333333333333', date '2000-01-07', 2.25);

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
-- KURULUM: senaryo 6 ile aynı gerekçe — gizlenmesi gereken satır burada üretilir.
-- =============================================================================
begin;

insert into public.workout_logs (client_id, exercise_name, weight_kg, reps)
values ('33333333-3333-3333-3333-333333333333', 'zz-08 Squat', 55.00, 8);

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
--
-- KURULUM: "B'nin de satırı var" ön koşulu seed'e BIRAKILMAZ, burada üretilir.
-- Ölçüm iki katmanlıdır: (1) üretilen İKİ satırın da koça göründüğü ADIYLA
-- doğrulanır, (2) toplam > yalnızca-A iddiası korunur.
-- =============================================================================
begin;

insert into public.form_checks (client_id, current_weight, notes) values
  ('22222222-2222-2222-2222-222222222222', 90.00, 'zz-09 A form check'),
  ('33333333-3333-3333-3333-333333333333', 61.00, 'zz-09 B form check');

insert into public.daily_logs (client_id, log_date, water_lt) values
  ('22222222-2222-2222-2222-222222222222', date '2000-01-09', 3.00),
  ('33333333-3333-3333-3333-333333333333', date '2000-01-09', 2.25);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_fc_total   int;
  v_fc_a_only  int;
  v_dl_total   int;
  v_dl_a_only  int;
  v_fc_setup   int;
  v_dl_setup   int;
begin
  -- (1) Bu senaryonun ÜRETTİĞİ satırlar: ikisi de koça görünmeli.
  select count(*) into v_fc_setup from public.form_checks where notes like 'zz-09 %';
  if v_fc_setup is distinct from 2 then
    raise exception 'BASARISIZ [Koc - tum form_checks gorur]: uretilen 2 satirdan % tanesi gorunuyor', v_fc_setup;
  end if;
  select count(*) into v_dl_setup from public.daily_logs where log_date = date '2000-01-09';
  if v_dl_setup is distinct from 2 then
    raise exception 'BASARISIZ [Koc - tum daily_logs gorur]: uretilen 2 satirdan % tanesi gorunuyor', v_dl_setup;
  end if;

  -- (2) Toplam iddiası (artık boş tabloda SESSİZCE geçemez).
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
-- KURULUM: gizlenmesi GEREKEN yabancı mesaj (koç <-> Danışan B) burada üretilir;
-- iddia artık "messages tablosu boş" hâlinde de sessizce geçemez.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message)
values ('e0000000-0000-0000-0000-000000000016'::uuid,
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        'zz-16 koc -> Danisan B (A gormemeli)');

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
-- KURULUM: yabancı `client_id` taşıyan bir satır (B'nin konuşması) burada
-- üretilir — senaryo 16 ile aynı gerekçe.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message)
values ('e0000000-0000-0000-0000-000000000036'::uuid,
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333',
        'zz-36 koc -> Danisan B (yabanci client_id)');

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
-- KURULUM: iki konuşmanın da mesajı OLMASI ön koşulu seed'e bırakılmaz; her iki
-- satır da burada üretilir ve iddia o satırlar üzerinden de doğrulanır.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message) values
  ('e0000000-0000-0000-0000-000000000037'::uuid,
   '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'zz-37 Danisan A -> koc'),
  ('e0000000-0000-0000-0000-00000000003b'::uuid,
   '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'zz-37 Danisan B -> koc');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_a     int;
  v_b     int;
  v_setup int;
begin
  -- Bu senaryonun ÜRETTİĞİ iki satır (her konuşmadan biri) koça görünmeli.
  select count(*) into v_setup from public.messages
   where id in ('e0000000-0000-0000-0000-000000000037'::uuid,
                'e0000000-0000-0000-0000-00000000003b'::uuid);
  if v_setup is distinct from 2 then
    raise exception 'BASARISIZ [Koc - iki konusmayi da gorur]: uretilen 2 satirdan % tanesi gorunuyor', v_setup;
  end if;

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
  v_id     uuid;
  v_status public.approval_status;
  v_by     uuid;
  v_at     timestamptz;
begin
  -- Geri okuma `returning` ile YAPILIR: `where workout_data = …` ile aramak,
  -- veritabanında aynı payload'ı taşıyan BAŞKA bir satır (E2E artığı) varsa
  -- yanlış satırı ölçerdi. Senaryo yalnızca KENDİ ürettiği satıra bakar.
  insert into public.program_approvals (client_id, workout_data, status)
  values ('22222222-2222-2222-2222-222222222222', '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb, 'pending')
  returning id, status, reviewed_by, reviewed_at into v_id, v_status, v_by, v_at;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 or v_id is null then
    raise exception 'BASARISIZ [Danisan pending onay talebi acar]: beklenen 1 satir, etkilenen %', v_rows;
  end if;

  if v_status is distinct from 'pending'::public.approval_status or v_by is not null or v_at is not null then
    raise exception 'BASARISIZ [Danisan pending onay talebi]: status=%, reviewed_by=%, reviewed_at=%', v_status, v_by, v_at;
  end if;
  raise notice 'GECTI [POZITIF - Danisan normal pending onay talebini HALA acabilir]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI — 54) [G-03 / AC-01] Danışan kendi `pending` satırını SİLİP
-- `approved` olarak yeniden EKLEYEMEZ (canlı sömürü W7'nin kapanışı)
--
-- KURULUM (2026-08-18 — BU SENARYONUN KIRILGANLIĞI BURADAN GELİYORDU):
-- Silinecek `pending` satır ESKİDEN seed'in §9 satırıydı. E2E'nin "danışan
-- programı onaya sunar, koç onaylar" senaryosu o satırı `approved` yaparak
-- TÜKETİYOR; ardından `npm run test:rls` "silinen=0" ile KIRMIZI dönüyordu
-- (`db reset` ile geçiştirilmesi sorunu gizliyordu, çözmüyordu).
-- Satır artık burada, `postgres` kimliğiyle üretiliyor (guard trigger
-- `auth.uid()` NULL iken çekilir, 20260817160000 §3a) ve ROLLBACK ile geri
-- alınıyor. ÖLÇÜM DEĞİŞMEDİ: silme YİNE danışan kimliğiyle, RLS
-- (`program_approvals_delete`) altında yapılır — kurulumun kim tarafından
-- yazıldığı iddianın gücüne dahil değildir.
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000054'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. Bench Press - 4x8"}'::jsonb,
  'pending'::public.approval_status
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_deleted int;
  v_caught  boolean := false;
begin
  -- 1. adım: kendi BEKLEYEN talebini geri çekebilir (bilinçli olarak serbest).
  -- Bu ADIM DA bir ölçümdür: `program_approvals_delete` politikası danışana
  -- KENDİ 'pending' satırını sildirmeli. Hedef, senaryonun ürettiği satırdır.
  delete from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000054'::uuid
     and status = 'pending'::public.approval_status;
  get diagnostics v_deleted = row_count;

  if v_deleted is distinct from 1 then
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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

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
--
-- KURULUM: hedef satır burada üretilir. Aksi hâlde "etkilenen=0" iddiası,
-- veritabanında A'ya ait HİÇ onay satırı kalmadığında (E2E temizliği, elle
-- silme) SESSİZCE geçerdi — hiçbir şeyi güncelleyememek ile hiçbir şey
-- bulamamak aynı sonucu verir. Satırın 'pending' KALDIĞI da doğrulanır.
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000057'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. Overhead Press - 4x8"}'::jsonb,
  'pending'::public.approval_status
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows   int;
  v_status public.approval_status;
begin
  update public.program_approvals
     set status = 'approved'::public.approval_status
   where client_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [Danisan status UPDATE edemez]: beklenen 0 satir, etkilenen %', v_rows;
  end if;

  select status into v_status from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000057'::uuid;
  if v_status is distinct from 'pending'::public.approval_status then
    raise exception 'BASARISIZ [Danisan status UPDATE edemez]: satir % oldu (pending kalmaliydi)', v_status;
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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
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
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
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
-- FAZ 2b — ŞEMA TAMAMLAMA
-- (20260817190000 … 20260817190400: workout_logs set kolonları, beslenme
--  hedefleri + nutrition_logs, mesaj eki, read_at invaryantı, realtime yayını)
-- =============================================================================


-- =============================================================================
-- WORKOUT LOG — 86) POZİTİF: Danışan kendi setini YENİ KOLONLARLA yazabilir
-- (set_number + plan_exercise_id + completed_at) ve geri okuyabilir.
-- Bu senaryo olmadan "kolonlar eklendi" ile "kolonlar KULLANILABİLİR" arasındaki
-- fark ölçülmezdi (grant/RLS/trigger üçlüsünden biri eksik olsa da şema doğru
-- görünürdü).
--
-- KURULUM: bağlanılacak plan satırı SEED'DEN OKUNMAZ, burada üretilir (seed'in
-- plan tabloları E2E'nin "planı kaydet/yayınla" akışlarıyla değişir). Plan
-- satırı `postgres` ile yazılır, ama senaryo onu YİNE danışan kimliğiyle ve RLS
-- altında OKUR — yani "danışan kendi plan satırını görebiliyor mu" ölçümü
-- korunur.
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000086', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line, name, target_sets, target_reps)
values ('aaaaaaaa-0000-0000-0000-000000000086', 'Pazartesi', 0, '1. Bench Press - 4x8', 'Bench Press', 4, 8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_pe        uuid;
  v_id        uuid;
  v_set       integer;
  v_pe_back   uuid;
  v_completed timestamptz;
begin
  select wpe.id into v_pe
    from public.workout_plan_exercises wpe
    join public.workout_plans wp on wp.id = wpe.plan_id
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid
   order by wpe.day, wpe.position
   limit 1;

  if v_pe is null then
    raise exception 'BASARISIZ [86 kurulum]: Danisan A nin plan satiri RLS altinda GORUNMUYOR';
  end if;

  insert into public.workout_logs
    (client_id, exercise_name, weight_kg, reps, rpe, set_number, plan_exercise_id, completed_at)
  values
    ('22222222-2222-2222-2222-222222222222'::uuid, 'Bench Press', 60.00, 8, 8, 2, v_pe, now())
  returning id into v_id;

  select set_number, plan_exercise_id, completed_at
    into v_set, v_pe_back, v_completed
    from public.workout_logs where id = v_id;

  if v_set is distinct from 2 then
    raise exception 'BASARISIZ [86 set_number]: beklenen 2, gelen %', v_set;
  end if;
  if v_pe_back is distinct from v_pe then
    raise exception 'BASARISIZ [86 plan_exercise_id]: beklenen %, gelen %', v_pe, v_pe_back;
  end if;
  if v_completed is null then
    raise exception 'BASARISIZ [86 completed_at]: NULL kaldi -- oturum tamamlama damgasi yazilamiyor';
  end if;

  raise notice 'GECTI [86 POZITIF - Danisan set_number / plan_exercise_id / completed_at yazabiliyor]';
end $$;
rollback;


-- =============================================================================
-- WORKOUT LOG — 87) Log satırı BAŞKA BİR DANIŞANIN plan satırına BAĞLANAMAZ
--
-- RLS bunu kapatmaz (`workout_logs_insert` yalnızca `client_id = auth.uid()`
-- bakar). Kontrol `workout_logs_guard_plan_exercise` trigger'ındadır.
-- Danışan B'nin plan satırının id'si, RLS yüzünden A tarafından GÖRÜLEMEZ; bu
-- yüzden id, rol değiştirilmeden ÖNCE bir işlem-yerel GUC'a yazılır (saldırgan
-- id'yi başka bir yoldan öğrenmiş varsayılır — en kötü durum).
-- Üçüncü dal: KOÇ bile bu bağı kuramaz (bütünlük kuralı, yetki kuralı değil).
--
-- KURULUM: hem B'nin plan satırı hem A'nın (koç tarafından yeniden bağlanmaya
-- çalışılacak) log satırı BURADA üretilir — ikisi de eskiden seed'den okunuyordu
-- ve E2E'nin plan kaydetme / gym modu akışları ikisini de değiştirebiliyordu.
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';

insert into public.workout_plans (id, client_id, version, is_active)
values ('bbbbbbbb-0000-0000-0000-000000000087', '33333333-3333-3333-3333-333333333333', 1, true);

insert into public.workout_plan_exercises (id, plan_id, day, position, raw_line)
values ('bbbbbbbb-1111-0000-0000-000000000087', 'bbbbbbbb-0000-0000-0000-000000000087',
        'Pazartesi', 0, '1. Squat - 5x5');

insert into public.workout_logs (id, client_id, exercise_name, weight_kg, reps)
values ('dddddddd-0000-0000-0000-000000000087', '22222222-2222-2222-2222-222222222222',
        'zz-87 Danisan A logu', 60.00, 8);

do $$
begin
  perform set_config('zz.pe_b', 'bbbbbbbb-1111-0000-0000-000000000087', true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    insert into public.workout_logs
      (client_id, exercise_name, set_number, plan_exercise_id)
    values
      ('22222222-2222-2222-2222-222222222222'::uuid, 'Capraz Baglanti', 1,
       current_setting('zz.pe_b')::uuid);
  exception when others then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [87]: Danisan A, B nin plan satirina log BAGLAYABILDI -- capraz danisan veri kirlenmesi ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [87 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [87a Danisan baska danisanin plan satirina log baglayamaz (42501)]';
end $$;

-- Koç yolu: yetki değil BÜTÜNLÜK kuralı olduğu için koç da yapamaz.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_log    uuid;
  v_caught boolean := false;
  v_state  text;
begin
  -- Kurulumda üretilen log; koç onu RLS altında GÖRMELİ (aksi hâlde aşağıdaki
  -- UPDATE 0 satır etkiler ve senaryo sahte bir yeşil verirdi).
  select id into v_log from public.workout_logs
   where id = 'dddddddd-0000-0000-0000-000000000087'::uuid;

  if v_log is null then
    raise exception 'BASARISIZ [87b kurulum]: kurulumda uretilen log koca GORUNMUYOR';
  end if;

  begin
    update public.workout_logs
       set plan_exercise_id = current_setting('zz.pe_b')::uuid
     where id = v_log;
  exception when others then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [87b]: KOC, A nin logunu B nin plan satirina baglayabildi';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [87b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [87b Koc da capraz plan bagi kuramaz -- kural yetki degil, butunluk]';
end $$;
rollback;


-- =============================================================================
-- WORKOUT LOG — 88) Yeni kolonlar GÖRÜNÜRLÜK sınırını değiştirmez
-- (A'nın seti B'ye görünmez, koça görünür) + §3.2: KOÇ danışanın loguna
-- INSERT EDEMEZ.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.workout_logs (client_id, exercise_name, set_number, completed_at)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-88-probe', 3, now());

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.workout_logs where exercise_name = 'zz-88-probe';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [88 sizinti]: Danisan B, A nin setini goruyor (%)', v_n;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_n      int;
  v_caught boolean := false;
  v_state  text;
begin
  select count(*) into v_n from public.workout_logs where exercise_name = 'zz-88-probe' and set_number = 3;
  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [88 koc gormeli]: beklenen 1, gelen %', v_n;
  end if;

  begin
    insert into public.workout_logs (client_id, exercise_name, set_number)
    values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-88-koc-yazdi', 1);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [88 koc INSERT]: koc danisanin loguna yazabildi -- §3.2 ihlali';
  end if;

  raise notice 'GECTI [88 Yeni kolonlar gorunurlugu degistirmiyor; koc danisanin loguna INSERT edemiyor]';
end $$;
rollback;


-- =============================================================================
-- MESAJ EKİ — 89) `attachment_path` sözleşmesi ve DOKUNULMAZLIĞI
--   (a) POZİTİF: danışan kendi konuşmasına ait ek yolu yazabilir
--   (b) ALICI (koç) gönderilmiş mesajın EKİNİ DEĞİŞTİREMEZ  -> 42501
--       (AC-04'ün Faz 2b uzantısı: yeni kolon otomatik korunmaz)
--   (c) BAŞKA konuşmanın klasörünü işaret eden ek                -> 23514
--   (d) YOL yerine TAM URL (I-4 ihlali)                          -> 23514
-- =============================================================================
begin;

-- KURULUM (2026-08-19, B-028): (a) dalı artık YALNIZCA yol sözleşmesini değil,
-- SUNUCU TARAFI MAGIC-BYTE DOĞRULAMASINI da geçmek zorunda
-- (20260819110000_attachment_magic_byte_verification.sql). Nesne ve doğrulama
-- damgası burada, `postgres` kimliğiyle üretilir — ölçülen şey yine rol taklidinden
-- SONRAKİ INSERT'tir ("kendi kurulumunu yap" kuralı, dosya başı).
insert into storage.objects (bucket_id, name, metadata)
values ('message-attachments',
        '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-aaaaaaaa-1111-2222-3333-444444444444.jpg',
        jsonb_build_object('eTag', '"e89aaaa"', 'size', 68, 'mimetype', 'image/jpeg'));

insert into public.message_attachment_verifications (bucket, path, mime, object_etag)
values ('message-attachments',
        '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-aaaaaaaa-1111-2222-3333-444444444444.jpg',
        'image/jpeg', 'e89aaaa');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_id     uuid;
  v_path   text;
  v_caught boolean;
  v_state  text;
begin
  -- (a) POZİTİF
  insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid,
          '22222222-2222-2222-2222-222222222222'::uuid,
          'zz-89 ekli mesaj',
          '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-aaaaaaaa-1111-2222-3333-444444444444.jpg')
  returning id, attachment_path into v_id, v_path;

  if v_path is null then
    raise exception 'BASARISIZ [89a]: gecerli ek yolu yazilamadi';
  end if;
  perform set_config('zz.msg_89', v_id::text, true);

  -- (c) BAŞKA konuşmanın klasörü
  v_caught := false;
  begin
    insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
    values ('22222222-2222-2222-2222-222222222222'::uuid,
            '11111111-1111-1111-1111-111111111111'::uuid,
            '22222222-2222-2222-2222-222222222222'::uuid,
            'zz-89 capraz ek',
            '33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222-bbbbbbbb-1111-2222-3333-444444444444.jpg');
  exception when check_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [89c]: mesaj BASKA bir konusmanin ekini isaret edebildi';
  end if;

  -- (d) tam URL
  v_caught := false;
  begin
    insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
    values ('22222222-2222-2222-2222-222222222222'::uuid,
            '11111111-1111-1111-1111-111111111111'::uuid,
            '22222222-2222-2222-2222-222222222222'::uuid,
            'zz-89 url ek',
            'http://127.0.0.1:54321/storage/v1/object/public/message-attachments/x.jpg');
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [89d]: attachment_path TAM URL kabul etti -- I-4 ihlali sema tarafindan engellenmiyor';
  end if;

  raise notice 'GECTI [89a/c/d Ek yolu sozlesmesi: gecerli yol OK, capraz konusma RED, tam URL RED]';
end $$;

-- (b) ALICI (koç) eki değiştiremez
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    update public.messages
       set attachment_path = '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-cccccccc-1111-2222-3333-444444444444.jpg'
     where id = current_setting('zz.msg_89')::uuid;
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [89b]: ALICI gonderilmis mesajin EKINI degistirebildi -- AC-04 gerilemesi!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [89b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [89b Alici gonderilmis mesajin ekini DEGISTIREMEZ (42501)]';
end $$;
rollback;


-- =============================================================================
-- MESAJ EKİ — 90) `message-attachments` OKUMA: sohbetin İKİ TARAFI görür,
-- ÜÇÜNCÜ KİŞİ GÖRMEZ; ad ayrıştırıcısı SÖMÜRÜLEMEZ
--
-- KURULUM NOTU (senaryo 81/82 ile aynı): `storage.objects` seed'lenmez;
-- nesneler `postgres` kimliğiyle yaratılıp ROLLBACK ile geri alınır.
-- =============================================================================
begin;

insert into storage.objects (bucket_id, name, owner, owner_id) values
  -- A'nın konuşmasında A'nın yüklediği ek
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-a0000000-0000-0000-0000-00000000000a.jpg',
    '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  -- A'nın konuşmasında KOÇUN yüklediği ek (karşı taraf da görebilmeli)
  ('message-attachments', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-a0000000-0000-0000-0000-00000000000b.jpg',
    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  -- B'nin konuşmasındaki ek (A GÖREMEMELİ)
  ('message-attachments', '33333333-3333-3333-3333-333333333333/33333333-3333-3333-3333-333333333333-a0000000-0000-0000-0000-00000000000c.jpg',
    '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333'),
  -- Ayrıştırılamayan adlar (fail-closed dalları)
  ('message-attachments', 'kotu-ad.jpg', null, null),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/gizli/22222222-2222-2222-2222-222222222222-x.jpg', null, null),
  ('message-attachments', 'zz-22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-x.jpg', null, null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_own int; v_coach_upload int; v_other int; v_junk int;
begin
  select count(*) into v_own from storage.objects
   where bucket_id = 'message-attachments'
     and name = '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-a0000000-0000-0000-0000-00000000000a.jpg';
  select count(*) into v_coach_upload from storage.objects
   where bucket_id = 'message-attachments'
     and name = '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-a0000000-0000-0000-0000-00000000000b.jpg';
  select count(*) into v_other from storage.objects
   where bucket_id = 'message-attachments'
     and name = '33333333-3333-3333-3333-333333333333/33333333-3333-3333-3333-333333333333-a0000000-0000-0000-0000-00000000000c.jpg';
  select count(*) into v_junk from storage.objects
   where bucket_id = 'message-attachments'
     and name in ('kotu-ad.jpg',
                  '22222222-2222-2222-2222-222222222222/gizli/22222222-2222-2222-2222-222222222222-x.jpg',
                  'zz-22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-x.jpg');

  if v_own is distinct from 1 then
    raise exception 'BASARISIZ [90 kendi eki]: beklenen 1, gelen % -- danisan KENDI ekini goremiyor', v_own;
  end if;
  if v_coach_upload is distinct from 1 then
    raise exception 'BASARISIZ [90 karsi tarafin eki]: beklenen 1, gelen % -- sohbetin iki tarafi sarti KIRIK', v_coach_upload;
  end if;
  if v_other is distinct from 0 then
    raise exception 'BASARISIZ [90 SIZINTI]: Danisan A, Danisan B nin sohbet ekini GORUYOR (%)!', v_other;
  end if;
  if v_junk is distinct from 0 then
    raise exception 'BASARISIZ [90 ayristirici]: bozuk adli % nesne gorunuyor -- FAIL-OPEN', v_junk;
  end if;
end $$;

-- Koç: aynı bucket'ta HER konuşmayı görür (tek koçlu model).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from storage.objects
   where bucket_id = 'message-attachments'
     and name like '%-a0000000-0000-0000-0000-%';
  if v_n is distinct from 3 then
    raise exception 'BASARISIZ [90 koc]: beklenen 3 nesne, gelen %', v_n;
  end if;
end $$;

-- anon: politikalar yalnızca `authenticated` rolüne verildi -> HİÇBİR nesne.
set local role anon;
do $$
declare v_n int;
begin
  select count(*) into v_n from storage.objects where bucket_id = 'message-attachments';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [90 anon]: giris yapmamis ziyaretci % nesne goruyor', v_n;
  end if;
  raise notice 'GECTI [90 Ek okuma: iki taraf EVET, ucuncu kisi HAYIR, bozuk ad HAYIR, anon HAYIR, koc hepsi]';
end $$;
rollback;


-- =============================================================================
-- MESAJ EKİ — 91) `message-attachments` YAZMA: klasör ve yükleyen ön eki
-- SAHTELENEMEZ
--   (a) POZİTİF: A kendi konuşma klasörüne, kendi uid ön ekiyle yükler
--   (b) A, B'nin konuşma klasörüne yükleyemez        (delil yerleştirme kapalı)
--   (c) A, KOÇUN uid'iyle adlandırılmış dosya yükleyemez (kimlik taklidi kapalı)
--   (d) POZİTİF: koç, A'nın klasörüne KENDİ ön ekiyle yükleyebilir
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_caught boolean; v_state text;
begin
  -- (a)
  insert into storage.objects (bucket_id, name)
  values ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-91000000-0000-0000-0000-000000000001.jpg');

  -- (b)
  v_caught := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('message-attachments', '33333333-3333-3333-3333-333333333333/22222222-2222-2222-2222-222222222222-91000000-0000-0000-0000-000000000002.jpg');
  exception when others then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [91b]: Danisan A, B nin sohbet klasorune dosya BIRAKABILDI';
  end if;

  -- (c)
  v_caught := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('message-attachments', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-91000000-0000-0000-0000-000000000003.jpg');
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [91c]: Danisan A, KOC adina dosya yukleyebildi -- yukleyen on eki sahtelenebilir!';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
begin
  -- (d)
  insert into storage.objects (bucket_id, name)
  values ('message-attachments', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-91000000-0000-0000-0000-000000000004.jpg');
  raise notice 'GECTI [91 Ek yazma: kendi klasoru EVET, baskasinin klasoru HAYIR, kimlik taklidi HAYIR, koc her konusmaya EVET]';
end $$;
rollback;


-- =============================================================================
-- OKUNDU BİLGİSİ — 92) `read_at` KANONİK / `is_read` TÜREV invaryantı
--   (a) yalnızca `is_read` yazılınca `read_at` TÜRER
--   (b) `read_at` NULL'a çekilince `is_read` false OLUR
--   (c) çelişkili yazma (read_at dolu + is_read=false) NORMALLEŞTİRİLİR (hata YOK)
--   (d) trigger DEVRE DIŞI bırakılsa bile CHECK tutarsız satırı REDDEDER
--
-- KURULUM (2026-08-18): senaryo eskiden seed'in OKUNMAMIŞ bırakılmış mesajını
-- arıyordu ("Danisan A ya gelmis OKUNMAMIS mesaj yok (seed degismis)"). E2E'nin
-- mesajlaşma akışı sohbeti okundu işaretleyince o satır TÜKENİYOR ve senaryo
-- kuruluma takılıyordu. Okunmamış mesaj artık burada üretilir.
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, read_at)
values (
  'e0000000-0000-0000-0000-000000000092'::uuid,
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'zz-92 okunmamis mesaj (read_at invaryanti)',
  null
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_id      uuid;
  v_read_at timestamptz;
  v_flag    boolean;
begin
  -- Satır ALICI kimliğiyle, RLS altında okunur: görünmüyorsa senaryo anlamsızdır.
  select id into v_id
    from public.messages
   where id = 'e0000000-0000-0000-0000-000000000092'::uuid
     and read_at is null;
  if v_id is null then
    raise exception 'BASARISIZ [92 kurulum]: uretilen OKUNMAMIS mesaj aliciya gorunmuyor';
  end if;

  -- (a)
  update public.messages set is_read = true where id = v_id;
  select read_at, is_read into v_read_at, v_flag from public.messages where id = v_id;
  if v_read_at is null or not v_flag then
    raise exception 'BASARISIZ [92a]: yalnizca is_read yazildi ama read_at TUREMEDI (read_at=%, is_read=%)', v_read_at, v_flag;
  end if;

  -- (b)
  update public.messages set read_at = null where id = v_id;
  select read_at, is_read into v_read_at, v_flag from public.messages where id = v_id;
  if v_read_at is not null or v_flag then
    raise exception 'BASARISIZ [92b]: read_at NULL a cekildi ama is_read true kaldi';
  end if;

  -- (c)
  update public.messages set read_at = now(), is_read = false where id = v_id;
  select read_at, is_read into v_read_at, v_flag from public.messages where id = v_id;
  if v_read_at is null or not v_flag then
    raise exception 'BASARISIZ [92c]: celiskili yazma normallestirilmedi (read_at=%, is_read=%)', v_read_at, v_flag;
  end if;

  raise notice 'GECTI [92a/b/c read_at KANONIK, is_read TUREV: her iki yon de normallestiriliyor]';
end $$;
rollback;

begin;
-- (d) KISIT tek başına da tutar: trigger kapatılınca tutarsız satır GİREMEZ.
alter table public.messages disable trigger messages_sync_read_state;
do $$
declare v_caught boolean := false; v_state text;
begin
  begin
    insert into public.messages (sender_id, receiver_id, client_id, message, is_read, read_at)
    values ('22222222-2222-2222-2222-222222222222'::uuid,
            '11111111-1111-1111-1111-111111111111'::uuid,
            '22222222-2222-2222-2222-222222222222'::uuid,
            'zz-92d tutarsiz satir', true, null);
  exception when check_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [92d]: trigger kapaliyken is_read=true / read_at=null satiri GIRDI -- invaryant yalnizca triggera dayaniyor';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [92d hata kodu]: beklenen 23514, gelen %', v_state;
  end if;
  raise notice 'GECTI [92d Trigger devre disi olsa bile CHECK tutarsiz satiri reddediyor (23514)]';
end $$;
rollback;


-- =============================================================================
-- BESLENME LOGU — 93) `nutrition_logs` erişim matrisi
--   danışan: kendi satırı R/W  |  başka danışanınki: HİÇ
--   koç    : SALT OKUMA (§3.2 "danışanın kendi log'una yazamaz")
--   anon   : permission denied
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_id uuid; v_caught boolean := false; v_state text;
begin
  insert into public.nutrition_logs (client_id, log_date, description, kcal, protein_g, carb_g, fat_g)
  values ('22222222-2222-2222-2222-222222222222'::uuid, current_date, 'zz-93 yulaf + yumurta', 520, 32, 55, 18)
  returning id into v_id;
  perform set_config('zz.nl_93', v_id::text, true);

  -- Başka danışan adına yazma -> RLS
  begin
    insert into public.nutrition_logs (client_id, description)
    values ('33333333-3333-3333-3333-333333333333'::uuid, 'zz-93 baskasinin adina');
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [93]: Danisan A, B adina beslenme logu yazabildi';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.nutrition_logs where description like 'zz-93%';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [93 sizinti]: Danisan B, A nin ogun logunu goruyor (%)', v_n;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_n      int;
  v_rows   int;
  v_caught boolean := false;
begin
  select count(*) into v_n from public.nutrition_logs where description like 'zz-93%';
  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [93 koc okuma]: beklenen 1, gelen %', v_n;
  end if;

  -- Koç YAZAMAZ: INSERT politikası `client_id = auth.uid()`
  begin
    insert into public.nutrition_logs (client_id, description)
    values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-93 koc yazdi');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [93 koc INSERT]: koc danisanin ogun loguna yazabildi -- §3.2 ihlali';
  end if;

  -- Koç UPDATE/DELETE: USING false -> hata YOK, ETKILENEN SATIR 0 olmali
  update public.nutrition_logs set kcal = 9999 where id = current_setting('zz.nl_93')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [93 koc UPDATE]: koc % satir guncelledi (beklenen 0)', v_rows;
  end if;

  delete from public.nutrition_logs where id = current_setting('zz.nl_93')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [93 koc DELETE]: koc % satir sildi (beklenen 0)', v_rows;
  end if;
end $$;

set local role anon;
do $$
declare v_caught boolean := false; v_state text; v_n int;
begin
  begin
    select count(*) into v_n from public.nutrition_logs;
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [93 anon]: giris yapmamis ziyaretci nutrition_logs okuyabildi (% satir)', v_n;
  end if;
  raise notice 'GECTI [93 nutrition_logs: danisan R/W kendi, baska danisan HIC, koc SALT OKUMA, anon DENY]';
end $$;
rollback;


-- =============================================================================
-- BESLENME HEDEFİ — 94) `nutrition_plans.target_*`
--   (a) POZİTİF: koç danışanın planına günlük hedef yazar
--   (b) NEGATİF makro CHECK ile reddedilir (23514)
--   (c) BAŞKA danışan bu hedefleri değiştiremez (0 satır)
--
-- KURULUM: hedef yazılacak AKTİF beslenme planı burada üretilir. Eskiden
-- seed'in §2c planına güveniliyordu; "etkilenen 1 satır" iddiası, plan E2E
-- tarafından yeniden yazılırsa/kaybolursa kuruluma takılırdı.
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.nutrition_plans (id, client_id, version, is_active)
values ('cccccccc-0000-0000-0000-000000000094', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal)
values ('cccccccc-0000-0000-0000-000000000094', 'Pazartesi', 0, 'Yulaf Ezmesi 80g', 1850);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_rows   int;
  v_kcal   int;
  v_caught boolean := false;
  v_state  text;
begin
  update public.nutrition_plans
     set target_kcal = 2400, target_protein_g = 180, target_carb_g = 250, target_fat_g = 70
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [94a]: koc hedef yazamadi (etkilenen %)', v_rows;
  end if;

  select target_kcal into v_kcal from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  if v_kcal is distinct from 2400 then
    raise exception 'BASARISIZ [94a geri okuma]: beklenen 2400, gelen %', v_kcal;
  end if;

  begin
    update public.nutrition_plans set target_protein_g = -1
     where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  exception when check_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [94b]: negatif makro hedefi kabul edildi -- CHECK >= 0 yok';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_rows int;
begin
  update public.nutrition_plans set target_kcal = 9999
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [94c]: Danisan B, A nin makro hedefini degistirdi (% satir)', v_rows;
  end if;
  raise notice 'GECTI [94 Gunluk makro hedefi: koc yazar, negatif deger RED, baska danisan degistiremez]';
end $$;
rollback;


-- =============================================================================
-- REALTIME — 95) Yayın sözleşmesi (AC-2.2) ŞEMADA kilitlenir
--
-- Bu senaryo bir DAVRANIŞ testi değil, bir SÜRÜKLENME testidir: gerçek
-- WebSocket ölçümü 20260817190400 başlığındaki tabloda kayıtlıdır (INSERT
-- 78 ms / UPDATE 80 ms, ilgisiz danışana SIFIR olay, DELETE olayı `d` altinda
-- RLS ile degerlendirilemedigi icin yayindan cikarildi). Buradaki iş, o
-- ölçümün dayandığı YAPILANDIRMANIN sessizce değişmemesini garanti etmektir.
-- =============================================================================
begin;
do $$
declare
  r        record;
  v_ident  "char";
begin
  select pubinsert, pubupdate, pubdelete, pubtruncate into r
    from pg_publication where pubname = 'supabase_realtime';
  if r is null then
    raise exception 'BASARISIZ [95]: supabase_realtime yayini YOK -- realtime mesajlasma imkansiz';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    raise exception 'BASARISIZ [95]: public.messages yayinda degil -- AC-2.2 karsilanamaz';
  end if;

  if not r.pubinsert then
    raise exception 'BASARISIZ [95]: yayin INSERT tasimiyor -- yeni mesaj canli dusmez';
  end if;
  if not r.pubupdate then
    raise exception 'BASARISIZ [95]: yayin UPDATE tasimiyor -- read_at (okundu) canli dusmez';
  end if;
  if r.pubdelete or r.pubtruncate then
    raise exception 'BASARISIZ [95]: yayin DELETE/TRUNCATE tasiyor -- replica identity ''d'' altinda bu olaylarda RLS DEGERLENDIRILEMEZ (olculen sizinti: filtresiz abone baskasinin silinen mesaj id sini alir). delete gerekiyorsa ONCE replica identity full sart.';
  end if;

  select relreplident into v_ident from pg_class where oid = 'public.messages'::regclass;
  if v_ident is distinct from 'd' then
    raise exception 'BASARISIZ [95]: messages replica identity ''%'' -- 20260817190400 in olcumu ''d'' varsayimina dayaniyor, yeniden degerlendirilmeli', v_ident;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nutrition_logs'
  ) then
    raise exception 'BASARISIZ [95]: nutrition_logs yayina eklenmis -- plan bunu istemiyor';
  end if;

  raise notice 'GECTI [95 Realtime yayini: messages ICERIDE, insert+update ACIK, delete/truncate KAPALI, replica identity d]';
end $$;
rollback;


-- =============================================================================
-- FAZ 2f — SISTEM MESAJI RPC (20260817200000_system_message_rpc.sql)
-- =============================================================================


-- =============================================================================
-- SISTEM MESAJI — 96) POZITIF: koc RPC ile sistem mesaji yazabiliyor
-- `messages_guard_columns()`'in dogrudan INSERT'te kapattigi kanal artik
-- `post_system_message()` RPC'si uzerinden GERCEKTEN acik. Mesaj kind='system',
-- client_id konusmanin dogru tarafinda, ek yok, ve read_at/is_read invaryanti
-- (messages_read_state_chk / messages_sync_read_state) sistem mesajinda da
-- tutuyor (yeni mesaj "okunmamis" olarak dogar).
-- =============================================================================
begin;
do $$
declare
  v_fc_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  insert into public.form_checks (client_id, current_weight, front_pose_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 81.4,
          'poses/22222222-2222-2222-2222-222222222222-96000000-0000-0000-0000-000000000096.jpg')
  returning id into v_fc_id;
  perform set_config('zz.fc_96', v_fc_id::text, true);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_fc_id uuid := current_setting('zz.fc_96')::uuid;
  v_msg   public.messages;
begin
  update public.form_checks
     set status = 'reviewed', coach_feedback = 'zz-96 harika gidiyorsun'
   where id = v_fc_id;

  select * into v_msg from public.post_system_message(
    '22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', v_fc_id);

  if v_msg.id is null then
    raise exception 'BASARISIZ [96 RPC]: satir DONMEDI';
  end if;
  if v_msg.kind is distinct from 'system'::public.message_kind then
    raise exception 'BASARISIZ [96 kind]: beklenen system, gelen %', v_msg.kind;
  end if;
  if v_msg.client_id is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [96 client_id]: gelen %', v_msg.client_id;
  end if;
  if v_msg.sender_id is distinct from '11111111-1111-1111-1111-111111111111'::uuid
     or v_msg.receiver_id is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [96 sender/receiver]: gonderen=%, alici=%', v_msg.sender_id, v_msg.receiver_id;
  end if;
  if v_msg.attachment_path is not null then
    raise exception 'BASARISIZ [96 attachment_path]: sistem mesajinin eki OLMAMALI, gelen %', v_msg.attachment_path;
  end if;
  if v_msg.message not like '%zz-96 harika gidiyorsun%' then
    raise exception 'BASARISIZ [96 metin]: koc geri bildirimini ICERMIYOR -- gelen %', v_msg.message;
  end if;
  if v_msg.read_at is not null or v_msg.is_read then
    raise exception 'BASARISIZ [96 okundu invaryanti]: yeni sistem mesaji OKUNMUS dogdu (read_at=%, is_read=%)', v_msg.read_at, v_msg.is_read;
  end if;
  if v_msg.is_read is distinct from (v_msg.read_at is not null) then
    raise exception 'BASARISIZ [96 is_read/read_at invaryanti]: is_read=%, read_at=%', v_msg.is_read, v_msg.read_at;
  end if;

  raise notice 'GECTI [96 POZITIF - post_system_message() kind=system yazar, client_id dogru, ek yok, okunmamis dogar]';
end $$;
rollback;


-- =============================================================================
-- SISTEM MESAJI — 97) Danisan RPC'yi CAGIRAMAZ -- ne kendi adina ne baskasi adina
-- `post_system_message()` yalnizca `is_coach(auth.uid())` icin acik (Tasarim
-- Karari 2). Danisanin sistem mesaji "tetikleyecegi" hicbir mesru senaryo yok.
-- =============================================================================
begin;
do $$
declare
  v_fc_id uuid;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
  insert into public.form_checks (client_id, current_weight, front_pose_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 81.4,
          'poses/22222222-2222-2222-2222-222222222222-97000000-0000-0000-0000-000000000097.jpg')
  returning id into v_fc_id;
  perform set_config('zz.fc_97', v_fc_id::text, true);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_fc_id uuid := current_setting('zz.fc_97')::uuid;
begin
  update public.form_checks set status = 'reviewed', coach_feedback = 'zz-97' where id = v_fc_id;
end $$;

-- (a) Danisan A kendi adina cagiriyor
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_fc_id  uuid := current_setting('zz.fc_97')::uuid;
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', v_fc_id);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [97a]: danisan KENDI adina RPC yi cagirabildi -- sadece koc cagirabilmeliydi!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [97a hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [97a Danisan kendi adina RPC yi cagiramaz (42501)]';
end $$;

-- (b) Danisan B, danisan A adina cagirmaya calisiyor
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare
  v_fc_id  uuid := current_setting('zz.fc_97')::uuid;
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', v_fc_id);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [97b]: danisan B, A adina RPC yi cagirabildi!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [97b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [97b Danisan B, A adina RPC yi cagiramaz (42501)]';
end $$;
rollback;


-- =============================================================================
-- SISTEM MESAJI — 98) [KRITIK REGRESYON] KOC bile DOGRUDAN .insert() ile
-- kind='system' YAZAMAZ -- RPC eklenmesi guard'i ZAYIFLATMADI
--
-- Senaryo 61 bunu DANISAN tarafinda zaten kanitliyor; bu senaryo KOC tarafini
-- kapatir (guard KOC DAHIL herkese kapali, 20260817160200 §1). Tek yazma
-- kanali post_system_message() RPC'sidir.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    insert into public.messages (sender_id, receiver_id, client_id, kind, message)
    values ('11111111-1111-1111-1111-111111111111'::uuid,
            '22222222-2222-2222-2222-222222222222'::uuid,
            '22222222-2222-2222-2222-222222222222'::uuid,
            'system'::public.message_kind,
            'zz-98 dogrudan sistem mesaji denemesi');
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [98]: KOC dogrudan insert ile kind=system YAZABILDI -- guard RPC eklenirken ZAYIFLADI!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [98 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [98 KRITIK - Koc dahi dogrudan insert ile kind=system yazamaz (42501), guard zayiflamadi]';
end $$;
rollback;


-- =============================================================================
-- SISTEM MESAJI — 99) RPC serbest metin / sahte referans KABUL ETMEZ
--   (a) bilinmeyen olay turu                        -> 22023
--   (b) form_checks kaydi baska danisana ait         -> 42501
--   (c) form_checks kaydi henuz incelenmedi(pending) -> 42501
--   (d) form_checks kaydi cagiran KOC tarafindan degil BASKASI tarafindan
--       incelenmis                                   -> 42501
--       (tek koclu modelde bu yolu tetiklemek icin postgres kimligiyle --
--        form_checks_guard_review auth.uid() NULL iken CEKILIR (§6a) -- elle
--        sahte reviewed_by yaziliyor; gercek uygulama akisinda olusmaz, tek
--        amac RPC'nin KENDI kontrolunu olcmek)
-- =============================================================================
begin;

insert into public.form_checks (client_id, current_weight, front_pose_path, status, coach_feedback, reviewed_at, reviewed_by)
values
  -- (b) icin: B'ye ait, incelenmis
  ('33333333-3333-3333-3333-333333333333'::uuid, 70.0,
   'poses/33333333-3333-3333-3333-333333333333-99000000-0000-0000-0000-000000000b01.jpg',
   'reviewed'::public.form_check_status, 'zz-99b', now(), '11111111-1111-1111-1111-111111111111'::uuid),
  -- (c) icin: A'ya ait, HALA pending
  ('22222222-2222-2222-2222-222222222222'::uuid, 82.0,
   'poses/22222222-2222-2222-2222-222222222222-99000000-0000-0000-0000-000000000c01.jpg',
   'pending'::public.form_check_status, null, null, null),
  -- (d) icin: A'ya ait, incelenmis AMA reviewed_by cagiran KOC DEGIL
  ('22222222-2222-2222-2222-222222222222'::uuid, 82.0,
   'poses/22222222-2222-2222-2222-222222222222-99000000-0000-0000-0000-000000000d01.jpg',
   'reviewed'::public.form_check_status, 'zz-99d', now(), '33333333-3333-3333-3333-333333333333'::uuid);

do $$
begin
  perform set_config('zz.fc_99b',
    (select id::text from public.form_checks where coach_feedback = 'zz-99b'), true);
  perform set_config('zz.fc_99c',
    (select id::text from public.form_checks
      where client_id = '22222222-2222-2222-2222-222222222222'::uuid
        and status = 'pending'::public.form_check_status
        and current_weight = 82.0 and reviewed_by is null), true);
  perform set_config('zz.fc_99d',
    (select id::text from public.form_checks where coach_feedback = 'zz-99d'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean;
  v_state  text;
begin
  -- (a) bilinmeyen olay turu
  v_caught := false;
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'plan_published', null);
  exception when others then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [99a]: bilinmeyen olay turu KABUL EDILDI -- serbest bicimde yeni olay uydurulabilir!';
  end if;
  if v_state is distinct from '22023' then
    raise exception 'BASARISIZ [99a hata kodu]: beklenen 22023, gelen %', v_state;
  end if;

  -- (b) baska danisanin form_check'i A'ya baglanmaya calisiliyor
  v_caught := false;
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', current_setting('zz.fc_99b')::uuid);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [99b]: baska danisanin form_check i baska birine BAGLANABILDI!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [99b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  -- (c) henuz incelenmemis (pending) form_check
  v_caught := false;
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', current_setting('zz.fc_99c')::uuid);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [99c]: HENUZ incelenmemis form_check icin sistem mesaji URETILEBILDI!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [99c hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  -- (d) reviewed_by cagiran koc DEGIL
  v_caught := false;
  begin
    perform public.post_system_message('22222222-2222-2222-2222-222222222222'::uuid, 'form_check_reviewed', current_setting('zz.fc_99d')::uuid);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [99d]: reviewed_by BASKASI iken cagiran koc yine de sistem mesaji URETEBILDI!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [99d hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  raise notice 'GECTI [99 RPC sablon disi / sahte referans kabul etmiyor: bilinmeyen olay(22023), yanlis danisan/henuz incelenmemis/baska koc(42501)]';
end $$;
rollback;


-- =============================================================================
-- PLAN VERSIYONLAMA — 100) YAYINLAMA: eski plan arşivlenir, satırları KORUNUR,
-- yeni plan `version = eski + 1` ve `is_active = true` olur.
--
-- Kaynak: active_planprogram.md §4.1 "plan yayınlama = yeni version, eski
-- versiyon is_active=false". Uygulama: 20260817210000_workout_plan_versioning.sql
--
-- KURULUM ÖNEMLİ: yayınlama dalına ancak aktif planın satırlarına bağlı BİR LOG
-- varsa girilir (copy-on-write, migration KARAR 1/C). Bu yüzden önce danışan
-- kendi adına bir set yazar (koç `workout_logs`'a INSERT EDEMEZ — senaryo 88).
--
-- BAŞLANGIÇ DURUMU BURADA KURULUR (2026-08-18): senaryo eskiden "Danışan A'nın
-- seed'den gelen v1 aktif planı" varsayıyordu. E2E'nin plan kaydetme akışı
-- (ve bu senaryonun kendisi, reset'siz koşulan bir ortamda) A'yı v2/v3'e
-- taşıdığında versiyon iddiaları kayıyordu. Artık A'nın plan geçmişi
-- SIFIRLANIR ve bilinen bir v1'den başlanır.
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000100', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line) values
  ('aaaaaaaa-0000-0000-0000-000000000100', 'Pazartesi', 0, '1. Zz Baslangic - 4x8'),
  ('aaaaaaaa-0000-0000-0000-000000000100', 'Salı',      0, '1. Zz Baslangic 2 - 3x10');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_plan uuid;
  v_pe   uuid;
begin
  select wp.id into v_plan
    from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  if v_plan is null then
    raise exception 'BASARISIZ [100 kurulum]: Danisan A nin aktif plani RLS altinda GORUNMUYOR';
  end if;

  select wpe.id into v_pe from public.workout_plan_exercises wpe where wpe.plan_id = v_plan
   order by wpe.day, wpe.position limit 1;
  if v_pe is null then
    raise exception 'BASARISIZ [100 kurulum]: aktif planin egzersiz satiri yok';
  end if;

  insert into public.workout_logs (client_id, exercise_name, set_number, plan_exercise_id)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-100-gecmis', 1, v_pe);

  perform set_config('zz.plan_v1', v_plan::text, true);
  perform set_config('zz.pe_v1',   v_pe::text,   true);
  perform set_config('zz.rows_v1', (select count(*)::text from public.workout_plan_exercises where plan_id = v_plan), true);
end $$;

-- Yayınlamayı KOÇ yapar (gerçek akış: koç planı kaydeder).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_old      uuid := current_setting('zz.plan_v1')::uuid;
  v_new      uuid;
  v_ver      integer;
  v_old_ver  integer;
  v_old_act  boolean;
  v_rows_old integer;
begin
  select version into v_old_ver from public.workout_plans where id = v_old;

  perform public.save_workout_plan(
    array['22222222-2222-2222-2222-222222222222'::uuid],
    '{"Pazartesi": "1. Zz Yayin - 4x8"}'::jsonb
  );

  select id, version into v_new, v_ver
    from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  select is_active into v_old_act from public.workout_plans where id = v_old;
  select count(*) into v_rows_old from public.workout_plan_exercises where plan_id = v_old;

  if v_new is null or v_new = v_old then
    raise exception 'BASARISIZ [100a]: yayinlama YENI bir plan satiri uretmedi (hala %)', v_old;
  end if;
  if v_ver is distinct from (v_old_ver + 1) then
    raise exception 'BASARISIZ [100b version]: beklenen %, gelen %', v_old_ver + 1, v_ver;
  end if;
  if coalesce(v_old_act, true) then
    raise exception 'BASARISIZ [100c]: eski plan hala is_active=true -- arsivlenmedi';
  end if;
  if v_rows_old is distinct from current_setting('zz.rows_v1')::integer then
    raise exception 'BASARISIZ [100d]: eski VERSIYONUN satirlari degisti (beklenen %, gelen %) -- yayinlama arsivi BOZUYOR',
      current_setting('zz.rows_v1')::integer, v_rows_old;
  end if;

  raise notice 'GECTI [100 Yayinlama: eski plan arsivlendi (v%), yeni aktif plan v% acildi, arsiv satirlari korundu]', v_old_ver, v_ver;
end $$;
rollback;


-- =============================================================================
-- PLAN VERSIYONLAMA — 101) *** EN KRİTİK *** GEÇMİŞ LOGUN PLAN BAĞI KOPMUYOR
--
-- ÖLÇTÜĞÜ GERÇEK KAYIP: `workout_logs.plan_exercise_id` FK'si
-- `ON DELETE SET NULL`'dur (20260817190000). Faz 1b'de `save_workout_plan()`
-- plan satırlarını SİLİP yeniden yazdığı için koç her kaydettiğinde danışanın
-- GEÇMİŞ LOGLARININ plan bağı NULL'a düşüyordu; geriye yalnızca serbest metin
-- `exercise_name` etiketi kalıyordu. §4.1'in "geçmiş loglar eski versiyona
-- bağlı kalır — FK versiyonlu satıra" garantisi SAĞLANMIYORDU.
--
-- Bu senaryo 20260817210000 geri alınırsa KIRILIR (kırmızı-yeşil kanıtı).
--
-- BAŞLANGIÇ DURUMU BURADA KURULUR (senaryo 100 ile aynı gerekçe).
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000101', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
values ('aaaaaaaa-0000-0000-0000-000000000101', 'Pazartesi', 0, '1. Zz Baslangic - 4x8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_plan uuid;
  v_pe   uuid;
  v_log  uuid;
begin
  select wp.id into v_plan from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  select wpe.id into v_pe from public.workout_plan_exercises wpe where wpe.plan_id = v_plan
   order by wpe.day, wpe.position limit 1;
  if v_pe is null then
    raise exception 'BASARISIZ [101 kurulum]: aktif planin egzersiz satiri RLS altinda GORUNMUYOR';
  end if;

  insert into public.workout_logs (client_id, exercise_name, weight_kg, reps, set_number, plan_exercise_id, completed_at)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-101-gecmis', 62.5, 8, 1, v_pe, now())
  returning id into v_log;

  perform set_config('zz.log_101', v_log::text, true);
  perform set_config('zz.pe_101',  v_pe::text,  true);
  perform set_config('zz.plan_101', v_plan::text, true);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_log   uuid := current_setting('zz.log_101')::uuid;
  v_pe    uuid := current_setting('zz.pe_101')::uuid;
  v_plan  uuid := current_setting('zz.plan_101')::uuid;
  v_fk    uuid;
  v_owner uuid;
  v_act   boolean;
begin
  -- Koç planı kaydeder (gerçek akış). Faz 1b'de bu satır logu koparıyordu.
  perform public.save_workout_plan(
    array['22222222-2222-2222-2222-222222222222'::uuid],
    '{"Pazartesi": "1. Zz Yeni Plan - 5x5", "Salı": "1. Zz Ikinci - 3x12"}'::jsonb
  );

  select plan_exercise_id into v_fk from public.workout_logs where id = v_log;

  if v_fk is null then
    raise exception 'BASARISIZ [101]: GECMIS LOGUN PLAN BAGI NULL A DUSTU -- plan kaydetmek antrenman gecmisini KOPARIYOR (§4.1 ihlali)';
  end if;
  if v_fk is distinct from v_pe then
    raise exception 'BASARISIZ [101 hedef]: log baska bir plan satirina kaydi (beklenen %, gelen %)', v_pe, v_fk;
  end if;

  -- FK gerçekten ESKİ (arşiv) versiyona işaret etmeli, yenisine değil.
  select wp.id, wp.is_active into v_owner, v_act
    from public.workout_plan_exercises wpe
    join public.workout_plans wp on wp.id = wpe.plan_id
   where wpe.id = v_fk;

  if v_owner is distinct from v_plan then
    raise exception 'BASARISIZ [101 versiyon]: log un bagli oldugu satir % planina ait, beklenen %', v_owner, v_plan;
  end if;
  if coalesce(v_act, true) then
    raise exception 'BASARISIZ [101 arsiv]: log un bagli oldugu plan hala aktif -- eski versiyon arsivlenmemis';
  end if;

  raise notice 'GECTI [101 KRITIK: gecmis log ESKI (arsiv) versiyona bagli KALDI, FK NULL a dusmedi]';
end $$;
rollback;


-- =============================================================================
-- PLAN VERSIYONLAMA — 102) OKUMA YOLLARI YAYINDAN SONRA DA AKTİF PLANI GÖRÜR
--
-- Arşiv satırları eklendikten sonra `useWorkoutPlan` / `useWorkoutPlanExercises`
-- sorgularının (`.eq('is_active', true).maybeSingle()`) hâlâ TEK satır döndürmesi
-- ve o satırın YENİ versiyon olması şart. `maybeSingle()` birden çok satırda
-- HATA verir — yani arşiv sızarsa uygulama kırılırdı.
--
-- BAŞLANGIÇ DURUMU BURADA KURULUR (senaryo 100 ile aynı gerekçe): "yayından
-- sonra TEK aktif plan ve TEK satır" iddiası, başlangıçtaki plan sayısına
-- duyarlıdır.
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000102', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
values ('aaaaaaaa-0000-0000-0000-000000000102', 'Pazartesi', 0, '1. Zz Baslangic - 4x8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_plan uuid;
  v_pe   uuid;
begin
  select wp.id into v_plan from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  select wpe.id into v_pe from public.workout_plan_exercises wpe where wpe.plan_id = v_plan limit 1;
  if v_pe is null then
    raise exception 'BASARISIZ [102 kurulum]: aktif planin egzersiz satiri RLS altinda GORUNMUYOR';
  end if;
  insert into public.workout_logs (client_id, exercise_name, set_number, plan_exercise_id)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-102', 1, v_pe);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
select public.save_workout_plan(
  array['22222222-2222-2222-2222-222222222222'::uuid],
  '{"Pazartesi": "1. Zz Aktif - 4x8"}'::jsonb
);

-- KOÇ gözünden okuma (usePlans.useWorkoutPlan sorgusu).
do $$
declare
  v_n    integer;
  v_text text;
begin
  select count(*) into v_n from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [102a koc]: aktif plan sayisi % -- maybeSingle() kirilirdi', v_n;
  end if;

  select string_agg(wpe.raw_line, E'\n' order by wpe.position) into v_text
    from public.workout_plans wp
    join public.workout_plan_exercises wpe on wpe.plan_id = wp.id
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid
     and wp.is_active and wpe.day = 'Pazartesi';
  if v_text is distinct from '1. Zz Aktif - 4x8' then
    raise exception 'BASARISIZ [102a icerik]: koc YENI plani gormuyor, gelen %', coalesce(v_text, '<null>');
  end if;
  raise notice 'GECTI [102a Koc yayindan sonra TEK aktif plani ve YENI icerigi goruyor]';
end $$;

-- DANIŞAN gözünden okuma (aynı sorgu + gym modu satırları).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_n     integer;
  v_rows  integer;
  v_arch  integer;
begin
  select count(*) into v_n from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and is_active;
  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [102b danisan]: aktif plan sayisi %', v_n;
  end if;

  -- useWorkoutSession.useWorkoutPlanExercises: aktif planin satirlari.
  select count(*) into v_rows
    from public.workout_plans wp
    join public.workout_plan_exercises wpe on wpe.plan_id = wp.id
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [102b gym modu]: aktif plan satir sayisi %, beklenen 1', v_rows;
  end if;

  -- Arsiv GORUNUR olmali (gecmis log cozumlenebilsin diye) ama AKTIF olmamali.
  select count(*) into v_arch from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid and not is_active;
  if v_arch < 1 then
    raise exception 'BASARISIZ [102b arsiv]: danisan kendi arsiv versiyonunu goremiyor -- gecmis log cozumlenemez';
  end if;

  raise notice 'GECTI [102b Danisan aktif plani goruyor, arsiv okunabilir ama aktif degil]';
end $$;
rollback;


-- =============================================================================
-- PLAN VERSIYONLAMA — 103) TOPLU ATAMADA VERSİYON HER DANIŞAN İÇİN BAĞIMSIZ
-- ilerler + TASLAK dalı versiyon şişirmez (çift kaydetme v3 üretmez).
--
-- `save_workout_plan(p_client_ids uuid[], ...)` aynı planı N danışana yazar;
-- `version` GLOBAL değil DANIŞAN BAŞINA sayaçtır. Bu senaryoda A'nın geçmişi
-- vardır (yayınlanır, v1 -> v2), B'nin yoktur (taslak, v1'de kalır).
--
-- BU SENARYONUN BAŞLANGIÇ DURUMU EN HASSASIDIR: iddia MUTLAK versiyon
-- numaralarına (A=2, B=1) ve MUTLAK plan sayılarına (2/1) bakar. Daha önce
-- seed'in "her danışan v1" hâline güveniyordu; A bir kez yayınlandığında
-- (E2E ya da bu paketin 100/101/102 senaryoları reset'siz bir ortamda)
-- v3 üretiliyor ve senaryo kırılıyordu. İki danışanın plan geçmişi de burada
-- SIFIRLANIR: A bilinen bir v1 ile başlar, B ise HİÇ planı olmadan (RPC ona
-- v1 açacak) — böylece "sayaç danışan başına" iddiası tam olarak ölçülür.
-- =============================================================================
begin;

delete from public.workout_plans
 where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000103', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
values ('aaaaaaaa-0000-0000-0000-000000000103', 'Pazartesi', 0, '1. Zz Baslangic - 4x8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_plan uuid; v_pe uuid;
begin
  select wp.id into v_plan from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  select wpe.id into v_pe from public.workout_plan_exercises wpe where wpe.plan_id = v_plan limit 1;
  if v_pe is null then
    raise exception 'BASARISIZ [103 kurulum]: aktif planin egzersiz satiri RLS altinda GORUNMUYOR';
  end if;
  insert into public.workout_logs (client_id, exercise_name, set_number, plan_exercise_id)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-103', 1, v_pe);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_a uuid := '22222222-2222-2222-2222-222222222222';
  v_b uuid := '33333333-3333-3333-3333-333333333333';
  v_va integer; v_vb integer; v_na integer; v_nb integer;
begin
  -- TEK cagri, IKI danisan: A yayinlanmali, B taslak kalmali.
  perform public.save_workout_plan(array[v_a, v_b], '{"Pazartesi": "1. Zz Toplu - 3x10"}'::jsonb);

  select version into v_va from public.workout_plans where client_id = v_a and is_active;
  select version into v_vb from public.workout_plans where client_id = v_b and is_active;
  select count(*) into v_na from public.workout_plans where client_id = v_a;
  select count(*) into v_nb from public.workout_plans where client_id = v_b;

  if v_va is distinct from 2 then
    raise exception 'BASARISIZ [103a]: gecmisi OLAN danisan A nin versiyonu %, beklenen 2', v_va;
  end if;
  if v_vb is distinct from 1 then
    raise exception 'BASARISIZ [103b]: gecmisi OLMAYAN danisan B nin versiyonu % -- versiyon sayaci GLOBAL olmus, danisan basina degil', v_vb;
  end if;
  if v_na is distinct from 2 or v_nb is distinct from 1 then
    raise exception 'BASARISIZ [103c]: plan satir sayilari A=% B=%, beklenen 2/1', v_na, v_nb;
  end if;

  -- CIFT KAYDETME: yeni aktif versiyonun henuz logu yok -> taslak dali.
  perform public.save_workout_plan(array[v_a, v_b], '{"Pazartesi": "1. Zz Ikinci Kayit - 3x10"}'::jsonb);
  select version into v_va from public.workout_plans where client_id = v_a and is_active;
  select count(*) into v_na from public.workout_plans where client_id = v_a;
  if v_va is distinct from 2 or v_na is distinct from 2 then
    raise exception 'BASARISIZ [103d]: ikinci kaydetme yeni versiyon uretti (v=%, toplam=%) -- her tikla versiyon sisiyor', v_va, v_na;
  end if;

  raise notice 'GECTI [103 Toplu atamada versiyon danisan basina ilerliyor (A v2, B v1); cift kaydetme sismiyor]';
end $$;
rollback;


-- =============================================================================
-- PLAN VERSIYONLAMA — 104) TEKİLLİK KISITLARI İHLAL EDİLMİYOR
--   (a) `workout_plans_one_active_idx` — yayınlamadan sonra da danışan başına
--       TEK aktif plan (sıra: önce deaktivasyon, sonra insert).
--   (b) `workout_plans_client_version_uniq` — aynı danışanda aynı versiyon
--       numarası iki kez üretilemez (fail-closed emniyet kemeri).
--   (c) İki aktif plan ELLE de yazılamaz — indeks 23505 verir.
--
-- BAŞLANGIÇ DURUMU BURADA KURULUR (senaryo 100 ile aynı gerekçe).
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

insert into public.workout_plans (id, client_id, version, is_active)
values ('aaaaaaaa-0000-0000-0000-000000000104', '22222222-2222-2222-2222-222222222222', 1, true);

insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
values ('aaaaaaaa-0000-0000-0000-000000000104', 'Pazartesi', 0, '1. Zz Baslangic - 4x8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_plan uuid; v_pe uuid;
begin
  select wp.id into v_plan from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222'::uuid and wp.is_active;
  select wpe.id into v_pe from public.workout_plan_exercises wpe where wpe.plan_id = v_plan limit 1;
  if v_pe is null then
    raise exception 'BASARISIZ [104 kurulum]: aktif planin egzersiz satiri RLS altinda GORUNMUYOR';
  end if;
  insert into public.workout_logs (client_id, exercise_name, set_number, plan_exercise_id)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 'zz-104', 1, v_pe);
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_a       uuid := '22222222-2222-2222-2222-222222222222';
  v_active  integer;
  v_dupver  integer;
  v_caught  boolean := false;
  v_state   text;
begin
  perform public.save_workout_plan(array[v_a], '{"Pazartesi": "1. Zz 104 - 4x8"}'::jsonb);

  select count(*) into v_active from public.workout_plans where client_id = v_a and is_active;
  if v_active is distinct from 1 then
    raise exception 'BASARISIZ [104a]: yayindan sonra aktif plan sayisi % -- one_active_idx anlamsizlasmis', v_active;
  end if;

  select count(*) into v_dupver
    from (select version from public.workout_plans where client_id = v_a
           group by version having count(*) > 1) d;
  if v_dupver is distinct from 0 then
    raise exception 'BASARISIZ [104b]: ayni danisanda tekrarli version numarasi var (% adet)', v_dupver;
  end if;

  -- (c) Indeks gercekten CANLI mi? Elle ikinci bir aktif plan denenir.
  begin
    insert into public.workout_plans (client_id, version, is_active)
    values (v_a, 999, true);
  exception when others then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [104c]: IKINCI AKTIF PLAN yazilabildi -- workout_plans_one_active_idx yok/etkisiz';
  end if;
  if v_state is distinct from '23505' then
    raise exception 'BASARISIZ [104c hata kodu]: beklenen 23505, gelen %', v_state;
  end if;

  raise notice 'GECTI [104 Tekillik korundu: tek aktif plan, tekrarsiz versiyon, ikinci aktif plan 23505]';
end $$;
rollback;



-- =============================================================================
-- ILERLEME TAKIBI — 105) *** AC-4.1 *** Aynı güne İKİNCİ kilo girişi
--   (a) DÜZ ikinci `insert` duplicate satır ÜRETMEZ -> 23505
--   (b) `upsert` (on conflict) ESKİ SATIRI günceller: satır sayısı 1 KALIR,
--       `id` DEĞİŞMEZ (yeni satır doğmadı), değer yenilenir, dokunulmayan
--       ölçü kolonu KORUNUR
--   Kırmızı-yeşil: `progress_entries_client_date_uniq` düşürülünce (a) 23505
--   almaz ve (b) `42P10 no unique or exclusion constraint` ile kırılır.
-- =============================================================================
begin;
-- KURULUM (postgres): hedef gün BOŞ olmalı. 20260818090000'den beri seed'in
-- form check'leri de aynı yerel günlere `progress_entries` satırı düşürüyor
-- (çift-yazım trigger'ı) -> senaryonun kendi satırı 23505 ile çakışabilirdi.
-- "Kendi kurulumunu yap" kuralı: dışarıdaki duruma güvenme, günü kendin temizle.
delete from public.progress_entries
 where client_id = '22222222-2222-2222-2222-222222222222'::uuid
   and entry_date = date '2026-08-10';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_id     uuid;
  v_id2    uuid;
  v_n      int;
  v_w      numeric;
  v_caught boolean := false;
  v_state  text;
begin
  insert into public.progress_entries (client_id, entry_date, weight_kg, waist_cm)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-10', 82.30, 88.50)
  returning id into v_id;

  -- (a) DÜZ ikinci insert
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-10', 81.70);
  exception when unique_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [105a / AC-4.1]: ayni gune IKINCI satir GIRDI -- tekillik kisiti yok, DUPLICATE uretiliyor';
  end if;
  if v_state is distinct from '23505' then
    raise exception 'BASARISIZ [105a hata kodu]: beklenen 23505, gelen %', v_state;
  end if;

  -- (b) UPSERT eskisini GÜNCELLER
  insert into public.progress_entries (client_id, entry_date, weight_kg)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-10', 81.70)
  on conflict (client_id, entry_date) do update
    set weight_kg = excluded.weight_kg
  returning id into v_id2;

  select count(*), max(weight_kg) into v_n, v_w
    from public.progress_entries
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-10';

  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [105b / AC-4.1]: gunde % satir var (beklenen 1) -- DUPLICATE OLUSTU', v_n;
  end if;
  if v_w is distinct from 81.70 then
    raise exception 'BASARISIZ [105b]: upsert eski satiri GUNCELLEMEDI (weight_kg=%)', v_w;
  end if;
  if v_id2 is distinct from v_id then
    raise exception 'BASARISIZ [105b]: upsert YENI SATIR uretti (% -> %) -- id degisti', v_id, v_id2;
  end if;

  select waist_cm into v_w from public.progress_entries where id = v_id;
  if v_w is distinct from 88.50 then
    raise exception 'BASARISIZ [105b]: upsert dokunulmayan olcu kolonunu ezdi (waist_cm=%)', v_w;
  end if;

  raise notice 'GECTI [105 AC-4.1: ikinci insert 23505, upsert AYNI satiri gunceller, duplicate YOK]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 106) `progress_entries` erişim matrisi
--   danışan: kendi satırı R/W  |  başka danışanınki: HİÇ
--   koç    : *** SALT OKUMA *** (§6 "koç görünümü salt-okunur")
--   anon   : permission denied
-- =============================================================================
begin;
-- KURULUM (postgres): bkz. senaryo 105'in aynı notu — çift-yazım trigger'ı
-- seed form check'lerinden bu günlere satır düşürmüş olabilir.
delete from public.progress_entries
 where client_id in (
         '22222222-2222-2222-2222-222222222222'::uuid,
         '33333333-3333-3333-3333-333333333333'::uuid
       )
   and entry_date in (date '2026-08-11', date '2026-08-12');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_id uuid; v_caught boolean := false;
begin
  insert into public.progress_entries (client_id, entry_date, weight_kg, notes)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-11', 82.10, 'zz-106 kendi girisi')
  returning id into v_id;
  perform set_config('zz.pe_106', v_id::text, true);

  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('33333333-3333-3333-3333-333333333333'::uuid, date '2026-08-11', 70.00);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [106]: Danisan A, B adina ilerleme girisi yazabildi';
  end if;

  update public.progress_entries set weight_kg = 82.40 where id = v_id;
  if (select weight_kg from public.progress_entries where id = v_id) is distinct from 82.40 then
    raise exception 'BASARISIZ [106]: Danisan A KENDI girisini guncelleyemedi';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.progress_entries where notes like 'zz-106%';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [106 sizinti]: Danisan B, A nin kilo/olcu girisini GORUYOR (%)', v_n;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_n int; v_rows int; v_caught boolean := false;
begin
  select count(*) into v_n from public.progress_entries where notes like 'zz-106%';
  if v_n is distinct from 1 then
    raise exception 'BASARISIZ [106 koc okuma]: beklenen 1, gelen % -- koc gorunumu calismiyor', v_n;
  end if;

  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-12', 99.90);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [106 koc INSERT]: KOC danisanin ilerleme girisini YAZABILDI -- §6 "salt-okunur" IHLALI';
  end if;

  update public.progress_entries set weight_kg = 999 where id = current_setting('zz.pe_106')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [106 koc UPDATE]: KOC % satir guncelledi (beklenen 0) -- salt-okunur IHLALI', v_rows;
  end if;

  delete from public.progress_entries where id = current_setting('zz.pe_106')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [106 koc DELETE]: KOC % satir sildi (beklenen 0) -- salt-okunur IHLALI', v_rows;
  end if;
end $$;

set local role anon;
do $$
declare v_caught boolean := false; v_n int;
begin
  begin
    select count(*) into v_n from public.progress_entries;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [106 anon]: giris yapmamis ziyaretci progress_entries okuyabildi (% satir)', v_n;
  end if;
  raise notice 'GECTI [106 progress_entries: danisan R/W kendi, baska danisan HIC, KOC SALT OKUMA, anon DENY]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 107) `progress_entries` DEĞER KISITLARI
--   (a) negatif / sıfır / absürt kilo ve ölçü REDDEDİLİR (23514)
--   (b) HİÇBİR ölçüm içermeyen satır REDDEDİLİR (o günün TEK yerini işgal edip
--       grafikte hiçbir nokta üretmezdi)
--   (c) absürt tarih (yıl yazım hatası) REDDEDİLİR
--   (d) POZİTİF: tüm ölçüleri dolu gerçekçi satır GEÇER
-- =============================================================================
begin;
-- KURULUM (postgres): bkz. senaryo 105'in aynı notu. (d) şıkkı POZİTİF bir
-- insert yapar; günün boş olmaması onu 23505 ile düşürürdü.
delete from public.progress_entries
 where client_id = '22222222-2222-2222-2222-222222222222'::uuid
   and entry_date = date '2026-08-13';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_caught boolean; v_state text;
begin
  -- (a)
  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', -1);
  exception when check_violation then v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then raise exception 'BASARISIZ [107a]: NEGATIF kilo kabul edildi'; end if;
  if v_state is distinct from '23514' then raise exception 'BASARISIZ [107a kod]: beklenen 23514, gelen %', v_state; end if;

  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', 600);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'BASARISIZ [107a]: 600 kg ABSURT kilo kabul edildi'; end if;

  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', 0);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'BASARISIZ [107a]: 0 kg kabul edildi'; end if;

  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, waist_cm)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', -5);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'BASARISIZ [107a]: NEGATIF bel olcusu kabul edildi'; end if;

  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, thigh_cm)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', 350);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'BASARISIZ [107a]: 350 cm ABSURT uyluk olcusu kabul edildi'; end if;

  -- (b)
  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, notes)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13', 'sadece not');
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [107b]: OLCUMSUZ satir kabul edildi -- o gunun TEK yerini isgal eder, grafikte hicbir nokta uretmez';
  end if;

  -- (c)
  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '0202-05-01', 80);
  exception when check_violation then v_caught := true;
  end;
  if not v_caught then raise exception 'BASARISIZ [107c]: 0202 yili kabul edildi (yil yazim hatasi yakalanmiyor)'; end if;

  -- (d)
  insert into public.progress_entries
    (client_id, entry_date, weight_kg, waist_cm, chest_cm, arm_cm, thigh_cm, hip_cm, notes)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-13',
          82.40, 88.50, 104.20, 36.80, 58.30, 98.10, 'zz-107 tam olcum');

  raise notice 'GECTI [107 CHECK: negatif/sifir/absurt/olcumsuz/absurt tarih RED, gercekci satir GECER]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME FOTOGRAFI — 108) `progress_photos` YOL SÖZLEŞMESİ + `angle` enum
--   (a) POZİTİF: kanonik yol + geçerli açı KABUL edilir
--   (b) YOL SÖZLEŞMESİ İHLALLERİ REDDEDİLİR (23514): tam URL, alt dizin,
--       uzantısız, uid önekli klasör, ve *** BAŞKA DANIŞANIN KLASÖRÜ ***
--   (c) geçersiz `angle` REDDEDİLİR (22P02) — enum, serbest metin değil
--   (d) aynı `photo_path` iki satıra bağlanamaz (23505)
--   (e) KOÇ okur ama YAZAMAZ (salt-okunur), Danışan B GÖREMEZ, anon DENY
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_id uuid; v_caught boolean; v_state text; v_spec text[];
begin
  -- (a)
  insert into public.progress_photos (client_id, taken_on, angle, photo_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-14', 'front',
          '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000a1.jpg')
  returning id into v_id;
  perform set_config('zz.pp_108', v_id::text, true);

  -- (b)
  foreach v_spec slice 1 in array array[
    ['tam URL',              'http://127.0.0.1:54321/storage/v1/object/public/progress-photos/22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000a2.jpg'],
    ['alt dizin',            '22222222-2222-2222-2222-222222222222/gizli/a8000000-0000-0000-0000-0000000000a3.jpg'],
    ['uzantisiz',            '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000a4'],
    ['klasorsuz',            'a8000000-0000-0000-0000-0000000000a5.jpg'],
    ['onekli klasor',        'zz-22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000a6.jpg'],
    ['BASKA DANISAN klasoru','33333333-3333-3333-3333-333333333333/a8000000-0000-0000-0000-0000000000a7.jpg']
  ] loop
    v_caught := false;
    begin
      insert into public.progress_photos (client_id, taken_on, angle, photo_path)
      values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-14', 'side', v_spec[2]);
    exception when check_violation then v_caught := true;
    end;
    if not v_caught then
      raise exception 'BASARISIZ [108b / %]: yol sozlesmesi IHLALI kabul edildi -> %', v_spec[1], v_spec[2];
    end if;
  end loop;

  -- (c) enum
  v_caught := false;
  begin
    execute format(
      'insert into public.progress_photos (client_id, taken_on, angle, photo_path) values (%L::uuid, date ''2026-08-14'', %L, %L)',
      '22222222-2222-2222-2222-222222222222', 'left',
      '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000b1.jpg');
  exception when others then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [108c]: gecersiz aci (''left'') kabul edildi -- angle serbest metin gibi davraniyor';
  end if;
  if v_state is distinct from '22P02' then
    raise exception 'BASARISIZ [108c hata kodu]: beklenen 22P02 (enum), gelen %', v_state;
  end if;

  -- (d) aynı dosyaya ikinci satır
  v_caught := false;
  begin
    insert into public.progress_photos (client_id, taken_on, angle, photo_path)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-15', 'back',
            '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000a1.jpg');
  exception when unique_violation then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [108d]: ayni dosyaya IKINCI satir baglandi';
  end if;

  -- POZİTİF: aynı gün / aynı açı YENİDEN ÇEKİM meşrudur (tekillik YOK)
  insert into public.progress_photos (client_id, taken_on, angle, photo_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-14', 'front',
          '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000c1.jpg');
end $$;

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.progress_photos
   where photo_path like '22222222-2222-2222-2222-222222222222/a8000000-%';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [108e sizinti]: Danisan B, A nin ilerleme fotografi SATIRINI goruyor (%)', v_n;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_n int; v_rows int; v_caught boolean := false;
begin
  select count(*) into v_n from public.progress_photos
   where photo_path like '22222222-2222-2222-2222-222222222222/a8000000-%';
  if v_n is distinct from 2 then
    raise exception 'BASARISIZ [108e koc okuma]: beklenen 2, gelen %', v_n;
  end if;

  begin
    insert into public.progress_photos (client_id, taken_on, angle, photo_path)
    values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-16', 'back',
            '22222222-2222-2222-2222-222222222222/a8000000-0000-0000-0000-0000000000d1.jpg');
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [108e koc INSERT]: KOC danisanin ilerleme fotografi satirini YAZABILDI -- §6 IHLALI';
  end if;

  delete from public.progress_photos where id = current_setting('zz.pp_108')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [108e koc DELETE]: KOC % satir sildi (beklenen 0)', v_rows;
  end if;
end $$;

set local role anon;
do $$
declare v_caught boolean := false; v_n int;
begin
  begin
    select count(*) into v_n from public.progress_photos;
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [108 anon]: giris yapmamis ziyaretci progress_photos okuyabildi (% satir)', v_n;
  end if;
  raise notice 'GECTI [108 progress_photos: yol sozlesmesi + enum + tekil dosya + KOC SALT OKUMA + izolasyon]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME FOTOGRAFI — 109) `progress-photos` BUCKET politikaları
--   (a) OKUMA: sahibi EVET, KOÇ EVET, BAŞKA DANIŞAN HAYIR, anon HAYIR
--   (b) ayrıştırıcı FAIL-CLOSED: bozuk adlar hiç kimseye görünmez
--   (c) YAZMA: kendi klasörü EVET, başkasının klasörü HAYIR (koç DAHİL)
--   (d) SİLME: koç BAŞKASININ nesnesini SİLEMEZ (§6 salt-okunur)
--
-- KURULUM NOTU (senaryo 81/82/90 ile aynı): `storage.objects` seed'lenmez;
-- nesneler `postgres` kimliğiyle yaratılıp ROLLBACK ile geri alınır.
-- =============================================================================
begin;

insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('progress-photos', '22222222-2222-2222-2222-222222222222/b9000000-0000-0000-0000-0000000000a1.jpg',
    '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('progress-photos', '33333333-3333-3333-3333-333333333333/b9000000-0000-0000-0000-0000000000a2.jpg',
    '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333'),
  -- Ayrıştırılamayan adlar (fail-closed dalları)
  ('progress-photos', 'kotu-ad.jpg', null, null),
  ('progress-photos', '22222222-2222-2222-2222-222222222222/gizli/d5000000-0000-0000-0000-0000000000a3.jpg', null, null),
  ('progress-photos', 'zz-22222222-2222-2222-2222-222222222222/d5000000-0000-0000-0000-0000000000a4.jpg', null, null),
  ('progress-photos', '22222222-2222-2222-2222-222222222222/notauuid.jpg', null, null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_own int; v_other int; v_junk int;
begin
  select count(*) into v_own from storage.objects
   where bucket_id = 'progress-photos'
     and name = '22222222-2222-2222-2222-222222222222/b9000000-0000-0000-0000-0000000000a1.jpg';
  select count(*) into v_other from storage.objects
   where bucket_id = 'progress-photos'
     and name = '33333333-3333-3333-3333-333333333333/b9000000-0000-0000-0000-0000000000a2.jpg';
  select count(*) into v_junk from storage.objects
   where bucket_id = 'progress-photos'
     and name in ('kotu-ad.jpg',
                  '22222222-2222-2222-2222-222222222222/gizli/d5000000-0000-0000-0000-0000000000a3.jpg',
                  'zz-22222222-2222-2222-2222-222222222222/d5000000-0000-0000-0000-0000000000a4.jpg',
                  '22222222-2222-2222-2222-222222222222/notauuid.jpg');

  if v_own is distinct from 1 then
    raise exception 'BASARISIZ [109a kendi fotografi]: beklenen 1, gelen % -- danisan KENDI fotografini goremiyor', v_own;
  end if;
  if v_other is distinct from 0 then
    raise exception 'BASARISIZ [109a *** SIZINTI ***]: Danisan A, Danisan B nin ILERLEME FOTOGRAFINI GORUYOR (%)!', v_other;
  end if;
  if v_junk is distinct from 0 then
    raise exception 'BASARISIZ [109b ayristirici]: bozuk adli % nesne gorunuyor -- FAIL-OPEN', v_junk;
  end if;
end $$;

-- Koç: tüm danışanların ilerleme fotoğraflarını görür (tek koçlu model,
-- form_checks medyasıyla AYNI mahremiyet seviyesi).
--   NOT: koç için `is_coach()` dalı DOĞRUDUR, yani ayrıştırılamayan adları da
--   görür (mevcut üç bucket'ta da böyledir — koç görünürlüğü ad ayrıştırmasına
--   DEĞİL role dayanır). Bu yüzden aşağıdaki sayım KANONİK adlara daraltılmıştır;
--   fail-closed iddiası DANIŞAN tarafında (yukarıda) sınanır.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_n int; v_bad text; v_caught boolean := false;
begin
  select count(*) into v_n from storage.objects
   where bucket_id = 'progress-photos' and name like '%/b9000000-0000-0000-0000-%';
  if v_n is distinct from 2 then
    raise exception 'BASARISIZ [109a koc]: beklenen 2 nesne, gelen %', v_n;
  end if;

  -- (c) KOÇ bile BAŞKASININ klasörüne yazamaz
  begin
    insert into storage.objects (bucket_id, name)
    values ('progress-photos', '22222222-2222-2222-2222-222222222222/b9000000-0000-0000-0000-0000000000c1.jpg');
  exception when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [109c koc yazma]: KOC danisanin klasorune dosya BIRAKABILDI -- §6 salt-okunur IHLALI';
  end if;

  -- (d) KOÇ başkasının nesnesini SİLEMEZ / DEĞİŞTİREMEZ
  --     NOT: `delete from storage.objects` SQL ile denenemez — Storage'ın
  --     kendi trigger'ı ("Direct deletion from storage tables is not allowed")
  --     rolden BAĞIMSIZ olarak reddeder. Bu yüzden iddia POLİTİKA ŞEKLİ
  --     üzerinden kurulur: silme/güncelleme/yazma dallarında `is_coach()`
  --     BULUNMAMALIDIR (diğer üç bucket'ta bulunur — §6 salt-okunur sapması).
  select string_agg(policyname || '=' || coalesce(qual, '') || '|' || coalesce(with_check, ''), ', ')
    into v_bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('progress_photos_insert_own', 'progress_photos_update_own', 'progress_photos_delete_own')
     and (coalesce(qual, '') like '%is_coach%' or coalesce(with_check, '') like '%is_coach%');
  if v_bad is not null then
    raise exception 'BASARISIZ [109d]: progress-photos YAZMA/SILME politikasinda koc dali VAR -> % -- §6 "koc gorunumu salt-okunur" IHLALI (satir kalir, dosya kaybolurdu)', v_bad;
  end if;

  -- POZİTİF karşıtlık: OKUMA politikası koç dalını İÇERMELİ (aksi hâlde koç
  -- imzalı adres üretemez ve ilerleme sekmesi koç tarafında boş kalır).
  select string_agg(policyname, ', ') into v_bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'progress_photos_select_own_or_coach'
     and coalesce(qual, '') like '%is_coach%';
  if v_bad is null then
    raise exception 'BASARISIZ [109d]: progress-photos OKUMA politikasinda koc dali YOK -- koc createSignedUrl uretemez';
  end if;
end $$;

-- (c) Danışan A: kendi klasörüne EVET, B'nin klasörüne HAYIR
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_caught boolean := false;
begin
  insert into storage.objects (bucket_id, name)
  values ('progress-photos', '22222222-2222-2222-2222-222222222222/b9000000-0000-0000-0000-0000000000c2.jpg');

  begin
    insert into storage.objects (bucket_id, name)
    values ('progress-photos', '33333333-3333-3333-3333-333333333333/b9000000-0000-0000-0000-0000000000c3.jpg');
  exception when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [109c]: Danisan A, B nin ilerleme klasorune dosya BIRAKABILDI';
  end if;
end $$;

set local role anon;
do $$
declare v_n int;
begin
  select count(*) into v_n from storage.objects where bucket_id = 'progress-photos';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [109 anon]: giris yapmamis ziyaretci % ilerleme fotografi goruyor', v_n;
  end if;
  raise notice 'GECTI [109 progress-photos bucket: sahip EVET, koc OKUR, baska danisan HAYIR, bozuk ad HAYIR, anon HAYIR, koc YAZAMAZ/SILEMEZ]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 110) YENİ YÜZEYİN SERTLEŞTİRME DENETİMİ
--   (a) FORCE ROW LEVEL SECURITY her iki yeni tabloda AÇIK (senaryo 74'ün
--       tablo-özel tekrarı: 74 dinamiktir, bu senaryo HATA MESAJINI
--       Faz 4a'ya bağlar)
--   (b) `authenticated` / `anon` TRUNCATE / REFERENCES / TRIGGER ALMAZ
--   (c) `authenticated` S/I/U/D ALIR, `anon` HİÇBİR ŞEY almaz
--   (d) `updated_at` trigger'ı KURULU (nutrition_logs deseni)
--   (e) bucket PRIVATE (I-4) ve 4 storage politikası mevcut
--   (f) bu migration HİÇBİR sequence yaratmadı (uuid PK)
-- =============================================================================
begin;
do $$
declare v_bad text; v_pub boolean; v_pol int;
begin
  -- (a)
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.oid in ('public.progress_entries'::regclass, 'public.progress_photos'::regclass)
     and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'BASARISIZ [110a]: FORCE/ENABLE RLS kapali -> % (yeni tablolar 20260817170000 in DO dongusune YETISEMEZ, FORCE u kendileri almalidir)', v_bad;
  end if;

  -- (b)
  select string_agg(format('%s/%s/%s', g.role_name, t.tbl, p.priv), ', ') into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('authenticated'), ('anon')) as g(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where has_table_privilege(g.role_name, t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'BASARISIZ [110b / AC-03]: fazla yetki -> %', v_bad;
  end if;

  -- (c)
  select string_agg(format('%s/%s', t.tbl, p.priv), ', ') into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where not has_table_privilege('authenticated', t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'BASARISIZ [110c]: authenticated yetki kaybetti -> %', v_bad;
  end if;

  select string_agg(format('%s/%s', t.tbl, p.priv), ', ') into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where has_table_privilege('anon', t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'BASARISIZ [110c]: anon yetkili -> %', v_bad;
  end if;

  -- (d)
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.progress_entries'::regclass
       and tgname  = 'set_progress_entries_updated_at'
       and not tgisinternal
  ) then
    raise exception 'BASARISIZ [110d]: progress_entries uzerinde updated_at trigger i YOK';
  end if;

  -- (e)
  select public into v_pub from storage.buckets where id = 'progress-photos';
  if v_pub is null then
    raise exception 'BASARISIZ [110e]: progress-photos bucket i YOK';
  end if;
  if v_pub then
    raise exception 'BASARISIZ [110e]: progress-photos PUBLIC -- I-4 ihlali, imzasiz okuma acilir';
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'progress_photos_%';
  if v_pol <> 4 then
    raise exception 'BASARISIZ [110e]: progress_photos storage politikasi sayisi % (beklenen 4)', v_pol;
  end if;

  -- (f)
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'progress\_%'
  ) then
    raise exception 'BASARISIZ [110f]: beklenmeyen sequence (uuid PK bekleniyordu)';
  end if;

  raise notice 'GECTI [110 Faz 4a sertlestirme: FORCE RLS, D/x/t YOK, S/I/U/D VAR, anon YOK, updated_at trigger, bucket PRIVATE + 4 politika, sequence YOK]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 111) *** B-036 *** FORM CHECK -> `progress_entries` ÇİFT-YAZIMI
--   (a) danışan form check eklediğinde AYNI YEREL GÜNE bir `progress_entries`
--       satırı DÜŞER (koç panelinin kilo grafiği artık bu satırdan beslenir)
--   (b) *** GECE YARISI TUZAĞI *** çevrim `Europe/Istanbul`'dur: Türkiye
--       saatiyle 00:30'da gönderilen form check O GÜNE yazılır. Oturum UTC
--       olduğu için düz `::date` BİR ÖNCEKİ günü verirdi — senaryo bunu ÖLÇER
--       (yalnızca varsaymaz), yani tuzağın gerçekliği testin parçasıdır.
--   (c) *** trigger fonksiyonu SECURITY DEFINER DEĞİLDİR *** ve yine de
--       çalışır: yazma gerçek `authenticated` rolüyle, RLS AÇIKKEN yapılır.
--       RLS zinciri: form_checks_insert (client_id = auth.uid()) ->
--       progress_entries_insert (client_id = auth.uid()).
--   (d) koç bu TÜRETİLMİŞ satırları okuyabilir (grafik koç panelinde çizilir)
-- =============================================================================
begin;
set local time zone 'UTC';

-- KURULUM (postgres, rol taklidinden ÖNCE): iddianın kurulacağı günler
-- temizlenir ki ölçüm DIŞARIDA bulunan bir satıra değil ÜRETİLEN satıra kurulsun.
delete from public.progress_entries
 where client_id = '22222222-2222-2222-2222-222222222222'::uuid
   and entry_date in (date '2026-08-13', date '2026-08-14');

do $$
declare v_secdef boolean;
begin
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'form_checks_sync_progress_weight';
  if v_secdef is null then
    raise exception 'BASARISIZ [111c]: form_checks_sync_progress_weight fonksiyonu YOK -> cift-yazim kurulmamis';
  end if;
  if v_secdef then
    raise exception 'BASARISIZ [111c]: trigger fonksiyonu SECURITY DEFINER -> RLS i baypas eden yeni yetkilendirme yuzeyi acilmis; ihtiyac YOKTU (bkz. 20260818090000 KARAR 1b)';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_w numeric; v_naive date; v_n int;
begin
  -- Tuzağın GERÇEK olduğunun kanıtı: bu oturumda naif cast BİR ÖNCEKİ günü verir.
  v_naive := (timestamptz '2026-08-14 00:30:00+03')::date;
  if v_naive is distinct from date '2026-08-13' then
    raise exception 'BASARISIZ [111b kurulum]: oturum saat dilimi UTC degil -> gece yarisi tuzagi olculemez (naif ::date = %)', v_naive;
  end if;

  -- Türkiye saatiyle 14 Ağustos 00:30 = UTC 13 Ağustos 21:30
  insert into public.form_checks (client_id, current_weight, notes, created_at)
  values (
    '22222222-2222-2222-2222-222222222222'::uuid,
    77.25,
    'zz-111 gece yarisi gonderimi',
    timestamptz '2026-08-14 00:30:00+03'
  );

  select weight_kg into v_w
    from public.progress_entries
   where client_id  = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-14';
  if v_w is null then
    raise exception 'BASARISIZ [111a]: form check eklendi ama 2026-08-14 icin progress_entries satiri OLUSMADI -> cift-yazim calismiyor (koc grafigi bos kalir)';
  end if;
  if v_w is distinct from 77.25 then
    raise exception 'BASARISIZ [111a]: beklenen 77.25, gelen %', v_w;
  end if;

  select count(*) into v_n
    from public.progress_entries
   where client_id  = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-13';
  if v_n is distinct from 0 then
    raise exception 'BASARISIZ [111b]: satir BIR ONCEKI gune (2026-08-13) dustu -> gece yarisi tarih kaymasi geri geldi (Europe/Istanbul cevrimi yok sayilmis)';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_w numeric;
begin
  select weight_kg into v_w
    from public.progress_entries
   where client_id  = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-14';
  if v_w is distinct from 77.25 then
    raise exception 'BASARISIZ [111d]: KOC turetilmis ilerleme satirini OKUYAMADI (gelen %) -> koc panelindeki kilo grafigi bos kalir', v_w;
  end if;
  raise notice 'GECTI [111 form_check -> progress_entries cift-yazimi: yerel gun Europe/Istanbul, SECURITY DEFINER YOK, koc okuyabiliyor]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 112) ÇAKIŞMA KURALI: *** ELLE GİRİŞ KAZANIR ***
--   (a) o güne ait ELLE girilmiş satırın `weight_kg`'i form check ile EZİLMEZ
--       ve `notes` gibi diğer alanlara DOKUNULMAZ
--   (b) satır VAR ama `weight_kg` NULL ise (o gün tartılmamış, yalnızca çevre
--       ölçüsü girilmiş) YALNIZCA `weight_kg` dolar; `waist_cm`/`notes` AYNEN
--       kalır — boşluk doldurmak kayıp değil KAZANÇTIR
--   (c) aynı güne İKİNCİ form check artık dolu olan satırı DEĞİŞTİRMEZ
--       (bilinen asimetri: canlı trigger yolunda İLK form check kazanır)
-- =============================================================================
begin;
set local time zone 'UTC';

delete from public.progress_entries
 where client_id = '22222222-2222-2222-2222-222222222222'::uuid
   and entry_date in (date '2026-08-15', date '2026-08-16');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_w numeric; v_waist numeric; v_notes text;
begin
  -- (a) ELLE giriş (danışanın kendi tartı okuması) -----------------------------
  insert into public.progress_entries (client_id, entry_date, weight_kg, notes)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-15', 70.00, 'zz-112 elle girildi');

  insert into public.form_checks (client_id, current_weight, notes, created_at)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 99.90, 'zz-112a form check',
          timestamptz '2026-08-15 12:00:00+03');

  select weight_kg, notes into v_w, v_notes
    from public.progress_entries
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-15';
  if v_w is distinct from 70.00 then
    raise exception 'BASARISIZ [112a]: ELLE girilen kilo form check ile EZILDI (70.00 -> %) -- kullanicinin duzeltmesi sessizce geri alindi', v_w;
  end if;
  if v_notes is distinct from 'zz-112 elle girildi' then
    raise exception 'BASARISIZ [112a]: notes alanina DOKUNULDU (%)', v_notes;
  end if;

  -- (b) weight_kg NULL -> yalnızca O kolon dolar -------------------------------
  insert into public.progress_entries (client_id, entry_date, waist_cm, notes)
  values ('22222222-2222-2222-2222-222222222222'::uuid, date '2026-08-16', 80.50, 'zz-112 sadece olcu');

  insert into public.form_checks (client_id, current_weight, notes, created_at)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 68.30, 'zz-112b form check',
          timestamptz '2026-08-16 09:00:00+03');

  select weight_kg, waist_cm, notes into v_w, v_waist, v_notes
    from public.progress_entries
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-16';
  if v_w is distinct from 68.30 then
    raise exception 'BASARISIZ [112b]: weight_kg NULL iken form check ile DOLDURULMADI (gelen %) -- grafikte bosluk kalir', v_w;
  end if;
  if v_waist is distinct from 80.50 then
    raise exception 'BASARISIZ [112b]: waist_cm e DOKUNULDU (80.50 -> %) -- trigger yalnizca weight_kg yazmali', v_waist;
  end if;
  if v_notes is distinct from 'zz-112 sadece olcu' then
    raise exception 'BASARISIZ [112b]: notes alanina DOKUNULDU (%)', v_notes;
  end if;

  -- (c) aynı güne İKİNCİ form check artık dolu satırı DEĞİŞTİRMEZ --------------
  insert into public.form_checks (client_id, current_weight, notes, created_at)
  values ('22222222-2222-2222-2222-222222222222'::uuid, 55.00, 'zz-112c ikinci form check',
          timestamptz '2026-08-16 21:00:00+03');

  select weight_kg into v_w
    from public.progress_entries
   where client_id = '22222222-2222-2222-2222-222222222222'::uuid
     and entry_date = date '2026-08-16';
  if v_w is distinct from 68.30 then
    raise exception 'BASARISIZ [112c]: ayni gune ikinci form check dolu satiri EZDI (68.30 -> %)', v_w;
  end if;

  -- Duplicate satır de OLUŞMAMALI (AC-4.1 tekillik kısıtı trigger yolunda da geçerli)
  if (select count(*) from public.progress_entries
       where client_id = '22222222-2222-2222-2222-222222222222'::uuid
         and entry_date = date '2026-08-16') is distinct from 1 then
    raise exception 'BASARISIZ [112c]: 2026-08-16 icin BIRDEN COK progress_entries satiri var';
  end if;

  raise notice 'GECTI [112 cakisma kurali: elle giris kazanir, NULL weight_kg dolar, diger alanlara dokunulmaz, duplicate yok]';
end $$;
rollback;


-- =============================================================================
-- ILERLEME TAKIBI — 113) BACKFILL (`backfill_form_check_weight_to_progress`)
--   (a) aynı YEREL günde birden çok form check varsa *** EN YENİSİ *** kazanır
--   (b) hedefte satır varsa EZİLMEZ (elle giriş kazanır — trigger ile AYNI kural)
--   (c) hedefte satır var ama `weight_kg` NULL ise YALNIZCA o kolon dolar
--   (d) *** IDEMPOTENT *** — ikinci koşu 0 satır ekler, 0 satır doldurur
--   Kurulum, trigger'ın ürettiği satırı SİLEREK "migration öncesi" hâli taklit
--   eder; ölçülen şey backfill'in KENDİSİDİR, trigger değil.
-- =============================================================================
begin;
set local time zone 'UTC';

-- KURULUM (postgres) --------------------------------------------------------
insert into public.form_checks (id, client_id, current_weight, notes, created_at) values
  -- TARİHLER BİLİNÇLİ OLARAK UZAK-GEÇMİŞTE (2019-03): seed göreli tarihlidir
  -- (en eski now()-120g ~4 ay); 2019'a ASLA inmez -> bu senaryonun sabit günü
  -- seed satırlarıyla HİÇBİR gün ÇAKIŞMAZ (kalıcı flake düzeltmesi). Saatler ve
  -- +03 ofseti KORUNDU: iki "ayni gun" satiri hala 2019-03-15'e düşer.
  ('cccc0113-0000-4000-8000-000000000001'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   70.00, 'zz-113 ayni gun ESKI',  timestamptz '2019-03-15 08:00:00+03'),
  ('cccc0113-0000-4000-8000-000000000002'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   71.50, 'zz-113 ayni gun YENI',  timestamptz '2019-03-15 20:00:00+03'),
  ('cccc0113-0000-4000-8000-000000000003'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   66.60, 'zz-113 elle giris gunu', timestamptz '2019-03-16 10:00:00+03'),
  ('cccc0113-0000-4000-8000-000000000004'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   64.40, 'zz-113 null kilo gunu',  timestamptz '2019-03-17 10:00:00+03');

-- (a) hedefi BOŞALT -> backfill'in kendisi yazsın
delete from public.progress_entries
 where client_id = '33333333-3333-3333-3333-333333333333'::uuid
   and entry_date = date '2019-03-15';

-- (b) ELLE düzeltilmiş satır (trigger'ın yazdığı değer kullanıcı tarafından değiştirildi)
update public.progress_entries
   set weight_kg = 60.10, notes = 'zz-113 elle duzeltildi'
 where client_id = '33333333-3333-3333-3333-333333333333'::uuid
   and entry_date = date '2019-03-16';

-- (c) o gün tartılmamış: kilo NULL, yalnızca çevre ölçüsü var
update public.progress_entries
   set weight_kg = null, waist_cm = 75.50
 where client_id = '33333333-3333-3333-3333-333333333333'::uuid
   and entry_date = date '2019-03-17';

do $$
declare
  v_first  record;
  v_second record;
  v_w      numeric;
  v_waist  numeric;
  v_notes  text;
begin
  select * into v_first from public.backfill_form_check_weight_to_progress();

  -- (a) EN YENİSİ kazanır
  select weight_kg into v_w from public.progress_entries
   where client_id = '33333333-3333-3333-3333-333333333333'::uuid and entry_date = date '2019-03-15';
  if v_w is distinct from 71.50 then
    raise exception 'BASARISIZ [113a]: ayni gunde EN YENI form check kazanmadi (beklenen 71.50, gelen %)', v_w;
  end if;
  if v_first.rows_inserted < 1 then
    raise exception 'BASARISIZ [113a]: backfill hicbir satir EKLEMEDI (rows_inserted=%)', v_first.rows_inserted;
  end if;

  -- (b) elle düzeltilmiş satır EZİLMEZ
  select weight_kg, notes into v_w, v_notes from public.progress_entries
   where client_id = '33333333-3333-3333-3333-333333333333'::uuid and entry_date = date '2019-03-16';
  if v_w is distinct from 60.10 then
    raise exception 'BASARISIZ [113b]: backfill ELLE duzeltilen kiloyu EZDI (60.10 -> %)', v_w;
  end if;
  if v_notes is distinct from 'zz-113 elle duzeltildi' then
    raise exception 'BASARISIZ [113b]: backfill notes alanina DOKUNDU (%)', v_notes;
  end if;

  -- (c) NULL kilo dolar, çevre ölçüsü korunur
  select weight_kg, waist_cm into v_w, v_waist from public.progress_entries
   where client_id = '33333333-3333-3333-3333-333333333333'::uuid and entry_date = date '2019-03-17';
  if v_w is distinct from 64.40 then
    raise exception 'BASARISIZ [113c]: NULL weight_kg backfill ile DOLMADI (gelen %)', v_w;
  end if;
  if v_waist is distinct from 75.50 then
    raise exception 'BASARISIZ [113c]: backfill waist_cm e DOKUNDU (75.50 -> %)', v_waist;
  end if;
  if v_first.rows_filled < 1 then
    raise exception 'BASARISIZ [113c]: rows_filled 0 -> NULL doldurma sayilmiyor';
  end if;

  -- (d) IDEMPOTENT: ikinci koşu HİÇBİR ŞEY yapmamalı
  select * into v_second from public.backfill_form_check_weight_to_progress();
  if v_second.rows_inserted is distinct from 0 or v_second.rows_filled is distinct from 0 then
    raise exception 'BASARISIZ [113d]: backfill IDEMPOTENT DEGIL -> ikinci kosu % ekledi, % doldurdu (fazladan satir uretir)',
      v_second.rows_inserted, v_second.rows_filled;
  end if;
  if v_second.source_days is distinct from v_first.source_days then
    raise exception 'BASARISIZ [113d]: aday gun sayisi iki kosu arasinda degisti (% -> %)', v_first.source_days, v_second.source_days;
  end if;

  -- HİÇBİR (danışan, yerel gün) çifti karşılıksız kalmamalı
  if exists (
    select 1
      from (select distinct fc.client_id, public.form_check_entry_date(fc.created_at) as entry_date
              from public.form_checks fc
             where public.form_check_entry_date(fc.created_at) >= date '2000-01-01'
               and public.form_check_entry_date(fc.created_at) <  date '2100-01-01') as days
     where not exists (
       select 1 from public.progress_entries pe
        where pe.client_id = days.client_id and pe.entry_date = days.entry_date
     )
  ) then
    raise exception 'BASARISIZ [113]: backfill sonrasi hala KARSILIKSIZ (danisan, gun) cifti var';
  end if;

  raise notice 'GECTI [113 backfill: en yenisi kazanir, elle giris ezilmez, NULL kilo dolar, IDEMPOTENT (aday gun=%, eklenen=%, doldurulan=%)]',
    v_first.source_days, v_first.rows_inserted, v_first.rows_filled;
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI (ATOMIK) — 114) POZİTİF: `approve_program()` ÜÇ ETKİYİ DE
-- yapar — plan yazılır + onay 'approved' olur + danışana bildirim düşer
--
-- `useApproveProgram` (packages/api-client/src/hooks/useProgramApprovals.ts)
-- artık TAM OLARAK bu tek çağrıyı yapar (B-019). Eskiden aynı iş üç ayrı ağ
-- çağrısıydı ve aradan kopan bağlantı yarım durum bırakıyordu.
--
-- Payload istemcinin gönderdiğiyle BİREBİR aynıdır: `planToRpcPayload()` 7 günün
-- HEPSİNİ gönderir, dolu olmayanlar boş string'dir.
-- =============================================================================
begin;

-- KURULUM (postgres) — kendi onay satırımızı üretiyoruz; seed'in `pending`
-- satırını TÜKETMİYORUZ (bkz. dosya başındaki "KENDİ KURULUMUNU YAPMA KURALI").
insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000114'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. zz-114 Approve Squat - 5x5"}'::jsonb,
  'pending'::public.approval_status
);

create temp table zz_notify_base_114 as
select count(*) as n
  from public.notifications
 where client_id = '22222222-2222-2222-2222-222222222222'
   and message   = 'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

do $$
declare
  v_status public.approval_status;
  v_by     uuid;
  v_at     timestamptz;
  v_rows   int;
begin
  perform public.approve_program(
    'b0000000-0000-0000-0000-000000000114'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    '{"Pazartesi":"1. zz-114 Approve Squat - 5x5","Salı":"","Çarşamba":"","Perşembe":"","Cuma":"","Cumartesi":"","Pazar":""}'::jsonb
  );

  -- --- ETKİ 1: PLAN YAZILDI -------------------------------------------------
  select count(*) into v_rows
    from public.workout_plan_exercises wpe
    join public.workout_plans wp on wp.id = wpe.plan_id
   where wp.client_id = '22222222-2222-2222-2222-222222222222'
     and wp.is_active;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [114 plan]: aktif planda beklenen 1 satir, gelen % -- save_workout_plan cagrilmadi ya da eski satirlar kalmis', v_rows;
  end if;

  select count(*) into v_rows
    from public.workout_plan_exercises wpe
    join public.workout_plans wp on wp.id = wpe.plan_id
   where wp.client_id = '22222222-2222-2222-2222-222222222222'
     and wp.is_active
     and wpe.day      = 'Pazartesi'
     and wpe.raw_line = '1. zz-114 Approve Squat - 5x5';
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [114 plan icerigi]: onaylanan program danisanin aktif planina ISLENMEDI';
  end if;

  -- --- ETKİ 2: ONAY 'approved' + DENETİM İZİ SUNUCUDAN ----------------------
  select status, reviewed_by, reviewed_at into v_status, v_by, v_at
    from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000114'::uuid;

  if v_status is distinct from 'approved'::public.approval_status then
    raise exception 'BASARISIZ [114 onay]: beklenen approved, gelen % -- plan yazildi ama onay kuyrukta kaldi', v_status;
  end if;
  if v_by is distinct from '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'BASARISIZ [114 reviewed_by]: beklenen koc, gelen % -- guard trigger ATLANMIS olabilir', v_by;
  end if;
  if v_at is null then
    raise exception 'BASARISIZ [114 reviewed_at]: NULL -- guard trigger ATLANMIS olabilir';
  end if;

  raise notice '  [114] plan yazildi + onay approved + denetim izi sunucudan doldu';
end $$;

-- --- ETKİ 3: DANIŞANA BİLDİRİM (fark ölçümü) --------------------------------
--     Ölçüm postgres ile yapılır: taban değeri tutan temp tablo `authenticated`
--     rolüne AÇIK DEĞİLDİR (senaryo 77 ile aynı düzen).
reset role;
do $$
declare
  v_base int;
  v_now  int;
begin
  select n into v_base from zz_notify_base_114;
  select count(*) into v_now
    from public.notifications
   where client_id = '22222222-2222-2222-2222-222222222222'
     and message   = 'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.';

  if (v_now - v_base) is distinct from 1 then
    raise exception 'BASARISIZ [114 bildirim]: beklenen +1 satir, gelen +% -- danisan onaydan HABERSIZ kalir', (v_now - v_base);
  end if;

  raise notice 'GECTI [114 approve_program() plan + onay + bildirimi TEK cagrida yazar]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI (ATOMIK) — 115) [AC-01] DANIŞAN kendi onayını `approve_program`
-- ile ONAYLAYAMAZ — ve denemesinden GERİYE HİÇBİR ŞEY KALMAZ
--
-- ############################################################################
-- # BU SENARYONUN VAR OLMA SEBEBİ                                            #
-- # Onay yolu bir RPC'ye taşındı. "RPC" kelimesi tek başına yetki kazandırmaz #
-- # ama YANLIŞ yazılırsa kazandırır: fonksiyon `SECURITY DEFINER` olsaydı     #
-- # `postgres` (rolbypassrls) kimliğiyle koşar ve `program_approvals_update_coach`
-- # politikası DEVREDE OLMAZDI -> danışan kendi programını kendi onaylardı.   #
-- # Fonksiyon bilerek `SECURITY INVOKER`dır; bu senaryo bunun SONUCUNU ölçer. #
-- #                                                                           #
-- # AYRICA: danışan `save_workout_plan()` adımını GEÇEBİLİR (workout_plans_insert
-- # politikası `client_id = auth.uid()` dalını içerir), yani plan GERÇEKTEN   #
-- # yazılır ve ancak ONDAN SONRA onay adımı reddedilir. Reddin ardından planın #
-- # ORTADA OLMAMASI, gövdenin tek transaksiyon olduğunun kanıtıdır.           #
-- ############################################################################
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000115'::uuid,
  '22222222-2222-2222-2222-222222222222',
  '{"Pazartesi":"1. zz-115 kendi kendine onay"}'::jsonb,
  'pending'::public.approval_status
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.approve_program(
      'b0000000-0000-0000-0000-000000000115'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '{"Pazartesi":"1. zz-115 kendi kendine onay","Salı":"","Çarşamba":"","Perşembe":"","Cuma":"","Cumartesi":"","Pazar":""}'::jsonb
    );
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [115]: DANISAN kendi programini ONAYLADI -- AC-01 YENIDEN ACIK!';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [115 hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
end $$;

-- Yan etki denetimi postgres ile: danışanın kendi RLS'i ölçümü daraltmasın.
reset role;
do $$
declare
  v_status public.approval_status;
  v_rows   int;
begin
  select status into v_status from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000115'::uuid;
  if v_status is distinct from 'pending'::public.approval_status then
    raise exception 'BASARISIZ [115 onay durumu]: % oldu (pending kalmaliydi)', v_status;
  end if;

  select count(*) into v_rows
    from public.workout_plan_exercises
   where raw_line = '1. zz-115 kendi kendine onay';
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [115 ATOMIKLIK]: red edilen cagridan GERIYE % plan satiri kaldi -- govde tek transaksiyon DEGIL', v_rows;
  end if;

  raise notice 'GECTI [115 Danisan approve_program() ile kendi programini onaylayamaz (42501) ve denemesinden yan etki KALMAZ]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI (ATOMIK) — 116) ÇAPRAZ ERİŞİM İKİ YÖNDEN DE KAPALI
--   (a) BAŞKA BİR DANIŞAN (B) A'nın onayını `approve_program` ile işleyemez
--   (b) KOÇ dahi EŞLEŞMEYEN çift gönderemez: onay A'nınken plan B'ye YAZILAMAZ
--
-- ############################################################################
-- # "BAŞKA KOÇ" SENARYOSU NEDEN BURADA YOK — DÜRÜST NOT                       #
-- # Bu üründe koç-danışan ATAMA tablosu YOKTUR; yetki ROL tabanlıdır          #
-- # (`is_coach()`) ve `program_approvals_update_coach` / `workout_plans_insert`#
-- # politikaları HER koça tüm danışanları açar (`submit_program_for_approval` #
-- # de bildirimi "role='coach' olan TÜM profillere" yazar). Yani "ikinci bir  #
-- # koç başkasının danışanını onaylayamaz" iddiası BUGÜN DOĞRU DEĞİLDİR ve    #
-- # onu test etmek yeşil veremezdi. Çok koçlu modele geçilirse kural ÖNCE     #
-- # politikalara girer, senaryo ONDAN SONRA buraya eklenir.                   #
-- #                                                                           #
-- # Onun yerine GERÇEKTEN var olan iki kapı ölçülür: danışan izolasyonu (a) ve #
-- # RPC'nin kendi eşleşme kapısı (b). (b) olmadan iki uuid'nin yer değiştirmesi#
-- # SESSİZCE yanlış danışanın planını ezerdi.                                  #
-- ############################################################################
-- =============================================================================
begin;

insert into public.program_approvals (id, client_id, workout_data, status)
values (
  'b0000000-0000-0000-0000-000000000116'::uuid,
  '22222222-2222-2222-2222-222222222222',   -- Danışan A'nın onayı
  '{"Pazartesi":"1. zz-116 caprazlama"}'::jsonb,
  'pending'::public.approval_status
);

-- --- (a) Danışan B, A'nın onayını işlemeye çalışır ---------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.approve_program(
      'b0000000-0000-0000-0000-000000000116'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,   -- A'nın planına yazmayı dener
      '{"Pazartesi":"1. zz-116a B den A ya","Salı":"","Çarşamba":"","Perşembe":"","Cuma":"","Cumartesi":"","Pazar":""}'::jsonb
    );
  exception when others then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [116a]: Danisan B, Danisan A nin programini ONAYLADI -- danisan izolasyonu KIRIK!';
  end if;
end $$;

-- --- (b) KOÇ, eşleşmeyen (onay A'nın / danışan B) çifti gönderir -------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.approve_program(
      'b0000000-0000-0000-0000-000000000116'::uuid,   -- A'nın onayı
      '33333333-3333-3333-3333-333333333333'::uuid,   -- ama B'nin planına
      '{"Pazartesi":"1. zz-116b yanlis danisana","Salı":"","Çarşamba":"","Perşembe":"","Cuma":"","Cumartesi":"","Pazar":""}'::jsonb
    );
  exception when others then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [116b]: onay A ya aitken plan B ye YAZILDI -- eslesme kapisi YOK, sessiz veri bozulmasi';
  end if;
  if v_state is distinct from '22023' then
    raise exception 'BASARISIZ [116b hata kodu]: beklenen 22023 (eslesme kapisi), gelen % -- red BASKA bir sebepten gelmis olabilir', v_state;
  end if;
end $$;

reset role;
do $$
declare
  v_status public.approval_status;
  v_rows   int;
begin
  select status into v_status from public.program_approvals
   where id = 'b0000000-0000-0000-0000-000000000116'::uuid;
  if v_status is distinct from 'pending'::public.approval_status then
    raise exception 'BASARISIZ [116 onay durumu]: % oldu (pending kalmaliydi)', v_status;
  end if;

  select count(*) into v_rows
    from public.workout_plan_exercises
   where raw_line in ('1. zz-116a B den A ya', '1. zz-116b yanlis danisana');
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [116 ATOMIKLIK]: reddedilen cagrilardan GERIYE % plan satiri kaldi', v_rows;
  end if;

  raise notice 'GECTI [116 caprazlama iki yonden de kapali: danisan izolasyonu + onay/danisan eslesme kapisi, yan etki YOK]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI (ATOMIK) — 117) *** ATOMİKLİK KANITI *** — B-019'un ÖZÜ
--
-- ############################################################################
-- # ÖLÇÜLEN ŞEY                                                              #
-- # `approve_program()` gövdesinde plan yazımı ONAY ADIMINDAN ÖNCE gelir      #
-- # (sıra bilinçli korundu, bkz. 20260819090000 §1b). Var olmayan bir         #
-- # `p_approval_id` ile çağrıldığında:                                        #
-- #   1) `save_workout_plan()` GERÇEKTEN çalışır ve plan satırlarını YAZAR,    #
-- #   2) ardından onay probu satırı bulamaz ve P0002 ile PATLAR.               #
-- # Eğer gövde tek transaksiyon DEĞİLSE 1. adımın yazdığı satırlar ORTADA      #
-- # KALIR — tam olarak eski üç-çağrılı akışın bıraktığı yarım durum.          #
-- #                                                                           #
-- # Bu yüzden "hiçbir yan etki yok" iddiası burada BOŞ BİR YEŞİL DEĞİLDİR:     #
-- # başarısız adım, yazma adımından SONRA gelir.                              #
-- #                                                                           #
-- # Üç eksende ölçülür: plan satırı, AKTİF PLAN VERSİYONU (yayınlama sayacı   #
-- # şişmemeli) ve bildirim sayısı.                                             #
-- ############################################################################
-- =============================================================================
begin;

create temp table zz_base_117 as
select
  (select coalesce(max(wp.version), 0)
     from public.workout_plans wp
    where wp.client_id = '22222222-2222-2222-2222-222222222222')      as max_version,
  (select count(*)
     from public.workout_plans wp
    where wp.client_id = '22222222-2222-2222-2222-222222222222')      as n_plans,
  (select count(*)
     from public.notifications
    where client_id = '22222222-2222-2222-2222-222222222222'
      and message   = 'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.') as n_notify;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';

do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.approve_program(
      'b0000000-0000-0000-0000-000000000117'::uuid,   -- BOYLE BIR SATIR YOK
      '22222222-2222-2222-2222-222222222222'::uuid,
      '{"Pazartesi":"1. zz-117 hayalet onay","Salı":"","Çarşamba":"","Perşembe":"","Cuma":"","Cumartesi":"","Pazar":""}'::jsonb
    );
  exception when no_data_found then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [117]: var olmayan onay id si ile cagri BASARILI dondu -- sessizce basarili donmek en kotu davranistir';
  end if;
  if v_state is distinct from 'P0002' then
    raise exception 'BASARISIZ [117 hata kodu]: beklenen P0002, gelen %', v_state;
  end if;
end $$;

reset role;
do $$
declare
  v_base zz_base_117;
  v_v    integer;
  v_n    bigint;
  v_rows bigint;
begin
  select * into v_base from zz_base_117;

  -- (1) Plan SATIRI kalmamalı
  select count(*) into v_rows
    from public.workout_plan_exercises
   where raw_line = '1. zz-117 hayalet onay';
  if v_rows is distinct from 0 then
    raise exception 'BASARISIZ [117 ATOMIKLIK/plan]: hata sonrasi GERIYE % plan satiri kaldi -- plan yazildi ama onay pending kaldi (B-019 ACIK)', v_rows;
  end if;

  -- (2) AKTİF PLAN VERSİYONU şişmemeli (yayınlama dalı da geri sarılmalı)
  select coalesce(max(wp.version), 0), count(*) into v_v, v_n
    from public.workout_plans wp
   where wp.client_id = '22222222-2222-2222-2222-222222222222';
  if v_v is distinct from v_base.max_version or v_n is distinct from v_base.n_plans then
    raise exception 'BASARISIZ [117 ATOMIKLIK/versiyon]: plan sayaci geri sarilmadi (versiyon % -> %, satir % -> %)',
      v_base.max_version, v_v, v_base.n_plans, v_n;
  end if;

  -- (3) Bildirim yazılmamalı
  select count(*) into v_n
    from public.notifications
   where client_id = '22222222-2222-2222-2222-222222222222'
     and message   = 'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.';
  if (v_n - v_base.n_notify) is distinct from 0 then
    raise exception 'BASARISIZ [117 ATOMIKLIK/bildirim]: hata sonrasi +% bildirim kaldi', (v_n - v_base.n_notify);
  end if;

  raise notice 'GECTI [117 ATOMIKLIK: basarisiz approve_program() cagrisindan plan/versiyon/bildirim ekseninde HICBIR yan etki kalmaz]';
end $$;
rollback;


-- =============================================================================
-- PROGRAM ONAYI (ATOMIK) — 118) `approve_program` YETKİ YÜZEYİ SÜRÜKLENME TESTİ
--   * `prosecdef = false` -> SECURITY INVOKER (yetki modeli DEĞİŞMEDİ)
--   * `search_path` PİNLİ (arama yolu ele geçirmesine kapalı)
--   * EXECUTE: authenticated + service_role VAR; anon ve PUBLIC YOK
--
-- Senaryo 71-76 (yetki sökümü) ile aynı felsefe: yeni yazma yüzeyi eklendiğinde
-- sertleştirme kuralları TAHMİN edilmez, ÖLÇÜLÜR. `SECURITY DEFINER`a çevirmek
-- tek satırlık ve masum görünen bir değişikliktir; bedeli senaryo 115'in
-- düşmesidir ve bu senaryo o değişikliği DAHA ÖNCE yakalar.
-- =============================================================================
begin;
do $$
declare
  v_secdef boolean;
  v_config text[];
begin
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'approve_program';

  if v_secdef is null then
    raise exception 'BASARISIZ [118]: public.approve_program YOK -- koc onayi (useApproveProgram) PGRST202 alir';
  end if;
  if v_secdef then
    raise exception 'BASARISIZ [118 SECURITY]: approve_program SECURITY DEFINER olmus -- RLS baypasi, danisan kendi programini onaylayabilir';
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [118 search_path]: arama yolu pinlenmemis (%)', v_config;
  end if;

  if not has_function_privilege('authenticated', 'public.approve_program(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'BASARISIZ [118 grant]: authenticated rolu approve_program u CALISTIRAMIYOR -- koc onayi kirilir';
  end if;
  if not has_function_privilege('service_role', 'public.approve_program(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'BASARISIZ [118 grant]: service_role approve_program u CALISTIRAMIYOR';
  end if;
  if has_function_privilege('anon', 'public.approve_program(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'BASARISIZ [118 grant]: approve_program ANON rolune ACIK';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public' and p.proname = 'approve_program'
       and a.grantee = 0                       -- PUBLIC
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'BASARISIZ [118 grant]: approve_program PUBLIC a ACIK (revoke all ... from public dusmus)';
  end if;

  raise notice 'GECTI [118 approve_program SECURITY INVOKER, search_path pinli, EXECUTE yalnizca authenticated + service_role]';
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 119) *** TAM SÜPÜRME KANITI *** — B-042'nin ÖZÜ
--
-- ############################################################################
-- # ÖLÇÜLEN ŞEY                                                              #
-- # `delete_account()` çağrıldıktan sonra silinen kullanıcıya ait satır 14    #
-- # TABLONUN HİÇBİRİNDE KALMAMALI. Sayım TABLO TABLO yapılır; toplam bir      #
-- # `row_total = 0` iddiası, listeden düşmüş bir tabloyu yakalayamazdı.       #
-- #                                                                          #
-- # Fikstür KENDİ İŞLEMİNDE üretilir (paket kuralı, dosya başlığı): iki taze  #
-- # kullanıcı açılır, birine 14 tablonun tamamına dokunan veri yazılır.       #
-- # Seed satırlarına DOKUNULMAZ.                                              #
-- #                                                                          #
-- # AYRICA ÖLÇÜLÜR — STORAGE KAPISI FAIL-CLOSED:                              #
-- # Storage nesnesi DURURKEN yapılan çağrı REDDEDİLİR ve HİÇBİR ŞEY silinmez  #
-- # (yarım silme imkânsız). Ancak nesne Storage API ile gittikten sonra silme  #
-- # geçer. Bu, "önce dosyalar, sonra veritabanı" sözleşmesinin (ADR-0025)      #
-- # şema seviyesindeki dayatmasıdır.                                          #
-- ############################################################################
-- =============================================================================
begin;

-- --- KURULUM (postgres kimliğiyle; rol taklidi HENÜZ YOK) --------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000119',
   'authenticated', 'authenticated', 'zz-119-silinecek@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-119 Silinecek"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000120',
   'authenticated', 'authenticated', 'zz-119-taniksiz@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-119 Tanik"}'::jsonb,
   now(), now(), '', '', '', '');

-- Silinecek kullanıcının 14 tablodaki izi.
insert into public.notifications (client_id, message)
  values ('c0000000-0000-0000-0000-000000000119', 'zz-119 bildirim');
insert into public.messages (client_id, sender_id, receiver_id, message)
  values ('c0000000-0000-0000-0000-000000000119', 'c0000000-0000-0000-0000-000000000119',
          '11111111-1111-1111-1111-111111111111', 'zz-119 danisandan koca');
-- Koçun DANIŞANA yazdığı mesaj da gitmeli (konuşmanın tamamı silinir).
insert into public.messages (client_id, sender_id, receiver_id, message)
  values ('c0000000-0000-0000-0000-000000000119', '11111111-1111-1111-1111-111111111111',
          'c0000000-0000-0000-0000-000000000119', 'zz-119 koctan danisana');
insert into public.form_checks (client_id, current_weight, notes)
  values ('c0000000-0000-0000-0000-000000000119', 80.5, 'zz-119 form check');
insert into public.daily_logs (client_id, log_date, water_lt)
  values ('c0000000-0000-0000-0000-000000000119', current_date, 2.5);
insert into public.workout_logs (client_id, exercise_name, weight_kg, reps)
  values ('c0000000-0000-0000-0000-000000000119', 'zz-119 squat', 100, 5);
insert into public.nutrition_logs (client_id, description, kcal)
  values ('c0000000-0000-0000-0000-000000000119', 'zz-119 ogun', 500);
insert into public.program_approvals (client_id, workout_data)
  values ('c0000000-0000-0000-0000-000000000119', '{"Pazartesi":"zz-119"}'::jsonb);
insert into public.workout_plans (id, client_id, version, is_active)
  values ('d0000000-0000-0000-0000-000000000119', 'c0000000-0000-0000-0000-000000000119', 1, true);
insert into public.workout_plan_exercises (plan_id, day, position, raw_line)
  values ('d0000000-0000-0000-0000-000000000119', 'Pazartesi', 1, '1. zz-119 hareket');
insert into public.nutrition_plans (id, client_id, version, is_active)
  values ('e0000000-0000-0000-0000-000000000119', 'c0000000-0000-0000-0000-000000000119', 1, true);
insert into public.nutrition_plan_meals (plan_id, day, position, description)
  values ('e0000000-0000-0000-0000-000000000119', 'Pazartesi', 1, 'zz-119 ogun');
insert into public.progress_entries (client_id, entry_date, weight_kg)
  values ('c0000000-0000-0000-0000-000000000119', current_date - 1, 81);
insert into public.progress_photos (client_id, taken_on, angle, photo_path)
  values ('c0000000-0000-0000-0000-000000000119', current_date, 'front',
          'c0000000-0000-0000-0000-000000000119/f0000000-0000-0000-0000-000000000119.png');
insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', 'c0000000-0000-0000-0000-000000000119-zz.png',
          'c0000000-0000-0000-0000-000000000119');

-- Tanık kullanıcının verisi (senaryo 120 bunu ölçer; burada da kurulur ki
-- silme sırasında yanlışlıkla süpürülüp süpürülmediği aynı işlemde görülsün).
insert into public.notifications (client_id, message)
  values ('c0000000-0000-0000-0000-000000000120', 'zz-119 tanik bildirim');
insert into public.progress_entries (client_id, entry_date, weight_kg)
  values ('c0000000-0000-0000-0000-000000000120', current_date, 70);

-- --- (a) STORAGE KAPISI: nesne dururken silme REDDEDİLMELİ ------------------
set local role service_role;
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.delete_account('c0000000-0000-0000-0000-000000000119'::uuid);
  exception when others then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [119 storage kapisi]: storage nesnesi DURURKEN silme GECTI -- fiziksel dosya yetim kalirdi';
  end if;
  if v_state is distinct from 'P0001' then
    raise exception 'BASARISIZ [119 storage kapisi hata kodu]: beklenen P0001, gelen %', v_state;
  end if;
end $$;
reset role;

-- Reddedilen çağrıdan HİÇBİR yan etki kalmamalı: kullanıcı hâlâ yerinde.
do $$
begin
  if not exists (select 1 from auth.users where id = 'c0000000-0000-0000-0000-000000000119') then
    raise exception 'BASARISIZ [119 ATOMIKLIK]: reddedilen cagri auth kullanicisini YINE DE sildi';
  end if;
  if (select count(*) from public.notifications where client_id = 'c0000000-0000-0000-0000-000000000119') <> 1 then
    raise exception 'BASARISIZ [119 ATOMIKLIK]: reddedilen cagri tablo satirlarini YINE DE sildi';
  end if;
end $$;

-- --- (b) Storage API taklidi: fiziksel dosya (ve satırı) gider --------------
--     Gerçek akışta bunu sunucu yolu `admin.storage.from(b).remove(paths)` ile
--     yapar. SQL'den doğrudan `delete from storage.objects` PLATFORM TARAFINDAN
--     YASAKTIR (`storage.protect_delete()`); testte kaçış kapısı AÇIKÇA açılır,
--     çünkü ölçülmek istenen şey Storage API değil, ONDAN SONRAKİ davranıştır.
set local storage.allow_delete_query = 'true';
delete from storage.objects where owner_id = 'c0000000-0000-0000-0000-000000000119';
reset storage.allow_delete_query;

-- --- (c) ASIL SİLME --------------------------------------------------------
set local role service_role;
do $$
declare
  v_result jsonb;
begin
  v_result := public.delete_account(
    'c0000000-0000-0000-0000-000000000119'::uuid,
    'a0000000-0000-0000-0000-000000000119'::uuid,   -- request_id (korelasyon)
    1                                               -- Storage API'nin sildigi nesne sayisi
  );

  if (v_result ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [119]: var olan kullanici icin already_deleted=true dondu';
  end if;
  if (v_result ->> 'row_total')::bigint <= 0 then
    raise exception 'BASARISIZ [119]: row_total=% -- fikstur yazilmamis olabilir', v_result ->> 'row_total';
  end if;
end $$;
reset role;

-- --- (d) TABLO TABLO SAYIM: hepsi 0 olmalı ---------------------------------
do $$
declare
  v_uid  constant uuid := 'c0000000-0000-0000-0000-000000000119';
  v_left text;
  v_n    bigint;
begin
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'BASARISIZ [119 auth]: auth.users satiri KALDI';
  end if;

  v_left := '';
  select count(*) into v_n from public.profiles               where id        = v_uid;                 if v_n > 0 then v_left := v_left || format('profiles=%s ', v_n); end if;
  select count(*) into v_n from public.notifications          where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('notifications=%s ', v_n); end if;
  select count(*) into v_n from public.messages               where client_id = v_uid or sender_id = v_uid or receiver_id = v_uid;
                                                                                                       if v_n > 0 then v_left := v_left || format('messages=%s ', v_n); end if;
  select count(*) into v_n from public.form_checks            where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('form_checks=%s ', v_n); end if;
  select count(*) into v_n from public.daily_logs             where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('daily_logs=%s ', v_n); end if;
  select count(*) into v_n from public.workout_logs           where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('workout_logs=%s ', v_n); end if;
  select count(*) into v_n from public.nutrition_logs         where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('nutrition_logs=%s ', v_n); end if;
  select count(*) into v_n from public.program_approvals      where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('program_approvals=%s ', v_n); end if;
  select count(*) into v_n from public.workout_plans          where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('workout_plans=%s ', v_n); end if;
  select count(*) into v_n from public.workout_plan_exercises where plan_id = 'd0000000-0000-0000-0000-000000000119';
                                                                                                       if v_n > 0 then v_left := v_left || format('workout_plan_exercises=%s ', v_n); end if;
  select count(*) into v_n from public.nutrition_plans        where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('nutrition_plans=%s ', v_n); end if;
  select count(*) into v_n from public.nutrition_plan_meals   where plan_id = 'e0000000-0000-0000-0000-000000000119';
                                                                                                       if v_n > 0 then v_left := v_left || format('nutrition_plan_meals=%s ', v_n); end if;
  select count(*) into v_n from public.progress_entries       where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('progress_entries=%s ', v_n); end if;
  select count(*) into v_n from public.progress_photos        where client_id = v_uid;                 if v_n > 0 then v_left := v_left || format('progress_photos=%s ', v_n); end if;
  select count(*) into v_n from storage.objects               where owner_id  = v_uid::text;           if v_n > 0 then v_left := v_left || format('storage.objects=%s ', v_n); end if;

  if v_left <> '' then
    raise exception 'BASARISIZ [119 EKSIK SILME]: geriye satir kaldi -> %', v_left;
  end if;

  raise notice 'GECTI [119 TAM SUPURME: 14 tablo + auth kullanicisi + storage kapisi; fail-closed reddin yan etkisi YOK]';
end $$;

-- --- (e) DENETİM SATIRI: yazıldı, kişisel veri YOK -------------------------
do $$
declare
  v_role    public.user_role;
  v_rows    jsonb;
  v_storage integer;
  v_req     uuid;
  v_n       int;
begin
  select count(*) into v_n from public.account_deletions
   where request_id = 'a0000000-0000-0000-0000-000000000119';
  if v_n <> 1 then
    raise exception 'BASARISIZ [119 denetim]: beklenen 1 denetim satiri, gelen %', v_n;
  end if;

  select subject_role, rows_deleted, storage_objects_deleted, request_id
    into v_role, v_rows, v_storage, v_req
    from public.account_deletions
   where request_id = 'a0000000-0000-0000-0000-000000000119';

  if v_role is distinct from 'client'::public.user_role then
    raise exception 'BASARISIZ [119 denetim rol]: beklenen client, gelen %', v_role;
  end if;
  if (v_rows ->> 'notifications')::int <> 1 then
    raise exception 'BASARISIZ [119 denetim sayim]: notifications=% (beklenen 1)', v_rows ->> 'notifications';
  end if;
  if (v_rows ->> 'messages')::int <> 2 then
    raise exception 'BASARISIZ [119 denetim sayim]: messages=% (beklenen 2 -- koctan gelen mesaj da sayilmali)', v_rows ->> 'messages';
  end if;
  if v_storage <> 1 then
    raise exception 'BASARISIZ [119 denetim storage]: beklenen 1, gelen %', v_storage;
  end if;

  -- KİŞİSEL VERİ SIZINTISI KONTROLÜ: denetim satırının HİÇBİR alanı silinen
  -- kullanıcının uid'sini ya da e-postasını İÇERMEMELİ.
  if (select account_deletions::text from public.account_deletions
       where request_id = 'a0000000-0000-0000-0000-000000000119') like '%c0000000-0000-0000-0000-000000000119%' then
    raise exception 'BASARISIZ [119 KISISEL VERI]: denetim satiri silinen kullanicinin uid sini TASIYOR';
  end if;
  if (select account_deletions::text from public.account_deletions
       where request_id = 'a0000000-0000-0000-0000-000000000119') like '%zz-119-silinecek@example.com%' then
    raise exception 'BASARISIZ [119 KISISEL VERI]: denetim satiri silinen kullanicinin E-POSTASINI TASIYOR';
  end if;

  raise notice 'GECTI [119 denetim satiri yazildi: rol + tablo bazli sayim + storage sayisi + request_id; uid/e-posta YOK]';
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 120) BAŞKA KULLANICININ VERİSİ ETKİLENMEZ
--
-- Silme "her şeyi süpüren" bir işlemdir; en tehlikeli kusuru fazla silmesidir.
-- Bu senaryo silmeden ÖNCE ve SONRA hem TANIK KULLANICININ hem de TÜM SEED
-- verisinin sayımlarını alır ve tek bir satırın bile kaybolmadığını ölçer.
-- Sayımlar KODA GÖMÜLMEZ (aynı işlemde ölçülür): E2E koşusu ya da elle kullanım
-- veritabanını büyütmüş olsa da test geçerli kalır.
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000121',
   'authenticated', 'authenticated', 'zz-120-silinecek@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-120 Silinecek"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000122',
   'authenticated', 'authenticated', 'zz-120-tanik@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-120 Tanik"}'::jsonb,
   now(), now(), '', '', '', '');

insert into public.notifications (client_id, message) values
  ('c0000000-0000-0000-0000-000000000121', 'zz-120 silinecek bildirim'),
  ('c0000000-0000-0000-0000-000000000122', 'zz-120 tanik bildirim');
insert into public.workout_logs (client_id, exercise_name, reps) values
  ('c0000000-0000-0000-0000-000000000121', 'zz-120 silinecek', 5),
  ('c0000000-0000-0000-0000-000000000122', 'zz-120 tanik', 5);
insert into public.messages (client_id, sender_id, receiver_id, message) values
  ('c0000000-0000-0000-0000-000000000122', 'c0000000-0000-0000-0000-000000000122',
   '11111111-1111-1111-1111-111111111111', 'zz-120 tanik mesaji');

create temp table zz_base_120 as
select
  (select count(*) from public.profiles)                                                as n_profiles,
  (select count(*) from public.notifications)                                           as n_notifications,
  (select count(*) from public.messages)                                                as n_messages,
  (select count(*) from public.workout_logs)                                            as n_workout_logs,
  (select count(*) from public.progress_entries)                                        as n_progress_entries,
  (select count(*) from auth.users)                                                     as n_users,
  (select count(*) from public.notifications where client_id = 'c0000000-0000-0000-0000-000000000121') as n_target_notif;

set local role service_role;
do $$
begin
  perform public.delete_account('c0000000-0000-0000-0000-000000000121'::uuid,
                                'a0000000-0000-0000-0000-000000000120'::uuid, 0);
end $$;
reset role;

do $$
declare
  v_base zz_base_120;
  v_n    bigint;
begin
  select * into v_base from zz_base_120;

  -- Silinen kullanıcı: -1 profil, -1 auth kullanıcısı, -1 bildirim, -1 log.
  select count(*) into v_n from public.profiles;
  if v_n is distinct from v_base.n_profiles - 1 then
    raise exception 'BASARISIZ [120 profiles]: % -> % (beklenen -1)', v_base.n_profiles, v_n;
  end if;
  select count(*) into v_n from auth.users;
  if v_n is distinct from v_base.n_users - 1 then
    raise exception 'BASARISIZ [120 auth.users]: % -> % (beklenen -1)', v_base.n_users, v_n;
  end if;
  select count(*) into v_n from public.notifications;
  if v_n is distinct from v_base.n_notifications - v_base.n_target_notif then
    raise exception 'BASARISIZ [120 notifications]: % -> % (beklenen -%)', v_base.n_notifications, v_n, v_base.n_target_notif;
  end if;
  select count(*) into v_n from public.workout_logs;
  if v_n is distinct from v_base.n_workout_logs - 1 then
    raise exception 'BASARISIZ [120 workout_logs]: % -> % (beklenen -1)', v_base.n_workout_logs, v_n;
  end if;

  -- TANIĞIN verisi BİREBİR durmalı.
  if (select count(*) from public.profiles where id = 'c0000000-0000-0000-0000-000000000122') <> 1 then
    raise exception 'BASARISIZ [120 TANIK]: tanik kullanicinin PROFILI silindi -- fazla silme!';
  end if;
  if (select count(*) from public.notifications where client_id = 'c0000000-0000-0000-0000-000000000122') <> 1 then
    raise exception 'BASARISIZ [120 TANIK]: tanik kullanicinin bildirimi silindi';
  end if;
  if (select count(*) from public.workout_logs where client_id = 'c0000000-0000-0000-0000-000000000122') <> 1 then
    raise exception 'BASARISIZ [120 TANIK]: tanik kullanicinin antrenman logu silindi';
  end if;
  if (select count(*) from public.messages where client_id = 'c0000000-0000-0000-0000-000000000122') <> 1 then
    raise exception 'BASARISIZ [120 TANIK]: tanik kullanicinin mesaji silindi';
  end if;

  -- SEED verisi de yerinde: koç ve iki seed danışanı.
  if (select count(*) from public.profiles
       where id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222',
                    '33333333-3333-3333-3333-333333333333')) <> 3 then
    raise exception 'BASARISIZ [120 SEED]: seed profillerinden biri silindi -- KATASTROFIK fazla silme';
  end if;

  -- Katalog tablolarına HİÇ dokunulmamalı (silme onlari kapsamaz).
  if (select count(*) from public.exercises) = 0 then
    raise exception 'BASARISIZ [120 KATALOG]: exercises bosaldi';
  end if;

  raise notice 'GECTI [120 IZOLASYON: silme yalnizca hedefi kapsar; tanik kullanici, seed profilleri ve katalog ETKILENMEZ]';
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 121) IDEMPOTANSLIK: İKİNCİ ÇAĞRI HATA ÜRETMEZ (AC-4.6.1)
--
-- Sözleşme: `delete_account()` var olmayan bir kullanıcı için `raise` ETMEZ;
-- `already_deleted: true` + sıfır sayımla döner ve İKİNCİ BİR DENETİM SATIRI
-- YAZMAZ (yazsaydı "kaç hesap silindi" istatistiği yeniden denemelerle şişerdi).
-- Ağ kopmasında/yeniden denemede güvenli tekrar edilebilirlik buna dayanır.
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000123',
   'authenticated', 'authenticated', 'zz-121@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-121"}'::jsonb,
   now(), now(), '', '', '', '');
insert into public.notifications (client_id, message)
  values ('c0000000-0000-0000-0000-000000000123', 'zz-121 bildirim');

set local role service_role;
do $$
declare
  v_first  jsonb;
  v_second jsonb;
  v_third  jsonb;
begin
  v_first := public.delete_account('c0000000-0000-0000-0000-000000000123'::uuid,
                                   'a0000000-0000-0000-0000-000000000121'::uuid, 0);
  if (v_first ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [121]: ILK cagri already_deleted=true dondu';
  end if;

  -- İKİNCİ çağrı: hata YOK.
  v_second := public.delete_account('c0000000-0000-0000-0000-000000000123'::uuid,
                                    'a0000000-0000-0000-0000-000000000122'::uuid, 0);
  if not (v_second ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [121]: IKINCI cagri already_deleted=false dondu';
  end if;
  if (v_second ->> 'row_total')::bigint <> 0 then
    raise exception 'BASARISIZ [121]: IKINCI cagri row_total=% dondu (beklenen 0)', v_second ->> 'row_total';
  end if;

  -- ÜÇÜNCÜ çağrı (hiç var olmamış bir uid) da hata üretmemeli.
  v_third := public.delete_account('c0000000-0000-0000-0000-000000000199'::uuid);
  if not (v_third ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [121]: hic var olmamis uid icin already_deleted=false dondu';
  end if;
end $$;
reset role;

-- Denetim satırı sayımı `postgres` kimliğiyle yapılır: `service_role`ün
-- `account_deletions` üzerinde DOĞRUDAN tablo yetkisi YOKTUR (bilinçli — bkz.
-- migration §1 ve senaryo 123). Tabloya tek yazan, SECURITY DEFINER olan
-- `delete_account()`tir.
do $$
declare
  v_audit int;
begin
  select count(*) into v_audit from public.account_deletions
   where request_id in ('a0000000-0000-0000-0000-000000000121',
                        'a0000000-0000-0000-0000-000000000122');
  if v_audit <> 1 then
    raise exception 'BASARISIZ [121 denetim]: % denetim satiri yazildi (beklenen 1) -- tekrar cagrilar istatistigi sisiriyor', v_audit;
  end if;

  raise notice 'GECTI [121 IDEMPOTANSLIK: ikinci/ucuncu cagri hata uretmez, already_deleted=true doner, ikinci denetim satiri YAZILMAZ]';
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 122) DANIŞAN BAŞKASININ (VE KENDİ) HESABINI SQL'DEN
-- SİLEMEZ
--
-- ############################################################################
-- # "Danisan baskasinin hesabini silemez" iddiasinin dayanagi bir RLS         #
-- # POLITIKASI DEGIL, EXECUTE YETKISIDIR: `delete_account` ve                  #
-- # `account_deletion_manifest` YALNIZCA `service_role`e verilmistir.          #
-- # Yani danisan fonksiyonu HIC CAGIRAMAZ -- ne baskasi ne de KENDISI icin.    #
-- # Tek mesru yol sunucu ucudur ve o uc silinecek uid'yi GOVDEDEN DEGIL,       #
-- # dogrulanmis Bearer token'dan alir.                                         #
-- #                                                                           #
-- # Ayrica `auth.users`a DOGRUDAN DELETE de kapalidir (yetki yok) -- yani      #
-- # RPC'yi atlayip ayni sonuca ulasmanin SQL tarafinda bir yolu yoktur.        #
-- ############################################################################
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean;
  v_state  text;
begin
  -- (a) BAŞKASININ hesabı
  v_caught := false;
  begin
    perform public.delete_account('33333333-3333-3333-3333-333333333333'::uuid);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [122a]: danisan BASKASININ hesabini silebildi -- KATASTROFIK';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [122a hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  -- (b) KENDİ hesabı da SQL'den silinemez (tek yol sunucu ucudur)
  v_caught := false;
  begin
    perform public.delete_account('22222222-2222-2222-2222-222222222222'::uuid);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [122b]: danisan RPC yi dogrudan cagirabildi -- sunucu ucundaki onay adimi ATLANABILIR';
  end if;

  -- (c) MANIFEST de kapalı: baskasinin veri hacmi sayilamaz
  v_caught := false;
  begin
    perform public.account_deletion_manifest('33333333-3333-3333-3333-333333333333'::uuid);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [122c]: danisan baskasinin manifestosunu okuyabildi (kac mesaji/fotografi oldugu sizar)';
  end if;

  -- (d) `auth.users`a DOGRUDAN DELETE de kapali olmali
  v_caught := false;
  begin
    execute 'delete from auth.users where id = ''33333333-3333-3333-3333-333333333333''';
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [122d]: authenticated auth.users tan DOGRUDAN satir silebildi';
  end if;

  raise notice 'GECTI [122 danisan ne baskasinin ne kendi hesabini SQL den silebilir; manifest ve auth.users DELETE de kapali]';
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 123) DENETİM TABLOSU KİLİTLİ VE KİŞİSEL VERİ TAŞIMAZ
--
-- İki ayrı iddia:
--   (a) KOLON SÖZLEŞMESİ: `account_deletions` yalnızca beklenen 6 kolonu taşır.
--       Biri ileride "hangi kullanıcıydı" diye bir `user_id`/`email` kolonu
--       eklerse AC-4.6.2 sessizce ihlal edilir; bu senaryo o eklemeyi yakalar.
--   (b) ERİŞİM: `authenticated` (koç dahil) tabloyu OKUYAMAZ ve YAZAMAZ.
--       Kilit ACL'de değil RLS'tedir (grant var, politika YOK — gerekçe
--       migration §1'de), o yüzden dört işlemin dördü de ölçülür.
-- =============================================================================
begin;
do $$
declare
  v_cols text;
begin
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'account_deletions';

  if v_cols is distinct from 'deleted_at,id,request_id,rows_deleted,storage_objects_deleted,subject_role' then
    raise exception 'BASARISIZ [123 KOLON SOZLESMESI]: account_deletions kolonlari degismis -> % . Yeni bir kolon KISISEL VERI tasiyorsa AC-4.6.2 ihlal edilir; degisiklik bilincliyse bu senaryo ve ADR-0025 guncellenmelidir.', v_cols;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'account_deletions') <> 0 then
    raise exception 'BASARISIZ [123 POLITIKA]: account_deletions uzerine politika eklenmis -- denetim kaydi authenticated a acilmis olabilir';
  end if;

  -- `service_role`un DOGRUDAN tablo yetkisi de YOKTUR: tabloya tek yazan,
  -- SECURITY DEFINER olan `delete_account()`tir. Boylece denetim kaydi
  -- PostgREST uzerinden HICBIR rol tarafindan okunamaz/yazilamaz -- silinen
  -- kayitlarin istatistigi yalnizca dogrudan veritabani erisimiyle gorulur.
  if has_table_privilege('service_role', 'public.account_deletions', 'SELECT')
     or has_table_privilege('service_role', 'public.account_deletions', 'INSERT')
     or has_table_privilege('service_role', 'public.account_deletions', 'UPDATE')
     or has_table_privilege('service_role', 'public.account_deletions', 'DELETE') then
    raise exception 'BASARISIZ [123 service_role]: denetim tablosu service_role a DOGRUDAN acilmis -- PostgREST uzerinden okunabilir/yazilabilir hale gelmis';
  end if;
end $$;

-- Kurulum: okunacak bir satır OLSUN ki "0 satır göründü" iddiası boş bir yeşil olmasın.
insert into public.account_deletions (subject_role, rows_deleted, storage_objects_deleted, request_id)
values ('client', '{"profiles":1}'::jsonb, 0, 'a0000000-0000-0000-0000-000000000123');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_n      bigint;
  v_caught boolean;
  v_rows   int;
begin
  -- (b1) KOÇ bile HİÇBİR satır göremez.
  select count(*) into v_n from public.account_deletions;
  if v_n <> 0 then
    raise exception 'BASARISIZ [123 SELECT]: koc denetim kaydinda % satir gordu (beklenen 0)', v_n;
  end if;

  -- (b2) INSERT reddedilmeli (RLS ihlali -> 42501).
  v_caught := false;
  begin
    insert into public.account_deletions (subject_role) values ('client');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [123 INSERT]: authenticated denetim kaydina satir YAZABILDI -- sahte silme kaydi uretilebilir';
  end if;

  -- (b3) UPDATE / DELETE: politika olmadigi icin HICBIR SATIRA ULASAMAZ
  --      (42501 degil, 0 satir -- RLS gorunurluk katmani zaten bosaltiyor).
  update public.account_deletions set storage_objects_deleted = 999;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [123 UPDATE]: authenticated % denetim satirini GUNCELLEDI', v_rows;
  end if;

  delete from public.account_deletions;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [123 DELETE]: authenticated % denetim satirini SILDI -- denetim izi silinebilir', v_rows;
  end if;

  raise notice 'GECTI [123 denetim tablosu: 6 kolonluk sozlesme korunuyor, kisisel veri kolonu YOK; authenticated okuyamaz/yazamaz/silemez]';
end $$;
reset role;

-- Satır GERÇEKTEN yerinde mi (yani UPDATE/DELETE'i RLS mi engelledi, yoksa
-- satır hiç var mıydı) — pozitif kontrol.
do $$
begin
  if (select storage_objects_deleted from public.account_deletions
       where request_id = 'a0000000-0000-0000-0000-000000000123') <> 0 then
    raise exception 'BASARISIZ [123 POZITIF]: denetim satiri authenticated tarafindan DEGISTIRILMIS';
  end if;
end $$;
rollback;


-- =============================================================================
-- HESAP SILME (KVKK) — 124) YETKİ YÜZEYİ SÜRÜKLENME TESTİ + KOÇ KAPISI
--
-- Senaryo 118 ile aynı felsefe: yeni yazma yüzeyi eklendiğinde sertleştirme
-- kuralları TAHMİN edilmez, ÖLÇÜLÜR.
--   * `prosecdef = true`  -> SECURITY DEFINER (auth.users silmek icin ZORUNLU)
--   * `search_path` PİNLİ -> arama yolu ele gecirmesine kapali
--   * EXECUTE: yalnizca `service_role`; authenticated/anon/PUBLIC YOK
--   * KOÇ KAPISI: `service_role` ile bile bir KOÇ hesabi silinemez (ADR-0007)
-- =============================================================================
begin;
do $$
declare
  v_secdef boolean;
  v_config text[];
  v_fn     text;
  v_sig    text;
begin
  foreach v_fn in array array['account_deletion_manifest', 'delete_account'] loop
    v_sig := case v_fn
               when 'delete_account' then 'public.delete_account(uuid, uuid, integer)'
               else 'public.account_deletion_manifest(uuid)'
             end;

    select p.prosecdef, p.proconfig into v_secdef, v_config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;

    if v_secdef is null then
      raise exception 'BASARISIZ [124]: public.% YOK -- hesap silme ucu PGRST202 alir', v_fn;
    end if;
    if not v_secdef then
      raise exception 'BASARISIZ [124 SECURITY / %]: SECURITY INVOKER olmus -- auth.users silinemez, KVKK akisi olu', v_fn;
    end if;
    if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
      raise exception 'BASARISIZ [124 search_path / %]: arama yolu pinlenmemis (%)', v_fn, v_config;
    end if;

    if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [124 grant / %]: AUTHENTICATED rolune ACIK -- danisan sunucu ucundaki onayi ATLAYABILIR', v_fn;
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [124 grant / %]: ANON rolune ACIK', v_fn;
    end if;
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [124 grant / %]: service_role CALISTIRAMIYOR -- sunucu yolu kirilir', v_fn;
    end if;
  end loop;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public'
       and p.proname in ('delete_account', 'account_deletion_manifest')
       and a.grantee = 0                       -- PUBLIC
       and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'BASARISIZ [124 grant]: silme fonksiyonlari PUBLIC a ACIK (revoke all ... from public dusmus)';
  end if;
end $$;

-- KOÇ KAPISI: kendi kocumuzu uretip service_role ile silmeyi DENERIZ.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000124',
   'authenticated', 'authenticated', 'zz-124-koc@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-124 Koc"}'::jsonb,
   now(), now(), '', '', '', '');
update public.profiles set role = 'coach'
 where id = 'c0000000-0000-0000-0000-000000000124';

set local role service_role;
do $$
declare
  v_caught boolean := false;
  v_state  text;
begin
  begin
    perform public.delete_account('c0000000-0000-0000-0000-000000000124'::uuid);
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [124 KOC KAPISI]: koc hesabi silinebildi -- is_coach() kimseye TRUE donmez, tum danisanlarin onay/mesaj/plan yollari OLURDU';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [124 KOC KAPISI hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from auth.users where id = 'c0000000-0000-0000-0000-000000000124') then
    raise exception 'BASARISIZ [124 KOC KAPISI]: reddedilen cagri koc kullanicisini YINE DE sildi';
  end if;
  raise notice 'GECTI [124 delete_account/account_deletion_manifest SECURITY DEFINER + pinli search_path + EXECUTE yalnizca service_role; koc hesabi service_role ile bile silinemez]';
end $$;
rollback;


-- =============================================================================
-- EK DOĞRULAMA — 125) [B-028 / AC-4.6.4] SUNUCU DOĞRULAMASI OLMADAN EK YAZILAMAZ
--
-- BU SENARYONUN VARLIK SEBEBİ: `apps/web/src/app/api/attachments/verify` ucu tek
-- başına bir güvenlik sınırı DEĞİLDİR — istemci onu ATLAYABİLİR. Sınır burada,
-- veritabanındadır: ek içeren bir mesaj satırı, o ek için SUNUCUNUN bıraktığı
-- damga olmadan GİREMEZ (`messages_require_verified_attachment`).
--
--   (a) damgasız ek                       -> 42501
--   (b) POZİTİF: damgalı ek               -> GEÇER
--   (c) damga TEK KULLANIMLIK             -> aynı ek ikinci mesaja iliştirilemez
--   (d) TOCTOU: damgadan SONRA içerik değişti (eTag) -> 42501
--   (e) BAYAT damga (>15 dk)              -> 42501
--   (f) BAŞKASININ yüklediği nesnenin damgası tüketilemez -> 42501
--   (g) SUNUCU bağlamı (seed/migration/service_role) kapıdan ETKİLENMEZ
-- =============================================================================
begin;

-- KURULUM — hepsi `postgres` kimliğiyle (RLS bypass), rol taklidinden ÖNCE.
insert into storage.objects (bucket_id, name, metadata) values
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125a.jpg',
   jsonb_build_object('eTag', '"e125a"', 'size', 68, 'mimetype', 'image/jpeg')),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125b.jpg',
   jsonb_build_object('eTag', '"e125b"', 'size', 68, 'mimetype', 'image/jpeg')),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125c.jpg',
   jsonb_build_object('eTag', '"e125c"', 'size', 68, 'mimetype', 'image/jpeg')),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125d.jpg',
   jsonb_build_object('eTag', '"e125d"', 'size', 68, 'mimetype', 'image/jpeg')),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-125k.jpg',
   jsonb_build_object('eTag', '"e125k"', 'size', 68, 'mimetype', 'image/jpeg'));

--   (a) 125a BİLEREK damgasız bırakılır.
insert into public.message_attachment_verifications (bucket, path, mime, object_etag, verified_at) values
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125b.jpg',
   'image/jpeg', 'e125b', now()),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125c.jpg',
   'image/jpeg', 'e125c', now()),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125d.jpg',
   'image/jpeg', 'e125d', now() - interval '16 minutes'),
  ('message-attachments', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-125k.jpg',
   'image/jpeg', 'e125k', now());

--   (d) TOCTOU KURULUMU: damga yazıldıktan SONRA nesnenin içeriği değişiyor.
--   Gerçek dünyada bu, aynı yola ikinci bir yükleme (ya da sil + yeniden yükle)
--   demektir; storage her ikisinde de yeni bir eTag üretir.
update storage.objects
   set metadata = jsonb_set(metadata, '{eTag}', '"\"e125c-degisti\""')
 where bucket_id = 'message-attachments'
   and name = '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125c.jpg';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean;
  v_state  text;
  v_dir    text;
  v_spec   text[];
begin
  -- (b) POZİTİF ÖNCE: kapının meşru akışı GERÇEKTEN geçirdiği gösterilmeden
  --     redlerin bir anlamı olmazdı ("güvenli ama çalışmayan" veritabanı).
  insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid,
          '22222222-2222-2222-2222-222222222222'::uuid,
          'zz-125 dogrulanmis ek',
          '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125b.jpg');

  -- Damga TÜKETİLDİ mi? (tek kullanımlık olmasının kanıtı)
  if exists (
    select 1 from public.message_attachment_verifications
     where path = '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125b.jpg'
  ) then
    raise exception 'BASARISIZ [125b]: damga TUKETILMEDI -- ayni nesne sonsuza dek onayli kalir';
  end if;

  -- (a) damgasız, (c) tüketilmiş damga, (d) TOCTOU, (e) bayat, (f) başkasının nesnesi
  foreach v_spec slice 1 in array array[
    ['125a', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125a.jpg'],
    ['125c-tuketilmis', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125b.jpg'],
    ['125d-toctou', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125c.jpg'],
    ['125e-bayat', '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125d.jpg'],
    ['125f-baskasinin', '22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111-125k.jpg']
  ] loop
    v_caught := false;
    begin
      insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
      values ('22222222-2222-2222-2222-222222222222'::uuid,
              '11111111-1111-1111-1111-111111111111'::uuid,
              '22222222-2222-2222-2222-222222222222'::uuid,
              'zz-125 ' || v_spec[1],
              v_spec[2]);
    exception when insufficient_privilege then
      v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
    end;

    if not v_caught then
      raise exception 'BASARISIZ [%]: DOGRULANMAMIS ek iceren mesaj YAZILABILDI -- B-028 kapisi ACIK', v_spec[1];
    end if;
    if v_state is distinct from '42501' then
      raise exception 'BASARISIZ [% hata kodu]: beklenen 42501, gelen %', v_spec[1], v_state;
    end if;
  end loop;

  -- Sağlamlık: EKSİZ mesaj kapıdan hiç geçmez (kapı yalnızca eke bakar).
  insert into public.messages (sender_id, receiver_id, client_id, message)
  values ('22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid,
          '22222222-2222-2222-2222-222222222222'::uuid,
          'zz-125 eksiz mesaj');

  raise notice 'GECTI [125a-f Damgasiz/tuketilmis/degismis/bayat/baskasinin eki RED (42501); damgali ek GECER ve damga TUKETILIR]';
end $$;

-- (g) SUNUCU BAĞLAMI: seed / migration / service_role yolu kapıdan etkilenmez.
--     `is_end_user_write()` false olduğu için damga ARANMAZ — aksi hâlde bu
--     migration'dan sonra hiçbir seed/bakım script'i ek yazamazdı.
reset role;
do $$
begin
  insert into public.messages (sender_id, receiver_id, client_id, message, attachment_path)
  values ('22222222-2222-2222-2222-222222222222'::uuid,
          '11111111-1111-1111-1111-111111111111'::uuid,
          '22222222-2222-2222-2222-222222222222'::uuid,
          'zz-125g sunucu baglami',
          '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-125a.jpg');
  raise notice 'GECTI [125g Sunucu baglami (postgres) damgasiz ek yazabilir -- kapi YALNIZCA son kullaniciya bakar]';
end $$;
rollback;


-- =============================================================================
-- EK DOĞRULAMA — 126) [B-028] YETKİ YÜZEYİ SÜRÜKLENME TESTİ
--
-- Kapının GÜCÜ üç şeye dayanıyor; üçü de burada ÖLÇÜLÜR, varsayılmaz:
--   (a) Damga tablosu istemciye KAPALI (RLS + FORCE + SIFIR politika). Grant
--       vardır (senaryo 73 pozitif kontrolü) ama okuma 0 satır, yazma REDdir.
--   (b) `record_attachment_verification` EXECUTE'u YALNIZCA `service_role`de —
--       aksi hâlde danışan kendini "doğrulanmış" ilan ederdi.
--   (c) `messages_require_verified_attachment` SECURITY INVOKER OLMAK ZORUNDA.
--       DEFINER olsaydı içeride `current_user = 'postgres'` olur,
--       `is_end_user_write()` HER ZAMAN false döner ve kapı SESSİZCE AÇILIRDI.
--       Bu, kaybı en sinsi olan gerileme; testin asıl hedefi budur.
-- =============================================================================
begin;
do $$
declare
  v_rls    boolean;
  v_force  boolean;
  v_pol    int;
  v_secdef boolean;
  v_config text[];
begin
  -- (a)
  select c.relrowsecurity, c.relforcerowsecurity into v_rls, v_force
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'message_attachment_verifications';

  if v_rls is null then
    raise exception 'BASARISIZ [126a]: message_attachment_verifications tablosu YOK -- B-028 kapisi kurulamaz';
  end if;
  if not v_rls or not v_force then
    raise exception 'BASARISIZ [126a]: damga tablosunda RLS/FORCE kapali (rls=%, force=%)', v_rls, v_force;
  end if;

  select count(*) into v_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'message_attachment_verifications';
  if v_pol <> 0 then
    raise exception 'BASARISIZ [126a]: damga tablosunda % politika var -- istemciye kapi acilmis', v_pol;
  end if;

  -- (b)
  if has_function_privilege('authenticated', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE') then
    raise exception 'BASARISIZ [126b]: record_attachment_verification AUTHENTICATED a ACIK -- kullanici kendini dogrulanmis ilan edebilir';
  end if;
  if has_function_privilege('anon', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE') then
    raise exception 'BASARISIZ [126b]: record_attachment_verification ANON a ACIK';
  end if;
  if not has_function_privilege('service_role', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE') then
    raise exception 'BASARISIZ [126b]: service_role CALISTIRAMIYOR -- dogrulama ucu kirik, ek gonderilemez';
  end if;

  -- (c) — EN KRİTİK DAL
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'messages_require_verified_attachment';

  if v_secdef is null then
    raise exception 'BASARISIZ [126c]: messages_require_verified_attachment YOK -- kapi kaldirilmis';
  end if;
  if v_secdef then
    raise exception 'BASARISIZ [126c]: tetikleyici SECURITY DEFINER olmus -- is_end_user_write() her zaman false doner, KAPI SESSIZCE ACIK';
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [126c search_path]: tetikleyicinin arama yolu pinlenmemis (%)', v_config;
  end if;

  -- Yardımcı DEFINER olmak ZORUNDA (damga tablosu ve storage.objects okur).
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'consume_attachment_verification';

  if v_secdef is null then
    raise exception 'BASARISIZ [126c]: consume_attachment_verification YOK';
  end if;
  if not v_secdef then
    raise exception 'BASARISIZ [126c]: consume_attachment_verification SECURITY INVOKER olmus -- damga tablosunu okuyamaz, her ek REDDEDILIR';
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [126c search_path]: consume_attachment_verification arama yolu pinlenmemis (%)', v_config;
  end if;

  -- Tetikleyici GERÇEKTEN bağlı mı? (fonksiyon dursa da tetikleyici düşmüş olabilir)
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname  = 'messages_require_verified_attachment'
       and not tgisinternal
  ) then
    raise exception 'BASARISIZ [126c]: tetikleyici public.messages e BAGLI DEGIL -- kapi yok';
  end if;

  raise notice 'GECTI [126 Damga tablosu RLS+FORCE+sifir politika; record_* yalnizca service_role; tetikleyici INVOKER + pinli search_path + messages e bagli]';
end $$;

-- Aynı senaryonun CANLI yarısı: danışan damga tablosunu ne OKUYABİLİR ne YAZABİLİR,
-- ve `record_attachment_verification`ı ÇAĞIRAMAZ.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_n      bigint;
  v_caught boolean;
  v_state  text;
begin
  select count(*) into v_n from public.message_attachment_verifications;
  if v_n <> 0 then
    raise exception 'BASARISIZ [126 okuma]: danisan damga tablosunda % satir GORDU', v_n;
  end if;

  v_caught := false;
  begin
    insert into public.message_attachment_verifications (bucket, path, mime, object_etag)
    values ('message-attachments',
            '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-126x.jpg',
            'image/png', 'sahte');
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [126 yazma]: danisan KENDI damgasini yazabildi -- B-028 kapisi anlamsiz';
  end if;

  v_caught := false;
  begin
    perform public.record_attachment_verification(
      'message-attachments',
      '22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222-126x.jpg',
      'image/png', 'sahte');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [126 RPC]: danisan record_attachment_verification i CAGIRABILDI';
  end if;

  raise notice 'GECTI [126 Danisan damga tablosunu okuyamaz/yazamaz ve record_attachment_verification i cagiramaz]';
end $$;
rollback;


-- =============================================================================
-- FAZ 4.7 / DİLİM 1 — TOTP MFA ve aal2 KAPISI (127–131)
-- Migration: supabase/migrations/20260819120000_mfa_aal2_gate.sql
-- Karar    : docs/adr/0026-totp-mfa-ve-aal2-kapisi.md
--
-- ### JWT'YE `aal` CLAIM'İ NASIL ENJEKTE EDİLİYOR ###########################
--   `auth.jwt()` Supabase'de `current_setting('request.jwt.claims', true)::jsonb`
--   okur. Yani bu paketin zaten kullandığı `set local request.jwt.claims`
--   deseninin JSON'una `"aal":"aal1"` / `"aal":"aal2"` eklemek YETER; ayrı bir
--   mekanizma gerekmez.
--
--   BU TURDA MEVCUT 126 SENARYONUN KOÇ YARISI DEĞİŞTİ: 36 koç claim satırına
--   `"aal":"aal2"` eklendi. Eklenmeseydi hepsi kırmızı olurdu — ve bu, kapının
--   ÇALIŞTIĞININ kanıtıdır (fail-closed: claim yoksa koç reddedilir).
--
--   DANIŞAN CLAIM SATIRLARINA HİÇBİR ŞEY EKLENMEDİ (92 + 7 satır, `aal` claim'i
--   YOK). Bu bilinçlidir: danışan yolunun `aal` claim'i OLMADAN da bugünkü gibi
--   çalışması, "danışanı etkilemiyoruz" iddiasının EN ZOR hâlidir. Senaryo 130
--   ayrıca AÇIK `aal1` claim'iyle aynı ölçümü tekrarlar.
-- ###########################################################################


-- =============================================================================
-- 127) aal1 KOÇ — 14 TABLONUN HİÇBİRİNİ OKUYAMAZ
--
-- Tablo listesi dinamik değil BİLEREK SABİTTİR: `pg_policies`ten okunsaydı test
-- politikanın kendisini kanıt olarak kullanır, yani kendi kendini doğrulardı.
-- Liste `delete_account()` manifestiyle (ADR-0025 §Ölçülen gerçekler 1) aynıdır.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_tables text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos'
  ];
  v_table text;
  v_n     bigint;
  v_seen  int := 0;
begin
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I', v_table) into v_n;
    if v_n <> 0 then
      raise exception 'BASARISIZ [127]: aal1 koc public.% tablosunda % satir GORDU -- aal2 kapisi bu tabloda YOK veya PERMISSIVE kurulmus.', v_table, v_n;
    end if;
    v_seen := v_seen + 1;
  end loop;

  if v_seen <> 14 then
    raise exception 'BASARISIZ [127]: 14 tablo beklenirken % tablo olculdu.', v_seen;
  end if;

  raise notice 'GECTI [127 aal1 koc 14 tablonun HICBIRINI okuyamaz]';
end $$;

-- Aynı oturumda KATALOG hâlâ okunabilir olmalı: kapı danışan verisini korur,
-- koçu hareket/besin listesinden mahrum bırakmaz (ADR-0026 §Karar 2).
do $$
begin
  if (select count(*) from public.exercises) = 0 then
    raise exception 'BASARISIZ [127 katalog]: aal1 koc exercises katalogunu goremiyor -- kapi kapsamini ASMIS.';
  end if;
  if (select count(*) from public.food_database) = 0 then
    raise exception 'BASARISIZ [127 katalog]: aal1 koc food_database katalogunu goremiyor -- kapi kapsamini ASMIS.';
  end if;
  raise notice 'GECTI [127 katalog aal1 kocta ACIK kalir]';
end $$;
rollback;


-- =============================================================================
-- 128) aal1 KOÇ — 14 TABLONUN HİÇBİRİNE YAZAMAZ
--
-- "Okuyamıyorsa zaten yazamaz" DOĞRU DEĞİLDİR: INSERT yolu `with check`
-- ifadesine bakar, `using`e değil. `for all` politikalarında Postgres `using`i
-- kopyalar ama migration bunu AÇIKÇA da yazıyor; burada ölçülen o.
-- =============================================================================
begin;
-- Kurulum `postgres` kimliğiyle (RLS bypass) — ölçüm rol taklidinden SONRA.
insert into public.daily_logs (id, client_id, log_date, water_lt)
values ('cccccccc-0000-0000-0000-000000000128', '22222222-2222-2222-2222-222222222222',
        current_date - 400, 2.5)
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_tables text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos'
  ];
  v_table   text;
  v_deleted bigint;
  v_caught  boolean;
begin
  -- (a) DELETE — `using` dalı. Hiçbir tabloda TEK SATIR bile silinemez.
  --     (Bu blok zaten `rollback` içinde; ayrıca kapı çalışıyorsa 0 satır siler.)
  foreach v_table in array v_tables loop
    execute format('delete from public.%I', v_table);
    get diagnostics v_deleted = row_count;
    if v_deleted <> 0 then
      raise exception 'BASARISIZ [128 delete]: aal1 koc public.% tablosundan % satir SILDI.', v_table, v_deleted;
    end if;
  end loop;

  -- (b) INSERT — `with check` dalı. Temsili üç tablo: kimlik (profiles),
  --     iletişim (notifications) ve günlük veri (daily_logs). Üçü de üç ayrı
  --     PERMISSIVE politika ailesine ait; RESTRICTIVE kapı üçünü de ezmeli.
  v_caught := false;
  begin
    insert into public.profiles (id, full_name, role)
    values ('cccccccc-0000-0000-0000-000000000128', 'MFA Kapi Testi', 'client');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [128 insert profiles]: aal1 koc profiles a satir YAZABILDI.';
  end if;

  v_caught := false;
  begin
    insert into public.notifications (client_id, title, message)
    values ('22222222-2222-2222-2222-222222222222', 'MFA', 'kapi testi');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [128 insert notifications]: aal1 koc bildirim YAZABILDI.';
  end if;

  v_caught := false;
  begin
    insert into public.daily_logs (client_id, log_date, water_lt)
    values ('22222222-2222-2222-2222-222222222222', current_date - 401, 2.5);
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [128 insert daily_logs]: aal1 koc danisanin gunlugune YAZABILDI.';
  end if;

  -- (c) UPDATE — var olan bir satır üzerinde; 0 satır etkilenmeli.
  update public.daily_logs set water_lt = 9.9 where id = 'cccccccc-0000-0000-0000-000000000128';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'BASARISIZ [128 update]: aal1 koc var olan daily_logs satirini GUNCELLEDI.';
  end if;

  raise notice 'GECTI [128 aal1 koc 14 tabloya yazamaz/silemez/guncelleyemez]';
end $$;
rollback;


-- =============================================================================
-- 129) aal2 KOÇ — BUGÜNKÜ GİBİ ÇALIŞIR (pozitif kontrol)
--
-- 127/128 tek başına yanıltıcı olurdu: politika `false` sabiti olsaydı ikisi de
-- geçerdi ve koç KALICI olarak kilitlenmiş olurdu. Bu senaryo kapının
-- AÇILDIĞINI de ölçer.
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_profiles bigint;
  v_logs     bigint;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles < 3 then
    raise exception 'BASARISIZ [129]: aal2 koc yalnizca % profil gordu (>=3 bekleniyordu) -- kapi ACILMIYOR.', v_profiles;
  end if;

  select count(*) into v_logs from public.daily_logs;
  if v_logs = 0 then
    raise exception 'BASARISIZ [129]: aal2 koc hicbir daily_log goremedi -- kapi ACILMIYOR.';
  end if;

  -- Yazma yolu da açık olmalı: koçun danışana bildirim yazması.
  insert into public.notifications (client_id, title, message)
  values ('22222222-2222-2222-2222-222222222222', 'MFA 129', 'aal2 kocun yazma yolu acik');

  raise notice 'GECTI [129 aal2 koc okur ve yazar -- kapi ACILIYOR]';
end $$;
rollback;


-- =============================================================================
-- 130) *** REGRESYON KAPISI *** — DANIŞAN aal1 İLE BUGÜNKÜ GİBİ ÇALIŞIR
--
-- Bu paketin EN ÖNEMLİ senaryosudur. `not is_coach()` dalı silinir ya da
-- yanlış yazılırsa (ör. `is_coach()` unutulup yalnızca `aal = 'aal2'` kalırsa)
-- TÜM DANIŞANLAR kilitlenir ve bu, üretimde ancak kullanıcı şikâyetiyle
-- görülürdü.
--
-- ÖLÇÜM BİÇİMİ: seed'e bağlı sabit sayılar YAZILMAZ (kırılgan olurdu). Bunun
-- yerine AYNI transaksiyonda aynı sorgu iki claim setiyle koşulur —
-- (a) `aal` claim'i YOK, (b) `"aal":"aal1"` — ve 14 tablonun HEPSİNDE sonuç
-- BİREBİR aynı olmak zorundadır.
--
-- BOŞ GEÇME (vacuous pass) KORUMASI: "0 = 0" da eşitliktir. Bu yüzden ayrıca
-- danışanın gerçekten veri GÖRDÜĞÜ ölçülür; her şey kilitlenmişse eşitlik
-- sağlansa bile senaryo patlar.
-- =============================================================================
begin;
set local role authenticated;
do $$
declare
  v_tables text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos'
  ];
  v_table    text;
  v_no_claim bigint;
  v_aal1     bigint;
  v_nonzero  int := 0;
begin
  foreach v_table in array v_tables loop
    -- (a) `aal` claim'i OLMADAN (bugünkü 99 danışan senaryosunun koştuğu hâl)
    perform set_config('request.jwt.claims',
      '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
    execute format('select count(*) from public.%I', v_table) into v_no_claim;

    -- (b) AÇIK `"aal":"aal1"` ile (gerçek GoTrue token'inin hali)
    perform set_config('request.jwt.claims',
      '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}', true);
    execute format('select count(*) from public.%I', v_table) into v_aal1;

    if v_no_claim is distinct from v_aal1 then
      raise exception 'BASARISIZ [130]: public.% -- danisan claim siz % satir, aal1 ile % satir gordu. aal2 kapisi DANISANI ETKILIYOR.',
        v_table, v_no_claim, v_aal1;
    end if;

    if v_aal1 > 0 then
      v_nonzero := v_nonzero + 1;
    end if;
  end loop;

  -- Boş geçme koruması: danışanın en az 5 tabloda gerçekten verisi görünmeli.
  -- (Seed'de danışan A'nın profil, mesaj, günlük, antrenman ve plan verisi var.)
  if v_nonzero < 5 then
    raise exception 'BASARISIZ [130 bos gecme]: danisan yalnizca % tabloda veri gordu -- kapi danisani da KILITLEMIS olabilir, esitlik sinavi anlamsiz.', v_nonzero;
  end if;

  raise notice 'GECTI [130 REGRESYON: danisan aal1 ile de claim siz de BIREBIR ayni goruyor, % tabloda veri var]', v_nonzero;
end $$;

-- Danışanın YAZMA yolu da aal1 ile açık kalmalı (opt-in kararının ta kendisi:
-- danışan MFA kurmasa da uygulamayı kullanmaya devam eder).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
begin
  insert into public.daily_logs (client_id, log_date, water_lt)
  values ('22222222-2222-2222-2222-222222222222', current_date - 402, 2.5);

  insert into public.progress_entries (client_id, entry_date, weight_kg)
  values ('22222222-2222-2222-2222-222222222222', current_date - 402, 82);

  raise notice 'GECTI [130 danisan aal1 ile YAZABILIYOR -- opt-in karari korunuyor]';
end $$;
rollback;


-- =============================================================================
-- 131) POLİTİKA SÜRÜKLENME TESTİ — 16/16, RESTRICTIVE, ALL, authenticated
--
-- Politikanın VARLIĞI yetmez; YANLIŞ kurulmuş bir politika sessizce etkisizdir:
--   * PERMISSIVE olsaydı mevcut politikalarla VEYA'lanır, hiçbir şeyi kısıtlamazdı;
--   * `for select` olsaydı yazma yolu açık kalırdı;
--   * `to public` olsaydı `postgres`/`service_role` da kapsanır görünürdü (yanıltıcı);
--   * `with check` NULL olsaydı INSERT yolu ölçülemezdi.
-- Ayrıca tablo listesinin ŞEMAYLA ayrışmadığı da burada ölçülür.
--
-- FAZ 4.8 (2026-08-20): liste 14 -> 16. `activity_sessions` ve `activity_events`
-- kapıya EKLENDİ (20260820090000_activity_log.sql KARAR 3b): muafiyet
-- listesindekilerin aksine bu iki tablonun GERÇEK bir koç okuma politikası var
-- (sıfır-politika değiller), dolayısıyla koç aal1'de danışanın davranış
-- verisini — giriş saatleri, çevrimiçi örüntü — okuyabilirdi. Muafiyet listesi
-- DEĞİŞMEDİ.
--
-- İMZA DİLİMİ (20260821120000_bb_signature_slice.sql): liste 16 -> 18.
-- `workout_sessions` ve `mesocycles` kapıya EKLENDİ: ikisi de danışan-verisi
-- tablosudur (danışan kendi satırını okur/yazar, koçun gerçek okuma yolu var),
-- muafiyet gerekçesi yoktur. Muafiyet listesi yine DEĞİŞMEDİ.
-- =============================================================================
begin;
do $$
declare
  v_expected text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos',
    -- Faz 4.8 (§7c) — etkinlik kaydı:
    'activity_sessions', 'activity_events',
    -- İmza Dilimi (20260821120000_bb_signature_slice.sql) — 16 -> 18:
    'workout_sessions', 'mesocycles'
  ];
  v_ok      int;
  v_total   int;
  v_missing text;
  v_extra   text;
begin
  -- (a) 18 tablonun HEPSİNDE, doğru şekilde kurulmuş mu?
  select count(*) into v_ok
    from pg_policies p
   where p.schemaname = 'public'
     and p.policyname = 'mfa_aal2_gate'
     and p.tablename  = any (v_expected)
     and p.permissive = 'RESTRICTIVE'
     and p.cmd        = 'ALL'
     and p.roles      = '{authenticated}'::name[]
     and p.qual       like '%is_coach%'
     and p.qual       like '%aal2%'
     and p.with_check like '%is_coach%'
     and p.with_check like '%aal2%';

  if v_ok <> 18 then
    select string_agg(e, ', ' order by e) into v_missing
      from unnest(v_expected) as e
     where not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = e
          and p.policyname = 'mfa_aal2_gate'
          and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
          and p.roles = '{authenticated}'::name[]
          and p.qual like '%is_coach%' and p.qual like '%aal2%'
          and p.with_check like '%is_coach%' and p.with_check like '%aal2%'
     );
    raise exception 'BASARISIZ [131a]: 18 beklenirken % dogru politika var. Eksik/bozuk: %', v_ok, coalesce(v_missing, '(bilinmiyor)');
  end if;

  -- (b) `mfa_aal2_gate` adıyla BAŞKA bir tabloya politika sızmış mı?
  select count(*) into v_total
    from pg_policies p
   where p.schemaname = 'public' and p.policyname = 'mfa_aal2_gate';
  if v_total <> 18 then
    raise exception 'BASARISIZ [131b]: mfa_aal2_gate adli politika sayisi % (18 bekleniyordu).', v_total;
  end if;

  -- (c) ŞEMA SÜRÜKLENMESİ: public'te, 18 kapılı tablo ve bilinen muafiyetler
  --     DIŞINDA bir tablo varsa, ya kapıya ya muafiyet listesine girmelidir.
  --     Yarın eklenen 15. danışan tablosu buradan GÜRÜLTÜLÜ geçer.
  select string_agg(t.tablename, ', ' order by t.tablename) into v_extra
    from pg_tables t
   where t.schemaname = 'public'
     and t.tablename <> all (v_expected)
     and t.tablename <> all (array[
       'exercises',                        -- katalog, kullanici kolonu yok
       'food_database',                    -- katalog, kullanici kolonu yok
       'account_deletions',                -- denetim, RLS+FORCE+sifir politika (ADR-0025 §6)
       'message_attachment_verifications', -- damga, RLS+FORCE+sifir politika (B-028)
       'coach_actions'                     -- denetim, RLS+FORCE+sifir politika (Faz 4.7)
     ]);

  if v_extra is not null then
    raise exception 'BASARISIZ [131c]: aal2 kapisi ve muafiyet listesi DISINDA public tablo(lar) var -> %. Danisan verisi tasiyorsa migration listesine, tasimiyorsa muafiyet listesine eklenmeli.', v_extra;
  end if;

  -- (d) Politika `is_coach()`e dayanıyor; o fonksiyon INVOKER'a dönerse
  --     `profiles` politikasi kendi kendini tetikler ve kapi SESSIZCE ACILIR.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'is_coach' and p.prosecdef
  ) then
    raise exception 'BASARISIZ [131d]: public.is_coach() SECURITY DEFINER degil -- aal2 kapisi SESSIZCE ETKISIZ.';
  end if;

  raise notice 'GECTI [131 18/18 mfa_aal2_gate RESTRICTIVE+ALL+authenticated, using+with_check dolu, sema surukleme yok, is_coach DEFINER]';
end $$;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ (Faz 4.7) — 132) YAZMA YÜZEYİ SÜRÜKLENME TESTİ
-- (20260819130000_coach_action_audit.sql)
--
-- Senaryo 118/124 ile AYNI felsefe: yeni yazma yüzeyi eklendiğinde sertleştirme
-- kuralları TAHMİN edilmez, ÖLÇÜLÜR.
--   * `prosecdef = true`  -> SECURITY DEFINER (RLS-sıfır tabloya yazabilmek için ZORUNLU)
--   * `search_path` PİNLİ -> arama yolu ele geçirmesine kapalı
--   * EXECUTE: yalnızca `service_role`; authenticated/anon/PUBLIC YOK
-- =============================================================================
begin;
do $$
declare
  v_secdef boolean;
  v_config text[];
  v_sig    constant text := 'public.record_coach_action(text, uuid, uuid, uuid)';
begin
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_coach_action';

  if v_secdef is null then
    raise exception 'BASARISIZ [132]: public.record_coach_action YOK -- denetim ucu PGRST202 alir';
  end if;
  if not v_secdef then
    raise exception 'BASARISIZ [132 SECURITY]: SECURITY INVOKER olmus -- coach_actions sifir-politikali, yazma OLMEZ';
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [132 search_path]: arama yolu pinlenmemis (%)', v_config;
  end if;

  if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [132 grant]: AUTHENTICATED rolune ACIK -- koc sahte denetim satiri uretebilir';
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [132 grant]: ANON rolune ACIK';
  end if;
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [132 grant]: service_role CALISTIRAMIYOR -- sunucu yolu kirilir';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public' and p.proname = 'record_coach_action'
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'BASARISIZ [132 grant]: record_coach_action PUBLIC a ACIK';
  end if;

  raise notice 'GECTI [132 record_coach_action SECURITY DEFINER + pinli search_path + EXECUTE yalnizca service_role]';
end $$;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ (Faz 4.7) — 133) TABLO KİLİTLİ VE KİŞİSEL VERİYİ YALNIZ
-- SERVICE_ROLE FONKSİYONU YAZABİLİR
--
-- İki ayrı iddia (senaryo 123 ile AYNI desen):
--   (a) KOLON SÖZLEŞMESİ: `coach_actions` yalnızca beklenen 6 kolonu taşır.
--   (b) ERİŞİM: `authenticated` (koç dahil) tabloyu OKUYAMAZ ve YAZAMAZ; kilit
--       ACL'de değil RLS'tedir (grant var, politika YOK). `service_role`in de
--       DOĞRUDAN tablo yetkisi YOKTUR — tek yazıcı record_coach_action()'dır.
-- =============================================================================
begin;
do $$
declare
  v_cols text;
begin
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'coach_actions';

  if v_cols is distinct from 'action,actor_id,id,occurred_at,request_id,target_id' then
    raise exception 'BASARISIZ [133 KOLON SOZLESMESI]: coach_actions kolonlari degismis -> %.', v_cols;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_actions') <> 0 then
    raise exception 'BASARISIZ [133 POLITIKA]: coach_actions uzerine politika eklenmis -- denetim kaydi authenticated a acilmis olabilir';
  end if;

  if has_table_privilege('service_role', 'public.coach_actions', 'SELECT')
     or has_table_privilege('service_role', 'public.coach_actions', 'INSERT')
     or has_table_privilege('service_role', 'public.coach_actions', 'UPDATE')
     or has_table_privilege('service_role', 'public.coach_actions', 'DELETE') then
    raise exception 'BASARISIZ [133 service_role]: denetim tablosu service_role a DOGRUDAN acilmis -- PostgREST uzerinden okunabilir/yazilabilir hale gelmis';
  end if;
end $$;

-- Kurulum: okunacak bir satır OLSUN ki "0 satır göründü" iddiası boş bir yeşil olmasın.
insert into public.coach_actions (action, actor_id, target_id) values
  ('password_reset_requested', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_n      bigint;
  v_caught boolean;
  v_rows   int;
begin
  -- (b1) KOÇ bile HİÇBİR satır göremez -- kendi tetiklediği eylem dahil.
  select count(*) into v_n from public.coach_actions;
  if v_n <> 0 then
    raise exception 'BASARISIZ [133 SELECT]: koc denetim kaydinda % satir gordu (beklenen 0)', v_n;
  end if;

  -- (b2) INSERT reddedilmeli (RLS ihlali -> 42501).
  v_caught := false;
  begin
    insert into public.coach_actions (action, actor_id, target_id)
    values ('password_reset_requested', '11111111-1111-1111-1111-111111111111',
             '22222222-2222-2222-2222-222222222222');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [133 INSERT]: authenticated denetim kaydina satir YAZABILDI -- sahte denetim uretilebilir';
  end if;

  -- (b3) UPDATE / DELETE: politika olmadığı için HİÇBİR SATIRA ULAŞAMAZ.
  update public.coach_actions set action = action;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [133 UPDATE]: authenticated % denetim satirini GUNCELLEDI', v_rows;
  end if;

  delete from public.coach_actions;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [133 DELETE]: authenticated % denetim satirini SILDI -- denetim izi silinebilir', v_rows;
  end if;

  raise notice 'GECTI [133 coach_actions: 6 kolonluk sozlesme korunuyor; authenticated (koc dahil) okuyamaz/yazamaz/silemez; service_role dogrudan tablo yetkisi YOK]';
end $$;
reset role;

-- Satır GERÇEKTEN yerinde mi (yani UPDATE/DELETE'i RLS mi engelledi, yoksa
-- satır hiç var mıydı) — pozitif kontrol.
do $$
begin
  if (select count(*) from public.coach_actions
       where actor_id = '11111111-1111-1111-1111-111111111111'
         and target_id = '22222222-2222-2222-2222-222222222222') <> 1 then
    raise exception 'BASARISIZ [133 POZITIF]: denetim satiri authenticated tarafindan DEGISTIRILMIS/SILINMIS';
  end if;
end $$;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ (Faz 4.7) — 134) YAZMA GERÇEKTEN ÇALIŞIR + KAPALI LİSTE +
-- DANIŞAN ÇAĞIRAMAZ
--
--   (a) POZİTİF KONTROL: `service_role` ile `record_coach_action()` çağrılınca
--       satır GERÇEKTEN yazılır (kapı sadece kapatmıyor, gerçekten AÇILIYOR).
--   (b) `action` CHECK kısıtı kapalı listedir -- tanımsız bir değer 23514 ile
--       reddedilir.
--   (c) `authenticated` (danışan) fonksiyonu HİÇ ÇAĞIRAMAZ (EXECUTE yok) --
--       başkasının adına sahte denetim satırı üretemez.
-- =============================================================================
begin;
set local role service_role;
do $$
declare
  v_id     uuid;
  v_caught boolean := false;
  v_state  text;
begin
  -- (a) POZİTİF KONTROL — id'yi `postgres`e (aşağıda, rol değişiminden SONRA)
  -- taşımak için `set_config` kullanılır: `service_role`ün `coach_actions`
  -- üzerinde DOĞRUDAN SELECT yetkisi YOKTUR (§1 bilinçli tasarım, senaryo 133)
  -- — yani doğrulama BURADA, service_role bağlamında YAPILAMAZ.
  v_id := public.record_coach_action(
    'password_reset_requested'::text,
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'a0000000-0000-0000-0000-000000000134'::uuid
  );
  if v_id is null then
    raise exception 'BASARISIZ [134a]: record_coach_action NULL id dondurdu';
  end if;
  perform set_config('zz.coach_action_134_id', v_id::text, true);

  -- (b) KAPALI LİSTE
  begin
    perform public.record_coach_action(
      'not_a_real_action'::text,
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid
    );
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [134b]: tanimsiz action degeri KABUL EDILDI -- kapali liste calismiyor';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [134b hata kodu]: beklenen 23514, gelen %', v_state;
  end if;
end $$;
reset role;

-- (a) devamı — DOĞRULAMA `postgres` kimliğiyle (senaryo 121'deki AYNI desen:
-- `service_role`ün coach_actions'ta doğrudan tablo yetkisi yok).
do $$
declare
  v_id uuid := current_setting('zz.coach_action_134_id')::uuid;
begin
  if (select count(*) from public.coach_actions where id = v_id) <> 1 then
    raise exception 'BASARISIZ [134a]: donen id ile eslesen satir YOK -- yazma gercekten calismiyor';
  end if;
end $$;

-- (c) DANIŞAN çağıramaz.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.record_coach_action(
      'password_reset_requested'::text,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [134c]: danisan record_coach_action i CAGIRABILDI -- kendi adina sahte "koc" denetim satiri uretebilir';
  end if;
  raise notice 'GECTI [134 record_coach_action GERCEKTEN yazar; action kapali liste 23514 ile REDDEDER; authenticated CAGIRAMAZ]';
end $$;
reset role;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ (Faz 4.7) — 135) HESAP SİLME (KVKK) DANIŞANI HEDEF ALAN
-- SATIRLARI DA SÜPÜRÜR
--
-- `coach_actions.target_id` -> `profiles(id)` ON DELETE CASCADE. Danışan
-- `delete_account()` ile silinince bu tablodaki satır da GİTMELİDİR (KVKK
-- unutulma hakkı: "kime müdahale edildi" kaydı, o kişi silindiğinde anlamsız
-- kalan bir iz olarak DURAMAZ). Manifest'in 'coach_actions' anahtarı da
-- doğru sayıyor mu -- AYRICA ölçülür (§3 gerekçesi: manifest saymazsa fail-
-- closed kanıt bu tabloyu hiç GÖRMEZ).
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000135',
   'authenticated', 'authenticated', 'zz-135-silinecek@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-135 Silinecek"}'::jsonb,
   now(), now(), '', '', '', '');

insert into public.coach_actions (action, actor_id, target_id, request_id) values
  ('password_reset_requested', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000135', 'a0000000-0000-0000-0000-000000000135'),
  ('password_reset_requested', '11111111-1111-1111-1111-111111111111',
   'c0000000-0000-0000-0000-000000000135', 'a0000000-0000-0000-0000-000000000235');

set local role service_role;
do $$
declare
  v_before jsonb;
  v_result jsonb;
begin
  v_before := public.account_deletion_manifest('c0000000-0000-0000-0000-000000000135'::uuid);
  if not (v_before -> 'rows' ? 'coach_actions') then
    raise exception 'BASARISIZ [135 manifest]: rows.coach_actions anahtari YOK';
  end if;
  if (v_before -> 'rows' ->> 'coach_actions')::int <> 2 then
    raise exception 'BASARISIZ [135 manifest sayim]: coach_actions=% (beklenen 2)', v_before -> 'rows' ->> 'coach_actions';
  end if;

  v_result := public.delete_account('c0000000-0000-0000-0000-000000000135'::uuid);
  if (v_result ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [135]: var olan kullanici icin already_deleted=true dondu';
  end if;
  if ((v_result -> 'rows_deleted') ->> 'coach_actions')::int <> 2 then
    raise exception 'BASARISIZ [135 rows_deleted]: coach_actions=% (beklenen 2)', (v_result -> 'rows_deleted') ->> 'coach_actions';
  end if;
end $$;
reset role;

do $$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.coach_actions
   where target_id = 'c0000000-0000-0000-0000-000000000135';
  if v_n <> 0 then
    raise exception 'BASARISIZ [135 CASCADE]: silme sonrasi coach_actions da % satir kaldi (beklenen 0)', v_n;
  end if;

  -- Koçun kendi satırları (başka danışanlara yönelik) ETKİLENMEMELİ.
  if (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 1 then
    raise exception 'BASARISIZ [135 TANIK]: seed koc silindi -- KATASTROFIK fazla silme';
  end if;

  raise notice 'GECTI [135 danisan silinince coach_actions target_id CASCADE ile gider; manifest ve rows_deleted dogru sayiyor]';
end $$;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ (Faz 4.7) — 136) KOÇ (AKTÖR) SİLİNSE BİLE İZ KAYBOLMAZ
--
-- `coach_actions.actor_id` -> `profiles(id)` ON DELETE SET NULL. `delete_
-- account()` koç hesabını zaten REDDEDER (ADR-0007, senaryo 124); bu senaryo
-- o kapının DIŞINDA kalan bir yolu ölçer -- `postgres`/`service_role` ile
-- `auth.users`tan DOĞRUDAN silme (ör. Supabase Studio'dan elle bir koç hesabı
-- kapatılması). Bu durumda BİLE "bu danışana müdahale edildi" izi KALICI
-- kalmalı, yalnızca "kim yaptı" bilgisi kaybolmalı -- tıpkı `form_checks.
-- reviewed_by` / `program_approvals.reviewed_by`nin AYNI durumda yaptığı gibi
-- (20260819100000 §"KOÇ HESABI BU YOLDAN SİLİNEMEZ" yorumu).
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000136',
   'authenticated', 'authenticated', 'zz-136-koc@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-136 Koc"}'::jsonb,
   now(), now(), '', '', '', '');
-- `handle_new_user()` sertleştirilmiş (20260817160100): rol her zaman 'client'
-- gelir, metadata okunmaz. Test koçu doğrudan `postgres` kimliğiyle yükseltilir
-- (senaryo 124'teki KOÇ KAPISI kurulumuyla AYNI desen).
update public.profiles set role = 'coach'
 where id = 'c0000000-0000-0000-0000-000000000136';

insert into public.coach_actions (action, actor_id, target_id, request_id) values
  ('password_reset_requested', 'c0000000-0000-0000-0000-000000000136',
   '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000136');

-- `postgres` (bu betiğin varsayılan bağlantı rolü) superuser'dır; `service_role`in
-- AKSİNE `auth.users` üzerinde DOĞRUDAN DELETE yetkisine sahiptir (Supabase
-- Studio/psql ile elle müdahale de AYNI şekilde çalışır). `delete_account()`in
-- KOÇ KAPISI bilerek ATLANIP ham DELETE ile "elle admin müdahalesi" simüle edilir.
delete from auth.users where id = 'c0000000-0000-0000-0000-000000000136';

do $$
declare
  v_actor_id uuid;
  v_n        bigint;
begin
  if exists (select 1 from auth.users where id = 'c0000000-0000-0000-0000-000000000136') then
    raise exception 'BASARISIZ [136 kurulum]: test kocu silinemedi -- senaryo kosulamiyor';
  end if;

  select count(*) into v_n from public.coach_actions
   where request_id = 'a0000000-0000-0000-0000-000000000136';
  if v_n <> 1 then
    raise exception 'BASARISIZ [136 IZ KAYBOLDU]: koc silindikten sonra denetim satiri KALMADI (bulunan=%) -- coach_actions.actor_id CASCADE olmus olabilir', v_n;
  end if;

  select actor_id into v_actor_id from public.coach_actions
   where request_id = 'a0000000-0000-0000-0000-000000000136';
  if v_actor_id is not null then
    raise exception 'BASARISIZ [136 SET NULL]: actor_id hala % -- FK SET NULL calismiyor', v_actor_id;
  end if;

  raise notice 'GECTI [136 koc (aktor) auth.users tan dogrudan silinse bile coach_actions satiri KALIR, yalnizca actor_id NULL olur]';
end $$;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8 / §7c) — 137) DANIŞAN KENDİ KAYDINI GÖRÜR,
-- BAŞKASININKİNİ GÖRMEZ
--
-- §7c: "Danışan kendi kaydını görür" — koç görünümüyle SİMETRİK DEĞİL, danışan
-- kendi geçmişine TAM erişir. Bu senaryo hem POZİTİF (kendi satırlarını
-- gerçekten görüyor) hem NEGATİF (başkasınınkini görmüyor) yarıyı ölçer;
-- yalnız negatif ölçmek "her şey 0" ile boş bir yeşil üretirdi.
-- =============================================================================
begin;

-- Kurulum `postgres` kimliğiyle (KENDİ KURULUMUNU YAPMA KURALI).
insert into public.activity_sessions (id, user_id, started_at, last_seen_at, platform) values
  ('d0000000-0000-0000-0000-000000000137', '22222222-2222-2222-2222-222222222222',
   now() - interval '2 hours', now() - interval '90 minutes', 'web'),
  ('d0000000-0000-0000-0000-000000000237', '33333333-3333-3333-3333-333333333333',
   now() - interval '2 hours', now() - interval '90 minutes', 'mobile');

insert into public.activity_events (user_id, session_id, event, tab, duration_sec, occurred_at) values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000137',
   'login', null, null, now() - interval '2 hours'),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000137',
   'tab_view', 'antrenman', 120, now() - interval '110 minutes'),
  ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000237',
   'message_sent', null, null, now() - interval '100 minutes');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_own_s   bigint;
  v_own_e   bigint;
  v_other_s bigint;
  v_other_e bigint;
begin
  select count(*) into v_own_s from public.activity_sessions
   where user_id = '22222222-2222-2222-2222-222222222222';
  select count(*) into v_own_e from public.activity_events
   where user_id = '22222222-2222-2222-2222-222222222222';

  if v_own_s < 1 or v_own_e < 2 then
    raise exception 'BASARISIZ [137 POZITIF]: danisan KENDI kaydini goremiyor (oturum=%, olay=%) -- §7c ihlali', v_own_s, v_own_e;
  end if;

  -- Filtresiz sorgu da yalnızca kendi satırlarını dönmeli (RLS, WHERE değil).
  select count(*) into v_other_s from public.activity_sessions
   where user_id <> '22222222-2222-2222-2222-222222222222';
  select count(*) into v_other_e from public.activity_events
   where user_id <> '22222222-2222-2222-2222-222222222222';

  if v_other_s <> 0 or v_other_e <> 0 then
    raise exception 'BASARISIZ [137 IZOLASYON]: danisan BASKASININ etkinlik kaydini gordu (oturum=%, olay=%)', v_other_s, v_other_e;
  end if;

  raise notice 'GECTI [137 danisan kendi etkinlik kaydini gorur (% oturum / % olay), baskasininkini GORMEZ]', v_own_s, v_own_e;
end $$;
reset role;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 138) DANIŞAN DOĞRUDAN YAZAMAZ — YAZMA YALNIZ
-- SUNUCU YOLUNDAN (B-031'in bu yüzeydeki ilk kapanışı)
--
-- İki ayrı iddia:
--   (a) TABLO: `authenticated` (danışan da koç da) INSERT/UPDATE/DELETE
--       yapamaz — grant VAR ama YAZMA POLİTİKASI YOK (RLS + FORCE -> RED).
--   (b) FONKSİYON: yazma/rıza/purge fonksiyonlarının HİÇBİRİ `authenticated`a
--       ya da `anon`a AÇIK DEĞİL; hepsi SECURITY DEFINER ve `search_path` pinli.
--       (Senaryo 118/124/132 ile AYNI felsefe: sertleştirme TAHMİN EDİLMEZ,
--        ÖLÇÜLÜR.)
-- =============================================================================
begin;

insert into public.activity_sessions (id, user_id, platform) values
  ('d0000000-0000-0000-0000-000000000138', '22222222-2222-2222-2222-222222222222', 'web');
insert into public.activity_events (id, user_id, session_id, event) values
  ('d0000000-0000-0000-0000-000000000238', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000138', 'login');

do $$
declare
  v_sig    text;
  v_secdef boolean;
  v_config text[];
begin
  foreach v_sig in array array[
    'public.record_activity(uuid, text, text, uuid, text, integer, timestamp with time zone)',
    'public.purge_expired_activity(integer)',
    'public.grant_activity_consent(uuid, integer)',
    'public.revoke_activity_consent(uuid)'
  ] loop
    select p.prosecdef, p.proconfig into v_secdef, v_config
      from pg_proc p where p.oid = v_sig::regprocedure;

    if v_secdef is null then
      raise exception 'BASARISIZ [138b]: % YOK -- sunucu yolu PGRST202 alir', v_sig;
    end if;
    if not v_secdef then
      raise exception 'BASARISIZ [138b SECURITY]: % SECURITY INVOKER olmus -- sifir yazma politikali tabloya yazamaz', v_sig;
    end if;
    if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
      raise exception 'BASARISIZ [138b search_path]: % arama yolu pinlenmemis (%)', v_sig, v_config;
    end if;
    if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [138b grant]: % AUTHENTICATED rolune ACIK -- tarayici dogrudan yazabilir (B-031 delinir)', v_sig;
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [138b grant]: % ANON rolune ACIK', v_sig;
    end if;
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'BASARISIZ [138b grant]: service_role % yi CALISTIRAMIYOR -- sunucu yolu kirilir', v_sig;
    end if;
    if exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'BASARISIZ [138b grant]: % PUBLIC a ACIK', v_sig;
    end if;
  end loop;

  -- `service_role` tablolara DOĞRUDAN erişememeli (tek yazıcı DEFINER fonksiyon).
  if has_table_privilege('service_role', 'public.activity_events', 'SELECT')
     or has_table_privilege('service_role', 'public.activity_events', 'INSERT')
     or has_table_privilege('service_role', 'public.activity_sessions', 'SELECT')
     or has_table_privilege('service_role', 'public.activity_sessions', 'INSERT') then
    raise exception 'BASARISIZ [138 service_role]: etkinlik tablolari service_role a DOGRUDAN acilmis -- PostgREST uzerinden tum danisanlarin davranis gecmisi okunabilir';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean;
  v_state  text;
  v_rows   int;
begin
  -- (a1) INSERT — KENDİ adına bile yazamaz.
  v_caught := false;
  begin
    insert into public.activity_sessions (user_id, platform)
    values ('22222222-2222-2222-2222-222222222222', 'web');
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [138a INSERT/sessions]: danisan oturum satiri YAZABILDI -- tarayicidan dogrudan yazim acik (B-031)';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [138a hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  v_caught := false;
  begin
    insert into public.activity_events (user_id, session_id, event)
    values ('22222222-2222-2222-2222-222222222222',
            'd0000000-0000-0000-0000-000000000138', 'ai_generated');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [138a INSERT/events]: danisan olay satiri YAZABILDI -- sahte aktivite uretilebilir';
  end if;

  -- (a2) UPDATE / DELETE: politika olmadığı için HİÇBİR SATIRA ULAŞAMAZ
  --      (RLS'te politikasız UPDATE/DELETE hata değil, 0 satırdır).
  update public.activity_events set duration_sec = 9999;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [138a UPDATE]: danisan % etkinlik satirini GUNCELLEDI', v_rows;
  end if;

  delete from public.activity_events;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [138a DELETE]: danisan % etkinlik satirini SILDI -- kendi izini temizleyebilir', v_rows;
  end if;

  delete from public.activity_sessions;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'BASARISIZ [138a DELETE/sessions]: danisan % oturum satirini SILDI', v_rows;
  end if;

  -- (a3) Rıza damgasını KENDİ eliyle basamaz (profiles_guard_activity_consent).
  v_caught := false;
  begin
    update public.profiles
       set activity_consent_granted_at = now(), activity_consent_version = 1
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [138a RIZA]: danisan riza damgasini KENDI yazabildi -- geriye tarihli riza uretilebilir';
  end if;

  raise notice 'GECTI [138 danisan etkinlik tablolarina yazamaz/silemez/guncelleyemez, riza damgasini basamaz; yazma fonksiyonlari yalnizca service_role da]';
end $$;
reset role;

-- Satırlar GERÇEKTEN yerinde mi (yani UPDATE/DELETE'i RLS mi engelledi) — pozitif kontrol.
do $$
begin
  if (select count(*) from public.activity_events where id = 'd0000000-0000-0000-0000-000000000238') <> 1
     or (select count(*) from public.activity_sessions where id = 'd0000000-0000-0000-0000-000000000138') <> 1 then
    raise exception 'BASARISIZ [138 POZITIF]: kurulum satirlari authenticated tarafindan DEGISTIRILMIS/SILINMIS';
  end if;
end $$;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 139) KOÇ OKUR (aal2) / OKUYAMAZ (aal1)
--
-- KARAR 3b (20260820090000 §3): iki tablo da `mfa_aal2_gate` kapısına girdi.
-- Bu senaryo kapının İKİ YÖNÜNÜ de ölçer:
--   (a) aal2 koç TÜM danışanları görür (pozitif kontrol — politika `false`
--       sabiti değil, gerçekten AÇILIYOR),
--   (b) aal1 (ve `aal` claim'i OLMAYAN) koç HİÇBİR ŞEY göremez.
-- (b) olmasaydı, koçun parolasını ele geçiren biri ikinci faktör olmadan her
-- danışanın giriş saatlerini ve çevrimiçi örüntüsünü okuyabilirdi.
-- =============================================================================
begin;

insert into public.activity_sessions (id, user_id, platform) values
  ('d0000000-0000-0000-0000-000000000139', '22222222-2222-2222-2222-222222222222', 'web'),
  ('d0000000-0000-0000-0000-000000000239', '33333333-3333-3333-3333-333333333333', 'mobile');
insert into public.activity_events (user_id, session_id, event) values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000139', 'login'),
  ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000239', 'login');

-- (a) aal2 KOÇ — POZİTİF KONTROL
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_s bigint;
  v_e bigint;
  v_u bigint;
begin
  select count(*) into v_s from public.activity_sessions;
  select count(*) into v_e from public.activity_events;
  select count(distinct user_id) into v_u from public.activity_events;

  if v_s < 2 or v_e < 2 then
    raise exception 'BASARISIZ [139a]: aal2 koc etkinlik kaydini okuyamiyor (oturum=%, olay=%)', v_s, v_e;
  end if;
  if v_u < 2 then
    raise exception 'BASARISIZ [139a]: aal2 koc yalnizca % danisanin kaydini gordu -- koc TUM danisanlari gormeli', v_u;
  end if;
  raise notice 'GECTI [139a aal2 koc % oturum / % olay / % danisan gordu]', v_s, v_e, v_u;
end $$;
reset role;

-- (b) aal1 KOÇ ve `aal` claim'i OLMAYAN KOÇ — KAPI KAPALI
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_s bigint;
  v_e bigint;
begin
  select count(*) into v_s from public.activity_sessions;
  select count(*) into v_e from public.activity_events;
  if v_s <> 0 or v_e <> 0 then
    raise exception 'BASARISIZ [139b aal1]: aal1 koc % oturum / % olay GORDU -- ikinci faktor olmadan davranis profili okunabiliyor', v_s, v_e;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_s bigint;
  v_e bigint;
begin
  select count(*) into v_s from public.activity_sessions;
  select count(*) into v_e from public.activity_events;
  if v_s <> 0 or v_e <> 0 then
    raise exception 'BASARISIZ [139b aal claim YOK]: kapi fail-closed degil (% oturum / % olay)', v_s, v_e;
  end if;
  raise notice 'GECTI [139b aal1 koc VE aal claim i olmayan koc etkinlik kaydinin HICBIRINI goremez]';
end $$;
reset role;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 140) record_activity(): RIZA KAPISI + POZİTİF
-- KONTROL + KAPALI LİSTE + BAŞKASININ OTURUMU + 30 DK BAYATLAMA
--
-- KARAR 2'nin ASIL GEREKÇESİ burada ölçülür: rıza kontrolü fonksiyonun İÇİNDE
-- fail-closed durur, yani "route'ta unutulursa ne olur" sorusu HİÇ DOĞMAZ.
-- =============================================================================
begin;

-- Kurulum: danışan A'nın rızası HENÜZ YOK ('undecided').
update public.profiles
   set activity_consent_granted_at = null,
       activity_consent_revoked_at = null,
       activity_consent_version    = null
 where id = '22222222-2222-2222-2222-222222222222';

do $$
begin
  if public.activity_consent_state('22222222-2222-2222-2222-222222222222') is distinct from 'undecided' then
    raise exception 'BASARISIZ [140 kurulum]: baslangic durumu undecided degil -> %',
      public.activity_consent_state('22222222-2222-2222-2222-222222222222');
  end if;
end $$;

set local role service_role;
do $$
declare
  v_caught boolean;
  v_state  text;
  v_res    jsonb;
  v_sid    uuid;
  v_res2   jsonb;
begin
  -- (a) RIZA YOK ('undecided') -> 42501, HİÇBİR SATIR YAZILMAZ.
  v_caught := false;
  begin
    perform public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'login');
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [140a]: RIZA YOKKEN etkinlik yazildi -- KVKK acik riza sarti delindi';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [140a hata kodu]: beklenen 42501, gelen %', v_state;
  end if;

  -- (b) RIZA VER -> POZİTİF KONTROL: kapı gerçekten AÇILIYOR.
  perform public.grant_activity_consent('22222222-2222-2222-2222-222222222222'::uuid, 1);
  if public.activity_consent_state('22222222-2222-2222-2222-222222222222') is distinct from 'granted' then
    raise exception 'BASARISIZ [140b]: grant_activity_consent sonrasi durum granted degil';
  end if;

  v_res := public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'login');
  v_sid := (v_res ->> 'session_id')::uuid;
  if v_sid is null or not (v_res ->> 'session_started')::boolean then
    raise exception 'BASARISIZ [140b]: ilk cagri yeni oturum acmadi -> %', v_res;
  end if;
  if (v_res ->> 'event_id') is null then
    raise exception 'BASARISIZ [140b]: olay satiri yazilmadi -> %', v_res;
  end if;
  perform set_config('zz.activity_140_session', v_sid::text, true);

  -- (c) HEARTBEAT = OLAYSIZ ÇAĞRI: aynı oturum, YENİ SATIR YOK.
  v_res2 := public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', null, v_sid);
  if (v_res2 ->> 'session_id')::uuid is distinct from v_sid then
    raise exception 'BASARISIZ [140c]: heartbeat yeni oturum acti (% -> %)', v_sid, v_res2 ->> 'session_id';
  end if;
  if (v_res2 ->> 'event_id') is not null then
    raise exception 'BASARISIZ [140c]: heartbeat OLAY SATIRI yazdi -- iki tablo karari anlamsizlasir';
  end if;

  -- (d) KAPALI LİSTE: tanımsız olay 23514 ile reddedilir (tek kaynak: tablo CHECK).
  v_caught := false;
  begin
    perform public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'sifre_calindi', v_sid);
  exception when check_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [140d]: kapali liste disi olay KABUL EDILDI';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [140d hata kodu]: beklenen 23514, gelen %', v_state;
  end if;

  -- (e) GEÇERSİZ PLATFORM da kapalı listedir.
  v_caught := false;
  begin
    perform public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'desktop');
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [140e]: platform kapali listesi calismiyor';
  end if;
end $$;
reset role;

-- (f) BAŞKASININ OTURUMU: danışan B'nin oturumuna A adına olay yazılamaz.
insert into public.activity_sessions (id, user_id, platform) values
  ('d0000000-0000-0000-0000-000000000140', '33333333-3333-3333-3333-333333333333', 'web');

set local role service_role;
do $$
declare
  v_caught boolean := false;
  v_state  text;
  v_old    uuid := current_setting('zz.activity_140_session')::uuid;
  v_res    jsonb;
begin
  begin
    perform public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'login',
                                   'd0000000-0000-0000-0000-000000000140'::uuid);
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [140f]: BASKASININ oturumuna olay yazildi -- user_id/session_id capraz baglanabiliyor';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [140f hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
end $$;
reset role;

-- (g) 30 DK BAYATLAMA kurulumu `postgres` kimliğiyle: `service_role`ün
-- `activity_sessions` üzerinde DOĞRUDAN UPDATE yetkisi YOKTUR (bilinçli
-- tasarım — senaryo 138'de ölçülüyor), o yüzden oturumu geriye almak burada
-- yapılır. ÖLÇÜLEN ifade yine rol taklidinden SONRA gelen `record_activity()`tir.
update public.activity_sessions
   set started_at   = now() - interval '3 hours',
       last_seen_at = now() - interval '45 minutes'
 where id = current_setting('zz.activity_140_session')::uuid;

set local role service_role;
do $$
declare
  v_old uuid := current_setting('zz.activity_140_session')::uuid;
  v_res jsonb;
begin
  v_res := public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'tab_view', v_old, 'beslenme', 30);
  if not (v_res ->> 'session_started')::boolean then
    raise exception 'BASARISIZ [140g]: 45 dk bayat oturum YENILENMEDI -> %', v_res;
  end if;
  if (v_res ->> 'session_id')::uuid = v_old then
    raise exception 'BASARISIZ [140g]: bayat oturumun id si degismedi (%)', v_old;
  end if;
  perform set_config('zz.activity_140_session2', v_res ->> 'session_id', true);
end $$;
reset role;

-- Yazılanlar GERÇEKTEN yerinde mi (service_role tablolari OKUYAMAZ -> dogrulama
-- `postgres` kimligiyle; senaryo 134'teki AYNI desen).
do $$
declare
  v_s1 uuid := current_setting('zz.activity_140_session')::uuid;
  v_s2 uuid := current_setting('zz.activity_140_session2')::uuid;
begin
  if (select count(*) from public.activity_sessions where id in (v_s1, v_s2)) <> 2 then
    raise exception 'BASARISIZ [140 POZITIF]: iki oturum satiri de yerinde degil';
  end if;
  if (select count(*) from public.activity_events where session_id = v_s1) <> 1 then
    raise exception 'BASARISIZ [140 POZITIF]: ilk oturumun login olayi YOK';
  end if;
  if (select count(*) from public.activity_events
       where session_id = v_s2 and event = 'tab_view' and tab = 'beslenme' and duration_sec = 30) <> 1 then
    raise exception 'BASARISIZ [140 POZITIF]: yeni oturumun tab_view olayi beklenen alanlarla yazilmadi';
  end if;
  raise notice 'GECTI [140 riza kapisi fail-closed (42501); riza verilince GERCEKTEN yazar; heartbeat olay uretmez; kapali liste 23514; baskasinin oturumu 42501; 30 dk bayatlama yeni oturum acar]';
end $$;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 141) RIZA GERİ ÇEKME = DURDUR + SİL
--
-- KARAR 1'in ikinci yarısı: toplamanın tek dayanağı AÇIK RIZADIR (§7c meşru
-- menfaati bilerek reddetti). Dayanak düşünce SAKLAMA dayanağı da düşer
-- (KVKK m.7) — veri 180 günlük pencerede "erimeye" BIRAKILMAZ, ANINDA silinir.
-- Ayrıca silmenin BAŞKA kullanıcıya dokunmadığı ölçülür (filtresiz delete YOK).
--
-- ### CANLI VERİ KIRILGANLIĞI DÜZELTMESİ (2026-08-20) ########################
--   (c) İZOLASYON iddiası eskiden danışan B için MUTLAK sayım kullanıyordu
--   (`count(*) ... <> 1`). Bu, dosya başındaki "KENDİ KURULUMUNU YAPMA
--   KURALI"nı ihlal ediyordu: B'nin DIŞARIDAKİ (gerçek/manuel kullanım kaynaklı)
--   `activity_events`/`activity_sessions` satırı OLMADIĞINI varsayıyordu.
--   Yerel yığında B için GERÇEKTEN canlı veri varsa (ölçüldü: bu düzeltme
--   sırasında 54 olay / 36 oturum) mutlak sayım `<> 1` her zaman patlar ve
--   yanıltıcı bir "FILTRESIZ DELETE!" mesajı verir — oysa HİÇBİR ŞEY
--   silinmemiştir. Düzeltme: mutlak sayım yerine, senaryonun KENDİ ürettiği
--   sabit-id'li satırın (session `d0000000-...-000000000241` ve ona bağlı
--   `login` olayı) varlığı doğrudan ID ile sorgulanır. Bu, dışarıdaki satır
--   sayısından TAMAMEN bağımsızdır ve ölçülen güvenlik garantisini
--   DEĞİŞTİRMEZ: `revoke_activity_consent(A)` B'nin KENDİ ürettiğimiz satırına
--   dokunmamalıdır; dokunursa (filtresiz DELETE ya da yanlış WHERE) o satır
--   ID'siyle birlikte GİDER ve iddia GERÇEKTEN yakalar.
-- ###############################################################################
begin;

update public.profiles
   set activity_consent_granted_at = now() - interval '10 days',
       activity_consent_revoked_at = null,
       activity_consent_version    = 1
 where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

insert into public.activity_sessions (id, user_id, platform) values
  ('d0000000-0000-0000-0000-000000000141', '22222222-2222-2222-2222-222222222222', 'web'),
  ('d0000000-0000-0000-0000-000000000241', '33333333-3333-3333-3333-333333333333', 'mobile');
insert into public.activity_events (user_id, session_id, event) values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000141', 'login'),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000141', 'message_sent'),
  ('33333333-3333-3333-3333-333333333333', 'd0000000-0000-0000-0000-000000000241', 'login');

set local role service_role;
do $$
declare
  v_res jsonb;
begin
  v_res := public.revoke_activity_consent('22222222-2222-2222-2222-222222222222'::uuid);
  if (v_res ->> 'events_deleted')::int <> 2 then
    raise exception 'BASARISIZ [141 sayim]: events_deleted=% (beklenen 2)', v_res ->> 'events_deleted';
  end if;
  if (v_res ->> 'sessions_deleted')::int <> 1 then
    raise exception 'BASARISIZ [141 sayim]: sessions_deleted=% (beklenen 1)', v_res ->> 'sessions_deleted';
  end if;
end $$;
reset role;

do $$
begin
  -- (a) DURDUR: durum artık 'revoked' -> yazma kapısı kapalı.
  if public.activity_consent_state('22222222-2222-2222-2222-222222222222') is distinct from 'revoked' then
    raise exception 'BASARISIZ [141 DURUM]: geri cekme sonrasi durum revoked degil -> %',
      public.activity_consent_state('22222222-2222-2222-2222-222222222222');
  end if;

  -- (b) SİL: kullanıcının HİÇBİR satırı kalmamalı. (A'nın DIŞARIDAN canlı
  -- satırı olmadığı ölçüldü -- 0/0 -- yoksa bu iddia da (c) gibi ID bazlı
  -- yazılmalıydı.)
  if (select count(*) from public.activity_events   where user_id = '22222222-2222-2222-2222-222222222222') <> 0
     or (select count(*) from public.activity_sessions where user_id = '22222222-2222-2222-2222-222222222222') <> 0 then
    raise exception 'BASARISIZ [141 SIL]: geri cekmeden sonra satirlar KALDI -- 180 gun "erimeye" birakilmis, KVKK m.7 ihlali';
  end if;

  -- (c) İZOLASYON: danışan B'nin KENDİ ÜRETTİĞİMİZ sabit-id'li satırı
  -- ETKİLENMEMELİ (filtresiz delete YOK). Mutlak sayım KULLANILMAZ -- B için
  -- dışarıda (gerçek/manuel kullanım) satır bulunabilir; bkz. dosya başındaki
  -- "CANLI VERİ KIRILGANLIĞI DÜZELTMESİ" notu.
  if not exists (
    select 1 from public.activity_sessions
     where id = 'd0000000-0000-0000-0000-000000000241'
       and user_id = '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'BASARISIZ [141 IZOLASYON]: BASKA kullanicinin (B) KENDI URETTIGIMIZ oturumu KAYIP -- FILTRESIZ DELETE!';
  end if;
  if not exists (
    select 1 from public.activity_events
     where session_id = 'd0000000-0000-0000-0000-000000000241'
       and user_id     = '33333333-3333-3333-3333-333333333333'
       and event        = 'login'
  ) then
    raise exception 'BASARISIZ [141 IZOLASYON]: BASKA kullanicinin (B) KENDI URETTIGIMIZ olayi KAYIP -- FILTRESIZ DELETE!';
  end if;
  if public.activity_consent_state('33333333-3333-3333-3333-333333333333') is distinct from 'granted' then
    raise exception 'BASARISIZ [141 IZOLASYON]: BASKA kullanicinin rizasi geri cekildi';
  end if;

  raise notice 'GECTI [141 geri cekme = DURDUR + SIL: durum revoked, kullanicinin tum satirlari gitti, BASKA kullanici etkilenmedi]';
end $$;

-- (d) Geri çekildikten sonra yazma yolu GERÇEKTEN kapalı mı?
set local role service_role;
do $$
declare
  v_caught boolean := false;
begin
  begin
    perform public.record_activity('22222222-2222-2222-2222-222222222222'::uuid, 'web', 'login');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [141d]: riza geri cekilmisken etkinlik YENIDEN yazilabildi';
  end if;
  raise notice 'GECTI [141d riza geri cekilmisken record_activity 42501 ile REDDEDIYOR]';
end $$;
reset role;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 142) PURGE 180 GÜNDEN ESKİYİ SİLER, YENİSİNE
-- DOKUNMAZ + ZAMANLAYICI KAYITLI
--
-- §7c "Saklama 180 gün". İki yarısı da ölçülür: eskisi GİTMELİ (yoksa saklama
-- politikası bir dilek olur), yenisi KALMALI (yoksa purge veri kaybıdır).
-- Ayrıca `p_retention_days < 1`'in reddedildiği — yani "hepsini sil" kısayolu
-- olmadığı — ve pg_cron job'unun kayıtlı olduğu doğrulanır.
-- =============================================================================
begin;

insert into public.activity_sessions (id, user_id, started_at, last_seen_at, platform) values
  -- ESKİ (200 gün) ve YENİ (2 gün)
  ('d0000000-0000-0000-0000-000000000142', '22222222-2222-2222-2222-222222222222',
   now() - interval '200 days', now() - interval '200 days', 'web'),
  ('d0000000-0000-0000-0000-000000000242', '22222222-2222-2222-2222-222222222222',
   now() - interval '2 days', now() - interval '2 days', 'web');

insert into public.activity_events (id, user_id, session_id, event, occurred_at) values
  ('d0000000-0000-0000-0000-000000000342', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000142', 'login', now() - interval '200 days'),
  ('d0000000-0000-0000-0000-000000000442', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000242', 'login', now() - interval '2 days');

set local role service_role;
do $$
declare
  v_caught boolean := false;
  v_res    jsonb;
begin
  -- (a) "Hepsini sil" kısayolu YOK.
  begin
    perform public.purge_expired_activity(0);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [142a]: purge_expired_activity(0) KABUL EDILDI -- filtresiz silme kisayolu acik';
  end if;

  -- (b) Gerçek purge.
  v_res := public.purge_expired_activity(180);
  if (v_res ->> 'events_deleted')::int < 1 then
    raise exception 'BASARISIZ [142b]: 200 gunluk olay SILINMEDI -> %', v_res;
  end if;
  if (v_res ->> 'sessions_deleted')::int < 1 then
    raise exception 'BASARISIZ [142b]: 200 gunluk oturum SILINMEDI -> %', v_res;
  end if;
end $$;
reset role;

do $$
begin
  -- (c) ESKİ gitti mi?
  if (select count(*) from public.activity_events where id = 'd0000000-0000-0000-0000-000000000342') <> 0 then
    raise exception 'BASARISIZ [142c]: 200 gunluk olay HALA DURUYOR -- 180 gunluk saklama uygulanmiyor';
  end if;
  if (select count(*) from public.activity_sessions where id = 'd0000000-0000-0000-0000-000000000142') <> 0 then
    raise exception 'BASARISIZ [142c]: 200 gunluk oturum HALA DURUYOR';
  end if;

  -- (d) YENİ duruyor mu? (purge veri kaybi DEGILDIR)
  if (select count(*) from public.activity_events where id = 'd0000000-0000-0000-0000-000000000442') <> 1 then
    raise exception 'BASARISIZ [142d]: 2 gunluk olay SILINDI -- purge fazla siliyor';
  end if;
  if (select count(*) from public.activity_sessions where id = 'd0000000-0000-0000-0000-000000000242') <> 1 then
    raise exception 'BASARISIZ [142d]: 2 gunluk oturum SILINDI';
  end if;

  -- (e) ZAMANLAYICI: pg_cron kuruluysa job MUTLAKA olmali (yarim kurulum YOK).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if (select count(*) from cron.job where jobname = 'activity_log_purge_daily' and active) <> 1 then
      raise exception 'BASARISIZ [142e]: pg_cron KURULU ama activity_log_purge_daily job u YOK/pasif -- 180 gunluk saklama zamanlayicisi eksik';
    end if;
  else
    raise notice 'NOT [142e]: pg_cron kurulu degil -- saklama siniri record_activity() icindeki firsatci purge ile ayakta';
  end if;

  raise notice 'GECTI [142 purge 180 gunden eskiyi siler, yenisine DOKUNMAZ; purge(0) reddedilir; cron job kayitli]';
end $$;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 143) HESAP SİLME (KVKK) ETKİNLİK KAYDINI DA
-- SÜPÜRÜR — MANİFEST 15 -> 17
--
-- `delete_account()` FAIL-CLOSED'dır: silme sonrası manifest'i YENİDEN ölçer ve
-- `row_total <> 0` ise TÜM transaksiyonu geri sarar. İki yeni tablo manifest'e
-- EKLENMESEYDİ hesap silme onları hiç GÖRMEZ, cascade bozulsa bile sessizce
-- "başarılı" derdi. Bu senaryo üç şeyi birden ölçer:
--   (a) manifest 17 anahtar döndürüyor ve iki yeni anahtar DOĞRU sayıyor,
--   (b) `rows_deleted` jsonb'sine iki yeni anahtar giriyor,
--   (c) silme sonrası iki tabloda da satır KALMIYOR.
-- =============================================================================
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000143',
   'authenticated', 'authenticated', 'zz-143-silinecek@example.com', 'x', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"zz-143 Silinecek"}'::jsonb,
   now(), now(), '', '', '', '');

-- Rıza + etkinlik kaydı: yazma yolu GERÇEK yol (record_activity) üzerinden
-- kurulur ki senaryo, elle INSERT'le üretilmiş yapay bir duruma değil ürünün
-- kendi ürettiği satırlara dayansın.
set local role service_role;
do $$
declare
  v_res jsonb;
  v_sid uuid;
begin
  perform public.grant_activity_consent('c0000000-0000-0000-0000-000000000143'::uuid, 1);
  v_res := public.record_activity('c0000000-0000-0000-0000-000000000143'::uuid, 'web', 'login');
  v_sid := (v_res ->> 'session_id')::uuid;
  perform public.record_activity('c0000000-0000-0000-0000-000000000143'::uuid, 'web', 'tab_view', v_sid, 'antrenman', 45);
  perform public.record_activity('c0000000-0000-0000-0000-000000000143'::uuid, 'web', 'logout', v_sid);
end $$;
reset role;

do $$
begin
  if (select count(*) from public.activity_events where user_id = 'c0000000-0000-0000-0000-000000000143') <> 3 then
    raise exception 'BASARISIZ [143 kurulum]: 3 olay bekleniyordu, % var',
      (select count(*) from public.activity_events where user_id = 'c0000000-0000-0000-0000-000000000143');
  end if;
end $$;

set local role service_role;
do $$
declare
  v_before jsonb;
  v_result jsonb;
  v_keys   int;
begin
  v_before := public.account_deletion_manifest('c0000000-0000-0000-0000-000000000143'::uuid);

  -- (a) MANİFEST 17 ANAHTAR
  select count(*) into v_keys from jsonb_object_keys(v_before -> 'rows');
  if v_keys <> 17 then
    raise exception 'BASARISIZ [143a]: manifest % tablo sayiyor (17 bekleniyordu) -- iki yeni tablo eklenmemis olabilir', v_keys;
  end if;
  if not (v_before -> 'rows' ? 'activity_sessions') or not (v_before -> 'rows' ? 'activity_events') then
    raise exception 'BASARISIZ [143a]: manifest activity_* anahtarlarini DONDURMUYOR';
  end if;
  if (v_before -> 'rows' ->> 'activity_sessions')::int <> 1 then
    raise exception 'BASARISIZ [143a sayim]: activity_sessions=% (beklenen 1)', v_before -> 'rows' ->> 'activity_sessions';
  end if;
  if (v_before -> 'rows' ->> 'activity_events')::int <> 3 then
    raise exception 'BASARISIZ [143a sayim]: activity_events=% (beklenen 3)', v_before -> 'rows' ->> 'activity_events';
  end if;

  -- (b) SİLME + rows_deleted
  v_result := public.delete_account('c0000000-0000-0000-0000-000000000143'::uuid);
  if (v_result ->> 'already_deleted')::boolean then
    raise exception 'BASARISIZ [143b]: var olan kullanici icin already_deleted=true dondu';
  end if;
  if ((v_result -> 'rows_deleted') ->> 'activity_sessions')::int <> 1
     or ((v_result -> 'rows_deleted') ->> 'activity_events')::int <> 3 then
    raise exception 'BASARISIZ [143b rows_deleted]: activity_sessions=%, activity_events=%',
      (v_result -> 'rows_deleted') ->> 'activity_sessions',
      (v_result -> 'rows_deleted') ->> 'activity_events';
  end if;
end $$;
reset role;

do $$
begin
  -- (c) CASCADE GERÇEKTEN SÜPÜRDÜ MÜ
  if (select count(*) from public.activity_events   where user_id = 'c0000000-0000-0000-0000-000000000143') <> 0
     or (select count(*) from public.activity_sessions where user_id = 'c0000000-0000-0000-0000-000000000143') <> 0 then
    raise exception 'BASARISIZ [143c]: silme sonrasi etkinlik satirlari KALDI -- fail-closed kapisi bu tablolari gormemis';
  end if;

  -- TANIK: seed koc ve danisanlar ETKILENMEMELI (fazla silme yok).
  if (select count(*) from public.profiles) < 3 then
    raise exception 'BASARISIZ [143 TANIK]: seed profilleri silinmis -- KATASTROFIK fazla silme';
  end if;

  raise notice 'GECTI [143 hesap silme etkinlik kaydini da supurur; manifest 17 tablo sayiyor; rows_deleted iki yeni anahtari tasiyor]';
end $$;
rollback;


-- =============================================================================
-- ETKİNLİK KAYDI (Faz 4.8) — 144) coach_activity_summary(): KOÇ SORGUSU HAM
-- ZAMAN DAMGASI DÖNDÜRMEZ; SECURITY INVOKER; aal2 KAPISI VE RIZA KAPISI AYAKTA
--
-- Dilim 3c'nin (20260820140000_coach_activity_summary.sql) TEK senaryosu.
-- Dilim 3b koç görünümünü ham satır çekip TARAYICIDA toplayarak yapıyordu:
-- §7c'nin "koça saat/dakika gösterilmez" kuralı yalnızca ARAYÜZ NEZAKETİ
-- seviyesinde duruyordu, çünkü ham `started_at`/`occurred_at` zaten koçun
-- tarayıcısına iniyordu. Bu senaryo sınırın artık VERİ KATMANINDA olduğunu
-- ölçer:
--   (a) fonksiyon SECURITY INVOKER'dır (katalog) VE aal1 koç HİÇBİR ŞEY
--       göremez (davranış) — DEFINER olsaydı aal2 kapısı ATLANIRDI,
--   (b) aal2 koç DOĞRU gün toplamlarını alır (pozitif kontrol) ve dönen
--       kümede ham zaman damgası taşıyan BİR KOLON BİLE yoktur,
--   (c) danışan BAŞKASININ özetini alamaz (ama KENDİ özetini alabilir),
--   (d) RIZA KAPALIYSA satırlar DURUYOR OLSA BİLE küme BOŞTUR ve HATA YOKTUR.
-- =============================================================================
begin;

-- ### CANLI VERİ KIRILGANLIĞI DÜZELTMESİ (2026-08-20) ########################
--   (c) danışan B'nin KENDİ özetini POZİTİF olarak ölçerken eskiden BUGÜN için
--   mutlak `1200` bekliyordu. Bu, B'nin DIŞARIDAKİ (gerçek/manuel kullanım
--   kaynaklı) `activity_sessions` satırı OLMADIĞINI varsayıyordu — senaryo
--   141'deki AYNI hata (bkz. o senaryonun başındaki not). Yerel yığında B için
--   BUGÜNE ait canlı süre varsa (ölçüldü: bu düzeltme sırasında +14 sn) mutlak
--   `1200` iddiası patlar. Düzeltme: fonksiyonun AYNI toplama mantığıyla
--   (session süresi, `start_day` kovası) B'nin bu senaryonun kendi INSERT'ini
--   yapmadan ÖNCEKİ "bugün" toplamı `postgres` bağlamıyla ölçülüp
--   `set_config`e taşınır; (c)'deki iddia sabit `1200` yerine
--   `baseline + 1200` ile karşılaştırır. Ölçülen garanti DEĞİŞMEZ (RPC'nin
--   döndürdüğü toplam, ham tablodaki GERÇEK toplamla eşleşmeli); yalnızca
--   dışarıdaki satır sayısından bağımsız hale getirilir.
do $$
declare
  v_baseline integer;
begin
  select coalesce(sum(greatest(0, round(extract(epoch from (s.last_seen_at - s.started_at))))), 0)::integer
    into v_baseline
    from public.activity_sessions s
   where s.user_id = '33333333-3333-3333-3333-333333333333'::uuid
     and (s.started_at at time zone 'Europe/Istanbul')::date = (now() at time zone 'Europe/Istanbul')::date;
  perform set_config('zz.s144_b_baseline_secs', v_baseline::text, true);
end $$;
-- ###############################################################################

-- Kurulum: danışan A'nın rızası VAR.
set local role service_role;
do $$
begin
  perform public.grant_activity_consent('22222222-2222-2222-2222-222222222222'::uuid, 1);
end $$;
reset role;

-- BİLİNEN gün toplamları. Zaman damgaları YEREL GÜNE (Europe/Istanbul) çapa
-- atılır — düz `now() - interval` kullanılsaydı test gece yarısı penceresinde
-- bir gün kayar ve KENDİ ölçtüğü hatayı ÜRETİRDİ.
--   * BUGÜN      : 1800 sn oturum + login x1 + tab_view x2
--   * DÜN        :  600 sn oturum + message_sent x1
--   * 60 GÜN ÖNCE:  300 sn oturum  -> 30 günlük varsayılan pencerenin DIŞINDA
--   * danışan B'nin BUGÜNKÜ oturumu (1200 sn) -> A'nın özetine SIZMAMALI
with d as (select (now() at time zone 'Europe/Istanbul')::date as today)
insert into public.activity_sessions (id, user_id, started_at, last_seen_at, platform)
select x.id, x.uid, x.s, x.e, x.p from d,
  lateral (values
    ('d0000000-0000-0000-0000-000000000144'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
     (d.today + time '09:00') at time zone 'Europe/Istanbul',
     (d.today + time '09:30') at time zone 'Europe/Istanbul', 'web'),
    ('d0000000-0000-0000-0000-000000000244'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
     ((d.today - 1) + time '22:00') at time zone 'Europe/Istanbul',
     ((d.today - 1) + time '22:10') at time zone 'Europe/Istanbul', 'web'),
    ('d0000000-0000-0000-0000-000000000344'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
     ((d.today - 60) + time '10:00') at time zone 'Europe/Istanbul',
     ((d.today - 60) + time '10:05') at time zone 'Europe/Istanbul', 'web'),
    ('d0000000-0000-0000-0000-000000000444'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
     (d.today + time '11:00') at time zone 'Europe/Istanbul',
     (d.today + time '11:20') at time zone 'Europe/Istanbul', 'mobile')
  ) as x(id, uid, s, e, p);

with d as (select (now() at time zone 'Europe/Istanbul')::date as today)
insert into public.activity_events (user_id, session_id, event, occurred_at)
select x.uid, x.sid, x.ev, x.oat from d,
  lateral (values
    ('22222222-2222-2222-2222-222222222222'::uuid, 'd0000000-0000-0000-0000-000000000144'::uuid,
     'login',        (d.today + time '09:00') at time zone 'Europe/Istanbul'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'd0000000-0000-0000-0000-000000000144'::uuid,
     'tab_view',     (d.today + time '09:10') at time zone 'Europe/Istanbul'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'd0000000-0000-0000-0000-000000000144'::uuid,
     'tab_view',     (d.today + time '09:20') at time zone 'Europe/Istanbul'),
    ('22222222-2222-2222-2222-222222222222'::uuid, 'd0000000-0000-0000-0000-000000000244'::uuid,
     'message_sent', ((d.today - 1) + time '22:05') at time zone 'Europe/Istanbul'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'd0000000-0000-0000-0000-000000000444'::uuid,
     'login',        (d.today + time '11:00') at time zone 'Europe/Istanbul')
  ) as x(uid, sid, ev, oat);

-- --- (a1) KATALOG: SECURITY INVOKER + pinli search_path + yetki yüzeyi ------
do $$
declare
  c_sig    constant text := 'public.coach_activity_summary(uuid, integer)';
  v_secdef boolean;
  v_config text[];
  v_result text;
begin
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p where p.oid = c_sig::regprocedure;
  if v_secdef is null then
    raise exception 'BASARISIZ [144a1]: % YOK.', c_sig;
  end if;
  if v_secdef then
    raise exception 'BASARISIZ [144a1]: % SECURITY DEFINER (prosecdef=true) -- aal2 kapisi ATLANIR, aal1 koc tum danisanlarin davranis ozetini okur (ADR-0026).', c_sig;
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [144a1]: % arama yolu pinlenmemis (%).', c_sig, v_config;
  end if;
  if not has_function_privilege('authenticated', c_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [144a1]: authenticated % yi calistiramiyor.', c_sig;
  end if;
  if has_function_privilege('anon', c_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [144a1]: % ANON a acik.', c_sig;
  end if;
  if has_function_privilege('service_role', c_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [144a1]: % service_role a acik -- INVOKER fonksiyon RLS siz bir rolle calistirilabilir.', c_sig;
  end if;

  -- *** SÖZLEŞMENİN ASIL MADDESİ *** — dönüş kümesinde HAM ZAMAN DAMGASI YOK.
  v_result := pg_get_function_result(c_sig::regprocedure);
  if v_result is distinct from 'TABLE(day date, total_seconds integer, event_counts jsonb)' then
    raise exception 'BASARISIZ [144a1]: % donus sozlesmesi -> %. Beklenen: TABLE(day date, total_seconds integer, event_counts jsonb). (started_at/last_seen_at/occurred_at donduren bir kolon eklenmis ya da day kolonu timestamptz olmus olabilir.)', c_sig, v_result;
  end if;
  raise notice 'GECTI [144a1 coach_activity_summary SECURITY INVOKER, search_path pinli, EXECUTE yalnizca authenticated, donus kumesinde ham zaman damgasi YOK]';
end $$;

-- --- (a2) DAVRANIŞ: aal1 koç (ve `aal` claim'i OLMAYAN koç) HİÇBİR ŞEY görmez
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 90);
  if v_rows <> 0 then
    raise exception 'BASARISIZ [144a2 aal1]: aal1 koc % gun satiri GORDU -- ikinci faktor olmadan davranis ozeti okunabiliyor', v_rows;
  end if;
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 90);
  if v_rows <> 0 then
    raise exception 'BASARISIZ [144a2 aal claim YOK]: kapi fail-closed degil (% gun satiri)', v_rows;
  end if;
  raise notice 'GECTI [144a2 aal1 koc VE aal claim i olmayan koc gun ozetini de goremez]';
end $$;
reset role;

-- --- (b) POZİTİF KONTROL: aal2 koç DOĞRU gün toplamlarını alır --------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_today  date := (now() at time zone 'Europe/Istanbul')::date;
  v_rows   bigint;
  v_secs   integer;
  v_counts jsonb;
  v_days   date[];
begin
  -- Varsayılan pencere (30 gün): BUGÜN + DÜN görünür, 60 gün önceki GÖRÜNMEZ.
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid);
  if v_rows <> 2 then
    raise exception 'BASARISIZ [144b pencere]: varsayilan 30 gunluk pencere % satir dondu (2 bekleniyordu -- 60 gun onceki kayit sizmis ya da bir gun kaybolmus olabilir)', v_rows;
  end if;

  -- Sıralama YENİDEN ESKİYE.
  select array_agg(s.day order by s.ord) into v_days
    from (select c.day, row_number() over () as ord
            from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid) c) s;
  if v_days is distinct from array[v_today, v_today - 1] then
    raise exception 'BASARISIZ [144b sira]: gunler % (beklenen %)', v_days, array[v_today, v_today - 1];
  end if;

  -- BUGÜN: 1800 sn (danışan B'nin 1200 sn'si SIZMAMALI) + login x1 + tab_view x2.
  select c.total_seconds, c.event_counts into v_secs, v_counts
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid) c
   where c.day = v_today;
  if v_secs is distinct from 1800 then
    raise exception 'BASARISIZ [144b bugun sure]: total_seconds=% (1800 bekleniyordu -- baska danisanin oturumu sizmis olabilir)', v_secs;
  end if;
  if v_counts is distinct from '{"login": 1, "tab_view": 2}'::jsonb then
    raise exception 'BASARISIZ [144b bugun sayac]: event_counts=% (beklenen login:1, tab_view:2)', v_counts;
  end if;

  -- DÜN: 600 sn + message_sent x1.
  select c.total_seconds, c.event_counts into v_secs, v_counts
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid) c
   where c.day = v_today - 1;
  if v_secs is distinct from 600 then
    raise exception 'BASARISIZ [144b dun sure]: total_seconds=% (600 bekleniyordu)', v_secs;
  end if;
  if v_counts is distinct from '{"message_sent": 1}'::jsonb then
    raise exception 'BASARISIZ [144b dun sayac]: event_counts=%', v_counts;
  end if;

  -- 90 günlük pencere 60 gün öncekini DE getirir (pencere gerçekten p_days'e bağlı).
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 90);
  if v_rows <> 3 then
    raise exception 'BASARISIZ [144b p_days]: 90 gunluk pencere % satir dondu (3 bekleniyordu)', v_rows;
  end if;

  -- `p_days = 0` bir "tum gecmis" kisayolu DEGILDIR.
  begin
    perform * from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 0);
    raise exception 'BASARISIZ [144b p_days=0]: KABUL EDILDI';
  exception when invalid_parameter_value then
    null;
  end;

  raise notice 'GECTI [144b aal2 koc gun toplamlarini DOGRU alir: bugun 1800 sn, dun 600 sn, tur kirilimi dogru, pencere p_days e bagli]';
end $$;
reset role;

-- --- (c) DANIŞAN BAŞKASININ ÖZETİNİ ALAMAZ ----------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 90);
  if v_rows <> 0 then
    raise exception 'BASARISIZ [144c]: danisan B, danisan A nin % gun satirini GORDU -- INVOKER fonksiyon RLS i atlamis', v_rows;
  end if;
end $$;
reset role;

-- POZİTİF KONTROL: danışan KENDİ özetini alabilir (fonksiyon "herkese boş
-- dönen" bir kabuk değil; (c) gerçekten RLS'in ürünü).
set local role service_role;
do $$
begin
  perform public.grant_activity_consent('33333333-3333-3333-3333-333333333333'::uuid, 1);
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare
  v_secs     integer;
  v_baseline integer := current_setting('zz.s144_b_baseline_secs')::integer;
  v_expected integer := v_baseline + 1200;
begin
  select c.total_seconds into v_secs
    from public.coach_activity_summary('33333333-3333-3333-3333-333333333333'::uuid) c
   where c.day = (now() at time zone 'Europe/Istanbul')::date;
  -- Mutlak `1200` DEĞİL, baseline + 1200 (bkz. senaryo basindaki "CANLI VERI
  -- KIRILGANLIGI DUZELTMESI" notu -- B'nin bu senaryo DISINDA da bugune ait
  -- canli suresi olabilir).
  if v_secs is distinct from v_expected then
    raise exception 'BASARISIZ [144c POZITIF]: danisan KENDI ozetini alamadi (total_seconds=%, % bekleniyordu = baseline % + 1200)', v_secs, v_expected, v_baseline;
  end if;
  raise notice 'GECTI [144c danisan baskasinin ozetini ALAMAZ, kendi ozetini ALIR]';
end $$;
reset role;

-- --- (d) RIZA KAPALIYSA: SATIRLAR DURUYOR OLSA BİLE BOŞ KÜME, HATA YOK ------
--     Rıza damgası BURADA doğrudan çevriliyor (senaryo 140'ın kurulum deseni):
--     `revoke_activity_consent()` çağrılsaydı satırlar da SİLİNİRDİ ve test
--     "satır yok, o yüzden boş" tautolojisine düşerdi. Ölçülmek istenen şey
--     tam olarak SATIRLAR DURURKEN rıza kapısının çalışmasıdır.
update public.profiles
   set activity_consent_revoked_at = now() + interval '1 second'
 where id = '22222222-2222-2222-2222-222222222222';

do $$
begin
  if public.activity_consent_state('22222222-2222-2222-2222-222222222222') is distinct from 'revoked' then
    raise exception 'BASARISIZ [144d kurulum]: durum revoked degil -> %',
      public.activity_consent_state('22222222-2222-2222-2222-222222222222');
  end if;
  -- Satırlar GERÇEKTEN duruyor (yani (d) bir tautoloji değil).
  if (select count(*) from public.activity_events where user_id = '22222222-2222-2222-2222-222222222222') = 0 then
    raise exception 'BASARISIZ [144d kurulum]: olay satirlari silinmis -- test tautolojiye dustu';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_rows bigint;
begin
  -- HATA FIRLATMAMALI (koç durumu zaten rıza rozetinden görüyor; burada hata
  -- fırlatmak arayüzde "özet okunamadı" ile "rıza kapalı"yı ayrılmaz kılardı).
  select count(*) into v_rows
    from public.coach_activity_summary('22222222-2222-2222-2222-222222222222'::uuid, 90);
  if v_rows <> 0 then
    raise exception 'BASARISIZ [144d]: riza GERI CEKILMISKEN aal2 koc % gun satiri gordu -- riza kapisi fail-closed degil', v_rows;
  end if;
  raise notice 'GECTI [144d riza kapaliyken satirlar DURSA BILE kume BOS ve HATA YOK]';
end $$;
reset role;
rollback;


-- =============================================================================
-- KOÇ EYLEM DENETİMİ + DAVET (Faz 4.9 dilim 1) — 145) DANIŞAN DAVETİ
-- (20260820160000_coach_invite_action.sql, ADR-0027)
--
--   (a) YENİ `client_invited` NULL hedefle KABUL edilir (pozitif kontrol),
--       ESKİ `password_reset_requested` invaryantı AYNEN korunur (22023),
--       kapalı liste hâlâ KAPALIDIR (23514); `link_coach_action_target()`
--       DOLU bir hedefi ASLA yeniden yönlendirmez -- geçmiş tahrif edilemez.
--   (b) `authenticated` (koç dahil) ne `record_coach_action()`u ne de YENİ
--       `link_coach_action_target()`u çağırabilir; ikincisi ayrıca YAPISAL
--       olarak da (SECURITY DEFINER + pinli search_path + EXECUTE yalnız
--       service_role) doğrulanır -- senaryo 132'nin deseni.
--   (c) *** BU PAKETİN EN ÖNEMLİ SENARYOSU *** -- tetikleyiciyi DOĞRUDAN
--       sınar (HTTP/GoTrue'ya HİÇ gitmez; yerel GoTrue'nun 2/saat
--       `email_sent` global sınırı davetleri de sayar, gerçek davet
--       gönderilemez): `auth.users`a ELLE, saldırganın/kazanın deneyeceği TAM
--       girdiyle (`raw_user_meta_data.role = "coach"`) satır eklenir; davetle
--       doğan kullanıcı HER ZAMAN `client` olmalı (AC-02), `full_name` ise
--       metadata'dan OKUNMALI. Ardından o kullanıcı iki fazlı akışın DB
--       tarafıyla denetim satırına bağlanır.
--   (d) `role = 'coach'` satır sayısı HER ZAMAN 1 -- tek-koçluk modelinin
--       (ADR-0007) REGRESYON KAPISI; davet ucu eklendiği için ARTIK gerekli
--       (yeni kullanıcı üretmenin ilk otomatik yolu).
-- =============================================================================
begin;

-- --- (a) YENİ action DEĞERİ KABUL EDİLİYOR, ESKİ İNVARYANT KORUNUYOR --------
set local role service_role;
do $$
declare
  v_id     uuid;
  v_caught boolean;
  v_state  text;
begin
  -- (a1) POZİTİF KONTROL: client_invited NULL hedefle KABUL edilir.
  v_id := public.record_coach_action(
    'client_invited'::text,
    '11111111-1111-1111-1111-111111111111'::uuid,
    null::uuid,
    'a0000000-0000-0000-0000-000000000145'::uuid
  );
  if v_id is null then
    raise exception 'BASARISIZ [145a1]: client_invited NULL hedefle yazilamadi -- genisletilen kapali liste calismiyor';
  end if;
  -- id'yi `postgres`e tasi (service_role'un coach_actions'ta dogrudan SELECT
  -- yetkisi YOK -- senaryo 134a'daki AYNI desen).
  perform set_config('zz.coach_action_145_id', v_id::text, true);

  -- (a2) ESKİ İNVARYANT KORUNUYOR: password_reset_requested + NULL hedef -> 22023.
  v_caught := false;
  begin
    perform public.record_coach_action(
      'password_reset_requested'::text,
      '11111111-1111-1111-1111-111111111111'::uuid,
      null::uuid
    );
  exception when invalid_parameter_value then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [145a2]: password_reset_requested NULL hedefle KABUL EDILDI -- genisleme ESKI invaryanti gevsetmis';
  end if;
  if v_state is distinct from '22023' then
    raise exception 'BASARISIZ [145a2 hata kodu]: beklenen 22023, gelen %', v_state;
  end if;

  -- (a3) KAPALI LİSTE HÂLÂ KAPALI: tanimsiz action -> 23514 (SERBEST METNE donusmedi).
  v_caught := false;
  begin
    perform public.record_coach_action(
      'not_a_real_action'::text,
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid
    );
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [145a3]: tanimsiz action degeri KABUL EDILDI -- kapali liste SERBEST METNE donusmus';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [145a3 hata kodu]: beklenen 23514, gelen %', v_state;
  end if;
end $$;
reset role;

-- (a4) `postgres` bağlamıyla doğrula: yazılan satır client_invited VE hedefsiz.
do $$
declare
  v_id     uuid := current_setting('zz.coach_action_145_id')::uuid;
  v_action text;
  v_target uuid;
begin
  select action, target_id into v_action, v_target
    from public.coach_actions where id = v_id;

  if v_action is distinct from 'client_invited' then
    raise exception 'BASARISIZ [145a4]: yazilan satirin action i client_invited degil -> %', v_action;
  end if;
  if v_target is not null then
    raise exception 'BASARISIZ [145a4]: yazilan satirin target_id si NULL degil -> %', v_target;
  end if;
end $$;

-- (a5) link_coach_action_target: DOLU hedef ASLA yeniden yönlendirilemez.
set local role service_role;
do $$
declare
  v_id      uuid := current_setting('zz.coach_action_145_id')::uuid;
  v_linked1 boolean;
  v_linked2 boolean;
begin
  v_linked1 := public.link_coach_action_target(v_id, '22222222-2222-2222-2222-222222222222'::uuid);
  if v_linked1 is distinct from true then
    raise exception 'BASARISIZ [145a5]: hedefsiz client_invited satiri BAGLANAMADI -- beklenen true, gelen %', v_linked1;
  end if;

  v_linked2 := public.link_coach_action_target(v_id, '33333333-3333-3333-3333-333333333333'::uuid);
  if v_linked2 is distinct from false then
    raise exception 'BASARISIZ [145a5 yeniden yonlendirme]: DOLU hedef ikinci cagriyla DEGISTIRILEBILDI -- gecmis tahrif edilebilir, beklenen false, gelen %', v_linked2;
  end if;
end $$;
reset role;

-- (a5 doğrulama) `postgres` bağlamıyla satırı oku: target_id danışan A'da KALDI.
do $$
declare
  v_id     uuid := current_setting('zz.coach_action_145_id')::uuid;
  v_target uuid;
begin
  select target_id into v_target from public.coach_actions where id = v_id;
  if v_target is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [145a5 dogrulama]: target_id beklenen danisan A degil, gelen % -- gecmis tahrif edilmis', v_target;
  end if;
  raise notice 'GECTI [145a client_invited NULL hedefle KABUL edilir; eski invaryant (22023) VE kapali liste (23514) KORUNUYOR; link_coach_action_target DOLU hedefi yeniden yonlendiremiyor]';
end $$;


-- --- (b) `authenticated` YENİ FONKSİYONU DA ÇAĞIRAMAZ -----------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean;
begin
  -- (b1) record_coach_action: client_invited de dahil, hala CAGRILAMAZ --
  -- genisletilen kapali liste yeni bir cagri yolu ACMADI.
  v_caught := false;
  begin
    perform public.record_coach_action(
      'client_invited'::text,
      '11111111-1111-1111-1111-111111111111'::uuid,
      null::uuid
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [145b1]: aal2 koc client_invited ile record_coach_action i CAGIRABILDI -- genisletilen kapali liste yeni bir cagri yolu ACTI';
  end if;

  -- (b2) link_coach_action_target: koç kendi izini baska birine YONLENDIREMEZ.
  v_caught := false;
  begin
    perform public.link_coach_action_target(
      'a0000000-0000-0000-0000-000000000145'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid
    );
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [145b2]: aal2 koc link_coach_action_target i CAGIRABILDI -- kendi izini baska birine yonlendirebilirdi';
  end if;

  raise notice 'GECTI [145b authenticated (koc dahil) ne record_coach_action(client_invited) ne de link_coach_action_target i cagirabiliyor]';
end $$;
reset role;

-- (b devam) YAPISAL SÜRÜKLENME TESTİ — link_coach_action_target (senaryo 132 deseni).
do $$
declare
  v_secdef boolean;
  v_config text[];
  v_sig    constant text := 'public.link_coach_action_target(uuid, uuid)';
begin
  select p.prosecdef, p.proconfig into v_secdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'link_coach_action_target';

  if v_secdef is null then
    raise exception 'BASARISIZ [145b YAPI]: public.link_coach_action_target YOK -- davet ucu PGRST202 alir';
  end if;
  if not v_secdef then
    raise exception 'BASARISIZ [145b YAPI SECURITY]: SECURITY INVOKER olmus -- coach_actions sifir-politikali, guncelleme OLMEZ';
  end if;
  if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
    raise exception 'BASARISIZ [145b YAPI search_path]: arama yolu pinlenmemis (%)', v_config;
  end if;

  if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [145b YAPI grant]: AUTHENTICATED rolune ACIK -- koc kendi izini yeniden yonlendirebilir';
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [145b YAPI grant]: ANON rolune ACIK';
  end if;
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    raise exception 'BASARISIZ [145b YAPI grant]: service_role CALISTIRAMIYOR -- davet ucunun 2. fazi kirilir';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace,
           lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where n.nspname = 'public' and p.proname = 'link_coach_action_target'
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'BASARISIZ [145b YAPI grant]: link_coach_action_target PUBLIC a ACIK';
  end if;

  raise notice 'GECTI [145b YAPI link_coach_action_target SECURITY DEFINER + pinli search_path + EXECUTE yalnizca service_role]';
end $$;


-- --- (c) DAVETLE DOĞAN KULLANICININ ROLÜ HER ZAMAN client (AC-02) -----------
--     *** BU PAKETİN EN ÖNEMLİ SENARYOSU ***
--
-- `admin.inviteUserByEmail` GoTrue'ya gerçekten gitmez -- yerel GoTrue nun
-- `email_sent = 2/saat` GLOBAL siniri davetleri de saydigi icin gercek bir
-- davet burada gonderilemez (ADR-0027 §Bedeller). Bu yuzden tetikleyici
-- (`on_auth_user_created` -> `handle_new_user()`) DOGRUDAN sinanir: `postgres`
-- kimligiyle `auth.users`a ELLE, saldirganin/kazanin deneyecegi TAM girdiyle
-- -- `raw_user_meta_data` icinde BILEREK `{"full_name":"Davet Edilen",
-- "role":"coach"}` -- bir satir eklenir. Kolon kumesi senaryo 70/143 ile
-- AYNIDIR (bu dosyada zaten OLCULMUS desen; ayrica `information_schema.
-- columns` sorgusuyla dogrulandi: auth.users da varsayilansiz NOT NULL tek
-- kolon `id`dir, ancak GoTrue'nun gercekte doldurdugu kolon kumesini
-- yansitmak icin seed.sql / senaryo 70 ile AYNI 15 kolon kullanilir).
--
-- Blok en sonda ROLLBACK ile bitecek -- bu auth.users satiri KALICI OLMAYACAK.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd0000000-0000-0000-0000-000000000145',
  'authenticated',
  'authenticated',
  'davet-145@example.test',
  'x',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Davet Edilen","role":"coach"}'::jsonb,
  now(), now(), '', '', '', ''
);

do $$
declare
  v_role public.user_role;
  v_name text;
begin
  select role, full_name into v_role, v_name
    from public.profiles where id = 'd0000000-0000-0000-0000-000000000145';

  if v_role is null then
    raise exception 'BASARISIZ [145c kurulum]: handle_new_user profil olusturmadi (tetikleyici bagli mi?)';
  end if;
  if v_role is distinct from 'client'::public.user_role then
    raise exception 'BASARISIZ [145c AC-02 yetki yukseltme]: metadata role=coach YAZMASINA RAGMEN profil % oldu -- davet ucu yetki yukseltme yoluna donusmus', v_role;
  end if;
  if v_name is distinct from 'Davet Edilen' then
    raise exception 'BASARISIZ [145c full_name]: metadata nin SADECE bu alani okunmali, gelen %', v_name;
  end if;
  raise notice 'GECTI [145c davetle dogan kullanici role=coach metadata sine RAGMEN HER ZAMAN client (AC-02); full_name metadata dan okunuyor]';
end $$;

-- Uçtan uca: davetle doğan kullanıcıyı iki fazlı akışın DB tarafıyla denetim
-- satırına bağla (adım 8 + adım 10, invite-client/route.ts).
set local role service_role;
do $$
declare
  v_audit_id uuid;
  v_linked   boolean;
begin
  v_audit_id := public.record_coach_action(
    'client_invited'::text,
    '11111111-1111-1111-1111-111111111111'::uuid,
    null::uuid,
    'a1000000-0000-0000-0000-000000000145'::uuid
  );
  if v_audit_id is null then
    raise exception 'BASARISIZ [145c ucdan uca]: client_invited denetim satiri yazilamadi';
  end if;

  v_linked := public.link_coach_action_target(v_audit_id, 'd0000000-0000-0000-0000-000000000145'::uuid);
  if v_linked is distinct from true then
    raise exception 'BASARISIZ [145c ucdan uca]: davetle dogan kullanici denetim satirina BAGLANAMADI -- beklenen true, gelen %', v_linked;
  end if;

  raise notice 'GECTI [145c ucdan uca iki fazli davet akisinin DB tarafi calisiyor: kayit (adim 8) + baglama (adim 10)]';
end $$;
reset role;


-- --- (d) role='coach' SATIR SAYISI = 1 -- REGRESYON KAPISI ------------------
--
-- PROGRESS'te kayitli oneri, B-058'in tetigini otomatik yakalar. Bu senaryo,
-- yukaridaki (c)'nin DOGRUDAN devamidir: (c) davetle dogan kullanicinin ASLA
-- coach OLMADIGINI kanitlar, (d) ise DAHA GENIS bir invaryanti -- sistemde HER
-- ZAMAN TEK bir koc oldugunu -- olcer. Davet ucu eklenmeden ONCE bu satir
-- sayisi degismiyordu (yeni kullanici uretmenin hicbir OTOMATIK yolu yoktu);
-- artik `invite-client` route'u SERVICE_ROLE ile calisan bir kullanici
-- fabrikasi oldugu icin bu kapı ARTIK GEREKLIDIR.
--
-- Bu sayi 1 den FARKLILASIRSA (ister bu migration'in bir hatasindan, ister
-- ELLE `profiles.role` guncellemesinden, ister ileride "ikinci koc" ozelligi
-- eklenip bu testin GUNCELLENMEDEN birakilmasindan kaynaklansin):
--   * `is_coach()` SECURITY DEFINER'dir ve TUM RLS politikalarinin (14+
--     tablo, `mfa_aal2_gate` dahil) "coach mu" sorusunu YANITLAR -- ikinci bir
--     koc, o politikalarin TUMUNDE ayni yetkiyi ELE GECIRIR.
--   * B-058 kayitlidir: koc-danisan ATAMA tablosu YOKTUR. Yani ikinci bir koc,
--     `invite-client` ucundaki `profiles_select` politikasi altinda ZATEN TUM
--     danisan tabanini gorur ve TUMUNU davet/yonetim yetkisine sahip olur --
--     tek-kocluk modeli (ADR-0007) varsayimi sessizce KIRILMIS olur.
do $$
declare
  v_coach_count bigint;
begin
  select count(*) into v_coach_count
    from public.profiles where role = 'coach'::public.user_role;

  if v_coach_count <> 1 then
    raise exception 'BASARISIZ [145d REGRESYON]: role=coach satir sayisi % (1 bekleniyordu) -- tek-kocluk model (ADR-0007) varsayimi KIRILMIS; is_coach() tabanli TUM RLS politikalari ve mfa_aal2_gate ikinci bir koc icin de acilir, ayrica invite-client ucu B-058 (koc-danisan atama tablosu yok) nedeniyle o koca da TUM danisan tabanini gorme/davet etme yetkisi verir', v_coach_count;
  end if;
  raise notice 'GECTI [145d role=coach satir sayisi = 1 -- tek-kocluk model (ADR-0007) REGRESYON KAPISI ayakta]';
end $$;

rollback;


-- =============================================================================
-- KUNYE — 146) POZITIF + NEGATIF: DANISAN KENDI KUNYESINI YAZAR, BASKASININKINI
-- YAZAMAZ (20260820170000_profile_body_metrics.sql, profiles_guard_body_metrics)
--   (a) POZITIF: Danisan A kendi satirinin birth_date/height_cm alanlarini
--       gunceller -> 1 satir etkilenir VE deger GERCEKTEN DB den geri okunur
--       (yazdigini geri okumadan test tautoloji olurdu).
--   (b) NEGATIF: AYNI danisan A, danisan B nin birth_date/height_cm alanlarini
--       guncellemeye calisir. Bu satir zaten profiles_select/profiles_update_self
--       tarafindan GORUNMEZ/GUNCELLENMEZ kilinir (RLS satir seviyesinde USING
--       auth.uid()=id ile satiri tarama asamasinda eler, kolon kapisi tetikleyicisi
--       o zaman hic devreye girmez) -- yani sonuc "0 satir etkilendi" VEYA
--       "42501" olabilir; HANGISI oldugu raise notice ile kayda gecer. Ardindan
--       danisan B nin satirinin GERCEKTEN degismedigi (birth_date is null) ayrica
--       dogrulanir.
-- =============================================================================
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_rows   int;
  v_bd     date;
  v_h      numeric;
  v_caught boolean := false;
  v_state  text;
begin
  -- (a) POZITIF
  update public.profiles
     set birth_date = date '1988-04-12', height_cm = 165.5
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BASARISIZ [146a satir sayisi]: beklenen 1, gelen %', v_rows;
  end if;

  select birth_date, height_cm into v_bd, v_h
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if v_bd is distinct from date '1988-04-12' or v_h is distinct from 165.5 then
    raise exception 'BASARISIZ [146a geri okuma]: yazilan deger DB den FARKLI donuyor -> %, %', v_bd, v_h;
  end if;
  raise notice 'GECTI [146a Danisan A kendi kunyesini yazdi ve GERCEKTEN geri okundu (1 satir)]';

  -- (b) NEGATIF: baskasinin (B) kunyesi
  begin
    update public.profiles
       set birth_date = date '2000-01-01', height_cm = 190
     where id = '33333333-3333-3333-3333-333333333333';
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if v_caught then
    if v_state is distinct from '42501' then
      raise exception 'BASARISIZ [146b hata kodu]: beklenen 42501, gelen %', v_state;
    end if;
    raise notice 'GECTI [146b Danisan A baskasinin (B) kunyesini yazamadi -- sonuc: 42501 (kolon kapisi tetiklendi)]';
  else
    if v_rows <> 0 then
      raise exception 'BASARISIZ [146b]: Danisan A baskasinin (B) kunyesini YAZABILDI -- % satir etkilendi', v_rows;
    end if;
    raise notice 'GECTI [146b Danisan A baskasinin (B) kunyesini yazamadi -- sonuc: 0 satir etkilendi (RLS satiri taramada eledi)]';
  end if;

  select birth_date into v_bd from public.profiles
   where id = '33333333-3333-3333-3333-333333333333';
  if v_bd is not null then
    raise exception 'BASARISIZ [146b dogrulama]: danisan B nin birth_date i DEGISMIS -> %', v_bd;
  end if;
  raise notice 'GECTI [146b dogrulama Danisan B nin kunyesi GERCEKTEN degismedi (birth_date is null)]';
end $$;

rollback;


-- =============================================================================
-- KUNYE — 147) KOC KUNYE YAZAMAZ (BU PAKETIN EN ONEMLI SENARYOSU)
-- (20260820170000_profile_body_metrics.sql, profiles_guard_body_metrics)
--
-- Migration'in kendi ONCUL OLCUMU (dosyanin SS2 basligindaki "KARAR: POLITIKA
-- YETMEZ" notu) canli DB de koc'un `profiles_update_coach` politikasi
-- araciligiyla BASKASININ profilini (o an full_name uzerinden) yazabildigini
-- gostermisti. Bu senaryo, kolon kapisinin GERCEKTEN kapandigini VE kapinin
-- GEREGINDEN GENIS OLMADIGINI (full_name hala yazilabiliyor, koc kendi
-- kunyesini yazabiliyor) birlikte olcer.
--   (a) Koc, danisan A nin height_cm ini yazmaya calisir -> 42501
--   (b) Koc, danisan A nin birth_date ini yazmaya calisir -> 42501
--   (c) POZITIF KONTROL: ayni aal2 koc, danisan A nin full_name ini HALA
--       guncelleyebilir (1 satir) -- kapi profiles UPDATE ini TUMDEN
--       KAPATMADI, yalnizca iki kolonu sabitledi.
--   (d) POZITIF KONTROL: aal2 koc KENDI satirinin (11111111-...) birth_date/
--       height_cm ini gunceller -> basarili, deger geri okunur. Kural
--       "DANISAN doldurur" degil "SAHIBI doldurur"dur -- koc da kendi
--       verisinin sahibidir.
--   (e) Kurulumdaki kunyenin (height_cm=180) DEGISMEDIGI dogrulanir.
--
-- aal2 SART: aal claim'i olmadan/aal1 ile mfa_aal2_gate zaten koca profiles
-- uzerinde hicbir yazma/okuma vermez -- bu durumda senaryo YANLIS NEDENLE
-- geçerdi (kolon kapisi degil, aal2 kapisi kapatmis olurdu).
-- =============================================================================
begin;

-- KURULUM (postgres, rol taklidinden ONCE): danisan A nin satirina bilinen
-- bir kunye yaz. Kurulum ile iddia bilincli olarak AYRIDIR.
update public.profiles
   set birth_date = date '1992-06-15', height_cm = 180
 where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_caught boolean;
  v_state  text;
  v_rows   int;
  v_bd     date;
  v_h      numeric;
begin
  -- (a)
  v_caught := false;
  begin
    update public.profiles set height_cm = 999
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [147a]: KOC danisan A nin height_cm ini YAZABILDI -- kolon kapisi calismiyor';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [147a hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [147a Koc danisan A nin height_cm ini YAZAMADI (42501)]';

  -- (b)
  v_caught := false;
  begin
    update public.profiles set birth_date = date '2020-01-01'
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [147b]: KOC danisan A nin birth_date ini YAZABILDI -- kolon kapisi calismiyor';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [147b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [147b Koc danisan A nin birth_date ini YAZAMADI (42501)]';

  -- (c) POZITIF KONTROL: kapi geregeinden genis degil
  update public.profiles set full_name = 'Ahmet Yilmaz (koc yazdi)'
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BASARISIZ [147c]: Koc danisan A nin full_name ini GUNCELLEYEMEDI -- kapi geregeinden genis, profiles UPDATE ini tumden kapatmis';
  end if;
  raise notice 'GECTI [147c POZITIF Koc danisan A nin full_name ini HALA guncelleyebiliyor (1 satir) -- kapi yalnizca iki kolonu sabitliyor]';

  -- (d) POZITIF KONTROL: koc kendi kunyesini yazabilir
  update public.profiles
     set birth_date = date '1985-11-20', height_cm = 177.0
   where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'BASARISIZ [147d]: Koc KENDI kunyesini yazamadi -- % satir', v_rows;
  end if;

  select birth_date, height_cm into v_bd, v_h
    from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  if v_bd is distinct from date '1985-11-20' or v_h is distinct from 177.0 then
    raise exception 'BASARISIZ [147d geri okuma]: koc kendi kunyesini yazdi ama DB den FARKLI donuyor -> %, %', v_bd, v_h;
  end if;
  raise notice 'GECTI [147d POZITIF Koc KENDI kunyesini yazabiliyor ve geri okunuyor -- kural SAHIBI doldurur, DANISAN doldurur degil]';

  -- (e) kurulumdaki kunye DEGISMEDI (coach hala okuyabiliyor: aal2 + profiles_select)
  select height_cm into v_h from public.profiles
   where id = '22222222-2222-2222-2222-222222222222';
  if v_h is distinct from 180 then
    raise exception 'BASARISIZ [147e]: danisan A nin kurulumdaki height_cm degeri DEGISMIS -> % (beklenen 180)', v_h;
  end if;
  raise notice 'GECTI [147e Danisan A nin kurulum kunyesi (height_cm=180) DEGISMEDI]';
end $$;

rollback;


-- =============================================================================
-- KUNYE — 148) CHECK KISITLARI GERCEKTEN REDDEDIYOR (profiles_birth_date_chk /
-- profiles_height_cm_chk, 20260820170000_profile_body_metrics.sql)
-- Danisan A kimligiyle (kolon kapisi zaten acik, cunku A KENDI satirini
-- yaziyor -- burada sinanan CHECK kisitidir, kolon kapisi degil), KENDI
-- satirinda:
--   (a) gelecek tarihli dogum tarihi (current_date + 1)          -> 23514
--   (b) 1900 oncesi dogum tarihi (1899-12-31)                    -> 23514
--   (c) birim hatasi boy 1.75 (metre girilmis)                   -> 23514
--   (d) absurt boy 1750 (mm girilmis)                             -> 23514
--   (e) iki ondalikli boy 175.25                                  -> 23514
--   (f) POZITIF KONTROL: makul degerler (1995-03-14, 178.5) GECER ve geri
--       okunur -- bu dal olmadan kisit "her seyi reddet" sabiti olabilirdi.
--   (g) NULL POZITIF KONTROL: ikisi de null yazilabilir -- kunye ZORUNLU
--       DEGIL.
-- =============================================================================
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare
  v_caught boolean;
  v_state  text;
  v_bd     date;
  v_h      numeric;
begin
  -- (a) gelecek tarih
  v_caught := false;
  begin
    update public.profiles set birth_date = current_date + 1
     where id = '22222222-2222-2222-2222-222222222222';
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [148a]: GELECEK tarihli dogum tarihi KABUL EDILDI';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [148a kod]: beklenen 23514, gelen %', v_state;
  end if;

  -- (b) 1900 oncesi
  v_caught := false;
  begin
    update public.profiles set birth_date = date '1899-12-31'
     where id = '22222222-2222-2222-2222-222222222222';
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [148b]: 1900 ONCESI dogum tarihi KABUL EDILDI';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [148b kod]: beklenen 23514, gelen %', v_state;
  end if;

  -- (c) birim hatasi: metre
  v_caught := false;
  begin
    update public.profiles set height_cm = 1.75
     where id = '22222222-2222-2222-2222-222222222222';
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [148c]: BIRIM HATASI (1.75 m) KABUL EDILDI -- Mifflin-St Jeor sacmalardi';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [148c kod]: beklenen 23514, gelen %', v_state;
  end if;

  -- (d) absurt: milimetre
  v_caught := false;
  begin
    update public.profiles set height_cm = 1750
     where id = '22222222-2222-2222-2222-222222222222';
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [148d]: ABSURT boy (1750 mm) KABUL EDILDI';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [148d kod]: beklenen 23514, gelen %', v_state;
  end if;

  -- (e) iki ondalik
  v_caught := false;
  begin
    update public.profiles set height_cm = 175.25
     where id = '22222222-2222-2222-2222-222222222222';
  exception when check_violation then
    v_caught := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [148e]: IKI ONDALIKLI boy (175.25) KABUL EDILDI';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [148e kod]: beklenen 23514, gelen %', v_state;
  end if;

  raise notice 'GECTI [148a-e CHECK kisitlari gelecek/1900-oncesi/birim-hatasi(m)/absurt(mm)/iki-ondalikli boyu REDDETTI (23514)]';

  -- (f) POZITIF KONTROL: makul degerler gecer
  update public.profiles
     set birth_date = date '1995-03-14', height_cm = 178.5
   where id = '22222222-2222-2222-2222-222222222222';
  select birth_date, height_cm into v_bd, v_h
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if v_bd is distinct from date '1995-03-14' or v_h is distinct from 178.5 then
    raise exception 'BASARISIZ [148f POZITIF]: makul kunye yazilamadi -> %, %', v_bd, v_h;
  end if;
  raise notice 'GECTI [148f POZITIF makul degerler (1995-03-14, 178.5) GECTI ve geri okundu -- kisit "her seyi reddet" sabiti degil]';

  -- (g) NULL POZITIF KONTROL
  update public.profiles
     set birth_date = null, height_cm = null
   where id = '22222222-2222-2222-2222-222222222222';
  select birth_date, height_cm into v_bd, v_h
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if v_bd is not null or v_h is not null then
    raise exception 'BASARISIZ [148g NULL POZITIF]: null yazilamadi -> %, %', v_bd, v_h;
  end if;
  raise notice 'GECTI [148g NULL POZITIF kunye ZORUNLU DEGIL -- ikisi de null yazilabiliyor]';
end $$;

rollback;


-- =============================================================================
-- HESAP AKTIF/PASIF — 149) PASIF DANISAN 17 TABLOYU OKUYAMAZ, YALNIZCA KENDI
-- profiles SATIRINI OKUR (20260820180000_account_active_state.sql,
-- account_active_gate + is_active_user + KRITIK profiles istisnasi)
-- (İmza Dilimi'nde 15 -> 17: workout_sessions, mesocycles kapiya eklendi)
--   (a) KURULUM/BOS-GECME KONTROLU: AKTIF danisan A kendi + kocu gorur (>=2
--       profil) ve daily_logs'ta verisi var (>0) -- pasif olcumu anlamli olsun.
--   (b) A pasiflestirilir (postgres, RLS bypass).
--   (c) PASIF A: account_active_gate ile 15 tablonun HICBIRINI goremez (0), ama
--       KENDI profiles satirini (id=auth.uid()) HALA okur -- pasif ekran icin
--       KRITIK istisna. profiles=1 (yalnizca kendi satiri; kocu ARTIK gormez).
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
declare v_prof int; v_daily int;
begin
  select count(*) into v_prof  from public.profiles;
  select count(*) into v_daily from public.daily_logs;
  if v_prof < 2 then
    raise exception 'BASARISIZ [149 kurulum]: AKTIF A profiles=% (>=2 bekleniyor) -- pasif olcumu anlamsiz olurdu', v_prof;
  end if;
  if v_daily = 0 then
    raise exception 'BASARISIZ [149 kurulum]: AKTIF A daily_logs=0 -- BOS GECME, pasif olcumu anlamsiz';
  end if;
  raise notice 'GECTI [149 kurulum AKTIF A profiles=% daily_logs=% -- olcum anlamli]', v_prof, v_daily;
end $$;
reset role;

-- A yi pasiflestir (postgres RLS bypass; ROLLBACK ile geri alinacak).
update public.profiles set is_active = false where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
declare
  -- 18 kapili tablonun profiles DISINDAKI 17'si.
  v_tables text[] := array[
    'notifications', 'messages', 'form_checks', 'daily_logs', 'workout_logs',
    'nutrition_logs', 'program_approvals', 'workout_plans', 'workout_plan_exercises',
    'nutrition_plans', 'nutrition_plan_meals', 'progress_entries', 'progress_photos',
    'activity_sessions', 'activity_events',
    -- İmza Dilimi (20260821120000_bb_signature_slice.sql):
    'workout_sessions', 'mesocycles'
  ];
  v_table text;
  v_n     bigint;
  v_seen  int := 0;
  v_prof  int;
begin
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I', v_table) into v_n;
    if v_n <> 0 then
      raise exception 'BASARISIZ [149]: PASIF A public.% tablosunda % satir GORDU -- account_active_gate bu tabloda YOK/PERMISSIVE', v_table, v_n;
    end if;
    v_seen := v_seen + 1;
  end loop;
  if v_seen <> 17 then
    raise exception 'BASARISIZ [149]: 17 tablo beklenirken % olculdu.', v_seen;
  end if;

  -- KRITIK ISTISNA: kendi profiles satirini OKUYABILMELI (pasif ekran).
  select count(*) into v_prof from public.profiles;
  if v_prof <> 1 then
    raise exception 'BASARISIZ [149]: PASIF A profiles=% (1 -- yalnizca KENDI satiri -- bekleniyor). 0 ise pasif ekran cizilemez; >1 ise istisna cok genis.', v_prof;
  end if;
  perform 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if not found then
    raise exception 'BASARISIZ [149]: PASIF A KENDI profil satirini OKUYAMADI -- pasif ekran (is_active/full_name) cizilemez';
  end if;

  raise notice 'GECTI [149 PASIF A 17 tablonun HICBIRINI goremez; yalnizca KENDI profiles satirini okur (istisna dogru)]';
end $$;
rollback;


-- =============================================================================
-- HESAP AKTIF/PASIF — 150) PASIF DANISAN HICBIR TABLOYA YAZAMAZ + KENDI
-- is_active'ini TRUE'YA CEKEMEZ (guard)
--   (a) PASIF A daily_logs / progress_entries'e INSERT edemez (42501,
--       account_active_gate with_check false).
--   (b) *** KRITIK *** PASIF A kendi is_active'ini true YAPAMAZ: kendini yeniden
--       aktiflestiremez -- profiles_guard_server_columns is_active kapisi (42501).
--       Boylece pasiflik yalnizca kocun set_client_active_state RPC'siyle
--       kaldirilabilir.
-- =============================================================================
begin;
update public.profiles set is_active = false where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
declare v_caught boolean; v_state text;
begin
  -- (a) daily_logs INSERT reddedilmeli
  v_caught := false;
  begin
    insert into public.daily_logs (client_id, log_date, water_lt)
    values ('22222222-2222-2222-2222-222222222222', current_date - 600, 2.5);
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [150a daily_logs]: PASIF A daily_logs a YAZABILDI';
  end if;

  -- progress_entries INSERT reddedilmeli
  v_caught := false;
  begin
    insert into public.progress_entries (client_id, entry_date, weight_kg)
    values ('22222222-2222-2222-2222-222222222222', current_date - 600, 80);
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [150a progress_entries]: PASIF A progress_entries e YAZABILDI';
  end if;
  raise notice 'GECTI [150a PASIF A hicbir tabloya yazamaz (42501)]';

  -- (b) KENDI is_active'ini true CEKEMEZ (guard)
  v_caught := false;
  begin
    update public.profiles set is_active = true
     where id = '22222222-2222-2222-2222-222222222222';
  exception when insufficient_privilege then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [150b]: PASIF A kendi is_active ini TRUE cekebildi -- kendini yeniden aktiflestirdi (guard YOK)';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [150b hata kodu]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [150b PASIF A kendi is_active ini TRUE cekemez (42501, guard) -- yalnizca koc RPC si aktiflestirir]';
end $$;
rollback;


-- =============================================================================
-- HESAP AKTIF/PASIF — 151) REGRESYON: KOC AKTIF DANISANI ETKILEMEZ, KOC
-- ETKILENMEZ + role='coach' SAYISI = 1
--   (a) AKTIF danisan A (is_active default true) bugunku gibi calisir: profiles
--       >=2, en az 5 tabloda veri goruyor (bos-gecme korumasi).
--   (b) KOC (aal2, her zaman aktif) etkilenmez: profiles>=3, daily_logs>0.
--   (c) role='coach' satir sayisi = 1 -- tek-kocluk (ADR-0007): koc ASLA
--       pasiflesemez (RPC yalnizca role=client hedef alir) invaryantinin
--       dayanagi.
-- =============================================================================
begin;
-- (a) AKTIF danisan A
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_tables text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos', 'activity_sessions', 'activity_events'
  ];
  v_table text; v_n bigint; v_prof int; v_nonzero int := 0;
begin
  select count(*) into v_prof from public.profiles;
  if v_prof < 2 then
    raise exception 'BASARISIZ [151a]: AKTIF A profiles=% (>=2 bekleniyor) -- account_active_gate aktif danisani ETKILIYOR', v_prof;
  end if;
  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I', v_table) into v_n;
    if v_n > 0 then v_nonzero := v_nonzero + 1; end if;
  end loop;
  if v_nonzero < 5 then
    raise exception 'BASARISIZ [151a bos gecme]: AKTIF A yalnizca % tabloda veri gordu -- gate aktif danisani da kilitlemis olabilir', v_nonzero;
  end if;
  raise notice 'GECTI [151a AKTIF danisan A etkilenmiyor: profiles=%, % tabloda veri]', v_prof, v_nonzero;
end $$;
reset role;

-- (b) KOC (aal2)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_prof int; v_daily int;
begin
  select count(*) into v_prof  from public.profiles;
  select count(*) into v_daily from public.daily_logs;
  if v_prof < 3 then
    raise exception 'BASARISIZ [151b]: KOC profiles=% (>=3 bekleniyor) -- account_active_gate kocu ETKILIYOR', v_prof;
  end if;
  if v_daily = 0 then
    raise exception 'BASARISIZ [151b]: KOC daily_logs goremiyor -- gate kocu ETKILIYOR';
  end if;
  raise notice 'GECTI [151b KOC (aal2, aktif) etkilenmiyor: profiles=%, daily_logs=%]', v_prof, v_daily;
end $$;
reset role;

-- (c) role='coach' sayisi = 1
do $$
declare v_coach_count bigint;
begin
  select count(*) into v_coach_count from public.profiles where role = 'coach'::public.user_role;
  if v_coach_count <> 1 then
    raise exception 'BASARISIZ [151c]: role=coach satir sayisi % (1 bekleniyordu) -- koc pasiflesemez invaryanti (RPC role=client hedef alir) ve tek-kocluk (ADR-0007) KIRILMIS', v_coach_count;
  end if;
  raise notice 'GECTI [151c role=coach satir sayisi = 1 -- tek-kocluk REGRESYON KAPISI ayakta]';
end $$;
rollback;


-- =============================================================================
-- HESAP AKTIF/PASIF — 152) RPC YETKISI + coach_actions KAPALI LISTESI +
-- POLITIKA SURUKLENMESI
--   (a) set_client_active_state YALNIZCA service_role'de: authenticated (koc
--       aal2 dahil) CAGIRAMAZ; service_role CALISIR ve is_active i gercekten
--       degistirir (pozitif); koc/var-olmayan hedef reddedilir (42501).
--   (b) coach_actions kapali listesi client_deactivated/client_reactivated i
--       KABUL eder (record_coach_action ile, service_role); tanimsiz action
--       23514 ile reddedilir (liste hala KAPALI).
--   (c) 16/16 account_active_gate RESTRICTIVE/ALL/authenticated; profiles
--       ISTISNASI dogru (using auth.uid() TASIR, with_check TASIMAZ); sema
--       surukleme yok; is_active_user SECURITY DEFINER.
-- =============================================================================
begin;
-- (a) authenticated (koc aal2) RPC yi CAGIRAMAZ
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_caught boolean := false;
begin
  begin
    perform public.set_client_active_state('22222222-2222-2222-2222-222222222222', false, null);
  exception when insufficient_privilege then v_caught := true;
           when others then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [152a]: authenticated (koc) set_client_active_state i CAGIRABILDI -- EXECUTE service_role ile sinirli DEGIL';
  end if;
  raise notice 'GECTI [152a authenticated (koc aal2) set_client_active_state i cagiramaz]';
end $$;
reset role;

-- service_role CALISIR ve is_active i degistirir (pozitif)
set local role service_role;
select public.set_client_active_state('22222222-2222-2222-2222-222222222222', false, '00000000-0000-4000-8000-000000000152');
reset role;
do $$
declare v_active boolean; v_n int;
begin
  select is_active into v_active from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  if v_active is distinct from false then
    raise exception 'BASARISIZ [152a pozitif]: service_role RPC si is_active i false YAPMADI -> %', v_active;
  end if;
  select count(*) into v_n from public.coach_actions
   where action = 'client_deactivated' and target_id = '22222222-2222-2222-2222-222222222222';
  if v_n < 1 then
    raise exception 'BASARISIZ [152a denetim]: client_deactivated denetim satiri yazilmadi (%)', v_n;
  end if;
  raise notice 'GECTI [152a service_role RPC si is_active i degistirir ve client_deactivated denetimi yazar (denetim ONCE)]';
end $$;

-- koc/var-olmayan hedef reddedilir (42501)
set local role service_role;
do $$
declare v_caught boolean := false; v_state text;
begin
  begin
    perform public.set_client_active_state('11111111-1111-1111-1111-111111111111', false, null);
  exception when others then v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [152a koc hedef]: KOC hedefli set_client_active_state KABUL EDILDI -- koc pasiflestirilebilir';
  end if;
  if v_state is distinct from '42501' then
    raise exception 'BASARISIZ [152a koc hedef kod]: beklenen 42501, gelen %', v_state;
  end if;
  raise notice 'GECTI [152a KOC hedefli RPC reddedilir (42501) -- yalnizca role=client]';
end $$;
reset role;

-- (b) coach_actions kapali listesi yeni iki degeri KABUL, tanimsizi RED
set local role service_role;
do $$
declare v_id uuid; v_caught boolean; v_state text;
begin
  v_id := public.record_coach_action('client_deactivated'::text,
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
  if v_id is null then
    raise exception 'BASARISIZ [152b]: client_deactivated KABUL EDILMEDI -- kapali liste genislemedi';
  end if;
  v_id := public.record_coach_action('client_reactivated'::text,
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
  if v_id is null then
    raise exception 'BASARISIZ [152b]: client_reactivated KABUL EDILMEDI';
  end if;

  v_caught := false;
  begin
    perform public.record_coach_action('bogus_action'::text,
      '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
  exception when check_violation then v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [152b]: tanimsiz action KABUL EDILDI -- kapali liste SERBEST METNE donusmus';
  end if;
  if v_state is distinct from '23514' then
    raise exception 'BASARISIZ [152b kod]: beklenen 23514, gelen %', v_state;
  end if;
  raise notice 'GECTI [152b coach_actions client_deactivated/client_reactivated KABUL, tanimsiz 23514]';
end $$;
reset role;

-- (c) POLITIKA SURUKLENME + profiles ISTISNASI + is_active_user DEFINER
do $$
declare
  v_expected text[] := array[
    'profiles', 'notifications', 'messages', 'form_checks', 'daily_logs',
    'workout_logs', 'nutrition_logs', 'program_approvals', 'workout_plans',
    'workout_plan_exercises', 'nutrition_plans', 'nutrition_plan_meals',
    'progress_entries', 'progress_photos', 'activity_sessions', 'activity_events',
    -- İmza Dilimi (20260821120000_bb_signature_slice.sql) — 16 -> 18:
    'workout_sessions', 'mesocycles'
  ];
  v_ok int; v_total int; v_extra text; v_prof_using text; v_prof_check text;
begin
  -- 18 tablonun HEPSI dogru kurulmus mu?
  select count(*) into v_ok
    from pg_policies p
   where p.schemaname='public' and p.policyname='account_active_gate'
     and p.tablename = any (v_expected)
     and p.permissive='RESTRICTIVE' and p.cmd='ALL'
     and p.roles='{authenticated}'::name[]
     and p.qual like '%is_active_user%' and p.with_check like '%is_active_user%';
  if v_ok <> 18 then
    raise exception 'BASARISIZ [152c]: 18 beklenirken % dogru account_active_gate politikasi', v_ok;
  end if;

  -- Baska tabloya sizmis mi? (tam 18)
  select count(*) into v_total
    from pg_policies where schemaname='public' and policyname='account_active_gate';
  if v_total <> 18 then
    raise exception 'BASARISIZ [152c]: account_active_gate politika sayisi % (18 bekleniyordu)', v_total;
  end if;

  -- profiles ISTISNASI: using auth.uid() TASIR, with_check TASIMAZ.
  select qual, with_check into v_prof_using, v_prof_check
    from pg_policies where schemaname='public' and tablename='profiles' and policyname='account_active_gate';
  if v_prof_using not like '%uid%' then
    raise exception 'BASARISIZ [152c]: profiles account_active_gate using dali auth.uid() istisnasini TASIMIYOR -- pasif ekran cizilemez';
  end if;
  if v_prof_check like '%uid%' then
    raise exception 'BASARISIZ [152c]: profiles account_active_gate with_check dali auth.uid() TASIYOR -- pasif danisan kendi profilini YAZABILIR';
  end if;

  -- Sema surukleme: kapili 16 + bilinen muafiyetler disinda tablo?
  select string_agg(t.tablename, ', ' order by t.tablename) into v_extra
    from pg_tables t
   where t.schemaname='public'
     and t.tablename <> all (v_expected)
     and t.tablename <> all (array[
       'exercises','food_database','account_deletions',
       'message_attachment_verifications','coach_actions'
     ]);
  if v_extra is not null then
    raise exception 'BASARISIZ [152c]: account_active_gate ve muafiyet DISINDA public tablo(lar) var -> %', v_extra;
  end if;

  -- is_active_user SECURITY DEFINER (INVOKER a cevrilirse profiles politikasi
  -- kendi kendini tetikler).
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='is_active_user' and p.prosecdef
  ) then
    raise exception 'BASARISIZ [152c]: public.is_active_user() SECURITY DEFINER degil';
  end if;

  raise notice 'GECTI [152c 18/18 account_active_gate RESTRICTIVE+ALL+authenticated, profiles istisnasi dogru, surukleme yok, is_active_user DEFINER]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 153) DANISAN KENDI workout_sessions'INI GORUR/YAZAR; BASKA
-- DANISAN GOREMEZ (20260821120000_bb_signature_slice.sql, workout_sessions RLS)
--   (a) KURULUM (postgres): A'ya ait bir oturum uretilir (sabit id).
--   (b) A: kendi oturumunu GORUR (1) ve kendi adina YENI oturum YAZAR.
--   (c) A: BASKASI (B) adina oturum YAZAMAZ (with check client_id=auth.uid()).
--   (d) B: A'nin oturumunu GOREMEZ (0).
-- =============================================================================
begin;
-- (a) Kurulum postgres kimligiyle (RLS bypass), ROLLBACK ile geri alinir.
insert into public.workout_sessions (id, client_id, source)
values ('15300000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'freestyle');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_n int; v_caught boolean;
begin
  -- (b) A kendi oturumunu gorur
  select count(*) into v_n from public.workout_sessions
   where id = '15300000-0000-0000-0000-000000000001';
  if v_n <> 1 then
    raise exception 'BASARISIZ [153b]: A kendi workout_sessions satirini goremedi (%).', v_n;
  end if;
  -- A kendi adina yeni oturum yazabilir
  insert into public.workout_sessions (client_id, source)
  values ('22222222-2222-2222-2222-222222222222', 'program');

  -- (c) A baskasi (B) adina oturum YAZAMAZ
  v_caught := false;
  begin
    insert into public.workout_sessions (client_id, source)
    values ('33333333-3333-3333-3333-333333333333', 'freestyle');
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [153c]: A, B adina workout_sessions YAZABILDI (with check kirik).';
  end if;
  raise notice 'GECTI [153 A kendi oturumunu gorur/yazar; B adina yazamaz]';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int;
begin
  -- (d) B, A'nin oturumunu goremez
  select count(*) into v_n from public.workout_sessions
   where id = '15300000-0000-0000-0000-000000000001';
  if v_n <> 0 then
    raise exception 'BASARISIZ [153d]: B, A''nin workout_sessions satirini GORDU (%).', v_n;
  end if;
  raise notice 'GECTI [153d B, A''nin oturumunu goremez]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 154) DANISAN KENDI mesocycles'INI GORUR/YAZAR (plan sahipligi);
-- BASKA DANISAN GOREMEZ (mesocycles RLS plan uzerinden turetilir)
--   (a) KURULUM (postgres): A'ya ait bir plan (is_active=false, cakisma yok) +
--       o plana bir mezosiklu.
--   (b) A: kendi mezosiklusunu GORUR ve YENI mezosiklu YAZAR.
--   (c) B: A'nin mezosiklusunu GOREMEZ (0) ve A'nin planina mezosiklu YAZAMAZ.
-- =============================================================================
begin;
insert into public.workout_plans (id, client_id, owner_id, version, is_active)
values ('15400000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222', 9999, false);
insert into public.mesocycles (id, plan_id, name, weeks, goal, position)
values ('15400000-0000-0000-0000-000000000002', '15400000-0000-0000-0000-000000000001',
        'Hazirlik', 4, 'bulk', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_n int;
begin
  -- (b) A kendi mezosiklusunu gorur
  select count(*) into v_n from public.mesocycles
   where id = '15400000-0000-0000-0000-000000000002';
  if v_n <> 1 then
    raise exception 'BASARISIZ [154b]: A kendi mesocycles satirini goremedi (%).', v_n;
  end if;
  -- A kendi planina yeni mezosiklu yazabilir
  insert into public.mesocycles (plan_id, name, weeks, deload_week, goal, position)
  values ('15400000-0000-0000-0000-000000000001', 'Yukleme', 6, 6, 'recomp', 1);
  raise notice 'GECTI [154b A kendi mesocycles satirini gorur/yazar]';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_n int; v_caught boolean;
begin
  -- (c) B, A'nin mezosiklusunu goremez
  select count(*) into v_n from public.mesocycles
   where id = '15400000-0000-0000-0000-000000000002';
  if v_n <> 0 then
    raise exception 'BASARISIZ [154c]: B, A''nin mesocycles satirini GORDU (%).', v_n;
  end if;
  -- B, A'nin planina mezosiklu YAZAMAZ (with check EXISTS plan false)
  v_caught := false;
  begin
    insert into public.mesocycles (plan_id, name, weeks, goal, position)
    values ('15400000-0000-0000-0000-000000000001', 'Sizinti', 3, 'cut', 9);
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [154c]: B, A''nin planina mesocycles YAZABILDI.';
  end if;
  raise notice 'GECTI [154c B, A''nin mezosiklusunu goremez ve planina yazamaz]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 155) KOC (aal2) ATANMIS DANISANIN workout_sessions VE
-- mesocycles SATIRLARINI GORUR (tek koclu model, is_coach())
--   KURULUM: A'ya oturum + A'ya plan + mezosiklu. Koc (aal2) hepsini GORUR.
-- =============================================================================
begin;
insert into public.workout_sessions (id, client_id, source)
values ('15500000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'freestyle');
insert into public.workout_plans (id, client_id, owner_id, version, is_active)
values ('15500000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222', 9999, false);
insert into public.mesocycles (id, plan_id, name, weeks, goal, position)
values ('15500000-0000-0000-0000-000000000011', '15500000-0000-0000-0000-000000000010',
        'KocGorur', 5, 'contest_prep', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal2"}';
do $$
declare v_s int; v_m int;
begin
  select count(*) into v_s from public.workout_sessions
   where id = '15500000-0000-0000-0000-000000000001';
  if v_s <> 1 then
    raise exception 'BASARISIZ [155]: aal2 koc, A''nin workout_sessions satirini GOREMEDI (%).', v_s;
  end if;
  select count(*) into v_m from public.mesocycles
   where id = '15500000-0000-0000-0000-000000000011';
  if v_m <> 1 then
    raise exception 'BASARISIZ [155]: aal2 koc, A''nin mesocycles satirini GOREMEDI (%).', v_m;
  end if;
  raise notice 'GECTI [155 aal2 koc atanmis danisanin oturum + mezosiklu satirlarini gorur]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 156) aal1 KOC YENI TABLOLARI GOREMEZ (mfa_aal2_gate)
--   Senaryo 155 ile AYNI kurulum, TEK FARK: koc claim'i aal1. RESTRICTIVE
--   kapi devreye girer -> koc HICBIR yeni satir goremez (fail-closed).
-- =============================================================================
begin;
insert into public.workout_sessions (id, client_id, source)
values ('15600000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'freestyle');
insert into public.workout_plans (id, client_id, owner_id, version, is_active)
values ('15600000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222', 9999, false);
insert into public.mesocycles (id, plan_id, name, weeks, goal, position)
values ('15600000-0000-0000-0000-000000000011', '15600000-0000-0000-0000-000000000010',
        'Aal1Gizli', 5, 'bulk', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1"}';
do $$
declare v_s bigint; v_m bigint;
begin
  select count(*) into v_s from public.workout_sessions;
  if v_s <> 0 then
    raise exception 'BASARISIZ [156]: aal1 koc workout_sessions''ta % satir GORDU -- mfa_aal2_gate ETKISIZ.', v_s;
  end if;
  select count(*) into v_m from public.mesocycles;
  if v_m <> 0 then
    raise exception 'BASARISIZ [156]: aal1 koc mesocycles''ta % satir GORDU -- mfa_aal2_gate ETKISIZ.', v_m;
  end if;
  raise notice 'GECTI [156 aal1 koc yeni tablolari GOREMEZ (mfa_aal2_gate fail-closed)]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 157) PASIF DANISAN YENI TABLOLARI YAZAMAZ/GOREMEZ
-- (account_active_gate)
--   (a) KURULUM (postgres): A'ya oturum + plan; sonra A pasiflestirilir.
--   (b) PASIF A: workout_sessions'i GOREMEZ (0), YENI oturum YAZAMAZ (42501),
--       kendi planina mezosiklu YAZAMAZ (42501).
-- =============================================================================
begin;
insert into public.workout_sessions (id, client_id, source)
values ('15700000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'freestyle');
insert into public.workout_plans (id, client_id, owner_id, version, is_active)
values ('15700000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222',
        '22222222-2222-2222-2222-222222222222', 9999, false);
update public.profiles set is_active = false where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","aal":"aal1"}';
do $$
declare v_n bigint; v_caught boolean;
begin
  -- (b) PASIF A goremez
  select count(*) into v_n from public.workout_sessions;
  if v_n <> 0 then
    raise exception 'BASARISIZ [157]: PASIF A workout_sessions''ta % satir GORDU -- account_active_gate ETKISIZ.', v_n;
  end if;

  -- PASIF A yeni oturum YAZAMAZ
  v_caught := false;
  begin
    insert into public.workout_sessions (client_id, source)
    values ('22222222-2222-2222-2222-222222222222', 'freestyle');
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [157]: PASIF A workout_sessions''a YAZABILDI.';
  end if;

  -- PASIF A kendi planina mezosiklu YAZAMAZ
  v_caught := false;
  begin
    insert into public.mesocycles (plan_id, name, weeks, goal, position)
    values ('15700000-0000-0000-0000-000000000010', 'PasifYazamaz', 4, 'bulk', 0);
  exception when insufficient_privilege then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [157]: PASIF A mesocycles''a YAZABILDI.';
  end if;
  raise notice 'GECTI [157 PASIF A yeni tablolari goremez/yazamaz (account_active_gate)]';
end $$;
rollback;


-- =============================================================================
-- İMZA DİLİMİ — 158) OFFLINE IDEMPOTENCY: client_mutation_id KISMI TEKIL
-- INDEKSI AYNI MUTASYONU IKINCI KEZ REDDEDER (23505)
--   (a) workout_sessions: ayni (client_id, client_mutation_id) ikinci insert RED.
--   (b) workout_logs: ayni (client_id, client_mutation_id) ikinci insert RED.
--   NOT: NULL serbesttir -- iki NULL client_mutation_id CAKISMAZ (kismi indeks).
-- =============================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v_caught boolean; v_state text;
begin
  -- (a) workout_sessions idempotency
  insert into public.workout_sessions (client_id, source, client_mutation_id)
  values ('22222222-2222-2222-2222-222222222222', 'freestyle',
          '15800000-0000-0000-0000-0000000000aa');
  v_caught := false;
  begin
    insert into public.workout_sessions (client_id, source, client_mutation_id)
    values ('22222222-2222-2222-2222-222222222222', 'program',
            '15800000-0000-0000-0000-0000000000aa');
  exception when unique_violation then
    v_caught := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [158a]: workout_sessions ayni client_mutation_id IKINCI kez yazildi -- idempotency indeksi YOK.';
  end if;
  if v_state is distinct from '23505' then
    raise exception 'BASARISIZ [158a hata kodu]: beklenen 23505, gelen %', v_state;
  end if;

  -- (b) workout_logs idempotency
  insert into public.workout_logs (client_id, exercise_name, client_mutation_id)
  values ('22222222-2222-2222-2222-222222222222', 'Bench Press',
          '15800000-0000-0000-0000-0000000000bb');
  v_caught := false;
  begin
    insert into public.workout_logs (client_id, exercise_name, client_mutation_id)
    values ('22222222-2222-2222-2222-222222222222', 'Bench Press',
            '15800000-0000-0000-0000-0000000000bb');
  exception when unique_violation then v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [158b]: workout_logs ayni client_mutation_id IKINCI kez yazildi -- idempotency indeksi YOK.';
  end if;

  -- (c) NULL client_mutation_id iki kez SERBEST (kismi indeks NULL'lari kapsamaz)
  insert into public.workout_sessions (client_id, source) values
    ('22222222-2222-2222-2222-222222222222', 'freestyle'),
    ('22222222-2222-2222-2222-222222222222', 'freestyle');

  raise notice 'GECTI [158 offline idempotency: ayni client_mutation_id ikinci kez RED (23505); NULL serbest]';
end $$;
rollback;


-- =============================================================================
-- TOPLAM ÖZET
-- Bu noktaya yalnızca YUKARIDAKİ 158 senaryonun HEPSİ GECTI verdiyse ulaşılır --
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
--   * 86–88 : Faz 2b — workout_logs set kolonları         (set_number /
--             plan_exercise_id / completed_at; çapraz danışan plan bağı KAPALI;
--             koç danışanın loguna INSERT edemez)
--   * 89–91 : Faz 2b — mesaj eki                          (attachment_path
--             sözleşmesi + dokunulmazlığı; message-attachments bucket'ında
--             okuma/yazma sınırları, ad ayrıştırıcısı sömürülemez)
--   * 92    : Faz 2b — read_at KANONİK / is_read TÜREV    (trigger iki yönü de
--             normalleştirir; trigger kapalıyken CHECK reddeder)
--   * 93–94 : Faz 2b — nutrition_logs + günlük makro hedefi
--   * 95    : Faz 2b — realtime yayın sözleşmesi (sürüklenme testi)
--   * 96–99 : Faz 2e/f — sistem mesajı RPC'si (post_system_message): RPC koç
--             adına kind='system' yazar (invaryantlar dahil), danışan RPC'yi
--             çağıramaz, koç dahi doğrudan .insert() ile kind='system'
--             yazamaz (guard zayıflamadı), RPC şablon dışı/sahte referans
--             kabul etmez (bilinmeyen olay türü, yanlış danışan, henüz
--             incelenmemiş, başka koç tarafından incelenmiş)
--   * 100–104: Faz 2 — plan versiyonlama (§4.1 madde 1): yayınlama eski planı
--             arşivler ve `version+1` ile yeni aktif plan açar (100); GEÇMİŞ
--             LOGUN plan bağı NULL'a DÜŞMEZ ve arşiv versiyona bağlı kalır
--             (101 — bu maddenin asıl kazancı); okuma yolları yayından sonra
--             da TEK aktif planı görür (102); toplu atamada versiyon danışan
--             başına bağımsız ilerler ve taslak dalı versiyon şişirmez (103);
--             tekillik indeksleri ihlal edilmez (104)
--   * 105–110: Faz 4a — ilerleme takibi şeması (§6): AC-4.1 aynı güne ikinci
--             kilo girişi duplicate ÜRETMEZ, upsert aynı satırı günceller
--             (105); progress_entries erişim matrisi — KOÇ SALT OKUR (106);
--             değer kısıtları: negatif/sıfır/absürt/ölçümsüz/absürt tarih RED
--             (107); progress_photos yol sözleşmesi + `angle` enum + tekil
--             dosya + koç salt-okuma (108); `progress-photos` bucket'ında
--             danışan izolasyonu, fail-closed ad ayrıştırıcısı, koçun
--             YAZAMAMASI/SİLEMEMESİ (109); yeni yüzeyin sertleştirme denetimi
--             (FORCE RLS, D/x/t yok, S/I/U/D var, anon yok, updated_at
--             trigger'ı, bucket PRIVATE + 4 politika, sequence yok) (110)
--   * 111–113: Faz 4 / B-036 — kilo serisinin TEK KAYNAĞA bağlanması
--             (20260818090000_form_check_weight_to_progress.sql): form check
--             eklendiğinde aynı YEREL güne (Europe/Istanbul) `progress_entries`
--             satırı düşer, gece yarısı penceresi bir önceki güne KAYMAZ ve
--             trigger fonksiyonu SECURITY DEFINER DEĞİLDİR — yazma gerçek
--             `authenticated` rolüyle, RLS açıkken yapılır; koç türetilmiş
--             satırı okuyabilir (111); çakışmada ELLE GİRİŞ KAZANIR, yalnızca
--             `weight_kg` NULL ise dolar, diğer kolonlara dokunulmaz,
--             duplicate satır oluşmaz (112); backfill aynı günde EN YENİ form
--             check'i seçer, var olan satırı ezmez ve IDEMPOTENTTİR (113)
--   * 114–118: Faz 4 / B-019 — koç onay yolunun ATOMİKLEŞTİRİLMESİ
--             (20260819090000_approve_program_atomic.sql): `approve_program()`
--             planı + onayı + bildirimi TEK çağrıda ve TEK transaksiyonda
--             yazar (114); danışan kendi programını bu yolla ONAYLAYAMAZ ve
--             denemesinden yan etki kalmaz (115); çaprazlama iki yönden de
--             kapalı — danışan izolasyonu + onay/danışan eşleşme kapısı (116);
--             *** ATOMİKLİK KANITI ***: başarısız çağrıdan plan satırı, plan
--             versiyonu ve bildirim ekseninde HİÇBİR yan etki kalmaz (117);
--             yeni RPC'nin yetki yüzeyi sürüklenme testi — SECURITY INVOKER,
--             pinli `search_path`, anon/PUBLIC kapalı (118)
--   * 119–124: Faz 4.6 / B-042 — KVKK HESAP SİLME
--             (20260819100000_account_deletion.sql): *** TAM SÜPÜRME ***
--             `delete_account()` sonrası 14 tablonun HİÇBİRİNDE satır kalmaz,
--             auth kullanıcısı gider, denetim satırı yazılır ve o satır silinen
--             kişinin uid'sini/e-postasını TAŞIMAZ; storage nesnesi dururken
--             çağrı fail-closed REDDEDİLİR ve reddin yan etkisi YOKTUR (119);
--             İZOLASYON — tanık kullanıcı, seed profilleri ve katalog
--             etkilenmez, fazla silme yoktur (120); IDEMPOTANSLIK — ikinci ve
--             üçüncü çağrı hata üretmez, `already_deleted:true` döner ve İKİNCİ
--             denetim satırı yazılmaz (121); danışan ne başkasının ne KENDİ
--             hesabını SQL'den silebilir (EXECUTE yalnızca `service_role`de),
--             manifest ve `auth.users` DELETE de kapalı (122); denetim
--             tablosunun 6 kolonluk sözleşmesi korunur (kişisel veri kolonu
--             eklenirse test kırılır) ve tablo authenticated'a da
--             `service_role`e de KAPALIDIR (123); yetki yüzeyi sürüklenme
--             testi — SECURITY DEFINER, pinli `search_path`, EXECUTE yalnızca
--             `service_role`, ve KOÇ hesabı `service_role` ile bile silinemez
--             (124)
--   * 125-126: Faz 4.6 / B-028 — MESAJ EKİNDE SUNUCU TARAFI MAGIC-BYTE
--             DOĞRULAMASI (20260819110000_attachment_magic_byte_verification.sql):
--             ek içeren bir mesaj, o ek için SUNUCUNUN bıraktığı damga olmadan
--             GİREMEZ — damgasız, tüketilmiş, içeriği değişmiş (TOCTOU/eTag),
--             bayat (>15 dk) ve BAŞKASININ yüklediği nesnenin damgası hep 42501
--             ile reddedilir; damgalı ek geçer ve damga TÜKETİLİR; sunucu
--             bağlamı (seed/migration) kapıdan etkilenmez (125). Yetki yüzeyi:
--             damga tablosu RLS+FORCE+SIFIR politika (danışan ne okur ne yazar),
--             `record_attachment_verification` EXECUTE yalnızca `service_role`,
--             tetikleyici SECURITY **INVOKER** + pinli `search_path` (DEFINER
--             olsaydı `is_end_user_write()` hep false döner, kapı sessizce
--             açılırdı) ve tetikleyici gerçekten `messages`e bağlı (126)
--   * 127-131: Faz 4.7 dilim 1 — TOTP MFA ve aal2 KAPISI
--             (20260819120000_mfa_aal2_gate.sql, ADR-0026): danışan verisi
--             taşıyan 14 tablonun tamamına tek kalıplı RESTRICTIVE politika
--             (`not is_coach() or (select auth.jwt()->>'aal') = 'aal2'`).
--             aal1'deki koç 14 tablonun HİÇBİRİNİ okuyamaz ve katalog (2 tablo)
--             yine de açık kalır (127); aal1'deki koç hiçbirine yazamaz,
--             silemez, güncelleyemez — `with check` dalı INSERT'te de ölçülür
--             (128); *** POZİTİF KONTROL *** aal2'deki koç okur ve yazar, yani
--             kapı gerçekten AÇILIR — politika `false` sabiti değildir (129);
--             *** REGRESYON KAPISI, BU PAKETİN EN ÖNEMLİ SENARYOSU ***
--             danışan `aal` claim'i OLMADAN ve AÇIK `aal1` ile 14 tablonun
--             hepsinde BİREBİR aynı sonucu görür, yazma yolu da açık kalır ve
--             "boş geçme" (her şey 0 = 0) koruması vardır (130); politika
--             sürüklenme testi — 14/14 politika RESTRICTIVE + ALL +
--             `{authenticated}`, `using` ve `with_check` İKİSİ DE dolu ve iki
--             dalı da (`is_coach` / `aal2`) taşıyor, `mfa_aal2_gate` adı 14
--             tablo dışına sızmamış, public şemasında kapı ve muafiyet listesi
--             dışında tablo yok, `is_coach()` hâlâ SECURITY DEFINER (131)
--   * 132–136: Faz 4.7 — KOÇ MÜDAHALELERİ DENETİM TABLOSU
--             (20260819130000_coach_action_audit.sql): `record_coach_action()`
--             yetki yüzeyi sürüklenme testi — SECURITY DEFINER, pinli
--             `search_path`, EXECUTE yalnızca `service_role`, PUBLIC'e kapalı
--             (132); `coach_actions` 6 kolonluk sözleşmesi korunur ve tablo
--             `authenticated`a (koç dahil) da `service_role`e de KAPALIDIR —
--             okuma/yazma/güncelleme/silme dördü de RED, pozitif kontrol satırın
--             gerçekten yerinde kaldığını doğrular (133); *** POZİTİF KONTROL ***
--             `service_role` ile çağrılınca satır GERÇEKTEN yazılır, `action`
--             kapalı liste dışı bir değeri 23514 ile REDDEDER, danışan
--             fonksiyonu HİÇ ÇAĞIRAMAZ (134); HESAP SİLME ETKİLEŞİMİ — danışan
--             `delete_account()` ile silinince kendisini HEDEF alan
--             `coach_actions` satırları `target_id` CASCADE'i ile gider ve
--             `account_deletion_manifest()`in `coach_actions` anahtarı
--             silmeden ÖNCE doğru sayar, `rows_deleted`e de doğru yansır (135);
--             KOÇ (AKTÖR) SİLİNSE BİLE İZ KAYBOLMAZ — `delete_account()`in koç
--             kapısı DIŞINDaki bir yoldan (ham `auth.users` DELETE) koç
--             hesabı silinse dahi `coach_actions` satırı KALIR, yalnızca
--             `actor_id` NULL'a düşer (`ON DELETE SET NULL`) (136)
--   * 137–143: Faz 4.8 dilim 1 — ETKİNLİK KAYDI (§7c)
--             (20260820090000_activity_log.sql): danışan KENDİ etkinlik
--             kaydını görür (§7c kararı) ama başkasınınkini GÖRMEZ — pozitif
--             ve negatif yarı birlikte ölçülür (137); danışan tablolara
--             DOĞRUDAN yazamaz/silemez/güncelleyemez ve rıza damgasını kendi
--             basamaz — yazma yalnız sunucu yolundan, dört fonksiyonun da
--             EXECUTE'u yalnızca `service_role`de, `service_role`ün DOĞRUDAN
--             tablo yetkisi YOK (138, B-031'in bu yüzeydeki ilk kapanışı);
--             aal2 koç TÜM danışanları okur (pozitif kontrol) ama aal1 koç ve
--             `aal` claim'i olmayan koç HİÇBİRİNİ göremez — iki yeni tablo
--             `mfa_aal2_gate` kapısına GİRDİ, 14 -> 16 (139);
--             `record_activity()` rıza kapısı FAIL-CLOSED'dır (rıza yokken
--             42501, hiçbir satır yazılmaz), rıza verilince GERÇEKTEN yazar,
--             heartbeat = olaysız çağrı (yeni satır üretmez), kapalı
--             olay/platform listesi 23514 ile reddeder, BAŞKASININ oturumuna
--             yazılamaz (42501) ve 30 dk bayat oturum YENİ oturum açar (140);
--             rıza geri çekme = DURDUR + SİL — durum 'revoked' olur,
--             kullanıcının TÜM satırları ANINDA gider (180 gün "erimez",
--             KVKK m.7), BAŞKA kullanıcı ETKİLENMEZ (filtresiz DELETE yok) ve
--             sonrasında yazma yolu kapalıdır (141); purge 180 günden eskiyi
--             siler, YENİSİNE DOKUNMAZ, `purge_expired_activity(0)`
--             ("hepsini sil" kısayolu) REDDEDİLİR ve pg_cron job'u
--             kayıtlı+aktiftir (142); HESAP SİLME ETKİLEŞİMİ — manifest
--             15 -> 17, iki yeni anahtar doğru sayar, `rows_deleted`e yansır
--             ve silme sonrası etkinlik satırı KALMAZ (143)
--   * 144    : Faz 4.8 dilim 3c — KOÇ ÖZETİNİN SQL'E TAŞINMASI
--             (20260820140000_coach_activity_summary.sql): dilim 3b koç
--             görünümünü ham satır çekip TARAYICIDA toplayarak yapıyordu, yani
--             §7c'nin "koça saat/dakika gösterilmez" kuralı yalnızca ARAYÜZ
--             NEZAKETİ seviyesindeydi — ham `started_at`/`occurred_at` zaten
--             koçun tarayıcısına iniyordu. `coach_activity_summary(uuid,
--             integer)` sınırı VERİ KATMANINA taşır: KATALOG yarısı —
--             `prosecdef = false` (SECURITY INVOKER; DEFINER olsaydı aal2
--             kapısı ATLANIRDI), pinli `search_path`, EXECUTE yalnızca
--             `authenticated` (anon ve `service_role` DAHİL kapalı) ve dönüş
--             sözleşmesi `TABLE(day date, total_seconds integer, event_counts
--             jsonb)` — yani kümede ham zaman damgası taşıyan BİR KOLON BİLE
--             yok (144a1); DAVRANIŞ yarısı — aal1 koç ve `aal` claim'i
--             olmayan koç HİÇBİR gün satırı göremez (144a2); *** POZİTİF
--             KONTROL *** aal2 koç DOĞRU gün toplamlarını alır (bugün 1800 sn
--             + login/tab_view kırılımı, dün 600 sn), BAŞKA danışanın oturumu
--             sızmaz, sıralama yeniden eskiye, pencere gerçekten `p_days`e
--             bağlıdır (30 -> 2 gün, 90 -> 3 gün) ve `p_days = 0` reddedilir
--             (144b); danışan BAŞKASININ özetini alamaz ama KENDİ özetini
--             alır — yani (c) bir "herkese boş dönen kabuk" değil, RLS'in
--             ürünüdür (144c); RIZA GERİ ÇEKİLMİŞKEN satırlar HÂLÂ DURUYOR
--             olsa bile küme BOŞTUR ve HATA FIRLATILMAZ (rıza kapalı olması
--             bir arıza değildir; koç durumu zaten rıza rozetinden görür) —
--             kurulum satırların gerçekten durduğunu doğrular, yani test
--             tautoloji değildir (144d)
--   * 145    : Faz 4.9 dilim 1 — DANIŞAN DAVETİ
--             (20260820160000_coach_invite_action.sql, ADR-0027): YENİ
--             `client_invited` eylem türü NULL hedefle KABUL edilir (pozitif
--             kontrol), ESKİ `password_reset_requested` invaryantı AYNEN
--             korunur (22023) ve kapalı liste hâlâ KAPALIDIR (23514) —
--             genişletme onu serbest metne çevirmedi; YENİ
--             `link_coach_action_target()` DOLU bir hedefi ASLA yeniden
--             yönlendirmez, geçmiş tahrif edilemez (145a); `authenticated`
--             (koç dahil) ne `record_coach_action()`u ne de YENİ
--             `link_coach_action_target()`u çağırabilir — genişletilen kapalı
--             liste yeni bir çağrı yolu AÇMADI — ve ikinci fonksiyonun
--             SECURITY DEFINER + pinli `search_path` + EXECUTE yalnızca
--             `service_role` sürüklenme testi de burada koşar (145b); ***
--             BU PAKETİN EN ÖNEMLİ SENARYOSU *** — davetle doğan kullanıcı,
--             `raw_user_meta_data` içinde BİLEREK `role:"coach"` YAZSA BİLE,
--             tetikleyici (`handle_new_user`) ile HER ZAMAN `client` olur
--             (AC-02, tetikleyici doğrudan sınanır — HTTP/GoTrue'ya hiç
--             gidilmez), `full_name` metadata'dan OKUNUR ve uçtan uca iki
--             fazlı davet akışının DB tarafı (kayıt + bağlama) çalışır
--             (145c); `role='coach'` satır sayısı HER ZAMAN 1 — tek-koçluk
--             modelinin (ADR-0007) REGRESYON KAPISI, davet ucu eklendiği
--             için ARTIK gerekli (B-058: koç-danışan atama tablosu yok)
--             (145d)
--   * 146–148: Faz 4.9 dilim 2 — PROFİL KÜNYESİ (doğum tarihi + boy)
--             (20260820170000_profile_body_metrics.sql): danışan A KENDİ
--             `birth_date`/`height_cm` alanlarını yazar ve DB'den GERÇEKTEN
--             geri okunur; aynı danışan A başkasının (B) künyesini
--             YAZAMAZ — sonuç "0 satır etkilendi" (RLS satırı taramada eler)
--             ile "42501" (kolon kapısı) arasında hangisi çıkarsa raise
--             notice ile kayda geçer, B'nin satırı GERÇEKTEN değişmez (146);
--             *** BU PAKETİN EN ÖNEMLİ SENARYOSU *** — aal2 KOÇ danışan A'nın
--             `height_cm`/`birth_date` alanlarını YAZAMAZ (42501,
--             `profiles_guard_body_metrics` tetikleyicisi), *** POZİTİF
--             KONTROL *** aynı koç danışan A'nın `full_name`'ini HÂLÂ
--             güncelleyebilir — kapı `profiles` UPDATE'ini TÜMDEN kapatmadı,
--             yalnızca iki kolonu sabitledi — ve koç KENDİ satırının
--             künyesini yazabilir (kural "danışan doldurur" değil "SAHİBİ
--             doldurur"dur); kurulumdaki künye (`height_cm=180`) değişmeden
--             kalır (147); CHECK kısıtları (`profiles_birth_date_chk`,
--             `profiles_height_cm_chk`) gelecek tarih, 1900 öncesi, birim
--             hatası (1.75 m), absürt değer (1750 mm) ve iki ondalık basamağı
--             (175.25) 23514 ile REDDEDER; *** POZİTİF KONTROL *** makul
--             değerler (1995-03-14, 178.5) GEÇER ve geri okunur, *** NULL
--             POZİTİF KONTROL *** künye ZORUNLU DEĞİL — ikisi de null
--             yazılabilir (148)
--   * 149–152: Faz 4.10 — HESAP AKTİF/PASİF DURUMU
--             (20260820180000_account_active_state.sql, account_active_gate):
--             PASİF danışan (is_active=false) 16 kapılı tablonun profiles
--             DIŞINDAKİ 15'ini GÖREMEZ ama KENDİ profiles satırını (id=
--             auth.uid()) HÂLÂ okur — pasif ekran için KRİTİK istisna, profiles
--             using dalı taşır (149); PASİF danışan hiçbir tabloya YAZAMAZ
--             (42501) ve *** KRİTİK *** kendi `is_active`'ini TRUE çekemez
--             (42501, guard) — kendini yeniden aktifleştiremez, yalnızca koç
--             RPC'si kaldırır (150); REGRESYON — AKTİF danışan (>=5 tabloda
--             veri) ve KOÇ (aal2, her zaman aktif) ETKİLENMEZ, role='coach'
--             sayısı = 1 (koç ASLA pasifleşemez, RPC yalnızca role=client hedef
--             alır) (151); `set_client_active_state` YALNIZCA service_role'de
--             (authenticated/koç çağıramaz), service_role çağrısı `is_active`'i
--             değiştirir VE `client_deactivated` denetimini ÖNCE yazar
--             (fail-closed), koç/var-olmayan hedef 42501, coach_actions kapalı
--             listesi `client_deactivated`/`client_reactivated`'i KABUL ama
--             tanımsız action'ı 23514 ile RED, 16/16 account_active_gate
--             RESTRICTIVE+ALL+authenticated (profiles with_check auth.uid()
--             İSTİSNASINI TAŞIMAZ), şema sürükleme yok, is_active_user DEFINER
--             (152)
--   * 153–158: İmza Dilimi — workout_sessions / mesocycles / offline idempotency
--             (20260821120000_bb_signature_slice.sql): danışan kendi
--             workout_sessions'ını görür/yazar, başka danışana ve B adına
--             yazma KAPALI (153); danışan kendi mesocycles'ını (plan sahipliği)
--             görür/yazar, başka danışan göremez/yazamaz (154); aal2 koç atanmış
--             danışanın oturum + mezosiklü satırlarını görür (155); aal1 koç yeni
--             tabloları GÖREMEZ — mfa_aal2_gate fail-closed (156); PASİF danışan
--             yeni tabloları göremez/yazamaz — account_active_gate (157);
--             OFFLINE IDEMPOTENCY: aynı client_mutation_id ikinci kez 23505 ile
--             RED (workout_sessions + workout_logs), NULL serbest (158); ayrıca
--             mfa_aal2_gate ve account_active_gate 16 -> 18 (131 / 152c) ve pasif
--             danışan artık 17 tabloyu göremez (149)
--
-- NOT: `nutrition_logs`, `progress_entries` ve `progress_photos` ayrıca senaryo
-- 73 (yetki) ve 74 (RLS+FORCE) tarafından DİNAMİK olarak kapsanır — o iki
-- senaryo tablo listesini `pg_tables`'tan okur.
-- =============================================================================
do $$
begin
  raise notice 'TUM RLS TESTLERI GECTI (158 senaryo)';
end $$;
