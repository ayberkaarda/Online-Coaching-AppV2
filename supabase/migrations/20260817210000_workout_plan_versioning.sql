-- =============================================================================
-- 20260817210000_workout_plan_versioning.sql
--
-- FAZ 2 — PLAN YAYINLAMA = YENİ `version`, ESKİ `is_active = false`
--
-- KAYNAK (active_planprogram.md §4.1, madde 1):
--   "Koç: haftalık plan CRUD; plan yayınlama = yeni `version`, eski versiyon
--    `is_active=false` (GEÇMİŞ LOGLAR ESKİ VERSİYONA BAĞLI KALIR — FK
--    versiyonlu satıra)."
--
-- =============================================================================
-- ÖLÇÜLEN MEVCUT DAVRANIŞ (bu migration'dan ÖNCE) — GERÇEK VERİ KAYBI
-- =============================================================================
-- `save_workout_plan()` (20260817110000) bugün şunu yapıyor:
--     1) danışanın AKTİF planını bulur (yoksa version=1 ile açar),
--     2) `updated_at`'i tazeler,
--     3) **`workout_plan_exercises` satırlarını SİLER ve YENİDEN YAZAR**.
--
-- `workout_logs.plan_exercise_id` FK'si `ON DELETE SET NULL`'dur
-- (20260817190000). Yani 3. adım her çalıştığında, o plan satırlarına bağlı
-- TÜM GEÇMİŞ LOGLARIN PLAN BAĞI KOPAR: log satırı yaşar ama `plan_exercise_id`
-- NULL'a düşer ve geriye yalnızca serbest metin `exercise_name` etiketi kalır.
-- Koç bir plan üzerinde çalışırken her "Kaydet" tıklaması danışanın antrenman
-- geçmişinin plan bağını siliyordu. §4.1'in parantez içindeki garantisi
-- ("geçmiş loglar eski versiyona bağlı kalır") SAĞLANMIYORDU.
--
-- Bu migration o garantiyi kurar.
--
--
-- =============================================================================
-- KARAR 1 — HER KAYDETME YENİ VERSİYON ÜRETMELİ Mİ? (planın belirsizliği)
-- =============================================================================
-- Plan "plan YAYINLAMA = yeni version" diyor. Ama uygulamada YAYINLAMA diye
-- ayrı bir eylem YOK: tek yazma yolu `save_workout_plan(p_client_ids, p_plan)`
-- ve bu imza "kaydet" ile "yayınla"yı ayırt edecek bir parametre TAŞIMIYOR.
-- İmzayı değiştirmek `src/hooks/usePlans.ts` -> `useSaveWorkoutPlan`'i kırardı
-- (bkz. KARAR 3).
--
-- DEĞERLENDİRİLEN ÜÇ SEÇENEK:
--
--   A) HER kaydetme yeni versiyon.
--      -> Planın harfini karşılar ama koç bir planı düzenlerken 10 kez
--         kaydederse 10 versiyon + 10 kat egzersiz satırı birikir. Bu
--         versiyonların HİÇBİRİ bir şeyi korumaz (kimse onlara bağlı değil) ve
--         `version` sayacı "koçun kaç kez Kaydet'e bastığı"nı ölçen anlamsız
--         bir sayıya döner. Üründe versiyon gezgini de yok: arşiv görünmez çöp.
--
--   B) İçerik değişmişse yeni versiyon (metin karşılaştırması).
--      -> Yalnızca kazara çift kaydetmeyi eler. Koç 10 FARKLI ara düzenleme
--         yaparsa yine 10 versiyon oluşur; asıl sorunu çözmez.
--
--   C) *** SEÇİLEN *** COPY-ON-WRITE: bir versiyon, ÜZERİNE GEÇMİŞ DÜŞTÜĞÜ AN
--      DONAR. Aktif planın satırlarına bağlı en az bir `workout_logs` satırı
--      varsa kaydetme bir YAYINLAMADIR: eski plan `is_active=false` yapılır,
--      satırlarına DOKUNULMAZ ve `version+1` ile yeni bir plan açılır.
--      Hiç log bağlı değilse plan hâlâ fiilen bir TASLAKTIR: satırları
--      yerinde yeniden yazılır (kimsenin bağlı olmadığı satırları silmek
--      hiçbir şey kaybettirmez).
--
-- NEDEN C:
--   * Planın PARANTEZ İÇİNDEKİ GARANTİSİNİ — "geçmiş loglar eski versiyona
--     bağlı kalır" — HER ZAMAN ve TAM olarak sağlar. Yeni versiyon tam olarak
--     bu garantinin gerektirdiği anda üretilir, ne bir önce ne bir sonra.
--   * Versiyon sayısı "koç kaç kez tıkladı" ile değil, "danışan bu plana karşı
--     kaç kez fiilen antrenman yaptı" ile orantılıdır. `version` böylece
--     ANLAMLI bir sayı olur: v3 = danışan bu plandan üç kez geçti.
--   * Çift tıklamayı KENDİLİĞİNDEN eler: bir yayından hemen sonra yeni aktif
--     versiyonun henüz logu yoktur, dolayısıyla ikinci kaydetme taslak dalına
--     düşer ve v4 üretmez. Ek bir "aynı mı?" karşılaştırması gerekmez.
--   * İmza KORUNUR (KARAR 3), yani hiçbir istemci dosyasına dokunulmaz.
--
-- C'NİN KABUL EDİLEN BEDELİ (dürüstçe): koçun bir plan üzerindeki ARA
--   düzenlemeleri arşivlenmez — versiyon geçmişi bir "her keystroke" denetim
--   izi DEĞİL, "danışanın gerçekten çalıştığı planların" geçmişidir. Plan
--   düzenlemeleri için ayrı bir denetim izi istenirse bu ayrı bir iştir
--   (`workout_plan_revisions`); bugün böyle bir gereksinim §4.1'de YOK.
--
--
-- =============================================================================
-- KARAR 2 — `save_nutrition_plan()` DEĞİŞTİRİLMEDİ (bilinçli KAPSAM SINIRI)
-- =============================================================================
-- `nutrition_plans` de `version`/`is_active` taşır ve `save_nutrition_plan()`
-- birebir aynı sil-yeniden-yaz desenindedir. Yine de DEĞİŞTİRİLMEDİ:
--
--   * ASIL GEREKÇE — SEÇİLEN SEMANTİK ORADA NO-OP OLURDU. C kuralı
--     "satırlarına bağlı geçmiş varsa dondur" der. Beslenme tarafında plan
--     satırına bağlanan HİÇBİR FK YOKTUR: `nutrition_logs`
--     (20260817190100) `client_id` + serbest metin `description` tutar,
--     `nutrition_plan_meals`'e referans VERMEZ — kaynakta doğrulandı; o
--     migration'ın kendisi "nutrition_plan_meals bir ŞABLONDUR, bu tablo
--     LOG'dur" diye yazar. Yani beslenme planına C uygulansaydı "geçmiş var mı"
--     sorusu HER ZAMAN false döner, kod hiç yeni versiyon üretmez ve bugünkü
--     davranış birebir korunurdu. Ölü kod eklemek tutarlılık değildir.
--   * §4.1 versiyonlama cümlesi ANTRENMAN başlığı altındadır; §4.2 (Beslenme)
--     yalnızca "günlük makro hedefi + öğün şablonu CRUD" der, versiyon
--     yayınlamadan HİÇ söz etmez. Plan burada bilinçli olarak asimetriktir.
--   * Veri kaybı riski yoktur: beslenme planı satırlarının silinip yeniden
--     yazılması hiçbir log satırının bağını koparmaz.
--
-- GERİ DÖNÜŞ KOŞULU (şemaya yazıldı, aşağıdaki `comment on` ile):
--   `nutrition_logs`'a (veya başka bir tabloya) `nutrition_plan_meals`'e
--   işaret eden bir FK eklendiği GÜN, `save_nutrition_plan()` de bu
--   migration'daki desene çevrilmelidir — aksi hâlde AYNI veri kaybı beslenme
--   tarafında açılır.
--
--
-- =============================================================================
-- KARAR 3 — RPC İMZASI KORUNDU: `(uuid[], jsonb) -> integer`
-- =============================================================================
-- `src/hooks/usePlans.ts` `rpc('save_workout_plan', { p_client_ids, p_plan })`
-- çağırıyor ve o dosya bu turun sahipliğinde DEĞİL. İmzaya bir `p_publish
-- boolean` eklemek (varsayılanlı olsa bile) iki soruna yol açardı:
--   * "Yayınla" diye bir UI eylemi olmadığı için parametre HER ZAMAN
--     varsayılan değerini alırdı — yani gerçek bir ayrım üretmez, sadece
--     ölü bir API yüzeyi olurdu;
--   * `supabase gen types` çıktısı değişir, tip sürüklenmesi oluşurdu.
-- KARAR 1'deki C seçeneği ayrımı PARAMETREDEN DEĞİL VERİDEN türettiği için
-- imza olduğu gibi korundu: `create or replace function` aynı imzayı yeniden
-- tanımlar, GRANT'lar ve çağıran kod hiç etkilenmez.
--
--
-- =============================================================================
-- KARAR 4 — SIRALAMA: `workout_plans_one_active_idx` İHLAL EDİLMEZ
-- =============================================================================
-- `unique (client_id) where is_active` kısmi tekil indeksi canlı veritabanında
-- doğrulandı (`pg_indexes`). Bu indeks `is_active=false` arşiv satırlarına
-- sınırsız izin verir — yani ihtiyacımız olan tam şey — ama iki AKTİF satıra
-- asla izin vermez. Bu yüzden gövdedeki SIRA ZORUNLUDUR:
--     1) ÖNCE eski satır `is_active = false` yapılır (UPDATE),
--     2) SONRA yeni satır `is_active = true` ile açılır (INSERT).
-- Ters sırada INSERT anında 23505 verirdi. İndeks `deferrable` DEĞİLDİR;
-- ifade sınırında kontrol edilir, ama iki ifade arasında ara bir "iki aktif"
-- durumu oluşmadığı için sorun çıkmaz.
--
--
-- =============================================================================
-- KARAR 5 — TOPLU ATAMADA VERSİYON HER DANIŞAN İÇİN AYRI İLERLER
-- =============================================================================
-- `p_client_ids uuid[]` sayesinde koç aynı planı N danışana yazabilir.
-- `version` GLOBAL DEĞİL, DANIŞAN BAŞINA bir sayaçtır: yeni değer daima
-- `max(version) + 1` ile ve YALNIZCA o danışanın satırlarından hesaplanır.
-- Danışan A'nın v3'ü ile danışan B'nin v1'i aynı çağrıda üretilebilir.
-- Yeni `workout_plans_client_version_uniq` indeksi bunu ŞEMADA kilitler.
--
-- Idempotenttir (`create or replace function`, `create index if not exists`).
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) (client_id, version) TEKİLLİĞİ — versiyon sayacı ŞEMADA kilitlenir   ##
-- #############################################################################
--    Neden gerekli: yeni versiyon numarası `max(version) + 1` ile hesaplanır ve
--    bu SELECT `save_workout_plan()` SECURITY INVOKER olduğu için ÇAĞIRANIN
--    RLS'i altında koşar. Meşru iki çağırıcı (koç ve danışanın kendisi) o
--    danışanın TÜM plan satırlarını görür, dolayısıyla sayaç doğrudur. Ama bu
--    doğruluk iki ayrı politikanın uyumuna dayanır; politika ileride
--    daraltılırsa (§3.2'ye dönüş) sayaç KÖR kalıp aynı numarayı ikinci kez
--    üretebilirdi. Bu indeks o durumu SESSİZ BOZULMA yerine 23505 hatasına
--    çevirir: fail-closed.
create unique index if not exists workout_plans_client_version_uniq
  on public.workout_plans (client_id, version);

comment on index public.workout_plans_client_version_uniq
  is 'Versiyon sayacı danışan BAŞINA tekildir (toplu atamada her danışan bağımsız ilerler). max(version)+1 hesabı RLS altında koştuğu için bu indeks fail-closed emniyet kemeridir.';


-- #############################################################################
-- ## 2) public.workout_plan_has_history(plan_id) -> boolean                  ##
-- #############################################################################
--    "Bu planın satırlarına bağlı en az bir antrenman logu var mı?"
--    KARAR 1/C'nin dallanma koşulu budur.
--
--    ##########################################################################
--    # NEDEN `SECURITY DEFINER` — FAIL-OPEN OLAMAZ                            #
--    #                                                                        #
--    # Bu bir GÖRÜNÜRLÜK değil BÜTÜNLÜK sorusudur; desen                      #
--    # `workout_logs_guard_plan_exercise()` (20260817190000 §4) ile birebir   #
--    # aynıdır. Kontrol INVOKER olsaydı ve `workout_logs` RLS'i çağırandan    #
--    # tek bir satırı bile gizleseydi, fonksiyon "geçmiş yok" der,            #
--    # `save_workout_plan()` taslak dalına düşer ve TAM DA ÖNLEMEK İÇİN       #
--    # YAZILDIĞIMIZ veri kaybını yapardı. Yani INVOKER'da hata modu           #
--    # FAIL-OPEN'dır — kabul edilemez.                                        #
--    #                                                                        #
--    # Sızıntı yüzeyi: fonksiyon yalnızca bir BOOLEAN döner ve girdisi bir    #
--    # `plan_id`'dir. Başkasının plan id'si RLS yüzünden zaten okunamaz;      #
--    # okunsa bile "bu plana log düşmüş mü" bilgisi bir veri değil bir        #
--    # durum bitidir. `STABLE`'dır: aynı ifade içinde tekrar çağrılmaz.       #
--    ##########################################################################
create or replace function public.workout_plan_has_history(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.workout_logs wl
      join public.workout_plan_exercises wpe on wpe.id = wl.plan_exercise_id
     where wpe.plan_id = p_plan_id
  );
$$;

comment on function public.workout_plan_has_history(uuid)
  is 'Planın satırlarına bağlı en az bir workout_logs satırı var mı? save_workout_plan() bu cevaba göre YAYINLAR (yeni versiyon) ya da taslağı yerinde yeniden yazar. SECURITY DEFINER: bütünlük sorusudur, RLS körlüğünde FAIL-OPEN olamaz.';

revoke all     on function public.workout_plan_has_history(uuid) from public;
grant  execute on function public.workout_plan_has_history(uuid) to authenticated, service_role;


-- #############################################################################
-- ## 3) public.save_workout_plan(client_ids, plan) — VERSİYONLU YAYINLAMA    ##
-- #############################################################################
--    İMZA DEĞİŞMEDİ (KARAR 3). Doğrulama bloğu ve hata mesajları birebir
--    korundu; DEĞİŞEN YALNIZCA danışan döngüsünün gövdesidir.
--
--    Danışan başına üç dal:
--      (a) AKTİF PLAN YOK   -> `max(version)+1` (arşiv varsa onun üstünden,
--                              yoksa 1) ile yeni aktif plan açılır.
--      (b) AKTİF PLAN VAR + GEÇMİŞ VAR -> **YAYINLAMA**: eski plan
--                              `is_active=false` yapılır, SATIRLARINA
--                              DOKUNULMAZ (geçmiş loglar bağlı kalır),
--                              `version+1` ile yeni aktif plan açılır.
--                              `notes` yeni versiyona TAŞINIR (RPC notes
--                              parametresi almadığı için aksi hâlde sessizce
--                              kaybolurdu).
--      (c) AKTİF PLAN VAR + GEÇMİŞ YOK -> TASLAK: satırlar yerinde silinip
--                              yeniden yazılır (Faz 1b davranışı). Hiçbir log
--                              bu satırlara bağlı olmadığı için kayıp yoktur.
create or replace function public.save_workout_plan(
  p_client_ids uuid[],
  p_plan       jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid;
  v_plan_id   uuid;
  v_notes     text;
  v_next      integer;
  v_day       text;
  v_text      text;
  v_count     integer := 0;
begin
  if p_client_ids is null or coalesce(array_length(p_client_ids, 1), 0) = 0 then
    raise exception 'save_workout_plan: en az bir danışan seçilmelidir.' using errcode = '22023';
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'save_workout_plan: p_plan bir JSON nesnesi olmalıdır.' using errcode = '22023';
  end if;

  -- Bilinmeyen gün anahtarı SESSİZCE YUTULMAZ: yazma yolunda sessiz veri kaybı
  -- kabul edilemez. (Dönüşüm yolunda ise eski veriyi kurtarmak için atlanır.)
  -- Doğrulama TOPTAN, hiçbir satır yazılmadan ÖNCE yapılır.
  for v_day in select key from jsonb_each_text(p_plan) loop
    if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
      raise exception 'save_workout_plan: geçersiz gün anahtarı %.', v_day using errcode = '22023';
    end if;
  end loop;

  foreach v_client_id in array p_client_ids loop
    if v_client_id is null then
      raise exception 'save_workout_plan: client_id NULL olamaz.' using errcode = '22023';
    end if;

    -- Aktif plan var mı? (RLS: başkasının planı burada GÖRÜNMEZ -> aşağıdaki
    -- INSERT devreye girer ve WITH CHECK ihlaliyle hata yükselir.)
    select wp.id, wp.notes
      into v_plan_id, v_notes
      from public.workout_plans wp
     where wp.client_id = v_client_id
       and wp.is_active
     limit 1;

    if v_plan_id is not null and public.workout_plan_has_history(v_plan_id) then
      -- ---- (b) YAYINLAMA -------------------------------------------------
      -- SIRA ÖNEMLİ (KARAR 4): önce deaktivasyon, sonra yeni aktif satır.
      update public.workout_plans
         set is_active = false
       where id = v_plan_id;

      -- Eski planın satırları SİLİNMEZ: `workout_logs.plan_exercise_id`
      -- (ON DELETE SET NULL) onlara bağlı kalır. §4.1'in garantisi budur.
      v_plan_id := null;
    elsif v_plan_id is not null then
      -- ---- (c) TASLAK ----------------------------------------------------
      update public.workout_plans
         set updated_at = now()
       where id = v_plan_id;

      delete from public.workout_plan_exercises where plan_id = v_plan_id;
    end if;

    if v_plan_id is null then
      -- ---- (a) veya (b)'nin devamı: YENİ AKTİF VERSİYON ------------------
      -- Sayaç DANIŞAN BAŞINADIR (KARAR 5) ve arşiv satırlarını da kapsar.
      select coalesce(max(wp.version), 0) + 1
        into v_next
        from public.workout_plans wp
       where wp.client_id = v_client_id;

      insert into public.workout_plans (client_id, version, is_active, notes)
      values (v_client_id, v_next, true, v_notes)
      returning id into v_plan_id;
    end if;

    for v_day, v_text in select key, value from jsonb_each_text(p_plan) loop
      perform public.explode_plan_day(v_plan_id, v_day, v_text);
    end loop;

    v_notes := null;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.save_workout_plan(uuid[], jsonb)
  is 'Antrenman planı kaydetme/yayınlama RPC''si. SECURITY INVOKER (RLS uygulanır). Faz 2: aktif planın satırlarına bağlı bir workout_logs satırı VARSA kaydetme bir YAYINLAMADIR — eski plan is_active=false yapılır, satırları KORUNUR (geçmiş loglar bağlı kalır) ve version+1 ile yeni aktif plan açılır. Geçmiş yoksa plan hâlâ taslaktır, satırları yerinde yeniden yazılır.';

revoke all     on function public.save_workout_plan(uuid[], jsonb) from public;
grant  execute on function public.save_workout_plan(uuid[], jsonb) to authenticated, service_role;


-- #############################################################################
-- ## 4) Kolon/tablo yorumları — ANLAM ŞEMADA yaşar, yalnızca dokümanda değil ##
-- #############################################################################
comment on table public.workout_plans
  is 'Danışan başına VERSİYONLANMIŞ antrenman planı başlığı. Aynı anda en fazla BİR aktif plan (workout_plans_one_active_idx); is_active=false satırlar geçmiş logların bağlı olduğu arşiv versiyonlarıdır ve SİLİNMEZ.';

comment on column public.workout_plans.version
  is 'Plan versiyonu (1''den başlar), DANIŞAN BAŞINA sayaç. Faz 2''den beri: aktif plana bağlı bir antrenman logu varken kaydetmek YAYINLAMADIR ve version+1 ile yeni satır açar; logu olmayan (taslak) plan yerinde güncellenir, versiyon artmaz. Böylece version "koç kaç kez kaydetti"yi değil "danışan kaç plandan geçti"yi ölçer.';

comment on column public.workout_plans.is_active
  is 'Aktif plan. workout_plans_one_active_idx kısmi tekil indeksi danışan başına en fazla bir aktif plan garanti eder. false = arşiv versiyonu: okuma yolları (usePlans/useWorkoutSession, is_active=true filtreli) görmez ama workout_logs.plan_exercise_id satırlarına bağlı kalır.';

-- KARAR 2'nin geri dönüş koşulu ŞEMAYA yazılır: bu yorumu okumadan beslenme
-- tarafına FK eklenmesin.
comment on table public.nutrition_plans
  is 'Danışan başına beslenme planı başlığı. BİLİNÇLİ OLARAK VERSİYONLANMAZ (bkz. 20260817210000_workout_plan_versioning.sql KARAR 2): nutrition_plan_meals satırlarına işaret eden HİÇBİR FK yoktur (nutrition_logs serbest metin tutar), bu yüzden satırların yerinde yeniden yazılması hiçbir geçmişin bağını koparmaz. nutrition_plan_meals''e bir FK eklendiği gün save_nutrition_plan() de antrenman tarafındaki copy-on-write desenine çevrilmelidir.';

comment on column public.nutrition_plans.version
  is 'Plan versiyonu (1''den başlar). BUGÜN HER ZAMAN 1''dir: save_nutrition_plan() yeni versiyon üretmez (gerekçe: nutrition_plans tablo yorumu). Kolon, beslenme tarafına da geçmiş bağı geldiğinde şema değişmeden versiyonlamaya geçilebilsin diye durur.';

comment on function public.save_nutrition_plan(uuid[], jsonb)
  is 'Beslenme planı kaydetme RPC''si. SECURITY INVOKER (RLS uygulanır). Aktif versiyonun satırları silinip yeniden yazılır, YENİ VERSİYON ÜRETİLMEZ — bu bilinçli bir kapsam sınırıdır (20260817210000 KARAR 2): plan satırlarına bağlı hiçbir FK/log olmadığı için versiyonlamanın koruyacağı bir geçmiş yoktur.';


-- #############################################################################
-- ## 5) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
--    YALNIZCA YAPISAL kontroller. Davranış (yayınlama turu + FK'nin korunması)
--    burada DEĞİL `supabase/tests/rls.test.sql` senaryo 100–104'te ölçülür:
--    migration gövdesi gerçek bir veritabanında koşar ve oraya test verisi
--    yazmamalıdır (plpgsql SAVEPOINT/ROLLBACK da kullanamaz).
do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'workout_plans_client_version_uniq' and relkind = 'i'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_plans_client_version_uniq indeksi yok';
  end if;

  -- Kısmi tekil indeks yayınlamanın ÖN KOŞULUDUR: arşiv satırlarına izin
  -- vermeseydi eski versiyon saklanamazdı.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname  = 'workout_plans_one_active_idx'
       and indexdef ilike '%unique%'
       and indexdef ilike '%where is_active%'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_plans_one_active_idx kismi tekil indeksi yok/degismis';
  end if;

  if not exists (
    select 1 from pg_proc p
     where p.proname = 'workout_plan_has_history'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef          -- SECURITY DEFINER olmak ZORUNDA (fail-open riski)
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_plan_has_history yok veya SECURITY DEFINER degil';
  end if;

  if exists (
    select 1 from pg_proc p
     where p.proname = 'save_workout_plan'
       and p.pronamespace = 'public'::regnamespace
       and p.prosecdef          -- INVOKER kalmalı: RLS ÇAĞIRANA uygulanır
  ) then
    raise exception 'DOGRULAMA BASARISIZ: save_workout_plan SECURITY DEFINER olmus -- RLS baypasi';
  end if;

  -- Bu migration'ın çözdüğü sorunun kaynağı: FK `ON DELETE SET NULL`'dır.
  -- Değişmediğini burada kilitliyoruz — çünkü "satırları silme" kuralının
  -- gerekçesi tam olarak budur.
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_plan_exercise_id_fkey'
       and conrelid = 'public.workout_logs'::regclass
       and confdeltype = 'n'   -- 'n' = SET NULL
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_logs -> workout_plan_exercises FK yok veya ON DELETE SET NULL degil';
  end if;

  raise notice 'save_workout_plan versiyonlu yayinlamaya cevrildi (copy-on-write); arsiv satirlari korunuyor.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: geri alma §4.1'in "geçmiş loglar eski versiyona bağlı kalır"
-- -- garantisini YENİDEN KAPATIR — `save_workout_plan()` tekrar plan satırlarını
-- -- silip yazan sürüme döner ve her kaydetme geçmiş logların
-- -- `plan_exercise_id` bağını NULL'a düşürmeye başlar.
-- --
-- -- Zaten oluşmuş ARŞİV versiyonları (is_active=false satırlar) SİLİNMEZ:
-- -- onlara bağlı loglar vardır. Geri almadan sonra da olduğu yerde kalırlar;
-- -- okuma yolları is_active=true filtrelediği için görünmezler.
-- =============================================================================
--
-- begin;
--
-- -- 1) Faz 1b sürümüne dön (sil-yeniden-yaz).
-- create or replace function public.save_workout_plan(
--   p_client_ids uuid[],
--   p_plan       jsonb
-- )
-- returns integer
-- language plpgsql
-- security invoker
-- set search_path = public, pg_temp
-- as $fn$
-- declare
--   v_client_id uuid;
--   v_plan_id   uuid;
--   v_day       text;
--   v_text      text;
--   v_count     integer := 0;
-- begin
--   if p_client_ids is null or coalesce(array_length(p_client_ids, 1), 0) = 0 then
--     raise exception 'save_workout_plan: en az bir danışan seçilmelidir.' using errcode = '22023';
--   end if;
--   if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
--     raise exception 'save_workout_plan: p_plan bir JSON nesnesi olmalıdır.' using errcode = '22023';
--   end if;
--   for v_day in select key from jsonb_each_text(p_plan) loop
--     if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
--       raise exception 'save_workout_plan: geçersiz gün anahtarı %.', v_day using errcode = '22023';
--     end if;
--   end loop;
--   foreach v_client_id in array p_client_ids loop
--     if v_client_id is null then
--       raise exception 'save_workout_plan: client_id NULL olamaz.' using errcode = '22023';
--     end if;
--     select wp.id into v_plan_id from public.workout_plans wp
--      where wp.client_id = v_client_id and wp.is_active limit 1;
--     if v_plan_id is null then
--       insert into public.workout_plans (client_id, version, is_active)
--       values (v_client_id, 1, true) returning id into v_plan_id;
--     else
--       update public.workout_plans set updated_at = now() where id = v_plan_id;
--     end if;
--     delete from public.workout_plan_exercises where plan_id = v_plan_id;
--     for v_day, v_text in select key, value from jsonb_each_text(p_plan) loop
--       perform public.explode_plan_day(v_plan_id, v_day, v_text);
--     end loop;
--     v_count := v_count + 1;
--   end loop;
--   return v_count;
-- end;
-- $fn$;
--
-- -- 2) Yardımcı fonksiyon ve indeks.
-- drop function if exists public.workout_plan_has_history(uuid);
-- drop index    if exists public.workout_plans_client_version_uniq;
--
-- -- 3) Yorumları Faz 1b hâline döndür.
-- comment on table  public.workout_plans is 'Danışan başına antrenman planı başlığı. Faz 1b: her danışanın en fazla BİR aktif planı olur; versiyon-yayınlama semantiği Faz 2''ye bırakılmıştır.';
-- comment on column public.workout_plans.version is 'Plan versiyonu (1''den başlar). Faz 1b''de her zaman 1''dir — kaydetme aktif versiyonun satırlarını değiştirir, yeni versiyon üretmez.';
--
-- commit;
--
-- =============================================================================
