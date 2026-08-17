-- =============================================================================
-- 20260817190200_message_attachments.sql
--
-- FAZ 2b — ŞEMA TAMAMLAMA / 4: MESAJDA OPSİYONEL FOTO
--
-- KAYNAK (active_planprogram.md §4.4): "metin + OPSİYONEL FOTO."
-- KISIT   (I-4): "messages ... içeren storage bucket'ları PRIVATE'tır; erişim
--          yalnızca signed URL (TTL <= 1 saat) ile olur."
-- KISIT   (§3.3 / 20260817100000): kolon TAM URL DEĞİL, bucket içi YOL saklar.
--
-- `message text not null` DEĞİŞMEZ: plan "metin + opsiyonel foto" diyor, yani
-- foto metnin YERİNE değil YANINA gelir. Yalnız-foto mesaj kavramı yoktur.
--
--
-- ###########################################################################
-- # BUCKET KARARI — NEDEN YENİ BİR PRIVATE BUCKET                           #
-- #                                                                          #
-- # Mevcut iki bucket da UYMUYOR:                                            #
-- #   `avatars`           -> ad kalıbı `<uid>-<uuid>.<ext>` (KÖK dizin) ve    #
-- #      okuma politikası "sahibi VEYA KOÇUNKİ HERKESE AÇIK"                 #
-- #      (20260817180100). Mesaj eki oraya konsaydı KOÇUN GÖNDERDİĞİ HER      #
-- #      FOTO TÜM DANIŞANLARA AÇILIRDI — sohbet mahremiyeti yok olurdu.      #
-- #   `form-checks-media` -> `poses/<uid>-...` kalıbı, sahibi + koç. Danışan  #
-- #      koçun GÖNDERDİĞİ eki GÖREMEZDİ (sahip koç, okuyucu danışan) —       #
-- #      sohbetin iki yönlü olması şartını karşılamıyor. Ayrıca form check    #
-- #      medyası ile sohbet medyasını aynı kovaya koymak, ileride form check  #
-- #      saklama/silme politikası geldiğinde sohbet eklerini de silerdi.      #
-- #                                                                          #
-- # -> YENİ BUCKET: `message-attachments`, `public = false`.                  #
-- #                                                                          #
-- # YOL SÖZLEŞMESİ (bu dosyanın TEK doğruluk kaynağı olduğu şey):            #
-- #     message-attachments/<conversation_client_id>/<uploader_uid>-<uuid>.<ext>
-- #                          ^^^ KONUŞMA ANAHTARI       ^^^ YÜKLEYEN         #
-- #                                                                          #
-- # NEDEN İLK SEGMENT KONUŞMA ANAHTARI (client_id):                          #
-- #   Tek koçlu modelde bir sohbet `(koç, danışan)` çiftidir ve DANIŞAN       #
-- #   TARAFI KONUŞMAYI TEK BAŞINA TANIMLAR — `messages.client_id`'nin var     #
-- #   olma sebebi tam olarak budur (20260817140000 §"Neden conversations      #
-- #   tablosu YOK"). Aynı anahtarı yola taşımak, "sohbetin İKİ TARAFI da      #
-- #   görebilmeli" şartını TEK bir eşitlikle ifade eder:                      #
-- #     danışan -> klasör = auth.uid()   |   koç -> is_coach()                #
-- #                                                                          #
-- # NEDEN SIZDIRMAZ (dört ayrı kilit):                                        #
-- #   1. SELECT politikası klasörü `auth.uid()` ile kıyaslar. Danışan A,      #
-- #      danışan B'nin klasörünü OKUYAMAZ (`anon` hiç okuyamaz: politikalar   #
-- #      yalnızca `authenticated` rolüne verilmiştir).                        #
-- #   2. INSERT politikası klasörü SAHTELENEMEZ kılar: danışan yalnızca       #
-- #      KENDİ uid'siyle adlandırılmış klasöre yazabilir, yani B'nin          #
-- #      klasörüne dosya BIRAKAMAZ (kimlik avı / delil yerleştirme kapalı).   #
-- #   3. Ayrıştırıcı KATIDIR ve FAIL-CLOSED'dır: kanonik 36 karakterlik UUID  #
-- #      + ayırıcı + tek seviye klasör. Desen tutmazsa fonksiyon NULL döner,  #
-- #      `NULL = auth.uid()` NULL'dır -> politika FALSE -> RED. Belirsizlik   #
-- #      daima redde düşer (`avatar_object_owner` ile aynı doktrin,           #
-- #      20260817180100).                                                     #
-- #   4. Bucket PRIVATE: `/storage/v1/object/public/...` yolu 400 döner;      #
-- #      okuma yalnızca `createSignedUrl` (TTL 3600 sn) ile ve o çağrı        #
-- #      imzayı üretmeden ÖNCE bu SELECT politikasını uygular.                #
-- #                                                                          #
-- # BEŞİNCİ KİLİT VERİTABANINDA: `messages_attachment_path_chk` yolun ilk     #
-- #   segmentinin satırın `client_id`'sine EŞİT olmasını şart koşar. Yani     #
-- #   bir mesaj BAŞKA bir konuşmanın ekini işaret EDEMEZ. `client_id` zaten   #
-- #   `messages_apply_conversation_key` trigger'ı tarafından sunucuda         #
-- #   doğrulanır -> yol da onun üzerinden dolaylı olarak doğrulanmış olur.    #
-- ###########################################################################
--
-- Idempotenttir. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) `messages.attachment_path`                                           ##
-- #############################################################################
alter table public.messages
  add column if not exists attachment_path text;

comment on column public.messages.attachment_path
  is 'message-attachments bucket''ındaki YOL: <client_id>/<uploader_uid>-<uuid>.<ext>. TAM URL DEĞİL (I-4) — okuma anında createSignedUrl ile imzalanır. NULL = ek yok.';

--   Yol sözleşmesi ŞEMADA zorlanır: (a) URL değil, (b) tam olarak tek seviye
--   klasör + kanonik UUID'ler, (c) klasör = satırın konuşma anahtarı.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'messages_attachment_path_chk'
       and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_attachment_path_chk check (
        attachment_path is null
        or (
          attachment_path ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                          || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[^/]+$')
          and split_part(attachment_path, '/', 1) = client_id::text
        )
      );
  end if;
end
$$;

comment on constraint messages_attachment_path_chk on public.messages
  is 'Ek yolu YOL''dur (URL değil), tek seviye klasörlüdür ve klasörü satırın client_id''si (konuşma anahtarı) olmak ZORUNDADIR — bir mesaj başka bir konuşmanın ekini işaret edemez.';

--   Ek içeren mesajları ucuz listelemek için kısmi indeks (ekli mesaj oranı
--   düşük olacaktır; tam indeks ölü ağırlık taşırdı).
create index if not exists messages_attachment_idx
  on public.messages (client_id, created_at desc)
  where attachment_path is not null;


-- #############################################################################
-- ## 2) SÜTUN KORUMASININ GENİŞLETİLMESİ — AC-04 DELİĞİ YENİDEN AÇILMASIN    ##
-- #############################################################################
--    ##########################################################################
--    # BU ADIM ATLANIRSA SESSİZ BİR GÜVENLİK GERİLEMESİ OLUR                  #
--    #                                                                        #
--    # `messages_guard_columns()` (20260817160200) sütun listesini AÇIKÇA     #
--    # sayar: id, sender_id, receiver_id, message, created_at, client_id,     #
--    # kind. Yeni bir kolon eklemek onu OTOMATİK KAPSAMAZ -> alıcı, kendisine #
--    # gelen bir mesajın EKİNİ değiştirebilir (silebilir ya da başka bir      #
--    # dosyaya çevirebilir) ve karşı taraf bunu fark edemezdi (tabloda        #
--    # `edited_at` YOK). Bu, AC-04'ün kapattığı deliğin birebir aynısıdır.    #
--    # Fonksiyon bu yüzden `create or replace` ile GENİŞLETİLİR.              #
--    # Kırmızı-yeşil kanıtı: rls.test.sql senaryo 89.                         #
--    ##########################################################################
create or replace function public.messages_guard_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı (service_role / seed / migration / DEFINER RPC): çekil.
  if not public.is_end_user_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 'system' etiketi UYGULAMAYA aittir; insan eliyle üretilemez.
    if new.kind is distinct from 'user'::public.message_kind then
      raise exception 'messages: kind=''system'' mesajlari yalnizca uygulama (sunucu) uretebilir. Istemci yalnizca kind=''user'' mesaj gonderebilir.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: read_at / is_read DIŞINDAKİ her sütun DEĞİŞMEZDİR.
  -- (attachment_path Faz 2b'de eklendi — gönderilmiş bir mesajın eki de
  --  gövdesi kadar dokunulmazdır.)
  if new.id          is distinct from old.id
     or new.sender_id       is distinct from old.sender_id
     or new.receiver_id     is distinct from old.receiver_id
     or new.message         is distinct from old.message
     or new.created_at      is distinct from old.created_at
     or new.client_id       is distinct from old.client_id
     or new.kind            is distinct from old.kind
     or new.attachment_path is distinct from old.attachment_path then
    raise exception 'messages: gonderilmis bir mesajin icerigi (ek dahil) degistirilemez. Alici yalnizca read_at / is_read alanlarini guncelleyebilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.messages_guard_columns()
  is 'messages sütun koruması (AC-04 + Faz 2b): son kullanıcı UPDATE''te yalnızca read_at/is_read değiştirebilir (attachment_path DAHİL diğer her sütun dokunulmaz), INSERT''te kind=''system'' üretemez (42501). Sunucu bağlamında (is_end_user_write() false) devreye girmez.';


-- #############################################################################
-- ## 3) `message-attachments` bucket'ı — PRIVATE                             ##
-- #############################################################################
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  5242880,   -- 5 MB: mevcut iki bucket ile AYNI tavan (plan §3.3'ün 10 MB üst
             -- sınırının altında). Tek bir yükleme limiti = tek bir UI hata mesajı.
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- #############################################################################
-- ## 4) Yol ayrıştırıcıları — KATI ve FAIL-CLOSED                            ##
-- #############################################################################
--   `avatar_object_owner()` (20260817180100) ile aynı doktrin: desen tutmazsa
--   `NULL` döner, `::uuid` cast'i YALNIZCA regex'in doğruladığı dalda çalışır
--   (politika içinde fırlayan bir hata `createSignedUrl`'i HERKES için kırardı).
create or replace function public.message_attachment_conversation(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_name ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[^/]+$')
    then substring(p_name from 1 for 36)::uuid
    else null
  end;
$$;

comment on function public.message_attachment_conversation(text)
  is 'message-attachments nesne adından KONUŞMA ANAHTARINI (client_id) çıkarır. Desene uymayan adda NULL -> politikalar redde düşer (fail-closed).';

create or replace function public.message_attachment_uploader(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_name ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[^/]+$')
    then substring(split_part(p_name, '/', 2) from 1 for 36)::uuid
    else null
  end;
$$;

comment on function public.message_attachment_uploader(text)
  is 'message-attachments nesne adından YÜKLEYENİN uid''sini çıkarır. Desene uymayan adda NULL -> politikalar redde düşer (fail-closed).';

revoke all     on function public.message_attachment_conversation(text) from public;
revoke all     on function public.message_attachment_uploader(text)     from public;
grant  execute on function public.message_attachment_conversation(text) to authenticated, service_role;
grant  execute on function public.message_attachment_uploader(text)     to authenticated, service_role;


-- #############################################################################
-- ## 5) storage.objects politikaları                                         ##
-- #############################################################################

-- OKUMA: sohbetin İKİ TARAFI da görür, başkası GÖRMEZ.
--   danışan -> yalnızca kendi konuşma klasörü      |  koç -> tüm konuşmalar
--   anon    -> politika `authenticated`a verildiği için HİÇBİR nesne
drop policy if exists "message_attachments_select_participants" on storage.objects;
create policy "message_attachments_select_participants"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.message_attachment_conversation(name) = auth.uid()
      or public.is_coach()
    )
  );

-- YAZMA: adın YÜKLEYEN kısmı kendi uid'in OLMAK ZORUNDA (ön ek sahtelenemez),
--        ve klasör ya kendi konuşman ya da koçsun.
drop policy if exists "message_attachments_insert_own" on storage.objects;
create policy "message_attachments_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.message_attachment_uploader(name) = auth.uid()
    and (
      public.message_attachment_conversation(name) = auth.uid()
      or public.is_coach()
    )
  );

-- GÜNCELLEME (upsert): yalnızca KENDİ yüklediğin nesne. Koç bile başkasının
-- yüklediği dosyanın İÇERİĞİNİ değiştiremez — "yetkili tahrifat" yoktur
-- (aynı doktrin: messages_guard_columns, 20260817160200 §1).
drop policy if exists "message_attachments_update_own" on storage.objects;
create policy "message_attachments_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.message_attachment_uploader(name) = auth.uid()
  )
  with check (
    bucket_id = 'message-attachments'
    and public.message_attachment_uploader(name) = auth.uid()
    and (
      public.message_attachment_conversation(name) = auth.uid()
      or public.is_coach()
    )
  );

-- SİLME: yükleyen VEYA koç (moderasyon). Diğer bucket'lardaki kalıpla aynı.
drop policy if exists "message_attachments_delete_own_or_coach" on storage.objects;
create policy "message_attachments_delete_own_or_coach"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.message_attachment_uploader(name) = auth.uid()
      or public.is_coach()
    )
  );


-- #############################################################################
-- ## 6) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_public boolean;
  v_pol    int;
begin
  select public into v_public from storage.buckets where id = 'message-attachments';
  if v_public is null then
    raise exception 'DOGRULAMA BASARISIZ: message-attachments bucket i olusmadi';
  end if;
  if v_public then
    raise exception 'DOGRULAMA BASARISIZ: message-attachments PUBLIC — I-4 ihlali';
  end if;

  select count(*) into v_pol
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'message_attachments_%';
  if v_pol <> 4 then
    raise exception 'DOGRULAMA BASARISIZ: message_attachments storage politikasi sayisi % (beklenen 4)', v_pol;
  end if;

  -- Ayrıştırıcı fail-closed mı? (politikaların güvenliği buna dayanıyor)
  if public.message_attachment_conversation('kotu-ad.jpg') is not null
     or public.message_attachment_conversation('a/b/c.jpg') is not null
     or public.message_attachment_uploader('22222222-2222-2222-2222-222222222222/x.jpg') is not null then
    raise exception 'DOGRULAMA BASARISIZ: ek yolu ayristiricisi FAIL-OPEN — politikalar somurulebilir';
  end if;

  -- Sütun koruması genişledi mi?
  if position('attachment_path' in pg_get_functiondef('public.messages_guard_columns()'::regprocedure)) = 0 then
    raise exception 'DOGRULAMA BASARISIZ: messages_guard_columns() attachment_path i korumuyor (AC-04 gerilemesi)';
  end if;

  raise notice 'message-attachments (private) + 4 storage politikasi + messages.attachment_path + genisletilmis sutun korumasi kuruldu.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `attachment_path` DROP edilirse mesajlara iliştirilmiş fotoğrafların
-- -- BAĞI kaybolur (dosyalar bucket'ta öksüz kalır). Ayrıca sütun korumasını
-- -- eski (attachment_path'siz) hâline döndürmek gerekir — aşağıdaki blok bunu
-- -- YAPMAZ, çünkü kolon zaten kalkmış olur ve `create or replace` yeterlidir.
-- =============================================================================
--
-- begin;
--   drop policy if exists "message_attachments_delete_own_or_coach" on storage.objects;
--   drop policy if exists "message_attachments_update_own"          on storage.objects;
--   drop policy if exists "message_attachments_insert_own"          on storage.objects;
--   drop policy if exists "message_attachments_select_participants" on storage.objects;
--
--   -- Nesneler ÖNCE elle taşınmalı/silinmelidir; aksi hâlde bucket silinemez.
--   delete from storage.buckets where id = 'message-attachments';
--
--   drop index      if exists public.messages_attachment_idx;
--   alter table public.messages drop constraint if exists messages_attachment_path_chk;
--   alter table public.messages drop column     if exists attachment_path;
--
--   drop function if exists public.message_attachment_uploader(text);
--   drop function if exists public.message_attachment_conversation(text);
--   -- messages_guard_columns() 20260817160200'deki hâline geri yazılmalıdır.
-- commit;
--
-- =============================================================================
