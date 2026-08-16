# Coaching AI Backend

Koçluk platformu için antrenman planı, beslenme planı ve deterministik öneri
motoru üreten production-ready FastAPI servisi.

Bu servis, eski tek-dosyalık `main.py` script'inin (egzersiz kütüphanesi,
split mantığı, BMR/TDEE hesabı, makro dağılımı ve gramaj yuvarlama dahil aynı
iş mantığı korunarak) katmanlı bir FastAPI uygulamasına dönüştürülmüş halidir.

## Kurulum

```powershell
cd ai_backend
uv sync --all-extras --dev
```

Bağımlılıklar `uv.lock` (repoya dahil) üzerinden kilitlenmiştir; `uv sync`
tekrarlanabilir (reproducible) bir kurulum yapar. `.python-version` `3.12`'yi
işaret eder — sistemde uygun bir Python yoksa `uv` bunu otomatik indirir.

## Çalıştırma

```powershell
uv run uvicorn app.main:app --reload
```

Servis varsayılan olarak `http://localhost:8000` üzerinde ayağa kalkar.
İnteraktif API dokümantasyonu için `http://localhost:8000/docs` (Swagger UI)
veya `http://localhost:8000/redoc` (ReDoc) adreslerini ziyaret edin.
Ham OpenAPI şeması `http://localhost:8000/openapi.json` adresindedir.

## Test

```powershell
uv run pytest
```

Kapsam raporu (`--cov=app --cov-report=term-missing`) otomatik olarak
`pyproject.toml` içindeki `[tool.pytest.ini_options]` ayarlarıyla çalışır;
minimum kapsam eşiği %70'tir. Son doğrulamada: **63 test geçti, kapsam %92.42**.

## Lint, Format & Tip Kontrolü

```powershell
uv run ruff check .
uv run ruff format --check .
uv run mypy app
```

Üçü de temiz (0 hata) durumdadır. `ruff` ayarları (`pyproject.toml`):
satır uzunluğu 120 (Türkçe kullanıcı mesajları 100'ü sıkça aşıyor) ve
`RUF001`/`RUF002`/`RUF003` (ambiguous unicode) kuralları kapalı — bu proje
Türkçe docstring/comment/string içeriyor ve bu kurallar Türkçe karakterler
(`ı`, `ş`, `ğ`, ...) için sürekli yanlış pozitif üretiyordu.

## Endpoint'ler

| Metod | Yol | Açıklama | Durum |
|---|---|---|---|
| `POST` | `/analyze/workout` | Split tipi, hedef, yaş ve prompt'a göre haftalık antrenman planı üretir. | Güncel |
| `POST` | `/analyze/nutrition` | Antropometrik veriler ve hedefe göre kalori/makro hedefi + haftalık diyet planı üretir. | Güncel |
| `POST` | `/recommendations` | Geçmiş kilo/makro/uyum verilerine göre deterministik, kural-tabanlı öneriler üretir. | Güncel |
| `GET` | `/health` | Liveness kontrolü (`status`, `version`, `uptime_seconds`). | Güncel |
| `GET` | `/health/ready` | Readiness kontrolü. | Güncel |
| `POST` | `/api/generate-ai-workout` | Eski antrenman üretim endpoint'i; `/analyze/workout` ile aynı mantığı çalıştırır. | **Deprecated** |
| `POST` | `/api/generate-ai-diet` | Eski diyet üretim endpoint'i; `/analyze/nutrition` ile aynı mantığı çalıştırır. | **Deprecated** |

Deprecated endpoint'ler geriye dönük uyumluluk için korunmuştur ve OpenAPI
şemasında `deprecated: true` olarak işaretlenmiştir; yeni entegrasyonlar
`/analyze/*` yollarını kullanmalıdır.

## Ortam Değişkenleri

Tüm ayarlar `.env` dosyasından veya ortam değişkenlerinden okunur (bkz.
`app/core/config.py`). Değişken adları büyük/küçük harfe duyarsızdır.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `APP_NAME` | `Coaching AI Backend` | Uygulama adı (OpenAPI başlığı). |
| `VERSION` | `1.0.0` | Uygulama sürümü. |
| `ENVIRONMENT` | `development` | `development` \| `staging` \| `production`. Production'da hata mesajları generic'e döner. |
| `CORS_ORIGINS` | `http://localhost:3000` | Virgülle ayrılmış izinli origin listesi. |
| `API_KEY` | *(boş)* | Ayarlanırsa `/analyze/*` ve `/recommendations` için `X-API-Key` header'ı zorunlu olur. |
| `RATE_LIMIT` | `60/minute` | Genel (varsayılan) istek sınırı. `/analyze/*` ve `/recommendations` ayrıca `20/minute` ile sınırlıdır; `/health*` muaftır. |
| `LOG_LEVEL` | `INFO` | Log seviyesi. |
| `LOG_JSON` | `true` | `true` ise production'da JSON log, `false` ise geliştirme konsol formatı. |
| `DATA_DIR` | `ai_backend/data` | CSV veri dosyalarının okunacağı/yazılacağı dizin. |

## Docker

```powershell
docker build -t coaching-ai-backend ./ai_backend
docker run --rm -p 8000:8000 -e ENVIRONMENT=production coaching-ai-backend
```

Multi-stage build (`python:3.12-slim`), non-root kullanıcı (`appuser`, uid
1001) ve `/health` üzerinden `HEALTHCHECK` içerir. Builder aşaması `uv sync
--frozen --no-dev` ile `uv.lock`'a göre tekrarlanabilir kurulum yapar (fallback
yoktur — `uv.lock` repoya dahildir). Build ve `docker run` ile `/health` /
`/health/ready` uçları manuel olarak doğrulanmıştır.

## CSV Temizleme CLI

`src/app/clean.js` (Node.js) betiğinin Python karşılığı:

```powershell
uv run python -m app.services.csv_loader --input raw_foods.csv --output data/clean_foods.csv --kind food
uv run python -m app.services.csv_loader --input raw_exercises.csv --output data/clean_exercises_v2.csv --kind exercise
```
