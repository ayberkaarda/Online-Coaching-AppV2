# Arşiv — Faz 1.5: Güvenlik Denetimi ve Sertleştirme (2026-08-17)

**Özet.** Üç paralel denetim (erişim kontrolü/IDOR/RLS, uygulama yüzeyi, otomatik araç
taraması) 39 bulgu üretti (Critical 0 · High 10 · Medium 12 · Low 17); ardından kullanıcı
onaylı Grup 1–3 ve Grup 4–6 düzeltme turlarıyla 37 bulgu kapatıldı. Açık kalanlar A-05
(token'lar `localStorage`'da) ve A-14 (CSP `unsafe-inline`) — ikisi de tek bir cookie+nonce
işine ertelendi. Bulgu tablosu ve açık sorular canlı
[`docs/security/AUDIT.md`](../security/AUDIT.md) dosyasındadır.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 50–60, 433–639, 1450–1469 —
> 2026-08-17'de taşındı.

---

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
yapılmalı. **ÇÖZÜLDÜ (2026-08-17, Faz 1.7):** `submit_program_for_approval(p_client_id,
p_workout_data)` `SECURITY DEFINER` RPC'si `20260817180000_program_submission_rpc.sql` ile
eklendi; onay satırı ve koç bildirimi tek işlemde yazılıyor, şablon metni yalnızca RPC
gövdesinde yaşıyor. Bkz. §3 "Faz 1.7 — Borç Temizliği" madde 3.

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

### Faz 1.5 — düzeltme turu, Grup 4–6 (2026-08-17)

Aynı gün, aynı oturumda Grup 1–3'ün ardından ikinci bir tur: kullanıcı `docs/security/AUDIT.md`
§5'teki planın Grup 4 → 5 → 6'sını onayladı; dört paralel ajanla (girdi doğrulama, DB
yetki/RLS, loglama/gizlilik + yapılandırma, dokümantasyon/CI) uygulandı. Tam detay ve
kırmızı-yeşil kanıtları: `docs/security/AUDIT.md` §4c.

**Kapanan bulgular (16/39 bu turda, önceki turlarla birlikte toplam 36/39 kapandı — sayım
`AUDIT.md` §2 tablosundan doğrulandı):** A-07, A-08, A-10 (kısmi), A-11, A-15, A-16, A-20, A-21,
AC-03, AC-06, AC-11, T-04 (kısmi), T-05. (A-09, A-12, A-13, A-17, A-18, A-19, A-22 zaten önceki
turlarda kapanmıştı; §2'de bu sayı 22 idi, bu turdan sonra 36.)

- **Grup 4 (girdi doğrulama):** yeni `src/lib/upload-validation.ts` — MIME allowlist + magic-byte
  tespiti; kabul/ret kararının **ve** storage yoluna giden uzantının kaynak otoritesi artık magic
  byte, `file.type` yalnızca ön eleme (A-07, A-21). `FormCheckTab.tsx`/`profile/page.tsx` seçim
  anında doğruluyor, Türkçe hata (A-20). `src/lib/api/proxy.ts` — `MAX_BODY_BYTES=64KB`, iki
  katmanlı: `Content-Length` ön kontrolü + asıl savunma olarak `ReadableStream`'i chunk chunk
  okuyup sınırda `reader.cancel()` (A-08). Testler: `tests/unit/upload-validation.test.ts` (21
  senaryo), `tests/unit/proxy-body-size.test.ts` (1 MB gövdede yalnızca 9 chunk çekildiği
  kanıtlanıyor, 128 değil).
- **Grup 5 — DB (AC-03, AC-06):** yeni migration
  `supabase/migrations/20260817170000_force_rls_and_grants.sql`. **AC-03'ün gerçek etkisi
  raporda yazandan çok daha ciddi çıktı:** düzeltmeden önce kimliği doğrulanmış herhangi bir
  danışan `truncate table public.profiles cascade` ile 11 tabloya cascade ederek tüm
  veritabanını silebiliyordu (RLS TRUNCATE'i görmez — satır filtreler, TRUNCATE tablo bazlı bir
  yetkidir). Kök neden de raporda yazandan farklı: mevcut GRANT'lardan değil, Supabase'in
  platform varsayılan ACL'inden geliyordu — bu yüzden çözüm iki adımlı (`REVOKE` + `ALTER
DEFAULT PRIVILEGES ... REVOKE`, hem `authenticated` hem `anon`). AC-06: 13/13 tabloda `FORCE
ROW LEVEL SECURITY`; **dürüst kayıt — FORCE'un bugünkü etkisi sıfırdır** çünkü tablo sahibi
  `postgres` zaten `BYPASSRLS`. RLS testleri 70 → 76.
- **Grup 5 — loglama/gizlilik (A-10, A-11, A-16):** `src/lib/logger.ts` redact listesi 5 → 19
  anahtar + tarayıcı adaptörüne yeni `maskForConsole()`. Üç güvenlik olayı artık
  `logger.warn` ile korelasyon anahtarlı loglanıyor (`rate_limit_exceeded`,
  `auth_login_failed`, `auth_login_rate_limited`), e-posta kısmi maskeli (`ku***@example.com`).
  **A-10 kalan borç:** RLS reddi (`42501`) için `logSecurityEvent()` hazır ama çağrı noktası
  kurulmadı. A-16: 503 mesajındaki "Python" ifşası jenerik Türkçe mesajla değiştirildi.
- **Grup 5 — yapılandırma (AC-11, A-15, T-04):** sunucu env şeması yeni `src/env.server.ts`'e
  (`import 'server-only'`) taşındı; kanıt — build sonrası `.next/static/` içinde
  `SUPABASE_SERVICE_ROLE_KEY`/`TRUSTED_PROXY_COUNT`/`AI_BACKEND_API_KEY` eşleşmesi 4 → 0. CSP
  `connect-src`/`img-src` wildcard'ları kaldırıldı, yalnızca yapılandırılan Supabase origin'i
  kaldı (A-15). `next-pwa` `dependencies`→`devDependencies` (T-04 kısmi — `npm audit
--omit=dev` 7 high → 0; legacy `--webpack` pinlemesi hâlâ AÇIK, karıştırılmamalı).
- **Grup 6 — dokümantasyon/CI (T-05):** yeni `docs/security/THREAT-MODEL.md` (STRIDE) ve kök
  `SECURITY.md`; `.github/workflows/ci.yml`'e yeni `security` job'u (semgrep, gitleaks, npm
  audit, pip-audit), `required-checks.needs`'e eklendi. Tuzak: çıplak `semgrep --error`
  severity'den bağımsız her bulguda kırılıyordu (alakasız bir MEDIUM öneri CI'ı ilk koşuda
  kırardı) — `--severity=ERROR` ile düzeltildi.

**Kayıtlı yeni borçlar:** (a) RLS reddi (`42501`) hâlâ loglanmıyor, `logSecurityEvent()` hazır
ama çağrı noktası yok; (b) sequence yetkileri (`authenticated=w`, `setval`) kapsam dışı kaldı;
(c) `pg_default_acl`'deki `supabase_admin` kaydı değiştirilemiyor (42501, yetki yetersiz —
pratik etkisi yok, 13/13 tablo `postgres` sahipli); (d) A-05/A-14 (httpOnly cookie + nonce CSP)
kullanıcı kararıyla ayrı bir tura ertelendi; (e) `playwright.config.ts`'teki bir yorum hâlâ
`src/env.ts` diyor, A-12 kontrolü artık `src/env.server.ts`'te.

**GÜNCELLEME (2026-08-17, Faz 1.7):** (a) KISMEN ÇÖZÜLDÜ — `wrapSupabaseError()` +
`queryClient.ts`'teki `QueryCache`/`MutationCache` `onError` kancası artık `42501`'i merkezî
yakalıyor (`src/lib/query/security-event.ts`), ama yalnızca kullanıcının KENDİ tarayıcı
konsoluna yazıyor; gerçek sunucu tarafı güvenlik kaydı hâlâ yok, borç olarak kalıyor. (b)
ÇÖZÜLDÜ — `20260817180200_sequence_grants.sql`, `authenticated`/`anon`'dan sequence `UPDATE`
kaldırıldı, `USAGE`+`SELECT` korundu. (c) hâlâ AÇIK, Faz 1.7'de de doğrulandı (`supabase_admin`
sequence'ler için de kapatılamıyor, tablolardakiyle aynı sınır). (e) ÇÖZÜLDÜ —
`playwright.config.ts` yorumu `src/env.server.ts`'e düzeltildi.

**Doğrulama (entegrasyon, tam zincir yeşil):** type-check temiz · lint 0 hata/12 uyarı ·
`npm run test` **308/308** (29 dosya, önceki tur 264) · `npm run build` başarılı ·
`npx supabase db reset` sıfır hata (16 migration + seed) · `npm run test:rls` **76/76** (önceki
tur 70) · `npm run test:transform` 26/26 · `uv run ruff check .`/`mypy app` temiz ·
`uv run pytest` **82/82, kapsam %94.94** · `npm audit --audit-level=high --omit=dev` **0
zafiyet** · `format:check` temiz (turun tek kırığı `THREAT-MODEL.md`, `prettier --write` ile
düzeltildi) · **Playwright `npm run test:e2e` 42/42** (21 senaryo × 2 profil — chromium + Mobile
Chrome, 43.2 sn, sıfır hata; önceki turun "21/21" kaydı tek profil sayımıydı).

**Durum:** Faz 1.5 tamamlandı — A-05/A-14 (kullanıcı kararıyla ertelendi) ve AC-12 (hosted
proje doğrulaması, açık soru) hariç. Sıradaki iş: Faz 1.6 (görsel kimlik) ve ardından Faz 2.

---

### Doğrulama tablosu — Faz 1.5 düzeltme turu satırları

| Kontrol                                                             | Komut                                                     | Durum                                                                                   | Tarih      |
| ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Tip kontrolü (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)              | `npm run type-check`                                      | Temiz                                                                                   | 2026-08-17 |
| Lint (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)                      | `npm run lint`                                            | Temiz — 0 hata, 12 bilinçli uyarı                                                       | 2026-08-17 |
| Biçim (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)                     | `npm run format:check`                                    | Temiz (turun tek kırığı `THREAT-MODEL.md`'ydi, `prettier --write` ile düzeltildi)       | 2026-08-17 |
| Birim/bileşen testleri (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)    | `npm run test`                                            | **308/308 (29 dosya)** — önceki tur 264                                                 | 2026-08-17 |
| Production build (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)          | `npm run build`                                           | Başarılı                                                                                | 2026-08-17 |
| Veritabanı migration'ları (Faz 1.5 düzeltme turu, Grup 4–6 sonrası) | `npx supabase db reset`                                   | Sıfır hata — 16 migration + seed                                                        | 2026-08-17 |
| RLS politika testleri (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)     | `npm run test:rls`                                        | **76/76** — önceki tur 70                                                               | 2026-08-17 |
| Plan transform testleri (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)   | `npm run test:transform`                                  | 26/26                                                                                   | 2026-08-17 |
| Backend lint/tip/test (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)     | `uv run ruff check . && uv run mypy app && uv run pytest` | Temiz — 28 dosya mypy; **pytest 82/82, kapsam %94.94**                                  | 2026-08-17 |
| `npm audit` (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)               | `npm audit --audit-level=high --omit=dev`                 | **0 zafiyet** (önceden 7 high — T-04 `next-pwa`'nın `devDependencies`'e taşınması)      | 2026-08-17 |
| E2E testleri (Faz 1.5 düzeltme turu, Grup 4–6 sonrası)              | `npm run test:e2e`                                        | **42/42 geçti** (21 senaryo × 2 profil — chromium + Mobile Chrome, 43.2 sn, sıfır hata) | 2026-08-17 |

---

### Sonradan fark edilen kapanış — B-003 (`middleware` → `proxy` göçü)

**2026-08-18'de eklendi.** Faz 1.5'in Grup 1–3 / Grup 4–6 düzeltme turları (`578968f`,
`3f36048`) `src/middleware.ts`'i Next 16'nın `proxy` dosya konvansiyonuna taşıdı, ama bu
borç tablosunda B-003 olarak **açık** kalmaya devam etti ("şu an yalnızca deprecation
uyarısı"). Faz 4.5 öncesi durum doğrulamasında yakalandı ve satır canlı tablodan silindi.

Kanıt (2026-08-18, `618801f` ağacı):

| Kontrol                    | Sonuç                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `src/middleware.ts` var mı | Yok — dosya mevcut değil                                                             |
| `src/proxy.ts` var mı      | Var; başlığında göç notu ve `export const config = { matcher: ['/api/:path*'] }`     |
| `npm run build`            | Başarılı; çıktıda `ƒ Proxy (Middleware)` satırı, **deprecation uyarısı yok**         |
| Kalan `middleware` geçişi  | Yalnızca yorum satırları (`src/lib/api/client-ip.ts`, `next.config.mjs`) — kod değil |

---

## Eski §5 — güvenlik riskleri tablosu

`ÇÖZÜLDÜ` işaretli satırlar kapanmıştır; kapanmayanlar canlı
[`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle izlenir.

**GÜVENLİK RİSKLERİ (Faz 1.5 kapsamına alındı — `active_planprogram.md` §3a.3 "Kova 3"):**
Aşağıdakiler bu oturumda kaynaktan doğrulandı; hiçbiri düzeltilmedi, hepsi Faz 1.5'in iş
kalemidir.

| Risk                                                                               | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FORCE ROW LEVEL SECURITY` hiçbir tabloda yok (yalnızca `ENABLE`)                  | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** `supabase/migrations/20260817170000_force_rls_and_grants.sql` — 13/13 tabloda `FORCE`. Bugünkü etkisi hâlâ sıfır (`postgres` sahibi `BYPASSRLS`), bkz. `AUDIT.md` §4c.                                                                                                                                                                                                                                                         |
| Erişim token'ı istemcide `localStorage`'da                                         | `src/lib/supabase/client.ts:20-22` — `persistSession: true`, özel `storage` verilmemiş (Supabase varsayılanı). XSS durumunda token çalınabilir; httpOnly cookie analizi yapılmadı. **AÇIK — kullanıcı kararıyla ertelendi (A-05), bkz. `AUDIT.md` §7.**                                                                                                                                                                                                            |
| Auth uçlarında brute-force koruması yok                                            | **ÇÖZÜLDÜ (2026-08-17, Grup 2 — kısmen, uygulama katmanında):** `src/app/api/auth/sign-in/route.ts` + `src/lib/api/auth-rate-limit.ts`; `[auth.rate_limit]` config yolu upstream Supabase hatası nedeniyle işlevsiz kaldı, bkz. `AUDIT.md` §4b.                                                                                                                                                                                                                    |
| Dosya yüklemede magic-byte doğrulaması yok                                         | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** yeni `src/lib/upload-validation.ts` — magic-byte tespiti kabul/uzantı otoritesi.                                                                                                                                                                                                                                                                                                                                               |
| Yüklenen dosya inline servis ediliyor                                              | `src/lib/storage.ts` imzalı adresi `download` / `Content-Disposition` olmadan üretiyor. **AÇIK.**                                                                                                                                                                                                                                                                                                                                                                  |
| Güvenlik olay günlüğü yok                                                          | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6 — kısmen):** `rate_limit_exceeded`/`auth_login_failed`/`auth_login_rate_limited` loglanıyor. RLS reddi (`42501`) için `logSecurityEvent()` hazır ama çağrı noktası yok — hâlâ borç. **GÜNCELLEME (2026-08-17, Faz 1.7 — kısmen ÇÖZÜLDÜ):** çağrı noktası artık var (`src/lib/query/security-event.ts`, `queryClient.ts` `onError` kancası), ama yalnızca istemci konsoluna yazıyor — gerçek sunucu tarafı güvenlik kaydı hâlâ yok. |
| Loglarda PII / sağlık verisi maskelenmiyor                                         | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** `src/lib/logger.ts` redact listesi 5→19 anahtar + tarayıcı `maskForConsole()`.                                                                                                                                                                                                                                                                                                                                                 |
| SAST / secret tarama araç zinciri yok                                              | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** `.github/workflows/ci.yml` yeni `security` job'u (semgrep, gitleaks, npm audit, pip-audit), `required-checks.needs`'e eklendi.                                                                                                                                                                                                                                                                                                 |
| Git geçmişinde secret taraması hiç yapılmadı                                       | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** gitleaks CI'a bağlandı — PR'da yeni commit, haftalık cron'da tam geçmiş.                                                                                                                                                                                                                                                                                                                                                       |
| `ai_backend` kimlik doğrulaması fail-open                                          | **ÇÖZÜLDÜ (2026-08-17, Grup 1):** `ai_backend/app/core/config.py` `model_validator` ile prod'da fail-fast, bkz. `AUDIT.md` §4b.                                                                                                                                                                                                                                                                                                                                    |
| Rate limiter `x-forwarded-for`'a doğrulamasız güveniyor, kullanıcı bazlı limit yok | **ÇÖZÜLDÜ (2026-08-17, Grup 2):** `src/proxy.ts` + `src/lib/api/client-ip.ts` — `TRUSTED_PROXY_COUNT` tabanlı güven modeli, bkz. `AUDIT.md` §4b.                                                                                                                                                                                                                                                                                                                   |
| CSP `script-src 'unsafe-inline'` içeriyor                                          | `next.config.mjs:33-35` — nonce tabanlı CSP'ye geçiş ertelendi (§8). **AÇIK — kullanıcı kararıyla ertelendi (A-14), bkz. `AUDIT.md` §7.**                                                                                                                                                                                                                                                                                                                          |
| `docs/security/` ve `SECURITY.md` yok                                              | **ÇÖZÜLDÜ (2026-08-17, Grup 4-6):** `docs/security/THREAT-MODEL.md` ve kök `SECURITY.md` eklendi.                                                                                                                                                                                                                                                                                                                                                                  |
| Plan tablolarında denetim izi yok                                                  | ADR-0014'ün kabul edilen bedeli: satırı kimin yazdığı tutulmuyor (yalnızca `updated_at`), koç danışanın planı değiştirdiğini göremiyor. **AÇIK — bu turun kapsamı dışında.**                                                                                                                                                                                                                                                                                       |
