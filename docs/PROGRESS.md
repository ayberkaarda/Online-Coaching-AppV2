# İlerleme Günlüğü

Bu dosya, oturumlar arası sürekliliği sağlayan tek doğruluk kaynağıdır. `CLAUDE.md` gereği
**her oturumun başında** okunmalıdır. Her anlamlı iş biriminden sonra (faz kapısı, düzeltme
turu, önemli bir keşif) güncellenmelidir. Güncelleme formatı: en üste yeni bir "Oturum" girdisi
eklenir, eski girdiler **silinmez** — bu dosya proje boyunca yalnızca büyür.

---

## 1. Mevcut durum (özet)

Proje, düz JavaScript/tek dosyalık bir hobi projesinden TypeScript strict + FastAPI + Supabase
RLS + test/CI/Docker altyapısına sahip bir mimariye yükseltildi ("v1.0 production-ready
yükseltmesi", `UPGRADE_NOTES.md`). Bu yükseltmenin ardından çıkan lint/tip/test/build hataları
ayrı bir düzeltme turunda giderildi. 2026-08-16 (ikinci yarı) oturumunda kalan tüm doğrulama
adımları — backend araç zinciri, veritabanı migration'ları, RLS izolasyonu — gerçekten
çalıştırıldı ve hepsi yeşil. Docker blokajı çözüldü (Docker Desktop çalışıyor). 2026-08-16
(üçüncü oturum) E2E testleri ilk kez koşturuldu; dört gerçek sorun ortaya çıkardı, hepsi
düzeltildi ve paket artık 28/28 yeşil (bkz. §3 "E2E doğrulaması ve ortaya çıkardığı hatalar").

| Kontrol                   | Komut                       | Durum                                                               | Tarih      |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------- | ---------- |
| Lint                       | `npm run lint`                | Temiz — 0 hata, 12 bilinçli uyarı                                     | 2026-08-16 |
| Tip kontrolü                | `npm run type-check`          | Temiz                                                                  | 2026-08-16 |
| Biçim                       | `npm run format:check`        | Temiz                                                                  | 2026-08-16 |
| Birim/bileşen testleri      | `npm run test`                | 180/180                                                                | 2026-08-16 |
| Production build            | `npm run build`               | Başarılı                                                               | 2026-08-16 |
| Backend lint                | `uv run ruff check .`         | Temiz                                                                  | 2026-08-16 |
| Backend tip (strict)        | `uv run mypy app`             | Temiz, 28 dosya                                                        | 2026-08-16 |
| Backend testleri            | `uv run pytest`               | 63 test, kapsam %92 (eşik %70)                                         | 2026-08-16 |
| Backend Docker imajı        | `docker build` + container    | Derlendi, `/health` doğrulandı                                        | 2026-08-16 |
| Veritabanı migration'ları   | `npx supabase db reset`       | Uygulandı — 9 tablo, 37 politika, 8 storage politikası, 6 fonksiyon    | 2026-08-16 |
| RLS izolasyonu              | Manuel SQL testi              | Doğrulandı (bkz. §1.1)                                                 | 2026-08-16 |
| E2E testleri                | `npm run test:e2e`            | 28/28 geçti (14 senaryo × 2 profil: chromium + Mobile Chrome)          | 2026-08-16 |

Kalan 12 lint uyarısı bilinçlidir: 8 adet `@next/next/no-img-element` (Supabase public
URL'leri ve `ui-avatars.com` için `next/image` bilerek tercih edilmedi — harici/dinamik
görseller), 4 adet `no-console` (`src/lib/logger.ts` tarayıcı adaptöründe — `pino`'nun tarayıcı
bundle'ına girmemesi için kasıtlı `console` kullanımı).

### 1.1 RLS izolasyon doğrulaması (2026-08-16, manuel SQL testi)

- Danışan kendi verisini görüyor (1 profil, kendi 6 form check'i), başka danışanın form check
  ve günlük loglarını **göremiyor (0/0)**.
- Koç tüm veriyi görüyor (3 profil, 12 form check, 28 log).
- Danışanın kendi rolünü `admin` yapma denemesi engellendi
  (`new row violates row-level security policy`).
- `anon` rolü hiçbir şeye erişemiyor (`permission denied for table profiles`).

---

## 2. Tamamlananlar (2026-08-16, "v1.0 production-ready yükseltmesi")

Detaylar için bkz. `UPGRADE_NOTES.md` Bölüm 2 (§2.1–§2.8). Rakamlar gerçek dosya ağacından
doğrulanmıştır.

### TypeScript migrasyonu (detay: UPGRADE_NOTES.md §2.1)

- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noUnusedLocals`/`noUnusedParameters`, `allowJs: false`.
- `src/` altındaki tüm kaynak `.ts`/`.tsx`; eski `.js` dosyaları (`supabase.js`, `helpers.js`,
  `ThemeProvider.js`, `clean.js`, `jsconfig.json`) kaldırıldı.
- `src/types/database.ts` **elle yazıldı**, gerçek şemayla hiç diff'lenmedi (bkz. Bölüm 5).

### Python servisleştirme (detay: UPGRADE_NOTES.md §2.2)

- `ai_backend/app/` katmanlı yapı: `core/`, `routers/` (health, nutrition, recommendations,
  workout), `services/`, `schemas/`, `data/` — doğrulandı, dosya sayıları eşleşiyor.
- Yeni `/recommendations` deterministik öneri motoru; eski `/api/generate-ai-*` uçları
  geriye uyumluluk için `Deprecated` işaretli korunuyor.
- Araç zinciri: `uv` + `ruff` + `mypy --strict` + `pytest --cov-fail-under=70`.

### Supabase şema + RLS (detay: UPGRADE_NOTES.md §2.3)

- 4 migration dosyası (`supabase/migrations/`), 9 tablo: `profiles`, `notifications`,
  `form_checks`, `daily_logs`, `workout_logs`, `program_approvals`, `messages`, `exercises`,
  `food_database`.
- Tüm tablolarda RLS açık, `anon`'dan tüm yetkiler REVOKE edilmiş.
- `is_admin()` / `profile_role()` `SECURITY DEFINER` (infinite recursion önleme,
  bkz. `docs/ARCHITECTURE.md` §3); `increment_streak()` RPC imzası sabit.

### Frontend mimarisi (detay: UPGRADE_NOTES.md §2.4)

- TanStack Query merkezi veri katmanı (`src/lib/query/`), zod + react-hook-form doğrulama.
- `src/lib/api/` tek tip HTTP client + `ApiError`; AI proxy route'ları
  (`src/app/api/ai/{workout,nutrition,recommendations}/route.ts`) — tarayıcı FastAPI'ye asla
  doğrudan istek atmaz.
- Ortak UI bileşenleri: `Skeleton`, `ErrorBoundary`, `QueryState`, `EmptyState`.

### Test altyapısı (detay: UPGRADE_NOTES.md §2.5)

- Vitest + RTL: `tests/unit/` — 7 dosya kök seviyede + 9 bileşen testi = 16 dosya, 180 test.
- pytest: `ai_backend/tests/` — 7 test dosyası + `conftest.py`.
- Playwright: `tests/e2e/` artık dosya sisteminde mevcut (`auth.spec.ts`, `daily-log.spec.ts`,
  `dashboard.spec.ts`, `fixtures.ts`, `README.md`) — `UPGRADE_NOTES.md` yazıldığı sırada bu
  dizin eksikti, sonradan tamamlanmış. Hiç çalıştırılmadı (bkz. Bölüm 5).

### DevOps / CI (detay: UPGRADE_NOTES.md §2.6)

- Kök `Dockerfile` (Next.js standalone) ve `ai_backend/Dockerfile` (Python 3.12-slim,
  non-root, `$PORT` destekli).
- `docker-compose.yml`: `web` + `ai-backend` + opsiyonel minimal `supabase-db`.
- `.github/workflows/ci.yml`: `frontend`, `backend`, `e2e` (yalnızca PR), `docker`,
  `required-checks` job'ları. `e2e` job'u hiç koşmadı (bkz. Bölüm 5).

### Güvenlik (detay: UPGRADE_NOTES.md §2.7)

- İki katmanlı rate limiting: Next.js `middleware.ts` (genel + `/api/ai/*` için 20/dk) ve
  FastAPI `slowapi`.
- CORS allowlist (FastAPI `CORS_ORIGINS`), güvenlik başlıkları (CSP/HSTS/X-Frame-Options),
  yapılandırılmış loglama (`pino`/`structlog`) + `X-Request-ID` korelasyonu.

### Dokümantasyon (detay: UPGRADE_NOTES.md §2.8)

- `README.md`, `docs/ARCHITECTURE.md` (6 ADR-lite kaydı), `docs/DEPLOYMENT.md`,
  `CONTRIBUTING.md`, `CHANGELOG.md`, `ai_backend/README.md`, `supabase/README.md`,
  `data/README.md`.

### Bu turda düzeltilen kritik hatalar (en kritik 5, tam liste: UPGRADE_NOTES.md §3)

1. Bildirimler var olmayan `target_student_id` sütununa yazılıp `student_id`'den okunuyordu —
   bildirimler hiç görünmüyordu.
2. Öğrenci programı onaya gönderdiğinde bildirim koça değil öğrencinin kendisine gidiyordu.
3. Admin server action'ları çağıranın gerçekten admin olduğunu doğrulamıyordu (service-role
   yetkisiyle herkes admin işlemi yapabilirdi).
4. Tarayıcıdan doğrudan `http://localhost:8000` AI çağrısı; CORS `["*"]` + credentials —
   production'da çalışmaz, güvensiz.
5. `downloadCSV` iç içe nesneleri `[object Object]` yazıyordu — beslenme CSV çıktısı tamamen
   kullanılamazdı.

---

## 3. Yükseltme sonrası düzeltme turu

`npm run lint/test/build` zinciri yeşile gelene kadar yapılan düzeltmeler:

- **1 TypeScript hatası:** `WorkoutTab.tsx`'te ölü koşul (`isWaitingMyApproval` zaten `student`
  implike ediyordu; satır ~145/573'te tanım ve yorum mevcut, doğrulandı).
- **12 ESLint hatası:** React 19 `react-hooks` kuralları — `set-state-in-effect` (6 dosya,
  "prop değişince state ayarla" render-sırası kalıbına ve türetilmiş değerlere geçildi),
  `purity` (`Date.now()` render'dan çıkarıldı), `refs` (dosya input'u `key` ile remount),
  `no-html-link-for-pages` (`<a>` → `<Link>`).
- **3 test hatası:** jsdom `Blob.text()`/`arrayBuffer()` sağlamıyor (FileReader'a geçildi);
  `NotificationForm` test fixture'ı uuid olmayan id kullanıyordu (şema doğruydu, fixture
  düzeltildi).
- **Build hataları:** Next 16'da `eslint` config anahtarı kaldırıldı; `outputFileTracingRoot`/
  `turbopack.root` sabitlendi (ev dizinindeki başıboş lockfile yüzünden workspace kökü yanlış
  çıkarılıyordu); **`next-pwa` v5 webpack eklentisi Turbopack ile çakıştığı için build
  `next build --webpack` ile yapılıyor** (`package.json` `build`/`dev` script'lerinde
  doğrulandı: `next build --webpack` / `next dev --webpack`).

### Sağlamlaştırma turu (2026-08-16, ikinci yarı)

- `src/types/database.ts` şemadan yeniden üretildi. **Elle yazılmış 183 alanın tamamı gerçek
  şemayla birebir eşleşti** — nullability, sayısal tipler, `Insert`/`Update` opsiyonellikleri
  dahil. Tek satır kaynak kodu değişmedi. Kazanç: `Relationships` FK metadata'sı (iç içe
  select'ler artık tip çıkarımı yapabiliyor) ve `profile_role` fonksiyonu.
- `ai_backend` ilk kez gerçekten çalıştırıldı: `uv.lock` üretildi, Dockerfile'daki `--frozen`
  fallback'i kaldırıldı, ruff/mypy strict temizlendi, 63 test %92 kapsamla geçti, Docker imajı
  derlenip container içinde doğrulandı.
- **Gerçek mantık hatası bulundu ve düzeltildi:** `detect_rest_days` düz substring eşleşmesi
  yapıyordu; "Pazartesi" yazıldığında "Pazar" da eşleşiyordu (`pazar` alt dize). Kelime sınırı
  regex'ine geçildi. Bu hata orijinal `main.py`'de de vardı.
- **Dockerfile derleme hatası:** `pyproject.toml`'daki `readme = "README.md"` bildirimi ile
  `.dockerignore`'un `*.md` kuralı çakışıyordu; imaj hiç derlenemiyordu. `README.md`
  kopyalanacak şekilde düzeltildi.
- **Mahremiyet düzeltmesi (PWA):** `next.config.mjs` `runtimeCaching` kuralı `profiles`
  yanıtlarını (e-posta + beslenme/antrenman programları) cihazda 7 gün tutuyordu ve logout
  temizliği yoktu. `profiles` önbellekten çıkarıldı (yalnızca `workout_logs` kaldı) ve
  `useSignOut` artık `queryClient.clear()` + workbox cache temizliği yapıyor.
- **Sır sızıntısı engellendi:** `npx supabase start` `supabase/.temp/start-secrets/` dizinini
  üretiyor; `.gitignore`'da değildi (commit'e girecekti) ve ESLint'i 207 hatayla kırıyordu. Hem
  `.gitignore`'a hem ESLint `globalIgnores`'a eklendi.
- **Prettier hizalandı:** `.prettierrc` `semi: true` iken kod tabanının tamamı noktalı
  virgülsüzdü; `semi: false` yapıldı ve tek seferlik format geçildi. `npm run format:check`
  artık temiz (önceden 104 dosyada kırılıyordu).
- **Build artefaktları:** `public/sw.js` ve `public/workbox-*.js` (next-pwa üretimi)
  `.gitignore`'a eklendi.

### E2E doğrulaması ve ortaya çıkardığı hatalar (2026-08-16, üçüncü oturum)

E2E ilk kez koşturuldu ve **dört gerçek sorun** ortaya çıkardı:

1. **Türkçe İ case-folding tuzağı (test tarafı).** `tests/e2e/fixtures.ts` içinde
   `getByLabel(/şifre/i)` hiçbir zaman eşleşmiyordu; giriş sayfasındaki etiket `ŞİFRE` (U+0130
   noktalı büyük İ) ve JavaScript'te `"ŞİFRE".toLowerCase()` sonucu `"şi̇fre"` üretiyor (i +
   U+0307 birleşen nokta). ECMAScript `Canonicalize` İ↔i katlaması yapmaz. Birebir metin
   eşleşmesine (`getByLabel('ŞİFRE')`) geçildi. 12 testin tamamı bu tek satırdan başarısız
   oluyordu.
2. **E-posta/şifre girişi tamamen kapalıydı (yapılandırma hatası).** `supabase/config.toml`'da
   `[auth.email].enable_signup = false` idi; Supabase CLI kaynak kodunda
   (`gotrue.service.ts`) bu anahtar `GOTRUE_EXTERNAL_EMAIL_ENABLED`'e eşleniyor — yani
   **sağlayıcıyı** kapatıyor, kaydı değil. Kendi kendine kayıt zaten ayrı katmanda
   `[auth].enable_signup = false` → `GOTRUE_DISABLE_SIGNUP=true` ile engelleniyordu. Düzeltme:
   `[auth.email].enable_signup = true` (sağlayıcı açık), `[auth].enable_signup = false` (kayıt
   kapalı) korundu. Ayrıca CLI'ın tanımadığı `enabled` anahtarı kaldırıldı. **Bu config
   `supabase config push` ile barındırılan projeye gönderilseydi oradaki tüm girişleri
   kırardı.**
3. **CSP yerel Supabase'i blokluyordu (gerçek geliştirme hatası).** `next.config.mjs`'teki
   `connect-src` yalnızca `https://*.supabase.co` ve `wss://*.supabase.co`'ya izin veriyordu;
   `npx supabase start` ile gelen `http://127.0.0.1:54321` bu desene uymadığı için tarayıcı
   tüm istekleri blokluyordu — yani yerel yığınla geliştirme yapmak imkânsızdı. Düzeltme: CSP
   artık `NEXT_PUBLIC_SUPABASE_URL`'den origin türetip `connect-src` ve `img-src`'ye ekliyor
   (`supabaseCspOrigins()`), wildcard'lar barındırılan projeler için korundu.
4. **Kararsız (flaky) test.** `auth.spec.ts`'teki geri-tuşu senaryosu 5 koşunun 2'sinde
   `page.goBack()` `about:blank`'e düştüğü için başarısız oluyordu. Güvenlik iddiası
   korunarak ölçüm yöntemi doğrudan gezinmeye çevrildi (`page.goto('/')` sonrası `/login`'e
   yönlenme beklentisi); geri tuşu kontrolü `goBack()` dönüş değerine göre koşullu hale
   getirildi. 5 ardışık tam koşu + `--repeat-each=5` (25/25) ile kararlılık kanıtlandı.
   Ayrıca `daily-log.spec.ts`'te Playwright strict mode ihlali vardı (`getByText('Pro: 180g')`
   5 elemana eşleşiyordu, çünkü seed verisinde aynı makro değeri birden çok kayıtta geçiyor).
   Doğrulama en yeni rapor kartına kapsandı.

---

## 4. Alınan kararlar (karar kaydı)

| Tarih      | Karar                                                     | Gerekçe                                                                                                            | Durum                                  |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 2026-08-16 | Rol enum değerleri `admin`/`student` korundu              | Mevcut veri bozulmasın; ürün dilinde admin=koç, student=danışan                                                    | Faz 1'de `coach`/`client`'a taşınacak  |
| 2026-08-16 | **Tek koçlu model benimsendi**                            | Kullanıcı kararı; `profiles.coach_id` ve çok-koç RLS katmanı gereksiz karmaşıklık                                  | Plan v1.1'e işlenecek                  |
| 2026-08-16 | AI çağrıları Next.js route handler proxy'sinden geçer     | API key istemciye sızmasın; CORS ve rate limit tek noktada                                                         | Uygulandı                              |
| 2026-08-16 | PWA korundu, build `--webpack` ile yapılıyor              | `next-pwa` webpack eklentisi; Turbopack'e geçiş PWA'yı feda etmek demek                                            | Uygulandı                              |
| 2026-08-16 | `Result<T>` yerine typed `ApiError` fırlatma sürdürülecek | TanStack Query'nin hata makinesi queryFn'in fırlatmasına dayanır; `Result` sınırın ardında yine `throw`'a çevrilir | Plan v1.1'de §3.4 düzeltilecek         |
| 2026-08-16 | Monorepo (pnpm+Turborepo) ve Expo mobil ertelendi         | En yıkıcı adım, kullanıcı değeri üretmiyor; monorepo'nun tek gerekçesi mobil ve mobil Faz 5'e kadar zorunlu değil  | Plan v1.1'de Faz 4 sonrasına taşınacak |
| 2026-08-16 | **Tek koçlu model**                                        | Kullanıcı kararı; `profiles.coach_id` ve çok-koç RLS katmanı gereksiz karmaşıklık                                  | Plan v1.1'e işlenecek                  |
| 2026-08-16 | **Storage mahremiyet düzeltmesi Faz 1'e ertelendi**        | Uygulama yayında değil. `form_checks.front_pose_url` tam public URL saklıyor; private bucket'a geçmek kolonun yol saklamasını + mevcut satırların dönüştürülmesini gerektiriyor. Planın Faz 1'i `form_checks` tablosunu zaten baştan yazıyor — aynı iş iki kez yapılmayacak | **Faz 1 çıkış kriteri** (bkz. Bölüm 6a) |
| 2026-08-16 | Prettier `semi: false`                                     | Kod tabanının fiili stili; tersi yüzlerce dosyaya gereksiz noktalı virgül eklerdi                                  | Uygulandı                              |
| 2026-08-16 | **CSP, yapılandırılan Supabase adresinden türetiliyor**    | Sabit `*.supabase.co` deseni yerel yığını (`127.0.0.1:54321`) kapsamıyordu ve yerel geliştirmeyi imkânsız kılıyordu | Uygulandı                              |

---

## 5. Açık ve bloke işler

**ÇÖZÜLEN (önceki blokaj):**

- `npx supabase start` çalışmıyordu (`failed to connect to the docker API at
  npipe:////./pipe/docker_engine`, Docker Desktop kapalıydı). **ÇÖZÜLDÜ (2026-08-16):**
  Docker Desktop çalışıyor, yığın ayakta; migration doğrulaması ve RLS testi bu oturumda
  tamamlandı.
- E2E testleri (`npm run test:e2e`) hiç çalıştırılmamıştı. **ÇÖZÜLDÜ (2026-08-16, üçüncü
  oturum):** ilk kez koşturuldu, dört gerçek sorun bulundu ve düzeltildi (bkz. Bölüm 3 "E2E
  doğrulaması ve ortaya çıkardığı hatalar"); paket artık 28/28 yeşil.

**BLOKE:**

- Supabase CLI global PATH'te yok; `supabase ...` yerine `npx supabase ...` kullanılmalı.

Node.js, npm ve git artık PATH'te (bu oturum içinde kuruldu); önceki oturumlarda "bu ortamda
doğrulanamayan şeyler" olarak işaretlenen adımlar artık doğrudan çalıştırılabiliyor — Docker
haricindeki araç eksikliği kaynaklı belirsizlikler ortadan kalktı.

**BİLİNEN KISIT (E2E ortam değişkenleri):** E2E testleri çalışırken uygulama sunucusu yerel
Supabase'e yönlendirilmelidir. `.env.local` **barındırılan** projeyi gösterdiği için, testler
koşulmadan önce build şu ortam değişkenleriyle alınmalıdır:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<npx supabase status ile alınan yerel anon key>
```

**Aksi halde testler barındırılan gerçek veritabanına bağlanır ve oraya veri yazar**
(`daily-log` senaryosu kayıt oluşturuyor).

**BEKLEYEN RİSKLER** (detay: `UPGRADE_NOTES.md` §7):

| Risk                                                                                                                                                                     | Not                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260816090300_storage.sql` doğrudan `storage.objects` üzerine `CREATE POLICY` yazıyor                                                              | **Yerelde sorun yok** — 8 storage politikası `db reset` ile sorunsuz uygulandı (2026-08-16). Ancak barındırılan (hosted) projede `db push` sırasında rolün tablo sahibi olmaması nedeniyle `must be owner of table objects` hatasıyla hâlâ karşılaşılabilir. |
| Storage bucket'ları (`avatars`, `form-checks-media`) **public** (`public = true`, `getPublicUrl` ile servis ediliyor)                                                    | Danışan vücut fotoğrafları URL'yi bilen herkese açık. Private bucket + signed URL'e geçilmeli. Faz 1'e ertelendi (bkz. Bölüm 4 karar kaydı ve Bölüm 6a).                                                     |
| `next.config.mjs` PWA `runtimeCaching`'i `/rest/v1/(workout_logs\|profiles)` yanıtlarını **7 gün** (`maxAgeSeconds: 60*60*24*7`) cihazda tutuyor, logout'ta temizlik yok | Beslenme/antrenman planları ve e-posta içeren veri paylaşılan cihazda mahremiyet sorunu.                                                                                                                      |
| `ai_backend/uv.lock` üretilmedi (dosya yok, doğrulandı)                                                                                                                  | Dockerfile `uv sync --frozen \|\| uv sync` fallback'i kullanıyor, derlemeler tekrarlanabilir değil.                                                                                                           |
| `src/types/database.ts` elle yazıldı                                                                                                                                     | `npm run db:types` ile üretilenle diff'lenmeli.                                                                                                                                                               |
| `npm audit`: 18 zafiyet (3 orta, 13 yüksek, 2 kritik)                                                                                                                    | Büyük ölçüde `next-pwa` v5'in eski bağımlılık ağacından. `npm audit fix --force` ÇALIŞTIRILMAMALI (Next 16'yı düşürebilir).                                                                                   |
| `src/middleware.ts` — Next 16 bu dosya adlandırmasını deprecate etti, `proxy` istiyor                                                                                    | Şu an yalnızca uyarı.                                                                                                                                                                                         |
| CI'daki `e2e` job'u hiç koşmadı                                                                                                                                          | Yerelde `npm run test:e2e` artık 28/28 geçiyor (2026-08-16, üçüncü oturum) ama CI'da hâlâ hiç koşmadı — bkz. aşağıdaki yeni risk satırı.                                                                     |
| CI'daki `e2e` job'u yerel Supabase yığını + seed gerektiriyor                                                                                                            | GitHub Actions üzerinde `supabase start` adımı ve yerel `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` ortam değişkenleri eklenmeden bu job geçemez. Şu an `.github/workflows/ci.yml`'de bu adım yok. |

---

## 6. Sonraki adımlar (sıralı)

1. Docker Desktop'ı başlat → `npx supabase start` → `npx supabase db reset` (storage
   migration hatasına hazırlıklı ol) → `npm run db:types` ile üretilen tipleri elle yazılanla
   diff'le → `npm run type-check` tekrar yeşil.
   **Kabul kriteri:** `db reset` hatasız tamamlanır (veya storage hatası anlaşılıp not
   düşülür), `database.ts` diff'i sıfır veya bilinçli farklarla açıklanır.
2. Mahremiyet turu: `form-checks-media` private + signed URL; PWA `profiles` cache'i kaldır
   veya logout'ta temizle; `uv lock` üret ve Dockerfile fallback'ini kaldır.
   **Kabul kriteri:** form check medyası public URL ile erişilemez (curl testiyle kanıtla,
   bkz. `active_planprogram.md` AC-2.3); `uv.lock` commit'lenir.
3. `ai_backend` doğrulaması: `uv sync`, `uv run ruff check .`, `uv run mypy app`,
   `uv run pytest`.
   **Kabul kriteri:** üçü de hatasız, kapsam ≥ %70.
4. ~~E2E'yi bir kez yerel koştur (seed kullanıcıları: `coach@example.com` /
   `client1@example.com`, şifre `Passw0rd!23`), CI beklentisiyle hizala.~~
   **TAMAMLANDI (2026-08-16, üçüncü oturum):** `npm run test:e2e` yerelde 28/28 geçti (14
   senaryo × chromium + Mobile Chrome). Dört gerçek sorun bulunup düzeltildi (bkz. Bölüm 3);
   CI'daki `e2e` job'u için yerel Supabase kurulumu hâlâ eksik (bkz. Bölüm 5 risk tablosu).
5. **(SIRADAKI İŞ)** `docs/DISCOVERY.md` yaz (mevcut durum envanteri) ve
   **`active_planprogram.md` v1.1 revizyonunu** kullanıcı onayına sun.
   **Kabul kriteri:** envanter + revizyon listesi (bkz. Bölüm 7) kullanıcıya sunulur, onay
   alınmadan Faz 1'e geçilmez.
6. Ardından: revize planın Faz 1'i (veri modeli + RLS) ile başla — mevcut tek-repo yapısında,
   monorepo'suz.
   **Kabul kriteri:** `active_planprogram.md` AC-1.1–AC-1.4 karşılanır.

**Not:** Mevcut RLS politikalarını cilalamaya vakit harcanmamalı; Faz 1 şemayı yeniden
yazacak ve 35 politikanın çoğu değişecek. `db reset`'in amacı "production kalitesi" değil,
"SQL gerçek Postgres'te çalışıyor mu".

---

## 6a. Faz 1 çıkış kriterleri (unutulmaması gereken devir borçları)

Bu bölüm, ertelenen işlerin kaybolmaması için sözleşme niteliğindedir. Faz 1 "bitti"
sayılabilmesi için aşağıdaki maddelerin tamamı karşılanmalıdır:

1. **Hiçbir storage bucket'ı public kalmayacak.** `avatars` ve `form-checks-media` private
   yapılacak, erişim signed URL (TTL ≤ 1 saat) ile olacak — `active_planprogram.md` I-4
   değişmezi bunu zaten şart koşuyor.
2. **`form_checks.front_pose_url`/`back_pose_url` kolonları tam URL değil, bucket içi YOL
   saklayacak.** Mevcut satırlar için veri dönüşümü yazılacak. İstemci okuma anında signed URL
   üretecek (`src/hooks/useFormChecks.ts` ve `src/components/AdminUserManagement.tsx`
   güncellenecek).
3. **`avatars` için aynısı** — `profiles.avatar_url` yol saklayacak (`src/hooks/useProfile.ts`).
4. Rol enum'u `admin`/`student` → `coach`/`client` (tek koçlu model; `coach_id` YOK).
5. Planlar `profiles` içindeki JSON string'lerden normalize tablolara taşınacak; veri
   migrasyonu yazılacak.
6. `src/middleware.ts` → Next 16 `proxy` konvansiyonuna göç.

**ÖNEMLİ NOT:** Uygulama yayında olmasa da `.env.local` **barındırılan** bir Supabase
projesini gösteriyor (`nxftmxkpmuyeelrmwofv.supabase.co`). Migration'lar yalnızca YEREL yığına
uygulandı. Barındırılan projede gerçek danışan verisi/fotoğrafı varsa, oradaki bucket'lar hâlâ
public olabilir ve Faz 1'de bu projeye geçiş yapılırken veri dönüşümü planlanmalıdır.

---

## 7. Plan v1.1 revizyon listesi

`active_planprogram.md`'de değiştirilmesi kararlaştırılan maddeler:

- Faz 0 ikiye bölünsün: monorepo + Expo, Faz 4 sonrasına ertelensin. TypeScript migrasyonu
  maddesi zaten tamamlandı, silinsin.
- §3.4'teki `Result<T>` sözleşmesi, typed `ApiError` fırlatma ile değiştirilsin (TanStack
  Query uyumu).
- §3.1 `profiles.coach_id` ve §3.2'deki çok-koç RLS matrisi **tek koçlu modele**
  sadeleştirilsin (kullanıcı kararı).
- Rol adlandırması (`coach`/`client`) Faz 1'in şema yeniden yazımına bağlansın, ayrı iş
  olarak yapılmasın.
- Faz 1'e **veri migrasyonu** bölümü eklensin: `profiles.workout_plan`/`nutrition_plan` JSON
  string'lerinin normalize tablolara, mevcut `messages` satırlarının `conversations` modeline
  taşınması; eski tabloların drop mu edileceği yan yana mı yaşayacağı.
- Plan Next.js 15 diyor, repo 16'da (`package.json` → `"next": "16.2.10"`) — teknoloji
  tablosu güncellensin.
- Planın şeması mevcut 9 tabloyla uzlaştırılsın (planda `conversations`, versiyonlu
  `workout_plans`, `progress_entries` var; repoda yok. Repoda `form_checks` var ama `status`
  kolonu yok — doğrulandı, `ARCHITECTURE.md` ER diyagramında `status` alanı görünmüyor).

---

## 8. Ertelenenler (v2 / sonraki fazlar)

pnpm+Turborepo, Expo mobil, nonce tabanlı CSP, Redis/Upstash rate limiter, `next-pwa` →
`@ducanh2912/next-pwa` veya Turbopack'e geçiş, `middleware` → `proxy` göçü, `exercises.csv`
için Git LFS, `useAdminId()`'nin koç oturumlarında gereksiz çalışması, planların `jsonb`
sütuna taşınması.

---

## 9. Oturum günlüğü

| Tarih      | Oturum özeti                                                                                                                                                                  | Sonuç                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 2026-08-16 | v1.0 production-ready yükseltmesi (TS migrasyonu, FastAPI servisleştirme, Supabase RLS, test/CI/Docker altyapısı, dokümantasyon) + lint/test/build zincirinin yeşile alınması | lint 0 hata, 180/180 test, build başarılı. DB/E2E doğrulaması Docker eksikliği nedeniyle bekliyor.        |
| 2026-08-16 | `docs/PROGRESS.md` oluşturuldu (oturumlar arası süreklilik için); `supabase/config.toml`'daki `[inbucket]` → `[local_smtp]` deprecation uyarısı düzeltildi                    | `PROGRESS.md` ilk sürümü yazıldı; `config.toml` düzeltmesi tek bölüm adı değişikliği, anahtarlar korundu. |
| 2026-08-16 (ikinci oturum) | Sağlamlaştırma turu: DB/RLS doğrulaması, tip üretimi, ai_backend ilk çalıştırma, PWA mahremiyet düzeltmesi, Prettier hizalama, gitignore artıkları | Tüm kapılar yeşil (lint/type/format/test/build + ruff/mypy/pytest/docker). Storage düzeltmesi Faz 1'e ertelendi. E2E koşuluyor. |
| 2026-08-16 (üçüncü oturum) | E2E doğrulaması: Playwright ilk kez koşturuldu; Türkçe İ locator tuzağı, kapalı e-posta sağlayıcısı, CSP'nin yerel Supabase'i bloklaması ve iki kararsız/hatalı test düzeltildi | 28/28 E2E geçti (chromium + Mobile Chrome). Sağlamlaştırma turu kapandı. |
