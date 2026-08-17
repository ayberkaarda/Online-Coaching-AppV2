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


-- =============================================================================
-- TOPLAM OZET
-- Bu noktaya yalnizca YUKARIDAKI 19 senaryonun HEPSI GECTI verdiyse ulasilir --
-- herhangi biri BASARISIZ olsaydi raise exception + ON_ERROR_STOP psql'i
-- daha once sifirdan farkli cikis koduyla durdururdu.
--   * 1–10  : Faz 1b Adim 1 — workout_plans / workout_plan_exercises
--   * 11–19 : Faz 1b Adim 3a — nutrition_plans / nutrition_plan_meals
-- =============================================================================
do $$
begin
  raise notice 'TUM TRANSFORM TESTLERI GECTI (19 senaryo)';
end $$;
