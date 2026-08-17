-- =============================================================================
-- 20260817180000_program_submission_rpc.sql
--
-- FAZ 1.7 — AC-05'İN KAYITLI BORCUNUN KAPATILMASI:
--   "BİLDİRİM ŞABLONU İKİ YERDE YAŞIYOR" KUPLAJININ ÇÖZÜLMESİ.
--
-- BORÇ (docs/security/AUDIT.md §4b, docs/PROGRESS.md §3):
--   `20260817160200_column_guards.sql` §2 AC-05'i kapatırken (a) SECURITY DEFINER
--   RPC yerine (b) BEFORE INSERT trigger'ında ŞABLON EŞLEŞTİRME yolunu seçti.
--   Seçimin TEK sebebi o turda `src/**` başka bir ajanın sahipliğinde olması ve
--   `useProgramApprovals.ts`'nin değiştirilememesiydi. Bedeli o dosyanın kendi
--   yorumunda dürüstçe kayıtlıdır:
--
--     "(b)'nin BEDELİ, dürüstçe: şablon metni İKİ YERDE yaşar (bu fonksiyon ve
--      src/hooks/useProgramApprovals.ts). Uygulama metni değişir de burası
--      güncellenmezse program gönderme akışı 42501 ile KIRILIR."
--
--   Aynı yorum çözümü de yazmıştı: "(a)'ya geçiş ... uygulama koduyla birlikte
--   yapılabilecek bir İYİLEŞTİRME olarak açık kalır." Bu migration O TURDUR:
--   hem migration hem `useProgramApprovals.ts` aynı turda değişiyor.
--
-- ÇÖZÜM — (a) YOLU, ÜÇ PARÇA:
--   1) `public.submit_program_for_approval(uuid, jsonb)` — SECURITY DEFINER RPC.
--      Onay satırını VE koça giden bildirimi TEK ÇAĞRIDA, ATOMİK yazar. Şablon
--      metni ARTIK YALNIZCA BU GÖVDEDE yaşar (`c_coach_notification` sabiti).
--   2) `notifications_insert` politikasından `is_coach_profile(client_id)` dalı
--      KALDIRILIR -> danışanın koça DOĞRUDAN bildirim yazma yolu KAPANIR.
--   3) `notifications_guard_content()` KORUNUR ama şablon dizisi SÖKÜLÜR; yerine
--      rol tabanlı, metin İÇERMEYEN bir kural gelir (§3'te gerekçelendirilmiştir).
--
-- İSTEMCİ TARAFI (aynı turda): `src/hooks/useProgramApprovals.ts` ->
--   `useSubmitProgramForApproval` artık `supabase.rpc('submit_program_for_approval')`
--   çağırır; `.from('notifications').insert(...)` ve şablon metni İSTEMCİDEN
--   TAMAMEN KALDIRILMIŞTIR.
--
-- Idempotenttir: `create or replace function`, `drop policy if exists`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) RPC — public.submit_program_for_approval(uuid, jsonb)                ##
-- #############################################################################
--
--    ##########################################################################
--    # ONAY KAPISI (AC-01) BU RPC İLE **ATLANMIYOR** — KANIT                  #
--    #                                                                        #
--    # Endişe haklıdır: SECURITY DEFINER fonksiyon `postgres` kimliğiyle      #
--    # çalışır ve `postgres` rolünde `rolbypassrls = t` olduğu için RLS       #
--    # POLİTİKALARI bu INSERT'te DEVREYE GİRMEZ. Yani `program_approvals_insert`
--    # (`client_id = auth.uid()`) burada bizi KORUMAZ — bu yüzden aynı kontrol #
--    # §1b'de ELLE yapılır ve 42501 ile reddedilir.                           #
--    #                                                                        #
--    # AMA ONAY KAPISININ KENDİSİ BİR **TRIGGER**'DIR, POLİTİKA DEĞİL:        #
--    # `program_approvals_guard_review()` (20260817160000 §3) BEFORE INSERT    #
--    # trigger'ıdır. Trigger'lar BYPASSRLS'ten ETKİLENMEZ — tablo üzerindeki   #
--    # HER INSERT'te, kim çalıştırırsa çalıştırsın, ateşlenir.                #
--    #                                                                        #
--    # Trigger'ın "çekilme" koşulu `auth.uid() is null`'dır. SECURITY DEFINER  #
--    # `auth.uid()`'i DEĞİŞTİRMEZ: `request.jwt.claims` bir OTURUM GUC'udur,   #
--    # fonksiyonun güvenlik bağlamı onu etkilemez (aynı gözlem                 #
--    # 20260817160200 §0'da ölçülerek kaydedilmiştir). Dolayısıyla bu RPC'nin  #
--    # içindeki INSERT'te `auth.uid()` DOLUDUR ve trigger'ın §3b dalı TAM      #
--    # OLARAK uygulanır: status 'pending' değilse veya reviewed_* doluysa      #
--    # 42501. RPC zaten 'pending' yazar, reviewed_* hiç göndermez -> geçer.    #
--    #                                                                        #
--    # Yani kapı ZAYIFLAMIYOR: RPC kapıdan GEÇİYOR, kapıyı ATLAMIYOR.         #
--    # Bu tahmin değil, `supabase/tests/rls.test.sql` senaryo 79 bunu CANLI    #
--    # kanıtlar: test içinde geçici bir SECURITY DEFINER fonksiyon kurulur ve  #
--    # `status='approved'` ile INSERT denenir -> 42501 alır.                   #
--    #                                                                        #
--    # NEDEN RPC YİNE DE `SECURITY DEFINER` OLMAK ZORUNDA: tek sebebi          #
--    # `notifications` INSERT'idir. §2'de `notifications_insert` politikasından #
--    # `is_coach_profile(...)` dalı kaldırıldığı için SECURITY INVOKER bir     #
--    # fonksiyon koça bildirim YAZAMAZDI. `program_approvals` tarafı için      #
--    # DEFINER'a ihtiyaç YOKTUR ve bu bilinçli bir maliyettir; karşılığında    #
--    # danışanın bildirim tablosuna serbest yazma yüzeyi TAMAMEN kapanır.      #
--    ##########################################################################
create or replace function public.submit_program_for_approval(
  p_client_id    uuid,
  p_workout_data jsonb
)
returns public.program_approvals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- #########################################################################
  -- # ŞABLON METNİN **TEK** SAHİBİ BURASIDIR.                               #
  -- # 20260817160200 §2'deki `c_client_to_coach_messages` dizisi bu          #
  -- # migration ile SÖKÜLMÜŞTÜR; `src/hooks/useProgramApprovals.ts` artık    #
  -- # hiçbir bildirim metni İÇERMEZ. Metni değiştirmek için YALNIZCA burayı  #
  -- # değiştirin — eşlenik tutulması gereken ikinci bir kopya YOKTUR.        #
  -- #########################################################################
  c_coach_notification constant text := '🔔 Yeni bir antrenman programı onayınıza sunuldu.';

  v_actor    uuid := auth.uid();
  v_approval public.program_approvals;
  v_notified integer := 0;
begin
  -- --- 1a) Oturum zorunlu ---------------------------------------------------
  --     `anon`'a zaten EXECUTE verilmiyor (§1d), bu dal savunma derinliğidir:
  --     service_role / psql gibi oturumsuz bağlamlar da bu RPC'yi kullanmamalı;
  --     onların RLS'siz doğrudan INSERT yolu zaten vardır.
  if v_actor is null then
    raise exception 'submit_program_for_approval: oturum gerekli (auth.uid() bos).'
      using errcode = '42501';
  end if;

  -- --- 1b) SAHİPLİK: yalnızca KENDİ adına ----------------------------------
  --     SECURITY DEFINER RLS'i baypas ettiği için `program_approvals_insert`
  --     politikasının (`client_id = auth.uid()`) yerini BU KONTROL alır.
  --     Kaldırılırsa herhangi bir danışan BAŞKASI adına onay talebi açabilir.
  if p_client_id is null or p_client_id <> v_actor then
    raise exception 'submit_program_for_approval: yalnizca kendi adiniza program gonderebilirsiniz.'
      using errcode = '42501';
  end if;

  -- --- 1c) Girdi biçimi -----------------------------------------------------
  --     `save_workout_plan()` ile aynı sözleşme: plan bir JSON NESNESİ olmalı.
  --     Gün anahtarı doğrulaması BİLİNÇLİ olarak YAPILMAZ: `workout_data` bir
  --     TASLAK arşividir (koç onaylarken `parseWorkoutPlan` ile normalize edip
  --     `save_workout_plan()`'a verir ve KATI doğrulama ORADA yapılır). Burada
  --     katı davranmak, eski/kısmi taslakların gönderilmesini engellerdi.
  if p_workout_data is null or jsonb_typeof(p_workout_data) <> 'object' then
    raise exception 'submit_program_for_approval: p_workout_data bir JSON nesnesi olmalidir.'
      using errcode = '22023';
  end if;

  -- --- 1d) Onay satırı ------------------------------------------------------
  --     `status` SABİT 'pending'; `reviewed_*` HİÇ gönderilmez. Yukarıdaki
  --     kutuda anlatıldığı gibi `program_approvals_guard_review()` trigger'ı
  --     bu INSERT'te de ateşlenir ve bu üç alanı DOĞRULAR.
  insert into public.program_approvals (client_id, workout_data, status)
  values (p_client_id, p_workout_data, 'pending'::public.approval_status)
  returning * into v_approval;

  -- --- 1e) Koça bildirim ----------------------------------------------------
  --     KOÇ SUNUCUDA ÇÖZÜLÜR, İSTEMCİDEN GELMEZ. Eski akışta hedef id
  --     istemciden (`coachId ?? clientId`) geliyordu; koç bulunamazsa bildirim
  --     danışanın KENDİSİNE düşüyordu — koç haberdar olmuyordu ve kimse fark
  --     etmiyordu. Artık `role='coach'` olan TÜM profillere yazılır (bugün tek
  --     koç var; çok koçlu modele geçilirse kod değişmeden doğru çalışır).
  --
  --     `title` BİLEREK NULL bırakılır: uygulama bu bildirimde başlık
  --     kullanmıyor ve `notifications_guard_content()`'in eski şablon kuralı da
  --     NULL şart koşuyordu — davranış birebir korunur.
  insert into public.notifications (client_id, title, message)
  select p.id, null, c_coach_notification
    from public.profiles p
   where p.role = 'coach'::public.user_role;
  get diagnostics v_notified = row_count;

  -- Koç yoksa onay kaydı YİNE DE oluşur (WorkoutTab.tsx:187 yorumundaki mevcut
  -- sözleşme: "Bildirim koça gider; koç bulunamazsa onay kaydı yine de
  -- oluşturulur"). Sessiz kalmak yerine sunucu günlüğüne uyarı düşülür.
  if v_notified = 0 then
    raise warning 'submit_program_for_approval: role=coach profil bulunamadi; onay kaydi olusturuldu ama bildirim yazilmadi (danisan=%).', p_client_id;
  end if;

  return v_approval;
end;
$$;

comment on function public.submit_program_for_approval(uuid, jsonb)
  is 'Danışanın antrenman programını koç onayına sunar: program_approvals satırını (her zaman ''pending'') ve koça giden bildirimi ATOMİK olarak yazar. Bildirim şablon metninin TEK sahibi bu gövdedir (AC-05 kuplaj borcu). SECURITY DEFINER olmasının tek sebebi bildirimdir; sahiplik kontrolü (p_client_id = auth.uid()) gövdede elle yapılır ve onay kapısı trigger''ı (program_approvals_guard_review) bu yolda da ateşlenir.';

revoke all     on function public.submit_program_for_approval(uuid, jsonb) from public;
grant  execute on function public.submit_program_for_approval(uuid, jsonb) to authenticated, service_role;


-- #############################################################################
-- ## 2) notifications_insert — DANIŞAN -> KOÇ DOĞRUDAN YAZMA YOLU KAPANIR    ##
-- #############################################################################
--
--    ##########################################################################
--    # HANGİ AKIŞLAR KIRILIR? — TAHMİN DEĞİL, GREP                            #
--    #                                                                        #
--    # `grep -rn "from('notifications')" src/ tests/ ai_backend/` -> 5 isabet: #
--    #   src/hooks/useNotifications.ts:26   select   (okuma, etkilenmez)      #
--    #   src/hooks/useNotifications.ts:54   update   (is_read, etkilenmez)    #
--    #   src/hooks/useNotifications.ts:88   insert   `useSendNotification` -> #
--    #     KOÇ duyurusu; `is_coach()` dalıyla geçer, etkilenmez.              #
--    #   src/hooks/useProgramApprovals.ts:67 insert  DANIŞAN -> KOÇ           #
--    #     ==> `is_coach_profile(...)` dalını kullanan **TEK** çağrı. Bu       #
--    #         migration ile RPC'ye taşındı; satır kaldırıldı.                #
--    #   src/hooks/useProgramApprovals.ts:125 insert KOÇ -> danışan (onay      #
--    #     bildirimi); `is_coach()` dalıyla geçer, etkilenmez.                #
--    #                                                                        #
--    # `ai_backend/` içinde `notifications` tablosuna HİÇ yazma yoktur (FastAPI#
--    # servisi Supabase'e hiç bağlanmaz). `supabase/seed.sql` bildirimleri     #
--    # `postgres` kimliğiyle yazar -> RLS'e tabi değildir.                     #
--    #                                                                        #
--    # SONUÇ: dal kaldırıldığında KIRILAN TEK AKIŞ, bu migration'ın RPC'ye     #
--    # taşıdığı akıştır. Başka kırılan yoktur.                                 #
--    #                                                                        #
--    # KAZANÇ: danışanın koçun bildirim akışına yazabildiği YÜZEY TAMAMEN     #
--    # kapanır. Eski hâlde yüzey "şablona uyan tek metin" kadar dardı ama VARDI#
--    # (ve şablonun kendisi kuplaj borcuydu). Artık danışan `notifications`    #
--    # tablosuna YALNIZCA KENDİ satırını yazabilir.                            #
--    ##########################################################################
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert
  on public.notifications
  for insert
  to authenticated
  with check (
    public.is_coach()            -- koç herkese duyuru yazabilir (ürün işlevi)
    or client_id = auth.uid()    -- kendi akışına yazma (kimse kendini kandıramaz)
    -- KALDIRILDI: or public.is_coach_profile(client_id)
    --   Danışan -> koç bildirimi artık public.submit_program_for_approval()
    --   RPC'si (SECURITY DEFINER) tarafından SUNUCUDA yazılır.
  );


-- #############################################################################
-- ## 3) is_coach_profile() ve notifications_guard_content()'in AKIBETİ       ##
-- #############################################################################
--
--    ##########################################################################
--    # KARAR 1 — `public.is_coach_profile(uuid)` **KORUNUR**                  #
--    #                                                                        #
--    # Politikadaki tek kullanıcısı kalktı; "ölü kod" diye silmek cazip.      #
--    # SİLİNMEDİ, çünkü:                                                       #
--    #   * Aşağıdaki §3 trigger'ı onu HÂLÂ kullanıyor — hedefin koç olup       #
--    #     olmadığını, `profiles` RLS'ine takılmadan, tek yerden sormanın      #
--    #     başka yolu yok (bu yüzden SECURITY DEFINER'dır).                    #
--    #   * `supabase/tests/rls.test.sql` senaryo 76 onu FORCE RLS altında      #
--    #     doğru cevap verdiği için test ediyor; silmek testi de silmek olurdu.#
--    #   * Silmek bir güvenlik kazancı DEĞİL: fonksiyon yalnızca "bu profil    #
--    #     koç mu?" sorusuna cevap verir, bu bilgi `profiles_select` ile zaten #
--    #     her `authenticated` kullanıcıya AÇIKTIR (20260816100000 §2).        #
--    # Yorumu güncellenir ki yanlış (artık geçersiz) gerekçeyi anlatmasın.     #
--    ##########################################################################
comment on function public.is_coach_profile(uuid)
  is 'Hedef profil koç mu? SECURITY DEFINER: profiles RLS''ine bağımlılığı kaldırır. NOT: 20260817180000''den itibaren notifications_insert POLİTİKASINDA kullanılmaz (danışan -> koç doğrudan yazma yolu kapatıldı); tek kullanıcısı notifications_guard_content() trigger''ıdır.';

--    ##########################################################################
--    # KARAR 2 — `notifications_guard_content()` **KORUNUR**, ŞABLON SÖKÜLÜR  #
--    #                                                                        #
--    # "Trigger artık gereksizleşiyor mu?" sorusunun cevabı YARIM EVET:        #
--    #                                                                        #
--    #   * §2a (AC-10, UPDATE koruması) GEREKSİZLEŞMİYOR. `notifications_update`
--    #     politikası sütun kısıtı içeremez (RLS satır bazlıdır) ve            #
--    #     `useMarkAsRead` (useNotifications.ts:54) bu UPDATE yolunu ÜRÜNDE    #
--    #     kullanıyor. Trigger kalkarsa danışan kendi bildiriminin metnini     #
--    #     yeniden değiştirebilir -> AC-10 yeniden açılır. KALMALI.            #
--    #                                                                        #
--    #   * §2b (AC-05, INSERT şablon eşleştirme) GEREKSİZLEŞİYOR. §2'deki      #
--    #     politika daralmasından sonra danışanın koça yazdığı INSERT zaten    #
--    #     RLS tarafından reddedilir; şablon dalına HİÇ ULAŞILAMAZ. Şablon     #
--    #     dizisini bırakmak, kapatmaya çalıştığımız kuplajı ölü kod olarak    #
--    #     yaşatmak olurdu. SÖKÜLDÜ.                                           #
--    #                                                                        #
--    # ŞABLONUN YERİNE NE GELDİ: metin İÇERMEYEN, rol tabanlı bir kural —      #
--    # "danışan koç profiline bildirim yazamaz". Bu, RLS'in söylediğini        #
--    # TEKRARLAR; kasıtlıdır ve iki işe yarar:                                 #
--    #   (1) SAVUNMA DERİNLİĞİ: biri ileride `is_coach_profile(...)` dalını    #
--    #       politikaya geri koyarsa (ör. "koça bildirim atsın" isteği), delik #
--    #       SESSİZCE açılmaz — trigger 42501 verir ve neden'i anlatır.        #
--    #   (2) HATA MESAJI: RLS'in "new row violates row-level security policy"  #
--    #       mesajı geliştiriciye ne yapması gerektiğini SÖYLEMEZ; trigger     #
--    #       doğrudan `submit_program_for_approval()`'a yönlendirir.           #
--    #                                                                        #
--    # DEĞİŞMEYEN: hedef ne kendisi ne de koç ise (danışandan danışana spam)   #
--    # trigger ÇEKİLİR ve reddi RLS'e bırakır — senaryo 13 tam olarak o hata   #
--    # sebebini doğruluyor, trigger onu gizlememeli.                           #
--    ##########################################################################
create or replace function public.notifications_guard_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı (service_role / seed / migration / SECURITY DEFINER RPC):
  -- çekil. `submit_program_for_approval()` tam olarak bu daldan geçer:
  -- `is_end_user_write()` içeride `current_user = 'postgres'` gördüğü için
  -- false döner (bkz. 20260817160200 §0).
  if not public.is_end_user_write() then
    return new;
  end if;

  -- --- 3a) AC-10: UPDATE'te son kullanıcı YALNIZCA `is_read` değiştirebilir --
  if tg_op = 'UPDATE' then
    if new.id         is distinct from old.id
       or new.client_id  is distinct from old.client_id
       or new.title      is distinct from old.title
       or new.message    is distinct from old.message
       or new.created_at is distinct from old.created_at then
      raise exception 'notifications: bildirim icerigi degistirilemez. Yalnizca is_read alani guncellenebilir.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- --- 3b) INSERT ------------------------------------------------------------
  if public.is_coach() then
    return new;                        -- koç yolu: serbest metin (duyuru)
  end if;

  if new.client_id = auth.uid() then
    return new;                        -- kendi akışına yazıyor: serbest
  end if;

  if public.is_coach_profile(new.client_id) then
    -- AC-05: bu yol 20260817180000 §2 ile RLS'te de kapatıldı. Trigger burada
    -- savunma derinliğidir ve asıl değeri HATA MESAJIDIR.
    raise exception 'notifications: danisan koca dogrudan bildirim yazamaz. Program gonderimi public.submit_program_for_approval() RPC si uzerinden yapilir (bildirimi sunucu yazar).'
      using errcode = '42501';
  end if;

  -- Hedef ne kendisi ne de bir koç: reddi RLS'e BIRAKIYORUZ (senaryo 13
  -- "danışandan danışana spam" tam olarak RLS hatasını doğruluyor).
  return new;
end;
$$;

comment on function public.notifications_guard_content()
  is 'notifications içerik/sütun koruması: UPDATE''te son kullanıcı yalnızca is_read değiştirebilir (AC-10); danışan KOÇ profiline doğrudan bildirim YAZAMAZ (AC-05 — yol 20260817180000 ile RLS''te de kapatıldı, bu dal savunma derinliği + yönlendirici hata mesajıdır). ŞABLON METNİ İÇERMEZ: tek şablon sahibi public.submit_program_for_approval() gövdesidir.';

-- Trigger tanımı değişmiyor; fonksiyon gövdesi `create or replace` ile
-- güncellendiği için yeniden bağlamaya gerek yok. Yine de idempotentlik ve
-- "tanım tek dosyada okunabilsin" için yeniden kurulur.
drop trigger if exists notifications_guard_content on public.notifications;
create trigger notifications_guard_content
  before insert or update
  on public.notifications
  for each row
  execute function public.notifications_guard_content();


-- #############################################################################
-- ## 4) MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_check text;
begin
  -- (a) Politikadan is_coach_profile dalı GERÇEKTEN kalkmış olmalı.
  select with_check into v_check
    from pg_policies
   where schemaname = 'public' and tablename = 'notifications'
     and policyname = 'notifications_insert';

  if v_check is null then
    raise exception 'DOGRULAMA BASARISIZ: notifications_insert politikasi YOK.';
  end if;
  if v_check like '%is_coach_profile%' then
    raise exception 'DOGRULAMA BASARISIZ: notifications_insert hala is_coach_profile dalini iceriyor -> %', v_check;
  end if;

  -- (b) Onay kapısı trigger'ı YERİNDE olmalı: RPC ona GÜVENİYOR.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.program_approvals'::regclass
       and tgname  = 'program_approvals_guard_review'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: program_approvals_guard_review trigger i YOK -- submit_program_for_approval() onay kapisi olmadan calisirdi!';
  end if;

  -- (c) RPC `anon`'a AÇIK OLMAMALI.
  if has_function_privilege('anon', 'public.submit_program_for_approval(uuid, jsonb)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: submit_program_for_approval anon rolune ACIK.';
  end if;

  raise notice 'AC-05 kuplaj borcu kapatildi: sablon tek yerde (RPC), notifications_insert daraltildi, onay kapisi yerinde.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma, danışanın koça DOĞRUDAN bildirim yazma yolunu yeniden
-- -- açar ve şablon metnini tekrar İKİ YERE (trigger + istemci) böler. Bu
-- -- bloğu çalıştırıyorsanız `src/hooks/useProgramApprovals.ts`'yi de eski
-- -- `.from('notifications').insert(...)` hâline döndürmeniz GEREKİR; yoksa
-- -- program gönderimi bildirimsiz kalır.
-- =============================================================================
--
-- begin;
--
-- drop function if exists public.submit_program_for_approval(uuid, jsonb);
--
-- drop policy if exists notifications_insert on public.notifications;
-- create policy notifications_insert
--   on public.notifications
--   for insert
--   to authenticated
--   with check (
--     public.is_coach()
--     or client_id = auth.uid()
--     or public.is_coach_profile(client_id)
--   );
--
-- -- notifications_guard_content()'i şablonlu hâline döndürmek için
-- -- 20260817160200_column_guards.sql §2'deki gövdeyi yeniden uygulayın.
--
-- commit;
--
-- =============================================================================
