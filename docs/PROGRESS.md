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

| Kontrol                                                                | Komut                                                     | Durum                                                                                           | Tarih      |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Lint                                                                   | `npm run lint`                                            | Temiz — 0 hata, 12 bilinçli uyarı                                                               | 2026-08-16 |
| Tip kontrolü                                                           | `npm run type-check`                                      | Temiz                                                                                           | 2026-08-16 |
| Biçim                                                                  | `npm run format:check`                                    | Temiz                                                                                           | 2026-08-16 |
| Birim/bileşen testleri                                                 | `npm run test`                                            | 192/192 (17 dosya)                                                                              | 2026-08-16 |
| Production build                                                       | `npm run build`                                           | Başarılı                                                                                        | 2026-08-16 |
| Backend lint                                                           | `uv run ruff check .`                                     | Temiz                                                                                           | 2026-08-16 |
| Backend tip (strict)                                                   | `uv run mypy app`                                         | Temiz, 28 dosya                                                                                 | 2026-08-16 |
| Backend testleri                                                       | `uv run pytest`                                           | 63 test, kapsam %92 (eşik %70)                                                                  | 2026-08-16 |
| Backend Docker imajı                                                   | `docker build` + container                                | Derlendi, `/health` doğrulandı                                                                  | 2026-08-16 |
| Veritabanı migration'ları                                              | `npx supabase db reset`                                   | Uygulandı — 9 tablo, 37 politika, 8 storage politikası, 6 fonksiyon                             | 2026-08-16 |
| RLS izolasyonu                                                         | Manuel SQL testi                                          | Doğrulandı (bkz. §1.1)                                                                          | 2026-08-16 |
| E2E testleri                                                           | `npm run test:e2e`                                        | 16 senaryo × 2 profil (chromium + Mobile Chrome)                                                | 2026-08-16 |
| RLS politika testleri                                                  | `npm run test:rls`                                        | 19 senaryo, hepsi geçti                                                                         | 2026-08-16 |
| Veritabanı migration'ları (rol yeniden adlandırması sonrası)           | `npx supabase db reset`                                   | Sıfırdan uygulandı, hatasız (`20260817090000_rename_roles.sql` dahil)                           | 2026-08-17 |
| RLS politika testleri (rol yeniden adlandırması sonrası)               | `npm run test:rls`                                        | 19/19 — tekrar doğrulandı, hiçbir senaryo düşmedi                                               | 2026-08-17 |
| Birim/bileşen testleri (rol yeniden adlandırması sonrası)              | `npm run test`                                            | 192/192 — tekrar doğrulandı                                                                     | 2026-08-17 |
| E2E testleri (rol yeniden adlandırması sonrası)                        | `npm run test:e2e`                                        | 16 senaryo × 2 profil — tekrar doğrulandı                                                       | 2026-08-17 |
| Production build (rol yeniden adlandırması sonrası)                    | `npm run build`                                           | Başarılı — tekrar doğrulandı                                                                    | 2026-08-17 |
| Tip kontrolü (storage mahremiyeti + AI tel protokolü sonrası)          | `npm run type-check`                                      | Temiz                                                                                           | 2026-08-17 |
| Lint (storage mahremiyeti + AI tel protokolü sonrası)                  | `npm run lint`                                            | Temiz — 0 hata, 12 bilinçli uyarı                                                               | 2026-08-17 |
| Biçim (storage mahremiyeti + AI tel protokolü sonrası)                 | `npm run format:check`                                    | Temiz                                                                                           | 2026-08-17 |
| Birim/bileşen testleri (storage mahremiyeti sonrası)                   | `npm run test`                                            | **203/203 (18 dosya)** — `src/lib/storage.ts` testleri dahil                                    | 2026-08-17 |
| Production build (storage mahremiyeti sonrası)                         | `npm run build`                                           | Başarılı                                                                                        | 2026-08-17 |
| Veritabanı migration'ları (storage mahremiyeti sonrası)                | `npx supabase db reset`                                   | Sıfırdan uygulandı, hatasız (`20260817100000_private_storage.sql` dahil), katalog geri yüklendi | 2026-08-17 |
| RLS politika testleri (storage mahremiyeti sonrası)                    | `npm run test:rls`                                        | 19/19 — tekrar doğrulandı                                                                       | 2026-08-17 |
| E2E testleri (storage mahremiyeti sonrası)                             | `npm run test:e2e`                                        | 16/16 (chromium) — signed URL akışıyla tekrar doğrulandı                                        | 2026-08-17 |
| Backend lint/tip/test (storage mahremiyeti + AI tel protokolü sonrası) | `uv run ruff check . && uv run mypy app && uv run pytest` | Temiz — 63 test, kapsam %92                                                                     | 2026-08-17 |

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

### Kritik kırık düzeltmeleri (dördüncü oturum)

`docs/DISCOVERY.md` envanterinin ortaya çıkardığı üç kırık ve düzeltmeleri:

1. **Danışan mesajlaşmayı hiç kullanamıyordu.** `profiles_select` politikası
   `id = auth.uid() OR is_admin()` olduğu için danışan koçun profil satırını göremiyordu →
   `useAdminId()` null → `MessagesTab`'da sohbet partneri boş. Düzeltme:
   `supabase/migrations/20260816100000_fix_rls_visibility.sql` — politikaya `role = 'admin'`
   koşulu eklendi (satırın kendi kolonu, alt sorgu değil; özyineleme yok).
2. **Koç, onaya sunulan programdan haberdar olmuyordu.** `notifications_insert` WITH CHECK'i
   danışanın koça bildirim yazmasını reddediyordu. Düzeltme: aynı migration —
   `SECURITY DEFINER` `public.is_coach_profile(uuid)` yardımcısı eklendi ve politikaya
   `OR public.is_coach_profile(student_id)` kondu.
3. **`/api/ai/*` proxy uçlarında oturum kontrolü yoktu** (planın §5.3 ihlali). Giriş yapmamış
   herkes AI backend'ini kullanabiliyordu. Düzeltme: `src/lib/api/ai.ts` istemci tarafında
   `Authorization: Bearer <token>` gönderiyor, `src/lib/api/proxy.ts` sunucu tarafında
   `getUser()` ile doğruluyor; kimliksiz istek upstream'e **hiç ulaşmıyor**.

Ayrıca kaydedilenler:

- **Bilinçli takas:** koçun `profiles` satırı artık tüm giriş yapmış kullanıcılara açık
  (e-posta dahil). Tek koçlu modelde kabul edildi; koça özel hassas bir kolon eklenirse
  kolon-sınırlı view'a geçilmeli. Migration başlığında ve `supabase/README.md`'de kayıtlı.
- **`INSERT ... RETURNING` tuzağı:** `RETURNING` ek olarak SELECT görünürlüğü ister; danışan
  koça yazdığı bildirimi geri okuyamaz. Çağıran kod (`useProgramApprovals.ts`) düz `.insert()`
  yaptığı için sorun yok — `.select()` eklenirse kırılır. İki ajan bağımsız olarak keşfetti.

### Regresyon korumaları

Bu kırıkların testlerden kaçmış olması asıl sorundu. Eklenen korumalar:

- `supabase/tests/rls.test.sql` — 19 senaryo, `BEGIN/ROLLBACK` ile veri değiştirmez,
  başarısızlıkta `raise exception` + sıfırdan farklı çıkış kodu. **Testin gerçekten
  kırılabildiği kanıtlandı** (kasten bozulan beklenti `EXIT_CODE=3` verdi). `npm run test:rls`.
- `tests/e2e/messaging.spec.ts` — 2 senaryo, iki tarayıcı bağlamıyla danışan→koç→realtime
  yanıt zinciri. Bu akış daha önce hiç test edilmiyordu.
- `tests/unit/proxy-auth.test.ts` — 12 test; en kritik iddia: kimliksiz istekte `fetch`
  **hiç çağrılmıyor**.
- CI: RLS testleri `e2e` job'una eklendi (`supabase db reset` sonrası, build öncesi), container
  adı için koruma adımı ile.

### Faz 1a — çıkış kriterleri (2026-08-17, rol yeniden adlandırması)

`active_planprogram.md` §3.1 (R4) rol adlandırma maddesinin ilk parçası bağımsız bir migration
olarak yürütüldü: `supabase/migrations/20260817090000_rename_roles.sql`.

**Kapsam:**

- Enum: `user_role` değerleri `admin` → `coach`, `student` → `client` (`ALTER TYPE ... RENAME
VALUE`).
- Fonksiyon: `public.is_admin(uuid)` → `public.is_coach(uuid)` (imza korundu).
- Kolonlar: 5 tabloda (`notifications`, `form_checks`, `daily_logs`, `workout_logs`,
  `program_approvals`) `student_id` → `client_id`; bağımlı indeks/kısıt/FK adları da hizalandı.
- Kod: `isAdmin()` → `isCoach()`, `useAdminId()` → `useCoachId()`, `AdminUserManagement.tsx` →
  `CoachUserManagement.tsx`, `selectedStudentIds` → `selectedClientIds`, `createStudentSchema` →
  `createClientSchema` (38 dosya).

**`RENAME VALUE`'nun veriyi koruduğu doğrulandı:** `ALTER TYPE ... RENAME VALUE` etiketin
`pg_enum` OID'ini korur; satır verisi ve politika ifadelerindeki enum sabitleri OID ile
saklandığı için hem mevcut satırlar hem de RLS ifadeleri otomatik olarak yeni etiketi gösterir.
`db reset` sonrası `profiles` tablosunda 1 coach + 2 client satır sayısıyla veri sağlam kaldı —
veri kaybı olmadı.

**Fonksiyon yeniden adlandırmanın politikaları bozmadığı (OID) doğrulandı:** `ALTER FUNCTION
... RENAME TO` fonksiyonun OID'ini korur; RLS politikaları fonksiyona OID ile referans verdiği
için `is_admin()` → `is_coach()` sonrası **34 politika** (public + storage.objects) hiçbiri
düşmeden otomatik olarak yeni fonksiyon adına döndü (`pg_policies` çıktısı doğrulandı).

**Kritik istisna — `increment_streak()` elle güncellendi:** plpgsql gövdesi `public.is_admin()`
çağrısını **ad ile** çözer (OID ile değil). Adım 6'daki yeniden adlandırmadan sonra bu çağrı
sessizce çalışma zamanında `function public.is_admin() does not exist` hatasıyla kırılacaktı —
migration bu yüzden `increment_streak()`'i `CREATE OR REPLACE` ile ayrıca güncelledi (gövdesi
`public.is_coach()` çağırır hale geldi, imza — `user_id` parametre adı dahil — değişmedi).

**Bilinçli istisnalar:**

- AI backend tel protokolünde `student_id` alanı korundu
  (`ai_backend/app/schemas/recommendations.py` bu adı bekliyor) — ayrı bir işte hizalanacak.
- Kullanıcıya görünen Türkçe arayüz metinleri değişmedi ("Öğrenci Paneli", "Yönetici Paneli",
  "Öğrenci Portföyü", "Öğrenci Ara" vb.) — ürün dili ayrı bir iş.
- Eski migration dosyaları (`20260816*`) hâlâ eski adları içeriyor; zaman sıralı uygulandığı
  için doğru çalışıyor, sorun değil.

**Doğrulama:** `db reset` sıfırdan, 19/19 RLS, 192/192 birim, 16/16 E2E, build başarılı (bkz.
§1 tablosuna eklenen 2026-08-17 satırları).

**ADR ayrıştırması:** Aynı oturumda `active_planprogram.md` §0.6 (R10) / AC-1.7 kapsamındaki
ADR ayrıştırma işi de tamamlandı — `docs/ARCHITECTURE.md` §7'deki 6 gömülü "ADR-lite" kaydı
`docs/adr/NNNN-<slug>.md` dosyalarına ayrıştırıldı ve rol yeniden adlandırma kararı yeni bir
ADR (`0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md`) olarak eklendi; bu da eski
`0003-rol-enum-degerlerinin-korunmasi.md` kararının yerini aldı (`Durum: Yerini aldı: 0013`).
`docs/adr/README.md` indeksi itibarıyla dizinde toplam **13 ADR dosyası** var (0001–0013).

### Faz 1a — storage mahremiyeti (2026-08-17)

`active_planprogram.md` §3.3 / I-4 çıkış kriteri `supabase/migrations/20260817100000_private_storage.sql`
ile karşılandı.

**Kapsam:**

- `storage.buckets`: `avatars` ve `form-checks-media` artık `public = false` (önceden ikisi de
  `true`).
- Kolonlar tam URL değil YOL saklıyor: `form_checks.front_pose_url` → `front_pose_path`,
  `form_checks.back_pose_url` → `back_pose_path`, `profiles.avatar_url` → `avatar_path`. Mevcut
  satırlardaki tam public URL'ler aynı migration içinde regex ile yola dönüştürüldü
  (storage dışı mutlak URL'ler — ör. `placehold.co` — bilinçli olarak dönüştürülmedi, bkz.
  Bölüm 5).
- `storage.objects` üzerindeki eski "herkese açık okuma" politikaları
  (`avatars_public_read`, `form_checks_public_read`, `anon` dahil) kaldırıldı; yerine iki yeni
  SELECT politikası geldi: `avatars_select_own_or_coach`,
  `form_checks_select_own_or_coach` — ikisi de "sahip veya koç" (`public.is_coach()`), yalnız
  `authenticated` rolüne.
- Yeni `src/lib/storage.ts`: `SIGNED_URL_TTL_SECONDS = 3600` (I-4'ün "TTL ≤ 1 saat" şartı),
  `SIGNED_URL_STALE_TIME_MS` = TTL'in yarısı (30 dk) — imzalı adres içeren TanStack Query
  sorguları bu süreyle bayatlatılır ki önbellekteki adres süresi dolmadan tazelensin.
  `createSignedUrl`/`createSignedUrls` (toplu, N+1 önler) hata durumunda **fırlatmaz**, `null`
  döner; çağıran taraf placeholder gösterir.
- Güncellenen hook'lar: `useFormChecks` artık `FormCheckWithUrls[]` döner (imzalı
  `frontPoseUrl`/`backPoseUrl` alanları eklenmiş), `useProfile`/`useProfiles` artık
  `ProfileWithAvatar[]`/`ProfileWithAvatar` döner (imzalı `avatarUrl`).
  `src/components/AdminUserManagement.tsx` (→ `CoachUserManagement.tsx`, bkz. rol yeniden
  adlandırma bölümü) bu imzalı adresleri kullanacak şekilde güncellendi.

**Mahremiyet kanıtı (curl ile doğrulandı, AC-1.6/AC-2.3):**

| Erişim yolu                                                     | Beklenen   | Gözlenen                             |
| --------------------------------------------------------------- | ---------- | ------------------------------------ |
| Kimliksiz `GET /storage/v1/object/public/<bucket>/<path>`       | Erişilemez | **400** `NoSuchBucket`               |
| Anon key ile `GET /storage/v1/object/<bucket>/<path>` (imzasız) | Erişilemez | **400** `NoSuchKey`                  |
| İmzalı adres (`createSignedUrl` çıktısı), sahibi veya koç       | Erişilir   | **200**                              |
| Bozulmuş/geçersiz imza                                          | Erişilemez | **400**                              |
| Başka bir danışanın dosyası için imza üretmeye çalışma          | Reddedilir | İmza üretilemiyor (RLS SELECT reddi) |
| Koçun aynı dosya için imza üretmesi                             | İzinli     | İmza üretiliyor                      |

### Faz 1a — AI tel protokolü (2026-08-17)

`RecommendationRequest.student_id` alanı hem `ai_backend/app/schemas/recommendations.py`
(Pydantic) hem TypeScript tarafında (`src/lib/api/types.ts` → `RecommendationInput.student_id`,
`src/lib/validation/schemas.ts` → `recommendationSchema.student_id`) **bilinçli olarak
değiştirilmedi**. Gerekçe: bu uç (`/api/ai/recommendations` → FastAPI `/recommendations`) kod
tabanında hiçbir yerden çağrılmıyor (`useRecommendations` hook'u tanımlı ama hiçbir bileşen
kullanmıyor); adı hizalamak izole, riski olmayan bir değişiklik ama bu turun kapsamı dışında
bırakıldı — ayrı bir işte, gerçek bir tüketici eklendiğinde hizalanacak.

### Faz 1.5 — güvenlik denetim turu (2026-08-17)

`active_planprogram.md` §3a kapsamındaki Faz 1.5'in **denetim yarısı** tamamlandı; düzeltmeler
henüz başlamadı.

**Denetim sonucu:** Üç paralel denetim tamamlandı, üç rapor diskte:

- `docs/security/findings-access-control.md` (631 satır) — erişim kontrolü / IDOR / RLS, 12
  bulgu (AC-01…AC-12) + 26 test boşluğu (G-01…G-26).
- `docs/security/findings-app-surface.md` (~48 KB) — uygulama yüzeyi, 22 bulgu (A-01…A-22).
- `docs/security/tooling-baseline.md` — otomatik araç taraması, 5 bulgu (T-01…T-05).
- `docs/security/AUDIT.md` — birleşik yönetici raporu (§1 özet, §2 39 bulguluk birleşik tablo,
  §3 çakışma analizi, §4 yükseltme sonrası durum, §5 altı gruplu bağımlılık sıralı düzeltme
  planı, §6 bulgu değil, §7 açık sorular).

**Severity dağılımı:** Critical 0 · High 10 · Medium 12 · Low 17 · toplam 39. Critical bulgu
üretilmemesinin nedeni: RLS satır izolasyonu ve Storage yol tabanlı sahiplik sınırları canlı SQL
rol taklidi ve gerçek HTTP istekleriyle yapılan her denemede tuttu.

**En ciddi dört bulgu (hepsi `open`):** AC-01 `program_approvals` onay kapısı INSERT ile
atlatılıyor · AC-02 `handle_new_user()` rolü kullanıcı metadata'sından geliyor · A-01 giriş
denemeleri hiçbir katmanda sınırlanmıyor · A-02/A-03 hız sınırlayıcı XFF ile atlanıyor ve
deprecated FastAPI uçları API key guard'ından muaf.

**Yöntem:** statik inceleme + canlı SQL rol taklidi (`set local role authenticated` +
`set local request.jwt.claims`, tüm yazma testleri `ROLLBACK` içinde) + gerçek HTTP istekleri
(GoTrue / PostgREST / Storage API / FastAPI) + `npm audit`, `pip-audit`, `semgrep`, `gitleaks`
(çalışma ağacı + 34 commitlik geçmiş).

**Bu turda uygulanan tek değişiklik — bağımlılık yükseltmesi:** `next` 16.2.10 → 16.3.1,
`eslint-config-next` 16.2.10 → 16.3.1, `sharp` transitif 0.34.5 → 0.35.3 (`overrides` gerekmedi),
`postcss` ve `nanoid` düzeldi. `next-pwa` kırılmadı, `next build --webpack` sıfır uyarıyla
derledi. Doğrulama zinciri 12/12 yeşil: type-check temiz · lint 0 hata / 12 beklenen uyarı · 230
birim · 50 RLS · 26 transform · build başarılı · 21 Playwright E2E · format temiz. `npm audit`
18 → 14; kapanan T-01/T-02/T-03. Kalan 14'ün hiçbiri çalışma zamanına ulaşmıyor (7 test zinciri,
7 `next-pwa@5.6.0` build eklentisi kökünden).

**Durum ve sonraki adım:** Faz 1.5'in denetim yarısı bitti. **Düzeltmeler kullanıcı onayı
bekliyor** — faz protokolü gereği önce rapor, sonra onay, sonra düzeltme; her düzeltme kendi
regresyon testiyle. Düzeltme planı `docs/security/AUDIT.md` §5'te altı gruba ayrıldı: Grup 1
kimlik ve yetki kapıları (M) · Grup 2 rate limiting ve kaba kuvvet (L) · Grup 3 sütun seviyesi
sözleşmeler (M) · Grup 4 girdi doğrulama ve gövde sınırları (M) · Grup 5 yapılandırma
sertleştirme ve savunma derinliği (L) · Grup 6 dokümantasyon ve CI tarama zinciri (M).

**Açık kullanıcı kararları:** AC-12 hosted projede ayrı doğrulama · A-06 logout'un access
token'ı iptal etmemesi (`jwt_expiry=3600`) · `next-pwa` legacy `--webpack` yolunun ne zaman terk
edileceği.

**Operasyonel notlar (gelecek oturumlar için):**

- Harness alt-ajanların rapor `.md` dosyalarını `Write` ile yazmasını engelliyor
  (`"Subagents should return findings as text, not write report files."`) — çözüm: `Edit` aracı
  veya Bash heredoc.
- Bash komutları ~8 KB üzerinde içerik ortasında kırpılıyor ve yanıltıcı `unexpected EOF` hatası
  veriyor — uzun dosyalar 6 KB'ın altındaki parçalara bölünüp `>>` ile eklenmeli.

**Plan dokümanı güncel değil:** `active_planprogram.md` §3a.3 Kova 1 madde 7,
`supabase/tests/rls.test.sql`'in 35 senaryo içerdiğini söylüyor; dosya artık 50 senaryo içeriyor
(bu turun doğrulama zincirindeki "50 RLS" sonucuyla uyumlu). `active_planprogram.md` bilerek
değiştirilmedi; bu not onun yerine geçen güncel kayıttır.

### Faz 1.5 — düzeltme turu, Grup 1–3 (2026-08-17)

Kullanıcı `docs/security/AUDIT.md` §5'teki altı gruplu planın Grup 1 → 2 → 3'ünü onayladı; bu
oturumda üçü de uygulandı ve regresyon kanıtıyla kapatıldı (tam detay: `docs/security/AUDIT.md`
§4b). Kova 4, 5, 6 (girdi doğrulama/gövde sınırları, yapılandırma sertleştirme, dokümantasyon/CI
tarama zinciri) **açık** kaldı.

**Kapanan bulgular (19/39, önceki turdan T-01/T-02/T-03 ile birlikte toplam 22/39):**

- **Grup 1 (kimlik ve yetki kapıları):** AC-01, AC-07, AC-02, A-03, A-04, A-12, A-13. Yeni
  migration'lar `supabase/migrations/20260817160000_program_approval_guard.sql` (onay kapısı
  BEFORE INSERT/UPDATE trigger'ı, `status`/`reviewed_by`/`reviewed_at` sunucudan) ve
  `20260817160100_signup_role_hardening.sql` (`handle_new_user()` artık istemci metadata'sından
  rol okumuyor); `ai_backend` legacy router'lara API key guard + rate limit; production'da
  `AI_BACKEND_API_KEY` eksikse Next.js ve FastAPI ikisi de fail-fast; FastAPI `/docs` prod'da
  kapalı.
- **Grup 2 (rate limiting ve kaba kuvvet):** A-02, A-09, A-17, A-18, A-19 + bonus A-06 (kullanıcı
  kararı, `jwt_expiry` 3600→900). `src/proxy.ts` artık `TRUSTED_PROXY_COUNT` tabanlı bir güven
  modeliyle çalışıyor (varsayılan: hiçbir XFF başlığına güvenme); `src/lib/rate-limit.ts` taşmada
  LRU tahliye kullanıyor (önceden tüm sayaçları sıfırlıyordu — bu, sınırlayıcının kendisini bir
  DoS koluna çeviriyordu); FastAPI hız sınırı artık doğrulanmış kullanıcı bazında.
  **A-01 (giriş denemesi sınırı) planlandığı gibi kapanmadı** — `[auth.rate_limit]`
  yapılandırması doğru eklendi ve konteynerde ayarlandığı kanıtlandı, ama 180 ardışık yanlış
  şifre denemesi hâlâ `429` üretmedi. Kök neden doğrulanmış bir upstream Supabase hatası
  (`supabase/supabase#41947` — ayar `rate_limit_otp`'ye yazılıyor, şifre girişini korumuyor).
  Koruma bunun yerine `src/app/api/auth/sign-in/route.ts` + `src/lib/api/auth-rate-limit.ts` ile
  **uygulama katmanında** kuruldu (e-posta başına 10 deneme/15 dk). **`[auth.rate_limit]`'in
  config.toml'da duruyor olması korunduğumuz anlamına gelmiyor — bu tuzağa düşülmemeli, bkz.
  `docs/security/AUDIT.md` §4b/§7.**
- **Grup 3 (sütun seviyesi sözleşmeler):** AC-04, AC-05, AC-08, AC-09, AC-10 — tek migration
  `supabase/migrations/20260817160200_column_guards.sql`. Mesajlarda alıcı yalnızca
  `read_at`/`is_read` değiştirebiliyor; danışan→koç bildirim içeriği bilinen şablona
  bağlandı (RPC değil trigger — RPC'ye geçiş mevcut `notifications_insert` politikasını
  kırardı); `profiles.email`/`current_streak`/`last_checkin_at` yeni `is_end_user_write()`
  yardımcısıyla sunucu-sahipli hale geldi.

**Kayıtlı borç:** AC-05'in danışan→koç bildirim şablon metni artık iki yerde yaşıyor (trigger +
`src/hooks/useProgramApprovals.ts`). Biri diğerinden bağımsız değişirse program gönderimi
`42501` ile kırılır (sessiz değil, RLS test paketi yakalıyor). Doğru çözüm — ikisini
`SECURITY DEFINER` bir RPC'ye taşımak — uygulama kodunun da değiştirilebildiği bir sonraki turda
yapılmalı.

**Entegrasyon temizliği:** `.gitignore`'a `!.env.example` + `!**/.env.example` istisnası eklendi
(A-22'yi fiilen kapatıyor, bkz. `AUDIT.md` §4b tutarsızlık notu); `useProgramApprovals.ts`'teki
ölü `reviewed_by`/`reviewed_at`/`reviewerId` kodu temizlendi; `playwright.config.ts` ve
`.github/workflows/ci.yml`'e A-12 sertleştirmesi nedeniyle gereken `AI_BACKEND_API_KEY` eklendi;
`ai_backend/.env.example` yeni eklendi; `docker-compose.override.yml.example`'daki
`uvicorn main:app` → `uvicorn app.main:app` hatası düzeltildi.

**Doğrulama (10/10 yeşil):** type-check temiz · lint 0 hata/12 uyarı · vitest **264/264**
(önceki tur: 230) · `db reset` 14 migration temiz · **test:rls 70/70** (önceki tur: 50) ·
test:transform 26/26 · ruff+mypy temiz · **pytest 82/82, kapsam %94.94** (önceki tur: %92) ·
build başarılı · **Playwright 21/21** (iki ardışık koşumda) · format:check temiz.

**Kırmızı-yeşil kanıtları:** trigger düşürülünce AC-01/AC-07 senaryosu beklenen `42501` yerine
hatasız geçti ("onay kapısı açık"); `handle_new_user` eski haline alınınca AC-02 istemci
metadata'sıyla gerçekten koç oluşturulabildiğini gösterdi; A-03 guard'ı kaldırılınca 4 pytest
`assert 200 == 401` ile kırıldı; A-02 sahte XFF ile `[200,200,200,200,200]` (bypass) → düzeltme
sonrası `[200,200,200,429,429]`; A-01 uygulama katmanı kontrolü kapatılınca 10 test
`expected 401 to be 429` ile kırıldı; `is_end_user_write()` sunucu bağlamı taklit edecek şekilde
bozulunca G-16 beklenen `client` yerine `coach` döndü ("yetki yükseltme açık").

**Durum:** Grup 1–3 tamamlandı. Grup 4 (girdi doğrulama/gövde sınırları), Grup 5 (yapılandırma
sertleştirme/savunma derinliği), Grup 6 (dokümantasyon/CI tarama zinciri) açık — sıradaki iş.
Açık kullanıcı kararları: AC-12 hosted projede ayrı doğrulama (değişmedi), `next-pwa` legacy
`--webpack` yolu (değişmedi). A-06 bu turda çözüldü (`jwt_expiry=900`, kısmi — logout hâlâ
token'ı sunucu tarafında iptal etmiyor).

---

## 4. Alınan kararlar (karar kaydı)

| Tarih      | Karar                                                               | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Durum                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-16 | Rol enum değerleri `admin`/`student` korundu                        | Mevcut veri bozulmasın; ürün dilinde admin=koç, student=danışan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Faz 1'de `coach`/`client`'a taşınacak                                                                                                                         |
| 2026-08-16 | **Tek koçlu model benimsendi**                                      | Kullanıcı kararı; `profiles.coach_id` ve çok-koç RLS katmanı gereksiz karmaşıklık                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Plan v1.1'e işlenecek                                                                                                                                         |
| 2026-08-16 | AI çağrıları Next.js route handler proxy'sinden geçer               | API key istemciye sızmasın; CORS ve rate limit tek noktada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Uygulandı                                                                                                                                                     |
| 2026-08-16 | PWA korundu, build `--webpack` ile yapılıyor                        | `next-pwa` webpack eklentisi; Turbopack'e geçiş PWA'yı feda etmek demek                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Uygulandı                                                                                                                                                     |
| 2026-08-16 | `Result<T>` yerine typed `ApiError` fırlatma sürdürülecek           | TanStack Query'nin hata makinesi queryFn'in fırlatmasına dayanır; `Result` sınırın ardında yine `throw`'a çevrilir                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Plan v1.1'de §3.4 düzeltilecek                                                                                                                                |
| 2026-08-16 | Monorepo (pnpm+Turborepo) ve Expo mobil ertelendi                   | En yıkıcı adım, kullanıcı değeri üretmiyor; monorepo'nun tek gerekçesi mobil ve mobil Faz 5'e kadar zorunlu değil                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Plan v1.1'de Faz 4 sonrasına taşınacak                                                                                                                        |
| 2026-08-16 | **Tek koçlu model**                                                 | Kullanıcı kararı; `profiles.coach_id` ve çok-koç RLS katmanı gereksiz karmaşıklık                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Plan v1.1'e işlenecek                                                                                                                                         |
| 2026-08-16 | **Storage mahremiyet düzeltmesi Faz 1'e ertelendi**                 | Uygulama yayında değil. `form_checks.front_pose_url` tam public URL saklıyor; private bucket'a geçmek kolonun yol saklamasını + mevcut satırların dönüştürülmesini gerektiriyor. Planın Faz 1'i `form_checks` tablosunu zaten baştan yazıyor — aynı iş iki kez yapılmayacak                                                                                                                                                                                                                                                                                                                                                                                                   | **Faz 1 çıkış kriteri** (bkz. Bölüm 6a)                                                                                                                       |
| 2026-08-16 | Prettier `semi: false`                                              | Kod tabanının fiili stili; tersi yüzlerce dosyaya gereksiz noktalı virgül eklerdi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Uygulandı                                                                                                                                                     |
| 2026-08-16 | **CSP, yapılandırılan Supabase adresinden türetiliyor**             | Sabit `*.supabase.co` deseni yerel yığını (`127.0.0.1:54321`) kapsamıyordu ve yerel geliştirmeyi imkânsız kılıyordu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Uygulandı                                                                                                                                                     |
| 2026-08-16 | Koç profili tüm authenticated kullanıcılara görünür                 | Mesajlaşmanın çalışması için zorunlu; tek koçlu modelde kabul edilebilir takas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Uygulandı                                                                                                                                                     |
| 2026-08-16 | AI proxy'leri Bearer token ile korunuyor                            | Plan §5.3; kimliksiz erişim kapatıldı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Uygulandı                                                                                                                                                     |
| 2026-08-16 | RLS testleri SQL script olarak yazıldı (pgTAP değil)                | Ek bağımlılık gerektirmiyor, `psql` ile CI'da doğrudan koşuyor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Uygulandı                                                                                                                                                     |
| 2026-08-17 | Roller `coach`/`client` olarak yeniden adlandırıldı                 | Ürün dili ile şema hizalandı; `RENAME VALUE` veri kaybı olmadan taşıdı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Uygulandı — ADR-0003'ün yerini alan `docs/adr/0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md` yazıldı                                            |
| 2026-08-17 | Storage private + signed URL (TTL 1 saat)                           | I-4 değişmezi ihlal ediliyordu (public bucket + tam URL saklayan kolonlar); danışan vücut fotoğrafları URL'yi bilen herkese açıktı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Uygulandı — `supabase/migrations/20260817100000_private_storage.sql`, `src/lib/storage.ts`                                                                    |
| 2026-08-17 | **Güvenlik sertleştirmesi ayrı bir faz olarak planlandı (Faz 1.5)** | `securityhardening_prompt.md` mevcut durumla uzlaştırılıp `active_planprogram.md` §3a'ya "Faz 1.5 — Güvenlik Denetimi ve Sertleştirme" olarak işlendi. **Neden Faz 1 ile Faz 2 arasına:** (a) RLS ve şema Faz 1'de yeniden yazılıyor — denetim daha erken yapılsaydı sonucu boşa giderdi; (b) Faz 2 bu temelin üstüne yeni saldırı yüzeyi (plan yayınlama, form check kuyruğu, realtime mesajlaşma) ekliyor, temel önce sağlamlaştırılmalı. Faz numaraları kaymasın diye bölüm `§3a` olarak eklendi (§6a/§6b konvansiyonu)                                                                                                                                                    | Planlandı — prompt maddelerinin 20'si "zaten kapalı" (kanıtlı), 9'u "geçersiz/uyarlandı", 17'si "açık" olarak sınıflandırıldı (`active_planprogram.md` §3a.3) |
| 2026-08-17 | AI tel protokolünde `student_id`'ye alias eklenmedi                 | `RecommendationRequest`/`recommendationSchema` hiçbir yerden çağrılmayan bir uca ait (`useRecommendations` tanımlı ama hiçbir bileşen kullanmıyor); riski olmayan ama gereksiz bir değişiklik, gerçek tüketici eklenince hizalanacak                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ertelendi — bkz. §3 "Faz 1a — AI tel protokolü"                                                                                                               |
| 2026-08-17 | **Görsel kimlik: "Demir & Tebeşir" paleti, tema ve token mimarisi** | Kimlik bugüne kadar hiç karara bağlanmamış, varsayılanların toplamıydı: `#8b5cf6` birebir Tailwind `violet-500` ve beyaz üstünde ~4.2:1 ile WCAG AA'yı geçmiyor; `next/font` hiç kullanılmıyor. 6 adlandırılmış hex (Tebeşir `#F4F4F1`, Demir `#14161B`, Menevis `#5B48D9` / koyu `#A79BFF`, Kapanış `#0F7A4C`, Kehribar `#B45D00`, Plaka Kırmızısı `#C22F2F`); mor atılmadı, **kaydırıldı** (aynı ton ailesi, ~6:1). Kanonik referans **açık tema**; gym modu tema-bağımsız (her zaman Demir). Tek kaynak `src/design/tokens.ts` — Faz 4.5'te Expo'ya taşınan bu dosyadır, Tailwind sınıfları değil. Tipografi: Archivo / Hanken Grotesk / IBM Plex Mono, ağırlık tavanı 700 | Planlandı — ADR-0015; uygulama `active_planprogram.md` §3b (Faz 1.6)                                                                                          |
| 2026-08-17 | **Fonksiyonel emoji emekli edildi, `lucide-react`'e geçiliyor**     | ~60 emoji / 15 dosya fonksiyonel ikon rolünde. Emoji hiçbir platformda aynı render edilmiyor, `currentColor` ile token'lara uymuyor, ağırlık/hizalama kontrolü yok. Belirleyici gerekçe: `lucide-react-native` **aynı ikon adlarıyla** Expo'ya birebir taşınıyor. Tek istisna: kutlama anları emoji ile değil imza öğeyle (halka kapanır)                                                                                                                                                                                                                                                                                                                                     | Planlandı — ADR-0016; uygulama Faz 2'nin ilk mekanik işi, E2E locator güncellemeleriyle aynı PR'da                                                            |
| 2026-08-17 | **İmza öğe: halka, tek anlam kuralıyla**                            | Halka **yalnızca döngü/çevrim durumu** kodlar; dekorasyon (avatar çerçevesi, buton süsü) yasak. Üç görünme yeri: danışan panosu haftalık döngü halkası, gym modu dinlenme sayacı, koç triyaj kartı 4 yaylı rozet. **Bilinçli kesinti:** NutritionTab makroları halka OLMAZ (Apple Watch klişesi + makro bir döngü değil bütçedir) → yatay bar; plan §4.2 buna göre düzeltildi. **Kritik kısıt:** halka bilgi taşır — CSS animasyonuyla çizilirse `globals.css`'teki global `prefers-reduced-motion` kuralı onu dondurur ve **yanlış bilgi gösterir**; state kaynaklı `stroke-dashoffset` zorunlu                                                                              | Planlandı — ADR-0017; `LoopRing` ilk göründüğü ekranla (gym modu) birlikte yazılır, AC-1.6.7 Faz 2'ye bağlandı                                                |
| 2026-08-17 | **Kimlik geçişi iki katman + CI ratchet; büyük patlama yok**        | Katman A (Faz 1.6, tek oturum/tek PR): token + font + gömülü 8 hex + odak/seçim rengi; **ekran restilizasyonu kapsam dışı**. Katman B (Faz 2): 49 `font-black` / 17 `rounded-3xl` / 14 gradyan ekranlar yeniden yazılırken doğal dönüşür, ayrı "restyle PR"ı yok. Arada CI ratchet mevcut sayıları tavan olarak kilitler, tavan asla yükselmez                                                                                                                                                                                                                                                                                                                                | Planlandı — ADR-0018; `active_planprogram.md` §3b.4                                                                                                           |
| 2026-08-17 | **Laboratuvar (kan/hormon) yorumlama motoru plandan çıkarıldı**     | Değer zaten raporda basılı, severity formülü (§5.4) tıbbi kaynağı olmayan keyfi bir eşik, isim doğrulama/boru hattı sırasında iki tasarım kusuru pratikte çalışmazdı, bloklayıcı açık sorular (katalog lisansı, saklama süresi, açık rıza) çözülmemişti, kalibrasyon verisi yoktu                                                                                                                                                                                                                                                                                                                                                                                             | Reddedildi — ADR-0019; `docs/LAB-INSIGHTS-SPEC.md` tarihsel kayıt olarak korunuyor, plana hiç işlenmemişti                                                    |

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
- Danışan mesajlaşmayı hiç kullanamıyordu (`useAdminId()` null döndürüyordu). **ÇÖZÜLDÜ
  (2026-08-16, dördüncü oturum):** `profiles_select` politikasına `role = 'admin'` koşulu
  eklendi (bkz. Bölüm 3 "Kritik kırık düzeltmeleri").
- Koç, onaya sunulan programdan haberdar olmuyordu (`notifications_insert` WITH CHECK
  reddediyordu). **ÇÖZÜLDÜ (2026-08-16, dördüncü oturum):** `public.is_coach_profile(uuid)`
  yardımcısı eklendi, politika güncellendi.
- `/api/ai/*` proxy uçlarında oturum kontrolü yoktu (planın §5.3 ihlali). **ÇÖZÜLDÜ
  (2026-08-16, dördüncü oturum):** Bearer token ile sunucu tarafı doğrulama eklendi; kimliksiz
  istek upstream'e hiç ulaşmıyor.

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

| Risk                                                                                                                                                                     | Not                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260816090300_storage.sql` doğrudan `storage.objects` üzerine `CREATE POLICY` yazıyor                                                              | **Yerelde sorun yok** — 8 storage politikası `db reset` ile sorunsuz uygulandı (2026-08-16). Ancak barındırılan (hosted) projede `db push` sırasında rolün tablo sahibi olmaması nedeniyle `must be owner of table objects` hatasıyla hâlâ karşılaşılabilir. |
| Storage bucket'ları (`avatars`, `form-checks-media`) **public** (`public = true`, `getPublicUrl` ile servis ediliyor)                                                    | Danışan vücut fotoğrafları URL'yi bilen herkese açık. Private bucket + signed URL'e geçilmeli. Faz 1'e ertelendi (bkz. Bölüm 4 karar kaydı ve Bölüm 6a).                                                                                                     |
| `next.config.mjs` PWA `runtimeCaching`'i `/rest/v1/(workout_logs\|profiles)` yanıtlarını **7 gün** (`maxAgeSeconds: 60*60*24*7`) cihazda tutuyor, logout'ta temizlik yok | Beslenme/antrenman planları ve e-posta içeren veri paylaşılan cihazda mahremiyet sorunu.                                                                                                                                                                     |
| `ai_backend/uv.lock` üretilmedi (dosya yok, doğrulandı)                                                                                                                  | **ÇÖZÜLDÜ:** `ai_backend/uv.lock` artık mevcut ve commit'li.                                                                                                                                                                                                 |
| `src/types/database.ts` elle yazıldı                                                                                                                                     | `npm run db:types` ile üretilenle diff'lenmeli.                                                                                                                                                                                                              |
| `npm audit`: 18 zafiyet (3 orta, 13 yüksek, 2 kritik)                                                                                                                    | Büyük ölçüde `next-pwa` v5'in eski bağımlılık ağacından. `npm audit fix --force` ÇALIŞTIRILMAMALI (Next 16'yı düşürebilir).                                                                                                                                  |
| `src/middleware.ts` — Next 16 bu dosya adlandırmasını deprecate etti, `proxy` istiyor                                                                                    | Şu an yalnızca uyarı.                                                                                                                                                                                                                                        |
| CI'daki `e2e` job'u artık yerel Supabase yığınını kurup RLS testlerini koşuyor                                                                                           | `.github/workflows/ci.yml` `e2e` job'u güncellendi: `supabase start` adımı, yerel `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ardından `npm run test:rls`. "CI'da e2e geçemez" riski **ÇÖZÜLDÜ**.                                            |
| `data/` altındaki CSV'ler (8,7 MB `exercises.csv` dahil) hiçbir zaman veritabanına import edilmedi                                                                       | `exercises` ve `food_database` tablolarında yalnızca 10'ar demo satır var. Egzersiz kütüphanesi ve besin arama gerçek veriyle çalışmıyor. Faz 1'e taşındı.                                                                                                   |
| `src/app/actions.ts`'teki 4 server action hiçbir yerden çağrılmıyor (ölü kod)                                                                                            | Planın AC-2.4 grep kuralını da ihlal ediyorlar (`.from()` doğrudan çağrısı). Faz 1'de karara bağlanmalı: silinsin mi, kullanılsın mı.                                                                                                                        |
| AI backend tel protokolü rol adlandırmasıyla hizasız                                                                                                                     | Faz 1a `student_id` → `client_id` kolon yeniden adlandırmasını yaptı ama `ai_backend/app/schemas/recommendations.py` hâlâ `student_id` alanı bekliyor — bilinçli olarak ertelendi, ayrı bir işte hizalanacak (bkz. §3 "Faz 1a — çıkış kriterleri").          |
| Kullanıcıya görünen arayüz metinleri hâlâ eski ürün dilini kullanıyor                                                                                                    | Faz 1a yalnızca şema + kodu yeniden adlandırdı; Türkçe arayüz metinleri ("Öğrenci Paneli", "Yönetici Paneli", "Öğrenci Portföyü", "Öğrenci Ara" vb.) değişmedi — ürün dili güncellemesi ayrı bir iş.                                                         |
| Koçun avatarı danışana görünmüyor                                                                                                                                        | `storage.objects` SELECT politikası "sahip veya koç" — danışan koçun avatar dosyasının sahibi değil. Şu an arayüz koç avatarını danışana göstermediği için regresyon yok; sohbet başlığına eklenirse politikaya "veya hedef kullanıcı koçsa" dalı eklenmeli. |
| Yetim storage dosyaları temizlenmiyor                                                                                                                                    | Eski avatar dosyaları yeni bir avatar yüklendiğinde storage'dan silinmiyor; ayrıca storage dışı mutlak URL'ler (`placehold.co` gibi) migration'da dönüştürülmedi, UI bunlar için placeholder'a düşüyor.                                                      |

**GÜVENLİK RİSKLERİ (Faz 1.5 kapsamına alındı — `active_planprogram.md` §3a.3 "Kova 3"):**
Aşağıdakiler bu oturumda kaynaktan doğrulandı; hiçbiri düzeltilmedi, hepsi Faz 1.5'in iş
kalemidir.

| Risk                                                                               | Kanıt                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORCE ROW LEVEL SECURITY` hiçbir tabloda yok (yalnızca `ENABLE`)                  | `supabase/**` genelinde `force row level security` grep'i 0 sonuç; 13 tabloda yalnızca `enable`. Tablo sahibi / `postgres` bağlantısı RLS'i baypas eder.                                                                                  |
| Erişim token'ı istemcide `localStorage`'da                                         | `src/lib/supabase/client.ts:20-22` — `persistSession: true`, özel `storage` verilmemiş (Supabase varsayılanı). XSS durumunda token çalınabilir; httpOnly cookie analizi yapılmadı.                                                        |
| Auth uçlarında brute-force koruması yok                                            | `/login` doğrudan GoTrue'ya gidiyor (`src/hooks/useSession.ts:72`); `src/proxy.ts:11` matcher yalnızca `/api/:path*`; `supabase/config.toml`'da `[auth.rate_limit]` bloğu yok.                                                            |
| Dosya yüklemede magic-byte doğrulaması yok                                         | MIME whitelist + 5 MB sınırı bucket seviyesinde var (`20260816090300_storage.sql:24-43`) ama istemcinin bildirdiği `Content-Type`'a dayanıyor; uzantı kullanıcı dosya adından türetiliyor (`useProfile.ts:90`, `useFormChecks.ts:66-68`). |
| Yüklenen dosya inline servis ediliyor                                              | `src/lib/storage.ts` imzalı adresi `download` / `Content-Disposition` olmadan üretiyor.                                                                                                                                                   |
| Güvenlik olay günlüğü yok                                                          | `src/proxy.ts` 429'u loglamıyor; başarısız giriş denemesi hiç loglanmıyor; RLS reddi (`42501`) güvenlik olayı olarak kaydedilmiyor.                                                                                                       |
| Loglarda PII / sağlık verisi maskelenmiyor                                         | `src/lib/logger.ts:20-28` redact listesi yalnızca kimlik bilgisi alanlarını içeriyor; `email`, `full_name`, `weight`, `measurements` listede yok.                                                                                         |
| SAST / secret tarama araç zinciri yok                                              | `package.json` devDependencies'te `semgrep`/`gitleaks`/`eslint-plugin-security` yok; `.github/workflows/*.yml` içinde `audit`/`semgrep`/`gitleaks` grep'i 0 sonuç; `pip-audit` de yok.                                                    |
| Git geçmişinde secret taraması hiç yapılmadı                                       | Repoda gitleaks yapılandırması/çıktısı yok; bu dosyada da böyle bir kayıt yok.                                                                                                                                                            |
| `ai_backend` kimlik doğrulaması fail-open                                          | `ai_backend/app/core/security.py:22-24` — `settings.api_key is None` ise `api_key_guard` no-op; `AI_BACKEND_API_KEY` hem `src/env.ts:19` hem backend tarafında opsiyonel.                                                                 |
| Rate limiter `x-forwarded-for`'a doğrulamasız güveniyor, kullanıcı bazlı limit yok | `src/proxy.ts:17-28`; bellek içi sınırlayıcı ADR-0005'te zaten bilinen kısıt, ancak XFF sahteciliği ayrıca kayıtlı değildi.                                                                                                               |
| CSP `script-src 'unsafe-inline'` içeriyor                                          | `next.config.mjs:33-35` — nonce tabanlı CSP'ye geçiş ertelendi (§8); XSS'in etkisini büyütür.                                                                                                                                             |
| `docs/security/` ve `SECURITY.md` yok                                              | Dizin listesiyle doğrulandı — `AUDIT.md`, `THREAT-MODEL.md` ve sorumlu açıklama politikası mevcut değil.                                                                                                                                  |
| Plan tablolarında denetim izi yok                                                  | ADR-0014'ün kabul edilen bedeli: satırı kimin yazdığı tutulmuyor (yalnızca `updated_at`), koç danışanın planı değiştirdiğini göremiyor.                                                                                                   |

**GÖRSEL KİMLİK BORÇLARI (Faz 1.6 / Faz 2 kapsamına alındı — `active_planprogram.md` §3b):**
Aşağıdakiler 2026-08-17'de kaynaktan ölçüldü; hiçbiri bu oturumda düzeltilmedi.

| Kısıt / borç                                                                 | Kanıt ve kapanış yeri                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mevcut marka moru `#8b5cf6` WCAG AA'yı geçmiyor                              | Birebir Tailwind `violet-500` (bir seçim değil, varsayılan); beyaz üstünde ~4.2:1 < 4.5:1. Aynı renk hem birincil aksiyon zemini hem `:focus-visible` outline'ı (`src/app/globals.css:62`). 3 dosyada 8 yerde ham hex: `globals.css` (4), `CoachUserManagement.tsx` (3), `StatsTab.tsx` (1). **Kapanış:** ADR-0015 → `#5B48D9` (~6:1) / koyu temada `#A79BFF` (~6.5:1); Faz 1.6 AC-1.6.2 + AC-1.6.5 |
| `text-gray-400` / `text-gray-500` kontrast borcu                             | `src/app/globals.css` sonundaki kontrast notu bunu zaten kayda geçirmiş: `.text-gray-400` beyaz kart üstünde AA'yı zor geçiyor/geçmiyor, `.text-gray-500` sınırda; `text-xs` ile birlikte riskli. Tek tek sınıf avlanmadı. **Kapanış:** semantik `text-secondary` token'ı ile yapısal olarak — Faz 1.6 (ADR-0015)                                                                                   |
| Emoji sökümünün E2E locator maliyeti                                         | `tests/e2e/**` senaryoları birebir Türkçe metinlere bakıyor ve emoji, emoji taşıyan butonların **erişilebilir adının parçası**. ~60 emoji / 15 dosya. Aynı kırılma yüzeyi bekleyen ürün dili düzeltmesiyle ("Öğrenci Paneli" vb.) çakışıyor — ayrı yapılırsa aynı locator'lar iki kez kırılır. **Kapanış:** ADR-0016; Faz 2'nin ilk mekanik işi, locator güncellemesi aynı PR'da                    |
| Koyu zemin `#0f0f12` üç yerde ayrı ayrı yazılı                               | `src/app/layout.tsx:23` (`viewport.themeColor`), `src/app/layout.tsx:32` (`dark:bg-[#0f0f12]`), `src/app/globals.css:30` (`.dark .glass-panel` rgba). Biri değişirse diğerleri sessizce kayar. **Kapanış:** ADR-0015 → `#14161B`, üçü birlikte; Faz 1.6 AC-1.6.8                                                                                                                                    |
| `next/font` hiç kullanılmıyor                                                | `src/app/layout.tsx` yalnızca `font-sans` diyor; yazı tipi ailesi hiç tanımlanmamış, tarayıcı/işletim sistemi varsayılanı render ediliyor. **Kapanış:** Faz 1.6 AC-1.6.6                                                                                                                                                                                                                            |
| Ekranlar Faz 1.6 ile Faz 2 arasında **iki dil** taşıyacak                    | 49 `font-black`, 17 `rounded-3xl`, 14 `bg-gradient-to-*` Katman A'da dönüştürülmüyor. Bilinçli kabul edilen ara dönem (ADR-0018); CI ratchet yalnızca **kötüleşmeyi** engeller, iyileşmeyi zorlamaz — sayaçlar Faz 2 çıkışında hâlâ sıfırlanmamış olabilir.                                                                                                                                         |
| Chart.js eksen rengi ve `html2canvas` dışa aktarımı kimliğin dışında kalıyor | Grafik eksenlerinde ham `#888`; `html2canvas` PNG çıktısının CSS değişkenleriyle doğru render ettiği doğrulanmadı. Faz 1.6 kapsamına **alınmadı**. **Kapanış:** Faz 4 grafik tekleştirme işi (`active_planprogram.md` §6, AC-4.3)                                                                                                                                                                   |

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
7. **Faz 1b bittikten sonra, Faz 2'ye geçmeden: Faz 1.5 — Güvenlik Denetimi ve
   Sertleştirme** (`active_planprogram.md` §3a). Önce `docs/security/AUDIT.md` bulgu raporu
   yazılır ve **kullanıcı onayı alınır**, sonra düzeltmelere geçilir; her düzeltme bir
   regresyon testiyle gelir. Öncelik sırası: erişim kontrolü kalanları (`FORCE RLS`) → secret
   taraması ve araç zinciri (gitleaks/semgrep/npm audit/pip-audit, CI'da high+ fail) → dosya
   yükleme sertleştirmesi (magic byte) → auth/oturum (token saklama, brute-force) → geri kalan.
   **Kabul kriteri:** AC-1.5.1–AC-1.5.12 karşılanır.
8. **Faz 1.6 — Görsel Kimlik Oturumu** (`active_planprogram.md` §3b). **Faz 1.5 ile paralel
   yürütülebilir** — dosya bakımından çakışmıyorlar (Faz 1.5: `supabase/**`, `src/lib/**`,
   `src/proxy.ts`, CI güvenlik adımları; Faz 1.6: `src/design/**`, `tailwind.config.ts`,
   `src/app/globals.css`, `src/app/layout.tsx`). İkisi de **Faz 2'den önce** bitmelidir.
   Kapsam yalnızca **Katman A**: `src/design/tokens.ts` (light/dark iki set) +
   `tailwind.config.ts` bağlaması + `next/font` üç yazı tipi + gömülü 8 ham `#8b5cf6`'nın
   token'a çekilmesi + `viewport.themeColor` + `:focus-visible`/`selection` token'a bağlanması
   - CI ratchet script'i. **Ekran restilizasyonu ve emoji → Lucide dönüşümü KAPSAM DIŞI**
     (Katman B, Faz 2 — ADR-0018). Timebox: tek oturum, tek PR.
     **Kabul kriteri:** AC-1.6.1–AC-1.6.9 karşılanır (AC-1.6.7 `LoopRing` ile birlikte Faz 2'ye
     devredilir). Kaynak kararlar: ADR-0015, ADR-0016, ADR-0017, ADR-0018.
9. Ardından Faz 2 (koç-danışan çekirdek akışı) — güvenlik temeli sağlamlaştırıldıktan **ve**
   kimlik sistemi kurulduktan sonra. Faz 2'nin ilk mekanik işi emoji → Lucide dönüşümüdür ve
   E2E locator güncellemeleriyle aynı PR'da yapılır (ADR-0016); `LoopRing` ilk göründüğü
   ekranla (gym modu dinlenme sayacı) birlikte yazılır (ADR-0017).

**Not:** Mevcut RLS politikalarını cilalamaya vakit harcanmamalı; Faz 1 şemayı yeniden
yazacak ve 35 politikanın çoğu değişecek. `db reset`'in amacı "production kalitesi" değil,
"SQL gerçek Postgres'te çalışıyor mu".

---

## 6a. Faz 1 çıkış kriterleri (unutulmaması gereken devir borçları)

Bu bölüm, ertelenen işlerin kaybolmaması için sözleşme niteliğindedir. Faz 1 "bitti"
sayılabilmesi için aşağıdaki maddelerin tamamı karşılanmalıdır:

1. ~~**Hiçbir storage bucket'ı public kalmayacak.** `avatars` ve `form-checks-media` private
   yapılacak, erişim signed URL (TTL ≤ 1 saat) ile olacak~~ — `active_planprogram.md` I-4
   değişmezi bunu zaten şart koşuyor.
   **TAMAMLANDI (2026-08-17, Faz 1a):** `supabase/migrations/20260817100000_private_storage.sql`
   ile ikisi de `public = false` yapıldı; okuma `src/lib/storage.ts`'teki
   `createSignedUrl`/`createSignedUrls` ile TTL 3600 sn imzalı adresle yapılıyor; bkz. §3
   "Faz 1a — storage mahremiyeti".
2. ~~**`form_checks.front_pose_url`/`back_pose_url` kolonları tam URL değil, bucket içi YOL
   saklayacak.** Mevcut satırlar için veri dönüşümü yazılacak.~~ İstemci okuma anında signed URL
   üretecek (`src/hooks/useFormChecks.ts` ve `src/components/AdminUserManagement.tsx`
   güncellenecek).
   **TAMAMLANDI (2026-08-17, Faz 1a):** Kolonlar `front_pose_path`/`back_pose_path` olarak
   yeniden adlandırıldı, mevcut tam public URL'ler aynı migration'da yola dönüştürüldü;
   `useFormChecks` artık imzalı adresli `FormCheckWithUrls[]` döner.
3. ~~**`avatars` için aynısı** — `profiles.avatar_url` yol saklayacak (`src/hooks/useProfile.ts`).~~
   **TAMAMLANDI (2026-08-17, Faz 1a):** `avatar_url` → `avatar_path` yeniden adlandırıldı;
   `useProfile`/`useProfiles` artık imzalı adresli `ProfileWithAvatar` döner.
4. ~~Rol enum'u `admin`/`student` → `coach`/`client`~~ (tek koçlu model; `coach_id` YOK).
   **TAMAMLANDI (2026-08-17, Faz 1a):** `supabase/migrations/20260817090000_rename_roles.sql`
   ile uygulandı; bkz. §3 "Faz 1a — çıkış kriterleri".

**Ayrıca tamamlandı (Faz 1a kapsamında, bu listenin parçası olmasa da ilişkili):** ADR
ayrıştırması (`active_planprogram.md` §0.6/AC-1.7) — bkz. §3 "Faz 1a — çıkış kriterleri".

**Faz 1b'ye devreden (bu listede kalan, henüz karşılanmamış maddeler):**

- Planlar `profiles` içindeki JSON string'lerden normalize tablolara taşınacak; veri
  migrasyonu yazılacak (bkz. `active_planprogram.md` §3.5, ve aşağıda §6b "Sıradaki iş — Faz
  1b").
- `src/middleware.ts` → Next 16 `proxy` konvansiyonuna göç — Faz 1b'nin kapsamında değil, ayrı
  bir bakım işi olarak açık kalıyor.

**ÖNEMLİ NOT:** Uygulama yayında olmasa da `.env.local` **barındırılan** bir Supabase
projesini gösteriyor (`nxftmxkpmuyeelrmwofv.supabase.co`). Migration'lar yalnızca YEREL yığına
uygulandı. Barındırılan projede gerçek danışan verisi/fotoğrafı varsa, oradaki bucket'lar hâlâ
public olabilir ve Faz 1'de bu projeye geçiş yapılırken veri dönüşümü planlanmalıdır.

---

## 6b. Sıradaki iş — Faz 1b

Faz 1a (rol yeniden adlandırma, ADR ayrıştırması, storage mahremiyeti, AI tel protokolü kararı)
tamamlandı. `active_planprogram.md` §3'ün geri kalanı — asıl şema yeniden yazımı ve veri
migrasyonu — Faz 1b olarak devam edecek:

- **Normalize plan tabloları:** `profiles.workout_plan`/`nutrition_plan` (JSON string, `text`
  kolon) → `workout_plans` + `workout_plan_exercises`, `nutrition_plans` +
  `nutrition_plan_meals` (bkz. plan §3.1, §3.5). Versiyonlama (`version`, `is_active`) ve veri
  migrasyonu (mevcut JSON string'lerin satırlara ayrıştırılması, ayrıştırılamayan içeriğin ham
  `notes` alanında korunması) dahil.
- **`conversations` tablosu:** şu an yok; `messages` düz `sender_id`/`receiver_id` ile çalışıyor.
  Her (koç, danışan) çifti için tek konuşma üretilecek, `messages.conversation_id` eklenecek,
  `is_read` → `read_at` dönüşümü kararlaştırılacak (bkz. plan §3.5).
- **`progress_entries` / `progress_photos`:** kilo/ölçü girişi ve açı etiketli ilerleme
  fotoğrafları için ayrı tablolar; şu an kilo yalnızca `form_checks.current_weight` içinde.
- **`coach_notes`:** koç → danışan serbest not tablosu; şu an yok.
- **`form_checks.status`/`coach_feedback`/`reviewed_at`:** şu an yok; dönüşüm kuralı plan
  §3.5'te tanımlı (`coach_feedback` doluysa `reviewed`, boşsa `pending`).
- Her yapısal migration'ın yanında veri migrasyonu yazılacak; eski kolonlar aynı migration'da
  DROP edilmeyecek (bir faz boyunca `DEPRECATED` yorumuyla salt-okunur yan yana yaşayacak, bkz.
  plan §3.5 kuralları).

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

| Tarih                        | Oturum özeti                                                                                                                                                                                                                                                                                                                                                                                   | Sonuç                                                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-16                   | v1.0 production-ready yükseltmesi (TS migrasyonu, FastAPI servisleştirme, Supabase RLS, test/CI/Docker altyapısı, dokümantasyon) + lint/test/build zincirinin yeşile alınması                                                                                                                                                                                                                  | lint 0 hata, 180/180 test, build başarılı. DB/E2E doğrulaması Docker eksikliği nedeniyle bekliyor.                                                                                                      |
| 2026-08-16                   | `docs/PROGRESS.md` oluşturuldu (oturumlar arası süreklilik için); `supabase/config.toml`'daki `[inbucket]` → `[local_smtp]` deprecation uyarısı düzeltildi                                                                                                                                                                                                                                     | `PROGRESS.md` ilk sürümü yazıldı; `config.toml` düzeltmesi tek bölüm adı değişikliği, anahtarlar korundu.                                                                                               |
| 2026-08-16 (ikinci oturum)   | Sağlamlaştırma turu: DB/RLS doğrulaması, tip üretimi, ai_backend ilk çalıştırma, PWA mahremiyet düzeltmesi, Prettier hizalama, gitignore artıkları                                                                                                                                                                                                                                             | Tüm kapılar yeşil (lint/type/format/test/build + ruff/mypy/pytest/docker). Storage düzeltmesi Faz 1'e ertelendi. E2E koşuluyor.                                                                         |
| 2026-08-16 (üçüncü oturum)   | E2E doğrulaması: Playwright ilk kez koşturuldu; Türkçe İ locator tuzağı, kapalı e-posta sağlayıcısı, CSP'nin yerel Supabase'i bloklaması ve iki kararsız/hatalı test düzeltildi                                                                                                                                                                                                                | 28/28 E2E geçti (chromium + Mobile Chrome). Sağlamlaştırma turu kapandı.                                                                                                                                |
| 2026-08-16 (dördüncü oturum) | Keşif envanteri (`docs/DISCOVERY.md`), plan v1.1 revizyonu, üç kritik kırığın düzeltilmesi ve regresyon korumalarının eklenmesi                                                                                                                                                                                                                                                                | 192 birim + 16×2 E2E + 19 RLS senaryosu geçiyor. Faz 1'e hazır.                                                                                                                                         |
| 2026-08-17                   | Faz 1a: rol yeniden adlandırma (`admin`/`student` → `coach`/`client`) + ADR ayrıştırması                                                                                                                                                                                                                                                                                                       | `db reset` sıfırdan, 19/19 RLS, 192/192 birim, 16/16 E2E, build başarılı; 13 ADR (`0013` `0003`'ün yerini aldı); AI backend `student_id` ve Türkçe arayüz metinleri bilinçli ertelendi.                 |
| 2026-08-17                   | Faz 1a tamamlandı: rol yeniden adlandırma, ADR ayrıştırması, storage mahremiyeti, AI tel protokolü                                                                                                                                                                                                                                                                                             | 203 birim + 19 RLS + 16 E2E, db reset temiz                                                                                                                                                             |
| 2026-08-17                   | Faz 1.5 güvenlik denetim turu: üç paralel denetim (erişim kontrolü/IDOR/RLS, uygulama yüzeyi, araç zinciri) tamamlandı, `docs/security/AUDIT.md` birleşik raporu yazıldı; turun tek kod değişikliği bağımlılık yükseltmesiydi (`next` 16.2.10 → 16.3.1)                                                                                                                                        | 39 bulgu (Critical 0 · High 10 · Medium 12 · Low 17); doğrulama zinciri 12/12 yeşil, `npm audit` 18 → 14. Düzeltmeler kullanıcı onayı bekliyor, henüz uygulanmadı.                                      |
| 2026-08-17 (düzeltme turu)   | Faz 1.5 düzeltme turu: kullanıcı onaylı Grup 1 (kimlik/yetki kapıları), Grup 2 (rate limiting/kaba kuvvet), Grup 3 (sütun seviyesi sözleşmeler) uygulandı — 3 yeni migration, `ai_backend` guard/fail-fast sertleştirmesi, `src/proxy.ts` XFF güven modeli, A-01 için uygulama katmanı giriş denemesi sınırlayıcısı (upstream Supabase hatası nedeniyle `[auth.rate_limit]` yolu işe yaramadı) | 19 bulgu kapandı (toplam 22/39 `fixed`); doğrulama 10/10 yeşil — vitest 264/264, test:rls 70/70, pytest 82/82 (%94.94), Playwright 21/21. Grup 4/5/6 açık; AC-05 şablon kuplajı borç olarak kaydedildi. |
