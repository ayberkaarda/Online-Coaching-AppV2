# İlerleme Günlüğü — canlı durum

Bu dosya bir **oturum başlangıç kitidir**: bugünkü durum, açık borçlar, sıradaki iş ve hâlâ
geçerli tuzaklar. `CLAUDE.md` gereği her oturumun başında okunur ve çalışmaya başlamak için
**tek başına** yeterlidir. Ayrıntı gerekiyorsa arşivden okunur.

**Dosya kuralı (2026-08-17'de değişti).** Eskiden bu dosya "yalnızca büyür, eski girdiler
silinmez" kuralıyla tutuluyordu ve 1755 satıra ulaşmıştı. Yeni kural:

> **Bir faz/tur kapandığında ANLATI DOĞRUDAN `docs/archive/progress-<slug>.md`'ye yazılır.**
> Bu dosyaya yalnızca (a) durum özeti, (b) borç tablosu güncellemesi ve (c) tek satırlık faz
> kaydı işlenir. Arşivden hiçbir şey silinmez — taşınır, silinmez.

Arşiv indeksi: [`docs/archive/README.md`](archive/README.md).

## § yönlendirme tablosu (eski referanslar)

Bu dosyanın bölüm numaraları arşivlemeden sonra **yenidir**. `active_planprogram.md`,
`docs/security/AUDIT.md` ve diğer belgelerdeki `docs/PROGRESS.md §N` referansları aşağıdaki
dosyalarda çözülür; taşınan bölüm başlıkları arşivde **birebir** korunmuştur.

| Eski bölüm                                                                                              | Nerede                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| §1 (mevcut durum, doğrulama)                                                                            | Güncel hâli aşağıda §1; tarihsel satırlar ilgili fazın arşiv dosyasında     |
| §1.1, §2, §3 (2026-08-16 turları)                                                                       | `archive/progress-2026-08-16-v1-yukseltme.md`                               |
| §3 "Faz 1a — …"                                                                                         | `archive/progress-faz-1a.md`                                                |
| §3 "Faz 1.5 — …"                                                                                        | `archive/progress-faz-1.5-guvenlik.md`                                      |
| §3 "Faz 1.6 — …"                                                                                        | `archive/progress-faz-1.6-gorsel-kimlik.md`                                 |
| §3 "Faz 1.7 — …"                                                                                        | `archive/progress-faz-1.7-borc-temizligi.md`                                |
| §3 "Faz 2 — …"                                                                                          | `archive/progress-faz-2-cekirdek-akis.md`                                   |
| §3 "Hosted senkronizasyonu", "Env koruması …"                                                           | `archive/progress-hosted-senkron-ve-env.md`                                 |
| §4 (karar kaydı)                                                                                        | `archive/progress-kararlar-tablosu.md` (DONDURULMUŞ) — kanonik: `docs/adr/` |
| §5 (açık ve bloke işler)                                                                                | Açık olanlar aşağıda §3 borç tablosunda; kapananlar ilgili fazın arşivinde  |
| §6, §6b, §8                                                                                             | `archive/progress-yol-haritasi-arsivi.md`                                   |
| §6a (Faz 1 çıkış kriterleri)                                                                            | `archive/progress-faz-1a.md`                                                |
| §7 (plan v1.1 revizyonu)                                                                                | `archive/progress-2026-08-16-v1-yukseltme.md`                               |
| §9 (oturum günlüğü)                                                                                     | `archive/progress-oturum-gunlugu.md`                                        |
| "Faz 4 — İlerleme Takibi" (PROGRESS.md'de hiç bölüm numarası taşımadı — anlatı doğrudan arşive yazıldı) | `archive/progress-faz-4-ilerleme-takibi.md`                                 |
| §3 (bölüm adı verilmeden)                                                                               | Referansın bağlamındaki faza ait `archive/progress-*.md` dosyası            |

Kaynaktan ölçüldü (2026-08-17): repoda `docs/PROGRESS.md §N` biçiminde **71** referans var
(en yoğunu `active_planprogram.md`, 24 adet) ve §15 hariç hepsi yukarıdaki tabloyla çözülüyor.
`docs/DISCOVERY.md:721`'deki "§15" referansı bölünmeden **önce de** var olmayan bir bölümü
gösteriyordu; bu arşivlemenin yarattığı bir kırık değildir.

---

## 1. Bugünkü durum (2026-08-18)

- **Faz durumu:** Faz 0 → Faz 2, hosted senkronizasyonu, env koruması, **Faz 4 — İlerleme
  Takibi**, **A-05/A-14 turu** (ADR-0022) ve **B-036 borç turu** tamamlandı. Faz 3 (Yemek
  Fotoğrafı Makro Tahmini) **ertelendi** (ADR-0021, `active_planprogram.md` §5). **Faz 4.5 —
  Monorepo ve Mobil Temel**: ADR-0023/0024 + taşıma envanteri hazır, **commit 1-2-3-4
  tamamlandı** (npm → pnpm, `apps/web` taşıması, `packages/config`, `packages/types`), sıradaki
  adım **commit 5 (`packages/api-client` + Supabase enjeksiyonu, ADR-0024)**. Paket yöneticisi
  artık **pnpm**. Bugünkü paket yerleşimi: `apps/web` + `packages/config` + `packages/types`;
  Turborepo henüz YOK, `apps/mobile` henüz YOK. Commit 3-4 **tamamlandı, commit henüz kullanıcıda**
  (bkz. bu bölümdeki commit 3/4 sonucu paragrafı ve §6). Bkz. §5.
- **Faz 4.5 commit 1 sonucu (2026-08-18):** repo npm'den pnpm'e geçti
  (`packageManager: "pnpm@10.34.5"`); dizin yerleşimi değişmedi (`apps/`/`packages/` yok,
  Turborepo yok — commit 2+), `ai_backend` (uv) etkilenmedi. Yeni: `pnpm-lock.yaml`, `.npmrc`.
  Silinen: `package-lock.json`. Değişen: `package.json` (`packageManager`, `engines.pnpm`,
  `pnpm.onlyBuiltDependencies: ["esbuild","unrs-resolver"]`, `ci` script'i),
  `playwright.config.ts`, `.github/workflows/ci.yml` (üç job), `Dockerfile`, `README.md`,
  `CONTRIBUTING.md`, `tests/e2e/README.md`, `.prettierignore`. **ADR-0023 madde 11'in
  dur-ve-sor noktası tetiklenmedi** — `next-pwa`'nın `require('webpack')` hayalet bağımlılığı
  pnpm'in kendi gizli hoist dizini (`node_modules/.pnpm/node_modules`) sayesinde çözüldü; ne kök
  `webpack` devDependency'si, ne `public-hoist-pattern`, ne `shamefully-hoist` gerekti; izolasyon
  korundu. İki planlanmamış sapma: (a) `.npmrc`'ye `lockfile=true` eklendi — pnpm 10
  `package-lock=false`'u kendi kilidine de devrediyor, `pnpm import` bayraksız
  `ERR_PNPM_CONFIG_CONFLICT_LOCKFILE_ONLY_WITH_NO_LOCKFILE` ile düşüyordu; (b) `pnpm-lock.yaml`
  `.prettierignore`'a eklendi — Prettier YAML'ı biçimlendirdiği için `format:check` kırılıyordu.
  **Yeni tuzak:** `pnpm run X -- --flag` npm gibi davranmaz, pnpm `--`'yi script'e olduğu gibi
  iletir; doğru biçim ayırıcısız: `pnpm run db:clean-e2e --yes` (bkz. §4).
- **Faz 4.5 commit 3 sonucu (2026-08-18):** `packages/config` tamamlandı, **commit henüz
  kullanıcıda**. Paylaşılan tsconfig/eslint `@repo/config` paketine çıkarıldı (private, build
  adımı yok, ham json/mjs): `tsconfig/base.json` + `next.json` + `e2e.json` +
  `eslint/base.mjs`; `apps/web` bunları extend ediyor. `paths`/`include`/`exclude` bilinçli
  olarak `apps/web`'de kaldı — TypeScript'te `paths` onları **bildiren** dosyaya göre çözülür,
  taşınsaydı `@/*` kırılırdı. Kuralların sessizce kaybolmadığı kasıtlı ihlalle ispatlandı
  (type-check TS6133×2, lint eqeqeq + no-console yakaladı).
- **Faz 4.5 commit 4 sonucu (2026-08-18):** `packages/types` tamamlandı, **commit henüz
  kullanıcıda**. `src/types/**` ve `src/lib/validation/schemas.ts` → `@repo/types`. **45
  dosyada 50 import noktası** çevrildi (`@/types` → `@repo/types`, `@/lib/validation/schemas` →
  `@repo/types/schemas`). `apps/web/next.config.mjs`'e `transpilePackages: ['@repo/types']`
  eklendi — `schemas.ts` çalışma zamanı kodu (zod) taşıdığı için zorunlu. Kök `db:types` çıktı
  yolu `packages/types/src/database.ts` oldu; `.prettierignore`'daki glob yeni yola
  güncellendi. Coverage etkisi için bkz. B-046.
- **B-036 turu sonucu (2026-08-18):** `CoachUserManagement` kilo grafiği artık
  `progress_entries`'ten besleniyor (`useProgressTrend`); `form_checks` üzerine `AFTER INSERT`
  trigger + idempotent backfill eklendi
  (`supabase/migrations/20260818090000_form_check_weight_to_progress.sql`), yerel gün çevrimi
  `form_check_entry_date()`'te (`Europe/Istanbul`), trigger `SECURITY INVOKER`. AC-4.2 "tüm
  ekranlar" yarısı tamamlandı. Davranış değişikliği: koç grafiği seçicisi `1 Hafta/1 Ay/Tümü` →
  `7/30/90` gün oldu, "Tümü" kalktı (bilinçli, ADR yok). `scripts/clean-e2e-data.mjs` yan
  etkiyle düzeltildi — artık `progress_entries` satırlarının form check kökenli olup olmadığını
  DB'nin kendi `form_check_entry_date()` fonksiyonuyla ayırt ediyor; B-023 açık kalmaya devam
  ediyor.
- **Faz 4.5 hazırlık turu sonucu (2026-08-18):** ADR-0023 (monorepo kesim planı, pnpm+Turborepo,
  7 commit, iki dur-ve-sor kapısı) ve ADR-0024 (`packages/api-client` Supabase istemcisinin
  React Context ile enjeksiyonu) kabul edildi; `docs/discovery/faz-4.5-tasima-envanteri.md`
  taşımanın "önce" fotoğrafı. Kesin: `src/lib/api`'nin tamamı değil, yalnızca istemci-güvenli
  kısmı (`types/client/ai/index`) `packages/api-client`'a taşınacak;
  `proxy/auth-rate-limit/client-ip/response` `apps/web`'de kalıyor.
- **Faz 4 sonucu (2026-08-17/18):** kilo/ölçü girişi + trend grafikleri (AC-4.1, AC-4.2),
  önce/sonra fotoğraf karşılaştırma, grafik kütüphanesi `recharts`'a tekleştirildi (AC-4.3,
  B-013 eksen rengi kısmı kapandı). Doğrulamada gerçek bir kullanıcı hatası bulundu ve
  düzeltildi (00:00–03:00 arası UTC/yerel tarih uyuşmazlığı, `todayIsoDate()` tek kaynağa
  taşındı ve tarih alanı tipte zorunlu yapıldı). Ayrıntı: §2 tablosu ve
  `archive/progress-faz-4-ilerleme-takibi.md`.
- **A-05/A-14 turu sonucu (2026-08-18):** oturum deposu `localStorage` → cookie
  (`@supabase/ssr`), CSP nonce tabanlı hale getirildi; B-006/B-007 kapandı. Uygulama kararı
  ADR-0022'nin öngördüğü iki noktada saptı (istemci sayfalarında `dynamic = 'force-dynamic'`
  no-op çıktı, çözüm kök layout'ta `await connection()` oldu ve tüm rota ağacı dinamikleşti;
  `next-themes` nonce zinciri ADR'de öngörülmemişti) — ayrıntı: ADR-0022 "Uygulama notu" ekleri
  ve `archive/progress-a05-a14-cookie-nonce-csp.md`.
- **Yerel yığın:** `npx supabase start` ile ayakta; PostgreSQL **17.6**
  (`public.ecr.aws/supabase/postgres:17.6.1.141`), 27 migration + seed, 14 tablo,
  **14/14 RLS enabled + forced**.
- **Hosted proje:** `nxftmxkpmuyeelrmwofv.supabase.co` — yerel zincirin birebir aynısı
  (25 migration; tablo=14, force_rls=14, public politika=57, storage politika=12, fonksiyon=31).
- **Env:** `.env.local` **yerel** yığını gösterir; hosted kimlikleri `.env.hosted.local`'dadır.
  Hosted'a bilinçli erişim yalnızca `dev:hosted` / `build:hosted` / `start:hosted` ile ve
  `ALLOW_HOSTED_TARGET=1` gerektirir; bayraksız her hosted koşusu fail-closed reddedilir.
  **Gerçek production'da `ALLOW_HOSTED_TARGET=1` set edilmek zorundadır** (deploy sözleşmesi).
- **Katalog:** yerel `exercises` **1328**, `food_database` **591**; hosted 1318 / 581
  (fark `seed.sql`'in yalnızca yerelde koşan demo satırları — drift değil).
- **Lint uyarıları bilinçlidir:** `@next/next/no-img-element` (harici/dinamik görsellerde
  `next/image` bilerek tercih edilmedi — Supabase URL'leri ve `ui-avatars.com`) ve `no-console`
  (`src/lib/logger.ts` tarayıcı adaptöründe, `pino` tarayıcı bundle'ına girmesin diye).
  Son turda 17 uyarı (Faz 4 öncesi 14'tü; artış Faz 4'ün fotoğraf gösterimi, aynı `no-img-element`
  sınıfı — B-041); sayı turdan tura değişir, sıfırlanması hedeflenmiyor.

### Servis sürümleri (yerel = hosted)

| Servis    | Önce (PG15) | Şimdi (PG17) | Hosted     |
| --------- | ----------- | ------------ | ---------- |
| Postgres  | 15.8.1.085  | 17.6.1.141   | 17.6.1.141 |
| PostgREST | v16.1       | **v14.5**    | v14.5      |
| GoTrue    | v2.195.0    | v2.195.0     | v2.195.0   |
| Storage   | v1.69.0     | v1.69.0      | v1.69.0    |

### Son doğrulama koşusu (env koruması + yerel PG17 turu)

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
| Tip kontrolü (A-05/A-14 sonrası)                                 | `npm run type-check`                                                   | Temiz                                                                                                                       | 2026-08-18 |
| Lint (A-05/A-14 sonrası)                                         | `npm run lint`                                                         | 0 hata, 17 uyarı                                                                                                            | 2026-08-18 |
| Biçim (A-05/A-14 sonrası)                                        | `npm run format:check`                                                 | Temiz                                                                                                                       | 2026-08-18 |
| Birim/bileşen testleri (A-05/A-14 sonrası)                       | `npm run test`                                                         | **614/614 (50 dosya)** (tur başında 598/48)                                                                                 | 2026-08-18 |
| Production build (A-05/A-14 sonrası)                             | `npm run build`                                                        | Başarılı; route tablosunda `○` kalmadı (10/10 `ƒ`)                                                                          | 2026-08-18 |
| E2E testleri, paralel (A-05/A-14 sonrası)                        | `npm run test:e2e`                                                     | **52/54** — düşen ikili `plans.spec.ts:292` / `progress.spec.ts:66` (B-037, cookie/CSP kaynaklı değil)                      | 2026-08-18 |
| E2E testleri, seri doğrulama (A-05/A-14 sonrası)                 | `npm run test:e2e -- --workers=1` (düşen ikili)                        | **14/14**                                                                                                                   | 2026-08-18 |
| Veritabanı migration'ları (B-036 sonrası)                        | `npx supabase db reset`                                                | **27 migration, 0 hata**                                                                                                    | 2026-08-18 |
| RLS politika testleri (B-036 sonrası)                            | `npm run test:rls`                                                     | **113/113** (110'dan; 3 yeni senaryo)                                                                                       | 2026-08-18 |
| Plan transform testleri (B-036 sonrası)                          | `npm run test:transform`                                               | 26/26                                                                                                                       | 2026-08-18 |
| Tip kontrolü (B-036 sonrası)                                     | `npm run type-check`                                                   | Temiz                                                                                                                       | 2026-08-18 |
| Lint (B-036 sonrası)                                             | `npm run lint`                                                         | 0 hata, 17 uyarı (taban korundu)                                                                                            | 2026-08-18 |
| Biçim (B-036 sonrası)                                            | `npm run format:check`                                                 | Temiz                                                                                                                       | 2026-08-18 |
| Birim/bileşen testleri (B-036 sonrası)                           | `npm run test`                                                         | **626/626 (51 dosya)** (tur başında 614/50)                                                                                 | 2026-08-18 |
| Production build (B-036 sonrası)                                 | `npm run build`                                                        | Başarılı                                                                                                                    | 2026-08-18 |
| `db:types` diff (B-036 sonrası)                                  | `supabase gen types --local`                                           | 11 satır (yeni iki fonksiyon)                                                                                               | 2026-08-18 |
| E2E testleri, paralel (B-036 sonrası)                            | `npm run test:e2e`                                                     | **52/54** — düşen ikili yine `plans.spec.ts:292` / `progress.spec.ts:66`                                                    | 2026-08-18 |
| E2E testleri, seri doğrulama (B-036 sonrası)                     | `npm run test:e2e -- --workers=1` (plans+progress+form-check)          | **16/16** — düşüş B-037 kaynaklı, B-036'dan bağımsız olduğu kanıtlandı                                                      | 2026-08-18 |
| Lint (Faz 4.5 c1 — npm → pnpm sonrası)                           | `pnpm run lint`                                                        | 0 hata, 17 uyarı (taban korundu)                                                                                            | 2026-08-18 |
| Kimlik ratchet (Faz 4.5 c1 sonrası)                              | `pnpm run ratchet`                                                     | Tüm sayaçlar tavanla eşit                                                                                                   | 2026-08-18 |
| Tip kontrolü (Faz 4.5 c1 sonrası)                                | `pnpm run type-check`                                                  | Temiz                                                                                                                       | 2026-08-18 |
| Biçim (Faz 4.5 c1 sonrası)                                       | `pnpm run format:check`                                                | Temiz                                                                                                                       | 2026-08-18 |
| Birim/bileşen testleri (Faz 4.5 c1 sonrası)                      | `pnpm run test`                                                        | **626/626 (51 dosya)** — geçiş öncesiyle birebir                                                                            | 2026-08-18 |
| Production build (Faz 4.5 c1 sonrası)                            | `pnpm run build`                                                       | Başarılı, route tablosu 10/10 `ƒ`                                                                                           | 2026-08-18 |
| PWA zinciri (Faz 4.5 c1 sonrası)                                 | build sonrası `public/sw.js` + `workbox-*.js`                          | **Taze üretildi** — pnpm altında next-pwa sağlam                                                                            | 2026-08-18 |
| RLS / transform (Faz 4.5 c1 sonrası)                             | `pnpm run test:rls` / `test:transform`                                 | 113/113 · 26/26                                                                                                             | 2026-08-18 |
| Docker imajı (Faz 4.5 c1 sonrası)                                | yerel `docker build` + çalıştırma                                      | Build geçti; `/api/health` 200, `/sw.js` 200                                                                                | 2026-08-18 |
| `pnpm audit --prod` (Faz 4.5 c1 sonrası)                         | `pnpm audit --prod --audit-level=high`                                 | 0 zafiyet, exit 0 (`--prod` olmadan dev ağacında bulgular var — niyet korundu)                                              | 2026-08-18 |
| E2E testleri, paralel (Faz 4.5 c1 sonrası)                       | `pnpm run test:e2e`                                                    | **52/54** — düşen ikili yine `plans.spec.ts:292` / `progress.spec.ts:66`                                                    | 2026-08-18 |
| E2E testleri, seri doğrulama (Faz 4.5 c1 sonrası)                | `pnpm run test:e2e -- --workers=1`                                     | **14/14** — düşüşün B-037 olduğu, pnpm kaynaklı olmadığı kanıtlandı                                                         | 2026-08-18 |
| Lint (Faz 4.5 c3 — `packages/config` sonrası)                    | `pnpm run lint`                                                        | 0 hata, 17 uyarı (taban korundu)                                                                                            | 2026-08-18 |
| Tip kontrolü (Faz 4.5 c3 sonrası)                                | `pnpm run type-check`                                                  | Temiz                                                                                                                       | 2026-08-18 |
| Biçim (Faz 4.5 c3 sonrası)                                       | `pnpm run format:check`                                                | Temiz                                                                                                                       | 2026-08-18 |
| Birim/bileşen testleri (Faz 4.5 c3 sonrası)                      | `pnpm run test`                                                        | **626/626 (51 dosya)** — taban korundu                                                                                      | 2026-08-18 |
| Kapsam (Faz 4.5 c3 sonrası)                                      | `pnpm run test:coverage`                                               | Geçti                                                                                                                       | 2026-08-18 |
| Production build (Faz 4.5 c3 sonrası)                            | `pnpm run build`                                                       | Başarılı, route tablosu 10/10 `ƒ`                                                                                           | 2026-08-18 |
| E2E testleri, paralel (Faz 4.5 c3 sonrası)                       | `pnpm run test:e2e`                                                    | **52/54**                                                                                                                   | 2026-08-18 |
| E2E testleri, seri doğrulama (Faz 4.5 c3 sonrası)                | `pnpm run test:e2e -- --workers=1`                                     | **14/14** — B-037                                                                                                           | 2026-08-18 |
| Lint (Faz 4.5 c4 — `packages/types` sonrası)                     | `pnpm run lint`                                                        | 0 hata, 17 uyarı (taban korundu)                                                                                            | 2026-08-18 |
| Tip kontrolü (Faz 4.5 c4 sonrası)                                | `pnpm run type-check`                                                  | Temiz                                                                                                                       | 2026-08-18 |
| Biçim (Faz 4.5 c4 sonrası)                                       | `pnpm run format:check`                                                | Temiz                                                                                                                       | 2026-08-18 |
| Birim/bileşen testleri (Faz 4.5 c4 sonrası)                      | `pnpm run test`                                                        | **626/626 (51 dosya)** — taban korundu                                                                                      | 2026-08-18 |
| Kapsam (Faz 4.5 c4 sonrası)                                      | `pnpm run test:coverage`                                               | Geçti (satır **%52.87**, eşik 52 — bkz. B-046)                                                                              | 2026-08-18 |
| Production build (Faz 4.5 c4 sonrası)                            | `pnpm run build`                                                       | Başarılı, route tablosu 10/10 `ƒ`                                                                                           | 2026-08-18 |
| E2E testleri, paralel (Faz 4.5 c4 sonrası)                       | `pnpm run test:e2e`                                                    | **52/54**                                                                                                                   | 2026-08-18 |
| E2E testleri, seri doğrulama (Faz 4.5 c4 sonrası)                | `pnpm run test:e2e -- --workers=1`                                     | **14/14** — B-037                                                                                                           | 2026-08-18 |

Tarihsel doğrulama satırları ilgili fazın arşiv dosyasındadır.

---

## 2. Tamamlanan fazlar (anlatı arşivde)

| Faz / tur                          | Sonuç                                                                                       | Arşiv                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| v1.0 yükseltmesi + ilk 4 oturum    | TS strict, FastAPI, Supabase RLS, test/CI/Docker; E2E ilk koşu, 3 kritik kırık              | `archive/progress-2026-08-16-v1-yukseltme.md`  |
| Faz 1a                             | Roller `coach`/`client`, ADR ayrıştırması, private storage + signed URL                     | `archive/progress-faz-1a.md`                   |
| Faz 1b                             | Planların normalize tablolara taşınması — **ayrı kapanış kaydı yazılmadı**                  | `archive/progress-yol-haritasi-arsivi.md`      |
| Faz 1.5                            | Güvenlik denetimi: 39 bulgu, 37'si kapandı (A-05/A-14 ertelendi)                            | `archive/progress-faz-1.5-guvenlik.md`         |
| Faz 1.6                            | Görsel kimlik Katman A: token, tipografi, CI ratchet                                        | `archive/progress-faz-1.6-gorsel-kimlik.md`    |
| Faz 1.7                            | Borç temizliği + katalog import'u (10 → 1328 / 591)                                         | `archive/progress-faz-1.7-borc-temizligi.md`   |
| Faz 2                              | Koç-danışan çekirdek akışı (2a–2j); AC-2.1–2.4 + AC-1.6.7                                   | `archive/progress-faz-2-cekirdek-akis.md`      |
| Hosted senkron + env koruması/PG17 | ADR-0020 push + parite; üç katmanlı env guard'ı, yerel PG 15 → 17                           | `archive/progress-hosted-senkron-ve-env.md`    |
| Faz 4                              | İlerleme takibi (4a–4d) + 3 düzeltme turu; AC-4.1–AC-4.3; UTC/yerel tarih hatası düzeltildi | `archive/progress-faz-4-ilerleme-takibi.md`    |
| A-05/A-14 turu                     | Oturum deposu localStorage → cookie (@supabase/ssr), nonce tabanlı CSP; B-006/B-007 kapandı | `archive/progress-a05-a14-cookie-nonce-csp.md` |

---

## 3. Açık borçlar

**Tek tablo, kalıcı ID.** Yalnızca **açık veya kısmen açık** maddeler burada durur; bir borç
kapandığında satırı buradan silinir ve kapatan fazın arşiv dosyasına kapanış notuyla taşınır.
Yeni borç, bir sonraki boş `B-xxx` numarasını alır (numaralar tekrar kullanılmaz). Her
maddenin tam metni ve kanıtı `Kaynak` sütunundaki arşiv dosyasındadır.

| ID    | Borç                                                                                                           | Kaynak                                                           | Durum                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-001 | PWA `runtimeCaching` `workout_logs` yanıtlarını cihazda 7 gün tutuyor                                          | v1 yükseltmesi — `archive/progress-2026-08-16-v1-yukseltme.md`   | Kısmi — `profiles` cache'i kaldırıldı, logout temizliği eklendi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B-002 | `npm audit` dev ağacında zafiyet var; `npm audit fix --force` ÇALIŞTIRILMAMALI (Next 16'yı düşürür)            | v1 yükseltmesi — aynı dosya                                      | Açık — `--omit=dev` 0 zafiyet, kalan kök `next-pwa` build ağacı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B-004 | Kullanıcıya görünen Türkçe arayüz metinlerinin ürün diliyle hizası tam doğrulanmadı                            | Faz 1a — `archive/progress-faz-1a.md`                            | Açık — Faz 2a bir süpürme yaptı, kalan metinler sayılmadı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B-005 | Birikmiş eski yetim storage dosyaları için toplu temizlik yok; storage dışı mutlak URL'ler dönüştürülmedi      | Faz 1.7 — `archive/progress-faz-1.7-borc-temizligi.md`           | Kısmi — yeni yüklemede eski avatar siliniyor; toplu silme onay ister                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B-008 | Yüklenen dosya inline servis ediliyor (`download`/`Content-Disposition` yok)                                   | Faz 1.5 — `archive/progress-faz-1.5-guvenlik.md`                 | Açık                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B-009 | `42501` (RLS reddi) yalnızca kullanıcının kendi tarayıcı konsoluna yazılıyor                                   | Faz 1.5 + Faz 1.7 — `archive/progress-faz-1.7-borc-temizligi.md` | Kısmi — merkezî yakalama var, sunucu tarafı güvenlik kaydı yok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B-010 | Plan tablolarında denetim izi yok (satırı kimin yazdığı tutulmuyor)                                            | Faz 1.5 — `archive/progress-faz-1.5-guvenlik.md`                 | Açık — ADR-0014'ün kabul edilen bedeli                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B-011 | Ekranlardaki `text-gray-400`/`text-gray-500` kullanımları `text-secondary`'ye çevrilmedi                       | Faz 1.6 — `archive/progress-faz-1.6-gorsel-kimlik.md`            | Kısmi — token tanımlı ve AA doğrulamalı, ekranlar Katman B'de                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| B-012 | Katman B restilizasyonu tamamlanmadı (`font-black` 25, `rounded-3xl` 15, gradyan 12)                           | Faz 1.6 / Faz 2 — `archive/progress-faz-1.6-gorsel-kimlik.md`    | Açık — ratchet yalnızca kötüleşmeyi engelliyor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B-013 | Chart.js eksen rengi ve `html2canvas` dışa aktarımı kimlik sisteminin dışında                                  | Faz 1.6 — aynı dosya                                             | Kısmi — Faz 4'te Chart.js kaldırıldı, eksen rengi token'a çekildi; `html2canvas` PNG dışa aktarımı hâlâ açık                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B-014 | `border` token'ı anlamlı UI sınırları için WCAG 1.4.11'i (3:1) geçmiyor                                        | Faz 1.6 — aynı dosya                                             | Açık — `border-strong` ihtiyacı Katman B'de doğacak                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-015 | `::-webkit-scrollbar-thumb` hâlâ ham `#3f3f46`                                                                 | Faz 1.6 — aynı dosya                                             | Açık — bilinçli olarak token sisteminin dışında                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B-016 | Revize `warning` token'ı ekranlara akmıyor (bileşenler `text-orange-*`/`amber-*`)                              | Faz 1.6 — aynı dosya                                             | Açık — kontrast kazancı Katman B'de gerçekleşecek                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B-017 | Ratchet emoji sayacının sözcük çözümleyicisi tam ayrıştırıcı değil                                             | Faz 1.6 — aynı dosya                                             | Açık — ADR-0018'in kabul ettiği takas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B-018 | Katalog (1328 egzersiz + 591 besin) mount anında **tümüyle** istemciye çekiliyor                               | Faz 1.7 — `archive/progress-faz-1.7-borc-temizligi.md`           | Açık — `useCatalog.fetchAllRows` yalnızca PostgREST 1000 satır tavanını aşmak için sayfalıyor; sunucu taraflı arama + gerçek sayfalama yok (2026-08-18'de kodda doğrulandı)                                                                                                                                                                                                                                                                                                                                                                          |
| B-019 | `useApproveProgram` (koç onay yolu) hâlâ 3 atomik olmayan çağrı yapıyor                                        | Faz 1.7 + Faz 2 (mükerrer kayıt birleştirildi)                   | Açık — aynı RPC muamelesi için aday                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-020 | `pg_default_acl`'deki `supabase_admin` kaydı (tablo ve sequence) değiştirilemiyor                              | Faz 1.5 / Faz 1.7                                                | Açık — pratik etkisi yok; RLS senaryo 73/84 izliyor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-021 | RLS senaryo 83 her koşuda `exercises` id'lerinde 1 boşluk bırakıyor                                            | Faz 1.7 — aynı dosya                                             | Açık — zararsız, dosyada belgelendi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-022 | `exercises.csv` (8.7 MB ham) hâlâ repoda; `data/README.md` Git LFS öneriyor                                    | Faz 1.7 — aynı dosya                                             | Açık — kanonik import kaynağı `clean_exercises_v2.csv`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B-023 | Yerel E2E veritabanı birikiyor, hiç temizlenmiyor; imzalı URL yükü her koşuda büyüyor                          | Faz 2 — `archive/progress-faz-2-cekirdek-akis.md`                | Kısmi — Faz 4'te `scripts/clean-e2e-data.mjs` (`db:clean-e2e`) yazıldı, varsayılan `--dry-run`; gerçek silme hâlâ açık onay ister                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B-024 | E2E kilit ilanı zorunlu değil (`resource(...)` ilan edilmezse sessiz yarış)                                    | Faz 2 — aynı dosya                                               | Açık — tek koruma README kuralı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B-025 | AC-2.2 payı ~2x ve yük duyarlı (ölçüm 233–1005 ms, sınır 2000 ms)                                              | Faz 2 — aynı dosya                                               | Açık — B-023 büyürse ilk burası sıkışır                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B-026 | Arşiv plan versiyonları için GC yok; versiyon gezgini UI'ı yok                                                 | Faz 2 — aynı dosya                                               | Açık — şema hazır, yüzey yok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B-027 | `video_url` hiçbir yerde doldurulmuyor (allowlist'li embed yolu uykuda)                                        | Faz 2 — aynı dosya                                               | Açık                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B-028 | `message-attachments` için storage tarafında magic-byte doğrulaması yok                                        | Faz 2 — aynı dosya                                               | Açık — istemci tarafı doğrulama var                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B-029 | Koçun ara plan düzenlemeleri arşivlenmiyor                                                                     | Faz 2 — aynı dosya                                               | Açık — copy-on-write'ın bilinçli bedeli                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B-030 | Hosted yedeği tek kopya ve elle alınmış; düzenli yedekleme stratejisi yok                                      | Hosted senkron — `archive/progress-hosted-senkron-ve-env.md`     | Açık — gerçek danışan verisi oluşmadan çözülmeli                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| B-031 | Tarayıcıdan doğrudan Supabase'e yazma yolunu yalnızca Katman 0+1 kapatıyor                                     | Env koruması — aynı dosya                                        | Açık — sunucu guard'ı bu yolu tasarım gereği kesemez                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B-032 | Guard regex'i `*.supabase.co`/`.com` ile sınırlı; custom domain'li proje takılmaz                              | Env koruması — aynı dosya                                        | Açık — sessizce geçer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B-033 | `.env.hosted.local` diskte düz metin `service_role` anahtarı taşıyor                                           | Env koruması — aynı dosya                                        | Açık — değişen tek şey varsayılan olarak yüklenmemesi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B-034 | PostgREST v14.5 eşleşmesi `.temp` manifestine bağlı; hosted yükseltilirse sessiz sürükleme                     | Env koruması — aynı dosya                                        | Açık — `supabase link` yeniden koşulmalı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B-035 | Supabase CLI global PATH'te yok                                                                                | Ortam                                                            | Açık — `supabase ...` yerine `npx supabase ...` kullanılmalı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B-037 | `plans.spec.ts:292` / `progress.spec.ts:66` yerel E2E'de paralellik > 1'de sistematik düşüyor                  | Faz 4 — aynı dosya                                               | Açık — CI (workers=1) etkilenmiyor; yerel worker tavanı 2'ye indirildi                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B-038 | `progress_photos` yüklemesinde `insert` başarısız olursa storage nesnesi yetim kalıyor                         | Faz 4 — aynı dosya                                               | Açık — `useFormChecks.uploadPose`'daki mevcut takasın aynısı, yeni değil                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B-039 | `scripts/clean-e2e-data.mjs` mutasyona uğramış seed satırlarının durumunu geri yüklemiyor                      | Faz 4 — aynı dosya                                               | Açık — bilinçli, gerekçesi script çıktısında                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B-040 | `seed.sql`'in tek `pending` onay satırı hem demo hem fikstür işi görüyor; E2E tüketince demo kuyruğu boşalıyor | Faz 4 — aynı dosya                                               | Açık — öneri: E2E kendi `pending` satırını üretsin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B-041 | Lint uyarı tabanı 14 → 17 (Faz 4'ün fotoğraf gösterimi, bilinen `no-img-element` sınıfı)                       | Faz 4 — aynı dosya                                               | Açık — bilinçli, `next/image` harici URL'lerde bilerek tercih edilmedi                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B-042 | Hesap silme akışı yok — KVKK/GDPR "unutulma hakkı" karşılanmıyor                                               | `docs/security/hardening-prompt-v2.md` #21                       | Açık — gerçek danışan verisi oluşmadan kapanmalı (B-030 ile aynı tetikleyici); kapsam: `active_planprogram.md` §7a (Faz 4.6)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B-043 | AI uçlarında kullanıcı başına günlük kota yok (yalnız IP/kullanıcı bazlı hız sınırı var)                       | `docs/security/hardening-prompt-v2.md` #22                       | Açık — kapsam: `active_planprogram.md` §7a (Faz 4.6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B-044 | `style-src 'unsafe-inline'` kalıcı boşluk — nonce inline `style` niteliklerine (`style-src-attr`) uygulanmıyor | A-05/A-14 turu — `archive/progress-a05-a14-cookie-nonce-csp.md`  | Açık — bilinçli (ADR-0022 Karar 4); 17 `style={{}}` kullanımı + `recharts` çalışma anı stilleri                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B-045 | Cookie geçişinden sonra tarayıcılarda kalan eski `sb-*-auth-token` `localStorage` artıkları temizlenmiyor      | A-05/A-14 turu — `archive/progress-a05-a14-cookie-nonce-csp.md`  | Açık — zararsız artık; tek seferlik temizlik kodu yazılmadı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| B-046 | `vitest.config.ts` coverage `lines`/`statements` eşiği 60 → 52 indirildi (CI onarımı, ölçülen %53.85)          | CI onarımı — `docs/PROGRESS.md` (bu tur)                         | Açık — `MessagesTab.tsx` (0/455), `FormCheckTab.tsx` (0/362), `WorkoutTab.tsx` (21/590) testleri yazılınca 60'a geri çıkarılmalı (bu üçü tek başına ~+10 puan). Faz 4.5 commit 4'ten sonra satır kapsamı %53.85 → **%52.87**'ye düştü, eşiğe **0.87 puan** kaldı — `schemas.ts` iyi kapsanan bir dosyaydı, `@repo/types`'a çıkınca `apps/web` coverage kümesinin paydası küçüldü. Commit 5'te `hooks/` + `lib/api` çıkınca etki tekrarlanacak; o dosyalar düşük kapsamlı olduğu için bu kez oranı yukarı itebilir de — **ölçülmeden varsayılmamalı** |
| B-047 | `db:types` çıktısının commit'lenmiş dosyayla aynı olduğunu doğrulayan drift check hiç yok                      | Faz 4.5 commit 4 ölçümü — `docs/PROGRESS.md` (bu tur)            | Açık — `.github/workflows/ci.yml`'de `db:types`/`gen types`/drift geçen tek satır yok; PROGRESS.md'deki iki diff kaydı elle yapılmış. `active_planprogram.md` AC-1.4 ("CI'da drift check vardır") bugüne kadar hiç karşılanmamış, AC-4.5.4 bunu `packages/types`'a taşımayı istiyor ama taşınacak mekanizma yok — Faz 4.5 commit 7'de (CI/turbo kapıları) kurulmalı                                                                                                                                                                                  |
| B-048 | `apps/web/tsconfig.e2e.json` hiçbir kapıda koşulmuyor                                                          | Faz 4.5 commit 4 ölçümü — `docs/PROGRESS.md` (bu tur)            | Açık — `type-check` (`tsc --noEmit`) kök `tsconfig.json`'ı kullanıyor ve o `tests/e2e`'yi hariç tutuyor; hiçbir script `tsc -p tsconfig.e2e.json` çalıştırmıyor, E2E dosyalarının tip hataları hiçbir kapıda görünmüyor (yalnızca editörde). Bugün `npx tsc -p tsconfig.e2e.json --noEmit` exit 0 (temiz) — borç, kapının yokluğu; commit 7'de kapıya eklenmeli                                                                                                                                                                                      |

**Ertelenenler (borç değil, bilinçli v2 kuyruğu):** Turborepo (pnpm'e geçiş Faz 4.5 commit
1'de tamamlandı — bkz. §1), Expo mobil,
Redis/Upstash rate limiter, `next-pwa` → `@ducanh2912/next-pwa` veya Turbopack geçişi,
`exercises.csv` için Git LFS, `useCoachId()`'nin koç
oturumlarında gereksiz çalışması, planların `jsonb` sütuna taşınması. Tam liste:
`archive/progress-yol-haritasi-arsivi.md`.

---

## 4. Bağlayıcı sözleşmeler ve bilinen tuzaklar

**Kararlar:** kanonik kayıt `docs/adr/` altındadır — indeks
[`docs/adr/README.md`](adr/README.md) (ADR-0001…ADR-0021). Bu dosyada karar kaydı tutulmaz.
ADR'si olmayan ama hâlâ bağlayıcı üç sözleşme:

- Prettier `semi: false` — kod tabanı noktalı virgülsüz.
- CSP `connect-src`/`img-src` **yalnızca** `NEXT_PUBLIC_SUPABASE_URL`'den türetilen somut
  origin'i içerir; wildcard yok.
- RLS testleri düz SQL script'tir (pgTAP değil): `pnpm run test:rls`.

**Tuzaklar** (hepsi bu projede en az bir kez gerçekten yakıldı):

- **Hosted'a yazma riski:** env override'sız bir E2E/build koşusu hosted projeye **gerçek veri
  yazar** (`daily-log` senaryosu kayıt oluşturur). Bugün üç katman koruyor ama tarayıcıdan
  giden yazmalar için tek güvence `.env.local`'ın yerel kalması (B-031).
- **`--linked` bayrağı hosted'ı hedefler:** `supabase db dump --linked`, `supabase db push` ve
  benzeri komutlar yerel yığına değil **barındırılan projeye** gider. Yerel iş için
  `npx supabase db reset` / `npx supabase status` kullan.
- **`db:seed` / `db reset` / toplu silme** CLAUDE.md gereği o çağrıya özel açık kullanıcı
  onayı ister — script'in repoda var olması onu çalıştırma onayı değildir.
- **Türkçe İ:** JS'te `"ŞİFRE".toLowerCase()` `şi̇fre` üretir; `/…/i` regex'i `İ` ile
  eşleşmez — E2E locator'larında birebir metin kullan. Git Bash'te `grep -i "öğrenci"` büyük
  `Ö`'yü sessizce kaçırır; açık alternasyonla tara.
- **E2E paralelliği:** `chromium` + `Mobile Chrome` projeleri her spec'i **aynı anda iki kez**
  koşar. Paylaşılan kayda yazan her test `tests/e2e/resource-lock.ts` ile `resource(...)` ilan
  etmelidir (B-024).
- **jsdom:** `Blob.text()` / `Blob.arrayBuffer()` yok — `FileReader` fallback'i kullan.
- **`[auth.rate_limit]` korumuyor:** `supabase/config.toml`'daki bölüm upstream hatası
  ([supabase/supabase#41947](https://github.com/supabase/supabase/issues/41947)) nedeniyle
  `/token?grant_type=password`'ü korumaz; kasıtlı olarak repoda bırakıldı. Fiili koruma
  uygulama katmanında (`src/app/api/auth/sign-in/route.ts` + `src/lib/api/auth-rate-limit.ts`).
- **Build `next build --webpack` ile alınır** (`next-pwa` v5 Turbopack ile çakışıyor —
  ADR-0006/0012); `--webpack` pinlemesinin ne zaman terk edileceği hâlâ açık soru (T-04).
- **Bash aracı ~8 KB üzerinde içeriği ortadan kırpar** ve yanıltıcı `unexpected EOF` verir —
  uzun içerik 6 KB altı parçalara bölünüp `>>` ile eklenmelidir. Alt ajanların rapor `.md`
  dosyalarını `Write` ile yazması engellenebiliyor; `Edit` veya heredoc kullanılmalı.
- **`pnpm run X -- --flag` npm gibi davranmaz:** pnpm `--`'yi script'e olduğu gibi iletir;
  doğru biçim ayırıcısız — `pnpm run db:clean-e2e --yes` (Faz 4.5 c1).
- **`git checkout -- <dosya>` `format:check`'i GÖRÜNMEZ biçimde kırar.** Repoda
  `core.autocrlf=true` ve `.gitattributes` `* text=auto`; çalışma kopyasındaki dosyaların çoğu
  LF (araçlar öyle yazdı), ama `git checkout --` ile geri alınan dosya **CRLF** olarak yazılır
  (`git ls-files --eol` → `i/lf w/crlf`). Prettier'ın `endOfLine: "lf"` varsayılanı buna takılır
  ve `pnpm run format:check` düşer — üstelik `git diff --numstat` **boş** olduğu için kırık
  görünmez. Kırmızı-yeşil kanıtı için geçici dosya bozup geri alan her ajan bunu üretir; çözüm
  geri aldıktan sonra `npx prettier --write <dosya>` çalıştırmak. CI (Linux, LF) bunu hiç
  görmez — yalnızca yerelde ısırır. (2026-08-18, B-047/B-048 turunda yakalandı.)
- **CI'ın ambient `process.env`'i doludur, yerelde boştur:** `vi.unstubAllEnvs()` çağıran
  testler (env-hosted-guard, env, env-production, auth-sign-in-rate-limit, security-events,
  proxy-rate-limit, csp-nonce) test sonunda ambient env'e düşer. CI'ın workflow-env'i
  gerçekten set edilmiş olduğundan, buradaki placeholder değerler **asla** gerçek hosted
  desenine (`*.supabase.co`/`.com`) benzememelidir — benzerse `env.server.ts`'teki fail-closed
  guard CI'da (yerelde değil) fırlar ve bu testler kırılır (CI onarımı, bu tur).

**Bağlayıcı kural:** "yerel yeşil" tek başına doğrulama sayılmaz. Her doğrulama tablosu
satırı, push edilen commit'in **CI run ID'sini ve conclusion'ını** (`gh run list` /
`gh run watch <run-id> --exit-status` çıktısı) içermek zorundadır.

---

## 5. Sıradaki iş

**Faz 4.5 — Monorepo ve Mobil Temel** (`active_planprogram.md` §7). ADR-0023 (kesim planı) ve
ADR-0024 (api-client enjeksiyonu) + `docs/discovery/faz-4.5-tasima-envanteri.md` — **hazır**
(2026-08-18); **commit 1-2-3-4 tamamlandı** (npm → pnpm, `apps/web` taşıması, `packages/config`,
`packages/types` — 2026-08-18, bkz. §1; commit henüz kullanıcıda, bkz. §6), sıradaki adım
**commit 5 — `packages/api-client` + Supabase enjeksiyonu (ADR-0024)**, ardından **commit 6 —
`apps/mobile` Expo temeli** ve **commit 7 — CI/Docker/turbo kapıları**. Commit 7'nin artık iki
ek yükü var (Faz 4.5 c3-c4 turunda tespit edildi, bkz. §3): **B-047** (`db:types` drift check'inin
CI'da kurulması) ve **B-048** (`tsconfig.e2e.json`'ın bir type-check kapısına eklenmesi). Faz 4 —
İlerleme Takibi — **tamamlandı** (2026-08-17/18, bkz. §2, `archive/progress-faz-4-ilerleme-takibi.md`).
A-05/A-14 turu (ADR-0022) — **tamamlandı** (2026-08-18, bkz. §2,
`archive/progress-a05-a14-cookie-nonce-csp.md`). B-036 borç turu — **tamamlandı** (2026-08-18,
bkz. §1). Faz 3 — Yemek Fotoğrafı Makro Tahmini — **ertelendi** (ADR-0021,
`active_planprogram.md` §5); V0 (LLM'siz foto ekleme) dahil şimdilik yapılmıyor.

Faz dışı, sıraya girmiş iş kalemleri: E2E veritabanı temizlik script'inin gerçek silme
onayı (B-023, script yazıldı — `db:clean-e2e`) · katalog için sunucu taraflı arama +
sayfalama (B-018) · düzenli hosted yedekleme stratejisi (B-030) · Faz 4.5'ten sonra sıraya
giren Faz 4.6 — Güvenlik Tamamlama: KVKK hesap silme + AI kota (`active_planprogram.md` §7a;
B-042, B-043).

---

## 6. Son oturumlar

| Tarih                                  | İş                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-17 (Faz 2)                     | Koç-danışan çekirdek akışı, on dilim; vitest 502/502, RLS 104/104, E2E 50/50                                                                                           |
| 2026-08-17 (hosted senkronizasyonu)    | ADR-0020 uygulandı; hosted sıfırlanıp 25 migration push edildi, parite doğrulandı                                                                                      |
| 2026-08-17 (env koruması + yerel PG17) | Üç katmanlı env guard'ı + yerel Postgres 17; vitest 511/511, RLS 104/104, E2E 50/50                                                                                    |
| 2026-08-17/18 (Faz 4)                  | İlerleme takibi (4a–4d) + 3 düzeltme turu (UTC/yerel tarih hatası); vitest 598/598, RLS 110/110, E2E CI 54/54 / yerel 52/54                                            |
| 2026-08-18 (A-05/A-14)                 | Oturum deposu cookie'ye, nonce tabanlı CSP; vitest 614/614, E2E 52/54 (seri doğrulama 14/14)                                                                           |
| 2026-08-18 (B-036 + Faz 4.5 hazırlığı) | Form check kilosu progress_entries'e (trigger + backfill), koç grafiği bağlandı; ADR-0023/0024 + taşıma envanteri; vitest 626/626, RLS 113/113, E2E 52/54 (seri 16/16) |
| 2026-08-18 (Faz 4.5 c1)                | npm → pnpm geçişi; next-pwa dur-ve-sor tetiklenmedi; vitest 626/626, E2E 52/54 (seri 14/14), docker build geçti                                                        |
| 2026-08-18 (CI onarımı)                | `ci.yml` env/cache/e2e-if üç düzeltme + coverage eşiği 60→52 (B-046); CI hiç yeşil olmamıştı, kök nedenler ölçülüp giderildi                                           |
| 2026-08-18 (Faz 4.5 c3-c4)             | `packages/config` + `packages/types`; 50 import noktası `@repo/*`'a çevrildi; vitest 626/626, E2E 52/54 (seri 14/14)                                                   |

Tam oturum günlüğü (ve yeni oturum satırlarının ekleneceği yer):
`archive/progress-oturum-gunlugu.md`.
