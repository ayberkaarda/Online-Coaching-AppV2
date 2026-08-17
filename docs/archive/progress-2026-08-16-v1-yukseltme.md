# Arşiv — v1.0 production-ready yükseltmesi ve ilk dört oturum (2026-08-16)

**Özet.** Düz JS/tek dosyalık hobi projesinden TypeScript strict + FastAPI + Supabase RLS +
test/CI/Docker mimarisine geçiş; ardından lint/tip/test/build zincirinin yeşile alınması,
sağlamlaştırma turu (DB/RLS doğrulaması, `ai_backend`'in ilk kez çalıştırılması, PWA mahremiyet
düzeltmesi), Playwright'ın ilk kez koşturulması (dört gerçek hata) ve `docs/DISCOVERY.md`
envanterinin ortaya çıkardığı üç kritik kırığın düzeltilmesi + regresyon korumaları.
Bu dosya ayrıca eski §5'in "çözülen blokajlar"/"bekleyen riskler" tablosunu ve §7 plan v1.1
revizyon listesini taşır.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 10–19, 21–35, 111–123, 127–329,
> 1383–1410, 1431–1448, 1705–1724 — 2026-08-17'de taşındı.

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

### 1.1 RLS izolasyon doğrulaması (2026-08-16, manuel SQL testi)

- Danışan kendi verisini görüyor (1 profil, kendi 6 form check'i), başka danışanın form check
  ve günlük loglarını **göremiyor (0/0)**.
- Koç tüm veriyi görüyor (3 profil, 12 form check, 28 log).
- Danışanın kendi rolünü `admin` yapma denemesi engellendi
  (`new row violates row-level security policy`).
- `anon` rolü hiçbir şeye erişemiyor (`permission denied for table profiles`).

### Doğrulama tablosu — 2026-08-16 satırları

| Kontrol                   | Komut                      | Durum                                                               | Tarih      |
| ------------------------- | -------------------------- | ------------------------------------------------------------------- | ---------- |
| Lint                      | `npm run lint`             | Temiz — 0 hata, 12 bilinçli uyarı                                   | 2026-08-16 |
| Tip kontrolü              | `npm run type-check`       | Temiz                                                               | 2026-08-16 |
| Biçim                     | `npm run format:check`     | Temiz                                                               | 2026-08-16 |
| Birim/bileşen testleri    | `npm run test`             | 192/192 (17 dosya)                                                  | 2026-08-16 |
| Production build          | `npm run build`            | Başarılı                                                            | 2026-08-16 |
| Backend lint              | `uv run ruff check .`      | Temiz                                                               | 2026-08-16 |
| Backend tip (strict)      | `uv run mypy app`          | Temiz, 28 dosya                                                     | 2026-08-16 |
| Backend testleri          | `uv run pytest`            | 63 test, kapsam %92 (eşik %70)                                      | 2026-08-16 |
| Backend Docker imajı      | `docker build` + container | Derlendi, `/health` doğrulandı                                      | 2026-08-16 |
| Veritabanı migration'ları | `npx supabase db reset`    | Uygulandı — 9 tablo, 37 politika, 8 storage politikası, 6 fonksiyon | 2026-08-16 |
| RLS izolasyonu            | Manuel SQL testi           | Doğrulandı (bkz. §1.1)                                              | 2026-08-16 |
| E2E testleri              | `npm run test:e2e`         | 16 senaryo × 2 profil (chromium + Mobile Chrome)                    | 2026-08-16 |
| RLS politika testleri     | `npm run test:rls`         | 19 senaryo, hepsi geçti                                             | 2026-08-16 |

Kalan 12 lint uyarısı bilinçlidir: 8 adet `@next/next/no-img-element` (Supabase public
URL'leri ve `ui-avatars.com` için `next/image` bilerek tercih edilmedi — harici/dinamik
görseller), 4 adet `no-console` (`src/lib/logger.ts` tarayıcı adaptöründe — `pino`'nun tarayıcı
bundle'ına girmemesi için kasıtlı `console` kullanımı).

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

---

## Eski §5 — açık ve bloke işler (bu turdan doğan kayıtlar)

Aşağıdaki tablolardaki `ÇÖZÜLDÜ` işaretli satırlar kapanmıştır. Kapanmamış olanlar canlı
[`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle izlenir.

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

**BEKLEYEN RİSKLER** (detay: `UPGRADE_NOTES.md` §7):

| Risk                                                                                                                                                                     | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260816090300_storage.sql` doğrudan `storage.objects` üzerine `CREATE POLICY` yazıyor                                                              | **Yerelde sorun yok** — 8 storage politikası `db reset` ile sorunsuz uygulandı (2026-08-16). Ancak barındırılan (hosted) projede `db push` sırasında rolün tablo sahibi olmaması nedeniyle `must be owner of table objects` hatasıyla hâlâ karşılaşılabilir. **ÇÖZÜLDÜ (2026-08-17, hosted senkronizasyonu):** yanlış alarm olduğu kanıtlandı — hosted `db push --include-all` ile 25 migration'ın tamamı (12 storage politikası dahil) tek bir `must be owner` hatası vermeden uygulandı. Kanıt yerel PG15 imajından değil, doğrudan hosted'ın PG17.6'sından alındı (`supautils.policy_grants` `storage.objects`'i listede tutuyor). Detay: `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`. |
| Storage bucket'ları (`avatars`, `form-checks-media`) **public** (`public = true`, `getPublicUrl` ile servis ediliyor)                                                    | Danışan vücut fotoğrafları URL'yi bilen herkese açık. Private bucket + signed URL'e geçilmeli. Faz 1'e ertelendi (bkz. Bölüm 4 karar kaydı ve Bölüm 6a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `next.config.mjs` PWA `runtimeCaching`'i `/rest/v1/(workout_logs\|profiles)` yanıtlarını **7 gün** (`maxAgeSeconds: 60*60*24*7`) cihazda tutuyor, logout'ta temizlik yok | Beslenme/antrenman planları ve e-posta içeren veri paylaşılan cihazda mahremiyet sorunu.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ai_backend/uv.lock` üretilmedi (dosya yok, doğrulandı)                                                                                                                  | **ÇÖZÜLDÜ:** `ai_backend/uv.lock` artık mevcut ve commit'li.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/types/database.ts` elle yazıldı                                                                                                                                     | `npm run db:types` ile üretilenle diff'lenmeli.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `npm audit`: 18 zafiyet (3 orta, 13 yüksek, 2 kritik)                                                                                                                    | Büyük ölçüde `next-pwa` v5'in eski bağımlılık ağacından. `npm audit fix --force` ÇALIŞTIRILMAMALI (Next 16'yı düşürebilir).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/middleware.ts` — Next 16 bu dosya adlandırmasını deprecate etti, `proxy` istiyor                                                                                    | Şu an yalnızca uyarı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CI'daki `e2e` job'u artık yerel Supabase yığınını kurup RLS testlerini koşuyor                                                                                           | `.github/workflows/ci.yml` `e2e` job'u güncellendi: `supabase start` adımı, yerel `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ardından `npm run test:rls`. "CI'da e2e geçemez" riski **ÇÖZÜLDÜ**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `data/` altındaki CSV'ler (8,7 MB `exercises.csv` dahil) hiçbir zaman veritabanına import edilmedi                                                                       | `exercises` ve `food_database` tablolarında yalnızca 10'ar demo satır var. Egzersiz kütüphanesi ve besin arama gerçek veriyle çalışmıyor. Faz 1'e taşındı. **ÇÖZÜLDÜ (2026-08-17, Faz 1.7):** `scripts/import-catalog.mjs`/`clean-foods.mjs` çalıştırıldı; `exercises` 10→1328, `food_database` 10→591, ikinci koşuda değişmedi (idempotans). Bkz. §3 "Faz 1.7 — Borç Temizliği" madde 6-7.                                                                                                                                                                                                                                                                                                       |
| `src/app/actions.ts`'teki 4 server action hiçbir yerden çağrılmıyor (ölü kod)                                                                                            | Planın AC-2.4 grep kuralını da ihlal ediyorlar (`.from()` doğrudan çağrısı). Faz 1'de karara bağlanmalı: silinsin mi, kullanılsın mı. **ÇÖZÜLDÜ:** dosya silindi (Faz 1.5 dönemi, `active_planprogram.md` §3a.3 Kova 1 #15); Faz 1.7'de `ls src/app/actions.ts` ile yeniden doğrulandı (yok) ve `active_planprogram.md` AC-2.4'teki artık gereksiz beyaz liste istisnası kaldırıldı.                                                                                                                                                                                                                                                                                                              |
| AI backend tel protokolü rol adlandırmasıyla hizasız                                                                                                                     | Faz 1a `student_id` → `client_id` kolon yeniden adlandırmasını yaptı ama `ai_backend/app/schemas/recommendations.py` hâlâ `student_id` alanı bekliyor — bilinçli olarak ertelendi, ayrı bir işte hizalanacak (bkz. §3 "Faz 1a — çıkış kriterleri"). **GÜNCELLEME/BAYAT KAYIT (2026-08-17, Faz 1.7):** bu satırın kendisi artık yanlış — kaynaktan doğrulandı, alan zaten `client_id` (`ai_backend/app/schemas/recommendations.py:27`, `src/lib/api/types.ts:66`, `src/lib/validation/schemas.ts:231`); `git log` rol yeniden adlandırma commit'inde (`78e5d7b`) zaten hizalandığını gösteriyor. Ek iş gerekmiyor, yalnızca belge hataydı.                                                         |
| Kullanıcıya görünen arayüz metinleri hâlâ eski ürün dilini kullanıyor                                                                                                    | Faz 1a yalnızca şema + kodu yeniden adlandırdı; Türkçe arayüz metinleri ("Öğrenci Paneli", "Yönetici Paneli", "Öğrenci Portföyü", "Öğrenci Ara" vb.) değişmedi — ürün dili güncellemesi ayrı bir iş.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Koçun avatarı danışana görünmüyor                                                                                                                                        | `storage.objects` SELECT politikası "sahip veya koç" — danışan koçun avatar dosyasının sahibi değil. Şu an arayüz koç avatarını danışana göstermediği için regresyon yok; sohbet başlığına eklenirse politikaya "veya hedef kullanıcı koçsa" dalı eklenmeli. **ÇÖZÜLDÜ (2026-08-17, Faz 1.7):** `20260817180100_avatar_visibility.sql` — `avatar_object_owner(text)` + politikaya `is_coach(avatar_object_owner(name))` dalı; danışanların birbirinin avatarını göremediği testle kilitlendi.                                                                                                                                                                                                     |
| Yetim storage dosyaları temizlenmiyor                                                                                                                                    | Eski avatar dosyaları yeni bir avatar yüklendiğinde storage'dan silinmiyor; ayrıca storage dışı mutlak URL'ler (`placehold.co` gibi) migration'da dönüştürülmedi, UI bunlar için placeholder'a düşüyor. **KISMEN ÇÖZÜLDÜ (2026-08-17, Faz 1.7):** `removeStoredObject()` eklendi, `useUploadAvatar` artık eski avatarı `profiles.avatar_path` güncellemesi başarılı olduktan SONRA siliyor. Birikmiş ESKİ yetim dosyalar için toplu temizlik yapılmadı (ayrı onay ister); storage dışı mutlak URL'ler hâlâ dönüştürülmedi.                                                                                                                                                                        |

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
