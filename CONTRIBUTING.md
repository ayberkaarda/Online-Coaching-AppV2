# Katkı Rehberi

Bu depoya katkıda bulunmak için aşağıdaki adımları izleyin. Geliştirme ortamı kurulumu için bu dosyayı tekrar etmiyoruz — bkz. [`README.md#hızlı-başlangıç`](README.md#hızlı-başlangıç).

## İçindekiler

1. [Dal (Branch) Adlandırma](#1-dal-branch-adlandırma)
2. [Commit Mesajları — Conventional Commits](#2-commit-mesajları--conventional-commits)
3. [Kod Standartları](#3-kod-standartları)
4. [PR Süreci](#4-pr-süreci)
5. [Test Yazma Beklentisi](#5-test-yazma-beklentisi)
6. [Veritabanı Değişikliği Yapma Rehberi](#6-veritabanı-değişikliği-yapma-rehberi)
7. [Güvenlik](#7-güvenlik)
8. [Davranış Kuralları](#8-davranış-kuralları)

---

## 1. Dal (Branch) Adlandırma

Dallar aşağıdaki öneklerden biriyle başlamalıdır, ardından kısa, tire-ayrılmış bir açıklama gelir:

| Önek        | Ne zaman kullanılır                  | Örnek                              |
| ----------- | ------------------------------------ | ---------------------------------- |
| `feat/`     | Yeni özellik                         | `feat/workout-plan-approval`       |
| `fix/`      | Hata düzeltme                        | `fix/notification-target-column`   |
| `chore/`    | Bakım, bağımlılık güncelleme, config | `chore/upgrade-nextjs-16`          |
| `docs/`     | Yalnızca dokümantasyon               | `docs/deployment-guide`            |
| `refactor/` | Davranış değişmeden kod iyileştirme  | `refactor/extract-ai-proxy-helper` |
| `test/`     | Yalnızca test ekleme/düzeltme        | `test/daily-log-upsert`            |

## 2. Commit Mesajları — Conventional Commits

Bu depo [Conventional Commits](https://www.conventionalcommits.org/) biçimini kullanır:

```
<tip>[opsiyonel kapsam]: <özet>

[opsiyonel gövde]

[opsiyonel footer]
```

### Tip listesi

| Tip        | Anlamı                                                      |
| ---------- | ----------------------------------------------------------- |
| `feat`     | Yeni özellik                                                |
| `fix`      | Hata düzeltme                                               |
| `docs`     | Yalnızca dokümantasyon değişikliği                          |
| `style`    | Davranışı etkilemeyen biçim değişikliği (boşluk, noktalama) |
| `refactor` | Ne hata düzeltir ne özellik ekler; kod yeniden düzenleme    |
| `perf`     | Performans iyileştirmesi                                    |
| `test`     | Test ekleme veya düzeltme                                   |
| `build`    | Build sistemi veya dış bağımlılıklar                        |
| `ci`       | CI yapılandırması (`.github/workflows/`)                    |
| `chore`    | Diğer bakım işleri                                          |
| `revert`   | Önceki bir commit'i geri alma                               |

### Kapsam (scope) örnekleri

Kapsam, değişikliğin hangi alanı etkilediğini parantez içinde belirtir: `feat(workout):`, `fix(rls):`, `docs(deployment):`, `refactor(ai-proxy):`, `chore(deps):`.

### Breaking change gösterimi

Geriye uyumsuz bir değişiklik ya tip/kapsamdan sonra `!` ile ya da footer'da `BREAKING CHANGE:` ile işaretlenir:

```
feat(api)!: /api/ai/workout yanıt şemasını değiştirir

BREAKING CHANGE: `plan` alanı artık dizi değil, gün anahtarlı obje döner.
İstemci tarafında `usePlans` hook'unun güncellenmesi gerekir.
```

### Örnekler

```
feat(workout): AI antrenman planı için split tipi seçimi ekle
fix(rls): notifications INSERT politikasında student_id kontrolü düzelt
docs(readme): ortam değişkenleri tablosunu .env.example ile senkronla
refactor(ai-proxy): hata eşleme mantığını handleAiProxy içine taşı
test(daily-log): upsert onConflict davranışını doğrulayan birim test ekle
chore(deps): @supabase/supabase-js sürümünü 2.110.0'a yükselt
```

## 3. Kod Standartları

- **TypeScript strict.** `tsconfig.json`'daki `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`/`noUnusedParameters` kurallarını ihlal eden kod birleştirilmez.
- **`any` yasak.** Tip bilinmiyorsa `unknown` kullanıp daraltın (narrowing); üçüncü parti bir tipin gerçekten karşılığı yoksa yerel bir arayüz tanımlayın.
- **Named export tercih edilir.** `export default` yalnızca Next.js'in zorunlu kıldığı yerlerde (sayfa/layout bileşenleri) kullanılır; paylaşılan yardımcı fonksiyon/bileşenler named export ile dışa açılır.
- **Kullanıcıya görünen tüm metinler Türkçedir.** Hata mesajları, toast'lar, form etiketleri, boş durum (empty state) metinleri dahil — kod içi yorum/değişken adları İngilizce kalabilir, ama kullanıcı arayüzüne çıkan hiçbir string İngilizce bırakılmaz.
- **Tailwind sınıf sırası** `prettier-plugin-tailwindcss` tarafından otomatik uygulanır; elle sıralama yapmayın, `npm run format` çalıştırın.
- **Python (`ai_backend/`):** `ruff check` ve `ruff format --check` temiz olmalı; `mypy app` **strict** modda (`disallow_untyped_defs`, `warn_return_any`) hatasız geçmelidir. Yeni public fonksiyon/metodlara tip anotasyonu zorunludur.

## 4. PR Süreci

- **PR'ları küçük tutun.** Tek bir mantıksal değişiklik = tek PR. Bağımsız birden fazla değişiklik varsa ayrı PR'lara bölün — gözden geçirmeyi hızlandırır, geri almayı kolaylaştırır.
- **Açıklama şablonu:** Her PR açıklamasında şunlar bulunmalı:
  - **Ne değişti ve neden** (kısa özet).
  - **Nasıl test edildi** (manuel adımlar ve/veya eklenen otomatik testler).
  - **Ekran görüntüsü/GIF** (UI değişikliğiyse).
  - **İlgili issue** varsa referans (`Closes #123`).
  - Veritabanı şeması değiştiyse: hangi migration dosyası eklendi, RLS etkisi var mı.
- **CI'daki tüm job'lar yeşil olmalı** (`.github/workflows/ci.yml`: `frontend`, `backend`, `e2e` — yalnızca PR'da tetiklenir —, `docker`, `required-checks`). Kırmızı CI ile merge edilmez.
- **Gözden geçirme beklentileri:** En az bir onay gerekir. Yorumlar ya çözülür ya da neden çözülmediği açıklanarak yanıtlanır. Büyük mimari kararlar (yeni bağımlılık, veri modeli değişikliği, yeni dış servis) için PR açıklamasında gerekçe bekleniyor — gerekirse `docs/ARCHITECTURE.md`'deki ADR-lite bölümüne yeni bir karar eklenmelidir.

## 5. Test Yazma Beklentisi

- **Yeni iş mantığı** (hook, yardımcı fonksiyon, server action, servis katmanı) → Vitest birim testi (frontend) veya pytest (backend).
- **Yeni API endpoint'i** (`src/app/api/*` veya FastAPI `routers/*`) → en az bir başarılı ve bir hata yolu (4xx/5xx) senaryosunu kapsayan test.
- **Kritik kullanıcı akışı** (giriş, program onayı, form-check gönderimi gibi uçtan uca akışlar) → Playwright E2E senaryosu (`tests/e2e/`).
- Kapsam eşiklerinin altına düşen PR'lar CI'da başarısız olur (frontend: `vitest.config.ts` eşikleri — lines/functions/statements 60, branches 55; backend: `--cov-fail-under=70`). Eşik ihlali "test eklemeyi unuttum" anlamına gelir, eşiği düşürmek çözüm değildir.

## 6. Veritabanı Değişikliği Yapma Rehberi

1. **Yeni migration dosyası oluşturun**, zaman damgalı adlandırmayı koruyun (`supabase/migrations/YYYYMMDDHHMMSS_kisa_aciklama.sql`, bkz. mevcut dosyalar: `20260816090000_initial_schema.sql` vb.):

   ```bash
   supabase migration new kisa_aciklama
   ```

2. **RLS politikasını unutmayın.** Yeni bir tablo eklerseniz, o tabloda RLS'i **açmadan** (`alter table ... enable row level security`) ve en az bir SELECT/INSERT/UPDATE/DELETE politikası tanımlamadan PR açmayın — RLS kapalı bir tablo, `anon`/`authenticated` rolüne varsayılan olarak tüm satırları açar. `supabase/README.md`'deki RLS matrisini örnek alın; koç (`is_admin()`) ve satır sahibi (`student_id = auth.uid()`) ayrımını netleştirin.
3. **`npm run db:types` ile tipleri yeniden üretin** — migration'ı yerel Supabase'e uyguladıktan sonra:

   ```bash
   supabase db reset      # veya: yeni migration'ı `supabase db push` ile uzak/yerel projeye uygulayın
   npm run db:types
   ```

   Üretilen `src/types/database.ts` dosyasını PR'a dahil edin; elle düzenlemeyin.

4. **Geri alınabilirlik.** Supabase CLI otomatik "down" migration üretmez. Yıkıcı bir değişiklik (sütun/tablo silme, tip daraltma) yapıyorsanız, PR açıklamasında bu değişikliğin nasıl geri alınacağını (tersini yapan yeni bir migration taslağı) belirtin. Mümkünse önce ekleyici (additive) bir migration ile geçiş yapıp, eski sütun/tabloyu ayrı bir sonraki PR'da kaldırın — tek adımda hem şema hem uygulama kodunu kırmaktan kaçının.
5. Migration'ı **önce yerelde** (`supabase start` + `supabase db reset`) test edin, idempotent olduğundan emin olun (mevcut migration'lar `if not exists`/`do $$ ... exception ...` kalıplarını kullanır, yeni migration'lar da aynı disipline uymalı).

## 7. Güvenlik

- **Sır (secret) commit etmeyin.** API anahtarı, service-role key, parola gibi değerler asla kod veya `.env.local` dışında bir dosyada commit'lenmez.
- **`.env.local` zaten `.gitignore`'da hariç tutulmuştur** (`.env*` deseni) — yine de bir commit'e yanlışlıkla eklenip eklenmediğini `git status`/`git diff --staged` ile kontrol etmeden push etmeyin.
- **Bağımlılık ekleme kuralları:** Yeni bir npm/uv bağımlılığı eklemeden önce (a) gerçekten gerekli mi, mevcut bağımlılıklarla çözülebilir mi kontrol edin, (b) aktif bakımı var mı (son commit tarihi, açık kritik issue sayısı) kısaca değerlendirin, (c) lisansının projeyle uyumlu olduğundan emin olun. Dependabot bu depoda bağımlılık güncellemelerini otomatik PR olarak açar — bu PR'lar da CI'dan geçmeden merge edilmez.

## 8. Davranış Kuralları

Bu proje saygılı, yapıcı bir katkı ortamı hedefler. Tartışmalarda kişiyi değil fikri hedef alın, farklı deneyim seviyelerine sabırlı olun, taciz edici veya dışlayıcı dil kullanmayın. İhlal durumunda depo sahibiyle iletişime geçin.
