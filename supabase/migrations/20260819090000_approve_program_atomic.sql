-- =============================================================================
-- 20260819090000_approve_program_atomic.sql
--
-- BORÇ B-019 — KOÇ ONAY YOLUNUN ATOMİKLEŞTİRİLMESİ.
--
-- BORÇ (docs/PROGRESS.md, B-019):
--   `useApproveProgram` (packages/api-client/src/hooks/useProgramApprovals.ts)
--   koçun "onayla" tıklamasını ÜÇ AYRI ağ çağrısına bölüyordu:
--     1) rpc('save_workout_plan')                  -> planı danışanın profiline yaz
--     2) update program_approvals set status='approved'
--     3) insert notifications                      -> danışana haber ver
--
--   Sıra bilinçliydi (plan önce) ama ÜÇÜ AYRI TRANSAKSİYONDU. 2. veya 3. adım
--   düşerse (ağ kopması, sekme kapanması, 42501, PostgREST 5xx) YARIM DURUM
--   KALICI olur:
--     * 1 geçti, 2 düştü -> plan danışanın profilinde YAZILI ama onay hâlâ
--       'pending'. Koçun kuyruğunda (`usePendingApprovals`) aynı talep durmaya
--       devam eder; koç ikinci kez onaylarsa `save_workout_plan` bunu bir
--       YAYINLAMA sayıp gereksiz bir plan versiyonu daha açar (20260817210000).
--     * 1+2 geçti, 3 düştü -> program onaylanmış ve yürürlükte ama DANIŞAN
--       HABERSİZ. Bildirim akışı ürünün tek "yeni programın hazır" sinyalidir;
--       danışan eski planla çalışmaya devam eder ve kimse fark etmez.
--
--   Hiçbir telafi yolu yoktu: istemci tarafında `try/catch` ile geri alma
--   YAZILAMAZ (1. adım zaten commit edilmiştir ve `save_workout_plan`'ın tersi
--   diye bir işlem yoktur — arşivlenen versiyon geri diriltilemez).
--
-- ÇÖZÜM:
--   Üç iş TEK bir plpgsql fonksiyonunun gövdesine alınır. Fonksiyon gövdesi
--   TEK TRANSAKSİYONDUR: herhangi bir adım `raise` ederse (ya da bir kısıt /
--   RLS / trigger reddederse) ÖNCEKİ adımların yazdıkları da geri sarılır.
--   Yarım durum ŞEMA SEVİYESİNDE imkânsız hâle gelir ve istemcinin "doğru
--   sırayı" bilmesi gerekmez.
--
-- İSTEMCİ TARAFI (aynı turda): `useApproveProgram` tek bir
--   `supabase.rpc('approve_program', { p_approval_id, p_client_id, p_plan })`
--   çağrısına indirildi.
--
-- Idempotenttir: `create or replace function`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) RPC — public.approve_program(uuid, uuid, jsonb)                      ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN `SECURITY INVOKER` (VARSAYILAN) — VE NEDEN `DEFINER` **DEĞİL**    #
--    #                                                                        #
--    # Bu fonksiyon YETKİ MODELİNİ DEĞİŞTİRMEZ; yalnızca bugün istemcinin      #
--    # arka arkaya yaptığı üç yazmayı tek transaksiyona TOPLAR. Üç yazmanın    #
--    # üçü de bugün ÇAĞIRANIN kimliğiyle, RLS AÇIKKEN yapılıyor:               #
--    #   * workout_plans / workout_plan_exercises -> `save_workout_plan()`     #
--    #     zaten SECURITY INVOKER'dır (20260817210000 §3).                     #
--    #   * program_approvals UPDATE -> `program_approvals_update_coach`        #
--    #     politikası (`is_coach()`) karar verir.                              #
--    #   * notifications INSERT     -> `notifications_insert` politikasının    #
--    #     `is_coach()` dalı karar verir.                                      #
--    #                                                                        #
--    # `SECURITY DEFINER` yapmak bu ÜÇ kapıyı da AÇARDI: fonksiyon `postgres`  #
--    # kimliğiyle (rolbypassrls) koşar ve o hâlde HERHANGİ BİR `authenticated` #
--    # kullanıcı — danışan dahil — istediği danışanın planını ezip onayı       #
--    # 'approved' yapabilirdi. Yani DEFINER burada bir YETKİ YÜKSELTMESİDİR ve #
--    # karşılığında hiçbir şey kazandırmaz: atomiklik güvenlik kipinden DEĞİL, #
--    # TEK GÖVDEDEN gelir.                                                     #
--    #                                                                        #
--    # `submit_program_for_approval()` (20260817180000) ile FARK burada:       #
--    # ORADA DEFINER şarttı, çünkü danışanın KOÇA bildirim yazması             #
--    # `notifications_insert` politikasında KAPALIDIR. BURADA yazan taraf      #
--    # KOÇTUR ve koçun danışana bildirim yazması politikada AÇIKTIR.           #
--    #                                                                        #
--    # `prosecdef = false` bu migration'ın §2 doğrulamasında ve                #
--    # `supabase/tests/rls.test.sql` senaryo 118'de ÖLÇÜLÜR, VARSAYILMAZ.      #
--    ##########################################################################
--
--    ##########################################################################
--    # ONAY KAPISI (AC-01 / AC-07) ATLANMIYOR                                  #
--    #                                                                        #
--    # Onay satırı yine `UPDATE ... SET status='approved'` ile güncellenir —   #
--    # `program_approvals` tablosuna başka bir yazma yolu YOKTUR. Dolayısıyla  #
--    # `program_approvals_guard_review()` BEFORE UPDATE trigger'ı              #
--    # (20260817160000 §3d) bu yolda da ateşlenir ve `reviewed_by` /           #
--    # `reviewed_at` alanlarını `auth.uid()` / `now()` ile SUNUCUDA doldurur.  #
--    # Fonksiyon bu iki alana DOKUNMAZ; dokunsaydı trigger zaten ezerdi.       #
--    #                                                                        #
--    # SECURITY INVOKER olduğu için `auth.uid()` DOLUDUR; trigger'ın           #
--    # "oturumsuz bağlam -> çekil" dalına (§3a) DÜŞÜLMEZ.                      #
--    ##########################################################################
create or replace function public.approve_program(
  p_approval_id uuid,
  p_client_id   uuid,
  p_plan        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- #########################################################################
  -- # BİLDİRİM METNİNİN TEK SAHİBİ ARTIK BURASIDIR.                          #
  -- # Metin `useApproveProgram` içinden KALDIRILDI (eskiden istemci string'i  #
  -- # idi). `submit_program_for_approval()` gövdesindeki                      #
  -- # `c_coach_notification` sabitiyle AYNI desen: şablon SUNUCUDA yaşar.     #
  -- # Metin BİREBİR korunmuştur; değiştirmek isteyen YALNIZCA burayı değiştirir.
  -- #########################################################################
  c_client_notification constant text :=
    'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.';

  v_owner uuid;
  v_saved integer;
  v_rows  integer;
begin
  -- --- 1a) Girdi ------------------------------------------------------------
  if p_approval_id is null or p_client_id is null then
    raise exception 'approve_program: p_approval_id ve p_client_id zorunludur.'
      using errcode = '22023';
  end if;
  -- `p_plan`ın biçim doğrulaması (JSON nesnesi + geçerli gün anahtarları)
  -- BİLEREK TEKRARLANMAZ: tek sahibi `save_workout_plan()`tır ve kopyalanırsa
  -- iki doğrulayıcı zamanla sessizce ayrışır.

  -- --- 1b) PLAN -------------------------------------------------------------
  --     Mantık KOPYALANMIYOR: `save_workout_plan()` ÇAĞRILIYOR. O fonksiyon
  --     versiyonlama/yayınlama kurallarının (taslak mı, yayın mı, arşiv
  --     satırları korunur mu) TEK sahibidir; gövdesini buraya taşımak ikinci
  --     bir plan yazıcısı üretirdi. SECURITY INVOKER olduğu için RLS bu
  --     çağrıda da ÇAĞIRANA uygulanır.
  --
  --     ####################################################################
  --     # SIRA NEDEN KORUNDU (plan -> onay -> bildirim)?                    #
  --     # Artık TUTARLILIK için gerekli DEĞİL: tek transaksiyondayız, hangi #
  --     # adım düşerse düşsün hiçbiri kalıcı olmaz. Sıra yine de eski hâliyle#
  --     # bırakıldı, çünkü:                                                 #
  --     #   (1) DAVRANIŞ BİREBİR AYNI kalır — bu bir yeniden yapılandırma,   #
  --     #       davranış değişikliği değildir.                               #
  --     #   (2) ATOMİKLİK TEST EDİLEBİLİR olur: onay adımı plan YAZILDIKTAN  #
  --     #       SONRA hata verdiği için, hatadan sonra planın YOK olması geri#
  --     #       sarmanın GERÇEK kanıtıdır. Kontroller başa alınsaydı aynı test#
  --     #       "hiç denenmedi"yi ölçer ve boş yere yeşil verirdi.            #
  --     #       (rls.test.sql senaryo 117 tam olarak bunu ölçer.)             #
  --     ####################################################################
  v_saved := public.save_workout_plan(array[p_client_id], p_plan);
  if v_saved is distinct from 1 then
    raise exception 'approve_program: plan yazılamadı — save_workout_plan % danışan bildirdi, beklenen 1.', v_saved
      using errcode = '22023';
  end if;

  -- --- 1c) ONAY SATIRI ------------------------------------------------------
  --     Önce GÖRÜNÜRLÜK probu: "kayıt yok" ile "yetkin yok"u AYRI hatalara
  --     ayırabilmek için. RLS (`program_approvals_select`) koça hepsini,
  --     danışana yalnızca kendi satırlarını gösterir.
  select pa.client_id into v_owner
    from public.program_approvals pa
   where pa.id = p_approval_id;

  if not found then
    raise exception 'approve_program: onay kaydı bulunamadı (id=%). Kayıt silinmiş olabilir ya da görme yetkiniz yok.', p_approval_id
      using errcode = 'P0002';   -- no_data_found
  end if;

  --     EŞLEŞME KAPISI: plan p_client_id'ye YAZILDI; onay BAŞKA bir danışana
  --     aitse yanlış kişinin programını onaylamış olurduk. Bu kontrol olmadan
  --     iki uuid'nin yer değiştirmesi SESSİZCE yanlış veri üretirdi.
  if v_owner is distinct from p_client_id then
    raise exception 'approve_program: onay kaydı (id=%) bu danışana ait değil (kaydın sahibi %, gönderilen %).',
      p_approval_id, v_owner, p_client_id
      using errcode = '22023';
  end if;

  --     `reviewed_by` / `reviewed_at` GÖNDERİLMEZ: trigger doldurur (AC-07).
  --     `status = 'pending'` FİLTRESİ DE YOKTUR — eski istemci de koymuyordu;
  --     koymak, yarıda kalmış bir onayın ikinci denemesini kırardı. Trigger
  --     zaten İLK kararın denetim izini KORUR (20260817160000 §3d).
  update public.program_approvals
     set status = 'approved'::public.approval_status
   where id = p_approval_id;
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    -- Satırı GÖRÜYORUZ (§1c geçti) ama GÜNCELLEYEMİYORUZ: tek sebebi
    -- `program_approvals_update_coach` politikasıdır -> çağıran koç değil.
    raise exception 'approve_program: onay kaydı güncellenemedi (id=%). Programı yalnızca koç onaylayabilir.', p_approval_id
      using errcode = '42501';
  end if;

  -- --- 1d) DANIŞANA BİLDİRİM ------------------------------------------------
  --     `title` gönderilmez (NULL kalır) — eski istemci de göndermiyordu ve
  --     bildirim listesi bu akışta başlık kullanmıyor.
  insert into public.notifications (client_id, message)
  values (p_client_id, c_client_notification);
  get diagnostics v_rows = row_count;

  if v_rows is distinct from 1 then
    raise exception 'approve_program: danışana bildirim yazılamadı (danışan=%).', p_client_id
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.approve_program(uuid, uuid, jsonb)
  is 'Koçun program onayı: planı yazar (save_workout_plan), onay satırını ''approved'' yapar ve danışana bildirim atar — ÜÇÜ TEK TRANSAKSİYONDA (B-019). SECURITY INVOKER: yetki modeli DEĞİŞMEZ, üç yazma da çağıranın kimliğiyle ve RLS açıkken yapılır. reviewed_by/reviewed_at''i program_approvals_guard_review() trigger''ı sunucuda doldurur. Bildirim metninin TEK sahibi bu gövdedir.';

revoke all     on function public.approve_program(uuid, uuid, jsonb) from public;
grant  execute on function public.approve_program(uuid, uuid, jsonb) to authenticated, service_role;


-- #############################################################################
-- ## 2) MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_secdef boolean;
begin
  -- (a) SECURITY INVOKER olmalı. Biri ileride "RLS'e takılıyor" diye DEFINER'a
  --     çevirirse bu migration bir daha koştuğunda GÜRÜLTÜ ÇIKARIR.
  select p.prosecdef into v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'approve_program';

  if v_secdef is null then
    raise exception 'DOGRULAMA BASARISIZ: public.approve_program olusmadi.';
  end if;
  if v_secdef then
    raise exception 'DOGRULAMA BASARISIZ: approve_program SECURITY DEFINER olmus -- YETKI YUKSELTMESI (her authenticated kullanici baskasinin planini ezip onayi approved yapabilir).';
  end if;

  -- (b) Onay kapısı trigger'ı YERİNDE olmalı: RPC ona GÜVENİYOR (reviewed_*).
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.program_approvals'::regclass
       and tgname  = 'program_approvals_guard_review'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: program_approvals_guard_review trigger i YOK -- approve_program denetim izi olmadan calisirdi!';
  end if;

  -- (c) Bağımlı olduğumuz plan yazıcısı da SECURITY INVOKER kalmalı.
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_workout_plan' and p.prosecdef
  ) then
    raise exception 'DOGRULAMA BASARISIZ: save_workout_plan SECURITY DEFINER olmus -- approve_program uzerinden RLS baypasi.';
  end if;

  -- (d) RPC `anon`'a AÇIK OLMAMALI.
  if has_function_privilege('anon', 'public.approve_program(uuid, uuid, jsonb)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: approve_program anon rolune ACIK.';
  end if;

  raise notice 'B-019 kapatildi: approve_program() plan + onay + bildirimi TEK transaksiyonda yaziyor (SECURITY INVOKER).';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma B-019'u YENİDEN AÇAR. Bu bloğu çalıştırıyorsanız
-- -- `packages/api-client/src/hooks/useProgramApprovals.ts`'yi de eski ÜÇ
-- -- ADIMLI hâline (save_workout_plan -> update -> notifications insert)
-- -- döndürmeniz GEREKİR; yoksa koç onayı PGRST202 (fonksiyon yok) ile kırılır.
-- =============================================================================
--
-- begin;
--
-- drop function if exists public.approve_program(uuid, uuid, jsonb);
--
-- commit;
--
-- =============================================================================
