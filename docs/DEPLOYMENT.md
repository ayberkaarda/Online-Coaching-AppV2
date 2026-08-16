# Dağıtım (Deployment)

Frontend Vercel'e, AI backend Railway veya Fly.io'ya, veritabanı Supabase'e dağıtılır. Bu doküman her biri için adım adım kılavuz, ortam değişkeni matrisini, dağıtım sonrası kontrol listesini ve geri alma/izleme notlarını içerir. Ortam değişkenlerinin tam listesi ve açıklamaları için [`../README.md#ortam-değişkenleri`](../README.md#ortam-değişkenleri) dosyasına bakın.

## İçindekiler

1. [Frontend → Vercel](#1-frontend--vercel)
2. [Backend → Railway](#2-backend--railway)
3. [Backend → Fly.io](#3-backend--flyio)
4. [Supabase](#4-supabase)
5. [Ortamlar Arası Env Matrisi](#5-ortamlar-arası-env-matrisi)
6. [Dağıtım Sonrası Kontrol Listesi](#6-dağıtım-sonrası-kontrol-listesi)
7. [Geri Alma (Rollback)](#7-geri-alma-rollback)
8. [İzleme ve Loglama](#8-i̇zleme-ve-loglama)

---

## 1. Frontend → Vercel

1. **Projeyi bağlayın:** Vercel Dashboard → _Add New → Project_ → bu GitHub deposunu seçin. Vercel, `package.json`'dan Next.js'i otomatik algılar; ek yapılandırma gerekmez (`next.config.mjs`'deki `output: 'standalone'` Vercel'in kendi build/serve mekanizmasıyla çalışır, Docker/`server.js` yalnızca kendi barındırdığınız ortamlar — Railway/Fly.io/Docker — için gereklidir).
2. **Build komutu:** Varsayılan `next build` (`npm run build`) yeterlidir, override gerekmez.
3. **Ortam değişkenlerini girin:** Vercel Dashboard → _Settings → Environment Variables_. **Production** ve **Preview** ortamlarını ayrı ayrı doldurun:

   | Değişken                        | Production                              | Preview                                                                            |
   | ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`      | Prod Supabase projesi                   | Prod veya ayrı bir staging Supabase projesi                                        |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod anon key                           | Preview projesine karşılık gelen anon key                                          |
   | `SUPABASE_SERVICE_ROLE_KEY`     | Prod service role key                   | Preview/staging service role key                                                   |
   | `AI_BACKEND_URL`                | Prod FastAPI URL'i (ör. Railway/Fly.io) | Staging FastAPI URL'i                                                              |
   | `AI_BACKEND_API_KEY`            | Prod `API_KEY` ile eşleşmeli            | Staging `API_KEY` ile eşleşmeli                                                    |
   | `NEXT_PUBLIC_APP_URL`           | `https://<prod-domain>`                 | Vercel'in ürettiği preview URL'i (bilinmiyorsa prod domain ile aynı bırakılabilir) |

   > **UYARI: `NEXT_PUBLIC_*` ile başlayan tüm değişkenler build-time'da tarayıcı bundle'ına gömülür.** Bir `NEXT_PUBLIC_*` değişkenini değiştirdikten sonra **yeniden deploy etmeden** değişiklik yansımaz (runtime'da okunmaz). `SUPABASE_SERVICE_ROLE_KEY` bu kategoride **DEĞİLDİR** — yalnızca sunucu tarafında (Vercel Serverless/Edge Functions) çalışır, tarayıcıya asla gönderilmez; yine de yanlışlıkla `NEXT_PUBLIC_` öneki eklenmemesine dikkat edin.

4. **Önizleme dağıtımları:** Her PR otomatik bir Preview deployment üretir; Preview ortamı ayrı bir Supabase projesine (veya en azından ayrı bir schema/branch'e) işaret etmesi önerilir ki PR'lardaki test verisi production'ı kirletmesin.

---

## 2. Backend → Railway

1. Railway Dashboard → _New Project → Deploy from GitHub repo_ → bu depoyu seçin, **root/monorepo path olarak `ai_backend` dizinini işaret edin** (Railway monorepo desteğiyle "Root Directory" ayarı).
2. Railway, `ai_backend/Dockerfile`'ı otomatik tespit eder (Dockerfile tabanlı servisler için ek build ayarı gerekmez).
3. **`PORT` ortam değişkeni:** Railway konteynerlere kendi seçtiği `PORT` değerini enjekte eder ve uygulamanın buna bind olmasını bekler. `ai_backend/Dockerfile`'daki `CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]` bu değişkeni doğru şekilde onurlandırır (yoksa `8000`'e düşer), bu yüzden Railway'in enjekte ettiği port otomatik kullanılır — ek yapılandırma gerekmez.
4. **Healthcheck yolu:** Railway servis ayarlarında _Healthcheck Path_ alanına `/health` girin (bkz. `ai_backend/app/core/config.py` ve FastAPI `GET /health` endpoint'i).
5. **Ortam değişkenleri:** Railway Dashboard → _Variables_ → `CORS_ORIGINS` (Vercel prod domain'i, virgülle çoklu origin desteklenir), `API_KEY`, `ENVIRONMENT=production`, `RATE_LIMIT`, `LOG_LEVEL` girin (tam liste için README'deki FastAPI env tablosuna bakın).
6. Deploy sonrası Railway size bir `*.up.railway.app` (veya bağladığınız custom domain) URL'i verir — bunu Vercel'de `AI_BACKEND_URL` olarak ayarlayın.

---

## 3. Backend → Fly.io

1. `fly launch` komutunu **`ai_backend/` dizininde** çalıştırın; mevcut Dockerfile'ı algılar, uygulama adı ve bölge sorar. `fly.toml` dosyasını otomatik oluşturmasına izin verin, ardından aşağıdaki gibi düzenleyin:

   ```toml
   app = "coaching-ai-backend"
   primary_region = "fra"  # bkz. fly.io bölge listesi, kullanıcıya en yakın bölgeyi seçin

   [build]

   [env]
     ENVIRONMENT = "production"

   [http_service]
     internal_port = 8000
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0

     [[http_service.checks]]
       grace_period = "10s"
       interval = "30s"
       method = "GET"
       path = "/health"
       protocol = "http"
       timeout = "5s"
   ```

   Fly.io, Railway'in aksine konteynere bir `$PORT` değeri enjekte etmez; `internal_port = 8000`, `ai_backend/Dockerfile`'ın `ENV` bloğundaki `PORT=8000` varsayılanıyla (dolayısıyla `uvicorn`'un bağlandığı fiili portla) birebir eşleştiği için ek bir ayar gerekmez. `auto_stop_machines`/`auto_start_machines` düşük trafikli ortamlarda maliyeti düşürür (istek gelmeyince makine durur, ilk istekte otomatik uyanır — ilk istek gecikmesi olabilir).

2. **Sırlar (secrets):** `.env` dosyasındaki gizli değerleri `fly secrets set` ile girin (bunlar `fly.toml`'a **yazılmaz**, ayrı şifrelenmiş depoda tutulur):

   ```bash
   fly secrets set API_KEY=<gerçek-anahtar> CORS_ORIGINS=https://<prod-domain>
   ```

3. **Deploy:**

   ```bash
   fly deploy
   ```

4. Deploy sonrası verilen `https://coaching-ai-backend.fly.dev` (veya custom domain) URL'ini Vercel'de `AI_BACKEND_URL` olarak ayarlayın.

---

## 4. Supabase

1. **Proje oluşturma:** [supabase.com/dashboard](https://supabase.com/dashboard) → _New Project_ → bölge seçin (Next.js/FastAPI dağıtım bölgenize yakın olsun, gecikmeyi azaltır) → güçlü bir veritabanı şifresi belirleyin.
2. **CLI ile bağlama:**

   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   ```

3. **Migration'ları uygulama:**

   ```bash
   supabase db push
   ```

   Bu komut yalnızca `supabase/migrations/` altındaki, henüz uzak projeye uygulanmamış dosyaları sırayla çalıştırır (şema, fonksiyon/trigger, RLS politikaları). Storage bucket'ları (`avatars`, `form-checks-media`) da bir migration dosyası (`20260816090300_storage.sql`) içinde tanımlı olduğundan **ayrıca elle bucket oluşturmaya gerek yoktur** — `db push` ile birlikte gelir.

4. **`seed.sql` PRODUCTION'DA ÇALIŞTIRILMAMALIDIR.** `supabase/seed.sql` sabit UUID'li ve herkesçe bilinen bir parola (`Passw0rd!23`) ile `auth.users` tablosuna doğrudan demo kullanıcı yazar; bu dosya **yalnızca yerel geliştirme** içindir. `supabase db push` zaten seed dosyasını çalıştırmaz (bu kasıtlıdır); production ortamına asla `supabase db reset` çalıştırmayın (`db reset` veritabanını **tamamen siler**) ve `seed.sql`'i elle production'a karşı çalıştırmayın.
5. **`auth.enable_signup` ayarı:** Supabase Dashboard → _Authentication → Providers → Email_ (veya `config.toml`'daki `[auth] enable_signup`). Bu platformda yeni danışan hesapları normalde **koç tarafından** (`auth.admin.createUser` ile, service_role kullanılarak) oluşturulur; genel kayıt formunun herkese açık olması istenmiyorsa `enable_signup = false` yapılması önerilir — aksi halde herkes kendi kendine hesap açıp `student` rolüyle sisteme girebilir.

---

## 5. Ortamlar Arası Env Matrisi

| Değişken                        | Local                                                   | Preview (Vercel)                       | Production                                         |
| ------------------------------- | ------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `npx supabase start` çıktısı (`http://127.0.0.1:54321`) | Staging/prod Supabase proje URL'i      | Prod Supabase proje URL'i                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yerel `supabase start` çıktısı                          | Staging/prod anon key                  | Prod anon key                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yerel `supabase start` çıktısı                          | Staging/prod service role key          | Prod service role key (asla `NEXT_PUBLIC_*` değil) |
| `AI_BACKEND_URL`                | `http://localhost:8000`                                 | Staging Railway/Fly.io URL'i           | Prod Railway/Fly.io URL'i                          |
| `AI_BACKEND_API_KEY`            | Boş veya yerel test anahtarı                            | Staging `API_KEY` ile eşleşmeli        | Prod `API_KEY` ile eşleşmeli                       |
| `NEXT_PUBLIC_APP_URL`           | `http://localhost:3000`                                 | Vercel preview URL'i                   | `https://<prod-domain>`                            |
| `NODE_ENV`                      | `development`                                           | `production` (Vercel otomatik ayarlar) | `production`                                       |
| `LOG_LEVEL`                     | `debug` veya `info`                                     | `info`                                 | `info` (gerekirse `warn`)                          |
| `CORS_ORIGINS` (FastAPI)        | `http://localhost:3000`                                 | Vercel preview domain(leri)            | Prod domain                                        |
| `ENVIRONMENT` (FastAPI)         | `development`                                           | `staging`                              | `production`                                       |

---

## 6. Dağıtım Sonrası Kontrol Listesi

- [ ] `GET https://<app-domain>/api/health` 200 dönüyor.
- [ ] `GET https://<ai-backend-domain>/health` ve `/health/ready` 200 dönüyor.
- [ ] Tarayıcı geliştirici konsolunda CSP ihlali (`Content-Security-Policy` uyarısı/hatası) **yok**.
- [ ] **RLS testi:** iki farklı danışan hesabıyla giriş yapıp, ikinci kullanıcının API/Supabase sorgularıyla birincinin `form_checks`/`daily_logs`/`messages` verisine erişemediğini doğrulayın (boş sonuç veya `42501`/RLS reddi bekleniyor).
- [ ] **Rate limit doğrulaması:** `/api/ai/workout` gibi bir uca kısa sürede 20'den fazla istek atıp `429 RATE_LIMIT_EXCEEDED` yanıtının döndüğünü doğrulayın.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY` istemci bundle'ında YOK:** production build çıktısında arayın —

  ```bash
  # Vercel build'i lokalde simüle etmek için:
  npm run build
  grep -r "SUPABASE_SERVICE_ROLE_KEY" .next/static .next/standalone 2>/dev/null
  # Windows PowerShell:
  Get-ChildItem -Recurse .next\static, .next\standalone | Select-String "SUPABASE_SERVICE_ROLE_KEY"
  ```

  Herhangi bir eşleşme çıkması **kritik bir sızıntı** demektir — build'i yayınlamayın, hemen anahtarı Supabase Dashboard'dan rotate edin ve sızıntının kaynağını (muhtemelen `'use client'` bir dosyadan `src/lib/supabase/admin.ts` import edilmesi) düzeltin.

- [ ] `program_approvals` onay akışı uçtan uca test edildi (danışan öner → koç onaylar → `profiles.workout_plan`/`nutrition_plan` güncellenir → bildirim düşer).
- [ ] Supabase Dashboard → _Auth → Users_ içinde `seed.sql` demo kullanıcılarının (`coach@example.com` vb.) production projesinde **bulunmadığı** doğrulandı.

---

## 7. Geri Alma (Rollback)

- **Vercel:** _Deployments_ sekmesinden önceki başarılı deployment'ı bulup _Promote to Production_ ile anında geri dönülebilir (yeniden build gerekmez, önceki immutable build çıktısı yeniden trafiğe alınır).
- **Railway / Fly.io:** Her ikisi de önceki başarılı deploy'a dönme desteği sunar (Railway: _Deployments_ → _Redeploy_ önceki commit; Fly.io: `fly releases` ile geçmiş release'leri listeleyip `fly deploy --image <önceki-image>` veya `fly releases rollback` kullanılabilir).
- **Supabase migration'ları geri almak** otomatik değildir — Supabase CLI "down" migration üretmez. Bir migration'ı geri almak için **elle tersini yazan yeni bir migration dosyası** oluşturup `supabase db push` ile uygulamanız gerekir (ör. eklenen bir sütunu `ALTER TABLE ... DROP COLUMN` ile kaldıran yeni bir migration). Bu nedenle production'a migration uygulamadan önce mümkünse önce bir staging projesinde test edilmesi önerilir.
- Frontend ve backend'i **birlikte** geri almayı unutmayın: API sözleşmesi (`/analyze/*` istek/yanıt şeması) değiştiyse, yalnızca birini geri almak uyumsuzluğa yol açabilir.

---

## 8. İzleme ve Loglama

- **Frontend:** `pino` yapılandırılmış JSON log üretir (`LOG_LEVEL` ile kontrol edilir); Vercel'de bu loglar _Deployments → Logs_ / _Runtime Logs_ altında görünür. Her AI proxy isteği `X-Request-ID` ile loglanır — bir kullanıcı hatası bildirdiğinde, yanıtta dönen `request_id`'yi isteyip Vercel loglarında aratmak sorunu hızlıca lokalize eder.
- **Backend:** `structlog` (`LOG_JSON=true` production'da) JSON log üretir; Railway/Fly.io'nun kendi log görüntüleyicisinden (`fly logs`, Railway _Deployments → Logs_) izlenebilir. Aynı `X-Request-ID` FastAPI loglarında da görünür — uçtan uca korelasyon buradan sağlanır.
- **Healthcheck izleme:** Hem `web` (`Dockerfile` `HEALTHCHECK`, `/api/health`) hem `ai-backend` (`/health`) periyodik healthcheck'e sahiptir; Railway/Fly.io/Docker bu uçları kullanarak sağlıksız instance'ları otomatik yeniden başlatır. Harici bir uptime monitörü (ör. UptimeRobot, Better Uptime) bu iki uca eklenerek dış gözlemlenebilirlik sağlanması önerilir — bu entegrasyon şu an kod tabanına dahil **değildir**.
- **Hata izleme (APM/error tracking):** Kod tabanında şu an ayrı bir hata izleme servisi (Sentry vb.) entegrasyonu **yoktur**; mevcut gözlemlenebilirlik yalnızca yapılandırılmış loglara dayanır. İleride eklenmesi isteniyorsa hem Next.js (`instrumentation.ts`) hem FastAPI (Sentry SDK middleware) tarafında ayrı entegrasyon gerekir.
