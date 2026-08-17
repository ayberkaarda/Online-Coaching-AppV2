-- =============================================================================
-- 20260817200000_system_message_rpc.sql
--
-- FAZ 2e'NİN "ŞU AN İMKÂNSIZ" DİYE BIRAKTIĞI KAPIYI AÇMAK:
--   public.post_system_message(...) — `kind='system'` yazma kanalı.
--
-- SORUN (supabase/README.md §4h, src/hooks/useFormChecks.ts yorumu):
--   `messages_guard_columns()` (20260817160200 §1) INSERT'te `kind='system'`i
--   YALNIZCA sunucu bağlamından (`is_end_user_write()` = false) kabul eder.
--   PostgREST üzerinden gelen HER istemci isteği -- koç dahil -- `current_user
--   = 'authenticated'` olduğu için 42501 alır. Plan §4.3/§4.4'ün istediği
--   "form check incelendi -> sistem mesajı" ve "plan yayınlandı -> sistem
--   mesajı" akışları bu yüzden bugün ÇALIŞMIYOR. `useFormChecks.ts` şu an
--   best-effort `.insert()` deniyor, 42501'i BEKLENEN sayıp yutuyor.
--
--
-- ###########################################################################
-- # TASARIM KARARI 1 — SERBEST METİN YOK, OLAY TÜRÜ + SUNUCU ŞABLONU VAR    #
-- #                                                                          #
-- # AC-05'İN DERSİ (20260817160200 §2, 20260817180000): danışan koçun        #
-- # bildirim akışına serbest metin yazabiliyordu ("ACIL: Sifreni sifirla" +  #
-- # kötü amaçlı bağlantı) çünkü içerik İSTEMCİDEN geliyordu. Çözüm ŞABLONA   #
-- # BAĞLAMAK oldu; kalıcı çözüm ise şablonun TEK SAHİBİNİN sunucu (RPC)      #
-- # olmasıydı -- `submit_program_for_approval()`, `c_coach_notification`.    #
-- #                                                                          #
-- # AYNI HATAYI BURADA TEKRARLAMAMAK İÇİN: bu RPC bir "mesaj metni" parametresi #
-- # ALMAZ. Yalnızca bir OLAY TÜRÜ (`p_event_type`) ve o olayın SUNUCUDA ZATEN #
-- # VAR OLAN kaydına bir REFERANS (`p_ref_id`) alır. Metin RPC GÖVDESİNDE,   #
-- # o kaydın SUNUCUDA DOĞRULANMIŞ alanlarından (örn. `form_checks.coach_feedback`, #
-- # ki o da kendi guard trigger'ıyla -- 20260817150000 §6 -- yalnızca koç    #
-- # tarafından ve yalnızca `reviewed` durumunda yazılabilir) ÜRETİLİR.       #
-- #                                                                          #
-- # SONUÇ: koç bu RPC'yi çağırarak keyfi bir "sistem" mesajı ÜRETEMEZ. Ancak #
-- # ZATEN GERÇEKLEŞMİŞ, SUNUCUDA KAYITLI bir olayı (kendi yaptığı bir        #
-- # inceleme) "sistem mesajı" olarak danışana bildirebilir. 'system' etiketi #
-- # "bunu UYGULAMA (bir olayın sonucu olarak) yazdı" anlamını KORUR.         #
-- #                                                                          #
-- # BUGÜN TEK OLAY TÜRÜ VAR: 'form_check_reviewed' (useFormChecks.ts'in      #
-- # ihtiyacı budur -- bu dilimin TEK sahip olduğu istemci dosyası). Plan     #
-- # §4.4'ün "plan yayınlandı" olayı BAŞKA bir ajanın sahipliğindeki          #
-- # `src/hooks/useWorkoutLogs.ts` / `WorkoutTab.tsx` akışına bağlıdır ve bu   #
-- # görevin kapsamı DIŞINDADIR -- burada UYGULANMAZ, İCAT EDİLMEZ. Fonksiyon #
-- # yine de p_event_type'ı bir CASE ile dallıyor: yeni bir olay türü         #
-- # eklemek yeni bir migration'da `create or replace function` + yeni bir    #
-- # `when` dalıdır, sözleşme (imza) DEĞİŞMEZ.                                #
-- ###########################################################################
--
-- ###########################################################################
-- # TASARIM KARARI 2 — KİM ÇAĞIRABİLİR: YALNIZCA KOÇ                         #
-- #                                                                          #
-- # Sistem mesajı bugünkü TEK olayda ("form check incelendi") KOÇUN yaptığı  #
-- # bir eylemin SONUCUDUR -- danışanın kendi form check'inin incelendiğini   #
-- # kendisine "sistem" adına bildirmesinin hiçbir meşru senaryosu yoktur.    #
-- # `auth.uid() is null` (service_role / migration / seed) zaten             #
-- # `is_end_user_write()` = false yoluyla DOĞRUDAN INSERT ile serbesttir --  #
-- # bu RPC'ye ihtiyaç duymaz. RPC'nin muhatabı PostgREST üzerinden gelen     #
-- # AUTHENTICATED KOÇ oturumudur; bu yüzden `public.is_coach(auth.uid())`    #
-- # şart koşulur. Danışan çağırırsa (kendi adına ya da başkası adına fark    #
-- # etmez) 42501 alır -- aşağıdaki §1a.                                      #
-- ###########################################################################
--
-- ###########################################################################
-- # TASARIM KARARI 3 — TRİGGER'LARLA UYUM: ATLAMA YOK, GEÇME VAR             #
-- #                                                                          #
-- # RPC `messages` tablosuna DÜZ bir `insert into ... values (...)` yapar    #
-- # (özel bir "trigger'ı atla" yolu YOKTUR). `messages` üzerindeki üç        #
-- # trigger da AD SIRASINA göre bu INSERT'te de ateşlenir:                   #
-- #   1) messages_apply_conversation_key -> sender=koç, receiver=danışan     #
-- #      olduğu için `client_id`'yi p_client_id'ye TÜRETİR/DOĞRULAR. RPC     #
-- #      client_id'yi zaten p_client_id olarak GÖNDERİR -- trigger bunu      #
-- #      EŞLEŞTİRİR (uyuşmazsa 22023, ama uyuşmaz -- sender/receiver rolleri #
-- #      sabit).                                                            #
-- #   2) messages_guard_columns -> `is_end_user_write()` içeride             #
-- #      `current_user = 'postgres'` görür (SECURITY DEFINER, bkz.           #
-- #      20260817160200 §0) ve FALSE döner -> guard ÇEKİLİR, `kind='system'` #
-- #      GEÇER. Guard'ın kendisi HİÇ ZAYIFLATILMADI: bu RPC yolun DIŞINDA    #
-- #      DEĞİL, TAM OLARAK guard'ın "sunucu bağlamı" için bıraktığı yoldan   #
-- #      geçiyor -- guard'ın kendi yorumundaki "uygulama üretimi sistem      #
-- #      mesajları sunucu tarafından yazılacaktır" cümlesinin karşılığı.     #
-- #   3) messages_sync_read_state -> KOŞULSUZDUR (is_end_user_write guard'ı  #
-- #      yok, bkz. 20260817190300 §2), bu INSERT'te de çalışır: `read_at`    #
-- #      gönderilmediği (NULL) için `is_read` normalleştirilip `false`       #
-- #      olarak bırakılır -- yeni sistem mesajı "okunmamış" olarak doğar,    #
-- #      invaryant (`is_read = (read_at is not null)`) BOZULMAZ.             #
-- # `attachment_path` sistem mesajında BİLEREK ve AÇIKÇA `null` gönderilir   #
-- # (CHECK `messages_attachment_path_chk` zaten NULL'ı serbest bırakır).     #
-- ###########################################################################
--
-- Idempotenttir: `create or replace function`. Geri alma için dosyanın
-- SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## public.post_system_message(uuid, text, uuid) -> public.messages         ##
-- #############################################################################
create or replace function public.post_system_message(
  p_client_id  uuid,
  p_event_type text,
  p_ref_id     uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_form_check  public.form_checks;
  v_feedback    text;
  v_text        text;
  v_message     public.messages;
begin
  -- --- 1a) YALNIZCA KOÇ ÇAĞIRABİLİR -----------------------------------------
  --     `auth.uid() is null` (service_role / migration / seed) bu RPC'ye hiç
  --     ihtiyaç duymaz: onların doğrudan INSERT yolu zaten `is_end_user_write()`
  --     üzerinden serbesttir. Burada muhatap PostgREST'ten gelen bir oturumdur.
  if v_actor is null or not public.is_coach(v_actor) then
    raise exception 'post_system_message: yalnizca koc sistem mesaji tetikleyebilir.'
      using errcode = '42501';
  end if;

  -- --- 1b) Hedef GERÇEK bir danışan olmalı ----------------------------------
  --     `messages_apply_conversation_key` bunu zaten dolaylı doğrular (sender=
  --     koç, receiver rolü client değilse 22023 fırlatır), ama hata mesajının
  --     buradaki niyeti (kim çağırdı, ne istedi) daha net anlatması için erken
  --     ve açık kontrol edilir.
  if p_client_id is null or not exists (
    select 1 from public.profiles p
     where p.id = p_client_id and p.role = 'client'::public.user_role
  ) then
    raise exception 'post_system_message: gecerli bir danisan hedeflenmedi (p_client_id=%).', p_client_id
      using errcode = '22023';
  end if;

  -- --- 1c) OLAY TÜRÜNE GÖRE ŞABLON -------------------------------------------
  --     Metnin TEK sahibi burasıdır (AC-05 dersi -- bkz. yukarıdaki kutu).
  --     Yeni bir olay türü eklemek bu CASE'e yeni bir `when` dalı eklemek
  --     demektir; imza (fonksiyon sözleşmesi) değişmez.
  if p_event_type = 'form_check_reviewed' then
    if p_ref_id is null then
      raise exception 'post_system_message: form_check_reviewed olayi p_ref_id (form_checks.id) gerektirir.'
        using errcode = '22023';
    end if;

    select * into v_form_check from public.form_checks where id = p_ref_id;

    if not found then
      raise exception 'post_system_message: form_checks kaydi bulunamadi (p_ref_id=%).', p_ref_id
        using errcode = '22023';
    end if;
    if v_form_check.client_id is distinct from p_client_id then
      raise exception 'post_system_message: form_checks kaydi (%) hedeflenen danisana (%) ait degil.',
        v_form_check.client_id, p_client_id
        using errcode = '42501';
    end if;
    if v_form_check.status is distinct from 'reviewed'::public.form_check_status then
      raise exception 'post_system_message: form_checks kaydi henuz incelenmedi (status=%).', v_form_check.status
        using errcode = '42501';
    end if;
    if v_form_check.reviewed_by is distinct from v_actor then
      raise exception 'post_system_message: bu incelemeyi siz yapmadiniz -- baskasi adina sistem mesaji tetikleyemezsiniz.'
        using errcode = '42501';
    end if;

    v_feedback := trim(coalesce(v_form_check.coach_feedback, ''));
    v_text := case
      when length(v_feedback) > 0
        then format('Koçunuz form check''inize geri bildirim yazdı: "%s"', v_feedback)
      else 'Koçunuz form check''inizi inceledi.'
    end;

  else
    raise exception 'post_system_message: bilinmeyen olay turu ''%''. Serbest metin kabul edilmez, yalnizca tanimli olay turleri.', p_event_type
      using errcode = '22023';
  end if;

  -- --- 1d) Yazma --------------------------------------------------------------
  --     `client_id` açıkça `p_client_id` olarak gönderilir; §6 trigger'ı
  --     (messages_apply_conversation_key) sender/receiver rollerinden türeteni
  --     bununla KIYASLAR -- iki bağımsız kaynak eşleşmezse INSERT reddedilir.
  --     `attachment_path` sistem mesajının eki olmadığı için BİLEREK `null`.
  insert into public.messages (
    sender_id, receiver_id, client_id, kind, message, attachment_path
  ) values (
    v_actor, p_client_id, p_client_id, 'system'::public.message_kind, v_text, null
  )
  returning * into v_message;

  return v_message;
end;
$$;

comment on function public.post_system_message(uuid, text, uuid)
  is 'kind=''system'' mesaj yazma kanalı. SECURITY DEFINER: messages_guard_columns() sunucu bağlamından geçer (is_end_user_write() false), guard ZAYIFLAMAZ. Yalnızca koç çağırabilir (auth.uid() + is_coach()). Serbest metin İÇERMEZ: mesaj metni p_event_type''a göre RPC gövdesinde şablondan üretilir (AC-05 dersi -- tek şablon sahibi burasıdır). Bugün tek olay türü: ''form_check_reviewed'' (p_ref_id = form_checks.id; reviewed_by = çağıran koç olmalı). messages_apply_conversation_key / messages_sync_read_state trigger''ları bu INSERT''te de normal şekilde çalışır.';

revoke all     on function public.post_system_message(uuid, text, uuid) from public;
grant  execute on function public.post_system_message(uuid, text, uuid) to authenticated, service_role;


-- #############################################################################
-- ## Migration'ın kendi doğrulaması — sessiz başarısızlık YOK                ##
-- #############################################################################
do $$
begin
  if has_function_privilege('anon', 'public.post_system_message(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: post_system_message anon rolune ACIK.';
  end if;

  if not exists (
    select 1 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'post_system_message' and p.prosecdef
  ) then
    raise exception 'DOGRULAMA BASARISIZ: post_system_message SECURITY DEFINER degil -- messages_guard_columns kind=system icin gecemez.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.messages'::regclass
       and tgname   = 'messages_guard_columns'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: messages_guard_columns trigger i YOK -- AC-04 korumasi kaybolmus olabilir.';
  end if;

  raise notice 'post_system_message() kuruldu: SECURITY DEFINER, yalnizca koc, serbest metin yok, sablon tek yerde.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: geri alma `kind='system'` yazma kanalını tekrar kapatır --
-- -- `useFormChecks.ts`'in form check inceleme bildirimi yeniden inert (best
-- -- effort + yutulan 42501) hale döner. `useFormChecks.ts`'i de eski
-- -- `.insert()` yoluna döndürmek GEREKİR, aksi halde `useReviewFormCheck`
-- -- her çağrıda 42501 ile GÜRÜLTÜLÜ hata verir (bilerek -- bkz. hook yorumu).
-- =============================================================================
--
-- begin;
--   drop function if exists public.post_system_message(uuid, text, uuid);
-- commit;
--
-- =============================================================================
