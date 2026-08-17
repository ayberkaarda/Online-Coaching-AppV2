-- =============================================================================
-- 20260817190100_nutrition_targets_and_logs.sql
--
-- FAZ 2b — ŞEMA TAMAMLAMA / 2 ve 3: BESLENME HEDEFLERİ + ÖĞÜN LOGU
--
-- KAYNAK (active_planprogram.md):
--   §4.2 "Koç: GÜNLÜK MAKRO HEDEFİ + öğün şablonu CRUD."
--   §4.2 "Öğrenci: makro dashboard (HEDEF vs GERÇEKLEŞEN), manuel öğün ekleme."
--   §3.1  `nutrition_plans` / `nutrition_plan_meals` -> "hedefler: kcal int,
--          protein_g/carb_g/fat_g int, CHECK >= 0"
--   §3.1  `nutrition_logs` -> "photo_path, ai_estimate jsonb, user_override
--          jsonb, status (ai_suggested, confirmed)"   [Faz 3 alanları]
--
-- ÖLÇÜLEN MEVCUT DURUM (düzeltmeden ÖNCE, canlı):
--   nutrition_plans      :: id, client_id, version, is_active, notes,
--                           created_at, updated_at      -> HEDEF YOK
--   nutrition_plan_meals :: id, plan_id, day, position, description, kcal
--                           -> yalnızca kcal; protein/karbonhidrat/yağ YOK,
--                              ve bu tablo bir ŞABLONDUR, log değildir.
--   "Gerçekleşen" makroyu tutan HİÇBİR tablo yok -> §4.2'nin
--   "hedef vs gerçekleşen" dashboard'u bugün yazılamaz.
--
-- Idempotenttir. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) HEDEF MAKROLAR — `nutrition_plans` (PLAN seviyesi, GÜNLÜK hedef)     ##
-- #############################################################################
--    ##########################################################################
--    # NEDEN PLAN SEVİYESİ, NEDEN ÖĞÜN SEVİYESİ DEĞİL                         #
--    #   §4.2 "koç: GÜNLÜK makro hedefi" diyor. `nutrition_plan_meals` gün    #
--    #   içindeki ŞABLON satırlarıdır (bugün gün başına tek satır, bkz.       #
--    #   README §4b); hedefi oraya koymak aynı hedefi 7 kez tekrar eder ve    #
--    #   satırlar çeliştiğinde "günlük hedef" tanımsız hâle gelirdi.          #
--    #                                                                        #
--    # NEDEN `target_` ÖN EKİ (plan `kcal` diyor)                             #
--    #   Plan §3.1 hedef kolonlarını `nutrition_plans`/`nutrition_plan_meals` #
--    #   satırında BİRLİKTE listeliyor, hangi tabloya ait olduğunu            #
--    #   söylemiyor. `nutrition_plan_meals.kcal` ZATEN VAR ve o bir hedef     #
--    #   değil, şablonun kalorisidir. `nutrition_plans.kcal` adında ikinci    #
--    #   bir kolon iki farklı anlamı aynı isimle taşırdı. `target_*` ön eki   #
--    #   anlamı ADIN İÇİNE yazar; sapma yalnızca ADdadır, tip ve CHECK        #
--    #   (integer, >= 0) plandaki gibidir.                                    #
--    #                                                                        #
--    # NEDEN NULLABLE                                                         #
--    #   Mevcut 2 plan satırının hedefi YOK ve uydurulamaz. NOT NULL DEFAULT  #
--    #   0 "günlük hedefin 0 kcal" YALANINI yazardı; dashboard bunu %∞        #
--    #   aşım olarak gösterirdi. NULL = "koç henüz hedef vermedi" ve UI       #
--    #   bunu ayırt edebilir.                                                 #
--    ##########################################################################
alter table public.nutrition_plans
  add column if not exists target_kcal      integer,
  add column if not exists target_protein_g integer,
  add column if not exists target_carb_g    integer,
  add column if not exists target_fat_g     integer;

do $$
declare
  v_spec text[];
begin
  foreach v_spec slice 1 in array array[
    ['nutrition_plans_target_kcal_chk',      'target_kcal'],
    ['nutrition_plans_target_protein_chk',   'target_protein_g'],
    ['nutrition_plans_target_carb_chk',      'target_carb_g'],
    ['nutrition_plans_target_fat_chk',       'target_fat_g']
  ] loop
    if not exists (
      select 1 from pg_constraint
       where conname = v_spec[1] and conrelid = 'public.nutrition_plans'::regclass
    ) then
      execute format(
        'alter table public.nutrition_plans add constraint %I check (%I is null or %I >= 0)',
        v_spec[1], v_spec[2], v_spec[2]
      );
    end if;
  end loop;
end
$$;

comment on column public.nutrition_plans.target_kcal
  is 'GÜNLÜK kalori hedefi (§4.2 "koç: günlük makro hedefi"). NULL = hedef henüz verilmedi (0 DEĞİL — 0 bir hedeftir, yokluk değildir).';
comment on column public.nutrition_plans.target_protein_g
  is 'GÜNLÜK protein hedefi (gram). NULL = hedef verilmedi.';
comment on column public.nutrition_plans.target_carb_g
  is 'GÜNLÜK karbonhidrat hedefi (gram). NULL = hedef verilmedi.';
comment on column public.nutrition_plans.target_fat_g
  is 'GÜNLÜK yağ hedefi (gram). NULL = hedef verilmedi.';


-- #############################################################################
-- ## 2) `public.nutrition_logs` — GERÇEKLEŞEN öğün kaydı                     ##
-- #############################################################################
--    ##########################################################################
--    # AD SEÇİMİ — İLERİYE UYUMLULUK, AMA KAPSAM GENİŞLETMESİ DEĞİL           #
--    #                                                                        #
--    # Faz 3 (§5.3) "sonuç `nutrition_logs`'a `status='ai_suggested'` olarak  #
--    # yazılır" diyor. Tabloyu bugün başka bir adla açıp Faz 3'te yeniden     #
--    # adlandırmak gereksiz bir kırılma turudur -> AD ŞİMDİDEN `nutrition_    #
--    # logs`.                                                                 #
--    #                                                                        #
--    # AMA Faz 3'ün ALANLARI BUGÜN KURULMAZ (kapsam: "planın gerektirdiği     #
--    # kadarı"): `status`, `photo_path`, `ai_estimate`, `user_override` YOK.  #
--    # Gerekçe: bugün AI yolu yoktur; `status` kolonunun tek anlamı           #
--    # "AI önerisi mi, onaylı mı" ayrımıdır ve bu ayrım olmayan bir yüzey     #
--    # için yazılırsa TÜM satırlar tek değeri taşır — bilgi taşımayan bir     #
--    # kolon, tüketicisi olmayan bir kısıt ve boşa giden bir CHECK demektir.  #
--    #                                                                        #
--    # FAZ 3'TE EKLEME NEDEN KOLAY OLACAK (planlanmış, tahmin değil):         #
--    #   create type public.nutrition_log_status as enum ('ai_suggested','confirmed');
--    #   alter table public.nutrition_logs
--    #     add column status public.nutrition_log_status not null default 'confirmed',
--    #     add column photo_path   text,
--    #     add column ai_estimate  jsonb,
--    #     add column user_override jsonb;
--    #   -> BACKFILL GEREKMEZ: bugünkü her satır ELLE girilmiştir, yani       #
--    #      semantiği tam olarak 'confirmed'dır ve DEFAULT bunu doğru yazar.  #
--    #      §4.2 dashboard'u bugün TÜM satırları sayar; Faz 3'te filtre       #
--    #      `where status = 'confirmed'` olur ve bugünkü satırlar kapsamda    #
--    #      KALIR. Bu yüzden ad ileriye uyumlu, şema geriye uyumludur.        #
--    ##########################################################################
create table if not exists public.nutrition_logs (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references public.profiles (id) on delete cascade,
  log_date     date        not null default current_date,
  description  text        not null,
  kcal         integer,
  protein_g    integer,
  carb_g       integer,
  fat_g        integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint nutrition_logs_description_chk check (btrim(description) <> ''),
  constraint nutrition_logs_kcal_chk        check (kcal      is null or kcal      >= 0),
  constraint nutrition_logs_protein_chk     check (protein_g is null or protein_g >= 0),
  constraint nutrition_logs_carb_chk        check (carb_g    is null or carb_g    >= 0),
  constraint nutrition_logs_fat_chk         check (fat_g     is null or fat_g     >= 0)
);

comment on table public.nutrition_logs
  is 'GERÇEKLEŞEN öğün kaydı (§4.2 "manuel öğün ekleme" + "hedef vs gerçekleşen" dashboard). nutrition_plan_meals bir ŞABLONDUR, bu tablo LOG''dur; ikisi karıştırılmamalıdır. Faz 3''te status/photo_path/ai_estimate/user_override eklenir (bkz. migration başlığı).';
comment on column public.nutrition_logs.log_date
  is 'Öğünün ait olduğu GÜN. Dashboard bu kolona göre gruplar. daily_logs.log_date ile aynı desendedir; ama BURADA TEKİLLİK YOKTUR — bir günde birden çok öğün girilir.';
comment on column public.nutrition_logs.description
  is 'KANONİK: kullanıcının yazdığı öğün metni (serbest). nutrition_plan_meals.description ile aynı rolü oynar; yapısal ayrıştırma YAPILMAZ (README §4b, iki lehçe sorunu).';
comment on column public.nutrition_logs.kcal
  is 'Gerçekleşen kalori. NULL = kullanıcı girmedi (0 DEĞİL). Dashboard toplaması sum() ile yapılır, sum() NULL''ları atlar.';
comment on column public.nutrition_logs.protein_g
  is 'Gerçekleşen protein (gram). NULL = girilmedi.';
comment on column public.nutrition_logs.carb_g
  is 'Gerçekleşen karbonhidrat (gram). NULL = girilmedi.';
comment on column public.nutrition_logs.fat_g
  is 'Gerçekleşen yağ (gram). NULL = girilmedi.';

--   Zaman serisi composite indeksi (plan §3.1: "(user_id, <date> DESC)").
--   FK indeksi de bunun ön ekiyle karşılanır.
create index if not exists nutrition_logs_client_date_idx
  on public.nutrition_logs (client_id, log_date desc);

drop trigger if exists set_nutrition_logs_updated_at on public.nutrition_logs;
create trigger set_nutrition_logs_updated_at
  before update on public.nutrition_logs
  for each row
  execute function public.set_updated_at();


-- #############################################################################
-- ## 3) TABLO YETKİLERİ                                                      ##
-- #############################################################################
--    ##########################################################################
--    # 20260817170000 §1'in dersi: `alter default privileges` TRUNCATE/       #
--    # REFERENCES/TRIGGER'ı YENİ tablolar için de kapatır, AMA S/I/U/D        #
--    # varsayılan olarak VERİLMEZ -> her yeni tablo kendi migration'ında      #
--    # AÇIKÇA grant etmek zorundadır. Unutulursa uygulama "permission denied  #
--    # for table" ile GÜRÜLTÜLÜ kırılır (sessiz açık oluşmaz).                #
--    # §5'teki doğrulama bloğu bunu ayrıca ÖLÇER.                             #
--    ##########################################################################
revoke all on public.nutrition_logs from anon;

grant select, insert, update, delete on public.nutrition_logs to authenticated;
grant all                            on public.nutrition_logs to service_role;

--   Sequence yetkisi (20260817180200) BU TABLO İÇİN GEÇERSİZDİR: birincil
--   anahtar `uuid default gen_random_uuid()`, `serial` değil -> sequence yok.


-- #############################################################################
-- ## 4) RLS                                                                  ##
-- #############################################################################
--    ##########################################################################
--    # §3.2 MATRİSİ BU TABLODA AYNEN UYGULANIR — ADR-0014 SAPMASI YOK        #
--    #                                                                        #
--    # `workout_logs` / `daily_logs` bugün UPDATE/DELETE'i koça da açar; bu   #
--    # MEVCUT ÜRÜN DAVRANIŞINI kırmama kararının mirasıdır (README §4a/§4b,   #
--    # ADR-0014). `nutrition_logs` YENİ bir yüzeydir: kıracak bir davranış    #
--    # YOKTUR, dolayısıyla plan §3.2 birebir uygulanır:                       #
--    #   coach -> danışan verisinde SALT OKUMA ("Danışanın kendi log'una      #
--    #            yazamaz")                                                   #
--    #   client -> yalnızca KENDİ satırı, tam R/W                             #
--    # Beslenme tarafında koçun yazma yüzeyi `nutrition_plans` /              #
--    # `nutrition_plan_meals` (ŞABLON) tablolarıdır — logu danışan tutar.     #
--    #                                                                        #
--    # Yeni bir sapmayı bilinçli olarak AÇMIYORUZ: sapmalar ancak mevcut bir  #
--    # akışı kurtarmak için kabul edilir, "ileride lazım olabilir" için DEĞİL.#
--    ##########################################################################
alter table public.nutrition_logs enable row level security;

--   FORCE: 20260817170000 §2 tüm tablolara FORCE uyguladı ama o bir DO
--   döngüsüydü ve O AN var olan tabloları gezdi. Bu tablo SONRA doğuyor ->
--   FORCE'u kendisi almak zorundadır (AC-1.5.2 sorgusu aksi hâlde bu tabloyu
--   döndürür ve rls.test.sql senaryo 74 KIRILIR).
alter table public.nutrition_logs force row level security;

drop policy if exists nutrition_logs_select on public.nutrition_logs;
create policy nutrition_logs_select
  on public.nutrition_logs
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists nutrition_logs_insert on public.nutrition_logs;
create policy nutrition_logs_insert
  on public.nutrition_logs
  for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists nutrition_logs_update on public.nutrition_logs;
create policy nutrition_logs_update
  on public.nutrition_logs
  for update
  to authenticated
  using      (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists nutrition_logs_delete on public.nutrition_logs;
create policy nutrition_logs_delete
  on public.nutrition_logs
  for delete
  to authenticated
  using (client_id = auth.uid());


-- #############################################################################
-- ## 5) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_bad     text;
  v_missing text;
begin
  -- (a) hedef kolonları
  select string_agg(c, ', ')
    into v_missing
    from unnest(array['target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'nutrition_plans' and column_name = c
   );
  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ: nutrition_plans hedef kolonlari eksik -> %', v_missing;
  end if;

  -- (b) RLS + FORCE
  if not exists (
    select 1 from pg_class
     where oid = 'public.nutrition_logs'::regclass
       and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'DOGRULAMA BASARISIZ: nutrition_logs uzerinde RLS/FORCE acik degil (AC-1.5.2 ihlali)';
  end if;

  -- (c) fazla yetki: TRUNCATE/REFERENCES/TRIGGER hicbir istemci rolunde olmamali
  select string_agg(format('%s/%s', g.role_name, p.priv), ', ')
    into v_bad
    from (values ('authenticated'), ('anon')) as g(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where has_table_privilege(g.role_name, 'public.nutrition_logs', p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: nutrition_logs uzerinde fazla yetki -> %', v_bad;
  end if;

  -- (d) POZİTİF: authenticated S/I/U/D almis olmali, anon HICBIR SEY almamali
  select string_agg(p.priv, ', ')
    into v_bad
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where not has_table_privilege('authenticated', 'public.nutrition_logs', p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: authenticated nutrition_logs uzerinde yetki kaybetti -> %', v_bad;
  end if;

  select string_agg(p.priv, ', ')
    into v_bad
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where has_table_privilege('anon', 'public.nutrition_logs', p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: anon nutrition_logs uzerinde yetkili -> %', v_bad;
  end if;

  raise notice 'nutrition_plans hedef kolonlari + nutrition_logs (RLS+FORCE, 4 politika, dar yetki) kuruldu.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `nutrition_logs` DROP edilirse danışanların girdiği TÜM öğün
-- -- kayıtları kalıcı olarak kaybolur (bu veriyi tutan başka tablo YOKTUR).
-- -- Önce yedek alın:  create table public.zz_nutrition_logs_backup as
-- --                     select * from public.nutrition_logs;
-- =============================================================================
--
-- begin;
--   drop policy  if exists nutrition_logs_delete on public.nutrition_logs;
--   drop policy  if exists nutrition_logs_update on public.nutrition_logs;
--   drop policy  if exists nutrition_logs_insert on public.nutrition_logs;
--   drop policy  if exists nutrition_logs_select on public.nutrition_logs;
--   drop trigger if exists set_nutrition_logs_updated_at on public.nutrition_logs;
--   drop table   if exists public.nutrition_logs;
--
--   alter table public.nutrition_plans
--     drop constraint if exists nutrition_plans_target_fat_chk,
--     drop constraint if exists nutrition_plans_target_carb_chk,
--     drop constraint if exists nutrition_plans_target_protein_chk,
--     drop constraint if exists nutrition_plans_target_kcal_chk,
--     drop column     if exists target_fat_g,
--     drop column     if exists target_carb_g,
--     drop column     if exists target_protein_g,
--     drop column     if exists target_kcal;
-- commit;
--
-- =============================================================================
