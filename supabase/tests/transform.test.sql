-- =============================================================================
-- supabase/tests/transform.test.sql
--
-- Eski JSON string kolonlarından normalize tablolara yapılan VERİ DÖNÜŞÜMLERİNİ
-- doğrulayan, tekrar çalıştırılabilir SQL test script'i:
--
--   senaryo 1–10  : `profiles.workout_plan`   -> `workout_plans` + `workout_plan_exercises`
--                   (supabase/migrations/20260817110000_workout_plan_tables.sql §7)
--   senaryo 11–19 : `profiles.nutrition_plan` -> `nutrition_plans` + `nutrition_plan_meals`
--                   (supabase/migrations/20260817130000_nutrition_plan_tables.sql §7)
--   senaryo 20–22 : messages.client_id / read_at backfill
--                   (supabase/migrations/20260817140000_messages_conversation_key.sql §4)
--   senaryo 23–26 : form_checks inceleme durumu backfill'i + tutarlılık kısıtı
--                   (supabase/migrations/20260817150000_form_check_review.sql §3–§4)
--
-- NEDEN AYRI BİR TEST GEREKİYOR:
--   `supabase db reset` dönüşümü TEST ETMEZ. Reset akışında migration'lar
--   SEED'DEN ÖNCE koşar; dönüşüm bu yüzden her zaman BOŞ `profiles` tablosunda
--   çalışır ve no-op'tur (0 profil, 0 satır). Yani "db reset temiz geçti"
--   ifadesi dönüşüm mantığı hakkında HİÇBİR ŞEY kanıtlamaz.
--   Dönüşümü doğrulamanın tek yolu, mantığı bir fonksiyona
--   (`public.migrate_workout_plans_from_profiles()`) çıkarıp buradan çağırmaktır.
--
-- ÇALIŞTIRMA:
--   npm run test:transform
--   (veya doğrudan) docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/transform.test.sql
--
-- TASARIM (supabase/tests/rls.test.sql ile aynı desen):
--   * Her senaryo kendi BEGIN; ... ROLLBACK; bloğu içindedir -> KALICI VERİ
--     BIRAKMAZ. Senaryolar `profiles.workout_plan` üzerinde yazma yapar ve
--     hedef danışanın plan satırlarını temizler; hepsi geri alınır.
--   * Uyuşmazlıkta `raise exception` -> ON_ERROR_STOP=1 ile psql sıfırdan farklı
--     çıkış kodu verir (sessiz PASS yok).
--   * "Hata beklenen" senaryolarda hata plpgsql BEGIN/EXCEPTION ile YAKALANIR.
--
-- BİLİNÇLİ SINIR (round-trip):
--   `explode_plan_day` yalnızca boşluktan ibaret satırları atar. Bu yüzden
--   round-trip kayıpsızlığı "boş satır içermeyen metin" için BİREBİR'dir;
--   boş satır içeren metin için ise "boş satırları atılmış hâline" eşittir.
--   Bu sınır senaryo 2 ve 2b ile açıkça test edilir.
--
-- Seed kimlikleri (bkz. supabase/seed.sql):
--   Koç (coach)  : 11111111-1111-1111-1111-111111111111 (Deniz Koç)
--   Danışan A    : 22222222-2222-2222-2222-222222222222 (Ahmet Yılmaz)
--   Danışan B    : 33333333-3333-3333-3333-333333333333 (Elif Demir)
-- =============================================================================

\set ON_ERROR_STOP on

\echo '=== TRANSFORM TEST SUITE BASLIYOR ==='


-- =============================================================================
-- 1) TEMEL DONUSUM — beklenen sayida plan ve egzersiz satiri olusur
-- =============================================================================
begin;

-- Diğer profiller dönüşüme girmesin -> sayımlar deterministik olsun.
update public.profiles set workout_plan = null;
-- Hedef danışan temiz başlasın (migration daha önce gerçek veriyi dönüştürmüş olabilir).
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8\n2. Incline Dumbbell Press - 3x10\n3. Cable Fly - 3x12","Çarşamba":"Dinlenme","Cuma":"1. Overhead Press - 4x8\n2. Lateral Raise - 3x15"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_res        record;
  v_plans      int;
  v_exercises  int;
begin
  select * into v_res from public.migrate_workout_plans_from_profiles();

  if v_res.profiles_converted is distinct from 1 then
    raise exception 'BASARISIZ [Temel donusum - profil sayisi]: beklenen %, gelen %', 1, v_res.profiles_converted;
  end if;
  if v_res.exercises_inserted is distinct from 6 then
    raise exception 'BASARISIZ [Temel donusum - egzersiz sayisi]: beklenen %, gelen %', 6, v_res.exercises_inserted;
  end if;

  select count(*) into v_plans
    from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;
  if v_plans is distinct from 1 then
    raise exception 'BASARISIZ [Temel donusum - aktif plan satiri]: beklenen %, gelen %', 1, v_plans;
  end if;

  select count(*) into v_exercises
    from public.workout_plan_exercises e
    join public.workout_plans p on p.id = e.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222';
  if v_exercises is distinct from 6 then
    raise exception 'BASARISIZ [Temel donusum - tablodaki egzersiz satiri]: beklenen %, gelen %', 6, v_exercises;
  end if;

  -- version = 1 ve is_active = true
  if not exists (
    select 1 from public.workout_plans
     where client_id = '22222222-2222-2222-2222-222222222222'
       and version = 1 and is_active
  ) then
    raise exception 'BASARISIZ [Temel donusum - version/is_active]: version=1 ve is_active=true bekleniyordu';
  end if;

  raise notice 'GECTI [1 - Temel donusum: 1 plan, 6 egzersiz satiri]';
end $$;

rollback;


-- =============================================================================
-- 2) ROUND-TRIP KAYIPSIZLIGI (EN ONEMLI IDDIA)
--    raw_line'lar position sirasiyla E'\n' ile birlestirilince ORIJINAL gun
--    metni BIREBIR geri gelmeli.
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

-- Kasten "zor" metin: Türkçe karakter, tire içeren isim, parantez, ayrıştırılamayan
-- satır, baştaki/sondaki boşluk, sayıyla başlamayan satır, çoklu boşluk.
update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8\n2. Push-Up (geniş tutuş) - 3x15\nIsınma: 10 dk koşu\n   4.  Calf Raise  -  4 X 15  \n5. Şınav - 3x20","Salı":"1. Deadlift - 4x5\n2. Barbell Row - 4x8","Çarşamba":"Dinlenme","Pazar":"Kardiyo 30 dk — tempolu yürüyüş"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan     jsonb;
  v_plan_id  uuid;
  r          record;
  v_rt       text;
  v_days     int := 0;
begin
  perform public.migrate_workout_plans_from_profiles();

  select workout_plan::jsonb into v_plan
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';

  select id into v_plan_id
    from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  if v_plan_id is null then
    raise exception 'BASARISIZ [Round-trip]: aktif plan olusmadi';
  end if;

  for r in select key as day_key, value as day_text from jsonb_each_text(v_plan) loop
    select string_agg(e.raw_line, E'\n' order by e.position)
      into v_rt
      from public.workout_plan_exercises e
     where e.plan_id = v_plan_id
       and e.day = r.day_key;

    if v_rt is distinct from r.day_text then
      raise exception E'BASARISIZ [Round-trip - %]: KAYIPLI!\n--- beklenen ---\n%\n--- gelen ---\n%',
        r.day_key, r.day_text, coalesce(v_rt, '<NULL>');
    end if;

    v_days := v_days + 1;
  end loop;

  if v_days is distinct from 4 then
    raise exception 'BASARISIZ [Round-trip - gun sayisi]: beklenen %, gelen %', 4, v_days;
  end if;

  raise notice 'GECTI [2 - Round-trip BIREBIR kayipsiz (% gun)]', v_days;
end $$;

rollback;


-- =============================================================================
-- 2b) ROUND-TRIP SINIRI — bos satirlar BILINCLI olarak atilir
--     Sozlesme: "explode_plan_day bos satirlari atlar". Bu senaryo bu sinirin
--     dokumante edilmis ve kasitli oldugunu kanitlar; sessizce degismesini onler.
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8\n\n2. Cable Fly - 3x12\n   \n"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan_id uuid;
  v_rt      text;
  v_rows    int;
begin
  perform public.migrate_workout_plans_from_profiles();

  select id into v_plan_id
    from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  select count(*) into v_rows
    from public.workout_plan_exercises where plan_id = v_plan_id;
  if v_rows is distinct from 2 then
    raise exception 'BASARISIZ [Bos satir - satir sayisi]: beklenen %, gelen %', 2, v_rows;
  end if;

  select string_agg(e.raw_line, E'\n' order by e.position)
    into v_rt
    from public.workout_plan_exercises e
   where e.plan_id = v_plan_id and e.day = 'Pazartesi';

  if v_rt is distinct from E'1. Bench Press - 4x8\n2. Cable Fly - 3x12' then
    raise exception 'BASARISIZ [Bos satir - bos satirlari atilmis round-trip]: gelen %', coalesce(v_rt, '<NULL>');
  end if;

  raise notice 'GECTI [2b - Bos satirlar bilincli atiliyor, kalan icerik kayipsiz]';
end $$;

rollback;


-- =============================================================================
-- 3) AYRISTIRMA — "1. Bench Press - 4x8" -> name/sets/reps dolar
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_row record;
begin
  perform public.migrate_workout_plans_from_profiles();

  select e.* into v_row
    from public.workout_plan_exercises e
    join public.workout_plans p on p.id = e.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222'
     and e.day = 'Pazartesi' and e.position = 0;

  if v_row is null then
    raise exception 'BASARISIZ [Ayristirma]: satir hic eklenmedi';
  end if;
  if v_row.raw_line is distinct from '1. Bench Press - 4x8' then
    raise exception 'BASARISIZ [Ayristirma - raw_line]: beklenen %, gelen %', '1. Bench Press - 4x8', v_row.raw_line;
  end if;
  if v_row.name is distinct from 'Bench Press' then
    raise exception 'BASARISIZ [Ayristirma - name]: beklenen %, gelen %', 'Bench Press', coalesce(v_row.name, '<NULL>');
  end if;
  if v_row.target_sets is distinct from 4 then
    raise exception 'BASARISIZ [Ayristirma - target_sets]: beklenen %, gelen %', 4, v_row.target_sets;
  end if;
  if v_row.target_reps is distinct from 8 then
    raise exception 'BASARISIZ [Ayristirma - target_reps]: beklenen %, gelen %', 8, v_row.target_reps;
  end if;

  raise notice 'GECTI [3 - Ayristirma: name=Bench Press, sets=4, reps=8]';
end $$;

rollback;


-- =============================================================================
-- 4) AYRISTIRILAMAYAN SATIR — "Dinlenme": satir EKLENIR, name NULL kalir
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set workout_plan = $json${"Çarşamba":"Dinlenme"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_row record;
begin
  perform public.migrate_workout_plans_from_profiles();

  select e.* into v_row
    from public.workout_plan_exercises e
    join public.workout_plans p on p.id = e.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222'
     and e.day = 'Çarşamba';

  if v_row is null then
    raise exception 'BASARISIZ [Ayristirilamayan satir]: satir EKLENMEDI (kayip veri!)';
  end if;
  if v_row.raw_line is distinct from 'Dinlenme' then
    raise exception 'BASARISIZ [Ayristirilamayan satir - raw_line]: beklenen %, gelen %', 'Dinlenme', v_row.raw_line;
  end if;
  if v_row.name is not null or v_row.target_sets is not null or v_row.target_reps is not null then
    raise exception 'BASARISIZ [Ayristirilamayan satir - turev kolonlar]: NULL bekleniyordu; name=%, sets=%, reps=%',
      coalesce(v_row.name, '<NULL>'), v_row.target_sets, v_row.target_reps;
  end if;

  raise notice 'GECTI [4 - Ayristirilamayan satir eklendi, turev kolonlar NULL]';
end $$;

rollback;


-- =============================================================================
-- 5) BOZUK JSON — hata VERMEZ, profil atlanir
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';
delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';

-- A: sozdizimi bozuk JSON
update public.profiles
   set workout_plan = '{"Pazartesi": "1. Bench Press - 4x8"'   -- kapanmayan suslu parantez
 where id = '22222222-2222-2222-2222-222222222222';

-- B: gecerli JSON ama NESNE degil (dizi) -> yine atlanmali
update public.profiles
   set workout_plan = '["Pazartesi", "Salı"]'
 where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_res   record;
  v_plans int;
begin
  -- Hata YUKSELMEMELI.
  select * into v_res from public.migrate_workout_plans_from_profiles();

  if v_res.profiles_converted is distinct from 0 then
    raise exception 'BASARISIZ [Bozuk JSON - profil sayisi]: beklenen %, gelen %', 0, v_res.profiles_converted;
  end if;

  select count(*) into v_plans
    from public.workout_plans
   where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [Bozuk JSON - plan satiri]: beklenen 0, gelen %', v_plans;
  end if;

  raise notice 'GECTI [5 - Bozuk JSON ve JSON-dizisi hata vermeden atlandi]';
end $$;

rollback;


-- =============================================================================
-- 6) NULL / BOS workout_plan — atlanir
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';
delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';

update public.profiles set workout_plan = null   where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set workout_plan = '   '  where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_res   record;
  v_plans int;
begin
  select * into v_res from public.migrate_workout_plans_from_profiles();

  if v_res.profiles_converted is distinct from 0 then
    raise exception 'BASARISIZ [NULL/bos plan - profil sayisi]: beklenen %, gelen %', 0, v_res.profiles_converted;
  end if;

  select count(*) into v_plans from public.workout_plans;
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [NULL/bos plan - plan satiri]: beklenen 0, gelen %', v_plans;
  end if;

  raise notice 'GECTI [6 - NULL ve bosluk-only workout_plan atlandi]';
end $$;

rollback;


-- =============================================================================
-- 7) IDEMPOTENCY — donusumu iki kez cagir, satir sayisi DEGISMEZ
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8\n2. Cable Fly - 3x12","Çarşamba":"Dinlenme"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_res1      record;
  v_res2      record;
  v_plans1    int;
  v_ex1       int;
  v_plans2    int;
  v_ex2       int;
begin
  select * into v_res1 from public.migrate_workout_plans_from_profiles();
  select count(*) into v_plans1 from public.workout_plans;
  select count(*) into v_ex1    from public.workout_plan_exercises;

  -- Ikinci kez
  select * into v_res2 from public.migrate_workout_plans_from_profiles();
  select count(*) into v_plans2 from public.workout_plans;
  select count(*) into v_ex2    from public.workout_plan_exercises;

  if v_res1.profiles_converted is distinct from 1 or v_res1.exercises_inserted is distinct from 3 then
    raise exception 'BASARISIZ [Idempotency - ilk cagri]: beklenen 1 profil / 3 satir, gelen % / %',
      v_res1.profiles_converted, v_res1.exercises_inserted;
  end if;

  if v_res2.profiles_converted is distinct from 0 or v_res2.exercises_inserted is distinct from 0 then
    raise exception 'BASARISIZ [Idempotency - ikinci cagri]: beklenen 0 profil / 0 satir, gelen % / %',
      v_res2.profiles_converted, v_res2.exercises_inserted;
  end if;

  if v_plans1 is distinct from v_plans2 or v_ex1 is distinct from v_ex2 then
    raise exception 'BASARISIZ [Idempotency - satir sayisi degisti]: plan %/%, egzersiz %/%',
      v_plans1, v_plans2, v_ex1, v_ex2;
  end if;

  raise notice 'GECTI [7 - Idempotency: ikinci calistirma cogaltma yapmadi (% plan / % satir)]', v_plans2, v_ex2;
end $$;

rollback;


-- =============================================================================
-- 8) AKTIF PLAN TEKILLIGI — ayni danisana ikinci aktif plan eklenemez
--    (workout_plans_one_active_idx kismi tekil indeksi)
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_caught boolean := false;
  v_arch   int;
begin
  insert into public.workout_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 1, true);

  begin
    insert into public.workout_plans (client_id, version, is_active)
    values ('22222222-2222-2222-2222-222222222222', 2, true);
  exception when unique_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [Aktif plan tekilligi]: ikinci AKTIF plan eklendi (unique index ihlali beklenirken hata alinmadi)';
  end if;

  -- Kismi indeks: is_active = false satirlar SINIRSIZ olabilmeli (Faz 2 versiyon arsivi).
  insert into public.workout_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 2, false),
         ('22222222-2222-2222-2222-222222222222', 3, false);

  select count(*) into v_arch
    from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and not is_active;
  if v_arch is distinct from 2 then
    raise exception 'BASARISIZ [Aktif plan tekilligi - pasif plan arsivi]: beklenen 2, gelen %', v_arch;
  end if;

  raise notice 'GECTI [8 - Aktif plan tekilligi zorunlu, pasif plan arsivi serbest]';
end $$;

rollback;


-- =============================================================================
-- 9) TEK AYRISTIRICI — save_workout_plan() ile donusum AYNI sonucu uretir
--    Kanit: ayni gun metni hem eski JSON yolundan hem RPC yolundan gecirildiginde
--    raw_line/name/sets/reps kolonlari BIREBIR ayni cikiyor -> iki ayri
--    ayristirici implementasyonu YOK.
-- =============================================================================
begin;

update public.profiles set workout_plan = null;
delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';
delete from public.workout_plans where client_id = '33333333-3333-3333-3333-333333333333';

update public.profiles
   set workout_plan = $json${"Pazartesi":"1. Bench Press - 4x8\nIsınma\n3. Plank - 3x60"}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_diff int;
  v_n    int;
begin
  -- Yol 1: eski JSON kolonundan donusum (Danisan A)
  perform public.migrate_workout_plans_from_profiles();

  -- Yol 2: RPC (Danisan B) - ayni metin
  perform public.save_workout_plan(
    array['33333333-3333-3333-3333-333333333333']::uuid[],
    jsonb_build_object('Pazartesi', E'1. Bench Press - 4x8\nIsınma\n3. Plank - 3x60')
  );

  select count(*) into v_n
    from public.workout_plan_exercises e
    join public.workout_plans p on p.id = e.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222';
  if v_n is distinct from 3 then
    raise exception 'BASARISIZ [Tek ayristirici - donusum satir sayisi]: beklenen 3, gelen %', v_n;
  end if;

  select count(*) into v_diff from (
    (select e.day, e.position, e.raw_line, e.name, e.target_sets, e.target_reps
       from public.workout_plan_exercises e
       join public.workout_plans p on p.id = e.plan_id
      where p.client_id = '22222222-2222-2222-2222-222222222222'
     except all
     select e.day, e.position, e.raw_line, e.name, e.target_sets, e.target_reps
       from public.workout_plan_exercises e
       join public.workout_plans p on p.id = e.plan_id
      where p.client_id = '33333333-3333-3333-3333-333333333333')
    union all
    (select e.day, e.position, e.raw_line, e.name, e.target_sets, e.target_reps
       from public.workout_plan_exercises e
       join public.workout_plans p on p.id = e.plan_id
      where p.client_id = '33333333-3333-3333-3333-333333333333'
     except all
     select e.day, e.position, e.raw_line, e.name, e.target_sets, e.target_reps
       from public.workout_plan_exercises e
       join public.workout_plans p on p.id = e.plan_id
      where p.client_id = '22222222-2222-2222-2222-222222222222')
  ) d;

  if v_diff is distinct from 0 then
    raise exception 'BASARISIZ [Tek ayristirici]: donusum ve save_workout_plan farkli sonuc uretti (% farkli satir)', v_diff;
  end if;

  raise notice 'GECTI [9 - Donusum ve save_workout_plan AYNI ayristiriciyi kullaniyor]';
end $$;

rollback;


-- =============================================================================
-- 10) save_workout_plan() — YENI VERSIYON URETMEZ, aktif plan satirlarini degistirir
-- =============================================================================
begin;

delete from public.workout_plans where client_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan_id_1 uuid;
  v_plan_id_2 uuid;
  v_plans     int;
  v_rows      int;
  v_affected  int;
begin
  v_affected := public.save_workout_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object('Pazartesi', E'1. Bench Press - 4x8\n2. Cable Fly - 3x12', 'Çarşamba', 'Dinlenme')
  );
  if v_affected is distinct from 1 then
    raise exception 'BASARISIZ [save_workout_plan - donen sayi]: beklenen 1, gelen %', v_affected;
  end if;

  select id into v_plan_id_1 from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  -- Ikinci kaydetme: yeni versiyon URETMEMELI, ayni plan satirini kullanmali.
  perform public.save_workout_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object('Pazartesi', '1. Squat - 5x5')
  );

  select id into v_plan_id_2 from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  if v_plan_id_1 is distinct from v_plan_id_2 then
    raise exception 'BASARISIZ [save_workout_plan - plan kimligi degisti]: % -> % (Faz 1b''de yeni versiyon URETILMEZ)', v_plan_id_1, v_plan_id_2;
  end if;

  select count(*) into v_plans from public.workout_plans
   where client_id = '22222222-2222-2222-2222-222222222222';
  if v_plans is distinct from 1 then
    raise exception 'BASARISIZ [save_workout_plan - plan satiri sayisi]: beklenen 1, gelen %', v_plans;
  end if;

  -- Eski satirlar TAMAMEN silinmis, yalnizca yeni icerik kalmis olmali.
  select count(*) into v_rows from public.workout_plan_exercises where plan_id = v_plan_id_2;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [save_workout_plan - eski satirlar silinmedi]: beklenen 1, gelen %', v_rows;
  end if;
  if not exists (
    select 1 from public.workout_plan_exercises
     where plan_id = v_plan_id_2 and day = 'Pazartesi' and position = 0
       and raw_line = '1. Squat - 5x5' and name = 'Squat' and target_sets = 5 and target_reps = 5
  ) then
    raise exception 'BASARISIZ [save_workout_plan - yeni icerik]: beklenen satir bulunamadi';
  end if;

  raise notice 'GECTI [10 - save_workout_plan aktif versiyonu yeniden yaziyor, yeni versiyon uretmiyor]';
end $$;

rollback;


-- #############################################################################
-- FAZ 1b / ADIM 3a — BESLENME PLANI DONUSUMU
-- (supabase/migrations/20260817130000_nutrition_plan_tables.sql §7)
--
-- `profiles.nutrition_plan` -> `nutrition_plans` + `nutrition_plan_meals`
--
-- ANTRENMANDAN FARKI: burada YAPISAL AYRISTIRMA YOKTUR. `items` alani iki
-- lehcede yazilmis serbest metindir:
--   Lehce A: "Yulaf:80, Tavuk Gogsu:200"        (virgul + iki nokta)
--   Lehce B: E'Yulaf Ezmesi 80g\nTavuk 200g'    (satir sonu, iki nokta yok)
-- Gun basina TEK satir (position = 0) saklanir: ham metin (`description`) +
-- kcal. Bu yuzden round-trip iddiasi da farklidir:
--   jsonb_build_object('items', description, 'total', kcal) == orijinal gun nesnesi
-- #############################################################################


-- =============================================================================
-- 11) BESLENME — TEMEL DONUSUM: beklenen plan ve ogun satiri sayisi
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set nutrition_plan = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g","total":1850},"Çarşamba":{"items":"Yulaf:80, Tavuk Göğsü:200","total":1900},"Pazar":{"items":"","total":0}}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_res    record;
  v_plans  int;
  v_meals  int;
  v_pos    int;
begin
  select * into v_res from public.migrate_nutrition_plans_from_profiles();

  if v_res.profiles_converted is distinct from 1 then
    raise exception 'BASARISIZ [Beslenme temel donusum - profil sayisi]: beklenen %, gelen %', 1, v_res.profiles_converted;
  end if;
  -- Gun basina TEK satir -> 3 gun = 3 satir (bos gun DAHIL: gun anahtari kaybolmaz).
  if v_res.meals_inserted is distinct from 3 then
    raise exception 'BASARISIZ [Beslenme temel donusum - ogun sayisi]: beklenen %, gelen %', 3, v_res.meals_inserted;
  end if;

  select count(*) into v_plans
    from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active and version = 1;
  if v_plans is distinct from 1 then
    raise exception 'BASARISIZ [Beslenme temel donusum - aktif plan satiri]: beklenen %, gelen %', 1, v_plans;
  end if;

  select count(*) into v_meals
    from public.nutrition_plan_meals m
    join public.nutrition_plans p on p.id = m.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222';
  if v_meals is distinct from 3 then
    raise exception 'BASARISIZ [Beslenme temel donusum - tablodaki ogun satiri]: beklenen %, gelen %', 3, v_meals;
  end if;

  -- Faz 1b sozlesmesi: gun basina tek satir, position HER ZAMAN 0.
  select count(*) into v_pos
    from public.nutrition_plan_meals m
    join public.nutrition_plans p on p.id = m.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222'
     and m.position <> 0;
  if v_pos is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme temel donusum - position]: Faz 1b''de tum satirlar position=0 olmali, % satir farkli', v_pos;
  end if;

  raise notice 'GECTI [11 - Beslenme temel donusum: 1 plan, 3 ogun satiri, position=0]';
end $$;

rollback;


-- =============================================================================
-- 12) BESLENME ROUND-TRIP KAYIPSIZLIGI (EN ONEMLI IDDIA)
--     description + kcal'dan yeniden kurulan jsonb, orijinal
--     nutrition_plan::jsonb ile BIREBIR esit olmali.
--     HER IKI LEHCE de ayni testte: virgul+iki nokta VE satir sonu.
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

-- Kasten "zor" metin:
--   Pazartesi : Lehce B (satir sonu) + Turkce karakter
--   Sali      : Lehce A (virgul + iki nokta) + BASTA/SONDA BOSLUK  <- btrim tuzagi
--   Carsamba  : parantez, tire, uzun tire, coklu bosluk
--   Persembe  : bos icerik (gun anahtari yine korunmali)
--   Pazar     : tek satir, sayi ile biten
update public.profiles
   set nutrition_plan = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g\nPirinç 150g","total":1850},"Salı":{"items":"  Yulaf:80, Tavuk Göğsü:200, Yoğurt:150  ","total":1780},"Çarşamba":{"items":"Omlet (3 yumurta) — 2 dilim ekmek\n   Ton Balığı  150g  ","total":1900},"Perşembe":{"items":"","total":0},"Pazar":{"items":"Serbest Öğün 1","total":2200}}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan     jsonb;
  v_plan_id  uuid;
  v_rebuilt  jsonb;
begin
  perform public.migrate_nutrition_plans_from_profiles();

  select nutrition_plan::jsonb into v_plan
    from public.profiles where id = '22222222-2222-2222-2222-222222222222';

  select id into v_plan_id
    from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  if v_plan_id is null then
    raise exception 'BASARISIZ [Beslenme round-trip]: aktif plan olusmadi';
  end if;

  -- Faz 1b: gun basina tek satir oldugu icin gun -> nesne dogrudan kurulur.
  select jsonb_object_agg(m.day, jsonb_build_object('items', m.description, 'total', m.kcal))
    into v_rebuilt
    from public.nutrition_plan_meals m
   where m.plan_id = v_plan_id;

  if v_rebuilt is distinct from v_plan then
    raise exception E'BASARISIZ [Beslenme round-trip]: KAYIPLI!\n--- beklenen ---\n%\n--- gelen ---\n%',
      v_plan::text, coalesce(v_rebuilt::text, '<NULL>');
  end if;

  -- Iki lehcenin de HAM hali korunmus olmali (btrim/normalize YAPILMAMALI).
  if not exists (
    select 1 from public.nutrition_plan_meals
     where plan_id = v_plan_id and day = 'Salı'
       and description = '  Yulaf:80, Tavuk Göğsü:200, Yoğurt:150  '
  ) then
    raise exception 'BASARISIZ [Beslenme round-trip - Lehce A ham metin]: bastaki/sondaki bosluk kaybolmus';
  end if;
  if not exists (
    select 1 from public.nutrition_plan_meals
     where plan_id = v_plan_id and day = 'Pazartesi'
       and description = E'Yulaf Ezmesi 80g\nTavuk Göğsü 200g\nPirinç 150g'
  ) then
    raise exception 'BASARISIZ [Beslenme round-trip - Lehce B ham metin]: satir sonlu metin bozulmus';
  end if;

  raise notice 'GECTI [12 - Beslenme round-trip BIREBIR kayipsiz (her iki lehce)]';
end $$;

rollback;


-- =============================================================================
-- 13) BESLENME — GECERSIZ `total`: kcal NULL olur, description KORUNUR
--     (sayi degil / negatif / kesirli / hic yok)
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

update public.profiles
   set nutrition_plan = $json${"Pazartesi":{"items":"Yulaf 80g","total":"cok"},"Salı":{"items":"Tavuk 200g","total":-5},"Çarşamba":{"items":"Somon 180g","total":1850.5},"Perşembe":{"items":"Kinoa 120g"},"Cuma":{"items":"Muz 1 adet","total":null},"Cumartesi":{"items":"Pizza 2 dilim","total":0}}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan_id uuid;
  v_rows    int;
  v_bad     int;
  v_kcal    integer;
begin
  perform public.migrate_nutrition_plans_from_profiles();

  select id into v_plan_id from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  -- 6 gunun HEPSI eklenmis olmali (ham metin kaybolmamali).
  select count(*) into v_rows from public.nutrition_plan_meals where plan_id = v_plan_id;
  if v_rows is distinct from 6 then
    raise exception 'BASARISIZ [Beslenme gecersiz total - satir sayisi]: beklenen 6, gelen %', v_rows;
  end if;

  -- Gecersiz 5 gunde kcal NULL olmali.
  select count(*) into v_bad
    from public.nutrition_plan_meals
   where plan_id = v_plan_id
     and day in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma')
     and kcal is null;
  if v_bad is distinct from 5 then
    raise exception 'BASARISIZ [Beslenme gecersiz total - kcal NULL]: beklenen 5 NULL, gelen %', v_bad;
  end if;

  -- Gecerli 0 degeri NULL'a DUSMEMELI (0 gecerli bir kaloridir).
  select kcal into v_kcal from public.nutrition_plan_meals
   where plan_id = v_plan_id and day = 'Cumartesi';
  if v_kcal is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme gecersiz total - total=0]: beklenen 0, gelen %', coalesce(v_kcal::text, '<NULL>');
  end if;

  -- description her satirda korunmus olmali.
  if not exists (
    select 1 from public.nutrition_plan_meals
     where plan_id = v_plan_id and day = 'Çarşamba' and description = 'Somon 180g'
  ) then
    raise exception 'BASARISIZ [Beslenme gecersiz total - description]: kesirli total''li gunun ham metni kaybolmus';
  end if;
  if not exists (
    select 1 from public.nutrition_plan_meals
     where plan_id = v_plan_id and day = 'Perşembe' and description = 'Kinoa 120g'
  ) then
    raise exception 'BASARISIZ [Beslenme gecersiz total - description]: total alani hic olmayan gunun ham metni kaybolmus';
  end if;

  raise notice 'GECTI [13 - Gecersiz/eksik total -> kcal NULL, description korundu]';
end $$;

rollback;


-- =============================================================================
-- 14) BESLENME — BOZUK JSON / JSON-DIZISI: hata VERMEZ, profil atlanir
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';
delete from public.nutrition_plans where client_id = '33333333-3333-3333-3333-333333333333';

-- A: sozdizimi bozuk JSON
update public.profiles
   set nutrition_plan = '{"Pazartesi": {"items": "Yulaf 80g", "total": 1850}'   -- kapanmayan suslu parantez
 where id = '22222222-2222-2222-2222-222222222222';

-- B: gecerli JSON ama NESNE degil (dizi) -> yine atlanmali
update public.profiles
   set nutrition_plan = '["Pazartesi", "Salı"]'
 where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_res   record;
  v_plans int;
begin
  -- Hata YUKSELMEMELI.
  select * into v_res from public.migrate_nutrition_plans_from_profiles();

  if v_res.profiles_converted is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme bozuk JSON - profil sayisi]: beklenen %, gelen %', 0, v_res.profiles_converted;
  end if;

  select count(*) into v_plans
    from public.nutrition_plans
   where client_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme bozuk JSON - plan satiri]: beklenen 0, gelen %', v_plans;
  end if;

  raise notice 'GECTI [14 - Bozuk JSON ve JSON-dizisi hata vermeden atlandi]';
end $$;

rollback;


-- =============================================================================
-- 15) BESLENME — NULL / BOS nutrition_plan: atlanir
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans;

update public.profiles set nutrition_plan = null  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set nutrition_plan = '   ' where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_res   record;
  v_plans int;
begin
  select * into v_res from public.migrate_nutrition_plans_from_profiles();

  if v_res.profiles_converted is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme NULL/bos plan - profil sayisi]: beklenen %, gelen %', 0, v_res.profiles_converted;
  end if;

  select count(*) into v_plans from public.nutrition_plans;
  if v_plans is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme NULL/bos plan - plan satiri]: beklenen 0, gelen %', v_plans;
  end if;

  raise notice 'GECTI [15 - NULL ve bosluk-only nutrition_plan atlandi]';
end $$;

rollback;


-- =============================================================================
-- 16) BESLENME — IDEMPOTENCY: donusumu iki kez cagir, satir sayisi DEGISMEZ
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans;

update public.profiles
   set nutrition_plan = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g","total":1850},"Çarşamba":{"items":"Yulaf:80, Tavuk:200","total":1900}}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_res1   record;
  v_res2   record;
  v_plans1 int;
  v_meals1 int;
  v_plans2 int;
  v_meals2 int;
begin
  select * into v_res1 from public.migrate_nutrition_plans_from_profiles();
  select count(*) into v_plans1 from public.nutrition_plans;
  select count(*) into v_meals1 from public.nutrition_plan_meals;

  -- Ikinci kez
  select * into v_res2 from public.migrate_nutrition_plans_from_profiles();
  select count(*) into v_plans2 from public.nutrition_plans;
  select count(*) into v_meals2 from public.nutrition_plan_meals;

  if v_res1.profiles_converted is distinct from 1 or v_res1.meals_inserted is distinct from 2 then
    raise exception 'BASARISIZ [Beslenme idempotency - ilk cagri]: beklenen 1 profil / 2 satir, gelen % / %',
      v_res1.profiles_converted, v_res1.meals_inserted;
  end if;

  if v_res2.profiles_converted is distinct from 0 or v_res2.meals_inserted is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme idempotency - ikinci cagri]: beklenen 0 profil / 0 satir, gelen % / %',
      v_res2.profiles_converted, v_res2.meals_inserted;
  end if;

  if v_plans1 is distinct from v_plans2 or v_meals1 is distinct from v_meals2 then
    raise exception 'BASARISIZ [Beslenme idempotency - satir sayisi degisti]: plan %/%, ogun %/%',
      v_plans1, v_plans2, v_meals1, v_meals2;
  end if;

  raise notice 'GECTI [16 - Beslenme idempotency: ikinci calistirma cogaltma yapmadi (% plan / % satir)]', v_plans2, v_meals2;
end $$;

rollback;


-- =============================================================================
-- 17) BESLENME — AKTIF PLAN TEKILLIGI (nutrition_plans_one_active_idx)
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_caught boolean := false;
  v_arch   int;
begin
  insert into public.nutrition_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 1, true);

  begin
    insert into public.nutrition_plans (client_id, version, is_active)
    values ('22222222-2222-2222-2222-222222222222', 2, true);
  exception when unique_violation then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'BASARISIZ [Beslenme aktif plan tekilligi]: ikinci AKTIF plan eklendi (unique index ihlali beklenirken hata alinmadi)';
  end if;

  -- Kismi indeks: is_active = false satirlar SINIRSIZ olabilmeli (Faz 2 versiyon arsivi).
  insert into public.nutrition_plans (client_id, version, is_active)
  values ('22222222-2222-2222-2222-222222222222', 2, false),
         ('22222222-2222-2222-2222-222222222222', 3, false);

  select count(*) into v_arch
    from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and not is_active;
  if v_arch is distinct from 2 then
    raise exception 'BASARISIZ [Beslenme aktif plan tekilligi - pasif plan arsivi]: beklenen 2, gelen %', v_arch;
  end if;

  raise notice 'GECTI [17 - Beslenme aktif plan tekilligi zorunlu, pasif plan arsivi serbest]';
end $$;

rollback;


-- =============================================================================
-- 18) BESLENME — TEK YAZICI: save_nutrition_plan() ile donusum AYNI sonucu uretir
--     Kanit: ayni gun nesneleri hem eski JSON yolundan hem RPC yolundan
--     gecirildiginde (day, position, description, kcal) kolonlari BIREBIR ayni
--     cikiyor -> ikinci bir yazma implementasyonu YOK.
-- =============================================================================
begin;

update public.profiles set nutrition_plan = null;
delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';
delete from public.nutrition_plans where client_id = '33333333-3333-3333-3333-333333333333';

-- Iki lehce + gecersiz total + bos gun ayni testte.
update public.profiles
   set nutrition_plan = $json${"Pazartesi":{"items":"Yulaf Ezmesi 80g\nTavuk Göğsü 200g","total":1850},"Salı":{"items":"  Yulaf:80, Yoğurt:150  ","total":1780},"Çarşamba":{"items":"Somon 180g","total":"cok"},"Perşembe":{"items":"","total":0}}$json$
 where id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_diff int;
  v_n    int;
begin
  -- Yol 1: eski JSON kolonundan donusum (Danisan A)
  perform public.migrate_nutrition_plans_from_profiles();

  -- Yol 2: RPC (Danisan B) - AYNI jsonb
  perform public.save_nutrition_plan(
    array['33333333-3333-3333-3333-333333333333']::uuid[],
    (select nutrition_plan::jsonb from public.profiles where id = '22222222-2222-2222-2222-222222222222')
  );

  select count(*) into v_n
    from public.nutrition_plan_meals m
    join public.nutrition_plans p on p.id = m.plan_id
   where p.client_id = '22222222-2222-2222-2222-222222222222';
  if v_n is distinct from 4 then
    raise exception 'BASARISIZ [Beslenme tek yazici - donusum satir sayisi]: beklenen 4, gelen %', v_n;
  end if;

  select count(*) into v_diff from (
    (select m.day, m.position, m.description, m.kcal
       from public.nutrition_plan_meals m
       join public.nutrition_plans p on p.id = m.plan_id
      where p.client_id = '22222222-2222-2222-2222-222222222222'
     except all
     select m.day, m.position, m.description, m.kcal
       from public.nutrition_plan_meals m
       join public.nutrition_plans p on p.id = m.plan_id
      where p.client_id = '33333333-3333-3333-3333-333333333333')
    union all
    (select m.day, m.position, m.description, m.kcal
       from public.nutrition_plan_meals m
       join public.nutrition_plans p on p.id = m.plan_id
      where p.client_id = '33333333-3333-3333-3333-333333333333'
     except all
     select m.day, m.position, m.description, m.kcal
       from public.nutrition_plan_meals m
       join public.nutrition_plans p on p.id = m.plan_id
      where p.client_id = '22222222-2222-2222-2222-222222222222')
  ) d;

  if v_diff is distinct from 0 then
    raise exception 'BASARISIZ [Beslenme tek yazici]: donusum ve save_nutrition_plan farkli sonuc uretti (% farkli satir)', v_diff;
  end if;

  raise notice 'GECTI [18 - Donusum ve save_nutrition_plan AYNI yaziciyi kullaniyor]';
end $$;

rollback;


-- =============================================================================
-- 19) BESLENME — save_nutrition_plan() YENI VERSIYON URETMEZ + gecersiz gun HATA verir
-- =============================================================================
begin;

delete from public.nutrition_plans where client_id = '22222222-2222-2222-2222-222222222222';

do $$
declare
  v_plan_id_1 uuid;
  v_plan_id_2 uuid;
  v_plans     int;
  v_rows      int;
  v_affected  int;
  v_caught    boolean := false;
begin
  v_affected := public.save_nutrition_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object(
      'Pazartesi', jsonb_build_object('items', E'Yulaf 80g\nTavuk 200g', 'total', 1850),
      'Çarşamba',  jsonb_build_object('items', 'Yulaf:80, Tavuk:200',    'total', 1900)
    )
  );
  if v_affected is distinct from 1 then
    raise exception 'BASARISIZ [save_nutrition_plan - donen sayi]: beklenen 1, gelen %', v_affected;
  end if;

  select id into v_plan_id_1 from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  -- Ikinci kaydetme: yeni versiyon URETMEMELI, ayni plan satirini kullanmali.
  perform public.save_nutrition_plan(
    array['22222222-2222-2222-2222-222222222222']::uuid[],
    jsonb_build_object('Pazar', jsonb_build_object('items', 'Serbest Öğün', 'total', 2200))
  );

  select id into v_plan_id_2 from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222' and is_active;

  if v_plan_id_1 is distinct from v_plan_id_2 then
    raise exception 'BASARISIZ [save_nutrition_plan - plan kimligi degisti]: % -> % (Faz 1b''de yeni versiyon URETILMEZ)', v_plan_id_1, v_plan_id_2;
  end if;

  select count(*) into v_plans from public.nutrition_plans
   where client_id = '22222222-2222-2222-2222-222222222222';
  if v_plans is distinct from 1 then
    raise exception 'BASARISIZ [save_nutrition_plan - plan satiri sayisi]: beklenen 1, gelen %', v_plans;
  end if;

  -- Eski satirlar TAMAMEN silinmis, yalnizca yeni icerik kalmis olmali.
  select count(*) into v_rows from public.nutrition_plan_meals where plan_id = v_plan_id_2;
  if v_rows is distinct from 1 then
    raise exception 'BASARISIZ [save_nutrition_plan - eski satirlar silinmedi]: beklenen 1, gelen %', v_rows;
  end if;
  if not exists (
    select 1 from public.nutrition_plan_meals
     where plan_id = v_plan_id_2 and day = 'Pazar' and position = 0
       and description = 'Serbest Öğün' and kcal = 2200
  ) then
    raise exception 'BASARISIZ [save_nutrition_plan - yeni icerik]: beklenen satir bulunamadi';
  end if;

  -- YAZMA YOLUNDA SESSIZ VERI KAYBI YOK: gecersiz gun anahtari HATA verir.
  begin
    perform public.save_nutrition_plan(
      array['22222222-2222-2222-2222-222222222222']::uuid[],
      jsonb_build_object('Monday', jsonb_build_object('items', 'Oats', 'total', 100))
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'BASARISIZ [save_nutrition_plan - gecersiz gun]: hata bekleniyordu, alinmadi';
  end if;

  raise notice 'GECTI [19 - save_nutrition_plan aktif versiyonu yeniden yaziyor, gecersiz gun hata veriyor]';
end $$;

rollback;


-- #############################################################################
-- FAZ 1b / ADIM 4 — MESAJLARIN KONUSMA ANAHTARI BACKFILL'I
-- (supabase/migrations/20260817140000_messages_conversation_key.sql §4)
--
-- `public.backfill_messages_conversation_key()` client_id (konusmanin danisan
-- tarafi) ve read_at (is_read=true icin created_at) kolonlarini doldurur.
--
-- "ESKI SEKILLI" SATIR URETME NOTU: `client_id` bugun NOT NULL ve
-- messages_apply_conversation_key trigger'i her INSERT/UPDATE'te
-- turetiyor/dogruluyor. Eski sekilli (client_id=null, read_at=null) bir satir
-- uretebilmek icin:
--   1) ONCE normal bir INSERT yapilir (trigger client_id'yi turetir, boylece
--      NOT NULL kisitlamasi ihlal edilmez).
--   2) `client_id` kolonunun NOT NULL kisitlamasi TRANSACTION ICINDE kaldirilir.
--   3) Trigger GECICI OLARAK DEVRE DISI BIRAKILIR -- aksi halde
--      `update ... set client_id = null` ifadesi `update of ... client_id` ile
--      trigger'i tekrar TETIKLER ve NULL'i hemen A'ya geri TURETIR; yani
--      trigger acikken client_id hicbir zaman NULL'a CEKILEMEZ.
--   4) update sonrasi trigger yeniden ETKINLESTIRILIR.
-- Tum bu adimlar transaction icindedir; ROLLBACK ile gercek semaya (NOT NULL
-- kisitlamasi ve trigger durumu dahil) HICBIR KALICI ETKISI YOKTUR.
--
-- SAYIM GUVENILIRLIGI: `client_id` gercek (persist edilmis) semada NOT NULL
-- oldugu icin, bu transaction disinda HICBIR satirin client_id'si NULL olamaz
-- (kisitlama bunu imkansiz kilar). Bu yuzden asagidaki senaryolarda beklenen
-- sayilar (client_ids_filled, rows_skipped, ...) yalnizca BU senaryonun
-- kendi eklediği satirlari yansitir -- calisma sirasindan veya onceki
-- test/e2e calismalarindan ETKILENMEZ.
-- #############################################################################


-- =============================================================================
-- 20) MESAJLAR — TEMEL BACKFILL: client_id ve read_at (is_read=true icin) dolar
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, is_read, created_at)
values
  ('f0000000-0000-0000-0000-000000000201'::uuid, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'TRANSFORM testi - okunmus eski satir',   true,  now() - interval '10 days'),
  ('f0000000-0000-0000-0000-000000000202'::uuid, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'TRANSFORM testi - okunmamis eski satir', false, now() - interval '9 days');

alter table public.messages alter column client_id drop not null;
alter table public.messages disable trigger messages_apply_conversation_key;

-- FAZ 2b NOTU (20260817190300_message_read_state.sql):
--   `read_at` KANONİK / `is_read` TÜREV invaryantı, bu senaryonun simüle ettiği
--   ESKİ ŞEKİLLİ satırı (`is_read = true` iken `read_at IS NULL`) artık
--   İMKÂNSIZ kılıyor. `backfill_messages_conversation_key()` tam olarak o eski
--   dünyanın onarım aracıdır, dolayısıyla ESKİ DÜNYADA test edilmelidir:
--   normalleştirme trigger'ı ve kısıt İŞLEM SÜRESİNCE kaldırılır. Geri
--   AÇILMAZLAR — backfill'in kendisi de eski-şekilli satırlar üzerinde
--   çalışmalıdır; `rollback` ikisini de geri getirir (DDL işlemseldir).
alter table public.messages drop constraint messages_read_state_chk;
alter table public.messages disable trigger messages_sync_read_state;

update public.messages
   set client_id = null, read_at = null
 where id in ('f0000000-0000-0000-0000-000000000201'::uuid, 'f0000000-0000-0000-0000-000000000202'::uuid);

alter table public.messages enable trigger messages_apply_conversation_key;

do $$
declare
  v_res          record;
  v_read_true    timestamptz;
  v_created_true timestamptz;
  v_read_false   timestamptz;
  v_cid_true     uuid;
  v_cid_false    uuid;
begin
  select * into v_res from public.backfill_messages_conversation_key();

  if v_res.client_ids_filled is distinct from 2 then
    raise exception 'BASARISIZ [20 - Backfill client_ids_filled]: beklenen 2, gelen %', v_res.client_ids_filled;
  end if;
  if v_res.rows_skipped is distinct from 0 then
    raise exception 'BASARISIZ [20 - Backfill rows_skipped]: beklenen 0, gelen %', v_res.rows_skipped;
  end if;
  if v_res.read_ats_filled is distinct from 1 then
    raise exception 'BASARISIZ [20 - Backfill read_ats_filled]: beklenen 1, gelen %', v_res.read_ats_filled;
  end if;

  select read_at, created_at, client_id into v_read_true, v_created_true, v_cid_true
    from public.messages where id = 'f0000000-0000-0000-0000-000000000201'::uuid;
  select read_at, client_id into v_read_false, v_cid_false
    from public.messages where id = 'f0000000-0000-0000-0000-000000000202'::uuid;

  if v_read_true is distinct from v_created_true then
    raise exception 'BASARISIZ [20 - is_read=true read_at=created_at]: beklenen %, gelen %', v_created_true, v_read_true;
  end if;
  if v_read_false is not null then
    raise exception 'BASARISIZ [20 - is_read=false read_at NULL kalmali]: gelen %', v_read_false;
  end if;
  if v_cid_true is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [20 - okunmus satirin client_id si A]: beklenen %, gelen %', '22222222-2222-2222-2222-222222222222'::uuid, v_cid_true;
  end if;
  if v_cid_false is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'BASARISIZ [20 - okunmamis satirin client_id si A]: beklenen %, gelen %', '22222222-2222-2222-2222-222222222222'::uuid, v_cid_false;
  end if;

  raise notice 'GECTI [20 - Mesaj backfill: client_id=2, read_at=1, atlanan=0]';
end $$;

rollback;


-- =============================================================================
-- 21) MESAJLAR — IDEMPOTENCY: backfill iki kez cagrilinca ikinci cagri no-op doner
-- =============================================================================
begin;

insert into public.messages (id, sender_id, receiver_id, message, is_read, created_at)
values
  ('f0000000-0000-0000-0000-000000000211'::uuid, '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'TRANSFORM testi - idempotency okunmus',   true,  now() - interval '8 days'),
  ('f0000000-0000-0000-0000-000000000212'::uuid, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'TRANSFORM testi - idempotency okunmamis', false, now() - interval '7 days');

alter table public.messages alter column client_id drop not null;
alter table public.messages disable trigger messages_apply_conversation_key;

-- FAZ 2b: bkz. senaryo 20'deki not — eski şekilli satır ancak invaryant
-- geçici olarak kaldırıldığında üretilebilir (`rollback` geri getirir).
alter table public.messages drop constraint messages_read_state_chk;
alter table public.messages disable trigger messages_sync_read_state;

update public.messages
   set client_id = null, read_at = null
 where id in ('f0000000-0000-0000-0000-000000000211'::uuid, 'f0000000-0000-0000-0000-000000000212'::uuid);

alter table public.messages enable trigger messages_apply_conversation_key;

do $$
declare
  v_res1         record;
  v_res2         record;
  v_read_after_1 timestamptz;
  v_read_after_2 timestamptz;
  v_cid_after_1  uuid;
  v_cid_after_2  uuid;
begin
  select * into v_res1 from public.backfill_messages_conversation_key();

  select read_at, client_id into v_read_after_1, v_cid_after_1
    from public.messages where id = 'f0000000-0000-0000-0000-000000000211'::uuid;

  -- Ikinci cagri
  select * into v_res2 from public.backfill_messages_conversation_key();

  select read_at, client_id into v_read_after_2, v_cid_after_2
    from public.messages where id = 'f0000000-0000-0000-0000-000000000211'::uuid;

  if v_res2.client_ids_filled is distinct from 0
     or v_res2.read_ats_filled is distinct from 0
     or v_res2.rows_skipped   is distinct from 0 then
    raise exception 'BASARISIZ [21 - Idempotency ikinci cagri]: beklenen (0,0,0), gelen (%,%,%)',
      v_res2.client_ids_filled, v_res2.read_ats_filled, v_res2.rows_skipped;
  end if;

  if v_read_after_1 is distinct from v_read_after_2 then
    raise exception 'BASARISIZ [21 - Idempotency read_at degisti]: ilk=%, ikinci=%', v_read_after_1, v_read_after_2;
  end if;
  if v_cid_after_1 is distinct from v_cid_after_2 then
    raise exception 'BASARISIZ [21 - Idempotency client_id degisti]: ilk=%, ikinci=%', v_cid_after_1, v_cid_after_2;
  end if;

  raise notice 'GECTI [21 - Mesaj backfill idempotent: ikinci cagri (0,0,0) doner]';
end $$;

rollback;


-- =============================================================================
-- 22) MESAJLAR — ATLANAN SATIR: konusmanin danisan tarafi belirlenemeyen satir
-- (sender=receiver=koc) backfill tarafindan ATLANIR, client_id NULL kalir.
-- =============================================================================
begin;

alter table public.messages alter column client_id drop not null;
alter table public.messages disable trigger messages_apply_conversation_key;

insert into public.messages (id, sender_id, receiver_id, message, is_read, client_id, read_at, created_at)
values (
  'f0000000-0000-0000-0000-000000000221'::uuid,
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'TRANSFORM testi - koc-koc atlanan satir',
  false,
  null,
  null,
  now() - interval '6 days'
);

alter table public.messages enable trigger messages_apply_conversation_key;

do $$
declare
  v_res record;
  v_cid uuid;
begin
  select * into v_res from public.backfill_messages_conversation_key();

  if v_res.rows_skipped is distinct from 1 then
    raise exception 'BASARISIZ [22 - Atlanan satir rows_skipped]: beklenen 1, gelen %', v_res.rows_skipped;
  end if;
  if v_res.client_ids_filled is distinct from 0 then
    raise exception 'BASARISIZ [22 - Atlanan satir client_ids_filled bu satiri saymamali]: beklenen 0, gelen %', v_res.client_ids_filled;
  end if;

  select client_id into v_cid from public.messages where id = 'f0000000-0000-0000-0000-000000000221'::uuid;
  if v_cid is not null then
    raise exception 'BASARISIZ [22 - Atlanan satirin client_id si NULL kalmali]: gelen %', v_cid;
  end if;

  raise notice 'GECTI [22 - Cozulemeyen satir backfill tarafindan atlaniyor (rows_skipped=1)]';
end $$;

rollback;


-- =============================================================================
-- 23) FORM CHECK INCELEME — BACKFILL KURALI: eski sekilli satirlar 'pending' olur
--
-- "Eski sekilli satir" = migration oncesi form_checks satiri, yani inceleme
-- alanlarinin HICBIRI verilmemis satir. Migration'dan sonra bu satir kolon
-- varsayilanini alir ('pending') ve backfill fonksiyonu ONA DOKUNMAZ --
-- uydurulacak bir gecmis yoktur (bkz. migration 20260817150000 §4).
-- =============================================================================
begin;

insert into public.form_checks (id, client_id, current_weight, notes, created_at)
values
  ('b0000000-0000-0000-0000-000000000231'::uuid, '22222222-2222-2222-2222-222222222222', 91.10, 'TRANSFORM testi - eski sekilli satir 1', now() - interval '9 days'),
  ('b0000000-0000-0000-0000-000000000232'::uuid, '33333333-3333-3333-3333-333333333333', 62.20, 'TRANSFORM testi - eski sekilli satir 2', now() - interval '8 days');

do $$
declare
  v_res      record;
  v_status1  public.form_check_status;
  v_status2  public.form_check_status;
  v_at1      timestamptz;
  v_by1      uuid;
begin
  select status, reviewed_at, reviewed_by into v_status1, v_at1, v_by1
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000231'::uuid;
  select status into v_status2
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000232'::uuid;

  if v_status1 is distinct from 'pending'::public.form_check_status
     or v_status2 is distinct from 'pending'::public.form_check_status then
    raise exception 'BASARISIZ [23 - eski sekilli satir pending olmali]: gelen %, %', v_status1, v_status2;
  end if;
  if v_at1 is not null or v_by1 is not null then
    raise exception 'BASARISIZ [23 - eski satirda denetim izi UYDURULMAMALI]: reviewed_at=%, reviewed_by=%', v_at1, v_by1;
  end if;

  -- Backfill bu satirlara DOKUNMAZ (0 demote, 0 clean).
  select * into v_res from public.backfill_form_check_review();
  if v_res.rows_demoted is distinct from 0 or v_res.rows_cleaned is distinct from 0 then
    raise exception 'BASARISIZ [23 - backfill eski satirlara dokunmamali]: demoted=%, cleaned=%',
      v_res.rows_demoted, v_res.rows_cleaned;
  end if;

  select status into v_status1
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000231'::uuid;
  if v_status1 is distinct from 'pending'::public.form_check_status then
    raise exception 'BASARISIZ [23 - backfill sonrasi hala pending olmali]: gelen %', v_status1;
  end if;

  raise notice 'GECTI [23 - Eski sekilli form_checks satirlari pending olur, gecmis UYDURULMAZ]';
end $$;

rollback;


-- =============================================================================
-- 24) FORM CHECK INCELEME — TUTARLILIK KISITI ihlalleri REDDEDILIR
--
-- Uc hal de `form_checks_review_consistency_chk` tarafindan reddedilmeli:
--   a) status='reviewed' ama reviewed_at NULL
--   b) status='reviewed' ama reviewed_by NULL
--   c) status='pending'  ama reviewed_at DOLU
--
-- NOT: bu satirlar `postgres` rolüyle (auth.uid() NULL) yazilir, yani
-- form_checks_guard_review trigger'i degerlere DOKUNMAZ -> reddi yapan
-- gercekten CHECK kisitidir, trigger degil.
-- =============================================================================
begin;

do $$
declare
  v_a boolean := false;
  v_b boolean := false;
  v_c boolean := false;
begin
  -- a) reviewed ama reviewed_at NULL
  begin
    insert into public.form_checks (id, client_id, current_weight, status, reviewed_at, reviewed_by)
    values ('b0000000-0000-0000-0000-000000000241'::uuid, '22222222-2222-2222-2222-222222222222', 91.20,
            'reviewed'::public.form_check_status, null, '11111111-1111-1111-1111-111111111111');
  exception when check_violation then
    v_a := true;
  end;

  -- b) reviewed ama reviewed_by NULL
  begin
    insert into public.form_checks (id, client_id, current_weight, status, reviewed_at, reviewed_by)
    values ('b0000000-0000-0000-0000-000000000242'::uuid, '22222222-2222-2222-2222-222222222222', 91.30,
            'reviewed'::public.form_check_status, now(), null);
  exception when check_violation then
    v_b := true;
  end;

  -- c) pending ama reviewed_at DOLU
  begin
    insert into public.form_checks (id, client_id, current_weight, status, reviewed_at, reviewed_by)
    values ('b0000000-0000-0000-0000-000000000243'::uuid, '22222222-2222-2222-2222-222222222222', 91.40,
            'pending'::public.form_check_status, now(), null);
  exception when check_violation then
    v_c := true;
  end;

  if not v_a then
    raise exception 'BASARISIZ [24a - reviewed + reviewed_at NULL kabul edildi]';
  end if;
  if not v_b then
    raise exception 'BASARISIZ [24b - reviewed + reviewed_by NULL kabul edildi]';
  end if;
  if not v_c then
    raise exception 'BASARISIZ [24c - pending + reviewed_at DOLU kabul edildi]';
  end if;

  raise notice 'GECTI [24 - Tutarlilik kisiti: reviewed/pending ile reviewed_at/by uyumsuzlugu REDDEDILIR]';
end $$;

rollback;


-- =============================================================================
-- 25) FORM CHECK INCELEME — BACKFILL ONARIMI (kisit gecici olarak DUSURULMUS)
--
-- Kisit yerindeyken bozuk satir OLUSAMAZ. Onarim mantigini kanitlamak icin
-- kisit BU ISLEM ICINDE dusurulur, bozuk satirlar yazilir, backfill cagrilir.
-- Islem `rollback` ile bittigi icin kisit KALICI OLARAK KAYBOLMAZ.
--   * Kanitsiz 'reviewed' (reviewed_at ve reviewed_by IKISI DE NULL) -> 'pending'
--   * Kalintili 'pending'  (reviewed_at/by dolu)                     -> temizlenir
--   * KISMEN dolu 'reviewed' (biri NULL)                             -> DOKUNULMAZ
-- =============================================================================
begin;

alter table public.form_checks drop constraint form_checks_review_consistency_chk;

insert into public.form_checks (id, client_id, current_weight, notes, status, coach_feedback, reviewed_at, reviewed_by)
values
  -- kanitsiz reviewed -> pending'e cekilmeli
  ('b0000000-0000-0000-0000-000000000251'::uuid, '22222222-2222-2222-2222-222222222222', 91.50,
   'TRANSFORM testi - kanitsiz reviewed', 'reviewed'::public.form_check_status, null, null, null),
  -- kalintili pending -> temizlenmeli
  ('b0000000-0000-0000-0000-000000000252'::uuid, '22222222-2222-2222-2222-222222222222', 91.60,
   'TRANSFORM testi - kalintili pending', 'pending'::public.form_check_status, null,
   now() - interval '3 days', '11111111-1111-1111-1111-111111111111'),
  -- kismen dolu reviewed -> DOKUNULMAMALI (gercek iz var, silmek veri kaybi olur)
  ('b0000000-0000-0000-0000-000000000253'::uuid, '22222222-2222-2222-2222-222222222222', 91.70,
   'TRANSFORM testi - kismen dolu reviewed', 'reviewed'::public.form_check_status, 'Yarim iz',
   now() - interval '4 days', null);

do $$
declare
  v_res     record;
  v_s1      public.form_check_status;
  v_s2      public.form_check_status;
  v_at2     timestamptz;
  v_by2     uuid;
  v_s3      public.form_check_status;
  v_at3     timestamptz;
begin
  select * into v_res from public.backfill_form_check_review();

  if v_res.rows_demoted is distinct from 1 then
    raise exception 'BASARISIZ [25 - kanitsiz reviewed pending e cekilmeli]: rows_demoted=%', v_res.rows_demoted;
  end if;
  if v_res.rows_cleaned is distinct from 1 then
    raise exception 'BASARISIZ [25 - kalintili pending temizlenmeli]: rows_cleaned=%', v_res.rows_cleaned;
  end if;

  select status into v_s1 from public.form_checks where id = 'b0000000-0000-0000-0000-000000000251'::uuid;
  if v_s1 is distinct from 'pending'::public.form_check_status then
    raise exception 'BASARISIZ [25 - 251 pending olmali]: gelen %', v_s1;
  end if;

  select status, reviewed_at, reviewed_by into v_s2, v_at2, v_by2
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000252'::uuid;
  if v_s2 is distinct from 'pending'::public.form_check_status or v_at2 is not null or v_by2 is not null then
    raise exception 'BASARISIZ [25 - 252 temizlenmeli]: status=%, reviewed_at=%, reviewed_by=%', v_s2, v_at2, v_by2;
  end if;

  select status, reviewed_at into v_s3, v_at3
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000253'::uuid;
  if v_s3 is distinct from 'reviewed'::public.form_check_status or v_at3 is null then
    raise exception 'BASARISIZ [25 - 253 kismen dolu satira DOKUNULMAMALI]: status=%, reviewed_at=%', v_s3, v_at3;
  end if;

  raise notice 'GECTI [25 - Backfill onarimi: kanitsiz reviewed -> pending, kalinti temizlenir, KISMEN dolu satir korunur]';
end $$;

rollback;


-- =============================================================================
-- 26) FORM CHECK INCELEME — IDEMPOTENCY: ikinci cagri (0, 0) doner ve
-- gercek incelemeleri BOZMAZ
-- =============================================================================
begin;

alter table public.form_checks drop constraint form_checks_review_consistency_chk;

insert into public.form_checks (id, client_id, current_weight, notes, status, coach_feedback, reviewed_at, reviewed_by)
values
  ('b0000000-0000-0000-0000-000000000261'::uuid, '22222222-2222-2222-2222-222222222222', 91.80,
   'TRANSFORM testi - idempotency kanitsiz', 'reviewed'::public.form_check_status, null, null, null),
  -- GERCEK inceleme: backfill buna ASLA dokunmamali
  ('b0000000-0000-0000-0000-000000000262'::uuid, '22222222-2222-2222-2222-222222222222', 91.90,
   'TRANSFORM testi - idempotency gercek inceleme', 'reviewed'::public.form_check_status, 'Gercek geri bildirim',
   timestamptz '2026-08-10 12:00:00+00', '11111111-1111-1111-1111-111111111111');

do $$
declare
  v_res1  record;
  v_res2  record;
  v_at_1  timestamptz;
  v_at_2  timestamptz;
  v_fb    text;
begin
  select * into v_res1 from public.backfill_form_check_review();
  select reviewed_at into v_at_1 from public.form_checks where id = 'b0000000-0000-0000-0000-000000000262'::uuid;

  select * into v_res2 from public.backfill_form_check_review();
  select reviewed_at, coach_feedback into v_at_2, v_fb
    from public.form_checks where id = 'b0000000-0000-0000-0000-000000000262'::uuid;

  if v_res1.rows_demoted is distinct from 1 then
    raise exception 'BASARISIZ [26 - ilk cagri kanitsiz satiri cekmeli]: rows_demoted=%', v_res1.rows_demoted;
  end if;
  if v_res2.rows_demoted is distinct from 0 or v_res2.rows_cleaned is distinct from 0 then
    raise exception 'BASARISIZ [26 - ikinci cagri no-op olmali]: beklenen (0,0), gelen (%,%)',
      v_res2.rows_demoted, v_res2.rows_cleaned;
  end if;
  if v_res1.rows_pending is distinct from v_res2.rows_pending
     or v_res1.rows_reviewed is distinct from v_res2.rows_reviewed then
    raise exception 'BASARISIZ [26 - dagilim degisti]: ilk (%,%), ikinci (%,%)',
      v_res1.rows_pending, v_res1.rows_reviewed, v_res2.rows_pending, v_res2.rows_reviewed;
  end if;
  if v_at_1 is distinct from timestamptz '2026-08-10 12:00:00+00'
     or v_at_2 is distinct from timestamptz '2026-08-10 12:00:00+00' then
    raise exception 'BASARISIZ [26 - gercek inceleme bozuldu]: ilk=%, ikinci=%', v_at_1, v_at_2;
  end if;
  if v_fb is distinct from 'Gercek geri bildirim' then
    raise exception 'BASARISIZ [26 - coach_feedback korunmali]: gelen %', v_fb;
  end if;

  raise notice 'GECTI [26 - form_checks backfill idempotent: ikinci cagri (0,0) doner, gercek incelemeler korunur]';
end $$;

rollback;


-- =============================================================================
-- TOPLAM OZET
-- Bu noktaya yalnizca YUKARIDAKI 26 senaryonun HEPSI GECTI verdiyse ulasilir --
-- herhangi biri BASARISIZ olsaydi raise exception + ON_ERROR_STOP psql'i
-- daha once sifirdan farkli cikis koduyla durdururdu.
--   * 1–10  : Faz 1b Adim 1 — workout_plans / workout_plan_exercises
--   * 11–19 : Faz 1b Adim 3a — nutrition_plans / nutrition_plan_meals
--   * 20–22 : Faz 1b Adim 4 — messages.client_id / read_at backfill
--   * 23–26 : Faz 1b Adim 5 — form_checks inceleme durumu (backfill + tutarlilik kisiti)
-- =============================================================================
do $$
begin
  raise notice 'TUM TRANSFORM TESTLERI GECTI (26 senaryo)';
end $$;
