-- =============================================================================
-- 20260819110000_attachment_magic_byte_verification.sql
--
-- FAZ 4.6 / DİLİM 3 — B-028: `message-attachments` İÇİN SUNUCU TARAFI
-- MAGIC-BYTE DOĞRULAMASI (active_planprogram.md §7a, AC-4.6.4).
--
-- BORÇ (docs/PROGRESS.md B-028, kaynağı Faz 1.5 K3 / Faz 2):
--   Yüklenen görselin İÇERİĞİ yalnızca TARAYICIDA doğrulanıyordu
--   (`packages/api-client/src/upload-validation.ts`). Sunucu tarafında tek kontrol
--   bucket'ın `allowed_mime_types` listesiydi ve o liste İSTEMCİNİN BİLDİRDİĞİ
--   Content-Type'a bakar — `fetch` ile doğrudan Storage'a giden bir betik
--   `contentType: 'image/png'` deyip İSTEDİĞİ BAYTI yükleyebiliyordu.
--
-- =============================================================================
-- KATMAN SEÇİMİ — NEDEN "YÜKLEMEDEN SONRA DOĞRULA", NEDEN "ROUTE'TAN GEÇİR" DEĞİL
-- =============================================================================
--   ÖLÇÜLEN DURUM: dosya tarayıcıdan DOĞRUDAN Supabase Storage'a gidiyor
--   (`packages/api-client/src/hooks/useMessages.ts` -> `supabase.storage.from(
--   'message-attachments').upload(...)`). Arada hiçbir Next route'u YOK.
--
--   (A) "Yüklemeyi bir Next route'una taşı" REDDEDİLDİ — üç ölçülebilir sebep:
--       1. Dağıtım hedefi Vercel (docs/DEPLOYMENT.md §1). Serverless fonksiyon
--          gövde tavanı 4.5 MB; bucket tavanı 5 MB (20260817190200). 4.5-5 MB
--          arası her meşru fotoğraf SESSİZCE kırılırdı.
--       2. Yolun sahipliği bugün RLS ile zorlanıyor (`message_attachments_insert_own`:
--          ad ön eki = auth.uid()). Route'tan geçirmek `service_role` ile yazmayı
--          gerektirirdi -> beş kilidin (bkz. 20260817190200 başlığı) hepsi
--          POLİTİKADAN UYGULAMA KODUNA taşınırdı. Güvenliği veritabanından
--          uygulama katmanına indirmek bu repoda ters yön.
--       3. Aynı bayt iki kez ağdan geçerdi (tarayıcı -> Next -> Storage).
--
--   (B) SEÇİLEN: yükleme yolu AYNEN KALIR; sunucu, yüklenmiş nesnenin İLK
--       BAYTLARINI okuyup kararı bir kez daha verir
--       (`apps/web/src/app/api/attachments/verify/route.ts`), uymuyorsa nesneyi
--       SİLER ve kaydı reddeder.
--
--   (B)'nin tek zayıflığı şuydu: istemci doğrulama ucunu ATLAYABİLİR. Yalnızca
--   "istemci çağırırsa doğrulanır" bir uç, sunucu tarafı doğrulama SAYILMAZ.
--   Bu yüzden asıl kapı BURADADIR: `messages` tablosuna EK İÇEREN bir satır,
--   yalnızca o ek için SUNUCUNUN yazdığı bir doğrulama kaydı varsa girebilir.
--   Doğrulamayı atlayan bir betiğin bıraktığı nesne, hiçbir mesajın işaret
--   edemediği ÖKSÜZ bir dosyadır — kimseye gösterilmez.
--
-- =============================================================================
-- TOCTOU (doğrula-sonra-değiştir) — eTag İLE KAPATILDI
-- =============================================================================
--   Saldırı: gerçek PNG yükle -> doğrulat -> AYNI yolu kötü baytlarla değiştir
--   (ya da sil + aynı adla yeniden yükle) -> mesajı yaz. Doğrulama kaydı "temiz"
--   derdi, nesne artık kötü olurdu.
--
--   Kapatma: doğrulama kaydı nesnenin `eTag`ini (içerik özeti) TAŞIR ve bu değer
--   sunucunun BAYTLARI OKUDUĞU HTTP yanıtından gelir — yani okunan baytlarla
--   eTag AYNI ANIN aynı sürümüne aittir. `messages` INSERT'inde tetikleyici,
--   `storage.objects.metadata->>'eTag'` ile kayıttaki değeri KARŞILAŞTIRIR.
--   İçerik arada bir bayt bile değiştiyse eTag değişir -> INSERT reddedilir.
--
--   CANLI ÖLÇÜM (yerel storage-api v1.69.0, bu migration yazılırken):
--     GET /storage/v1/object/authenticated/<bucket>/<path>  (Range: bytes=0-31)
--       -> 206, etag: "e44e7ecfec99356632c13cd3eaa3e250",
--          content-range: bytes 0-31/68, content-type: image/png
--     select metadata->>'eTag' from storage.objects where name = <path>
--       -> "e44e7ecfec99356632c13cd3eaa3e250"   (tırnaklar dahil BİREBİR AYNI)
--   Yani başlıktan okunan değer ile tablodaki değer aynı biçimdedir; karşılaştırma
--   yine de her iki tarafta tırnak soyularak yapılır (`attachment_normalize_etag`).
--
-- =============================================================================
-- TÜR LİSTESİ DEĞİŞMEDİ
-- =============================================================================
--   Kabul edilen türler istemci doğrulamasıyla BİREBİR aynıdır: jpeg/png/webp/avif
--   (`ALLOWED_IMAGE_MIME`). Bu dosya listeyi GENİŞLETMEZ; yalnızca sunucunun
--   yazdığı değerin o listede olduğunu bir kez daha zorlar (CHECK).
--
-- Idempotenttir: `create table if not exists` + `create or replace function` +
-- `drop trigger if exists` + `drop policy if exists` yok (politika değişmedi).
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) public.message_attachment_verifications — SUNUCUNUN İMZASI           ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN AYRI TABLO, NEDEN `storage.objects.user_metadata` DEĞİL           #
--    # `storage.objects`a yazmak Storage API'sinden geçmeyi ya da platform     #
--    # tablosuna doğrudan UPDATE atmayı gerektirirdi; ikisi de platformun      #
--    # kendi sözleşmesine (bkz. `storage.protect_delete()`) yaslanan kırılgan  #
--    # bir bağımlılık olurdu. Ayrı tablo, SAHİBİ BİZ OLAN ve testlenebilir bir #
--    # yüzeydir.                                                               #
--    #                                                                         #
--    # NEDEN SEQUENCE YOK: `rls.test.sql` senaryo 84 her public sequence'te     #
--    # `authenticated` USAGE'ı arar. Doğal anahtar (bucket, path) zaten tekil.  #
--    ##########################################################################
create table if not exists public.message_attachment_verifications (
  bucket      text        not null,
  path        text        not null,
  -- MAGIC BYTE ile TESPİT EDİLEN tür. İstemcinin bildirdiği değer DEĞİL.
  mime        text        not null,
  -- Doğrulama anında baytlarla AYNI HTTP yanıtından okunan içerik etiketi.
  object_etag text        not null,
  verified_at timestamptz not null default now(),

  constraint message_attachment_verifications_pkey primary key (bucket, path),
  -- Bugün tek tüketici `message-attachments`. Yeni bir bucket eklenecekse bu
  -- CHECK'in de genişletilmesi GEREKİR — sessizce yayılmasın.
  constraint message_attachment_verifications_bucket_chk
    check (bucket = 'message-attachments'),
  -- İstemci doğrulamasıyla AYNI liste (ALLOWED_IMAGE_MIME).
  constraint message_attachment_verifications_mime_chk
    check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint message_attachment_verifications_etag_chk
    check (length(btrim(object_etag)) > 0)
);

comment on table public.message_attachment_verifications is
  'B-028: sunucunun magic-byte doğrulamasından GEÇMİŞ storage nesneleri. Satır KISA ÖMÜRLÜDÜR — mesaj INSERT''inde tetikleyici tarafından TÜKETİLİR (silinir). Yalnızca sunucu yolu yazar (record_attachment_verification, EXECUTE = service_role); authenticated için politika YOKTUR (grant var, politika yok -> her işlem RED).';

comment on column public.message_attachment_verifications.mime is
  'Sunucuda magic-byte ile TESPİT EDİLEN tür (istemcinin bildirdiği Content-Type değil).';

comment on column public.message_attachment_verifications.object_etag is
  'Doğrulanan baytlarla AYNI HTTP yanıtından okunan eTag. Mesaj yazılırken storage.objects''takiyle karşılaştırılır -> doğrula-sonra-değiştir (TOCTOU) kapalıdır.';

-- Bayat (tüketilmemiş) kayıtların süpürülmesi zamana göredir.
create index if not exists message_attachment_verifications_verified_at_idx
  on public.message_attachment_verifications (verified_at);

alter table public.message_attachment_verifications enable row level security;
alter table public.message_attachment_verifications force  row level security;

--    ##########################################################################
--    # GRANT VAR, POLİTİKA YOK — 20260819100000 (account_deletions) İLE AYNI   #
--    # DOKTRİN. `rls.test.sql` senaryo 73 POZİTİF KONTROL olarak HER public    #
--    # tablosunda `authenticated` için S/I/U/D arar; grant'i kesmek o senaryoya #
--    # istisna eklemeyi gerektirirdi. Kilit ACL'de değil RLS'tedir: RLS + FORCE #
--    # + SIFIR POLİTİKA = her SELECT 0 satır, her yazma RED. `postgres` ve      #
--    # `service_role` `rolbypassrls = t` olduğu için etkilenmez.                #
--    ##########################################################################
grant select, insert, update, delete on public.message_attachment_verifications to authenticated;
revoke truncate, references, trigger on public.message_attachment_verifications from authenticated;
revoke all on public.message_attachment_verifications from anon;


-- #############################################################################
-- ## 2) eTag normalizasyonu                                                  ##
-- #############################################################################
--   HTTP `ETag` başlığı ve `storage.objects.metadata->>'eTag'` değeri tırnaklı
--   gelir (`"e44e…"`); ayrıca zayıf etiket öneki (`W/`) olasılığı vardır.
--   Karşılaştırma her iki tarafta bu fonksiyondan geçer.
create or replace function public.attachment_normalize_etag(p_etag text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(btrim(regexp_replace(coalesce(p_etag, ''), '^\s*W/', ''), '" '), '');
$$;

comment on function public.attachment_normalize_etag(text) is
  'ETag''i karşılaştırılabilir hâle getirir: W/ öneki ve çevreleyen tırnaklar atılır. Boş sonuç NULL''dur -> karşılaştırma NULL, politika/tetikleyici redde düşer (fail-closed).';

revoke all     on function public.attachment_normalize_etag(text) from public;
grant  execute on function public.attachment_normalize_etag(text) to authenticated, service_role;


-- #############################################################################
-- ## 3) YAZICI — public.record_attachment_verification(...)                  ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN RPC, NEDEN TABLOYA DOĞRUDAN INSERT DEĞİL                          #
--    # Tabloya `service_role` grant'i verilseydi kayıt PostgREST üzerinden      #
--    # yazılabilir/okunabilir hâle gelirdi (account_deletions ile aynı gerekçe, #
--    # 20260819100000 §1). Bunun yerine TEK yazıcı bu SECURITY DEFINER          #
--    # fonksiyondur ve EXECUTE'u YALNIZCA `service_role`dedir: tarayıcıdaki     #
--    # hiçbir kod kendi kendini "doğrulanmış" ilan EDEMEZ.                      #
--    #                                                                         #
--    # FONKSİYON KENDİ DE FAIL-CLOSED'DIR: nesne yoksa ya da nesnenin ŞU ANKİ   #
--    # eTag'i sunucunun okuduğu eTag'ten farklıysa (yani doğrulama sırasında    #
--    # içerik değişmiş) kayıt YAZILMAZ, hata fırlatılır.                        #
--    ##########################################################################
create or replace function public.record_attachment_verification(
  p_bucket text,
  p_path   text,
  p_mime   text,
  p_etag   text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current text;
begin
  if p_bucket is null or p_path is null or p_mime is null or p_etag is null then
    raise exception 'record_attachment_verification: tum parametreler zorunludur.'
      using errcode = '22023';
  end if;

  select public.attachment_normalize_etag(o.metadata ->> 'eTag')
    into v_current
    from storage.objects o
   where o.bucket_id = p_bucket
     and o.name      = p_path;

  if v_current is null then
    raise exception 'record_attachment_verification: nesne bulunamadi veya eTag i yok (bucket=%, path=%).',
      p_bucket, p_path
      using errcode = 'P0001';
  end if;

  if v_current is distinct from public.attachment_normalize_etag(p_etag) then
    -- Sunucu baytları okuduktan SONRA nesne değişmiş. "Temiz" damgası
    -- vurulmaz; çağıran bunu 409'a çevirir.
    raise exception 'record_attachment_verification: nesne dogrulama sirasinda DEGISTI (bucket=%, path=%).',
      p_bucket, p_path
      using errcode = 'P0001';
  end if;

  insert into public.message_attachment_verifications (bucket, path, mime, object_etag, verified_at)
  values (p_bucket, p_path, p_mime, public.attachment_normalize_etag(p_etag), now())
  on conflict (bucket, path) do update
    set mime        = excluded.mime,
        object_etag = excluded.object_etag,
        verified_at = excluded.verified_at;

  -- Ucuz çöp toplama: tüketilmemiş bayat kayıtlar birikmesin (kişisel veri
  -- taşımasalar da yol içinde uid geçer — kısa ömür KVKK açısından da doğru).
  delete from public.message_attachment_verifications
   where verified_at < now() - interval '1 day';
end;
$$;

comment on function public.record_attachment_verification(text, text, text, text) is
  'B-028 sunucu yolunun yazıcısı: magic-byte doğrulamasından geçen nesne için doğrulama kaydı üretir. Nesnenin ŞU ANKİ eTag''i sunucunun okuduğuyla uyuşmazsa FAIL-CLOSED reddeder. EXECUTE yalnızca service_role''dedir.';

revoke all     on function public.record_attachment_verification(text, text, text, text) from public;
revoke all     on function public.record_attachment_verification(text, text, text, text) from anon;
revoke all     on function public.record_attachment_verification(text, text, text, text) from authenticated;
grant  execute on function public.record_attachment_verification(text, text, text, text) to service_role;


-- #############################################################################
-- ## 4) TÜKETİCİ — public.consume_attachment_verification(...)               ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN AYRI (VE KÜÇÜK) BİR SECURITY DEFINER FONKSİYON                    #
--    #                                                                         #
--    # Tetikleyicinin kendisi `is_end_user_write()` ÇAĞIRMAK ZORUNDA ve o       #
--    # fonksiyon `current_user`a bakar (20260817160200 §0). SECURITY DEFINER    #
--    # bir gövdenin İÇİNDE `current_user` HER ZAMAN 'postgres'tir -> tetikleyici#
--    # DEFINER yapılsaydı `is_end_user_write()` HER ZAMAN false döner ve kapı   #
--    # SESSİZCE AÇILIRDI. Bu yüzden tetikleyici SECURITY INVOKER kalır; yalnız  #
--    # yetki gerektiren küçük parça (doğrulama tablosu + storage.objects okuma) #
--    # buraya, DEFINER bir yardımcıya taşınır.                                  #
--    #                                                                         #
--    # `authenticated`a EXECUTE VERİLİR (tetikleyici o rolde çalışır) ama       #
--    # sömürülemez: fonksiyon (a) yalnızca OKUR ve SİLER, hiçbir şey ÜRETMEZ,   #
--    # (b) yolun YÜKLEYEN segmenti `auth.uid()` değilse hiçbir şey yapmadan     #
--    # false döner. En kötü ihtimalle kullanıcı KENDİ bekleyen doğrulamasını    #
--    # tüketir — kendi kendini engellemiş olur.                                 #
--    #                                                                         #
--    # TEK KULLANIMLIK: başarılı eşleşmede kayıt SİLİNİR. Bir doğrulama tek bir #
--    # mesaja yeter; kayıt kalsaydı aynı nesne sonsuza dek "onaylı" kalırdı.    #
--    ##########################################################################
create or replace function public.consume_attachment_verification(
  p_bucket text,
  p_path   text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.message_attachment_verifications%rowtype;
  v_current text;
begin
  if p_bucket is null or p_path is null then
    return false;
  end if;

  -- Yükleyen kapısı: bir kullanıcı BAŞKASININ bekleyen doğrulamasına dokunamaz.
  -- (`message_attachment_uploader` desene uymayan adda NULL döner -> false.)
  if public.message_attachment_uploader(p_path) is distinct from auth.uid() then
    return false;
  end if;

  select * into v_row
    from public.message_attachment_verifications
   where bucket = p_bucket
     and path   = p_path
   for update;

  if not found then
    return false;
  end if;

  -- Bayat kayıt (doğrulama ile mesaj arasında 15 dakikadan fazla geçmiş):
  -- tüketilmez, SİLİNİR. Kullanıcı yeniden yükler.
  if v_row.verified_at < now() - interval '15 minutes' then
    delete from public.message_attachment_verifications where bucket = p_bucket and path = p_path;
    return false;
  end if;

  -- TOCTOU KAPISI: nesnenin ŞU ANKİ içeriği doğrulanan içerikle aynı mı?
  select public.attachment_normalize_etag(o.metadata ->> 'eTag')
    into v_current
    from storage.objects o
   where o.bucket_id = p_bucket
     and o.name      = p_path;

  if v_current is null or v_current is distinct from v_row.object_etag then
    -- Nesne silinmiş ya da içeriği değişmiş. Damga geçersizdir.
    delete from public.message_attachment_verifications where bucket = p_bucket and path = p_path;
    return false;
  end if;

  delete from public.message_attachment_verifications where bucket = p_bucket and path = p_path;
  return true;
end;
$$;

comment on function public.consume_attachment_verification(text, text) is
  'B-028: bir ek için sunucunun bıraktığı doğrulama damgasını TEK KULLANIMLIK olarak tüketir. Bayat (>15 dk), içeriği değişmiş (eTag) veya başkasına ait yolda false döner. messages tetikleyicisi bunu çağırır.';

revoke all     on function public.consume_attachment_verification(text, text) from public;
revoke all     on function public.consume_attachment_verification(text, text) from anon;
grant  execute on function public.consume_attachment_verification(text, text) to authenticated, service_role;


-- #############################################################################
-- ## 5) KAPI — messages tetikleyicisi                                        ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN `AFTER INSERT` (BEFORE DEĞİL)                                     #
--    # `messages_attachment_path_chk` (20260817190200) yolun BİÇİMİNİ ve        #
--    # konuşma eşleşmesini zorlar ve CHECK'ler BEFORE tetikleyicilerden SONRA   #
--    # değerlendirilir. Kapı BEFORE olsaydı, bozuk/çapraz bir yol için önce     #
--    # "doğrulanmamış ek" (42501) hatası döner, şemanın kendi hatası (23514)    #
--    # hiç görünmezdi — teşhis zorlaşır, rls.test.sql senaryo 89c/89d'nin       #
--    # ölçtüğü invaryant gölgelenirdi. AFTER'da sıra doğaldır: önce ŞEKİL       #
--    # (CHECK), sonra İÇERİK (bu kapı). Hata yine transaksiyonu geri sarar.     #
--    #                                                                         #
--    # UPDATE'e BAKILMAZ: `messages_guard_columns()` gönderilmiş bir mesajın    #
--    # `attachment_path`ini zaten DOKUNULMAZ kılıyor (20260817190200 §2).       #
--    ##########################################################################
create or replace function public.messages_require_verified_attachment()
returns trigger
language plpgsql
-- KRİTİK: SECURITY INVOKER (varsayılan). DEFINER yapılırsa `is_end_user_write()`
-- her zaman false döner ve bu kapı SESSİZCE AÇILIR. Bkz. §4 başlığı.
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı (seed / migration / service_role / DEFINER RPC): çekil.
  if not public.is_end_user_write() then
    return null;
  end if;

  if new.attachment_path is null then
    return null;
  end if;

  if not public.consume_attachment_verification('message-attachments', new.attachment_path) then
    raise exception 'messages: ek dosyasi sunucu tarafinda dogrulanmamis. Fotografi yeniden yukleyip tekrar deneyin.'
      using errcode = '42501';
  end if;

  return null;   -- AFTER trigger: donen deger yok sayilir.
end;
$$;

comment on function public.messages_require_verified_attachment() is
  'B-028 kapısı: son kullanıcı ek içeren bir mesaj yazarken, o ek için sunucunun (api/attachments/verify) bıraktığı magic-byte doğrulama damgası ARANIR ve tüketilir. Damga yoksa/bayatsa/nesne değiştiyse 42501. Sunucu bağlamında devreye girmez. SECURITY INVOKER OLMAK ZORUNDADIR.';

drop trigger if exists messages_require_verified_attachment on public.messages;
create trigger messages_require_verified_attachment
  after insert
  on public.messages
  for each row
  execute function public.messages_require_verified_attachment();


-- #############################################################################
-- ## 6) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_rls   boolean;
  v_force boolean;
  v_pol   int;
  v_def   text;
begin
  select c.relrowsecurity, c.relforcerowsecurity into v_rls, v_force
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'message_attachment_verifications';

  if v_rls is null then
    raise exception 'DOGRULAMA BASARISIZ: message_attachment_verifications tablosu olusmadi';
  end if;
  if not v_rls or not v_force then
    raise exception 'DOGRULAMA BASARISIZ: message_attachment_verifications RLS/FORCE kapali (rls=%, force=%)', v_rls, v_force;
  end if;

  select count(*) into v_pol
    from pg_policies
   where schemaname = 'public' and tablename = 'message_attachment_verifications';
  if v_pol <> 0 then
    raise exception 'DOGRULAMA BASARISIZ: dogrulama tablosunda % politika var (beklenen 0 -- kilit RLS+FORCE+sifir politika)', v_pol;
  end if;

  -- Yazıcı YALNIZCA service_role'de olmalı.
  if has_function_privilege('authenticated', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: record_attachment_verification istemciye ACIK -- kullanici kendini dogrulanmis ilan edebilir';
  end if;
  if not has_function_privilege('service_role', 'public.record_attachment_verification(text,text,text,text)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: record_attachment_verification service_role de CALISMIYOR -- sunucu yolu kirik';
  end if;

  -- Tetikleyici fonksiyonu DEFINER'a kaymamalı (kapıyı sessizce açar).
  v_def := pg_get_functiondef('public.messages_require_verified_attachment()'::regprocedure);
  if position('SECURITY DEFINER' in v_def) > 0 then
    raise exception 'DOGRULAMA BASARISIZ: messages_require_verified_attachment SECURITY DEFINER -- is_end_user_write() her zaman false doner, kapi ACIK';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname  = 'messages_require_verified_attachment'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: messages_require_verified_attachment tetikleyicisi kurulmadi';
  end if;

  raise notice 'B-028: message_attachment_verifications + record/consume RPC leri + messages AFTER INSERT kapisi kuruldu.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: kapı kaldırıldığı an `message-attachments` bucket'ı yeniden
-- -- YALNIZCA istemci doğrulamasına kalır (B-028 tekrar açılır).
-- =============================================================================
--
-- begin;
--   drop trigger  if exists messages_require_verified_attachment on public.messages;
--   drop function if exists public.messages_require_verified_attachment();
--   drop function if exists public.consume_attachment_verification(text, text);
--   drop function if exists public.record_attachment_verification(text, text, text, text);
--   drop table    if exists public.message_attachment_verifications;
--   drop function if exists public.attachment_normalize_etag(text);
-- commit;
--
-- =============================================================================
