-- =============================================================================
-- 20260817130000_nutrition_plan_tables.sql
--
-- FAZ 1b / ADIM 3a — Beslenme planlarının normalize edilmesi.
--
-- `profiles.nutrition_plan` bugüne kadar JSON string olarak
-- (`Record<gün, { items: string; total: number }>`) saklanıyordu. Bu migration
-- aynı veriyi iki normalize tabloya taşır:
--
--     public.nutrition_plans        (danışan başına versiyonlanmış plan başlığı)
--     public.nutrition_plan_meals   (gün + sıra bazlı satırlar)
--
-- Yapı, bir adım önce yazılan 20260817110000_workout_plan_tables.sql ile
-- BİREBİR aynı deseni izler (tablo + kısmi tekil indeks + GRANT + RLS +
-- tek yazıcı fonksiyon + dönüşüm fonksiyonu + DOWN bloğu).
--
-- =============================================================================
-- TASARIM KARARI — `description` KANONİKTİR, YAPISAL AYRIŞTIRMA YOKTUR
-- =============================================================================
-- Antrenman tarafındaki `raw_line` ile aynı rolü `description` üstlenir: gün
-- metni HAM hâliyle, KAYIPSIZ saklanır.
--
-- Antrenman tarafından FARKI: burada satır bazlı ayrıştırma YAPILMAZ.
-- `items` alanı sahada İKİ AYRI LEHÇEDE yazılmış serbest metindir:
--
--   Lehçe A (kod tabanının varsaydığı — src/lib/helpers.ts sumCalories):
--       "Yulaf:80, Tavuk Göğsü:200"          (virgül ile ayrılmış, "ad:gram")
--   Lehçe B (supabase/seed.sql'deki gerçek veri):
--       E'Yulaf Ezmesi 80g\nTavuk Göğsü 200g' (satır sonu ile ayrılmış, iki nokta YOK)
--
-- Bu iki lehçeyi öğün/besin seviyesine ayrıştırmaya çalışmak UYDURMA veri
-- üretirdi (hangi lehçe olduğu güvenilir biçimde bilinemez, "80g" bir miktar mı
-- yoksa kalori mi belirsizdir). Bu yüzden Faz 1b'de gün başına TEK satır
-- (`position = 0`) saklanır: ham metin + kcal.
--
-- `position` kolonu bugün her zaman 0'dır. İLERİDE öğün granülerliği
-- (kahvaltı / ara öğün / akşam yemeği) geldiğinde şema değişikliği
-- gerektirmeden gün içinde birden çok satır tutulabilsin diye şimdiden
-- konulmuştur; `(plan_id, day, position)` tekilliği o gün de geçerli kalır.
--
-- ROUND-TRIP SÖZLEŞMESİ:
--   Bir günün orijinal JSON değeri şu ifadeyle BİREBİR geri üretilir:
--       jsonb_build_object('items', description, 'total', kcal)
--   `supabase/tests/transform.test.sql` senaryo 11 bunu her iki lehçe için de
--   doğrular.
--   Bilinen sınırlar (bilinçli): (a) `total` sayı değilse / negatifse / tam sayı
--   değilse `kcal` NULL'a düşer -> round-trip o gün için birebir DEĞİLDİR ama
--   `description` yine kayıpsızdır; (b) gün nesnesinde `items`/`total` dışında
--   ek anahtar varsa o anahtar saklanmaz.
--
-- TEK YAZICI KURALI:
--   `public.explode_nutrition_day()` hem bu migration'ın veri dönüşümü hem de
--   uygulamanın çağıracağı `public.save_nutrition_plan()` RPC'si tarafından
--   kullanılır. İKİNCİ BİR İMPLEMENTASYON YOKTUR
--   (kanıt: transform.test.sql senaryo 16, EXCEPT ALL karşılaştırması).
--
-- BU MİGRATION `profiles.nutrition_plan` KOLONUNU **SİLMEZ**.
--   Kolon `DEPRECATED` yorumuyla yan yana yaşamaya devam eder; DROP işlemi
--   Faz 2 kapısında yapılacaktır (bkz. active_planprogram.md §3.5).
--
-- BU MİGRATION KOD TARAFINA DOKUNMAZ. Uygulamanın okuma/yazma yolunun bu
--   tablolara geçirilmesi (cutover) Faz 1b Adım 3b'dedir.
--
-- Idempotenttir: `create ... if not exists`, `create or replace function`,
-- `drop policy if exists` + `create policy` ve dönüşümün "aktif plan varsa atla"
-- kuralı sayesinde hem sıfırdan (`supabase db reset`) hem mevcut veritabanına
-- güvenle uygulanır.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.nutrition_plans — danışan başına versiyonlanmış plan başlığı
-- -----------------------------------------------------------------------------
create table if not exists public.nutrition_plans (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.profiles (id) on delete cascade,
  version     integer     not null default 1,
  is_active   boolean     not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint nutrition_plans_version_chk check (version > 0)
);

comment on table public.nutrition_plans
  is 'Danışan başına beslenme planı başlığı. Faz 1b: her danışanın en fazla BİR aktif planı olur; versiyon-yayınlama semantiği Faz 2''ye bırakılmıştır.';
comment on column public.nutrition_plans.version
  is 'Plan versiyonu (1''den başlar). Faz 1b''de her zaman 1''dir — kaydetme aktif versiyonun satırlarını değiştirir, yeni versiyon üretmez.';
comment on column public.nutrition_plans.is_active
  is 'Aktif plan. nutrition_plans_one_active_idx kısmi tekil indeksi, danışan başına en fazla bir aktif plan olmasını garanti eder.';
comment on column public.nutrition_plans.notes
  is 'Koçun plan geneline dair serbest notu. Gün içeriği BURAYA DEĞİL, nutrition_plan_meals.description''a yazılır.';

-- KRİTİK: danışan başına en fazla BİR aktif plan.
-- Kısmi (partial) tekil indeks: is_active = false satırlar (gelecekteki
-- versiyon arşivi) sınırsız sayıda olabilir.
create unique index if not exists nutrition_plans_one_active_idx
  on public.nutrition_plans (client_id)
  where is_active;

create index if not exists nutrition_plans_client_idx
  on public.nutrition_plans (client_id, created_at desc);

drop trigger if exists set_nutrition_plans_updated_at on public.nutrition_plans;
create trigger set_nutrition_plans_updated_at
  before update on public.nutrition_plans
  for each row
  execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 2) public.nutrition_plan_meals — gün + sıra bazlı plan satırları
--
--    Faz 1b: gün başına TEK satır (position = 0). `position` ileride öğün
--    granülerliği için ayrılmıştır (bkz. dosya başındaki tasarım notu).
-- -----------------------------------------------------------------------------
create table if not exists public.nutrition_plan_meals (
  id           uuid    primary key default gen_random_uuid(),
  plan_id      uuid    not null references public.nutrition_plans (id) on delete cascade,
  day          text    not null,
  position     integer not null default 0,
  description  text    not null,
  kcal         integer,
  constraint nutrition_plan_meals_day_chk check (
    day in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar')
  ),
  constraint nutrition_plan_meals_position_chk check (position >= 0),
  constraint nutrition_plan_meals_kcal_chk     check (kcal is null or kcal >= 0),
  constraint nutrition_plan_meals_day_pos_uniq unique (plan_id, day, position)
);

comment on table public.nutrition_plan_meals
  is 'Beslenme planı satırları. description KANONİKTİR (gün metninin ham hâli, kayıpsız). Faz 1b''de gün başına tek satır (position = 0) tutulur.';
comment on column public.nutrition_plan_meals.description
  is 'KANONİK: profiles.nutrition_plan içindeki gün nesnesinin `items` alanının HAM metni. Yapısal ayrıştırma YAPILMAZ — alan iki farklı lehçede yazılmış serbest metindir (virgül+iki nokta VE satır sonu).';
comment on column public.nutrition_plan_meals.kcal
  is 'Eski `total` alanı (gün toplam kalorisi). Kaynak değer sayı değilse, negatifse veya tam sayı değilse NULL''dur; satır bu durumda da eklenir (ham metin kaybolmaz).';
comment on column public.nutrition_plan_meals.position
  is '0''dan başlayan, gün içindeki sıra. Faz 1b''de HER ZAMAN 0''dır; ileride öğün granülerliği (kahvaltı/öğle/akşam) geldiğinde şema değişmeden birden çok satır tutulabilsin diye ayrılmıştır. (plan_id, day, position) tekildir.';

create index if not exists nutrition_plan_meals_plan_day_pos_idx
  on public.nutrition_plan_meals (plan_id, day, position);


-- -----------------------------------------------------------------------------
-- 3) Tablo düzeyi yetkiler
--    (20260816090200_rls_policies.sql'deki toplu GRANT yalnızca O ANDA var olan
--     tablolara uygulandı; yeni tablolar için tekrar edilmelidir.)
-- -----------------------------------------------------------------------------
revoke all on public.nutrition_plans      from anon;
revoke all on public.nutrition_plan_meals from anon;

grant select, insert, update, delete on public.nutrition_plans      to authenticated;
grant select, insert, update, delete on public.nutrition_plan_meals to authenticated;

grant all on public.nutrition_plans      to service_role;
grant all on public.nutrition_plan_meals to service_role;


-- -----------------------------------------------------------------------------
-- 4) public.explode_nutrition_day(plan_id, day, entry) -> integer
--
--    TEK YAZICI. Bir günün JSON nesnesini (`{"items": "...", "total": 1850}`)
--    TEK bir nutrition_plan_meals satırına çevirir.
--
--    * `items` -> `description` HAM hâliyle (btrim YOK, satır bölme YOK).
--      Alan yoksa/NULL ise boş metin ('') yazılır — satır YİNE eklenir, böylece
--      gün anahtarı kaybolmaz ve round-trip gün kümesi korunur.
--    * `total` -> `kcal`, YALNIZCA JSON sayısı + negatif değil + tam sayı +
--      integer aralığında ise. Aksi hâlde `kcal = NULL` yazılır ve satır YİNE
--      eklenir (ham metin kaybolmasın). Tam sayı şartı bilinçlidir: 1850.5 gibi
--      bir değeri integer'a yuvarlamak SESSİZ veri kaybı olurdu.
--
--    SECURITY INVOKER: save_nutrition_plan() içinden çağrıldığında RLS ÇAĞIRANA
--    uygulanır. Dönüşüm fonksiyonu SECURITY DEFINER olduğu için orada
--    (postgres yetkisiyle) RLS'e takılmaz.
--
--    Dönüş: eklenen satır sayısı (bu fazda her zaman 1).
-- -----------------------------------------------------------------------------
create or replace function public.explode_nutrition_day(
  p_plan_id uuid,
  p_day     text,
  p_entry   jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_items text;
  v_total jsonb;
  v_num   numeric;
  v_kcal  integer := null;
begin
  if p_plan_id is null or p_day is null then
    raise exception 'explode_nutrition_day: p_plan_id ve p_day zorunludur.' using errcode = '22023';
  end if;

  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'explode_nutrition_day: gun degeri bir JSON nesnesi olmalidir (gun=%, tip=%).',
      p_day, coalesce(jsonb_typeof(p_entry), 'null') using errcode = '22023';
  end if;

  v_items := coalesce(p_entry ->> 'items', '');

  v_total := p_entry -> 'total';
  if v_total is not null and jsonb_typeof(v_total) = 'number' then
    begin
      v_num := v_total::text::numeric;
      -- Negatif, kesirli veya integer aralığı dışındaki değerler NULL'a düşer.
      if v_num >= 0 and v_num = trunc(v_num) and v_num <= 2147483647 then
        v_kcal := v_num::integer;
      end if;
    exception
      when others then
        v_kcal := null;
    end;
  end if;

  insert into public.nutrition_plan_meals (plan_id, day, position, description, kcal)
  values (p_plan_id, p_day, 0, v_items, v_kcal);

  return 1;
end;
$$;

comment on function public.explode_nutrition_day(uuid, text, jsonb)
  is 'TEK beslenme günü yazıcısı. Hem veri dönüşümü hem save_nutrition_plan() RPC''si bunu kullanır — ikinci bir implementasyon YOKTUR. Yapısal ayrıştırma yapmaz: items ham hâliyle description''a yazılır.';

revoke all     on function public.explode_nutrition_day(uuid, text, jsonb) from public;
grant  execute on function public.explode_nutrition_day(uuid, text, jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 5) public.save_nutrition_plan(client_ids, plan) -> integer
--
--    Uygulamanın (Faz 1b Adım 3b) çağıracağı kaydetme RPC'si.
--    p_plan şekli: {"Pazartesi": {"items": "metin", "total": 1850}, ...}
--
--    SECURITY INVOKER'dır: RLS ÇAĞIRANA uygulanır. Yetkisiz bir danışan
--    başkasının planını kaydetmeye kalkarsa hata YÜKSELİR (yakalanmaz) —
--    böylece tüm çağrı tek transaction içinde geri alınır (atomiklik).
--
--    Faz 1b'de YENİ VERSİYON ÜRETİLMEZ: aktif plan satırı yoksa version=1 ile
--    oluşturulur, varsa o kullanılır; planın TÜM satırları silinip yeniden
--    yazılır.
--
--    Dönüş: etkilenen danışan sayısı.
-- -----------------------------------------------------------------------------
create or replace function public.save_nutrition_plan(
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
  v_day       text;
  v_entry     jsonb;
  v_count     integer := 0;
begin
  if p_client_ids is null or coalesce(array_length(p_client_ids, 1), 0) = 0 then
    raise exception 'save_nutrition_plan: en az bir danışan seçilmelidir.' using errcode = '22023';
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'save_nutrition_plan: p_plan bir JSON nesnesi olmalıdır.' using errcode = '22023';
  end if;

  -- Bilinmeyen gün anahtarı SESSİZCE YUTULMAZ: yazma yolunda sessiz veri kaybı
  -- kabul edilemez. (Dönüşüm yolunda ise eski veriyi kurtarmak için atlanır.)
  -- Doğrulama TOPTAN, hiçbir satır yazılmadan ÖNCE yapılır.
  for v_day in select key from jsonb_each(p_plan) loop
    if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
      raise exception 'save_nutrition_plan: geçersiz gün anahtarı %.', v_day using errcode = '22023';
    end if;
  end loop;

  foreach v_client_id in array p_client_ids loop
    if v_client_id is null then
      raise exception 'save_nutrition_plan: client_id NULL olamaz.' using errcode = '22023';
    end if;

    -- Aktif plan var mı? (RLS: başkasının planı burada GÖRÜNMEZ -> aşağıdaki
    -- INSERT devreye girer ve WITH CHECK ihlaliyle hata yükselir.)
    select np.id
      into v_plan_id
      from public.nutrition_plans np
     where np.client_id = v_client_id
       and np.is_active
     limit 1;

    if v_plan_id is null then
      insert into public.nutrition_plans (client_id, version, is_active)
      values (v_client_id, 1, true)
      returning id into v_plan_id;
    else
      -- updated_at tazelensin (set_nutrition_plans_updated_at trigger'ı çalışır).
      update public.nutrition_plans
         set updated_at = now()
       where id = v_plan_id;
    end if;

    delete from public.nutrition_plan_meals where plan_id = v_plan_id;

    for v_day, v_entry in select key, value from jsonb_each(p_plan) loop
      perform public.explode_nutrition_day(v_plan_id, v_day, v_entry);
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.save_nutrition_plan(uuid[], jsonb)
  is 'Beslenme planı kaydetme RPC''si. SECURITY INVOKER (RLS uygulanır). Faz 1b: aktif versiyonun satırları değiştirilir, yeni versiyon üretilmez.';

revoke all     on function public.save_nutrition_plan(uuid[], jsonb) from public;
grant  execute on function public.save_nutrition_plan(uuid[], jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 6) RLS politikaları
--
-- ############################################################################
-- # BİLİNÇLİ SAPMA — active_planprogram.md §3.2                              #
-- #                                                                          #
-- # Plan §3.2, "plan tablolarına yalnızca koç yazar" diyor. BURADA DANIŞANA  #
-- # DA KENDİ BESLENME PLANI ÜZERİNDE YAZMA HAKKI VERİLİYOR.                  #
-- #                                                                          #
-- # Gerekçe: MEVCUT ÜRÜN DAVRANIŞINI KORUMAK. "Beslenme Tablosunu Kaydet"    #
-- # butonu src/components/tabs/NutritionTab.tsx'te role bakılmaksızın        #
-- # render ediliyor ve handleSaveProgram danışan için                        #
-- # clientIds = [currentUserId] kuruyor. Yani danışan kendi beslenme planını #
-- # koç onayı olmadan kaydedebiliyor; antrenman tarafındaki onay akışının    #
-- # (program_approvals) beslenme karşılığı YOK. Bu davranış                  #
-- # tests/e2e/plans.spec.ts'te kilitli. Yazmayı koça kısıtlamak, Adım 3b'nin #
-- # kod cutover'ında bu akışı SESSİZCE KIRARDI.                              #
-- #                                                                          #
-- # Tam gerekçe ve sonuçlar: docs/adr/0014-danisanin-kendi-beslenme-planini- #
-- # kaydedebilmesi.md                                                        #
-- #                                                                          #
-- # Kapsam sınırı: danışan YALNIZCA kendi client_id'sine ait plana yazabilir #
-- # (başka danışanın planına asla). Bu kısıt hem nutrition_plans hem         #
-- # nutrition_plan_meals (plan üzerinden EXISTS) için geçerlidir ve          #
-- # supabase/tests/rls.test.sql senaryo 30/31/34/35 ile korunur.             #
-- #                                                                          #
-- # Faz 2'de onay akışı beslenmeye de getirilirse bu sapma gözden geçirilip  #
-- # politika §3.2'ye daraltılmalıdır.                                        #
-- ############################################################################
-- -----------------------------------------------------------------------------
alter table public.nutrition_plans      enable row level security;
alter table public.nutrition_plan_meals enable row level security;

-- --- nutrition_plans ---

drop policy if exists nutrition_plans_select on public.nutrition_plans;
create policy nutrition_plans_select
  on public.nutrition_plans
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists nutrition_plans_insert on public.nutrition_plans;
create policy nutrition_plans_insert
  on public.nutrition_plans
  for insert
  to authenticated
  with check (public.is_coach() or client_id = auth.uid());

drop policy if exists nutrition_plans_update on public.nutrition_plans;
create policy nutrition_plans_update
  on public.nutrition_plans
  for update
  to authenticated
  using      (public.is_coach() or client_id = auth.uid())
  with check (public.is_coach() or client_id = auth.uid());

drop policy if exists nutrition_plans_delete on public.nutrition_plans;
create policy nutrition_plans_delete
  on public.nutrition_plans
  for delete
  to authenticated
  using (public.is_coach() or client_id = auth.uid());

-- --- nutrition_plan_meals (yetki plan üzerinden türetilir) ---

drop policy if exists nutrition_plan_meals_select on public.nutrition_plan_meals;
create policy nutrition_plan_meals_select
  on public.nutrition_plan_meals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_plans np
      where np.id = nutrition_plan_meals.plan_id
        and (np.client_id = auth.uid() or public.is_coach())
    )
  );

drop policy if exists nutrition_plan_meals_insert on public.nutrition_plan_meals;
create policy nutrition_plan_meals_insert
  on public.nutrition_plan_meals
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.nutrition_plans np
      where np.id = nutrition_plan_meals.plan_id
        and (public.is_coach() or np.client_id = auth.uid())
    )
  );

drop policy if exists nutrition_plan_meals_update on public.nutrition_plan_meals;
create policy nutrition_plan_meals_update
  on public.nutrition_plan_meals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_plans np
      where np.id = nutrition_plan_meals.plan_id
        and (public.is_coach() or np.client_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.nutrition_plans np
      where np.id = nutrition_plan_meals.plan_id
        and (public.is_coach() or np.client_id = auth.uid())
    )
  );

drop policy if exists nutrition_plan_meals_delete on public.nutrition_plan_meals;
create policy nutrition_plan_meals_delete
  on public.nutrition_plan_meals
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.nutrition_plans np
      where np.id = nutrition_plan_meals.plan_id
        and (public.is_coach() or np.client_id = auth.uid())
    )
  );


-- -----------------------------------------------------------------------------
-- 7) public.migrate_nutrition_plans_from_profiles() — VERİ DÖNÜŞÜMÜ
--
--    `profiles.nutrition_plan` (JSON string) -> nutrition_plans + nutrition_plan_meals
--
--    Kurallar:
--      * nutrition_plan NULL / boş / GEÇERSİZ JSON ise ATLANIR (hata verilmez).
--      * JSON bir nesne değilse (dizi/scalar) ATLANIR.
--      * IDEMPOTENT: danışanın zaten aktif planı varsa ATLANIR -> ikinci çalıştırma
--        satır çoğaltmaz.
--      * Bilinmeyen gün anahtarları atlanır (eski/bozuk veriyi kurtarabilmek için;
--        yazma yolunda — save_nutrition_plan — ise hata yükseltilir).
--      * Gün değeri JSON nesnesi değilse o gün atlanır (yine kurtarma amaçlı).
--
--    Bu bir FONKSİYONDUR, migration gövdesine gömülü değildir. Sebep:
--    `supabase db reset` sırasında migration'lar SEED'DEN ÖNCE koşar, yani
--    dönüşüm her zaman BOŞ tabloda çalışır (no-op). Dönüşüm mantığının gerçekten
--    doğru olduğunu kanıtlamanın tek yolu onu testten çağırabilmektir
--    (supabase/tests/transform.test.sql).
--
--    SECURITY DEFINER: dönüşüm tüm profilleri dolaşır; çağıranın RLS'ine
--    takılmamalıdır. Yürütme yetkisi yalnızca service_role'dedir.
-- -----------------------------------------------------------------------------
create or replace function public.migrate_nutrition_plans_from_profiles()
returns table (profiles_converted integer, meals_inserted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile   record;
  v_plan      jsonb;
  v_plan_id   uuid;
  v_day       text;
  v_entry     jsonb;
  v_profiles  integer := 0;
  v_meals     integer := 0;
  v_skipped   integer := 0;
  v_bad_days  integer := 0;
begin
  for v_profile in
    select p.id, p.nutrition_plan
      from public.profiles p
     where p.nutrition_plan is not null
       and btrim(p.nutrition_plan) <> ''
     order by p.id
  loop
    -- IDEMPOTENCY: aktif plan varsa dokunma.
    if exists (
      select 1 from public.nutrition_plans np
       where np.client_id = v_profile.id and np.is_active
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Geçersiz JSON: atla, hata verme.
    begin
      v_plan := v_profile.nutrition_plan::jsonb;
    exception
      when others then
        v_skipped := v_skipped + 1;
        raise notice 'nutrition_plan atlandi (gecersiz JSON) profil=%: %', v_profile.id, sqlerrm;
        continue;
    end;

    if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
      v_skipped := v_skipped + 1;
      raise notice 'nutrition_plan atlandi (JSON nesnesi degil, tip=%) profil=%',
        coalesce(jsonb_typeof(v_plan), 'null'), v_profile.id;
      continue;
    end if;

    insert into public.nutrition_plans (client_id, version, is_active)
    values (v_profile.id, 1, true)
    returning id into v_plan_id;

    for v_day, v_entry in select key, value from jsonb_each(v_plan) loop
      if v_day not in ('Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar') then
        v_bad_days := v_bad_days + 1;
        raise notice 'nutrition_plan: bilinmeyen gun anahtari "%" (profil=%) atlandi', v_day, v_profile.id;
        continue;
      end if;

      if v_entry is null or jsonb_typeof(v_entry) <> 'object' then
        v_bad_days := v_bad_days + 1;
        raise notice 'nutrition_plan: "%" gununun degeri JSON nesnesi degil (tip=%, profil=%) atlandi',
          v_day, coalesce(jsonb_typeof(v_entry), 'null'), v_profile.id;
        continue;
      end if;

      v_meals := v_meals + public.explode_nutrition_day(v_plan_id, v_day, v_entry);
    end loop;

    v_profiles := v_profiles + 1;
  end loop;

  raise notice 'DONUSUM OZETI (beslenme): % profil donusturuldu, % ogun satiri eklendi, % profil atlandi, % gun anahtari atlandi',
    v_profiles, v_meals, v_skipped, v_bad_days;

  profiles_converted := v_profiles;
  meals_inserted     := v_meals;
  return next;
end;
$$;

comment on function public.migrate_nutrition_plans_from_profiles()
  is 'profiles.nutrition_plan (JSON string) -> nutrition_plans/nutrition_plan_meals veri dönüşümü. Idempotenttir (aktif planı olan danışan atlanır). Testten çağrılabilsin diye fonksiyon olarak yazıldı.';

revoke all     on function public.migrate_nutrition_plans_from_profiles() from public;
grant  execute on function public.migrate_nutrition_plans_from_profiles() to service_role;


-- -----------------------------------------------------------------------------
-- 8) Dönüşümü ÇALIŞTIR
--
--    NOT: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar, bu
--    yüzden burada 0 profil dönüştürülür (no-op) — bu BEKLENEN durumdur.
--    Var olan bir veritabanına uygulandığında ise gerçek veriyi taşır.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  select * into r from public.migrate_nutrition_plans_from_profiles();
  raise notice 'nutrition_plan dönüşümü tamamlandı: % profil, % öğün satırı',
    r.profiles_converted, r.meals_inserted;
end
$$;


-- -----------------------------------------------------------------------------
-- 9) Eski kolonu DEPRECATED olarak işaretle (SİLME!)
-- -----------------------------------------------------------------------------
comment on column public.profiles.nutrition_plan
  is 'DEPRECATED: nutrition_plans/nutrition_plan_meals. Faz 2 kapısında DROP edilecek.';


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: bu script nutrition_plans / nutrition_plan_meals içindeki TÜM
-- -- veriyi siler. Dönüşüm kaynağı olan profiles.nutrition_plan kolonu bu
-- -- migration tarafından silinmediği için veri kaybı YAŞANMAZ — plan verisi
-- -- eski JSON string kolonunda hâlâ durmaktadır.
-- --
-- -- Aşağıdaki bloğu olduğu gibi psql'e yapıştırarak çalıştırabilirsiniz.
-- =============================================================================
--
-- begin;
--
-- -- 1) RPC ve yardımcı fonksiyonlar
-- drop function if exists public.migrate_nutrition_plans_from_profiles();
-- drop function if exists public.save_nutrition_plan(uuid[], jsonb);
-- drop function if exists public.explode_nutrition_day(uuid, text, jsonb);
--
-- -- 2) Politikalar (tablolar DROP edilince zaten düşer; açıklık için yazıldı)
-- drop policy if exists nutrition_plan_meals_delete on public.nutrition_plan_meals;
-- drop policy if exists nutrition_plan_meals_update on public.nutrition_plan_meals;
-- drop policy if exists nutrition_plan_meals_insert on public.nutrition_plan_meals;
-- drop policy if exists nutrition_plan_meals_select on public.nutrition_plan_meals;
-- drop policy if exists nutrition_plans_delete      on public.nutrition_plans;
-- drop policy if exists nutrition_plans_update      on public.nutrition_plans;
-- drop policy if exists nutrition_plans_insert      on public.nutrition_plans;
-- drop policy if exists nutrition_plans_select      on public.nutrition_plans;
--
-- -- 3) Trigger
-- drop trigger if exists set_nutrition_plans_updated_at on public.nutrition_plans;
--
-- -- 4) Tablolar (meals -> plans sırası; CASCADE FK'yi de düşürür)
-- drop table if exists public.nutrition_plan_meals;
-- drop table if exists public.nutrition_plans;
--
-- -- 5) profiles.nutrition_plan yorumunu eski hâline döndür
-- comment on column public.profiles.nutrition_plan
--   is 'JSON string: Record<gün, { items: [], total: {} }>. Uygulama JSON.stringify ile yazar.';
--
-- commit;
--
-- =============================================================================
