-- =============================================================================
-- 20260818090000_form_check_weight_to_progress.sql
--
-- FAZ 4 / B-036 — KİLO SERİSİNİN TEK KAYNAĞA BAĞLANMASI
--
-- NİYET NEREDE YAZILI:
--   20260817220000_progress_tracking.sql, `progress_entries.weight_kg` yorumu:
--     "Tip form_checks.current_weight ile AYNIDIR (numeric(6,2)) ki ileride o
--      veri buraya KAYIPSIZ taşınabilsin."
--   Aynı dosyanın KARAR 1b'si: "kaynak ile hedef tipinin AYNI olması, taşımanın
--   yuvarlama/taşma ile satır düşürmesini İMKÂNSIZ kılar" + aralık CHECK'i
--   `form_checks_weight_range_chk` ile BİREBİR aynıdır.
--   `src/components/tabs/StatsTab.tsx` başlığı da aynı borcu adıyla anıyor:
--   "Bu dilim hiçbir satır silmedi; koç panelindeki kilo grafiği HÂLÂ
--    form_checks'ten besleniyor."
--
-- BU MIGRATION O BORCU KAPATIR. Üç parçası vardır:
--   1) `form_check_entry_date()` — timestamptz -> YEREL GÜN çevrimi, TEK yerde.
--   2) `form_checks_sync_progress_weight()` + AFTER INSERT trigger'ı — bundan
--      SONRAKİ her form check aynı yerel güne bir `progress_entries` satırı
--      düşürür (ÇİFT-YAZIM).
--   3) `backfill_form_check_weight_to_progress()` — bundan ÖNCEKİ form
--      check'lerin kilosunu aynı kurala göre taşır (idempotent).
--
-- Idempotenttir: `create or replace function`, `drop trigger if exists` +
-- `create trigger`, ve backfill'in kendisi `on conflict` üzerine kuruludur ->
-- ikinci koşu 0 satır üretir. Geri alma için dosyanın SONUNDAKİ `-- DOWN`
-- bloğuna bakınız.
--
--
-- #############################################################################
-- # KARAR 1 — ÇİFT-YAZIM İSTEMCİDE DEĞİL, TRIGGER'DA                          #
-- #                                                                            #
-- # Seçenek (A): `useSubmitFormCheck` form check'i yazdıktan sonra ikinci bir  #
-- # `progress_entries.upsert()` çağırır. REDDEDİLDİ:                           #
-- #   * İki ayrı ağ isteği ATOMİK DEĞİLDİR. İkincisi düşerse (çevrimdışı,      #
-- #     403, sekme kapandı) kullanıcı "kilomu girdim" der, grafik boş kalır ve #
-- #     hata SESSİZDİR — tam olarak bugün kapattığımız drift'in aynısı yeniden #
-- #     doğar, bu sefer "bazen".                                               #
-- #   * Kural İSTEMCİDE yaşarsa yalnızca O istemci için geçerlidir. Seed,      #
-- #     E2E, ileride bir mobil istemci veya bir `service_role` script'i aynı   #
-- #     satırı yazdığında değişmez KENDİLİĞİNDEN bozulur.                      #
-- # Seçenek (B): trigger. SEÇİLDİ — bu repo bu türden değişmezleri ZATEN       #
-- # trigger'la koruyor: `program_approval_guard` (20260817160000),             #
-- # `column_guards` (20260817160200), `form_checks_guard_review`               #
-- # (20260817150000 §6), `messages_read_state` (20260817190300). Kural         #
-- # veritabanında yaşarsa HANGİ istemcinin yazdığı önemsizdir.                 #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 1b — `SECURITY DEFINER` GEREKMEZ (ÖLÇÜLDÜ, VARSAYILMADI)             #
-- #                                                                            #
-- # Trigger fonksiyonu ÇAĞIRANIN yetkisiyle koşar. Yazdığı satır RLS'ten       #
-- # geçmek ZORUNDADIR. Zincir şudur:                                           #
-- #   form_checks_insert  : with check (client_id = auth.uid())                #
-- #     -> AFTER trigger tetiklendiğinde `new.client_id = auth.uid()` ZATEN    #
-- #        kanıtlanmıştır (WITH CHECK satır yazılırken uygulanır, AFTER        #
-- #        trigger ondan SONRA koşar).                                         #
-- #   progress_entries_insert : with check (client_id = auth.uid())            #
-- #     -> trigger `new.client_id` yazdığı için AYNI eşitlik sağlanır.         #
-- #   progress_entries_update : using/with check (client_id = auth.uid())      #
-- #     -> `on conflict do update` dalı da aynı sebeple geçer.                 #
-- # Yani danışan KENDİ form check'ini yazarken KENDİ ilerleme satırını yazar;  #
-- # yetki yükseltmesine ihtiyaç YOKTUR. Koçun bu yolu kullanması da mümkün     #
-- # değildir: `form_checks_insert` koça form check yazdırmaz.                  #
-- # `SECURITY DEFINER` eklemek RLS'i BAYPAS eden yeni bir yetkilendirme yüzeyi #
-- # açardı ve karşılığında SIFIR kazanç verirdi (20260817220000 KARAR 5 ile    #
-- # aynı muhakeme). §5 doğrulaması `prosecdef = false` olduğunu ÖLÇER,         #
-- # `supabase/tests/rls.test.sql` senaryo 111 ise gerçek `authenticated`       #
-- # rolüyle yazarak KANITLAR.                                                  #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 2 — ÇAKIŞMA KURALI: ELLE GİRİŞ KAZANIR                               #
-- #                                                                            #
-- # O güne ait bir `progress_entries` satırı ZATEN varsa trigger ona           #
-- # DOKUNMAZ. Tek istisna: satır var AMA `weight_kg` NULL ise (kullanıcı o gün #
-- # yalnızca çevre ölçüsü girmiş, tartılmamış) yalnızca `weight_kg` doldurulur;#
-- # `waist_cm`/`notes` gibi diğer alanlara ASLA dokunulmaz.                    #
-- #                                                                            #
-- #   NEDEN "elle giriş kazanır": `progress_entries` KULLANICININ TARTI        #
-- #   OKUMASIDIR ve gün içinde düzeltilebilir (AC-4.1 upsert). `form_checks`   #
-- #   ise bir GÖNDERİMİN anlık görüntüsüdür. Türetilmiş bir değerin elle       #
-- #   girilmiş bir değeri ezmesi, kullanıcının "düzelttim ama geri döndü"      #
-- #   dediği sessiz veri kaybıdır.                                             #
-- #   NEDEN NULL DOLDURMA GÜVENLİ: NULL "o gün tartılmadı" demektir            #
-- #   (20260817220000, `weight_kg` yorumu). Form check bir tartı okuması       #
-- #   TAŞIYOR -> boşluğu doldurmak KAYIP DEĞİL, KAZANÇTIR ve hiçbir kullanıcı  #
-- #   girdisini ezmez. `progress_entries_not_empty_chk` de bozulmaz (satır     #
-- #   zaten en az bir ölçümle var olabilmişti).                                #
-- #                                                                            #
-- #   BİLİNEN ASİMETRİ (kayıt altına alınıyor): AYNI GÜNE İKİ form check       #
-- #   gönderilirse canlı trigger yolunda İLK'i kazanır (ikincisi çakışmaya     #
-- #   düşer ve `weight_kg` artık NULL değildir), backfill yolunda ise EN       #
-- #   YENİ'si kazanır (KARAR 3). Bu bilinçlidir: trigger, kendi yazdığı satır  #
-- #   ile kullanıcının ELLE yazdığı satırı AYIRT EDEMEZ (provenance kolonu     #
-- #   YOKTUR ve eklemek `progress_entries`in şemasını türetilmiş veri uğruna   #
-- #   genişletmek olurdu). Ayırt edemediği yerde ÜZERİNE YAZMAMAYI seçer —     #
-- #   yani belirsizlikte kullanıcı verisi korunur. Backfill'in EN YENİ'yi      #
-- #   seçmesi ise bir çelişki değildir: orada hedef satır HENÜZ YOKTUR, seçim  #
-- #   yalnızca KAYNAK adayları arasındadır.                                    #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 3 — YEREL GÜN ÇEVRİMİ AÇIKÇA `Europe/Istanbul`                       #
-- #                                                                            #
-- # `form_checks.created_at` `timestamptz`, `progress_entries.entry_date`      #
-- # `date`tir. Çevrim `(created_at at time zone 'Europe/Istanbul')::date`      #
-- # biçiminde YAZILIR ve `form_check_entry_date()` içinde TEK yerde yaşar.     #
-- #                                                                            #
-- #   TUZAK (Faz 4'te bir kez YANDI, bkz. d744eee "gece yarısı tarih kayması"):#
-- #   `created_at::date` DOĞRUDAN uygulanırsa Postgres oturumun `TimeZone`     #
-- #   ayarını kullanır. Sunucu/psql/PostgREST bağlantıları UTC'dir ->          #
-- #   Türkiye saatiyle 00:00–03:00 arasında gönderilen HER form check BİR      #
-- #   ÖNCEKİ güne düşerdi. Kullanıcı gece 01:00'de form gönderir, grafik onu   #
-- #   "dün" gösterir; ertesi gün gerçekten tartılırsa iki ayrı gün ÇAKIŞIR.    #
-- #   Bu, istemci tarafında `todayIsoDate()` (src/lib/date.ts) ile çözülen     #
-- #   sorunun SQL karşılığıdır ve aynı disiplini ister.                        #
-- #                                                                            #
-- #   KISIT (açıkça kabul ediliyor): bu, TÜM kullanıcıların Türkiye saatinde   #
-- #   olduğu VARSAYIMIDIR. Ürün başka saat dilimlerine açılırsa bu çevrim      #
-- #   YENİDEN ELE ALINMALIDIR — doğru çözüm o gün `profiles`'a bir saat dilimi #
-- #   kolonu eklemek ve çevrimi kullanıcı başına yapmaktır. Bugün böyle bir    #
-- #   kolon YOKTUR ve uydurmak, var olmayan bir veriye dayanmak olurdu.        #
-- #   İstemci tarafı (`todayIsoDate()` -> tarayıcının YEREL günü) bugün de     #
-- #   aynı varsayımı taşıyor; iki katman AYNI varsayımda hizalıdır.            #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 4 — `form_checks` ŞEMASI DEĞİŞMEZ                                    #
-- #                                                                            #
-- # `current_weight` NOT NULL KALIR ve hiçbir satır silinmez. Poz kartlarındaki#
-- # "82 kg" etiketleri (FormCheckTab, CoachUserManagement) FOTOĞRAFIN META     #
-- # VERİSİDİR — "bu kare çekildiğinde tartı bunu gösteriyordu" — trend serisi  #
-- # DEĞİLDİR. Kilo alanını form check'ten sökmek ayrı ve daha büyük bir iştir; #
-- # bu migration YALNIZCA seriyi tek kaynağa bağlar.                           #
-- #                                                                            #
-- # SONUÇ: `form_checks` bundan sonra da kilo TAŞIR, ama artık hiçbir TREND    #
-- # GRAFİĞİ ondan beslenmez (`StatsTab` Faz 4c'de, `CoachUserManagement` bu    #
-- # dilimde geçti). İki kaynak arasındaki DRIFT böylece kapanır: aynı sayı iki #
-- # tabloda durur, ama TEK BİR tanesi çizilir ve o tablo diğerinden BESLENİR.  #
-- #############################################################################
-- =============================================================================


-- #############################################################################
-- ## 1) `public.form_check_entry_date()` — timestamptz -> YEREL GÜN           ##
-- #############################################################################
--    Bu fonksiyon KARAR 3'ün TEK uygulama noktasıdır: trigger da, backfill de
--    onu çağırır. İki kopya yazılsaydı biri güncellenip diğeri unutulduğunda
--    canlı yol ile taşıma yolu FARKLI günlere yazardı — yani tam olarak bu
--    migration'ın kapattığı türden sessiz bir drift.
--
--    STABLE (IMMUTABLE DEĞİL) — bilinçli ve zorunlu: `timestamptz at time zone
--    <text>` çevrimi tzdata'ya bakar; tzdata güncellenebilir, dolayısıyla
--    Postgres bu operatörü STABLE sayar. IMMUTABLE işaretlemek yalan söylemek
--    ve ifade indeksi/CHECK gibi yerlerde YANLIŞ önbelleklenmiş sonuç riski
--    almak olurdu. STABLE olması bu fonksiyonun bir CHECK kısıtında
--    kullanılamayacağı anlamına gelir — zaten kullanılmıyor.
create or replace function public.form_check_entry_date(p_created_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (p_created_at at time zone 'Europe/Istanbul')::date;
$$;

comment on function public.form_check_entry_date(timestamptz)
  is 'form_checks.created_at (timestamptz) -> progress_entries.entry_date (YEREL gün). Saat dilimi AÇIKÇA Europe/Istanbul''dur: düz ::date oturumun TimeZone''unu (UTC) kullanır ve 00:00-03:00 arası gönderimleri BİR ÖNCEKİ güne düşürürdü. Ürün başka saat dilimlerine açılırsa bu fonksiyon yeniden ele alınmalıdır (bkz. migration KARAR 3).';

revoke all     on function public.form_check_entry_date(timestamptz) from public;
grant  execute on function public.form_check_entry_date(timestamptz) to authenticated, service_role;


-- #############################################################################
-- ## 2) TRIGGER — bundan SONRAKİ her form check ilerleme satırı düşürür       ##
-- #############################################################################
--    `SECURITY DEFINER` YOKTUR (KARAR 1b). Fonksiyon çağıranın yetkisiyle
--    koşar ve yazdığı satır `progress_entries` politikalarından GEÇER.
--
--    `AFTER` (BEFORE değil): form check satırı KESİN yazıldıktan sonra türetme
--    yapılır. BEFORE olsaydı, form check'i sonradan düşüren bir kısıt/politika
--    ihlali ilerleme satırını da geri alırdı — aynı işlemde olduğu için sonuç
--    aynıdır, ama BEFORE'da `new.id` gibi alanlar henüz kesinleşmemiş olurdu ve
--    okuma sırası tartışmalı hâle gelirdi. Türetilmiş yazma DAİMA AFTER'dır.
--
--    `INSERT` (UPDATE DEĞİL) — bilinçli: `form_checks_update` politikası
--    danışanın kendi satırını düzeltmesine izin verir. Bir UPDATE'i de
--    senkronlamak, o güne ait ELLE girilmiş bir `progress_entries` satırının
--    geçmişe dönük olarak değiştirilmesi anlamına gelirdi (KARAR 2'nin ihlali).
--    Form check kilosunun düzeltilmesi FOTOĞRAFIN meta verisini düzeltir
--    (KARAR 4); trend serisini düzeltmenin yeri `StatsTab` ölçüm girişidir.
--    DELETE de senkronlanmaz: türetilmiş satır artık kullanıcının kendi
--    ölçüm geçmişinin parçasıdır, form check'in silinmesi onu SİLMEZ.
create or replace function public.form_checks_sync_progress_weight()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.progress_entries as pe (client_id, entry_date, weight_kg)
  values (
    new.client_id,
    public.form_check_entry_date(new.created_at),
    new.current_weight
  )
  on conflict (client_id, entry_date) do update
     set weight_kg = excluded.weight_kg
   -- KARAR 2: satır varsa DOKUNMA. Tek istisna `weight_kg IS NULL` (o gün
   -- tartılmamış) -> yalnızca O kolon dolar, diğerleri OLDUĞU GİBİ kalır.
   where pe.weight_kg is null;

  return null;   -- AFTER trigger'ın dönüş değeri yok sayılır
end;
$$;

comment on function public.form_checks_sync_progress_weight()
  is 'Form check eklendiğinde aynı YEREL güne (Europe/Istanbul) bir progress_entries satırı düşürür. Var olan satırı EZMEZ; yalnızca weight_kg NULL ise doldurur (elle giriş kazanır). SECURITY DEFINER DEĞİLDİR: danışan kendi form check''ini yazarken kendi ilerleme satırını yazar, RLS zinciri kendiliğinden sağlanır.';

drop trigger if exists form_checks_sync_progress_weight on public.form_checks;
create trigger form_checks_sync_progress_weight
  after insert
  on public.form_checks
  for each row
  execute function public.form_checks_sync_progress_weight();


-- #############################################################################
-- ## 3) BACKFILL — bundan ÖNCEKİ form check'lerin kilosu                     ##
-- #############################################################################
--    ##########################################################################
--    # NEDEN FONKSİYON, NEDEN MIGRATION GÖVDESİNE GÖMÜLÜ DEĞİL                 #
--    #   `supabase db reset` akışında migration'lar SEED'DEN ÖNCE koşar, yani  #
--    #   bu dönüşüm sıfırdan kurulan bir veritabanında DAİMA BOŞ tabloda       #
--    #   çalışır (no-op). Mantığın doğruluğunu kanıtlamanın TEK yolu onu       #
--    #   testten çağırabilmektir — `backfill_form_check_review()`              #
--    #   (20260817150000 §4) ve `backfill_messages_conversation_key()` aynı    #
--    #   sebeple fonksiyondur. rls.test.sql senaryo 113 bunu ölçer.            #
--    #                                                                          #
--    # SECURITY INVOKER (DEFINER DEĞİL) — EMSALDEN BİLİNÇLİ SAPMA              #
--    #   `backfill_form_check_review()` SECURITY DEFINER'dır. Bu fonksiyon     #
--    #   DEĞİLDİR ve gerekçesi ölçülmüştür: TÜM çağıranları zaten RLS'i        #
--    #   BAYPAS EDEN roller. (a) migration `postgres` ile koşar (BYPASSRLS),   #
--    #   (b) `execute` yalnızca `service_role`a verilir (BYPASSRLS), (c) test  #
--    #   `postgres` ile çağırır. Yani DEFINER hiçbir kapı AÇMAZ, yalnızca      #
--    #   RLS'i baypas eden YENİ bir yetkilendirme yüzeyi bırakırdı.            #
--    #   20260817220000 KARAR 5'in doktrini: "SECURITY DEFINER sıfır kazanç    #
--    #   karşılığında net bir güvenlik borcudur -> YOK". Sapmalar miras        #
--    #   alınmaz, gerekçelendirilir; burada gerekçe DAHA DAR yetkidir.         #
--    #   Sonuç FAIL-CLOSED'dır: RLS'i baypas etmeyen bir rol bu fonksiyonu     #
--    #   çağırırsa sessizce eksik taşımaz, 42501 ile GÜRÜLTÜLÜ ölür.          #
--    ##########################################################################
--
--    DÖNÜŞÜM KURALI (active_planprogram.md §3.5):
--      * KAYNAK: her (danışan, YEREL gün) çifti için form check'ler.
--      * AYNI GÜNDE BİRDEN ÇOK FORM CHECK -> EN YENİSİ kazanır
--        (`created_at desc, id desc` — `id` deterministik eşitlik bozucudur;
--        `created_at` seed'de aynı olabilir ve sırasız bir seçim testi
--        "bazen geçen" hâle getirirdi).
--      * HEDEFTE SATIR VARSA -> DOKUNULMAZ; yalnızca `weight_kg IS NULL` ise
--        doldurulur (KARAR 2 — trigger ile AYNI kural, AYNI ifade).
--      * IDEMPOTENT: ikinci koşu (0 inserted, 0 filled) döner, çünkü ilk koşu
--        tüm hedef satırların `weight_kg`'ini doldurmuştur.
--      * BOŞ VERİTABANINDA NO-OP: `form_checks` boşsa `src` boştur.
--
--    `xmax = 0` HİLESİ: `insert ... on conflict do update ... returning`
--    çıktısında YENİ eklenen satırın `xmax`'i 0, GÜNCELLENEN satırınki geçerli
--    işlem kimliğidir. Böylece "kaç satır eklendi" ile "kaç NULL dolduruldu"
--    AYRI ayrı sayılır — rapor "çalıştı" demez, SAYI gösterir.
create or replace function public.backfill_form_check_weight_to_progress()
returns table (
  source_days       integer,
  rows_inserted     integer,
  rows_filled       integer,
  rows_skipped      integer,
  rows_out_of_range integer
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source    integer := 0;
  v_inserted  integer := 0;
  v_filled    integer := 0;
  v_range     integer := 0;
begin
  -- --- 3a) Aralık dışı tarihler: TAŞINMAZ, BİLDİRİLİR ------------------------
  --     `progress_entries_date_chk` 2000-2100 arasını şart koşar. `form_checks`
  --     tarafında böyle bir kısıt YOKTUR (created_at default now()'dur ama
  --     istemci değer gönderebilir). Aralık dışı bir satır taşınmaya
  --     çalışılsaydı 23514 ile TÜM backfill'i düşürürdü — 12 satırın 11'i
  --     yüzünden 1'ini kaybetmek yerine, o 1'i BİLDİRİP diğerlerini taşıyoruz.
  select count(*)
    into v_range
    from (
      select distinct fc.client_id, public.form_check_entry_date(fc.created_at) as entry_date
        from public.form_checks fc
       where public.form_check_entry_date(fc.created_at) <  date '2000-01-01'
          or public.form_check_entry_date(fc.created_at) >= date '2100-01-01'
    ) as bad_days;

  if v_range > 0 then
    raise warning 'form_checks -> progress_entries backfill: % gun ARALIK DISI tarih tasidigi icin ATLANDI (progress_entries_date_chk 2000-2100 arasini sart kosar). Bu satirlar ELLE incelenmelidir.', v_range;
  end if;

  -- --- 3b) Kaynak gün sayısı (ölçüm: "kaç aday gün var") --------------------
  select count(*)
    into v_source
    from (
      select distinct fc.client_id, public.form_check_entry_date(fc.created_at) as entry_date
        from public.form_checks fc
       where public.form_check_entry_date(fc.created_at) >= date '2000-01-01'
         and public.form_check_entry_date(fc.created_at) <  date '2100-01-01'
    ) as days;

  -- --- 3c) TAŞIMA ----------------------------------------------------------
  with src as (
    select distinct on (fc.client_id, public.form_check_entry_date(fc.created_at))
           fc.client_id                                      as client_id,
           public.form_check_entry_date(fc.created_at)       as entry_date,
           fc.current_weight                                 as weight_kg
      from public.form_checks fc
     where public.form_check_entry_date(fc.created_at) >= date '2000-01-01'
       and public.form_check_entry_date(fc.created_at) <  date '2100-01-01'
     order by fc.client_id,
              public.form_check_entry_date(fc.created_at),
              fc.created_at desc,     -- AYNI GÜNDE EN YENİSİ KAZANIR
              fc.id         desc      -- deterministik eşitlik bozucu
  ),
  applied as (
    insert into public.progress_entries as pe (client_id, entry_date, weight_kg)
    select src.client_id, src.entry_date, src.weight_kg from src
    on conflict (client_id, entry_date) do update
       set weight_kg = excluded.weight_kg
     where pe.weight_kg is null
    returning (xmax = 0) as was_insert
  )
  select
    count(*) filter (where applied.was_insert),
    count(*) filter (where not applied.was_insert)
    into v_inserted, v_filled
    from applied;

  raise notice 'FORM CHECK KILO TASIMA OZETI: % aday gun -> % yeni satir, % NULL weight_kg dolduruldu, % gun DOKUNULMADAN birakildi (elle giris kazandi), % gun aralik disi',
    v_source, v_inserted, v_filled, v_source - v_inserted - v_filled, v_range;

  source_days       := v_source;
  rows_inserted     := v_inserted;
  rows_filled       := v_filled;
  rows_skipped      := v_source - v_inserted - v_filled;
  rows_out_of_range := v_range;
  return next;
end;
$$;

comment on function public.backfill_form_check_weight_to_progress()
  is 'form_checks.current_weight -> progress_entries.weight_kg veri taşıması. Yerel gün Europe/Istanbul; aynı günde EN YENİ form check kazanır; var olan satır EZİLMEZ (yalnızca weight_kg NULL ise dolar). IDEMPOTENTTİR: ikinci koşu 0 satır üretir. SECURITY INVOKER — tüm çağıranları (postgres/service_role) zaten RLS''i baypas eder, DEFINER sıfır kazanç karşılığı yeni bir yetkilendirme yüzeyi olurdu.';

revoke all     on function public.backfill_form_check_weight_to_progress() from public;
grant  execute on function public.backfill_form_check_weight_to_progress() to service_role;


-- #############################################################################
-- ## 4) Backfill'i ÇALIŞTIR                                                  ##
-- #############################################################################
--    NOT: `supabase db reset` akışında migration'lar seed'den ÖNCE koşar ->
--    burada 0 satır taşınır (no-op). Bu BEKLENEN durumdur; sıfırdan kurulan bir
--    veritabanında seed'in yazdığı form check'leri §2'deki TRIGGER karşılar.
--    Fonksiyon asıl işini MEVCUT (veri dolu) bir veritabanına uygulandığında
--    yapar.
do $$
declare
  v_res record;
begin
  select * into v_res from public.backfill_form_check_weight_to_progress();
  raise notice 'form_checks kilo tasimasi tamamlandi: aday_gun=%, eklenen=%, doldurulan=%, atlanan=%, aralik_disi=%',
    v_res.source_days, v_res.rows_inserted, v_res.rows_filled, v_res.rows_skipped, v_res.rows_out_of_range;
end
$$;


-- #############################################################################
-- ## 5) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_secdef  boolean;
  v_n       integer;
  v_left    integer;
begin
  -- (a) Trigger GERÇEKTEN kurulu mu (AFTER INSERT, satır bazlı)?
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.form_checks'::regclass
       and tgname  = 'form_checks_sync_progress_weight'
       and not tgisinternal
  ) then
    raise exception 'DOGRULAMA BASARISIZ: form_checks_sync_progress_weight trigger i KURULMADI -> cift-yazim yok, drift yeniden acilir';
  end if;

  -- (b) KARAR 1b'NİN ÖLÇÜMÜ: trigger fonksiyonu SECURITY DEFINER OLMAMALI.
  --     Biri "hızlıca çalışsın" diye DEFINER eklerse bu satır onu YAKALAR.
  select p.prosecdef into v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'form_checks_sync_progress_weight';
  if v_secdef is null then
    raise exception 'DOGRULAMA BASARISIZ: form_checks_sync_progress_weight fonksiyonu YOK';
  end if;
  if v_secdef then
    raise exception 'DOGRULAMA BASARISIZ [KARAR 1b]: trigger fonksiyonu SECURITY DEFINER -> RLS i baypas eden yeni yetkilendirme yuzeyi acilmis (gerekli DEGIL, bkz. migration KARAR 1b)';
  end if;

  select p.prosecdef into v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'backfill_form_check_weight_to_progress';
  if v_secdef then
    raise exception 'DOGRULAMA BASARISIZ: backfill fonksiyonu SECURITY DEFINER -> gerekli DEGIL (tum cagiranlari zaten BYPASSRLS)';
  end if;

  -- (c) KARAR 3'ÜN ÖLÇÜMÜ: gece yarısı penceresi. Türkiye saatiyle 00:30
  --     (= UTC 21:30, bir ÖNCEKİ gün) YEREL olarak 14 Ağustos olmalıdır.
  --     Düz `::date` (oturum UTC) 13 Ağustos derdi -> tuzak burada ölçülür.
  if public.form_check_entry_date(timestamptz '2026-08-14 00:30:00+03') is distinct from date '2026-08-14' then
    raise exception 'DOGRULAMA BASARISIZ [KARAR 3]: yerel gun cevrimi yanlis -> 00:00-03:00 arasi form check ler BIR ONCEKI gune duser (Faz 4 te bir kez yanan tuzak)';
  end if;
  if public.form_check_entry_date(timestamptz '2026-08-14 23:30:00+03') is distinct from date '2026-08-14' then
    raise exception 'DOGRULAMA BASARISIZ [KARAR 3]: yerel gun cevrimi gunun SONUNU kaydiriyor';
  end if;

  -- (d) Yetki: fonksiyon `public`e ve `anon`a AÇIK OLMAMALI
  if has_function_privilege('anon', 'public.backfill_form_check_weight_to_progress()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.backfill_form_check_weight_to_progress()', 'EXECUTE') then
    raise exception 'DOGRULAMA BASARISIZ: backfill fonksiyonu istemci rollerine ACIK -> toplu veri yazma yuzeyi';
  end if;

  -- (e) TAŞIMANIN SONUCU: `form_checks`teki HİÇBİR (danışan, yerel gün) çifti
  --     `progress_entries`te KARŞILIKSIZ kalmamalı. Bu, "backfill çalıştı mı"
  --     sorusunun VARSAYIM DEĞİL ÖLÇÜM olan cevabıdır. (Boş veritabanında
  --     her iki taraf da 0'dır -> geçer.)
  select count(*) into v_left
    from (
      select distinct fc.client_id, public.form_check_entry_date(fc.created_at) as entry_date
        from public.form_checks fc
       where public.form_check_entry_date(fc.created_at) >= date '2000-01-01'
         and public.form_check_entry_date(fc.created_at) <  date '2100-01-01'
    ) as days
   where not exists (
     select 1 from public.progress_entries pe
      where pe.client_id  = days.client_id
        and pe.entry_date = days.entry_date
   );
  if v_left > 0 then
    raise exception 'DOGRULAMA BASARISIZ: % (danisan, gun) cifti hala progress_entries te KARSILIKSIZ -> tasima eksik kaldi', v_left;
  end if;

  select count(*) into v_n from public.progress_entries;
  raise notice 'form_checks -> progress_entries cift-yazimi kuruldu (AFTER INSERT trigger, SECURITY DEFINER YOK), yerel gun cevrimi Europe/Istanbul, backfill idempotent. progress_entries satir sayisi: %', v_n;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: Bu blok yalnızca ÇİFT-YAZIM MEKANİZMASINI kaldırır. Backfill'in ve
-- -- trigger'ın ÜRETTİĞİ `progress_entries` satırları YERİNDE KALIR — ve
-- -- KALMALIDIR: o satırlar artık danışanın ölçüm geçmişinin parçasıdır ve
-- -- kullanıcı onları elle düzeltmiş olabilir (KARAR 2). "Türetilmiş satırları
-- -- da sil" DİYE BİR SEÇENEK YOKTUR, çünkü hangi satırın türetilmiş hangisinin
-- -- elle girilmiş olduğunu ayırt eden bir provenance kolonu BİLEREK eklenmedi.
-- --
-- -- Yine de temizlemek ZORUNDAYSANIZ: önce yedek alın, sonra AŞAĞIDAKİ
-- -- sorguyu ELLE inceleyip onaylayın (script buna KENDİLİĞİNDEN girmez):
-- --   create table public.zz_progress_entries_backup as
-- --     select * from public.progress_entries;
-- --   -- ADAYLAR (yalnızca kilo taşıyan, notu/ölçüsü olmayan satırlar):
-- --   select pe.* from public.progress_entries pe
-- --     join public.form_checks fc
-- --       on fc.client_id = pe.client_id
-- --      and (fc.created_at at time zone 'Europe/Istanbul')::date = pe.entry_date
-- --    where pe.waist_cm is null and pe.chest_cm is null and pe.arm_cm is null
-- --      and pe.thigh_cm is null and pe.hip_cm is null and pe.notes is null;
-- =============================================================================
--
-- begin;
--   drop trigger  if exists form_checks_sync_progress_weight on public.form_checks;
--   drop function if exists public.form_checks_sync_progress_weight();
--   drop function if exists public.backfill_form_check_weight_to_progress();
--   drop function if exists public.form_check_entry_date(timestamptz);
-- commit;
--
-- =============================================================================
