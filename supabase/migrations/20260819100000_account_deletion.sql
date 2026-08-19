-- =============================================================================
-- 20260819100000_account_deletion.sql
--
-- FAZ 4.6 / DİLİM 1 — KVKK "UNUTULMA HAKKI": HESAP SİLME (borç B-042).
--   active_planprogram.md §7a, AC-4.6.1 / AC-4.6.2
--   docs/security/hardening-prompt-v2.md #21
--   Karar kaydı: docs/adr/0025-hesap-silme-ve-service-role-sunucu-yolu.md
--
-- BORÇ (docs/PROGRESS.md, B-042):
--   Uygulamada hesap silme diye bir yol YOKTU. Danışan "hesabımı silin" dediğinde
--   yapılabilecek tek şey elle SQL yazmaktı; KVKK m.7 / GDPR m.17 karşılanmıyordu.
--
-- BU DOSYANIN KAPSAMI (veritabanı yarısı):
--   1) `public.account_deletions`           — kişisel veri İÇERMEYEN denetim kaydı
--   2) `public.account_deletion_manifest()` — silinecek olanın ÖLÇÜMÜ (salt okuma)
--   3) `public.delete_account()`            — TEK TRANSAKSİYONDA silme + denetim satırı
--
-- SUNUCU YARISI (aynı turda):
--   `apps/web/src/app/api/account/delete/route.ts` — oturumu doğrular, storage
--   NESNELERİNİ (fiziksel dosyaları) Storage API ile siler, sonra buradaki
--   `delete_account()`i `service_role` ile çağırır. İş bölümünün gerekçesi
--   ADR-0025'tedir; ÖZETİ: fiziksel dosya SQL'den silinemez (`storage.objects`
--   satırını silmek diskteki/S3'teki baytı bırakır, YETİM üretir), auth kullanıcısı
--   ise SQL'den silinebilir ve orada silinmelidir ki 14 tablo + denetim satırı
--   AYNI transaksiyona girsin.
--
-- =============================================================================
-- KAÇ TABLO? — "14" ÖLÇÜLDÜ, VARSAYILMADI
-- =============================================================================
--   `public` şemasında (bu migration'dan ÖNCE) 16 tablo vardı. İkisi
--   (`exercises`, `food_database`) KATALOGDUR: hiçbir kullanıcı kolonu taşımaz,
--   herkese ortaktır ve bir hesabın silinmesinden ETKİLENMEZ. Geriye danışan
--   verisi taşıyan 14 tablo kalır — §7a'daki "14 tablo" ifadesi bu ölçümle
--   BİREBİR TUTUYOR:
--
--     doğrudan `client_id` (12):  profiles(id), notifications, form_checks,
--       daily_logs, workout_logs, program_approvals, messages, workout_plans,
--       nutrition_plans, nutrition_logs, progress_entries, progress_photos
--     dolaylı, plan üzerinden (2): workout_plan_exercises(plan_id ->
--       workout_plans), nutrition_plan_meals(plan_id -> nutrition_plans)
--
--   (Bu dosyanın eklediği `account_deletions` 17. tablodur ama danışan verisi
--    TAŞIMAZ — bkz. §1; sayıma girmez.)
--
-- =============================================================================
-- NEDEN 14 AYRI `DELETE` YAZILMADI — CASCADE ZİNCİRİ ÖLÇÜLDÜ
-- =============================================================================
--   `public.profiles.id` -> `auth.users(id) ON DELETE CASCADE` ve yukarıdaki 13
--   tablonun tamamı `profiles`e (ya da bir plana) `ON DELETE CASCADE` ile bağlı.
--   Yani `delete from auth.users where id = ?` TEK ifadesi 14 tablonun tamamını
--   süpürür. Elle 14 `delete` yazmak yalnızca gereksiz olmakla kalmaz, AKTİF
--   ZARARLIDIR: yarın 15. tablo eklenip listeye yazılmazsa silme SESSİZCE eksik
--   kalırdı. Cascade zinciri şemanın kendisinden gelir, elle bakım istemez.
--
--   Bu bir VARSAYIM DEĞİL, ÖLÇÜLEN bir olgudur ve iki yerde doğrulanır:
--     * bu dosyanın §4 doğrulama bloğu (FK'lerin gerçekten CASCADE olduğu),
--     * `delete_account()` gövdesindeki SİLME SONRASI SAYIM (kalan satır varsa
--       `raise` -> transaksiyon geri sarılır; "sildim" demeden önce KANIT ister).
--
-- Idempotenttir: `create table if not exists` + `create or replace function`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) DENETİM KAYDI — public.account_deletions                             ##
-- #############################################################################
--
--    ##########################################################################
--    # AC-4.6.2: "denetim kaydına KİŞİSEL VERİ İÇERMEYEN 'silindi' satırı"     #
--    #                                                                        #
--    # Bu tabloda kullanıcıyı gösteren HİÇBİR kolon YOKTUR: uid yok, e-posta   #
--    # yok, ad yok, IP yok. Silinen kişinin uid'sini saklamak "takma adlı      #
--    # veri" olurdu ve KVKK anlamında hâlâ kişisel veridir — silme kaydının    #
--    # kendisi silinen kişiyi işaret ediyorsa unutulma hakkı yerine gelmemiş   #
--    # olur. Saklanan tek şey İSTATİSTİKTİR:                                   #
--    #   * ne zaman silindi          (`deleted_at`)                            #
--    #   * hangi roldeydi            (`subject_role`; iki değerden biri)       #
--    #   * tablo başına kaç satır    (`rows_deleted` jsonb)                    #
--    #   * kaç storage nesnesi       (`storage_objects_deleted`)               #
--    #   * hangi istek               (`request_id`; sunucu logunun korelasyon  #
--    #     anahtarı, rastgele üretilir, kişiyle bağı YOKTUR)                   #
--    #                                                                        #
--    # BUNUN NE İŞE YARADIĞI: "silme akışı gerçekten çalıştı mı, kaç kez       #
--    # çalıştı, sildiğini iddia ettiği kadar satır sildi mi" sorusu, hiçbir    #
--    # kişisel veri saklamadan cevaplanabilir hâle gelir.                      #
--    #                                                                        #
--    # B-010 İLE İLİŞKİSİ: kütükteki B-010 "plan tablolarında satırı KİMİN     #
--    # yazdığı tutulmuyor" der ve ADR-0014'ün kabul edilen bedelidir. Bu tablo #
--    # O BORCU KAPATMAZ ve kapatmaya çalışmaz: B-010 YAZMA denetimi ister      #
--    # ("kim yazdı"), buradaki kayıt ise SİLME denetimidir ve tam tersine      #
--    # "kim" bilgisini BİLEREK TUTMAZ. İki gereksinim zıt yönlüdür; aynı       #
--    # mekanizmayla çözülemezler. B-010 açık kalmaya devam eder.               #
--    ##########################################################################
--
--    ##########################################################################
--    # NEDEN `uuid` PK, `bigint generated ... identity` DEĞİL                  #
--    # Identity/serial bir SEQUENCE üretir ve `rls.test.sql` senaryo 84 her    #
--    # public sequence'te `authenticated` USAGE'ı ARAR (pozitif kontrol). Bu   #
--    # tabloya `authenticated`ın INSERT edebilmesi zaten İSTENMEYEN bir şey    #
--    # olduğundan, hiç sequence üretmeyip `gen_random_uuid()` kullanmak hem    #
--    # daha az yüzey hem de repodaki baskın desen (`program_approvals`,        #
--    # `progress_entries` … hepsi uuid PK).                                    #
--    ##########################################################################
create table if not exists public.account_deletions (
  id                      uuid             primary key default gen_random_uuid(),
  deleted_at              timestamptz      not null default now(),
  -- Silinen hesabın rolü. İki değerli bir enum olduğu için tek başına hiç
  -- kimseyi işaret etmez.
  subject_role            public.user_role not null,
  -- {"messages": 12, "workout_logs": 40, ...} — tablo -> silinen satır sayısı.
  rows_deleted            jsonb            not null default '{}'::jsonb,
  storage_objects_deleted integer          not null default 0,
  -- Sunucu logundaki `X-Request-ID` ile aynı değer. Rastgeledir; kişiyle bağı YOK.
  request_id              uuid,

  constraint account_deletions_storage_count_chk check (storage_objects_deleted >= 0),
  constraint account_deletions_rows_object_chk   check (jsonb_typeof(rows_deleted) = 'object')
);

comment on table public.account_deletions is
  'KVKK hesap silme denetim kaydı (AC-4.6.2). KİŞİSEL VERİ İÇERMEZ: uid/e-posta/ad/IP saklanmaz; yalnızca zaman + rol + tablo başına satır sayısı + storage nesne sayısı + istek korelasyon anahtarı. Yalnızca service_role okuyabilir/yazabilir; authenticated için RLS politikası YOKTUR (grant var, politika yok -> her işlem RED).';

comment on column public.account_deletions.rows_deleted is
  'Tablo adı -> silinen satır sayısı. Toplamdır; satır İÇERİĞİ tutulmaz.';

comment on column public.account_deletions.request_id is
  'Sunucu logundaki X-Request-ID ile korelasyon. Rastgele üretilir, kişisel veri DEĞİLDİR.';

-- Denetim sorgusu her zaman zamana göredir ("son 30 günde kaç silme").
create index if not exists account_deletions_deleted_at_idx
  on public.account_deletions (deleted_at desc);

alter table public.account_deletions enable row level security;
alter table public.account_deletions force  row level security;

--    ##########################################################################
--    # GRANT VAR, POLİTİKA YOK — BİLİNÇLİ VE ÖLÇÜLEBİLİR BİR KİLİT             #
--    #                                                                        #
--    # `rls.test.sql` senaryo 73 POZİTİF KONTROL olarak HER public tablosunda  #
--    # `authenticated` için S/I/U/D arar ("güvenli ama çalışmayan bir          #
--    # veritabanı üretmeyelim"). Bu tabloda grant'i kesmek o senaryoyu kırar   #
--    # ve — daha kötüsü — gelecekte biri senaryoya istisna eklemek zorunda     #
--    # kalırdı; istisnalar birikince senaryo anlamını yitirir.                 #
--    #                                                                        #
--    # Bunun yerine grant VERİLİR ama HİÇBİR POLİTİKA YAZILMAZ. RLS açık +     #
--    # FORCE + sıfır politika = her SELECT 0 satır, her INSERT/UPDATE/DELETE   #
--    # reddedilir. Kilit ACL'de değil RLS'te durur ve `rls.test.sql`'in yeni   #
--    # senaryosu (senaryo 123) bunu DOĞRUDAN ÖLÇER. `service_role` ve          #
--    # `postgres` `rolbypassrls = t` olduğu için etkilenmez — silme akışının   #
--    # tek yazıcısı onlardır.                                                  #
--    ##########################################################################
grant select, insert, update, delete on public.account_deletions to authenticated;

--    ##########################################################################
--    # `service_role`E DE DOĞRUDAN TABLO YETKİSİ VERİLMEZ — BİLİNÇLİ           #
--    #                                                                        #
--    # Diğer public tabloların çoğu `service_role`e S/I/U/D taşır (Supabase'in #
--    # varsayılanı + 20260816090200'ün toplu grant'ı). Bu tablo BİLEREK dışta  #
--    # bırakıldı: tek yazıcısı `delete_account()`tir ve o fonksiyon SECURITY   #
--    # DEFINER olduğu için tablo yetkisine İHTİYAÇ DUYMAZ. Grant verseydik     #
--    # denetim kaydı PostgREST üzerinden okunabilir/yazılabilir hâle gelirdi —  #
--    # bugün hiçbir tüketicisi olmayan, yalnızca yüzey büyüten bir yetki.      #
--    # Operatör kaydı doğrudan veritabanı erişimiyle (psql/Studio, `postgres`) #
--    # okur. Bu durum `rls.test.sql` senaryo 123'te ÖLÇÜLÜR, varsayılmaz.      #
--    ##########################################################################

-- 20260817170000 §1 doktrini: D/x/t hiçbir zaman authenticated/anon'a verilmez.
-- (Varsayılan yetkiler orada zaten söküldü; burada AÇIKÇA tekrarlanıyor ki tablo
--  bir gün `supabase_admin` ile yeniden yaratılsa bile delik kalmasın.)
revoke truncate, references, trigger on public.account_deletions from authenticated;
revoke all on public.account_deletions from anon;


-- #############################################################################
-- ## 2) ÖLÇÜM — public.account_deletion_manifest(uuid)                       ##
-- #############################################################################
--
--    ##########################################################################
--    # NE İŞE YARAR                                                            #
--    # Sunucu yolu, storage NESNELERİNİ silmeden ÖNCE hangi nesnelerin          #
--    # silineceğini BİLMEK zorundadır (Storage API yol listesi ister). Aynı     #
--    # ölçüm silme sonrası denetim satırının sayılarını da üretir. İki yerde    #
--    # iki ayrı sorgu yazmak yerine TEK KAYNAK: bu fonksiyon.                   #
--    #                                                                         #
--    # NEDEN `SECURITY DEFINER`                                                 #
--    # `storage.objects` ve `auth.users` üzerinde okuma gerektirir. YETKİ       #
--    # YÜKSELTMESİ DEĞİLDİR, çünkü EXECUTE YALNIZCA `service_role`e verilir     #
--    # (aşağıdaki revoke/grant + §4 (b)). `authenticated` bu fonksiyonu         #
--    # ÇAĞIRAMAZ; çağırabilseydi başka bir kullanıcının kaç mesajı/fotoğrafı    #
--    # olduğunu sayabilir, hatta storage YOLLARINI (uid içerirler) okuyabilirdi.#
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

  -- --- (a) 14 tablonun satır sayıları --------------------------------------
  --     Sıra ŞEMA SIRASI değil OKUMA SIRASIDIR (kimlik -> iletişim -> günlük
  --     -> plan -> ilerleme); denetim satırındaki jsonb böyle okunur.
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
    'progress_photos',        (select count(*) from public.progress_photos   where client_id = p_user_id)
  ) into v_rows;

  select coalesce(sum(value::bigint), 0) into v_total from jsonb_each_text(v_rows);

  -- --- (b) storage nesneleri, bucket başına yol listesi ---------------------
  --     ####################################################################
  --     # AD SÖZLEŞMELERİ + `owner_id` GÜVENLİK AĞI                          #
  --     # Dört bucket'ın dördü de FARKLI adlandırma sözleşmesi kullanır ve    #
  --     # her biri kendi migration'ında politika olarak zaten yazılıdır:      #
  --     #   avatars            : '<uid>-…'                   (20260816090300)#
  --     #   form-checks-media  : 'poses/<uid>-…'             (20260816090300)#
  --     #   progress-photos    : progress_photo_owner(name)  (20260817220000)#
  --     #   message-attachments: message_attachment_conversation/_uploader() #
  --     #                                                    (20260817190200)#
  --     # Burada o sözleşmeler TEKRARLANMAZ, ilgili yardımcı fonksiyonlar     #
  --     # ÇAĞRILIR — ikinci bir ayrıştırıcı yazmak sessiz ayrışma üretirdi.   #
  --     #                                                                    #
  --     # `owner_id = uid` DALI GÜVENLİK AĞIDIR: adı sözleşmeye UYMAYAN bir   #
  --     # nesne (eski bir yükleme, elle konmuş bir dosya) yalnız ada bakan    #
  --     # bir sorguda GÖRÜNMEZ ve YETİM kalırdı. Storage API yüklemede        #
  --     # `owner_id`yi yükleyenin uid'siyle doldurur; iki ölçüt UNION'lanır.  #
  --     #                                                                    #
  --     # `message-attachments`ta KONUŞMA klasörü de kapsanır: danışan        #
  --     # silinince koçun O KONUŞMAYA yüklediği ekler de gitmelidir (mesaj    #
  --     # satırları zaten cascade ile gidiyor; dosya kalsaydı içeriği kimse   #
  --     # göremediği hâlde diskte durmaya devam ederdi).                      #
  --     ####################################################################
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
  'Bir hesabın silinmesiyle gidecek olanın ÖLÇÜMÜ: 14 tablodaki satır sayıları + bucket başına storage nesne yolları. Salt okuma. SECURITY DEFINER (auth.users + storage.objects okur) ama EXECUTE YALNIZCA service_role''dedir — authenticated çağıramaz.';

revoke all     on function public.account_deletion_manifest(uuid) from public;
revoke all     on function public.account_deletion_manifest(uuid) from anon;
revoke all     on function public.account_deletion_manifest(uuid) from authenticated;
grant  execute on function public.account_deletion_manifest(uuid) to service_role;


-- #############################################################################
-- ## 3) SİLME — public.delete_account(uuid, uuid, integer)                            ##
-- #############################################################################
--
--    ##########################################################################
--    # IDEMPOTANSLIK SÖZLEŞMESİ (AC-4.6.1)                                     #
--    # İkinci çağrı HATA ÜRETMEZ. Kullanıcı yoksa fonksiyon                     #
--    # `{"already_deleted": true, ...}` döner ve denetim satırı YAZMAZ (ikinci  #
--    # bir "silindi" satırı istatistiği bozar, hiçbir şey ifade etmez). Bu,     #
--    # ağ kopmasında/yeniden denemede güvenli tekrar edilebilirlik sağlar;      #
--    # çağıranın "acaba sildim mi" diye önden kontrol etmesi gerekmez.          #
--    #                                                                         #
--    # KOÇ HESABI BU YOLDAN SİLİNEMEZ                                           #
--    # Tek koçlu model (ADR-0007) koçu sistemin merkezi yapar: koç silinirse    #
--    # `is_coach()` hiç kimseye TRUE dönmez, tüm danışanların onay/mesaj/plan   #
--    # yolları ölür ve `form_checks.reviewed_by` / `program_approvals.          #
--    # reviewed_by` SET NULL ile TÜM inceleme denetim izi silinir. Kapı         #
--    # SUNUCUDA DEĞİL BURADA durur: route bypass edilse bile geçilemez.         #
--    #                                                                         #
--    # SİLME SONRASI SAYIM — "SİLDİM" DEMEDEN ÖNCE KANIT                        #
--    # Cascade zincirine GÜVENİLİR ama İNANILMAZ: silmeden sonra manifest       #
--    # yeniden ölçülür ve `row_total > 0` ise `raise` edilir -> TÜM             #
--    # transaksiyon geri sarılır. Yarın bir migration yeni bir tabloyu          #
--    # CASCADE olmadan bağlarsa bu fonksiyon SESSİZCE eksik silmez, GÜRÜLTÜLÜ   #
--    # patlar.                                                                  #
--    ##########################################################################
create or replace function public.delete_account(
  p_user_id                  uuid,
  p_request_id               uuid    default null,
  -- Sunucu yolunun Storage API ile GERÇEKTEN sildiği fiziksel nesne sayısı.
  -- Denetim satırına yazılır. Bu sayı SQL'den ÖLÇÜLEMEZ (satırlar zaten
  -- gitmiştir, bkz. §3c) — tek bilen çağırandır. Kişisel veri DEĞİLDİR.
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
    -- Kullanıcı YOK. Bu bir hata DEĞİL, istenen son durumdur.
    -- (Profil satırı da yoktur: profiles -> auth.users CASCADE.)
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

  -- --- 3c) STORAGE KAPISI — DOSYALAR ÖNCE GİDER, SONRA VERİTABANI -----------
  --     ####################################################################
  --     # BU FONKSİYON `storage.objects`TAN SATIR SİLMEZ. SİLEMEZ DE.       #
  --     #                                                                  #
  --     # CANLI ÖLÇÜM (bu migration yazılırken, ilk taslakta `delete from   #
  --     # storage.objects` denendi):                                       #
  --     #   ERROR: Direct deletion from storage tables is not allowed.      #
  --     #          Use the Storage API instead.  (42501)                    #
  --     #   HINT:  This prevents accidental data loss from orphaned objects.#
  --     #   CONTEXT: PL/pgSQL function storage.protect_delete()             #
  --     #                                                                  #
  --     # Yani platformun kendisi (`protect_objects_delete` trigger'ı) tam  #
  --     # olarak bizim de kaçınmak istediğimiz şeyi yasaklıyor: satırı      #
  --     # silip DİSKTEKİ/S3'TEKİ BAYTI BIRAKMAK. Trigger'ın bir kaçış       #
  --     # kapısı var (`set local storage.allow_delete_query = 'true'`) ama  #
  --     # BİLEREK KULLANILMIYOR — kullanmak, yetim dosya riskini geri       #
  --     # açmaktan başka bir şey yapmazdı. KVKK açısından yetim bir vücut   #
  --     # fotoğrafı, silinmemiş bir satır kadar ağır bir kusurdur.          #
  --     #                                                                  #
  --     # SÖZLEŞME (ADR-0025): sunucu yolu ÖNCE Storage API ile fiziksel    #
  --     # dosyaları siler (bu, `storage.objects` satırını da götürür), SONRA#
  --     # bu fonksiyonu çağırır. Buraya gelindiğinde geriye nesne KALMAMIŞ  #
  --     # olmalıdır.                                                       #
  --     #                                                                  #
  --     # KALMIŞSA: FAIL-CLOSED. `raise` edilir, TÜM transaksiyon geri      #
  --     # sarılır, hesap SİLİNMEZ. "Yarım silme" (auth kullanıcısı gitti    #
  --     # ama fotoğrafı duruyor) mümkün DEĞİLDİR — ya hepsi ya hiçbiri.     #
  --     # Route bu hatayı görüp Storage adımını tekrarlar (bkz. route.ts    #
  --     # `MAX_STORAGE_PASSES`).                                           #
  --     ####################################################################
  v_storage := (v_before ->> 'storage_total')::integer;
  if v_storage <> 0 then
    raise exception 'delete_account: storage nesneleri hâlâ duruyor (% adet) — önce Storage API ile silinmeleri gerekir; aksi hâlde diskte yetim dosya kalır. Silme İPTAL edildi, hiçbir şey değişmedi. Kalan: %',
      v_storage, v_before -> 'storage'
      using errcode = 'P0001';
  end if;

  -- --- 3d) AUTH KULLANICISI --> CASCADE ile 14 TABLO ------------------------
  --     `auth.users` silindiğinde:
  --       auth tarafı  : sessions / refresh_tokens / identities / mfa_* /
  --                      one_time_tokens … hepsi ON DELETE CASCADE -> oturum
  --                      ve YENİLEME token'ları ANINDA ölür (kalan artık risk
  --                      yalnızca imzası hâlâ geçerli erişim JWT'sidir; bkz.
  --                      ADR-0025 §"Kalan risk").
  --       public tarafı: profiles (id -> auth.users CASCADE) -> ondan da 13
  --                      tablo CASCADE.
  delete from auth.users u where u.id = p_user_id;
  get diagnostics v_deleted = row_count;

  if v_deleted is distinct from 1 then
    raise exception 'delete_account: auth kullanıcısı silinemedi (id=%, etkilenen satır=%).', p_user_id, v_deleted
      using errcode = '42501';
  end if;

  -- --- 3e) KANIT: geriye HİÇBİR satır kalmamalı -----------------------------
  v_after := public.account_deletion_manifest(p_user_id);
  if (v_after ->> 'row_total')::bigint is distinct from 0 then
    raise exception 'delete_account: silme EKSİK — cascade sonrası geriye satır kaldı: %. (Yeni bir tablo CASCADE olmadan bağlanmış olabilir; şema gözden geçirilmeli.)',
      v_after -> 'rows'
      using errcode = 'P0001';
  end if;

  -- --- 3f) DENETİM SATIRI ---------------------------------------------------
  --     Kişisel veri YOK (bkz. §1). Bu INSERT aynı transaksiyondadır: silme
  --     geri sarılırsa denetim satırı da geri sarılır — "sildim" diyen ama
  --     silmeyen bir kayıt OLUŞAMAZ.
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
    -- Buraya gelmişsek §3c geçilmiştir: sunucu yolu storage nesnelerinin
    -- HEPSİNİ silmiştir ve kaç tane olduğunu bize O söylemiştir.
    'storage_objects_deleted', greatest(coalesce(p_storage_objects_deleted, 0), 0)
  );
end;
$$;

comment on function public.delete_account(uuid, uuid, integer) is
  'KVKK hesap silme (B-042 / AC-4.6.1): auth kullanıcısını siler; 14 public tablo FK CASCADE ile, storage.objects satırları açık DELETE ile gider; kişisel veri içermeyen denetim satırı yazılır. TEK TRANSAKSİYON. Idempotenttir (kullanıcı yoksa already_deleted:true, hata YOK). Koç hesabı REDDEDİLİR (ADR-0007). EXECUTE yalnızca service_role''dedir; danışan bu fonksiyonu çağıramaz, dolayısıyla BAŞKASININ hesabını silemez.';

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
  v_fn      text;
  v_missing text;
  v_pol     int;
  v_tabs    int;
begin
  -- (a) İki fonksiyon da var ve SECURITY DEFINER olmalı (DEFINER burada
  --     GEREKLİDİR: auth.users silmek şema sahibi haklarını ister).
  foreach v_fn in array array['account_deletion_manifest', 'delete_account'] loop
    select p.prosecdef into v_secdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;

    if v_secdef is null then
      raise exception 'DOGRULAMA BASARISIZ: public.% olusmadi.', v_fn;
    end if;
    if not v_secdef then
      raise exception 'DOGRULAMA BASARISIZ: public.% SECURITY INVOKER olmus -- auth.users silinemez, silme akisi olu.', v_fn;
    end if;
  end loop;

  -- (b) EXECUTE YALNIZCA service_role'de olmali. Bu, "danisan baskasinin
  --     hesabini silemez" iddiasinin SEMA SEVIYESINDEKI dayanagidir.
  if has_function_privilege('authenticated', 'public.delete_account(uuid, uuid, integer)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: delete_account AUTHENTICATED rolune ACIK -- her danisan istedigi hesabi silebilir!';
  end if;
  if has_function_privilege('anon', 'public.delete_account(uuid, uuid, integer)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: delete_account ANON rolune ACIK.';
  end if;
  if not has_function_privilege('service_role', 'public.delete_account(uuid, uuid, integer)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: service_role delete_account i CALISTIRAMIYOR -- sunucu yolu kirilir.';
  end if;
  if has_function_privilege('authenticated', 'public.account_deletion_manifest(uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: account_deletion_manifest AUTHENTICATED rolune ACIK -- baskasinin veri hacmi sayilabilir.';
  end if;

  -- (c) Denetim tablosu: RLS + FORCE acik, POLITIKA YOK.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'account_deletions'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'DOGRULAMA BASARISIZ: account_deletions tablosunda RLS/FORCE acik degil.';
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'account_deletions';
  if v_pol <> 0 then
    raise exception 'DOGRULAMA BASARISIZ: account_deletions uzerinde % politika var -- denetim kaydi authenticated a acilmis olabilir.', v_pol;
  end if;

  -- (d) CASCADE ZINCIRI: silme akisi buna GUVENIYOR, o yuzden OLCULUYOR.
  if not exists (
    select 1 from pg_constraint
     where conrelid    = 'public.profiles'::regclass
       and contype     = 'f'
       and confrelid   = 'auth.users'::regclass
       and confdeltype = 'c'                        -- 'c' = CASCADE
  ) then
    raise exception 'DOGRULAMA BASARISIZ: public.profiles -> auth.users FK si CASCADE degil -- auth kullanicisi silinince profil (ve 13 tablo) KALIR.';
  end if;

  select string_agg(distinct c.conrelid::regclass::text, ', ')
    into v_missing
    from pg_constraint c
   where c.contype     = 'f'
     and c.confrelid   = 'public.profiles'::regclass
     and c.confdeltype not in ('c', 'n');           -- CASCADE veya SET NULL disi
  if v_missing is not null then
    raise exception 'DOGRULAMA BASARISIZ: profiles e CASCADE/SET NULL disi bir FK ile bagli tablo(lar) var: % -- hesap silme bu tablolarda 23503 ile PATLAR.', v_missing;
  end if;

  -- (e) Danisan verisi tasiyan tablo sayisi 14 olmali (katalog + denetim haric).
  select count(*) into v_tabs
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname not in ('exercises', 'food_database', 'account_deletions');
  if v_tabs <> 14 then
    raise notice 'UYARI: danisan verisi tasiyan tablo sayisi 14 degil, % -- account_deletion_manifest() listesi guncellenmeli olabilir.', v_tabs;
  end if;

  raise notice 'B-042 kapatildi: delete_account() 14 tabloyu + storage nesnelerini + auth kullanicisini TEK transaksiyonda siliyor; denetim satiri kisisel veri icermiyor.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma B-042'yi YENİDEN AÇAR (KVKK unutulma hakkı karşılanmaz).
-- -- Ayrıca `apps/web/src/app/api/account/delete/route.ts` PGRST202 (fonksiyon
-- -- yok) ile kırılır; o dosyayı ve `useDeleteAccount` hook'unu da geri almanız
-- -- GEREKİR.
-- --
-- -- `account_deletions` tablosunun düşürülmesi VERİ KAYBIDIR: içindeki denetim
-- -- satırları geçmiş silmelerin TEK kanıtıdır (kişisel veri içermezler,
-- -- saklamanın bir maliyeti yoktur). Gerçekten gerekmedikçe tabloyu BIRAKIN.
-- =============================================================================
--
-- begin;
--
-- drop function if exists public.delete_account(uuid, uuid, integer);
-- drop function if exists public.account_deletion_manifest(uuid);
-- -- drop table if exists public.account_deletions;   -- VERİ KAYBI — bilinçli olarak yorumlu
--
-- commit;
--
-- =============================================================================
