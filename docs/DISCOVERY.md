# Keşif Envanteri — Mevcut Durum

**Tarih:** 2026-08-16
**Üretim gerekçesi:** Bu doküman `active_planprogram.md` §0.1 ("Keşif önce gelir — hiçbir kod
yazmadan önce tüm repo'yu tara, mevcut şemayı/route'ları/component'leri çıkar ve
`docs/DISCOVERY.md` dosyasına mevcut durumun envanterini yaz") gereği üretilmiştir.
Plan revizyonunun (v1.1) ve Faz 1'in dayanağıdır.

**Doğrulama disiplini:** Buradaki her sayısal iddia ya dosya sisteminden ya canlı yerel
veritabanından (`postgresql://postgres@127.0.0.1:54322/postgres`, konteyner
`supabase_db_my-coaching-app`) ya da gerçekten çalıştırılan bir komuttan alınmıştır.
Doğrulanamayan noktalar açıkça **doğrulanmadı** olarak işaretlenmiştir.

**Bu oturumda çalıştırılan doğrulama komutları:** `information_schema.columns`,
`pg_constraint`, `pg_indexes`, `pg_type`+`pg_enum`, `pg_policies`, `pg_class.relrowsecurity`,
`pg_proc`, `pg_trigger`, `storage.buckets`, `pg_extension`,
`information_schema.role_table_grants`, satır sayımları, `set local role` ile 13 adet RLS
izolasyon testi; `npx vitest run`; `npx playwright test --list`;
`pytest --collect-only`; `git status`/`git log`.

---

## 1. Depo topolojisi

Tek repo (monorepo **değil**). Kök dizinde Next.js uygulaması, yanında bağımsız bir Python
servisi ve Supabase yerel yığını yer alır.

```
my-coaching-appv2/
├── .github/            CI workflow + dependabot
├── ai_backend/         FastAPI AI servisi (bağımsız Python projesi, uv ile yönetilir)
│   ├── app/
│   │   ├── core/       config, logging, errors, rate_limit, security
│   │   ├── data/       hard-coded besin/egzersiz sabitleri
│   │   ├── routers/    HTTP uçları
│   │   ├── schemas/    Pydantic v2 istek/yanıt modelleri
│   │   └── services/   saf iş mantığı (hesaplama/üretim motorları)
│   ├── data/           boş (yalnız .gitkeep) — çalışma zamanında okunmuyor
│   └── tests/          pytest paketi
├── data/               ham + temizlenmiş CSV veri setleri (uygulamaya import EDİLMİYOR)
├── docs/               ARCHITECTURE, DEPLOYMENT, PROGRESS (+ bu dosya)
├── public/             statik varlıklar + next-pwa üretimi sw.js/workbox (gitignore'lu)
├── scripts/            tek seferlik veri temizleme aracı (Node)
├── src/
│   ├── app/            Next.js App Router: sayfalar, API route'ları, server actions
│   │   └── api/        AI proxy route'ları + health
│   ├── components/     React bileşenleri
│   │   ├── tabs/       panel sekmeleri
│   │   └── ui/         durum/iskelet primitifleri
│   ├── hooks/          TanStack Query veri hook'ları (tüm Supabase erişimi burada)
│   ├── lib/            api / query / supabase / validation / logger / rate-limit / utils
│   └── types/          üretilmiş DB tipleri + domain tipleri
├── supabase/           config.toml, 4 migration, seed.sql
└── tests/              unit (Vitest) + e2e (Playwright)
```

| Dizin                                      | Sorumluluk                                                            | Dosya sayısı |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------ |
| (kök)                                      | Yapılandırma dosyaları ve üst düzey dokümanlar                        | 32           |
| `.github/`                                 | CI iş akışı ve dependabot yapılandırması                              | 2            |
| `ai_backend/` (`.venv` ve cache'ler hariç) | FastAPI AI servisi, testleri, paket/Docker tanımları                  | 44           |
| `ai_backend/app/`                          | Servis kodu (core 6, routers 5, schemas 5, services 6, data 4, kök 2) | 28           |
| `ai_backend/tests/`                        | pytest test paketi (conftest + `__init__` dahil)                      | 9            |
| `data/`                                    | CSV veri setleri + README (`exercises.csv` tek başına 8,7 MB)         | 6            |
| `docs/`                                    | Mimari, dağıtım ve ilerleme dokümanları (bu dosya hariç)              | 3            |
| `public/`                                  | Statik SVG'ler + üretilmiş service worker dosyaları                   | 7            |
| `scripts/`                                 | `clean-foods.mjs` — Kaggle veri setini sadeleştiren CLI               | 1            |
| `src/`                                     | Next.js uygulama kaynağı (toplam)                                     | 65           |
| `src/app/`                                 | Rotalar, layout/hata/yükleme dosyaları, server actions                | 17           |
| `src/app/api/`                             | Route handler'lar (3 AI proxy + 1 health)                             | 4            |
| `src/components/`                          | Bileşenler (toplam, alt dizinler dahil)                               | 16           |
| `src/components/tabs/`                     | Panel sekmeleri                                                       | 7            |
| `src/components/ui/`                       | UI primitifleri + barrel                                              | 5            |
| `src/hooks/`                               | Veri hook'ları + barrel                                               | 12           |
| `src/lib/`                                 | Altyapı katmanı (api 5, query 2, supabase 4, validation 1, kök 3)     | 15           |
| `src/types/`                               | `database.ts`, `domain.ts`, barrel                                    | 3            |
| `supabase/`                                | Yerel yığın yapılandırması, migration'lar, seed                       | 7            |
| `supabase/migrations/`                     | 4 migration dosyası (şema, fonksiyonlar, RLS, storage)                | 4            |
| `tests/`                                   | Test paketleri (toplam)                                               | 22           |
| `tests/unit/`                              | Vitest birim + bileşen testleri (`test-utils.tsx` dahil)              | 17           |
| `tests/e2e/`                               | Playwright senaryoları + fixtures + README                            | 5            |

Hariç tutulanlar: `node_modules`, `.next`, `.git`, `ai_backend/.venv`, `__pycache__`,
`.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `test-results`, `supabase/.temp`,
`supabase/.branches`.

**Git durumu (2026-08-16):** dal `main`, HEAD `f4390b6`. Çalışma ağacında 5 girdi var; bunlardan
biri `README.md` üzerinde **çözülmemiş birleştirme çakışması** (`UU`) olarak duruyor. Repo,
JS→TS yükseltmesinin commit'lendiği bir noktada; eski `.js` dosyaları silinmiş, `.ts`/`.tsx`
karşılıkları eklenmiş durumda.

---

## 2. Frontend rotaları

### 2.1 Sayfalar

Tüm sayfalar `'use client'` ile işaretlidir; veri çekimi istemcide TanStack Query ile yapılır.
Hiçbiri `cookies()`/`headers()` gibi dinamik sunucu API'si kullanmadığı için Next.js bunları
statik kabuk olarak ön-render eder. (Bu satırlar dosya sisteminden çıkarılmıştır; `npm run build`
rota çıktısıyla karşılaştırma **yapılmadı** — talimat gereği build çalıştırılmadı.)

| Rota       | Dosya                      | Tip                            | Erişim                                                                                   | Ne yapar                                                                                                                                                      |
| ---------- | -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`        | `src/app/page.tsx`         | İstemci bileşeni, statik kabuk | Oturum gerekli (oturum yoksa `router.replace('/login')`)                                 | Ana panel. Rolü `useProfile` ile okur; öğrenciye bildirim zili + "Profilim", koça "Kullanıcı Yönetimi" ve `NotificationForm` gösterir. Gövde `DashboardTabs`. |
| `/login`   | `src/app/login/page.tsx`   | İstemci bileşeni, statik kabuk | Herkese açık                                                                             | react-hook-form + `loginSchema` ile Supabase `signInWithPassword`. Başarıda `/`'a yönlendirir.                                                                |
| `/profile` | `src/app/profile/page.tsx` | İstemci bileşeni, statik kabuk | Oturum gerekli                                                                           | Avatar yükleme, şifre değiştirme, atanmış beslenme/antrenman programını gün gün gösterme.                                                                     |
| `/users`   | `src/app/users/page.tsx`   | İstemci bileşeni, statik kabuk | Admin (koç). İstemci tarafında rol kontrolü + `/`'a yönlendirme; **gerçek yetki RLS'te** | `AdminUserManagement` bileşenini `QueryState` sarmalayıcısıyla render eder.                                                                                   |

### 2.2 Özel App Router dosyaları

| Dosya                      | Rol                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/layout.tsx`       | Kök layout: `<html lang="tr">`, "İçeriğe geç" skip link, `Providers`, metadata + viewport (tema rengi).                                  |
| `src/app/providers.tsx`    | `QueryClientProvider`, `next-themes` `ThemeProvider`, `ErrorBoundary`, `sonner` `Toaster`, dev'de React Query Devtools (dinamik import). |
| `src/app/error.tsx`        | Route segment hata sınırı; ham hata mesajı yalnızca development'ta gösterilir.                                                           |
| `src/app/global-error.tsx` | Kök layout çökerse devreye giren en dış sınır; kendi `<html>/<body>`'sini üretir, `@/lib/logger`'ı bilerek import etmez.                 |
| `src/app/loading.tsx`      | Genel iskelet ekranı.                                                                                                                    |
| `src/app/not-found.tsx`    | 404 sayfası.                                                                                                                             |
| `src/app/globals.css`      | Tailwind katmanları + global stiller.                                                                                                    |

### 2.3 API route handler'ları

| Method | Yol                       | Dosya                                     | Girdi doğrulama              | Upstream                              |
| ------ | ------------------------- | ----------------------------------------- | ---------------------------- | ------------------------------------- |
| POST   | `/api/ai/workout`         | `src/app/api/ai/workout/route.ts`         | `aiWorkoutSchema` (zod)      | `${AI_BACKEND_URL}/analyze/workout`   |
| POST   | `/api/ai/nutrition`       | `src/app/api/ai/nutrition/route.ts`       | `aiDietSchema` (zod)         | `${AI_BACKEND_URL}/analyze/nutrition` |
| POST   | `/api/ai/recommendations` | `src/app/api/ai/recommendations/route.ts` | `recommendationSchema` (zod) | `${AI_BACKEND_URL}/recommendations`   |
| GET    | `/api/health`             | `src/app/api/health/route.ts`             | Yok (gövdesiz)               | Yok                                   |

Üçü de `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Üç AI route'u da gövdesini
`handleAiProxy` (`src/lib/api/proxy.ts`) ortak iskeletine devreder: JSON parse hatası → 400
`INVALID_JSON`; zod hatası → 422 `VALIDATION_ERROR` (+ alan bazlı `details`); upstream'e
ulaşılamazsa → 503 `AI_BACKEND_UNAVAILABLE`; upstream hata/geçersiz JSON → 502
`AI_BACKEND_ERROR` (upstream gövdesi **istemciye sızdırılmaz**, yalnızca loglanır). Her yanıtta
`X-Request-ID` ve `Cache-Control: no-store` başlıkları vardır. `AI_BACKEND_API_KEY` tanımlıysa
upstream'e `X-API-Key` olarak gönderilir.

**Kimlik doğrulama notu:** AI proxy route'larında **oturum kontrolü yoktur**. Kimliği doğrulanmamış
herhangi bir istemci `/api/ai/*` uçlarını çağırabilir; tek koruma `src/middleware.ts`'teki
IP bazlı hız sınırıdır. `active_planprogram.md` §5.3 "auth zorunlu, kullanıcı kimliği server'da
JWT'den alınır" diyor — bu **karşılanmıyor** (bkz. §14).

### 2.4 Middleware

`src/middleware.ts`, `matcher: ['/api/:path*']` ile tüm API isteklerine uygulanır.
`/api/health` muaftır. `/api/ai/*` için sabit 20 istek/dakika; diğer API yolları için
`RATE_LIMIT_MAX_REQUESTS`/`RATE_LIMIT_WINDOW_MS` (varsayılan 60/60 sn). Anahtar `${ip}:${pathname}`;
IP `x-forwarded-for` → `x-real-ip` → `'unknown'` sırasıyla belirlenir. Limit aşımında 429 +
`Retry-After`; her yanıta `X-RateLimit-Limit/Remaining/Reset` eklenir.

### 2.5 Server Actions (`src/app/actions.ts`)

| Action                                               | Yetki                 | Doğrulama                               | Not                                                                                            |
| ---------------------------------------------------- | --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `createStudentAction(actorAccessToken, formData)`    | admin                 | `createStudentSchema`                   | `auth.admin.createUser` + `profiles` upsert; profil yazımı başarısızsa auth kaydını geri alır. |
| `deleteStudentAction(actorAccessToken, studentId)`   | admin                 | `z.string().uuid()`                     | `auth.admin.deleteUser`.                                                                       |
| `sendNotificationAction(actorAccessToken, formData)` | admin                 | `notificationSchema`                    | `target='all'` ise tüm `role='student'` profillere yazar.                                      |
| `submitFormCheckAction(actorAccessToken, input)`     | Kendi kaydı (öğrenci) | `formCheckSchema` + uuid/url uzantıları | Servis rolü yerine çağıranın token'ıyla, RLS altında yazar.                                    |

Yetkilendirme deseni: ilk argüman `actorAccessToken`; `verifyActor()` token'ı çağıranın kendi RLS
bağlamında doğrular ve gerekiyorsa `profiles.role === 'admin'` kontrolü yapar.

**Tespit:** Bu dört action **kod tabanında hiçbir yerden çağrılmıyor** (grep ile doğrulandı —
`src/` ve `tests/` altında `@/app/actions` importu yok). Dosyanın kendi başlık yorumu da bunu
kabul ediyor. Fiilen ölü kod; mevcut UI aynı işleri `src/hooks/*` üzerinden doğrudan
supabase-js ile yapıyor.

---

## 3. Bileşen envanteri

`src/components/` altında 15 `.tsx` + 1 barrel (`ui/index.ts`).

| Bileşen                                                                      | Dosya                                            | Props                                                                                              | Kullandığı hook'lar                                                                                                                                                                                             | Sorumluluk                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminUserManagement`                                                        | `components/AdminUserManagement.tsx` (641 satır) | `students: Profile[]`                                                                              | `useDailyLogs`, `useFormChecks`, `useLastCheckins`, `useSendNotification`, `useUpdateProfile`, `useState/useEffect/useMemo/useCallback`                                                                         | Koç paneli öğrenci portföyü: kart listesi + detay çekmecesi (kilo trendi, makro grafiği, öncesi/sonrası kıyaslama, program editörleri). Grafikler **recharts** ile. |
| `DashboardTabs`                                                              | `components/DashboardTabs.tsx` (470)             | `currentUserId`, `userRole`, `students`                                                            | `useProfile`, `useNotifications`, `useState/useRef`                                                                                                                                                             | Sekme kabuğu (7 sekme), koç için öğrenci arama/seçme/sayfalama (5/sayfa), öğrenci için streak başlığı, `html2canvas` ile görsel dışa aktarım (dinamik import).      |
| `NotificationForm`                                                           | `components/NotificationForm.tsx` (155)          | `students: Profile[]`                                                                              | `useSendNotification` (+ react-hook-form)                                                                                                                                                                       | Koçun tek öğrenciye veya tümüne duyuru göndermesi; `notificationSchema` ile doğrulama.                                                                              |
| `ThemeToggle`                                                                | `components/ThemeToggle.tsx` (54)                | Yok                                                                                                | `useTheme` (next-themes), `useSyncExternalStore`                                                                                                                                                                | Açık/koyu tema anahtarı; hidrasyon uyuşmazlığını `useSyncExternalStore` ile önler.                                                                                  |
| `AnnouncementsTab`                                                           | `components/tabs/AnnouncementsTab.tsx` (74)      | `announcements`, `userRole`, `selectedStudentIds`                                                  | (veri prop ile gelir; tipi `useNotifications` çıktısı)                                                                                                                                                          | Son 30 günün duyuru listesi.                                                                                                                                        |
| `DailyLogTab`                                                                | `components/tabs/DailyLogTab.tsx` (290)          | `targetId`, `currentUserId`, `userRole`, `selectedStudentIds`                                      | `useDailyLogs`, `useCreateDailyLog`                                                                                                                                                                             | Günlük su/sodyum/makro formu + geçmiş kayıtlar; kayıt UPSERT'tir.                                                                                                   |
| `FormCheckTab`                                                               | `components/tabs/FormCheckTab.tsx` (317)         | aynı 4 prop                                                                                        | `useFormChecks`, `useSubmitFormCheck`, `useState`                                                                                                                                                               | Haftalık kilo + poz fotoğrafı gönderimi, geçmiş ve öncesi/sonrası kıyaslama.                                                                                        |
| `MessagesTab`                                                                | `components/tabs/MessagesTab.tsx` (181)          | aynı 4 prop                                                                                        | `useAdminId`, `useMessages`, `usePresence`, `useSendMessage`, `useState/useEffect`                                                                                                                              | Koç ↔ danışan birebir sohbeti, realtime + presence + optimistic gönderim.                                                                                           |
| `NutritionTab`                                                               | `components/tabs/NutritionTab.tsx` (559)         | 4 prop + `onDownloadImage: () => void`                                                             | `useFoods`, `useNutritionPlan`, `useSaveNutritionPlan`, `useGenerateDiet`, `useState/useMemo`                                                                                                                   | Haftalık beslenme planı editörü, AI diyet üretimi, oto-tamamlamalı hızlı besin ekleme, gün bazlı kalori hesabı.                                                     |
| `StatsTab`                                                                   | `components/tabs/StatsTab.tsx` (119)             | `targetId`, `userRole`, `selectedStudentIds`                                                       | `useFormChecks`                                                                                                                                                                                                 | Form check kayıtlarından kilo değişim grafiği (Chart.js) + ekran okuyucu için metin özeti.                                                                          |
| `WorkoutTab`                                                                 | `components/tabs/WorkoutTab.tsx` (813)           | 4 prop + `onDownloadImage`                                                                         | `useWorkoutPlan`, `useSaveWorkoutPlan`, `useExercises`, `useWorkoutLogs`, `useCreateWorkoutLogs`, `usePendingApprovals`, `useSubmitProgramForApproval`, `useApproveProgram`, `useAdminId`, `useGenerateWorkout` | Haftalık antrenman planı: AI üretimi, sürükle-bırak egzersiz kütüphanesi, koç onay akışı, canlı "gym modu" set takibi.                                              |
| `EmptyState`                                                                 | `components/ui/EmptyState.tsx` (31)              | `icon?`, `title`, `description?`, `action?`                                                        | —                                                                                                                                                                                                               | Nötr boş durum kutusu.                                                                                                                                              |
| `ErrorBoundary`                                                              | `components/ui/ErrorBoundary.tsx` (76)           | `children`, `fallback?`, `onError?`                                                                | — (sınıf bileşeni)                                                                                                                                                                                              | React hata sınırı; hata detayı yalnızca development'ta gösterilir.                                                                                                  |
| `QueryState`                                                                 | `components/ui/QueryState.tsx` (67)              | `isLoading`, `isError`, `error?`, `isEmpty?`, `skeleton?`, `emptyMessage?`, `onRetry?`, `children` | —                                                                                                                                                                                                               | Yükleniyor/hata/boş/veri durumlarını tek yerden yöneten sarmalayıcı.                                                                                                |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `SkeletonChart` | `components/ui/Skeleton.tsx` (86)                | `className?` / `lines?` / `rows?`,`cols?` / (yok)                                                  | —                                                                                                                                                                                                               | Yükleme iskeletleri (5 export); kapsayıcıda `role="status"`, görsel parçalarda `aria-hidden`.                                                                       |

**Mimari gözlem:** Hiçbir bileşen doğrudan `supabase.from(...)` çağırmıyor. Veri erişimi
tamamen `src/hooks/*` (10 dosya) ve `src/app/actions.ts` içinde toplanmış (grep ile doğrulandı).
Bu, `active_planprogram.md` AC-2.4'ün ruhuna uygun bir başlangıç noktasıdır.

---

## 4. Hook envanteri

`src/hooks/` altında 11 modül + `index.ts` barrel; toplam **35 export edilen hook**.
Tümü `'use client'`. Hepsi `@/lib/query/keys` içindeki anahtar fabrikalarını kullanır;
elle dizi yazan tek yer `usePlans.ts` (mevcut anahtarı `[...queryKeys.profile(id), 'workout-plan']`
biçiminde genişletir).

| Hook                          | Dosya                    | Tip                       | Girdi                                                      | Dönüş                                    | Dokunduğu tablo(lar)                                                     |
| ----------------------------- | ------------------------ | ------------------------- | ---------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `useSession`                  | `useSession.ts`          | query                     | —                                                          | `Session \| null`                        | (auth)                                                                   |
| `useSignIn`                   | `useSession.ts`          | mutation                  | `{email,password}`                                         | `Session`                                | (auth)                                                                   |
| `useSignOut`                  | `useSession.ts`          | mutation                  | —                                                          | `void`                                   | (auth) — `queryClient.clear()` + `offline-*`/`workbox-*` cache temizliği |
| `useUpdatePassword`           | `useSession.ts`          | mutation                  | `password: string`                                         | `void`                                   | (auth)                                                                   |
| `useProfile`                  | `useProfile.ts`          | query                     | `userId?`                                                  | `Profile`                                | `profiles`                                                               |
| `useProfiles`                 | `useProfile.ts`          | query                     | —                                                          | `Profile[]`                              | `profiles`                                                               |
| `useUpdateProfile`            | `useProfile.ts`          | mutation                  | `{id, values}`                                             | `Profile`                                | `profiles`                                                               |
| `useUploadAvatar`             | `useProfile.ts`          | mutation                  | `{userId, file}`                                           | `publicUrl: string`                      | `profiles` + storage `avatars`                                           |
| `useNotifications`            | `useNotifications.ts`    | query                     | `userId?`, `{unreadOnly?, sinceDays?}`                     | `Notification[]`                         | `notifications`                                                          |
| `useMarkNotificationRead`     | `useNotifications.ts`    | mutation                  | `{id, userId?}`                                            | `void`                                   | `notifications`                                                          |
| `useSendNotification`         | `useNotifications.ts`    | mutation                  | `{studentIds[], title?, message}`                          | `count: number`                          | `notifications`                                                          |
| `useFormChecks`               | `useFormChecks.ts`       | query                     | `studentId?`                                               | `FormCheck[]`                            | `form_checks`                                                            |
| `useSubmitFormCheck`          | `useFormChecks.ts`       | mutation                  | `{studentId, currentWeight, frontFile, backFile?, notes?}` | `FormCheck`                              | `form_checks` + storage `form-checks-media` + RPC `increment_streak`     |
| `useLastCheckins`             | `useFormChecks.ts`       | query                     | —                                                          | `Record<studentId, ISO tarih>`           | `form_checks`                                                            |
| `useDailyLogs`                | `useDailyLogs.ts`        | query                     | `studentId?`                                               | `DailyLog[]` (`macros` parse edilmiş)    | `daily_logs`                                                             |
| `useCreateDailyLog`           | `useDailyLogs.ts`        | mutation (upsert)         | `{studentId, water_lt, sodium_mg, macros, log_date?}`      | `DailyLog`                               | `daily_logs` — `onConflict: 'student_id,log_date'`                       |
| `useWorkoutLogs`              | `useWorkoutLogs.ts`      | query                     | `studentId?`                                               | `WorkoutLog[]`                           | `workout_logs`                                                           |
| `useCreateWorkoutLog`         | `useWorkoutLogs.ts`      | mutation                  | `{studentId, exercise_name, weight_kg?, reps?, rpe?}`      | `WorkoutLog`                             | `workout_logs`                                                           |
| `useCreateWorkoutLogs`        | `useWorkoutLogs.ts`      | mutation                  | `{studentId, sets[]}`                                      | `count: number`                          | `workout_logs` (toplu insert)                                            |
| `usePendingApprovals`         | `useProgramApprovals.ts` | query                     | `studentId?`                                               | `ProgramApproval[]` (`status='pending'`) | `program_approvals`                                                      |
| `useSubmitProgramForApproval` | `useProgramApprovals.ts` | mutation                  | `{studentId, plan, coachId?}`                              | `ProgramApproval`                        | `program_approvals` + `notifications`                                    |
| `useApproveProgram`           | `useProgramApprovals.ts` | mutation                  | `{approvalId, studentId, plan, reviewerId?}`               | `void`                                   | `profiles` + `program_approvals` + `notifications`                       |
| `useMessages`                 | `useMessages.ts`         | query + realtime          | `currentUserId?`, `partnerId?`                             | `Message[]` (eskiden yeniye)             | `messages` — `postgres_changes` INSERT aboneliği                         |
| `useSendMessage`              | `useMessages.ts`         | mutation (optimistic)     | `{senderId, receiverId, message}`                          | `Message`                                | `messages`                                                               |
| `usePresence`                 | `useMessages.ts`         | diğer (realtime presence) | `currentUserId?`                                           | `{ isOnline(userId) }`                   | — (`global-presence` kanalı)                                             |
| `useAdminId`                  | `useMessages.ts`         | query                     | —                                                          | `string \| null`                         | `profiles` (`role='admin'`, en eski)                                     |
| `useExercises`                | `useCatalog.ts`          | query                     | —                                                          | `Exercise[]`                             | `exercises` (staleTime 30 dk)                                            |
| `useFoods`                    | `useCatalog.ts`          | query                     | —                                                          | `FoodItem[]`                             | `food_database` (staleTime 30 dk)                                        |
| `useWorkoutPlan`              | `usePlans.ts`            | query                     | `studentId?`                                               | `WorkoutPlan`                            | `profiles.workout_plan`                                                  |
| `useNutritionPlan`            | `usePlans.ts`            | query                     | `studentId?`                                               | `NutritionPlan`                          | `profiles.nutrition_plan`                                                |
| `useSaveWorkoutPlan`          | `usePlans.ts`            | mutation                  | `{studentIds[], plan}`                                     | `count`                                  | `profiles` (`.in('id', ids)` — tek sorgu)                                |
| `useSaveNutritionPlan`        | `usePlans.ts`            | mutation                  | `{studentIds[], plan}`                                     | `count`                                  | `profiles`                                                               |
| `useGenerateWorkout`          | `useAi.ts`               | mutation                  | `WorkoutGenerateInput`                                     | `WorkoutGenerateResult`                  | — (`POST /api/ai/workout`)                                               |
| `useGenerateDiet`             | `useAi.ts`               | mutation                  | `DietGenerateInput`                                        | `DietGenerateResult`                     | — (`POST /api/ai/nutrition`)                                             |
| `useRecommendations`          | `useAi.ts`               | mutation                  | `RecommendationInput`                                      | `RecommendationResult`                   | — (`POST /api/ai/recommendations`)                                       |

Ortak desenler: Supabase `{data, error}` sonucu hata varsa `throw new Error(error.message)`;
kullanıcıya geri bildirim `sonner` toast'ları ile; mutasyon sonrası ilgili `queryKey` kökleri
invalidate edilir. `useSendMessage` tek optimistic mutasyondur (rollback context'li).

---

## 5. `src/lib` envanteri

| Modül                       | Dışa açtığı başlıca semboller                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/api/client.ts`         | `ApiError` sınıfı, `ApiError.isApiError()`, `ApiFetchOptions`, `apiFetch<T>()`                                                                                           |
| `lib/api/types.ts`          | `SplitType`, `Goal`, `Gender`, `WorkoutGenerateInput/Result`, `DietGenerateInput/Result`, `MacroTargets`, `RecommendationInput/Result`, `Recommendation`, `ApiErrorBody` |
| `lib/api/ai.ts`             | `generateWorkoutPlan()`, `generateDietPlan()`, `getRecommendations()`                                                                                                    |
| `lib/api/proxy.ts`          | `errorResponse()`, `handleAiProxy()` — `import 'server-only'`                                                                                                            |
| `lib/api/index.ts`          | Barrel: `types` + `client` + `ai` (`proxy.ts` bilerek re-export **edilmez**)                                                                                             |
| `lib/query/keys.ts`         | `queryKeyRoots`, `queryKeys`, `NotificationQueryOptions`                                                                                                                 |
| `lib/query/queryClient.ts`  | `makeQueryClient()`, `getQueryClient()`                                                                                                                                  |
| `lib/supabase/client.ts`    | `createBrowserSupabaseClient()`, `supabase` (singleton), `unwrap()`                                                                                                      |
| `lib/supabase/server.ts`    | `createServerSupabaseClient(accessToken?)` — `server-only`                                                                                                               |
| `lib/supabase/admin.ts`     | `getSupabaseAdmin()` — `server-only`, servis rolü                                                                                                                        |
| `lib/supabase/index.ts`     | Barrel: yalnız `client` (server/admin bilerek dışarıda)                                                                                                                  |
| `lib/validation/schemas.ts` | 11 zod şeması + `formatZodError()`                                                                                                                                       |
| `lib/rate-limit.ts`         | `checkRateLimit()`, `resetRateLimit()`, `RateLimitResult`                                                                                                                |
| `lib/logger.ts`             | `Logger` arayüzü, `logger`, `createRequestLogger(requestId)`                                                                                                             |
| `lib/utils.ts`              | `DAYS`, `downloadCSV()`, `getMacroPercentage()`, `getTodayName()`, `formatTime()`, `cn()`, `formatDateTR()`, `formatDateTimeTR()`, `daysSince()`                         |

### 5.1 Hata modeli — `ApiError`

`ApiError extends Error` alanları: `status: number`, `code: string`, `message: string`
(Türkçe, kullanıcıya gösterilebilir), `details?: unknown`, `requestId?: string`.
Prototip zinciri `Object.setPrototypeOf` ile elle düzeltilir; `isApiError()` hem `instanceof`
hem `name === 'ApiError'` kontrolü yapar (bundle sınırları arası güvenlik).

`apiFetch<T>()` davranışı: varsayılan 30 sn timeout (`AbortController`, dışarıdan gelen
`signal` ile birleştirilir), `json` verilirse otomatik `Content-Type: application/json`,
204 veya boş gövdede `undefined` döner. Hata eşlemesi:

| Durum                                | `status`        | `code`                |
| ------------------------------------ | --------------- | --------------------- |
| Dışarıdan iptal                      | 499             | `ABORTED`             |
| Timeout                              | 408             | `TIMEOUT`             |
| Ağ hatası                            | 0               | `NETWORK_ERROR`       |
| Yanıt `ApiErrorBody` biçimindeyse    | upstream status | upstream `error.code` |
| Diğer başarısız yanıt                | upstream status | `HTTP_ERROR`          |
| Başarılı ama JSON parse edilemiyorsa | upstream status | `INVALID_JSON`        |

`retryable` alanı **yoktur** (plan §3.4 istiyor). Fonksiyonlar `Result<T>` döndürmez, exception
fırlatır — bu bilinçli bir sapmadır (`docs/PROGRESS.md` §7 revizyon listesi).

### 5.2 Query anahtar şeması

Şema `[entity, ...params]` biçimindedir; plan §3.4'ün istediği `[domain, entity, params]`
üç seviyeli biçim **kullanılmıyor**. `queryKeyRoots` prefix-invalidate için 14 kök tanımlar:
`session, profile, profiles, notifications, form-checks, daily-logs, workout-logs,
program-approvals, messages, exercises, foods, last-checkins, recommendations, admin-id`.
`queryKeys.messages(a, b)` yön bağımsızdır: iki id sıralanır, böylece `(a,b)` ve `(b,a)` aynı
önbelleği kullanır.

`makeQueryClient()` varsayılanları: `staleTime` 60 sn, `gcTime` 5 dk,
`refetchOnWindowFocus: false`, 4xx'te retry yok (`ApiError.status` 400–499 → `false`), aksi
halde 2 deneme; mutasyonlarda retry 0. Sunucuda her istek için yeni client, tarayıcıda singleton.

### 5.3 Doğrulama şemaları (`lib/validation/schemas.ts`)

11 şema, tüm hata mesajları Türkçe:
`loginSchema`, `passwordChangeSchema`, `createStudentSchema`, `dailyLogSchema`,
`formCheckSchema`, `workoutLogSchema`, `notificationSchema`, `quickAddFoodSchema`,
`planUpdateSchema`, `aiWorkoutSchema`, `aiDietSchema`, `recommendationSchema`
(+ dahili parçalar: `emailField`, `uuidField`, `goalEnum`, `genderEnum`, `splitTypeEnum`,
`dayEnum`, `macroSampleSchema`). `formatZodError()` `{path, message}` listesi üretir.

AI şemalarının alan adları ve sınırları `ai_backend/app/schemas/*.py` ile birebir eşleşir
(ör. `age 10..100`, `height_cm 80..260`, `weight_kg 20..400`, `steps 0..100000`,
`user_prompt` max 2000, `recent_weights`/`recent_macros` max 365, `adherence_days 0..365`).

### 5.4 Supabase istemci ayrımı

| İstemci     | Anahtar                                                     | Oturum                                                                       | Kullanım                                                                   |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `client.ts` | anon                                                        | `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: true` | Tarayıcı; modül seviyesinde singleton; RLS altında                         |
| `server.ts` | anon (+ isteğe bağlı `Authorization: Bearer <accessToken>`) | Hepsi `false`                                                                | Server Component / Route Handler / Server Action; çağıranın RLS bağlamında |
| `admin.ts`  | `SUPABASE_SERVICE_ROLE_KEY`                                 | `false`                                                                      | RLS bypass; yalnız sunucu. Anahtar yoksa açıklayıcı hata fırlatır          |

`server.ts` ve `admin.ts` `import 'server-only'` ile korunur ve `supabase/index.ts` barrel'ından
bilerek dışarıda bırakılmıştır.

### 5.5 `rate-limit.ts` davranışı

Tek-instance, bellek içi, **sabit pencere (fixed window)** sayacı. `Map<string, {count, resetAt}>`.
Varsayılan 60 istek / 60.000 ms. `sweep()` her çağrıda süresi dolmuş anahtarları siler;
`MAX_KEYS = 10.000` aşılırsa Map tamamen boşaltılır (bellek koruması). `resetRateLimit()` test
yardımcısıdır. Çok-instance dağıtımda gerçek limit `N × limit`'e çıkar (bilinen borç).

### 5.6 `logger.ts` ortam ayrımı

| Ortam                                                    | Uygulama                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tarayıcı (`typeof window !== 'undefined'`)               | Hafif `console` adaptörü (pino bundle'a girmesin diye)                                                      |
| Node.js sunucu (`process.env.NEXT_RUNTIME === 'nodejs'`) | `require('pino')`; seviye `LOG_LEVEL`; development'ta `pino-pretty` transport (yoksa sessizce JSON'a düşer) |
| Diğer (edge runtime, test)                               | pino yüklenemezse konsol adaptörüne düşer                                                                   |

`redact` listesi: `*.password`, `*.token`, `*.access_token`, `*.apiKey`, `*.authorization`,
`req.headers.authorization`, `req.headers["x-api-key"]` — `remove: true` ile tamamen çıkarılır.
`createRequestLogger(requestId)` istek bağlamlı alt logger üretir.

---

## 6. Tip katmanı

### 6.1 `src/types/database.ts` (489 satır)

Dosya başlığı: "Bu dosya `npm run db:types` ile üretilmiştir — ELLE DÜZENLEMEYİN."
Üretim komutu (`package.json`):

```
supabase gen types typescript --local --schema public > src/types/database.ts
```

`.prettierignore` bu dosyayı biçimlendirme dışında tutar (üretilen çıktı olduğu için).
Dışa açtıkları: `Json`, `Database`, `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`,
`CompositeTypes<>` ve `Constants` (`approval_status: ["pending","approved","rejected"]`,
`user_role: ["admin","student"]`). İçerik canlı şemayla tutarlıdır (bu oturumda kolon kolon
karşılaştırıldı; `Constants` enum değerleri `pg_enum` çıktısıyla birebir aynı).

### 6.2 `src/types/domain.ts` (192 satır)

Alan tipleri (DB satırlarının okunabilir takma adları):
`UserRole`, `ApprovalStatus`, `Profile`, `User` (= `Profile`), `Notification`, `FormCheck`,
`WorkoutLog`, `ProgramApproval`, `Message`, `Exercise`, `FoodItem`, `DailyLogRow`, `DailyLog`
(`macros` alanı `Macros`'a daraltılmış), `Macros`, `DayName`, `WorkoutPlan`, `NutritionEntry`,
`NutritionPlan`, `Plan`.

Sabitler: `DAY_NAMES` (Pazartesi…Pazar), `EMPTY_WORKOUT_PLAN`, `EMPTY_NUTRITION_PLAN`.

Yardımcı fonksiyonlar:

| Fonksiyon                 | Davranış                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `parseMacros(value)`      | `Json`/string/null girdiyi güvenle `{protein, carb, fat}`'a çevirir; parse edilemeyen değerler 0 olur.                      |
| `parseWorkoutPlan(raw)`   | `profiles.workout_plan` JSON string'ini `Record<DayName, string>`'e çevirir; bozuk JSON veya eksik gün → boş haftalık plan. |
| `parseNutritionPlan(raw)` | `profiles.nutrition_plan`'ı `Record<DayName, {items, total}>`'a çevirir; eksik günler `{items:'', total:0}` ile tamamlanır. |
| `isDayName(v)`            | Type guard.                                                                                                                 |
| `isAdmin(role)`           | `role === 'admin'`. Yetki kontrollerinde tek doğruluk kaynağı.                                                              |

Dosyanın başındaki rol sözleşmesi: **`'admin'` = KOÇ, `'student'` = DANIŞAN.**

`src/types/index.ts` her ikisini de re-export eder (`@/types`).

---

## 7. Veritabanı şeması (canlı veritabanından çıkarıldı)

**9 tablo, 2 enum, 37 public RLS politikası, 8 storage politikası, 6 fonksiyon, 3 proje
trigger'ı, 2 storage bucket.** Tüm public tablolarda `relrowsecurity = true`,
`relforcerowsecurity = false`.

**Enum'lar**

| Enum              | Değerler (sıralı)                 |
| ----------------- | --------------------------------- |
| `user_role`       | `admin`, `student`                |
| `approval_status` | `pending`, `approved`, `rejected` |

**Kurulu eklentiler:** `pg_graphql` (graphql), `pg_net` (extensions), `pg_stat_statements`,
`pg_trgm`, `pgcrypto`, `pgjwt`, `plpgsql`, `supabase_vault` (vault), `uuid-ossp`.

**Yetkiler:** `authenticated` ve `service_role` rollerine 9 tablonun tamamı üzerinde tam DML
grant'i verilmiş; `anon` rolüne **hiçbir public tabloda grant yok** (bu yüzden `anon` RLS'e bile
ulaşmadan `permission denied` alır).

### 7.1 `profiles`

| Kolon             | Tip         | Null  | Varsayılan  | Kısıt                                         |
| ----------------- | ----------- | ----- | ----------- | --------------------------------------------- |
| `id`              | uuid        | HAYIR | —           | PK; FK → `auth.users(id)` ON DELETE CASCADE   |
| `full_name`       | text        | HAYIR | `''::text`  |                                               |
| `email`           | text        | EVET  | —           |                                               |
| `role`            | `user_role` | HAYIR | `'student'` |                                               |
| `avatar_url`      | text        | EVET  | —           |                                               |
| `nutrition_plan`  | text        | EVET  | —           | JSON string olarak beslenme planı             |
| `workout_plan`    | text        | EVET  | —           | JSON string olarak antrenman planı            |
| `current_streak`  | integer     | HAYIR | `0`         |                                               |
| `last_checkin_at` | timestamptz | EVET  | —           |                                               |
| `created_at`      | timestamptz | HAYIR | `now()`     |                                               |
| `updated_at`      | timestamptz | HAYIR | `now()`     | `set_profiles_updated_at` trigger'ı günceller |

İndeksler: `profiles_pkey`, `profiles_role_idx (role)`, `profiles_created_at_idx (created_at DESC)`.
**`coach_id` kolonu yoktur.**

### 7.2 `daily_logs`

| Kolon        | Tip         | Null  | Varsayılan          | Kısıt                                                      |
| ------------ | ----------- | ----- | ------------------- | ---------------------------------------------------------- |
| `id`         | uuid        | HAYIR | `gen_random_uuid()` | PK                                                         |
| `student_id` | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE                                |
| `log_date`   | date        | HAYIR | `CURRENT_DATE`      | UNIQUE `(student_id, log_date)`                            |
| `water_lt`   | numeric     | EVET  | —                   | CHECK: NULL veya 0 ≤ x ≤ 20                                |
| `sodium_mg`  | integer     | EVET  | —                   | CHECK: NULL veya 0 ≤ x ≤ 50000                             |
| `macros`     | jsonb       | HAYIR | `'{}'::jsonb`       | Şema doğrulaması yok (uygulama `{protein,carb,fat}` yazar) |
| `created_at` | timestamptz | HAYIR | `now()`             |                                                            |

İndeksler: `daily_logs_pkey`, `daily_logs_student_date_uniq (student_id, log_date)` UNIQUE,
`daily_logs_student_date_idx (student_id, log_date DESC)`.

### 7.3 `workout_logs`

| Kolon           | Tip         | Null  | Varsayılan          | Kısıt                                                                  |
| --------------- | ----------- | ----- | ------------------- | ---------------------------------------------------------------------- |
| `id`            | uuid        | HAYIR | `gen_random_uuid()` | PK                                                                     |
| `student_id`    | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE                                            |
| `exercise_name` | text        | HAYIR | —                   | Serbest metin (katalog FK'si yok)                                      |
| `weight_kg`     | numeric     | EVET  | —                   | CHECK: NULL veya ≥ 0 (ölçek/hassasiyet belirtilmemiş)                  |
| `reps`          | integer     | EVET  | —                   | CHECK: NULL veya > 0                                                   |
| `rpe`           | integer     | EVET  | —                   | CHECK: NULL veya 1 ≤ x ≤ 10 (**integer**, plan `numeric(3,1)` istiyor) |
| `created_at`    | timestamptz | HAYIR | `now()`             |                                                                        |

İndeksler: `workout_logs_pkey`, `workout_logs_student_recent_idx (student_id, created_at DESC)`,
`workout_logs_exercise_idx (student_id, exercise_name, created_at DESC)`.

### 7.4 `form_checks`

| Kolon            | Tip         | Null  | Varsayılan          | Kısıt                                   |
| ---------------- | ----------- | ----- | ------------------- | --------------------------------------- |
| `id`             | uuid        | HAYIR | `gen_random_uuid()` | PK                                      |
| `student_id`     | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE             |
| `current_weight` | numeric     | HAYIR | —                   | CHECK: 0 < x < 500                      |
| `front_pose_url` | text        | EVET  | —                   | **Tam public URL** saklıyor (yol değil) |
| `back_pose_url`  | text        | EVET  | —                   | Aynı                                    |
| `notes`          | text        | EVET  | —                   |                                         |
| `created_at`     | timestamptz | HAYIR | `now()`             |                                         |

İndeksler: `form_checks_pkey`, `form_checks_student_recent_idx (student_id, created_at DESC)`.
**`status`, `coach_feedback`, `reviewed_at` kolonları yoktur.**

### 7.5 `messages`

| Kolon         | Tip         | Null  | Varsayılan          | Kısıt                       |
| ------------- | ----------- | ----- | ------------------- | --------------------------- |
| `id`          | uuid        | HAYIR | `gen_random_uuid()` | PK                          |
| `sender_id`   | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE |
| `receiver_id` | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE |
| `message`     | text        | HAYIR | —                   | CHECK: 1 ≤ uzunluk ≤ 4000   |
| `is_read`     | boolean     | HAYIR | `false`             |                             |
| `created_at`  | timestamptz | HAYIR | `now()`             |                             |

İndeksler: `messages_pkey`, `messages_thread_idx (sender_id, receiver_id, created_at)`,
`messages_receiver_recent_idx (receiver_id, created_at DESC)`.
**`conversation_id`, `read_at`, `kind` kolonları yoktur.**

### 7.6 `notifications`

| Kolon        | Tip         | Null  | Varsayılan          | Kısıt                               |
| ------------ | ----------- | ----- | ------------------- | ----------------------------------- |
| `id`         | uuid        | HAYIR | `gen_random_uuid()` | PK                                  |
| `student_id` | uuid        | HAYIR | —                   | FK → `profiles(id)` CASCADE (alıcı) |
| `title`      | text        | EVET  | —                   |                                     |
| `message`    | text        | HAYIR | —                   |                                     |
| `is_read`    | boolean     | HAYIR | `false`             |                                     |
| `created_at` | timestamptz | HAYIR | `now()`             |                                     |

İndeksler: `notifications_pkey`, `notifications_student_recent_idx (student_id, created_at DESC)`,
`notifications_student_unread_idx (student_id, is_read)`.

### 7.7 `program_approvals`

| Kolon          | Tip               | Null  | Varsayılan          | Kısıt                                      |
| -------------- | ----------------- | ----- | ------------------- | ------------------------------------------ |
| `id`           | uuid              | HAYIR | `gen_random_uuid()` | PK                                         |
| `student_id`   | uuid              | HAYIR | —                   | FK → `profiles(id)` CASCADE                |
| `workout_data` | jsonb             | HAYIR | —                   |                                            |
| `status`       | `approval_status` | HAYIR | `'pending'`         |                                            |
| `reviewed_by`  | uuid              | EVET  | —                   | FK → `profiles(id)` ON DELETE **SET NULL** |
| `reviewed_at`  | timestamptz       | EVET  | —                   |                                            |
| `created_at`   | timestamptz       | HAYIR | `now()`             |                                            |

İndeksler: `program_approvals_pkey`, `program_approvals_pending_idx (status, created_at DESC)`,
`program_approvals_student_status_idx (student_id, status)`.

### 7.8 `exercises` (referans kataloğu)

| Kolon       | Tip    | Null  | Varsayılan                    | Kısıt  |
| ----------- | ------ | ----- | ----------------------------- | ------ |
| `id`        | bigint | HAYIR | `nextval('exercises_id_seq')` | PK     |
| `name`      | text   | HAYIR | —                             | UNIQUE |
| `body_part` | text   | EVET  | —                             |        |
| `target`    | text   | EVET  | —                             |        |
| `equipment` | text   | EVET  | —                             |        |
| `gif_url`   | text   | EVET  | —                             |        |
| `image`     | text   | EVET  | —                             |        |

İndeksler: `exercises_pkey`, `exercises_name_key` UNIQUE, `exercises_name_lower_idx (lower(name))`,
`exercises_name_trgm_idx` GIN `gin_trgm_ops`, `exercises_body_part_idx`, `exercises_target_idx`.

### 7.9 `food_database` (referans kataloğu)

| Kolon               | Tip     | Null  | Varsayılan                        | Kısıt     |
| ------------------- | ------- | ----- | --------------------------------- | --------- |
| `id`                | bigint  | HAYIR | `nextval('food_database_id_seq')` | PK        |
| `name`              | text    | HAYIR | —                                 | UNIQUE    |
| `calories_per_100g` | numeric | HAYIR | —                                 | CHECK ≥ 0 |

İndeksler: `food_database_pkey`, `food_database_name_key` UNIQUE,
`food_database_name_lower_idx (lower(name))`, `food_database_name_trgm_idx` GIN.

### 7.10 Yabancı anahtar özeti

| Kaynak                          | Hedef           | Silme davranışı |
| ------------------------------- | --------------- | --------------- |
| `profiles.id`                   | `auth.users.id` | CASCADE         |
| `daily_logs.student_id`         | `profiles.id`   | CASCADE         |
| `workout_logs.student_id`       | `profiles.id`   | CASCADE         |
| `form_checks.student_id`        | `profiles.id`   | CASCADE         |
| `messages.sender_id`            | `profiles.id`   | CASCADE         |
| `messages.receiver_id`          | `profiles.id`   | CASCADE         |
| `notifications.student_id`      | `profiles.id`   | CASCADE         |
| `program_approvals.student_id`  | `profiles.id`   | CASCADE         |
| `program_approvals.reviewed_by` | `profiles.id`   | SET NULL        |

Her FK'nin altında bir indeks vardır (ya composite indeksin ilk kolonu olarak ya da PK olarak);
tek istisna `messages.receiver_id` — onun için ayrı `messages_receiver_recent_idx` mevcut.

### 7.11 Yerel yığındaki veri (seed sonrası, doğrulandı)

`auth.users` 3 · `profiles` 3 (1 admin + 2 student) · `daily_logs` 28 · `workout_logs` 40 ·
`form_checks` 12 · `messages` 8 · `notifications` 6 · `program_approvals` 2 · `exercises` 10 ·
`food_database` 10 · `storage.objects` 0.

Demo hesaplar (`supabase/seed.sql`, yalnız yerel): `coach@example.com` (admin),
`client1@example.com`, `client2@example.com` — parola hepsinde `Passw0rd!23`.

**Dikkat:** `data/` altındaki CSV'ler (8,7 MB `exercises.csv` dahil) hiçbir migration/seed
tarafından import **edilmiyor**; tablolarda yalnız 10'ar demo satır var.

---

## 8. RLS politika matrisi (canlı veritabanından)

Kaynak: `SELECT ... FROM pg_policies WHERE schemaname IN ('public','storage')`.
Tüm public politikalar yalnız `{authenticated}` rolüne verilmiştir. `anon` rolüne public
şemada hiç grant verilmediği için erişimi tablo düzeyinde kapalıdır.

### 8.1 Özet matris

`Ö` = satırın sahibi (`student_id`/`sender_id`/`id` = `auth.uid()`), `A` = `is_admin()` (koç),
`H` = herkes (authenticated), `—` = politika yok.

| Tablo               | SELECT                     | INSERT             | UPDATE                          | DELETE          |
| ------------------- | -------------------------- | ------------------ | ------------------------------- | --------------- |
| `profiles`          | Ö veya A                   | A                  | Ö (rol değiştiremez) **veya** A | A               |
| `daily_logs`        | Ö veya A                   | Ö                  | Ö veya A                        | Ö veya A        |
| `workout_logs`      | Ö veya A                   | Ö                  | Ö veya A                        | Ö veya A        |
| `form_checks`       | Ö veya A                   | Ö                  | Ö veya A                        | Ö veya A        |
| `program_approvals` | Ö veya A                   | Ö                  | A                               | Ö veya A        |
| `notifications`     | Ö veya A                   | A veya Ö (kendine) | Ö veya A                        | A               |
| `messages`          | gönderen veya alıcı veya A | gönderen = self    | alıcı = self                    | gönderen veya A |
| `exercises`         | H                          | A                  | A                               | A               |
| `food_database`     | H                          | A                  | A                               | A               |

**Asimetri (önemli):** Koç, danışan adına **INSERT yapamaz** (`daily_logs`, `workout_logs`,
`form_checks`, `program_approvals` INSERT politikaları katı `= auth.uid()` kontrolüdür),
ancak aynı satırları UPDATE/DELETE edebilir. Bu, canlı testle doğrulandı.

### 8.2 Tam politika listesi — `public` (37 adet)

| Tablo               | Politika                         | Komut  | USING                                                              | WITH CHECK                                            |
| ------------------- | -------------------------------- | ------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `daily_logs`        | `daily_logs_select`              | SELECT | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `daily_logs`        | `daily_logs_insert`              | INSERT | —                                                                  | `student_id = auth.uid()`                             |
| `daily_logs`        | `daily_logs_update`              | UPDATE | `student_id = auth.uid() OR is_admin()`                            | aynı                                                  |
| `daily_logs`        | `daily_logs_delete`              | DELETE | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `workout_logs`      | `workout_logs_select`            | SELECT | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `workout_logs`      | `workout_logs_insert`            | INSERT | —                                                                  | `student_id = auth.uid()`                             |
| `workout_logs`      | `workout_logs_update`            | UPDATE | `student_id = auth.uid() OR is_admin()`                            | aynı                                                  |
| `workout_logs`      | `workout_logs_delete`            | DELETE | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `form_checks`       | `form_checks_select`             | SELECT | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `form_checks`       | `form_checks_insert`             | INSERT | —                                                                  | `student_id = auth.uid()`                             |
| `form_checks`       | `form_checks_update`             | UPDATE | `student_id = auth.uid() OR is_admin()`                            | aynı                                                  |
| `form_checks`       | `form_checks_delete`             | DELETE | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `program_approvals` | `program_approvals_select`       | SELECT | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `program_approvals` | `program_approvals_insert`       | INSERT | —                                                                  | `student_id = auth.uid()`                             |
| `program_approvals` | `program_approvals_update_admin` | UPDATE | `is_admin()`                                                       | `is_admin()`                                          |
| `program_approvals` | `program_approvals_delete`       | DELETE | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `notifications`     | `notifications_select`           | SELECT | `student_id = auth.uid() OR is_admin()`                            | —                                                     |
| `notifications`     | `notifications_insert`           | INSERT | —                                                                  | `is_admin() OR student_id = auth.uid()`               |
| `notifications`     | `notifications_update`           | UPDATE | `student_id = auth.uid() OR is_admin()`                            | aynı                                                  |
| `notifications`     | `notifications_delete_admin`     | DELETE | `is_admin()`                                                       | —                                                     |
| `messages`          | `messages_select`                | SELECT | `sender_id = auth.uid() OR receiver_id = auth.uid() OR is_admin()` | —                                                     |
| `messages`          | `messages_insert`                | INSERT | —                                                                  | `sender_id = auth.uid()`                              |
| `messages`          | `messages_update_receiver`       | UPDATE | `receiver_id = auth.uid()`                                         | aynı                                                  |
| `messages`          | `messages_delete`                | DELETE | `sender_id = auth.uid() OR is_admin()`                             | —                                                     |
| `profiles`          | `profiles_select`                | SELECT | `id = auth.uid() OR is_admin()`                                    | —                                                     |
| `profiles`          | `profiles_insert_admin`          | INSERT | —                                                                  | `is_admin()`                                          |
| `profiles`          | `profiles_update_self`           | UPDATE | `id = auth.uid()`                                                  | `id = auth.uid() AND role = profile_role(auth.uid())` |
| `profiles`          | `profiles_update_admin`          | UPDATE | `is_admin()`                                                       | `is_admin()`                                          |
| `profiles`          | `profiles_delete_admin`          | DELETE | `is_admin()`                                                       | —                                                     |
| `exercises`         | `exercises_select`               | SELECT | `true`                                                             | —                                                     |
| `exercises`         | `exercises_insert_admin`         | INSERT | —                                                                  | `is_admin()`                                          |
| `exercises`         | `exercises_update_admin`         | UPDATE | `is_admin()`                                                       | `is_admin()`                                          |
| `exercises`         | `exercises_delete_admin`         | DELETE | `is_admin()`                                                       | —                                                     |
| `food_database`     | `food_database_select`           | SELECT | `true`                                                             | —                                                     |
| `food_database`     | `food_database_insert_admin`     | INSERT | —                                                                  | `is_admin()`                                          |
| `food_database`     | `food_database_update_admin`     | UPDATE | `is_admin()`                                                       | `is_admin()`                                          |
| `food_database`     | `food_database_delete_admin`     | DELETE | `is_admin()`                                                       | —                                                     |

Rol yükseltmesini engelleyen mekanizma `profiles_update_self`'in `WITH CHECK` ifadesidir:
`role` alanı `profile_role(auth.uid())` ile aynı kalmak zorundadır.

### 8.3 Storage politikaları (8 adet, `storage.objects`)

| Bucket              | Politika                  | Komut  | Roller                  | Koşul                                          |
| ------------------- | ------------------------- | ------ | ----------------------- | ---------------------------------------------- |
| `avatars`           | `avatars_public_read`     | SELECT | `anon`, `authenticated` | `bucket_id = 'avatars'`                        |
| `avatars`           | `avatars_insert_own`      | INSERT | `authenticated`         | `bucket_id='avatars' AND (name LIKE auth.uid() |     | '-%' OR is_admin())` |
| `avatars`           | `avatars_update_own`      | UPDATE | `authenticated`         | aynı koşul (USING + WITH CHECK)                |
| `avatars`           | `avatars_delete_own`      | DELETE | `authenticated`         | aynı koşul                                     |
| `form-checks-media` | `form_checks_public_read` | SELECT | `anon`, `authenticated` | `bucket_id = 'form-checks-media'`              |
| `form-checks-media` | `form_checks_insert_own`  | INSERT | `authenticated`         | `name LIKE 'poses/'                            |     | auth.uid()           |     | '-%' OR is_admin()` |
| `form-checks-media` | `form_checks_update_own`  | UPDATE | `authenticated`         | aynı koşul                                     |
| `form-checks-media` | `form_checks_delete_own`  | DELETE | `authenticated`         | aynı koşul                                     |

**Kritik:** Okuma politikaları `anon` rolünü de kapsıyor **ve** iki bucket da `public = true`.
Danışan vücut fotoğrafları, URL'yi bilen herkese açıktır. Bu `active_planprogram.md` I-4
değişmezini doğrudan ihlal eder.

### 8.4 Doğrulanmış davranış (bu oturumda `set local role` ile yeniden test edildi)

| #   | Senaryo                                    | Beklenen                   | Gözlenen                                                          | Sonuç                        |
| --- | ------------------------------------------ | -------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| 1   | client1 `profiles` okur                    | yalnız kendi satırı        | 1 satır                                                           | GEÇTİ                        |
| 2   | client1 kendi `form_checks`'ini okur       | 6                          | 6                                                                 | GEÇTİ                        |
| 3   | client1 client2'nin `form_checks`'ini okur | 0                          | 0                                                                 | GEÇTİ                        |
| 4   | client1 tüm `daily_logs`'u okur            | yalnız kendisininki (14)   | 14                                                                | GEÇTİ                        |
| 5   | client1 tüm `workout_logs`'u okur          | yalnız kendisininki (20)   | 20                                                                | GEÇTİ                        |
| 6   | client1 tüm `messages`'ı okur              | yalnız kendi konuşması (4) | 4                                                                 | GEÇTİ                        |
| 7   | koç `profiles` okur                        | 3                          | 3                                                                 | GEÇTİ                        |
| 8   | koç `form_checks` okur                     | 12                         | 12                                                                | GEÇTİ                        |
| 9   | koç `daily_logs` okur                      | 28                         | 28                                                                | GEÇTİ                        |
| 10  | koç `workout_logs` okur                    | 40                         | 40                                                                | GEÇTİ                        |
| 11  | koç `messages` okur                        | 8                          | 8                                                                 | GEÇTİ                        |
| 12  | client1 kendi rolünü `admin` yapar         | reddedilir                 | `new row violates row-level security policy for table "profiles"` | GEÇTİ                        |
| 13  | client1 client2 adına `workout_logs` yazar | reddedilir                 | `new row violates row-level security policy`                      | GEÇTİ                        |
| 14  | koç danışan adına `workout_logs` yazar     | (plan bunu istiyor: FAIL)  | reddedildi                                                        | GEÇTİ (plan §3.2 ile uyumlu) |
| 15  | `anon` `profiles` okur                     | reddedilir                 | `permission denied for table profiles`                            | GEÇTİ                        |

**Ayrıca ortaya çıkan iki davranış (kayıtlı değil, bkz. §15.2):**

| #   | Senaryo                                                                 | Gözlenen       | Etki                                                                                                            |
| --- | ----------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| 16  | client1, `role='admin'` filtresiyle koç profilini arar (`useAdminId()`) | **NULL döner** | `profiles_select` politikası öğrenciye yalnız kendi satırını gösterdiği için danışan koçunun id'sini bulamıyor. |
| 17  | client1, koça bildirim ekler (`notifications.student_id = koç`)         | reddedilir     | `notifications_insert` `WITH CHECK` yalnız `is_admin() OR student_id = auth.uid()` izin veriyor.                |

---

## 9. Fonksiyonlar, trigger'lar, storage

### 9.1 `public` şemasındaki fonksiyonlar (6)

| Fonksiyon            | İmza                            | Dönüş       | SECURITY DEFINER | Volatilite | `search_path`     |
| -------------------- | ------------------------------- | ----------- | ---------------- | ---------- | ----------------- |
| `is_admin`           | `(uid uuid DEFAULT auth.uid())` | boolean     | **EVET**         | STABLE     | `public, pg_temp` |
| `profile_role`       | `(uid uuid DEFAULT auth.uid())` | `user_role` | **EVET**         | STABLE     | `public, pg_temp` |
| `increment_streak`   | `(user_id uuid)`                | integer     | **EVET**         | VOLATILE   | `public, pg_temp` |
| `handle_new_user`    | `()`                            | trigger     | **EVET**         | VOLATILE   | `public, pg_temp` |
| `sync_profile_email` | `()`                            | trigger     | **EVET**         | VOLATILE   | `public, pg_temp` |
| `set_updated_at`     | `()`                            | trigger     | HAYIR            | VOLATILE   | `public, pg_temp` |

**`SECURITY DEFINER` gerekçeleri:**

- `is_admin()` / `profile_role()` — `profiles` üzerindeki RLS politikaları bu fonksiyonları
  çağırır. `SECURITY INVOKER` olsalardı politika içinden `profiles`'a yapılan sorgu aynı
  politikayı tekrar tetikler ve Postgres
  `infinite recursion detected in policy for relation "profiles"` hatası verirdi. Migration
  başlığında bu gerekçe açıkça belgelenmiş.
- `increment_streak()` — `profiles.current_streak`/`last_checkin_at` alanlarını günceller;
  `profiles_update_self` politikası bu alanları izinli kılsa da fonksiyon `FOR UPDATE` kilidiyle
  atomik okuma-yazma yapar. Kendi içinde yetki kontrolü **vardır**:
  `auth.uid() = user_id OR public.is_admin()` değilse `42501` fırlatır; `user_id NULL` ise
  `22023`; profil yoksa `P0002`. Aynı gün ikinci check-in seriyi artırmaz (`greatest(streak, 1)`),
  dünkü check-in varsa +1, aksi halde 1'e sıfırlanır.
- `handle_new_user()` — `auth.users` üzerinde AFTER INSERT çalışır ve `public.profiles`'a yazar;
  `auth` şemasındaki trigger'ın public tabloya yazabilmesi için definer olmalıdır. Geçersiz
  `raw_user_meta_data->>'role'` değeri gelirse `invalid_text_representation` yakalanır ve
  `'student'`'a düşülür; `ON CONFLICT (id) DO NOTHING` ile servis rolünün ayrıca profil
  eklemesine karşı korunur.
- `sync_profile_email()` — `auth.users.email` değişince `public.profiles.email`'i günceller;
  aynı şema-geçişi gerekçesi.
- `set_updated_at()` — yalnızca `NEW.updated_at := now()` yapar, ayrıcalık gerektirmez; bu yüzden
  bilinçli olarak **INVOKER** bırakılmıştır.

### 9.2 Trigger'lar (proje kaynaklı 3 adet)

| Trigger                      | Tablo             | Tanım                                                         |
| ---------------------------- | ----------------- | ------------------------------------------------------------- |
| `on_auth_user_created`       | `auth.users`      | AFTER INSERT FOR EACH ROW → `handle_new_user()`               |
| `on_auth_user_email_updated` | `auth.users`      | AFTER UPDATE OF `email` FOR EACH ROW → `sync_profile_email()` |
| `set_profiles_updated_at`    | `public.profiles` | BEFORE UPDATE FOR EACH ROW → `set_updated_at()`               |

(Ayrıca Supabase'in kendi altyapı trigger'ları mevcuttur: `realtime.subscription` üzerinde
`tr_check_filters`, `storage.buckets`/`storage.objects` üzerinde 4 adet — bunlar proje kodu
değildir.)

### 9.3 Storage bucket'ları

| Bucket              | `public` | `file_size_limit` | `allowed_mime_types`                                                  |
| ------------------- | -------- | ----------------- | --------------------------------------------------------------------- |
| `avatars`           | **true** | 5.242.880 (5 MiB) | `image/png, image/jpeg, image/jpg, image/webp, image/gif, image/avif` |
| `form-checks-media` | **true** | 5.242.880 (5 MiB) | aynı liste                                                            |

Yol sözleşmesi (uygulama kodu ile storage politikaları birebir eşleşir):

| Bucket              | Yazan kod                                     | Yol biçimi                                         |
| ------------------- | --------------------------------------------- | -------------------------------------------------- |
| `avatars`           | `src/hooks/useProfile.ts` → `useUploadAvatar` | `<uid>-<uuid>.<ext>` (bucket **kökü**, klasör yok) |
| `form-checks-media` | `src/hooks/useFormChecks.ts` → `uploadPose`   | `poses/<uid>-<uuid>.<ext>`                         |

Her iki hook da yüklemeden sonra `getPublicUrl()` çağırır ve **tam URL'yi** veritabanına yazar
(`profiles.avatar_url`, `form_checks.front_pose_url`/`back_pose_url`). Signed URL kullanılmıyor.
`supabase/config.toml` genel `[storage] file_size_limit = "50MiB"` derken bucket'ların kendi
limiti 5 MiB'dir; etkin sınır daha düşük olandır.

---

## 10. Python backend (`ai_backend/`)

FastAPI + Pydantic v2 + uv; Python 3.12 (`.python-version`). Tamamen **stateless ve
deterministik** — hiçbir LLM/vision sağlayıcısına bağlanmaz, veritabanına dokunmaz.
Tüm iş mantığı kural tabanlıdır.

### 10.1 Yapı

| Modül                          | Sorumluluk                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `app/main.py`                  | `create_app()` factory; middleware zinciri, router mount, exception handler kaydı             |
| `app/core/config.py`           | `pydantic-settings` `Settings` + `get_settings()` (`lru_cache`)                               |
| `app/core/logging.py`          | structlog yapılandırması + `RequestContextMiddleware`                                         |
| `app/core/errors.py`           | `AppError` hiyerarşisi + 4 exception handler                                                  |
| `app/core/rate_limit.py`       | slowapi `Limiter`, `exempt()` sarmalayıcısı, 429 handler                                      |
| `app/core/security.py`         | `api_key_guard` — opsiyonel `X-API-Key` doğrulaması                                           |
| `app/data/constants.py`        | Gün adları, `SPLIT_LOGIC`, varsayılan dinlenme günleri, aktivite çarpanları, gramaj sınırları |
| `app/data/food_db.py`          | `FOOD_DB` — 22 besin (8 protein, 9 karbonhidrat, 5 yağ), hard-coded                           |
| `app/data/exercise_library.py` | `ELITE_EXERCISES` — 7 gün/kas grubu etiketi, her biri alternatifli egzersiz slotları          |
| `app/routers/*.py`             | HTTP uçları (aşağıda)                                                                         |
| `app/schemas/*.py`             | Pydantic v2 modelleri (tümü `ConfigDict(extra="forbid")`)                                     |
| `app/services/*.py`            | Saf iş mantığı                                                                                |

### 10.2 Endpoint tablosu

| Method | Yol                        | Dosya                                    | İstek modeli              | Yanıt modeli               | Durum          | Koruma                                                              |
| ------ | -------------------------- | ---------------------------------------- | ------------------------- | -------------------------- | -------------- | ------------------------------------------------------------------- |
| GET    | `/health`                  | `routers/health.py`                      | —                         | ad-hoc dict                | Güncel         | Rate limit **muaf**                                                 |
| GET    | `/health/ready`            | `routers/health.py`                      | —                         | ad-hoc dict                | Güncel         | Rate limit muaf; `settings.data_dir.exists()` kontrolü              |
| POST   | `/analyze/workout`         | `routers/workout.py`                     | `WorkoutAnalyzeRequest`   | `WorkoutAnalyzeResponse`   | Güncel         | `api_key_guard` + `20/minute`                                       |
| POST   | `/analyze/nutrition`       | `routers/nutrition.py`                   | `NutritionAnalyzeRequest` | `NutritionAnalyzeResponse` | Güncel         | `api_key_guard` + `20/minute`                                       |
| POST   | `/recommendations`         | `routers/recommendations.py`             | `RecommendationRequest`   | `RecommendationResponse`   | Güncel         | `api_key_guard` + `20/minute`                                       |
| POST   | `/api/generate-ai-workout` | `routers/workout.py` (`legacy_router`)   | `WorkoutAnalyzeRequest`   | `WorkoutAnalyzeResponse`   | **Deprecated** | **`api_key_guard` YOK, 20/dk limiti YOK** — yalnız varsayılan 60/dk |
| POST   | `/api/generate-ai-diet`    | `routers/nutrition.py` (`legacy_router`) | `NutritionAnalyzeRequest` | `NutritionAnalyzeResponse` | **Deprecated** | Aynı boşluk                                                         |

Next.js proxy'si yalnız güncel uçları çağırır; deprecated uçların kullanıcısı yoktur ama açıktır.

### 10.3 Pydantic modelleri

Tümünde `model_config = ConfigDict(extra="forbid")` — fazladan alan 422 döndürür.

- `schemas/common.py`: `FoodItem` (`name`, `calories_per_100g ≥ 0`), `ExerciseItem`
  (`name` + 5 opsiyonel metin alanı), `ErrorDetail` (`loc`, `message`, `type`),
  `ErrorBody` (`code`, `message`, `request_id?`, `details?`), `ErrorResponse`.
- `schemas/workout.py`: `SplitType = Literal['ppl_torso_limbs','ppl','upper_lower','torso_limbs']`,
  `Goal = Literal['cut','bulk','maintain']`; `WorkoutAnalyzeRequest`
  (`split_type`, `user_prompt` ≤2000, `age` 10–100, `goal`, `weight` 20<x<400);
  `WorkoutAnalyzeResponse` (`status`, `message`, `ai_analysis`, `workout_plan: dict[str,str]`);
  `WorkoutRequest` geriye dönük alias.
- `schemas/nutrition.py`: `Gender = Literal['male','female']`; `NutritionAnalyzeRequest`
  (`age` 10–100, `height_cm` 80<x<260, `weight_kg` 20<x<400, `gender`, `steps` 0–100000,
  `goal`, `user_prompt` ≤2000); `MacroTargets`; `NutritionAnalyzeResponse`
  (`status`, `target_calories`, `ai_analysis`, `diet_plan: dict[str,str]`, `macro_targets`);
  `DietRequest` alias.
- `schemas/recommendations.py`: `MacroSample`; `RecommendationRequest`
  (`student_id?`, `goal`, `recent_weights` ≤365, `recent_macros` ≤365, `adherence_days` 0–365);
  `Recommendation` (`category`, `priority`, `title`, `detail`); `RecommendationResponse`.

### 10.4 Servis katmanı

| Modül                      | Public fonksiyonlar                                                                                        | Sorumluluk                                                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `nutrition_calculator.py`  | `calculate_bmr()`, `activity_multiplier()`, `calculate_tdee()`, `calculate_macro_targets()`                | Mifflin-St Jeor BMR; adım eşiğine göre aktivite çarpanı; cut −500 / bulk +500 kcal; protein 2,2 g/kg, yağ kalorinin %25'i, kalan karbonhidrat |
| `diet_generator.py`        | `apply_food_preferences()`, `generate_diet_plan()`                                                         | Kullanıcı prompt'undan besin tercih filtresi; haftalık plan + analiz metni (test için `rng` seed'lenebilir)                                   |
| `workout_generator.py`     | `detect_rest_days()`, `default_rest_days()`, `determine_base_sets()`, `generate_workout()`                 | Prompt'tan dinlenme günü tespiti (word-boundary regex), split akışı, hedef/yaşa göre set-tekrar, egzersiz seçimi                              |
| `recommendation_engine.py` | `build_recommendations()`                                                                                  | Kilo trendi (lineer regresyon), protein yeterliliği, uyum bazlı kural motoru                                                                  |
| `csv_loader.py`            | `load_food_csv()`, `load_exercise_csv()`, `write_clean_food_csv()`, `write_clean_exercise_csv()`, `main()` | **Yalnızca CLI aracı** — çalışma zamanında çağrılmıyor                                                                                        |

### 10.5 `core/` bileşenleri

**`config.py` — `Settings` alanları:**

| Alan           | Env değişkeni  | Varsayılan                                                                |
| -------------- | -------------- | ------------------------------------------------------------------------- |
| `app_name`     | `APP_NAME`     | `"Coaching AI Backend"`                                                   |
| `version`      | `VERSION`      | `"1.0.0"`                                                                 |
| `environment`  | `ENVIRONMENT`  | `"development"` (`development\|staging\|production`)                      |
| `cors_origins` | `CORS_ORIGINS` | `["http://localhost:3000"]` (virgüllü string'i listeye çeviren validator) |
| `api_key`      | `API_KEY`      | `None`                                                                    |
| `rate_limit`   | `RATE_LIMIT`   | `"60/minute"`                                                             |
| `log_level`    | `LOG_LEVEL`    | `"INFO"`                                                                  |
| `log_json`     | `LOG_JSON`     | `True`                                                                    |
| `data_dir`     | `DATA_DIR`     | `ai_backend/data`                                                         |

`case_sensitive=False`, `extra="ignore"`, `.env` okunur, `is_production` property'si var.

**`logging.py`:** structlog; `log_json=True` → `JSONRenderer`, aksi halde renkli
`ConsoleRenderer`. Processor zinciri: `merge_contextvars`, `add_log_level`, `add_logger_name`,
ISO `TimeStamper`, stack/exc info. stdlib logging köprüsü (`ProcessorFormatter`) ile uvicorn
logger'ları aynı handler'a bağlanır. `RequestContextMiddleware` her isteğe `X-Request-ID` atar
(gelen header varsa onu kullanır, yoksa `uuid4`), `structlog.contextvars`'a bağlar, yanıt
başlığına ekler ve `request_completed`/`request_failed` olaylarını method, path, status_code,
duration_ms ile loglar.

**`errors.py`:** `AppError` (500, `app_error`) → `ValidationAppError` (422, `validation_error`),
`NotFoundError` (404, `not_found`), `UpstreamError` (502, `upstream_error`). 4 handler:
`AppError`, `RequestValidationError` (422 + `loc/message/type` listesi),
`StarletteHTTPException` (404 için özel kod), generic `Exception` (production'da genel mesaj,
development'ta `ClassName: mesaj`; her durumda `logger.exception` ile stack trace). Tüm hata
gövdeleri `{"error": {"code", "message", "request_id", "details"}}` biçimindedir — Next.js
tarafındaki `ApiErrorBody` ile uyumludur.

**`rate_limit.py`:** slowapi `Limiter(key_func=get_remote_address, default_limits=[settings.rate_limit])`.
Depolama **bellek içi** (Redis yapılandırılmamış) — çok-process dağıtımda sayaçlar bölünür.
`default_limits` modül import anında donduğu için testler `RATE_LIMIT` env'ini import'tan önce
ayarlar (`conftest.py`). `exempt()` `/health*` uçlarını muaf tutar.

**`security.py`:** `api_key_guard` dependency. `settings.api_key` `None` ise no-op; aksi halde
`X-API-Key` başlığını `secrets.compare_digest` ile sabit-zamanlı karşılaştırır, uyuşmazsa
401 `unauthorized`. Yalnız güncel router'lara bağlıdır.

**`main.py`:** `FastAPI(docs_url='/docs', redoc_url='/redoc', openapi_url='/openapi.json')`.
Middleware ekleme sırası: `SlowAPIMiddleware` → `RequestContextMiddleware` →
`GZipMiddleware(minimum_size=500)` → `CORSMiddleware` (en dışta). CORS:
`allow_origins=settings.cors_origins`, `allow_credentials=True`,
`allow_methods=['GET','POST','OPTIONS']`, `allow_headers=['Content-Type','X-API-Key','X-Request-ID']`.
Lifespan **yok**; `app.state.start_time` senkron atanır.

### 10.6 Testler

| Dosya                                  | Toplanan test | Konu                                      |
| -------------------------------------- | ------------- | ----------------------------------------- |
| `tests/test_csv_loader.py`             | 5             | CSV okuma/yazma                           |
| `tests/test_health.py`                 | 3             | `/health`, `/health/ready`                |
| `tests/test_nutrition_router.py`       | 6             | Diyet ucu (doğrulama + happy path)        |
| `tests/test_nutrition_service.py`      | 26            | BMR/TDEE/makro (biri 10 parametreli)      |
| `tests/test_recommendations_router.py` | 6             | Öneri ucu                                 |
| `tests/test_workout_router.py`         | 6             | Antrenman ucu (fazladan alan reddi dahil) |
| `tests/test_workout_service.py`        | 11            | Dinlenme günü, split, set/tekrar mantığı  |
| **Toplam**                             | **63**        |                                           |

`pytest --collect-only` ile bu oturumda doğrulandı: **63 test**, dosya dağılımı yukarıdaki gibi.
`ai_backend/README.md` "63 test geçti, kapsam %92,42" diyor — test sayısı doğrulandı; **kapsam
oranı bu oturumda yeniden ölçülmedi (doğrulanmadı)**.
`pyproject.toml` eşiği: `--cov=app --cov-fail-under=70`, `asyncio_mode="auto"`, `testpaths=["tests"]`.
ruff: `line-length=120`, `target-version=py312`, seçili kural setleri
`E,F,I,N,UP,B,A,C4,SIM,RUF,ANN,S,PT`. mypy: `strict=True`, `pydantic.mypy` plugin'i,
`tests.*` için gevşetilmiş.

### 10.7 Paketleme

Runtime bağımlılıkları: `fastapi>=0.115`, `uvicorn[standard]>=0.32`, `pydantic>=2.9`,
`pydantic-settings>=2.6`, `structlog>=24.4`, `slowapi>=0.1.9`, `python-multipart>=0.0.9`,
`orjson>=3.10`. Dev: `pytest>=8.3`, `pytest-asyncio>=0.24`, `pytest-cov>=6.0`, `httpx>=0.28`,
`ruff>=0.8`, `mypy>=1.13`.

`Dockerfile` iki aşamalı: builder (`python:3.12-slim` + `uv`, `uv sync --frozen --no-dev`) →
runtime (non-root `appuser` uid 1001, `ENVIRONMENT=production`, `PORT=8000`,
`HEALTHCHECK` → `/health`, `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`).
`tests/` imaja kopyalanmaz.

**`ai_backend/uv.lock` MEVCUTTUR** (261 KB, git tarafından izleniyor) — `UPGRADE_NOTES.md` §7 ve
`docs/PROGRESS.md` §5'teki "uv.lock üretilmedi" riski artık geçersizdir (bkz. §15.2).

---

## 11. Test envanteri

| Katman                     | Araç                                 | Dosya sayısı                                    | Test sayısı                    | Kapsam/eşik                                           | Durum                                                                                                            |
| -------------------------- | ------------------------------------ | ----------------------------------------------- | ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Birim + bileşen (frontend) | Vitest 2.1 + jsdom + Testing Library | 16 test dosyası (+ `test-utils.tsx` yardımcı)   | **180**                        | lines 60 / functions 60 / branches 55 / statements 60 | **180/180 geçti** (`npx vitest run`, bu oturumda çalıştırıldı, 3,39 sn)                                          |
| E2E (web)                  | Playwright 1.49                      | 3 spec (+ `fixtures.ts`, `README.md`)           | 14 senaryo × 2 profil = **28** | eşik yok                                              | `--list` ile "Total: 28 tests in 3 files" doğrulandı; koşum bu oturumda yapılmadı (önceki oturumda 28/28 geçmiş) |
| Backend                    | pytest 8 + pytest-cov                | 7 test dosyası (+ `conftest.py`, `__init__.py`) | **63**                         | `--cov-fail-under=70`; README %92,42 iddia ediyor     | 63 test toplandı (doğrulandı); koşum/kapsam bu oturumda ölçülmedi                                                |
| RLS                        | Elle SQL (`set local role`)          | —                                               | 15 senaryo (bu oturum)         | —                                                     | 15/15 beklendiği gibi (§8.4)                                                                                     |

**Vitest dosya dağılımı (gerçek koşum çıktısı):**

| Dosya                                             | Test                             |
| ------------------------------------------------- | -------------------------------- |
| `tests/unit/schemas.test.ts`                      | 39                               |
| `tests/unit/domain.test.ts`                       | 28                               |
| `tests/unit/utils.test.ts`                        | 31 (`it.each` genişlemesi dahil) |
| `tests/unit/components/QueryState.test.tsx`       | 10                               |
| `tests/unit/components/Skeleton.test.tsx`         | 9                                |
| `tests/unit/api-client.test.ts`                   | 8                                |
| `tests/unit/components/DailyLogTab.test.tsx`      | 8                                |
| `tests/unit/env.test.ts`                          | 7                                |
| `tests/unit/components/AnnouncementsTab.test.tsx` | 7                                |
| `tests/unit/query-keys.test.ts`                   | 6                                |
| `tests/unit/rate-limit.test.ts`                   | 6                                |
| `tests/unit/components/DashboardTabs.test.tsx`    | 5                                |
| `tests/unit/components/EmptyState.test.tsx`       | 5                                |
| `tests/unit/components/NotificationForm.test.tsx` | 5                                |
| `tests/unit/components/ErrorBoundary.test.tsx`    | 3                                |
| `tests/unit/components/ThemeToggle.test.tsx`      | 3                                |
| **Toplam**                                        | **180**                          |

**Playwright spec dağılımı:** `auth.spec.ts` 5, `daily-log.spec.ts` 2, `dashboard.spec.ts` 7
= 14 senaryo; projeler `chromium` (Desktop Chrome) ve `Mobile Chrome` (Pixel 5) → 28 koşum.

**Test edilmeyen alanlar (boşluk):** `src/hooks/*` için hiçbir birim testi yok (11 modül,
35 hook); `src/app/actions.ts` test edilmiyor; `src/lib/api/proxy.ts` ve API route handler'ları
test edilmiyor; `WorkoutTab` (813 satır) ve `NutritionTab` (559) ve `AdminUserManagement` (641)
için bileşen testi yok. Vitest kapsam eşikleri (%60/%55) bu boşluklara rağmen tuttuğu için CI
yeşil kalıyor — **bu bir kalite riski**.

---

## 12. Yapılandırma ve araç zinciri

### 12.1 `package.json`

`name: my-coaching-app`, `version: 0.1.0`, `private: true`, `engines.node >= 20.11.0`.
`packageManager` alanı **yok**; fiilen npm (`package-lock.json` mevcut, tüm script'ler npm).

| Script                                  | Komut                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `dev`                                   | `next dev --webpack`                                                            |
| `build`                                 | `next build --webpack`                                                          |
| `start`                                 | `next start`                                                                    |
| `lint` / `lint:fix`                     | `eslint .` / `eslint . --fix`                                                   |
| `type-check`                            | `tsc --noEmit`                                                                  |
| `test` / `test:watch` / `test:coverage` | `vitest run` / `vitest` / `vitest run --coverage`                               |
| `test:e2e` / `test:e2e:ui`              | `playwright test` / `playwright test --ui`                                      |
| `format` / `format:check`               | `prettier --write .` / `prettier --check .`                                     |
| `db:types`                              | `supabase gen types typescript --local --schema public > src/types/database.ts` |
| `db:migrate`                            | `supabase db push`                                                              |
| `clean:foods`                           | `node scripts/clean-foods.mjs`                                                  |
| `ci`                                    | `lint && type-check && test && build`                                           |

Başlıca bağımlılıklar: `next 16.2.10` (sabit), `react`/`react-dom` `19.2.4` (sabit),
`@supabase/supabase-js ^2.110`, `@tanstack/react-query ^5.62`, `react-hook-form ^7.54`,
`zod ^3.24`, `chart.js ^4.5` + `react-chartjs-2 ^5.3`, `recharts ^3.9`, `html2canvas ^1.4`,
`next-pwa ^5.6`, `next-themes ^0.4`, `pino ^9.6`, `sonner ^1.7`, `server-only`.
Dev: `typescript ^5.7`, `eslint ^9` + `eslint-config-next 16.2.10`, `vitest ^2.1` +
`@vitest/coverage-v8`, `jsdom ^25`, Testing Library üçlüsü, `@playwright/test ^1.49`,
`tailwindcss ^3.4`, `prettier ^3.4` + `prettier-plugin-tailwindcss`, `supabase ^2.2`.

### 12.2 TypeScript

`tsconfig.json`: `target ES2022`, `module esnext`, `moduleResolution bundler`, `jsx react-jsx`,
`noEmit`, `incremental`. Katı ayarlar: **`strict: true`**, `noUncheckedIndexedAccess`,
`noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`,
`forceConsistentCasingInFileNames`, `allowJs: false`. `exactOptionalPropertyTypes` **kapalı**.
`paths: { "@/*": ["./src/*"] }`. `exclude`: `node_modules`, `tests/e2e`, `.next`, `ai_backend`.

`tsconfig.e2e.json`: `tests/e2e/**` + `playwright.config.ts` için ayrı, dar yapılandırma;
`paths` alanı yok (e2e testleri `@/*` alias'ını kullanamaz).

### 12.3 ESLint / Prettier / editör

`eslint.config.mjs` (flat config): `eslint-config-next/core-web-vitals` genişletilir.
Ignore: Next varsayılanları (`.next`, `out`, `build`, `next-env.d.ts`) + `tests/e2e/**`,
`data/**`, `scripts/**`, `ai_backend/**`, `supabase/**`, `coverage/**`, `playwright-report/**`.
Özel kurallar (`**/*.ts(x)`): `no-console: warn` (`warn`/`error` serbest), `eqeqeq: error`,
`no-var: error`, `prefer-const: error`.

`.prettierrc`: `semi: false`, `singleQuote: true`, `printWidth: 100`, `trailingComma: es5`,
`prettier-plugin-tailwindcss`. `.prettierignore`: `data/`, `coverage/`, `.next/`, `ai_backend/`,
`node_modules/`, `playwright-report/`, `test-results/`, `public/`, `supabase/`,
`src/types/database.ts`.

`.editorconfig`: UTF-8, LF, son satır sonu, 2 boşluk (Python 4, Markdown'da satır sonu boşluğu
korunur). `.nvmrc`: `20.11.0`.

### 12.4 `next.config.mjs`

`output: 'standalone'`, `reactStrictMode: true`, `poweredByHeader: false`,
`typescript.ignoreBuildErrors: false`. `outputFileTracingRoot` ve `turbopack.root` proje köküne
sabitlenmiş (ev dizinindeki başıboş lockfile Next'in workspace kökünü yanlış çıkarttığı için).
`images.remotePatterns`: `https://**.supabase.co`, `https://ui-avatars.com`.
Lint build adımı değildir (ayrı `npm run lint`).

**Güvenlik başlıkları (tüm `/:path*`):**

| Başlık                      | Değer                                                          |
| --------------------------- | -------------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                 |
| `X-Content-Type-Options`    | `nosniff`                                                      |
| `X-Frame-Options`           | `DENY`                                                         |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `X-DNS-Prefetch-Control`    | `on`                                                           |
| `Content-Security-Policy`   | aşağıda                                                        |

**CSP üretimi:** `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+ dev'de
`'unsafe-eval'`); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:
https://*.supabase.co https://ui-avatars.com <NEXT_PUBLIC_SUPABASE_URL origin>`;
`font-src 'self' data:`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co
<origin> <ws-origin>`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`;
`object-src 'none'`; `upgrade-insecure-requests`. Supabase origin'i runtime'da
`NEXT_PUBLIC_SUPABASE_URL`'den türetilir (yerel `127.0.0.1:54321` `*.supabase.co` desenine
uymadığı için — bu düzeltme E2E oturumunda eklenmiş). Nonce tabanlı CSP kod içinde TODO.

**PWA (`next-pwa`):** `dest: 'public'`, development'ta kapalı, `register: true`,
`skipWaiting: true`. `runtimeCaching`: `workout_logs` REST ucu → `NetworkFirst`
(`offline-workout-data`, 50 kayıt, 7 gün); Supabase Storage public objeleri → `NetworkOnly`.
`profiles` ucu bilinçli olarak cache listesinde **yoktur** (e-posta + plan verisi paylaşılan
cihazda sızmasın diye).

### 12.5 Tailwind / PostCSS

`tailwind.config.ts`: `darkMode: 'class'`, `content: ['./src/**/*.{js,ts,jsx,tsx,mdx}']`,
`brand-purple #8b5cf6` / `brand-purpleHover #7c3aed`, `fadeIn` keyframe + animasyon,
plugin yok. `postcss.config.mjs`: `tailwindcss` + `autoprefixer`.

### 12.6 Vitest / Playwright

`vitest.config.ts`: `environment: jsdom`, `globals: true`, setup `./vitest.setup.ts`,
include `src/**/*.{test,spec}.{ts,tsx}` + `tests/unit/**/*.{test,spec}.{ts,tsx}`,
exclude `tests/e2e/**`. Coverage: v8; reporter text/lcov/html; include `src/**/*.{ts,tsx}`;
exclude `*.d.ts`, `src/types/**`, testler, `src/app/**/layout.tsx`, `src/app/**/error.tsx`,
`src/app/providers.tsx`. Eşikler: **lines 60, functions 60, branches 55, statements 60**.

`vitest.setup.ts`: jest-dom, her testten sonra `cleanup()`, `matchMedia`/`ResizeObserver`/
`IntersectionObserver` polyfill'leri, `alert`/`confirm` mock'ları,
`URL.createObjectURL`/`revokeObjectURL` polyfill'i, sahte `NEXT_PUBLIC_SUPABASE_*` env'leri.

`playwright.config.ts`: `testDir './tests/e2e'`, `fullyParallel`, CI'da `retries: 2` ve
`workers: 1`, reporter `html`(open:never) + `list`, `baseURL` = `PLAYWRIGHT_BASE_URL` veya
`http://localhost:3000`, `trace: on-first-retry`, `screenshot: only-on-failure`,
`video: retain-on-failure`. Projeler: `chromium`, `Mobile Chrome` (Pixel 5).
`webServer`: `npm run build && npm run start`, `reuseExistingServer: !CI`, timeout 180 sn.

### 12.7 Docker / Compose

Kök `Dockerfile` (çok aşamalı, `node:20-alpine`): `deps` (`npm ci`) → `builder`
(build-arg olarak 3 `NEXT_PUBLIC_*`, `npm run build`) → `runner` (non-root `nextjs:nodejs`
uid/gid 1001, `.next/standalone` + `.next/static` + `public`, `PORT=3000`,
`HEALTHCHECK` `wget --spider .../api/health`, `CMD node server.js`).

`docker-compose.yml`: `web` (3000, `.env.local` env_file, `AI_BACKEND_URL=http://ai-backend:8000`,
`ai-backend` healthy olana kadar bekler), `ai-backend` (8000, healthcheck),
`supabase-db` (opsiyonel `supabase/postgres:15.8.1.020`, 54322, migration'lar read-only mount).
Ortak ağ `coaching-net`, `restart: unless-stopped`. Tam yerel Supabase için `npx supabase start`
önerilir. `docker-compose.override.yml.example` geliştirme (bind-mount + hot reload) içindir.

### 12.8 CI (`.github/workflows/ci.yml`)

Tetikleyici: `push` (main) ve `pull_request`. Concurrency ile iptal, `permissions: contents: read`.
Global env'de sahte `NEXT_PUBLIC_*` değerleri.

| Job               | Koşul                                        | Adımlar                                                                                                            |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `frontend`        | her zaman                                    | node 20 → `npm ci` → `lint` → `type-check` → `test:coverage` → coverage artifact → `build`                         |
| `backend`         | her zaman                                    | `setup-uv` (py 3.12) → `uv sync --all-extras --dev` → `ruff check` → `ruff format --check` → `mypy app` → `pytest` |
| `e2e`             | **yalnız `pull_request`**, `needs: frontend` | `npm ci` → `playwright install --with-deps chromium` → `test:e2e` → rapor artifact                                 |
| `docker`          | `needs: [frontend, backend]`                 | buildx ile web ve ai-backend imajlarını derler (push yok)                                                          |
| `required-checks` | `always()`                                   | frontend/backend/docker `success` olmalı; `e2e` `failure` olmamalı (skipped kabul edilir)                          |

Matrix yok. `e2e` job'u yerel Supabase yığını başlatmıyor ve yerel `NEXT_PUBLIC_SUPABASE_*`
değerlerini set etmiyor — bu haliyle PR'da geçmesi beklenmez (bilinen risk, `PROGRESS.md` §5).

`dependabot.yml`: haftalık; npm (`/`, `next` / `react` / `dev-dependencies` grupları),
pip (`/ai_backend`), github-actions (`/`), docker (`/` ve `/ai_backend`). Her ekosistemde
en fazla 5 açık PR, commit prefix `chore(deps)`.

### 12.9 `supabase/config.toml`

`project_id = "my-coaching-app"`. API 54321 (`public, storage, graphql_public`, `max_rows 1000`),
DB 54322 (shadow 54320, major 15), pooler kapalı, seed açık (`./seed.sql`), realtime açık,
Studio 54323, `[local_smtp]` 54324, storage açık (`file_size_limit "50MiB"`), analytics kapalı.
Auth: `site_url http://localhost:3000`, jwt_expiry 3600, refresh token rotation açık,
**`[auth] enable_signup = false`** (self-servis kayıt kapalı; hesapları yalnız koç/service_role
açar), `[auth.email] enable_signup = true`, `enable_confirmations = false`. Dosyada bu iki
farklı `enable_signup` anahtarının karıştırılmaması için uzun bir açıklayıcı yorum var.

---

## 13. Ortam değişkenleri

Kaynaklar: `.env.example` (10 değişken) ve `src/env.ts` (zod ile ayrı istemci/sunucu şemaları).
**Hiçbir gerçek sır değeri bu dokümana yazılmamıştır.**

| Değişken                        | Zorunlu                                  | Varsayılan              | Nerede kullanılır                                                      | İstemciye açık mı        |
| ------------------------------- | ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | **Evet** (url)                           | yok                     | `lib/supabase/{client,server,admin}.ts`, `next.config.mjs` CSP üretimi | **Evet**                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Evet** (min 20 karakter)               | yok                     | `lib/supabase/{client,server}.ts`                                      | **Evet**                 |
| `NEXT_PUBLIC_APP_URL`           | Hayır                                    | `http://localhost:3000` | Mutlak URL/e-posta linki üretimi                                       | **Evet**                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Hayır (yoksa admin işlemleri hata verir) | yok                     | `lib/supabase/admin.ts` (RLS bypass)                                   | Hayır                    |
| `AI_BACKEND_URL`                | Hayır                                    | `http://localhost:8000` | `lib/api/proxy.ts`                                                     | Hayır                    |
| `AI_BACKEND_API_KEY`            | Hayır                                    | yok                     | `lib/api/proxy.ts` → upstream `X-API-Key`                              | Hayır                    |
| `NODE_ENV`                      | Hayır                                    | `development`           | `logger.ts` (pino-pretty), `providers.tsx`, `env.ts` test dalı         | Hayır (Next inline eder) |
| `LOG_LEVEL`                     | Hayır                                    | `info`                  | `logger.ts` (pino seviyesi)                                            | Hayır                    |
| `RATE_LIMIT_WINDOW_MS`          | Hayır                                    | `60000`                 | `middleware.ts`                                                        | Hayır                    |
| `RATE_LIMIT_MAX_REQUESTS`       | Hayır                                    | `60`                    | `middleware.ts`                                                        | Hayır                    |

`src/env.ts` davranışı: `clientEnv` modül seviyesinde parse edilir ve doğrulama başarısızsa
**hata fırlatır** (istisna: `NODE_ENV === 'test'` iken sahte varsayılanlara düşer).
`getServerEnv()` tarayıcıda çağrılırsa hata fırlatır, sonuç modül seviyesinde önbelleklenir;
`resetServerEnvCache()` test yardımcısıdır. Hata mesajlarında **yalnız alan adı ve mesaj**
yazılır, değerler asla yazılmaz.

`ai_backend` tarafındaki ayrı değişkenler (bkz. §10.5): `APP_NAME`, `VERSION`, `ENVIRONMENT`,
`CORS_ORIGINS`, `API_KEY`, `RATE_LIMIT`, `LOG_LEVEL`, `LOG_JSON`, `DATA_DIR`.

**`.env.local` durumu:** Dosya mevcut ve yalnız 3 değişken içeriyor
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
`NEXT_PUBLIC_SUPABASE_URL` **yerel yığını değil, barındırılan (hosted) bir Supabase projesini**
gösteriyor; proje referansı `nxftmxkpmuyeelrmwofv`. Migration'lar yalnız yerel yığına
uygulanmıştır. Bu, iki pratik sonuç doğurur: (1) `npm run dev`/`build` varsayılan olarak
barındırılan projeye bağlanır; (2) E2E koşumundan önce `NEXT_PUBLIC_SUPABASE_URL` ve
`NEXT_PUBLIC_SUPABASE_ANON_KEY` yerel değerlerle geçersiz kılınmalıdır, aksi halde testler
gerçek veritabanına yazar (`docs/PROGRESS.md` §5).

---

## 14. Plana göre boşluk analizi

`active_planprogram.md` v1.0 ile mevcut durumun karşılaştırması. "Faz" sütunu planın kendi faz
numaralarıdır; `docs/PROGRESS.md` §7'de bazılarının yeniden sıralanması önerilmiştir.

### 14.1 Mimari ve topoloji

| Planın istediği                                            | Mevcut durum                                                                               | Boşluk                                     | Faz            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------- |
| pnpm workspaces + Turborepo monorepo                       | Tek repo, npm, `package-lock.json`                                                         | Monorepo altyapısı tamamen yok             | Faz 0          |
| `apps/web` (mevcut app taşınır)                            | Uygulama repo kökünde (`src/`)                                                             | Taşıma yapılmadı                           | Faz 0          |
| `apps/mobile` — Expo + Expo Router, 5 tab                  | Yok                                                                                        | Mobil uygulama tamamen yok                 | Faz 0          |
| `packages/types`, `packages/api-client`, `packages/config` | Yok; tipler `src/types`, API `src/lib/api`, şemalar `src/lib/validation`                   | Paylaşılan paketler yok (I-3 karşılanamaz) | Faz 0          |
| TypeScript strict migrasyonu                               | **TAMAM** — `strict` + `noUncheckedIndexedAccess` + `allowJs:false`                        | Boşluk yok                                 | Faz 0 (bitti)  |
| Next.js 15                                                 | `next 16.2.10`                                                                             | Plan teknoloji tablosu güncel değil        | Plan revizyonu |
| `docs/adr/NNNN-<slug>.md` dizini                           | Dizin yok; 6 "ADR-lite" kararı `docs/ARCHITECTURE.md` §7'de gömülü                         | ADR dizini ve formatı yok                  | Sürekli        |
| I-1: AI'a yalnız proxy üzerinden erişim                    | **TAMAM** — `lib/api/ai.ts` yalnız `/api/ai/*` çağırıyor, anahtar sunucuda                 | Boşluk yok                                 | —              |
| I-2: `service_role` yalnız sunucuda                        | **TAMAM** — `admin.ts` `server-only`, barrel'dan hariç                                     | Edge Function yok (kapsamı daralıyor)      | —              |
| I-5: her public API girdi/çıktısı runtime doğrulanır       | Girdiler zod/Pydantic ile doğrulanıyor; **AI proxy yanıtı doğrulanmadan aynen iletiliyor** | Yanıt doğrulaması eksik                    | Faz 1          |

### 14.2 Veri modeli

| Planın istediği                                                                                                        | Mevcut durum                                                                                                       | Boşluk                                                                                              | Faz     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------- |
| `profiles.role` = `coach`/`client`                                                                                     | `user_role` enum'u `admin`/`student`                                                                               | Enum yeniden adlandırma + tüm RLS/RPC/kod güncellemesi                                              | Faz 1   |
| `profiles.coach_id` + CHECK                                                                                            | Kolon yok; tek koç varsayımı koda gömülü (`useAdminId()` en eski admini seçer)                                     | Koç-danışan ilişkisi modellenmemiş (PROGRESS §7: tek koçlu modele sadeleştirilmesi kararlaştırıldı) | Faz 1   |
| `workout_plans` + `workout_plan_exercises` (versiyon, `is_active`, `video_url`, `target_sets/reps/weight`, `position`) | `profiles.workout_plan` **text** kolonunda JSON string                                                             | Normalize tablolar, versiyonlama ve veri migrasyonu yok                                             | Faz 1   |
| `workout_logs` + `workout_log_sets` (`actual_reps`, `actual_weight_kg numeric(5,2)`, `rpe numeric(3,1)`)               | Tek düz `workout_logs` (`exercise_name` serbest metin, `weight_kg numeric`, `reps int`, `rpe int`)                 | Log/set ayrımı, plana FK, `completed_at`, ondalıklı RPE yok                                         | Faz 1–2 |
| `nutrition_plans` + `nutrition_plan_meals` (kcal/makro hedefleri, CHECK ≥ 0)                                           | `profiles.nutrition_plan` text/JSON string                                                                         | Normalize tablolar yok                                                                              | Faz 1   |
| `nutrition_logs` (`photo_path`, `ai_estimate`, `user_override`, `status`)                                              | Yok; `daily_logs` yalnız günlük toplam makro + su + sodyum tutuyor                                                 | Öğün bazlı log ve AI tahmin akışı yok                                                               | Faz 1/3 |
| `progress_entries` (`weight_kg`, `measurements jsonb`, UNIQUE(user, date))                                             | Yok; kilo yalnız `form_checks.current_weight` içinde                                                               | Ölçüm tablosu ve günlük tekilleştirme yok                                                           | Faz 1/4 |
| `progress_photos` (`angle` enum, private bucket path)                                                                  | Yok; `form_checks.front_pose_url`/`back_pose_url` tam public URL                                                   | Açı etiketi, ayrı tablo, private path yok                                                           | Faz 1/4 |
| `form_checks.status` (`pending`/`reviewed`), `coach_feedback`, `reviewed_at`                                           | Tablo var, **bu üç alan yok**                                                                                      | Koç geri bildirim akışı modellenmemiş                                                               | Faz 1/2 |
| `conversations` (UNIQUE(coach_id, client_id)) + `messages.read_at`, `kind` enum                                        | `conversations` yok; `messages` düz sender/receiver, `is_read boolean`                                             | Konuşma varlığı, `read_at`, sistem mesajı türü yok                                                  | Faz 1/2 |
| `coach_notes`                                                                                                          | Yok                                                                                                                | Tablo yok                                                                                           | Faz 1   |
| `health_metrics`, `sleep_sessions`, `recovery_scores`                                                                  | Hiçbiri yok                                                                                                        | Sağlık verisi ve recovery altyapısı tamamen eksik                                                   | Faz 5–6 |
| `reminders`, `device_push_tokens`, `notification_outbox`, `reminder_dispatch_log`                                      | Yok. Uygulama içi `notifications` tablosu var (push değil)                                                         | Hatırlatma/push altyapısı yok                                                                       | Faz 7   |
| `ai_usage_counters` (kullanıcı başına 10 analiz/gün)                                                                   | Yok; hız sınırı yalnız IP bazlı bellek içi                                                                         | Kullanıcı bazlı kalıcı kota yok                                                                     | Faz 3   |
| Her FK'ye indeks, zaman serilerinde `(user_id, <date> DESC)`                                                           | **TAMAM** — tüm FK'lerde indeks, `daily_logs`/`workout_logs`/`form_checks`/`notifications` composite DESC indeksli | `messages(conversation_id, created_at DESC)` — kolon olmadığı için yok                              | Faz 1   |

### 14.3 RLS ve storage

| Planın istediği                                                                         | Mevcut durum                                                                               | Boşluk                                                                    | Faz     |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------- |
| Koç yalnız plan tabloları / `coach_feedback` / `coach_notes` / sistem mesajlarına yazar | `is_admin()` tüm tablolarda UPDATE/DELETE veriyor; INSERT'te koç danışan adına yazamıyor   | Koç yazma yetkisi fazla geniş (UPDATE/DELETE)                             | Faz 1   |
| İlişki `profiles.coach_id` üzerinden `EXISTS(...)` deseniyle                            | `is_admin()` deseni (tek koç varsayımı)                                                    | Çok koçlu izolasyon yok (tek koç kararı verilirse sorun değil)            | Faz 1   |
| pgTAP/SQL tabanlı RLS test script'i, CI'da                                              | Yok; yalnız elle SQL testleri (§8.4)                                                       | Otomatik ve tekrarlanabilir RLS testi yok                                 | Faz 1   |
| `meal-photos`, `progress-photos`, `form-checks` bucket'ları — **hepsi private**         | `avatars` ve `form-checks-media`, **ikisi de public**; `meal-photos`/`progress-photos` yok | I-4 ihlali; signed URL akışı yok                                          | Faz 1   |
| Path sözleşmesi `<user_id>/<uuid>.<ext>`                                                | `<uid>-<uuid>.<ext>` (kök) ve `poses/<uid>-<uuid>.<ext>`                                   | Klasör tabanlı prefix yerine tire ayraçlı ad; politika `LIKE` ile eşliyor | Faz 1   |
| Foto ≤ 10 MB, video ≤ 100 MB, MIME whitelist                                            | Bucket limiti 5 MiB, yalnız 6 görsel MIME tipi                                             | Video yükleme hiç desteklenmiyor                                          | Faz 1/2 |
| Signed URL TTL ≤ 1 saat                                                                 | `getPublicUrl()` kullanılıyor                                                              | Signed URL üretimi yok                                                    | Faz 1   |

### 14.4 API sözleşmesi ve uygulama akışları

| Planın istediği                                                                                 | Mevcut durum                                                                                                  | Boşluk                                                                       | Faz            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| `Result<T> = {ok,data} \| {ok,error}` — exception ile akış kontrolü yok                         | `apiFetch` `ApiError` **fırlatıyor**; hook'lar TanStack Query hata durumuna güveniyor                         | Sözleşme farkı (PROGRESS §7: planın bu maddesinin değiştirilmesi öneriliyor) | Plan revizyonu |
| `AppError { code, message, retryable }`                                                         | `ApiError { status, code, message, details?, requestId? }`                                                    | `retryable` alanı yok                                                        | Faz 1          |
| Query key `[domain, entity, params]`, merkezi üretici                                           | Merkezi `queryKeys` var ama şema `[entity, ...params]`                                                        | Üç seviyeli domain katmanı yok                                               | Faz 1          |
| Ortak zod şemaları `packages/types/schemas`, Pydantic ile birebir alan adı                      | Şemalar `src/lib/validation/schemas.ts`; alan adları Pydantic ile **birebir eşleşiyor** (doğrulandı)          | Paylaşım paketi yok, kopya sözleşme elle senkronda                           | Faz 0/1        |
| Plan yayınlama = yeni `version`, eski `is_active=false`                                         | Plan kaydetme profildeki JSON string'i **üzerine yazar**                                                      | Versiyon geçmişi yok, eski loglar plana bağlı değil                          | Faz 2          |
| Realtime mesaj < 2 sn, okundu `read_at`, unread sayacı                                          | Realtime INSERT aboneliği var; `is_read` kolonu var ama UI'da okundu işaretleme akışı yok                     | `read_at`, unread sayacı, sistem mesajları yok                               | Faz 2          |
| Form check: `pending` kuyruğu, signed URL ile medya, geri bildirim → `reviewed` + sistem mesajı | Form check gönderiliyor ve koç görüyor; durum/geri bildirim alanı yok                                         | Kuyruk ve geri bildirim akışı yok                                            | Faz 2          |
| `POST /v1/analyze/meal-photo`, `VisionProvider` adapter, Anthropic sağlayıcı                    | `ai_backend`'de vision/LLM yok; uçlar kural tabanlı `analyze/workout`, `analyze/nutrition`, `recommendations` | Yemek fotoğrafı makro tahmini tamamen eksik                                  | Faz 3          |
| AI proxy'de auth zorunlu, `user_id` JWT'den                                                     | `/api/ai/*` **kimlik doğrulama yapmıyor**                                                                     | Yetkisiz çağrı mümkün; kullanıcı bazlı kota kurulamaz                        | Faz 3          |
| `progress.getTrends`, önce/sonra slider, koç salt-okunur                                        | Kilo grafiği `form_checks`'ten (`StatsTab`), kıyaslama `AdminUserManagement`'ta                               | Tek endpoint'li trend sözleşmesi yok                                         | Faz 4          |
| HealthKit / Health Connect senkronu                                                             | Yok                                                                                                           | Faz 5 tamamen açık                                                           | Faz 5          |
| `compute_recovery()` saf fonksiyonu + `docs/recovery-score.md`                                  | Yok                                                                                                           | Faz 6 tamamen açık                                                           | Faz 6          |
| Edge Functions + pg_cron (`send-reminders`, `recovery-daily`), outbox pattern                   | `supabase/functions/` dizini yok, pg_cron kurulu değil (`pg_extension` listesinde yok)                        | Zamanlama altyapısı yok                                                      | Faz 7          |
| `GET /v1/widget-summary` (tek SQL, ≤150 ms)                                                     | Yok                                                                                                           | Faz 8 açık                                                                   | Faz 8          |
| `activity.getHistory({range})` cursor pagination                                                | Yok                                                                                                           | Faz 9 açık                                                                   | Faz 9          |
| Test piramidi (api-client unit, component, E2E, mobil, pytest ≥%80 services, RLS SQL CI'da)     | Vitest 180 + Playwright 28 + pytest 63 (eşik %70) mevcut; mobil ve CI'daki RLS testi yok                      | Kapsam eşiği plandan düşük, RLS testi CI'da yok, mobil test yok              | Faz 10         |
| Gözlemlenebilirlik: `request_id` forward                                                        | `ai_backend` gelen `X-Request-ID`'yi kullanıyor; Next proxy **her istekte yeni id üretiyor**                  | Uçtan uca korelasyon kopuk                                                   | Faz 10         |

---

## 15. Bilinen borçlar ve riskler

### 15.1 Kayıtlı borçlar (özet + referans)

Ayrıntılar için `UPGRADE_NOTES.md` §7 ve `docs/PROGRESS.md` §5'e bakın; burada yalnız güncel
durum notlanmıştır.

| Borç                                                                                   | Kaynak                            | Bu oturumdaki durum                                                                                                                                |
| -------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage bucket'ları public, vücut fotoğrafları URL'yi bilen herkese açık               | UPGRADE_NOTES §7, PROGRESS §5/§6a | **Doğrulandı** — `storage.buckets.public = true` (ikisi de), SELECT politikaları `anon`'u da kapsıyor                                              |
| `form_checks.*_pose_url` ve `profiles.avatar_url` tam URL saklıyor (yol değil)         | PROGRESS §6a                      | Doğrulandı; Faz 1'de veri dönüşümü gerekecek                                                                                                       |
| Planlar `profiles` içinde JSON string (`text`) — sorgulanamaz, versiyonsuz             | UPGRADE_NOTES §7                  | Doğrulandı (`nutrition_plan`, `workout_plan` kolonları `text`)                                                                                     |
| Rol enum'u `admin`/`student` (ürün dili koç/danışan)                                   | ADR-3, UPGRADE_NOTES §7           | Doğrulandı; Faz 1 şema yazımına bağlandı                                                                                                           |
| Bellek içi rate limiter (Next middleware + FastAPI slowapi) tek instance'ta çalışır    | UPGRADE_NOTES §7                  | Her iki tarafta da doğrulandı                                                                                                                      |
| CSP'de `script-src 'unsafe-inline'`                                                    | UPGRADE_NOTES §7                  | Doğrulandı, kodda TODO olarak işaretli                                                                                                             |
| `next-pwa` v5 sürdürülmüyor; PWA `workout_logs` yanıtlarını 7 gün cihazda tutuyor      | UPGRADE_NOTES §7, PROGRESS §5     | `profiles` cache'i kaldırılmış; `workout_logs` 7 gün cache'i **hâlâ duruyor**; logout'ta `offline-*`/`workbox-*` temizliği eklenmiş (`useSignOut`) |
| `src/middleware.ts` — Next 16 `proxy` konvansiyonunu istiyor                           | UPGRADE_NOTES §7, PROGRESS §6a    | Dosya hâlâ `middleware.ts`                                                                                                                         |
| `npm audit`: 18 zafiyet (2 kritik, 13 yüksek), çoğu `next-pwa` v5 ağacından            | PROGRESS §5                       | Bu oturumda yeniden ölçülmedi — **doğrulanmadı**                                                                                                   |
| CI'daki `e2e` job'u yerel Supabase yığını + seed gerektiriyor, workflow'da bu adım yok | PROGRESS §5                       | `ci.yml` incelendi, doğrulandı; ayrıca `e2e` yalnız `pull_request`'te koşuyor                                                                      |
| `data/exercises.csv` 8,7 MB düz dosya                                                  | UPGRADE_NOTES §7                  | Doğrulandı (8.693.873 bayt)                                                                                                                        |
| `src/types/database.ts` elle yazılmıştı, şemayla diff'lenmeli                          | UPGRADE_NOTES §7                  | **Kapandı** — dosya artık `db:types` çıktısı; içerik canlı şemayla kolon kolon uyumlu                                                              |

### 15.2 Bu envanterde ortaya çıkan, hiçbir yerde kayıtlı olmayan bulgular

| #   | Bulgu                                                                                                                                                                | Kanıt                                                                                                   | Etki                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Danışan koçunun profilini göremiyor** → `useAdminId()` `null` döner → `MessagesTab`'da `chatPartnerId` `undefined` kalır → danışan mesajlaşma sekmesini kullanamaz | `profiles_select` = `id = auth.uid() OR is_admin()`; canlı SQL testi (§8.4 #16) `NULL-DONDU`            | **Yüksek** — ürünün temel akışlarından biri (mesajlaşma) RLS altında danışan tarafında çalışmıyor. E2E paketi mesajlaşmayı kapsamadığı için testler yeşil kalıyor.                                                                                                   |
| 2   | **Danışan koça bildirim oluşturamıyor** — `useSubmitProgramForApproval` `notifications.student_id = coachId` yazmaya çalışırsa RLS reddeder                          | `notifications_insert` `WITH CHECK (is_admin() OR student_id = auth.uid())`; canlı SQL testi (§8.4 #17) | **Yüksek** — pratikte `adminId` zaten `null` olduğu için kod kendine bildirim yazıyor; koç "onay bekliyor" bildirimi hiç almıyor. Ayrıca `program_approvals` insert'i başarılı olduktan sonra bildirim insert'i patlarsa kısmi yazım oluşur (işlem sarmalayıcı yok). |
| 3   | `src/app/actions.ts` içindeki 4 server action **hiçbir yerden çağrılmıyor**                                                                                          | grep: `@/app/actions` importu yok                                                                       | Orta — bakım yükü ve yanıltıcı güvenlik izlenimi; UI aynı işleri istemci tarafı supabase-js ile yapıyor                                                                                                                                                              |
| 4   | `/api/ai/*` proxy route'larında **oturum kontrolü yok**                                                                                                              | `proxy.ts` yalnız zod doğrulaması yapıyor; auth çağrısı yok                                             | Orta-yüksek — plan §5.3'ün açık ihlali; kullanıcı bazlı kota (Faz 3) kurulamaz                                                                                                                                                                                       |
| 5   | `ai_backend` deprecated uçları (`/api/generate-ai-workout`, `/api/generate-ai-diet`) `api_key_guard` ve 20/dk limitinden **muaf**                                    | `legacy_router` tanımlarında `dependencies` ve `@limiter.limit` yok                                     | Orta — `API_KEY` ayarlansa bile bu uçlar anahtarsız çağrılabilir                                                                                                                                                                                                     |
| 6   | `ai_backend/uv.lock` **artık mevcut** (261 KB, git'te izleniyor)                                                                                                     | `ls -la`, `git ls-files`                                                                                | Düşük — `UPGRADE_NOTES.md` §7 ve `PROGRESS.md` §5'teki "uv.lock üretilmedi" satırları güncelliğini yitirmiş; Dockerfile zaten `--frozen` kullanıyor                                                                                                                  |
| 7   | `ai_backend/data/` boş; `csv_loader.py` çalışma zamanında hiç kullanılmıyor; besin/egzersiz verisi Python içinde hard-coded (22 besin, 7 grup)                       | Dizin içeriği + import grafiği                                                                          | Düşük-orta — "CSV tabanlı veri" izlenimi gerçekle uyuşmuyor; AI çıktılarının çeşitliliği bu sabit listelerle sınırlı                                                                                                                                                 |
| 8   | `data/` altındaki CSV'ler (8,7 MB dahil) hiçbir migration/seed tarafından import edilmiyor; `exercises` ve `food_database` tablolarında yalnız 10'ar demo satır var  | Satır sayımı + seed incelemesi                                                                          | Orta — `useExercises()`/`useFoods()` üzerine kurulu egzersiz kütüphanesi ve besin arama özellikleri gerçek veri olmadan işlevsiz                                                                                                                                     |
| 9   | `orjson` ve `python-multipart` bağımlılıkları kodda hiç kullanılmıyor                                                                                                | import grafiği                                                                                          | Düşük — gereksiz bağımlılık yüzeyi                                                                                                                                                                                                                                   |
| 10  | İki grafik kütüphanesi aynı anda kurulu ve **ikisi de kullanımda**: `StatsTab` → `chart.js`/`react-chartjs-2`, `AdminUserManagement` → `recharts`                    | `package.json` + grep                                                                                   | Düşük-orta — bundle şişmesi ve iki farklı grafik API'si; tek kütüphanede birleştirilmeli (plan §1.3 web için recharts diyor)                                                                                                                                         |
| 11  | RLS asimetrisi: koç danışan adına INSERT **yapamıyor** ama UPDATE/DELETE yapabiliyor                                                                                 | §8.4 #14 ve politika listesi                                                                            | Orta — plan §3.2 INSERT kısıtını istiyor (uyumlu) ama UPDATE/DELETE genişliği plana aykırı; ayrıca "koç danışan adına log giremez" ürün kararı hiçbir yerde yazılı değil                                                                                             |
| 12  | `README.md` çalışma ağacında **çözülmemiş birleştirme çakışması** (`UU`) ile duruyor                                                                                 | `git status --porcelain`                                                                                | Orta — dosya şu an tutarsız; commit edilmeden önce çözülmeli                                                                                                                                                                                                         |
| 13  | `.env.local` `.env.example`'daki 10 değişkenden yalnız 3'ünü içeriyor                                                                                                | Değişken adı karşılaştırması (değerler okunmadı)                                                        | Düşük — kalan 7'si `src/env.ts` varsayılanlarıyla telafi ediliyor; `AI_BACKEND_URL` varsayılanı `http://localhost:8000`                                                                                                                                              |
| 14  | `useMessages` realtime aboneliği `public.messages` üzerindeki **tüm** INSERT'leri dinleyip istemcide filtreliyor (sunucu tarafı filtre yok)                          | `useMessages.ts` `postgres_changes` yapılandırması                                                      | Düşük-orta — RLS yayını sınırlasa da ölçekte gereksiz trafik; Faz 2'de `conversation_id` filtresine geçilmeli                                                                                                                                                        |
| 15  | `src/hooks/*` (11 modül, 35 hook) ve API route handler'ları için **hiç birim testi yok**                                                                             | `tests/unit/` içeriği                                                                                   | Orta — kapsam eşikleri (%60/%55) tuttuğu için CI bu boşluğu göstermiyor                                                                                                                                                                                              |

---

## 16. Özet

- **Gerçek durum:** Tek repo; TypeScript strict Next.js 16 uygulaması + 9 tablolu RLS korumalı
  Supabase şeması + kural tabanlı (LLM'siz) FastAPI servisi. Test/CI/Docker altyapısı kurulu ve
  büyük ölçüde yeşil.
- **Plana uzaklık:** `active_planprogram.md`'nin veri modelinin yaklaşık **üçte biri** mevcut
  (profiller, düz loglar, form check, mesaj); plan/versiyon, ilerleme, sağlık, recovery,
  hatırlatma ve AI vision katmanlarının **hiçbiri yok**. Monorepo ve mobil uygulama sıfırdan
  kurulacak.
- **Faz 1 öncesi kapatılması gereken en kritik üç şey:** (1) storage private + signed URL geçişi
(I-4 ihlali), (2) §15.2 #1 ve #2'deki RLS kaynaklı işlevsel kırıklar, (3) `/api/ai/*`
uçlarında oturum zorunluluğu.
</content>

</invoke>
