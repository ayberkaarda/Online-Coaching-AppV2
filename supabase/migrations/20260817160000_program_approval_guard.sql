-- =============================================================================
-- 20260817160000_program_approval_guard.sql
--
-- FAZ 1.5 / GÜVENLİK — AC-01 (High) + AC-07 (Low):
-- `public.program_approvals` ONAY KAPISININ SUNUCU TARAFINDA ZORLANMASI.
--
-- BULGU (docs/security/findings-access-control.md §3.1 ve §3.7):
--   Tabloda `status` için CHECK kısıtı YOKTU ve HİÇBİR trigger YOKTU. RLS
--   politikaları yalnızca SATIR sahipliğini kontrol ediyordu:
--
--     program_approvals_insert       INSERT  (client_id = auth.uid())
--     program_approvals_update_coach UPDATE  is_coach()
--     program_approvals_delete       DELETE  (client_id = auth.uid()) or is_coach()
--
--   Sonuç: danışan tek bir `POST /rest/v1/program_approvals` isteğiyle
--     {"client_id":"<kendi id>","status":"approved","reviewed_by":"<koç id>", …}
--   yazabiliyordu (canlı kanıt W5). UPDATE koça kilitli olsa da (W6, etkilenen=0)
--   danışan kendi bekleyen kaydını SİLİP `approved` olarak yeniden ekleyerek
--   (W7) kısıtı tümüyle anlamsız kılıyordu. Koçun onay kuyruğu
--   (`usePendingApprovals` -> `status='pending'`) sessizce boşalıyor ve koçun HİÇ
--   dokunmadığı bir programın "koç tarafından onaylandığını" iddia eden kayıt
--   oluşuyordu.
--
-- ÇÖZÜM — `form_checks` ile AYNI DESEN (20260817150000_form_check_review.sql §6):
--   1) Tutarlılık CHECK kısıtı: "onaylandı ama kim/ne zaman belli değil" hâli
--      şemada İMKÂNSIZ olur.
--   2) BEFORE INSERT/UPDATE trigger'ı:
--        * INSERT her zaman 'pending' + reviewed_* NULL (aksi hâlde 42501).
--        * `status`'ü 'pending' dışına yalnızca `is_coach()` çıkarabilir.
--        * Koç güncellemesinde `reviewed_by`/`reviewed_at` SUNUCUDA
--          (`auth.uid()` / `now()`) doldurulur; istemciden geleni KABUL ETMEZ.
--   3) DELETE politikası daraltılır: danışan yalnızca 'pending' kaydını geri
--      çekebilir; kararlaştırılmış (approved/rejected) kaydı SİLEMEZ (§4).
--
--   EZMEK YERİNE HATA VERMEK (bilinçli karar): danışan `status='approved'`
--   gönderdiğinde sunucu bunu sessizce 'pending'e çevirmez, 42501 ile REDDEDER.
--   Gerekçe: (a) `form_checks_guard_review()` zaten bu yolu izliyor ve iki tablo
--   arasında farklı sözleşme öğretmek istemci geliştiricisini yanıltır;
--   (b) sessiz ezme, saldırganın denemesini LOG'suz bırakır ve dürüst istemcinin
--   hatalı payload'ını da gizler — "kabul ettim ama başka bir şey yazdım" en kötü
--   API davranışıdır. İSTİSNA: koç yolunda `reviewed_by`/`reviewed_at` EZİLİR
--   (hata verilmez), çünkü mevcut uygulama kodu (`useProgramApprovals.ts:108-115`)
--   bu iki alanı BUGÜN gönderiyor; hata vermek çalışan akışı kırardı.
--
-- Idempotenttir: kısıt varlık kontrolü, `create or replace function`,
-- `drop trigger if exists` + `create trigger`, `drop policy if exists`.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.backfill_program_approval_review() — ONARIM
--
--    Kısıt (§2) eklenmeden ÖNCE veritabanında AC-01 ile üretilmiş sahte kayıtlar
--    olabilir (denetim raporundaki W5/W7 sömürüsü canlı ortamda kullanıldıysa).
--    Kısıdı doğrudan eklemek bu satırlarda migration'ı PATLATIRDI.
--
--    Onarım kuralları — `backfill_form_check_review()` ile birebir aynı felsefe:
--      rows_demoted : status <> 'pending' AMA reviewed_at ve reviewed_by'ın İKİSİ
--                     DE NULL -> 'pending'e çekilir. Elimizde incelemenin
--                     yapıldığına dair HİÇBİR kanıt yok; sahte denetim izi
--                     (now() + rastgele koç) UYDURMAK olurdu.
--      rows_cleaned : status = 'pending' AMA reviewed_* dolu -> alanlar NULL'lanır.
--
--    Kısmen dolu satırlar (status<>'pending', ikisinden YALNIZCA biri NULL)
--    DOKUNULMADAN bırakılır ve `raise warning` ile bildirilir: gerçek bir iz
--    vardır, silmek veri kaybı; tamamlamak uydurmadır. Karar operatöre aittir.
--    NOT: Böyle bir satır varsa §2'deki kısıt eklenemez ve migration operatörü
--    bilinçli olarak durdurur — sessizce yanlış veriyle devam etmekten iyidir.
--
--    IDEMPOTENT: her iki UPDATE de yalnızca BOZUK satırları hedefler.
--    Fonksiyon olarak yazılmasının sebebi `backfill_form_check_review()` ile
--    aynıdır: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar,
--    yani gövdeye gömülseydi mantık HİÇ çalışmaz ve test edilemezdi.
--
--    SECURITY DEFINER: tüm satırları dolaşır, çağıranın RLS'ine takılmamalıdır.
-- -----------------------------------------------------------------------------
create or replace function public.backfill_program_approval_review()
returns table (rows_demoted integer, rows_cleaned integer, rows_pending integer, rows_decided integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_demoted integer := 0;
  v_cleaned integer := 0;
  v_pending integer := 0;
  v_decided integer := 0;
  v_partial integer := 0;
  v_row     record;
begin
  -- --- 1a) Kanıtsız 'approved'/'rejected' satırları 'pending'e çek -----------
  with demoted as (
    update public.program_approvals pa
       set status = 'pending'::public.approval_status
     where pa.status      <> 'pending'::public.approval_status
       and pa.reviewed_at is null
       and pa.reviewed_by is null
    returning 1
  )
  select count(*) into v_demoted from demoted;

  -- --- 1b) 'pending' satırlardaki kalıntı inceleme alanlarını temizle --------
  with cleaned as (
    update public.program_approvals pa
       set reviewed_at = null,
           reviewed_by = null
     where pa.status = 'pending'::public.approval_status
       and (pa.reviewed_at is not null or pa.reviewed_by is not null)
    returning 1
  )
  select count(*) into v_cleaned from cleaned;

  -- --- 1c) Kısmen dolu satırlar: DOKUNULMAZ, bildirilir ----------------------
  select count(*) into v_partial
    from public.program_approvals pa
   where pa.status <> 'pending'::public.approval_status
     and (pa.reviewed_at is null) <> (pa.reviewed_by is null);

  if v_partial > 0 then
    for v_row in
      select pa.id, pa.client_id, pa.status, pa.reviewed_at, pa.reviewed_by
        from public.program_approvals pa
       where pa.status <> 'pending'::public.approval_status
         and (pa.reviewed_at is null) <> (pa.reviewed_by is null)
       order by pa.created_at
       limit 50
    loop
      raise warning 'program_approvals backfill ELLE MUDAHALE GEREKIYOR id=% (danisan=%): status=% ama reviewed_at=% reviewed_by=% (biri eksik; ne silindi ne uyduruldu)',
        v_row.id, v_row.client_id, v_row.status, v_row.reviewed_at, v_row.reviewed_by;
    end loop;
  end if;

  -- --- 1d) Sonuç dağılımı ---------------------------------------------------
  select
    count(*) filter (where pa.status  = 'pending'::public.approval_status),
    count(*) filter (where pa.status <> 'pending'::public.approval_status)
    into v_pending, v_decided
    from public.program_approvals pa;

  raise notice 'PROGRAM ONAY BACKFILL OZETI: % satir pending e cekildi, % satir temizlendi, % satir elle mudahale bekliyor -> pending=%, karara baglanmis=%',
    v_demoted, v_cleaned, v_partial, v_pending, v_decided;

  rows_demoted := v_demoted;
  rows_cleaned := v_cleaned;
  rows_pending := v_pending;
  rows_decided := v_decided;
  return next;
end;
$$;

comment on function public.backfill_program_approval_review()
  is 'program_approvals inceleme alanlarının onarımı: kanıtsız approved/rejected satırlar ''pending''e çekilir, pending satırlardaki kalıntı reviewed_* alanları temizlenir. Idempotenttir; §2 kısıtı eklenmeden önce çalışır.';

revoke all     on function public.backfill_program_approval_review() from public;
grant  execute on function public.backfill_program_approval_review() to service_role;


-- Onarımı ÇALIŞTIR (temiz veritabanında no-op — migration'lar seed'den önce koşar).
do $$
declare
  v_res record;
begin
  select * into v_res from public.backfill_program_approval_review();
  raise notice 'program_approvals onay backfill tamamlandi: demoted=%, cleaned=%, pending=%, decided=%',
    v_res.rows_demoted, v_res.rows_cleaned, v_res.rows_pending, v_res.rows_decided;
end
$$;


-- -----------------------------------------------------------------------------
-- 2) TUTARLILIK KISITI — "onaylandı ama kim/ne zaman belli değil" İMKÂNSIZ
--
--    Bu kısıt olmadan şema üç yalan söylemeye izin verir:
--      * status='approved', reviewed_at NULL  -> "ne zaman onaylandı?" cevapsız
--      * status='approved', reviewed_by NULL  -> "kim onayladı?" cevapsız
--      * status='pending',  reviewed_* dolu   -> kuyruk mu, karar mı?
--
--    `usePendingApprovals` kuyruğu `status='pending'` üzerine kuruludur; üçüncü
--    hâl kuyruğu sessizce yanlış gösterirdi. Kural VERİTABANINDA zorlanır.
--
--    reviewed_by ON DELETE SET NULL ile GERİLİM (form_checks §3 ile aynı bilinçli
--    karar): koç profili silinirse `set null` bu kısıtı ihlal eder ve silme HATA
--    VERİR. Tek koçlu üründe koç profilinin silinmesi ürünün sonlanmasıdır;
--    sessizce bozuk satır bırakmaktansa operatöre "önce bu satırları ele al"
--    demek doğrudur.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.program_approvals'::regclass
       and conname  = 'program_approvals_review_consistency_chk'
  ) then
    alter table public.program_approvals
      add constraint program_approvals_review_consistency_chk check (
        (status  = 'pending'::public.approval_status
          and reviewed_at is null
          and reviewed_by is null)
        or
        (status <> 'pending'::public.approval_status
          and reviewed_at is not null
          and reviewed_by is not null)
      );
  end if;
end
$$;

comment on column public.program_approvals.status
  is 'Onay durumu. INSERT her zaman ''pending''dir; ''pending'' dışına YALNIZCA koç çıkarabilir (program_approvals_guard_review trigger''ı, 42501).';
comment on column public.program_approvals.reviewed_at
  is 'Kararın verildiği an. İSTEMCİ GÖNDERMEZ: trigger now() ile doldurur, gönderilen değer EZİLİR.';
comment on column public.program_approvals.reviewed_by
  is 'Kararı veren koç. İSTEMCİ GÖNDERMEZ: trigger auth.uid() ile doldurur, gönderilen değer EZİLİR (AC-07).';


-- -----------------------------------------------------------------------------
-- 3) TRIGGER — ONAY KAPISI + DENETİM İZİNİN SUNUCUDAN DOLDURULMASI
--
--    ############ NEDEN RLS TEK BAŞINA YETMİYOR ############################
--    RLS SATIR bazlıdır, SÜTUN bazlı değildir. `program_approvals_insert`
--    politikası "bu satır senin mi?" sorusunu sorar; "bu satırdaki `status`
--    değerini yazmaya hakkın var mı?" sorusunu SORAMAZ. Postgres'te RLS'e sütun
--    listesi verilemez. Kontrol BEFORE trigger'ına taşınır ve 42501
--    (insufficient_privilege) ile reddedilir — PostgREST bunu 403'e çevirir.
--    ######################################################################
--
--    auth.uid() NULL İSE (service_role / seed / migration) TRIGGER ÇEKİLİR:
--    form_checks §6 ile aynı gerekçe — service_role zaten RLS'i aşar, burada
--    kontrol etmek yanlış bir güvenlik hissi verirdi; ayrıca `seed.sql`in
--    yazdığı gerçekçi tarihler now()'a ezilmemelidir. Tutarlılık bu yolda
--    §2'deki CHECK kısıtıyla korunur.
--
--    SECURITY DEFINER'a GEREK YOKTUR: `public.is_coach()` zaten SECURITY DEFINER
--    STABLE'dır, yani rol okuması çağıranın RLS'ine takılmaz.
-- -----------------------------------------------------------------------------
create or replace function public.program_approvals_guard_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_is_coach boolean;
begin
  -- --- 3a) Oturumsuz bağlam (service_role / seed / migration) ---------------
  if v_actor is null then
    return new;
  end if;

  v_is_coach := public.is_coach();

  -- --- 3b) INSERT: HER ZAMAN 'pending', denetim izi BOŞ --------------------
  --     Bu kural KOÇ İÇİN DE geçerlidir. Gerekçe: `program_approvals_insert`
  --     politikası zaten `client_id = auth.uid()` olduğu için koç ancak KENDİSİ
  --     için onay kaydı açabilir; "koç doğrudan onaylı kayıt açar" diye bir akış
  --     ÜRÜNDE YOKTUR. Kuralı herkese uygulamak "onay kaydı her zaman kuyruktan
  --     başlar" değişmezini tek cümleyle ifade eder ve ileride koç hesabı ele
  --     geçirilse bile sahte "zaten onaylanmıştı" kaydı üretilemez.
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending'::public.approval_status
       or new.reviewed_at is not null
       or new.reviewed_by is not null then
      raise exception 'program_approvals: onay alanlarini (status / reviewed_at / reviewed_by) INSERT sirasinda belirleyemezsiniz. Yeni onay talebi her zaman ''pending'' olarak olusur.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- --- 3c) UPDATE / DANIŞAN: 'pending' dışına ÇIKARAMAZ --------------------
  --     RLS (`program_approvals_update_coach`) bugün danışanın UPDATE'ini zaten
  --     0 satırda bırakıyor; bu dal SAVUNMA DERİNLİĞİDİR: politika ileride
  --     gevşetilirse (örn. danışanın kendi talebini geri çekmesi) onay kapısı
  --     yine de kapalı kalır.
  if not v_is_coach then
    if new.status      is distinct from old.status
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'program_approvals: danisan onay alanlarini (status / reviewed_at / reviewed_by) degistiremez. Bu alanlari yalnizca koc guncelleyebilir.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- --- 3d) UPDATE / KOÇ: denetim izini SUNUCU doldurur ---------------------
  if new.status <> 'pending'::public.approval_status then
    if old.status = 'pending'::public.approval_status then
      -- 'pending' -> 'approved'/'rejected': denetim izi ŞİMDİ oluşur.
      -- İstemcinin gönderdiği reviewed_at/reviewed_by EZİLİR (AC-07).
      new.reviewed_at := now();
      new.reviewed_by := v_actor;
    else
      -- Zaten karara bağlanmış: İLK kararın izi KORUNUR ('approved' -> 'rejected'
      -- düzeltmesi kararı değiştirir, "ilk ne zaman/kim baktı"yı değiştirmez).
      new.reviewed_at := coalesce(old.reviewed_at, now());
      new.reviewed_by := coalesce(old.reviewed_by, v_actor);
    end if;
  else
    -- 'pending'e geri dönüş: denetim izi temizlenir (§2 kısıtı bunu şart koşar).
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;

  return new;
end;
$$;

comment on function public.program_approvals_guard_review()
  is 'program_approvals onay kapısı: INSERT her zaman ''pending'' + reviewed_* NULL (42501); ''pending'' dışına yalnızca koç çıkarabilir; koç yolunda reviewed_at/reviewed_by SUNUCUDA (now()/auth.uid()) doldurulur, istemciden gelen değerler ezilir. auth.uid() NULL ise (service_role/seed) devreye girmez.';

drop trigger if exists program_approvals_guard_review on public.program_approvals;
create trigger program_approvals_guard_review
  before insert or update
  on public.program_approvals
  for each row
  execute function public.program_approvals_guard_review();


-- -----------------------------------------------------------------------------
-- 4) DELETE POLİTİKASI — danışan yalnızca KENDİ 'pending' kaydını geri çekebilir
--
--    ESKİ: using ((client_id = auth.uid()) or is_coach())
--    YENİ: using (is_coach() or (client_id = auth.uid() and status = 'pending'))
--
--    NEDEN: §3'teki trigger INSERT/UPDATE yolunu kapatır ama DELETE yolunu
--    KAPATMAZ. Eski politikayla danışan, koçun 'approved' verdiği kaydı silip
--    DENETİM İZİNİ YOK EDEBİLİRDİ — "koç bunu onaylamıştı" kanıtı ortadan
--    kalkardı. (Sahte 'approved' üretme yolu artık §3b ile kapalı; kalan risk
--    üretme değil, SİLME riskidir.)
--
--    NEDEN TAMAMEN KAPATMIYORUZ: danışanın yanlışlıkla gönderdiği, koçun henüz
--    bakmadığı ('pending') talebi geri çekebilmesi makul bir üründür ve bu kayıt
--    henüz hiçbir denetim izi taşımaz.
--
--    UYGULAMA KODU DOĞRULANDI: `src/hooks/useProgramApprovals.ts` bu tabloda
--    HİÇ `.delete()` çağırmaz (yalnızca select/insert/update). `grep -rn
--    "program_approvals" src/` çıktısındaki tüm kullanımlar okuma, ekleme ve
--    koçun güncellemesidir. Bu daraltma MEVCUT HİÇBİR AKIŞI KIRMAZ.
-- -----------------------------------------------------------------------------
drop policy if exists program_approvals_delete on public.program_approvals;
create policy program_approvals_delete
  on public.program_approvals
  for delete
  to authenticated
  using (
    public.is_coach()
    or (client_id = auth.uid() and status = 'pending'::public.approval_status)
  );


-- -----------------------------------------------------------------------------
-- 5) RLS VARSAYIM DOĞRULAMASI — politika beklenen hâlinden saparsa UYAR
--     (form_checks §8 ile aynı desen: sessizce yanlış varsayımla devam etme.)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'program_approvals'
       and policyname = 'program_approvals_update_coach'
       and qual like '%is_coach%'
  ) then
    raise warning 'program_approvals_update_coach politikasi beklenen halinde degil: onay kapisi (program_approvals_guard_review) yanlis varsayim uzerine kurulmus olabilir.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'program_approvals'
       and policyname = 'program_approvals_insert'
       and with_check like '%client_id%'
  ) then
    raise warning 'program_approvals_insert politikasi beklenen halinde degil: danisan baskasi adina onay talebi acabiliyor olabilir.';
  end if;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma, onay kapısını YENİDEN AÇAR (AC-01 tekrar sömürülebilir
-- -- hâle gelir). Yalnızca migration'ın kendisi bir üretim sorununa yol açtıysa
-- -- ve düzeltme hazırlanana kadar geçici olarak kullanılmalıdır.
-- =============================================================================
--
-- begin;
--
-- -- 1) Trigger ve fonksiyonlar
-- drop trigger  if exists program_approvals_guard_review on public.program_approvals;
-- drop function if exists public.program_approvals_guard_review();
-- drop function if exists public.backfill_program_approval_review();
--
-- -- 2) Kısıt
-- alter table public.program_approvals
--   drop constraint if exists program_approvals_review_consistency_chk;
--
-- -- 3) DELETE politikasını eski (geniş) hâline döndür
-- drop policy if exists program_approvals_delete on public.program_approvals;
-- create policy program_approvals_delete
--   on public.program_approvals
--   for delete
--   to authenticated
--   using ((client_id = auth.uid()) or public.is_coach());
--
-- commit;
--
-- =============================================================================
