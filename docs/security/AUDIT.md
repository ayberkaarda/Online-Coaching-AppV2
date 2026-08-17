# Faz 1.5 — Güvenlik Denetimi: Yönetici Raporu

**Faz:** 1.5 — Güvenlik Denetimi ve Sertleştirme (`active_planprogram.md` §3a)
**Kapsam:** Erişim kontrolü / IDOR / RLS (`findings-access-control.md`), uygulama yüzeyi — kimlik
doğrulama, girdi doğrulama, dosya yükleme, AI backend, taşıma katmanı, loglama/gizlilik, secret ve
yapılandırma (`findings-app-surface.md`), otomatik araç taraması — npm audit, pip-audit, semgrep,
gitleaks (`tooling-baseline.md`).
**Tarih:** 2026-08-17
**Yöntem özeti:** statik kod incelemesi + canlı SQL rol taklidi (`set local role authenticated` /
`set local request.jwt.claims`) + gerçek HTTP istekleri (GoTrue / PostgREST / Storage API /
FastAPI) + otomatik araç taraması (npm audit, pip-audit, semgrep, gitleaks × çalışma ağacı + git
geçmişi, eslint-plugin-security denemesi).
**Ortam:** Yerel Supabase yığını (`supabase_db_my-coaching-app`, PostgreSQL 15) + üretim build'i
alınmış Next.js sunucusu + FastAPI servisi. Barındırılan (hosted) projeye hiçbir istek
gönderilmedi.
**Durum:** Denetim turu tamamlandı. Bağımlılık yükseltmeleri (§4) uygulandı; ardından kullanıcı
onayıyla düzeltme planının **Grup 1–3'ü** (§5) uygulandı — kimlik ve yetki kapıları, rate
limiting/kaba kuvvet, sütun seviyesi sözleşmeler (bkz. §4b, "Faz 1.5 düzeltme turu"). Grup 4–6
(girdi doğrulama/gövde sınırları, yapılandırma sertleştirme, dokümantasyon/CI tarama zinciri)
**açık**. Her bulgunun güncel durumu §2'deki `Durum` sütununda işaretlidir.

Bu belge bir yönlendirme belgesidir; kanıt tekrarlanmaz. Detay için kaynak raporlara
`docs/security/findings-*.md §x.y` biçiminde referans verilir.

---

## 1. Yönetici özeti

| Severity   | AC (erişim kontrolü) | A (uygulama yüzeyi) | T (araç temeli) | Toplam |
| ---------- | -------------------- | ------------------- | --------------- | ------ |
| Critical   | 0                    | 0                   | 0               | **0**  |
| High       | 2                    | 4                   | 4               | **10** |
| Medium     | 3                    | 9                   | 0               | **12** |
| Low        | 7                    | 9                   | 1               | **17** |
| **Toplam** | **12**               | **22**              | **5**           | **39** |

Denetim boyunca **hiçbir Critical bulgu üretilmedi** — bunun somut nedeni, RLS satır izolasyonunun
ve Storage yol tabanlı sahiplik sınırlarının canlı SQL rol taklidi ve gerçek HTTP istekleriyle
yapılan **her denemede** tutmasıdır (yatay/dikey yetki, RPC atomikliği, Storage path traversal —
`findings-access-control.md` §4). Kırık olan taraf iki katmanda toplanıyor: (a) sunucu tarafı
**sözleşme eksikleri** — RLS satır seviyesinde doğru davranıyor ama sütun/durum kısıtı olmadığı
için `program_approvals`, `messages`, `notifications`, `profiles` üzerinde içerik sahteciliği
mümkün (AC-01, AC-04, AC-05, AC-07…AC-10); (b) **uygulama yüzeyi koruma katmanları** — giriş
denemesi sınırı yok, tek hız sınırlayıcı `X-Forwarded-For` ile atlanabiliyor, ve deprecated FastAPI
uçları API anahtarı guard'ından tamamen muaf (A-01…A-04). Sağlam taraf ise büyük: fonksiyon
güvenliği (15/15 `SECURITY DEFINER` fonksiyonunda `search_path` sabit), mass assignment'a kapalı
hook katmanı, dar CORS, sızdırmayan hata mesajları ve temiz secret taraması (git geçmişi dahil).
Araç temeli tarama sıfır SAST bulgusu ve temiz Python bağımlılık grafiği verdi; asıl açık,
bağımlılık versiyonlarında ve CI'a bağlı bir tarama zincirinin hiç olmamasındaydı — ikincisi hâlâ
açık (T-05), birincisi bu rapor hazırlanırken kapatıldı (§4).

---

## 2. Birleşik bulgu tablosu

`Alan`: RLS/Yetki, Kimlik Doğrulama, Rate Limiting, AI Backend, Girdi Doğrulama, Storage,
Yapılandırma, Bağımlılık, Loglama/Gizlilik. Sıralama: severity (High → Medium → Low), her
severity içinde kaynak rapor sırasıyla (AC → A → T) ve ID numarasıyla.

### High

| ID    | Severity | Alan             | Başlık                                                              | Kaynak rapor               | Durum                                                                           |
| ----- | -------- | ---------------- | ------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| AC-01 | High     | RLS/Yetki        | `program_approvals` onay kapısı INSERT ile atlatılıyor              | findings-access-control.md | **fixed** — `supabase/migrations/20260817160000_program_approval_guard.sql`     |
| AC-02 | High     | RLS/Yetki        | `handle_new_user()` rolü kullanıcı metadata'sından geliyor          | findings-access-control.md | **fixed** — `supabase/migrations/20260817160100_signup_role_hardening.sql`      |
| A-01  | High     | Kimlik Doğrulama | Giriş denemeleri hiçbir katmanda sınırlanmıyor                      | findings-app-surface.md    | **fixed (uygulama katmanı)** — bkz. §4b, config yolu başarısız oldu             |
| A-02  | High     | Rate Limiting    | Hız sınırlayıcı `X-Forwarded-For` ile atlanıyor                     | findings-app-surface.md    | **fixed** — `src/proxy.ts` (`src/lib/api/client-ip.ts` güvenilir proxy sayısı)  |
| A-03  | High     | AI Backend       | Deprecated FastAPI uçları API key guard'ından muaf                  | findings-app-surface.md    | **fixed** — `ai_backend/app/routers/workout.py`, `nutrition.py`                 |
| A-04  | High     | AI Backend       | `api_key` ayarlanmamışsa guard no-op (fail-open)                    | findings-app-surface.md    | **fixed** — `ai_backend/app/core/config.py` (`model_validator`, prod fail-fast) |
| T-01  | High     | Bağımlılık       | `next@16.2.10` runtime zafiyetleri (SSRF, DoS, cache confusion vb.) | tooling-baseline.md        | **closed — bkz. §4**                                                            |
| T-02  | High     | Bağımlılık       | `sharp@0.34.5` libvips CVE'leri (Image Optimization yolunda)        | tooling-baseline.md        | **closed — bkz. §4**                                                            |
| T-03  | High     | Bağımlılık       | `postcss@8.4.31` CSS stringify XSS / path traversal                 | tooling-baseline.md        | **closed — bkz. §4**                                                            |
| T-05  | High     | Yapılandırma     | CI'da semgrep/gitleaks/npm audit/pip-audit adımı yok                | tooling-baseline.md        | open                                                                            |

### Medium

| ID    | Severity | Alan             | Başlık                                                   | Kaynak rapor               | Durum                                                                                                     |
| ----- | -------- | ---------------- | -------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| AC-03 | Medium   | RLS/Yetki        | `authenticated` rolünde `TRUNCATE` yetkisi (RLS bypass)  | findings-access-control.md | open                                                                                                      |
| AC-04 | Medium   | RLS/Yetki        | Mesaj alıcısı gövde/`kind`/`created_at` değiştirebiliyor | findings-access-control.md | **fixed** — `supabase/migrations/20260817160200_column_guards.sql` (`messages_guard_columns()`)           |
| AC-05 | Medium   | RLS/Yetki        | Danışan koçun bildirim akışına keyfi içerik yazabiliyor  | findings-access-control.md | **fixed** — `20260817160200_column_guards.sql` (`notifications_guard_content()`) — bilinen borç: bkz. §4b |
| A-05  | Medium   | Kimlik Doğrulama | Oturum token'ları `localStorage`'da, JS'ten okunabilir   | findings-app-surface.md    | open                                                                                                      |
| A-06  | Medium   | Kimlik Doğrulama | Logout access token'ı veri düzleminde iptal etmiyor      | findings-app-surface.md    | **fixed (kısmi — kullanıcı kararı)** — `supabase/config.toml` `jwt_expiry` 3600→900, bkz. §7              |
| A-07  | Medium   | Storage          | Dosya yüklemede magic byte doğrulaması yok               | findings-app-surface.md    | open                                                                                                      |
| A-08  | Medium   | Girdi Doğrulama  | İstek gövdesi sınırı yok; 10 MB'da sessiz kesme          | findings-app-surface.md    | open                                                                                                      |
| A-09  | Medium   | AI Backend       | FastAPI hız sınırı tüm kullanıcılar için tek ortak kova  | findings-app-surface.md    | **fixed** — `ai_backend/app/core/rate_limit.py` + `src/lib/api/proxy.ts` (doğrulanmış `X-User-Id`)        |
| A-10  | Medium   | Loglama/Gizlilik | Güvenlik olayları loglanmıyor                            | findings-app-surface.md    | open                                                                                                      |
| A-11  | Medium   | Loglama/Gizlilik | Logger redact listesi PII/sağlık verisini kapsamıyor     | findings-app-surface.md    | open                                                                                                      |
| A-12  | Medium   | Yapılandırma     | `AI_BACKEND_API_KEY` opsiyonel, prod'da fail-fast yok    | findings-app-surface.md    | **fixed** — `src/env.ts` (zod `superRefine`)                                                              |
| A-13  | Medium   | AI Backend       | FastAPI `/docs`, `/redoc`, `/openapi.json` prod'da açık  | findings-app-surface.md    | **fixed** — `ai_backend/app/main.py` (prod'da `docs_url`/`redoc_url`/`openapi_url` `None`)                |

### Low

| ID    | Severity | Alan             | Başlık                                                                  | Kaynak rapor               | Durum                                                                                           |
| ----- | -------- | ---------------- | ----------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| AC-06 | Low      | RLS/Yetki        | `FORCE ROW LEVEL SECURITY` hiçbir tabloda açık değil                    | findings-access-control.md | open                                                                                            |
| AC-07 | Low      | RLS/Yetki        | `program_approvals.reviewed_by` istemciden geliyor                      | findings-access-control.md | **fixed** — `20260817160000_program_approval_guard.sql` (AC-01 ile aynı trigger)                |
| AC-08 | Low      | RLS/Yetki        | Danışan `current_streak`/`last_checkin_at` alanlarını keyfi yazabiliyor | findings-access-control.md | **fixed** — `20260817160200_column_guards.sql` (`is_end_user_write()`)                          |
| AC-09 | Low      | RLS/Yetki        | Danışan `profiles.email`'i `auth.users`'tan desenkronize edebiliyor     | findings-access-control.md | **fixed** — `20260817160200_column_guards.sql` (`is_end_user_write()`)                          |
| AC-10 | Low      | RLS/Yetki        | Danışan kendi bildiriminin metnini değiştirebiliyor                     | findings-access-control.md | **fixed** — `20260817160200_column_guards.sql` (`notifications` UPDATE yalnızca `is_read`)      |
| AC-11 | Low      | Yapılandırma     | Sunucu env değişkeni adları istemci paketinde                           | findings-access-control.md | open                                                                                            |
| AC-12 | Low      | Yapılandırma     | Denetim yerel yığında yapıldı; hosted proje ayrı doğrulanmalı           | findings-access-control.md | open                                                                                            |
| A-14  | Low      | Yapılandırma     | CSP `script-src 'unsafe-inline'` içeriyor                               | findings-app-surface.md    | open                                                                                            |
| A-15  | Low      | Yapılandırma     | `connect-src` içinde `https://*.supabase.co` wildcard'ı                 | findings-app-surface.md    | open                                                                                            |
| A-16  | Low      | Loglama/Gizlilik | Hata mesajı iç mimariyi ifşa ediyor                                     | findings-app-surface.md    | open                                                                                            |
| A-17  | Low      | Rate Limiting    | `/api/health` hız sınırından muaf, sürüm bilgisi dönüyor                | findings-app-surface.md    | **fixed** — `/api/health` artık hız sınırına tabi, sürüm yalnızca kimlikli çağrıda              |
| A-18  | Low      | Rate Limiting    | Hız sınırı anahtarı yola bağlı (route başına ayrı kova)                 | findings-app-surface.md    | **fixed** — `src/proxy.ts` (AI route'ları `${ip}:ai` ortak kovasında)                           |
| A-19  | Low      | Rate Limiting    | Hız sınırlayıcı bellek içi ve tek instance                              | findings-app-surface.md    | **fixed (kısmi)** — `src/lib/rate-limit.ts` LRU tahliye; hâlâ bellek içi/tek instance, bkz. §4b |
| A-20  | Low      | Girdi Doğrulama  | Yükleme boyut/tip kontrolü istemcide de yok                             | findings-app-surface.md    | open                                                                                            |
| A-21  | Low      | Storage          | Dosya adından türetilen uzantı doğrudan yola giriyor                    | findings-app-surface.md    | open                                                                                            |
| A-22  | Low      | Yapılandırma     | `.env.example` `.gitignore`'un `.env*` deseniyle depoya girmiyor        | findings-app-surface.md    | **fixed** — `.gitignore` (`!.env.example` + `!**/.env.example`) — bkz. §4b tutarsızlık notu     |
| T-04  | Low      | Bağımlılık       | `next-pwa@5.6.0` ağacı terk edilmiş, build-time zafiyetler kalıcı       | tooling-baseline.md        | open                                                                                            |

---

## 3. Çakışma ve tekrar analizi

| Konu                                            | İlgili bulgu                          | Araç temeli referansı                                                               | Değerlendirme                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[auth.rate_limit]` eksikliği                   | A-01                                  | tooling-baseline §6d — `config.toml` tablosu, "Yok" satırı                          | **Aynı boşluk, iki kaynaktan doğrulanmış — çelişki yok.** Tooling bunu bir gözlem/takip önerisi olarak kaydediyor ("bu denetimin kapsamında değil, ayrı takip önerisi"); A-01 aynı boşluğu canlı brute-force testiyle (100/100 kabul, §3.1) High bulguya çeviriyor. Severity yalnızca A-01'de tanımlı, çelişki yok.                                                                                                                                    |
| `FORCE ROW LEVEL SECURITY`                      | AC-06                                 | tooling-baseline §6c — yalnızca `ENABLE`/tablo sayısı eşleşmesi                     | **Duplicate değil.** Tooling §6c sadece `create table` = `enable row level security` sayısının eşleştiğini (13/13) doğruluyor; `FORCE` hiç sorgulanmıyor. AC-06 bu konudaki **tek** kaynak; severity Low aynen korunur (gerekçe: `postgres`/`service_role` zaten `BYPASSRLS`, FORCE'un bugünkü etkisi sıfır).                                                                                                                                          |
| `next@16.2.10` middleware/proxy bypass advisory | T-01 (bağımlılık), bağlam olarak A-02 | tooling-baseline §2 (npm audit, 9 GHSA'lı grup) ile app-surface §3.2 "Not (bağlam)" | **Farklı kök neden, aynı pakete değiniyor — çelişki yok.** A-02'nin (High) kök nedeni `proxy.ts`'in kendi XFF güvenme hatası; canlı kanıtta (§3.2) build `--webpack` ile alındığı, dolayısıyla bu spesifik advisory'nin koşulunu birebir karşılamadığı açıkça belirtiliyor. T-01 (High) ise `next` paketinin kendi CVE grubu. §4'teki yükseltme T-01'i kapatıyor ama A-02'nin `proxy.ts` kod hatasını **kapatmıyor** — ikisi ayrı düzeltme gerektirir. |
| `handle_new_user` / `enable_signup=false`       | AC-02                                 | tooling-baseline §6d — `[auth].enable_signup = false` satırı                        | Çelişki değil, doğrulama: tooling AC-02'nin "bugünkü tek engel yapılandırmadır" iddiasını bağımsız olarak teyit ediyor.                                                                                                                                                                                                                                                                                                                                |

---

## 4. Yükseltme sonrası durum

Bu rapor hazırlanırken bağımlılık yükseltmesi **uygulandı** (kapsam dışı diğer bulgulara
dokunulmadı): `next` 16.2.10 → **16.3.1**, `eslint-config-next` 16.2.10 → 16.3.1; `sharp`
transitif olarak 0.34.5 → **0.35.3** geldi; `postcss` ve `nanoid` de düzeldi. `overrides`
gerekmedi, `next-pwa` kırılmadı, `next build --webpack` sıfır uyarıyla derledi.

Tam doğrulama zinciri **12/12 yeşil**: type-check temiz, lint 0 hata / 12 beklenen uyarı, 230
birim testi, 50 RLS senaryosu, 26 transform senaryosu, build başarılı, 21 Playwright E2E, format
temiz.

`npm audit`: **18 → 14**. Kapanan:

- `next`'in 9 advisory'sinin tamamı — iki SSRF, Server Actions DoS, middleware/proxy baypası, iki
  cache-confusion, image-optimization SVG DoS, kimliksiz Server Function endpoint ifşası.
- `sharp`, `postcss`, `nanoid`.

Kalan 14'ün hiçbiri çalışma zamanına ulaşmıyor: 7'si test zinciri (vitest/vite/esbuild/js-yaml),
7'si tek kökten — `next-pwa@5.6.0` build eklentisi (`workbox-build`, `workbox-webpack-plugin`,
`serialize-javascript`, `rollup-plugin-terser`, `fast-uri`, `brace-expansion`, `nanoid`'in
next-pwa'dan gelen ikinci bir kopyası).

**Bu tur kapanan araç temeli bulguları:** T-01 (`next`), T-02 (`sharp`), T-03 (`postcss`) — §2
tablosunda "closed" işaretlendi. **Açık kalanlar:** T-04 (`next-pwa` ağacı — üst kaynak
güncellenmediği için build-time zafiyetler düzeltilemiyor) ve T-05 (CI'a hâlâ bağlı bir tarama
zinciri yok — bu yükseltme CI gate eklemedi).

**Ek not (§5 Grup 5'e taşındı):** `next-pwa`, `package.json`'da `dependencies` altında duruyor ama
yalnızca build zamanı kullanılıyor; `devDependencies`'e taşımak `npm audit --omit=dev` çıktısını
sıfıra indirir — çalışma zamanı bağımlılık grafiğinden T-04'ü fiilen çıkarır (paketin kendisi hâlâ
terk edilmiş olsa da).

---

## 4b. Faz 1.5 düzeltme turu (Grup 1–3)

**Tarih:** 2026-08-17. Kullanıcı §5'teki düzeltme planının Grup 1 → 2 → 3'ünü onayladı; her
grup kendi migration'ı/dosya değişikliğiyle ve kırmızı-yeşil regresyon kanıtıyla kapatıldı. Grup
4, 5, 6 bu turun kapsamında **değil** — bkz. §5.

### Grup 1 — kimlik ve yetki kapıları

Kapatılan: AC-01, AC-07, AC-02, A-03, A-04, A-12, A-13 (A-13 planlandığı Grup 5'ten öne alındı,
Grup 1'in `main.py`/config sertleştirme temasıyla örtüştüğü için).

- Yeni migration `supabase/migrations/20260817160000_program_approval_guard.sql`:
  `program_approvals_review_consistency_chk` kısıtı + `program_approvals_guard_review()`
  BEFORE INSERT/UPDATE trigger. INSERT her zaman `status='pending'` üretir (koç dahil);
  `status` yalnızca `is_coach()` ile değiştirilebilir; koç güncellemesinde
  `reviewed_by := auth.uid()` / `reviewed_at := now()` sunucuda ezilir (istemciden gelen değer
  yok sayılır, AC-07 aynı trigger'la kapanır); yetkisiz deneme `42501`. DELETE politikası
  daraltıldı: `is_coach() OR (client_id = auth.uid() AND status = 'pending')` — danışan
  onaylanmış bir kaydı silip denetim izini yok edemez.
- `supabase/migrations/20260817160100_signup_role_hardening.sql`: `handle_new_user()` artık
  `raw_user_meta_data->>'role'` okumuyor, rol `'client'` sabit üretiliyor.
- `ai_backend/app/routers/workout.py` / `nutrition.py`: `legacy_router`'a
  `dependencies=[Depends(api_key_guard)]` + `@limiter.limit("20/minute")` eklendi — deprecated
  uçlar artık güncel uçlarla aynı guard disiplinine tabi.
- `ai_backend/app/core/config.py`: `model_validator` ile `ENVIRONMENT=production` iken `API_KEY`
  ayarlanmamışsa başlangıçta `ValueError`; dev/staging'de yalnızca `structlog` uyarısı.
  `docker-compose.yml` artık `${AI_BACKEND_API_KEY:?...}` ile anahtarsız ayağa kalkmayı
  reddediyor.
- `src/env.ts`: zod `superRefine` ile `NODE_ENV==='production'`'da `AI_BACKEND_API_KEY` zorunlu.
- `ai_backend/app/main.py`: `is_production` iken `docs_url`/`redoc_url`/`openapi_url` `None`.

**Kırmızı-yeşil kanıtı:** trigger düşürüldüğünde AC-01 senaryosu beklenen `42501` yerine hatasız
geçti ("onay kapısı açık"); `handle_new_user` eski haline alındığında AC-02 senaryosu istemcinin
`role: 'coach'` metadata'sıyla gerçekten koç oluşturabildiğini gösterdi ("yetki yükseltme açık");
A-03 guard'ı kaldırıldığında 4 FastAPI testi `assert 200 == 401` ile kırıldı.

### Grup 2 — rate limiting ve kaba kuvvet

Kapatılan: A-02, A-09, A-17, A-18, A-19 (planlanan hedef) + **A-06** (bonus, kullanıcı kararı) +
**A-01** (hedeflendiği gibi değil — bkz. aşağıdaki alt bölüm, uygulama katmanında kapatıldı).

- `src/proxy.ts` + `src/lib/api/client-ip.ts`: `TRUSTED_PROXY_COUNT` tabanlı XFF güven modeli —
  varsayılan `0`, yani hiçbir `X-Forwarded-For` başlığına güvenilmiyor; ancak platform güvenilir
  bir proxy sayısı bildiriyorsa yalnızca sondan N'inci değer okunuyor (A-02). AI route'ları artık
  ortak bir kovada birleşiyor (`${ip}:ai`, A-18).
- `src/lib/rate-limit.ts`: taşma anında `buckets.clear()` (tüm sayaçları sıfırlayan, bir
  saldırganın herkesin limitini sıfırlamasına izin veren davranış) yerine LRU tahliyesi (A-19,
  bkz. "kalan artık risk" — bellek içi/tek instance mimarisi bu turda değişmedi).
- `/api/health` artık hız sınırına tabi; sürüm bilgisi yalnızca kimlikli çağrıda dönüyor (A-17).
- `ai_backend/app/core/rate_limit.py`: `key_func` `X-User-Id`'ye yalnızca geçerli API anahtarı +
  geçerli UUID varsa güveniyor (`secrets.compare_digest`), aksi halde IP'ye düşüyor;
  `src/lib/api/proxy.ts` artık doğrulanmış `X-User-Id` gönderiyor (A-09).
- `supabase/config.toml`: `jwt_expiry` 3600 → 900 (kullanıcı kararı, A-06'yı kısmen kapatır —
  bkz. §2 tablosu ve §7).

**A-01 — yapılandırma yolu işe yaramadı, korunma uygulama katmanına taşındı:**
`[auth.rate_limit]` bölümü resmi Supabase şemasına uygun eklendi ve konteynerde gerçekten
ayarlandığı doğrulandı, ama düzeltme sonrası 180 ardışık yanlış şifre denemesi **hâlâ 180/180
`400` döndürdü, sıfır `429`**. Kök neden doğrulanmış açık bir upstream hatası:
[supabase/supabase#41947](https://github.com/supabase/supabase/issues/41947) — ayar yanlışlıkla
`rate_limit_otp`'ye yazılıyor, `/token?grant_type=password` uç noktası hiç korunmuyor. **Bu
yüzden `supabase/config.toml`'daki `[auth.rate_limit]` bölümüne bakıp giriş denemelerinin
korunduğunu varsaymayın — korumayan bir yapılandırmadır, gelecekte upstream düzelirse etkinleşecek
şekilde kasıtlı olarak repoda bırakılmıştır.** Fiili koruma yeni
`src/app/api/auth/sign-in/route.ts` + `src/lib/api/auth-rate-limit.ts` ile **uygulama
katmanında** kuruldu: e-posta başına 10 başarısız deneme / 15 dakika, başarılı girişte sayaç
sıfırlanır, aşımda `429` + `Retry-After`. `src/hooks/useSession.ts` artık doğrudan GoTrue'ya değil
bu uca gidiyor. IP kovası yalnızca `TRUSTED_PROXY_COUNT > 0` iken devreye giriyor — aksi halde
paylaşılan "unknown" kovası yüzünden tek saldırgan tüm kullanıcıları kilitleyebilirdi. E-posta
normalizasyonu `trim().normalize('NFC').toLocaleLowerCase('en-US')` — locale açıkça `en-US`'e
sabitlendi, çünkü argümansız `toLocaleLowerCase()` bir `tr-TR` host'ta `'I'→'ı'` katlayıp aynı
e-postayı iki ayrı kovaya bölebilirdi.

**Kabul edilen artık risk (yumuşatılmadı):** saldırgan bilinen bir e-postayı hedef alarak 15
dakikalığına kilitleyebilir (hedefli hesap kilitleme / DoS). Alternatif olan paylaşılan IP kovası
değerlendirildi ve reddedildi — tek bir saldırgan arkasında NAT/proxy paylaşan **tüm** kullanıcıları
kilitleyeceği için daha kötü bir takas olurdu.

**Kırmızı-yeşil kanıtı:** A-02 için sahte XFF ile art arda istek `[200,200,200,200,200]` (bypass)
→ düzeltme sonrası `[200,200,200,429,429]`; A-01 için uygulama katmanı e-posta kontrolü geçici
olarak kapatıldığında 10 test `expected 401 to be 429` ile kırıldı.

### Grup 3 — sütun seviyesi sözleşmeler

Kapatılan: AC-04, AC-05, AC-08, AC-09, AC-10 (AC-07 Grup 1'de aynı migration'la önceden kapandı).
Tek migration: `supabase/migrations/20260817160200_column_guards.sql`.

- **AC-04** — `messages_guard_columns()`: UPDATE'te yalnızca `read_at`/`is_read` değişebilir;
  INSERT'te `kind='system'` reddedilir. Koça da uygulanır.
- **AC-05** — `notifications_guard_content()`: danışan→koç yolunda `title`/`message` bilinen bir
  şablona uymak zorunda; koç yolu ve kendine bildirim serbest bırakıldı. Trigger, RPC yerine
  seçildi çünkü RPC yaklaşımı `notifications_insert` politikasının `is_coach_profile(...)` dalını
  kaldırmayı gerektirir ve bu mevcut uygulama kodunu anında kırardı. **Bilinen borç:** bu
  şablon metni artık iki yerde yaşıyor — trigger (`20260817160200_column_guards.sql`) ve
  `src/hooks/useProgramApprovals.ts`. Uygulamadaki metin trigger güncellenmeden değişirse program
  gönderimi `42501` ile **gürültülü** kırılır (sessizce değil) ve bu senaryo RLS test paketiyle
  kilitlenmiş durumda. Doğru çözüm ikisini `SECURITY DEFINER` bir RPC'ye taşımak; uygulama
  kodunun da değiştirilebildiği bir sonraki turda yapılmalı.
- **AC-08 + AC-09 + AC-10** — `public.is_end_user_write()` (`current_user = 'authenticated' AND
auth.uid() IS NOT NULL`, kasıtlı olarak `SECURITY INVOKER`) ile `profiles.email`,
  `current_streak`, `last_checkin_at` artık sunucu-sahipli sütunlar; `notifications` UPDATE'te
  yalnızca `is_read` değişebilir. Custom bir GUC bayrağı (ör. `app.is_server_context`) bilinçli
  olarak reddedildi: `authenticated` rolü bu bayrağı kendisi `SET` edebildiği için koruma
  taklit edilebilir bir işarete dayanmış olurdu.

**Kırmızı-yeşil kanıtı:** `is_end_user_write()` çağrısı `true` döndürecek şekilde bozulduğunda
(sunucu bağlamı taklit edilerek) G-16 senaryosu beklenen `client` yerine gelen `coach` rolünü
gösterdi ("yetki yükseltme açık").

### Doğrulama (entegrasyon, 10/10 yeşil)

type-check temiz · lint 0 hata / 12 uyarı · vitest **264/264** (önceki turdan 230→264) ·
`npx supabase db reset` 14 migration temiz · **test:rls 70/70** (önceki turdan 50→70) ·
test:transform 26/26 · ruff+mypy temiz · **pytest 82/82, kapsam %94.94** (önceki turdan
%92→%94.94) · build başarılı · **Playwright 21/21** (iki ardışık koşumda) · format:check temiz.

### Entegrasyon temizliği (bu turda, plan grupları dışında)

- `.gitignore`: `!.env.example` + `!**/.env.example` istisnası eklendi — `.env.example`
  dosyaları artık takip ediliyor, gerçek `.env*` dosyaları hâlâ yok sayılıyor (dört
  `git check-ignore` sorgusuyla iki yönlü kanıtlandı). **Bu, fiilen A-22'yi kapatıyor** — bkz.
  aşağıdaki tutarsızlık notu.
- `src/hooks/useProgramApprovals.ts`: sunucuda zaten ezilen ölü `reviewed_by`/`reviewed_at`
  yazımı kaldırıldı; koça giden bildirim şablonunun artık trigger'a bağlı olduğunu belirten
  uyarı yorumu eklendi.
- `src/components/tabs/WorkoutTab.tsx` + `useProgramApprovals.ts`: ölü `reviewerId` parametresi
  kaldırıldı.
- `playwright.config.ts`: `webServer.env`'e `AI_BACKEND_API_KEY` eklendi (A-12 sertleştirmesi
  olmadan `next start` production modunda başlamıyordu).
- `.prettierignore`: `docs/security/raw/` eklendi.
- `.github/workflows/ci.yml`: aynı A-12 kök nedeni için CI'a `AI_BACKEND_API_KEY` eklendi
  (paralel bir ajan tarafından yapıldı, bu düzeltme turunun resmi kapsamında değil).
- `ai_backend/.env.example` yeni eklendi; `docker-compose.override.yml.example`'da
  `uvicorn main:app` → `uvicorn app.main:app` (önceden var olan, bu turdan bağımsız bir hata)
  düzeltildi.

**Tutarsızlık notu (§2 tablosuyla karşılaştırma):** Bu düzeltme turunun kullanıcıya sunulan
özeti A-22'yi "hâlâ açık / Grup 5'in işi" olarak sınıflandırıyor (orijinal §5 planında da A-22
Grup 5'e atanmıştı). Ancak yukarıdaki `.gitignore` değişikliği A-22'nin tam olarak tarif ettiği
sorunu ("`.env.example` `.gitignore`'un `.env*` deseniyle depoya girmiyor") kod düzeyinde
doğrulanabilir şekilde kapatıyor — bu belgeyi hazırlayan ajan repodaki `.gitignore` içeriğini
doğrudan okuyup doğruladı. Bu yüzden §2 tablosunda A-22 **`fixed`** işaretlendi; bu, kullanıcıya
verilen "hâlâ açık" listesiyle çelişir ve okuyanın bilmesi gereken bir nokta.

---

## 5. Bağımlılık sıralı düzeltme planı

`findings-app-surface.md` §7'deki sıralama başlangıç noktası alınmış, AC-xx bulguları ve §4'teki
`next-pwa` maddesi içine örülmüştür. Test kolonunda `findings-access-control.md` §6'daki G-01…G-26
numaraları eşleştirilmiştir; app-surface bulguları için gereken test türü ayrıca belirtilmiştir.

### Grup 1 — Kimlik ve yetki kapıları — **tamamlandı (2026-08-17, bkz. §4b)**

**Kapatır:** AC-01, AC-02, A-03, A-04, A-12 — sunucunun "hayır" demesi gereken yerde "evet" dediği
her yer.

- **Dosya/migration:** yeni migration → `program_approvals` için `form_checks_guard_review()`
  desenli BEFORE INSERT/UPDATE trigger (`status='pending'` zorunluluğu, `reviewed_by`/`reviewed_at`
  sunucudan) — AC-01/AC-07 aynı trigger'la kapanabilir (bkz. Grup 3); `handle_new_user()`'da
  `v_role := 'client'` sabitlensin, koç yükseltmesi ayrı admin yoluna taşınsın (AC-02);
  `ai_backend/app/routers/workout.py` ve `nutrition.py` — `legacy_router`'a
  `dependencies=[Depends(api_key_guard)]` + `@limiter.limit` (A-03); `ai_backend/app/core/security.py`
  — `api_key is None` ise production'da başlangıçta hata fırlat (A-04); `src/env.ts` — zod
  `superRefine` ile `AI_BACKEND_API_KEY`'i `NODE_ENV==='production'`'da zorunlu kıl (A-12).
- **Regresyon testi:** G-01, G-02, G-03 (AC-01), G-16 (AC-02); FastAPI pytest — legacy uç
  anahtarsız 401 dönmeli (A-03); pytest — anahtarsız üretim başlangıcında hata (A-04); Vitest —
  `env.test.ts` prod modunda eksik `AI_BACKEND_API_KEY` ile fail-fast (A-12).
- **Efor:** M.

### Grup 2 — Rate limiting ve kaba kuvvet — **tamamlandı (2026-08-17, bkz. §4b)**

**Kapatır:** A-01, A-02, A-09, A-17, A-18, A-19. (A-01 planlandığı gibi `config.toml` yoluyla
kapanmadı — upstream hata; uygulama katmanına taşındı, bkz. §4b. A-06 bu grupta ek olarak
kapatıldı — kullanıcı kararı.)

- **Dosya/migration:** `supabase/config.toml` — `[auth.rate_limit]` bölümü eklensin (A-01);
  `src/proxy.ts` — güvenilen proxy sayısına göre XFF'in sondan N'inci değeri veya platform IP
  başlığı kullanılsın, AI route'ları ortak anahtarda birleşsin (`${ip}:ai`) (A-02, A-18); `/api/health`
  için de bir tavan tanımlansın, sürüm bilgisi yalnızca kimlikli çağrıda dönsün (A-17);
  `src/lib/rate-limit.ts` — Upstash Redis / `@vercel/kv`'ye geçiş veya en azından taşmada tam
  temizlik yerine LRU tahliye (A-19); `src/lib/api/proxy.ts` + `ai_backend/app/core/rate_limit.py`
  — proxy imzalı `X-User-Id` iletsin, `key_func` kullanıcı bazlı anahtara geçsin (A-09).
- **Regresyon testi:** `tests/unit/rate-limit.test.ts` — sahte XFF ile bypass senaryosu (regresyon
  olarak başarısız → düzeltme sonrası başarılı); Playwright/entegrasyon — `/login` üzerinde art
  arda 100 hatalı denemede 429 beklenir; FastAPI pytest — `key_func` kullanıcı bazlı ayrım.
- **Efor:** L (auth rate limit yapılandırması + proxy güven sınırı yeniden tasarımı + kalıcı depo
  geçişi kapsamlı).

### Grup 3 — Sütun seviyesi sözleşmeler — **tamamlandı (2026-08-17, bkz. §4b)**

**Kapatır:** AC-04, AC-05, AC-07, AC-08, AC-09, AC-10. (AC-07 fiilen Grup 1'in
`program_approvals` trigger'ıyla birlikte önceden kapandı.)

- **Dosya/migration:** `messages_update_receiver` politikası yerine sütun kısıtlı trigger —
  yalnızca `read_at`/`is_read` değişebilsin (AC-04); danışan yolunda `notifications` `title`/
  `message` sabit şablona bağlansın veya RPC'ye taşınsın (AC-05); `program_approvals` trigger'ı
  `reviewed_by := auth.uid()`, `reviewed_at := now()` yazsın (AC-07, Grup 1 ile aynı migration'da
  birleştirilebilir); `profiles` için sütun sabitleme trigger'ı — streak yalnızca RPC ile,
  `email` yalnızca `sync_profile_email()` ile değişsin (AC-08, AC-09); `notifications_update`
  yalnızca `is_read` sütununa izin versin (AC-10).
- **Regresyon testi:** G-06, G-07, G-08, G-09, G-10, G-11, G-13, G-14.
- **Efor:** M.

### Grup 4 — Girdi doğrulama ve gövde sınırları

**Kapatır:** A-07, A-08, A-20, A-21.

- **Dosya/migration:** yükleme öncesi ilk baytları doğrula (JPEG/PNG/WEBP imzası) —
  `useFormChecks.ts`, `useProfile.ts` (A-07); uzantı MIME'den türetilsin, allowlist'e daralsın
  (`jpg`,`jpeg`,`png`,`webp`,`avif`) (A-21); `FormCheckTab.tsx` — yüklemeden önce `file.size`/
  `file.type` kontrolü + Türkçe hata (A-20); `src/lib/api/proxy.ts` — `Content-Length` kontrolü +
  413, sınır ~64 KB'a çekilsin (A-08).
- **Regresyon testi:** `tests/unit/upload-validation.test.ts` (magic-byte + uzantı allowlist);
  Playwright E2E — yanlış etiketli HTML/SVG yüklemesi reddedilmeli; `tests/unit/proxy-body-size.test.ts`
  — 64 KB üstü gövdede 413; storage tarafı için G-19/G-20 ile tamamlayıcı kapsam.
- **Efor:** M.

### Grup 5 — Yapılandırma sertleştirme ve savunma derinliği

**Kapatır:** AC-03, AC-06, AC-11, A-05, ~~A-06~~, A-10, A-11, ~~A-13~~, A-14, A-15, A-16,
~~A-22~~, T-04. (AC-12 için bkz. §7 — açık soru, bu grupta düzeltme maddesi yok. Üstü çizili
üçü — A-06 kısmen, A-13, A-22 — Faz 1.5'in Grup 1/2 turunda ve entegrasyon temizliğinde erken
kapandı, bkz. §4b; bu grup için kalan gerçek iş AC-03, AC-06 tam çözümü, AC-11, A-05, A-10,
A-11, A-14, A-15, A-16, T-04'tür.)

- **Dosya/migration:** `revoke truncate, references, trigger on all tables in schema public from
authenticated;` (AC-03); tüm `public` tablolarında `alter table ... force row level security`
  (AC-06); `serverSchema`'yı `import 'server-only'` işaretli ayrı modüle taşı (AC-11);
  `ai_backend/app/main.py` — `is_production` iken `docs_url=None, redoc_url=None,
openapi_url=None` (A-13); genel hata mesajı + `request_id`, teknik detay yalnızca logda
  (A-16); `.gitignore`'a `!.env.example` + `ai_backend/.env.example` eklensin (A-22); `src/lib/logger.ts`
  redact listesine `email`, `full_name`, `current_weight`, `macros`, `nutrition_plan`, `notes`
  eklensin (A-11); 429/tekrarlı 401/RLS reddi için `logger.warn` + korelasyon anahtarı (A-10);
  `[auth].jwt_expiry`'yi düşür veya hassas sunucu yollarında `getUser()` ile canlı doğrula (A-06 —
  karar §7'de bekliyor); `@supabase/ssr` ile httpOnly cookie akışına geçiş + nonce tabanlı CSP
  (A-05, A-14, A-15 — en büyük iş, Faz 2'nin realtime akışlarından önce planlanmalı); `next-pwa`
  `dependencies`'den `devDependencies`'e taşınsın (T-04, §4).
- **Regresyon testi:** G-17 (AC-03), G-18 (AC-06); Vitest — server-only modül import testi
  (AC-11); FastAPI pytest — prod modda `/docs` 404 (A-13); Vitest/pytest — hata gövdesinde iç
  mimari string'i yok (A-16); CI dosya varlığı kontrolü (A-22); `tests/unit/logger-redact.test.ts`
  (A-11); `tests/unit/security-events.test.ts` (A-10); Playwright E2E — cookie tabanlı oturum akışı
  - CSP header assertion (A-05/A-14/A-15); `npm audit --omit=dev` CI kontrolü (T-04 taşıma sonrası
    sıfır bulgu beklenir).
- **Efor:** L (kapsam geniş; çoğu madde S/M ama A-05+A-14 cookie/nonce geçişi tek başına L).

### Grup 6 — Dokümantasyon

**Kapatır:** Kova 3 #12 (`docs/security/` çıktı borcu — bu belge onun bir parçası), T-05.

- **Dosya/migration:** `docs/security/THREAT-MODEL.md` (STRIDE; aktörler: anonim, danışan, koç,
  saldırgan-danışan; güven sınırları: istemci↔Supabase, istemci↔proxy↔ai_backend) — yeni; kök
  `SECURITY.md` (sorumlu açıklama politikası) — yeni; `.github/workflows/ci.yml` — semgrep
  (`p/owasp-top-ten`+`p/typescript`+`p/react`+`p/python`), gitleaks (PR'da yeni commit, tam geçmiş
  haftalık), `npm audit --audit-level=high --omit=dev`, `uvx pip-audit -r <export edilmiş
requirements>` adımları eklensin; high+ bulguda job kırılsın.
- **Regresyon testi:** CI job'ının kendisi test niteliğinde — kasıtlı bir bulgu eklenip job'ın
  kırmızı olduğu doğrulanır (AC-1.5.4 kabul kriteri).
- **Efor:** M.

---

## 6. Bulgu değil — bilinçli kararlar

| Gözlem                                                                          | Karar kaydı                        | Not                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`'ta `coach_id` yok; koç tüm danışanları görür                         | ADR-0007 (tek koçluk modeli)       | RLS `is_coach()` ile her politikada uygulanıyor; canlı testle doğrulandı (findings-access-control.md §4.1 P6).                                                                                                                                                                  |
| Koç profili tüm `authenticated` kullanıcılara görünür                           | ADR-0010                           | Kapsam doğrulandı: yalnızca belirli sütunlar (`id, full_name, email, avatar_path, ...`); PostgREST sütun seviyesinde filtreleyemediği için satırın tamamı okunabiliyor, bu yüzden koçun e-postasının danışanlara açık olması bu takasın parçası. Danışanlar birbirini görmüyor. |
| Danışan kendi beslenme/antrenman planını yazabiliyor, kendi planını silebiliyor | ADR-0014                           | Sınır testlerle kilitli; A'nın B'nin planına yazamadığı canlı testle doğrulandı. AC-01 bu yetkiyle ilgili değil, yalnızca onay kaydının sahtelenebilmesiyle ilgili.                                                                                                             |
| Koç, bir danışanı `coach` yapabiliyor                                           | `profiles_update_coach` politikası | Koç zaten tüm veriye erişen güvenilir rol; yetki yükseltme sayılmaz.                                                                                                                                                                                                            |
| `service_role` RLS'i baypas ediyor                                              | Supabase platform davranışı        | `rolbypassrls = t`; uygulama çalışma zamanında hiç kullanılmıyor.                                                                                                                                                                                                               |
| `playwright.config.ts`'teki Supabase demo anon anahtarı                         | Kabul edilebilir risk              | Supabase CLI'ın her kurulumda ürettiği sabit, herkese açık yerel demo anahtarı; yalnızca `127.0.0.1:54321`'e bağlı, üretime erişim vermiyor.                                                                                                                                    |
| Anon key'in istemci paketinde bulunması                                         | Supabase mimarisi gereği           | Güvenlik sınırı RLS'tir, anahtarın gizliliği değil.                                                                                                                                                                                                                             |
| `/health`, `/health/ready`, `/api/health` uçlarının kimliksizliği               | Kabul edilebilir risk              | Docker HEALTHCHECK / yük dengeleyici zorunluluğu; dönen bilgi hassas değil (sürüm alanı ayrıca A-17'de Low kaydedildi).                                                                                                                                                         |
| İmzalı adreslerin 1 saatlik TTL'i                                               | Plan I-4 uyumlu                    | `src/lib/storage.ts` — TTL ≤ 1 saat şartını karşılıyor; daha kısa TTL `staleTime` yeniden ayarı gerektirir, mevcut denge makul kabul edildi.                                                                                                                                    |
| Sunucu loglarındaki tam stack trace ve mutlak dosya yolu                        | Kabul edilebilir risk              | Yalnızca sunucu logunda, istemciye hiçbir zaman dönmüyor (canlı testle doğrulandı); teşhis için gerekli.                                                                                                                                                                        |

---

## 7. Açık sorular / kullanıcı kararı gerektirenler

- **AC-12** — denetim yerel yığında yapıldı, `.env.local` uzak projeye
  (`nxftmxkpmuyeelrmwofv.supabase.co`) bakıyor. Yapılandırmaya bağlı bulgular — özellikle AC-02 ve
  `[auth.rate_limit]` (A-01) — hosted projede ayrıca doğrulanmalı; bu doğrulama Faz 1.5'in
  kapsamı dışında tutuldu (`active_planprogram.md` §3a.1). **Hâlâ açık** — Grup 1–3 turu da yerel
  yığında yapıldı, hosted proje doğrulaması yapılmadı.
- **A-06 / Logout — çözüldü (2026-08-17, kullanıcı kararı).** Access token'ı veri düzleminde iptal
  etmiyordu (`jwt_expiry=3600`). Karar: süre `supabase/config.toml`'da `jwt_expiry=900`'e
  düşürüldü. **Bu bir kısmi düzeltmedir** — logout hâlâ access token'ı sunucu tarafında iptal
  etmiyor, yalnızca token'ın geçerlilik penceresi 60 dakikadan 15 dakikaya indi. Hassas yollarda
  sunucu tarafı canlı doğrulama (`getUser()`) veya tam token iptali bu turun kapsamında değil.
- **`next-pwa` legacy yolu** — Next 16.3.0 servis worker'larını Turbopack ile native derliyor;
  `--webpack` pinlemesi ne zaman terk edilecek, yoksa Serwist'e mi geçilecek (T-04, tooling-baseline
  §2)? **Hâlâ açık.**
- **A-01'in upstream bağımlılığı (yeni, 2026-08-17).** `[auth.rate_limit]` yapılandırması repoda
  kasıtlı olarak bırakıldı ama bugün hiçbir koruma sağlamıyor —
  [supabase/supabase#41947](https://github.com/supabase/supabase/issues/41947) düzeltildiğinde bu
  bölüm yeniden değerlendirilmeli: (a) config gerçekten `/token?grant_type=password`'ü koruyor mu
  doğrulanmalı (180 ardışık istekle aynı canlı test tekrarlanarak), (b) koruyorsa, uygulama
  katmanındaki `src/app/api/auth/sign-in/route.ts` + `src/lib/api/auth-rate-limit.ts`'in GoTrue
  seviyesindeki korumayla çakışıp çakışmadığı (çift kilitlenme, gereksiz karmaşıklık) gözden
  geçirilmeli. Bu madde kapanana kadar `[auth.rate_limit]`'in var olması "korunuyoruz" anlamına
  **gelmez** — bkz. §4b.

---

_Kaynaklar: `docs/security/findings-access-control.md`, `docs/security/findings-app-surface.md`,
`docs/security/tooling-baseline.md`, `active_planprogram.md` §3a, `docs/PROGRESS.md`._
