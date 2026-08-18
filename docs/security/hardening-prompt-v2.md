# GÖREV: Online-Coaching-AppV2 — Güvenlik Katmanı Denetimi ve Tamamlama

> **Bu doküman plana işlendi (2026-08-18) ve artık doğrudan bir ajana verilecek görev
> prompt'u DEĞİLDİR.** Değerlendirme sonucu: 23 maddenin 15'i zaten kapalı, 3'ü bu
> projede uygulanmaz, 3'ü mevcut borçlarla çakışıyor, 2'si gerçek yeni iş. Gerçek iş
> `active_planprogram.md` §7a (Faz 4.6) ve `docs/PROGRESS.md` borç kütüğünde
> B-042/B-043 olarak izleniyor.

## Bu prompt olduğu gibi kullanılmamalı — düzeltilmesi gereken maddeler

1. **Madde 12 (cookie) YANLIŞ.** "HttpOnly doğrula" diyor; ADR-0022 bu mimaride
   httpOnly'nin **imkânsız** olduğunu karara bağladı — `createBrowserClient`
   cookie'yi JS'ten okumak zorunda (doğrudan `supabase.from(...)` + `useMessages`
   realtime kanalı). Cookie'leri httpOnly'ye çevirmeye çalışan bir ajan tüm istemci
   sorgularını ve realtime'ı çökertir. Geçerli olan: `Secure` (istek protokolünden
   türetilir) + `SameSite=Lax`.
2. **Madde 9+10'daki "önce Content-Security-Policy-Report-Only ile başla" talimatı
   SİLİNMELİ.** CSP zaten enforce modda; Report-Only'ye geçmek fiilen güvenlik
   düşürmesi olur. CSP'nin sahibi ADR-0022 turudur.
3. **Madde 7'nin mimari varsayımı yanlış.** Yüklemeler tarayıcıdan doğrudan
   Supabase Storage'a gider; ne Next proxy'den ne `ai_backend`'den geçer. Maddenin
   geçerli çekirdeği B-028'dir. "Yemek fotoğrafı akışı" ifadesi geçersiz (ADR-0021
   ile ertelendi).
4. **Madde 18 (`requireRole()`) düşürülmeli** veya "sunucu tarafı endpoint katmanı
   doğarsa" şartına bağlanmalı: bu projede `admin` rolü yok (ADR-0013 — yalnız
   `coach`/`client`) ve yetki sınırı RLS + kolon guard'larıdır; tüketicisi olmayan
   bir helper ölü kod olur. Ayrıca "rol yükseltme yalnızca service_role ile"
   beklentisi, koçun danışan rolünü değiştirebilmesinin bilinçli karar olduğu
   kaydıyla çelişir.
5. **Madde 5'e tuzak notu:** `supabase/config.toml`'daki `[auth.rate_limit]`
   bölümü şifre girişini KORUMAZ (upstream hatası supabase/supabase#41947). Fiili
   koruma uygulama katmanındadır (`src/app/api/auth/sign-in/route.ts` +
   `src/lib/api/auth-rate-limit.ts`). Ajan bunu görüp "koruma var" sanmamalı,
   "düzeltmeye" de kalkmamalı.
6. **Madde 3'e bağlam:** 14 tablo RLS enabled+forced ve `npm run test:rls` 110
   senaryo koşuyor; "eksik" ilan etmeden önce bu koşulmalı. "Yemek fotoğrafları
   bucket'ı" diye bir bucket yok.
7. **"Otomatik yedek" kapsam dışı maddesi hafife alıyor:** v2 "docs'a tek
   paragraf yeterli" diyor; borç kütüğünde **B-030** bunu gerçek strateji borcu
   olarak tutuyor ve geçerli olan B-030'dur.

---

## ROL VE BAĞLAM

Sen bu repoda çalışan kıdemli bir güvenlik mühendisisin. Stack: Next.js App Router + Supabase (Auth/Postgres/RLS/Storage) + FastAPI AI backend (`ai_backend/`, Next.js server proxy arkasında) + Docker Compose.

ÖNEMLİ: Bu projede zaten ciddi bir güvenlik altyapısı var (fail-closed env guard'ları `src/env.server.ts`, uygulama katmanı brute-force koruması `src/lib/api/auth-rate-limit.ts`, pino logger, `TRUSTED_PROXY_COUNT` ile XFF disiplini, `docs/security/` bulguları). Görevin sıfırdan kurmak DEĞİL: **mevcut olanı doğrula, eksikleri tamamla, çakışma yaratma.**

## ÇALIŞMA DİSİPLİNİ (ZORUNLU)

1. **Dur ve raporla:** Her fazın sonunda dur, doğrulama çıktılarıyla raporla, onayım olmadan sonraki faza geçme.
2. **Git:** Onayım olmadan `git commit/push/rebase` yasak. Commit mesajları conventional commits (`fix(security): ...`).
3. **Kapsam:** Sadece güvenlik. Refactor, format, ilgisiz dosya dokunuşu yasak. Mevcut güvenlik mekanizmalarını "iyileştirme" bahanesiyle değiştirme — önce raporla.
4. **Doğrulanmamış iddia yasak:** "Çalışıyor/test edildi" demeden önce komutu gerçekten çalıştır, çıktıyı rapora koy.

## FAZ 0 — KEŞİF VE GAP ANALİZİ (önce bu)

`src/`, `supabase/`, `ai_backend/`, `next.config.mjs`, `docker-compose.yml`, `SECURITY.md`, `docs/security/` ve `securityhardening_prompt.md` dosyalarını oku. Aşağıdaki her madde için durum tablosu çıkar: **ZATEN VAR / KISMEN VAR / YOK / UYGULANMAZ**. Tabloyu onaya sun, onaysız dosya değiştirme.

---

## MADDELER

### FAZ 1 — Sırlar

**1. Hardcoded anahtar taraması:**

- `git grep` (+ varsa gitleaks) ile tüm repoda hardcoded key/secret tara: service_role key, `AI_BACKEND_API_KEY`, AI provider anahtarları.
- `NEXT_PUBLIC_` denetimi: client bundle'a sızmaması gereken hiçbir değişkende bu prefix olmayacak. `SUPABASE_SERVICE_ROLE_KEY` kullanımlarının yalnızca server-only modüllerde olduğunu doğrula (`server-only` import guard var mı?).

**2. .env git geçmişi kontrolü:**

- `git log --all --full-history -- .env .env.local .env.hosted.local` ile geçmişe sızmış env dosyası var mı bak.
- VARSA sadece RAPORLA: history rewrite komutlarını (`git filter-repo`) hazırla ama ÇALIŞTIRMA; ilgili anahtarların rotate edilmesi gerektiğini vurgula. Ben manuel yapacağım.

### FAZ 2 — Yetkilendirme

**3. RLS denetimi:**

- `supabase/` migration'larındaki TÜM tabloları listele; her birinde RLS aktif mi ve dört işlem (SELECT/INSERT/UPDATE/DELETE) için policy var mı kontrol et.
- Eksik varsa YENİ migration olarak ekle (mevcutları değiştirme). Owner-based (`auth.uid() = user_id`) + koç↔danışan ilişkisi varsa relationship-based policy.
- Storage bucket policy'lerini de dahil et: yemek fotoğrafları bucket'ı public mi? Olmamalı — signed URL / owner-based storage policy.

**4. Yetki server'da:**

- Her korumalı Route Handler ve Server Action'da server-side session + yetki kontrolü olduğunu doğrula. `middleware.ts` tek güvenlik katmanı olamaz.
- Client-side rol kontrolü sadece UI gizleme amaçlı olabilir; asıl kontrol server'da tekrarlanmalı.

**18. Rol modeli (RBAC):**

- Mevcut rol yapısını tespit et (user / coach / admin?). Yoksa: Supabase `app_metadata` veya RLS'li `roles` tablosu ile tanımla.
- `requireRole()` tarzı tek bir server-side yardımcı yaz, tüm admin/coach endpoint'lerinde kullan. Rol yükseltmenin sadece service_role ile (admin akışı) yapılabildiğini doğrula.

**5. Rate limiting kapsam kontrolü:**

- Login brute-force koruması zaten var (A-01) — DOKUNMA, sadece testle doğrula.
- Eksik kalan yüzeyleri kontrol et: signup, password-reset ve özellikle **AI endpoint'leri** (fotoğraf → makro analizi maliyetli). AI proxy rotasına kullanıcı-başına limit ekle; `ai_backend` FastAPI tarafına da `slowapi` ile ikinci katman koy (API key'li tek client olsa bile derinlemesine savunma).

### FAZ 3 — Girdi/Çıktı

**6. Girdi doğrulama:**

- Tüm Route Handler / Server Action girdileri zod şemasından geçmeli; `ai_backend` tarafında Pydantic zorunlu. Eksikleri tamamla, başarısızlıkta 400 + generic mesaj.

**7. Upload sertleştirme (yemek fotoğrafı akışı):**

- MIME allowlist (`image/jpeg`, `image/png`, `image/webp`), max boyut (8 MB, env'den), magic-bytes doğrulaması (uzantıya güvenme), dosya adı UUID'lenmesi.
- Bu doğrulamanın hem Next.js proxy'de hem `ai_backend`'de yapıldığını garanti et.

**16. XSS:**

- `dangerouslySetInnerHTML` taraması; zorunluysa DOMPurify, değilse kaldır.
- AI backend'den dönen metinler (analiz sonuçları) untrusted sayılır — düz metin olarak render edildiğini doğrula.

### FAZ 4 — HTTP Katmanı

**8. CORS (`ai_backend`):**

- FastAPI'de `allow_origins=["*"]` varsa kaldır. Backend zaten sadece Next.js proxy'den istek alıyorsa CORS middleware'i tamamen gereksiz olabilir — durumu raporla, en dar yapılandırmayı uygula.

**9 + 10. Güvenlik başlıkları ve HTTPS:**

- `next.config.mjs` headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, CSP (önce `Content-Security-Policy-Report-Only` ile başla, kırılan yer var mı raporla).
- Mevcut header konfigürasyonu varsa üzerine yazma, birleştir.

**12. Cookie ayarları:**

- Supabase SSR client cookie'lerinde `HttpOnly`, `Secure` (production), `SameSite=Lax` doğrula. Custom cookie yazan yer varsa aynı standardı uygula.

### FAZ 5 — Operasyon

**13. Hata mesajlarını kıs:**

- Client'a stack trace, SQL hatası, iç dosya yolu sızıyor mu denetle. Merkezi handler: generic mesaj + correlation ID, detay sadece pino log'una. `productionBrowserSourceMaps` kapalı olmalı.

**14. Log hijyeni:**

- pino zaten var — redaction konfigüre edilmiş mi bak (`redact` paths). Token, şifre, e-posta ve **sağlık verisi** (kilo, ölçüler, yemek fotoğrafı içerikleri — KVKK özel nitelikli kişisel veri) loglanmamalı. Redact listesini tamamla, `ai_backend` `print`/log çağrılarını da tara.

**19. Bağımlılık denetimi:**

- `npm audit` + `pip-audit` çalıştır, çıktıyı rapora ekle. High/critical güncelle; major bump gerekiyorsa önce raporla. `.github/dependabot.yml` yoksa ekle (npm + pip + github-actions ekosistemleri).

**21. Hesabı gerçekten sil (KVKK/GDPR):**

- Hesap silme akışı var mı, varsa gerçek silme mi tespit et. Gerekli akış: auth user + tüm ilişkili satırlar + Storage'daki fotoğraflar, tek transaction/idempotent job içinde. Audit'e kişisel veri içermeyen "silindi" kaydı.

**22. AI harcama koruması:**

- Kullanıcı başına günlük AI istek/token limiti (env'den ayarlanabilir) — 5. maddedeki rate limit'in üstüne kota katmanı. Aşımda anlaşılır 429. Provider dashboard'unda budget alert kurulumu manuel adım: `docs/cost-alerts.md`'ye yaz, sen kurmaya çalışma.

### FAZ 6 — Saldırgan Gözüyle Doğrulama

**23. Saldırı senaryosu testleri** (vitest/playwright + ai_backend testleri):

- IDOR: başka kullanıcının `user_id`'siyle okuma/yazma → RLS engellemeli
- Auth'suz korumalı endpoint → 401
- `ai_backend`'e API key'siz doğrudan istek → red
- Rate limit / kota aşımı → 429
- Geçersiz MIME + sahte uzantılı upload → red
- XSS payload'lı girdi → kaçırılmış render
- user rolüyle admin/coach endpoint → 403
- Sonuçlar PASS/FAIL tablosu olarak rapora.

### KAPSAM DIŞI (bilerek atlandı — dokunma)

- Şifre hash'leme: Supabase Auth (GoTrue/bcrypt) yönetiyor; sadece custom şifre saklama OLMADIĞINI doğrulayıp tek satır raporla.
- Webhook imzası: repoda webhook endpoint'i yok; ödeme entegrasyonu gelirse eklenecek.
- SQL parametrizasyonu: Supabase client parametrize eder; yalnızca `rpc` içinde dinamik SQL veya Python'da f-string'li sorgu VARSA raporla, yoksa geç.
- Otomatik yedek: Supabase managed; koda iş çıkmıyor, `docs/`'a tek paragraf not yeterli.

---

## RAPOR FORMATI (her faz sonunda)

```
## FAZ X RAPORU
- Yapılanlar (dosya bazında)
- Çalıştırılan doğrulama komutları + çıktı özeti
- Riskler / manuel aksiyon gerektirenler
- Onay bekliyorum.
```

## BAŞLA

FAZ 0 gap analizi tablosunu sun. Onaysız hiçbir dosyayı değiştirme.
