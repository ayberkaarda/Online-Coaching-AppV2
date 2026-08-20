# Dependabot triyajı — 10 açık PR (2026-08-19/20)

Kapsam: `#13`–`#22`, tamamı `dependabot.yml`'in tek `npm` ecosystem girdisinden
(`directories: ['/', '/apps/web', '/apps/mobile', '/packages/*']`) doğdu. Ölçüm
tarihi: 2026-08-19/20, `main` HEAD `a25f820`.

## 1. Yönetici özeti

**Kök sorun tüm 10 PR'ı aynı anda vuruyor:** her PR, hangi paketi hangi
büyüklükte güncellediğinden bağımsız olarak `pnpm install --frozen-lockfile`
adımında `ERR_PNPM_OUTDATED_LOCKFILE` ile düşüyor — lint/type-check/build hiç
çalışmıyor. Yani CI sonucu şu an **hiçbir PR için gerçek bir sinyal taşımıyor**;
kırmızı, güncellemenin kendisiyle değil dependabot'un pnpm workspace'te kilit
dosyasını tutarlı üretememesiyle ilgili (bkz. §2).

Bunun üstüne üç gerçek majör var: **TypeScript 6→7** (2 PR), **ESLint 9→10**
(5 PR) ve **Tailwind 3→4** (1 PR) — geri kalan 2 PR (react grubu, dev-deps
grubu) minör/patch.

| PR  | Paket                                                                                 | Dizin                                        | Sürüm                                                         | Tür         | CI (mevcut)                        | Öneri             |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- | ----------- | ---------------------------------- | ----------------- |
| #13 | react grubu: `react`, `react-dom`, `react-native-reanimated`, `react-native-worklets` | `apps/web` + `apps/mobile`                   | 19.2.4→19.2.8 · 19.2.4→19.2.8 · 4.5.1→4.5.3 · 0.10.1→0.10.4   | **patch**   | Frontend/Mobile FAILURE (lockfile) | ölçerek al        |
| #14 | dev-dependencies grubu: `@typescript-eslint/parser`, `autoprefixer`, `postcss`        | `apps/mobile`, `apps/web`, `packages/config` | 8.62.1→8.67.0 (minor) · 10.5.2→10.5.4 · 8.5.23→8.5.26 (patch) | minor/patch | Frontend/Mobile FAILURE (lockfile) | ölçerek al        |
| #15 | `eslint`                                                                              | `apps/mobile`                                | 9.39.4→10.8.1                                                 | **MAJOR**   | Frontend/Mobile FAILURE (lockfile) | ölçerek al (§4.2) |
| #16 | `typescript`                                                                          | `apps/mobile`                                | 6.0.3→7.0.2                                                   | **MAJOR**   | Frontend/Mobile FAILURE (lockfile) | **kapat** (§4.1)  |
| #17 | `tailwindcss`                                                                         | `apps/web`                                   | 3.4.19→4.3.3                                                  | **MAJOR**   | Frontend FAILURE (lockfile)        | **kapat** (§4.3)  |
| #18 | `eslint`                                                                              | `apps/web`                                   | 9.39.4→10.8.1                                                 | **MAJOR**   | Frontend FAILURE (lockfile)        | **beklet** (§4.2) |
| #19 | `typescript`                                                                          | `apps/web`                                   | 6.0.3→7.0.2                                                   | **MAJOR**   | Frontend FAILURE (lockfile)        | **kapat** (§4.1)  |
| #20 | `eslint`                                                                              | `packages/api-client`                        | 9.39.4→10.8.1                                                 | **MAJOR**   | Frontend FAILURE (lockfile)        | ölçerek al (§4.2) |
| #21 | `eslint`                                                                              | `packages/logger`                            | 9.39.4→10.8.1                                                 | **MAJOR**   | Frontend FAILURE (lockfile)        | ölçerek al (§4.2) |
| #22 | `eslint`                                                                              | `packages/types`                             | 9.39.4→10.8.1                                                 | **MAJOR**   | Frontend FAILURE (lockfile)        | ölçerek al (§4.2) |

Toplam: **3 kapat** (#16, #17, #19), **1 beklet** (#18), **6 ölçerek al**
(#13, #14, #15, #20, #21, #22), **0 şimdi al** — hiçbiri bugün olduğu gibi
merge edilemez, önce §3'teki config düzeltmesi gerekiyor.

CI job kırılımı hepsinde aynı desende: `Frontend`/`Mobile` job'ları
`ERR_PNPM_OUTDATED_LOCKFILE` ile FAILURE, `Backend`/`Security scanning`
SUCCESS (bu paketlere dokunmuyorlar), `E2E`/`Docker` SKIPPED (frontend/mobile
job'una bağımlı, onlar kırmızı olduğu için hiç tetiklenmiyor), `Required
checks` dolayısıyla FAILURE.

## 2. Kilit dosyası sorununun kök nedeni ve resmi durumu

**Doğrulanan hata imzası (3 örnek, gerçek CI log'undan):**

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with <ROOT>/apps/web/package.json
  specifiers in the lockfile don't match specifiers in package.json:
  - tailwindcss (lockfile: ^3.4.19, manifest: ^4.3.3)     # PR #17
  - typescript (lockfile: ~6.0.3, manifest: ~7.0.2)       # PR #19
  - eslint (lockfile: ^9, manifest: ^10)                  # PR #22
```

Üçü de aynı kalıp: dependabot **manifest dosyasını** doğru güncelliyor ama
workspace'in **tek paylaşılan kök `pnpm-lock.yaml`**'ını o güncellemeyle
tutarlı şekilde yeniden çözemiyor.

**Kök neden (dependabot-core bakımcısı, doğrulanmış):** pnpm workspace'lerinde
dependabot alt dizindeki `package.json`'ı güncellerken kökteki paylaşılan
`pnpm-lock.yaml`'ı workspace'in tamamını gözeterek yeniden hesaplamıyordu.
[Issue #10758](https://github.com/dependabot/dependabot-core/issues/10758)
(`dependabot doesn't work with monorepos using pnpm`) bunu şöyle tanımlıyor:
_"The issue is mainly that we don't have a tree crawl for pnpm workspaces
package.json files"_ (contributor `Yurickh`). Issue "Done" olarak kapatıldı;
düzeltme [PR #10806](https://github.com/dependabot/dependabot-core/pull/10806)
(`Try to find pnpm-lock.yaml file upwards on tree structure`) **2024-12-03**'te
merge edildi.

**Ama bu düzeltme yeterli değil — çözüm `directories` (çoğul, çoklu yol)
yapılandırmasını terk etmek.** Aynı issue'da fix sonrası testler netleştirdi
(`MattIPv4`, alveusgg projesi bakımcısı):

> "After further testing, it is working! Turns out for a pnpm monorepo, you
> only want to tell dependabot about the root, not the packages within."

Kanıt: alveusgg [PR #868](https://github.com/alveusgg/alveusgg/pull/868)
`dependabot.yml`'i şu şekilde değiştirdi ve sorunu çözdü:

```diff
- directories:
-   - /
-   - /apps/*
+ directory: /
```

commit mesajı: _"Dependabot only needs to run against root for pnpm
workspaces."_ Aynı desen [phi-school/configs#87](https://github.com/phi-school/configs/issues/87)'de
de doğrulandı — birebir aynı hata metni ("Cannot install with
'frozen-lockfile' because pnpm-lock.yaml is not up to date with
`packages/<package>/package.json`").

**Bu repoda ampirik doğrulama:** mevcut `dependabot.yml` tam olarak sorunlu
kalıbı kullanıyor — `directories: ['/', '/apps/web', '/apps/mobile',
'/packages/*']` (çoğul, 4 yol). 10 PR'ın **tamamı**, hangi dizinden geldiğine
bakılmaksızın aynı hatayla düşüyor. Bu, koşulun tam olarak yukarıdaki bilinen
kusurla eşleştiğini gösteriyor — kod tarafında (TS7/ESLint10/Tailwind4
uyumluluğu) henüz hiçbir gerçek sinyal alınamadı, çünkü kurulum adımı hiç
tamamlanmıyor.

**İlgili resmi referans:** [dependabot-options-reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
`directories` anahtarının glob/`*` desteklediğini, `directory` (tekil)
anahtarının desteklemediğini doğruluyor — ama bu repo zaten glob'a ihtiyaç
duymuyor (workspace üyeleri sabit: `apps/*`, `packages/*`), asıl fark
davranışsal: kök-dışı yollar workspace-farkındalıklı çözümlemeyi bozuyor.

**Diğer bilinen pnpm+dependabot kusurları (bu turu etkilemiyor ama izlenmeli):**
[#7501](https://github.com/dependabot/dependabot-core/issues/7501) (kök
`package.json` yoksa pnpm desteği çalışmıyor — bu repoda kök `package.json`
var, etkilenmiyoruz), [#11953](https://github.com/dependabot/dependabot-core/issues/11953)
(pnpm catalog güncellenmiyor — bu repo catalog kullanmıyor), [#8186](https://github.com/dependabot/dependabot-core/issues/8186)
(hâlâ açık, güvenlik yamalarında sürüm çözümü sorunu — izlenmeli).

## 3. `dependabot.yml` için önerilen değişiklik

`directories` (çoğul, 4 yol) → `directory: '/'` (tekil, tek kök). pnpm
workspace-farkındalıklı tarama artık kökten tetiklendiğinde tüm
`apps/*`/`packages/*` üyelerini otomatik keşfedip **tek** paylaşılan
`pnpm-lock.yaml`'ı workspace bütünüyle tutarlı şekilde güncelliyor (alveusgg
kanıtı, §2). Groups/ignore kuralları aynı kalıyor; ayrıca bu turun kararlarını
(§4) yansıtan iki yeni `ignore` girdisi ekleniyor:

```yaml
- package-ecosystem: npm
  directory: '/'
  schedule:
    interval: weekly
  open-pull-requests-limit: 10 # bkz. not aşağıda
  commit-message:
    prefix: 'chore(deps)'
  groups:
    next:
      patterns:
        - 'next'
        - 'next-*'
        - 'eslint-config-next'
    react:
      patterns:
        - 'react'
        - 'react-dom'
        - 'react-*'
        - '@types/react'
        - '@types/react-dom'
    dev-dependencies:
      dependency-type: development
      update-types:
        - minor
        - patch
  ignore:
    - dependency-name: 'expo'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    - dependency-name: 'expo-*'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    - dependency-name: 'react-native'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    - dependency-name: 'react-native-*'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    - dependency-name: 'react'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    - dependency-name: 'react-dom'
      update-types:
        - 'version-update:semver-major'
        - 'version-update:semver-minor'
    # YENİ — B-051: TypeScript 6.0.3'e bilinçli pin (Faz 4.5 c7a1). TS 7.0
    # kararlı derleyici API'siz çıktı (typescript-eslint tip-farkında
    # kurallar için gerekli) ve strict/module varsayılanlarını değiştiriyor
    # (bkz. §4.1). B-051 elle yeniden değerlendirilene kadar bastır.
    - dependency-name: 'typescript'
      update-types:
        - 'version-update:semver-major'
    # YENİ — tailwindcss 3.x→4.x gerçek migration'dır (PostCSS mimarisi,
    # globals.css, sınıf dili); görsel kimlik katmanı Faz 2 Katman B'ye
    # kasıtlı bağlı (bkz. §4.3). O faz başlayana kadar bastır.
    - dependency-name: 'tailwindcss'
      update-types:
        - 'version-update:semver-major'
# (pip / github-actions / docker girdileri değişmiyor)
```

**Not — `open-pull-requests-limit`:** eskiden 4 ayrı dizin girdisi vardı,
her biri kendi 5-PR bütçesine sahipti (teorik tavan ~20 npm PR'ı). Tek kök
girdisine düşünce tüm workspace npm güncellemeleri **aynı** 5 PR bütçesini
paylaşacak — mevcut açık 10 PR göz önüne alındığında bu darboğaz yaratabilir,
bu yüzden 10'a çıkarmayı öneriyorum (kesin değil, izlenmeli).

**Doğrulama planı (bu repoda yerel test edilemez, dependabot bulut
servisidir):** config commit'lendikten sonra CLAUDE.md §5 kuralı gereği
sonraki zamanlanmış dependabot koşumu **gerçekten görülmeden** "düzeldi"
denemez — `gh run list` yerine burada karşılığı: yeni açılan/güncellenen PR'da
`pnpm install --frozen-lockfile` adımının **SUCCESS** olduğu doğrulanmalı.

## 4. Üç majör — ayrı ayrı risk/emek ve önerilen sıra

### 4.1 TypeScript 6→7 (#16 apps/mobile, #19 apps/web) — öneri: **kapat**

- **Sürüm:** 7.0.2, native Go derleyicisi ("tsgo"/Corsa), 2026-07-08'de
  yayınlandı (Microsoft, native port'u erken 2026'ya kaydırmıştı).
- **Kritik kırılma — kararlı derleyici API'si yok.** TS 7.0 herkese açık/kararlı
  bir programatik API olmadan çıktı; `typescript-eslint`'in tip-farkında
  kuralları doğrudan bu API üzerine kurulu. Eski API'yi geri sunan bir uyumluluk
  paketi var ama bu, "sorunsuz majör bump" değil, ayrı bir entegrasyon işi.
- **Diğer kırılmalar:** strict mode varsayılan açık, `module` varsayılanı
  `esnext`, `target: es5`/`baseUrl`/`moduleResolution: node` gibi kullanımdan
  kaldırılmış bayraklar artık **hard error**. Bu repo TS 6.0.3'e Faz 4.5 c7a1'de
  (B-051) _bilinçli_ olarak tekleştirildi ("web + mobil ikisi de aynı fiziksel
  `.pnpm` örneğine symlink'li — tek örnek").
- **Neden kapat, "beklet" değil:** bu majör CI'da rutin bir yeşil/kırmızı
  sinyaliyle değerlendirilemez — hard-error olan bayraklar + API kaybı,
  B-051 kararının **kasıtlı** olarak yeniden açılmasını gerektiriyor (ADR
  seviyesinde bir karar, sub-agent'ın "gate'leri geçtiyse al" diyebileceği bir
  şey değil). Kapatıp `ignore` kuralına eklemek (§3), gürültüyü kesip kararı
  doğru katmana (kullanıcı/Fable danışmalı bir tur) taşıyor.
- **Emek tahmini (ileride açılırsa):** yüksek — `typescript-eslint` uyumluluk
  paketi entegrasyonu, `tsconfig` bayrak taraması (es5/baseUrl/node resolution
  kullanımı var mı), hem `apps/web` hem `apps/mobile`'ın **aynı anda**
  güncellenmesi gerekir (tek TS örneği kuralı, B-051).

### 4.2 ESLint 9→10 (#15 mobile, #18 web, #20 api-client, #21 logger, #22 types) — 4'ü ölçerek al, `apps/web` beklet

- **Sürüm:** 10.8.1 (major yayın 2026-02-06). Aciliyet sinyali: **ESLint 9.x
  bakımı 2026-08-06'da sona erdi** (~2 hafta önce) — 9'da kalmak artık
  yamasız bir dal.
- **Kırılma yüzeyi küçük ve bu repoyu az etkiliyor:** eslintrc sistemi tamamen
  kaldırıldı (bu repo zaten her yerde flat config — `apps/web/eslint.config.mjs`,
  `apps/mobile/…`, `packages/{types,logger,api-client}/eslint.config.mjs`, hepsi
  `.mjs` flat config), Node ≥20.19 şartı (bu repo Node 24 LTS'e pinli, sorun
  yok), `--ext` bayrağı kaldırıldı (lint script'lerinde kullanılıyorsa
  kontrol edilmeli).
- **`typescript-eslint` tarafı hazır:** v8, ESLint aralığını
  `^8.57.0 || ^9.0.0 || ^10.0.0` olarak bildiriyor — bu repo zaten
  `@typescript-eslint/parser ^8.62.1` kullanıyor, ekstra bump gerekmiyor.
- **Ayrım — `apps/web` farklı çünkü `eslint-config-next` bağımlılığı var,**
  diğer 4 paket (mobile, api-client, logger, types) **bağımlı değil** (yalnızca
  `@typescript-eslint/parser` + paylaşılan `@repo/config/eslint/base.mjs`
  kullanıyorlar — doğrulandı, `grep eslint-config-next` yalnızca
  `apps/web/package.json`'da eşleşti). `eslint-config-next` henüz ESLint 10'u
  peer dependency'sinde bildirmiyor; resmi düzeltme PR'ı
  [vercel/next.js#91710](https://github.com/vercel/next.js/pull/91710)
  (`fix: add ESLint v10 support to eslint-config-next`) **hâlâ OPEN, merge
  edilmedi** (bu tur ölçümünde doğrulandı). pnpm workspace'te sıkı
  peer-dependency çözümlemesi altında bunu `--legacy-peer-deps` gibi bir
  atlatmayla zorlamak yerine, resmi destek gelene kadar **beklet**.
- **Diğer 4 için pnpm workspace notu:** aynı workspace'te bazı paketlerin
  eslint 9'da bazılarının 10'da kalması **teknik olarak güvenli** — her
  workspace paketi kendi `eslint` sürümünü pnpm altında bağımsız çözümlüyor,
  Turborepo her paketin lint script'ini kendi çözümlenmiş sürümüyle çalıştırıyor.
- **Emek/gate (mobile, api-client, logger, types için):** kilit dosyası
  düzelince her paket için ayrı ayrı `pnpm --filter <pkg> run lint` +
  `type-check` yeşili yeterli kanıt; CI'ın `Frontend`/`Mobile` job'larının
  SUCCESS olması ek kapı.
- **`apps/web` (#18) için yeniden değerlendirme tetikleyicisi:**
  `vercel/next.js#91710` merge edilip `eslint-config-next` yeni bir sürümde
  ESLint 10'u peer'a eklediğinde.

### 4.3 Tailwind 3→4 (#17 apps/web) — öneri: **kapat**

- **Sürüm:** 4.3.3, gerçek bir migration — Tailwind v4 PostCSS eklenti
  mimarisini değiştirdi (`@tailwindcss/postcss` ayrı paket), `tailwind.config.js`
  JS tabanlı yapılandırma yerine CSS-first `@theme` yaklaşımına geçti,
  `globals.css`'teki `@tailwind base/components/utilities` direktifleri
  `@import "tailwindcss"`'e dönüşüyor, bazı sınıf isimleri/varsayılan değerler
  değişti (ör. `ring` varsayılan genişliği, renk paleti token'ları).
- **Görev talimatındaki kısıt bunu doğrudan hedef alıyor:** "Tailwind 3.x
  (görsel kimlik katmanı Faz 2 Katman B'ye bağlı — ratchet sayaçları var)."
  Yani bu zaten rastgele bir pin değil, **planlı bir gelecek faza kasıtlı
  bağlanmış** bir bekleme durumu — Faz 2 Katman B görsel kimlik çalışmasıyla
  birlikte, elle ve görsel QA ile yapılması gereken bir iş.
- **Neden "beklet" değil "kapat":** bu bir CI kapısı geçtiğinde otomatik
  alınabilecek bir güncelleme değil — `globals.css` + tüm bileşenlerin sınıf
  dili elden geçmesi gerekiyor, bu iş zaten Faz 2 Katman B'nin kapsamında.
  PR'ı açık bırakmak yalnızca dependabot gürültüsü ekler; kapatıp majörü
  `ignore`'a almak (§3) ve Faz 2 Katman B başladığında **elle, planlı** bir
  migration olarak ele almak daha doğru.
- **Emek tahmini (Faz 2 Katman B'de):** orta-yüksek — `postcss.config`
  güncellemesi, `globals.css` direktif geçişi, `tailwind.config.js` → `@theme`
  taşıması (ya da v3 uyumluluk katmanı varsa değerlendirme), tüm ekranlarda
  görsel regresyon taraması (ratchet sayaçlarının bu yüzden zaten var olduğu
  anlaşılıyor).

### Önerilen sıra (kilit dosyası düzeltmesinden sonra)

1. **§3'teki `dependabot.yml` değişikliği** — önce bu, çünkü hiçbir PR
   olduğu gibi ölçülemez.
2. **#14** (dev-deps minor/patch, düşük risk, 3 dizin) — en ucuz doğrulama.
3. **#13** (react grubu patch, tek-React kuralını koruyor çünkü web+mobile
   aynı PR'da birlikte bump ediyor) — mobil tarafta `expo-doctor` + gerçek
   cihaz/emülatör smoke ek kapı (reanimated/worklets native modül).
4. **#15, #20, #21, #22** (ESLint 10, 4 bağımsız paket) — paralel alınabilir,
   birbirine bağımlı değiller.
5. **#18** (ESLint 10, apps/web) — `vercel/next.js#91710` merge olana kadar
   beklet, sonra #15/20/21/22 ile aynı şekilde ölçerek al.
6. **#16, #19, #17** — kapat, `ignore` kurallarına ekle; TS7 ve Tailwind4
   ayrı, planlı turlar olarak (B-051 yeniden değerlendirmesi / Faz 2 Katman B)
   ele alınmalı.

## 5. Kapatılması önerilenlerin gerekçeleri (özet)

- **#16, #19 (TypeScript 6→7):** B-051'in bilinçli tekleştirme kararıyla
  doğrudan çakışıyor; TS 7.0'ın kararlı derleyici API'si olmaması
  `typescript-eslint` tip-farkında kuralları için ayrı bir uyumluluk katmanı
  gerektiriyor; hard-error olan eski bayraklar (varsa) sessiz kırılmaya yol
  açabilir. Rutin bir dependabot merge'i değil, ADR seviyesinde bir karar.
- **#17 (Tailwind 3→4):** görev talimatının kendisi bunun Faz 2 Katman B'ye
  kasıtlı bağlı olduğunu belirtiyor; gerçek bir CSS mimarisi migrationu,
  görsel QA gerektiriyor, CI yeşili tek başına yeterli kanıt değil.

Üçü de `ignore` listesine eklenerek (§3) dependabot'un her hafta aynı PR'ı
yeniden açmasının önüne geçiliyor; her ikisi de kendi planlı turunda elle
yeniden değerlendirilecek.
