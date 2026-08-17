# Arşiv — Hosted senkronizasyonu (ADR-0020) ve env koruması + yerel PG17 (2026-08-17)

**Özet.** İki bağlı tur. (1) Hosted proje şeması sıfırlanıp yerel zincirin birebir aynısı olan
25 migration push edildi; parite ölçümle doğrulandı ve sıfırlama öncesi hosted'da canlı bir
yetki yükseltme açığı (`anon`'a `profiles` üzerinde `GRANT ALL` + koşulsuz politika) bulunup
kapandı. (2) `.env.local` yerel yığına çevrildi ve hosted hedefine karşı üç katmanlı
fail-closed koruma kuruldu; yerel Postgres 15 → 17 yükseltildi — asıl kazanç Postgres değil,
`.temp` manifestinin PostgREST dahil tüm servis katmanında hosted'la eşleşmesiydi.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 91–109, 1140–1350, 1412–1429, 1518–1534 —
> 2026-08-17'de taşındı.
>
> **Düzeltme notu (çelişki, bilerek silinmedi):** hosted turunun "PG17'ye özgü yeni bulgu"
> ifadesi sonradan **yanlış çıkmıştır** — `storage.protect_delete()` trigger'ı PG 15.8'de de
> zaten etkindi (`storage-api` v1.69.0'ın kendi migration'ı). Ölçümün tam kaydı aşağıdaki
> "İş 2 — gerekçe düzeltmesi" bölümündedir; ADR-0020 §5 de geriye dönük düzeltilmemiştir.

---

### Hosted senkronizasyonu — ADR-0020 uygulaması (2026-08-17)

`docs/adr/0020-hosted-senkronizasyon-stratejisi.md` kullanıcı onayı ve geçerli bir
`SUPABASE_ACCESS_TOKEN` ile uygulandı: barındırılan proje (`nxftmxkpmuyeelrmwofv.supabase.co`)
şeması sıfırlanıp 25 migration'ın tamamı sıfırdan push edildi. Faz 2'nin bittiği aynı günde,
Faz 3'ten önce yürütüldü — Faz 3 hosted'a dokunan yeni saldırı yüzeyi (yemek fotoğrafı yükleme)
eklemeden önce hosted'ın yerelle aynı temeli paylaşması sağlandı.

**Ön uçuş — ADR'nin "kalan tek belirsizliği" kapandı.** Hosted'da
`select current_setting('server_version'), current_setting('supautils.policy_grants', true)`
çalıştırıldı: **PG 17.6** döndü (yerel imaj **PG 15.8** — bu turda yeni bulunan bir sürüm
farkı, bkz. §5 "Hosted senkronizasyonu turunda kaynaktan tespit edildi") ve
`supautils.policy_grants` içinde `storage.objects` **vardı**. ADR-0020'nin "storage
deyimi yanlış alarm" tespiti artık yerel PG15 imajından bir çıkarım değil, hosted'ın kendi
PG17'sinde ölçülmüş bir sonuç.

**Kritik güvenlik bulgusu (ADR yazılırken bilinmiyordu).** Zorunlu yedek alınıp şema
incelendiğinde hosted'da canlı bir yetki yükseltme açığı bulundu: `anon` rolüne `profiles`
üzerinde `GRANT ALL` verilmişti ve UPDATE politikası koşulsuzdu (`USING (true)`, `WITH CHECK`
yok) — anon anahtarını bilen biri herhangi bir profilin `role` alanını değiştirip kendini
yükseltebilirdi. 27 politikanın çoğu aynı kalıptaydı. Bugün sömürülebilirliği sınırlıydı
(uygulama yayında değil, anon anahtarı hiçbir yerde yayımlanmamış) ama anon anahtarları
tasarım gereği istemci paketine gömülür — yayına çıkıldığı gün açık anında canlı olurdu. Bu
bulgu, `docs/security/AUDIT.md`'nin AC-12 bulgusunun ("denetim yerel yığında yapıldı, hosted
proje ayrıca doğrulanmalı") işaret ettiği riskin gerçekleşmiş hâliydi; envanter
(`docs/HOSTED-DATA-INVENTORY.md`) PostgREST OpenAPI şeması üzerinden çıkarıldığı için politika
TANIMLARINI hiç göstermemişti. Temiz baseline kararı bu açığı otomatik kapattı. Detay:
`docs/adr/0020-hosted-senkronizasyon-stratejisi.md` §4, `docs/security/AUDIT.md` §7 (AC-12).

**Ölçülen hosted öncesi durum (yedekten doğrulandı):** 2 bucket (`avatars`,
`form-checks-media`) ikisi de `public = true`; storage nesnesi **0**; `supabase_migrations.schema_migrations`
tablosu **hiç yoktu** (tek migration bile push edilmemiş); roller eski enum (`admin`/`student`);
`profiles` drift kolonları ve legacy tablolar (`workouts`, `program_templates`)
`docs/HOSTED-DATA-INVENTORY.md`'de kayıtlı olduğu gibi doğrulandı.

**Yedek:** `C:\Users\Ayber\supabase-hosted-backup-20260817\` — `schema.sql` (745 satır) +
`data.sql` (222 KB, `auth.users`/`sessions`/`identities`/`refresh_tokens` dahil). Repo
DIŞINDA, gitignore meselesi yok.

**PG17'ye özgü yeni bulgu:** `storage.buckets`'tan doğrudan `DELETE` ile sıfırlama denendi ve
`storage.protect_delete()` koruma trigger'ı yüzünden `42501` ile başarısız oldu (işlemsel
olduğu için hiçbir şey kısmi uygulanmadı). Bucket silme yolundan vazgeçildi; hedef duruma
`UPDATE` ile ulaşıldı.

**Uygulanan adımlar:**

1. `drop schema public cascade` + yeniden oluşturma + grant'lar. `auth` şemasına
   DOKUNULMADI — 2 hesap, oturumlar ve kimlikler korundu.
2. `supabase db push --include-all` → **25 migration'ın TAMAMI temiz uygulandı**, tek bir
   `must be owner` hatası yok.
3. **`profiles` backfill'i** (ADR'nin öngördüğü zorunlu adım). `handle_new_user()`
   `AFTER INSERT` çalıştığı için mevcut 2 `auth.users` hesabı profilsiz kalmıştı; e-posta
   `auth.users`'tan doğrudan çekilerek insert edildi, roller YEDEKTEN doğrulanan eşlemeyle
   atandı (`c6a9fa90` = eski `admin` → `coach`, `5b665098` = eski `student` → `client`) —
   tahmin edilmedi, `data.sql`'den okundu.
4. **Bucket drift'i kapatıldı.** `on conflict (id) do nothing` mevcut bucket'ları atladığı için
   `file_size_limit` NULL kalmıştı; `UPDATE` ile 5 MB + 6 MIME tipine çekildi.
5. Katalog hosted'a import edildi: **1318 egzersiz, 581 besin**. Yerelin 1328/591'inden 10'ar
   az — **drift DEĞİL**, `seed.sql`'in yalnızca yerelde koşan demo satırlarından kaynaklanan
   açıklanabilir bir fark.

**Doğrulanmış parite:**

```
YEREL:  tablo=14  force_rls=14  public_pol=57  storage_pol=12  fonksiyon=31
HOSTED: tablo=14  force_rls=14  public_pol=57  storage_pol=12  fonksiyon=31
```

Ayrıca hosted'da: 25 migration, üç bucket da `public = false` (5 MB, 6 MIME), `profiles` = 2,
**`anon` rolünün `profiles` üzerinde HİÇBİR yetkisi kalmadı** (açık kapandı). Kalan iki
koşulsuz politika incelendi ve meşru: `exercises_select` + `food_database_select`, yalnızca
`authenticated` için referans katalog okuması.

**Sapma — planlanan biçim ≠ uygulanan biçim, veri kaybı YOK (2026-08-17 doğrulandı):**
ADR-0020 §2'nin "kaybedilecekler, bilerek kabul ediliyor" bölümü `program_templates`'in 3
satırının sıfırlamadan **önce** ayrı bir JSON dosyası olarak dışa aktarılmasını öngörüyordu.
Uygulamada bu adım farklı bir biçimde gerçekleşti: ayrı JSON dosyası üretilmedi, ama 3 satır
zaten zorunlu tutulan `data.sql` dump'ının içinde **tam içeriğiyle** korundu — main thread
doğrudan `C:\Users\Ayber\supabase-hosted-backup-20260817\data.sql` içinde `INSERT INTO
"public"."program_templates" (...)` deyimini üç tam satırla birlikte ölçtü. ADR'nin gerçek
amacı (bu 3 satırın sıfırlamayla geri dönüşsüz kaybolmaması) özünde karşılandı, yalnızca
öngörülen taşıma biçiminde değil. Detay: `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`
"Uygulama sonucu".

**Yedeğin konumu ve içeriği:** `C:\Users\Ayber\supabase-hosted-backup-20260817\` —
`schema.sql` (745 satır) + `data.sql` (222 KB). `data.sql`, `auth.users`/`sessions`/
`identities`/`refresh_tokens` dahil `auth` şemasını VE `program_templates` dahil tüm `public`
şeması tablolarını içeriyor. Repo DIŞINDA, sürüm kontrolüne hiç girmedi.

**Durum:** ADR-0020 kabul edildi ve uygulandı. Hosted ve yerel şema/politika/fonksiyon parite
içinde. `.env.local` hâlâ hosted'ı gösteriyor ve ADR'nin `.env.hosted.local` ayrıştırma
önerisi henüz uygulanmadı — bkz. §5 "Hosted senkronizasyonu turunda kaynaktan tespit edildi".

### Env koruması (üç katman) ve yerel Postgres 17 yükseltmesi (2026-08-17)

İki bağımsız iş kalemi aynı oturumda kapatıldı: ADR-0020'nin uygulama sonrası bıraktığı en
kritik açık borç (`.env.local` hâlâ hosted'ı gösteriyor) ve hosted'da bu turda ortaya çıkan
PG15/PG17 sürüm farkı.

#### İş 1 — env koruması (üç katman)

Kapatılan tuzak: `.env.local` barındırılan projeyi VE hosted `service_role` anahtarını
taşıyordu; env override'sız bir E2E/build koşusu hosted'a gerçek veri yazardı. Koruma yalnızca
`playwright.config.ts`'in `webServer.env` bloğundaydı — tek dosya, değişirse sessizce
kaybolur. Repoda bu tuzağa karşı **üç ayrı yerde** yama birikmişti (`playwright.config.ts`,
`ci.yml` yorumları, `scripts/import-catalog.mjs`).

Karar Fable'a danışılarak verildi ve **ADR-0020'nin kendi §3 önerisinde bir delik bulundu**:
ADR `NODE_ENV !== 'production'` koşullu bir guard öneriyordu, ama tehlikeli yol tam olarak
`npm run build && npm run start` üzerinden geçiyor ve `next start` her zaman
`NODE_ENV=production` ile koşuyor — guard, korumaya çalıştığı senaryoda **kendini
kapatırdı**. İkinci delik: `daily-log` yazması tarayıcıdan doğrudan Supabase'e gidiyor, hiçbir
sunucu guard'ı o yolu kesemez. Bu iki bulgu nedeniyle ADR-0020'nin `NODE_ENV`-eksenli önerisi
uygulanmadı; bkz. `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`'ye eklenen "Sonraki tur"
notu.

**Uygulanan üç katman (her biri FARKLI bir yolu kapatıyor):**

- **Katman 0:** `.env.local` yerel yığına çevrildi; eski içerik `.env.hosted.local`'a birebir
  kopyalandı (SHA256 doğrulandı, 3 anahtar taşındı, hiçbir değer log'a yazılmadı).
  `.env.hosted.local`'a `ALLOW_HOSTED_TARGET=1` eklendi. İkisi de `.env*` ile gitignore
  kapsamında.
- **Katman 1:** `playwright.config.ts` tepesinde config-değerlendirme anında iddia — efektif
  URL `*.supabase.co`/`.com` ise ve `E2E_ALLOW_REMOTE_SUPABASE=1` yoksa `throw`. Tarayıcı
  açılmadan, build alınmadan düşer. `webServer.env` bloğu **kaldırılmadı**, iki koruma
  birbirini yedekliyor.
- **Katman 2:** `src/env.server.ts`'te `NODE_ENV`'den **bağımsız** fail-closed guard.
  `server-only` olduğu için istemci paketine girmiyor; gerçek production'da tarayıcı meşru
  bağlanmaya devam ediyor. Kapatılan yol: sunucu tarafı service-role ile hosted'a yazma.
- **Katman 3:** `dotenv-cli` + `dev:hosted`/`build:hosted`/`start:hosted` script'leri —
  bilinçli hosted erişimi tek komut. `dev`/`build`/`start` **değişmedi**.

**Ölçülen önemli davranış:** `NEXT_PUBLIC_*` sunucu paketine de **build-time**'da gömülüyor,
yani guard uygulamanın **build alındığı** hedefi görüyor; `ALLOW_HOSTED_TARGET` ise sıradan
sunucu değişkeni olduğu için **çalışma zamanında** okunuyor. Bu yüzden `build:hosted` script'i
de gerekliydi — yalnızca `start:hosted` yetmezdi.

`vitest.setup.ts`'e tek satır dokunuldu ve gerekçesi önemli: o dosya tüm paket için hosted bir
URL stub'lıyor, yani guard her birim testinde tetiklenirdi. Kolay çözüm "test ortamı muafiyeti"
açmaktı — ama bu tam da yukarıdaki kritik deliğin yasakladığı şey (guard'ı ortama
koşullamak). Bunun yerine bayrak stub'landı ve yeni test dosyası bayrağı silerek guard'ın
GERÇEK davranışını doğruluyor.

**Deploy sözleşmesi değişti (kullanıcı açıkça kabul etti):** gerçek production'da
`ALLOW_HOSTED_TARGET=1` set edilmek **zorunda**. `.env.example` ve `docs/DEPLOYMENT.md`'ye
(§1 Vercel tablosu, §5 matrisi, yeni §5.1 üç katman tablosu, §6 kontrol listesi) işlendi.
`Dockerfile`/`docker-compose.yml` **değişmedi** (build-time'da gerekmiyor, ampirik doğrulandı;
çalışma zamanında `-e` yeterli). CI kontrol edildi, kırılmıyor.

Yeni testler: `tests/unit/env-hosted-guard.test.ts`, 9 senaryo — hosted+bayraksız fırlatır ·
`.supabase.com` da yakalanır · `127.0.0.1` fırlatmaz · self-hosted (`supabase.sirket-ic-agi.local`)
engellenmez · **`NODE_ENV=production` iken DE fırlatır** (kritik deliğin regresyon testi) ·
hata mesajı çözüm yolunu içerir ve JWT sızdırmaz.

**Kalan riskler (borç, bkz. §5):** tarayıcıdan doğrudan Supabase'e yazma yolunu yalnızca
Katman 0+1 kapatıyor, sunucu guard'ı kesemez (tasarım gereği); regex `*.supabase.co`/`.com`
ile sınırlı, custom domain'li bir Supabase projesi guard'a takılmaz; `.env.hosted.local`
diskte açık `service_role` anahtarı taşımaya devam ediyor (değişen tek şey artık varsayılan
olarak kullanılmaması).

#### İş 2 — yerel Postgres 15 → 17

`supabase/config.toml`'da `major_version` 15 → 17. Kanıt: `PostgreSQL 17.6 on
x86_64-pc-linux-gnu`, imaj `public.ecr.aws/supabase/postgres:17.6.1.141` — hosted ile build
düzeyinde birebir.

**Gerekçe düzeltmesi — önceki bir kayıt yanlış çıktı.** ADR-0020 §5 ve bu dosyanın "Hosted
senkronizasyonu — ADR-0020 uygulaması" bölümü, geçişin gerekçesi olarak "PG17'de
`storage.protect_delete()` var, yerelde (PG15) yok, ADR yazılırken gözlenmemiş PG17'ye özgü
bir davranış" demişti. **Bu ölçümle yanlış çıktı.** Bu turda ölçüldü: `protect_buckets_delete`
ve `protect_objects_delete` trigger'ları PG 15.8'de de **zaten etkindi** ve `DELETE FROM
storage.buckets` yerelde de aynı `42501` hatasını veriyordu. O guard `storage-api` v1.69.0'ın
kendi şema migration'larıyla geliyor, Postgres sürümüyle ilgisi yok. Hosted'daki sıfırlama
reddi 15↔17 farkından kaynaklanmıyordu. Önceki tur hosted'da sürprizle karşılaşınca bunu
sürüm farkına yormuş ve ölçmeden bulgu diye kaydetmişti — bu, ADR-0020 §5'in kendisiyle ve bu
dosyanın "Hosted senkronizasyonu — ADR-0020 uygulaması" bölümündeki "PG17'ye özgü yeni bulgu"
ifadesiyle **çelişiyor**; iki kayıt da geriye dönük düzeltilmedi (bu dosyanın "eski girdiler
silinmez" kuralı gereği), düzeltme burada ayrı bir not olarak kayda geçirildi.

**Asıl kazanç — Postgres sürümünden çok daha büyük.** `supabase/.temp/` linkli projenin
GERÇEK servis sürümlerini önbelleğe alıyor ve CLI bu manifesti yalnızca `major_version`
hosted ile **eşleştiğinde** uyguluyor. 15'te eşleşme başarısızdı ve CLI kendi pin'lerine
düşüyordu; 17'de tam manifest uygulandı:

| Servis    | Önce (PG15) | Şimdi (PG17) | Hosted     |
| --------- | ----------- | ------------ | ---------- |
| Postgres  | 15.8.1.085  | 17.6.1.141   | 17.6.1.141 |
| PostgREST | v16.1       | **v14.5**    | v14.5      |
| GoTrue    | v2.195.0    | v2.195.0     | v2.195.0   |
| Storage   | v1.69.0     | v1.69.0      | v1.69.0    |

Yani yerel artık PostgREST dahil **tüm servis katmanında** hosted ile aynı imajları koşuyor.
Önceden yerel PostgREST v16.1, production v14.5 idi — ve 104 RLS + 50 E2E testi tam da
PostgREST'i zorlayan testler. CLI'ın PG17 için kendi pin'i `17.6.1.158` olmasına rağmen
hosted'ın tam build'i (`.141`) alındı.

Hiçbir migration veya test kırılmadı, geri alma gerekmedi. `db:types` çıktısı **birebir aynı**
(atlanmış kontrol değil — PG15 çıktısı kenara kopyalanıp diff'lendi). Tek uzantı farkı
`pg_stat_statements` 1.10 → 1.11 (PG17 ile gelen, zararsız).

**Kalan risk (borç, bkz. §5):** PostgREST v14.5 hosted'la eşleştiği için doğru hedef, ama
hosted bir gün yükseltilirse `.temp` bayatlar ve yerel **sessizce sürüklenir** —
`supabase link` yeniden koşulmalı. `supabase/README.md`'ye not düşüldü.

#### Doğrulama

Bu turun tam zincir sonuçları §1 tablosuna işlendi (env koruması + PG17 sonrası satırlar):
`db reset` 25 migration 0 hata · `test:rls` **104/104** · `test:transform` **26/26** ·
`db:types` diff birebir aynı · `type-check` temiz · `test` **511/511** (43 dosya) · `lint`
0 hata/14 uyarı · `build` başarılı · `format:check` temiz · `test:e2e` **50/50** (49.6s) ·
katalog 1328/591 · 14/14 tablo RLS enabled+forced.

---

### Doğrulama tablosu — hosted senkronizasyonu ve env/PG17 satırları

| Kontrol                                                          | Komut                                                                  | Durum                                                                                                                       | Tarih      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Hosted ön uçuş (PG sürümü + `supautils.policy_grants`)           | Dashboard SQL editörü, salt-okunur                                     | **PG 17.6**, `storage.objects` politika izin listesinde — ADR-0020 riski kanıtlandı                                         | 2026-08-17 |
| Hosted migration push                                            | `supabase db push --include-all`                                       | **25/25 migration temiz**, sıfır `must be owner` hatası                                                                     | 2026-08-17 |
| Hosted katalog import'u                                          | (hosted hedefine import)                                               | `exercises` **1318**, `food_database` **581** (yerelden 10'ar az — `seed.sql` demo satırları, drift değil)                  | 2026-08-17 |
| Hosted şema parite doğrulaması (ADR-0020)                        | SQL `COUNT`/`pg_policies` sorguları                                    | `tablo=14 force_rls=14 public_pol=57 storage_pol=12 fonksiyon=31` — **yerel ile birebir**                                   | 2026-08-17 |
| Yerel Postgres sürümü (`config.toml` `major_version` 15 → 17)    | `npx supabase status` / `select version()`                             | **PostgreSQL 17.6**, imaj `public.ecr.aws/supabase/postgres:17.6.1.141` — hosted ile birebir                                | 2026-08-17 |
| Env koruması Katman 1 (`playwright.config.ts` config-time guard) | `playwright test --list` (desene uyan, var olmayan bir hosted URL ile) | Bayraksız: **hata, exit 1**, tarayıcı hiç açılmadı; `E2E_ALLOW_REMOTE_SUPABASE=1` ile: exit 0, "Total: 50 tests in 8 files" | 2026-08-17 |
| Env koruması Katman 2 (`src/env.server.ts` fail-closed guard)    | `npm run build` + `next start` (`NODE_ENV=production`)                 | Bayraksız: `GET /api/health` **500** (middleware'den her istekte); `ALLOW_HOSTED_TARGET=1` ile aynı build: **200**          | 2026-08-17 |
| Tip kontrolü (env koruması + yerel PG17 sonrası)                 | `npm run type-check`                                                   | Temiz                                                                                                                       | 2026-08-17 |
| Lint (env koruması + yerel PG17 sonrası)                         | `npm run lint`                                                         | Temiz — 0 hata, 14 uyarı                                                                                                    | 2026-08-17 |
| Biçim (env koruması + yerel PG17 sonrası)                        | `npm run format:check`                                                 | Temiz                                                                                                                       | 2026-08-17 |
| Birim/bileşen testleri (env koruması + yerel PG17 sonrası)       | `npm run test`                                                         | **511/511 (43 dosya)** — yeni `tests/unit/env-hosted-guard.test.ts` (9 senaryo) dahil                                       | 2026-08-17 |
| Production build (env koruması + yerel PG17 sonrası)             | `npm run build`                                                        | Başarılı                                                                                                                    | 2026-08-17 |
| Veritabanı migration'ları (PG17 sonrası)                         | `npx supabase db reset`                                                | **25 migration, 0 hata**                                                                                                    | 2026-08-17 |
| RLS politika testleri (PG17 sonrası)                             | `npm run test:rls`                                                     | **104/104**                                                                                                                 | 2026-08-17 |
| Plan transform testleri (PG17 sonrası)                           | `npm run test:transform`                                               | 26/26                                                                                                                       | 2026-08-17 |
| `db:types` diff (PG17 sonrası)                                   | `npm run db:types`                                                     | **Birebir aynı** (PG15 çıktısı kenara kopyalanıp diff'lendi — atlanmış kontrol değil)                                       | 2026-08-17 |
| E2E testleri (PG17 sonrası)                                      | `npm run test:e2e`                                                     | **50/50** (49.6 sn)                                                                                                         | 2026-08-17 |
| Katalog (PG17 sonrası, değişmedi)                                | —                                                                      | `exercises` 1328, `food_database` 591                                                                                       | 2026-08-17 |
| RLS enabled+forced tablo sayımı (PG17 sonrası)                   | `pg_tables`/`pg_class` sorgusu                                         | **14/14 tablo** RLS enabled+forced                                                                                          | 2026-08-17 |

---

## Eski §5 — bu turlardaki kısıt ve borç kayıtları

`ÇÖZÜLDÜ` işaretli satırlar kapanmıştır; kapanmayanlar canlı
[`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle izlenir.

**BİLİNEN KISIT (E2E ortam değişkenleri):** E2E testleri çalışırken uygulama sunucusu yerel
Supabase'e yönlendirilmelidir. `.env.local` **barındırılan** projeyi gösterdiği için, testler
koşulmadan önce build şu ortam değişkenleriyle alınmalıdır:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<npx supabase status ile alınan yerel anon key>
```

**Aksi halde testler barındırılan gerçek veritabanına bağlanır ve oraya veri yazar**
(`daily-log` senaryosu kayıt oluşturuyor).

**ÇÖZÜLDÜ (2026-08-17, env koruması üç katman):** elle env override'ı hatırlama artık gerekmiyor.
`.env.local` yerel yığına çevrildi (hosted kimlikleri `.env.hosted.local`'a taşındı) ve buna ek
olarak `playwright.config.ts` (Katman 1) ve `src/env.server.ts` (Katman 2, `NODE_ENV`'den
bağımsız) hosted hedefine bayraksız her koşuyu fail-closed reddediyor — koruma artık tek bir
env dosyasının doğru ayarlanmasına bağlı değil. Detay: `docs/PROGRESS.md` §3 "Env koruması (üç
katman) ve yerel Postgres 17 yükseltmesi".

**YENİ BORÇLAR (Hosted senkronizasyonu turunda kaynaktan tespit edildi, 2026-08-17 —
`docs/adr/0020-hosted-senkronizasyon-stratejisi.md`):**

| Borç                                          | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PG15 (yerel) vs PG17 (hosted) sürüm farkı** | Ön uçuş sorgusu hosted'ın `server_version`'ının **PG 17.6** olduğunu, yerel Docker imajının ise **PG 15.8** (`public.ecr.aws/supabase/postgres:15.8.1.085`) olduğunu ortaya çıkardı. Yerel doğrulama (`db reset`, `test:rls`, tüm ADR/AUDIT kararları) production'ı sürüm olarak birebir yansıtmıyor. Bu turda hosted'da yeni bir PG17'ye özgü davranış da bulundu (`storage.protect_delete()`, bkz. ADR-0020 §5) — yerelde hiç gözlenmemişti. Açık karar: `supabase/config.toml`'da yerel major sürüm 17'ye çekilmeli mi, değerlendirilmeli. Şimdilik yükseltme yapılmadı, yalnızca fark kayda geçirildi. **ÇÖZÜLDÜ (2026-08-17):** `supabase/config.toml` `major_version` 15 → 17 (`PostgreSQL 17.6`, imaj `...postgres:17.6.1.141`, hosted ile birebir). **Ek düzeltme:** bu satırdaki "`storage.protect_delete()` PG17'ye özgü, yerelde gözlenmemiş" iddiası ölçümle **yanlış çıktı** — trigger PG 15.8'de de zaten etkindi, sürümle ilgisi yok (`storage-api` v1.69.0'ın kendi migration'ı). Asıl kazanç sürüm değil, `.temp` manifestinin artık PostgREST dahil tüm servis katmanında hosted'la eşleşmesiydi (önceden yerel PostgREST v16.1, hosted v14.5). Detay ve ADR-0020 §5 ile çelişkinin notu: `docs/PROGRESS.md` §3 "Env koruması (üç katman) ve yerel Postgres 17 yükseltmesi" → "İş 2 — gerekçe düzeltmesi". |
| **`.env.local` hâlâ hosted'ı gösteriyor**     | ADR-0020 §3, hosted artık yerel zincirle senkron olduğu için bu riski daha da önemli hale getiriyor: env override'sız bir E2E/build koşusu artık **senkron olan** hosted projeye yazar (`daily-log` senaryosu kayıt oluşturur). ADR'nin önerisi (`.env.local` varsayılan yerel, hosted kimlikleri ayrı `.env.hosted.local` dosyasında) **UYGULANMADI** — hosted senkronizasyon turunun kapsamı dışında bırakıldı, açık bir karar olarak duruyor. Bkz. bu bölümdeki "BİLİNEN KISIT (E2E ortam değişkenleri)". **ÇÖZÜLDÜ (2026-08-17, env koruması üç katman):** `.env.local` yerel yığına çevrildi, hosted kimlikleri `.env.hosted.local`'a taşındı; ayrıca ADR'nin önerdiğinden daha güçlü bir tasarımla (`NODE_ENV`'den bağımsız, üç katman) `playwright.config.ts` ve `src/env.server.ts` guard'ları eklendi. Detay: `docs/PROGRESS.md` §3 "Env koruması (üç katman) ve yerel Postgres 17 yükseltmesi".                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Sıfırlama öncesi hosted yedeği kırılgan**   | `C:\Users\Ayber\supabase-hosted-backup-20260817\` (`schema.sql` + `data.sql`, `auth` şeması ve `program_templates` dahil tüm `public` şeması tabloları) **tek kopya**, yalnızca kullanıcının yerel diskinde, sürüm kontrolünde değil ve düzenli bir yedekleme stratejisinin parçası değil — tek seferlik elle alınmış bir dump. Bugünkü rolünü (sıfırlama öncesi geri dönüşsüzlüğe karşı güvence) karşıladı, ama hosted'da gerçek danışan verisi oluşmaya başladığında bu tek seferlik dump düzenli bir yedekleme stratejisinin yerini tutmaz — disk arızası, yanlışlıkla silme veya makine değişikliği bu tek kopyayı kaybettirebilir. Düzenli (otomatik, birden fazla konuma giden) bir hosted yedekleme stratejisi ayrı bir iş kalemi olarak açık kalıyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**YENİ BORÇLAR (env koruması + yerel PG17 turunda kaynaktan tespit edildi, 2026-08-17):**

| Borç                                                                                        | Not                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarayıcıdan doğrudan Supabase'e yazma yolu yalnızca Katman 0+1 kapatıyor                    | `daily-log` gibi client-side yazımlar `NEXT_PUBLIC_*`'e bağlı; sunucu guard'ı (Katman 2) bu yolu tasarım gereği kesemez. `.env.local`'ın doğru ayarlı kalması ve/veya Katman 1'in (`playwright.config.ts`) devrede olması hâlâ gerekiyor. |
| Guard regex'i `*.supabase.co`/`.com` ile sınırlı                                            | Custom domain'li bir Supabase projesi (hosted ama farklı bir alan adı) guard'a hiç takılmaz — sessizce geçer.                                                                                                                             |
| `.env.hosted.local` diskte açık `service_role` anahtarı taşıyor                             | Değişen tek şey artık varsayılan olarak yüklenmemesi; anahtarın kendisi hâlâ düz metin diskte duruyor.                                                                                                                                    |
| PostgREST v14.5 eşleşmesi `.temp` manifestine bağlı, hosted yükseltilirse sessizce sürükler | `.temp` yalnızca `major_version` eşleştiğinde hosted'ın gerçek servis sürümlerini uyguluyor; hosted bir gün yükseltilirse yerel bunu otomatik yansıtmaz, `supabase link` yeniden koşulmalı. `supabase/README.md`'ye not düşüldü.          |
