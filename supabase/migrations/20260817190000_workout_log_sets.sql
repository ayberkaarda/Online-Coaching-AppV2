-- =============================================================================
-- 20260817190000_workout_log_sets.sql
--
-- FAZ 2b — ŞEMA TAMAMLAMA / 1: `workout_logs` SET BAZLI LOG
--
-- KAYNAK (active_planprogram.md §4.1):
--   * "Öğrenci: günün antrenmanı, video embed, SET BAZLI LOG GİRİŞİ"
--   * "Tamamlama: tüm setler girilince `workout_logs.completed_at` set edilir"
--   * "plan yayınlama = yeni `version` ... GEÇMİŞ LOGLAR ESKİ VERSİYONA BAĞLI
--      KALIR — FK versiyonlu satıra"
--
-- ÖLÇÜLEN MEVCUT DURUM (düzeltmeden ÖNCE, canlı `\d public.workout_logs`):
--   id, client_id, exercise_name (not null), weight_kg, reps, rpe, created_at
--   -> satır başına BİR SET tutuluyor, ama (a) setin kaçıncı set olduğu,
--      (b) hangi PLAN SATIRINA ait olduğu, (c) tamamlanma bilgisi YOK.
--
-- EKLENEN ÜÇ KOLON:
--   set_number       integer   — gün içindeki set sırası (1'den başlar)
--   plan_exercise_id uuid      — workout_plan_exercises(id) FK, NULLABLE
--   completed_at     timestamptz — antrenman oturumunun tamamlanma anı
--
--
-- ###########################################################################
-- # KARAR 1 — `completed_at` OTURUM MU, SET Mİ? (planın belirsizliği)       #
-- #                                                                          #
-- # Plan iki şeyi AYNI ANDA söylüyor ve bunlar bugünkü şemada çelişiyor:     #
-- #   (a) kolonun adresi `workout_logs.completed_at` (satır = BİR SET),      #
-- #   (b) tetikleyicisi "TÜM SETLER girilince" (bu bir OTURUM kavramı).      #
-- #                                                                          #
-- # DEĞERLENDİRİLEN ÜÇ SEÇENEK:                                              #
-- #   A) Satır başına "bu set bitti" damgası.                                #
-- #      -> (b)'yi karşılamaz: "tüm setler" diye bir küme tanımlanmaz.       #
-- #   B) Ayrı `workout_sessions` tablosu + `workout_logs.session_id`.        #
-- #      -> (a)'yı ihlal eder (plan kolonu workout_logs'ta konumluyor) VE    #
-- #         `src/hooks/useWorkoutLogs.ts` + tüketicilerinin "satır = set"    #
-- #         sözleşmesini kırar. O dosyalar bu turun sahipliğinde DEĞİL.      #
-- #         Ayrıca plan §3.1'in `workout_logs`/`workout_log_sets` ayrımı     #
-- #         bugünkü tabloyu BAŞLIK tablosuna çevirmeyi gerektirirdi —        #
-- #         mevcut 68 satırlık veri ve tüm okuma yolu yeniden yazılırdı.     #
-- #   C) *** SEÇİLEN *** Anlam OTURUM seviyesindedir, KOLON set satırında    #
-- #      yaşar (denormalize damga): bir antrenman bitirildiğinde o oturuma   #
-- #      ait TÜM set satırlarına AYNI `completed_at` yazılır.                #
-- #                                                                          #
-- # NEDEN C:                                                                 #
-- #   * Planın iki cümlesini de birebir karşılar: kolon `workout_logs`ta     #
-- #     ve "tüm setler girilince" tek bir UPDATE ile gerçekleşir.            #
-- #   * `completed_at IS NULL` = "set girildi ama antrenman henüz            #
-- #     bitirilmedi" (taslak/devam eden oturum). Anlamlı ve sorgulanabilir.  #
-- #   * KAYIPSIZ YÜKSELTİLEBİLİR: ileride gerçekten `workout_sessions`       #
-- #     tablosu gerekirse oturumlar `select distinct client_id, completed_at`#
-- #     ile TAM olarak geri üretilir — bugün veri uydurulmuyor.              #
-- #   * Hiçbir mevcut hook/bileşen sözleşmesi kırılmıyor (kolon eklemesi).   #
-- #                                                                          #
-- # C'NİN KABUL EDİLEN BEDELİ (dürüstçe): "oturum" bir tablo değil, bir      #
-- #   `(client_id, completed_at)` ÇİFTİDİR. İki farklı antrenman aynı        #
-- #   mikrosaniyede bitirilirse tek oturum sanılır — pratikte imkânsıza      #
-- #   yakın, ve olsa bile yalnızca gruplamayı etkiler, veri kaybı yoktur.    #
-- ###########################################################################
--
--
-- ###########################################################################
-- # KARAR 2 — FK NEDEN NULLABLE, `exercise_name` NEDEN DURUYOR              #
-- #                                                                          #
-- # Mevcut satırların TAMAMI `exercise_name` serbest metniyle yazılmış ve    #
-- # hiçbirinin plan satırıyla bağı YOK (o bağı kuracak bilgi hiç             #
-- # saklanmamış). FK'yi NOT NULL yapmak = mevcut veriyi ya silmek ya da      #
-- # uydurulmuş bir plan satırına bağlamak. İkisi de kabul edilemez.          #
-- #                                                                          #
-- # active_planprogram.md §3.5 kuralı: "eski kolonlar aynı migration'da DROP #
-- # EDİLMEZ; bir faz boyunca DEPRECATED yorumuyla yan yana yaşar."           #
-- # `exercise_name` bu yüzden DEPRECATED işaretlenir ama DROP EDİLMEZ ve     #
-- # NOT NULL kalır (plan dışı / serbest setlerin TEK etiketi odur).          #
-- #                                                                          #
-- # `ON DELETE SET NULL` — NEDEN `CASCADE` DEĞİL:                            #
-- #   `save_workout_plan()` (20260817110000) planın TÜM egzersiz satırlarını #
-- #   silip yeniden yazar. CASCADE olsaydı koç planı her kaydettiğinde       #
-- #   danışanın GEÇMİŞ LOGLARI SİLİNİRDİ. SET NULL'da log satırı yaşar,      #
-- #   yalnızca plan bağı kopar ve `exercise_name` etiketi devreye girer.     #
-- #   Plan §4.1'in "geçmiş loglar eski versiyona bağlı kalır" garantisi      #
-- #   Faz 2'de versiyon-yayınlama (eski satırları SİLMEYEN yeni versiyon)    #
-- #   geldiğinde tam anlamıyla sağlanır; bugün FK zaten VERSİYONLU satıra    #
-- #   (belirli bir `plan_id`'ye ait `workout_plan_exercises` satırına)       #
-- #   işaret ediyor, plan başlığına değil.                                   #
-- ###########################################################################
--
-- Idempotenttir (`add column if not exists`, `create index if not exists`,
-- `drop trigger if exists` + `create trigger`, kısıt guard'ları).
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) Kolonlar                                                             ##
-- #############################################################################
alter table public.workout_logs
  add column if not exists set_number       integer,
  add column if not exists plan_exercise_id uuid,
  add column if not exists completed_at     timestamptz;

-- FK ayrı ekleniyor: `add column ... references` idempotent değildir.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_plan_exercise_id_fkey'
       and conrelid = 'public.workout_logs'::regclass
  ) then
    alter table public.workout_logs
      add constraint workout_logs_plan_exercise_id_fkey
      foreign key (plan_exercise_id)
      references public.workout_plan_exercises (id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_set_number_chk'
       and conrelid = 'public.workout_logs'::regclass
  ) then
    alter table public.workout_logs
      add constraint workout_logs_set_number_chk check (set_number is null or set_number > 0);
  end if;
end
$$;

--   `completed_at >= created_at` KISITI BİLİNÇLİ OLARAK EKLENMEDİ: damgayı
--   istemci üretiyor ve istemci saati sunucudan birkaç saniye geride olabilir.
--   Böyle bir kısıt gerçek bir veri hatası yerine SAAT KAYMASI yüzünden
--   patlardı — meşru bir akışı kıran kısıt, kısıt değil hatadır.


-- #############################################################################
-- ## 2) İndeksler                                                            ##
-- #############################################################################
--   FK'ye indeks (plan §3.1 "her FK'ye indeks"): kısmi, çünkü satırların
--   çoğunluğu (tüm geçmiş) NULL taşıyor ve NULL'lar sorgulanmıyor.
create index if not exists workout_logs_plan_exercise_idx
  on public.workout_logs (plan_exercise_id)
  where plan_exercise_id is not null;

--   "Tamamlanmış antrenmanlarım" / oturum listesi sorgusu.
create index if not exists workout_logs_client_completed_idx
  on public.workout_logs (client_id, completed_at desc)
  where completed_at is not null;


-- #############################################################################
-- ## 3) Kolon yorumları — anlam ŞEMADA yaşar, yalnızca dokümanda değil       ##
-- #############################################################################
comment on column public.workout_logs.set_number
  is 'Gün/oturum içindeki set sırası (1''den başlar). NULL = Faz 2b ÖNCESİ satırlar: sıra bilgisi hiç saklanmamıştı, uydurulmadı.';

comment on column public.workout_logs.plan_exercise_id
  is 'Setin ait olduğu VERSİYONLU plan satırı (workout_plan_exercises.id). NULLABLE: plan dışı (serbest) setler ve Faz 2b öncesi geçmiş loglar için NULL''dur. ON DELETE SET NULL — save_workout_plan() plan satırlarını silip yeniden yazdığı için CASCADE geçmiş logları yok ederdi.';

comment on column public.workout_logs.completed_at
  is 'ANTRENMAN OTURUMUNUN tamamlanma anı; oturuma ait TÜM set satırlarına AYNI değer yazılır (denormalize damga — ayrı workout_sessions tablosu YOK, gerekçe migration başlığında). NULL = set girildi ama antrenman henüz bitirilmedi. Oturumlar `select distinct client_id, completed_at ... where completed_at is not null` ile kayıpsız geri üretilir.';

comment on column public.workout_logs.exercise_name
  is 'DEPRECATED (Faz 2b): plan bağı için kanonik kaynak plan_exercise_id''dir. DROP EDİLMEZ — plan dışı/serbest setlerin ve Faz 2b öncesi tüm geçmiş logların TEK etiketi budur (§3.5: eski kolon bir faz boyunca yan yana yaşar). DROP kararı ancak plan dışı setlere de bir etiket kaynağı geldiğinde verilebilir.';


-- #############################################################################
-- ## 4) BÜTÜNLÜK KORUMASI — FK BAŞKA DANIŞANIN PLANINA İŞARET EDEMEZ         ##
-- #############################################################################
--    ##########################################################################
--    # NEDEN GEREKLİ — RLS BUNU KAPATMAZ                                      #
--    #                                                                        #
--    # `workout_logs_insert` politikası yalnızca `client_id = auth.uid()`     #
--    # kontrolü yapar; `plan_exercise_id`'nin HANGİ danışanın planına ait     #
--    # olduğuna BAKMAZ. Yani danışan A, kendi log satırına danışan B'nin plan #
--    # satırının id'sini yazabilirdi. Doğrudan bir okuma sızıntısı değildir   #
--    # (B'nin plan satırını yine okuyamaz), ama:                              #
--    #   * koçun ekranında A'nın logu B'nin egzersizine bağlı görünür,        #
--    #   * "bu plan satırına kaç log düştü" sorgusu YALAN söyler,             #
--    #   * `on delete set null` üzerinden B'nin plan düzenlemesi A'nın        #
--    #     logunun bağını koparır (çapraz danışan yan etkisi).                #
--    #                                                                        #
--    # Postgres'te FK'ye koşul yazılamaz, CHECK başka tabloya bakamaz ->      #
--    # kontrol BEFORE trigger'ına taşınır. Proje kalıbı budur (bkz. 4d/4e).   #
--    #                                                                        #
--    # SECURITY DEFINER — NEDEN: kontrol bir GÖRÜNÜRLÜK sorusu değil bir      #
--    # SAHİPLİK sorusudur. INVOKER olsaydı koç yolunda (koç her planı görür)  #
--    # kontrol boşa düşerdi; DEFINER'da kural HERKES için aynıdır.            #
--    # `is_end_user_write()` guard'ı BİLEREK KULLANILMADI: bu bir yetki       #
--    # kuralı değil, bir VERİ BÜTÜNLÜĞÜ kuralıdır — seed ve service_role da   #
--    # tutarsız satır yazamamalıdır.                                          #
--    ##########################################################################
create or replace function public.workout_logs_guard_plan_exercise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if new.plan_exercise_id is null then
    return new;
  end if;

  select wp.client_id
    into v_owner
    from public.workout_plan_exercises wpe
    join public.workout_plans wp on wp.id = wpe.plan_id
   where wpe.id = new.plan_exercise_id;

  if v_owner is null then
    -- FK zaten yakalar; buraya yalnızca yarış durumunda düşülür.
    raise exception 'workout_logs: plan_exercise_id (%) bir plan satirina cozulemedi.', new.plan_exercise_id
      using errcode = '23503';
  end if;

  if v_owner is distinct from new.client_id then
    raise exception 'workout_logs: plan_exercise_id BASKA bir danisanin planina ait (log sahibi %, plan sahibi %).', new.client_id, v_owner
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.workout_logs_guard_plan_exercise()
  is 'workout_logs.plan_exercise_id yalnızca LOG SAHİBİNİN kendi planındaki bir satıra işaret edebilir (42501). SECURITY DEFINER: bu bir görünürlük değil sahiplik kuralıdır, koç yolunda da geçerlidir.';

revoke all on function public.workout_logs_guard_plan_exercise() from public;

drop trigger if exists workout_logs_guard_plan_exercise on public.workout_logs;
create trigger workout_logs_guard_plan_exercise
  before insert or update of plan_exercise_id, client_id
  on public.workout_logs
  for each row
  execute function public.workout_logs_guard_plan_exercise();


-- #############################################################################
-- ## 5) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_missing text;
begin
  select string_agg(c, ', ')
    into v_missing
    from unnest(array['set_number', 'plan_exercise_id', 'completed_at']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workout_logs' and column_name = c
   );

  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ: workout_logs kolonlari eklenmedi -> %', v_missing;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'workout_logs_plan_exercise_id_fkey'
       and conrelid = 'public.workout_logs'::regclass
       and confdeltype = 'n'   -- 'n' = SET NULL
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_logs -> workout_plan_exercises FK yok veya ON DELETE SET NULL degil';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'workout_logs_guard_plan_exercise'
       and tgrelid = 'public.workout_logs'::regclass
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: workout_logs_guard_plan_exercise trigger i kurulmadi';
  end if;

  raise notice 'workout_logs: set_number / plan_exercise_id (FK, SET NULL) / completed_at eklendi, sahiplik guard i aktif.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: set sırası, plan bağı ve tamamlanma damgası KALICI OLARAK kaybolur;
-- -- bu bilgiyi tutan başka bir kolon yoktur. Önce yedek alın:
-- --   create table public.zz_workout_logs_backup as
-- --     select id, set_number, plan_exercise_id, completed_at from public.workout_logs;
-- =============================================================================
--
-- begin;
--   drop trigger  if exists workout_logs_guard_plan_exercise on public.workout_logs;
--   drop function if exists public.workout_logs_guard_plan_exercise();
--
--   drop index if exists public.workout_logs_client_completed_idx;
--   drop index if exists public.workout_logs_plan_exercise_idx;
--
--   alter table public.workout_logs drop constraint if exists workout_logs_set_number_chk;
--   alter table public.workout_logs drop constraint if exists workout_logs_plan_exercise_id_fkey;
--
--   alter table public.workout_logs
--     drop column if exists completed_at,
--     drop column if exists plan_exercise_id,
--     drop column if exists set_number;
--
--   comment on column public.workout_logs.exercise_name is null;
-- commit;
--
-- =============================================================================
