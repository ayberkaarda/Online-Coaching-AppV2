# Arşiv — Borç turu (2026-08-19)

**Özet.** Faz 4.5 kapanışının hemen ardından, Fable danışmasıyla belirlenen sırayla
mini bir borç turu yürütüldü: B-050, B-046, B-019, B-045, B-055 **kapandı**; B-030
**kısmen** kapandı (yordam + script var, gerçek koşu kullanıcıda); B-023 + B-040
görev talimatı gereği bu turda ele alınmadı (yıkıcı silme onayı gerektirir, kullanıcıya
bırakıldı). Ayrıca aynı HEAD (`05af580`) üzerinde koşan CI'da kırmızı çıkan iki job
(`security`, `e2e`) kök nedenleri ölçülüp onarıldı. Tur üç yeni borç açtı: B-056, B-057,
B-058.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Faz 4.5'in kendi kapanış kaydı ayrı bir dosyadadır ve bu turda tekrar yazılmadı:
> [`archive/progress-faz-4.5-monorepo-mobil-temel.md`](progress-faz-4.5-monorepo-mobil-temel.md).

---

## Turun amacı ve sırası

Faz 4.5 kod tarafı tamamlanıp commit'lendikten sonra `docs/PROGRESS.md` §5'te sıradaki
iş olarak yedi maddelik bir mini borç turu planlanmıştı; sıralama Fable'a danışılarak
belirlenmişti (bkz. `archive/progress-faz-4.5-monorepo-mobil-temel.md` "Sonraki adımlar").
Bu turda sıradaki yedi maddeden beşi ele alındı — B-050, B-046, B-030, B-019, B-045, B-055
(altısı, B-023+B-040 hariç) — B-023 + B-040 (E2E veri hijyeni) CLAUDE.md'nin yıkıcı komut
onay kuralı gereği kullanıcı onayı gerektirdiği için bu turda atlandı ve kullanıcıya
bırakıldı.

## Kapanan borçlar

### B-050 — `packages/api-client`'ın `sonner` bağımlılığı kesildi

Yeni `packages/api-client/src/notify.tsx`: `Notifier` tipi + `NotifierProvider` +
`useNotifier()`. Sağlayıcı yoksa fırlatmaz, modül seviyesindeki tek `NOOP_NOTIFIER`
sabitine düşer ve ilk yutulan bildirimde `@repo/logger` ile bir kez uyarır. 13 hook
(`useAi, useDailyLogs, useFormChecks, useMessages, useNotifications, useNutritionLogs,
usePlans, useProfile, useProgramApprovals, useProgressEntries, useProgressPhotos,
useSession, useWorkoutLogs`) `toast.*` → `notify.*`'a çevrildi. `useFormChecks`'teki hook
DIŞI `publishFormCheckReviewedEvent()`'e `notifier` açık parametre olarak eklendi
(koşullu hook çağrısı yaratılmadı). Web tarafı: `apps/web/src/lib/notifier.ts` (modül
seviyesinde sabit `sonnerNotifier`) + `providers.tsx`'te `NotifierProvider`.
`package.json`'dan `sonner` silindi.

KANIT: `grep -rn "sonner" packages/` → boş.

Bu borcun kapanmasıyla `packages/api-client` artık gerçekten platform-nötr; mobil bu
hook'ları import ettiğinde Metro grafiğine web'e özgü DOM toast kütüphanesini çekmiyor.

### B-046 — coverage eşiği 52 → 60'a geri çıkarıldı

`vitest.config.ts` coverage `lines`/`statements` eşiği CI onarımında 60'tan 52'ye
indirilmişti (bkz. Faz 4.5 arşivi); bu tur asıl nedeni (test edilmeyen büyük dosyalar)
çözüp eşiği geri çıkardı. Ölçüm: taban %53.85 (4975/9238) → **%61.86**. 29 yeni davranış
testi: `apps/web/tests/unit/messages-tab.test.tsx` (16 test) ve
`apps/web/tests/unit/form-check-tab.test.tsx` (13 test). `WorkoutTab` testine gerek
kalmadı — `MessagesTab` + `FormCheckTab` ikisi birlikte eşiği aşmaya yetti.
`functions: 60` / `branches: 55` eşikleri DEĞİŞMEDİ (zaten karşılanıyordu).

### B-019 — koç onayı tek transaksiyona indi

`useApproveProgram`'ın üç atomik olmayan çağrısı (plan yazımı, onay güncellemesi,
bildirim) tek bir Postgres fonksiyonuna taşındı. Yeni migration
`supabase/migrations/20260819090000_approve_program_atomic.sql`:
`public.approve_program(p_approval_id, p_client_id, p_plan)`.

- **SECURITY INVOKER** — `prosecdef=false` doğrudan sorguyla kanıtlandı (yani fonksiyon
  çağıranın RLS bağlamıyla çalışır, ayrıcalık yükseltmesi yok).
- `search_path = public, pg_temp` pinli (arama yolu enjeksiyonuna kapalı).
- EXECUTE yalnız `authenticated` + `service_role`'e verildi; `anon` ve `PUBLIC`'ten
  kaldırıldı.
- Plan yazımı `save_workout_plan` **çağrılarak** yapılıyor — mantık kopyalanmadı, tek
  kaynak korunuyor.
- Onay yine `UPDATE ... SET status='approved'` ile gidiyor ki
  `program_approvals_guard_review()` trigger'ı `reviewed_by`/`reviewed_at`'i doldursun
  (AC-07 korunuyor, iki ayrı yazım yolu yaratılmadı).
- Üç ayrı SQLSTATE ile hata ayrımı: kayıt yok `P0002`; `p_client_id` onayın sahibiyle
  eşleşmiyor `22023` (sözleşmede öngörülmeyen EK bir kapı — iki uuid parametre yer
  değiştirirse RLS bunu yakalamaz, sessizce yanlış danışanın planı ezilirdi; bu yüzden
  fonksiyon içinde açıkça kontrol edildi); yetki reddi `42501`.

Hook tarafı tek `supabase.rpc('approve_program', ...)` çağrısına indi. RLS senaryoları
**113 → 118**'e çıktı: 114 (pozitif yol, üç etkinin de gerçekleştiği doğrulanıyor), 115
(danışan reddi + yan etki olmadığının kanıtı), 116 (çaprazlama senaryosu — yeni
eşleşme kapısının testi), 117 (atomiklik kanıtı — var olmayan onay id'sinde plan satırı
0 ve bildirim farkı 0), 118 (yetki yüzeyi sürüklenme testi — `anon`/`PUBLIC` EXECUTE
almadığının kilidi). Yeni unit test `apps/web/tests/unit/program-approvals.test.ts`
(7 test) eski üç adımlı akışın geri gelmesine karşı kapı kuruyor — testlerden biri
`supabase.from()`'un hiç çağrılmaması gerektiğini doğruluyor.

Not: RLS senaryo yazımı sırasında B-058 (çok-koç yetki izolasyonu eksikliği) ölçüldü —
bugünkü tek-koç varsayımıyla "başka bir koç onaylayamaz" senaryosu yazılamadı, çünkü bu
iddia bugün doğru değil. Ayrıntı için aşağıdaki "Yeni açılan borçlar" bölümüne bakın.

### B-045 — eski `sb-*` localStorage artıkları temizleniyor

`apps/web/src/lib/legacy-auth-cleanup.ts`: `clearLegacySupabaseAuthStorage()`
`^sb-.+-auth-token(\.\d+)?$` kalıbına uyan `localStorage` anahtarlarını (A-05/A-14
turunda cookie'ye geçişten kalan JWT + refresh token artıkları) mount'ta bir kez siler.
SSR güvenli (window kontrolü), `SecurityError` toleranslı (private browsing/storage
erişimi engelli tarayıcılarda sessizce yutulur), yalnızca silinen anahtar SAYISI
loglanır — token değeri hiçbir zaman loglanmaz. `Providers`'a tek `useEffect` eklendi.
5 yeni test.

### B-055 — dependabot monorepo'ya taşındı

`.github/dependabot.yml`: npm ekosistemi artık tek `/` yerine `directories` globu ile
dört konumu tarıyor (`/`, `/apps/web`, `/apps/mobile`, `/packages/*`). Üç mevcut
kısıtlama korundu: Expo SDK 57 kilidi (`expo`, `expo-*`, `react-native`,
`react-native-*` major/minor ignore), tek-React kuralı (`react`, `react-dom`
major/minor ignore), Node 24 LTS pini (docker ekosistemi `node` major ignore).

Bu borç bugün **AÇILDI ve AYNI GÜN KAPANDI** — Faz 4.5 kapanış ölçümünde fark edilip
borç tablosuna girmiş, bu turda giderilmişti.

## Kısmen kapanan

### B-030 — hosted yedekleme yordamı üretildi, gerçek koşu kullanıcıda

`scripts/backup-hosted.mjs` yazıldı:

- Varsayılan **dry-run**; gerçek yedek almak için açık `--confirm` bayrağı gerekir.
- Üç zorunlu ortam değişkeni: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD`.
- Üç ayrı dump üretir: şema (bayraksız), veri (`--data-only`), roller (`--role-only`).

`docs/ops/hosted-backup.md`: ön koşullar, adım adım yordam, **geri yükleme/restore
yordamı**, saklama politikası, yedeklerin repoya asla commit edilmemesi uyarısı. Kök
`package.json`'a `db:backup-hosted` script'i eklendi, `.gitignore`'a `backups/` girdi
eklendi.

**Borç KAPANMADI:** gerçek bir yedek koşusu ve bir restore kanıtı yok — hosted proje
kimlik bilgileri gerektirdiği ve gerçek bir dış sistemi etkilediği için bu adımı
kullanıcı çalıştıracak.

## CI onarımları (borç numarası olmayan, bu turda ölçülüp giderilen)

HEAD `05af580` için CI koşumu **32218286151** izlendi: `frontend`, `mobile`, `backend`,
`docker` yeşil; **`security` KIRMIZI**, **`e2e` CANCELLED**.

**`security` job.** Kök neden bir zafiyet değil, bir **sınıflandırma hatası**:
`packages/config` `@typescript-eslint/parser`'ı `dependencies` altında tutuyordu; bu
yüzden eslint bağımlılık ağacı (eslint → minimatch → brace-expansion, GHSA-3jxr-9vmj-r5cp
/ GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895) production grafiğine giriyor ve
`pnpm audit --prod` onu tarıyordu — gerçekte salt-geliştirme aracı. `@typescript-eslint/
parser` `devDependencies`'e taşındı; `ignoreGhsas` listesine YENİ bir istisna
EKLENMEDİ (gerçek zafiyet değil, yanlış sınıflandırma düzeltildi). Şimdi
`pnpm audit --prod --audit-level=high` exit 0.

**`e2e` job.** Kök neden: `Install Playwright browsers` adımı apt aynasında
(`azure.archive.ubuntu.com` → `archive.ubuntu.com` yönlendirmesi) askıda kaldı ve
job'un `timeout-minutes: 20` bütçesi `Build` ile `Run E2E tests` adımlarına hiç sıra
gelmeden doldu (CANCELLED). İki düzeltme:

1. `actions/cache@v6` ile `~/.cache/ms-playwright` önbelleklendi. Anahtar
   `pnpm-lock.yaml` hash'inden türetildi (caret aralığından değil, çünkü tarayıcı ikili
   revizyonu Playwright'ın tam sürümüne bağlıdır, aralığa değil); `restore-keys`
   bilerek eklenmedi (yanlış sürüme ait bir önbelleğin sessizce kullanılmasını
   engellemek için). Önbellek isabetinde yalnızca `playwright install-deps chromium`
   çalışıyor (apt sistem paketleri her koşumda taze VM'de yine de gerekli), isabetsizde
   eski `install --with-deps chromium` yolu korunuyor.
2. `timeout-minutes` 20 → **30**.

**`docker/setup-buildx-action@v3` → `@v4`.** v3 `node20` hedefliyordu, CI "Node.js 20 is
deprecated" uyarısı düşüyordu; v4 `using: node24`. `supabase/setup-cli@v3` ayrıca
kontrol edildi — composite action, Node runtime'a pinli değil, uyarı üretmiyor,
DEĞİŞTİRİLMEDİ.

## Yeni açılan borçlar

### B-056 — AI antrenman üretimi sabit kullanıcı verisi gönderiyor

`apps/web/src/components/tabs/WorkoutTab.tsx:204-211` AI antrenman üretiminde
`age: 20, goal: 'bulk', weight: 75` **SABİT** gönderiyor; her danışan 20 yaşında bulk
yapan 75 kg'lık biri için hesaplanmış program alıyor. Beslenme tarafında
(`NutritionTab.tsx:790`) aynı alanlar kullanıcıdan form ile alınıyor — antrenman ve
beslenme arasında tutarsız bir davranış.

Düzeltme kolay değil: `profiles` tablosunda **yaş ve hedef sütunu yok** (mevcut
sütunlar: `avatar_path, created_at, current_streak, email, full_name, id,
last_checkin_at, nutrition_plan, role, updated_at, workout_plan`); kilo
`progress_entries`'ten okunabilir. İki yol var: (a) beslenmedeki deseni kopyalayıp
antrenman AI bölümüne de küçük bir form koymak (ucuz, şema değişikliği yok), (b)
`profiles`'a yaş/hedef eklemek + bir profil UI'ı yazmak (doğru çözüm ama şema işi).

### B-057 — `expo start`/`expo run` `apps/mobile/tsconfig.json`'u sessizce yeniden yazıyor

`expo start` / `expo run` komutları `apps/mobile/tsconfig.json`'u yeniden yazıyor: tüm
açıklama yorumlarını siliyor, `include`'dan `.expo/types/**/*.ts` ve
`expo-env.d.ts`'i çıkarıyor ve dosyayı Prettier'ın reddettiği biçime sokuyor
(`pnpm run format:check` CI'da kırmızı olur). Bu turda kullanıcının `expo start`
koşumunda gerçekleşti ve `git restore` ile geri alındı. Kalıcı bir çözüm yok — commit
öncesi `git status` ile kontrol edilmeli.

(Not: bu davranış Faz 4.5 c7b'de de bir kez gözlemlenmişti ve `docs/PROGRESS.md` §4'e
tuzak olarak yazılmıştı; B-057 aynı olgunun bu turda tekrar yaşanan ve borç olarak
numaralandırılan hâlidir.)

**İkinci gözlem (2026-08-19, mobil smoke koşumunda):** AC-4.5.3 kanıtı üretilirken
`pnpm --filter mobile exec expo start --android` çalıştırıldığında `expo start` yine
`apps/mobile/tsconfig.json`'ı sessizce yeniden yazdı (`TypeScript: The
tsconfig.json#include property has been updated`); `git restore` ile geri alındı,
`format:check` temiz kaldı. Tuzak artık **iki bağımsız koşumda** ölçüldü — kalıcı
bir çözüm hâlâ yok, tek koruma mobil kapıları/commit'leri koşturmadan önce
`git status` kontrolü.

### B-058 — koç-danışan atama tablosu yok, çok-koçlu senaryoda yetki izolasyonu eksik

Koç-danışan **atama tablosu yok**: yetki tamamen rol tabanlı (`is_coach()`),
`program_approvals_update_coach` / `workout_plans_insert` politikaları HER koça TÜM
danışanları açıyor; `submit_program_for_approval` bildirimi `role='coach'` olan TÜM
profillere yazıyor. Bugünkü tek-koç ürün varsayımıyla kabul edilmiş bir takas, ama
çok koçlu bir senaryoda yetki izolasyonu **yok**. B-019'un RLS senaryosu yazılırken
ölçüldü — bu yüzden "başka bir koç onaylayamaz" senaryosu yazılamadı, çünkü bugün bu
iddia doğru değil.

## Doğrulama tablosu

| Kapı                                   | Sonuç                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm run lint`                        | 0 hata, 13 uyarı (mevcut `no-img-element` sınıfı, taban korundu)                             |
| `pnpm run type-check`                  | Temiz                                                                                        |
| `pnpm run type-check:e2e`              | Temiz                                                                                        |
| `pnpm run format:check`                | Temiz                                                                                        |
| `pnpm run test`                        | 57 dosya / **677 test** geçti (taban 632)                                                    |
| `pnpm run test:coverage`               | stmts **61.86** · branch **81.73** · funcs **66.58** · lines **61.86** — eşik 60/60/55 yeşil |
| `pnpm run test:rls`                    | **118 senaryo** geçti (taban 113)                                                            |
| `pnpm audit --prod --audit-level=high` | exit 0                                                                                       |

E2E bu turda **yerel olarak koşulmadı** (CI'da koşacak) — bu açıkça not edilir, koşulmuş
gibi gösterilmez.

## Sonraki adımlar

Borç turu, B-023 + B-040 (E2E veri hijyeni, yıkıcı silme onayı gerektirir) hariç
tamamlandı. **AC-4.5.3 bu oturumda KAPANDI:** iOS Expo Go yolu tıkalıydı
(kullanıcının iPhone'unda Expo Go App Store'da SDK 54'e takılı kaldı, Apple onay
süreci yüzünden), bunun yerine Android emülatöründe (Pixel 8 AVD) gerçek smoke
koşuldu ve kanıtlandı — SDK 57.0.0 doğrulandı, beş sekmede gezinme kanıtlandı,
çift-React hatası yok. **Faz 4.5 artık tamamen kapandı**; ayrıntı:
`docs/archive/progress-faz-4.5-monorepo-mobil-temel.md` "Mobil smoke sonucu
(2026-08-19)". Sırada **Faz 4.6 — Güvenlik Tamamlama** (`active_planprogram.md`
§7a; B-042 KVKK hesap silme, B-043 AI kota). Ayrıntı: `docs/PROGRESS.md` §5.

## Ek — aynı gün, ikinci tur: B-056 ve B-040 kapandı

Bu turun "Yeni açılan borçlar" bölümünde açılan B-056 ve yukarıda B-023 ile birlikte
ele alınmayan B-040, aynı gün içindeki bir sonraki turda (Faz 4.6 güvenlik turu ile
birlikte) kapatıldı. Faz 4.6'nın kendi kapanış kaydı ayrı bir dosyadadır:
`docs/archive/progress-faz-4.6-guvenlik-tamamlama.md`. Bu ek yalnızca bu iki borcun
kapanış notunu, açıldıkları arşivle aynı dosyada tutmak için buraya eklenmiştir.

### B-056 — AI antrenman üretimi artık gerçek kullanıcı verisi kullanıyor

`apps/web/src/components/tabs/WorkoutTab.tsx`'teki sabit `age: 20, goal: 'bulk',
weight: 75` gönderimi kaldırıldı. `NutritionTab.tsx:790`'daki desenle aynı yaklaşım
uygulandı: `useForm` + `zodResolver` + mevcut `aiWorkoutSchema`. Kilo alanı
`useProgressEntries` ile danışanın son ölçümünden ön dolduruluyor; kayıt yoksa alan
boş bırakılıyor (sahte varsayılan değer yazılmadı). 3 yeni test eklendi.

### B-040 — E2E artık kendi `pending` fikstürünü üretiyor

`supabase/seed.sql`'e dokunulmadan çözüldü: `apps/web/tests/e2e/plans.spec.ts` akışın
sonunda danışanla yeni bir `pending` onay kaydı üretecek şekilde genişletildi. Test artık
kendi tükettiği fikstürü kendi yeniliyor; koçun demo kuyruğu E2E koşusundan sonra
boşalmıyor. Bu, tur içindeki "öneri: E2E kendi `pending` satırını üretsin" notunun
uygulanmasıdır.
