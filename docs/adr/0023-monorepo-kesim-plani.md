# 0023 — Monorepo kesim planı

- **Durum:** Kabul edildi — uygulama Faz 4.5'te
- **Tarih:** 2026-08-18
- **Karar verenler:** Proje sahibi

## Bağlam

`0009-monorepo-ve-mobil-ertelendi.md` monorepo dönüşümünü (pnpm workspaces + Turborepo,
`packages/*`) ve Expo mobil iskeletini erteledi — gerekçe, en yıkıcı yapısal adımın hiçbir
kullanıcı değeri üretmemesi ve monorepo'nun tek gerekçesi olan mobilin Faz 5'e (sağlık
verisi) kadar zorunlu olmamasıydı. `active_planprogram.md` §7 (Faz 4.5) o ertelemenin
tetikleyicisini ve iş kalemlerini tanımlar; bu ADR o iş kalemlerini **nasıl** kesileceğine
dair somut, sıralı bir plana çevirir.

Zamanlama bilerek `0022-oturum-depolamasi-cookie-ve-nonce-csp.md`'den **sonra**dır. O ADR'nin
kendi "Zamanlama kararı" bölümü gerekçesini zaten kayda geçirdi: A-05/A-14 önce yapılırsa
`packages/api-client`'ın auth yüzeyi (Supabase istemcisinin nereden geldiği) taşıma sırasında
**tek seferde** son şeklini alır; sıra tersine çevrilseydi paket dış yüzeyi önce
`localStorage`-singleton'la kesilip A-05 geldiğinde ikinci kez yeniden tasarlanmak zorunda
kalırdı. Bugün itibarıyla ADR-0022 uygulandı (614/614 vitest, E2E yerel paralel 52/54 + seri
doğrulama) — bu ADR'nin önkoşulu karşılanmış durumda.

Bu tur **yalnızca kâğıt üstünde**: hiçbir bağımlılık kurulmadı, hiçbir dosya taşınmadı. Karar,
Faz 4.5 başladığında yürütücü ajanın tahmin yürütmesini önlemek için burada önceden sabitlenir.

## Karar

### 1. Araç seçimi ve yerleşim

pnpm workspaces + Turborepo. Paket yerleşimi: `apps/web`, `apps/mobile`, `packages/types`,
`packages/api-client`, `packages/config` (paylaşılan tsconfig/eslint).

### 2. Neyin taşınMAdığı da karar maddesidir

- **`ai_backend/` kökte kalır.** Python/uv ile yönetilir, pnpm workspace üyesi **değildir**;
  Turborepo'ya sarmak yapay bir katman olurdu ve CI'daki `backend` job'u zaten bağımsız
  çalışıyor — değişmez.
- **`supabase/` kökte kalır.** Tek veritabanı, hem `apps/web` hem `apps/mobile`'ın ortak
  omurgası; bir uygulamanın altına gömülemez.
- **`data/` ve `scripts/` kökte kalır.** İkisi de tek seferlik/CI-dışı araçlardır, hiçbir
  workspace paketinin çalışma zamanı bağımlılığı değildir.

### 3. `db:types` script'inin taşınması

`db:types` (`supabase gen types typescript --local --schema public > src/types/database.ts`)
`packages/types`'ın kendi `package.json`'ına taşınır; AC-1.4'teki "types güncel mi" drift
check'i de bu adımla birlikte oraya geçer (AC-4.5.4).

### 4. Test altyapısı yerleşimi

- Playwright `apps/web` altında kalır — `webServer` bloğu zaten o app'i (`next build && next
start`) başlatıyor, taşımanın bir anlamı yok.
- Vitest **paket başına** kendi config'ini alır (`apps/web`, `packages/api-client`,
  `packages/types` varsa); kökte bunları toplayan bir turbo `test` task'i çalışır.
- RLS (`supabase/tests/rls.test.sql`) ve transform SQL testleri `supabase/`'in kökte kalması
  gereğince kökte kalır — bunlar hiçbir zaman bir Next.js paketine ait olmadı.

### 5. Build motoru pinlemesi aynen devam eder

`next build --webpack` pinlemesi (`0006-next-pwa-korunmasi.md`,
`0012-pwa-webpack-build.md`) **değişmez**. Turbo kendi build komutunu icat etmez; yalnızca
`apps/web/package.json`'daki mevcut script'i çağırır. `turbo.json`'da `apps/web`'in `build`
task'i için `outputs: [".next/**", "!.next/cache/**"]` tanımlanır (standart Next.js önbellek
hariç tutma deseni).

### 6. Import geçişi kademelidir, toplu rewrite yok

`@/` alias'ları taşıma commit'inde (commit 2) **değişmez** — `tsconfig.json` app ile birlikte
taşınır ve `paths: { "@/*": ["./src/*"] }` bugün olduğu gibi `baseUrl` verilmeden, tsconfig'in
kendi konumuna göreli çözülmeye devam eder (ölçüldü: bugünkü `tsconfig.json`'da `baseUrl`
alanı yok, `moduleResolution: "bundler"` altında `paths` doğrudan tsconfig dizinine göre
çözülüyor — `apps/web/tsconfig.json` olarak taşınınca da aynı şekilde çalışır). Workspace
paketlerine (`@repo/types`, `@repo/api-client`) geçiş **paket başına, kademeli** yapılır — tek
seferde toplu bir import rewrite'ı **yok**. Bir paket taşınıp yeşil kapıdan geçmeden bir
sonrakine geçilmez.

### 7. Nonce zinciri bütün olarak `apps/web`'de kalır

ADR-0022 ile kurulan zincir — `src/proxy.ts` (nonce üretir) → `x-nonce` istek başlığı →
`src/app/layout.tsx` (`headers()` ile okur) → `src/app/providers.tsx` → `ThemeProvider` —
bölünemez ve bütün olarak `apps/web`'e taşınır. Gerekçe: `proxy.ts` Next 16'nın dosya
konvansiyonudur (mobilde karşılığı yok), `headers()` bir sunucu bileşeni API'sidir (React
Native'de yok), ve CSP kavramının kendisi mobilde anlamsızdır. Aynı nedenle
`src/lib/security/csp.ts` ve `src/env.server.ts` (`getServerEnv`) de `apps/web`'de kalır.

### 8. Supabase browser/server istemcileri `apps/web`'de kalır

`src/lib/supabase/client.ts` ve `src/lib/supabase/server.ts` `apps/web`'de kalır —
`@supabase/ssr`'ın cookie deposu web'e özgüdür (bkz. Bağlam). Bu, plan §7'nin "`src/lib/api` +
`src/hooks` → `packages/api-client`" cümlesine getirilen **tek çekince**: hook'lar taşınır ama
Supabase singleton'ın **doğrudan import'u** enjeksiyona döner. Taşımanın davranışa en yakın
dilimi budur (auth deposunun kendisi değişmez, yalnızca hook'ların ona nasıl eriştiği
değişir); ayrıntı ve somut arayüz `0024-api-client-supabase-enjeksiyonu.md`'de. Bu dilim ayrı
bir commit (commit 5) olarak yeşil kapı ile yürütülür.

### 9. Kapı komutları

§0.2'deki kapı komutları (`npm run lint && ... && npm run build`, `format:check`,
`test:e2e`, `ai_backend` kapısı) turbo eşdeğerleriyle değiştirilir. CI ve Docker yolları aynı
turda güncellenir — yarım kalmış bir CI, main'i kırmızıya düşürür.

### 10. Yedi commit'lik bölümleme, her birinde kapı yeşil

1. npm → pnpm (yerleşim değişmeden, Turborepo **yok** — yalnızca paket yöneticisi geçişi).
2. `apps/web` taşıması (+ davranış kanıtı, madde 12).
3. `packages/config` (paylaşılan tsconfig/eslint).
4. `packages/types`.
5. `packages/api-client` (+ Supabase enjeksiyonu, `0024`).
6. `apps/mobile` Expo iskeleti.
7. CI/Docker/turbo kapıları.

### 11. Commit 1 dur-ve-sor noktası

pnpm'in symlink'li `node_modules`'ü `next-pwa` v5/webpack zincirini kırarsa ve tek çözüm
`shamefully-hoist` / `node-linker=hoisted` gibi pnpm'in izolasyon değerini sıfırlayan bir
config ise: **kullanıcı onayı olmadan yazılmaz**, dur ve raporla.

### 12. Commit 2 dur-ve-sor noktaları

- (a) Taşıma, import/config path'i **dışında** herhangi bir kod değişikliği zorlarsa.
- (b) Next `standalone` çıktısının pnpm workspace içinde Docker build'i, mevcut
  `outputFileTracingRoot` çözümünün **ötesinde** bir strateji (turbo prune / `pnpm deploy`)
  gerektirirse.

Commit 2 "aynı davranış, yeni adres"ten ibaret olmalı; Turborepo'nun kendisi commit 3'e
kalır. CI workflow **aynı commit'te** güncellenir — güncellenmezse main kırmızıya döner.

### 13. "Davranış değişmedi" kanıtı — dörtlü paket, tek başına build route tablosu yetmez

1. `src/app/**` altındaki page/route/layout/not-found dosya listesinin **path-prefix'siz**
   diff'i (boş olmalı, bkz. `docs/discovery/faz-4.5-tasima-envanteri.md` §1 — bugün 11 dosya)
   - build route tablosu diff'i (bugün 10/10 `ƒ`, hiç `○` yok — bu oran korunmalı).
2. Vitest ve RLS testleri **aynı sayıda** yeşil (bugünkü taban: vitest 614/614 — 50 dosya, RLS
   110/110; bu sayılar B-036 turu commit'lendikten sonra yenilenmelidir, bkz. envanter §7).
3. Playwright paketi taşıma sonrası **tamamen** yeşil — AC-4.5.2'nin açık şartı, taşımanın asıl
   davranış kanıtı budur (build route tablosu tek başına yeterli değildir: statik/dinamik
   render farkı davranışı kanıtlamaz, yalnızca üretim şeklini gösterir).
4. CSP/nonce spot-check: `tests/unit/csp-nonce.test.ts` yeşil + taşıma sonrası tek bir `curl`
   ile üretim sunucusundan dönen `Content-Security-Policy` başlığının `nonce-` içerdiği elle
   doğrulanır.

### Reddedilen alternatifler

- **Mevcut yapıda kalıp yalnızca mobil için ayrı bir repo açmak.** Kod paylaşımını (tip,
  API katmanı, doğrulama şeması) baştan reddeder — monorepo'nun tek gerekçesi budur.
- **Tek seferde toplu import rewrite (workspace paketlerine geçiş hepsi bir commit'te).**
  Hata yüzeyi tek bir dev commit'e sıkışır, geri alma/teşhis maliyeti yüksek; madde 6/10
  gereği reddedildi.
- **Turborepo olmadan yalnızca pnpm workspaces.** Paket başına build/test orkestrasyonunu
  elle script'lemek gerekirdi; Turborepo'nun affected-graph ve cache kazanımı bedelsiz
  bırakılmış olurdu. Maliyeti (madde "Sonuçlar"da) kabul edilerek reddedildi.

## Sonuçlar

### Olumlu

- Faz 4.5'in en riskli adımı (yol/CI/Docker kırılması) yedi küçük, her biri kendi kapısından
  geçen commit'e bölünerek geri alınabilir hâle geliyor.
- `apps/mobile` geldiğinde `packages/types` ve `packages/api-client` zaten mevcut ve
  Supabase-enjeksiyonlu olduğu için mobil, web'in auth deposuna bağımlı doğmuyor.
- Nonce/CSP zincirinin ve Supabase browser/server istemcilerinin `apps/web`'de kalması,
  ADR-0022'nin 2026-08-18'de tamamlanan işini taşıma sırasında bozmuyor.
- Kanıt paketi (madde 13) "build alındı" ile "davranış korundu" iddialarını ayırıyor —
  taşıma sonrası sessizce kırılmış bir akışın fark edilmeden main'e girme riski düşüyor.

### Olumsuz / kabul edilen bedeller

- **Araç zinciri karmaşıklığı artıyor.** npm → pnpm + Turborepo iki yeni araç, iki yeni
  hata sınıfı (workspace çözümleme, turbo cache geçersizliği) ekliyor; tek-repo + npm'in
  basitliği geri gelmiyor.
- **CI süresi muhtemelen uzuyor** (en azından geçiş turunda): `pnpm install` + Turborepo
  cache ısınması ilk çalıştırmalarda mevcut `npm ci`'den daha yavaş olabilir; affected-graph
  kazancı yalnızca paket sayısı arttıkça (mobil + paketler devreye girince) kendini gösterir.
- **pnpm + `next-pwa` riski gerçek ve kapatılmadı** — madde 11'deki dur-ve-sor noktası tam
  da bu yüzden var; risk yalnızca ertelendi, ortadan kalkmadı.
- **İki paket yöneticisi geçiş maliyeti**: `ai_backend` `uv` ile, kök `pnpm` ile yönetiliyor
  olacak; bu zaten bugün de (npm + uv) böyleydi, ama pnpm'in workspace kavramı bu ayrımı daha
  görünür kılıyor — yeni geliştirenler için "hangi araç nerede" öğrenme maliyeti var.
- Commit 2'nin dur-ve-sor noktaları (madde 12) tetiklenirse taşıma yarıda durabilir; bu
  bilinçli bir yavaşlatma, ama teslim tarihini kesin olarak öngörülemez kılıyor.

### Etkilenen dosyalar

Bu ADR turunda (yalnızca dokümantasyon):

- `docs/adr/0023-monorepo-kesim-plani.md` (bu dosya)
- `docs/adr/0024-api-client-supabase-enjeksiyonu.md`
- `docs/adr/README.md` (iki indeks satırı)
- `docs/adr/0009-monorepo-ve-mobil-ertelendi.md` (yalnızca durum satırı: `Yerini aldı: 0023`)
- `docs/discovery/faz-4.5-tasima-envanteri.md` (yeni)
- `docs/DISCOVERY.md` (yalnızca dosya başı işaret notu)

Faz 4.5 uygulama turunda (bu ADR'nin kapsamı dışında, ileride):

- Kök: `pnpm-workspace.yaml` (yeni), `turbo.json` (yeni), kök `package.json`
- `apps/web/**` (bugünkü `src/`, `next.config.mjs`, `playwright.config.ts`, `tsconfig.json`
  dahil — tam liste `docs/discovery/faz-4.5-tasima-envanteri.md`)
- `packages/types/**`, `packages/api-client/**`, `packages/config/**` (yeni)
- `apps/mobile/**` (yeni, Expo iskeleti)
- `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`
