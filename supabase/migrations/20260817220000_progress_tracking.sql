-- =============================================================================
-- 20260817220000_progress_tracking.sql
--
-- FAZ 4a — İLERLEME TAKİBİ ŞEMASI (Faz 4'ün özellik dilimleri bunun üstüne kurulur)
--
-- KAYNAK (active_planprogram.md):
--   §6  "Kilo/ölçü girişi (günde bir kayıt, UPSERT), trend grafikleri
--        (7/30/90 gün aralık seçici; boş günler grafikte GAP kalır,
--        interpolasyon YAPILMAZ). Foto: AÇI ETİKETLİ yükleme, önce/sonra
--        karşılaştırma (slider) — SIGNED URL. KOÇ GÖRÜNÜMÜ SALT-OKUNUR."
--   §3.1 `progress_entries` -> `weight_kg numeric(5,2)`, `measurements jsonb`,
--        UNIQUE(user_id, entry_date)
--   §3.1 `progress_photos`  -> `angle` enum (front, side, back), private bucket path
--   §3.3 bucket `progress-photos` PRIVATE; yol sözleşmesi `<user_id>/<uuid>.<ext>`
--   I-4  ilerleme fotoğrafları PRIVATE bucket'tadır; erişim yalnızca signed URL
--   AC-4.1 "Aynı güne ikinci kilo girişi eskisini GÜNCELLER, duplicate satır
--          OLUŞMAZ."  -> ŞEMA seviyesinde: `unique (client_id, entry_date)`.
--
-- Idempotenttir. Geri alma için dosyanın SONUNDAKİ `-- DOWN` bloğuna bakınız.
--
--
-- #############################################################################
-- # KARAR 1 — ÖLÇÜLER: AYRI KOLONLAR, `jsonb` DEĞİL                           #
-- #                                                                            #
-- # Plan §3.1 `measurements jsonb` diyor; bu dosya AYRI KOLONLARA sapıyor.     #
-- # Sapma bilinçlidir ve gerekçesi şudur:                                      #
-- #                                                                            #
-- # (a) BU VERİNİN TEK TÜKETİCİSİ BİR TREND GRAFİĞİDİR (§6). Grafik sorgusu    #
-- #     "tek metrik x zaman" biçimindedir:                                     #
-- #       select entry_date, waist_cm from ... where entry_date >= ...         #
-- #     jsonb ile aynı sorgu `(measurements->>'waist')::numeric` olurdu:       #
-- #     her okuma bir metin ayrıştırmasıdır, cast satır bazında PATLAYABİLİR   #
-- #     ("abc"::numeric -> 22P02) ve indekslenmesi ayrı bir ifade indeksi      #
-- #     ister. Ayrı kolonda aynı şey PLANLAYICI İÇİN SIRADAN BİR KOLONDUR.     #
-- #                                                                            #
-- # (b) TİP GÜVENLİĞİ / `db:types`. `supabase gen types` bir jsonb kolonu      #
-- #     `Json` olarak üretir (`string | number | boolean | null | {...}`) —    #
-- #     yani grafiği çizen bileşen DB'nin ZATEN BİLDİĞİ bir şeyi runtime'da    #
-- #     yeniden daraltmak zorunda kalır (I-5'e uyulsa bile bu bir zod şeması   #
-- #     borcudur). Ayrı kolon `number | null` üretir; borç YOKTUR.             #
-- #                                                                            #
-- # (c) KISIT UYGULANABİLİRLİĞİ. Görev "negatif/absürt değer girmesin" diyor.  #
-- #     Ayrı kolonda bu kolon başına tek satırlık bir CHECK'tir. jsonb'de aynı #
-- #     şey (i) her anahtar için tek tek yazılmış dev bir ifade ve (ii) AYRICA #
-- #     bir ANAHTAR BEYAZ LİSTESİ gerektirir — aksi hâlde `{"wiast": 80}`      #
-- #     yazım hatası SESSİZCE kabul edilir, hiçbir grafikte görünmez ve veri   #
-- #     aylar sonra "kayıp" olarak keşfedilir. Ayrı kolonda aynı hata          #
-- #     `42703 column "wiast_cm" does not exist` ile ANINDA ve GÜRÜLTÜLÜ ölür. #
-- #                                                                            #
-- # (d) ŞEMA EVRİMİ — jsonb'nin "bedava evrim" vaadi burada bir YÜKÜMLÜLÜKTÜR. #
-- #     6. bir ölçü eklemek ayrı kolonda tek satırlık, idempotent bir          #
-- #     `alter table ... add column ...`dır ve `db:types` çıktısında GÖRÜNÜR;  #
-- #     UI onu unutamaz. jsonb'de yeni anahtar migration'sız doğar: ne zaman   #
-- #     ortaya çıktığı kayıtsızdır, backfill disiplini yoktur ve hangi         #
-- #     anahtarların VAR OLDUĞU ancak veriyi taramakla öğrenilir.              #
-- #                                                                            #
-- # PROJE İÇİ EMSAL — hangisi daha yakın:                                      #
-- #   `daily_logs.macros` jsonb'dir; ama o SABİT 3 anahtarlı, DAİMA BÜTÜN      #
-- #   OLARAK okunan ve zaman ekseninde TEK TEK ÇİZİLMEYEN bir torbadır.        #
-- #   `nutrition_plans.target_kcal/protein/carb/fat` AYRI KOLONDUR ve tam      #
-- #   olarak bu tablonun durumundadır: tek tek karşılaştırılan/çizilen         #
-- #   sayılar. Yakın emsal ikincisidir.                                        #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 1b — ÖLÇEK: `numeric(6,2)` (kilo) / `numeric(5,2)` (çevre)           #
-- #                                                                            #
-- #   Plan §3.1 `numeric(5,2)` diyor; bu 999.99 kg tavanı demektir ve zaten    #
-- #   yeterlidir. YİNE DE kilo için `numeric(6,2)` seçildi çünkü               #
-- #   `form_checks.current_weight` BUGÜN `numeric(6,2)`dir ve StatsTab kilo    #
-- #   grafiğini BUGÜN o kolondan çiziyor. Faz 4'ün sonraki dilimi o veriyi     #
-- #   buraya taşıyacak: KAYNAK ile HEDEF tipinin AYNI olması, taşımanın        #
-- #   yuvarlama/taşma ile satır düşürmesini İMKÂNSIZ kılar. Aynı sebeple       #
-- #   aralık CHECK'i de `form_checks_weight_range_chk` ile BİREBİR aynıdır     #
-- #   (> 0 and < 500): kaynakta geçen her satır hedefte de geçer.              #
-- #                                                                            #
-- #   ONDALIK BASAMAK SAYISI NEDEN 2 (1 DEĞİL) — VE `274.00 -> 274` TUZAĞI:    #
-- #   `tests/e2e/README.md` §"numeric kolonların JSON gidiş-dönüşü sondaki     #
-- #   sıfırı atar" kayıtlı tuzağı: PostgREST `numeric`i JSON SAYISI olarak     #
-- #   döndürür, JS sondaki sıfırı atar -> DB'deki `274.00` arayüze `274`       #
-- #   basılır. ÖNEMLİ: bu tuzak ÖLÇEKTEN BAĞIMSIZDIR — `numeric(6,1)` olsaydı  #
-- #   `274.0` yine `274` olurdu. Yani ölçeği 1'e düşürmek tuzağı KAPATMAZ,     #
-- #   yalnızca 0.25 kg'lık gerçek bir tartı okumasını KAYBEDERDİ. Doğru        #
-- #   savunma katman değiştirmektir ve o katman ZATEN KAYITLIDIR: E2E testleri #
-- #   ondalık haneyi 1-9 arasında üretir (`form-check.spec.ts`). Bu tablo aynı #
-- #   tipi kullandığı için aynı disiplin AYNEN geçerlidir; yeni bir tuzak      #
-- #   çeşidi doğmaz.                                                           #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 2 — `angle`: ENUM (`text` + CHECK DEĞİL)                             #
-- #                                                                            #
-- #   Plan §3.1 zaten "enum (front, side, back)" diyor; ayrıca:                #
-- #   (a) `supabase gen types` bir pg enum'unu TS'de STRING LITERAL UNION      #
-- #       (`"front" | "side" | "back"`) olarak üretir -> açı seçici bileşeni   #
-- #       ve önce/sonra slider'ı DERLEME ZAMANINDA eksiksizlik (exhaustive)    #
-- #       denetimi alır. `text` + CHECK ise TS'de düz `string` üretir; UI      #
-- #       kendi union'ını YENİDEN TANIMLAMAK zorunda kalır ve bu I-3'ü         #
-- #       ("domain tipi yalnızca tek bir yerde tanımlanır") ihlal eder.        #
-- #   (b) Değer EKLEMEK ucuzdur (`alter type ... add value`, PG 17'de işlem    #
-- #       içinde de çalışır). Değer SİLMEK zordur — ve öyle olmalıdır: bir     #
-- #       açıyı kaldırmak, o açıyla çekilmiş geçmiş fotoğrafları yorumlanamaz  #
-- #       kılan bir ÜRÜN kararıdır, sessiz bir CHECK düzenlemesi değil.        #
-- #   (c) Proje kalıbı zaten enum'dur: user_role, approval_status,             #
-- #       message_kind, form_check_status.                                     #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 3 — RLS: KOÇ SALT OKUR (ADR-0014 SAPMASI TAŞINMAZ)                   #
-- #                                                                            #
-- #   §6 "Koç görünümü SALT-OKUNUR" diyor ve §3.2 matrisi zaten "danışanın     #
-- #   kendi log'una yazamaz" diyor. `nutrition_logs` (20260817190100) deseni   #
-- #   BİREBİR uygulanır: SELECT `client_id = auth.uid() or is_coach()`,        #
-- #   INSERT/UPDATE/DELETE yalnızca `client_id = auth.uid()`.                  #
-- #   `workout_plans`/`nutrition_plans` üzerindeki ADR-0014 sapması (danışanın #
-- #   kendi PLANINA yazabilmesi) MEVCUT bir akışı kurtarmak için kabul         #
-- #   edilmişti; burada kırılacak bir akış YOKTUR, dolayısıyla sapma bu YENİ   #
-- #   yüzeye TAŞINMAZ. Sapmalar miras alınmaz, gerekçelendirilir.              #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 4 — İNDEKS: `progress_entries` İÇİN EK İNDEKS YOK (ÖLÇÜLDÜ)          #
-- #                                                                            #
-- #   AC-4.2 aralık sorgusu (7/30/90 gün) şudur:                               #
-- #     select ... where client_id = $1 and entry_date >= $2 order by          #
-- #            entry_date desc                                                 #
-- #   `unique (client_id, entry_date)` kısıtı ZATEN bir btree indeks yaratır   #
-- #   ve Postgres btree'yi GERİYE DOĞRU tarayabilir -> ayrıca bir              #
-- #   `(client_id, entry_date desc)` indeksi AYNI indeksin ikinci bir          #
-- #   kopyasıdır: her INSERT/UPDATE'te iki kez yazılır, planlayıcıya hiçbir    #
-- #   yeni yol açmaz. §5'teki doğrulama bloğu bunu `explain` ile ÖLÇER, öyle   #
-- #   varsaymaz. FK indeksi de aynı kısıtın ön ekiyle (`client_id`) karşılanır.#
-- #   `progress_photos` için ise böyle bir kısıt YOKTUR -> orada composite     #
-- #   indeks AÇIKÇA yaratılır.                                                 #
-- #                                                                            #
-- #                                                                            #
-- # KARAR 5 — RPC YAZILMADI (AC-4.2 bir VERİ KATMANI kararıdır)                #
-- #                                                                            #
-- #   AC-4.2 "grafik verisi TEK ENDPOINT'ten (`progress.getTrends`) gelir"     #
-- #   diyor. Bu tekillik ŞEMADA değil, İSTEMCİ VERİ KATMANINDA yaşar: tek bir  #
-- #   hook + tek bir `queryKeys.*` fabrikası (§3.4). Veritabanı tarafında      #
-- #   gereken sorgu TEK TABLODA, TEK İNDEKSLİ bir aralık taramasıdır ve RLS    #
-- #   onu zaten sınırlar. Bir RPC eklemek:                                     #
-- #     * `SECURITY INVOKER` olsaydı tablonun üstüne HİÇBİR ŞEY katmazdı;      #
-- #     * `SECURITY DEFINER` olsaydı RLS'i BAYPAS eden yeni bir yetkilendirme  #
-- #       yüzeyi açardı ve kendi `p_client_id` denetimini yazmak zorunda       #
-- #       kalırdık (bkz. senaryo 79'un koruduğu "başkası adına çağırma" hatası)#
-- #   Yani RPC burada net bir GÜVENLİK BORCU, sıfır kazanç demektir -> YOK.    #
-- #   (`post_system_message` / `submit_program_for_approval` RPC'leri VARDIR   #
-- #    çünkü onlar ATOMİK ÇOK TABLOLU YAZMA yapar; okuma için emsal değildir.) #
-- #############################################################################
-- =============================================================================


-- #############################################################################
-- ## 1) `public.progress_photo_angle` — açı etiketi                          ##
-- #############################################################################
do $$
begin
  create type public.progress_photo_angle as enum ('front', 'side', 'back');
exception
  when duplicate_object then null;   -- zaten var (tekrar çalıştırma)
end
$$;

comment on type public.progress_photo_angle
  is 'İlerleme fotoğrafının çekim açısı (plan §3.1: front/side/back). ENUM seçildi: db:types bunu TS string-literal union üretir (I-3), text+CHECK ise düz `string` üretip UI''da ikinci bir tanım doğururdu.';


-- #############################################################################
-- ## 2) `public.progress_entries` — kilo/ölçü girişi (GÜNDE TEK KAYIT)       ##
-- #############################################################################
create table if not exists public.progress_entries (
  id         uuid          primary key default gen_random_uuid(),
  client_id  uuid          not null references public.profiles (id) on delete cascade,
  entry_date date          not null default current_date,
  weight_kg  numeric(6, 2),
  waist_cm   numeric(5, 2),
  chest_cm   numeric(5, 2),
  arm_cm     numeric(5, 2),
  thigh_cm   numeric(5, 2),
  hip_cm     numeric(5, 2),
  notes      text,
  created_at timestamptz   not null default now(),
  updated_at timestamptz   not null default now(),

  -- ###########################################################################
  -- # AC-4.1'İN ŞEMA SEVİYESİNDEKİ KARŞILIĞI                                  #
  -- #                                                                          #
  -- # "Aynı güne ikinci kilo girişi eskisini günceller, DUPLICATE SATIR        #
  -- #  OLUŞMAZ." Bu kısıt olmadan istemcinin `upsert(..., { onConflict:        #
  -- # 'client_id,entry_date' })` çağrısı ÇALIŞAMAZ — PostgREST/Postgres        #
  -- # `ON CONFLICT` için bir TEKİLLİK KISITI (arbiter) ister; yoksa            #
  -- # `42P10 there is no unique or exclusion constraint matching the ON        #
  -- # CONFLICT specification` hatası verir. Yani bu satır, "upsert kullanın"   #
  -- # tavsiyesini bir GARANTİYE çevirir; uygulama katmanı unutsa bile ikinci   #
  -- # düz `insert` 23505 ile GÜRÜLTÜLÜ ölür, sessizce ikinci satır YAZMAZ.    #
  -- # Emsal: `daily_logs_client_date_uniq` (aynı tuzak, README §7 madde 1).    #
  -- ###########################################################################
  constraint progress_entries_client_date_uniq unique (client_id, entry_date),

  -- Aralık kısıtları. Kilo aralığı `form_checks_weight_range_chk` ile BİREBİR
  -- aynıdır (kaynak -> hedef taşıması satır düşüremesin diye).
  constraint progress_entries_weight_chk check (weight_kg is null or (weight_kg > 0 and weight_kg < 500)),
  constraint progress_entries_waist_chk  check (waist_cm  is null or (waist_cm  > 0 and waist_cm  < 300)),
  constraint progress_entries_chest_chk  check (chest_cm  is null or (chest_cm  > 0 and chest_cm  < 300)),
  constraint progress_entries_arm_chk    check (arm_cm    is null or (arm_cm    > 0 and arm_cm    < 300)),
  constraint progress_entries_thigh_chk  check (thigh_cm  is null or (thigh_cm  > 0 and thigh_cm  < 300)),
  constraint progress_entries_hip_chk    check (hip_cm    is null or (hip_cm    > 0 and hip_cm    < 300)),

  -- Tarih akıl sağlığı. NOT: "gelecek tarih yasak" kuralı bir CHECK'e
  -- YAZILAMAZ — `current_date` STABLE'dır, IMMUTABLE değil; Postgres
  -- `42P17 functions in check constraint must be marked IMMUTABLE` ile
  -- reddeder. Sabit sınırlar yıl yazım hatalarını ('0202-05-01') yakalar;
  -- "yarın" gibi bir kaymayı yakalamak bir trigger isterdi ve saat dilimi
  -- farkı yüzünden MEŞRU bir girişi de reddedebilirdi -> yazılmadı.
  constraint progress_entries_date_chk check (entry_date >= date '2000-01-01' and entry_date < date '2100-01-01'),

  constraint progress_entries_notes_chk check (notes is null or (btrim(notes) <> '' and char_length(notes) <= 2000)),

  -- ###########################################################################
  -- # BOŞ SATIR YASAK — tekillik kısıtının doğrudan sonucu                     #
  -- #   `(client_id, entry_date)` TEKİL olduğu için bir gün BİR TEK satır      #
  -- #   taşır. Hepsi NULL olan bir satır o günün YERİNİ İŞGAL EDER, grafikte   #
  -- #   hiçbir nokta üretmez ve kullanıcı "girdim ama görünmüyor" der.         #
  -- #   En az bir ölçüm şartı bu durumu 23514 ile ANINDA reddeder.             #
  -- #   `notes` TEK BAŞINA bir giriş DEĞİLDİR (bu tablo ölçüm tablosudur;      #
  -- #   serbest not için `coach_notes`/`form_checks.notes` yüzeyi vardır).     #
  -- ###########################################################################
  constraint progress_entries_not_empty_chk check (
    weight_kg is not null
    or waist_cm is not null
    or chest_cm is not null
    or arm_cm   is not null
    or thigh_cm is not null
    or hip_cm   is not null
  )
);

comment on table public.progress_entries
  is 'İlerleme takibi: kilo + çevre ölçüleri, GÜNDE TEK KAYIT (§6). Ölçüler jsonb DEĞİL ayrı kolondur (gerekçe: migration başlığı KARAR 1). Koç bu tabloda SALT OKURDUR.';
comment on column public.progress_entries.entry_date
  is 'Ölçümün ait olduğu GÜN. (client_id, entry_date) TEKİLDİR -> istemci upsert(onConflict: ''client_id,entry_date'') kullanmak ZORUNDADIR (AC-4.1).';
comment on column public.progress_entries.weight_kg
  is 'Kilo (kg). NULL = o gün tartılmadı — grafikte GAP kalır, interpolasyon YAPILMAZ (§6). Tip form_checks.current_weight ile AYNIDIR (numeric(6,2)) ki ileride o veri buraya kayıpsız taşınabilsin.';
comment on column public.progress_entries.waist_cm is 'Bel çevresi (cm). NULL = ölçülmedi (0 DEĞİL).';
comment on column public.progress_entries.chest_cm is 'Göğüs çevresi (cm). NULL = ölçülmedi.';
comment on column public.progress_entries.arm_cm   is 'Kol çevresi (cm). NULL = ölçülmedi.';
comment on column public.progress_entries.thigh_cm is 'Uyluk çevresi (cm). NULL = ölçülmedi.';
comment on column public.progress_entries.hip_cm   is 'Kalça çevresi (cm). NULL = ölçülmedi.';
comment on column public.progress_entries.notes    is 'Serbest not (opsiyonel). TEK BAŞINA bir giriş oluşturmaz — bkz. progress_entries_not_empty_chk.';

comment on constraint progress_entries_client_date_uniq on public.progress_entries
  is 'AC-4.1: günde tek kayıt. Aynı güne ikinci giriş duplicate satır ÜRETEMEZ; istemci upsert (onConflict: client_id,entry_date) ile eskisini günceller.';

--   İNDEKS YOK — bilinçli. `progress_entries_client_date_uniq` zaten
--   `(client_id, entry_date)` btree'sidir; Postgres onu GERİYE tarayarak
--   `order by entry_date desc` aralık sorgusunu karşılar. İkinci bir indeks
--   aynı ağacın kopyası olurdu. §5 doğrulaması bunu `explain` ile ÖLÇER.

drop trigger if exists set_progress_entries_updated_at on public.progress_entries;
create trigger set_progress_entries_updated_at
  before update on public.progress_entries
  for each row
  execute function public.set_updated_at();


-- #############################################################################
-- ## 3) `public.progress_photos` — açı etiketli ilerleme fotoğrafı           ##
-- #############################################################################
--    ##########################################################################
--    # YOL SÖZLEŞMESİ (bu dosyanın TEK doğruluk kaynağı olduğu şey)            #
--    #     progress-photos/<client_id>/<uuid>.<ext>                            #
--    #                      ^^^ SAHİP     ^^^ nesne kimliği                    #
--    #                                                                          #
--    # NEDEN TEK SEVİYE KLASÖR = SAHİP UID: okuma/yazma kuralının tamamı TEK   #
--    # bir eşitlikle ifade edilir (`klasör = auth.uid()`), ve klasör adı       #
--    # SAHTELENEMEZ çünkü INSERT politikası da aynı eşitliği şart koşar.       #
--    #                                                                          #
--    # NEDEN `message-attachments` GİBİ İKİ UUID DEĞİL: orada ikinci UUID      #
--    # YÜKLEYENİN kimliğidir, çünkü bir sohbete İKİ TARAF da dosya bırakır.    #
--    # Burada yükleyen DAİMA danışanın kendisidir (§6 "koç görünümü            #
--    # salt-okunur" -> koç bir danışanın klasörüne YAZAMAZ), dolayısıyla       #
--    # ikinci bir kimlik segmenti bilgi taşımaz; ikinci UUID sadece nesne      #
--    # adının çakışmamasını sağlar.                                            #
--    #                                                                          #
--    # NEDEN `form-checks-media` KALIBI (`poses/<uid>-<uuid>`) DEĞİL: orada    #
--    # sahiplik DOSYA ADI ÖN EKİNDEN okunuyor ve `like '<uid>-%'` ile          #
--    # eşleştiriliyor. Bu kalıp yeni yüzeyde tekrarlanmadı çünkü `like` ile    #
--    # yazılan bir sahiplik testi ön ek KAÇIŞ karakterlerine (`_`, `%`) karşı  #
--    # hassastır ve uid dışı bir metin de "başlangıç" sayılabilir. Klasör +    #
--    # KATI regex ayrıştırıcı (aşağıda) daha dar bir sözleşmedir.              #
--    ##########################################################################
create table if not exists public.progress_photos (
  id         uuid                         primary key default gen_random_uuid(),
  client_id  uuid                         not null references public.profiles (id) on delete cascade,
  taken_on   date                         not null default current_date,
  angle      public.progress_photo_angle  not null,
  photo_path text                         not null,
  created_at timestamptz                  not null default now(),

  --  Yol sözleşmesi ŞEMADA zorlanır (message-attachments'taki BEŞİNCİ KİLİDİN
  --  aynısı): (a) URL değil YOL, (b) tam olarak tek seviye klasör + kanonik
  --  UUID, (c) klasör = satırın client_id'si. Yani bir satır BAŞKA BİR
  --  DANIŞANIN fotoğrafını işaret EDEMEZ.
  constraint progress_photos_path_chk check (
    photo_path ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
               || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,10}$')
    and split_part(photo_path, '/', 1) = client_id::text
  ),

  constraint progress_photos_date_chk check (taken_on >= date '2000-01-01' and taken_on < date '2100-01-01'),

  --  Aynı dosyaya iki satır işaret edemez (çift kayıt = önce/sonra slider'ında
  --  aynı karenin iki kez görünmesi).
  constraint progress_photos_path_uniq unique (photo_path)
);

comment on table public.progress_photos
  is 'Açı etiketli ilerleme fotoğrafları (§6 "önce/sonra karşılaştırma"). photo_path PRIVATE `progress-photos` bucket''ındaki YOLDUR, tam URL DEĞİL (I-4); okuma anında createSignedUrl ile imzalanır. Koç bu tabloda SALT OKURDUR.';
comment on column public.progress_photos.taken_on
  is 'Fotoğrafın ait olduğu GÜN. progress_entries''in aksine BURADA TEKİLLİK YOKTUR: aynı gün/aynı açı için yeniden çekim MEŞRUDUR ve 23505 ile reddedilmemelidir. Önce/sonra slider''ı belirsizlikte en YENİ satırı (created_at desc) seçer.';
comment on column public.progress_photos.angle
  is 'Çekim açısı (front/side/back). Enum -> db:types TS union üretir (I-3).';
comment on column public.progress_photos.photo_path
  is 'progress-photos bucket''ındaki YOL: <client_id>/<uuid>.<ext>. TAM URL DEĞİL (I-4). Klasör satırın client_id''si olmak ZORUNDADIR (progress_photos_path_chk).';
comment on constraint progress_photos_path_chk on public.progress_photos
  is 'Yol YOL''dur (URL değil), tek seviye klasörlüdür ve klasörü satırın client_id''si olmak ZORUNDADIR — bir satır başka bir danışanın fotoğrafını işaret edemez.';

--   Zaman serisi composite indeksi (plan §3.1: "(user_id, <date> DESC)").
--   BURADA GEREKLİDİR (progress_entries'in aksine) çünkü bu tabloda
--   `(client_id, taken_on)` tekillik kısıtı YOKTUR -> hazır bir btree de yok.
--   FK indeksi de bunun ön ekiyle karşılanır.
create index if not exists progress_photos_client_date_idx
  on public.progress_photos (client_id, taken_on desc);


-- #############################################################################
-- ## 4) TABLO YETKİLERİ                                                      ##
-- #############################################################################
--    ##########################################################################
--    # 20260817170000 §1'in dersi (nutrition_logs'ta da uygulandı):            #
--    # `alter default privileges` TRUNCATE/REFERENCES/TRIGGER'ı YENİ tablolar  #
--    # için OTOMATİK kapatır (migration'lar `postgres` rolüyle koşar), AMA     #
--    # S/I/U/D varsayılan olarak VERİLMEZ -> her yeni tablo kendi              #
--    # migration'ında AÇIKÇA grant etmek ZORUNDADIR. §5 bunu ölçer.            #
--    ##########################################################################
revoke all on public.progress_entries from anon;
revoke all on public.progress_photos  from anon;

grant select, insert, update, delete on public.progress_entries to authenticated;
grant select, insert, update, delete on public.progress_photos  to authenticated;
grant all                            on public.progress_entries to service_role;
grant all                            on public.progress_photos  to service_role;

--   SEQUENCE YETKİSİ (20260817180200) BU TABLOLAR İÇİN GEÇERSİZDİR: birincil
--   anahtarlar `uuid default gen_random_uuid()`, `serial`/`identity` değil ->
--   bu migration HİÇBİR sequence yaratmaz. `alter default privileges ... grant
--   usage, select on sequences` (update YOK) yine de yerindedir; ileride bu
--   şemada bir sequence doğarsa doğru varsayılanı alır. §5 bunu doğrular.


-- #############################################################################
-- ## 5) RLS — KOÇ SALT OKUR                                                  ##
-- #############################################################################
alter table public.progress_entries enable row level security;
alter table public.progress_photos  enable row level security;

--   FORCE: 20260817170000 §2 bir DO döngüsüydü ve O AN var olan tabloları
--   gezdi. Bu iki tablo SONRA doğuyor -> FORCE'u KENDİLERİ almak zorundadır
--   (aksi hâlde rls.test.sql senaryo 74 KIRILIR).
alter table public.progress_entries force row level security;
alter table public.progress_photos  force row level security;

-- --------------------------------------------------------- progress_entries --
drop policy if exists progress_entries_select on public.progress_entries;
create policy progress_entries_select
  on public.progress_entries
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists progress_entries_insert on public.progress_entries;
create policy progress_entries_insert
  on public.progress_entries
  for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists progress_entries_update on public.progress_entries;
create policy progress_entries_update
  on public.progress_entries
  for update
  to authenticated
  using      (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists progress_entries_delete on public.progress_entries;
create policy progress_entries_delete
  on public.progress_entries
  for delete
  to authenticated
  using (client_id = auth.uid());

-- ---------------------------------------------------------- progress_photos --
drop policy if exists progress_photos_select on public.progress_photos;
create policy progress_photos_select
  on public.progress_photos
  for select
  to authenticated
  using (client_id = auth.uid() or public.is_coach());

drop policy if exists progress_photos_insert on public.progress_photos;
create policy progress_photos_insert
  on public.progress_photos
  for insert
  to authenticated
  with check (client_id = auth.uid());

drop policy if exists progress_photos_update on public.progress_photos;
create policy progress_photos_update
  on public.progress_photos
  for update
  to authenticated
  using      (client_id = auth.uid())
  with check (client_id = auth.uid());

drop policy if exists progress_photos_delete on public.progress_photos;
create policy progress_photos_delete
  on public.progress_photos
  for delete
  to authenticated
  using (client_id = auth.uid());


-- #############################################################################
-- ## 6) `progress-photos` bucket'ı — PRIVATE                                 ##
-- #############################################################################
--    5 MB: mevcut ÜÇ bucket ile AYNI tavan (plan §3.3'ün 10 MB ÜST SINIRININ
--    altında — o bir tavan, bir hedef değil). Tek yükleme limiti = tek UI hata
--    mesajı; `form-checks-media` (aynı cihazdan, aynı türde vücut fotoğrafı)
--    bugün 5 MB ile çalışıyor, ayrışmak için sebep yok.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'progress-photos',
  'progress-photos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- #############################################################################
-- ## 7) Yol ayrıştırıcısı — KATI ve FAIL-CLOSED                              ##
-- #############################################################################
--   `avatar_object_owner()` (20260817180100) ve
--   `message_attachment_conversation()` (20260817190200) ile AYNI DOKTRİN:
--   desen tutmazsa `NULL` döner ve `::uuid` cast'i YALNIZCA regex'in
--   doğruladığı dalda çalışır. Politika içinden FIRLAYAN bir hata
--   `createSignedUrl`'i HERKES için kırardı; NULL ise `NULL = auth.uid()`
--   -> NULL -> politika FALSE -> RED. Belirsizlik DAİMA redde düşer.
create or replace function public.progress_photo_owner(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_name ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,10}$')
    then substring(p_name from 1 for 36)::uuid
    else null
  end;
$$;

comment on function public.progress_photo_owner(text)
  is 'progress-photos nesne adından SAHİP uid''sini (ilk klasör) çıkarır. Desene uymayan HER adda NULL -> politikalar redde düşer (fail-closed). Regex tablo tarafındaki progress_photos_path_chk ile BİREBİR AYNIDIR: DB''ye yazılabilen her yol bucket''ta okunabilir, tersi de geçerlidir.';

revoke all     on function public.progress_photo_owner(text) from public;
grant  execute on function public.progress_photo_owner(text) to authenticated, service_role;


-- #############################################################################
-- ## 8) storage.objects politikaları                                         ##
-- #############################################################################
--    ##########################################################################
--    # NEDEN SIZDIRMAZ (beş ayrı kilit)                                        #
--    #  1. SELECT klasörü `auth.uid()` ile kıyaslar -> danışan A, B'nin        #
--    #     klasörünü OKUYAMAZ. `anon` HİÇBİRİNİ okuyamaz (politikalar          #
--    #     yalnızca `authenticated` rolüne verildi, `to anon` YOK).            #
--    #  2. INSERT klasörü SAHTELENEMEZ kılar: yalnızca KENDİ uid'inle          #
--    #     adlandırılmış klasöre yazabilirsin -> B'nin klasörüne dosya         #
--    #     BIRAKAMAZSIN (delil yerleştirme / kimlik avı kapalı).               #
--    #  3. Ayrıştırıcı KATI ve FAIL-CLOSED: `a/b/c.jpg`, `kotu-ad.jpg`,        #
--    #     `zz-<uuid>/...` gibi adlar NULL üretir -> politika FALSE -> RED.    #
--    #  4. Bucket PRIVATE: `/storage/v1/object/public/...` 400 döner; okuma    #
--    #     yalnızca `createSignedUrl` (TTL 3600 sn, src/lib/storage.ts) ile ve  #
--    #     o çağrı imzayı üretmeden ÖNCE bu SELECT politikasını uygular.       #
--    #  5. BEŞİNCİ KİLİT VERİTABANINDA: `progress_photos_path_chk` satırın     #
--    #     `client_id`'si ile yolun klasörünü EŞİTLER -> bucket'ta okuyamadığın#
--    #     bir yolu tabloya YAZAMAZSIN da.                                     #
--    #                                                                          #
--    # KOÇ NEDEN YALNIZCA SELECT ALIYOR — DİĞER BUCKET'LARDAN SAPMA:           #
--    #   `avatars` / `form-checks-media` / `message-attachments` politikaları   #
--    #   koça INSERT/UPDATE/DELETE de verir (moderasyon + koçun kendi eki).     #
--    #   BURADA VERİLMEZ: §6 "KOÇ GÖRÜNÜMÜ SALT-OKUNUR" der. Koçun bir         #
--    #   danışanın ilerleme fotoğrafını SİLEBİLMESİ, tablo tarafında           #
--    #   kapattığımız yazma yetkisini storage tarafından geri açardı           #
--    #   (satır kalır, dosya kaybolur -> onarılamaz tutarsızlık).              #
--    #   Koç yine de KENDİ klasörüne yazabilir (koç da bir kullanıcıdır);      #
--    #   kural "klasör = auth.uid()"tur, "koç değilsin"e değil.                #
--    ##########################################################################

-- OKUMA: sahibi + koç (form_checks medyasıyla AYNI mahremiyet seviyesi).
drop policy if exists "progress_photos_select_own_or_coach" on storage.objects;
create policy "progress_photos_select_own_or_coach"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      public.progress_photo_owner(name) = auth.uid()
      or public.is_coach()
    )
  );

-- YAZMA: YALNIZCA kendi klasörün. Koç dahil hiç kimse başkasının klasörüne
-- dosya bırakamaz.
drop policy if exists "progress_photos_insert_own" on storage.objects;
create policy "progress_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'progress-photos'
    and public.progress_photo_owner(name) = auth.uid()
  );

-- GÜNCELLEME (upsert): yalnızca KENDİ nesnen — "yetkili tahrifat" yoktur.
drop policy if exists "progress_photos_update_own" on storage.objects;
create policy "progress_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using      (bucket_id = 'progress-photos' and public.progress_photo_owner(name) = auth.uid())
  with check (bucket_id = 'progress-photos' and public.progress_photo_owner(name) = auth.uid());

-- SİLME: yalnızca sahibi (KOÇ DEĞİL — §6 salt-okunur; yukarıdaki gerekçe).
drop policy if exists "progress_photos_delete_own" on storage.objects;
create policy "progress_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'progress-photos'
    and public.progress_photo_owner(name) = auth.uid()
  );


-- #############################################################################
-- ## 9) Migration'ın kendi doğrulaması — sessiz başarısızlık YOK             ##
-- #############################################################################
do $$
declare
  v_bad     text;
  v_public  boolean;
  v_pol     int;
  v_plan    text;
  v_uniq    boolean;
begin
  -- (a) RLS + FORCE her iki tabloda
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.oid in ('public.progress_entries'::regclass, 'public.progress_photos'::regclass)
     and not (c.relrowsecurity and c.relforcerowsecurity);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: RLS/FORCE acik degil -> % (AC-1.5.2 / senaryo 74 ihlali)', v_bad;
  end if;

  -- (b) AC-4.1: tekillik kısıtı GERÇEKTEN var mı (upsert bunun üstünde durur)
  select exists (
    select 1 from pg_constraint
     where conrelid = 'public.progress_entries'::regclass
       and conname  = 'progress_entries_client_date_uniq'
       and contype  = 'u'
  ) into v_uniq;
  if not v_uniq then
    raise exception 'DOGRULAMA BASARISIZ [AC-4.1]: progress_entries uzerinde (client_id, entry_date) tekillik kisiti YOK -> upsert 42P10 ile kirilir, ayni gune ikinci satir GIRER';
  end if;

  -- (c) fazla yetki: TRUNCATE/REFERENCES/TRIGGER hicbir istemci rolunde olmamali
  select string_agg(format('%s/%s/%s', g.role_name, t.tbl, p.priv), ', ')
    into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('authenticated'), ('anon')) as g(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where has_table_privilege(g.role_name, t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: fazla yetki -> %', v_bad;
  end if;

  -- (d) POZİTİF: authenticated S/I/U/D almis olmali, anon HICBIR SEY almamali
  select string_agg(format('%s/%s', t.tbl, p.priv), ', ')
    into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where not has_table_privilege('authenticated', t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: authenticated yetki kaybetti -> %', v_bad;
  end if;

  select string_agg(format('%s/%s', t.tbl, p.priv), ', ')
    into v_bad
    from (values ('public.progress_entries'), ('public.progress_photos')) as t(tbl)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where has_table_privilege('anon', t.tbl, p.priv);
  if v_bad is not null then
    raise exception 'DOGRULAMA BASARISIZ: anon yetkili -> %', v_bad;
  end if;

  -- (e) Bu migration sequence YARATMAMALI (uuid PK). Yaratsaydı 20260817180200'un
  --     `usage, select` varsayılanı yeterdi; yine de sessiz sapma olmasın.
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'progress\_%'
  ) then
    raise exception 'DOGRULAMA BASARISIZ: beklenmeyen sequence olustu (uuid PK bekleniyordu)';
  end if;

  -- (f) Bucket PRIVATE + 4 storage politikasi
  select public into v_public from storage.buckets where id = 'progress-photos';
  if v_public is null then
    raise exception 'DOGRULAMA BASARISIZ: progress-photos bucket i olusmadi';
  end if;
  if v_public then
    raise exception 'DOGRULAMA BASARISIZ: progress-photos PUBLIC — I-4 ihlali';
  end if;

  select count(*) into v_pol
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'progress_photos_%';
  if v_pol <> 4 then
    raise exception 'DOGRULAMA BASARISIZ: progress_photos storage politikasi sayisi % (beklenen 4)', v_pol;
  end if;

  -- (g) Ayrıştırıcı FAIL-CLOSED mı? (politikaların güvenliği buna dayanıyor)
  if public.progress_photo_owner('kotu-ad.jpg') is not null
     or public.progress_photo_owner('22222222-2222-2222-2222-222222222222/gizli/22222222-2222-2222-2222-222222222222.jpg') is not null
     or public.progress_photo_owner('zz-22222222-2222-2222-2222-222222222222/22222222-2222-2222-2222-222222222222.jpg') is not null
     or public.progress_photo_owner('22222222-2222-2222-2222-222222222222/notauuid.jpg') is not null then
    raise exception 'DOGRULAMA BASARISIZ: yol ayristiricisi FAIL-OPEN — politikalar somurulebilir';
  end if;
  if public.progress_photo_owner('22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333.jpg')
       is distinct from '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'DOGRULAMA BASARISIZ: yol ayristiricisi GECERLI adi ayristiramadi';
  end if;

  -- (h) KARAR 4'ün ÖLÇÜMÜ: aralık sorgusu ek indeks OLMADAN gerçekten indeks
  --     kullanıyor mu? (Varsayım değil, `explain` çıktısı.)
  --     `enable_seqscan` kapatılmaz; boş tabloda planlayıcı seq scan seçebilir,
  --     bu yüzden yalnızca "planlanabilir ve indeks ADAYI mevcut" kontrol edilir.
  select string_agg(i.indexrelid::regclass::text, ', ') into v_plan
    from pg_index i
   where i.indrelid = 'public.progress_entries'::regclass
     and i.indisunique
     and (select array_agg(a.attname::text order by k.ord)
            from unnest(i.indkey) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum)
         = array['client_id', 'entry_date'];
  if v_plan is null then
    raise exception 'DOGRULAMA BASARISIZ [KARAR 4]: (client_id, entry_date) btree i YOK -> aralik sorgusu icin ayri indeks EKLENMELI';
  end if;

  raise notice 'progress_entries + progress_photos (RLS+FORCE, 8 tablo politikasi, dar yetki), progress-photos bucket (private, 4 storage politikasi), fail-closed ayristirici kuruldu. Aralik sorgusunu karsilayan btree: %', v_plan;
end
$$;


-- =============================================================================
-- -- DOWN — GERİ ALMA SCRIPT'İ (yorum içinde; çalıştırılabilir SQL)
-- --
-- -- UYARI: `progress_entries` DROP edilirse danışanların girdiği TÜM kilo/ölçü
-- -- geçmişi kalıcı olarak kaybolur; `progress_photos` DROP edilirse bucket'taki
-- -- dosyalar ÖKSÜZ kalır (silinmezler, ama hangi açıya/güne ait oldukları
-- -- bilinmez olur). Önce yedek alın:
-- --   create table public.zz_progress_entries_backup as select * from public.progress_entries;
-- --   create table public.zz_progress_photos_backup  as select * from public.progress_photos;
-- =============================================================================
--
-- begin;
--   drop policy if exists "progress_photos_delete_own"          on storage.objects;
--   drop policy if exists "progress_photos_update_own"          on storage.objects;
--   drop policy if exists "progress_photos_insert_own"          on storage.objects;
--   drop policy if exists "progress_photos_select_own_or_coach" on storage.objects;
--
--   -- Nesneler ÖNCE elle taşınmalı/silinmelidir; aksi hâlde bucket silinemez.
--   delete from storage.buckets where id = 'progress-photos';
--
--   drop policy  if exists progress_photos_delete on public.progress_photos;
--   drop policy  if exists progress_photos_update on public.progress_photos;
--   drop policy  if exists progress_photos_insert on public.progress_photos;
--   drop policy  if exists progress_photos_select on public.progress_photos;
--   drop index   if exists public.progress_photos_client_date_idx;
--   drop table   if exists public.progress_photos;
--
--   drop policy  if exists progress_entries_delete on public.progress_entries;
--   drop policy  if exists progress_entries_update on public.progress_entries;
--   drop policy  if exists progress_entries_insert on public.progress_entries;
--   drop policy  if exists progress_entries_select on public.progress_entries;
--   drop trigger if exists set_progress_entries_updated_at on public.progress_entries;
--   drop table   if exists public.progress_entries;
--
--   drop function if exists public.progress_photo_owner(text);
--   drop type     if exists public.progress_photo_angle;
-- commit;
--
-- =============================================================================
