-- =============================================================================
-- 20260817190300_message_read_state.sql
--
-- FAZ 2b — ŞEMA TAMAMLAMA / 5: `is_read` / `read_at` TEKİLLEŞTİRMESİ
--
-- KAYNAK:
--   active_planprogram.md §3.1  -> `conversations`/`messages`: "`read_at
--                                  timestamptz`" (kanonik alan)
--   active_planprogram.md §4.4  -> "Okundu: karşı taraf mesajı görüntüleyince
--                                  `read_at`; unread count conversation
--                                  listesinde."
--   docs/PROGRESS.md §6b        -> ikilik "karara bağlanacak" olarak kayıtlı.
--
-- SORUN (ölçüldü, varsayılmadı):
--   `messages` HER İKİ alanı da taşıyor — `is_read boolean not null default
--   false` (Faz 0) ve `read_at timestamptz` (20260817140000). İkisinin senkron
--   kalmasını BUGÜN HİÇBİR ŞEY garanti etmiyor:
--     * `messages_guard_columns()` (20260817160200) alıcının HER İKİSİNİ de
--       değiştirmesine izin verir, ama BİRLİKTE değiştirmesini ŞART KOŞMAZ.
--       Yani tek istekle `is_read = true, read_at = null` yazmak SERBESTTİ.
--     * `useMarkConversationRead` bugün ikisini birlikte yazıyor — ama bu bir
--       İSTEMCİ NEZAKETİDİR, bir GARANTİ değil. İkinci bir istemci (mobil,
--       Faz 4.5) ya da düz bir PostgREST çağrısı ikiliyi bozabilir.
--   Sonuç: okunmamış sayacı (`read_at is null`) ile rozet (`is_read`) sessizce
--   ÇELİŞEBİLİR ve hangisinin doğru olduğu belirlenemezdi.
--
-- ÖLÇÜM (bu migration'ın §1'i onarımdan ÖNCE sayar; yazıldığı andaki canlı
--   yerel yığında: 68 satır, `is_read and read_at is null` = 0,
--   `not is_read and read_at is not null` = 0 -> mevcut veri TUTARLIYDI.
--   Tutarlılık bir TESADÜFTÜ (seed `is_read`'i `read_at is not null` ile
--   türetiyor); bu migration onu ŞEMA GARANTİSİNE çevirir.)
--
--
-- ###########################################################################
-- # KARAR — `read_at` KANONİK, `is_read` TÜREV (ve DROP EDİLMEZ)            #
-- #                                                                          #
-- # NEDEN `read_at` KANONİK: daha fazla bilgi taşır. `read_at`ten `is_read`  #
-- #   KAYIPSIZ türetilir (`read_at is not null`); tersi TÜRETİLEMEZ          #
-- #   (bir bayrak zaman üretemez — 20260817140000'in backfill'i tam olarak   #
-- #   bu yüzden bir YAKLAŞIKTIR). Plan §3.1 ve §4.4 de `read_at` diyor.      #
-- #                                                                          #
-- # NEDEN BU TURDA DROP YOK: §3.5 kuralı — "eski kolonlar aynı migration'da  #
-- #   DROP EDİLMEZ, bir faz boyunca DEPRECATED yorumuyla yan yana yaşar".    #
-- #   `is_read` ayrıca bugün CANLI KODDA okunuyor/yazılıyor                  #
-- #   (`src/hooks/useMessages.ts`) ve `src/types/database.ts`'te tipli.      #
-- #                                                                          #
-- # GARANTİ İKİ KATMANLIDIR — BİLİNÇLİ:                                      #
-- #   (a) TRIGGER `messages_sync_read_state` -> NORMALLEŞTİRİR. Hangi alan   #
-- #       yazılırsa yazılsın diğerini türetir; istemciyi kırmadan düzeltir.  #
-- #       KOŞULSUZDUR: `is_end_user_write()` guard'ı YOKTUR, çünkü bu bir    #
-- #       YETKİ kuralı değil bir VERİ MODELİ kuralıdır — seed, service_role  #
-- #       ve migration da tutarsız satır yazamamalıdır.                       #
-- #   (b) CHECK `messages_read_state_chk` -> KANITLAR. Trigger devre dışı    #
-- #       bırakılsa (`alter table ... disable trigger`) ya da ileride biri   #
-- #       gövdesini bozsa bile tutarsız satır tabloya GİREMEZ. Tek başına    #
-- #       CHECK yetmezdi: `is_read=true, read_at=null` yazan meşru bir eski  #
-- #       istemciyi 23514 ile KIRARDI. Tek başına trigger da yetmezdi:       #
-- #       sessizce kapatılabilir. İkisi birlikte: kırmadan zorlar.           #
-- #                                                                          #
-- # TRIGGER SIRASI: Postgres aynı olayın trigger'larını AD SIRASINA göre     #
-- #   çalıştırır ->  messages_apply_conversation_key                          #
-- #               <  messages_guard_columns                                   #
-- #               <  messages_sync_read_state                                 #
-- #   Yani normalleştirme EN SON koşar: guard hâlâ İSTEMCİNİN GÖNDERDİĞİ     #
-- #   değerleri denetler (sütun koruması zayıflamaz), normalleştirme ondan   #
-- #   sonra devreye girer.                                                    #
-- ###########################################################################
--
-- Idempotenttir. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) VERİ ONARIMI — ölç, düzelt, raporla (CHECK'ten ÖNCE)                 ##
-- #############################################################################
--    `read_at` kanonik olduğu için onarım tek yönlüdür: `is_read` ONA göre
--    yeniden yazılır. Ters yön (is_read=true iken read_at'e now() yazmak)
--    BİLİNÇLİ OLARAK YAPILMAZ — bu, geçmişte olmuş bir okumaya BUGÜNÜN
--    tarihini damgalamak, yani veri UYDURMAK olurdu. (20260817140000'in
--    backfill'i `read_at := created_at` yaklaşımını ZATEN uygulamıştı; bu
--    noktadan sonra `read_at is null` olan bir `is_read = true` satırı ancak
--    ikiliyi bozan bir yazmadan gelebilir ve onun doğru cevabı "okunmamış"tır.)
do $$
declare
  v_total       bigint;
  v_flag_no_ts  bigint;
  v_ts_no_flag  bigint;
  v_fixed       bigint;
begin
  select count(*),
         count(*) filter (where is_read and read_at is null),
         count(*) filter (where not is_read and read_at is not null)
    into v_total, v_flag_no_ts, v_ts_no_flag
    from public.messages;

  raise notice 'read_state ONCESI: toplam=%, is_read=true/read_at=null -> %, is_read=false/read_at dolu -> %',
    v_total, v_flag_no_ts, v_ts_no_flag;

  update public.messages
     set is_read = (read_at is not null)
   where is_read is distinct from (read_at is not null);
  get diagnostics v_fixed = row_count;

  raise notice 'read_state ONARIM: % satirda is_read, read_at ten yeniden turetildi.', v_fixed;
end
$$;


-- #############################################################################
-- ## 2) NORMALLEŞTİRME TRIGGER'I                                             ##
-- #############################################################################
create or replace function public.messages_sync_read_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Yalnızca ESKİ BAYRAK gönderildiyse (read_at yok), onu zamana TERFİ ettir:
    -- INSERT'te "okunmuş" demek yeni bir olgudur, geçmişi tahrif etmez.
    if new.read_at is null and coalesce(new.is_read, false) then
      new.read_at := now();
    end if;
    new.is_read := (new.read_at is not null);
    return new;
  end if;

  -- UPDATE
  if new.read_at is distinct from old.read_at then
    -- KANONİK ALAN yazıldı -> bayrak ondan türer (bayrak ne gönderilirse
    -- gönderilsin EZİLİR; "read_at dolu ama is_read=false" hâli imkânsızdır).
    new.is_read := (new.read_at is not null);

  elsif new.is_read is distinct from old.is_read then
    -- Yalnızca TÜREV alan yazıldı (eski istemci yolu) -> kanoniğe terfi ettir.
    if new.is_read then
      new.read_at := coalesce(old.read_at, now());
    else
      new.read_at := null;           -- "okunmadı"ya dönüş zaman damgasını siler
    end if;
    new.is_read := (new.read_at is not null);

  else
    -- İkisi de dokunulmadı: yine de tutarlı bırak (eski bozuk satırı taşıma).
    new.is_read := (new.read_at is not null);
  end if;

  return new;
end;
$$;

comment on function public.messages_sync_read_state()
  is 'read_at KANONİK, is_read TÜREV. Hangi alan yazılırsa yazılsın diğerini türetir; INSERT''te yalnız is_read=true geldiyse read_at''e now() terfi ettirir. KOŞULSUZDUR (is_end_user_write() guard''ı YOK): bu bir veri modeli kuralıdır, seed/service_role dahil herkes için geçerlidir. AD SIRASI ÖNEMLİ: messages_guard_columns''tan SONRA koşmalıdır.';

drop trigger if exists messages_sync_read_state on public.messages;
create trigger messages_sync_read_state
  before insert or update
  on public.messages
  for each row
  execute function public.messages_sync_read_state();


-- #############################################################################
-- ## 3) KISIT — trigger kapatılsa bile tutarsız satır GİREMEZ                ##
-- #############################################################################
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'messages_read_state_chk'
       and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_read_state_chk check (is_read = (read_at is not null));
  end if;
end
$$;

comment on constraint messages_read_state_chk on public.messages
  is 'is_read TÜREVDİR: her zaman (read_at is not null) değerine eşittir. messages_sync_read_state() trigger''ı yazmaları normalleştirir; bu kısıt trigger devre dışı bırakılsa bile tutarsızlığı IMKANSIZ kılar.';


-- #############################################################################
-- ## 4) Kolon yorumları — DEPRECATED işareti                                 ##
-- #############################################################################
comment on column public.messages.read_at
  is 'KANONİK okundu bilgisi: alıcının mesajı okuduğu an. NULL = okunmadı. Okunmamış sayacı bu kolondan gelir (client_id + read_at is null).';

comment on column public.messages.is_read
  is 'DEPRECATED (Faz 2b): TÜREV kolon — her zaman (read_at is not null). Kanonik kaynak read_at''tir. DROP EDİLMEZ (§3.5: eski kolon bir faz boyunca yan yana yaşar) çünkü src/hooks/useMessages.ts ve src/types/database.ts hâlâ okuyor. Yeni kod BU KOLONA YAZMAMALI, read_at yazmalıdır.';


-- #############################################################################
-- ## 5) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_bad     bigint;
  v_probe   uuid;
  v_is_read boolean;
  v_read_at timestamptz;
begin
  -- (a) Tabloda tutarsız satır KALMAMALI.
  select count(*) into v_bad
    from public.messages
   where is_read is distinct from (read_at is not null);
  if v_bad > 0 then
    raise exception 'DOGRULAMA BASARISIZ: % tutarsiz messages satiri kaldi', v_bad;
  end if;

  -- (b) Trigger AD SIRASI: sync, guard'dan SONRA koşmalı.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname = 'messages_sync_read_state'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: messages_sync_read_state trigger i kurulmadi';
  end if;
  if 'messages_sync_read_state' <= 'messages_guard_columns' then
    raise exception 'DOGRULAMA BASARISIZ: trigger ad sirasi bozuldu — normallestirme guard tan ONCE kosuyor';
  end if;

  -- (c) CANLI DAVRANIŞ TESTİ: yalnızca is_read yazıldığında read_at türemeli.
  --     (İşlem sonunda geri alınır — migration kalıcı satır bırakmaz.)
  select id into v_probe from public.messages where read_at is null limit 1;
  if v_probe is not null then
    update public.messages set is_read = true where id = v_probe;
    select is_read, read_at into v_is_read, v_read_at from public.messages where id = v_probe;
    if v_read_at is null or not v_is_read then
      raise exception 'DOGRULAMA BASARISIZ: is_read=true yazildi ama read_at turemedi (is_read=%, read_at=%)', v_is_read, v_read_at;
    end if;
    update public.messages set read_at = null where id = v_probe;
    select is_read into v_is_read from public.messages where id = v_probe;
    if v_is_read then
      raise exception 'DOGRULAMA BASARISIZ: read_at=null yazildi ama is_read true kaldi';
    end if;
  end if;

  raise notice 'read_at KANONIK / is_read TUREV: trigger + CHECK aktif, tablo tutarli.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: geri alma `is_read` ile `read_at`in SESSİZCE ÇELİŞEBİLDİĞİ hâle
-- -- döner (docs/PROGRESS.md §6b'de kayıtlı borç yeniden açılır). Veri kaybı
-- -- YOKTUR: onarım yalnızca türev kolonu düzeltti, `read_at` hiç değişmedi.
-- =============================================================================
--
-- begin;
--   alter table public.messages drop constraint if exists messages_read_state_chk;
--   drop trigger  if exists messages_sync_read_state on public.messages;
--   drop function if exists public.messages_sync_read_state();
--   comment on column public.messages.is_read is 'DEPRECATED: read_at kullanın.';
-- commit;
--
-- =============================================================================
