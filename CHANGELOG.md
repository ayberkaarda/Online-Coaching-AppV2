# Changelog

Bu dosya, projedeki önemli değişiklikleri belgeler. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esas alınarak hazırlanmıştır ve bu proje [Semantic Versioning](https://semver.org/lang/tr/) kurallarına uyar.

## [Unreleased]

_Şu an yayınlanmamış, üzerinde çalışılan değişiklik yok._

## [1.0.0] - 2026-08-16

Bu sürüm, projenin düz JavaScript/tek-dosya AI script'i tabanlı ilk halinden; TypeScript strict, katmanlı FastAPI servisi, Supabase RLS ve tam bir test/CI altyapısına sahip production-ready mimariye geçişini kapsar.

### Eklendi

- TypeScript strict migrasyonu (`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`/`noUnusedParameters`).
- Supabase migration'ları (`supabase/migrations/`): şema, `is_admin`/`profile_role`/`increment_streak` fonksiyonları ve trigger'lar, RLS politikaları, storage bucket politikaları.
- FastAPI servis mimarisi (`ai_backend/app/`: `core/`, `routers/`, `services/`, `schemas/`) ve yeni `/recommendations` deterministik öneri motoru.
- TanStack Query tabanlı istemci veri katmanı (`src/hooks/`, `src/lib/query/`).
- zod + react-hook-form ile form ve girdi doğrulaması.
- `sonner` ile toast bildirimleri.
- Skeleton, `ErrorBoundary`, `QueryState`, `EmptyState` ortak UI bileşenleri (`src/components/ui/`).
- Vitest + React Testing Library birim/bileşen testleri.
- pytest (backend) test paketi.
- Playwright E2E test altyapısı.
- Docker ve `docker-compose.yml` (web + ai-backend + opsiyonel minimal Postgres).
- GitHub Actions CI (`.github/workflows/ci.yml`: frontend, backend, e2e, docker, required-checks job'ları).
- Dependabot bağımlılık güncelleme otomasyonu.
- `.env.example` + zod ile runtime ortam değişkeni doğrulaması (`src/env.ts`).
- Yapılandırılmış loglama: frontend'de `pino`, backend'de `structlog`; her istekte `X-Request-ID` ile uçtan uca izlenebilirlik.
- FastAPI için otomatik OpenAPI dokümantasyonu (`/docs`, `/redoc`, `/openapi.json`).
- Erişilebilirlik iyileştirmeleri: ARIA etiketleri, klavye navigasyonu, `prefers-reduced-motion` desteği.

### Değiştirildi

- AI çağrıları artık tarayıcıdan doğrudan değil, Next.js sunucu tarafı proxy'si (`/api/ai/*`) üzerinden yapılıyor.
- Veri çekme mantığı bileşenlerden merkezi TanStack Query hook'larına (`src/hooks/`) taşındı.
- Kullanıcıya geri bildirim `alert()` yerine `sonner` toast ile veriliyor.
- `src/app/*.csv` kaynak dosyaları `data/` dizinine taşındı.

### Düzeltildi

- Bildirimlerin görünmemesi: `sendNotificationAction` var olmayan `target_student_id` sütununa yazıyordu, şemadaki gerçek sütun `student_id`.
- Program onay bildiriminin koç yerine öğrencinin kendisine gitmesi.
- Duyuru (`AnnouncementsTab`) başlığının hiç render edilmemesi.
- Çakışan iki Tailwind config dosyası.
- Tanımsız `animate-fadeIn` ve `custom-scrollbar` CSS sınıfları.
- Drawer/panel kapanmadığında `body` scroll kilidinin kalıcı olarak açık kalması.
- Program editörünün React state yerine `document.getElementById` ile DOM'dan okuma yapması.

### Güvenlik

- CSP, HSTS, `X-Frame-Options` başlıkları (`next.config.mjs`).
- FastAPI CORS yapılandırmasının `["*"]` + credentials yerine açık bir origin izin listesine (`CORS_ORIGINS`) alınması.
- Next.js middleware (`/api/*`) ve FastAPI (`slowapi`) tarafında rate limiting.
- `SUPABASE_SERVICE_ROLE_KEY`'in `server-only` paketiyle istemci bundle'ından ayrılması (`src/lib/supabase/admin.ts`).
- Hata yanıtlarında stack trace/upstream detay sızıntısının engellenmesi (AI proxy hata maskeleme).
- Row Level Security ile satır düzeyinde veri izolasyonu.
- Admin server action'larında (danışan oluşturma vb.) çağıranın gerçekten koç olduğunun doğrulanması.

### Kaldırıldı

- `jsconfig.json`.
- Çift Tailwind config dosyası.
- `src/app/clean.js` (yerine `scripts/clean-foods.mjs`).
- `src/lib/supabase.js` ve `src/lib/helpers.js` (yerine `src/lib/supabase/*` ve `src/lib/utils.ts`).
- `src/components/ThemeProvider.js`.
