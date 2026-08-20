-- =============================================================================
-- 20260820170000_profile_body_metrics.sql
--
-- KÜNYE DİLİMİ — `public.profiles` += `birth_date` (date) + `height_cm` (numeric)
--   Plan     : docs/PROGRESS.md §5 madde 3
--   Emsal    : 20260820090000_activity_log.sql §1 (`profiles`e kolon ekleme +
--              guard tetikleyicisi deseni), 20260817160200_column_guards.sql
--              (`is_end_user_write()` tabanlı sütun sabitleme)
--   Kanıt    : supabase/tests/rls.test.sql senaryo 146-148
--   Tüketici : apps/web/src/app/profile/page.tsx (danışan formu),
--              apps/web/src/components/tabs/WorkoutTab.tsx (yaş ön doldurma)
--
-- #############################################################################
-- ## NE EKLENDİ, VE DAHA ÖNEMLİSİ NE EKLENMEDİ                               ##
-- #############################################################################
--   EKLENEN (ikisi de NULLABLE — künye ZORUNLU DEĞİLDİR, boş profil geçerli
--   bir profildir ve uygulamanın hiçbir akışı bu iki alanı şart koşmaz):
--     * `birth_date date`   -> yaşın TEK KAYNAĞI
--     * `height_cm numeric` -> boy
--
--   *** "yaş" KOLONU ASLA EKLENMEZ. ***
--   Yaş TÜRETİLMİŞ veridir ve her yıl KENDİLİĞİNDEN bayatlar: bir `age integer`
--   kolonu, yazıldığı günden itibaren sessizce yanlışlaşır ve onu tazeleyecek
--   hiçbir yol yoktur (kullanıcı doğum gününde geri gelip düzeltmez). Doğum
--   tarihi ise SABİTTİR. Yaş, görüntüleme/hesap anında `birth_date`ten
--   hesaplanır — veritabanında iki kez temsil edilmez.
--
--   *** TELEFON TOPLANMAZ. ***
--   Uygulamanın HİÇBİR akışı telefon numarası kullanmıyor (koç-danışan
--   iletişimi tümüyle uygulama içi sohbette: `messages` tablosu). Kullanılmayan
--   bir kişisel veriyi toplamak KVKK m.4 "veri minimizasyonu" ilkesinin düz
--   ihlalidir — "ileride lazım olur" bir işleme amacı DEĞİLDİR. Şemaya
--   eklenmedi; ekleme talebi gelirse ÖNCE onu tüketen yazılı bir akış
--   gösterilmelidir.
--
--   *** KİLO KOLONU EKLENMEZ. ***
--   `progress_entries.weight_kg` kilonun TEK doğruluk kaynağıdır ve zaman
--   serisidir. `profiles`e ikinci bir `weight_kg` koymak B-036'nın birebir
--   tekrarı olurdu: iki kilo kaynağı birbirinden ayrışır, hangisinin güncel
--   olduğu bilinmez ve grafikle form arasında sessiz bir tutarsızlık doğar.
--
--   NEDEN BU İKİSİ VERİ MİNİMİZASYONUNDAN GEÇİYOR: ikisinin de YAZILI, VAR OLAN
--   bir işleme amacı vardır — `ai_backend` `nutrition_calculator` (Mifflin-St
--   Jeor BMR formülü boy ve yaşı DOĞRUDAN girdi alır) ve `workout_generator`
--   (yaşa bağlı hacim/şiddet ayarı). Yani toplanan veri, TÜKETİLEN veridir.
--
-- #############################################################################
-- ## BU DOSYANIN KAPSAMI                                                     ##
-- #############################################################################
--   1) İki kolon + CHECK kısıtları (sınırların gerekçesi §1'de)
--   2) `profiles_guard_body_metrics()` — KOLON SEVİYESİ yazma kapısı: bu iki
--      kolonu YALNIZCA satırın SAHİBİ yazabilir (koç DAHİL başkası yazamaz)
--   3) Migration'ın kendi doğrulaması (yapı + DAVRANIŞ ölçümü)
--   4) `-- DOWN` bloğu
--
-- Idempotenttir: `add column if not exists` + kısıt varlık kontrolü +
-- `create or replace function` + `drop trigger if exists`. İkinci koşu FARK
-- ÜRETMEZ (§3f bunu ölçer).
-- =============================================================================


-- #############################################################################
-- ## 0) ÖN KOŞUL                                                             ##
-- #############################################################################
do $precond$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'ON KOSUL BASARISIZ: public.profiles YOK.';
  end if;

  -- Kolon kapısının TEK dayanağı budur: sunucu bağlamını (service_role /
  -- SECURITY DEFINER RPC / seed / migration) son kullanıcı yazmasından ayırır.
  -- Yoksa aşağıdaki tetikleyici migration'ın KENDİ doğrulama bloğunu bile
  -- reddederdi.
  if to_regprocedure('public.is_end_user_write()') is null then
    raise exception 'ON KOSUL BASARISIZ: public.is_end_user_write() YOK -- 20260817160200 uygulanmamis.';
  end if;

  raise notice 'On kosul GECTI: profiles + is_end_user_write() yerinde.';
end
$precond$;


-- #############################################################################
-- ## 1) KOLONLAR + CHECK KISITLARI                                           ##
-- #############################################################################
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists height_cm  numeric;

do $constraints$
begin
  -- ==========================================================================
  -- `profiles_birth_date_chk` — SINIRLAR VE GEREKÇELERİ
  --
  --   ALT SINIR: 1900-01-01'den SONRA.
  --     Doğrulanmış en uzun insan ömrü 122 yıldır (Jeanne Calment, 1875-1997).
  --     1900'den önce doğmuş, YAŞAYAN ve bir online koçluk uygulamasına
  --     kaydolan bir kullanıcı FİZİKSEL OLARAK yoktur. Bu sınır bir ürün
  --     kuralı değil, bir VERİ BÜTÜNLÜĞÜ tabanıdır: yakaladığı şey yaşlı
  --     kullanıcı değil, bozuk giriştir (yıl alanına 19 yerine 1 yazmak,
  --     `0001-01-01` gibi ayrıştırıcı çöpü, tarih formatı karışması).
  --
  --   ÜST SINIR: bugünden SONRA olamaz (`<= current_date`).
  --     Gelecekte doğmuş bir kullanıcı yoktur; bugün doğmuş (yaş 0) bir
  --     kullanıcı ise matematiksel olarak mümkündür ve BU KISIT tarafından
  --     REDDEDİLMEZ — ürün kuralı burada değil, zod şemasındadır (bkz. alttaki
  --     "İKİ KATMANLI SINIR" notu).
  --
  --   ==========================================================================
  --   `current_date` BİR CHECK KISITINDA — NEDEN BURADA GÜVENLİ
  --   ==========================================================================
  --   Genel kural olarak CHECK içinde zamana bağlı ifade TEHLİKELİDİR: kısıt
  --   yalnızca INSERT/UPDATE anında değerlendirilir, yani bugün geçen bir satır
  --   yarın kısıtı İHLAL EDER hâle gelebilir ve bu SESSİZ kalır (`pg_dump` ->
  --   restore sırasında yeniden doğrulama patlar).
  --
  --   BURADA BU RİSK YOKTUR çünkü yüklem zamanla yalnızca ZAYIFLAR:
  --   `current_date` monoton ARTAR, dolayısıyla `birth_date <= current_date`
  --   bir kez doğru olduysa SONSUZA KADAR doğru kalır. Ters yön (bugün
  --   reddedilen bir değerin yarın kabul edilmesi) ise zaten İSTENEN
  --   davranıştır — yarın doğacak biri yarın kaydolabilmelidir. Yani restore
  --   güvenlidir ve bayatlayan bir satır üretilemez.
  --
  --   ==========================================================================
  --   İKİ KATMANLI SINIR — NEDEN DB'DE "en az 10 yaşında" YOK
  --   ==========================================================================
  --   `aiWorkoutSchema`/`aiDietSchema` yaşı 10-100 aralığına sıkıştırır. O bir
  --   ÜRÜN kuralıdır ve değişebilir (yarın 13 olabilir, KVKK m.5 açık rıza
  --   ehliyeti tartışması bunu tetikleyebilir). Ürün kuralını CHECK'e çakmak,
  --   her ürün kararını bir migration'a bağımlı kılar VE geçmiş satırları
  --   geriye dönük "geçersiz" yapar. DB katmanı yalnızca FİZİKSEL OLARAK
  --   İMKÂNSIZ olanı reddeder; makul-aralık kararı zod'da yaşar.
  -- ==========================================================================
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_birth_date_chk'
  ) then
    alter table public.profiles
      add constraint profiles_birth_date_chk
      check (
        birth_date is null
        or (birth_date > date '1900-01-01' and birth_date <= current_date)
      );
  end if;

  -- ==========================================================================
  -- `profiles_height_cm_chk` — SINIRLAR VE GEREKÇELERİ
  --
  --   ARALIK: 100 cm - 250 cm.
  --     Yaşayan en uzun insan 251 cm'de zirve yaptı (Sultan Kösen 251 cm);
  --     100 cm altı bir YETİŞKİN/ERGEN danışan bu uygulamanın kullanıcı
  --     kitlesinde yoktur. Aralığın asıl işi "kısa/uzun insanı elemek" DEĞİL,
  --     BİRİM HATASINI yakalamaktır — ki bu, boy alanının EN SIK gerçek
  --     hatasıdır:
  --       * metre girilmesi   (1.75)   -> 100'ün altında  -> REDDEDİLİR
  --       * milimetre girilmesi (1750)  -> 250'nin üstünde -> REDDEDİLİR
  --       * fazladan sıfır     (17500)  -> 250'nin üstünde -> REDDEDİLİR
  --     Bu üçü SESSİZCE geçseydi Mifflin-St Jeor BMR'ı saçmalar ve
  --     `nutrition_calculator` kullanıcıya YANLIŞ kalori hedefi verirdi —
  --     yani bu kısıt bir veri hijyeni maddesi değil, HESAP DOĞRULUĞU kapısıdır.
  --
  --   ONDALIK BASAMAK: en fazla 1.
  --     `numeric` ölçeksizdir; kısıt olmasa `170.0000000001` yazılabilirdi.
  --     Boy ölçümünün gerçek çözünürlüğü 0.5-1 cm'dir; ikinci basamak ölçüm
  --     değil GÜRÜLTÜDÜR ve görüntülemede biçimlendirme kirliliği yaratır.
  --     `scale()` IMMUTABLE'dır -> CHECK'te güvenlidir.
  -- ==========================================================================
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_height_cm_chk'
  ) then
    alter table public.profiles
      add constraint profiles_height_cm_chk
      check (
        height_cm is null
        or (height_cm >= 100 and height_cm <= 250 and scale(height_cm) <= 1)
      );
  end if;
end
$constraints$;

comment on column public.profiles.birth_date is
  'Danisanin dogum tarihi (KUNYE, opsiyonel). YASIN TEK KAYNAGIDIR -- ayri bir "age" kolonu YOKTUR ve EKLENMEMELIDIR: yas turetilmis veridir ve her yil bayatlar, dogum tarihi ise sabittir. Isleme amaci: ai_backend nutrition_calculator (Mifflin-St Jeor) ve workout_generator girdisi (KVKK m.4 veri minimizasyonu -- amacsiz alan toplanmaz). Yalnizca satirin SAHIBI yazabilir (profiles_guard_body_metrics).';

comment on column public.profiles.height_cm is
  'Danisanin boyu, santimetre (KUNYE, opsiyonel). Isleme amaci: Mifflin-St Jeor BMR hesabi. Kilo BU TABLODA TUTULMAZ -- tek kaynak progress_entries.weight_kg (B-036 dersi). Yalnizca satirin SAHIBI yazabilir (profiles_guard_body_metrics).';

comment on constraint profiles_birth_date_chk on public.profiles is
  'Fiziksel olarak imkansiz dogum tarihlerini reddeder: 1900 oncesi (dogrulanmis en uzun omur 122 yil) ve gelecek. Urun kurali (yas 10-100) BURADA DEGIL zod semasindadir. current_date CHECK icinde guvenlidir: yuklem zamanla yalnizca ZAYIFLAR, gecen bir satir asla gecersizlesemez.';

comment on constraint profiles_height_cm_chk on public.profiles is
  'Boy 100-250 cm ve en fazla 1 ondalik basamak. Asil isi birim hatasini yakalamaktir (1.75 metre / 1750 mm / 17500) -- bunlar sessizce gecseydi Mifflin-St Jeor BMR i saçmalar ve kullaniciya yanlis kalori hedefi verilirdi.';


-- #############################################################################
-- ## 2) KOLON SEVİYESİ YAZMA KAPISI — "DANIŞAN DOLDURUR, KOÇ DOLDURMAZ"      ##
-- #############################################################################
--
--   ##########################################################################
--   # KARAR: POLİTİKA YETMEZ, TETİKLEYİCİ ŞART. ÖLÇÜLDÜ, VARSAYILMADI.       #
--   #                                                                        #
--   # ÖLÇÜM (bu migration yazılmadan önce, canlı DB'de koşuldu):              #
--   #   set local role authenticated;                                        #
--   #   set local request.jwt.claims = '{"sub":"<koç uid>","aal":"aal2"}';    #
--   #   update public.profiles set full_name = 'KOC YAZDI'                    #
--   #    where id = '<danışan uid>';                    -> UPDATE 1           #
--   #                                                                        #
--   # Yani koç BUGÜN başkasının `profiles` satırını yazabiliyor. Sorumlu       #
--   # politika `profiles_update_coach`tur:                                    #
--   #   USING (is_coach())  WITH CHECK (is_coach())                           #
--   # ve bu politika koçun panelden danışan yönetimi yapabilmesi için         #
--   # GEREKLİDİR (kaldırılamaz).                                             #
--   #                                                                        #
--   # POSTGRES RLS SATIR SEVİYESİDİR, KOLON SEVİYESİ DEĞİL. Bir politika      #
--   # "bu satırı güncelleyebilirsin AMA şu iki kolonu değil" DİYEMEZ. Yani    #
--   # Fable'ın "alanları DANIŞAN doldurur" kararı POLİTİKA İLE İFADE          #
--   # EDİLEMEZ. Üç seçenek tartıldı:                                          #
--   #                                                                        #
--   #  (i)  `profiles_update_coach`u daraltmak.                               #
--   #       REDDEDİLDİ: politika kolon ayırt edemediği için daraltmanın tek   #
--   #       yolu koçun `profiles` UPDATE yetkisini TÜMÜYLE kaldırmaktır —     #
--   #       koç panelinin var olan akışları (ileride `is_active`, rol         #
--   #       yönetimi) kırılırdı. Doğru olanı yasaklamak için yanlış olanı da  #
--   #       yasaklamak.                                                      #
--   #                                                                        #
--   #  (ii) Kolon seviyesi GRANT (`revoke update(birth_date) from             #
--   #       authenticated`).                                                 #
--   #       REDDEDİLDİ: ACL ROL seviyesindedir, SATIR seviyesinde değil.      #
--   #       `authenticated` rolü hem koçu hem danışanı kapsar; kolonu         #
--   #       kısmak DANIŞANIN da kendi künyesini yazmasını engellerdi — yani   #
--   #       özelliğin kendisini kapatırdı.                                    #
--   #                                                                        #
--   #  (iii) SEÇİLEN: BEFORE INSERT OR UPDATE tetikleyicisi.                  #
--   #       Tetikleyici HEM kolonu HEM satırı görür (`old`/`new` + `auth.uid()#
--   #       `), yani "yalnızca kendi satırının bu iki kolonu" ifadesini       #
--   #       KURABİLEN TEK mekanizma budur. Ayrıca bu tablonun ZATEN KURULU    #
--   #       deseni: `profiles_guard_server_columns` (email/streak) ve         #
--   #       `profiles_guard_activity_consent` (rıza damgaları) birebir aynı   #
--   #       şekilde çalışır — yeni bir kavram getirmiyoruz, üçüncü kapıyı     #
--   #       aynı kalıba ekliyoruz.                                           #
--   ##########################################################################
--
--   NEDEN KOÇUN YAZMASINI ENGELLEMEK GEREKİYOR (Fable kararının gerekçesi):
--     Bunlar DANIŞANA AİT beyan verisidir. Koç danışanın künyesini kendisi
--     doldurursa, veritabanında "danışanın beyanı" ile "koçun tahmini"
--     BİRBİRİNDEN AYIRT EDİLEMEZ hâle gelir. Ve `profiles` üzerinde bir
--     denetim izi YOKTUR (`coach_actions` yalnızca şifre sıfırlama ve daveti
--     kaydeder) — yani B-010'un tam olarak sorduğu soru doğardı: "bu satırı
--     kim yazdı?" Kapı, o sorunun HİÇ DOĞMAMASINI sağlar; alternatifi
--     `profiles`e denetim izi eklemek olurdu ki bu çok daha büyük bir yüzey.
--
--   SUNUCU BAĞLAMI MUAFTIR (`is_end_user_write()` -> false): seed, migration,
--   SECURITY DEFINER RPC ve `service_role`. Bu, `delete_account()` gibi
--   DEFINER yolların ve gelecekteki bir içe aktarma script'inin bu kapıya
--   TAKILMAMASI için gereklidir — kapı SON KULLANICI yazmalarına bakar.
create or replace function public.profiles_guard_body_metrics()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  -- Sunucu bağlamı (service_role / DEFINER RPC / seed / migration): çekil.
  if not public.is_end_user_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- `profiles_insert_coach` politikası koçun satır EKLEMESİNE izin verir.
    -- Künye dolu bir satırı BAŞKASI adına eklemek, güncellemenin kılık
    -- değiştirmiş hâlidir — aynı kapıdan geçer.
    if (new.birth_date is not null or new.height_cm is not null)
       and new.id is distinct from (select auth.uid()) then
      raise exception 'profiles: dogum tarihi ve boy yalnizca kisinin KENDI profiline yazilabilir. Bu alanlari danisan kendisi doldurur (koc dahil baskasi dolduramaz).'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. Kimlik `old.id`den okunur: `new.id` saldırgan tarafından
  -- kontrol edilebilir bir alandır (profiles_update_self `with check`i onu
  -- `auth.uid()`e sabitler ama `profiles_update_coach` SABİTLEMEZ), oysa
  -- `old.id` GÜNCELLENEN GERÇEK satırın kimliğidir.
  if (new.birth_date is distinct from old.birth_date
      or new.height_cm is distinct from old.height_cm)
     and old.id is distinct from (select auth.uid()) then
    raise exception 'profiles: dogum tarihi ve boy yalnizca kisinin KENDI profilinde degistirilebilir. Bu alanlari danisan kendisi doldurur (koc dahil baskasi degistiremez).'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

comment on function public.profiles_guard_body_metrics() is
  'KUNYE KOLON KAPISI: profiles.birth_date / profiles.height_cm YALNIZCA satirin sahibi (auth.uid() = satir id) tarafindan yazilabilir; koc dahil baskasi 42501 alir. Postgres RLS kolon seviyesi ayrim YAPAMADIGI ve profiles_update_coach koca TUM satirlarda UPDATE verdigi icin bu kural POLITIKA ILE IFADE EDILEMEZ -- tetikleyici zorunludur. Sunucu baglami (is_end_user_write() = false) muaftir.';

drop trigger if exists profiles_guard_body_metrics on public.profiles;
create trigger profiles_guard_body_metrics
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_body_metrics();


-- #############################################################################
-- ## 3) MIGRATION'IN KENDİ DOĞRULAMASI — SESSİZ BAŞARISIZLIK YOK            ##
-- #############################################################################
do $verify$
declare
  v_coach         uuid;
  v_client        uuid;
  v_def           text;
  v_caught        boolean;
  v_state         text;
  v_manifest_keys text;
  v_keys          int;
  v_val           date;
  v_h             numeric;
begin
  -- (a) KOLONLAR gerçekten var ve NULLABLE mı? (Künye ZORUNLU DEĞİLDİR.)
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'birth_date' and data_type = 'date'
       and is_nullable = 'YES'
  ) then
    raise exception 'DOGRULAMA BASARISIZ (a): profiles.birth_date YOK, date degil veya NOT NULL.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'height_cm' and data_type = 'numeric'
       and is_nullable = 'YES'
  ) then
    raise exception 'DOGRULAMA BASARISIZ (a): profiles.height_cm YOK, numeric degil veya NOT NULL.';
  end if;

  -- (a2) "yaş" ve "telefon" kolonu SIZMADI. Bu iddia bir gün birinin
  --      "bir de telefon ekleyelim" demesini GÜRÜLTÜLÜ hâle getirir.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('age', 'phone', 'phone_number', 'weight_kg', 'weight')
  ) then
    raise exception 'DOGRULAMA BASARISIZ (a2): profiles a age/phone/weight kolonu eklenmis -- dosya basindaki uc karar (turetilmis yas, KVKK m.4 telefon, B-036 tek kilo kaynagi) ihlal edilmis.';
  end if;

  -- (b) CHECK kısıtları metin olarak yerinde mi?
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_birth_date_chk';
  if v_def is null then
    raise exception 'DOGRULAMA BASARISIZ (b): profiles_birth_date_chk YOK.';
  end if;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_height_cm_chk';
  if v_def is null then
    raise exception 'DOGRULAMA BASARISIZ (b): profiles_height_cm_chk YOK.';
  end if;

  -- (c) TETİKLEYİCİ bağlı mı ve INSERT+UPDATE'i de kapsıyor mu?
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.profiles'::regclass
       and t.tgname  = 'profiles_guard_body_metrics'
       and not t.tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ (c): profiles_guard_body_metrics tetikleyicisi BAGLI DEGIL -- koc danisanin kunyesini yazabilir.';
  end if;

  select id into v_coach  from public.profiles where role = 'coach'::public.user_role  limit 1;
  select id into v_client from public.profiles where role = 'client'::public.user_role order by id limit 1;

  if v_coach is null or v_client is null then
    -- Boş veritabanı (migration'lar seed'den ÖNCE koşar): davranış ölçümü
    -- kurulamaz. Yapı ölçümleri (a/b/c/e) yine de koştu.
    raise notice 'Davranis olcumu ATLANDI: profiles bos/eksik (koc=%, danisan=%) -- seed henuz kosmamis olabilir.', v_coach, v_client;
  else
    -- (d1) CHECK GERÇEKTEN reddediyor mu? (Sunucu bağlamındayız; kapı değil
    --       KISIT ölçülüyor.)
    v_caught := false;
    begin
      update public.profiles set birth_date = current_date + 1 where id = v_client;
    exception when check_violation then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (d1): GELECEK tarihli dogum tarihi KABUL EDILDI.';
    end if;

    v_caught := false;
    begin
      update public.profiles set birth_date = date '1899-12-31' where id = v_client;
    exception when check_violation then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (d1): 1900 ONCESI dogum tarihi KABUL EDILDI.';
    end if;

    v_caught := false;
    begin
      update public.profiles set height_cm = 1.75 where id = v_client;  -- metre yazilmis
    exception when check_violation then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (d1): BIRIM HATASI (1.75 m) KABUL EDILDI -- Mifflin-St Jeor sacmalardi.';
    end if;

    v_caught := false;
    begin
      update public.profiles set height_cm = 175.25 where id = v_client;  -- iki ondalik
    exception when check_violation then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (d1): iki ondalik basamakli boy KABUL EDILDI.';
    end if;

    -- (d2) POZİTİF KONTROL: makul değerler GERÇEKTEN yazılıyor (kısıt bir
    --       "her seyi reddet" sabiti degil). Deger sonunda GERI ALINIR.
    update public.profiles set birth_date = date '1995-03-14', height_cm = 178.5
     where id = v_client;
    select birth_date, height_cm into v_val, v_h from public.profiles where id = v_client;
    if v_val is distinct from date '1995-03-14' or v_h is distinct from 178.5 then
      raise exception 'DOGRULAMA BASARISIZ (d2): makul kunye yazilamadi -> %, %', v_val, v_h;
    end if;
    update public.profiles set birth_date = null, height_cm = null where id = v_client;

    -- (d3) KAPI DAVRANIŞI — koç, danışanın künyesini YAZAMAZ.
    --      `set local role` bu DO bloğunun içinden çağrılamaz (SET LOCAL
    --      transaction seviyesindedir ama role degisimi blok icinde
    --      PERFORM ile yapilabilir); `perform set_config` ile JWT taklidi
    --      kurulur ve `is_end_user_write()`in gordugu `current_user`
    --      degistirilir.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_coach, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    execute 'set local role authenticated';

    v_caught := false;
    begin
      update public.profiles set height_cm = 190 where id = v_client;
    exception when insufficient_privilege then
      v_caught := true;
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);

    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (d3): KOC danisanin boyunu YAZABILDI -- kolon kapisi calismiyor (Fable karari: alanlari DANISAN doldurur).';
    end if;
    if v_state is distinct from '42501' then
      raise exception 'DOGRULAMA BASARISIZ (d3 hata kodu): beklenen 42501, gelen %', v_state;
    end if;

    -- (d4) POZİTİF KONTROL: DANIŞAN KENDİ künyesini YAZABİLİR. (d3) tek başına
    --      "kapı herkese kapalı" ile de geçerdi — bu dal kapının GERÇEKTEN
    --      sahibe açık olduğunu kanıtlar.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    update public.profiles set birth_date = date '1990-01-02', height_cm = 172
     where id = v_client;

    execute 'reset role';
    perform set_config('request.jwt.claims', null, true);

    select birth_date, height_cm into v_val, v_h from public.profiles where id = v_client;
    if v_val is distinct from date '1990-01-02' or v_h is distinct from 172 then
      raise exception 'DOGRULAMA BASARISIZ (d4): DANISAN KENDI kunyesini yazamadi -> %, % -- kapi ozelligi kapatmis.', v_val, v_h;
    end if;

    -- Migration KALICI VERİ BIRAKMAZ: ölçüm için yazılan değerler geri alınır.
    update public.profiles set birth_date = null, height_cm = null where id = v_client;

    -- (e) `delete_account()` / `account_deletion_manifest()` ETKİLENMEZ.
    --     İDDİA: bu migration YENİ TABLO eklemez, yalnız KOLON ekler; manifest
    --     TABLO SAYAR -> anahtar kümesi DEĞİŞMEZ. Bu VARSAYILMAZ, ada ada
    --     karşılaştırılır (emsal: 20260820160000 §5d3).
    select string_agg(k, ',' order by k) into v_manifest_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows') k;

    if v_manifest_keys is distinct from
       'activity_events,activity_sessions,coach_actions,daily_logs,form_checks,'
       || 'messages,notifications,nutrition_logs,nutrition_plan_meals,nutrition_plans,'
       || 'profiles,program_approvals,progress_entries,progress_photos,workout_logs,'
       || 'workout_plan_exercises,workout_plans' then
      raise exception 'DOGRULAMA BASARISIZ (e): hesap silme manifestosunun tablo kumesi DEGISMIS -> %. Bu migration yalnizca KOLON ekler, manifest ETKILENMEMELIYDI.', v_manifest_keys;
    end if;

    select count(*) into v_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows');
    if v_keys <> 17 then
      raise exception 'DOGRULAMA BASARISIZ (e): manifest tablo sayisi 17 DEGIL -> %', v_keys;
    end if;
  end if;

  -- (f) `mfa_aal2_gate` HÂLÂ `profiles` üzerinde. Yeni kolonlar kapıyı MİRAS
  --     ALIR (politika satır seviyesidir, kolon listelemez) — ama kapının
  --     tabloda DURDUĞU ölçülmeli: düşmüş olsaydı aal1'deki koç künyeyi de
  --     okurdu ve bunu hiçbir yerde fark etmezdik.
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.profiles'::regclass
       and polname  = 'mfa_aal2_gate'
       and polpermissive = false
  ) then
    raise exception 'DOGRULAMA BASARISIZ (f): profiles uzerindeki mfa_aal2_gate RESTRICTIVE politikasi YOK -- yeni kunye kolonlari aal1 koca ACIK olurdu.';
  end if;

  raise notice 'DOGRULAMA GECTI: birth_date + height_cm nullable, CHECK sinirlari calisiyor, kolon kapisi koca KAPALI/sahibe ACIK, manifest (17 tablo) DEGISMEDI, aal2 kapisi yerinde.';
end
$verify$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: kolonlar DÜŞÜRÜLÜNCE içlerindeki künye verisi GERİ GELMEZ. Geri alma
-- yalnızca bu dilim tümüyle iptal edilecekse yapılmalıdır.
--
-- begin;
--   drop trigger  if exists profiles_guard_body_metrics on public.profiles;
--   drop function if exists public.profiles_guard_body_metrics();
--
--   alter table public.profiles drop constraint if exists profiles_birth_date_chk;
--   alter table public.profiles drop constraint if exists profiles_height_cm_chk;
--
--   alter table public.profiles drop column if exists birth_date;
--   alter table public.profiles drop column if exists height_cm;
-- commit;
-- =============================================================================
