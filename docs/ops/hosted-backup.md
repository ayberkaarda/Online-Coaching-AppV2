# Hosted Supabase yedekleme yordamı (B-030)

## a) Neden gerekli

Hosted proje (`nxftmxkpmuyeelrmwofv.supabase.co`) bugüne kadar **tek bir elle
alınmış yedeğe** sahip: `C:\Users\Ayber\supabase-hosted-backup-20260817\`
(`schema.sql` + `data.sql`, ADR-0020 uygulaması sırasında sıfırlama öncesi
alındı). Bu yedek tek kopya, yalnızca bir makinede, sürüm kontrolünde değil ve
düzenli bir stratejinin parçası değil — disk arızası, yanlışlıkla silme veya
makine değişikliği bu tek kopyayı kaybettirebilir. Kayıt:
`docs/archive/progress-hosted-senkron-ve-env.md` → "YENİ BORÇLAR" tablosu,
"Sıfırlama öncesi hosted yedeği kırılgan" satırı; canlı borç kaydı:
`docs/PROGRESS.md` B-030.

**Faz 4.6'nın ön koşulu.** Faz 4.6'da KVKK kapsamında hesap silme akışı
yazılacak: kullanıcı `service_role` ile **geri dönüşsüz** olarak silinecek.
Böyle bir akış, tekrarlanabilir ve doğrulanmış bir yedekleme/geri yükleme
yordamı olmadan güvenle yazılamaz ve test edilemez — yanlış bir silme
sorgusunun tek düzeltme yolu yedekten geri yüklemektir. Bu belge ve
`scripts/backup-hosted.mjs`, Faz 4.6 başlamadan önce bu ön koşulu kapatır.

## b) Ön koşullar

**Supabase CLI global PATH'te değildir (B-035).** Kökteki `devDependencies`
içinde bulunur (`supabase` paketi) ve şu yollardan biriyle çağrılır:

```powershell
# Yol 1 — pnpm exec (PATH'e ihtiyaç duymaz, workspace kökünden)
pnpm exec supabase --version

# Yol 2 — pnpm dlx (kurulu değilse bile çalışır, ama sürüm kökteki lockfile'dan SAPABİLİR)
pnpm dlx supabase --version

# Yol 3 — tam yol (scripts/backup-hosted.mjs'in kendisi bunu kullanır)
.\node_modules\.bin\supabase.CMD --version
```

`scripts/backup-hosted.mjs` **Yol 3**'ü otomatik kullanır — CLI'ı PATH'te
aramaz, `node_modules/.bin/supabase(.CMD)` yolunu doğrudan çözer. Elle
doğrulamak isterseniz Yol 1'i kullanabilirsiniz; ikisi de aynı lockfile'daki
sürümü (`^2.2.1` aralığı, ölçülen gerçek sürüm bu turda **2.114.0**) kullanır.

**Gerekli üç ortam değişkeni** (script bunlar olmadan **hiçbir alt süreç
başlatmaz**, açık Türkçe hatayla `exit 1` verir):

| Değişken                | Ne için                           | Nereden alınır                                                                                                    |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI kimlik doğrulaması   | Supabase Dashboard → Account → Access Tokens (ADR-0020 uygulamasında da elle kullanılmıştı, bkz. archive kaydı)   |
| `SUPABASE_PROJECT_REF`  | Hangi hosted projenin dökülgeceği | Proje URL'inin alt alan adı: `nxftmxkpmuyeelrmwofv` (`https://nxftmxkpmuyeelrmwofv.supabase.co`)                  |
| `SUPABASE_DB_PASSWORD`  | Postgres bağlantı şifresi         | Supabase Dashboard → Project Settings → Database → Connection string (veya projeyi oluştururken belirlenen şifre) |

Bu üç değişken **hiçbir `.env*` dosyasına eklenmez** — script bilerek hiçbir
`.env` dosyasını okumaz (repo geneli kural, bkz. `scripts/import-catalog.mjs`,
`scripts/clean-e2e-data.mjs`: "hedef her çalıştırmada AÇIKÇA belirtilir").
Bu üç değişkenin sözleşmesi (nerede yaşar, kim döndürür) reponun genel sır
yönetimi kuralının bir parçasıdır — bkz. `docs/ops/sir-yonetimi.md` §a/§b.
Kabuk oturumunda geçici olarak set edin:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:SUPABASE_PROJECT_REF  = "nxftmxkpmuyeelrmwofv"
$env:SUPABASE_DB_PASSWORD  = "..."
```

`SUPABASE_ACCESS_TOKEN` her zaman gerekli olmayabilir — `--project-ref` +
`--password` bayrakları teorik olarak yerel `supabase link` durumundan
bağımsız çalışabilir. Bu turda hosted'a hiçbir istek atılmadan (bilerek)
doğrulanamadı; script yine de token'ı gönderir (zararsız fazlalık ihtimali).
İlk gerçek koşuda bir kimlik doğrulama hatası alırsanız bkz. "Sorun giderme".

## c) Adım adım yordam

```powershell
# 1) Önce HER ZAMAN dry-run (varsayılan davranış zaten budur — hiçbir alt
#    süreç başlamaz, yalnızca çalıştırılacak komutlar sır değerleri maskeli
#    yazdırılır):
pnpm run db:backup-hosted

# 2) Çıktı mantıklı görünüyorsa (üç komut, üç hedef dosya, doğru proje ref)
#    gerçek yedeği alın. AYIRICISIZ — pnpm `--`'yi script'e OLDUĞU GİBİ iletir,
#    npm gibi davranmaz (bkz. docs/PROGRESS.md §4). Repo OneDrive altındayken
#    --out-dir ZORUNLU (bkz. §f'deki uyarı ve docs/ops/sir-yonetimi.md §c):
pnpm run db:backup-hosted --confirm --out-dir C:\Users\Ayber\backups\hosted
```

Başarılı bir koşu şunu üretir (varsayılan `--out-dir` yoksa repo köküne göre
`backups/hosted/...`; yukarıdaki OneDrive uyarısı gereği `--out-dir
C:\Users\Ayber\backups\hosted` verildiyse aynı yapı o kök altında oluşur):

```
<out-dir>/<UTC-tarih-saat>/
  schema.sql   # public + internal-olmayan şemaların YAPISI (--schema-only eşdeğeri)
  data.sql     # tüm satır verisi — auth.users/sessions/identities DAHİL
  roles.sql    # Postgres cluster rolleri (CREATE ROLE/GRANT — auth.users TABLOSU DEĞİL)
```

Zaman damgası biçimi: `YYYY-MM-DDTHH-mm-ssZ` (UTC), ör. `2026-08-19T14-03-11Z`.

**Neden üç ayrı dosya, tek `pg_dump` değil.** `supabase db dump`'ın kendisi
üç ayrı modu var: varsayılan (şema), `--data-only`, `--role-only`. Bu turda
`supabase db dump --help` ve `--dry-run --local` ile gerçek `pg_dump`/
`pg_dumpall` komutları ölçüldü (bkz. `scripts/backup-hosted.mjs` başındaki
yorum, `DUMP_TARGETS`):

- **Şema modu** (bayraksız) `--exclude-schema` ile `auth`/`storage`/diğer
  platform şemalarını dışarıda bırakır — bunlar zaten migration'larla
  yeniden oluşturulur, dökümü gereksizdir.
- **`--data-only`** bu hariç tutma listesine `auth`/`storage`'ı **almaz** —
  yani `auth.users`, `storage.objects` gibi tabloların SATIRLARI `data.sql`
  içindedir (2026-08-17'deki elle alınan yedekte de aynı davranış
  gözlemlenmişti).
- **`--role-only`** farklı bir kavram: Postgres CLUSTER rollerini
  (`CREATE ROLE`/`GRANT` deyimleri) döker — `auth.users` tablosundaki
  kullanıcı SATIRLARI değil. Görevin "auth şeması dahil roller/kullanıcılar"
  isteği bu iki dosyanın (`data.sql` + `roles.sql`) BİRLEŞİMİyle karşılanır;
  ayrım script'in başındaki yorumda ve bu belgede açıkça yazılıdır ki ileride
  biri "roller.sql zaten auth.users'ı içeriyor" diye yanlış varsayımda
  bulunmasın.

## d) Geri yükleme (restore) yordamı — yedeğin işe yaradığını kanıtlama

Yedeğin gerçekten geri yüklenebilir olduğu **yerel bir Postgres'e** geri
yükleyerek kanıtlanır — hosted'a asla geri yazılmaz (bu script SALT OKUNUR,
restore de bilerek ayrı ve yerel bir hedefe yapılır).

```powershell
# 0) Taze bir yerel Supabase yığını (mevcut yerel projeyi bozmamak için ayrı
#    bir Postgres konteyneri önerilir; en basit yol supabase'i sıfırlamak):
npx supabase db reset   # yereldeki mevcut migration+seed tabanını sıfırlar

# 1) Şema önce (foreign key/tetikleyici bağımlılıkları için)
docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres `
  -v ON_ERROR_STOP=1 -f - < backups/hosted/<damga>/schema.sql

# 2) Roller (yalnızca CREATE ROLE/GRANT deyimleri; script `--no-role-passwords`
#    kullanır — şifresiz roller oluşur, yerel test için sorun değildir)
docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres `
  -v ON_ERROR_STOP=1 -f - < backups/hosted/<damga>/roles.sql

# 3) Veri (auth.users DAHİL — foreign key'ler yüzünden roller+şemadan SONRA)
docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres `
  -v ON_ERROR_STOP=1 -f - < backups/hosted/<damga>/data.sql
```

**Doğrulama (yedek "işe yaradı" sayılmadan önce hepsi geçmeli):**

1. `docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres -c "select count(*) from auth.users;"`
   — hosted'daki gerçek kullanıcı sayısıyla eşleşmeli.
2. `docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres -c "select count(*) from public.profiles;"`
   — `auth.users` ile aynı sayıda olmalı (backfill kuralı, bkz. ADR-0020).
3. `npm run test:rls` benzeri bir RLS smoke — geri yüklenen şemanın
   politikalarının hâlâ geçerli olduğunu gösterir (tam RLS test paketi seed'e
   bağlı olduğundan burada yalnızca "sorgu hata vermiyor" seviyesinde bir
   kontrol yeterlidir, tam paket için yerel `db reset` + seed kullanılmalı).
4. `data.sql` içinde `INSERT INTO "auth"."users"` ve `INSERT INTO
"public"."profiles"` satırlarının GERÇEKTEN var olduğunu `grep`/arama ile
   doğrulayın (boş bir dump'ı "başarılı" saymayın).

Restore denemesi sonrası **kullanılan yerel Postgres/Docker verisini silin**
(bu geri yükleme gerçek kişisel veri içerir, bkz. §f).

## e) Saklama politikası (öneri — bu turda uygulanmadı, yalnızca öneri)

- **Sıklık:** hosted'da gerçek danışan verisi oluşmaya başladıkça haftalık;
  Faz 4.6 (hesap silme akışı) devreye girdikten sonra **her silme öncesi ek
  bir manuel yedek** (script zaten tekrarlanabilir, ek maliyeti düşük).
- **Kaç kopya:** en az 2 — biri geliştirici makinesinde (`backups/hosted/`,
  gitignore'lu), biri repodan bağımsız bir konumda (harici disk, şirket içi
  ağ paylaşımı veya şifreli bulut depolama). Tek kopya kuralı zaten bu borcun
  (B-030) kendisiydi, tekrarlanmamalı.
- **Saklama süresi:** son 4 haftalık yedek + Faz 4.6 öncesi/sonrası referans
  yedekleri kalıcı tutulabilir; daha eskisi disk alanı baskısı olursa silinir.
- **Kim çalıştırır:** bu script `--confirm` olmadan zarar vermez, ama gerçek
  koşu `SUPABASE_DB_PASSWORD`/`SUPABASE_ACCESS_TOKEN` gerektirdiği için
  otomasyona (CI) bağlanmadan önce bu sırların CI secret'larına taşınması
  ayrı bir karar olarak değerlendirilmeli — bu turun kapsamı dışında.

## Sorun giderme

- **`supabase db dump` bir kimlik doğrulama/yetki hatasıyla düşerse** (ör.
  "invalid access token", "project not found", "password authentication
  failed"): önce `SUPABASE_PROJECT_REF` ve `SUPABASE_DB_PASSWORD`
  değerlerinin Dashboard'daki güncel değerlerle birebir eşleştiğini kontrol
  edin (şifre değiştirilmiş olabilir). Hâlâ başarısızsa `SUPABASE_ACCESS_TOKEN`
  yerine önce `pnpm exec supabase login` ile interaktif giriş yapıp ardından
  script'i **`SUPABASE_ACCESS_TOKEN` set etmeden** tekrar deneyin — CLI bu
  durumda kendi sakladığı oturumu kullanır; script token'ı yine de env'de
  görürse onu ileteceğinden, interaktif girişten sonra `$env:SUPABASE_ACCESS_TOKEN`
  değişkenini o oturum için temizleyin.
- **"Supabase CLI bulunamadı" hatası:** `pnpm install` çalıştırılmamış veya
  `node_modules/.bin/supabase(.CMD)` başka bir sebeple eksik demektir; script
  PATH'e bakmaz (B-035), yalnızca bu yolu kontrol eder.
- **Dry-run çıktısındaki proje ref beklediğinizden farklıysa** gerçek koşuya
  ASLA geçmeyin — `SUPABASE_PROJECT_REF` yanlış projeye (ör. başka bir
  müşterinin projesine) ayarlanmış olabilir.

## f) Yedekler ASLA repoya commit edilmez

`backups/hosted/` içeriği **gerçek danışan kişisel verisi** taşır
(`auth.users` e-postaları, ölçüm/ilerleme verileri, form check geri
bildirimleri). KVKK kapsamında bu veri sürüm kontrolüne veya herhangi bir
paylaşılan/genel depoya ASLA girmemelidir.

- `backups/` dizini `.gitignore`'dadır (ölçüldü: `.gitignore:87`, yorum satırı
  "hosted Supabase yedekleri (B-030) — kişisel veri taşır"; `git check-ignore -v
backups/x` → `.gitignore:87:backups/` döner). Git bu dizini hiçbir zaman
  izlemeyecek — script'in kendisi `.gitignore`'a dokunmaz, gereken satır zaten
  orada.
- Yedek dosyalarını e-posta, Slack, genel bulut paylaşımı gibi kanallarla
  PAYLAŞMAYIN; yalnızca şifreli/erişimi kısıtlı depolamaya taşıyın.
- Bir yedeği sildiğinizde diskten GERÇEKTEN silindiğinden emin olun (çöp
  kutusu/sürüm geçmişi olan depolama sistemlerinde ek bir adım gerekebilir).

> **UYARI — repo OneDrive altındayken `--out-dir` ZORUNLU.** Bu repo
> `C:\Users\Ayber\OneDrive\Masaüstü\...` altında yaşıyor. `.gitignore`
> yalnızca Git'in `backups/`'ı izlemesini engeller — OneDrive'ın kendi bulut
> senkronunu ve sürüm geçmişini DURDURMAZ; `backups/hosted/` bu repo ağacının
> altına yazılırsa, içindeki gerçek `auth.users` e-postaları (KVKK kapsamında
> kişisel veri, bkz. yukarıdaki paragraf) OneDrive'a senkronlanır — bu da bu
> bölümün ("yedekler asla commit edilmez/paylaşılmaz") kendi yasağını fiilen
> çiğner, git'e girmese bile. Bu yüzden repo OneDrive'dan taşınana kadar
> (bkz. `docs/ops/sir-yonetimi.md` §c) **ilk gerçek hosted yedeği ve
> sonrasındaki tüm gerçek koşular** `--out-dir` ile OneDrive dışına
> yönlendirilmelidir:
>
> ```powershell
> pnpm run db:backup-hosted --confirm --out-dir C:\Users\Ayber\backups\hosted
> ```
>
> `--out-dir` script tarafından desteklenir (`scripts/backup-hosted.mjs`
> `parseArgs`, `--out-dir <yol>`; varsayılan `backups/hosted`, repo köküne
> göredir). Dry-run çıktısındaki "Çıktı dizini" satırının gerçekten
> `C:\Users\Ayber\backups\hosted\...` altını gösterdiğini `--confirm`'den ÖNCE
> doğrulayın.
