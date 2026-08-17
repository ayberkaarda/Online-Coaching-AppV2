# Yükseltme Notları — Closed-Loop Coaching Hub

Bu doküman, projenin hobi seviyesindeki düz JavaScript/tek-dosya haline ekleneceği son büyük
yükseltmenin (paralel ajanlarla yürütülen) sonuçlarını özetler: neyin yapıldığı, hangi mevcut
hataların düzeltildiği, kullanıcının fark edeceği davranış değişiklikleri, bu ortamda
doğrulanamayanlar ve sıradaki adımlar.

---

## 1. Özet

Proje, tek dosyalık script'lere ve düz JavaScript'e dayanan bir hobi projesinden; TypeScript
strict, katmanlı bir FastAPI servisi, Supabase RLS ile korunan bir veritabanı ve tam bir
test/CI/Docker altyapısına sahip production-ready bir mimariye taşındı. "Closed-Loop Coaching
Hub" — koçların danışanlarını antrenman/beslenme/ilerleme verisiyle yönettiği, AI destekli plan
önerilerinin daima koç onayından geçtiği bir online koçluk platformu — değişmedi; değişen,
kod tabanının güvenlik, tip güvenliği, test edilebilirlik ve dağıtılabilirlik olgunluğu.

Frontend tarafında Next.js 16 + React 19 üzerine TanStack Query ile merkezi bir veri katmanı,
zod + react-hook-form ile doğrulama, `src/lib/api/` altında tek tip bir HTTP istemcisi ve
ortak UI bileşenleri (Skeleton/ErrorBoundary/EmptyState) eklendi. Eski tek dosyalık AI script'i,
Pydantic doğrulamalı, `routers/`/`services/`/`schemas/` katmanlarına ayrılmış bir FastAPI
servisine (`ai_backend/`) dönüştürüldü. Veritabanı tarafında dört migration dosyasıyla 9 tablo,
RLS politikaları ve iki `SECURITY DEFINER` fonksiyon tanımlandı. Bunların yanında, eski koddaki
bir dizi ciddi işlevsel hata (görünmeyen bildirimler, yanlış alıcıya giden onay bildirimi,
render edilmeyen duyuru başlığı, bozuk CSV çıktısı vb.) de bu geçiş sırasında düzeltildi.

Bu belge, ana thread'in (Opus 5) paralel ajanların çıktılarını gözden geçirirken tespit ettiği
birkaç **entegrasyon uyuşmazlığının** (Next.js 16'da kaldırılan `next lint`, tsconfig `types`
dizisinin `@types/node`'u devre dışı bırakması, Dockerfile'ın sabit port bağlaması, taşınan CSV
yollarının güncel olmayan dokümantasyonu, `downloadCSV`'nin iç içe nesneleri `[object Object]`
yazması) düzeltilmesiyle birlikte hazırlandı. Aşağıdaki 7. ve 5. bölümler, bu ortamda
doğrulanamayan noktaları ve bilinen teknik borcu dürüstçe listeler — ilk gerçek `npm install` /
`type-check` çalıştırmasında ek hatalar çıkması beklenmelidir.

---

## 2. Yapılanlar

### 2.1 TypeScript migrasyonu

- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noUnusedLocals`/`noUnusedParameters`, `allowJs: false`, `moduleResolution: "bundler"`.
- `src/` altındaki tüm kaynak dosyalar `.ts`/`.tsx` (bkz. dosya listesi: `src/app/`,
  `src/components/`, `src/hooks/`, `src/lib/`, `src/types/`) — eski `.js` dosyaları
  (`src/lib/supabase.js`, `src/lib/helpers.js`, `src/components/ThemeProvider.js`,
  `src/app/clean.js`, `jsconfig.json`) kaldırıldı (bkz. `CHANGELOG.md` "Kaldırıldı" bölümü).
- `src/types/` yapısı: `database.ts` (Supabase şemasından üretilen tipler), `domain.ts`
  (uygulama içi alan tipleri, ör. `DayName`), `index.ts`.
- **Not:** `src/types/database.ts` şu an **elle yazılmış**. Gerçek şemayla senkron olduğu
  doğrulanmamıştır; `npm run db:types` çalıştırılıp diff'lenmelidir (bkz. Bölüm 6 ve 7).

### 2.2 Python backend servisleştirme

- Yeni dizin yapısı: `ai_backend/app/main.py` (factory), `core/` (`config.py`, `errors.py`,
  `logging.py`, `rate_limit.py`, `security.py`), `routers/` (`health.py`, `nutrition.py`,
  `recommendations.py`, `workout.py`), `services/` (`csv_loader.py`, `diet_generator.py`,
  `nutrition_calculator.py`, `recommendation_engine.py`, `workout_generator.py`), `schemas/`
  (`common.py`, `nutrition.py`, `recommendations.py`, `workout.py`), `data/` (`constants.py`,
  `exercise_library.py`, `food_db.py`).
- Endpoint tablosu (bkz. `ai_backend/README.md`):

  | Metod  | Yol                        | Durum                                                               |
  | ------ | -------------------------- | ------------------------------------------------------------------- |
  | `POST` | `/analyze/workout`         | Güncel                                                              |
  | `POST` | `/analyze/nutrition`       | Güncel                                                              |
  | `POST` | `/recommendations`         | Güncel (yeni, deterministik/kural tabanlı öneri motoru)             |
  | `GET`  | `/health`, `/health/ready` | Güncel                                                              |
  | `POST` | `/api/generate-ai-workout` | Deprecated (geriye uyumluluk, `/analyze/workout` ile aynı mantık)   |
  | `POST` | `/api/generate-ai-diet`    | Deprecated (geriye uyumluluk, `/analyze/nutrition` ile aynı mantık) |

- Pydantic (`>=2.9`) + `pydantic-settings` ile şema ve ortam değişkeni doğrulaması.
- `app/services/csv_loader.py`: eski `src/app/clean.js` (Node.js) betiğinin Python karşılığı,
  CLI olarak da çalıştırılabilir (`uv run python -m app.services.csv_loader ...`).
- Araç zinciri: `uv` (bağımlılık/venv), `ruff` (lint + format, `ai_backend/pyproject.toml` →
  `[tool.ruff]`), `mypy --strict` (`disallow_untyped_defs`, `warn_return_any`), `pytest` +
  `pytest-cov` (`--cov-fail-under=70`, testler `ai_backend/tests/`).

### 2.3 Supabase & veritabanı

- 4 migration dosyası (`supabase/migrations/`): `20260816090000_initial_schema.sql` (enum'lar,
  tablolar, indeksler), `20260816090100_functions_and_triggers.sql` (`is_admin`,
  `handle_new_user`, `increment_streak`), `20260816090200_rls_policies.sql` (RLS + GRANT/REVOKE),
  `20260816090300_storage.sql` (bucket'lar + storage politikaları).
- 9 tablo: `profiles`, `notifications`, `form_checks`, `daily_logs`, `workout_logs`,
  `program_approvals`, `messages`, `exercises`, `food_database` (bkz. `docs/ARCHITECTURE.md`
  Bölüm 2 için ER diyagramı).
- RLS özeti: tüm tablolarda RLS açık, `anon` rolünden `public` şemadaki tüm yetkiler REVOKE
  edilmiş; satır sahipliği (`student_id = auth.uid()`) veya koç yetkisi (`is_admin()`) ile
  süzülüyor. Tam matris (tablo × SELECT/INSERT/UPDATE/DELETE) ve storage bucket politikaları
  için bkz. `supabase/README.md` Bölüm 4.
- `public.is_admin(uid uuid default auth.uid())` ve `public.profile_role(uid uuid default
auth.uid())`: `SECURITY DEFINER`, `profiles` tablosundaki RLS'in kendi kendini çağırıp
  `infinite recursion` hatası vermesini önlemek için (bkz. `docs/ARCHITECTURE.md` Bölüm 3).
- `public.increment_streak(user_id uuid) -> integer`: seri (streak) mantığı — bugün ise
  değişmez, dün ise +1, daha eski/`NULL` ise 1'e sıfırlanır; imzası **değiştirilemez**
  (istemci kodu `rpc('increment_streak', { user_id })` ile çağırıyor).
- Storage politikaları: `avatars` ve `form-checks-media` bucket'ları — sahiplik dosya adı
  ön ekinden (`<auth.uid()>-...`) doğrulanıyor, klasör bazlı değil (bkz. `supabase/README.md`
  "Neden `storage.foldername(name)[1]` değil?").
- `supabase/seed.sql`: yalnızca yerel geliştirme için — 1 koç + 2 danışan, form check/günlük
  log/antrenman/bildirim/mesaj/program onayı demo verisi; tüm bloklar idempotent.

### 2.4 Frontend mimarisi

- TanStack Query: `src/lib/query/keys.ts` (merkezi `queryKeys` fabrikası, kök anahtarlar
  prefix-invalidation için), `src/lib/query/queryClient.ts` (`staleTime: 60s`, `gcTime: 5dk`,
  4xx hatalarda retry yok, mutasyonlarda `retry: 0`).
- zod + react-hook-form: `src/lib/validation/schemas.ts`.
- `src/lib/api/` merkezi client: `client.ts` (`apiFetch`, tek tip `ApiError`), `ai.ts`,
  `types.ts` (AI sözleşme tipleri), `proxy.ts` (`handleAiProxy` — sunucu tarafı AI proxy
  yardımcısı, hata eşlemesi için bkz. `docs/ARCHITECTURE.md` Bölüm 5).
- AI proxy route'ları: `src/app/api/ai/{workout,nutrition,recommendations}/route.ts` —
  tarayıcı FastAPI'ye asla doğrudan istek atmıyor, `X-API-Key` ve `X-Request-ID` yalnızca
  sunucu-sunucu isteğinde ekleniyor.
- Ortak UI bileşenleri: `src/components/ui/{Skeleton,ErrorBoundary,QueryState,EmptyState}.tsx`;
  bildirimler `sonner` toast ile (`alert()` yerine).
- Erişilebilirlik: ARIA etiketleri, klavye navigasyonu, `prefers-reduced-motion` desteği
  (README "Eklendi" bölümünde belirtiliyor; kapsamı dosya bazında bu inceleme sırasında
  ayrıca doğrulanmadı).

### 2.5 Test altyapısı

- **Vitest + React Testing Library**: `vitest.config.ts` — ortam `jsdom`, kapsam eşikleri
  (`v8` provider) `lines 60 / functions 60 / branches 55 / statements 60`. Testler
  `tests/unit/` altında (`api-client`, `domain`, `env`, `query-keys`, `rate-limit`, `schemas`,
  `utils` ve `tests/unit/components/{EmptyState,ErrorBoundary,QueryState,Skeleton,
ThemeToggle}.test.tsx`). Çalıştırma: `npm run test` / `npm run test:coverage`.
- **pytest (backend)**: `ai_backend/tests/` — `conftest.py`, `test_csv_loader.py`,
  `test_health.py`, `test_nutrition_router.py`, `test_nutrition_service.py`,
  `test_recommendations_router.py`, `test_workout_router.py`, `test_workout_service.py`.
  Eşik `--cov-fail-under=70`.
- **Playwright (E2E)**: `playwright.config.ts` — `testDir: './tests/e2e'`, chromium +
  Mobile Chrome projeleri, `webServer` testten önce `npm run build && npm run start`
  otomatik çalıştırıyor. **Bu inceleme sırasında `tests/e2e/` dizini repoda henüz mevcut
  değildi** (bkz. Bölüm 5 ve 7) — README'de anılan `tests/e2e/README.md` ve senaryo
  dosyaları büyük olasılıkla hâlâ başka bir ajan tarafından yazılıyor.

### 2.6 DevOps & CI/CD

- Dockerfile'lar: kök `Dockerfile` (Next.js, multi-stage, `output: 'standalone'`) ve
  `ai_backend/Dockerfile` (Python 3.12-slim, multi-stage, non-root `appuser`, uid 1001).
- `docker-compose.yml`: `web` (3000) + `ai-backend` (8000) + opsiyonel minimal `supabase-db`
  (54322, yalnızca izole/CI smoke test için — gerçek yerel geliştirme için `npx supabase start`
  önerilir).
- `.github/workflows/ci.yml`: `frontend` (lint/type-check/test/build), `backend`
  (ruff/mypy/pytest), `e2e` (yalnızca `pull_request`), `docker` (build, push yok),
  `required-checks` (hepsinin sonucunu toplayan gate).
- `.github/dependabot.yml`: bağımlılık güncelleme otomasyonu.
- `.env.example`: tüm ortam değişkenlerinin şablonu; `src/env.ts` içinde zod ile runtime
  doğrulaması.

### 2.7 Güvenlik & kalite

- Rate limiting iki katmanlı: Next.js `middleware.ts` (IP+yol bazlı, `/api/*` genel,
  `/api/ai/*` için 20/dk özel sınır) ve FastAPI `slowapi` (`RATE_LIMIT`, `/analyze/*` ve
  `/recommendations` için 20/dk).
- CORS sertleştirme: FastAPI `CORS_ORIGINS` artık açık bir allowlist (`["*"]` + credentials
  değil).
- Güvenlik başlıkları (`next.config.mjs`): CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Yapılandırılmış loglama: frontend `pino` (`src/lib/logger.ts`), backend `structlog`; her
  AI proxy isteğinde uçtan uca `X-Request-ID` korelasyonu.
- Hata yakalama: AI proxy (`src/lib/api/proxy.ts`) upstream hata gövdesini istemciye asla
  iletmiyor, yalnızca sunucu loguna yazıyor; FastAPI `ENVIRONMENT=production`'da generic hata
  mesajına dönüyor.

### 2.8 Dokümantasyon

- `README.md` (kurulum, mimari diyagramları, komutlar, ortam değişkenleri, proje yapısı),
  `docs/ARCHITECTURE.md` (veri modeli, auth/RLS gerekçesi, AI proxy tasarımı, 6 ADR-lite kaydı),
  `docs/DEPLOYMENT.md` (Vercel/Railway/Fly.io/Supabase adım adım, env matrisi, rollback,
  izleme), `CONTRIBUTING.md`, `CHANGELOG.md`, `ai_backend/README.md`, `supabase/README.md`,
  `data/README.md`. `tests/e2e/README.md`, README'de anılıyor ancak bu inceleme sırasında
  `tests/e2e/` dizini repoda bulunamadı (bkz. Bölüm 5).

---

## 3. Düzeltilen mevcut hatalar

| Hata                                                                                                         | Etkisi                                                       | Nerede düzeltildi                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Bildirimler var olmayan `target_student_id` sütununa yazılıp `student_id`'den okunuyordu                     | Bildirimler hiç görünmüyordu                                 | `src/app/actions.ts` (satır ~217-220, yorumla işaretli)                                  |
| Öğrenci programı onaya gönderdiğinde bildirim koça değil öğrencinin kendisine gidiyordu                      | Koç onay bekleyen programdan haberdar olmuyordu              | `src/components/tabs/WorkoutTab.tsx`                                                     |
| Duyuru başlığı (`title`) hiç render edilmiyordu                                                              | Duyurular başlıksız görünüyordu                              | `src/components/tabs/AnnouncementsTab.tsx` (satır 57-59)                                 |
| Admin program editörü `document.getElementById().value` ile DOM'dan okuyordu                                 | React state ile senkron değildi, kırılgan                    | `src/components/AdminUserManagement.tsx`                                                 |
| Drawer kapanmadığında `document.body` scroll kilidi kalıyordu                                                | Arkaplan sayfası kilitli kalıyordu                           | `src/components/AdminUserManagement.tsx` (satır 102-105, `overflow` temizleme)           |
| Admin server action'ları çağıranın admin olduğunu doğrulamıyordu                                             | Service-role yetkisiyle herkes admin işlemi yapabilirdi      | `src/app/actions.ts` (satır 71-75, `profile.role !== 'admin'` kontrolü eklendi)          |
| Tarayıcıdan doğrudan `http://localhost:8000` AI çağrısı; CORS `["*"]` + credentials                          | Production'da çalışmaz, güvensiz                             | `src/app/api/ai/*`, FastAPI `CORS_ORIGINS`                                               |
| Çakışan iki Tailwind config dosyası; tanımsız `animate-fadeIn`/`custom-scrollbar` sınıfları                  | Tutarsız stil derlemesi                                      | Tailwind yapılandırması tekilleştirildi                                                  |
| Günlük makrolar veritabanına string olarak yazılıyordu                                                       | Sorgulanamaz, tip güvensiz veri                              | `daily_logs.macros` artık `jsonb` (bkz. `DailyLogTab.tsx`, `{ protein, carb, fat }`)     |
| `downloadCSV` iç içe nesneleri `[object Object]` olarak yazıyordu                                            | Beslenme CSV çıktısı (`NutritionTab`) tamamen kullanılamazdı | `src/lib/utils.ts` — bu görevde düzeltildi (bkz. Bölüm "Bu görevde yapılan düzeltmeler") |
| `src/lib/supabase.js` service-role anahtar referansını istemci tarafından da import edilen modülde tutuyordu | Service-role anahtarının istemci bundle'ına sızma riski      | Kaldırıldı; yerine `src/lib/supabase/admin.ts` (`server-only` paketiyle korumalı)        |

---

## 4. Davranış değişiklikleri (kullanıcının bilmesi gerekenler)

- `alert()` çağrıları kaldırıldı, yerine `sonner` toast bildirimleri geldi.
- Boş/yükleniyor durumları artık standart `Skeleton`/`EmptyState` bileşenleriyle gösteriliyor
  (rastgele "Yükleniyor..." metinleri yerine).
- `daily_logs` artık `UNIQUE(student_id, log_date)` — aynı gün ikinci giriş **günceller**
  (upsert), yeni satır açmaz (`onConflict: 'student_id,log_date'`).
- AI antrenman planında adım sayısı varsayılanı 6000 → 6500 (6000 hiçbir seçenekle
  eşleşmiyordu, arayüz yanlış/boş bir seçenek gösteriyordu).
- `WorkoutTab`'daki hiç render edilmeyen manuel antrenman log formu (ölü kod) kaldırıldı.
- Günlük veri (beslenme) CSV çıktısı artık düz sütunlara ayrılıyor; iç içe nesneler JSON
  string olarak yazılıyor (bkz. Bölüm "Bu görevde yapılan düzeltmeler").
- Profil sayfasında programlar artık ham JSON yerine gün gün okunabilir biçimde gösteriliyor.

---

## 5. Bu ortamda DOĞRULANAMAYAN şeyler

Bu makinede `node`, `npm`, `python`, `git` PATH'te **yok**. Hiçbir build/test/lint/type-check
komutu bu görev kapsamında çalıştırılamadı. Tüm kod statik inceleme (dosya okuma, grep,
sözleşme/tip uyumu kontrolü) ile yazıldı ve gözden geçirildi. **İlk gerçek `npm install` /
`npm run type-check` çalıştırmasında ek tip hataları çıkması beklenebilir** — özellikle
elle yazılmış `src/types/database.ts`'in gerçek şemayla uyuşup uyuşmadığı hiç doğrulanmadı.

Ayrıca bu inceleme sırasında somut olarak gözlemlenen, henüz doğrulanamayan/eksik olabilecek
bir nokta: `playwright.config.ts` içindeki `testDir: './tests/e2e'` dizini bu görev
sırasında dosya sisteminde **bulunamadı** (yalnızca `tests/unit/` mevcuttu). README'de
`tests/e2e/README.md`'den bahsediliyor olması, bu dizinin başka bir ajan tarafından hâlâ
yazılmakta olduğuna işaret ediyor olabilir; ancak bu görev bitiminde durumu tekrar kontrol
etmek gerekir — aksi halde `npm run test:e2e` boş/başarısız sonuç verir.

`docs/DEPLOYMENT.md` Bölüm 2 (Railway), Dockerfile'daki sabit `--port 8000`'in Railway'de
`$PORT`'a uymadığını "bu değişiklik henüz kod tabanında yapılmamıştır" notuyla belgeliyordu.
Bu görev kapsamında `ai_backend/Dockerfile` **düzeltildi** (bkz. Bölüm "Bu görevde yapılan
düzeltmeler") — ancak `docs/DEPLOYMENT.md` bu inceleme ajanının sahip olduğu dosyalar arasında
değildi, dolayısıyla o belgedeki ilgili not artık **güncelliğini yitirmiş durumda** ve ayrı bir
düzenlemeyle güncellenmelidir.

---

## 6. Sıradaki adımlar

Aşağıdaki adımları **sırayla** çalıştırın. `npm run type-check` ilk gerçek doğrulama noktasıdır
ve muhtemelen ilk hataların çıkacağı yerdir.

```bash
# 1) Frontend bağımlılıklarını kurar
npm install

# 2) İLK GERÇEK DOĞRULAMA — TypeScript strict tip kontrolü.
#    src/types/database.ts elle yazıldığı için burada hata çıkması olası.
npm run type-check

# 3) ESLint (flat config, eslint.config.mjs)
npm run lint

# 4) Vitest birim/bileşen testleri
npm run test

# 5) Production build (next.config.mjs: output: 'standalone')
npm run build

# 6) Yerel Supabase yığınını başlatır (Postgres + Auth + Storage + Studio)
npx supabase start

# 7) DİKKAT: YEREL VERİTABANINI TAMAMEN SİLER ve tüm migration'ları + seed.sql'i yeniden uygular.
#    Yalnızca yerel/geliştirme ortamında çalıştırın, production'a ASLA karşı çalıştırmayın.
npx supabase db reset

# 8) database.ts'i GERÇEK şemadan yeniden üretir — elle yazılmış olanla diff'leyin,
#    farklılık varsa tip hatalarının kaynağı budur.
npm run db:types

# 9) AI backend: bağımlılık kurulumu, lint, tip kontrolü, testler
cd ai_backend && uv sync && uv run ruff check . && uv run mypy app && uv run pytest

# 10) E2E testler (tests/e2e/ dizininin mevcut ve dolu olduğunu önce doğrulayın — bkz. Bölüm 5)
npm run test:e2e
```

### Windows PowerShell karşılıkları

PowerShell'de `&&` yoktur; sıralı ama koşulsuz zincirleme için `;` kullanın, bir önceki
komutun başarısını kontrol etmek isterseniz `if ($?) { ... }` ekleyin.

```powershell
npm install
npm run type-check
npm run lint
npm run test
npm run build
npx supabase start

# DİKKAT: yerel veritabanını TAMAMEN SİLER, migration + seed'i yeniden uygular.
npx supabase db reset

npm run db:types

Set-Location ai_backend
uv sync
uv run ruff check .
uv run mypy app
uv run pytest
Set-Location ..

npm run test:e2e
```

---

## 7. Bilinen riskler ve teknik borç

Öncelik sırasına göre:

| Risk                                                                                                                                           | Etki                                                                         | Öneri                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/` dizini bu görev sırasında dosya sisteminde bulunamadı, `playwright.config.ts` ona işaret ediyor                                   | `npm run test:e2e` boş sonuç verir veya CI `e2e` job'u başarısız olur        | Dizinin gerçekten yazılıp yazılmadığını kontrol edin; eksikse önce en az bir kritik akış (giriş → günlük veri girişi → dashboard doğrulama, README'de tarif edildiği gibi) için senaryo eklenmeli |
| `docs/DEPLOYMENT.md`'deki Railway notu artık güncel değil (Dockerfile bu görevde `$PORT` destekler hale getirildi)                             | Dokümantasyon-kod tutarsızlığı, kafa karıştırıcı                             | `docs/DEPLOYMENT.md` Bölüm 2'deki ilgili paragraf güncellenmeli (bu görevin dosya sahipliği kapsamı dışında bırakıldı)                                                                            |
| `next-pwa` v5 sürdürülmüyor, Next.js 16 ile uyumu doğrulanmadı                                                                                 | PWA/service worker davranışı üretimde beklenmedik şekilde bozulabilir        | `@ducanh2912/next-pwa`'ya geçiş değerlendirilmeli                                                                                                                                                 |
| CSP'de `script-src 'unsafe-inline'` (App Router hydration script'i nedeniyle)                                                                  | XSS yüzeyi teorik olarak daha geniş                                          | Nonce tabanlı CSP'ye geçiş (`next.config.mjs` içinde zaten TODO ile işaretli)                                                                                                                     |
| Bellek içi rate limiter (Next.js middleware + FastAPI `slowapi` `MemoryStorage`) tek instance'ta çalışır                                       | Çok-instance/yatay ölçeklemede gerçek limit `N × limit`'e çıkar              | Upstash Redis / `@vercel/kv` gibi paylaşımlı bir sayaç deposu                                                                                                                                     |
| `ai_backend/uv.lock` üretilmedi, `Dockerfile`'daki `uv sync --frozen --no-dev \|\| uv sync --no-dev` fallback'i kilitsiz kuruluma izin veriyor | Reprodüklenebilir olmayan build'ler                                          | `uv lock` çalıştırılıp commit'lenmeli, ardından Dockerfile'daki fallback kaldırılmalı                                                                                                             |
| `src/types/database.ts` elle yazıldı, gerçek şemayla hiç karşılaştırılmadı                                                                     | Tip güvenliği yanıltıcı olabilir                                             | `npm run db:types` çalıştırılıp diff kontrol edilmeli (bkz. Bölüm 6, adım 8)                                                                                                                      |
| Planlar (`profiles.nutrition_plan`/`workout_plan`) `text` sütununda JSON string olarak tutuluyor                                               | Postgres tarafında sorgulanamaz/indekslenemez, versiyon geçmişi yok          | `jsonb`'ye migration veya ayrı `plan_versions` tablosu (bkz. `docs/ARCHITECTURE.md` Bölüm 6)                                                                                                      |
| Test kapsamı eşikleri (frontend %60/%55, backend %70) ilk çalıştırmada karşılanmayabilir                                                       | CI kırmızı başlayabilir                                                      | İlk `npm run test:coverage` / `uv run pytest` sonucuna göre eksik testler tamamlanmalı                                                                                                            |
| `data/exercises.csv` 8.7 MB repoda düz dosya olarak duruyor                                                                                    | Repo boyutu/clone süresi                                                     | Git LFS'e taşıma değerlendirilmeli (`data/README.md`'de zaten not düşülmüş)                                                                                                                       |
| Rol enum'ları `admin`/`student` olarak korundu (ürün dilinde koç/danışan)                                                                      | İsimlendirme kod ile ürün dili arasında sürekli zihinsel çeviri gerektiriyor | İleride yeniden adlandırma bir migration + tüm RLS/RPC gözden geçirmesi gerektirir (bkz. ADR-3, bilinçli olarak ertelendi)                                                                        |
| `useAdminId()` koç oturumlarında da gereksiz çalışıyor                                                                                         | Küçük, performans etkisi ihmal edilebilir                                    | Düşük öncelik — fırsat bulundukça temizlenebilir                                                                                                                                                  |

---

## 8. Önerilen commit planı (Conventional Commits)

**Bu repoda commit ATILMADI — kullanıcı commit'leri kendisi atacak.** Aşağıdaki liste, çalışmayı
anlamlı, gözden geçirilebilir parçalara bölmek isteyenler için hazır mesaj + `git add` yol
önerileridir. Sırayla uygulanması önerilir (her adım bir öncekinin üzerine inşa eder).

```
1) chore(tooling): TypeScript strict yapılandırması, lint/format ve test runner kurulumu
   -> tsconfig.json package.json eslint.config.mjs .prettierrc .editorconfig .nvmrc
      vitest.config.ts vitest.setup.ts playwright.config.ts postcss.config.mjs tailwind.config.ts

2) feat(db): Supabase şeması, RLS politikaları, RPC fonksiyonları ve seed verisi
   -> supabase/

3) feat(api): FastAPI servis mimarisi, Pydantic doğrulama ve öneri motoru
   -> ai_backend/

4) refactor(core): src/lib ve src/types çekirdek yardımcıları, merkezi API client ve
   Supabase istemcileri
   -> src/lib/ src/types/ src/env.ts

5) feat(ai-proxy): AI proxy route'ları, rate limiting ve middleware
   -> src/app/api/ src/middleware.ts

6) feat(pages): App Router sayfaları ve server action'lar
   -> src/app/ (route.ts hariç, madde 5'te)

7) feat(components): Dashboard sekmeleri, admin yönetimi ve ortak UI bileşenleri
   -> src/components/ src/hooks/

8) test(unit): Vitest birim/bileşen testleri ve pytest backend testleri
   -> tests/unit/ ai_backend/tests/

9) build(docker): Dockerfile'lar, docker-compose ve CI/CD
   -> Dockerfile ai_backend/Dockerfile docker-compose.yml .github/ .dockerignore
      ai_backend/.dockerignore

10) docs: README, ARCHITECTURE, DEPLOYMENT, CONTRIBUTING, CHANGELOG ve alt-dizin README'leri
    -> README.md CHANGELOG.md CONTRIBUTING.md docs/ ai_backend/README.md supabase/README.md
       data/README.md

11) fix(integration): entegrasyon uyuşmazlıkları — lint script'i, tsconfig types dizisi,
    Dockerfile port bağlama, CSV yol referansları, downloadCSV nesne serileştirmesi
    -> package.json tsconfig.json ai_backend/Dockerfile supabase/README.md src/lib/utils.ts
       UPGRADE_NOTES.md
```

Tek seferde tek bir kapsamlı commit ile atmak isteyenler için:

```
feat: TypeScript/FastAPI/Supabase geçişi ile production-ready mimariye yükseltme

Frontend: Next.js 16 + React 19 + TypeScript strict, TanStack Query, zod/react-hook-form,
merkezi API client, AI proxy, ortak UI bileşenleri, erişilebilirlik iyileştirmeleri.
Backend: FastAPI servis mimarisi (routers/services/schemas), Pydantic doğrulama, uv/ruff/mypy.
Veritabanı: Supabase migration'ları, 9 tablo, RLS politikaları, RPC fonksiyonları, seed.
DevOps: Docker/docker-compose, GitHub Actions CI (lint/type-check/test/build/e2e/docker),
dependabot, .env.example + zod env doğrulaması.
Güvenlik: iki katmanlı rate limiting, CORS allowlist, güvenlik başlıkları (CSP/HSTS),
yapılandırılmış loglama (pino/structlog), hata maskeleme.
Test: Vitest+RTL, pytest, Playwright E2E altyapısı.
Dokümantasyon: README, ARCHITECTURE (ADR-lite), DEPLOYMENT, CONTRIBUTING, CHANGELOG.

Ayrıca: bildirim hedef sütunu, program onay bildirimi alıcısı, duyuru başlığı render'ı,
admin panel DOM okuma/scroll kilidi, admin yetki doğrulaması, AI proxy CORS/güvenlik,
Tailwind config çakışması, daily_logs makro tipi ve downloadCSV nesne serileştirmesi
düzeltildi.

BREAKING CHANGE: src/lib/supabase.js ve src/lib/helpers.js kaldırıldı (yerine
src/lib/supabase/* ve src/lib/utils.ts); next lint yerine eslint . kullanılıyor;
daily_logs artık upsert semantiğiyle çalışıyor (UNIQUE(student_id, log_date)).
```

---

## Bu görevde yapılan düzeltmeler (entegrasyon uyuşmazlıkları)

Bu bölüm, ana thread'in tespit ettiği ve bu görev kapsamında düzeltilen 5 spesifik
entegrasyon sorununu belgeler.

1. **`package.json` lint script'i** — Next.js 16'da `next lint` kaldırıldığı için
   `"lint": "next lint"` → `"lint": "eslint ."`, `"lint:fix": "next lint --fix"` →
   `"lint:fix": "eslint . --fix"` olarak değiştirildi. Repo zaten flat config
   (`eslint.config.mjs`) kullandığından ek bağımlılık gerekmedi.
2. **`tsconfig.json` `types` dizisi** — `["vitest/globals", "@testing-library/jest-dom"]`
   dizisi belirtildiğinde TypeScript yalnızca listelenenleri otomatik yüklüyor ve
   `@types/node`'u devre dışı bırakıyordu; bu da `process.env`/`Buffer`/`__dirname` kullanan
   `src/env.ts`, `src/lib/logger.ts`, route handler'lar ve `vitest.config.ts` gibi dosyalarda
   tip hatasına yol açardı. Dizinin başına `"node"` eklendi:
   `["node", "vitest/globals", "@testing-library/jest-dom"]`.
3. **`ai_backend/Dockerfile` port bağlama** — `--port 8000` ve `HEALTHCHECK`'in
   `localhost:8000`'e sabitlenmiş olması Railway/Cloud Run/Heroku gibi `$PORT` enjekte eden
   platformlarda dağıtımı bozardı (bu durum `docs/DEPLOYMENT.md`'de zaten bilinen bir sorun
   olarak belgelenmişti). `ENV`'e `PORT=8000` eklendi, `HEALTHCHECK` `${PORT}` kullanacak
   şekilde güncellendi, `CMD` shell formuna (`sh -c "exec uvicorn ... --port ${PORT:-8000}"`)
   çevrilerek değişken genişlemesi sağlandı. `EXPOSE 8000` dokümantasyon amaçlı korundu.
4. **`supabase/README.md` CSV yolları** — CSV import talimatlarındaki `src/app/*.csv`
   referansları, dosyaların gerçekten taşındığı `data/*.csv` yollarına güncellendi (Yöntem A/B
   ve giriş tablosu dahil); CSV'lerin artık `data/` altında olduğu ve `data/README.md`'de
   belgelendiği eklendi.
5. **`src/lib/utils.ts` → `downloadCSV`** — `Object.values(obj).map(value => \`"${value}"\`)`nesne/dizi değerleri`[object Object]`olarak yazıyordu;`NutritionTab`'ın
`downloadCSV([row], 'Beslenme_Programi', false)`çağrısında her günün değeri`{ items, total }`nesnesi olduğundan beslenme CSV çıktısı tamamen kullanılamaz haldeydi.`toCsvCell(value)`yardımcı fonksiyonu eklendi (nesne/dizi →`JSON.stringify`, `null`/
`undefined`→ boş string, diğerleri →`String(value)`); satır üretiminde bu fonksiyon
kullanılıp mevcut tırnaklama/kaçırma kuralı (`"`→`""`, hücre çift tırnak içine alınır)
korundu. Başlık satırı, BOM, `isText` dalı, boş veri kontrolü ve indirme akışı
   değiştirilmedi.

---

## 9. Faz 1.5 — Güvenlik Denetimi ve Sertleştirme (2026-08-17)

v1.0 yükseltmesi ve ardındaki Faz 1a/1b çalışmalarından sonra, Faz 2'ye (koç-danışan çekirdek
akışı) geçmeden önce ayrı bir faz olarak güvenlik denetimi ve sertleştirme yürütüldü
(`active_planprogram.md` §3a). Bu bölüm bu belgenin orijinal amacına uygun olarak neyin
yapıldığını, hangi bulguların kapandığını ve kalan önerileri özetler. Tam kanıt ve gerekçe:
`docs/security/AUDIT.md`; oturum kaydı: `docs/PROGRESS.md` §3.

### 9.1 Denetim

Üç paralel denetim — erişim kontrolü/IDOR/RLS, uygulama yüzeyi (kimlik doğrulama, girdi
doğrulama, dosya yükleme, AI backend, loglama/gizlilik, yapılandırma), otomatik araç taraması
(`npm audit`, `pip-audit`, `semgrep`, `gitleaks`) — canlı SQL rol taklidi ve gerçek HTTP
istekleriyle yürütüldü. **39 bulgu** üretti: Critical 0 · High 10 · Medium 12 · Low 17. Hiçbir
Critical bulgu çıkmadı — RLS satır izolasyonu ve Storage yol tabanlı sahiplik sınırları yapılan
her canlı denemede tuttu. Bulguların ağırlıklı kısmı iki katmandaydı: (a) sunucu tarafı
sütun/durum sözleşme eksikleri (RLS satır seviyesinde doğruydu ama `program_approvals`,
`messages`, `notifications`, `profiles` üzerinde içerik sahteciliğine açıktı), (b) uygulama
yüzeyi koruma katmanları (giriş denemesi sınırı yoktu, tek hız sınırlayıcı `X-Forwarded-For` ile
atlanabiliyordu, deprecated FastAPI uçları API key guard'ından muaftı).

### 9.2 Düzeltme turu — Grup 1, 2, 3 (kullanıcı onaylı, bu turda tamamlandı)

Kullanıcı `docs/security/AUDIT.md` §5'teki altı gruplu düzeltme planının ilk üç grubunu onayladı.

**Kapanan bulgular:**

| Grup                              | Bulgular                                                     | Ne yapıldı                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Kimlik ve yetki kapıları      | AC-01, AC-07, AC-02, A-03, A-04, A-12, A-13                  | `program_approvals` onay kapısı artık BEFORE INSERT/UPDATE trigger'la korunuyor (`status`/`reviewed_by`/`reviewed_at` sunucudan); `handle_new_user()` artık istemci metadata'sından rol okumuyor; deprecated FastAPI uçlarına API key guard + rate limit eklendi; production'da `AI_BACKEND_API_KEY` eksikse Next.js ve FastAPI ikisi de başlangıçta hata veriyor; FastAPI `/docs`/`/redoc`/`/openapi.json` prod'da kapalı. |
| 2 — Rate limiting ve kaba kuvvet  | A-02, A-09, A-17, A-18, A-19, A-06 (+ A-01 kısmen, bkz. 9.3) | `src/proxy.ts` artık güvenilir proxy sayısına göre XFF'e güveniyor (varsayılan: hiçbir başlığa güvenme); bellek içi hız sınırlayıcı taşmada tüm sayaçları sıfırlamak yerine LRU tahliyesi kullanıyor; `/api/health` hız sınırına tabi; FastAPI hız sınırı doğrulanmış kullanıcı bazında; `jwt_expiry` 3600→900 (kullanıcı kararı).                                                                                          |
| 3 — Sütun seviyesi sözleşmeler    | AC-04, AC-05, AC-08, AC-09, AC-10                            | Mesajlarda alıcı yalnızca `read_at`/`is_read` değiştirebiliyor; danışan→koç bildirim içeriği sabit şablona bağlandı; `profiles.email`/`current_streak`/`last_checkin_at` artık sunucu-sahipli.                                                                                                                                                                                                                              |
| Entegrasyon temizliği (plan dışı) | A-22 fiilen kapandı                                          | `.gitignore`'a `!.env.example` + `!**/.env.example` istisnası eklendi, `.env.example` dosyaları artık takip ediliyor.                                                                                                                                                                                                                                                                                                       |

Toplamda **19 bulgu bu turda kapandı**; önceki bağımlılık yükseltmesi turundan kapanan T-01/T-02/
T-03 ile birlikte **toplam 22/39 bulgu `fixed`**, 17'si açık (Grup 4/5/6 — bkz. 9.4).

**Doğrulama (10/10 yeşil):** type-check temiz · lint 0 hata/12 uyarı · vitest **264/264**
(önceki tur: 230) · `npx supabase db reset` 14 migration temiz · **test:rls 70/70** (önceki tur: 50) · test:transform 26/26 · ruff+mypy temiz · **pytest 82/82, kapsam %94.94** (önceki tur:
%92) · build başarılı · **Playwright 21/21** (iki ardışık koşumda) · format:check temiz.
Kırmızı-yeşil kanıtları (guard/trigger kaldırılınca beklenen reddin gerçekten kayboluşu)
`docs/security/AUDIT.md` §4b'de kayıtlı.

### 9.3 A-01 — plan hedeflenen yoldan kapanmadı, uygulama katmanına taşındı

Bu, en önemli tek istisna olduğu için ayrıca vurgulanıyor: `supabase/config.toml`'a resmi
şemaya uygun bir `[auth.rate_limit]` bölümü eklendi ve konteynerde gerçekten ayarlandığı
doğrulandı — ama düzeltme sonrası 180 ardışık yanlış şifre denemesi hâlâ 180/180 `400` döndürdü,
sıfır `429`. Kök neden doğrulanmış açık bir upstream Supabase hatası:
[supabase/supabase#41947](https://github.com/supabase/supabase/issues/41947) (ayar yanlışlıkla
`rate_limit_otp`'ye yazılıyor, `/token?grant_type=password` hiç korunmuyor).

**`supabase/config.toml`'da `[auth.rate_limit]` bölümünün var olması giriş denemelerinin
korunduğu anlamına gelmez.** Yapılandırma kaldırılmadı (upstream düzelirse otomatik etkinleşir)
ama fiili koruma **uygulama katmanına** taşındı: yeni `src/app/api/auth/sign-in/route.ts` +
`src/lib/api/auth-rate-limit.ts` — e-posta başına 10 başarısız deneme / 15 dakika, başarılı
girişte sayaç sıfırlanır, aşımda `429` + `Retry-After`; `src/hooks/useSession.ts` artık doğrudan
GoTrue'ya değil bu uca gidiyor.

**Kabul edilen artık risk (yumuşatılmadı):** saldırgan bilinen bir e-postayı hedef alarak 15
dakikalığına kilitleyebilir (hedefli hesap kilitleme). Alternatif olan paylaşılan IP kovası
değerlendirildi ve reddedildi — tek saldırganın aynı NAT/proxy arkasındaki **tüm** kullanıcıları
kilitleyebileceği daha kötü bir takas olurdu; IP kovası yalnızca güvenilir bir proxy sayısı
yapılandırıldığında (`TRUSTED_PROXY_COUNT > 0`) devreye giriyor.

### 9.4 Kalan öneriler (Grup 4, 5, 6 — henüz uygulanmadı)

Düzeltme planının geri kalanı `docs/security/AUDIT.md` §5'te tanımlı, kullanıcı onayı bekliyor:

- **Grup 4 — girdi doğrulama ve gövde sınırları** (AC bulgusu yok; A-07, A-08, A-20, A-21):
  yükleme öncesi magic-byte doğrulaması, istemci tarafı boyut/tip kontrolü, uzantı allowlist'i,
  proxy `Content-Length` sınırı.
- **Grup 5 — yapılandırma sertleştirme ve savunma derinliği** (AC-03, AC-06, AC-11, A-05, A-10,
  A-11, A-14, A-15, A-16, T-04 — A-06/A-13/A-22 bu turda erken kapandığı için listeden çıkarıldı,
  bkz. `AUDIT.md` §5 Grup 5 notu): `authenticated` rolünden `TRUNCATE` yetkisinin geri alınması,
  `FORCE ROW LEVEL SECURITY`, `serverSchema`'nın `server-only` modüle taşınması, güvenlik olayı
  loglaması, logger redact listesinin genişletilmesi, CSP nonce'a geçiş (`unsafe-inline`
  kaldırma), oturum token'larının httpOnly cookie'ye taşınması, `next-pwa`'nın `devDependencies`'e
  taşınması.
- **Grup 6 — dokümantasyon ve CI tarama zinciri** (T-05): `docs/security/THREAT-MODEL.md`, kök
  `SECURITY.md`, CI'a semgrep/gitleaks/`npm audit`/`pip-audit` adımları.

**Ayrıca kaydedilmesi gereken borç (yeni, bu turdan):** AC-05'in danışan→koç bildirim şablon
metni artık iki yerde yaşıyor — `supabase/migrations/20260817160200_column_guards.sql`
(`notifications_guard_content()` trigger'ı) ve `src/hooks/useProgramApprovals.ts`. Biri
diğerinden bağımsız değişirse program gönderimi `42501` ile **gürültülü** kırılır (sessiz değil,
RLS test paketi bu senaryoyu kilitliyor). Doğru çözüm ikisini `SECURITY DEFINER` bir RPC'ye
taşımak; uygulama kodunun da değiştirilebildiği bir sonraki turda yapılmalı.

**Kısmen kapanan / gözden geçirilmesi gereken bulgular:**

- **A-06 (logout token iptali)** — `jwt_expiry` 900'e düşürüldü ama logout hâlâ access token'ı
  sunucu tarafında iptal etmiyor; yalnızca geçerlilik penceresi kısaldı.
- **A-19 (bellek içi rate limiter)** — taşma davranışı LRU'ya çevrildi (artık taşmada tüm
  sayaçlar sıfırlanmıyor) ama mimari hâlâ bellek içi ve tek instance; çok-instance dağıtımda
  gerçek limit `N × limit`'e çıkar.
- **A-01'in upstream bağımlılığı** — [supabase/supabase#41947](https://github.com/supabase/supabase/issues/41947)
  düzeldiğinde `[auth.rate_limit]`'in gerçekten koruma sağlayıp sağlamadığı yeniden test
  edilmeli; koruyorsa uygulama katmanı sınırlayıcısıyla çakışma/gereksiz katman durumu gözden
  geçirilmeli.
