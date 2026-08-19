# Arşiv — Faz 4.5: Monorepo ve Mobil Temel (2026-08-18/19)

**Özet.** Repo npm'den **pnpm**'e, tek repo'dan **iki app + dört paket**
monorepo'ya geçti (`apps/web`, `apps/mobile`, `packages/config`,
`packages/types`, `packages/api-client`, `packages/logger`); görev koşucusu
**Turborepo 2.10.11** oldu. Commit 1'den 7b'ye (commit 1, 2, 3, 4, CI kapı
turu, 5, 6, 7a1, 7a2, 7b) sıralı yürütüldü. Faz 4.5'in kod tarafı **tamamlandı ve
commit'lendi** (HEAD `05af580`); **AC-4.5.3 de 2026-08-19'da (borç turu
oturumunda) Android emülatöründe koşulan gerçek bir mobil smoke ile
karşılandı** — Faz 4.5 **tamamen kapandı** (AC-4.5.6 B-052 ile ayrı bir mobil
veri katmanı turuna kapsam dışı bırakıldı, bu tek istisna). Ayrıntı: "Mobil
smoke sonucu (2026-08-19)" bölümü.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Bu dosya faz kapanışında doğrudan yazılmıştır — `docs/PROGRESS.md`'nin
> "Faz 4.5 commit 1/3/4/5/6/7a1/7a2/7b sonucu" ve "CI kapı turu sonucu"
> paragrafları buraya bilgi kaybı olmadan taşınmıştır.

---

## Faz 4.5 — Monorepo ve Mobil Temel (2026-08-18/19)

### Amaç ve karar bağlantısı

Faz 4.5, v1.0 planında Faz 0 idi; monorepo'nun tek amacı kod paylaşımı, kod
paylaşımının tek tüketicisi mobil uygulama ve mobil ilk kez Faz 5'te (sağlık
verisi) zorunlu hâle geldiği için Faz 1–4'ün ardına, elde çalışan ve test
edilmiş bir ürün varken alındı (`active_planprogram.md` §7). **Faz 4.5
hazırlık turu (2026-08-18):** ADR-0023 (monorepo kesim planı, pnpm+Turborepo,
7 commit, iki dur-ve-sor kapısı) ve ADR-0024 (`packages/api-client`
Supabase istemcisinin React Context ile enjeksiyonu) kabul edildi;
`docs/discovery/faz-4.5-tasima-envanteri.md` taşımanın "önce" fotoğrafı
olarak yazıldı. Kesin karar: `src/lib/api`'nin tamamı değil, yalnızca
istemci-güvenli kısmı (`types/client/ai/index`) `packages/api-client`'a
taşınacak; `proxy/auth-rate-limit/client-ip/response` `apps/web`'de kalacak.

### Çıkan yerleşim

Paket yöneticisi **pnpm** (`packageManager: "pnpm@10.34.5"`), görev koşucusu
**Turborepo 2.10.11**, runtime **Node 24 LTS** ("Krypton"), TypeScript
**6.0.3** (tek majöre tekleşmiş, web + mobil ikisi de aynı fiziksel `.pnpm`
örneğine symlink'li). Yerleşim: `apps/web`, `apps/mobile`, `packages/config`,
`packages/types`, `packages/api-client`, `packages/logger` — **iki app, dört
paket**.

### Faz 4.5 commit 1 sonucu (2026-08-18)

Repo npm'den pnpm'e geçti (`packageManager: "pnpm@10.34.5"`); dizin yerleşimi
değişmedi (`apps/`/`packages/` yok, Turborepo yok — commit 2+), `ai_backend`
(uv) etkilenmedi. Yeni: `pnpm-lock.yaml`, `.npmrc`. Silinen:
`package-lock.json`. Değişen: `package.json` (`packageManager`,
`engines.pnpm`, `pnpm.onlyBuiltDependencies: ["esbuild","unrs-resolver"]`,
`ci` script'i), `playwright.config.ts`, `.github/workflows/ci.yml` (üç job),
`Dockerfile`, `README.md`, `CONTRIBUTING.md`, `tests/e2e/README.md`,
`.prettierignore`. **ADR-0023 madde 11'in dur-ve-sor noktası tetiklenmedi** —
`next-pwa`'nın `require('webpack')` hayalet bağımlılığı pnpm'in kendi gizli
hoist dizini (`node_modules/.pnpm/node_modules`) sayesinde çözüldü; ne kök
`webpack` devDependency'si, ne `public-hoist-pattern`, ne `shamefully-hoist`
gerekti; izolasyon korundu. İki planlanmamış sapma: (a) `.npmrc`'ye
`lockfile=true` eklendi — pnpm 10 `package-lock=false`'u kendi kilidine de
devrediyor, `pnpm import` bayraksız `ERR_PNPM_CONFIG_CONFLICT_LOCKFILE_ONLY_WITH_NO_LOCKFILE`
ile düşüyordu; (b) `pnpm-lock.yaml` `.prettierignore`'a eklendi — Prettier
YAML'ı biçimlendirdiği için `format:check` kırılıyordu. **Yeni tuzak:**
`pnpm run X -- --flag` npm gibi davranmaz, pnpm `--`'yi script'e olduğu gibi
iletir; doğru biçim ayırıcısız: `pnpm run db:clean-e2e --yes`.

### Faz 4.5 commit 3 sonucu (2026-08-18)

`packages/config` tamamlandı. Paylaşılan tsconfig/eslint `@repo/config`
paketine çıkarıldı (private, build adımı yok, ham json/mjs):
`tsconfig/base.json` + `next.json` + `e2e.json` + `eslint/base.mjs`;
`apps/web` bunları extend ediyor. `paths`/`include`/`exclude` bilinçli
olarak `apps/web`'de kaldı — TypeScript'te `paths` onları **bildiren**
dosyaya göre çözülür, taşınsaydı `@/*` kırılırdı. Kuralların sessizce
kaybolmadığı kasıtlı ihlalle ispatlandı (type-check TS6133×2, lint eqeqeq +
no-console yakaladı).

### Faz 4.5 commit 4 sonucu (2026-08-18)

`packages/types` tamamlandı. `src/types/**` ve
`src/lib/validation/schemas.ts` → `@repo/types`. **45 dosyada 50 import
noktası** çevrildi (`@/types` → `@repo/types`, `@/lib/validation/schemas` →
`@repo/types/schemas`). `apps/web/next.config.mjs`'e
`transpilePackages: ['@repo/types']` eklendi — `schemas.ts` çalışma zamanı
kodu (zod) taşıdığı için zorunlu. Kök `db:types` çıktı yolu
`packages/types/src/database.ts` oldu; `.prettierignore`'daki glob yeni yola
güncellendi. Coverage etkisi için bkz. B-046 (`docs/PROGRESS.md` §3).

### CI kapı turu sonucu (2026-08-18, PR #12, `e4c4e01`)

Commit 4'ten sonra, commit 5 başlamadan önce **B-047 ve B-048 kapatıldı** —
ikisi de artık **kapandı**, borç tablosundan çıkarıldı. B-047: `pnpm run
db:types` çıktısının commit'lenmiş `packages/types/src/database.ts` ile aynı
olduğunu doğrulayan bir adım `e2e` job'una eklendi (RLS testlerinden sonra,
build'den önce — `frontend` job'unda yerel Supabase yığını yok). B-048:
`apps/web/tsconfig.e2e.json` için `type-check:e2e` script'i (kök + `apps/web`
`package.json`) yazıldı ve `frontend` job'una bir adım olarak eklendi. İkisi
de kırmızı-yeşil kanıtlandı. Bu tur ayrıca ADR-0024'e "Uygulama sözleşmesi
(2026-08-18 eki)" ekini yazdı (Ek-1: `storage.ts`'in istemciyi açık ilk
parametre alması; Ek-2: `logger.ts`'in `packages/logger`'a bölünmesi) —
commit 5'in uygulaması bu sözleşmeye göre yapıldı.

### Faz 4.5 commit 5 sonucu (2026-08-18)

`packages/api-client` (`@repo/api-client`) ve `packages/logger`
(`@repo/logger`) oluşturuldu; Supabase istemcisi React Context ile
enjeksiyona geçti (`SupabaseClientProvider`/`useSupabaseClient()`,
ADR-0024). AC-4.5.5 sağlandı: `apps/web/src`'te gerçek `supabase.from(`
çağrısı **sıfır** (kalanlar `Array.from(...)` ve deseni anlatan yorumlar);
`.channel(` de yalnızca yorumda geçiyor. Realtime kanal kararlılığı iki
bağımsız testle kilitlendi: `useMessages` 5 kez yeniden render edilirken
`channel(...)` tek çağrı, `removeChannel` hiç çağrılmadı; gerçek
`<Providers>` ağacında `createBrowserSupabaseClient` tam 1 kez çağrılıyor ve
`useSupabaseClient()` her render'da aynı referansı döndürüyor (yeni test:
`tests/unit/supabase-client-context.test.tsx`). Dockerfile değişmedi —
`packages/*` glob'u yeni iki paketi otomatik kapsıyor, doğrulandı;
`vitest.setup.ts` değişmedi (beklendiği gibi). ADR-0024'ün sözleşmesinde
öngörülmemiş **dört** karar noktası uygulama sırasında çıktı ve uygulandı
(`src/lib/api/ai.ts`'in de hook olmayışı; `date.ts`/`upload-validation.ts`'in
de taşınmak zorunda kalışı; `export const supabase` singleton'ının
kaldırılışı; Provider `children`'ının opsiyonel yazılışı) — ayrıntı:
ADR-0024 "Uygulama sonucu" bölümü.

### Faz 4.5 commit 6 sonucu (2026-08-18)

`apps/mobile` Expo **SDK 57** iskeleti kuruldu (RN **0.86.2**, React
**19.2.4** pinli), **`expo-router`** ile `(tabs)` grubunda 5 sekme (Panel ·
Antrenman · Beslenme · İlerleme · Sohbet — etiketler web paneliyle birebir),
placeholder auth ekranı (`sign-in.tsx`, **gerçek auth YOK**).
`packages/api-client`'ın `react` bağımlılığı **`peerDependencies`'e
taşındı** (çift-React sınıfını kalıcı kapatır). `Dockerfile` `deps` aşaması
`pnpm install --frozen-lockfile --filter web...` oldu. Kapsam dışı
bırakılanlar (bilinçli): `SupabaseClientProvider` + SecureStore + api-client
hook tüketimi; `docs/mobile-smoke.md` ve AC-4.5.6 — bu ikisi mobil veri
katmanı turuna taşındı (bkz. B-052). Cihazsız mobil kanıtlar: `tsc --noEmit`
temiz, `expo-doctor` **21/21**, `expo export` üç platformda başarılı (iOS
1110 modül, Android 1241, Web 783, sunucu 836; 13 statik rota), workspace-TS
çözümlemesi kanıtlandı (üç bundle'ın içinde `@repo/types` `DAY_NAMES`'ten
`Pazartesi` ve logger mesajı — ikisi de çalışma zamanı değeri, tip-only
olsaydı silinirdi), tek `react@19.2.4` (web + mobile + api-client üçü de ona
çözülüyor), Docker `deps` aşamasında `react-native`/`expo` ile başlayan **0
paket** (`--filter web...` RN ağacını dışarıda tutuyor). ADR-0023 madde
11'in dur-ve-sor noktası tetiklenmedi — izole (symlink'li) pnpm modu hiçbir
hoisting ayarı gerektirmedi, `.npmrc`/`pnpm-workspace.yaml` değişmedi.
**AC-4.5.3 bu noktada hâlâ kapanmamıştı** — cihazsız kanıtlar yalnızca
çözümlemeyi gösterir, çalışma zamanını (boot, çift-React "invalid hook
call", native modül) kanıtlamaz; kullanıcının Expo Go smoke'u bekleniyordu
(2026-08-19'da Android emülatöründe karşılandı — bkz. "Mobil smoke sonucu
(2026-08-19)"). Detay ve navigasyon kararı gerekçesi: ADR-0023 "Uygulama
notu — commit 6".

### Faz 4.5 commit 7a1 sonucu — B-051 (2026-08-19)

`apps/web`'in TypeScript'i `^5.7.2` → `~6.0.3`'e çekildi; workspace tek TS
majörüne düştü (B-051 kapandı). Ölçüldü: `pnpm list typescript -r --depth 0`
ile gerçek symlink taraması — web ve mobil ikisi de `typescript@6.0.3`'e
çözülüyor; `apps/web/node_modules/typescript` ve
`apps/mobile/node_modules/typescript` aynı fiziksel `.pnpm` örneğine
(`typescript@6.0.3/node_modules/typescript`) symlink'li — tek örnek.
`packages/*` kendi `typescript` bağımlılığını bildirmiyor, tüketen app'in
tsc'siyle kontrol ediliyor (şimdi ikisi de 6.0.3). Doğrulama: vitest
**632/632 (52 dosya)**, lint 0 hata/13 uyarı (taban korundu), production
build başarılı (route tablosu 10/10 `ƒ`; `next build` çıktısında "Running
TypeScript"/"Finished TypeScript" dışında TS'e dair hiçbir hata/uyarı yok),
mobil `tsc --noEmit` ve `expo-doctor` (21/21) hâlâ temiz.

### Faz 4.5 commit 7a2 sonucu — Node 24 + Actions bump'ları (2026-08-19)

Node 20 (bakım sonu 2026-04-30'u geçmişti, EOL bir runtime üzerinde
koşuluyordu — ölçülmeden fark edilmemişti) → **24 LTS ("Krypton")**
hizalaması dört pinde yapıldı: `ci.yml` (×3 `node-version`), `Dockerfile`
(`node:24-alpine`), `.nvmrc`, kök `package.json` `engines.node`; `@types/node`
`^22.10.5` → `^24.13.3`. `ci.yml` YAML geçerliliği korundu (job adları/
`needs`/`if` koşulları değişmedi: `frontend, backend, e2e, docker, security,
required-checks`). Actions bump'ları: `actions/checkout@v4→v7`,
`actions/setup-node@v4→v7`, `docker/build-push-action@v6→v7` uygulandı;
`astral-sh/setup-uv@v5` ve `actions/upload-artifact@v4` **BİLEREK
bırakıldı** (kalan dört bump commit 7b'de B-054 ile alındı). `security`
job'una `package-manager-cache: false` eklendi — `setup-node` v5'te pnpm
`packageManager` alanına bakıp otomatik cache açıyordu (Path Validation
Error riski); v6.0.0 bu otomatik davranışı npm'e daralttı ama `false` yine
de açıkça bırakıldı (savunma + niyet belgesi). Doğrulama: vitest
**632/632 (52 dosya)**, lint 0/13, production build başarılı (10/10 `ƒ`),
Docker imajı Node 24 tabanıyla build geçti (`/api/health` **200**, `/sw.js`
**200** — `next-pwa`/webpack zinciri Node 24'te sağlam).

### Faz 4.5 commit 7b sonucu (2026-08-19)

Faz 4.5'in **son dilimi**. Dört iş: (1) **Turborepo 2.10.11** — kök
`turbo.json`, kapı komutları `turbo run <görev> --filter=!mobile` oldu;
`apps/web`'in `build: next build --webpack` pinlemesi (ADR-0006/0012)
değişmedi, `Dockerfile` turbo KULLANMIYOR (`--filter web...` ağacında turbo
yok). (2) **Ayrı, paralel `mobile` CI job'u** (`needs` yok, `timeout-minutes:
20`): mobil `tsc`/lint + `npx expo-doctor --verbose` + `expo export` smoke;
`required-checks` listesine eklendi. (3) **B-049 kapandı** —
`packages/{types,logger,api-client}` artık lint'leniyor (yeni
`@repo/config/eslint/package.mjs`, TS parser `@repo/config`'in kendi
dependency'si); lint tabanı **13 → 17'ye döndü** (13 web + 4 `@repo/logger`
console adaptörü — beklenenle birebir). (4) **`db:types` `packages/types`'a
taşındı** (ADR-0023 §3, AC-4.5.4): kökte yalnızca delegasyon kaldı, bu
yüzden CI'ın B-047 drift adımı DEĞİŞMEDİ; `supabase` CLI kökte kaldı —
pnpm workspace kökünün `.bin`'ini PATH'e eklediği ölçüldü. Ayrıca **B-054
kapandı** (dört Actions bump'ı: `pnpm/action-setup` v4→v6,
`actions/upload-artifact` v4→v7, `supabase/setup-cli` v1→v3,
`astral-sh/setup-uv` v5→v7). **İki dur-ve-sor noktası tetiklendi ve
kullanıcıya raporlandı:** (a) `astral-sh/setup-uv` en son majör **v10**, ama
v8'den beri kayan majör etiket YAYINLANMIYOR (`@v8`/`@v9`/`@v10` etiketi
yok — ölçüldü); tam sürüm pinlemesi reponun sözleşmesini değiştireceği için
**v7'de durduk**. (b) `supabase/setup-cli` v3 CLI'yi GitHub release'lerinden
değil **npm'den** kuruyor (mekanizma değişti, gözlemlenebilir sözleşme
aynı). Turbo önbelleğinin doğruluğu iki ayrı deneyle kanıtlandı: workspace
paketi kaynağı değişince hash değişiyor (yanlış yeşil yok) ve tek bir
`outputs` dosyası (`public/sw.js`) eksikse turbo "hit" vermeyip yeniden
build alıyor. Doğrulama: vitest 632/632, lint 0/17, type-check + e2e
type-check temiz, format temiz, coverage %53.49 (eşik 52), ratchet tavanla
eşit, RLS 113/113, transform 26/26, `pnpm install --frozen-lockfile`
"Lockfile is up to date", mobil tip kontrolü + lint temiz, `expo-doctor`
21/21, `expo export` başarılı (13 statik rota), `ci.yml` YAML geçerli (7
job, `mobile` paralel), Docker imajı build geçti (`/api/health` 200,
`/sw.js` 200, imajda `react-native`/`expo` ile başlayan 0 paket).

### AC-4.5.1..AC-4.5.6 durum tablosu

| AC       | Açıklama                                                                                                        | Durum                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-4.5.1 | `pnpm turbo build` kök dizinden tüm paketleri derler, sıfır TS hatası                                           | **KARŞILANDI** — Turborepo 2.10.11 (c7b), production build 10/10 `ƒ`, type-check temiz                                                                                                        |
| AC-4.5.2 | `apps/web` eski davranışıyla ayağa kalkar; Playwright paketi taşıma sonrası tamamen yeşil                       | **KARŞILANDI** — taşıma boyunca vitest tabanı korundu, E2E paralel 52/54 / seri 14/14 (düşen ikili B-037, taşımadan bağımsız kanıtlandı)                                                      |
| AC-4.5.3 | `apps/mobile` Expo Go'da açılır, tab'lar arası gezinme çalışır                                                  | **KARŞILANDI** (2026-08-19) — Android emülatöründe gerçek smoke koşuldu: SDK 57.0.0 doğrulandı, beş sekmede gezinme kanıtlandı, çift-React hatası yok; bkz. "Mobil smoke sonucu (2026-08-19)" |
| AC-4.5.4 | `packages/types` Supabase üretilmiş DB tiplerini export eder; drift check buraya taşınır                        | **KARŞILANDI** — `db:types` c7b'de `packages/types`'a taşındı, CI'ın B-047 drift adımı değişmeden çalışıyor                                                                                   |
| AC-4.5.5 | Hiçbir paket diğerinin `src/`'ine relative path ile uzanmaz; `supabase.from(` yalnızca `packages/api-client`'ta | **KARŞILANDI** — c5'te ölçüldü, `apps/web/src`'te gerçek `supabase.from(` çağrısı sıfır                                                                                                       |
| AC-4.5.6 | Faz 2'nin uçtan uca akışı mobilde manuel checklist ile doğrulanır (`docs/mobile-smoke.md`)                      | **KAPSAM DIŞI (B-052)** — mobil veri katmanı turuna kapsamlandı                                                                                                                               |

### Mobil smoke sonucu (2026-08-19)

Faz 4.5 kapanışından sonra, borç turu oturumunda AC-4.5.3'ün beklediği gerçek
cihaz kanıtı üretildi ve Faz 4.5 **tamamen kapandı**.

**Yol değişikliği ve nedeni.** iOS Expo Go yolu **kapalı**: kullanıcının
iPhone'u (iOS 18.6.2) güncel, ama Expo Go temiz kurulumdan sonra bile
"supported SDK 54" gösteriyor. Neden App Store'daki Expo Go SDK 54'te
takılı: Expo'nun yeni sürüm gönderimleri Apple onayından geçmiyor (kaynak:
Expo changelog "Expo Go and the App Store, May 2026" —
https://expo.dev/changelog/expo-go-and-app-store-may-2026). Expo'nun
önerdiği `eas go` yolu ücretli Apple Developer hesabı istiyor. Bu yüzden
kanıt **Android emülatöründe** alındı: Android Studio kuruldu, Pixel 8 AVD
(`emulator-5554`, ekran 1080x2400).

**Koşum.** `pnpm --filter mobile exec expo start --android`. Expo CLI,
Expo Go'yu emülatöre kendisi indirip kurdu (`Fetching Expo Go` →
`Installing Expo Go on Pixel_8`), uygulama açıldı.

**Kanıtlar:**

- `Android Bundled 13428ms ... expo-router/entry.js (1405 modules)` — bundle
  temiz, hata yok.
- Uygulama içi geliştirici menüsü `Koçluk — SDK version: 57.0.0` gösterdi:
  Expo Go gerçekten SDK 57 çalıştırıyor.
- `@repo/logger` çalışma zamanında yazdı: `INFO [info] Panel ekranı açıldı
{"event": "screen_mount"} {"app": "mobile", "screen": "dashboard"}`.
- `@repo/types`'ın `DAY_NAMES`'i Antrenman ekranında render oldu (`Pazartesi
· Salı · Çarşamba · Perşembe · Cuma · Cumartesi · Pazar`) — tip-only
  olsaydı silinirdi, yani workspace paketleri çalışma zamanında gerçekten
  çözülüyor.
- **Beş sekmenin hepsinde gezinme doğrulandı** (adb ile dokunma + ekran
  görüntüsü): Panel → Antrenman → Beslenme → İlerleme → Sohbet; başlık,
  içerik metni ve aktif sekme vurgusu doğru değişiyor. Doğrudan görüntüyle
  teyit edilenler: Panel ("Günlük özet, duyurular ve istatistikler burada
  olacak."), Antrenman ("Haftalık antrenman planı burada olacak."), Sohbet
  ("Koç ile mesajlaşma burada olacak.").
- **"Invalid hook call" YOK** — çift-React sınıfı çalışma zamanında da
  kapalı olduğu kanıtlandı (cihazsız kanıtların gösteremediği tam olarak
  buydu).
- Kozmetik gözlem: sekme ikonları yer tutucu boş kutu olarak çiziliyor. Bu
  bir hata DEĞİL — `apps/mobile/app/(tabs)/_layout.tsx` yorumunda ikon
  setinin bilerek alınmadığı yazılı; expo-router ikon verilmeyince yer
  tutucu glif basıyor. İkon seti mobil veri katmanı turuna (B-052) ait.
- **B-057 ikinci kez gözlendi:** bu koşumda `expo start` yine
  `apps/mobile/tsconfig.json`'ı yeniden yazdı (`TypeScript: The
tsconfig.json#include property has been updated`); `git restore` ile
  geri alındı, format temiz. Tuzak artık iki bağımsız koşumda ölçüldü —
  bkz. `docs/PROGRESS.md` §4.

### Faz sırasında kapanan borçlar

- **B-047** — `db:types` çıktısının commit'lenmiş dosyayla drift'ini
  doğrulayan CI adımı yok. CI kapı turunda (PR #12) kapandı.
- **B-048** — `tsconfig.e2e.json` için ayrı bir type-check kapısı yok. Aynı
  turda kapandı.
- **B-049** — `packages/*` lint kapsamına girmiyordu. c7b'de kapandı, lint
  tabanı 13 → 17'ye döndü (kapsam genişlemesi, düşüş değil).
- **B-051** — web ve mobil iki farklı TypeScript majörü taşıyordu. c7a1'de
  kapandı, ikisi de `6.0.3`'e tekleşti.
- **B-054** — dört Actions sürümü (`pnpm/action-setup`,
  `actions/upload-artifact`, `supabase/setup-cli`, `astral-sh/setup-uv`)
  geride kalmıştı. c7a2'de üçü (`checkout`/`setup-node`/`build-push-action`)
  ve c7b'de kalan dördü bump'landı.

### Fazın açtığı yeni borçlar

- **B-050** — `packages/api-client`'ın 13 hook dosyası `sonner` import
  ediyor (web'e özgü DOM toast kütüphanesi, paketin doğrudan bağımlılığı).
  Mobil bu hook'ları import ettiği anda Metro `sonner`+`react-dom`'u grafiğe
  çeker; paylaşılan paket bugün fiilen web'e bağımlı. Bildirim soyutlaması
  gerekiyor — **mobil veri katmanından ÖNCE** çözülmeli.
- **B-052** — AC-4.5.6 (`docs/mobile-smoke.md` + Faz 2 akışının mobilde
  doğrulanması) Faz 4.5 içinde kapanamadı; ADR-0023'ün 7 commit'lik planında
  karşılığı yok (commit 6 "iskelet", commit 7 "CI"). Gerçek ekranlar +
  gerçek auth + veri katmanı gerektiriyor — **mobil veri katmanı turuna**
  yeniden kapsamlandı.
- **B-053** — `image-size` (`expo > @expo/metro > metro > image-size`) için
  `pnpm.auditConfig.ignoreGhsas` istisnası (GHSA-w3rx-r6r6-pgpr,
  GHSA-5p2g-fcmc-qvqq, yamalı sürüm yok). **Süreli** — gözden geçirme
  tarihi 2026-11-19.
- **B-055** — `.github/dependabot.yml` monorepo'ya taşınmadı: npm ekosistemi
  hâlâ yalnız `/` dizinini tarıyor, bağımlılıklar `apps/*` + `packages/*`'a
  taşındığı için dependabot koşumları `unknown_error` ile düşüyor; #10/#11
  PR'ları eski yerleşime ait. Faz 4.5 kapanış ölçümünde açıldı.

### Yeni tuzaklar

- **`pnpm run X -- --flag` npm gibi davranmaz.** pnpm `--`'yi script'e
  olduğu gibi iletir; doğru biçim ayırıcısız: `pnpm run db:clean-e2e
--yes` (c1'de yakalandı).
- **`pnpm run X --flag` biçimi de her zaman doğru değil** — script'in kendi
  argüman ayrıştırıcısına bağlı; ayırıcısız çağrı önce doğrulanmalı, npm
  alışkanlığıyla `--` eklenmemeli.

### Sonraki adımlar

Faz 4.5'in kod tarafı bitti. Kapanış için kalan tek madde AC-4.5.3'ün
kullanıcı Expo Go smoke'u. Sırada mini bir borç turu (B-050, B-046, B-030,
B-019, B-023 + B-040, B-045, B-055), ardından **Faz 4.6 — Güvenlik
Tamamlama** (`active_planprogram.md` §7a; B-042 KVKK hesap silme, B-043 AI
kota). Ayrıntı ve gerekçe: `docs/PROGRESS.md` §5.

**Güncelleme (2026-08-19, borç turu oturumu):** AC-4.5.3 yukarıdaki "Mobil
smoke sonucu" bölümünde anlatılan Android emülatörü koşumuyla karşılandı —
Faz 4.5 artık **tamamen kapandı**, açık madde kalmadı (AC-4.5.6 hariç, o da
zaten bilinçli olarak kapsam dışı). Sıradaki iş **Faz 4.6 — Güvenlik
Tamamlama**.
