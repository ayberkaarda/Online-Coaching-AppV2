-- =============================================================================
-- 20260817140000_messages_conversation_key.sql
--
-- FAZ 1b / ADIM 4 — `messages` tablosuna KONUŞMA ANAHTARI, OKUNDU BİLGİSİ ve TÜR.
--
--     public.messages.client_id  uuid        -> konuşmanın danışan tarafı
--     public.messages.read_at    timestamptz -> okunma anı (NULL = okunmadı)
--     public.messages.kind       message_kind-> 'user' | 'system'
--
-- NEDEN (`conversations` TABLOSU YOK):
--   `src/hooks/useMessages.ts` bugüne kadar `postgres_changes` ile TÜM `messages`
--   INSERT'lerini dinleyip filtrelemeyi İSTEMCİDE yapıyordu. Sebep teknikti:
--   `postgres_changes` filtresi `sender_id = X OR receiver_id = X` gibi bir OR
--   ifadesini DESTEKLEMEZ. Sonuç: her mesaj trafiği her istemciye ulaşıyordu
--   (RLS satırların İÇERİĞİNİ gizler ama olayın kendisi yine de gelir) — bu
--   ölçeklenmez.
--
--   TEK KOÇLU MODELDE konuşmanın anahtarı DANIŞAN TARAFIDIR. Tek bir `client_id`
--   kolonu üç problemi birden çözer:
--     1) Realtime sunucu tarafında filtrelenebilir: `client_id=eq.<clientId>`.
--     2) Okunmamış sayacı tek indeksle sorgulanır.
--     3) Konuşma listesi/gruplama için ayrı bir `conversations` tablosuna,
--        onun senkronizasyon triggerlarına ve ek RLS yüzeyine GEREK KALMAZ.
--
-- BU MİGRATION `is_read` KOLONUNU **SİLMEZ**.
--   Kolon `DEPRECATED` yorumuyla yan yana yaşamaya devam eder; DROP işlemi
--   Faz 2 kapısında yapılacaktır (bkz. active_planprogram.md §3.5 "eski kolonlar
--   aynı migration'da DROP edilmez").
--
-- Idempotenttir: enum `duplicate_object` guard'ı, `add column if not exists`,
-- `create index if not exists`, `create or replace function`, `drop trigger if
-- exists` + `create trigger` ve backfill'in "yalnızca NULL satırlara dokun"
-- kuralı sayesinde hem sıfırdan (`supabase db reset`) hem mevcut veritabanına
-- güvenle uygulanır.
--
-- Geri alma script'i için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) public.message_kind enum'ı
--
--    'system' bugün ÜRETİLMEZ; ürünün ileride basacağı otomatik bildirimlerin
--    ("koç programı onayladı") sohbet balonundan ayırt edilebilmesi için şimdiden
--    tanımlanır. Var olan tüm satırlar 'user'dır.
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.message_kind as enum ('user', 'system');
exception
  when duplicate_object then null;   -- zaten var (tekrar çalıştırma)
end
$$;

comment on type public.message_kind
  is 'Mesaj türü: user (insan yazdı) veya system (uygulama üretti). Faz 1b''de yalnızca ''user'' üretilir.';


-- -----------------------------------------------------------------------------
-- 2) Kolonlar
--
--    `client_id` şimdilik NULL'a izin verir; backfill'den (§4) SONRA, hiç NULL
--    satır kalmadıysa NOT NULL yapılır (§5).
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists client_id uuid references public.profiles (id) on delete cascade,
  add column if not exists read_at   timestamptz,
  add column if not exists kind      public.message_kind not null default 'user';

comment on column public.messages.client_id
  is 'KONUŞMA ANAHTARI: sohbetin danışan tarafı. Tek koçlu modelde (koç, danışan) çiftini tek kolonla temsil eder; realtime aboneliği bu kolonla sunucu tarafında filtrelenir (client_id=eq.<id>).';
comment on column public.messages.read_at
  is 'Mesajın ALICI tarafından okunduğu an. NULL = okunmadı. Okunmamış sayacı bu kolondan hesaplanır.';
comment on column public.messages.kind
  is 'Mesaj türü. Faz 1b''de tüm satırlar ''user''dır; ''system'' ileride uygulama üretimi mesajlar için ayrılmıştır.';

-- Eski kolon: SİLİNMEZ, yalnızca DEPRECATED işaretlenir.
comment on column public.messages.is_read
  is 'DEPRECATED: read_at kullanın (NULL = okunmadı). Faz 2 kapısında DROP edilecek.';


-- -----------------------------------------------------------------------------
-- 3) İndeks — konuşma sorgusu ve okunmamış sayacı
--
--    Eski `messages_thread_idx (sender_id, receiver_id, created_at)` KORUNUR:
--    `useMessages` geçmiş sorgusu hâlâ yön bağımsız OR ifadesiyle çalışıyor.
-- -----------------------------------------------------------------------------
create index if not exists messages_client_recent_idx
  on public.messages (client_id, created_at desc);


-- -----------------------------------------------------------------------------
-- 4) public.backfill_messages_conversation_key() — VERİ DÖNÜŞÜMÜ
--
--    client_id : gönderen/alıcı çiftinden `role = 'client'` OLANI. İkisi de
--                danışan ya da ikisi de koç ise (veri modeli buna izin vermemeli)
--                satır ATLANIR ve `raise notice` ile bildirilir.
--
--    read_at   : `is_read = true` satırlar için `created_at`, aksi hâlde NULL.
--                ############################################################
--                # BU BİR YAKLAŞIK DEĞERDİR.                                #
--                # Eski şema okunma ANINI hiç saklamıyordu; elimizdeki tek   #
--                # bilgi "okundu mu" bayrağı. `created_at` seçilmesinin      #
--                # gerekçesi: alternatif (NULL bırakmak) TARİHSEL OLARAK     #
--                # OKUNMUŞ TÜM MESAJLARI okunmamış sayacında HORTLATIRDI —   #
--                # kullanıcı bir anda yüzlerce "yeni" mesaj görürdü.         #
--                # Yani read_at, migration ÖNCESİ satırlar için "en geç bu   #
--                # tarihte okunmuştu" anlamına gelir, gerçek okuma anı DEĞİL.#
--                ############################################################
--
--    kind      : kolon varsayılanı ('user') zaten tüm eski satırlara uygulandı;
--                ayrıca bir işlem gerekmez.
--
--    IDEMPOTENT: yalnızca `client_id is null` / `read_at is null` satırlara
--    dokunur -> ikinci çalıştırma hiçbir satırı değiştirmez (0, 0, 0 döner).
--
--    Bu bir FONKSİYONDUR, migration gövdesine gömülü değildir. Sebep:
--    `supabase db reset` sırasında migration'lar SEED'DEN ÖNCE koşar, yani
--    backfill her zaman BOŞ tabloda çalışır (no-op). Mantığın doğruluğunu
--    kanıtlamanın tek yolu onu testten çağırabilmektir
--    (supabase/tests/transform.test.sql senaryo 20–22).
--
--    SECURITY DEFINER: tüm satırları dolaşır, çağıranın RLS'ine takılmamalıdır.
-- -----------------------------------------------------------------------------
create or replace function public.backfill_messages_conversation_key()
returns table (client_ids_filled integer, read_ats_filled integer, rows_skipped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_filled  integer := 0;
  v_reads   integer := 0;
  v_skipped integer := 0;
  -- NOT: bu değişkenin adı AŞAĞIDAKİ SQL'DE KULLANILAN TABLO TAKMA ADLARIYLA
  -- ÇAKIŞMAMALIDIR. plpgsql, SQL içindeki `x.y` referanslarını önce DEĞİŞKEN
  -- olarak çözmeye çalışır; `from resolved r` gibi bir takma ad burada
  -- "record r is not assigned yet" hatası verirdi.
  v_row     record;
begin
  -- --- 4a) client_id -----------------------------------------------------
  with resolved as (
    select
      m.id,
      case
        when ps.role = 'client'::public.user_role and pr.role <> 'client'::public.user_role then m.sender_id
        when pr.role = 'client'::public.user_role and ps.role <> 'client'::public.user_role then m.receiver_id
        else null
      end as resolved_client_id
    from public.messages m
    join public.profiles ps on ps.id = m.sender_id
    join public.profiles pr on pr.id = m.receiver_id
    where m.client_id is null
  ),
  updated as (
    update public.messages m
       set client_id = res.resolved_client_id
      from resolved res
     where m.id = res.id
       and res.resolved_client_id is not null
    returning 1
  )
  select
    (select count(*) from updated),
    (select count(*) from resolved where resolved_client_id is null)
    into v_filled, v_skipped;

  -- Atlanan satırlar SESSİZCE geçilmez: hangi satırın neden çözülemediği loglanır.
  if v_skipped > 0 then
    for v_row in
      select m.id, m.sender_id, m.receiver_id, ps.role as sender_role, pr.role as receiver_role
        from public.messages m
        join public.profiles ps on ps.id = m.sender_id
        join public.profiles pr on pr.id = m.receiver_id
       where m.client_id is null
       order by m.created_at
       limit 50
    loop
      raise notice 'messages backfill ATLANDI id=% (gonderen=% rol=%, alici=% rol=%): konusmanin danisan tarafi belirlenemedi',
        v_row.id, v_row.sender_id, v_row.sender_role, v_row.receiver_id, v_row.receiver_role;
    end loop;
  end if;

  -- --- 4b) read_at (YAKLAŞIK — yukarıdaki gerekçeye bakınız) --------------
  with updated_reads as (
    update public.messages
       set read_at = created_at
     where is_read
       and read_at is null
    returning 1
  )
  select count(*) into v_reads from updated_reads;

  raise notice 'MESAJ BACKFILL OZETI: % satirin client_id''si dolduruldu, % satirin read_at''i dolduruldu, % satir atlandi',
    v_filled, v_reads, v_skipped;

  client_ids_filled := v_filled;
  read_ats_filled   := v_reads;
  rows_skipped      := v_skipped;
  return next;
end;
$$;

comment on function public.backfill_messages_conversation_key()
  is 'messages.client_id / read_at veri dönüşümü. Idempotenttir (yalnızca NULL satırlara dokunur). Testten çağrılabilsin diye fonksiyon olarak yazıldı.';

revoke all     on function public.backfill_messages_conversation_key() from public;
grant  execute on function public.backfill_messages_conversation_key() to service_role;


-- -----------------------------------------------------------------------------
-- 5) Backfill'i ÇALIŞTIR ve mümkünse client_id'yi NOT NULL yap
--
--    NOT: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar, bu
--    yüzden burada 0 satır güncellenir (no-op) — bu BEKLENEN durumdur.
--    Var olan bir veritabanına uygulandığında gerçek veriyi taşır.
--
--    NOT NULL yalnızca HİÇ backfill edilememiş satır KALMADIYSA konur; aksi
--    hâlde migration patlamak yerine uyarı basar (veri kaybetmemek için).
-- -----------------------------------------------------------------------------
do $$
declare
  v_res     record;
  v_null    integer;
  v_notnull boolean;
begin
  select * into v_res from public.backfill_messages_conversation_key();
  raise notice 'messages backfill tamamlandi: client_id=%, read_at=%, atlanan=%',
    v_res.client_ids_filled, v_res.read_ats_filled, v_res.rows_skipped;

  select count(*) into v_null from public.messages where client_id is null;

  select a.attnotnull into v_notnull
    from pg_attribute a
   where a.attrelid = 'public.messages'::regclass
     and a.attname  = 'client_id'
     and not a.attisdropped;

  if v_null = 0 then
    if not coalesce(v_notnull, false) then
      alter table public.messages alter column client_id set not null;
      raise notice 'messages.client_id NOT NULL yapildi.';
    end if;
  else
    raise warning 'messages.client_id NOT NULL YAPILMADI: % satirin client_id''si hala NULL. Bu satirlarin gonderen/alici rolleri tutarsiz (ikisi de danisan veya ikisi de koc).', v_null;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 6) Trigger — YENİ SATIRLARDA client_id DOĞRULUĞU
--
--    İstemci `client_id`'yi kendisi gönderiyor (useSendMessage). RLS `sender_id
--    = auth.uid()` ile kimlik taklidini engelliyor ama YANLIŞ BİR client_id
--    gönderilmesini engellemiyordu: danışan kendi adına yazıp client_id'yi
--    BAŞKA bir danışanınki yaparsa, o danışanın realtime kanalına mesaj
--    düşürebilirdi (RLS satırı okumasını engeller, ama olay yine de gider).
--
--    Bu trigger konuşma anahtarını SUNUCUDA tek doğru kaynağa bağlar:
--      * client_id NULL geldiyse -> gönderen/alıcı çiftinden TÜRETİLİR.
--      * client_id doluysa       -> türetilenle EŞLEŞMİYORSA HATA.
--
--    UPDATE'te de çalışır (yalnızca anahtar kolonlar değiştiğinde): alıcı,
--    kendi satırının read_at'ini güncelleyebildiği için (messages_update_receiver)
--    aynı UPDATE ile client_id'yi başka bir konuşmaya taşıyabilirdi. `update of`
--    listesi sayesinde read_at güncellemeleri trigger'ı HİÇ tetiklemez (toplu
--    "okundu işaretle" maliyeti artmaz).
--
--    SECURITY DEFINER: profil rollerini okur. Çağıranın RLS'i ile çalışsaydı
--    göremediği bir profil için rol NULL döner ve doğru satırlar reddedilirdi.
-- -----------------------------------------------------------------------------
create or replace function public.messages_apply_conversation_key()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender_role   public.user_role;
  v_receiver_role public.user_role;
  v_derived       uuid;
begin
  select p.role into v_sender_role   from public.profiles p where p.id = new.sender_id;
  select p.role into v_receiver_role from public.profiles p where p.id = new.receiver_id;

  if v_sender_role is null or v_receiver_role is null then
    raise exception 'messages: gonderen veya alici profili bulunamadi (sender=%, receiver=%).',
      new.sender_id, new.receiver_id using errcode = '23503';
  end if;

  v_derived := case
    when v_sender_role   = 'client'::public.user_role and v_receiver_role <> 'client'::public.user_role then new.sender_id
    when v_receiver_role = 'client'::public.user_role and v_sender_role   <> 'client'::public.user_role then new.receiver_id
    else null
  end;

  if v_derived is null then
    raise exception 'messages: konusmanin danisan tarafi belirlenemedi (gonderen rolu=%, alici rolu=%). Sohbet yalnizca koc ile danisan arasinda olabilir.',
      v_sender_role, v_receiver_role using errcode = '22023';
  end if;

  if new.client_id is null then
    new.client_id := v_derived;
  elsif new.client_id <> v_derived then
    raise exception 'messages: client_id (%) konusmanin danisan tarafiyla (%) eslesmiyor.',
      new.client_id, v_derived using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.messages_apply_conversation_key()
  is 'messages.client_id''yi INSERT''te türetir, dolu geldiyse doğrular. İstemcinin yanlış konuşma anahtarı göndermesini (yabancı realtime kanalına mesaj düşürmeyi) engeller.';

drop trigger if exists messages_apply_conversation_key on public.messages;
create trigger messages_apply_conversation_key
  before insert or update of sender_id, receiver_id, client_id
  on public.messages
  for each row
  execute function public.messages_apply_conversation_key();


-- -----------------------------------------------------------------------------
-- 7) RLS — MEVCUT POLİTİKALAR KORUNUR
--
--    Doğrulama (20260816090200_rls_policies.sql §8):
--      messages_select          : sender_id = auth.uid() or receiver_id = auth.uid()
--                                 or public.is_coach()      -> client_id ek yüzey açmaz
--      messages_insert          : sender_id = auth.uid()    -> +§6 trigger'ı
--      messages_update_receiver : receiver_id = auth.uid()  -> ALICI kendi
--                                 satırlarının read_at'ini güncelleyebilir. YENİ
--                                 BİR POLİTİKAYA GEREK YOKTUR; gönderen
--                                 karşısındakinin okundu bilgisini DEĞİŞTİREMEZ.
--      messages_delete          : sender_id = auth.uid() or public.is_coach()
--
--    Aşağıdaki blok bu varsayımı çalışma zamanında doğrular: politika beklenen
--    hâlinden saparsa migration UYARI basar (sessizce yanlış varsayımla devam etmez).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'messages'
       and policyname = 'messages_update_receiver'
       and qual like '%receiver_id%'
  ) then
    raise warning 'messages_update_receiver politikasi beklenen halinde degil: read_at guncellemesi (useMarkConversationRead) calismayabilir.';
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 8) Realtime — `messages` yayında olmalı (client_id filtresi buna dayanır)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    begin
      alter publication supabase_realtime add table public.messages;
      raise notice 'messages tablosu supabase_realtime yayinina eklendi.';
    exception
      when undefined_object then
        raise notice 'supabase_realtime publication yok (self-hosted) - atlandi.';
    end;
  else
    raise notice 'DOGRULAMA: messages tablosu supabase_realtime yayininda.';
  end if;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `read_at` ve `kind` kolonlarındaki bilgi geri alma ile KAYBOLUR.
-- -- `is_read` bu migration tarafından SİLİNMEDİĞİ için "okundu mu" bilgisi
-- -- korunur; yalnızca okunma ANI (zaten yaklaşık olan değer) kaybolur.
-- --
-- -- Aşağıdaki bloğu olduğu gibi psql'e yapıştırarak çalıştırabilirsiniz.
-- =============================================================================
--
-- begin;
--
-- -- 1) Trigger ve fonksiyonlar
-- drop trigger  if exists messages_apply_conversation_key on public.messages;
-- drop function if exists public.messages_apply_conversation_key();
-- drop function if exists public.backfill_messages_conversation_key();
--
-- -- 2) İndeks
-- drop index if exists public.messages_client_recent_idx;
--
-- -- 3) Kolonlar (kind -> read_at -> client_id)
-- alter table public.messages
--   drop column if exists kind,
--   drop column if exists read_at,
--   drop column if exists client_id;
--
-- -- 4) Enum (kolon düştükten SONRA)
-- drop type if exists public.message_kind;
--
-- -- 5) is_read yorumunu eski hâline döndür
-- comment on column public.messages.is_read is null;
--
-- commit;
--
-- =============================================================================
