# Otomatik Güvenlik Tarama Temeli (Faz 1.5)

Bu doküman, projede otomatik tarama araçlarının ilk kez çalıştırılmasının kaydıdır (baseline). Yalnızca denetim amaçlıdır — hiçbir kaynak dosya değiştirilmemiştir. Ham araç çıktıları `docs/security/raw/` altındadır.

Tarih: 2026-08-17
Ortam: Windows 11, Node v26.7.0 / npm 11.19.0, Python 3.14.7, uv 0.12.5

## 1. Çalıştırma özeti

| Araç                            | Durum                 | Sürüm                | Kurulum yöntemi                                            | Ham çıktı                        |
| ------------------------------- | --------------------- | -------------------- | ---------------------------------------------------------- | -------------------------------- |
| npm audit                       | Çalıştı               | npm 11.19.0 (dahili) | —                                                          | `raw/npm-audit.json`             |
| pip-audit                       | Çalıştı               | pip-audit 2.10.1     | `uvx pip-audit` (geçici, izole ortam)                      | `raw/pip-audit.json`             |
| semgrep                         | Çalıştı               | 1.173.0              | `uvx semgrep` (geçici)                                     | `raw/semgrep.json`               |
| gitleaks — çalışma ağacı        | Çalıştı               | 8.30.1               | `winget install Gitleaks.Gitleaks`                         | `raw/gitleaks-workdir.json`      |
| gitleaks — git geçmişi          | Çalıştı               | 8.30.1               | aynı                                                       | `raw/gitleaks-history.json`      |
| eslint-plugin-security (deneme) | Çalıştı               | 4.0.1                | `npm install --no-save` (geçici, `package.json` değişmedi) | `raw/eslint-security-trial.json` |
| Supabase statik inceleme        | Çalıştı (manuel/grep) | —                    | —                                                          | Bu doküman içinde                |

Hiçbir kalıcı bağımlılık `package.json`, `package-lock.json` veya `ai_backend/pyproject.toml` dosyalarına eklenmedi; her araç geçici (`uvx`/`npx --no-save`) olarak çalıştırıldı ve iş bitince kaldırıldı. `git diff --stat package.json package-lock.json` boş döndü, doğrulandı.

**Kapsam doğrulaması (semgrep git-tracked kısıtlaması için):** semgrep varsayılan olarak yalnızca git'e eklenmiş dosyaları tarar. `git ls-files` ile karşılaştırıldı: `src/` 64/64, `ai_backend/app/` 28/28 (yalnızca `__pycache__` hariç — .py kaynak dosyaları tam), `supabase/migrations/` 11/11. Tarama kapsamında eksik dosya yok.

## 2. npm audit — bağımlılık zafiyetleri

Komut: `npm audit --json`

Özet: 18 bulgu — 2 kritik, 13 yüksek, 3 orta, 0 düşük (1024 toplam bağımlılık: 505 prod, 441 dev, 124 optional, 40 peer).

**Önemli ayrım:** `npm audit`'in "severity" alanı çalışma zamanı (runtime) etkisini dev-only araç zincirinden ayırmaz. Aşağıdaki tabloda bunu ayrıştırdım.

### Runtime'da gerçekten etkili olanlar

| Severity | Bulgu                                                                                                                                                                                                       | Kanıt (paket@sürüm)                                                                                           | Etki                                                                                                                           | Düzeltme önerisi                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yüksek   | Next.js — SSRF (rewrites'te saldırgan kontrollü hostname), sunucu fonksiyonu endpoint'lerinin kimliksiz ifşası, Server Actions'ta SSRF/DoS/cache confusion, Image Optimization API'de SVG DoS (9 ayrı GHSA) | `next@16.2.10` (prod dep) — düzeltilmiş aralık `>=16.2.11`, mevcut son sürüm `16.3.1`                         | Prod'da çalışan asıl framework; en yüksek öncelikli bulgu                                                                      | `next`'i `16.3.1`'e yükselt (semver-major değil, kırılma riski düşük)                                                                                  |
| Yüksek   | sharp — libvips kaynaklı CVE-2026-33327/33328/35590/35591                                                                                                                                                   | `sharp@0.34.5` (next'in optional peer dep'i, Next Image Optimization tarafından çalışma zamanında kullanılır) | `/_next/image` ile kullanıcı tarafından tetiklenen görsel işleme yolunda                                                       | `next` 16.3.1'e çıkınca sharp da uyumlu sürüme geçer; ayrıca doğrudan `sharp` pin'i varsa o da güncellenmeli                                           |
| Yüksek   | postcss — CSS stringify'de XSS, `sourceMappingURL` üzerinden path traversal/keyfi `.map` dosyası okuma (3 GHSA)                                                                                             | `postcss@8.4.31` (next içinde gömülü) ve devDependency `postcss@^8.5.16` (Tailwind derlemesi için)            | Yalnızca geliştirici/derleme tarafından yazılan CSS işleniyor, saldırgan girdisi yok — pratik risk düşük ama düzeltmesi bedava | `next` güncellemesiyle iç kopya düzelir; devDependency `postcss` `npm update postcss` ile (caret `^8.5.16` zaten `8.5.26`'yı kapsıyor, breaking değil) |

### Yalnızca derleme/dev araç zincirinde (runtime'a hiç girmiyor)

| Severity | Paket                                            | Nereden geliyor                                                      | Not                                                                                                                  |
| -------- | ------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kritik   | `vitest@2.1.9`, `@vitest/coverage-v8@2.1.9`      | devDependency (test çalıştırıcı)                                     | Yalnızca `npm run test*` sırasında yerel/CI makinesinde çalışır; üretim isteği hiç görmez                            |
| Yüksek   | `vite`, `vite-node`, `esbuild`, `@vitest/mocker` | vitest'in transitive'leri                                            | Aynı — test/derleme aracı                                                                                            |
| Yüksek   | `nanoid`                                         | `postcss` (hem next içi hem devDep) transitive'i                     | Derleme zamanında cache-busting ID üretimi, saldırgan girdisiyle tetiklenmez                                         |
| Yüksek   | `js-yaml`                                        | `eslint@9.39.4` → `@eslint/eslintrc`                                 | Proje flat config (`eslint.config.mjs`) kullanıyor, YAML config dosyası yok; yine de yalnızca lint zamanında çalışır |
| Yüksek   | `fast-uri`                                       | `next-pwa` → webpack `schema-utils`/`ajv`                            | Yalnızca `next build` sırasında webpack şema doğrulamasında                                                          |
| Yüksek   | `brace-expansion`                                | `eslint`, `vitest`, `next-pwa`/webpack'in `minimatch` bağımlılıkları | Lint/test/derleme zamanı glob eşleştirme                                                                             |
| Yüksek   | `serialize-javascript`, `rollup-plugin-terser`   | `next-pwa` → `workbox-webpack-plugin` → `workbox-build`              | Yalnızca `next build` sırasında service worker/precache manifest üretiminde                                          |
| Yüksek   | `workbox-build`, `workbox-webpack-plugin`        | `next-pwa`                                                           | Aynı — service worker codegen, derleme zamanı                                                                        |
| Orta     | `esbuild`, `vite-node`, `@vitest/mocker`         | vitest zinciri                                                       | Yukarıdaki gibi                                                                                                      |

**`next-pwa` ağacı hakkında özel not (görev talimatında "şüpheli" olarak işaretlenmişti — doğrulandı):** `npm view next-pwa time.modified` → son yayın **2022-08-23**, yani ~4 yıldır güncellenmemiş, fiilen terk edilmiş bir paket. `npm audit`'in önerdiği "düzeltme" (`next-pwa@2.0.2`'ye **düşürme** — mevcut kurulu sürüm zaten `5.6.0`) gerçek bir düzeltme değil; npm'in bağımlılık çözücüsü audit grafiğinde eşleşmeyen herhangi bir sürümü öneriyor, güvenlik iyileştirmesi sağlamıyor. Paket içinde bu zincirin (`workbox-build`, `workbox-webpack-plugin`, `rollup-plugin-terser`, `serialize-javascript`) düzeltilmesi mümkün değil çünkü üst kaynak güncellenmiyor. Bu build-time bir risktir (üretim isteklerine değil, `next build`'i çalıştıran CI/geliştirici ortamına maruz kalır) ama uzun vadede **stratejik bir karar gerektiriyor**: `next-pwa` yerine aktif bakımı süren halefi **Serwist**'e geçiş değerlendirilmeli (bu görevin kapsamı dışında, ayrı bir kod değişikliği).

`npm audit fix` ÇALIŞTIRILMADI (talimat gereği).

## 3. pip-audit — Python bağımlılıkları (`ai_backend`)

İlk deneme `uv run pip-audit` başarısız oldu (`pip-audit` proje bağımlılığı değil, `program not found`). `uvx pip-audit` de yanıltıcıydı: varsayılan davranışta pip-audit'in **kendi izole ortamını** taradı (fastapi/starlette/uvicorn hiç görünmedi, yalnızca pip-audit'in 29 kendi paketi) — yani ilk sonuç projeyi hiç kapsamıyordu.

Doğru yöntem: `uv export --format requirements-txt --no-hashes` ile projenin gerçek çözümlenmiş bağımlılık grafiği (`-e .` satırı çıkarılarak) elde edildi, sonra `uvx pip-audit -r requirements-clean.txt --progress-spinner off` ile bu liste taranmış oldu.

Komut: `uv export --format requirements-txt --no-hashes -o ...` → `uvx pip-audit -r ... --format json --progress-spinner off`

Sonuç: **43 paket tarandı (fastapi 0.141.1, starlette 1.6.0, uvicorn 0.52.3, pydantic 2.13.4, slowapi 0.1.10, orjson 3.12.0 dahil), 0 bilinen zafiyet.**

| Severity | Bulgu     | Kanıt             | Etki | Düzeltme |
| -------- | --------- | ----------------- | ---- | -------- |
| —        | Bulgu yok | 43/43 paket temiz | —    | —        |

## 4. semgrep — SAST

Komut: `semgrep --config p/owasp-top-ten --config p/typescript --config p/react --config p/python --json --output raw/semgrep.json src/ ai_backend/app/ supabase/migrations/`

231 kural, 102 dosya (ts: 62, python: 28, çoklu dil: 6 kural × 102 dosya), parse oranı ~%100.

**Sonuç: 0 bulgu.**

Bu sonucu körü körüne kabul etmek yerine sağlık kontrolü yapıldı: `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `innerHTML =`, `exec(`, `shell=True`, `pickle.loads`, `subprocess.` desenleri `src/` ve `ai_backend/app/` üzerinde ayrıca elle grep'lendi — hiçbiri bulunamadı. Yani sıfır bulgu, aracın susması değil, kod tabanının gerçekten bu sınıf kalıpları içermemesiyle tutarlı.

Not: `supabase/migrations/*.sql` semgrep'in `p/owasp-top-ten`/`p/typescript`/`p/react`/`p/python` kural setleri için desteklenen bir dil değildir (SQL kuralı yok) — bu dosyalar fiilen semgrep tarafından anlamlı şekilde taranmadı. SQL tarafı Bölüm 6'da manuel statik incelemeyle kapatıldı.

## 5. gitleaks — secret taraması

Kurulum: `winget install --id Gitleaks.Gitleaks -e --source winget --accept-source-agreements --accept-package-agreements` (msstore kaynağının etkileşimli onay istemi bu bayraklarla atlatıldı).

### 5a. Çalışma ağacı (`gitleaks detect --no-git --source .`)

325 ham eşleşme, ~380 MB tarandı. Dosya bazında kırılım ve inceleme:

| Bulgu grubu                                                                     | Dosya sayısı/eşleşme | Değerlendirme                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.next/cache/webpack/**`, `.next/server/**`, `.next/standalone/**` (JWT deseni) | ~310 eşleşme         | **Yanlış pozitif / önemsiz.** `.gitignore`'da `/.next/` (satır 20) ile hariç, git'e hiç girmiyor. İçerik, derleme sırasında gömülen `NEXT_PUBLIC_SUPABASE_ANON_KEY` — aşağıya bakınız, bu zaten public/demo bir anahtar.                                |
| `.env.local` (2 eşleşme, JWT kuralı)                                            | 1 dosya              | **Sızıntı değil.** `.gitignore` satır 44 (`.env*`) ile hariç; `git ls-files \| grep env` boş döndü — hiç commit edilmemiş.                                                                                                                              |
| `playwright.config.ts:52` (jwt kuralı)                                          | 1 dosya              | **Kanıtlanmış yanlış pozitif.** Dosyadaki kod yorumu (satır 41-43) bunun Supabase CLI'nin yerel yığında ürettiği **sabit demo JWT** (`role: anon`, `iss: supabase-demo`) olduğunu açıkça belirtiyor — her `supabase start` kurulumunda aynı, sır değil. |
| `src/env.ts:69` (generic-api-key kuralı)                                        | 1 dosya              | **Yanlış pozitif.** `TEST_CLIENT_ENV` içindeki sahte değer: `'test-anon-key-0123456789abcdef'` — vitest ortamı için placeholder, gerçek anahtar değil.                                                                                                  |
| `supabase/.temp/start-secrets/.../docker.env` (4 eşleşme)                       | 1 dosya              | **Sızıntı değil.** `.gitignore` satır 76 (`supabase/.temp/`) ile hariç; yerel Supabase Docker yığınının kendi ürettiği çalışma zamanı sırları, diskte kalıcı değil ve git'e hiç girmiyor.                                                               |

**Sonuç: çalışma ağacında gerçek/sızmış bir secret bulunmadı.** Tüm 325 eşleşme ya (a) gitignore'lu/commit edilmemiş yerel dosyalar ya da (b) Supabase'in kamuya açık, sabit yerel demo JWT'si.

### 5b. Git geçmişi (kritik — daha önce hiç yapılmamıştı)

Komut: `gitleaks detect --source . --log-opts="--all" --redact` (main + tüm branch'ler dahil).

34 commit tarandı (`git rev-list --all --count` = 35; `--all` ile tüm ref'ler dahil edildi, gitleaks'in iç dedup'ı yüzünden 1 commit farkı var — pratik önemi yok, bkz. aşağıdaki not). `git log --all --oneline` = 35, `git rev-list main --count` = 24; yani `--all` bayrağı gerçekten dependabot branch'lerini de kapsama aldı (34 > 24).

**2 bulgu — ikisi de çalışma ağacında zaten tespit edilen aynı iki yanlış pozitif:**

| Severity | Bulgu                  | Kanıt                                       | Değerlendirme                                                  |
| -------- | ---------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Bilgi    | jwt kuralı             | `playwright.config.ts:52`, commit `77acb70` | Supabase'in sabit yerel demo anon JWT'si (bkz. 5a) — sır değil |
| Bilgi    | generic-api-key kuralı | `src/env.ts:69`, commit `f4390b6`           | Test placeholder string'i — sır değil                          |

**Sonuç: git geçmişinde (main + tüm dependabot branch'leri) gerçek bir secret sızıntısı bulunmadı.**

## 6. Supabase / IaC statik inceleme

### 6a. `SECURITY DEFINER` fonksiyonlarında `search_path`

`supabase/migrations/*.sql` içinde `security definer` ile işaretlenmiş **15 fonksiyon** tespit edildi. Hepsi tek tek kontrol edildi:

| Fonksiyon                                    | Dosya          | `set search_path` var mı |
| -------------------------------------------- | -------------- | ------------------------ |
| `is_admin(uuid)`                             | 20260816090100 | Evet — `public, pg_temp` |
| `profile_role(uuid)`                         | 20260816090100 | Evet                     |
| `handle_new_user()`                          | 20260816090100 | Evet                     |
| `increment_streak(uuid)`                     | 20260816090100 | Evet                     |
| `sync_profile_email()`                       | 20260816090100 | Evet                     |
| `is_coach_profile(uuid)`                     | 20260816100000 | Evet                     |
| `is_coach(uuid)`                             | 20260817090000 | Evet                     |
| `is_coach_profile(uuid)` (yeniden oluşturma) | 20260817090000 | Evet                     |
| `handle_new_user()` (yeniden oluşturma)      | 20260817090000 | Evet                     |
| `increment_streak(uuid)` (yeniden oluşturma) | 20260817090000 | Evet                     |
| `migrate_workout_plans_from_profiles()`      | 20260817110000 | Evet                     |
| `migrate_nutrition_plans_from_profiles()`    | 20260817130000 | Evet                     |
| `backfill_messages_conversation_key()`       | 20260817140000 | Evet                     |
| `messages_apply_conversation_key()`          | 20260817140000 | Evet                     |
| `backfill_form_check_review()`               | 20260817150000 | Evet                     |

**Sonuç: 15/15 `SECURITY DEFINER` fonksiyonunda `set search_path = public, pg_temp` sabitlenmiş. Eksik yok.** Bu, arama yolu enjeksiyonuna (`search_path` hijacking) karşı doğru ve tutarlı bir örüntü — övgüye değer, bulgu değil.

Ek not: `set_updated_at()` (satır 108, 20260816090100) kasıtlı olarak `SECURITY DEFINER` değil (varsayılan `INVOKER`) — genel bir `updated_at` tetikleyicisi olduğundan yükseltilmiş yetkiye ihtiyacı yok, bu doğru bir tasarım tercihi.

### 6b. `grant`/`revoke` tutarlılığı — `anon`'a sızıntı var mı

`20260816090200_rls_policies.sql` içinde temel (baseline) izin modeli:

```
revoke all on all tables/sequences/functions in schema public from anon;
alter default privileges ... revoke all ... from anon;
grant select/insert/update/delete on all tables to authenticated;
grant all ... to service_role;
```

Sonraki her migration'da yeni tablo/fonksiyon eklendiğinde aynı desen tekrarlanıyor: `revoke all ... from anon` + `grant ... to authenticated, service_role` (bkz. workout_plans, nutrition_plans, is_coach, increment_streak, backfill_* fonksiyonları — tam liste `raw/` taraması sırasında grep'lendi). **`to anon` ile açık bir izin veren tek yer `20260816090200_rls_policies.sql:30`daki `grant usage on schema public to anon` — bu yalnızca şema görünürlüğü, tablo/fonksiyon erişimi vermiyor (RLS + tablo-seviyesi revoke hâlâ geçerli).**

**Storage bulgusu (önemli — ama migration geçmişinde zaten düzeltilmiş):** `20260816090300_storage.sql`, `avatars` ve `form-checks-media` bucket'larını `public=true` yapıyor ve `storage.objects` üzerinde `to anon, authenticated` ile herkese açık `SELECT` politikaları tanımlıyor. Tek başına bu dosyaya bakılsaydı bu bir bulgu olurdu (kimliksiz kullanıcı, dosya adı desenini tahmin ederek — `<uid>-<uuid>.ext` — danışan vücut fotoğraflarını indirebilirdi). **Ancak** sonraki `20260817100000_private_storage.sql` bunu tam olarak ele alıyor: bucket'ları `public=false` yapıyor, eski `*_public_read` politikalarını `drop policy` ile kaldırıyor, `avatars_select_own_or_coach`/`form_checks_select_own_or_coach` (yalnızca sahibi veya koç, `to authenticated`) ile değiştiriyor ve okumayı `createSignedUrl` TTL'li imzalı adrese taşıyor. Migration dosyasının kendi başlığı bunu `active_planprogram.md` I-4 maddesine referansla açıkça "SORUN/ÇÖZÜM" olarak belgeliyor.

→ **Migration zincirinin nihai (uygulanmış) hâlinde `anon`'un `storage.objects` üzerinde hiçbir SELECT/INSERT/UPDATE/DELETE yetkisi kalmıyor.** Bu, kronolojik migration geçmişini okumadan yalnızca tek dosyaya bakan bir taramanın üreteceği yanlış pozitife iyi bir örnek — burada özellikle belirtiliyor.

### 6c. RLS etkinliği (ek kontrol)

`create table` (13) ile `enable row level security` (13) sayıları migrations genelinde birebir eşleşiyor — RLS'siz bırakılmış tablo tespit edilmedi.

### 6d. `config.toml` güvenlik ayarları

| Ayar                                   | Değer                                       | Değerlendirme                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[auth].enable_signup`                 | `false`                                     | Kendi kendine kayıt kapalı — danışan hesapları yalnızca koç/`service_role` tarafından açılıyor. Kasıtlı ve doğru.                                                                                                                                                                                                                                                                                               |
| `[auth].jwt_expiry`                    | `3600` (1 saat)                             | Makul varsayılan.                                                                                                                                                                                                                                                                                                                                                                                               |
| `[auth].enable_refresh_token_rotation` | `true`, `refresh_token_reuse_interval = 10` | İyi pratik — refresh token replay'ine karşı koruma.                                                                                                                                                                                                                                                                                                                                                             |
| `[auth.email].enable_confirmations`    | `false`                                     | Yalnızca **yerel** geliştirme ortamı içindir (dosya başlığı: "yerel geliştirme yapılandırması"). `config.toml`, hosted/production Supabase projesine `supabase config push` ile açıkça gönderilmediği sürece prod ayarlarını etkilemez — bu satırı prod auth ayarıyla karıştırmamak gerekir. Prod tarafındaki gerçek değer bu denetimin kapsamı dışında (Dashboard/Management API üzerinden ayrı doğrulanmalı). |
| `[auth]` rate limit bölümü             | **Yok**                                     | `config.toml`'da `[auth.rate_limit]` veya benzeri bir bölüm bulunmuyor — proje tamamen Supabase'in varsayılanlarına güveniyor. Yerelde önemsiz, ama prod projede rate limit ayarlarının (sign-in denemeleri, e-posta gönderimi, OTP) Dashboard üzerinden doğrulanması **önerilir** (bu denetimin kapsamında değil, ayrı takip önerisi).                                                                         |
| `[db.seed].enabled`                    | `true`, `sql_paths=["./seed.sql"]`          | Yalnızca `supabase db reset` ile tetikleniyor (CI'da E2E job'ı zaten sıfırdan kurulan geçici bir yığında bunu kullanıyor) — prod'a etkisi yok.                                                                                                                                                                                                                                                                  |

## 7. Kurulamayan araçlar

Yok — istenen 6 aracın (npm audit, pip-audit, semgrep, gitleaks×2, eslint-plugin-security denemesi) tamamı bir şekilde çalıştırılabildi. Tek zorluk pip-audit'in doğru hedefi taramasıydı (bkz. Bölüm 3) — `uv export` ile çözüldü, atlanmadı.

## 8. ESLint güvenlik kuralları — deneme sonucu

`eslint.config.mjs` düzenlenmedi (talimat gereği). Bunun yerine `eslint-plugin-security@4.0.1` `npm install --no-save` ile geçici kuruldu (kurulum sonrası `npm uninstall --no-save` ile kaldırıldı; `package.json`/`package-lock.json` her iki adımda da değişmedi — `git diff` boş), proje dışında bir dizinde başlatılan ama `node_modules` çözümlemesi için `docs/security/raw/` içine geçici bir flat-config (`_eslint-security-trial.config.mjs`, TypeScript desteği için `@typescript-eslint/parser` ile) yazılıp `src/` üzerinde tek seferlik çalıştırıldı, sonra silindi.

Sonuç: **44 × `security/detect-object-injection`, 1 × `@next/next/no-img-element` (ilgisiz gürültü).**

`detect-object-injection` örneklerinden bir kısmı elle incelendi (`NutritionTab.tsx:29`, `WorkoutTab.tsx`, `lib/logger.ts:47-58`, `hooks/usePlans.ts`): hepsi tip-güvenli, sabit enum/union tipli anahtarlarla (`DayName`, `LogLevel`) yapılan köşeli-parantez erişimi — saldırgan kontrollü bir anahtar (ör. request body/query'den gelen bir alan) ile indexleme örneğine rastlanmadı. Bu kural sözdizimi tabanlıdır, TypeScript tiplerinden habersizdir; iyi tiplenmiş bir kod tabanında yüksek yanlış pozitif oranı **bilinen** bir durumdur (`eslint-plugin-security` kendi dokümantasyonunda da bunu belirtir).

**CI önerisi:** `detect-object-injection` CI'da **error** olarak değil, en fazla **warn** olarak eklenmeli veya tamamen kapatılıp yalnızca aşağıdaki daha isabetli kurallar açılmalı: `security/detect-non-literal-fs-filename`, `security/detect-child-process`, `security/detect-eval-with-expression`, `security/detect-unsafe-regex`. Bu 4 kural bu kod tabanında hiç tetiklenmedi (dosya sistemi/`child_process`/`eval` kullanımı yok) — yani eklenmeleri gürültü yaratmadan gelecekteki regresyonlara karşı gerçek bir güvenlik ağı sağlar.

`eslint-plugin-no-unsanitized` denenmedi çünkü kod tabanında `innerHTML`/`dangerouslySetInnerHTML` kullanımı zaten yok (bkz. Bölüm 4 sağlık kontrolü) — kural setinin yakalayacağı hiçbir kalıp mevcut değil, kurulumu şu an için katkı sağlamaz ama ileride bu tür bir kalıp eklenirse fayda sağlar.

## 9. CI önerisi (özet)

| Araç                                                                                        | Eşik                                                               | Not                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit --audit-level=high`                                                              | prod bağımlılıklarında (`--omit=dev`) high/critical'da CI kırılsın | dev-only zincir (vitest/next-pwa/eslint) ayrı, daha gevşek bir eşikte veya yalnızca bilgilendirme amaçlı raporlanmalı — aksi halde `next-pwa`'nın terk edilmiş olması CI'ı kalıcı kırar |
| `uvx pip-audit -r <export edilmiş requirements>`                                            | herhangi bir bulguda kırılsın                                      | `uv export --no-hashes` adımı CI job'ına eklenmeli, çıplak `uv run pip-audit` YETERSİZ (bkz. Bölüm 3)                                                                                   |
| `semgrep --config p/owasp-top-ten --config p/typescript --config p/react --config p/python` | ERROR severity'de kırılsın, WARNING bilgilendirme                  | mevcut 0 bulgu temel alınarak "yeni bulgu = regresyon" mantığıyla sıkı eşik uygulanabilir                                                                                               |
| `gitleaks detect` (push/PR'da, tam geçmiş değil — yalnızca yeni commit'ler)                 | herhangi bir bulguda kırılsın                                      | tam geçmiş taraması periyodik (haftalık zamanlanmış) job olarak yeterli, her PR'da tüm geçmişi taramak gereksiz yavaşlık yaratır                                                        |
| `eslint-plugin-security` (yalnızca yukarıdaki 4 isabetli kural)                             | error                                                              | `detect-object-injection` dahil edilmemeli (gürültü)                                                                                                                                    |

Mevcut `.github/workflows/ci.yml` içinde bu kategoride hiçbir job yok (yalnızca lint/type-check/test/build + Playwright E2E + Docker build var); repo seviyesinde Dependabot aktif (branch listesinde `dependabot/npm_and_yarn/*`, `dependabot/docker/*`, `dependabot/github_actions/*` görülüyor) ama bu CI workflow'una bağlı bir gate değil.
