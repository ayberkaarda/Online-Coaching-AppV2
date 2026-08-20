-- =============================================================================
-- 20260820090000_activity_log.sql
--
-- FAZ 4.8 / DİLİM 1 — ETKİNLİK KAYDI: ŞEMA + RLS + YAZMA YOLU + PURGE
--   Plan: active_planprogram.md §7c
--   Dört karar noktası (rıza temsili, yazma yetkisi, okuma/aal2, purge) FABLE
--   DANIŞMASIYLA BAĞLANDI; gerekçeleri ilgili bölümlerin başında yazılıdır.
--   Emsal desen: 20260819130000_coach_action_audit.sql (tek yazıcı SECURITY
--                DEFINER fonksiyon), 20260819120000_mfa_aal2_gate.sql (aal2
--                kapısı), 20260819100000_account_deletion.sql (fail-closed
--                hesap silme + manifest)
--
-- BU DOSYANIN KAPSAMI (dilim 1 — veritabanı):
--   1) `public.profiles` rıza kolonları + rıza fonksiyonları     (KARAR 1)
--   2) `public.activity_sessions` / `public.activity_events`
--   3) RLS politikaları + aal2 kapısı                            (KARAR 3)
--   4) `public.record_activity()` — TEK YAZMA YOLU               (KARAR 2)
--   5) `public.purge_expired_activity()` + pg_cron + tembel süpürme (KARAR 4)
--   6) `account_deletion_manifest()` / `delete_account()` — 15 -> 17 tablo
--   7) Migration'ın kendi doğrulaması + DOWN bloğu
--
-- DİLİM 2 (POST /api/activity) ve DİLİM 3 (rıza akışı + iki görünüm) BU
-- DOSYADAKİ SÖZLEŞMEYE göre yazılacaktır; ad/imza değiştirilmemelidir.
--
-- =============================================================================
-- VERİ MİNİMİZASYONU — NE TUTULMUYOR (§7c kararı; gelecekte "bir de şunu
-- ekleyelim" denince ÖNCE bu satır okunsun)
-- =============================================================================
--   IP YOK. User-agent YOK. Olay İÇERİĞİ YOK (hangi mesaj, hangi log, hangi
--   fotoğraf). URL parametresi YOK. Referrer YOK. Konum YOK.
--   Tutulan: KİM (uid) · NE ZAMAN · HANGİ TÜR (kapalı liste) · HANGİ SEKME
--   (kısa etiket) · NE KADAR (saniye) · HANGİ PLATFORM (web/mobile).
--
--   `tab` bilerek SERBEST METİN DEĞİLDİR ama enum da değildir: 40 karakterlik
--   bir tavan + boş-değil kısıtı vardır. Enum yapmak arayüz sekme adlarını
--   şemaya çakardı (her yeni sekme migration ister); tavansız `text` ise
--   "olay içeriği tutulmaz" ilkesini bir gün sessizce delerdi.
--
-- Idempotenttir: `add column if not exists` + `create table if not exists` +
-- `create or replace function` + `drop policy if exists` + adlandırılmış cron
-- job (aynı adla yeniden zamanlama UPSERT'tir). İkinci koşu FARK ÜRETMEZ.
-- Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) RIZA — public.profiles kolonları + rıza fonksiyonları                ##
-- #############################################################################
--
--    ##########################################################################
--    # KARAR 1 (FABLE): İKİ DAMGA + VERSİYON KOLONU; RIZA GEÇMİŞİ TABLOSU YOK #
--    #                                                                        #
--    # §7c üç ayrı durum İSTİYOR: "açık / kapalı / hiç-karar-verilmedi" —      #
--    # çünkü koç rozetinde "aktivite kaydı kapalı" ile "kullanıcı bu soruyu    #
--    # hiç görmedi" AYNI ŞEY DEĞİLDİR (birincisinde kullanıcı BİLİNÇLİ olarak  #
--    # hayır demiştir).                                                       #
--    #                                                                        #
--    # Tek bir `activity_consent_at` bunu TAŞIYAMAZ: kullanıcı onay verip geri #
--    # çekerse NULL'a dönmek iki farklı durumu aynı değere ezer, eski damgayı  #
--    # bırakmak ise "hâlâ onaylı" demektir. İkisi de yanlış.                   #
--    #                                                                        #
--    # SEÇİLEN TEMSİL:                                                        #
--    #   `activity_consent_granted_at` timestamptz                            #
--    #   `activity_consent_revoked_at` timestamptz                            #
--    #   `activity_consent_version`    integer  (onaylanan aydınlatma metninin #
--    #                                           sürümü — KVKK ispat yükü)     #
--    #                                                                        #
--    # ÜÇ DURUM TÜRETİLİR (tek yerde: `public.activity_consent_state()`):      #
--    #   ikisi de NULL                          -> 'undecided'                 #
--    #   granted_at var ve (revoked_at NULL     -> 'granted'                   #
--    #                      veya granted_at > revoked_at)                      #
--    #   aksi                                   -> 'revoked'                   #
--    # BERABERLİK (granted_at = revoked_at) 'revoked' sayılır — FAIL-CLOSED.   #
--    #                                                                        #
--    # TÜRETME MANTIĞI TEK YERDE DURUR: `activity_consent_state(uuid)`         #
--    # fonksiyonu. Aynı `case` ifadesinin route'ta, RLS'te ve iki arayüzde     #
--    # tekrar yazılması, birinin yanlış yazılması hâlinde "sessizce onaylı     #
--    # sayma" (fail-OPEN) üretirdi. Kolonlar veriyi, fonksiyon ANLAMI tutar.   #
--    #                                                                        #
--    # GERİ ÇEKMEDE VERİ ANINDA SİLİNİR — 180 GÜN "ERİMEZ".                    #
--    # Toplamanın tek dayanağı AÇIK RIZADIR (§7c meşru menfaati BİLEREK        #
--    # reddetti). Dayanak düşünce SAKLAMA dayanağı da düşer (KVKK m.7).        #
--    # "Kapat ama geçmişi tut" diye ikinci bir düğme YOKTUR:                   #
--    #   KAPAT = DURDUR + SİL  -> `public.revoke_activity_consent()` (§1c).    #
--    #                                                                        #
--    # RIZA GEÇMİŞİ TABLOSU GEREKMEZ: geri çekme anında veri silindiği için    #
--    # elde tutulan HER satır, GÜNCEL grant penceresinde toplanmıştır. Son     #
--    # döngünün iki damgası + metin versiyonu ispat yükünü karşılar. Ayrı bir  #
--    # olay tablosu ispat gücü EKLEMEZ; 18. tablo + manifest + RLS + purge     #
--    # yüzeyi maliyeti EKLER.                                                 #
--    ##########################################################################
alter table public.profiles add column if not exists activity_consent_granted_at timestamptz;
alter table public.profiles add column if not exists activity_consent_revoked_at timestamptz;
alter table public.profiles add column if not exists activity_consent_version    integer;

do $$
begin
  -- Versiyon pozitif bir tam sayıdır (aydınlatma metni v1, v2, …).
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_activity_consent_version_chk'
  ) then
    alter table public.profiles
      add constraint profiles_activity_consent_version_chk
      check (activity_consent_version is null or activity_consent_version > 0);
  end if;

  -- ONAY VARSA VERSİYON DA VARDIR. Bu kısıt olmasaydı "onayladı ama hangi
  -- metni onayladığı bilinmiyor" satırları üretilebilirdi — KVKK ispat yükü
  -- açısından böyle bir onay, onay değildir.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_activity_consent_version_pair_chk'
  ) then
    alter table public.profiles
      add constraint profiles_activity_consent_version_pair_chk
      check (activity_consent_granted_at is null or activity_consent_version is not null);
  end if;
end
$$;

comment on column public.profiles.activity_consent_granted_at is
  'Faz 4.8 (§7c): etkinlik kaydi icin ACIK RIZANIN verildigi an. Uc durumun turetilmesi icin bkz. public.activity_consent_state(uuid). Yalnizca public.grant_activity_consent() yazar; son kullanici UPDATE ile DOKUNAMAZ (profiles_guard_activity_consent).';

comment on column public.profiles.activity_consent_revoked_at is
  'Faz 4.8 (§7c): rizanin GERI CEKILDIGI an. Geri cekme ANINDA kullanicinin tum activity_* satirlari silinir (KVKK m.7) — bkz. public.revoke_activity_consent(). Yalnizca o fonksiyon yazar.';

comment on column public.profiles.activity_consent_version is
  'Onaylanan aydinlatma metninin surumu (pozitif tam sayi). Metin degisince surum artirilir; kullanicinin surumu guncelin gerisindeyse riza YENIDEN alinir. Riza gecmisi tablosu YOKTUR — geri cekmede veri silindigi icin son dongunun damgalari + bu surum ispat yukunu karsilar.';

--    ##########################################################################
--    # RIZA KOLONLARI SON KULLANICI YAZIMINA KAPALIDIR                         #
--    #                                                                        #
--    # `profiles_update_self` politikası kullanıcının KENDİ satırını           #
--    # güncellemesine izin verir; rıza kararı da KULLANICININ kararıdır. Ama   #
--    # kararın DAMGASINI istemcinin yazmasına izin vermek KVKK hesap           #
--    # verebilirliği açısından anlamsız bir kayıt üretirdi: "ne zaman onay     #
--    # verdi" sorusunun cevabı istemcinin saatine (ve iyi niyetine) kalırdı.   #
--    # Dahası `revoked_at`i istemci yazabilseydi, "durdur + sil" sözleşmesinin #
--    # SİL yarısı atlanabilirdi: damga basılır, satırlar kalırdı.              #
--    #                                                                        #
--    # Bu yüzden üç kolon da §1b/§1c'deki iki SECURITY DEFINER fonksiyona      #
--    # kapatıldı. Desen `profiles_guard_server_columns` ile (20260817160200    #
--    # §3) BİREBİR aynıdır: sunucu bağlamında (`is_end_user_write()` false)    #
--    # trigger çekilir, son kullanıcı yazımında 42501 fırlatır.                #
--    #                                                                        #
--    # TRIGGER SIRASI: adlar alfabetiktir -> `profiles_guard_activity_consent` #
--    # ('a') `profiles_guard_server_columns` ('s') ÖNCE koşar. İkisi de aynı   #
--    # hata kodunu (42501) üretir; sıranın davranışa etkisi yoktur.            #
--    ##########################################################################
create or replace function public.profiles_guard_activity_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı (service_role / DEFINER RPC / seed / migration): çekil.
  if not public.is_end_user_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.activity_consent_granted_at is not null
       or new.activity_consent_revoked_at is not null
       or new.activity_consent_version is not null then
      raise exception 'profiles: etkinlik rizasi kolonlari istemciden yazilamaz. Riza yalnizca sunucu yolundan (grant_activity_consent / revoke_activity_consent) kaydedilir.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.activity_consent_granted_at is distinct from old.activity_consent_granted_at
     or new.activity_consent_revoked_at is distinct from old.activity_consent_revoked_at
     or new.activity_consent_version    is distinct from old.activity_consent_version then
    raise exception 'profiles: etkinlik rizasi damgalari degistirilemez. Riza yalnizca sunucu yolundan (grant_activity_consent / revoke_activity_consent) degistirilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_activity_consent() is
  'Faz 4.8: profiles.activity_consent_* kolonlarini SON KULLANICI yaziminda dondurur (42501). Riza damgalari yalnizca grant_activity_consent() / revoke_activity_consent() tarafindan yazilir — geriye tarihli riza uretilemez ve "damgayi bas ama satirlari birak" mumkun degildir. Sunucu baglaminda (is_end_user_write() false) devreye girmez.';

drop trigger if exists profiles_guard_activity_consent on public.profiles;
create trigger profiles_guard_activity_consent
  before insert or update
  on public.profiles
  for each row
  execute function public.profiles_guard_activity_consent();


-- --- 1a) ÜÇ DURUMUN TEK KAYNAĞI ---------------------------------------------
--
--    ##########################################################################
--    # NEDEN `SECURITY INVOKER`                                                #
--    # Fonksiyon `profiles`ten okur ve ÇAĞIRANIN RLS'i altında çalışır:        #
--    #   * danışan  -> yalnızca KENDİ satırını görür (başkası için NULL döner) #
--    #   * koç      -> tüm danışanları görür (rozet için gereken tam da bu)    #
--    #   * DEFINER bir fonksiyonun içinden çağrılırsa (bkz. §4) o fonksiyonun  #
--    #     sahibi (`postgres`, `rolbypassrls`) haklarıyla koşar -> doğru cevap.#
--    # DEFINER yapılsaydı, herhangi bir danışan BAŞKA bir danışanın rıza       #
--    # durumunu yoklayabilirdi — küçük ama gereksiz bir sızıntı.               #
--    ##########################################################################
create or replace function public.activity_consent_state(p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
           when p.activity_consent_granted_at is null
            and p.activity_consent_revoked_at is null then 'undecided'
           when p.activity_consent_granted_at is not null
            and (p.activity_consent_revoked_at is null
                 or p.activity_consent_granted_at > p.activity_consent_revoked_at) then 'granted'
           else 'revoked'
         end
    from public.profiles p
   where p.id = p_user_id;
$$;

comment on function public.activity_consent_state(uuid) is
  'Faz 4.8 (§7c): etkinlik rizasinin UC DURUMU — undecided | granted | revoked. Iki damganin karsilastirilmasindan TURETILIR ve bu turetme SADECE BURADA yasar (route/arayuz kendi kopyasini yazmaz). Beraberlik (granted_at = revoked_at) FAIL-CLOSED olarak revoked sayilir. SECURITY INVOKER: profil gorunmuyorsa NULL doner.';

revoke all     on function public.activity_consent_state(uuid) from public;
revoke all     on function public.activity_consent_state(uuid) from anon;
grant  execute on function public.activity_consent_state(uuid) to authenticated, service_role;


-- --- 1b) RIZA VERME ----------------------------------------------------------
create or replace function public.grant_activity_consent(
  p_user_id uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'grant_activity_consent: p_user_id zorunludur.' using errcode = '22023';
  end if;
  if p_version is null or p_version < 1 then
    raise exception 'grant_activity_consent: p_version pozitif olmalidir (gelen: %). Hangi aydinlatma metninin onaylandigi BILINMEDEN riza kaydedilemez.', p_version
      using errcode = '22023';
  end if;

  update public.profiles p
     set activity_consent_granted_at = v_now,
         activity_consent_version    = p_version
   where p.id = p_user_id;

  if not found then
    raise exception 'grant_activity_consent: profil bulunamadi (id=%).', p_user_id using errcode = '23503';
  end if;

  -- `activity_consent_revoked_at` BİLEREK TEMİZLENMEZ: eski geri çekmenin anı,
  -- "bu kullanıcı daha önce kapatmıştı" bilgisini taşır ve `granted_at >
  -- revoked_at` olduğu için durum yine 'granted' türetilir (§1a).
  return jsonb_build_object(
    'user_id',    p_user_id,
    'state',      'granted',
    'granted_at', v_now,
    'version',    p_version
  );
end;
$$;

comment on function public.grant_activity_consent(uuid, integer) is
  'Faz 4.8 (§7c): etkinlik kaydi icin ACIK RIZAYI kaydeder (damga SUNUCUDAN, onaylanan metin surumuyle birlikte). Onceki revoked_at BILEREK korunur. EXECUTE yalnizca service_role — istemci damgayi kendisi yazamaz.';

revoke all     on function public.grant_activity_consent(uuid, integer) from public;
revoke all     on function public.grant_activity_consent(uuid, integer) from anon;
revoke all     on function public.grant_activity_consent(uuid, integer) from authenticated;
grant  execute on function public.grant_activity_consent(uuid, integer) to service_role;


-- --- 1c) RIZA GERİ ÇEKME = DURDUR + SİL --------------------------------------
--
--    ##########################################################################
--    # KAPAT = DURDUR + SİL (KARAR 1'in ikinci yarısı)                         #
--    #                                                                        #
--    # Damgayı basmak yazmayı DURDURUR (§4a rıza kapısı). Ama toplamanın tek   #
--    # dayanağı rıza olduğu için, dayanak düştüğünde GEÇMİŞ VERİNİN SAKLANMA   #
--    # dayanağı da düşer: 180 günlük pencerede "erimeye" bırakmak, geri çekme  #
--    # tarihinden sonra 180 gün boyunca hukuki dayanaksız veri saklamak olurdu.#
--    #                                                                        #
--    # FİLTRESİZ `delete` YASAK: her iki ifade de `where user_id = p_user_id`  #
--    # taşır ve NULL girdisi 22023 ile reddedilir (NULL karşılaştırması        #
--    # hiçbir satırı seçmezdi ama sessiz "0 satır sildim" cevabı, çağıranın    #
--    # hatasını gizlerdi).                                                     #
--    #                                                                        #
--    # SIRA ÖNEMLİ: önce olaylar, sonra oturumlar. Ters sırada oturum          #
--    # CASCADE'i olayları götürürdü ve `events_deleted` sayacı YALAN SÖYLERDİ. #
--    ##########################################################################
create or replace function public.revoke_activity_consent(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_events   integer;
  v_sessions integer;
begin
  if p_user_id is null then
    raise exception 'revoke_activity_consent: p_user_id zorunludur.' using errcode = '22023';
  end if;

  update public.profiles p
     set activity_consent_revoked_at = v_now
   where p.id = p_user_id;

  if not found then
    raise exception 'revoke_activity_consent: profil bulunamadi (id=%).', p_user_id using errcode = '23503';
  end if;

  delete from public.activity_events e where e.user_id = p_user_id;
  get diagnostics v_events = row_count;

  delete from public.activity_sessions s where s.user_id = p_user_id;
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'user_id',          p_user_id,
    'state',            'revoked',
    'revoked_at',       v_now,
    'events_deleted',   v_events,
    'sessions_deleted', v_sessions
  );
end;
$$;

comment on function public.revoke_activity_consent(uuid) is
  'Faz 4.8 (§7c / KVKK m.7): rizayi geri ceker VE o kullanicinin TUM etkinlik kaydini ANINDA siler (180 gunluk pencerede "erimeye" birakilmaz — toplamanin tek dayanagi rizadir). Silme p_user_id ile FILTRELIDIR, TEK TRANSAKSIYON. EXECUTE yalnizca service_role.';

revoke all     on function public.revoke_activity_consent(uuid) from public;
revoke all     on function public.revoke_activity_consent(uuid) from anon;
revoke all     on function public.revoke_activity_consent(uuid) from authenticated;
grant  execute on function public.revoke_activity_consent(uuid) to service_role;


-- #############################################################################
-- ## 2) TABLOLAR — public.activity_sessions / public.activity_events         ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN İKİ TABLO                                                         #
--    # Heartbeat (60 sn) OTURUMU tazeler, OLAY ÜRETMEZ. Tek tabloda tutulsaydı #
--    # her heartbeat bir satır yazardı: 8 saatlik bir gün = 480 satır/kullanıcı#
--    # ve hiçbiri bir "olay" değil. İki tablo ile heartbeat tek satırlık bir   #
--    # UPDATE'e (`last_seen_at`) iner; olay tablosu yalnızca GERÇEK olayları   #
--    # taşır.                                                                  #
--    #                                                                        #
--    # NEDEN uuid PK: `rls.test.sql` senaryo 84 HER public sequence'inde       #
--    # `authenticated` USAGE'ı arar; sequence üretmemek hem yüzeyi küçültür    #
--    # hem repodaki baskın deseni (account_deletions, coach_actions,           #
--    # progress_*) izler.                                                     #
--    ##########################################################################
create table if not exists public.activity_sessions (
  id           uuid        primary key default gen_random_uuid(),
  -- `profiles`e CASCADE: hesap silinince oturumları da gider (§6, KVKK).
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  started_at   timestamptz not null default now(),
  -- Heartbeat'in yazdığı TEK alan. 30 dk hareketsizlik sonrası bu oturum
  -- "bayat" sayılır ve `record_activity()` YENİ bir oturum açar (§4c).
  last_seen_at timestamptz not null default now(),
  platform     text        not null,

  constraint activity_sessions_platform_chk check (platform in ('web', 'mobile')),
  -- Zaman tutarlılığı: bir oturum başlamadan "son görülmüş" olamaz.
  constraint activity_sessions_window_chk   check (last_seen_at >= started_at)
);

comment on table public.activity_sessions is
  'Faz 4.8 (§7c) etkinlik oturumu. IP/user-agent/URL TUTULMAZ. Heartbeat yalnizca last_seen_at''i tazeler; 30 dk hareketsizlik yeni oturum acar. Yazma TEK yoldan: public.record_activity() (SECURITY DEFINER, EXECUTE yalnizca service_role). Okuma: danisan kendi satirlari, koc tumu (aal2 sart).';

comment on column public.activity_sessions.platform is
  'Kapali liste: web | mobile. Cihaz modeli / isletim sistemi / surum TUTULMAZ.';

-- Danışanın kendi geçmişi ve koçun gün özeti, ikisi de kullanıcı + zaman
-- eksenindedir. Purge ise SALT zaman eksenindedir -> ayrı indeks.
create index if not exists activity_sessions_user_last_seen_idx
  on public.activity_sessions (user_id, last_seen_at desc);
create index if not exists activity_sessions_last_seen_idx
  on public.activity_sessions (last_seen_at);

create table if not exists public.activity_events (
  id           uuid        primary key default gen_random_uuid(),
  -- `user_id` oturumdan TÜRETİLEBİLİRDİ ama BİLEREK denormalize edildi: hem
  -- RLS politikası (`user_id = auth.uid()`) alt sorgu olmadan çalışsın hem de
  -- `(user_id, occurred_at)` indeksi tek tabloda kapsanabilsin diye. Tutarlılık
  -- `record_activity()`te ZORLANIR: oturum başka bir kullanıcıya aitse yazma
  -- REDDEDİLİR (§4c) — şema bunu FK ile yakalayamaz.
  user_id      uuid        not null references public.profiles (id)          on delete cascade,
  session_id   uuid        not null references public.activity_sessions (id) on delete cascade,
  event        text        not null,
  -- Yalnızca `tab_view` için anlamlı; kısa bir SEKME ETİKETİDİR (URL değil).
  tab          text,
  duration_sec integer,
  occurred_at  timestamptz not null default now(),

  -- §7c'nin KAPALI LİSTESİ — birebir. Yeni bir olay türü eklemek CHECK'i
  -- genişletmeyi (yani bilinçli bir migration'ı) gerektirir; serbest metne
  -- sessizce dönüşemez. Liste TEK YERDE (burada) yaşar: yazma fonksiyonu
  -- kendi kopyasını tutmaz, geçersiz değeri 23514 olarak geri verir.
  constraint activity_events_event_chk check (
    event in (
      'tab_view',
      'daily_log_submitted',
      'form_check_uploaded',
      'message_sent',
      'ai_generated',
      'login',
      'logout'
    )
  ),
  constraint activity_events_duration_chk check (duration_sec is null or duration_sec >= 0),
  -- Tavan: "olay içeriği tutulmaz" ilkesinin şema seviyesindeki bekçisi.
  constraint activity_events_tab_chk      check (tab is null or char_length(tab) between 1 and 40)
);

comment on table public.activity_events is
  'Faz 4.8 (§7c) etkinlik olayi. Kapali liste: tab_view, daily_log_submitted, form_check_uploaded, message_sent, ai_generated, login, logout. IP/user-agent/olay ICERIGI/URL parametresi TUTULMAZ. Yazma TEK yoldan: public.record_activity(). Okuma: danisan kendi satirlari, koc tumu (aal2 sart) — koc gorunumu GUN hassasiyetindedir (§7c), saat/dakika arayuzde gosterilmez.';

comment on column public.activity_events.tab is
  'Kisa sekme etiketi (<= 40 karakter), yalnizca tab_view icin anlamli. URL, sorgu parametresi veya serbest metin DEGILDIR.';

comment on column public.activity_events.duration_sec is
  'Sekmede gecirilen sure (saniye, >= 0). Heartbeat''ten turetilir.';

-- (user_id, occurred_at) — ZORUNLU indeks: hem danışanın kendi geçmişi hem
-- koçun gün özeti bu eksende sorgulanır.
create index if not exists activity_events_user_occurred_idx
  on public.activity_events (user_id, occurred_at desc);
-- Purge SALT zaman eksenindedir (§5); yukarıdaki bileşik indeks onu veremez.
create index if not exists activity_events_occurred_at_idx
  on public.activity_events (occurred_at);
-- Oturum silinince cascade bu indeksi kullanır; "bu oturumda ne oldu" sorgusu
-- da dilim 3'ün oturum ayrıntısı görünümünün doğal yoludur.
create index if not exists activity_events_session_idx
  on public.activity_events (session_id);


-- #############################################################################
-- ## 3) RLS + YETKİLER + aal2 KAPISI                                         ##
-- #############################################################################
alter table public.activity_sessions enable row level security;
alter table public.activity_sessions force  row level security;
alter table public.activity_events   enable row level security;
alter table public.activity_events   force  row level security;

--    ##########################################################################
--    # GRANT VAR, YAZMA POLİTİKASI YOK — KARAR 2'nin RLS AYAĞI                #
--    #                                                                        #
--    # `rls.test.sql` senaryo 73 POZİTİF KONTROL olarak HER public tablosunda #
--    # `authenticated` için S/I/U/D grant'i ARAR (20260817170000 doktrini:    #
--    # "güvenli ama çalışmayan bir veritabanı üretmeyelim"). Grant'i kesmek o  #
--    # senaryoyu kırar ve istisna listesini büyütür. Bunun yerine grant        #
--    # VERİLİR ama YALNIZCA SELECT politikası yazılır: INSERT/UPDATE/DELETE    #
--    # için POLİTİKA YOKTUR -> RLS + FORCE altında hepsi REDDEDİLİR.          #
--    #                                                                        #
--    # Sonuç: tarayıcı `supabase.from('activity_events').insert(...)` DENESE   #
--    # BİLE 42501 alır. Yazma yolu B-031'in bu yüzeydeki ilk kapanışı olarak   #
--    # SUNUCUDADIR.                                                           #
--    ##########################################################################
grant select, insert, update, delete on public.activity_sessions to authenticated;
grant select, insert, update, delete on public.activity_events   to authenticated;

-- 20260817170000 §1 doktrini: D/x/t hiçbir zaman authenticated/anon'a verilmez.
revoke truncate, references, trigger on public.activity_sessions from authenticated;
revoke truncate, references, trigger on public.activity_events   from authenticated;
revoke all on public.activity_sessions from anon;
revoke all on public.activity_events   from anon;

--    ##########################################################################
--    # `service_role`E DOĞRUDAN TABLO YETKİSİ VERİLMEZ — KARAR 2 (§4 ile)      #
--    # Bugünkü `alter default privileges` hâli zaten böyledir (service_role =  #
--    # Dxtm; a/r/w/d YOK); burada REVOKE ile PEKİŞTİRİLİR ki varsayılan bir    #
--    # gün değişse bile delik açılmasın. Tek yazıcı §4'teki DEFINER fonksiyon. #
--    ##########################################################################
revoke select, insert, update, delete on public.activity_sessions from service_role;
revoke select, insert, update, delete on public.activity_events   from service_role;

--    ##########################################################################
--    # KARAR 3 (FABLE): OKUMA POLİTİKALARI                                     #
--    #                                                                        #
--    # (a) DANIŞAN KENDİ KAYDINI GÖRÜR — §7c'nin açık kararı. Koç görünümüyle  #
--    #     SİMETRİK DEĞİLDİR ve olması da gerekmez: kendi davranış verisine    #
--    #     tam erişim, rızaya dayalı bir izlemenin şeffaflık şartıdır          #
--    #     (KVKK m.11). Danışan ham zaman damgasını görür; koç GÖRMEZ (gün     #
--    #     hassasiyeti dilim 3'ün görünüm sorumluluğudur).                     #
--    #                                                                        #
--    # (b) KOÇ TÜM DANIŞANLARI GÖRÜR — `public.is_coach()`. Tek koçlu model    #
--    #     (ADR-0007) gereği "kendi danışanı" daraltması YOKTUR; repodaki her  #
--    #     danışan tablosu (daily_logs, progress_entries, …) aynı kalıptadır.  #
--    #                                                                        #
--    # (c) `for select` — INSERT/UPDATE/DELETE politikası BİLEREK YOK. Koç     #
--    #     bile bir etkinlik satırını DEĞİŞTİREMEZ/SİLEMEZ: bu denetim         #
--    #     verisidir, düzeltilecek bir kayıt değildir.                        #
--    ##########################################################################
drop policy if exists activity_sessions_select on public.activity_sessions;
create policy activity_sessions_select
  on public.activity_sessions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_coach());

drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select
  on public.activity_events
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_coach());

comment on policy activity_sessions_select on public.activity_sessions is
  'Danisan KENDI oturumlarini (§7c), koc TUMUNU gorur. Yazma politikasi YOKTUR -> INSERT/UPDATE/DELETE reddedilir.';
comment on policy activity_events_select on public.activity_events is
  'Danisan KENDI olaylarini (§7c), koc TUMUNU gorur. Yazma politikasi YOKTUR -> INSERT/UPDATE/DELETE reddedilir.';

--    ##########################################################################
--    # KARAR 3b (FABLE): BU İKİ TABLO aal2 KAPISINA GİRER — 14 -> 16           #
--    #                                                                        #
--    # Koç `aal1`de danışanın davranış verisini (giriş saatleri, çevrimiçi     #
--    # örüntü, hangi sekmede ne kadar kaldığı) GÖREMEMELİ — ADR-0026'nın       #
--    # koruduğu sınıf tam olarak budur ve sürekli davranış verisi tek seferlik #
--    # bir ölçümden daha çok şey söyler.                                       #
--    #                                                                        #
--    # Ayrıca 20260819120000'in sürüklenme kapısı TARAFSIZ KALMAYA İZİN        #
--    # VERMİYOR: yeni bir public tablo ya kapı listesine ya muafiyet listesine #
--    # girmek zorundadır. Muafiyettekilerin ortak özelliği SIFIR POLİTİKA      #
--    # olmalarıdır (account_deletions, coach_actions,                          #
--    # message_attachment_verifications) ya da hiç kullanıcı kolonu            #
--    # taşımamalarıdır (exercises, food_database). Bu iki tablo İKİSİ DE       #
--    # DEĞİL — danışan kendi kaydını OKUYACAK, koçun da gerçek bir okuma       #
--    # politikası VAR. Dolayısıyla muafiyet gerekçesi yoktur.                  #
--    #                                                                        #
--    # 20260819120000 DEĞİŞTİRİLMEZ (salt-eklemeli repo kuralı); AYNI KALIP    #
--    # burada, aynı politika adıyla kurulur. `rls.test.sql` senaryo 131 böylece#
--    # 14 -> 16'ya çıkar; muafiyet listesi DEĞİŞMEZ. Eski migration'ın kendi   #
--    # doğrulaması replay'de KIRILMAZ — o çalıştığında bu tablolar henüz yok.  #
--    #                                                                        #
--    # DANIŞANA ETKİSİ SIFIR (`not is_coach()` dalı; senaryo 130 invaryantı).  #
--    # YAZMA YOLUNA ETKİSİ DE SIFIR: `record_activity()` SECURITY DEFINER'dır  #
--    # ve sahibi `postgres` `rolbypassrls`tir — heartbeat aal'den ETKİLENMEZ.  #
--    ##########################################################################
do $$
declare
  v_table text;
begin
  foreach v_table in array array['activity_sessions', 'activity_events'] loop
    execute format('drop policy if exists mfa_aal2_gate on public.%I', v_table);
    execute format($fmt$
      create policy mfa_aal2_gate on public.%I
        as restrictive
        for all
        to authenticated
        using (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
        with check (
          not (select public.is_coach())
          or (select auth.jwt() ->> 'aal') = 'aal2'
        )
    $fmt$, v_table);

    execute format(
      'comment on policy mfa_aal2_gate on public.%I is %L',
      v_table,
      'ADR-0026 kalibi (Faz 4.8''de 14 -> 16 tabloya genisletildi): koc hesabi icin ikinci faktor zorunlulugu. Danisani ETKILEMEZ (not is_coach() dali). Kaldirilirsa koc, yalnizca parolayla tum danisanlarin davranis profilini okur.'
    );
  end loop;
end
$$;


-- #############################################################################
-- ## 4) YAZMA — public.record_activity(...)  [DİLİM 2'NİN SÖZLEŞMESİ]        ##
-- #############################################################################
--
--    ##########################################################################
--    # KARAR 2 (FABLE): TEK `SECURITY DEFINER` FONKSİYON (upsert).             #
--    # HEARTBEAT AYRI BİR FONKSİYON DEĞİLDİR — heartbeat = OLAYSIZ ÇAĞRI.      #
--    #                                                                        #
--    # Değerlendirilen alternatif: tablolara `service_role` grant'i verip      #
--    # route'un service istemcisiyle `.from('activity_events').insert(...)`.   #
--    # REDDEDİLDİ.                                                            #
--    #                                                                        #
--    # ASIL GEREKÇE HACİM DEĞİL, RIZA KAPISIDIR: rıza kontrolü fonksiyonun     #
--    # İÇİNDE, fail-closed durur. `granted_at` aktif değilse yazma 42501 ile   #
--    # REDDEDİLİR. Böylece "route'ta rıza kontrolü unutulursa ne olur" sorusu  #
--    # HİÇ DOĞMAZ. Aynı şekilde kapalı olay listesi tablo CHECK'i olarak TEK   #
--    # YERDE yaşar; fonksiyon kendi kopyasını tutmaz.                          #
--    #                                                                        #
--    # İkincil kazanç — YÜZEY: doğrudan grant, service key'i taşıyan her şeye  #
--    # bu iki tabloda SINIRSIZ okuma+yazma+silme verirdi; PostgREST üzerinden  #
--    # `activity_events?select=*` tüm danışanların davranış geçmişini dökerdi. #
--    # Burada service_role'ün elindeki tek şey bu fonksiyondur ve fonksiyon    #
--    # OKUMA YAPMAZ — yalnızca ürettiği id'leri döner.                         #
--    #                                                                        #
--    # HACİM KORKUTMASIN: aktif danışan başına saatte ~60 heartbeat (tek       #
--    # satırlık UPDATE) + günde 25-40 olay Postgres için gürültü seviyesidir.  #
--    ##########################################################################
--
--    ##########################################################################
--    # DİLİM 2 İÇİN SÖZLEŞME — TAM İMZA                                        #
--    #                                                                        #
--    #   public.record_activity(                                              #
--    #     p_user_id      uuid,                     -- ZORUNLU                #
--    #     p_platform     text,                     -- ZORUNLU: 'web'|'mobile'#
--    #     p_event        text        default null, -- null => HEARTBEAT      #
--    #     p_session_id   uuid        default null, -- null => yeni oturum    #
--    #     p_tab          text        default null,                          #
--    #     p_duration_sec integer     default null,                          #
--    #     p_occurred_at  timestamptz default null  -- null => now()          #
--    #   ) returns jsonb                                                      #
--    #                                                                        #
--    # DÖNÜŞ: {"session_id": uuid, "event_id": uuid|null,                     #
--    #         "session_started": bool}                                       #
--    #   -> istemci `session_id`i saklar, bir sonraki sinyalde geri gönderir.  #
--    #   -> `session_started` true ise istemcinin elindeki oturum bayatlamış   #
--    #      (ya da hiç yoktu) demektir; yeni id ile devam eder.                #
--    #                                                                        #
--    # HATA KODLARI (route bunları HTTP'ye çevirir):                           #
--    #   42501 -> rıza yok / başkasının oturumu           (403)               #
--    #   22023 -> eksik veya anlamsız parametre           (400)               #
--    #   23514 -> kapalı liste dışı `event` / `platform`  (400)               #
--    #   23503 -> profil yok                             (404/400)            #
--    ##########################################################################
create or replace function public.record_activity(
  p_user_id      uuid,
  p_platform     text,
  p_event        text        default null,
  p_session_id   uuid        default null,
  p_tab          text        default null,
  p_duration_sec integer     default null,
  p_occurred_at  timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- §7c: "30 dk hareketsizlik oturumu bitirir". Kural İSTEMCİDE DEĞİL BURADA
  -- durur; istemcinin saati / uykuya dalan sekmesi bu kararı veremez.
  c_idle       constant interval := interval '30 minutes';
  -- İstemci saatinin makul sapma payı. Dışındaki `occurred_at` REDDEDİLİR:
  -- geleceğe/geçmişe tarihlenmiş satırlar hem gün özetini bozar hem purge
  -- penceresini anlamsızlaştırır.
  c_skew_ahead constant interval := interval '5 minutes';
  c_skew_back  constant interval := interval '1 day';

  v_now      timestamptz := now();
  v_at       timestamptz;
  v_state    text;
  v_owner    uuid;
  v_platform text;
  v_last     timestamptz;
  v_session  uuid;
  v_started  boolean := false;
  v_event_id uuid;
begin
  if p_user_id is null then
    raise exception 'record_activity: p_user_id zorunludur.' using errcode = '22023';
  end if;
  if p_platform is null then
    raise exception 'record_activity: p_platform zorunludur (web | mobile).' using errcode = '22023';
  end if;

  -- --- 4a) RIZA KAPISI — FAIL-CLOSED --------------------------------------
  --     Üç durumun İKİSİ ('undecided' ve 'revoked') yazmayı ENGELLER. Hata
  --     metni durumu AYIRT EDER ki dilim 2 ikisini farklı ele alabilsin:
  --     'undecided' -> rıza akışı açılır; 'revoked' -> istemci sinyal
  --     göndermeyi TAMAMEN bırakmalıdır.
  v_state := public.activity_consent_state(p_user_id);

  if v_state is null then
    raise exception 'record_activity: profil bulunamadi (id=%).', p_user_id using errcode = '23503';
  end if;

  if v_state is distinct from 'granted' then
    raise exception 'record_activity: etkinlik kaydi icin ACIK RIZA yok (durum: %). Hicbir satir yazilmadi.', v_state
      using errcode = '42501';
  end if;

  -- --- 4b) ZAMAN ------------------------------------------------------------
  v_at := coalesce(p_occurred_at, v_now);
  if v_at > v_now + c_skew_ahead then
    raise exception 'record_activity: p_occurred_at GELECEKTE (% > %).', v_at, v_now + c_skew_ahead
      using errcode = '22023';
  end if;
  if v_at < v_now - c_skew_back then
    raise exception 'record_activity: p_occurred_at fazla eski (% < %). Gec kalmis sinyaller kabul edilmez.',
      v_at, v_now - c_skew_back
      using errcode = '22023';
  end if;

  -- --- 4c) OTURUM: bul / bayatladıysa yenile / yoksa aç ---------------------
  if p_session_id is not null then
    select s.user_id, s.platform, s.last_seen_at
      into v_owner, v_platform, v_last
      from public.activity_sessions s
     where s.id = p_session_id;

    if v_owner is null then
      -- Bilinmeyen (ör. purge edilmiş) oturum: hata DEĞİL, yeni oturum açılır.
      v_session := null;
    elsif v_owner <> p_user_id then
      -- ############################################################
      -- # BAŞKASININ OTURUMU — 42501. Bu kapı olmasaydı sunucu      #
      -- # yolundaki tek bir hata (yanlış session_id eşlemesi) bir   #
      -- # danışanın olaylarını BAŞKA bir danışanın oturumuna        #
      -- # bağlardı; `user_id`/`session_id` çifti sessizce           #
      -- # tutarsızlaşırdı ve şema bunu FK ile YAKALAYAMAZDI.        #
      -- ############################################################
      raise exception 'record_activity: oturum baska bir kullaniciya ait (session=%).', p_session_id
        using errcode = '42501';
    elsif v_last < v_now - c_idle or v_platform is distinct from p_platform then
      -- Bayat (30 dk) ya da platform değişti -> ayrı bir oturumdur.
      v_session := null;
    else
      v_session := p_session_id;
    end if;
  end if;

  if v_session is null then
    insert into public.activity_sessions (user_id, started_at, last_seen_at, platform)
    values (p_user_id, v_at, greatest(v_at, v_now), p_platform)
    returning id into v_session;
    v_started := true;
  else
    update public.activity_sessions s
       set last_seen_at = greatest(s.last_seen_at, v_at, v_now)
     where s.id = v_session;
  end if;

  -- --- 4d) OLAY (isteğe bağlı) ---------------------------------------------
  --     `p_event` NULL ise bu çağrı SAF HEARTBEAT'tir: tek UPDATE, sıfır yeni
  --     satır. §2'deki "iki tablo" kararının pratik karşılığı budur.
  if p_event is not null then
    insert into public.activity_events (
      user_id, session_id, event, tab, duration_sec, occurred_at
    )
    values (
      p_user_id, v_session, p_event,
      nullif(btrim(p_tab), ''),   -- boş/boşluk sekme etiketi = etiket yok
      p_duration_sec, v_at
    )
    returning id into v_event_id;
  end if;

  -- --- 4e) TEMBEL SÜPÜRME — KARAR 4'ün GÜVENLİK AĞI ------------------------
  --     ####################################################################
  --     # YALNIZCA OTURUM AÇILIŞINDA (`v_started`), heartbeat'te DEĞİL.     #
  --     # Gerekçe: sistem veri YAZDIĞI sürece purge de çalışır — pg_cron    #
  --     # bir gün kurulmasa, durdurulsa ya da unutulsa bile "süresiz        #
  --     # saklamıyoruz" iddiası AYAKTA kalır. Oturum açılışı seyrektir      #
  --     # (30 dk hareketsizlik başına bir kez), yani bu ek maliyet          #
  --     # heartbeat yoluna BİNMEZ.                                          #
  --     #                                                                  #
  --     # HATA YUTULUR (raise warning): purge bir bakım işidir; başarısız   #
  --     # olması KULLANICININ etkinlik yazmasını KIRMAMALIDIR. Alt blok bir #
  --     # savepoint açar; yukarıdaki INSERT'ler etkilenmez.                  #
  --     ####################################################################
  if v_started then
    begin
      perform public.purge_expired_activity();
    exception when others then
      raise warning 'record_activity: firsatci purge basarisiz (%), etkinlik yazimi ETKILENMEDI.', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'session_id',      v_session,
    'event_id',        v_event_id,
    'session_started', v_started
  );
end;
$$;

comment on function public.record_activity(uuid, text, text, uuid, text, integer, timestamptz) is
  'Faz 4.8 (§7c) etkinlik kaydinin TEK YAZMA YOLU (upsert). Oturumu bulur/tazeler/acar (30 dk bayatlama, platform degisimi yeni oturum) ve p_event doluysa bir olay yazar; p_event NULL ise cagri SAF HEARTBEAT''tir. ACIK RIZA yoksa 42501 ile REDDEDER (fail-closed — route''ta unutulma ihtimali ORTADAN KALKAR). Baskasinin oturumuna yazilamaz. Oturum acilisinda firsatci purge tetikler. SECURITY DEFINER, search_path pinli; EXECUTE yalnizca service_role''dedir — tarayici cagiramaz (B-031).';

revoke all     on function public.record_activity(uuid, text, text, uuid, text, integer, timestamptz) from public;
revoke all     on function public.record_activity(uuid, text, text, uuid, text, integer, timestamptz) from anon;
revoke all     on function public.record_activity(uuid, text, text, uuid, text, integer, timestamptz) from authenticated;
grant  execute on function public.record_activity(uuid, text, text, uuid, text, integer, timestamptz) to service_role;


-- #############################################################################
-- ## 5) SAKLAMA — 180 GÜN (purge fonksiyonu + pg_cron)                       ##
-- #############################################################################
--
--    ##########################################################################
--    # FİLTRESİZ `delete` YASAK — VE BU ŞEMA SEVİYESİNDE GARANTİ EDİLİR        #
--    # Her iki `delete` de `< v_cutoff` şartı taşır. `p_retention_days` için   #
--    # ALT SINIR 1'dir: `purge_expired_activity(0)` bir "hepsini sil" kısayolu #
--    # OLAMAZ, 22023 ile reddedilir. Bu, elle yanlış çağrının en olası         #
--    # biçimine karşı kurulmuş bir kapıdır.                                    #
--    ##########################################################################
create or replace function public.purge_expired_activity(p_retention_days integer default 180)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff   timestamptz;
  v_events   integer;
  v_sessions integer;
begin
  if p_retention_days is null or p_retention_days < 1 then
    raise exception 'purge_expired_activity: p_retention_days >= 1 olmalidir (gelen: %). "Hepsini sil" bir saklama politikasi degildir.',
      p_retention_days
      using errcode = '22023';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  -- Önce olaylar (`occurred_at` ekseninde).
  delete from public.activity_events e where e.occurred_at < v_cutoff;
  get diagnostics v_events = row_count;

  -- Sonra oturumlar (`last_seen_at` ekseninde). `not exists` kapısı, saklama
  -- penceresi İÇİNDE kalmış bir olayın oturum CASCADE'i ile SESSİZCE gitmesini
  -- engeller. Bugünkü şemada `occurred_at <= last_seen_at` olduğu için bu dal
  -- pratikte boştur; yine de fail-closed bırakıldı — cascade ile veri silmek,
  -- silme ölçütünü ikinci bir tabloya devretmek demektir.
  delete from public.activity_sessions s
   where s.last_seen_at < v_cutoff
     and not exists (select 1 from public.activity_events e where e.session_id = s.id);
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'retention_days',   p_retention_days,
    'cutoff',           v_cutoff,
    'events_deleted',   v_events,
    'sessions_deleted', v_sessions
  );
end;
$$;

comment on function public.purge_expired_activity(integer) is
  'Faz 4.8 (§7c): 180 gunden eski etkinlik kaydini siler (varsayilan 180). Her iki DELETE de zaman FILTRELIDIR; p_retention_days < 1 reddedilir (22023) — filtresiz silme mumkun degildir. Iki tetikleyicisi vardir: pg_cron job (birincil) ve record_activity() icindeki firsatci cagri (guvenlik agi). SECURITY DEFINER; EXECUTE yalnizca service_role.';

revoke all     on function public.purge_expired_activity(integer) from public;
revoke all     on function public.purge_expired_activity(integer) from anon;
revoke all     on function public.purge_expired_activity(integer) from authenticated;
grant  execute on function public.purge_expired_activity(integer) to service_role;

--    ##########################################################################
--    # KARAR 4 (FABLE): pg_cron BİRİNCİL + YAZMA YOLUNA ASILI TEMBEL SÜPÜRME.  #
--    # ELLE / CI TETİKLİ PURGE REDDEDİLDİ.                                     #
--    #                                                                        #
--    # CANLI ÖLÇÜM (bu migration yazılırken, yerel yığında):                   #
--    #   select * from pg_available_extensions where name = 'pg_cron';         #
--    #     -> pg_cron | 1.6.4 | installed_version = NULL   (MEVCUT, kurulu değil)
--    #   show shared_preload_libraries;                                        #
--    #     -> ..., pg_cron, pg_net, ...                    (ÖN YÜKLÜ)          #
--    #   select current_setting('cron.database_name', true);  -> postgres      #
--    # Yani `create extension pg_cron` YAPILABİLİR -> job KURULUR.             #
--    #                                                                        #
--    # NEDEN ELLE/CI TETİĞİ REDDEDİLDİ: unutulur; ve daha kötüsü, service      #
--    # key'ini GitHub secrets'a taşırdı — repo doktrini o anahtarın yüzeyini   #
--    # BİLEREK dar tutuyor (ADR-0025 §8, /api/* Bearer yolu).                  #
--    #                                                                        #
--    # KOŞULA BAĞLI KURULUM: ön yükleme yoksa `create extension pg_cron`       #
--    # "can only be loaded via shared_preload_libraries" ile PATLAR ve         #
--    # migration'ı kırardı. O durumda blok GÜRÜLTÜLÜ BİR NOTICE bırakır;       #
--    # purge FONKSİYONU her hâlükârda kurulur ve tembel süpürme (§4e) devrede  #
--    # kalır. §7 doğrulaması ise "pg_cron KURULU ama job YOK" durumunu         #
--    # EXCEPTION ile reddeder — sessiz yarım kurulum olamaz.                   #
--    #                                                                        #
--    # SAAT: 03:17 UTC. Yuvarlak olmayan bir dakika, "her şey 03:00'te başlar" #
--    # yığılmasından kaçınmak içindir. Purge idempotenttir; kaçırılan bir koşu #
--    # ertesi gün telafi edilir.                                               #
--    ##########################################################################
do $$
declare
  v_jobid bigint;
begin
  if coalesce(current_setting('shared_preload_libraries', true), '') not like '%pg_cron%' then
    raise notice 'pg_cron shared_preload_libraries icinde YOK -> zamanlayici KURULMADI. purge_expired_activity(180) kuruldu ve record_activity() oturum acilislarinda firsatci olarak cagiriyor (§4e).';
    return;
  end if;

  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron bu sunucuda MEVCUT DEGIL -> zamanlayici KURULMADI. Firsatci purge (§4e) devrede.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- pg_cron 1.4+ : ADLANDIRILMIŞ job UPSERT'tir -> ikinci koşu ikinci job
  -- ÜRETMEZ (bu dosyanın idempotanslık sözleşmesi).
  -- `execute` ZORUNLU: `cron` şeması bu bloğun İÇİNDE yaratılıyor; statik bir
  -- referans plpgsql derlemesinde çözülemeyebilirdi.
  execute format(
    'select cron.schedule(%L, %L, %L)',
    'activity_log_purge_daily',
    '17 3 * * *',
    'select public.purge_expired_activity(180);'
  ) into v_jobid;

  raise notice 'pg_cron job kuruldu: activity_log_purge_daily (17 3 * * *, jobid=%) -> purge_expired_activity(180)', v_jobid;
end
$$;


-- #############################################################################
-- ## 6) HESAP SİLME İLE ETKİLEŞİM — manifest 15 -> 17                        ##
-- #############################################################################
--
--    ##########################################################################
--    # NEDEN AYNI MIGRATION'DA VE NEDEN ZORUNLU                                #
--    # `delete_account()` FAIL-CLOSED'dır: silmeden SONRA manifest'i YENİDEN   #
--    # ölçer ve `row_total <> 0` ise TÜM transaksiyonu geri sarar              #
--    # (20260819100000 §3e). İki yeni tablo `profiles`e CASCADE ile bağlıdır,  #
--    # yani satırlar GERÇEKTEN gider — ama manifest onları SAYMAZSA bu gerçek  #
--    # DOĞRULANMAMIŞ kalır: before/after karşılaştırması tabloyu hiç GÖRMEZ.   #
--    # Dahası, bir gün bu FK'lerden biri CASCADE olmaktan çıkarsa hesap silme  #
--    # SESSİZCE eksik kalır. Manifest'e eklemek, o günün GÜRÜLTÜLÜ patlamasını #
--    # garanti eder.                                                          #
--    #                                                                        #
--    # `delete_account()`in MANTIĞI DEĞİŞMEZ (tablo adı enumere etmez,         #
--    # manifest'in `row_total`una güvenir); yine de CREATE OR REPLACE ile      #
--    # yeniden yayınlanır ki doc-comment ("15 tablo" -> "17 tablo") kod ile    #
--    # SENKRON kalsın — 20260819130000'in yaptığının aynısı.                   #
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

  -- --- (a) 17 tablonun satır sayıları --------------------------------------
  --     Sıra ŞEMA SIRASI değil OKUMA SIRASIDIR (kimlik -> iletişim -> günlük
  --     -> plan -> ilerleme -> denetim -> etkinlik). `coach_actions` FAZ
  --     4.7'de (15.), `activity_sessions` / `activity_events` FAZ 4.8'de
  --     (16./17.) eklendi.
  select jsonb_build_object(
    'profiles',               (select count(*) from public.profiles      where id        = p_user_id),
    'notifications',          (select count(*) from public.notifications where client_id = p_user_id),
    -- `messages` ÜÇ ayrı kolondan da bağlıdır (client_id = konuşma anahtarı,
    -- sender_id, receiver_id) ve ÜÇÜ DE CASCADE'dir.
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
    'coach_actions',          (select count(*) from public.coach_actions     where target_id = p_user_id),
    -- FAZ 4.8: etkinlik kaydı. `activity_events` oturum üzerinden DE bağlıdır
    -- (session_id CASCADE) ama sayım `user_id` üzerindendir — denormalize kolon
    -- tam da bunun için var (§2) ve `record_activity()` tutarlılığını zorluyor.
    'activity_sessions',      (select count(*) from public.activity_sessions where user_id  = p_user_id),
    'activity_events',        (select count(*) from public.activity_events   where user_id  = p_user_id)
  ) into v_rows;

  select coalesce(sum(value::bigint), 0) into v_total from jsonb_each_text(v_rows);

  -- --- (b) storage nesneleri, bucket başına yol listesi ---------------------
  --     (20260819100000 §2b ile BİREBİR AYNI — DEĞİŞMEDİ. Etkinlik kaydının
  --      storage'da HİÇBİR nesnesi yoktur: dosya üretmez.)
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
  'Bir hesabin silinmesiyle gidecek olanin OLCUMU: 17 tablodaki satir sayilari (Faz 4.7''de coach_actions, Faz 4.8''de activity_sessions + activity_events eklendi) + bucket basina storage nesne yollari. Salt okuma. SECURITY DEFINER (auth.users + storage.objects okur) ama EXECUTE YALNIZCA service_role''dedir — authenticated cagiramaz.';

revoke all     on function public.account_deletion_manifest(uuid) from public;
revoke all     on function public.account_deletion_manifest(uuid) from anon;
revoke all     on function public.account_deletion_manifest(uuid) from authenticated;
grant  execute on function public.account_deletion_manifest(uuid) to service_role;


-- `delete_account()` mantığı DEĞİŞMEDİ (tablo adı enumere etmez, manifest'in
-- row_total'ına güvenir) — CREATE OR REPLACE yalnızca doc-comment'i "15" ->
-- "17" olarak günceller ki kod ile yorum SÜRÜKLENMESİN.
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

  -- --- 3d) AUTH KULLANICISI --> CASCADE ile 17 TABLO ------------------------
  delete from auth.users u where u.id = p_user_id;
  get diagnostics v_deleted = row_count;

  if v_deleted is distinct from 1 then
    raise exception 'delete_account: auth kullanıcısı silinemedi (id=%, etkilenen satır=%).', p_user_id, v_deleted
      using errcode = '42501';
  end if;

  -- --- 3e) KANIT: geriye HİÇBİR satır kalmamalı (etkinlik kaydı dahil) ------
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
  'KVKK hesap silme (B-042 / AC-4.6.1): auth kullanicisini siler; 17 public tablo FK CASCADE ile (Faz 4.7''de coach_actions, Faz 4.8''de activity_sessions + activity_events eklendi), storage nesneleri sunucu yolunda ONCE silinir; kisisel veri icermeyen denetim satiri yazilir. TEK TRANSAKSIYON. Idempotenttir. Koc hesabi REDDEDILIR (ADR-0007). EXECUTE yalnizca service_role''dedir.';

revoke all     on function public.delete_account(uuid, uuid, integer) from public;
revoke all     on function public.delete_account(uuid, uuid, integer) from anon;
revoke all     on function public.delete_account(uuid, uuid, integer) from authenticated;
grant  execute on function public.delete_account(uuid, uuid, integer) to service_role;


-- #############################################################################
-- ## 7) MIGRATION'IN KENDİ DOĞRULAMASI — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_tbl      text;
  v_sig      text;
  v_secdef   boolean;
  v_config   text[];
  v_pol      int;
  v_manifest jsonb;
  v_keys     int;
  v_cols     text;
  v_cnt      int;
begin
  -- (a) İki tablo da var; RLS + FORCE açık.
  foreach v_tbl in array array['activity_sessions', 'activity_events'] loop
    if to_regclass(format('public.%I', v_tbl)) is null then
      raise exception 'DOGRULAMA BASARISIZ: public.% olusmadi.', v_tbl;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = v_tbl
         and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'DOGRULAMA BASARISIZ: public.% tablosunda RLS/FORCE acik degil.', v_tbl;
    end if;

    -- (b) YAZMA POLİTİKASI OLMAMALI (aal2 kapısı ALL'dur, o hariç tutulur).
    select count(*) into v_pol from pg_policies
     where schemaname = 'public' and tablename = v_tbl
       and cmd <> 'SELECT' and policyname <> 'mfa_aal2_gate';
    if v_pol <> 0 then
      raise exception 'DOGRULAMA BASARISIZ: public.% uzerinde % adet YAZMA politikasi var -- tarayici dogrudan yazabilir hale gelmis (B-031).', v_tbl, v_pol;
    end if;

    -- (c) aal2 kapısı GERÇEKTEN kurulmuş ve doğru biçimde (KARAR 3b).
    if not exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = v_tbl
         and p.policyname = 'mfa_aal2_gate'
         and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
         and p.roles      = '{authenticated}'::name[]
         and p.qual       like '%is_coach%' and p.qual       like '%aal2%'
         and p.with_check like '%is_coach%' and p.with_check like '%aal2%'
    ) then
      raise exception 'DOGRULAMA BASARISIZ: public.% uzerinde mfa_aal2_gate EKSIK/BOZUK -- koc aal1 ile davranis profilini okuyabilir.', v_tbl;
    end if;

    -- (d) `authenticated` S/I/U/D var (senaryo 73 pozitif kontrolu), D/x/t YOK.
    if not (has_table_privilege('authenticated', format('public.%I', v_tbl), 'SELECT')
        and has_table_privilege('authenticated', format('public.%I', v_tbl), 'INSERT')
        and has_table_privilege('authenticated', format('public.%I', v_tbl), 'UPDATE')
        and has_table_privilege('authenticated', format('public.%I', v_tbl), 'DELETE')) then
      raise exception 'DOGRULAMA BASARISIZ: public.% uzerinde authenticated S/I/U/D grant i EKSIK -- rls.test senaryo 73 kirilir.', v_tbl;
    end if;
    if has_table_privilege('authenticated', format('public.%I', v_tbl), 'TRUNCATE')
       or has_table_privilege('authenticated', format('public.%I', v_tbl), 'REFERENCES')
       or has_table_privilege('authenticated', format('public.%I', v_tbl), 'TRIGGER') then
      raise exception 'DOGRULAMA BASARISIZ: public.% uzerinde authenticated icin D/x/t ACIK.', v_tbl;
    end if;

    -- (e) `service_role` DOĞRUDAN tablo yetkisi ALMAMALI (KARAR 2).
    if has_table_privilege('service_role', format('public.%I', v_tbl), 'SELECT')
       or has_table_privilege('service_role', format('public.%I', v_tbl), 'INSERT') then
      raise exception 'DOGRULAMA BASARISIZ: public.% service_role a DOGRUDAN acilmis -- PostgREST uzerinden tum danisanlarin davranis gecmisi okunabilir.', v_tbl;
    end if;

    -- (f) `profiles`e FK CASCADE (hesap silme buna GÜVENİYOR).
    if not exists (
      select 1 from pg_constraint c
       where c.conrelid    = format('public.%I', v_tbl)::regclass
         and c.contype     = 'f'
         and c.confrelid   = 'public.profiles'::regclass
         and c.confdeltype = 'c'
    ) then
      raise exception 'DOGRULAMA BASARISIZ: public.%.user_id -> profiles FK si CASCADE degil -- hesap silme FAIL-CLOSED patlar.', v_tbl;
    end if;
  end loop;

  -- (g) `(user_id, occurred_at)` indeksi ZORUNLU (görev sözleşmesi).
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'activity_events'
       and indexname = 'activity_events_user_occurred_idx'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: activity_events (user_id, occurred_at) indeksi YOK.';
  end if;

  -- (h) Kolon sözleşmesi — "IP/user-agent/icerik tutulmaz" iddiasının ÖLÇÜMÜ.
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'activity_events';
  if v_cols is distinct from 'duration_sec,event,id,occurred_at,session_id,tab,user_id' then
    raise exception 'DOGRULAMA BASARISIZ: activity_events kolonlari beklenenden farkli -> %. (IP/user-agent/icerik kolonu eklenmis olabilir.)', v_cols;
  end if;
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'activity_sessions';
  if v_cols is distinct from 'id,last_seen_at,platform,started_at,user_id' then
    raise exception 'DOGRULAMA BASARISIZ: activity_sessions kolonlari beklenenden farkli -> %.', v_cols;
  end if;

  -- (i) Fonksiyonlar: SECURITY DEFINER + pinli search_path + EXECUTE yalnizca service_role.
  foreach v_sig in array array[
    'public.record_activity(uuid, text, text, uuid, text, integer, timestamp with time zone)',
    'public.purge_expired_activity(integer)',
    'public.grant_activity_consent(uuid, integer)',
    'public.revoke_activity_consent(uuid)'
  ] loop
    select p.prosecdef, p.proconfig into v_secdef, v_config
      from pg_proc p where p.oid = v_sig::regprocedure;

    if v_secdef is null then
      raise exception 'DOGRULAMA BASARISIZ: % olusmadi.', v_sig;
    end if;
    if not v_secdef then
      raise exception 'DOGRULAMA BASARISIZ: % SECURITY INVOKER olmus -- sifir yazma politikali tabloya yazamaz.', v_sig;
    end if;
    if v_config is null or not (v_config @> array['search_path=public, pg_temp']) then
      raise exception 'DOGRULAMA BASARISIZ: % arama yolu pinlenmemis (%).', v_sig, v_config;
    end if;
    if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      raise exception 'DOGRULAMA BASARISIZ: % AUTHENTICATED rolune ACIK -- tarayici dogrudan yazabilir/riza damgasi uretebilir.', v_sig;
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception 'DOGRULAMA BASARISIZ: % ANON rolune ACIK.', v_sig;
    end if;
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      raise exception 'DOGRULAMA BASARISIZ: service_role % yi CALISTIRAMIYOR -- sunucu yolu kirilir.', v_sig;
    end if;
  end loop;

  -- (j) `activity_consent_state()` SECURITY INVOKER OLMAK ZORUNDA (§1a).
  --     DEFINER olsaydi her danisan BASKA bir danisanin riza durumunu yoklardi.
  select p.prosecdef into v_secdef
    from pg_proc p where p.oid = 'public.activity_consent_state(uuid)'::regprocedure;
  if v_secdef is null then
    raise exception 'DOGRULAMA BASARISIZ: public.activity_consent_state(uuid) olusmadi.';
  end if;
  if v_secdef then
    raise exception 'DOGRULAMA BASARISIZ: activity_consent_state SECURITY DEFINER olmus -- baskasinin riza durumu yoklanabilir.';
  end if;

  -- (k) Rıza kolonlari + kisitlar + son kullanici kapisi.
  select count(*) into v_cnt
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('activity_consent_granted_at', 'activity_consent_revoked_at', 'activity_consent_version');
  if v_cnt <> 3 then
    raise exception 'DOGRULAMA BASARISIZ: profiles riza kolonlari EKSIK (bulunan %/3).', v_cnt;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_activity_consent_version_pair_chk'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: profiles_activity_consent_version_pair_chk YOK -- "hangi metni onayladigi bilinmeyen" riza uretilebilir.';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname  = 'profiles_guard_activity_consent'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: profiles_guard_activity_consent trigger i YOK -- istemci riza damgasini kendisi yazabilir.';
  end if;

  -- (l) UC DURUM GERCEKTEN TURETILIYOR MU — canli olcum, varsayim degil.
  if public.activity_consent_state('00000000-0000-0000-0000-000000000000'::uuid) is not null then
    raise exception 'DOGRULAMA BASARISIZ: olmayan profil icin activity_consent_state NULL donmedi.';
  end if;

  -- (m) MANIFEST 17 ANAHTAR — canlı çağrıyla ölçülür, varsayılmaz.
  v_manifest := public.account_deletion_manifest(gen_random_uuid());
  if not (v_manifest -> 'rows' ? 'activity_sessions') then
    raise exception 'DOGRULAMA BASARISIZ: account_deletion_manifest() activity_sessions anahtarini DONDURMUYOR -- hesap silme bu tabloyu KAPSAMAZ.';
  end if;
  if not (v_manifest -> 'rows' ? 'activity_events') then
    raise exception 'DOGRULAMA BASARISIZ: account_deletion_manifest() activity_events anahtarini DONDURMUYOR.';
  end if;
  select count(*) into v_keys from jsonb_object_keys(v_manifest -> 'rows');
  if v_keys <> 17 then
    raise exception 'DOGRULAMA BASARISIZ: manifest 17 tablo saymali, % sayiyor.', v_keys;
  end if;

  -- (n) ZAMANLAYICI: pg_cron KURULU ise job MUTLAKA olmali (KARAR 4).
  --     "Yarim kurulum" (extension var, job yok) SESSIZCE gecemez.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select count(*) from cron.job where jobname = ''activity_log_purge_daily'''
       into v_cnt;
    if v_cnt <> 1 then
      raise exception 'DOGRULAMA BASARISIZ: pg_cron KURULU ama activity_log_purge_daily job u YOK (bulunan %) -- 180 gunluk saklama zamanlayicisi eksik.', v_cnt;
    end if;
    raise notice 'pg_cron job DOGRULANDI: activity_log_purge_daily';
  else
    raise notice 'pg_cron KURULU DEGIL -> zamanlayici yok; saklama siniri record_activity() icindeki firsatci purge (§4e) ile ayakta.';
  end if;

  raise notice 'Faz 4.8 dilim 1 kuruldu: activity_sessions + activity_events (RLS+FORCE, yalnizca SELECT politikasi, aal2 kapisi 14 -> 16), record_activity() tek yazma yolu, riza uc durumlu (grant/revoke sunucu yolundan; revoke = durdur + SIL), purge_expired_activity(180), manifest 15 -> 17.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI 1: Geri alma §7c'yi TAMAMEN kapatır — dilim 2'nin `POST /api/activity`
-- -- ucu ve dilim 3'ün rıza akışı + iki görünümü PGRST202 / 42P01 ile kırılır.
-- -- Onlar da geri alınmalıdır.
-- --
-- -- UYARI 2 — TABLOLARI DÜŞÜRÜRSENİZ `account_deletion_manifest()` ve
-- -- `delete_account()` bu dosyadaki CREATE OR REPLACE ile activity_* tablolarına
-- -- REFERANS VERİR HÂLDE KALIR; tablolar gerçekten düşürülürse bu iki fonksiyon
-- -- "relation does not exist" ile KIRILIR ve HESAP SİLME AKIŞININ TAMAMI DURUR.
-- -- Tabloları düşürüyorsanız AYNI TRANSAKSİYONDA
-- -- `20260819130000_coach_action_audit.sql` §3'teki (15 tablolu) gövdeleri
-- -- CREATE OR REPLACE ile geri yükleyin.
-- --
-- -- UYARI 3: `activity_*` satırları RIZAYA DAYALI olarak toplanmıştır; düşürmek
-- -- VERİ KAYBIDIR (ama KVKK açısından zararsızdır — fazla veri saklamaktan
-- -- iyidir). Rıza kolonlarını düşürmek ise KULLANICININ VERDİĞİ ONAYIN
-- -- KANITINI siler; geri alma sonrası rıza SIFIRDAN alınmalıdır.
-- =============================================================================
--
-- begin;
--
-- -- 1) Zamanlayıcı
-- select cron.unschedule('activity_log_purge_daily');
-- -- (pg_cron extension'ı BIRAKILIR: başka bir job kullanıyor olabilir.)
--
-- -- 2) Fonksiyonlar
-- drop function if exists public.record_activity(uuid, text, text, uuid, text, integer, timestamptz);
-- drop function if exists public.purge_expired_activity(integer);
-- drop function if exists public.revoke_activity_consent(uuid);
-- drop function if exists public.grant_activity_consent(uuid, integer);
-- drop function if exists public.activity_consent_state(uuid);
--
-- -- 3) aal2 kapısı (yalnızca bu iki tabloda; diğer 14'e DOKUNMAZ)
-- drop policy if exists mfa_aal2_gate on public.activity_events;
-- drop policy if exists mfa_aal2_gate on public.activity_sessions;
--
-- -- 4) Rıza kapısı
-- drop trigger  if exists profiles_guard_activity_consent on public.profiles;
-- drop function if exists public.profiles_guard_activity_consent();
--
-- -- 5) Tablolar (bkz. UYARI 2 — önce manifest/delete_account'u geri yükleyin!)
-- -- drop table if exists public.activity_events;     -- VERİ KAYBI — bilinçli olarak yorumlu
-- -- drop table if exists public.activity_sessions;   -- VERİ KAYBI — bilinçli olarak yorumlu
--
-- -- 6) Rıza kolonları
-- -- alter table public.profiles drop constraint if exists profiles_activity_consent_version_pair_chk;
-- -- alter table public.profiles drop constraint if exists profiles_activity_consent_version_chk;
-- -- alter table public.profiles drop column if exists activity_consent_version;
-- -- alter table public.profiles drop column if exists activity_consent_revoked_at;
-- -- alter table public.profiles drop column if exists activity_consent_granted_at;
--
-- commit;
--
-- =============================================================================
