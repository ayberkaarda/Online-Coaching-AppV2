-- =============================================================================
-- 20260819130000_coach_action_audit.sql
--
-- FAZ 4.7 — KOÇ MÜDAHALELERİ İÇİN SORGULANABİLİR DENETİM TABLOSU.
--   Fable kararı (agent talimatı, 2026-08-19): koç tetiklemeli şifre sıfırlama
--   (`apps/web/src/app/api/coach/reset-client-password/route.ts`) `service_role`
--   ile BAŞKASININ (danışanın) hesabına müdahale ediyor. Şimdiye kadar tek iz
--   `logSecurityEvent()` — yapılandırılmış bir log satırı — barındırma ömrüne
--   bağlı ve SQL ile SORGULANAMAZ. KVKK m.12 hesap verebilirlik yükümlülüğü
--   altında "kim, kimin hesabına, ne zaman müdahale etti" sorusunun kalıcı ve
--   sorgulanabilir bir cevabı olmalı.
--
-- BU DOSYANIN KAPSAMI:
--   1) `public.coach_actions`         — kişisel veri İÇERMEYEN müdahale kaydı
--   2) `public.record_coach_action()` — TEK YAZMA YOLU (SECURITY DEFINER)
--   3) `public.account_deletion_manifest()` / `public.delete_account()` —
--      CREATE OR REPLACE ile GÜNCELLENİR: yeni tablo danışan verisi taşıdığı
--      için hesap silme süpürmesi 14 -> 15 tabloya çıkar (bkz. §3).
--
-- DESEN: `20260819100000_account_deletion.sql`teki `account_deletions`
-- BİREBİR KOPYALANDI — RLS + FORCE + SIFIR POLİTİKA, `authenticated`a S/I/U/D
-- grant'i var ama politika yok (-> her işlem RED), `service_role`e DOĞRUDAN
-- tablo yetkisi bile YOK, tek yazıcı SECURITY DEFINER fonksiyon. Gerekçe
-- ADR-0025 §6 ile birebir aynıdır; burada tekrarlanmaz, yalnızca FARKLAR
-- işaretlenir (§1 GRANT bloğu ve §5 aşağıda).
--
-- Idempotenttir: `create table if not exists` + `create or replace function`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) DENETİM KAYDI — public.coach_actions                                 ##
-- #############################################################################
--
--    ##########################################################################
--    # KİŞİSEL VERİ MİNİMİZASYONU — E-POSTA, IP, USER-AGENT YAZILMAZ           #
--    # `actor_id` ve `target_id` zaten `public.profiles`e bağlı uid'lerdir;    #
--    # "kim" ve "kime" sorusu gerektiğinde `profiles` ile JOIN edilerek        #
--    # cevaplanır. Ayrıca e-posta/IP/user-agent saklamak KVKK açısından ekstra #
--    # bir veri işleme yüzeyi açardı ve `account_deletions`in tuttuğu asgarilik #
--    # disiplininden (§1, 20260819100000) SAPARDI. Buradaki tablo             #
--    # `account_deletions`tan farklı olarak uid'leri BİLEREK TAŞIR — çünkü     #
--    # amacı "kaç satır silindi" istatistiği değil, "hangi koç hangi           #
--    # danışana müdahale etti" sorusuna DOĞRUDAN cevap vermektir. Bu tablonun  #
--    # KENDİSİ kişisel veri taşır; koruması RLS+FORCE+sıfır-politika (aşağı)   #
--    # ile sağlanır.                                                          #
--    ##########################################################################
--
--    ##########################################################################
--    # `action` NEDEN `text` + CHECK, NEDEN ENUM DEĞİL                         #
--    # `public.user_role` gibi bir enum, yeni bir eylem türü eklendiğinde       #
--    # `alter type ... add value` ister ve bu ifade TRANSAKSİYON İÇİNDE        #
--    # (aynı migration'da sonradan kullanılamaz) çalışmaz — ileride bu tabloya  #
--    # hızlı yeni eylem türleri eklenebilmesi için `text` + genişletilebilir    #
--    # bir CHECK tercih edildi. Bugün TEK değer var: `password_reset_requested`.
--    ##########################################################################
create table if not exists public.coach_actions (
  id          uuid        primary key default gen_random_uuid(),
  -- Kapalı liste. Yeni bir eylem türü eklenirken CHECK genişletilir (aşağıdaki
  -- yorum) — sessizce serbest metne dönüşmesin diye.
  action      text        not null,
  -- KOÇ. `profiles`e SET NULL: koç silinirse (bugün `delete_account()` koç
  -- hesabını REDDEDER, ADR-0007 — ama Supabase Studio/`postgres` ile ELLE bir
  -- koç hesabı silinirse) bu satırın kendisi KAYBOLMAMALI; "birisi bu danışana
  -- müdahale etti" izi, kimin yaptığı bilgisi gitse bile KALICI olmalıdır. Aynı
  -- doktrin repoda zaten var: `form_checks.reviewed_by` / `program_approvals.
  -- reviewed_by` da SET NULL'dır (20260817150000 / 20260817160000).
  actor_id    uuid        references public.profiles (id) on delete set null,
  -- DANIŞAN. `profiles`e CASCADE: danışan `delete_account()` ile silinince KVKK
  -- "unutulma hakkı" gereği bu satır da GİTMELİDİR — danışan silindiği hâlde
  -- "bu kişiye ne zaman müdahale edildi" kaydının veritabanında kalması, silme
  -- işlemini anlamsızlaştırırdı. Bu yüzden `target_id` NOT NULL'dır (kimliksiz
  -- bir müdahale kaydının anlamı yoktur) ve manifest/delete_account bu tabloyu
  -- KAPSAR (bkz. §3).
  target_id   uuid        not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  -- Sunucu logundaki `X-Request-ID` ile korelasyon (bkz. route.ts). Rastgeledir.
  request_id  uuid,

  constraint coach_actions_action_chk check (action in ('password_reset_requested'))
);

comment on table public.coach_actions is
  'Koçun service_role ile BAŞKASININ (danışanın) hesabına yaptığı müdahalelerin KVKK m.12 hesap verebilirlik kaydı. actor_id/target_id profiles''e bağlıdır; e-posta/IP/user-agent TAŞINMAZ. Yalnızca service_role''ün SECURITY DEFINER fonksiyonu (record_coach_action) yazabilir; authenticated için RLS politikası YOKTUR (grant var, politika yok -> her işlem RED) — gerekçe account_deletions ile aynı (20260819100000 §1).';

comment on column public.coach_actions.actor_id is
  'Müdahaleyi yapan koç. ON DELETE SET NULL: koç hesabı (delete_account() dışı bir yolla) silinse bile bu satır KALIR, yalnızca "kim" bilgisi kaybolur.';

comment on column public.coach_actions.target_id is
  'Müdahalenin hedefi olan danışan. ON DELETE CASCADE: danışan silinince KVKK gereği bu satır da gider (bkz. §3, hesap silme manifestosu bu tabloyu kapsar).';

comment on column public.coach_actions.request_id is
  'Sunucu logundaki X-Request-ID ile korelasyon anahtarı.';

-- İki sorgu yönü: "bu danışana ne zaman müdahale edildi" (KVKK bilgi talebi) ve
-- "bu koç ne yaptı" (denetim/soruşturma).
create index if not exists coach_actions_target_occurred_idx
  on public.coach_actions (target_id, occurred_at desc);
create index if not exists coach_actions_actor_occurred_idx
  on public.coach_actions (actor_id, occurred_at desc);

alter table public.coach_actions enable row level security;
alter table public.coach_actions force  row level security;

--    ##########################################################################
--    # OKUMA POLİTİKASI KARARI — SIFIR POLİTİKA (account_deletions ile AYNI)   #
--    #                                                                        #
--    # Değerlendirilen alternatif: koç KENDİ eylemlerini (actor_id = auth.     #
--    # uid()) okuyabilsin ya da danışan KENDİSİYLE İLGİLİ müdahaleleri         #
--    # (target_id = auth.uid()) görebilsin. İkisi de KVKK şeffaflığı           #
--    # açısından SAVUNULABİLİR ve reddedilmedi çünkü "yanlış" — reddedildi     #
--    # çünkü BU DİLİMİN KAPSAMI DIŞINDA yeni bir ürün yüzeyi açardı:           #
--    #   * Danışan zaten şifre sıfırlama e-postasını Supabase'in kendi         #
--    #     SMTP'siyle ALIYOR (bkz. route.ts karar notu) — müdahale danışan     #
--    #     için ZATEN GİZLİ DEĞİL, ayrı bir "denetim geçmişi" ekranına         #
--    #     ihtiyaç duymuyor.                                                  #
--    #   * Koça "eylemlerim" listesi açmak yeni bir okuma RPC'si + sayfalama + #
--    #     hız sınırı (enumerasyon riski: `target_id` üzerinden BAŞKA          #
--    #     danışanların var olup olmadığını taramaya çalışabilirdi) gerektirir #
--    #     — bugün hiçbir arayüz tüketicisi YOKTUR, yalnızca yüzey büyütürdü.  #
--    #   * KVKK m.12 hesap verebilirliği önce VERİ SORUMLUSUNA (DPO/operatör)  #
--    #     karşıdır; bu ihtiyaç doğrudan veritabanı erişimiyle (psql/Studio)   #
--    #     ZATEN karşılanır — tıpkı account_deletions'ta olduğu gibi.          #
--    #                                                                        #
--    # SONUÇ: `rls.test.sql` senaryo 73 POZİTİF KONTROL gereği grant VERİLİR   #
--    # ama HİÇBİR POLİTİKA YAZILMAZ. RLS + FORCE + sıfır politika = her SELECT #
--    # 0 satır, her yazma RED. İleride bir arayüz ihtiyacı doğarsa (örn. koç   #
--    # paneline "son müdahaleler" widget'ı), o zaman dar bir RPC + kendi RLS   #
--    # senaryosuyla AÇIKÇA eklenir — sessizce genişlemez.                      #
--    ##########################################################################
grant select, insert, update, delete on public.coach_actions to authenticated;

--    ##########################################################################
--    # `service_role`E DE DOĞRUDAN TABLO YETKİSİ VERİLMEZ — account_deletions  #
--    # İLE AYNI GEREKÇE (20260819100000 §1): tek yazıcı SECURITY DEFINER       #
--    # `record_coach_action()`dır, tablo yetkisine İHTİYAÇ DUYMAZ. Grant       #
--    # verseydik denetim kaydı PostgREST üzerinden okunabilir/yazılabilir hâle #
--    # gelirdi.                                                               #
--    ##########################################################################
revoke truncate, references, trigger on public.coach_actions from authenticated;
revoke all on public.coach_actions from anon;


-- #############################################################################
-- ## 2) YAZMA — public.record_coach_action(text, uuid, uuid, uuid)           ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN SECURITY DEFINER + EXECUTE YALNIZCA service_role                  #
--    # Route koçun KENDİ token'ıyla (authenticated, RLS altında) çalışıyor;    #
--    # o bağlamda coach_actions'a asla INSERT edilemez (yukarıdaki sıfır       #
--    # politika). Yazma, hesap silmedeki delete_account() ile AYNI desenle,   #
--    # route'un SERVICE ROLE istemcisinden çağrılır — böylece "denetim         #
--    # kaydını koç kendi RLS bağlamında SAHTE üretebilir mi" sorusu hiç        #
--    # gündeme gelmez: authenticated'ın bu fonksiyona EXECUTE hakkı YOKTUR.    #
--    ##########################################################################
create or replace function public.record_coach_action(
  p_action     text,
  p_actor_id   uuid,
  p_target_id  uuid,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_actor_id is null then
    raise exception 'record_coach_action: p_actor_id zorunludur.' using errcode = '22023';
  end if;
  if p_target_id is null then
    raise exception 'record_coach_action: p_target_id zorunludur.' using errcode = '22023';
  end if;

  -- `action` CHECK kısıtı tabloda zaten var; burada AYRICA doğrulanmıyor —
  -- tek kaynak (tablo kısıtı) ilkesi, iki yerde aynı listeyi bakımdan kaçınmak
  -- için bilerek tercih edildi. Geçersiz değer 23514 ile reddedilir.
  insert into public.coach_actions (action, actor_id, target_id, request_id)
  values (p_action, p_actor_id, p_target_id, p_request_id)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_coach_action(text, uuid, uuid, uuid) is
  'Faz 4.7: koç müdahalesi denetim satırı yazar (KVKK m.12). SECURITY DEFINER, search_path pinli. EXECUTE yalnızca service_role''dedir; authenticated (koç dahil) çağıramaz, dolayısıyla sahte denetim satırı üretemez.';

revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from public;
revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from anon;
revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from authenticated;
grant  execute on function public.record_coach_action(text, uuid, uuid, uuid) to service_role;


-- #############################################################################
-- ## 3) HESAP SİLME İLE ETKİLEŞİM — manifest 14 -> 15, delete_account() güncel##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN GÜNCELLEME ZORUNLU                                                #
--    # `delete_account()` FAIL-CLOSED çalışır: silme SONRASI                   #
--    # `account_deletion_manifest()`i YENİDEN çağırır, `row_total <> 0` ise     #
--    # TÜM transaksiyonu geri sarar (20260819100000 §3e). `coach_actions.       #
--    # target_id` FK'si CASCADE olduğu için danışan silinince bu tablodaki      #
--    # satırlar da GERÇEKTEN gider — ama manifest bu tabloyu SAYMAZSA bu        #
--    # gerçek sessizce doğrulanmamış kalır (before/after karşılaştırması       #
--    # onu hiç GÖRMEZ). `delete_account()`in kendisi tablo adı ENUMERE ETMEZ   #
--    # (manifest'in `row_total`una güvenir), yani onun mantığı DEĞİŞMEZ; yine  #
--    # de CREATE OR REPLACE ile burada yeniden yayınlanır ki dosya/yorum       #
--    # sözleşmesi ("14 tablo" -> "15 tablo") kod ile SENKRON kalsın.           #
--    ##########################################################################
create or replace function public.account_deletion_manifest(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_exists  boolean;
  v_role    public.user_role;
  v_rows    jsonb;
  v_total   bigint;
  v_storage jsonb;
  v_scount  bigint;
begin
  if p_user_id is null then
    raise exception 'account_deletion_manifest: p_user_id zorunludur.' using errcode = '22023';
  end if;

  select exists (select 1 from auth.users u where u.id = p_user_id) into v_exists;
  select p.role into v_role from public.profiles p where p.id = p_user_id;

  -- --- (a) 15 tablonun satır sayıları --------------------------------------
  --     Sıra ŞEMA SIRASI değil OKUMA SIRASIDIR (kimlik -> iletişim -> günlük
  --     -> plan -> ilerleme -> denetim); denetim satırındaki jsonb böyle okunur.
  --     `coach_actions` FAZ 4.7'de eklendi (15.): danışan HEDEF olduğu (koçun
  --     kendisine müdahale ettiği) satırları sayar; koçun AKTÖR olduğu satırlar
  --     SET NULL ile korunur, silme kapsamına GİRMEZ (bkz. §1 actor_id yorumu).
  select jsonb_build_object(
    'profiles',               (select count(*) from public.profiles      where id        = p_user_id),
    'notifications',          (select count(*) from public.notifications where client_id = p_user_id),
    -- `messages` ÜÇ ayrı kolondan da bağlıdır (client_id = konuşma anahtarı,
    -- sender_id, receiver_id) ve ÜÇÜ DE CASCADE'dir. Sayım da üçünü kapsar:
    -- koçun bu danışana yazdığı mesaj da silinir (konuşmanın tamamı gider).
    'messages',               (select count(*) from public.messages
                                where client_id   = p_user_id
                                   or sender_id   = p_user_id
                                   or receiver_id = p_user_id),
    'form_checks',            (select count(*) from public.form_checks       where client_id = p_user_id),
    'daily_logs',             (select count(*) from public.daily_logs        where client_id = p_user_id),
    'workout_logs',           (select count(*) from public.workout_logs      where client_id = p_user_id),
    'nutrition_logs',         (select count(*) from public.nutrition_logs    where client_id = p_user_id),
    'program_approvals',      (select count(*) from public.program_approvals where client_id = p_user_id),
    'workout_plans',          (select count(*) from public.workout_plans     where client_id = p_user_id),
    'workout_plan_exercises', (select count(*) from public.workout_plan_exercises wpe
                                where exists (select 1 from public.workout_plans wp
                                               where wp.id = wpe.plan_id and wp.client_id = p_user_id)),
    'nutrition_plans',        (select count(*) from public.nutrition_plans   where client_id = p_user_id),
    'nutrition_plan_meals',   (select count(*) from public.nutrition_plan_meals npm
                                where exists (select 1 from public.nutrition_plans np
                                               where np.id = npm.plan_id and np.client_id = p_user_id)),
    'progress_entries',       (select count(*) from public.progress_entries  where client_id = p_user_id),
    'progress_photos',        (select count(*) from public.progress_photos   where client_id = p_user_id),
    'coach_actions',          (select count(*) from public.coach_actions     where target_id = p_user_id)
  ) into v_rows;

  select coalesce(sum(value::bigint), 0) into v_total from jsonb_each_text(v_rows);

  -- --- (b) storage nesneleri, bucket başına yol listesi ---------------------
  --     (20260819100000 §2b ile BİREBİR AYNI — burada DEĞİŞMEDİ, yalnızca (a)
  --     bölümü genişledi.)
  select
    coalesce(jsonb_object_agg(b.bucket_id, b.names), '{}'::jsonb),
    coalesce(sum(jsonb_array_length(b.names)), 0)
  into v_storage, v_scount
  from (
    select o.bucket_id, jsonb_agg(o.name order by o.name) as names
      from storage.objects o
     where o.owner_id = p_user_id::text
        or (o.bucket_id = 'avatars'             and o.name like p_user_id::text || '-%')
        or (o.bucket_id = 'form-checks-media'   and o.name like 'poses/' || p_user_id::text || '-%')
        or (o.bucket_id = 'progress-photos'     and public.progress_photo_owner(o.name) = p_user_id)
        or (o.bucket_id = 'message-attachments' and (
              public.message_attachment_conversation(o.name) = p_user_id
           or public.message_attachment_uploader(o.name)     = p_user_id))
     group by o.bucket_id
  ) b;

  return jsonb_build_object(
    'user_exists',   v_exists,
    'role',          v_role,
    'rows',          v_rows,
    'row_total',     v_total,
    'storage',       v_storage,
    'storage_total', v_scount
  );
end;
$$;

comment on function public.account_deletion_manifest(uuid) is
  'Bir hesabın silinmesiyle gidecek olanın ÖLÇÜMÜ: 15 tablodaki satır sayıları (Faz 4.7''de coach_actions eklendi) + bucket başına storage nesne yolları. Salt okuma. SECURITY DEFINER (auth.users + storage.objects okur) ama EXECUTE YALNIZCA service_role''dedir — authenticated çağıramaz.';

revoke all     on function public.account_deletion_manifest(uuid) from public;
revoke all     on function public.account_deletion_manifest(uuid) from anon;
revoke all     on function public.account_deletion_manifest(uuid) from authenticated;
grant  execute on function public.account_deletion_manifest(uuid) to service_role;


-- `delete_account()` mantığı DEĞİŞMEDİ (tablo adı enumere etmez, manifest'in
-- row_total'ına güvenir) — CREATE OR REPLACE yalnızca doc-comment'i "14" ->
-- "15" olarak günceller ki kod ile yorum SÜRÜKLENMESİN.
create or replace function public.delete_account(
  p_user_id                  uuid,
  p_request_id               uuid    default null,
  p_storage_objects_deleted  integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_role    public.user_role;
  v_storage integer;
  v_deleted integer;
begin
  if p_user_id is null then
    raise exception 'delete_account: p_user_id zorunludur.' using errcode = '22023';
  end if;

  v_before := public.account_deletion_manifest(p_user_id);

  -- --- 3a) IDEMPOTANSLIK ----------------------------------------------------
  if not (v_before ->> 'user_exists')::boolean then
    return jsonb_build_object(
      'already_deleted',         true,
      'rows_deleted',            '{}'::jsonb,
      'row_total',               0,
      'storage_objects_deleted', 0
    );
  end if;

  -- --- 3b) ROL KAPISI -------------------------------------------------------
  v_role := coalesce((v_before ->> 'role')::public.user_role, 'client'::public.user_role);
  if v_role = 'coach'::public.user_role then
    raise exception 'delete_account: koç hesabı bu yoldan silinemez (tek koçlu model, ADR-0007). Koç hesabının kapatılması ayrı ve elle yürütülen bir işlemdir.'
      using errcode = '42501';
  end if;

  -- --- 3c) STORAGE KAPISI ----------------------------------------------------
  v_storage := (v_before ->> 'storage_total')::integer;
  if v_storage <> 0 then
    raise exception 'delete_account: storage nesneleri hâlâ duruyor (% adet) — önce Storage API ile silinmeleri gerekir; aksi hâlde diskte yetim dosya kalır. Silme İPTAL edildi, hiçbir şey değişmedi. Kalan: %',
      v_storage, v_before -> 'storage'
      using errcode = 'P0001';
  end if;

  -- --- 3d) AUTH KULLANICISI --> CASCADE ile 15 TABLO ------------------------
  delete from auth.users u where u.id = p_user_id;
  get diagnostics v_deleted = row_count;

  if v_deleted is distinct from 1 then
    raise exception 'delete_account: auth kullanıcısı silinemedi (id=%, etkilenen satır=%).', p_user_id, v_deleted
      using errcode = '42501';
  end if;

  -- --- 3e) KANIT: geriye HİÇBİR satır kalmamalı (coach_actions dahil) -------
  v_after := public.account_deletion_manifest(p_user_id);
  if (v_after ->> 'row_total')::bigint is distinct from 0 then
    raise exception 'delete_account: silme EKSİK — cascade sonrası geriye satır kaldı: %. (Yeni bir tablo CASCADE olmadan bağlanmış olabilir; şema gözden geçirilmeli.)',
      v_after -> 'rows'
      using errcode = 'P0001';
  end if;

  -- --- 3f) DENETİM SATIRI ---------------------------------------------------
  insert into public.account_deletions (
    subject_role, rows_deleted, storage_objects_deleted, request_id
  )
  values (
    v_role,
    v_before -> 'rows',
    greatest(coalesce(p_storage_objects_deleted, 0), 0),
    p_request_id
  );

  return jsonb_build_object(
    'already_deleted',         false,
    'rows_deleted',            v_before -> 'rows',
    'row_total',               (v_before ->> 'row_total')::bigint,
    'storage_objects_deleted', greatest(coalesce(p_storage_objects_deleted, 0), 0)
  );
end;
$$;

comment on function public.delete_account(uuid, uuid, integer) is
  'KVKK hesap silme (B-042 / AC-4.6.1): auth kullanıcısını siler; 15 public tablo FK CASCADE ile (Faz 4.7''de coach_actions eklendi), storage.objects satırları açık DELETE ile gider; kişisel veri içermeyen denetim satırı yazılır. TEK TRANSAKSİYON. Idempotenttir (kullanıcı yoksa already_deleted:true, hata YOK). Koç hesabı REDDEDİLİR (ADR-0007). EXECUTE yalnızca service_role''dedir; danışan bu fonksiyonu çağıramaz, dolayısıyla BAŞKASININ hesabını silemez.';

revoke all     on function public.delete_account(uuid, uuid, integer) from public;
revoke all     on function public.delete_account(uuid, uuid, integer) from anon;
revoke all     on function public.delete_account(uuid, uuid, integer) from authenticated;
grant  execute on function public.delete_account(uuid, uuid, integer) to service_role;


-- #############################################################################
-- ## 4) MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_secdef  boolean;
  v_pol     int;
  v_manifest jsonb;
begin
  -- (a) `record_coach_action` var, SECURITY DEFINER, EXECUTE yalnızca service_role.
  select p.prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'record_coach_action';
  if v_secdef is null then
    raise exception 'DOGRULAMA BASARISIZ: public.record_coach_action olusmadi.';
  end if;
  if not v_secdef then
    raise exception 'DOGRULAMA BASARISIZ: record_coach_action SECURITY INVOKER olmus.';
  end if;
  if has_function_privilege('authenticated', 'public.record_coach_action(text, uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: record_coach_action AUTHENTICATED rolune ACIK -- koc sahte denetim satiri uretebilir.';
  end if;
  if has_function_privilege('anon', 'public.record_coach_action(text, uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: record_coach_action ANON rolune ACIK.';
  end if;
  if not has_function_privilege('service_role', 'public.record_coach_action(text, uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: service_role record_coach_action i CALISTIRAMIYOR -- sunucu yolu kirilir.';
  end if;

  -- (b) `coach_actions`: RLS + FORCE acik, POLITIKA YOK, service_role dogrudan yetkisiz.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'coach_actions'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'DOGRULAMA BASARISIZ: coach_actions tablosunda RLS/FORCE acik degil.';
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'coach_actions';
  if v_pol <> 0 then
    raise exception 'DOGRULAMA BASARISIZ: coach_actions uzerinde % politika var.', v_pol;
  end if;

  if has_table_privilege('service_role', 'public.coach_actions', 'SELECT')
     or has_table_privilege('service_role', 'public.coach_actions', 'INSERT') then
    raise exception 'DOGRULAMA BASARISIZ: coach_actions service_role a DOGRUDAN acilmis.';
  end if;

  -- (c) FK davranışı: actor_id SET NULL, target_id CASCADE.
  if not exists (
    select 1 from pg_constraint
     where conrelid  = 'public.coach_actions'::regclass
       and contype   = 'f'
       and confrelid = 'public.profiles'::regclass
       and conkey    = array[(select attnum from pg_attribute
                                where attrelid = 'public.coach_actions'::regclass and attname = 'actor_id')]
       and confdeltype = 'n'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: coach_actions.actor_id -> profiles FK si SET NULL degil -- koc silinirse iz kaybolabilir.';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid  = 'public.coach_actions'::regclass
       and contype   = 'f'
       and confrelid = 'public.profiles'::regclass
       and conkey    = array[(select attnum from pg_attribute
                                where attrelid = 'public.coach_actions'::regclass and attname = 'target_id')]
       and confdeltype = 'c'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: coach_actions.target_id -> profiles FK si CASCADE degil -- KVKK unutulma hakki karsilanmaz.';
  end if;

  -- (d) manifest 15. tabloyu gerçekten içeriyor mu (canlı çağrı ile ölçülür,
  --     varsayılmaz — rastgele bir uuid için tüm sayımlar 0 olur ama anahtar
  --     yine de mevcut olmalıdır).
  v_manifest := public.account_deletion_manifest(gen_random_uuid());
  if not (v_manifest -> 'rows' ? 'coach_actions') then
    raise exception 'DOGRULAMA BASARISIZ: account_deletion_manifest() coach_actions anahtarini DONDURMUYOR -- hesap silme bu tabloyu KAPSAMAZ.';
  end if;

  raise notice 'Faz 4.7 koc eylem denetimi kuruldu: coach_actions RLS+FORCE+sifir politika, yazma yalnizca service_role''un record_coach_action()''u ile; account_deletion_manifest()/delete_account() 15 tabloyu kapsiyor.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `apps/web/src/app/api/coach/reset-client-password/route.ts`
-- -- `record_coach_action` RPC'sini çağırıyor; bu fonksiyon düşürülürse o route
-- -- PGRST202 ile kırılır (route'un kendisi de geri alınmalı).
-- --
-- -- UYARI 2 — coach_actions TABLOSUNU DA DÜŞÜRÜRSENİZ: `account_deletion_
-- -- manifest()` ve `delete_account()` bu dosyadaki CREATE OR REPLACE ile
-- -- coach_actions'a REFERANS VERİR HÂLDE KALIR; tablo gerçekten düşürülürse bu
-- -- iki fonksiyon "relation does not exist" ile KIRILIR (hesap silme akışının
-- -- TAMAMI durur). Tabloyu düşürüyorsanız AYNI TRANSAKSİYONDA
-- -- `20260819100000_account_deletion.sql` §2/§3'teki ESKİ (14 tablo) gövdeleri
-- -- de CREATE OR REPLACE ile geri yüklenmelidir.
-- --
-- -- `coach_actions` içindeki satırlar KVKK m.12 hesap verebilirlik kanıtıdır;
-- -- gerçekten gerekmedikçe tabloyu BIRAKIN (VERİ KAYBI).
-- =============================================================================
--
-- begin;
--
-- drop function if exists public.record_coach_action(text, uuid, uuid, uuid);
-- -- Aşağıdaki iki CREATE OR REPLACE olmadan coach_actions'ı düşürmeyin (bkz. UYARI 2).
-- -- drop table if exists public.coach_actions;   -- VERİ KAYBI — bilinçli olarak yorumlu
--
-- commit;
--
-- =============================================================================
