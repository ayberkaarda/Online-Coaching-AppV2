# Changelog

Bu dosya, projedeki önemli değişiklikleri belgeler. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esas alınarak hazırlanmıştır ve bu proje [Semantic Versioning](https://semver.org/lang/tr/) kurallarına uyar.

## [Unreleased]

### Eklendi

- **Faz 4.6 — Güvenlik Tamamlama (tamamen kapandı):** KVKK/GDPR "unutulma hakkı" hesap silme akışı (ADR-0025) — danışan kendi hesabını kalıcı olarak silebiliyor: auth kullanıcısı + 14 ilişkili tablo + storage nesneleri, idempotent, `service_role` ile sunucu tarafında (`SECURITY DEFINER` `delete_account()`/`account_deletion_manifest()`, fail-closed — storage'da nesne kalırsa hiçbir şey silinmez), denetim kaydında kişisel veri yok.
- AI uçlarına (antrenman/beslenme/öneri) kullanıcı başına günlük kota — aşımda Türkçe mesajlı 429 + `Retry-After`; eşzamanlı isteklerde kotanın yarışla aşılamadığı testle kanıtlandı.
- Mesaj eklerinde (`message-attachments`) sunucu tarafı magic-byte doğrulaması: `POST /api/attachments/verify` ilk 32 baytı okuyup uyuşmazsa nesneyi siler; asıl kapı veritabanında — `messages` üzerindeki `AFTER INSERT` tetikleyicisi yalnızca sunucunun yazdığı, TOCTOU'ya kapalı eTag damgası varsa ek içeren satırı kabul ediyor. Magic-byte doğrulaması istemci ve sunucu arasında tek kaynağa (`packages/api-client/src/upload-validation.ts`) taşındı.
- İndirilebilir imzalı adresler için `createSignedDownloadUrl` — yalnızca "İndir" bağlantılarında `Content-Disposition: attachment` üretiyor; `<img src>` gösterimleri (`createSignedUrl`) inline kalmaya devam ediyor.
- **Faz 4.5 — Monorepo ve Mobil Temel (tamamen kapandı):** pnpm workspaces + Turborepo 2.10.11 tabanlı monorepo yerleşimi — `apps/web`, `apps/mobile` ve dört paylaşılan paket (`packages/config`, `packages/types`, `packages/api-client`, `packages/logger`). Mobil çalışma zamanı Android emülatöründe (Pixel 8 AVD, Expo Go SDK 57.0.0) doğrulandı: temiz bundle, beş sekmede gezinme, çift-React "invalid hook call" yok — iOS Expo Go yolu App Store'daki SDK 54 kilidi yüzünden kullanılamadı.
- `apps/mobile`: Expo SDK 57 (React Native 0.86.2, React 19.2.4) iskeleti — `expo-router` ile 5 sekmeli tab navigasyonu (Panel · Antrenman · Beslenme · İlerleme · Sohbet) ve placeholder auth ekranı.
- Ayrı, paralel `mobile` CI job'u (`tsc`, lint, `expo-doctor`, `expo export` smoke).
- `scripts/backup-hosted.mjs` + `docs/ops/hosted-backup.md`: hosted Supabase yedekleme script'i (varsayılan dry-run) ve yordamı (restore dahil).
- `packages/api-client`'a `Notifier`/`NotifierProvider`/`useNotifier()` bildirim soyutlaması.

### Değiştirildi

- Paket yöneticisi npm'den **pnpm**'e geçti; kök `package.json` `packageManager: "pnpm@10.34.5"`.
- `src/types` ve `src/lib/validation/schemas.ts` → `packages/types`; `db:types` üretim yolu `packages/types/src/database.ts` oldu.
- Supabase istemcisi ve ilgili veri katmanı (`src/lib/api`, `src/hooks`) `packages/api-client`'a taşındı; istemci artık React Context (`SupabaseClientProvider`/`useSupabaseClient()`) ile enjekte ediliyor, modül düzeyi singleton kaldırıldı.
- Yapılandırılmış loglama `packages/logger`'a çıkarıldı.
- Paylaşılan tsconfig/eslint yapılandırmaları `packages/config`'e taşındı.
- Runtime Node 20 → **Node 24 LTS**'e ("Krypton") hizalandı (Node 20 bakım süresi dolmuştu); TypeScript tek majöre (**6.0.3**) tekleştirildi (`apps/web` `^5.7.2` → `~6.0.3`).
- `.github/workflows/ci.yml` kapı komutları `turbo run <görev>` eşdeğerlerine geçti; `pnpm/action-setup`, `actions/checkout`, `actions/setup-node`, `docker/build-push-action`, `actions/upload-artifact`, `supabase/setup-cli`, `astral-sh/setup-uv` sürümleri güncellendi.
- `.github/dependabot.yml` monorepo yerleşimine taşındı (`/`, `/apps/web`, `/apps/mobile`, `/packages/*`).
- `packages/api-client` bildirim katmanı `sonner`'dan bağımsızlaştı: 13 hook `notify.*`'a geçti, web tarafında `sonner` implementasyonuyla enjekte ediliyor; paket artık platform-nötr.
- Coverage eşiği (`lines`/`statements`) 52 → 60'a geri çıkarıldı; `MessagesTab`/`FormCheckTab` için 29 yeni davranış testi.
- Koç program onayı (`useApproveProgram`) tek bir Postgres fonksiyonuna (`approve_program`, `SECURITY INVOKER`) indirgendi; önceki üç atomik olmayan çağrı kaldırıldı.
- Cookie tabanlı oturuma geçişten kalan eski `sb-*-auth-token` `localStorage` artıkları mount'ta bir kez temizleniyor.
- AI antrenman üretimi artık sabit `age: 20, goal: 'bulk', weight: 75` göndermiyor; `NutritionTab` deseniyle form üzerinden alınıyor, kilo son ölçümden ön dolduruluyor.
- E2E `plans.spec.ts` artık akışın sonunda kendi `pending` onay fikstürünü üretiyor; `seed.sql` demo verisi E2E koşularıyla tükenmiyor.

### Düzeltildi

- CI `security` job'u: `@typescript-eslint/parser`'ın `packages/config`'te yanlışlıkla `dependencies` altında tutulması, `pnpm audit --prod`'un eslint zafiyetlerini production grafiğinde görmesine neden oluyordu; `devDependencies`'e taşındı.
- CI `e2e` job'u: Playwright tarayıcı kurulumunun apt aynası yavaşlığı yüzünden zaman aşımına uğraması — tarayıcı önbelleklemesi eklendi, `timeout-minutes` 20 → 30.
- `docker/setup-buildx-action` v3 → v4 (Node 20 deprecation uyarısı gideriliyor).

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
