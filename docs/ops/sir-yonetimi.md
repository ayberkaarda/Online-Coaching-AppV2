# Sır yönetimi sözleşmesi

Bu belge, reponun sırlarının (secrets) **nerede yaşadığını**, **nasıl verildiğini** ve **kim
tarafından döndürüldüğünü (rotate)** tek bir yerde toplar. Bir sırın hangi disipline tabi olduğu
konusunda tereddüt varsa buraya bakılır; yeni bir sır eklendiğinde bu belgeye bir satır eklenmesi
beklenir.

**Tetikleyici olay:** `apps/web/.env.hosted.local` içindeki `SUPABASE_SERVICE_ROLE_KEY` düz metin
olarak diske yazılmıştı. Git temizdi (`.gitignore:44` → `.env*` deseni, `git ls-files
apps/web/.env.hosted.local` boş döner — dosya hiçbir zaman commit'lenmedi), ama repo
`C:\Users\Ayber\OneDrive\Masaüstü\...` altında yaşıyor ve OneDrive **sürüm geçmişi** tutuyor (bkz.
§c). Bu yüzden anahtar git'e hiç girmemiş olsa bile yanmış sayıldı ve rotate edildi. Bu belge o
kararın (Fable, B-033) kalıcı sözleşmeye dönüştürülmüş hâlidir.

## a) Genel kural: sır `.env` dosyasına yazılmaz, oturumda set edilir

**Kural:** hosted/production hedefe karşı çalışan gerçek bir sır (RLS'i baypas eden, bir veritabanına
doğrudan bağlanan veya kimlik doğrulaması yapan herhangi bir değer) hiçbir `.env*` dosyasına
yazılmaz. Kabuk oturumunda geçici olarak set edilir (`$env:AD = "..."`) ve komut o oturumda
çalıştırılır; oturum kapanınca değer bellekten gider.

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
pnpm --filter web run dev:hosted
```

Bu desen zaten `scripts/backup-hosted.mjs`, `scripts/import-catalog.mjs`,
`scripts/clean-e2e-data.mjs` gibi depo dışı bakım script'lerinin hepsinde kullanılıyor — script'ler
bilerek hiçbir `.env` dosyası okumaz, "hedef her çalıştırmada açıkça verilir" kuralı sır
değişkenleri için de geçerlidir.

**İstisnalar (bilerek `.env*` dosyasında yaşayan değerler):**

1. **Yerel Supabase yığınının `service_role`/`anon` anahtarları.** `npx supabase start` çıktısı
   sabit, herkesçe bilinen bir demo anahtar seti üretir (Supabase'in kendi dokümantasyonunda da
   yayınlıdır); gerçek bir kaynağa erişim vermez, yalnızca `127.0.0.1:54321`'e. Bu yüzden
   `apps/web/.env.local` içinde durabilir.
2. **`NEXT_PUBLIC_*` önekli değerler** (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Zaten build-time'da tarayıcı bundle'ına gömülüyorlar — "sızma"
   diye bir kavram bu ikisi için yok, RLS onları zaten sınırlıyor. `.env.local` /
   `.env.hosted.local` içinde açıkça durmaları beklenen davranış.
3. **`ALLOW_HOSTED_TARGET=1` gibi davranış bayrakları.** Sır değil, bir anahtar değil — yalnızca
   `src/env.server.ts` guard'ının niyet onayı (bkz. `docs/DEPLOYMENT.md` §5.1). `.env.hosted.local`
   içinde durur.

Bu üç istisna dışındaki her şey — `service_role`, veritabanı şifresi, CLI erişim token'ı — kural 1'e
tabidir: diske hiç yazılmaz.

## b) Sır tablosu

| Sır                             | Nerede yaşar (gerçek değer)                                                                                                                                                                                           | Nasıl verilir                                                                                                                                                                                                                               | Kim döndürür (rotate)                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`     | **Diske hiç yazılmaz** (hosted hedef için). Parola yöneticisinde durur. Gerçek dağıtımda Vercel/Docker/Fly ortam değişkeni olarak yaşar (`docs/DEPLOYMENT.md` §1, §5).                                                | Hosted'a karşı yerel çalışma: oturumda `$env:SUPABASE_SERVICE_ROLE_KEY` set edilip `pnpm run dev:hosted`/`build:hosted`/`start:hosted` çalıştırılır (dotenv-cli mevcut env'i ezmez). Yerel yığın: `apps/web/.env.local` içinde (istisna 1). | **Kullanıcı**, Supabase Dashboard → Project Settings → API → JWT Settings → **"Generate new JWT secret"** (bkz. §d) — `anon` ile BİRLİKTE döner.                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` / `apps/web/.env.hosted.local` (istisna 2); gerçek dağıtımda Vercel env (Production+Preview, `docs/DEPLOYMENT.md` §1).                                                                          | Doğrudan `.env*` dosyasına yazılır — client-safe, RLS ile korunur.                                                                                                                                                                          | **Kullanıcı**, `SUPABASE_SERVICE_ROLE_KEY` ile AYNI eylemle ("Generate new JWT secret") — ikisi ayrı ayrı döndürülemez.                                                    |
| `SUPABASE_DB_PASSWORD`          | **Diske hiç yazılmaz.** Yalnızca `scripts/backup-hosted.mjs` çalıştırılırken oturumda gerekir.                                                                                                                        | Oturumda `$env:SUPABASE_DB_PASSWORD = "..."` (bkz. `docs/ops/hosted-backup.md` §b).                                                                                                                                                         | **Kullanıcı**, Supabase Dashboard → Project Settings → Database → Connection string ("Reset database password"). **JWT secret rotate'inden ETKİLENMEZ** — ayrı bir sırdır. |
| `SUPABASE_ACCESS_TOKEN`         | **Diske hiç yazılmaz** (repoda). Ya oturumda env değişkeni, ya da `supabase login` ile CLI'ın kendi kullanıcı profilindeki (repo dışı) oturum deposunda.                                                              | Oturumda `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."` YA DA `pnpm exec supabase login` ile interaktif giriş (bkz. `docs/ops/hosted-backup.md` "Sorun giderme").                                                                                 | **Kullanıcı**, Supabase Dashboard → Account → Access Tokens (eski token'ı revoke edip yenisini üretir).                                                                    |
| `SUPABASE_PROJECT_REF`          | Sır değildir (proje URL'inin alt alan adı, zaten `NEXT_PUBLIC_SUPABASE_URL` içinde görünür — `nxftmxkpmuyeelrmwofv`), ama diğerleriyle aynı "her çalıştırmada açıkça verilir" disiplinine tabidir; script'e gömülmez. | Oturumda `$env:SUPABASE_PROJECT_REF = "..."`.                                                                                                                                                                                               | Döndürülmez — proje kimliğidir, yalnızca proje silinip yeniden oluşturulursa değişir.                                                                                      |

## c) OneDrive tuzağı

Repo `C:\Users\...\OneDrive\...` altında yaşıyor. Bunun iki ayrı sonucu var:

1. **OneDrive, Git'in bilmediği bir şeyi bilir: dosya içeriği geçmişi.** `.gitignore` yalnızca
   Git'in dosyayı İZLEMESİNİ engeller — dosya diskte var olduğu sürece OneDrive onu buluta
   senkronlar ve **kendi sürüm geçmişini** tutar (Dosya Gezgini → sağ tık → "Sürüm geçmişini
   göster" / OneDrive web arayüzü). Bir sırrı dosyadan bugün silmek, dosyanın eski sürümlerini
   OneDrive bulutundan silmez. Bu yüzden bir kez diske (bu repo ağacının altına) yazılmış bir sır,
   dosyadan çıkarılsa bile **yanmış** sayılır — tek güvenli düzeltme rotate'tir, "sil ve unut"
   değildir.
2. **`backups/hosted/` da aynı tuzağa girer.** `backups/` `.gitignore`'dadır (git'e hiç girmez,
   §-ölçümü için bkz. `docs/ops/hosted-backup.md` §f) ama git-ignore OneDrive senkronunu
   durdurmaz — `git check-ignore` yalnızca Git'in davranışını açıklar, dosya sistemi düzeyinde
   hâlâ OneDrive'ın izlediği bir klasördür. `backups/hosted/` gerçek `auth.users` e-postaları
   içerdiği için (bkz. `hosted-backup.md` §f, KVKK), repo bu OneDrive kökünün altındayken bu dizin
   altına **hiç yazılmaması** gerekir — bkz. `docs/ops/hosted-backup.md`'deki `--out-dir` uyarısı.

Kalıcı çözüm reponun tamamının OneDrive dışına (`C:\dev\my-coaching-appv2`) taşınmasıdır; bu, Faz
4.6'dan sonra ayrı bir ops dilimi olarak sıraya alındı. Bu belgedeki `--out-dir` ve "diske hiç
yazma" kuralları o taşıma tamamlanana kadar geçerli **geçici tedbirlerdir**.

## d) Rotate yordamı — JWT secret (`anon` + `service_role`)

Bu yordam **her ikisini birlikte** döndürür; ayrı ayrı döndürme (`sb_secret_...` yeni API-key
sistemi) bu turun kapsamı dışındadır.

1. Supabase Dashboard'a giriş yapın → ilgili proje (`nxftmxkpmuyeelrmwofv`) → **Project Settings**
   → **API** → **JWT Settings**.
2. **"Generate new JWT secret"** düğmesine basın. Bu eylem:
   - yeni bir `anon` ve yeni bir `service_role` anahtarı üretir,
   - hosted projedeki **tüm mevcut oturumları geçersiz kılar** (yayın öncesi olduğu için kabul
     edilebilir bir bedel — canlı kullanıcı yok).
   - `SUPABASE_DB_PASSWORD`'ü **etkilemez** — o ayrı bir sırdır, ayrı panelden döner (§b).
3. Dashboard'ın gösterdiği yeni `anon` değerini kopyalayın; yeni `service_role` değerini kopyalayıp
   **yalnızca parola yöneticisine** kaydedin — hiçbir dosyaya yapıştırmayın.
4. `apps/web/.env.hosted.local` dosyasını **düzenleyin** (taşımayın):
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=` satırını yeni `anon` değeriyle güncelleyin.
   - `SUPABASE_SERVICE_ROLE_KEY=` satırını **tamamen silin** (satır kalmaz, boş bırakılmaz).
   - `NEXT_PUBLIC_SUPABASE_URL` ve `ALLOW_HOSTED_TARGET=1` olduğu gibi kalır.
   - Bu düzenlemeyle `apps/web/package.json`'daki `dev:hosted`/`build:hosted`/`start:hosted`
     script'leri **değişmeden** çalışmaya devam eder (dotenv-cli dosyada bulamadığı bir değişkeni
     basitçe atlar).
5. Hosted'a karşı çalışmak gerektiğinde, aynı kabuk oturumunda:
   ```powershell
   $env:SUPABASE_SERVICE_ROLE_KEY = "<parola-yöneticisinden>"
   pnpm --filter web run dev:hosted
   ```
   dotenv-cli mevcut ortam değişkenini **ezmez** — `.env.hosted.local`'da artık bu satır olmadığı
   için oturumdaki değer olduğu gibi geçer.
6. Gerçek dağıtımda (Vercel/Docker/Fly): yeni `service_role` ve `anon` değerlerini ilgili platformun
   ortam değişkeni ayarlarına girin (`docs/DEPLOYMENT.md` §1 tablosu, §5 matrisi). Bu adım bu
   belgenin kapsamında değildir, yalnızca hatırlatmadır.

## e) Rotate sonrası doğrulama

Aşağıdakilerin hepsi geçmeden rotate "tamamlandı" sayılmaz:

1. **Eski anahtar artık çalışmıyor.** Eski `service_role`/`anon` değeriyle hosted projeye bir
   istek atıldığında `invalid JWT` / `401` alınmalı (Dashboard'da "Generate new JWT secret" zaten
   bunu garanti eder, ama bir kez elle doğrulanması önerilir).
2. **Yeni anahtarla giriş akışı çalışıyor.** `pnpm run dev:hosted` ile açılan uygulamada bir test
   girişi (ya da mevcut bir kullanıcıyla giriş) başarılı olmalı — `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   güncellemesinin doğru yapıldığının kanıtı budur.
3. **`SUPABASE_SERVICE_ROLE_KEY` dosyada YOK.**
   ```powershell
   Select-String -Path apps\web\.env.hosted.local -Pattern 'SUPABASE_SERVICE_ROLE_KEY'
   ```
   hiçbir eşleşme dönmemeli.
4. **Git hâlâ temiz.** `apps/web/.env.hosted.local` zaten `.gitignore`'da (`.env*` deseni,
   `.gitignore:44`) ve hiç commit'lenmedi; rotate sonrası da `git status` bu dosyayı
   göstermemelidir (izlenmiyor olması beklenen davranıştır).
5. **`git check-ignore -v apps/web/.env.hosted.local`** yine `.gitignore:44:.env*` döndürüyor —
   ignore deseni bu turda bozulmadı.

## f) Bir sır sızdıysa — kısa müdahale listesi

1. **Sızan sırrı ve kapsamını belirleyin** (hangi değişken, hangi kanaldan — repo, log, ekran
   paylaşımı, sohbet geçmişi).
2. **Hemen döndürün** — sızıntının "gerçek" olup olmadığını tartışmayın, önce rotate edin:
   - `service_role`/`anon` → §d (JWT Settings → Generate new JWT secret).
   - `SUPABASE_DB_PASSWORD` → Dashboard → Project Settings → Database → Reset database password.
   - `SUPABASE_ACCESS_TOKEN` → Dashboard → Account → Access Tokens → eski token'ı revoke et, yeni
     üret.
3. **Sızıntı kaynağını kapatın.** Dosya diskte kaldıysa silin; OneDrive gibi sürüm geçmişi tutan
   bir depoya yazılmışsa dosyanın eski sürümlerini de temizlemeniz gerekebilir (§c). Sızıntı git
   geçmişine girdiyse (bu repoda bugüne kadar olmadı, ama genel kural) geçmiş temizliği
   (`git filter-repo`/BFG) **main thread kararı** gerektirir — sub-agent bunu kendi başına
   yürütmez.
4. **Etkilenen erişimi gözden geçirin.** JWT rotate zaten tüm oturumları geçersiz kılar; DB şifresi
   veya access token rotate'i sonrası eski değerle yapılan bağlantıların koptuğunu doğrulayın.
5. **Kaydedin.** Olayı `docs/PROGRESS.md`'ye bir borç/kayıt olarak düşün; kapsamı büyükse
   (ör. gerçek kullanıcı verisi etkilendiyse) ayrı bir ADR açılması değerlendirilmelidir.

## Bkz.

- `docs/ops/hosted-backup.md` — hosted yedekleme yordamı ve `SUPABASE_ACCESS_TOKEN` /
  `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD`'ün script içinde kullanımı.
- `apps/web/.env.example` — sır olmayan şablon, gerçek değer içermez.
- `apps/web/src/env.server.ts` — `SUPABASE_SERVICE_ROLE_KEY` çalışma zamanı doğrulaması ve
  `ALLOW_HOSTED_TARGET` fail-closed guard'ı.
- `docs/DEPLOYMENT.md` §1, §5 — gerçek dağıtımda (Vercel/Docker/Fly) sırların platform ortam
  değişkenlerine nasıl girildiği.
- `docs/adr/0025-hesap-silme-ve-service-role-sunucu-yolu.md` — `service_role`'ün uygulama süreci
  içinde ilk kullanıldığı yol (hesap silme akışı).
