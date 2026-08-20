-- =============================================================================
-- 20260820160000_coach_invite_action.sql
--
-- FAZ 4.9 dilim 1 — DANIŞAN DAVETİ: `coach_actions` denetim tablosunun yeni
-- eylem türü (`client_invited`) ve davetin YAPISAL sorunu olan "hedef henüz
-- YOK" durumunun çözümü.
--
-- Karar kaydı: docs/adr/0027-danisan-daveti.md
-- Kanıt      : supabase/tests/rls.test.sql senaryo 145
-- Tüketici   : apps/web/src/app/api/coach/invite-client/route.ts
--
-- #############################################################################
-- ## BU DOSYANIN KAPSAMI                                                     ##
-- #############################################################################
--   1) `coach_actions_action_chk` kapalı listesi genişletilir:
--        ('password_reset_requested') -> ('password_reset_requested',
--                                         'client_invited')
--   2) `coach_actions.target_id` üzerindeki `NOT NULL` DÜŞÜRÜLÜR, yerine
--      KISMİ bir CHECK gelir: NULL YALNIZCA `client_invited` için serbesttir.
--   3) `record_coach_action()` bu gevşemeye uyacak şekilde güncellenir.
--   4) YENİ: `link_coach_action_target()` — davet BAŞARILI olduktan sonra
--      denetim satırının hedefini TEK YÖNLÜ dolduran dar fonksiyon.
--
-- #############################################################################
-- ## NEDEN `create table if not exists` YETMEZ — AÇIK ALTER ŞART             ##
-- #############################################################################
--   `20260819130000_coach_action_audit.sql` tabloyu `create table if not
--   exists` ile kuruyor ve `constraint coach_actions_action_chk` o gövdenin
--   İÇİNDE. Tablo ZATEN VAR olduğu için o ifade bugün NO-OP'tur: gövdedeki
--   kısıt metnini değiştirmek MEVCUT kısıtı GÜNCELLEMEZ. Yani "eski dosyayı
--   düzenleyip yeniden koşturmak" sessizce hiçbir şey yapmaz ve `client_invited`
--   satırları 23514 ile reddedilmeye DEVAM ederdi. Bu yüzden burada AÇIK
--   `alter table ... drop constraint ... / add constraint ...` yazılır ve
--   sonuç §5'te GERÇEKTEN ölçülür.
--
-- #############################################################################
-- ## `target_id` — BU DİLİMİN EN ZOR KARARI                                  ##
-- #############################################################################
--   Davet anında hedef kullanıcı HENÜZ YOKTUR (`inviteUserByEmail` onu ancak
--   çağrıldığında yaratır). Ama `reset-client-password` emsalinden gelen ve
--   ADR-0025 denetim doktrininin özü olan kural şudur: DENETİM SATIRI
--   MÜDAHALEDEN ÖNCE YAZILIR (fail-closed) — "iz bırakmadan yapılan müdahale,
--   hiç yapılamayan müdahaleden DAHA KÖTÜDÜR". `target_id NOT NULL` ile bu iki
--   gereksinim DOĞRUDAN ÇELİŞİR.
--
--   Üç seçenek tartıldı:
--
--     (i)  Denetimi davetten SONRA yaz.
--          REDDEDİLDİ: fail-closed sırasını bozar; "davet gitti ama izi yok"
--          senaryosunu yeniden MÜMKÜN kılar — tam olarak kapatmak için bu
--          doktrinin kurulduğu şeydir.
--
--     (ii) `target_id`'yi TÜMÜYLE nullable yap.
--          REDDEDİLDİ: `password_reset_requested` için de gevşerdi. Oradaki
--          invaryant ("kimliksiz bir müdahale kaydının anlamı yoktur",
--          20260819130000 §1 target_id yorumu) sessizce kaybolurdu — ve
--          kaybolduğu HİÇBİR yerde ölçülmezdi.
--
--     (iii) SEÇİLEN: `NOT NULL` düşürülür, yerine KISMİ CHECK gelir:
--             check (target_id is not null or action = 'client_invited')
--          Eski eylem türü için invaryant AYNEN korunur (`password_reset_
--          requested` + NULL hedef -> hata). Gevşeme YALNIZCA davet için
--          geçerlidir. Yeni bir eylem türü eklenirken gevşemeyi de İSTEYEN, bu
--          kısıtı da AÇIKÇA genişletmek zorundadır — yani "yeni tür ekledim, bir
--          de bakmışım hedefsiz satır yazılabiliyor" kazası olamaz.
--
--   DAVET AKIŞI İKİ FAZLIDIR:
--     Faz 1 (davetten ÖNCE, fail-closed):
--       record_coach_action('client_invited', coachId, NULL, requestId) -> id
--       İz, müdahaleden ÖNCE ve zorunlu olarak atılır. Yazılamazsa davet HİÇ
--       tetiklenmez.
--     Faz 2 (davet BAŞARILI olduktan SONRA, best-effort):
--       link_coach_action_target(id, yeniKullaniciId)
--       Başarısız olursa istek YİNE 200 döner ve yalnızca uyarı loglanır: iz
--       ZATEN vardır, kaybolan tek şey "kime" bağlantısıdır. Daveti geri almak
--       mümkün olmadığı için burada 500 dönmek koçu YANILTIRDI (e-posta çoktan
--       gitmiş olurdu).
--
-- #############################################################################
-- ## KVKK ETKİSİ — ÖLÇÜLDÜ, VARSAYILMADI                                     ##
-- #############################################################################
--   `target_id` NULL kalan bir satır, davet edilen kişi hakkında HİÇBİR kişisel
--   veri TAŞIMAZ: yalnızca koçun uid'si, zaman damgası, eylem türü ve rastgele
--   `request_id`. E-posta bu tabloda ZATEN saklanmıyor (20260819130000 §1
--   bilinçli asgarilik kararı). Dolayısıyla "unutulma hakkı" açısından o satırda
--   silinecek bir şey YOKTUR. Faz 2 başarılıysa FK CASCADE eskisi gibi çalışır
--   ve danışan `delete_account()` ile silinince satır GİDER.
--
-- #############################################################################
-- ## `delete_account()` / `account_deletion_manifest()` ETKİLENMEZ           ##
-- #############################################################################
--   DOĞRULANDI (bkz. 20260819130000 §3 ve aşağıdaki §5d ölçümü):
--     * Manifest TABLO SAYAR, eylem TÜRÜ ayırt etmez -> sayı DEĞİŞMEZ; bu
--       migration hiç yeni tablo eklemez.
--
--       ####################################################################
--       # SAYIM DÜZELTMESİ — "15" ARTIK DOĞRU DEĞİL                        #
--       # 20260819130000 §3 manifesti "14 -> 15 tablo" diye anlatıyor ve o #
--       # gün doğruydu. Faz 4.8 (20260820090000_activity_log.sql) manifeste#
--       # `activity_sessions` ve `activity_events` anahtarlarını EKLEDİ;   #
--       # bugün ÖLÇÜLEN sayı 17'dir. Bu dosya o sayıyı DEĞİŞTİRMEZ, ama    #
--       # varsaymaz da: §5d anahtar KÜMESİNİ ada ada karşılaştırır, böylece#
--       # yarın 18. bir tablo eklenirse burası GÜRÜLTÜLÜ kırılır ve sayı   #
--       # yorumlarda bir daha sessizce eskimez.                            #
--       ####################################################################
--     * `coach_actions` anahtarı `where target_id = p_user_id` ile sayar;
--       `target_id` NULL olan satır HİÇ KİMSEYE ait sayılmaz, dolayısıyla
--       silme SONRASI `row_total <> 0` fail-closed kontrolünü ETKİLEMEZ
--       (NULL = p_user_id her zaman NULL -> false).
--     * Yeni KOLON da eklenmedi -> rls.test.sql senaryo 133'ün 6 kolonluk
--       sözleşmesi (`action,actor_id,id,occurred_at,request_id,target_id`)
--       AYNEN geçerli kalır.
--     * `mfa_aal2_gate` (20260819120000 §3c) tablo sürüklenme kapısı da
--       ETKİLENMEZ: `coach_actions` zaten muafiyet listesindedir.
--
-- Idempotenttir: `drop constraint if exists` + `create or replace function`.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 0) ÖN KOŞUL — üzerine inşa ettiğimiz şey GERÇEKTEN yerinde mi?          ##
-- #############################################################################
do $precond$
declare
  v_fndef text;
begin
  if to_regclass('public.coach_actions') is null then
    raise exception 'ON KOSUL BASARISIZ: public.coach_actions YOK -- 20260819130000 uygulanmamis.';
  end if;

  if to_regprocedure('public.record_coach_action(text, uuid, uuid, uuid)') is null then
    raise exception 'ON KOSUL BASARISIZ: public.record_coach_action YOK.';
  end if;

  -- Rol garantisi BU migration'da DEĞİL, tetikleyicide yaşıyor. Davet ucunun
  -- "davetle doğan kullanıcı HER ZAMAN client'tir" iddiasının TEK dayanağı
  -- budur; bağ kopmuşsa davet ucu yetki yükseltme yoluna dönüşür.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'auth.users'::regclass
       and t.tgname  = 'on_auth_user_created'
       and not t.tgisinternal
  ) then
    raise exception 'ON KOSUL BASARISIZ: on_auth_user_created tetikleyicisi YOK -- davetle dogan kullanicinin rolu GARANTI EDILEMEZ.';
  end if;

  if to_regprocedure('public.handle_new_user()') is null then
    raise exception 'ON KOSUL BASARISIZ: public.handle_new_user() YOK.';
  end if;

  -- `handle_new_user()` rolü SABİT 'client' yazıyor mu, yoksa biri onu metadata
  -- okuyan eski haline mi döndürdü? Bu, davet ucunun güvenlik iddiasının
  -- KALBİDİR (AC-02) ve SESSİZCE bozulamamalıdır.
  --
  -- DİKKAT: `pg_get_functiondef` YORUM SATIRLARINI DA döndürür ve fonksiyonun
  -- kendi gövdesinde "`raw_user_meta_data ->> 'role'` BİLEREK OKUNMAZ" diyen
  -- bir açıklama VARDIR. Ham metinde arama yapmak bu yüzden YANLIŞ POZİTİF
  -- verir (ilk denemede verdi de). Bu yüzden `--` ile başlayan her yorum
  -- ÖNCE temizlenir, iddia ancak ondan sonra kurulur.
  v_fndef := regexp_replace(
    pg_get_functiondef(to_regprocedure('public.handle_new_user()')),
    '--[^
]*', '', 'g'
  );

  if v_fndef like '%raw_user_meta_data ->> ''role''%' then
    raise exception 'ON KOSUL BASARISIZ: handle_new_user() yeniden raw_user_meta_data.role OKUYOR -- davet ucu YETKI YUKSELTME yoluna doner (AC-02, 20260817160100).';
  end if;

  -- POZİTİF KONTROL: negatif iddia tek başına yetmez (fonksiyon bambaşka bir
  -- şeye dönüşmüş de olabilir). Rolün GERÇEKTEN sabit yazıldığı görülmeli.
  if v_fndef not like '%''client''::public.user_role%' then
    raise exception 'ON KOSUL BASARISIZ: handle_new_user() rolu SABIT ''client'' yazmiyor -- davetle dogan kullanicinin rolu GARANTI EDILEMEZ.';
  end if;

  raise notice 'On kosul GECTI: coach_actions + record_coach_action + on_auth_user_created(handle_new_user, rol SABIT) yerinde.';
end
$precond$;


-- #############################################################################
-- ## 1) `action` KAPALI LİSTESİ GENİŞLETİLİR                                 ##
-- #############################################################################
--   Kısıt ADI korunur (`coach_actions_action_chk`) — rls.test.sql ve gelecekteki
--   migration'lar bu ada göre arıyor.
alter table public.coach_actions
  drop constraint if exists coach_actions_action_chk;

alter table public.coach_actions
  add  constraint coach_actions_action_chk
  check (action in ('password_reset_requested', 'client_invited'));


-- #############################################################################
-- ## 2) `target_id`: NOT NULL -> KISMİ CHECK                                 ##
-- #############################################################################
alter table public.coach_actions
  alter column target_id drop not null;

alter table public.coach_actions
  drop constraint if exists coach_actions_target_required_chk;

alter table public.coach_actions
  add  constraint coach_actions_target_required_chk
  check (target_id is not null or action = 'client_invited');

comment on column public.coach_actions.target_id is
  'Mudahalenin hedefi olan danisan. ON DELETE CASCADE: danisan silinince KVKK geregi bu satir da gider. NULL YALNIZCA action = ''client_invited'' icin serbesttir (coach_actions_target_required_chk): davet aninda hedef kullanici HENUZ YOKTUR; satir davetten ONCE (fail-closed) NULL hedefle yazilir, davet basarili olunca link_coach_action_target() ile TEK YONLU doldurulur. Bkz. ADR-0027.';

comment on constraint coach_actions_target_required_chk on public.coach_actions is
  'target_id yalnizca client_invited icin NULL olabilir; password_reset_requested icin invaryant (kimliksiz mudahale kaydinin anlami yoktur) AYNEN korunur. Yeni bir eylem turu bu gevsemeyi ISTIYORSA bu kisiti da ACIKCA genisletmek zorundadir.';


-- #############################################################################
-- ## 3) `record_coach_action()` — NULL hedefe izin, ama SEÇİCİ olarak        ##
-- #############################################################################
--   Eski gövde `p_target_id is null` durumunda KOŞULSUZ 22023 fırlatıyordu.
--   Artık yalnızca gevşemeye DAHİL OLMAYAN eylem türleri için fırlatır. Not:
--   fonksiyon kapalı listeyi TEKRAR ETMEZ — hangi türün NULL hedefe izin
--   verdiği bilgisi TEK yerde, tablo kısıtındadır (20260819130000'in "tek
--   kaynak" ilkesi). Fonksiyondaki dal yalnızca ERKEN ve OKUNAKLI bir hata
--   mesajı üretir; asıl kapı 23514'tür.
--   AYRICA: `p_target_id` artık `default null` alır. Bu, imzayı DEĞİŞTİRMEZ
--   (varsayılanlar imzanın parçası değildir; fonksiyon hâlâ
--   `record_coach_action(text, uuid, uuid, uuid)`tur) ama PostgREST/istemci
--   tarafında argümanı OPSİYONEL yapar — davet ucu "hedef yok" durumunu
--   `null` GÖNDEREREK değil, argümanı HİÇ GÖNDERMEYEREK ifade eder. Bu, üretilen
--   TypeScript tiplerinde `p_target_id?: string` demektir; `string`e `null`
--   sokuşturmak için tip zorlaması (`as unknown as`) yazmak GEREKMEZ.
create or replace function public.record_coach_action(
  p_action     text,
  p_actor_id   uuid,
  p_target_id  uuid default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if p_actor_id is null then
    raise exception 'record_coach_action: p_actor_id zorunludur.' using errcode = '22023';
  end if;

  -- `client_invited` DIŞINDA hedef ZORUNLUDUR. (Davet, hedefin HENÜZ VAR
  -- OLMADIĞI tek eylem türüdür — bkz. dosya başı "target_id" bloğu.)
  if p_target_id is null and p_action is distinct from 'client_invited' then
    raise exception 'record_coach_action: p_target_id yalnizca client_invited icin NULL olabilir (gelen action=%).', p_action
      using errcode = '22023';
  end if;

  insert into public.coach_actions (action, actor_id, target_id, request_id)
  values (p_action, p_actor_id, p_target_id, p_request_id)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.record_coach_action(text, uuid, uuid, uuid) is
  'Faz 4.7/4.9: koc mudahalesi denetim satiri yazar (KVKK m.12). SECURITY DEFINER, search_path pinli. EXECUTE yalnizca service_role''dedir; authenticated (koc dahil) cagiramaz. p_target_id YALNIZCA client_invited icin NULL olabilir (davet aninda hedef henuz yoktur) -- diger turlerde 22023.';

revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from public;
revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from anon;
revoke all     on function public.record_coach_action(text, uuid, uuid, uuid) from authenticated;
grant  execute on function public.record_coach_action(text, uuid, uuid, uuid) to service_role;


-- #############################################################################
-- ## 4) YENİ: link_coach_action_target() — TEK YÖNLÜ hedef bağlama           ##
-- #############################################################################
--
--   ##########################################################################
--   # NEDEN DÜZ BİR `update` DEĞİL DE DAR BİR FONKSİYON                      #
--   # `coach_actions` sıfır politikalıdır ve `service_role`ün DOĞRUDAN tablo  #
--   # yetkisi bile YOKTUR (20260819130000 §1) — yani route bu satırı düz bir  #
--   # PostgREST `update` ile dolduramaz. Genel bir "update coach_actions"     #
--   # yetkisi vermek ise denetim kaydını DEĞİŞTİRİLEBİLİR hale getirirdi ve   #
--   # tablonun varlık sebebini yok ederdi.                                    #
--   #                                                                        #
--   # BU FONKSİYON GEÇMİŞİ TAHRİF EDEMEZ — ÜÇ KİLİT:                          #
--   #   * `where target_id is null`  -> DOLU bir hedef ASLA yeniden           #
--   #     yönlendirilemez (bir müdahalenin kime yapıldığı sonradan            #
--   #     değiştirilemez).                                                    #
--   #   * `where action = 'client_invited'` -> yalnızca iki fazlı akışın      #
--   #     kendi satırlarına dokunur; `password_reset_requested` satırlarına   #
--   #     ULAŞAMAZ (onlarda zaten NOT NULL invaryantı sürüyor).               #
--   #   * `action`/`actor_id`/`occurred_at`/`request_id` HİÇ yazılmaz —       #
--   #     yalnızca `target_id` kolonu.                                        #
--   # Yani en kötü ihtimalle (anahtar sızarsa) yapılabilecek şey, hedefsiz    #
--   # bir davet kaydını bir kullanıcıya bağlamaktır; var olan hiçbir iz       #
--   # silinemez/değiştirilemez.                                               #
--   ##########################################################################
create or replace function public.link_coach_action_target(
  p_action_id uuid,
  p_target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows integer;
begin
  if p_action_id is null then
    raise exception 'link_coach_action_target: p_action_id zorunludur.' using errcode = '22023';
  end if;
  if p_target_id is null then
    raise exception 'link_coach_action_target: p_target_id zorunludur.' using errcode = '22023';
  end if;

  update public.coach_actions
     set target_id = p_target_id
   where id        = p_action_id
     and action    = 'client_invited'
     and target_id is null;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$fn$;

comment on function public.link_coach_action_target(uuid, uuid) is
  'Faz 4.9: davet BASARILI olduktan sonra client_invited denetim satirinin target_id sini TEK YONLU doldurur. Yalnizca target_id si HALA NULL olan client_invited satirini gunceller -> var olan bir izin hedefi ASLA yeniden yonlendirilemez. SECURITY DEFINER, search_path pinli, EXECUTE yalnizca service_role.';

revoke all     on function public.link_coach_action_target(uuid, uuid) from public;
revoke all     on function public.link_coach_action_target(uuid, uuid) from anon;
revoke all     on function public.link_coach_action_target(uuid, uuid) from authenticated;
grant  execute on function public.link_coach_action_target(uuid, uuid) to service_role;


-- #############################################################################
-- ## 5) MIGRATION'IN KENDİ DOĞRULAMASI — SESSİZ BAŞARISIZLIK YOK            ##
-- #############################################################################
do $verify$
declare
  v_def          text;
  v_id           uuid;
  v_coach        uuid;
  v_client       uuid;
  v_ok           boolean;
  v_caught       boolean;
  v_cols         text;
  v_manifest_def  text;
  v_keys          int;
  v_manifest_keys text;
begin
  -- (a) KAPALI LİSTE gerçekten genişledi mi? (Metni oku, varsayma.)
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.coach_actions'::regclass
     and c.conname  = 'coach_actions_action_chk';

  if v_def is null then
    raise exception 'DOGRULAMA BASARISIZ (a): coach_actions_action_chk YOK.';
  end if;
  if v_def not like '%password_reset_requested%' or v_def not like '%client_invited%' then
    raise exception 'DOGRULAMA BASARISIZ (a): kapali liste beklenen iki degeri TASIMIYOR -> %', v_def;
  end if;

  -- (b) `target_id` artık nullable, ama KISMİ kısıt yerinde mi?
  if (select attnotnull from pg_attribute
       where attrelid = 'public.coach_actions'::regclass and attname = 'target_id') then
    raise exception 'DOGRULAMA BASARISIZ (b): target_id hala NOT NULL -- iki fazli davet akisi calismaz.';
  end if;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'public.coach_actions'::regclass
     and c.conname  = 'coach_actions_target_required_chk';

  if v_def is null then
    raise exception 'DOGRULAMA BASARISIZ (b): coach_actions_target_required_chk YOK -- target_id KOSULSUZ nullable kalmis (secenek (ii)ye dusulmus).';
  end if;

  -- (c) DAVRANIŞ ÖLÇÜMÜ — iddia metinden değil GERÇEK yazmadan okunur.
  --     Yazılan satır bloğun sonunda KENDİ TARAFIMIZDAN silinir; migration
  --     kalıcı denetim satırı BIRAKMAZ.
  select id into v_coach  from public.profiles where role = 'coach'::public.user_role  limit 1;
  select id into v_client from public.profiles where role = 'client'::public.user_role limit 1;

  if v_coach is null or v_client is null then
    -- Boş bir veritabanına (migration'lar seed'den ÖNCE koşar) uygulanıyor:
    -- davranış ölçümü kurulamaz. Bu bir HATA değil; yapı ölçümleri (a/b/d/e)
    -- yine de koşar.
    raise notice 'Davranis olcumu ATLANDI: profiles bos/eksik (koc=%, danisan=%) -- seed henuz kosmamis olabilir.', v_coach, v_client;
  else
    --   (c1) NULL hedefli davet satırı KABUL edilmeli.
    v_id := public.record_coach_action(
      'client_invited'::text, v_coach, null::uuid,
      '00000000-0000-4000-8000-0000000000c1'::uuid
    );
    if v_id is null then
      raise exception 'DOGRULAMA BASARISIZ (c1): NULL hedefli client_invited yazilamadi.';
    end if;

    --   (c2) NULL hedefli ŞİFRE SIFIRLAMA satırı hâlâ REDDEDİLMELİ.
    v_caught := false;
    begin
      perform public.record_coach_action('password_reset_requested'::text, v_coach, null::uuid);
    exception when others then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'DOGRULAMA BASARISIZ (c2): NULL hedefli password_reset_requested KABUL EDILDI -- eski invaryant kaybolmus.';
    end if;

    --   (c3) TEK YÖNLÜ bağlama GERÇEKTEN çalışır ve İKİNCİ kez çalışmaz.
    v_ok := public.link_coach_action_target(v_id, v_client);
    if not coalesce(v_ok, false) then
      raise exception 'DOGRULAMA BASARISIZ (c3): link_coach_action_target hedefi BAGLAYAMADI.';
    end if;

    v_ok := public.link_coach_action_target(v_id, v_coach);
    if coalesce(v_ok, false) then
      raise exception 'DOGRULAMA BASARISIZ (c3b): DOLU bir denetim satirinin hedefi YENIDEN YONLENDIRILEBILDI -- gecmis tahrif edilebilir.';
    end if;

    delete from public.coach_actions where id = v_id;
  end if;

  -- (d) `delete_account()` / manifest ETKİSİZLİĞİ — iddia DOĞRULANIR.
  --     (d1) Yeni KOLON eklenmedi (senaryo 133 sözleşmesi).
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'coach_actions';
  if v_cols is distinct from 'action,actor_id,id,occurred_at,request_id,target_id' then
    raise exception 'DOGRULAMA BASARISIZ (d1): coach_actions kolon sozlesmesi degismis -> %', v_cols;
  end if;

  --     (d2) Manifest HÂLÂ 15 tablo sayıyor, `coach_actions`i kapsıyor ve eylem
  --          TÜRÜNE göre ayrım YAPMIYOR.
  v_manifest_def := pg_get_functiondef(to_regprocedure('public.account_deletion_manifest(uuid)'));
  if v_manifest_def not like '%''coach_actions''%' then
    raise exception 'DOGRULAMA BASARISIZ (d2): manifest coach_actions i SAYMIYOR.';
  end if;
  if v_manifest_def like '%client_invited%' then
    raise exception 'DOGRULAMA BASARISIZ (d2): manifest eylem TURUNE gore ayrim yapiyor -- bu migration onu ETKILEMEMELIYDI.';
  end if;

  --     (d3) Manifest anahtar KÜMESİ — sayı değil AD listesi karşılaştırılır
  --          (bkz. dosya başı "SAYIM DÜZELTMESİ": Faz 4.8'den beri 17 tablo).
  --          Bu migration bu kümeye DOKUNMAZ; dokunduysa/başkası dokunduysa
  --          burası patlar.
  if v_client is not null then
    select string_agg(k, ',' order by k) into v_manifest_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows') k;

    if v_manifest_keys is distinct from
       'activity_events,activity_sessions,coach_actions,daily_logs,form_checks,'
       || 'messages,notifications,nutrition_logs,nutrition_plan_meals,nutrition_plans,'
       || 'profiles,program_approvals,progress_entries,progress_photos,workout_logs,'
       || 'workout_plan_exercises,workout_plans' then
      raise exception 'DOGRULAMA BASARISIZ (d3): hesap silme manifestosunun tablo kumesi degismis -> %', v_manifest_keys;
    end if;

    select count(*) into v_keys
      from jsonb_object_keys(public.account_deletion_manifest(v_client) -> 'rows');
    if v_keys <> 17 then
      raise exception 'DOGRULAMA BASARISIZ (d3): manifest tablo sayisi 17 DEGIL -> %', v_keys;
    end if;
  end if;

  -- (e) YENİ FONKSİYONUN YETKİ YÜZEYİ — dar mı?
  if has_function_privilege('authenticated', 'public.link_coach_action_target(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.link_coach_action_target(uuid, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ (e): link_coach_action_target authenticated/anon a ACIK.';
  end if;
  if not has_function_privilege('service_role', 'public.link_coach_action_target(uuid, uuid)', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ (e): service_role link_coach_action_target i CALISTIRAMIYOR -- davet ucunun 2. fazi olur.';
  end if;

  raise notice 'DOGRULAMA GECTI: kapali liste 2 degerli, target_id kismi CHECK ile nullable, iki fazli akis calisiyor, gecmis tahrif edilemiyor, manifest tablo kumesi (17) DEGISMEDI.';
end
$verify$;


-- =============================================================================
-- DOWN (geri alma) — çalıştırılabilir; bu bloğu kopyalayıp psql'e verin.
--
-- UYARI: geri alma `client_invited` satırları VARKEN yapılırsa `NOT NULL` geri
-- konulamaz (hedefi NULL kalmış satırlar `alter column set not null`u patlatır).
-- O satırları SİLMEK denetim izini YOK ETMEK demektir ve bu doktrine aykırıdır —
-- bu yüzden aşağıdaki script onları SİLMEZ, DURUR ve operatörü uyarır.
--
-- begin;
--   drop function if exists public.link_coach_action_target(uuid, uuid);
--
--   do $$
--   declare
--     v_n bigint;
--   begin
--     select count(*) into v_n from public.coach_actions where action = 'client_invited';
--     if v_n > 0 then
--       raise exception 'GERI ALMA DURDURULDU: % adet client_invited denetim satiri var. Silinirse KVKK m.12 izi yok olur; once operatorle karar verin.', v_n;
--     end if;
--   end $$;
--
--   alter table public.coach_actions drop constraint if exists coach_actions_target_required_chk;
--   alter table public.coach_actions alter column target_id set not null;
--
--   alter table public.coach_actions drop constraint if exists coach_actions_action_chk;
--   alter table public.coach_actions add  constraint coach_actions_action_chk
--     check (action in ('password_reset_requested'));
--
--   create or replace function public.record_coach_action(
--     p_action text, p_actor_id uuid, p_target_id uuid, p_request_id uuid default null
--   ) returns uuid language plpgsql security definer set search_path = public, pg_temp as $fn$
--   declare v_id uuid;
--   begin
--     if p_actor_id  is null then raise exception 'record_coach_action: p_actor_id zorunludur.'  using errcode = '22023'; end if;
--     if p_target_id is null then raise exception 'record_coach_action: p_target_id zorunludur.' using errcode = '22023'; end if;
--     insert into public.coach_actions (action, actor_id, target_id, request_id)
--     values (p_action, p_actor_id, p_target_id, p_request_id) returning id into v_id;
--     return v_id;
--   end; $fn$;
-- commit;
-- =============================================================================
