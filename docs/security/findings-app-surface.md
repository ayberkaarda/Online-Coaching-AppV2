# Faz 1.5 — Uygulama Yüzeyi Güvenlik Denetimi

**Kapsam:** kimlik doğrulama/oturum, girdi doğrulama, dosya yükleme, AI backend, taşıma katmanı,
loglama ve gizlilik, secret/konfigürasyon.
**Kapsam dışı (paralel ajanlar):** araç zinciri/bağımlılık taraması
(`docs/security/tooling-baseline.md`), RLS ve erişim kontrolü
(`docs/security/findings-access-control.md`).

**Tarih:** 2026-08-17

**Yöntem:** kaynak kodu incelemesi + yerel Supabase yığını, üretim build'i alınmış Next.js sunucusu
ve FastAPI servisi üzerinde **gerçek HTTP istekleriyle** doğrulama. Bulguların 12'si canlı testle
kanıtlanmıştır; kanıt çıktıları aşağıda birebir verilmiştir.

**Bu denetimde hiçbir kaynak dosya değiştirilmemiştir.** Test için başlatılan tüm süreçler
kapatılmış, test amaçlı yüklenen storage nesneleri silinmiştir.

**Sır politikası:** raporda hiçbir gerçek token/secret yer almaz. Yerel Supabase yığınının sabit
demo anahtarları da dahil olmak üzere tüm anahtar değerleri kısaltılmış veya maskelenmiştir.

---

## 1. Özet

| Severity   | Adet   |
| ---------- | ------ |
| Critical   | 0      |
| High       | 4      |
| Medium     | 9      |
| Low        | 9      |
| **Toplam** | **22** |

**En ciddi üç bulgu:**

1. **A-03** — FastAPI'nin deprecated uçları API anahtarı guard'ından tamamen muaf; anahtar doğru
   yapılandırılmış olsa bile kimliksiz erişim mümkün (canlı kanıt: aynı anda 401 ve 200).
2. **A-01** — Giriş denemeleri hiçbir katmanda sınırlanmıyor; 100 ardışık yanlış şifre denemesi
   engellenmedi.
3. **A-02** — Tek hız sınırlayıcı katmanı `X-Forwarded-For` başlığı uydurularak tamamen atlanıyor
   (canlı kanıt: 25/25 istek kabul edildi).

---

## 2. Bulgu tablosu

| #    | Severity | Başlık                                                           | Kanıt                                                                         | Etki                                                                               | Düzeltme önerisi                                                                                       | Durum |
| ---- | -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----- |
| A-01 | High     | Giriş denemeleri hiçbir katmanda sınırlanmıyor                   | Canlı: 100 yanlış şifre → 100x HTTP 400, 0x 429 (§3.1)                        | Sınırsız credential stuffing / parola tahmini; sağlık verisi içeren hesaplar hedef | `supabase/config.toml`'a `[auth.rate_limit]`, CAPTCHA veya kendi login route handler'ımız              | open  |
| A-02 | High     | Hız sınırlayıcı `X-Forwarded-For` ile atlanıyor                  | Canlı: dönen XFF ile 25/25 istek kabul, `Remaining` hep 19 (§3.2)             | Tek koruma katmanı işlevsiz; AI proxy ve tüm `/api/*` fiilen sınırsız              | Güvenilen proxy sayısına göre XFF'in sondan N'inci değeri; platform IP başlığı; kimlik bazlı anahtar   | open  |
| A-03 | High     | Deprecated FastAPI uçları API key guard'ından muaf               | Canlı: `/analyze/workout` → 401, `/api/generate-ai-workout` → 200 (§3.3)      | API anahtarı doğru ayarlansa bile korumanın tamamı tek yol değiştirerek atlanıyor  | `legacy_router`'a `dependencies=[Depends(api_key_guard)]` + `@limiter.limit` ekle, ya da uçları kaldır | open  |
| A-04 | High     | `api_key` ayarlanmamışsa guard no-op (fail-open)                 | `ai_backend/app/core/security.py:22-23`; canlı: anahtarsız 200 (§3.4)         | Servis public URL ile yayına alınırsa tüm uçlar kimliksiz kullanılabilir           | Guard fail-closed olmalı: `is_production and api_key is None` ise başlangıçta hata fırlat              | open  |
| A-05 | Medium   | Oturum token'ları `localStorage`'da, JS'ten okunabilir           | Canlı Playwright: `sb-127-auth-token` (1932 B), cookie yok (§3.5)             | XSS durumunda access + refresh token birlikte çalınır → kalıcı hesap devri         | `@supabase/ssr` ile httpOnly cookie akışı; kısa vadede CSP sertleştirme (bkz. A-14)                    | open  |
| A-06 | Medium   | Logout access token'ı veri düzleminde iptal etmiyor              | Canlı: logout 204 sonrası `/rest/v1/daily_logs` → 200 + makro (§3.6)          | Çalınmış/paylaşılan cihazdaki token, çıkıştan sonra 1 saat sağlık verisi okur      | `[auth].jwt_expiry`'yi 900 sn'ye indir; hassas sunucu yollarında `getUser()` ile canlı doğrula         | open  |
| A-07 | Medium   | Dosya yüklemede magic byte doğrulaması yok                       | Canlı: HTML gövdesi `image/jpeg`, SVG gövdesi `image/png` ile 200 (§3.7)      | Depoda aktif içerik; MIME allowlist bir gün gevşetilirse doğrudan stored XSS       | Yüklemeden önce ilk baytları doğrula (JPEG/PNG/WEBP imzası); sunucu tarafı yeniden kodlama             | open  |
| A-08 | Medium   | İstek gövdesi sınırı yok; 10 MB'da sessiz KESME                  | Canlı: 9 MB tam parse edildi; 10 MB'da "Only the first 10MB" + 400 (§3.8)     | Bellek/CPU tüketimi (A-02 ile sınırsız tekrar); kesilen gövde yanıltıcı 400 üretir | `handleAiProxy`'de `Content-Length` kontrolü + 413; sınırı ~64 KB'a çek                                | open  |
| A-09 | Medium   | FastAPI hız sınırı tüm kullanıcılar için tek ortak kova          | `get_remote_address` proxy IP'sini görür; `proxy.ts:56` kimliği göndermiyor   | Tek danışan 20/dk'yı doldurup AI'yı herkes için kilitleyebilir (availability)      | Proxy kullanıcı kimliğini iletsin (imzalı `X-User-Id`) ve `key_func` buna baksın                       | open  |
| A-10 | Medium   | Güvenlik olayları loglanmıyor — tespit imkânsız                  | `src/proxy.ts` 429 dönerken hiç log yazmıyor (dosyada `logger` importu yok)   | Brute-force / limit taşması / yetki reddi görünmez; olay müdahalesi yapılamaz      | 429, tekrarlı 401 ve RLS reddi için `logger.warn` + korelasyon anahtarı (IP/kullanıcı)                 | open  |
| A-11 | Medium   | Logger redact listesi PII ve sağlık verisini kapsamıyor          | `src/lib/logger.ts:20-28` — yalnızca password/token/apiKey/authorization      | Bir profil/log nesnesi loglanırsa e-posta, kilo, makro, beslenme planı düz metin   | `email`, `full_name`, `current_weight`, `macros`, `nutrition_plan`, `notes` ekle; `remove: true` koru  | open  |
| A-12 | Medium   | `AI_BACKEND_API_KEY` opsiyonel, production'da fail-fast yok      | `src/env.ts:19` (`.optional()`); `proxy.ts:117` koşullu gönderim              | A-04 ile birleşince iki uç da sessizce kimliksiz çalışır                           | `NODE_ENV === 'production'` iken zorunlu kıl (zod `superRefine`)                                       | open  |
| A-13 | Medium   | FastAPI `/docs`, `/redoc`, `/openapi.json` production'da açık    | Canlı: `ENVIRONMENT=production` ile üçü de 200 (§3.9)                         | Tam uç envanteri + şema keşfi bedava; A-03/A-04 ile birlikte silah                 | `settings.is_production` ise `docs_url=None, redoc_url=None, openapi_url=None`                         | open  |
| A-14 | Low      | CSP `script-src 'unsafe-inline'` içeriyor                        | Canlı header (§3.10); `next.config.mjs:33-35`                                 | CSP'nin XSS'e karşı asıl değeri kalkıyor; A-05'i doğrudan büyütüyor                | Nonce tabanlı CSP (`proxy.ts`'te nonce üret, response header'a yaz)                                    | open  |
| A-15 | Low      | `connect-src` içinde `https://*.supabase.co` wildcard'ı          | Canlı header (§3.10)                                                          | XSS durumunda saldırganın kendi Supabase projesine sızdırma kanalı açık            | Wildcard yerine yalnızca yapılandırılan proje origin'i                                                 | open  |
| A-16 | Low      | Hata mesajı iç mimariyi ifşa ediyor                              | Canlı: 503 gövdesi "Python AI sunucusuna ulaşılamadı..." (§3.11)              | Teknoloji parmak izi; hedefli saldırıyı kolaylaştırır                              | Genel mesaj + `request_id`; teknik detay yalnızca logda                                                | open  |
| A-17 | Low      | `/api/health` hız sınırından muaf ve sürüm bilgisi dönüyor       | `src/proxy.ts:34`; `src/app/api/health/route.ts:14`                           | Sınırsız ping (hafif DoS yüzeyi) + sürüm parmak izi                                | Sürümü yalnızca kimlikli çağrıda dön; sağlık ucuna gevşek de olsa bir tavan koy                        | open  |
| A-18 | Low      | Hız sınırı anahtarı yola bağlı (`${ip}:${pathname}`)             | `src/proxy.ts:43`                                                             | 3 AI route'u ayrı kovalarda → aynı IP fiilen 60/dk AI isteği atabiliyor            | AI uçları için ortak anahtar (`${ip}:ai`)                                                              | open  |
| A-19 | Low      | Hız sınırlayıcı bellek içi ve tek instance                       | `src/lib/rate-limit.ts:21`; taşmada `buckets.clear()` (satır 25-28)           | Çok-instance dağıtımda limit N katı; 10k sahte anahtar tüm sayaçları sıfırlar      | Upstash Redis / `@vercel/kv`; taşmada tam temizlik yerine LRU tahliye                                  | open  |
| A-20 | Low      | Yükleme boyut/tip kontrolü istemcide de yok                      | `FormCheckTab.tsx:173-175` yalnızca `accept="image/*"`                        | Kullanıcı 5 MB üstü dosyada anlamsız hata görür; sunucu doğru reddediyor (§3.7)    | Yüklemeden önce `file.size` ve `file.type` kontrolü + Türkçe hata                                      | open  |
| A-21 | Low      | Dosya adından türetilen uzantı doğrudan yola giriyor             | `useFormChecks.ts:75`, `useProfile.ts:90`; canlı `poses/<uid>-x./evil` (§3.7) | Kendi ön eki altında çöp/iç içe yol; dizin dışına çıkış YOK (RLS engelliyor)       | Uzantıyı allowlist'e daralt (`jpg`, `jpeg`, `png`, `webp`, `avif`); MIME'den türet                     | open  |
| A-22 | Low      | `.env.example` `.gitignore`'un `.env*` deseniyle depoya girmiyor | Canlı: `git check-ignore -v .env.example` → `.gitignore:44:.env*` (§3.12)     | Yeni geliştirici/CI hangi env'lerin gerektiğini göremiyor; eksik env sessiz risk   | `.gitignore`'a `!.env.example`; `ai_backend/.env.example` de yok, eklenmeli                            | open  |

---

## 3. Canlı test kanıtları

Testler yerel Supabase yığını (`http://127.0.0.1:54321`), üretim build'i alınmış Next.js sunucusu
(`http://localhost:3000`) ve FastAPI servisi (`127.0.0.1:8000` / `8001`) üzerinde yapılmıştır.

### 3.1 (A-01) Brute-force: giriş denemeleri sınırsız

`/login` sayfası `supabase.auth.signInWithPassword()` çağırır (`src/hooks/useSession.ts:72`); istek
tarayıcıdan **doğrudan** GoTrue'ya gider. `src/proxy.ts` hız sınırlayıcısının `matcher` değeri
`['/api/:path*']` (satır 11) olduğu için bu trafiği **hiç görmez**. `supabase/config.toml`'da
`[auth.rate_limit]` benzeri bir bölüm **yoktur**.

100 ardışık yanlış şifre denemesi (ilk 20'si tek tek, kalan 80'i toplu):

```
attempt,http_code,body
1,400,{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
2,400,{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
...
20,400,{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}

# 21..100 (durum kodu dagilimi):
     80 400
```

**Sonuç: 100/100 deneme işleme alındı. Hiç 429, hiç hesap kilidi, hiç gecikme yok.**

### 3.2 (A-02) Hız sınırlayıcı `X-Forwarded-For` ile atlanıyor

`src/proxy.ts:17-28` istemcinin gönderdiği `X-Forwarded-For` başlığının **ilk** değerini sorgusuz
kabul eder ve hız sınırı anahtarı olarak kullanır (satır 43).

**Test 1 — sabit XFF (kontrol grubu), 25 POST `/api/ai/workout`:**

```
 1 http=401 rem=19      11 http=401 rem=9
 ...                    ...
10 http=401 rem=10      20 http=401 rem=0
21 http=429 rem=0   22 http=429 rem=0   23 http=429 rem=0   24 http=429 rem=0   25 http=429 rem=0
```

**Test 2 — her istekte farklı XFF (`198.51.100.1` … `198.51.100.25`), aynı istemci, aynı 25 POST:**

```
 1 XFF=198.51.100.1   http=401 rem=19
 2 XFF=198.51.100.2   http=401 rem=19
 3 XFF=198.51.100.3   http=401 rem=19
 ...
24 XFF=198.51.100.24  http=401 rem=19
25 XFF=198.51.100.25  http=401 rem=19
```

**Sonuç: 25/25 istek kabul edildi, tek bir 429 yok, `X-RateLimit-Remaining` hep 19'da kaldı.**
Sınır tamamen atlandı. (401'ler kimlik doğrulamanın çalıştığını gösterir; hız sınırlayıcı kimlik
kontrolünden önce koştuğu için ölçüm geçerlidir.)

**İkincil etki:** `src/lib/rate-limit.ts:24-28` — anahtar sayısı `MAX_KEYS = 10_000`'i aşınca
`buckets.clear()` **tüm** sayaçları siler. Saldırgan 10.000 sahte XFF değeriyle diğer tüm
kullanıcıların hız sınırı durumunu da sıfırlayabilir.

**Not (bağlam):** `npm audit` çıktısında `next@16.2.10` için "Middleware / Proxy bypass in App
Router applications" başlıklı bir High advisory var. Bu proje Turbopack ile değil `--webpack` ile
build alındığı için advisory'nin koşulu birebir karşılanmıyor; yine de proxy katmanı tek koruma
olduğundan bağımlılık güncellemesi (tooling ajanının kapsamı) bu bulgunun yanında ele alınmalı.

### 3.3 (A-03) Deprecated FastAPI uçları API key guard'ından muaf

`ai_backend/app/routers/workout.py:17` — `router` için `dependencies=[Depends(api_key_guard)]` var;
`legacy_router` (satır 19) için **yok**. `nutrition.py` de aynı yapıda.

Servis `API_KEY` **ayarlı** olarak çalıştırıldı:

```
1) /analyze/workout, no key:
{"error":{"code":"unauthorized","message":"Gecersiz veya eksik API anahtari.",
  "request_id":"a332e033-...","details":null}}                                    http=401
2) /analyze/workout, wrong key:                                                   http=401
3) /analyze/workout, right key:                                                   http=200
4) LEGACY /api/generate-ai-workout, NO key:
{"status":"success","message":"AI programi basariyla olusturdu.", ...             http=200
5) LEGACY /api/generate-ai-diet, NO key:                                          http=200
6) /recommendations, NO key:                                                      http=401
```

**Sonuç: korumanın tamamı, tek bir yol değiştirilerek atlanıyor.**

Aynı uçlar `@limiter.limit("20/minute")` dekoratöründen de muaf; yalnızca global varsayılan
(`60/minute`) uygulanıyor:

```
25x POST /api/generate-ai-workout (deprecated):
200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200

25x POST /analyze/workout (20/minute):
200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 429 429 429 429 429 429 429
```

### 3.4 (A-04) API key guard fail-open

`ai_backend/app/core/security.py:22-23`:

```python
if settings.api_key is None:
    return
```

`API_KEY` ortam değişkeni **ayarlanmadan** çalıştırılan servis:

```
POST /analyze/workout, NO X-API-Key:
{"status":"success","message":"AI programi basariyla olusturdu.","ai_analysis":"Hedef: cut,
Yas: 30. Dinlenme gunleri algilandi: ['Persembe', 'Pazar']","workout_plan":{"Pazartesi":
"--- PUSH GUNU ---\n1. Incline Dumbbell Press (30 Derece) - 3x8-10 ...
   http=200
```

**Somut sömürü senaryosu:** `docker-compose.yml:33-36` `ai-backend` servisini host'un `8000`
portuna bağlar ve **`API_KEY` ortam değişkenini hiç vermez** (yalnızca `CORS_ORIGINS` verilir). Bu
compose dosyasıyla bir VPS'e veya bulut sunucusuna deploy edildiğinde:

1. `http://<sunucu-ip>:8000/openapi.json` ile tüm uç ve şema envanteri okunur (bkz. §3.9).
2. `POST /analyze/nutrition` ve `/analyze/workout` sınırsızca (60/dk/IP, botnet ile fiilen
   sınırsız) kimliksiz çağrılır.
3. `docs/DEPLOYMENT.md` Railway/Fly adımlarında `API_KEY` set etmeyi _tavsiye eder_ ama uygulama
   bunu **zorlamaz**; unutulursa hiçbir uyarı, hiçbir log, hiçbir başlangıç hatası oluşmaz.

Maliyet DoS boyutu **sınırlıdır**: backend hiçbir LLM veya ücretli API çağırmıyor
(`ai_backend/app/` altında `httpx`/`requests`/`urlopen` **yok**, tüm üretim deterministik kural
motoru). Etki para değil CPU/bant genişliği. Bu nedenle Critical değil High.

### 3.5 (A-05) Token saklama: `localStorage`

`src/lib/supabase/client.ts:19-23` — `persistSession: true`, özel `storage` verilmemiş; supabase-js
tarayıcıda varsayılan olarak `localStorage` kullanır. Playwright ile gerçek giriş sonrası ölçüm:

```
LOCALSTORAGE:      [["sb-127-auth-token", 1932]]
SESSIONSTORAGE:    []
COOKIES:           []
JS-READABLE-TOKEN: {"key":"sb-127-auth-token","hasAccessToken":true,"atPrefix":"eyJhbGciOiJF",
                    "hasRefresh":true,"user":"client1@example.com"}
```

**Değerlendirme (abartısız):** Uygulama kodunda **hiçbir XSS sink yok** —
`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` aramaları `src/`
altında sıfır sonuç verdi. Yani bugün bilinen bir XSS zinciri yok; bu bulgu **derinlemesine
savunma** eksikliğidir. Ancak risk teorik değil: (a) CSP `script-src 'unsafe-inline'` içeriyor
(A-14), yani bir XSS oluşursa CSP onu durdurmaz; (b) `npm audit --production` 11 High advisory
raporluyor, üçüncü parti JS tedarik zinciri canlı bir yüzey. Bir XSS gerçekleşirse hem access hem
**refresh** token birlikte çalınır — refresh token ile saldırgan oturumu süresiz yeniler, parola
değişikliği bile onu kendiliğinden düşürmez.

**httpOnly cookie'ye geçişin maliyeti:** `@supabase/ssr` paketine geçmek gerekir;
`createBrowserClient`/`createServerClient` ikilisi + `proxy.ts`'te cookie tazeleme adımı.
Etkilenen dosyalar: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/proxy.ts`,
`src/lib/api/ai.ts` (artık `Authorization` başlığını elle taşımaya gerek kalmaz),
`src/hooks/useSession.ts`. Realtime abonelikleri ve `createSignedUrl` çağrıları tarayıcı
istemcisinden gittiği için token yine bellekte tutulur — kazanç "token diskte kalıcı değil"dir,
"token JS'ten tamamen erişilemez" değil. Orta büyüklükte, tek oturumluk bir iş; Faz 2'nin realtime
akışlarından **önce** yapılırsa daha ucuz.

### 3.6 (A-06) Logout: JWT veri düzleminde iptal edilmiyor

`useSignOut` (`src/hooks/useSession.ts:93`) `supabase.auth.signOut()` çağırır. Bu, sunucuya
`POST /auth/v1/logout` atar ve **refresh token'ı** iptal eder; ancak access token imza tabanlı bir
JWT olduğu için PostgREST ve Storage onu süresi dolana kadar (`jwt_expiry = 3600`) kabul etmeye
devam eder.

```
A)  BEFORE logout - AI proxy:                      http=503   (upstream kapali; auth gecti)
A2) BEFORE logout - PostgREST daily_logs:          http=200
B)  POST /auth/v1/logout:                          http=204
C)  AFTER logout - AI proxy (/api/ai/workout):     http=401   <-- dogru davranis
D)  AFTER logout - PostgREST daily_logs:
[{"id":"216ebfbd-...","macros":{"fat": 70, "carb": 250, "protein": 120}},
 {"id":"9c42447a-...","macros":{"fat": 75, "carb": 265, "protein": 128}}]
                                                   http=200   <-- SAGLIK VERISI DONDU
E)  AFTER logout - Storage imzali adres uretimi (kendi poz fotografi):
{"signedURL":"/object/sign/form-checks-media/poses/33333333-...-front.jpg?token=eyJhbGciOi..."}
                                                   (imza uretildi)
```

Ek doğrulama — GoTrue'nun kendisi token'ı reddediyor, veri düzlemi etmiyor:

```
AFTER logout, /auth/v1/user:
{"code":403,"error_code":"session_not_found",
 "msg":"Session from session_id claim in JWT does not exist"}
AFTER logout, refresh token yeniden kullanimi:
{"code":400,"error_code":"refresh_token_not_found",
 "msg":"Invalid Refresh Token: Refresh Token Not Found"}
```

**Sonuç:** "Çıkış yapıldı" mesajından sonra token 1 saate kadar günlük makro/kilo kayıtlarını okur
ve vücut fotoğrafları için imzalı adres üretebilir. AI proxy'nin `getUser()` ile GoTrue'ya sorması
sayesinde **o uç doğru davranıyor** — sorun proxy'de değil, JWT ömründe.

### 3.7 (A-07, A-20, A-21) Dosya yükleme

Bucket yapılandırması (SQL ile doğrulandı):

```
        id         | public | file_size_limit |            allowed_mime_types
-------------------+--------+-----------------+------------------------------------------
 avatars           | f      |         5242880 | {image/png,image/jpeg,image/jpg,
                   |        |                 |  image/webp,image/gif,image/avif}
 form-checks-media | f      |         5242880 | {image/png,image/jpeg,image/jpg,
                   |        |                 |  image/webp,image/gif,image/avif}
```

Yükleme testleri (danışan token'ı ile, gerçek Storage API):

```
A) HTML govdesi, .jpg adi, Content-Type: image/jpeg
   {"Key":"form-checks-media/poses/2222...-audit-a.jpg","Id":"e1bc2a7c-..."}  http=200  <-- KABUL
B) HTML govdesi, .html adi, Content-Type: text/html
   {"statusCode":"415","error":"invalid_mime_type",
    "message":"mime type text/html is not supported"}                         http=400  <-- RET
C) SVG govdesi, .svg adi, Content-Type: image/png
   {"Key":"form-checks-media/poses/2222...-audit-c.svg","Id":"d0f9d639-..."}  http=200  <-- KABUL
D) SVG govdesi, Content-Type: image/svg+xml
   {"statusCode":"415","error":"invalid_mime_type",
    "message":"mime type image/svg+xml is not supported"}                     http=400  <-- RET
E) 6 MB dosya (bucket limiti 5 MB)
   {"statusCode":"413","error":"Payload too large",
    "message":"The object exceeded the maximum allowed size"}                 http=400  <-- RET
F) Uzanti uzerinden yola '/' enjeksiyonu: poses/<uid>-x./evil
   {"Key":"form-checks-media/poses/2222...-x./evil"}                          http=200  <-- KABUL
G) On ekten kacis denemesi: poses/../evil2.jpg
   {"statusCode":"403","message":"new row violates row-level security policy"} http=400 <-- RET
H) Baska kullanicinin on ekine yukleme: poses/3333...-evil.jpg
   {"statusCode":"403","message":"new row violates row-level security policy"} http=400 <-- RET
```

İndirilen dosya tarayıcıda çalıştırılabilir mi? İmzalı adresle çekilen A ve C nesnelerinin gerçek
yanıt başlıkları:

```
# A (HTML icerik, image/jpeg olarak beyan edilmis)
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 64
Access-Control-Allow-Origin: *
x-robots-tag: none
--- govde:
<html><script>alert(document.domain)</script><h1>xss</h1></html>

# C (SVG icerik, image/png olarak beyan edilmis)
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 71
Access-Control-Allow-Origin: *
--- govde:
<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>
```

**Somut değerlendirme:**

- **Magic byte doğrulaması yok** (A-07 doğrulandı): içerik ile beyan edilen MIME arasında hiçbir
  tutarlılık kontrolü yapılmıyor. Kullanıcı `.jpg` uzantılı bir HTML/SVG dosyası yükleyebiliyor.
- **Ama doğrudan stored XSS değil:** Storage nesneyi kayıtlı MIME tipiyle servis ediyor
  (`Content-Type: image/jpeg`), `text/html` ve `image/svg+xml` allowlist tarafından reddediliyor.
  Modern tarayıcılar açık bir `Content-Type` varken HTML'e sniff etmez. Bu yüzden severity Medium,
  High değil.
- **Zayıflatıcılar:** Storage yanıtlarında `X-Content-Type-Options: nosniff` **yok** ve
  `Content-Disposition` **hiç yok**. `next.config.mjs`'teki `nosniff` yalnızca uygulama domain'ine
  uygulanır, Supabase Storage domain'ine değil. Allowlist bir gün `image/svg+xml` içerecek şekilde
  gevşetilirse bu doğrudan stored XSS'e döner.
- **Boyut limiti sunucuda zorlanıyor** (E: 413) — yalnızca bucket ayarında olması bu durumda
  yeterli, çünkü Storage API bunu isteğin kendisinde uyguluyor. İstemcide hiç kontrol yok (A-20).
- **Path traversal yok** (A-21): `file.name.split('.').pop()` sonucu **tanımı gereği nokta
  içeremez**, dolayısıyla `..` üretilemez. `/` içerebilir (F testi) ama sonuç yol yine kendi
  `poses/<uid>-` ön eki altında kaldığı için RLS sınırı korunur; ön ekten çıkma denemesi (G) ve
  başka kullanıcının ön ekine yazma (H) RLS tarafından reddedildi. Kalan risk kozmetik: kullanıcı
  kendi ön eki altında iç içe klasör ve çok uzun/garip adlı çöp dosya üretebilir.

Test için yüklenen üç nesne denetim sonunda silinmiştir (`DELETE` → 200, 200, 200;
`storage.objects` tablosunda yalnızca özgün seed nesnesi kaldı).

### 3.8 (A-08) İstek gövdesi boyutu

`src/lib/api/proxy.ts:90` — `await request.json()` öncesinde hiçbir `Content-Length` veya boyut
kontrolü yok.

```
  1 MB -> {"error":{"code":"AI_BACKEND_UNAVAILABLE",...}}  http=503  <-- govde TAM parse edildi
  2 MB -> {"error":{"code":"AI_BACKEND_UNAVAILABLE",...}}  http=503
  4 MB -> {"error":{"code":"AI_BACKEND_UNAVAILABLE",...}}  http=503
  8 MB -> {"error":{"code":"AI_BACKEND_UNAVAILABLE",...}}  http=503
  9 MB -> http=503
 10 MB -> http=400   {"error":{"code":"INVALID_JSON",...}}
 12 MB -> http=400
 16 MB -> http=400
 20 MB -> http=400
```

Sunucu logunda gerçek sebep:

```
Request body exceeded 10MB for /api/ai/workout. Only the first 10MB will be available unless
configured. See https://nextjs.org/docs/app/api-reference/config/next-config-js/
middlewareClientMaxBodySize
```

**Sonuç:** Uygulama katmanında sınır **yok**; fiili tavan Next.js'in 10 MB varsayılanı ve bu tavan
isteği **reddetmiyor, sessizce kesiyor** — kullanıcı 413 yerine yanıltıcı bir 400 `INVALID_JSON`
alıyor. 10 MB'ın altındaki her gövde tamamen belleğe alınıp `JSON.parse` ediliyor. A-02 ile
birleşince (sınırsız sahte IP) bu, ucuz bir bellek/CPU tüketim vektörü. Meşru gövde birkaç yüz
bayt olduğundan makul sınır ~64 KB'dır.

### 3.9 (A-13) FastAPI dokümantasyon uçları

`ENVIRONMENT=production` ile çalıştırılan serviste:

```
/docs          200
/redoc         200
/openapi.json  200
```

`ai_backend/app/main.py:29-31` bu değerleri koşulsuz sabitliyor.

### 3.10 (A-14, A-15) Taşıma katmanı başlıkları

`GET http://localhost:3000/api/health` gerçek yanıt başlıkları:

```
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
X-DNS-Prefetch-Control: on
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
  'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://ui-avatars.com
  http://127.0.0.1:54321; font-src 'self' data:; connect-src 'self' https://*.supabase.co
  wss://*.supabase.co http://127.0.0.1:54321 ws://127.0.0.1:54321; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
cache-control: no-store
```

**Doğru olanlar:** HSTS iki yıl + `includeSubDomains` + `preload`; `nosniff`;
`frame-ancestors 'none'` **ve** `X-Frame-Options: DENY` (ikisi birden, doğru); `object-src 'none'`;
`base-uri 'self'`; `form-action 'self'`; `poweredByHeader: false`.

**`'unsafe-inline'` ne kadar zayıflatıyor (somut):** `script-src 'self' 'unsafe-inline'` altında
CSP, enjekte edilmiş bir `<script>alert(1)</script>` etiketini veya `onerror=` niteliğini
**durdurmaz**. Yani CSP'nin XSS'e karşı asıl işlevi tamamen kalkar; geriye yalnızca
`connect-src`/`img-src` kısıtlarının sağladığı sızdırma zorluğu kalır — o da
`https://*.supabase.co` wildcard'ı yüzünden delik (A-15): saldırgan kendi Supabase projesine
(`https://<kendi-ref>.supabase.co`) veri gönderebilir. `next.config.mjs:27-32`'de bunun bilinçli
bir TODO olduğu ve nonce'a geçilmesi gerektiği zaten not edilmiş.

**FastAPI CORS** (`ai_backend/app/main.py:45-51`) dar ve doğru; `allow_origins=["*"]` +
`allow_credentials=True` kombinasyonu **yok**. Canlı doğrulama:

```
# Preflight, Origin: https://evil.example
HTTP/1.1 400 Bad Request
(access-control-allow-origin basligi YOK)

# Basit istek, Origin: https://evil.example
HTTP/1.1 200 OK
access-control-allow-credentials: true
(access-control-allow-origin basligi YOK -> tarayici yaniti okutmaz)
```

### 3.11 (A-16) Hata yanıtlarının içeriği

Altı senaryonun gerçek yanıt gövdeleri (hepsi `/api/ai/workout`):

```
1) Authorization basligi yok:
{"error":{"code":"NOT_AUTHENTICATED","message":"Oturumunuz sona ermis. Lutfen tekrar giris yapin.",
  "request_id":"0ed13977-..."}}                                                   http=401

2) Bozuk bearer token:
{"error":{"code":"NOT_AUTHENTICATED","message":"Oturumunuz sona ermis. Lutfen tekrar giris yapin.",
  "request_id":"5b387f38-..."}}                                                   http=401

3) Bozuk JSON govdesi (gecerli token):
{"error":{"code":"INVALID_JSON","message":"Istek govdesi gecerli bir JSON degil.",
  "request_id":"16971568-..."}}                                                   http=400

4) Sema ihlali + prototype pollution denemesi (__proto__):
{"error":{"code":"VALIDATION_ERROR","message":"Gonderilen bilgiler gecersiz...",
  "request_id":"73553e09-...","details":[
    {"path":"split_type","message":"Gecersiz antrenman sablonu secildi."},
    {"path":"age","message":"Yas sayi olmalidir."},
    {"path":"goal","message":"Hedef \"cut\", \"bulk\" veya \"maintain\" olmalidir."},
    {"path":"weight","message":"Kilo en az 20 kg olmalidir."}]}}                  http=422

5) Upstream erisilemez:
{"error":{"code":"AI_BACKEND_UNAVAILABLE","message":"Python AI sunucusuna ulasilamadi.
  Sunucunun calistigindan emin olun.","request_id":"e5be72ed-..."}}               http=503

6) POST-only route'a GET:                                                          http=405 (bos)
```

**Değerlendirme:** hiçbir yanıtta stack trace, dosya yolu, SQL, upstream gövdesi veya kütüphane
sürümü yok. `details` yalnızca alan adı + Türkçe mesaj taşıyor; **gönderilen değerler yer almıyor**
(`formatZodError` yalnızca `path` + `message` üretiyor — `src/lib/validation/schemas.ts:255`). Tek
kusur 5 numaralı mesajın "Python AI sunucusu" ifadesiyle iç mimariyi ele vermesi (A-16, Low).

FastAPI tarafında da aynı disiplin doğrulandı:

```
POST /api/generate-ai-workout, govdede fazladan alan:
{"error":{"code":"validation_error","message":"Istek govdesi dogrulanamadi.",
  "request_id":"87ec2568-...","details":[
    {"loc":"body.extra","message":"Extra inputs are not permitted","type":"extra_forbidden"}]}}
                                                                                   http=422
```

`ai_backend/app/core/errors.py:131-134` — `is_production` iken beklenmeyen hatalar generic mesaja
düşüyor, sınıf adı/detay yalnızca development'ta veriliyor. Doğru.

### 3.12 (A-22) `.env.example` depoya girmiyor

```
$ git check-ignore -v .env.example
.gitignore:44:.env*     .env.example

$ git ls-files .env.example
(bos)

$ git ls-files | grep -i env
src/env.ts
tests/unit/env.test.ts
```

Dosyanın **içeriği eksiksiz** (7 client/server değişkeni + rate limit ayarları, hepsi Türkçe
açıklamalı, gerçek sır içermiyor) — sorun dosyanın kendisinin sürüm kontrolüne hiç girmemesi.
Ayrıca `ai_backend/.env.example` **hiç yok**; `API_KEY`, `CORS_ORIGINS`, `RATE_LIMIT`,
`ENVIRONMENT` yalnızca `docs/DEPLOYMENT.md` içinde belgeleniyor.

---

## 4. Endpoint envanteri

`src/app/api/**` altındaki route'ların tamamı:

| Route                     | Metot | Auth gerekli mi  | Sunucuda kontrol ediliyor mu                            | Hız sınırı             | Girdi doğrulama            |
| ------------------------- | ----- | ---------------- | ------------------------------------------------------- | ---------------------- | -------------------------- |
| `/api/ai/workout`         | POST  | Evet             | Evet — `handleAiProxy` `getUser(token)` (`proxy.ts:73`) | 20/dk/IP (atlanabilir) | zod `aiWorkoutSchema`      |
| `/api/ai/nutrition`       | POST  | Evet             | Evet — aynı iskelet                                     | 20/dk/IP (atlanabilir) | zod `aiDietSchema`         |
| `/api/ai/recommendations` | POST  | Evet             | Evet — aynı iskelet                                     | 20/dk/IP (atlanabilir) | zod `recommendationSchema` |
| `/api/health`             | GET   | Hayır (bilinçli) | Yok                                                     | **Muaf** (A-17)        | Girdi yok                  |

Server action yok (`src/app/` altında `'use server'` dosyası bulunmuyor); service_role kullanan
çalışma zamanı kodu yok — `SUPABASE_SERVICE_ROLE_KEY` yalnızca `scripts/import-catalog.mjs` (elle
çalıştırılan katalog içe aktarma script'i) tarafından okunuyor. Geri kalan tüm veri erişimi
tarayıcıdan anon key + RLS üzerinden yapılıyor (RLS'in doğruluğu `findings-access-control.md`
kapsamındadır).

FastAPI uçları:

| Uç                                     | API key guard    | Hız sınırı         | Şema                      |
| -------------------------------------- | ---------------- | ------------------ | ------------------------- |
| `POST /analyze/workout`                | Evet             | 20/dk              | `WorkoutAnalyzeRequest`   |
| `POST /analyze/nutrition`              | Evet             | 20/dk              | `NutritionAnalyzeRequest` |
| `POST /recommendations`                | Evet             | 20/dk              | `RecommendationRequest`   |
| `POST /api/generate-ai-workout`        | **HAYIR** (A-03) | 60/dk (varsayılan) | `WorkoutAnalyzeRequest`   |
| `POST /api/generate-ai-diet`           | **HAYIR** (A-03) | 60/dk (varsayılan) | `NutritionAnalyzeRequest` |
| `GET /health`, `/health/ready`         | Hayır (bilinçli) | Muaf (`@exempt`)   | Girdi yok                 |
| `GET /docs`, `/redoc`, `/openapi.json` | Hayır            | Varsayılan         | — (A-13)                  |

---

## 5. Doğrulanmış güvenli davranışlar

Aşağıdakiler **canlı testle** ya da doğrudan kod/SQL kanıtıyla doğrulanmış ve güvenli çıkmıştır;
regresyon olmaması için kaydedilmiştir.

| Konu                                               | Doğrulama                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AI proxy kimliksiz isteği upstream'e geçirmiyor    | Authorization yok / bozuk token → 401, `fetch` hiç çağrılmıyor (§3.11, madde 1-2)                                                               |
| AI proxy istemciden `user_id` kabul etmiyor        | Kimlik yalnızca JWT'den (`proxy.ts:85`), upstream gövdesine **eklenmiyor**; kod tabanında client'tan gelen `user_id`'ye güvenen tek bir yer yok |
| `increment_streak` RPC yetki doğruluyor            | Fonksiyon gövdesi: `if not (auth.uid() = user_id or public.is_coach()) then raise ... 42501`                                                    |
| Storage bucket'ları private                        | SQL: `avatars` ve `form-checks-media` → `public = f`                                                                                            |
| Storage MIME allowlist çalışıyor                   | `text/html` → 415, `image/svg+xml` → 415 (§3.7 B, D)                                                                                            |
| Storage boyut limiti sunucuda zorlanıyor           | 6 MB dosya → 413 `EntityTooLarge` (§3.7 E)                                                                                                      |
| Storage ön ekten kaçış engelleniyor                | `poses/../evil2.jpg` → 403 RLS; başka kullanıcının ön eki → 403 RLS (§3.7 G, H)                                                                 |
| Uzantı üzerinden path traversal mümkün değil       | `split('.').pop()` sonucu nokta içeremez → `..` üretilemez; `/` içerse bile ön ek korunuyor (§3.7 F)                                            |
| Hata yanıtları iç detay sızdırmıyor                | 6 senaryonun tamamında stack/dosya yolu/SQL/upstream gövdesi yok (§3.11)                                                                        |
| Doğrulama hataları değer sızdırmıyor               | `formatZodError` yalnızca `path` + `message` (`schemas.ts:255`); FastAPI handler yalnızca `loc`/`msg`/`type`                                    |
| Prototype pollution denemesi etkisiz               | `__proto__` alanlı gövde zod tarafından sessizce düşürüldü, 422 döndü (§3.11, madde 4)                                                          |
| FastAPI CORS dar                                   | `evil.example` preflight → 400, ACAO başlığı yok; `*` + credentials kombinasyonu yok (§3.10)                                                    |
| Pydantic `extra="forbid"` her modelde              | `common.py`, `workout.py`, `nutrition.py`, `recommendations.py` — **14/14 model**; canlı: `extra_forbidden` 422                                 |
| Pydantic sınır kontrolleri makul                   | `age 10-100`, `weight 20-400`, `height 80-260`, `steps 0-100000`, `user_prompt <= 2000`, liste uzunlukları <= 365                               |
| Her public girdi zod ile doğrulanıyor              | 3 AI route'unun üçü de `handleAiProxy` içinde `safeParse`; `/api/health` girdi almıyor; doğrulanmayan giriş noktası yok                         |
| SSRF yüzeyi yok                                    | `ai_backend/app/` altında `httpx`/`requests`/`urlopen`/`subprocess` **sıfır sonuç**; kullanıcıdan URL alan yer yok                              |
| AI backend maliyet DoS'u sınırlı                   | Hiçbir ücretli/LLM API çağrısı yok; üretim tamamen deterministik kural motoru → etki CPU, para değil                                            |
| Uygulama kodunda XSS sink yok                      | `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`/`document.write` → `src/` altında sıfır sonuç                                       |
| `X-Frame-Options` + `frame-ancestors` ikisi de var | Canlı header (§3.10)                                                                                                                            |
| HSTS ve nosniff doğru                              | `max-age=63072000; includeSubDomains; preload`, `nosniff` (§3.10)                                                                               |
| `NEXT_PUBLIC_` ile sır sızmamış                    | Yalnızca `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` — üçü de public olması amaçlanan değerler           |
| İstemci env eksikse fail-fast                      | `src/env.ts:90` — zod başarısız olursa modül import'unda `throw`; build/başlangıç kırılır                                                       |
| `.env*` gitignore'da                               | `.gitignore:44` — `.env.local` commit'lenemiyor (istenmeyen yan etkisi için bkz. A-22)                                                          |
| CI'da gerçek sır yok                               | `.github/workflows/ci.yml` — `placeholder-anon-key` ve yerel demo anahtarları kullanılıyor                                                      |
| PWA önbelleği `profiles` yanıtlarını tutmuyor      | `next.config.mjs:127` — yalnızca `workout_logs`; storage public yolu `NetworkOnly`                                                              |
| Logout istemci tarafı temizliği tam                | `queryClient.clear()` + `caches.delete('offline-*'/'workbox-*')` (`useSession.ts:97-103`)                                                       |
| structlog istek gövdesi loglamıyor                 | Canlı log çıktısı: yalnızca `method`, `path`, `status_code`, `duration_ms`, `request_id`                                                        |
| Sunucu logu bugün PII/sağlık verisi içermiyor      | 17 çağrı yerinin tamamı incelendi; hiçbiri profil/log satırını doğrudan loglamıyor (koruma yok ama fiili sızıntı da yok — bkz. A-11)            |

---

## 6. Kabul edilebilir riskler

| Konu                                                        | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts:52`'deki demo anon key                | **Gerçek risk değil.** Bu, Supabase CLI'ın her kurulumda ürettiği **sabit, herkese açık** yerel demo anahtarıdır (`iss: "supabase-demo"`); Supabase'in kendi dokümantasyonunda ve şablonlarında birebir aynısı yayınlanır. Yalnızca `127.0.0.1:54321` üzerinde çalışan geçici yerel yığına aittir, hiçbir üretim/staging kaynağına erişim vermez. Ayrıca anon key tanımı gereği istemciye açıktır ve tek başına RLS'i geçemez. Dosyadaki yorum bunu zaten açıklıyor ve dışarıdan verilen değere öncelik veriyor. **Kabul edildi.** |
| `/api/health` kimliksiz erişilebilir                        | Docker HEALTHCHECK ve yük dengeleyiciler için zorunlu. Dönen bilgi (`status`, `timestamp`, `version`) hassas değil. Yalnızca sürüm alanı A-17'de Low olarak ayrıca kaydedildi.                                                                                                                                                                                                                                                                                                                                                     |
| FastAPI `/health`, `/health/ready` kimliksiz ve limit muafı | Aynı gerekçe; `data_dir` varlığı dışında hiçbir iç durum ifşa etmiyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Anon key'in istemci paketinde bulunması                     | Supabase mimarisinin tasarım gereği; güvenlik sınırı RLS'tir, anahtarın gizliliği değil.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| İmzalı adreslerin 1 saatlik TTL'i                           | `src/lib/storage.ts:25` — plan I-4'ün "TTL <= 1 saat" şartını karşılıyor. Adres tarayıcı geçmişine düşerse etki penceresi sınırlı. Daha kısa TTL, `staleTime` yeniden ayarını gerektirir; mevcut denge makul.                                                                                                                                                                                                                                                                                                                      |
| Koç profilinin tüm kimlikli kullanıcılara görünmesi         | Mesajlaşmanın çalışması için zorunlu, tek koçlu modelde bilinçli takas (ADR ve `PROGRESS.md`'de kayıtlı). Erişim kontrolü ajanının kapsamında.                                                                                                                                                                                                                                                                                                                                                                                     |
| Sunucu loglarında tam stack trace ve mutlak dosya yolu      | Bu bilgi **yalnızca sunucu logunda**; istemciye hiçbir zaman dönmüyor (§3.11 ile doğrulandı). Teşhis için gerekli. Log erişimi ayrı bir güven sınırı.                                                                                                                                                                                                                                                                                                                                                                              |
| Deterministik motorun prompt enjeksiyonuna açık olmaması    | `user_prompt` bir LLM'e gitmiyor; yalnızca `detect_rest_days` gibi kural eşleştirmelerinde kullanılıyor. Prompt injection sınıfı bu mimaride geçerli değil.                                                                                                                                                                                                                                                                                                                                                                        |
| `src/lib/storage.ts` tarayıcı konsoluna yol logluyor        | Loglanan yol kullanıcının **kendi** UID'sini içeriyor ve yalnızca kendi tarayıcı konsoluna yazılıyor; başka bir kullanıcıya sızmıyor.                                                                                                                                                                                                                                                                                                                                                                                              |

---

## 7. Önerilen düzeltme sırası

Bağımlılık ve maliyet dikkate alınarak:

1. **A-03** — `legacy_router`'a guard + limit ekle (tek satır, sıfır risk, en yüksek kazanç).
2. **A-04 + A-12** — production'da API anahtarını iki tarafta da zorunlu kıl (fail-fast).
3. **A-01** — `supabase/config.toml`'a auth hız sınırı; barındırılan projede de aynısı.
4. **A-02 + A-19** — XFF güven modelini düzelt; aynı işte kalıcı depoya (Redis/KV) geç.
5. **A-08** — `handleAiProxy`'de gövde boyutu kontrolü + 413.
6. **A-13** — production'da OpenAPI uçlarını kapat.
7. **A-10 + A-11** — güvenlik olayı logları + redact listesi genişletmesi (birlikte, tek dosya).
8. **A-06** — `jwt_expiry` düşür.
9. **A-05 + A-14** — cookie tabanlı oturum ve nonce tabanlı CSP (en büyük iş; Faz 2'nin realtime
   işlerinden önce planlanmalı).
10. Kalan Low bulgular fırsat buldukça.
