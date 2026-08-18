# Faz 4.5 Taşıma Envanteri — Monorepo Kesimi Öncesi Fotoğraf

**Tarih:** 2026-08-18
**Üretim gerekçesi:** `active_planprogram.md` §7 (Faz 4.5), ADR-0023 ve ADR-0024 planlama
turunun ölçüm dayanağı. Bu dosya **iddia değil ölçüm** içerir; her sayı bu oturumda dosya
sisteminden veya `git`/`node`'la gerçekten çalıştırılan bir komuttan alınmıştır. Faz 4.5
başladığında commit'lerin dosya kapsamını doğrulamak için referans alınmalıdır. Hiçbir kod
değişikliği, bağımlılık kurulumu veya git komutu bu turda **çalıştırılmadı** — bu tur kâğıt
üstünde bir keşiftir.

Biçim `docs/DISCOVERY.md`'nin (2026-08-16 anlık görüntüsü) konvansiyonunu takip eder.

---

## 1. Route envanteri

### 1.1 `src/app/**` altındaki tüm `page.tsx` / `route.ts` / `layout.tsx` / `not-found.tsx`

Ölçüm: `find src/app -type f \( -name "page.tsx" -o -name "route.ts" -o -name "layout.tsx" -o
-name "not-found.tsx" \)` — **11 dosya**:

| #   | Dosya                                     |
| --- | ----------------------------------------- |
| 1   | `src/app/api/ai/nutrition/route.ts`       |
| 2   | `src/app/api/ai/recommendations/route.ts` |
| 3   | `src/app/api/ai/workout/route.ts`         |
| 4   | `src/app/api/auth/sign-in/route.ts`       |
| 5   | `src/app/api/health/route.ts`             |
| 6   | `src/app/layout.tsx`                      |
| 7   | `src/app/login/page.tsx`                  |
| 8   | `src/app/not-found.tsx`                   |
| 9   | `src/app/page.tsx`                        |
| 10  | `src/app/profile/page.tsx`                |
| 11  | `src/app/users/page.tsx`                  |

Bu listede olmayan ama `src/app/**` altında bulunan diğer özel dosyalar (App Router
konvansiyonu, sayılana dahil değil): `src/app/error.tsx`, `src/app/global-error.tsx`,
`src/app/loading.tsx`, `src/app/providers.tsx`, `src/app/globals.css`, `src/app/favicon.ico`.
Taşıma sırasında bunlar da `apps/web/app/**`'e birlikte taşınır (bkz. §3).

### 1.2 Bugünkü build route tablosu (referans, ADR-0022'de ölçüldü)

`0022-oturum-depolamasi-cookie-ve-nonce-csp.md`'nin "Uygulama notu" bölümünde belgelendiği
üzere, nonce zincirinin kök layout'ta `await connection()` çağırması sonucu **tüm rota
ağacı** dinamikleşti — bu turda `npm run build` tekrar çalıştırılmadı, referans o ADR'nin
ölçümüdür:

| Rota                      | Tip (bugün) |
| ------------------------- | ----------- |
| `/`                       | `ƒ`         |
| `/_not-found`             | `ƒ`         |
| `/login`                  | `ƒ`         |
| `/profile`                | `ƒ`         |
| `/users`                  | `ƒ`         |
| `/api/health`             | `ƒ`         |
| `/api/auth/sign-in`       | `ƒ`         |
| `/api/ai/workout`         | `ƒ`         |
| `/api/ai/nutrition`       | `ƒ`         |
| `/api/ai/recommendations` | `ƒ`         |

**10/10 `ƒ` (dinamik), sıfır `○` (statik).** ADR-0023 madde 13.1'in şartı: taşıma sonrası bu
tablo **birebir aynı** kalmalı (10/10 `ƒ`) — `○`'a dönen bir rota, davranış değişikliği
kanıtıdır ve dur-ve-sor tetikler.

---

## 2. Supabase singleton import listesi

Ölçüm: `grep -rln "@/lib/supabase/client" src --include="*.ts" --include="*.tsx"` (yalnızca
`src/`, test dosyaları hariç) — **16 dosya**. (Görev tanımındaki "17 dosya" tahmini bu ölçümle
düzeltildi; kaynağı muhtemelen bir dosyanın yorum satırında geçen referanstı —
`src/app/api/auth/sign-in/route.ts:183` `client.ts`'e yorum içinde atıf yapıyor ama modülü
import etmiyor, bu yüzden sayıma girmiyor.)

| #   | Dosya                              | Not                                                  |
| --- | ---------------------------------- | ---------------------------------------------------- |
| 1   | `src/hooks/useCatalog.ts`          |                                                      |
| 2   | `src/hooks/useDailyLogs.ts`        |                                                      |
| 3   | `src/hooks/useFormChecks.ts`       |                                                      |
| 4   | `src/hooks/useMessages.ts`         | `supabase.channel(...)` realtime aboneliği de burada |
| 5   | `src/hooks/useNotifications.ts`    |                                                      |
| 6   | `src/hooks/useNutritionLogs.ts`    |                                                      |
| 7   | `src/hooks/usePlans.ts`            |                                                      |
| 8   | `src/hooks/useProfile.ts`          |                                                      |
| 9   | `src/hooks/useProgramApprovals.ts` |                                                      |
| 10  | `src/hooks/useProgressEntries.ts`  |                                                      |
| 11  | `src/hooks/useProgressPhotos.ts`   |                                                      |
| 12  | `src/hooks/useSession.ts`          |                                                      |
| 13  | `src/hooks/useWorkoutLogs.ts`      |                                                      |
| 14  | `src/hooks/useWorkoutSession.ts`   |                                                      |
| 15  | `src/lib/api/ai.ts`                | client-safe modül, bkz. §3 notu                      |
| 16  | `src/lib/storage.ts`               | signed URL üretimi                                   |

`@/lib/supabase/server.ts`'i import eden dosyalar (ayrı liste, ADR-0024 kapsamı dışı —
bunlar zaten `apps/web`'de kalıyor): `src/app/api/auth/sign-in/route.ts`,
`src/app/api/health/route.ts`, `src/lib/api/proxy.ts` (+ 5 test dosyası).

**9 test dosyası** aynı modülü `vi.mock('@/lib/supabase/client', ...)` ile taklit ediyor:
`tests/unit/auth-cookie-session.test.ts`, `tests/unit/form-check-queue.test.tsx`,
`tests/unit/local-date-consistency.test.ts`, `tests/unit/messages-realtime.test.ts`,
`tests/unit/nutrition-logs.test.ts`, `tests/unit/progress-entries.test.ts`,
`tests/unit/progress-photos.test.tsx`, `tests/unit/storage-cleanup.test.ts`,
`tests/unit/storage.test.ts`. ADR-0024'ün enjeksiyon geçişi bu mock'ların hedefini de
güncellemeyi gerektirir.

`src/components/tabs/WorkoutTab.tsx` içinde `"supabase"` geçen tek satır bir **yorum**
(`useWorkoutLogs.ts` ve `supabase/README.md`'ye atıf) — gerçek bir import değil, sayıma
girmiyor.

---

## 3. Kaynak → hedef haritası

| Kaynak                                                                                         | Hedef                                                                                                                                                                                    | Not                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/database.ts` (958 satır), `src/types/domain.ts` (162 satır), `src/types/index.ts`   | `packages/types`                                                                                                                                                                         | `database.ts` `db:types` script'iyle üretiliyor; script paketle birlikte taşınır (ADR-0023 madde 3)                                                                                                                                                                                                                                                                                                                    |
| `src/lib/validation/schemas.ts` (260 satır)                                                    | `packages/types/schemas`                                                                                                                                                                 | zod şemaları; Pydantic alan adlarıyla birebir (snake_case)                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/query/keys.ts` (125 satır)                                                            | `packages/api-client/keys.ts`                                                                                                                                                            | TanStack Query key fabrikaları                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/hooks/*.ts` (14 domain hook'u + `useAi.ts` + `index.ts`, toplam 3171 satır)               | `packages/api-client`                                                                                                                                                                    | ADR-0024 gereği Supabase erişimi context enjeksiyonuna döner (bkz. §2)                                                                                                                                                                                                                                                                                                                                                 |
| `src/lib/api/types.ts`, `client.ts`, `ai.ts`, `index.ts` (**client-safe** alt küme, 327 satır) | `packages/api-client`                                                                                                                                                                    | `ApiError`, `apiFetch`, AI proxy istemci fonksiyonları — `src/hooks/useAi.ts`, `useSession.ts`, `src/components/ui/QueryState.tsx` tüketiyor                                                                                                                                                                                                                                                                           |
| `src/lib/query/queryClient.ts`, `security-event.ts`, `supabase-error.ts` (153 satır)           | `packages/api-client`                                                                                                                                                                    | TanStack `QueryClient` fabrikası + hata/log yardımcıları; yalnızca `logger`'a bağımlı, Next.js'e özgü değil                                                                                                                                                                                                                                                                                                            |
| `src/lib/storage.ts` (173 satır)                                                               | `packages/api-client`                                                                                                                                                                    | **eksikti, bu ekte eklendi.** Hook değil — 3 düz `async function` export (`createSignedUrl`, `removeStoredObject`, `createSignedUrls`), gövdede modül singleton'ı kullanıyor; ADR-0024 eki (2026-08-18): istemci ilk parametre olarak açık geçilir (`client: SupabaseClient<Database>`), 4 tüketici hook (`useFormChecks`, `useMessages`, `useProfile`, `useProgressPhotos`) `useSupabaseClient()`'tan aldığını iletir |
| `src/lib/logger.ts` (242 satır)                                                                | **bölünür**: platformdan bağımsız çekirdek (`Logger`, `REDACT_PATHS`, `maskForConsole`, `createConsoleLogger`) → yeni `packages/logger`; pino dalı `apps/web/src/lib/logger.ts`'te kalır | **eksikti, bu ekte eklendi.** ADR-0024 eki (2026-08-18): §4'teki "KALACAKLAR" notunu (aşağıda) günceller — dosyanın tamamı değil, yalnızca sunucuya özgü pino dalı `apps/web`'de kalıyor                                                                                                                                                                                                                               |

### Önemli bulgu — `src/lib/api`'nin tamamı `packages/api-client`'a gitmiyor

Plan metninin "`src/lib/api` + `src/hooks` → `packages/api-client`" cümlesi ölçüldüğünde
**yarısı doğru çıktı**: `src/lib/api/index.ts`'in kendi yorumu bunu zaten belgeliyor —
"`proxy.ts` sunucuya özeldir ve bilerek re-export edilmez." Tüketici zinciri izlendiğinde
(`grep` ile, bu turda) dizin ikiye ayrılıyor:

| Dosya                                                                                                         | Tüketici                                                                                              | Sınıf                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `types.ts`, `client.ts` (152 satır, `apiFetch`/`ApiError`), `ai.ts` (72 satır), `index.ts`                    | `src/hooks/useAi.ts`, `useSession.ts`, `src/components/ui/QueryState.tsx`                             | **client-safe** — `packages/api-client`'a gider                           |
| `proxy.ts` (254 satır), `auth-rate-limit.ts` (182 satır), `client-ip.ts` (59 satır), `response.ts` (64 satır) | yalnızca `src/app/api/**/route.ts`, `src/env.server.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts` | **sunucu-özel, Next.js Route Handler yardımcısı** — `apps/web`'de kalmalı |

Bu ikinci grup Next.js'in Route Handler API'sine (`NextRequest`/`NextResponse`), sunucu
env'ine (`AI_BACKEND_API_KEY`) ve `src/proxy.ts` middleware zincirine bağımlı; `apps/mobile`
zaten I-1 gereği bu dosyaları hiç import etmeyecek (mobil de web'in Route Handler'larına HTTP
ile istek atar, kodu paylaşmaz). Faz 4.5 iş kalemlerine bu ayrım **ayrı bir madde** olarak
eklenmeli — aksi halde commit 5 sunucu-özel 4 dosyayı da pakete taşımaya çalışıp derleme
zamanında (`next/server` mobilde çözülmez) veya çalışma zamanında kırılabilir.

### `apps/web`'de KALACAKLAR (taşınmayan, ADR-0023 madde 6–8)

- `src/proxy.ts` (Next 16 middleware konvansiyonu, nonce üretimi)
- `src/lib/security/csp.ts`
- `src/env.server.ts` (`getServerEnv`), `src/env.ts` (client env — her iki app'in kendi env
  şeması olur; `src/env.ts`'in şekli referans alınabilir ama dosyanın kendisi paylaşılmaz)
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/index.ts`
- `src/lib/api/proxy.ts`, `auth-rate-limit.ts`, `client-ip.ts`, `response.ts` (yukarıdaki bulgu)
- `src/app/**` (page/route/layout dosyaları — §1.1), `src/components/**` (20 dosya),
  `src/design/**` (`tokens.ts`, tailwind bu dosyayı import ediyor)
- `src/lib/rate-limit.ts`, `src/lib/date.ts`, `src/lib/utils.ts`, `src/lib/upload-validation.ts`
  — hiçbiri şu an `packages/*` hedefli değil; taşınmaları plan metninde yok, bu turda
  **taşınmayacak** varsayılıyor.
- `src/lib/logger.ts` — **GÜNCELLEME (ADR-0024 eki, 2026-08-18):** bu satır önceden dosyanın
  tamamının `apps/web`'de kalacağını varsayıyordu; ölçüldükten sonra bu **kısmen düzeltildi**.
  Dosya **bölünüyor**: platformdan bağımsız çekirdek (`Logger` arayüzü, `REDACT_PATHS`,
  `maskForConsole`, `createConsoleLogger`) yeni `packages/logger`'a taşınıyor çünkü
  `packages/api-client`'a giden 5 modül (`storage.ts`, `queryClient.ts`, `security-event.ts`,
  `supabase-error.ts`, ilgili hook'lar) ona bağımlı ve paketler uygulamalara bağımlı olamaz;
  yalnızca sunucuya özgü pino dalı (`createPinoLogger`, `NEXT_RUNTIME` dallanması) —ki gerçek
  tüketicileri (`src/lib/api/proxy.ts`, `response.ts`, `src/app/api/auth/sign-in/route.ts`,
  `src/proxy.ts`) zaten `apps/web`'de kalıyor— `apps/web/src/lib/logger.ts`'te kalıyor. Ayrıntı
  ve reddedilen alternatifler: `docs/adr/0024-api-client-supabase-enjeksiyonu.md` "Uygulama
  sözleşmesi (2026-08-18 eki)" §Ek-2.

---

## 4. Dokunulacak config'ler

| Dosya                      | Ne değişecek (tek satır)                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next.config.mjs`          | `apps/web/` altına taşınır; `outputFileTracingRoot`/`turbopack.root` kök monorepo'ya göre yeniden hesaplanmalı                                                                                                                                               |
| `playwright.config.ts`     | `apps/web/` altına taşınır; `testDir`/`webServer.command` yolları aynı kalır (zaten o app'i başlatıyor)                                                                                                                                                      |
| `vitest.config.ts`         | paket başına ayrılır — bugünkü tek kök config, `apps/web/vitest.config.ts` + gerekirse `packages/*/vitest.config.ts` olur                                                                                                                                    |
| `vitest.setup.ts`          | `apps/web/`'e taşınır (jsdom/matchMedia/ResizeObserver stub'ları web'e özgü)                                                                                                                                                                                 |
| `tsconfig.json`            | `apps/web/tsconfig.json` olur; `paths: {"@/*": ["./src/*"]}` değişmeden çözülmeye devam eder (ADR-0023 madde 6)                                                                                                                                              |
| `tsconfig.e2e.json`        | `apps/web/tsconfig.e2e.json` olur, içerik değişmez                                                                                                                                                                                                           |
| `eslint.config.mjs`        | `packages/config`'e taşınır ve her paket kendi `eslint.config.mjs`'inde import eder; bugünkü `supabase/**`/`ai_backend/**` ignore listesi kök seviyede kalabilir                                                                                             |
| `postcss.config.mjs`       | `apps/web/`'e taşınır (yalnızca Tailwind web'de kullanılıyor)                                                                                                                                                                                                |
| `tailwind.config.ts`       | `apps/web/`'e taşınır; `content` glob'u `./src/**` yollarını korur, `src/design/tokens.ts` import'u değişmez                                                                                                                                                 |
| `.github/workflows/ci.yml` | `npm ci`/`npm run *` adımları `pnpm install`/`pnpm turbo *` ile değiştirilir; `working-directory: ai_backend` değişmez                                                                                                                                       |
| `Dockerfile`               | `COPY package.json package-lock.json` → `pnpm-lock.yaml` + workspace dosyaları; `npm ci`/`npm run build` → `pnpm install --frozen-lockfile` + turbo build; `output: 'standalone'`'ın pnpm workspace'te toplanması ADR-0023 madde 12(b)'nin dur-ve-sor konusu |
| `docker-compose.yml`       | `web` servisinin `build.context`/`dockerfile` yolu değişmeyebilir (kök `Dockerfile` kalırsa) ama `env_file`/`AI_BACKEND_URL` referansları doğrulanmalı                                                                                                       |

---

## 5. `package.json` script → turbo task eşlemesi

Ölçüm: kök `package.json`, **25 script**.

| Script              | Bugünkü komut                                                                       | Faz 4.5 sonrası                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`               | `next dev --webpack`                                                                | `apps/web/package.json` script'i; kökte `pnpm --filter web dev`                                                                       |
| `build`             | `next build --webpack`                                                              | `apps/web/package.json` script'i; kökte turbo `build` task'i çağırır (`turbo.json` `outputs`)                                         |
| `start`             | `next start`                                                                        | `apps/web/package.json` script'i                                                                                                      |
| `dev:hosted`        | `dotenv -e .env.hosted.local -- next dev --webpack`                                 | `apps/web/package.json` script'i                                                                                                      |
| `build:hosted`      | `dotenv -e .env.hosted.local -- next build --webpack`                               | `apps/web/package.json` script'i                                                                                                      |
| `start:hosted`      | `dotenv -e .env.hosted.local -- next start`                                         | `apps/web/package.json` script'i                                                                                                      |
| `lint`              | `eslint .`                                                                          | kök turbo `lint` task'i, her paket kendi `lint` script'ini çalıştırır                                                                 |
| `lint:fix`          | `eslint . --fix`                                                                    | paket başına; kökte toplu çağıran bir script kalabilir                                                                                |
| `type-check`        | `tsc --noEmit`                                                                      | kök turbo `type-check` task'i, paket başına `tsconfig.json`                                                                           |
| `test`              | `vitest run`                                                                        | kök turbo `test` task'i, paket başına vitest config (§4)                                                                              |
| `test:watch`        | `vitest`                                                                            | `apps/web/package.json` script'i (geliştirici yerel kullanımı, turbo'ya girmez)                                                       |
| `test:coverage`     | `vitest run --coverage`                                                             | kök turbo `test:coverage` task'i                                                                                                      |
| `test:e2e`          | `playwright test`                                                                   | `apps/web/package.json` script'i; kökte `pnpm --filter web test:e2e`                                                                  |
| `test:e2e:ui`       | `playwright test --ui`                                                              | `apps/web/package.json` script'i                                                                                                      |
| `format`            | `prettier --write .`                                                                | kökte kalır (Prettier tüm monorepo'yu tek config'le tarar, paket sınırı gerektirmez)                                                  |
| `format:check`      | `prettier --check .`                                                                | kökte kalır                                                                                                                           |
| `db:types`          | `supabase gen types typescript --local --schema public > src/types/database.ts`     | `packages/types/package.json`'a taşınır (ADR-0023 madde 3), çıktı yolu `packages/types/src/database.ts` olur                          |
| `db:migrate`        | `supabase db push`                                                                  | kökte kalır (`supabase/` kökte, §2 ADR-0023)                                                                                          |
| `clean:foods`       | `node scripts/clean-foods.mjs`                                                      | kökte kalır (`scripts/` kökte)                                                                                                        |
| `db:import-catalog` | `node scripts/import-catalog.mjs`                                                   | kökte kalır                                                                                                                           |
| `db:clean-e2e`      | `dotenv -e .env.local -- node scripts/clean-e2e-data.mjs`                           | kökte kalır                                                                                                                           |
| `test:rls`          | `docker exec -i supabase_db_my-coaching-app psql ... < supabase/tests/rls.test.sql` | kökte kalır                                                                                                                           |
| `test:transform`    | `docker exec -i ... < supabase/tests/transform.test.sql`                            | kökte kalır                                                                                                                           |
| `ratchet`           | `node scripts/identity-ratchet.mjs`                                                 | kökte kalır; ADR-0024'ün önerdiği "`supabase.from(` yalnızca `packages/api-client`'ta" kontrolü de bu script'in deseniyle eklenebilir |
| `ci`                | `pnpm run lint && pnpm run type-check && pnpm run test && pnpm run build`           | `pnpm turbo lint type-check test build` (affected-graph ile)                                                                          |

**Kökte kalan script sayısı: 7** (`db:migrate`, `clean:foods`, `db:import-catalog`,
`db:clean-e2e`, `test:rls`, `test:transform`, `format`/`format:check` — 8 sayılırsa).
**`apps/web`'e giden script sayısı: 8** (`dev`, `build`, `start`, `dev:hosted`,
`build:hosted`, `start:hosted`, `test:e2e`, `test:e2e:ui`). **Turbo task'ine dönüşen: 6**
(`lint`, `lint:fix`, `type-check`, `test`, `test:coverage`, `ci`). **`packages/types`'a
giden: 1** (`db:types`). **Yeniden değerlendirilecek: 1** (`ratchet` — kapsamı genişleyebilir).

---

## 6. Diğer ölçümler

- `src/hooks/`: 16 dosya (14 domain hook + `useAi.ts` + `index.ts`), toplam 3171 satır.
- `src/components/`: 20 dosya (tabs 7, ui 5, progress 2, workout 1, kök 4 — `1` barrel
  `ui/index.ts` dahil).
- `src/lib/`: alt dizinler hariç 6 dosya (`date.ts` 43, `logger.ts` 242, `rate-limit.ts` 143,
  `storage.ts` 173, `upload-validation.ts` 152, `utils.ts` 151 satır — toplam 904 satır) + `api/`
  (8 dosya, 826 satır), `query/` (4 dosya, 278 satır), `supabase/` (3 dosya, 222 satır),
  `validation/` (1 dosya, 260 satır), `security/` (1 dosya, 113 satır).
- `src/types/`: 3 dosya, 1124 satır.
- `src/proxy.ts`: 178 satır. `src/env.ts`: 67 satır. `src/env.server.ts`: 166 satır.
- `src/design/`: 1 dosya (`tokens.ts`).
- `tests/unit/`: **50 test dosyası** (ölçüldü: `find tests/unit -name "*.test.ts*" | wc -l`).
  `src/` altında test dosyası **yok** (`find src -name "*.test.ts*"` → 0) — tüm birim testleri
  `tests/unit/` altında toplanmış, taşıma sırasında paket başına dağıtılacaklar.

---

## 7. Bugünkü baseline sayıları (taşıma öncesi kapı durumu)

| Kapı                       | Sonuç                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run test` (vitest)    | 614/614 yeşil (50 dosya)                                                                                                 |
| `npm run test:rls`         | 110/110 yeşil                                                                                                            |
| `npm run test:e2e` (yerel) | paralel (workers=2) 52/54; seri doğrulama (`CI=1`) 14/14 — bkz. `playwright.config.ts`'teki `localWorkers` gerekçe bloğu |
| `npm run lint`             | 0 hata / 17 uyarı                                                                                                        |
| `npm run build`            | 10/10 rota `ƒ`, 0 `○` (§1.2)                                                                                             |

> **UYARI:** Bu baseline B-036 turu (`CoachUserManagement`'ın kilo grafiğinin
> `form_checks`'ten `progress_entries`'e taşınması, `docs/PROGRESS.md` borç kütüğü) main'e
> commit'lendikten **sonra** yenilenmelidir — B-036'nın kapsamı `tests/unit/**` içindeki test
> sayılarını değiştirecek (en az `CoachUserManagement`'a bağlı testler). Faz 4.5'in commit 2
> davranış kanıtı (ADR-0023 madde 13.2) bu tazelenmiş sayılara göre karşılaştırılmalı, yukarıdaki
> tabloya göre değil.

---

## 8. Kapsam dışı bırakılanlar (bu envanterde ölçülmedi)

- `ai_backend/**` — kökte kalıyor, pnpm workspace üyesi değil (ADR-0023 madde 2); dosya
  sayımı `docs/DISCOVERY.md`'de zaten mevcut (44 dosya, 2026-08-16).
- `supabase/**`, `data/**`, `scripts/**` — aynı gerekçeyle kökte kalıyor, bu turda yeniden
  sayılmadı.
- `apps/mobile` iskeletinin iç yapısı (Expo Router dosya ağacı, tab navigasyonu) — Faz 4.5
  commit 6'nın kendi keşif adımıdır, bu envanterin kapsamında değil (bugün hiç yok).
