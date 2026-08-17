-- =============================================================================
-- 20260817150000_form_check_review.sql
--
-- FAZ 1b / ADIM 5 — `form_checks` tablosuna İNCELEME DURUMU alanları.
--
--     public.form_checks.status         form_check_status -> 'pending' | 'reviewed'
--     public.form_checks.coach_feedback text              -> koçun yazılı geri bildirimi
--     public.form_checks.reviewed_at    timestamptz       -> inceleme anı
--     public.form_checks.reviewed_by    uuid              -> inceleyen koç (profiles)
--
-- NEDEN (Faz 2'nin ŞEMA ÖN KOŞULU):
--   Bugün bir form check gönderildikten sonra sistemde "koç buna baktı mı?"
--   sorusunun cevabı YOK. Koç panelinde bekleyen kuyruk üretilemiyor, danışan
--   ise gönderdiği formun akıbetini göremiyor. Faz 2'nin koç geri bildirim akışı
--   tam olarak bu dört alanın üzerine kurulacak.
--
--   Bu migration YALNIZCA ŞEMADIR. Hiçbir UI bileşeni değişmez; alanları okuyan
--   ve yazan akış Faz 2'nin işidir. `useSubmitFormCheck` bu alanlara DOKUNMAZ —
--   varsayılanlar (`status = 'pending'`) ve §6'daki trigger hepsini karşılar.
--
-- Idempotenttir: enum `duplicate_object` guard'ı, `add column if not exists`,
-- kısıt/indeks varlık kontrolü, `create or replace function` ve
-- `drop trigger if exists` + `create trigger` sayesinde hem sıfırdan
-- (`supabase db reset`) hem mevcut veritabanına güvenle uygulanır.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.form_check_status enum'ı
--
--    İKİ DEĞERLE BAŞLIYORUZ. 'in_review' / 'needs_revision' gibi ara durumlar
--    BİLEREK eklenmedi: bugün onları üretecek bir akış yok ve enum'a kullanılmayan
--    etiket eklemek, ileride anlamı değişirse geri alınamayan bir borçtur
--    (`ALTER TYPE ... DROP VALUE` Postgres'te YOKTUR). Yeni etiket eklemek ise
--    ileride tek satırlık bir `ALTER TYPE ... ADD VALUE`dir.
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.form_check_status as enum ('pending', 'reviewed');
exception
  when duplicate_object then null;   -- zaten var (tekrar çalıştırma)
end
$$;

comment on type public.form_check_status
  is 'Form check inceleme durumu: pending (koç henüz bakmadı) veya reviewed (koç geri bildirim verdi).';


-- -----------------------------------------------------------------------------
-- 2) Kolonlar
--
--    `status` NOT NULL + DEFAULT 'pending' -> var olan TÜM satırlar tek hamlede
--    'pending' olur (bkz. §4 backfill gerekçesi).
--
--    `reviewed_by` -> `profiles(id) on delete set null`: koç profili silinirse
--    incelemenin KENDİSİ kaybolmamalı, yalnızca "kim yaptı" bilgisi düşmeli.
--    DİKKAT: bu, §3'teki tutarlılık kısıtıyla bilinçli bir gerilim içindedir;
--    çözümü §3'ün altındaki notta açıklanmıştır.
-- -----------------------------------------------------------------------------
alter table public.form_checks
  add column if not exists status         public.form_check_status not null default 'pending',
  add column if not exists coach_feedback text,
  add column if not exists reviewed_at    timestamptz,
  add column if not exists reviewed_by    uuid references public.profiles (id) on delete set null;

comment on column public.form_checks.status
  is 'İnceleme durumu. Danışan bu kolonu DEĞİŞTİREMEZ (form_checks_guard_review trigger''ı reddeder).';
comment on column public.form_checks.coach_feedback
  is 'Koçun form check''e yazdığı geri bildirim metni. Yalnızca koç yazabilir (form_checks_guard_review trigger''ı).';
comment on column public.form_checks.reviewed_at
  is 'İncelemenin yapıldığı an. İSTEMCİ GÖNDERMEZ: status ''reviewed''a geçtiğinde trigger now() ile doldurur.';
comment on column public.form_checks.reviewed_by
  is 'İncelemeyi yapan koç. İSTEMCİ GÖNDERMEZ: trigger auth.uid() ile doldurur. Koç profili silinirse NULL olur (kısıt için §3 notuna bakınız).';


-- -----------------------------------------------------------------------------
-- 3) TUTARLILIK KISITI — "incelendi ama kim/ne zaman belli değil" HALİ İMKÂNSIZ
--
--    Bu kısıt olmadan şema üç yalan söylemeye izin verirdi:
--      * status = 'reviewed', reviewed_at = NULL  -> "ne zaman incelendi?" cevapsız
--      * status = 'reviewed', reviewed_by = NULL  -> "kim inceledi?" cevapsız
--      * status = 'pending',  reviewed_at dolu    -> hangisi doğru? Kuyruk mu, kayıt mı?
--
--    Faz 2'nin bekleyen kuyruğu `status = 'pending'` üzerine kurulacak; yukarıdaki
--    üçüncü hâl kuyruğu sessizce yanlış gösterirdi. Bu yüzden kural VERİTABANINDA
--    zorlanır, uygulama katmanında değil.
--
--    reviewed_by ON DELETE SET NULL ile GERİLİM (bilinçli karar):
--      Koç profili silinirse `set null` bu kısıtı ihlal ederdi. TEK KOÇLU üründe
--      koç profilinin silinmesi, ürünün kendisinin sonlanması demektir; ayrıca
--      `profiles` satırları `auth.users` silindiğinde cascade ile düşer, yani bu
--      yol pratikte ancak hesabın tamamen kapatılmasıyla tetiklenir. Kısıtı
--      gevşetip günlük veri bütünlüğünden ödün vermek yerine, bu uç durumda
--      silmenin HATA VERMESİ tercih edildi: sessizce bozuk satır bırakmaktansa
--      operatöre "önce bu satırları ele al" demek daha doğrudur.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.form_checks'::regclass
       and conname  = 'form_checks_review_consistency_chk'
  ) then
    alter table public.form_checks
      add constraint form_checks_review_consistency_chk check (
        (status = 'pending'::public.form_check_status
          and reviewed_at is null
          and reviewed_by is null)
        or
        (status = 'reviewed'::public.form_check_status
          and reviewed_at is not null
          and reviewed_by is not null)
      );
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 4) public.backfill_form_check_review() — VERİ DÖNÜŞÜMÜ
--
--    ##########################################################################
--    # DÖNÜŞÜM KURALI: MEVCUT TÜM SATIRLAR 'pending'.                         #
--    #                                                                        #
--    # Bu migration'dan ÖNCE `form_checks` tablosunda inceleme ile ilgili      #
--    # HİÇBİR kolon yoktu — ne `coach_feedback`, ne bir bayrak, ne bir tarih.  #
--    # Yani "bu form check daha önce incelenmiş miydi?" sorusunu cevaplayacak  #
--    # TEK BİR VERİ NOKTASI BİLE YOK. Elde veri olmadığı için türetilecek bir  #
--    # geçmiş de yoktur; UYDURULMAZ.                                          #
--    #                                                                        #
--    # Bu yüzden dönüşüm fiilen `status` kolonunun DEFAULT'udur ('pending') ve #
--    # aşağıdaki fonksiyon TEMİZ bir veritabanında hiçbir satıra dokunmaz.     #
--    # Fonksiyonun asıl işi ONARIMDIR (aşağıya bakınız).                       #
--    ##########################################################################
--
--    Fonksiyon iki gerçek onarım yapar (§3 kısıtı düşürülmüş/ertelenmiş bir
--    veritabanına uygulandığında ya da kısıt eklenmeden önceki ara durumda):
--
--      rows_demoted : status = 'reviewed' AMA reviewed_at ve reviewed_by'ın
--                     İKİSİ DE NULL -> 'pending'e ÇEKİLİR. Gerekçe: elimizde
--                     incelemenin yapıldığına dair hiçbir kanıt yok. Alternatif
--                     (reviewed_at := now(), reviewed_by := rastgele bir koç)
--                     SAHTE DENETİM İZİ üretirdi.
--      rows_cleaned : status = 'pending' AMA reviewed_at / reviewed_by dolu ->
--                     alanlar NULL'lanır. Kuyruk `status`'e bakar; artık kalıntı
--                     zaman damgası kuyruğu yanıltamaz.
--
--    Kısmen dolu satırlar (status='reviewed', ikisinden YALNIZCA biri NULL)
--    BİLEREK dokunulmadan bırakılır ve `raise warning` ile bildirilir: burada
--    gerçek bir inceleme İZİ vardır, onu silmek veri kaybıdır; tamamlamak ise
--    uydurmadır. Karar operatöre bırakılır.
--
--    IDEMPOTENT: her iki UPDATE de yalnızca BOZUK satırları hedefler ->
--    ikinci çağrı (0, 0, ...) döner.
--
--    Bu bir FONKSİYONDUR, migration gövdesine gömülü değildir. Sebep:
--    `supabase db reset` sırasında migration'lar SEED'DEN ÖNCE koşar, yani
--    dönüşüm her zaman BOŞ tabloda çalışır (no-op). Mantığın doğruluğunu
--    kanıtlamanın tek yolu onu testten çağırabilmektir
--    (supabase/tests/transform.test.sql senaryo 23–26).
--
--    SECURITY DEFINER: tüm satırları dolaşır, çağıranın RLS'ine takılmamalıdır.
-- -----------------------------------------------------------------------------
create or replace function public.backfill_form_check_review()
returns table (rows_demoted integer, rows_cleaned integer, rows_pending integer, rows_reviewed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_demoted  integer := 0;
  v_cleaned  integer := 0;
  v_pending  integer := 0;
  v_reviewed integer := 0;
  v_partial  integer := 0;
  v_row      record;
begin
  -- --- 4a) Kanıtsız 'reviewed' satırları 'pending'e çek ---------------------
  with demoted as (
    update public.form_checks fc
       set status = 'pending'::public.form_check_status
     where fc.status      = 'reviewed'::public.form_check_status
       and fc.reviewed_at is null
       and fc.reviewed_by is null
    returning 1
  )
  select count(*) into v_demoted from demoted;

  -- --- 4b) 'pending' satırlardaki kalıntı inceleme alanlarını temizle -------
  with cleaned as (
    update public.form_checks fc
       set reviewed_at = null,
           reviewed_by = null
     where fc.status = 'pending'::public.form_check_status
       and (fc.reviewed_at is not null or fc.reviewed_by is not null)
    returning 1
  )
  select count(*) into v_cleaned from cleaned;

  -- --- 4c) Kısmen dolu satırlar: DOKUNULMAZ, bildirilir ---------------------
  select count(*) into v_partial
    from public.form_checks fc
   where fc.status = 'reviewed'::public.form_check_status
     and (fc.reviewed_at is null) <> (fc.reviewed_by is null);

  if v_partial > 0 then
    for v_row in
      select fc.id, fc.client_id, fc.reviewed_at, fc.reviewed_by
        from public.form_checks fc
       where fc.status = 'reviewed'::public.form_check_status
         and (fc.reviewed_at is null) <> (fc.reviewed_by is null)
       order by fc.created_at
       limit 50
    loop
      raise warning 'form_checks backfill ELLE MUDAHALE GEREKIYOR id=% (danisan=%): status=reviewed ama reviewed_at=% reviewed_by=% (biri eksik; ne silindi ne uyduruldu)',
        v_row.id, v_row.client_id, v_row.reviewed_at, v_row.reviewed_by;
    end loop;
  end if;

  -- --- 4d) Sonuç dağılımı ---------------------------------------------------
  select
    count(*) filter (where fc.status = 'pending'::public.form_check_status),
    count(*) filter (where fc.status = 'reviewed'::public.form_check_status)
    into v_pending, v_reviewed
    from public.form_checks fc;

  raise notice 'FORM CHECK INCELEME BACKFILL OZETI: % satir pending e cekildi, % satir temizlendi, % satir elle mudahale bekliyor -> pending=%, reviewed=%',
    v_demoted, v_cleaned, v_partial, v_pending, v_reviewed;

  rows_demoted  := v_demoted;
  rows_cleaned  := v_cleaned;
  rows_pending  := v_pending;
  rows_reviewed := v_reviewed;
  return next;
end;
$$;

comment on function public.backfill_form_check_review()
  is 'form_checks inceleme alanlarının veri dönüşümü/onarımı. Migration öncesi satırların hepsi ''pending''dir (türetilecek veri yoktu). Idempotenttir; testten çağrılabilsin diye fonksiyon olarak yazıldı.';

revoke all     on function public.backfill_form_check_review() from public;
grant  execute on function public.backfill_form_check_review() to service_role;


-- -----------------------------------------------------------------------------
-- 5) Backfill'i ÇALIŞTIR
--
--    NOT: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar, bu
--    yüzden burada 0 satır güncellenir (no-op) — bu BEKLENEN durumdur.
-- -----------------------------------------------------------------------------
do $$
declare
  v_res record;
begin
  select * into v_res from public.backfill_form_check_review();
  raise notice 'form_checks inceleme backfill tamamlandi: demoted=%, cleaned=%, pending=%, reviewed=%',
    v_res.rows_demoted, v_res.rows_cleaned, v_res.rows_pending, v_res.rows_reviewed;
end
$$;


-- -----------------------------------------------------------------------------
-- 6) TRIGGER — SÜTUN BAZLI KORUMA + DENETİM İZİNİN OTOMATİK DOLDURULMASI
--
--    ############ NEDEN RLS TEK BAŞINA YETMİYOR ############################
--    Mevcut politika (20260816090200_rls_policies.sql §4):
--
--        form_checks_update  USING/WITH CHECK (client_id = auth.uid() or is_coach())
--
--    Yani danışan KENDİ satırını güncelleyebilir — ki bu doğrudur, notunu/kilosunu
--    düzeltebilmeli. Ama RLS SATIR bazlıdır, SÜTUN bazlı değildir: aynı politika
--    danışanın `status`'ü 'reviewed' yapmasına, kendine `coach_feedback` yazmasına
--    ve `reviewed_by`'a koçun id'sini koymasına da izin verir. Bekleyen kuyruk
--    danışan tarafından boşaltılabilir hâle gelirdi.
--
--    Postgres'te RLS'e sütun listesi verilemez. İki gerçek seçenek vardı:
--      A) UPDATE'i danışana tamamen kapatmak -> kendi notunu düzeltemez (regresyon).
--      B) Sütun bazlı kontrolü BEFORE trigger'ına taşımak.
--    (B) seçildi. Trigger 42501 (insufficient_privilege) ile reddeder — PostgREST
--    bunu 403'e çevirir, yani istemci "yasak" cevabını doğru kodla alır.
--    ######################################################################
--
--    Trigger'ın ikinci işi DENETİM İZİNİ İSTEMCİDEN ALMAKTIR: `reviewed_at` ve
--    `reviewed_by` istemcinin gönderdiği değerler DEĞİL, sunucunun `now()` ve
--    `auth.uid()` değerleridir. Koç bile geçmiş bir tarih veya başka bir koç
--    kimliği yazamaz. 'pending'e dönüşte ikisi de temizlenir.
--
--    auth.uid() NULL İSE (service_role / seed / migration) TRIGGER ÇEKİLİR:
--      * Sütun koruması uygulanmaz — service_role zaten RLS'i de aşar; burada
--        kontrol etmek yanlış bir güvenlik hissi verirdi.
--      * Değerler OLDUĞU GİBİ bırakılır — aksi hâlde `seed.sql`in yazdığı
--        gerçekçi `reviewed_at` tarihleri now()'a ezilir ve seed anlamsızlaşırdı.
--      Tutarlılık bu yolda §3'teki CHECK kısıtıyla korunur.
--
--    SECURITY DEFINER'a GEREK YOKTUR: `public.is_coach()` zaten SECURITY DEFINER
--    STABLE'dır, yani rol okuması çağıranın RLS'ine takılmaz.
-- -----------------------------------------------------------------------------
create or replace function public.form_checks_guard_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid    := auth.uid();
  v_is_coach boolean;
begin
  -- --- 6a) Oturumsuz bağlam (service_role / seed / migration) --------------
  if v_actor is null then
    return new;
  end if;

  v_is_coach := public.is_coach();

  -- --- 6b) SÜTUN KORUMASI: danışan inceleme alanlarına dokunamaz -----------
  if not v_is_coach then
    if tg_op = 'INSERT' then
      if new.status is distinct from 'pending'::public.form_check_status
         or new.coach_feedback is not null
         or new.reviewed_at    is not null
         or new.reviewed_by    is not null then
        raise exception 'form_checks: danisan inceleme alanlarini (status / coach_feedback / reviewed_at / reviewed_by) belirleyemez. Yeni form check her zaman ''pending'' olarak olusur.'
          using errcode = '42501';
      end if;
    else
      if new.status         is distinct from old.status
         or new.coach_feedback is distinct from old.coach_feedback
         or new.reviewed_at    is distinct from old.reviewed_at
         or new.reviewed_by    is distinct from old.reviewed_by then
        raise exception 'form_checks: danisan inceleme alanlarini (status / coach_feedback / reviewed_at / reviewed_by) degistiremez. Bu alanlari yalnizca koc guncelleyebilir.'
          using errcode = '42501';
      end if;
    end if;

    return new;   -- danışan yolu: denetim izi zaten değişmiyor
  end if;

  -- --- 6c) KOÇ YOLU: denetim izini SUNUCU doldurur -------------------------
  if new.status = 'reviewed'::public.form_check_status then
    -- NOT: `old` PL/pgSQL'de INSERT trigger'ında ATANMAMIŞTIR; alanına erişmek
    -- hata verir. Bu yüzden INSERT dalı AYRI tutulur (kısa devre garantisi yok).
    if tg_op = 'INSERT' then
      -- Yeni satır doğrudan 'reviewed' olarak açılıyor (istemcinin gönderdiği
      -- reviewed_at/reviewed_by değerleri EZİLİR).
      new.reviewed_at := now();
      new.reviewed_by := v_actor;
    elsif old.status is distinct from 'reviewed'::public.form_check_status then
      -- 'pending' -> 'reviewed' geçişi: denetim izi ŞİMDİ oluşur.
      new.reviewed_at := now();
      new.reviewed_by := v_actor;
    else
      -- Zaten 'reviewed': ilk incelemenin izi KORUNUR (geri bildirim metni
      -- düzeltilebilir, ama "ilk ne zaman/kim inceledi" değişmez).
      new.reviewed_at := coalesce(old.reviewed_at, now());
      new.reviewed_by := coalesce(old.reviewed_by, v_actor);
    end if;
  else
    -- 'pending'e dönüş: denetim izi temizlenir (§3 kısıtı bunu şart koşar).
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;

  return new;
end;
$$;

comment on function public.form_checks_guard_review()
  is 'form_checks inceleme alanlarını korur: danışan status/coach_feedback/reviewed_* değiştiremez (42501); koç ''reviewed'' yaptığında reviewed_at/reviewed_by SUNUCUDA (now()/auth.uid()) doldurulur, ''pending''e dönüşte temizlenir. auth.uid() NULL ise (service_role/seed) devreye girmez.';

drop trigger if exists form_checks_guard_review on public.form_checks;
create trigger form_checks_guard_review
  before insert or update
  on public.form_checks
  for each row
  execute function public.form_checks_guard_review();


-- -----------------------------------------------------------------------------
-- 7) İNDEKS — koçun BEKLEYEN KUYRUĞU
--
--    KISMİ (partial) indeks bilinçli: kuyruk sorgusu her zaman
--    `where status = 'pending' order by created_at desc` biçimindedir. Zaman
--    geçtikçe satırların EZİCİ ÇOĞUNLUĞU 'reviewed' olacak; tam indeks bu ölü
--    ağırlığı da taşırdı. Kısmi indeks yalnızca kuyruktaki satırları tutar,
--    yani boyutu kuyruk uzunluğuyla orantılıdır — arşivle değil.
-- -----------------------------------------------------------------------------
create index if not exists form_checks_pending_queue_idx
  on public.form_checks (status, created_at desc)
  where status = 'pending'::public.form_check_status;


-- -----------------------------------------------------------------------------
-- 8) RLS — MEVCUT POLİTİKALAR KORUNUR (§6 trigger'ı tamamlar)
--
--    Doğrulama (20260816090200_rls_policies.sql §4, kolon adları
--    20260817090000_rename_roles.sql ile client_id oldu):
--      form_checks_select : client_id = auth.uid() or public.is_coach()
--      form_checks_insert : client_id = auth.uid()          -> +§6 trigger'ı
--      form_checks_update : client_id = auth.uid() or public.is_coach()
--                           -> SATIR erişimi doğru, SÜTUN kısıtı §6'da
--      form_checks_delete : client_id = auth.uid() or public.is_coach()
--
--    Aşağıdaki blok bu varsayımı çalışma zamanında doğrular: politika beklenen
--    hâlinden saparsa migration UYARI basar (sessizce yanlış varsayımla devam etmez).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'form_checks'
       and policyname = 'form_checks_update'
       and qual like '%client_id%'
  ) then
    raise warning 'form_checks_update politikasi beklenen halinde degil: sutun korumasi (form_checks_guard_review) yanlis varsayim uzerine kurulmus olabilir.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'form_checks'
       and policyname = 'form_checks_select'
       and qual like '%is_coach%'
  ) then
    raise warning 'form_checks_select politikasi beklenen halinde degil: kocun bekleyen kuyrugu bos gorunebilir.';
  end if;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `coach_feedback` metinleri ve tüm inceleme geçmişi geri alma ile
-- -- KALICI OLARAK KAYBOLUR — bu bilgiyi tutan başka bir kolon YOKTUR.
-- -- Geri almadan önce yedek alın:
-- --   create table public.form_checks_review_backup as
-- --     select id, status, coach_feedback, reviewed_at, reviewed_by
-- --       from public.form_checks where status = 'reviewed';
-- --
-- -- Aşağıdaki bloğu olduğu gibi psql'e yapıştırarak çalıştırabilirsiniz.
-- =============================================================================
--
-- begin;
--
-- -- 1) Trigger ve fonksiyonlar
-- drop trigger  if exists form_checks_guard_review on public.form_checks;
-- drop function if exists public.form_checks_guard_review();
-- drop function if exists public.backfill_form_check_review();
--
-- -- 2) İndeks
-- drop index if exists public.form_checks_pending_queue_idx;
--
-- -- 3) Kısıt
-- alter table public.form_checks
--   drop constraint if exists form_checks_review_consistency_chk;
--
-- -- 4) Kolonlar (status en sonda: kısmi indeks ve kısıt ona dayanıyordu)
-- alter table public.form_checks
--   drop column if exists reviewed_by,
--   drop column if exists reviewed_at,
--   drop column if exists coach_feedback,
--   drop column if exists status;
--
-- -- 5) Enum (kolon düştükten SONRA)
-- drop type if exists public.form_check_status;
--
-- commit;
--
-- =============================================================================
