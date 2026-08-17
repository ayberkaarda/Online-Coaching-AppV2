-- =============================================================================
-- 20260817190400_realtime_publication.sql
--
-- FAZ 2b — ŞEMA TAMAMLAMA / 6: REALTIME YAYINI (AC-2.2)
--
-- KAYNAK:
--   §4.4  "Supabase Realtime channel per conversation"
--   §4.4  "Okundu: karşı taraf mesajı görüntüleyince `read_at`"
--   AC-2.2 "İki tarayıcı sekmesi arasında mesaj < 2 sn'de realtime düşer."
--
-- ###########################################################################
-- # BU MIGRATION TAHMİNE DEĞİL, ÖLÇÜME DAYANIYOR                            #
-- #                                                                          #
-- # Yerel yığında (127.0.0.1:54321) GERÇEK Realtime WebSocket bağlantılarıyla#
-- # üç aktör (koç, danışan A, danışan B) oturum açtı, `postgres_changes`     #
-- # kanallarına abone oldu ve `messages` üzerinde INSERT / UPDATE / DELETE   #
-- # tetiklendi. ÖLÇÜLEN (replica identity = 'd' iken):                       #
-- #                                                                          #
-- #  olay   | abone (filtre)              | ulaştı mı | gecikme | payload    #
-- #  -------|-----------------------------|-----------|---------|----------- #
-- #  INSERT | A  (client_id=eq.A)         | EVET      |  78 ms  | new: 10/10 #
-- #  INSERT | koç(client_id=eq.A)         | EVET      | 440 ms  | new: 10/10 #
-- #  INSERT | B  (client_id=eq.A)         | HAYIR     |    —    | RLS tuttu  #
-- #  UPDATE | A  (read_at yazıldı)        | EVET      |  80 ms  | new: 10/10 #
-- #  UPDATE | koç                         | EVET      | 934 ms  | new: 10/10 #
-- #  UPDATE | B  (client_id=eq.A)         | HAYIR     |    —    | RLS tuttu  #
-- #  DELETE | A  (client_id=eq.A)         | HAYIR (!) |    —    | filtre     #
-- #         |                             |           |         | eşleşemez  #
-- #  DELETE | B  (FİLTRESİZ abone)        | EVET (!!) |  92 ms  | old: {id}  #
-- #                                                                          #
-- # SONUÇ 1 — `replica identity = 'd'` INSERT ve UPDATE İÇİN YETERLİDİR.     #
-- #   Gerekçe: INSERT/UPDATE'te WAL kaydı YENİ TUPLE'ı TAM taşır; Realtime   #
-- #   hem `filter`ı hem RLS görünürlüğünü bu tam satır üzerinde değerlendirir#
-- #   ve `messages_select` politikası ("gönderen veya alıcı veya koç") doğru #
-- #   çalışır. `full`'a geçmek YALNIZCA `payload.old`u doldururdu; uygulama  #
-- #   (`src/hooks/useMessages.ts`) `payload.old`u HİÇ okumuyor. Yani `full`  #
-- #   bugün SIFIR fayda karşılığında her UPDATE'te eski satırın TAMAMINI     #
-- #   WAL'a yazma maliyeti getirirdi. AC-2.2'nin 2 sn bütçesi 78–934 ms ile  #
-- #   zaten karşılanıyor.                                                    #
-- #                                                                          #
-- # SONUÇ 2 — DELETE OLAYI `d` ALTINDA GÜVENLİ DEĞİLDİR (ölçülen sızıntı).  #
-- #   `d`'de DELETE'in WAL kaydı YALNIZCA BİRİNCİL ANAHTARI taşır. Bunun     #
-- #   iki ayrı sonucu ölçüldü:                                               #
-- #     (a) Konuşmanın KENDİ abonesi olayı ALAMAZ — `client_id` eski kayıtta #
-- #         olmadığı için `filter: client_id=eq.<A>` eşleşemez. Yani DELETE  #
-- #         yayını meşru tüketici için ZATEN İŞE YARAMIYOR.                  #
-- #     (b) FİLTRESİZ abone olan İLGİSİZ bir danışan (B) olayı ALDI. RLS     #
-- #         değerlendirilemez, çünkü değerlendirilecek sütun yok — Realtime  #
-- #         satırı gizleyemez, olayı bastıramaz. İçerik sızmaz (payload      #
-- #         yalnızca `{id}`), ama BAŞKA BİR KONUŞMADA bir mesajın silindiği  #
-- #         BİLGİSİ ve ZAMANI sızar.                                         #
-- #                                                                          #
-- # SEÇİLEN ÇÖZÜM — YAYINI DARALT, `full`'a GEÇME                            #
-- #   Üç seçenek vardı:                                                      #
-- #     A) Hiçbir şey yapma, riski kabul et.                                 #
-- #        -> Ölçülmüş bir RLS değerlendirilememe hâlini bilerek açık        #
-- #           bırakmak Faz 1.5 doktrinine aykırı ("belirsizlik redde düşer").#
-- #     B) `replica identity full` -> DELETE'in eski kaydı tam gelir, RLS ve #
-- #        filtre çalışır, sızıntı kapanır.                                  #
-- #        -> AMA planın Faz 2'de İSTEMEDİĞİ bir yetenek (realtime silme)    #
-- #           için HER UPDATE'in WAL maliyetini kalıcı olarak artırır.       #
-- #     C) *** SEÇİLEN *** Yayından `delete` (ve `truncate`) çıkarılır.      #
-- #        -> Güvenli olmayan olay sınıfı KAYNAĞINDA susturulur; maliyet     #
-- #           artmaz (WAL yükü AZALIR); meşru hiçbir tüketici kaybetmez —    #
-- #           (a) yüzünden DELETE zaten kimseye ulaşmıyordu.                 #
-- #                                                                          #
-- #   `publish` seçeneği TABLO değil YAYIN (publication) seviyesindedir, yani#
-- #   `notifications`ı da kapsar. Bu KABUL EDİLDİ ve ölçüldü: kod tabanının  #
-- #   TAMAMINDA tek bir `postgres_changes` aboneliği vardır ve o da          #
-- #   `messages` + `event: 'INSERT'`tir (`src/hooks/useMessages.ts:86-101`;  #
-- #   `grep -rn "postgres_changes" src/` -> 1 abonelik). `notifications`     #
-- #   yayında olmasına rağmen HİÇ dinlenmiyor; DELETE'i kaldırmak orada da   #
-- #   hiçbir şeyi kırmaz, aynı sızıntıyı orada da kapatır.                   #
-- #                                                                          #
-- # İLERİDE REALTIME SİLME GEREKİRSE (ör. "mesajı geri al"):                 #
-- #   `alter publication supabase_realtime set (publish = 'insert, update, delete');`
-- #   TEK BAŞINA YETMEZ — o tabloda `alter table ... replica identity full`  #
-- #   ÖN KOŞULDUR, aksi hâlde yukarıdaki (a)+(b) aynen geri gelir. Bu bir    #
-- #   tercih değil, WAL'ın fiziksel kısıtıdır.                               #
-- ###########################################################################
--
-- `nutrition_logs` YAYINA EKLENMEZ: plan §4.2 beslenme dashboard'unu bir
--   SORGU olarak tanımlıyor ("hedef vs gerçekleşen"), canlı bir akış olarak
--   değil. Tek yazıcısı danışanın kendisidir; kendi yazdığı satırı realtime
--   ile geri almasının bir tüketicisi yoktur. Yayına eklemek, hiç kimsenin
--   dinlemediği bir tabloyu WAL dekoderinden geçirmek olurdu (bkz.
--   `notifications`ın bugünkü durumu — bilinçli olarak GENİŞLETİLMİYOR).
--
-- Idempotenttir. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
-- =============================================================================


-- #############################################################################
-- ## 1) Yayın üyeliği — `messages` ZATEN İÇERİDE, güvence altına alınır      ##
-- #############################################################################
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'supabase_realtime yayini YOK — Realtime kurulumu beklenenden farkli, bu migration yeniden degerlendirilmeli';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    -- Yerelde zaten üye; bu dal yalnızca yayının sıfırlandığı ortamlar içindir.
    alter publication supabase_realtime add table public.messages;
    raise notice 'realtime: public.messages yayina eklendi.';
  end if;
end
$$;


-- #############################################################################
-- ## 2) Yayın olay sınıfları: insert + update (delete/truncate ÇIKARILIR)    ##
-- #############################################################################
alter publication supabase_realtime set (publish = 'insert, update');


-- #############################################################################
-- ## 3) Replica identity — BİLİNÇLİ OLARAK 'd' (varsayılan) BIRAKILIR        ##
-- #############################################################################
--   Değişiklik YAPILMIYOR; burada yalnızca varsayımın DOĞRULANMASI var. Biri
--   ileride `full`a geçerse (ya da `nothing`e düşürürse) bu blok sessiz
--   kalmaz.
do $$
declare
  v_ident "char";
begin
  select relreplident into v_ident from pg_class where oid = 'public.messages'::regclass;
  if v_ident is distinct from 'd' then
    raise warning 'realtime: public.messages replica identity ''%'' (beklenen ''d''). INSERT/UPDATE icin d YETERLIDIR; full''a gecildiyse gerekcesi belgelenmeli.', v_ident;
  end if;
end
$$;

comment on table public.messages
  is 'Sohbet mesajlari. REALTIME: supabase_realtime yayininda, YALNIZCA insert+update (bkz. 20260817190400 — delete olayi replica identity ''d'' altinda RLS ile degerlendirilemedigi icin yayindan cikarildi). Abonelik sunucu tarafinda client_id ile filtrelenir.';


-- #############################################################################
-- ## 4) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  r record;
begin
  select pubinsert, pubupdate, pubdelete, pubtruncate
    into r
    from pg_publication
   where pubname = 'supabase_realtime';

  if not r.pubinsert then
    raise exception 'DOGRULAMA BASARISIZ: supabase_realtime INSERT yayinlamiyor — AC-2.2 (mesaj dusmesi) IMKANSIZ';
  end if;
  if not r.pubupdate then
    raise exception 'DOGRULAMA BASARISIZ: supabase_realtime UPDATE yayinlamiyor — okundu bilgisi (read_at) canli dusmez';
  end if;
  if r.pubdelete or r.pubtruncate then
    raise exception 'DOGRULAMA BASARISIZ: supabase_realtime hala delete/truncate yayinliyor — olculen sizinti ACIK (delete=%, truncate=%)',
      r.pubdelete, r.pubtruncate;
  end if;

  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nutrition_logs'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: nutrition_logs yayina eklenmis — plan bunu ISTEMIYOR (kapsam kaymasi)';
  end if;

  raise notice 'realtime: supabase_realtime yayini insert+update (delete/truncate KAPALI); messages replica identity ''d'' korundu.';
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: geri alma ÖLÇÜLEN sızıntıyı yeniden açar — filtresiz abone olan
-- -- HERHANGİ bir authenticated kullanıcı, okuyamayacağı bir mesajın SİLİNDİĞİ
-- -- bilgisini ve zamanını alır.
-- =============================================================================
--
-- begin;
--   alter publication supabase_realtime set (publish = 'insert, update, delete, truncate');
--   comment on table public.messages is null;
-- commit;
--
-- =============================================================================
