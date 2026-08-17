-- =============================================================================
-- 20260817160200_column_guards.sql
--
-- FAZ 1.5 / GÜVENLİK — SÜTUN BAZLI SUNUCU SÖZLEŞMELERİ:
--   AC-04 (Medium) — mesaj alıcısı gövdeyi / `kind` / `created_at` değiştirebiliyor
--   AC-05 (Medium) — danışan koçun bildirim akışına KEYFİ metin yazabiliyor
--   AC-08 (Low)    — danışan `current_streak` / `last_checkin_at` yazabiliyor
--   AC-09 (Low)    — danışan `profiles.email`'i `auth.users`'tan desenkronize edebiliyor
--   AC-10 (Low)    — danışan kendi bildiriminin metnini değiştirebiliyor
--
-- ############ HEPSİNİN ORTAK KÖKÜ ####################################
-- Postgres'te RLS SATIR bazlıdır; POLİTİKAYA SÜTUN LİSTESİ VERİLEMEZ.
-- `messages_update_receiver`, `notifications_update` ve `profiles_update_self`
-- politikalarının hepsi "bu satıra dokunabilir misin?" sorusunu doğru cevaplıyor
-- ama "bu satırın HANGİ SÜTUNUNA dokunabilirsin?" sorusunu hiç sormuyor.
--
-- İki gerçek seçenek vardı:
--   A) UPDATE'i tamamen kapatmak -> okundu işaretleme, avatar güncelleme gibi
--      MEŞRU akışlar kırılırdı (regresyon).
--   B) Sütun bazlı kontrolü BEFORE trigger'ına taşımak.
-- (B) seçildi — `form_checks_guard_review()` (20260817150000 §6) ile AYNI DESEN.
-- Trigger 42501 (insufficient_privilege) ile reddeder; PostgREST bunu 403'e
-- çevirir, yani istemci "yasak" cevabını doğru HTTP koduyla alır.
-- #####################################################################
--
-- Idempotenttir: `create or replace function`, `drop trigger if exists` +
-- `create trigger`. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0) public.is_end_user_write() — "bu yazma bir SON KULLANICI isteği mi?"
--
--    ##########################################################################
--    # NEDEN auth.uid() TEK BAŞINA YETMİYOR                                   #
--    #                                                                        #
--    # `form_checks_guard_review()` "auth.uid() IS NULL ise çekil" der ve bu   #
--    # ORADA doğrudur: form_checks'e yazan hiçbir SECURITY DEFINER fonksiyon   #
--    # yoktur, yani auth.uid() dolu demek "PostgREST üzerinden gelen istemci"  #
--    # demektir.                                                              #
--    #                                                                        #
--    # `profiles` için bu YETMEZ: `increment_streak()` ve `sync_profile_email()`#
--    # SECURITY DEFINER'dır ama KULLANICININ OTURUMUNDA çalışır — auth.uid()   #
--    # onların içinde de DOLUDUR (request.jwt.claims bir oturum GUC'udur,      #
--    # SECURITY DEFINER onu değiştirmez). Sadece auth.uid()'e baksaydık, §3'ün #
--    # sütun sabitlemesi `increment_streak()` RPC'sini de ENGELLERDİ.          #
--    #                                                                        #
--    # SEÇİLEN MEKANİZMA: `current_user`.                                      #
--    #   * PostgREST istemcisi     -> SET ROLE authenticated -> current_user =  #
--    #     'authenticated'                                                     #
--    #   * postgres'e ait bir SECURITY DEFINER fonksiyonun İÇİ -> current_user =#
--    #     'postgres'  (session_user hâlâ 'authenticated' kalır)               #
--    #   * seed / migration / psql -> current_user = 'postgres'                 #
--    #   * service_role            -> current_user = 'service_role'             #
--    #                                                                        #
--    # Canlı doğrulama (bu migration yazılmadan önce ölçüldü):                 #
--    #   set local role authenticated;                                         #
--    #   select current_user, session_user, <definer_fn>();                     #
--    #   -> authenticated | postgres | postgres/postgres                        #
--    #                                                                        #
--    # NEDEN OTURUM DEĞİŞKENİ (set_config('app.bypass', …, true)) SEÇİLMEDİ:   #
--    #   Özel GUC'lar REZERVE DEĞİLDİR; `authenticated` rolü de `SET LOCAL     #
--    #   app.bypass = 'on'` çalıştırabilir. Bugün PostgREST ham SQL            #
--    #   çalıştırmadığı için sömürülemez, ama korumanın kendisi bir BAYRAK'a   #
--    #   dayanır ve tek bir SQL enjeksiyonu / dinamik SQL kullanan yeni bir    #
--    #   RPC onu kaldırır. `current_user` ise ROLE SİSTEMİNİN kendisidir:      #
--    #   taklit etmek için zaten `postgres` olmak gerekir — o noktada koruma   #
--    #   zaten anlamsızdır. Yani bu, GUC bayrağının aksine SAHTELENEMEZ bir    #
--    #   ayrımdır.                                                             #
--    #                                                                        #
--    # NEDEN pg_trigger_depth() SEÇİLMEDİ: `increment_streak()` bir TRIGGER    #
--    # DEĞİL, bir RPC'dir; onu çağırdığında derinlik hâlâ 0'dır. Ölçtüğü şey   #
--    # bu problemle ilgisizdir.                                                #
--    #                                                                        #
--    # !!! SECURITY INVOKER OLMAK ZORUNDA !!!                                  #
--    # Bu fonksiyon SECURITY DEFINER yapılırsa `current_user` İÇERİDE HER      #
--    # ZAMAN 'postgres' olur ve fonksiyon HER ZAMAN false döner — yani tüm     #
--    # korumalar sessizce kapanır. DEĞİŞTİRMEYİN.                              #
--    ##########################################################################
-- -----------------------------------------------------------------------------
create or replace function public.is_end_user_write()
returns boolean
language sql
stable
security invoker   -- KRİTİK: bkz. yukarıdaki uyarı. DEFINER yapmayın.
set search_path = public, pg_temp
as $$
  select current_user = 'authenticated' and auth.uid() is not null;
$$;

comment on function public.is_end_user_write()
  is 'Yazma isteği PostgREST üzerinden gelen bir SON KULLANICI isteği mi? (current_user = authenticated + auth.uid() dolu). Sütun koruma trigger''ları bunu kullanır; SECURITY DEFINER RPC''ler (increment_streak, sync_profile_email) ve seed/service_role false alır. SECURITY INVOKER OLMAK ZORUNDADIR.';

revoke all     on function public.is_end_user_write() from public;
grant  execute on function public.is_end_user_write() to authenticated, service_role;


-- =============================================================================
-- 1) AC-04 — public.messages SÜTUN KORUMASI
--
-- BULGU (findings §3.4): `messages_update_receiver` politikası satır seviyesinde
--   (`receiver_id = auth.uid()`), sütun kısıtı YOK. Canlı kanıt M1/M5: alıcı
--   kendisine gelen mesajın `message` gövdesini, `kind` ve `created_at`
--   alanlarını değiştirebiliyor (etkilenen=3). `messages` tablosunda `edited_at`
--   YOKTUR — karşı taraf tahrif edilmiş metni ORİJİNAL SANIR. M4: danışan
--   `kind='system'` mesaj üretebiliyor.
--
-- SÖZLEŞME:
--   UPDATE -> son kullanıcı YALNIZCA `read_at` ve `is_read` değiştirebilir.
--             Diğer TÜM sütunlar (id, sender_id, receiver_id, message,
--             created_at, client_id, kind) eski değerinde kalmalıdır.
--   INSERT -> son kullanıcı `kind = 'system'` ÜRETEMEZ.
--
-- KOÇ DA DAHİL — BİLİNÇLİ: `form_checks` deseninde koç yolu serbesttir, burada
--   DEĞİL. Gerekçe: form_checks'te koç YETKİLİ AKTÖRDÜR (inceleme onun işidir);
--   mesaj gövdesinde ise "yetkili tahrifat" diye bir şey yoktur — koçun danışanın
--   yazdığı mesajı değiştirebilmesi de tam olarak AC-04'ün anlattığı zarardır.
--   `kind='system'` de aynı: 'system' etiketi "bunu UYGULAMA yazdı" demektir
--   (20260817140000 §1); elle yazan bir insan onu üretebilirse etiket yalan söyler.
--   Uygulama üretimi sistem mesajları sunucu tarafından (service_role / trigger)
--   yazılacaktır ve o yolda `is_end_user_write()` false döner -> serbesttir.
--
-- UYGULAMA KODU DOĞRULANDI: `useMarkConversationRead`
--   (src/hooks/useMessages.ts:269-277) YALNIZCA `read_at` + `is_read` yazar;
--   `useSendMessage` (src/hooks/useMessages.ts:192) `kind` GÖNDERMEZ (kolon
--   varsayılanı 'user'). Bu koruma mevcut hiçbir akışı kırmaz.
--
-- TRIGGER SIRASI: aynı tabloda `messages_apply_conversation_key` (BEFORE
--   INSERT/UPDATE) vardır ve trigger'lar AD SIRASINA göre çalışır:
--   'messages_apply_…' < 'messages_guard_…', yani konuşma anahtarı ÖNCE koşar.
--   Bu bilinçli olarak kabul edildi: o trigger yalnızca `client_id` NULL ise
--   yazar ve rol tutarsızlığında 22023 fırlatır. Pratik sonuç, alıcı `sender_id`'yi
--   BOZUK bir değere çekmeye çalışırsa 42501 yerine 22023 almasıdır — her iki
--   durumda da istek REDDEDİLİR, yalnızca hata kodu farklıdır.
-- =============================================================================
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
  if new.id          is distinct from old.id
     or new.sender_id   is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.message     is distinct from old.message
     or new.created_at  is distinct from old.created_at
     or new.client_id   is distinct from old.client_id
     or new.kind        is distinct from old.kind then
    raise exception 'messages: gonderilmis bir mesajin icerigi degistirilemez. Alici yalnizca read_at / is_read alanlarini guncelleyebilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.messages_guard_columns()
  is 'messages sütun koruması (AC-04): son kullanıcı UPDATE''te yalnızca read_at/is_read değiştirebilir, INSERT''te kind=''system'' üretemez (42501). Sunucu bağlamında (is_end_user_write() false) devreye girmez.';

drop trigger if exists messages_guard_columns on public.messages;
create trigger messages_guard_columns
  before insert or update
  on public.messages
  for each row
  execute function public.messages_guard_columns();


-- =============================================================================
-- 2) AC-05 + AC-10 — public.notifications SÜTUN VE İÇERİK KORUMASI
--
-- AC-05 BULGU (findings §3.5): `notifications_insert` politikasının
--   `is_coach_profile(client_id)` dalı danışanın KOÇUN bildirim akışına yazmasına
--   izin verir ve İÇERİK DOĞRULAMASI YOKTUR. Canlı kanıt P3: danışan koça
--   `('ACIL: Sifreni sifirla', 'https://kotu-site.example/reset')` yazabiliyor.
--   Bu bir KİMLİK AVI (phishing) yüzeyidir: metin koçun bildirim listesinde,
--   ürünün kendi sesiyle görünür.
--
-- AC-10 BULGU (findings §3.8, P4): `notifications_update` sütun kısıtı içermez;
--   danışan KENDİ bildiriminin `title`/`message` metnini değiştirebiliyor
--   (etkilenen=3). Koçun duyuru metni danışanın kopyasında tahrif edilir.
--
-- ############ NEDEN TRIGGER, NEDEN SECURITY DEFINER RPC DEĞİL ############
-- İki seçenek değerlendirildi:
--
--   (a) `SECURITY DEFINER` RPC'ye taşımak (`notify_coach_program_submitted()`
--       gibi) + `notifications_insert` politikasından `is_coach_profile(...)`
--       dalını KALDIRMAK. Teknik olarak en temiz sonuç: içerik hiç istemciden
--       gelmez, sunucuda ÜRETİLİR.
--
--   (b) Mevcut `insert` çağrısını olduğu gibi bırakıp içeriği BEFORE INSERT
--       trigger'ında ŞABLONA bağlamak.
--
-- (b) SEÇİLDİ. Belirleyici sebep: bu turda UYGULAMA KODU DEĞİŞTİRİLEMİYOR
-- (`src/**` başka bir ajanın sahipliğinde). (a) yolu `useProgramApprovals.ts:58`
-- satırındaki `supabase.from('notifications').insert({...})` çağrısını ANINDA
-- kırardı — politika dalı kalkar kalkmaz danışanın koça bildirim yazması RLS
-- ihlali verir ve program gönderme akışı tümüyle çalışmaz hâle gelirdi.
-- (b) ise çağrı imzasını hiç bozmaz: bugünkü payload ŞABLONA UYDUĞU İÇİN aynen
-- geçer, ŞABLON DIŞI her şey 42501 alır. Yani güvenlik kazancı bugün elde edilir,
-- (a)'ya geçiş Faz 2'de uygulama koduyla birlikte yapılabilecek bir İYİLEŞTİRME
-- olarak açık kalır.
--
-- (b)'nin BEDELİ, dürüstçe: şablon metni İKİ YERDE yaşar (bu fonksiyon ve
-- `src/hooks/useProgramApprovals.ts`). Uygulama metni değişir de burası
-- güncellenmezse program gönderme akışı 42501 ile KIRILIR — sessiz bir güvenlik
-- açığı değil, GÜRÜLTÜLÜ bir hata olur (tercih edilen yön budur). Aşağıdaki
-- dizinin hemen üstündeki uyarı bu bağı açıkça işaretler.
-- ########################################################################
--
-- KAPSAM — YALNIZCA "DANIŞAN -> KOÇ" YOLU KISITLANIR:
--   * `is_coach()`  (koç yolu)                        -> SERBEST. Duyuru yazmak
--     koçun ürün işlevidir (`useSendNotification`, serbest metin).
--   * `client_id = auth.uid()` (kendine bildirim)     -> SERBEST. Kimse kendi
--     bildirim listesinde kendini kandıramaz; koç bu satırları kendi ekranında
--     GÖRMEZ (`useNotifications` sorgusu `client_id = <oturum sahibi>` filtreler).
--   * danışan -> KOÇ profili                          -> ŞABLON ZORUNLU.
-- =============================================================================
create or replace function public.notifications_guard_content()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- #########################################################################
  -- # UYGULAMA KODUYLA BAĞ — DEĞİŞTİRİRKEN İKİSİNİ BİRLİKTE DEĞİŞTİRİN:     #
  -- #   src/hooks/useProgramApprovals.ts:58-61 (useSubmitProgramForApproval) #
  -- # Danışanın koça yazabildiği TEK bildirim metni budur. `title` HER ZAMAN #
  -- # NULL'dur (uygulama `title` alanını hiç göndermez).                     #
  -- #########################################################################
  c_client_to_coach_messages constant text[] := array[
    '🔔 Yeni bir antrenman programı onayınıza sunuldu.'
  ];
begin
  -- Sunucu bağlamı (service_role / seed / migration): çekil.
  if not public.is_end_user_write() then
    return new;
  end if;

  -- --- 2a) AC-10: UPDATE'te son kullanıcı YALNIZCA `is_read` değiştirebilir --
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

  -- --- 2b) AC-05: INSERT — danışanın KOÇA yazdığı içerik ŞABLONA bağlıdır ---
  if public.is_coach() then
    return new;                        -- koç yolu: serbest metin (duyuru)
  end if;

  if new.client_id = auth.uid() then
    return new;                        -- kendi akışına yazıyor: serbest
  end if;

  if not public.is_coach_profile(new.client_id) then
    -- Hedef ne kendisi ne de bir koç: `notifications_insert` politikasının
    -- HİÇBİR dalı bunu kabul etmez. Reddi RLS'e BIRAKIYORUZ ki hata "row-level
    -- security policy violation" olarak kalsın — mevcut regresyon testi
    -- (rls.test.sql senaryo 13, danışandan danışana spam) tam olarak bunu
    -- doğruluyor ve trigger onun hata sebebini gizlememeli.
    return new;
  end if;

  -- Kalan tek yol: DANIŞAN -> KOÇ. Şablon zorunlu.
  if new.title is not null
     or not (new.message = any (c_client_to_coach_messages)) then
    raise exception 'notifications: danisan koca yalnizca uygulamanin sabit sablon bildirimlerini gonderebilir; serbest metin kabul edilmez.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.notifications_guard_content()
  is 'notifications içerik/sütun koruması: UPDATE''te son kullanıcı yalnızca is_read değiştirebilir (AC-10); danışanın KOÇA yazdığı bildirimin title/message değerleri sabit şablon kümesine uymak zorundadır (AC-05). Koç yolu ve kendine bildirim serbesttir. Şablon dizisi src/hooks/useProgramApprovals.ts ile eşlenik tutulmalıdır.';

drop trigger if exists notifications_guard_content on public.notifications;
create trigger notifications_guard_content
  before insert or update
  on public.notifications
  for each row
  execute function public.notifications_guard_content();


-- =============================================================================
-- 3) AC-08 + AC-09 — public.profiles SUNUCUYA AİT SÜTUNLARIN SABİTLENMESİ
--
-- AC-08 BULGU (findings §3.8, R11): danışan `current_streak`'i doğrudan UPDATE
--   ile 9999 yapabiliyor. `increment_streak()` yetki kontrolü YAPIYOR (R13) ama
--   doğrudan UPDATE yolu açık olduğu için o kontrol ANLAMSIZ.
-- AC-09 BULGU (findings §3.8, P9): danışan `profiles.email`'i keyfi bir değere
--   çekip `auth.users` ile desenkronize edebiliyor; koç panelinde görünen e-posta
--   gerçek hesap e-postası olmayabilir.
--
-- SÖZLEŞME: `email`, `current_streak`, `last_checkin_at` SUNUCUYA AİT sütunlardır.
--   Hiçbir `authenticated` oturumu bunları UPDATE ile yazamaz. Tek yazma
--   kaynakları:
--     email           -> public.sync_profile_email()  (auth.users trigger'ı, DEFINER)
--     current_streak  -> public.increment_streak()    (RPC, DEFINER)
--     last_checkin_at -> public.increment_streak()    (RPC, DEFINER)
--   İkisi de §0'daki `is_end_user_write()` testinden FALSE alır (current_user =
--   'postgres'), yani trigger onları ENGELLEMEZ. Bu, testlerle kanıtlanır
--   (rls.test.sql — "increment_streak RPC HALA calisir" senaryosu).
--
-- KOÇ DA DAHİL — BİLİNÇLİ: findings §2 AC-09 düzeltme önerisi "tek yazma kaynağı
--   `sync_profile_email()` olsun" der; "danışan için tek kaynak" demez. Koçun
--   `profiles_update_coach` ile e-postayı değiştirmesi de aynı desenkronizasyonu
--   üretirdi ve BUNU YAPAN BİR EKRAN YOKTUR. Aynısı streak için geçerli: seriyi
--   elle kurabilen bir koç ekranı yoktur. Kuralı "hiçbir oturum yazamaz" diye
--   ifade etmek hem daha basit hem daha güçlüdür.
--
-- UYGULAMA KODU DOĞRULANDI: `src/**` içinde `profiles` tablosuna yapılan TEK
--   yazma `useProfile.ts:99-101` -> `.update({ avatar_path })`. `full_name`,
--   `nutrition_plan`, `workout_plan`, `avatar_path` sütunları SERBEST kalır.
--   `role` zaten `profiles_update_self` WITH CHECK ile sabittir (W1).
-- =============================================================================
create or replace function public.profiles_guard_server_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Sunucu bağlamı: increment_streak() / sync_profile_email() / seed / migration.
  if not public.is_end_user_write() then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'profiles: e-posta adresi profil uzerinden degistirilemez. Tek kaynak auth.users hesabidir (degisiklik oraya yazilir, sunucu profili esitler).'
      using errcode = '42501';
  end if;

  if new.current_streak is distinct from old.current_streak
     or new.last_checkin_at is distinct from old.last_checkin_at then
    raise exception 'profiles: seri (current_streak / last_checkin_at) dogrudan yazilamaz. Bu alanlar yalnizca increment_streak() RPC si ile guncellenir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_server_columns()
  is 'profiles sütun sabitlemesi (AC-08/AC-09): hiçbir authenticated oturumu email / current_streak / last_checkin_at sütunlarını UPDATE ile yazamaz (42501). increment_streak() ve sync_profile_email() SECURITY DEFINER oldukları için is_end_user_write() false alır ve etkilenmez.';

drop trigger if exists profiles_guard_server_columns on public.profiles;
create trigger profiles_guard_server_columns
  before update
  on public.profiles
  for each row
  execute function public.profiles_guard_server_columns();


-- -----------------------------------------------------------------------------
-- 4) RLS VARSAYIM DOĞRULAMASI — politikalar beklenen hâlinden saparsa UYAR
--     (form_checks §8 ile aynı desen.)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'messages'
       and policyname = 'messages_update_receiver' and qual like '%receiver_id%'
  ) then
    raise warning 'messages_update_receiver politikasi beklenen halinde degil: sutun korumasi (messages_guard_columns) yanlis varsayim uzerine kurulmus olabilir.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
       and policyname = 'notifications_insert' and with_check like '%is_coach_profile%'
  ) then
    raise warning 'notifications_insert politikasi beklenen halinde degil: danisan -> koc sablon zorlamasi (notifications_guard_content) ulasilamaz hale gelmis olabilir.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles'
       and policyname = 'profiles_update_self' and with_check like '%profile_role%'
  ) then
    raise warning 'profiles_update_self politikasi beklenen halinde degil: rol sabitleme (WITH CHECK) kaybolmus olabilir.';
  end if;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Geri alma AC-04 / AC-05 / AC-08 / AC-09 / AC-10 bulgularının
-- -- HEPSİNİ yeniden açar.
-- =============================================================================
--
-- begin;
--
-- drop trigger  if exists profiles_guard_server_columns on public.profiles;
-- drop trigger  if exists notifications_guard_content   on public.notifications;
-- drop trigger  if exists messages_guard_columns        on public.messages;
--
-- drop function if exists public.profiles_guard_server_columns();
-- drop function if exists public.notifications_guard_content();
-- drop function if exists public.messages_guard_columns();
-- drop function if exists public.is_end_user_write();
--
-- commit;
--
-- =============================================================================
