# Arşiv — Faz 1.7: Borç Temizliği (2026-08-17)

**Özet.** Beş paralel dilim: yetim storage dosyalarının silinmesi (sıra garantili), `42501`
RLS reddinin merkezî yakalanması, AC-05 bildirim şablonunun `SECURITY DEFINER` RPC'ye taşınması
(gerçek bir davranış hatasını da düzeltti), koç avatarının danışana açılması ve sequence
yetkilerinin kapatılması. Ayrıca katalog gerçekten import edildi (10 → 1328 / 591) ve bu, iki
gerçek kusuru açığa çıkardı: sessiz `max_rows=1000` kesilmesi ve E2E'yi kararsızlaştıran
sayfalamasız `select('*')`. Bayat kayıt taraması `AUDIT.md`'de bir iç çelişki buldu.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 68–79, 760–937, 1493–1503 —
> 2026-08-17'de taşındı.

---

### Faz 1.7 — Borç Temizliği (2026-08-17)

`docs/PROGRESS.md` §6 madde 9'daki kullanıcı onaylı kapsam beş paralel dilimle uygulandı:
yetim storage dosyaları, `42501` güvenlik olay günlüğü, AC-05 bildirim şablon kuplajı, koçun
avatarının danışana açılması, sequence yetkileri — ve buna ek olarak katalog import'u ile
bayat kayıt temizliği.

**1. Yetim storage dosyaları.** `src/lib/storage.ts`'e `removeStoredObject(bucket, path)`
eklendi (fırlatmaz, `false` döner — `createSignedUrl`'ün mevcut sözleşmesiyle tutarlı).
`useUploadAvatar` artık eski avatarı siliyor. **SIRA GARANTİSİ:** silme YALNIZCA
`profiles.avatar_path` güncellemesi BAŞARILI olduktan sonra çalışıyor; güncelleme başarısız
olursa silme HİÇ çalışmıyor — aksi halde kullanıcı hem eski hem yeni avatarını kaybederdi.
Bunun için ayrı bir regresyon testi var. Silme başarısızlığı kullanıcıya hata GÖSTERMİYOR
(yükleme zaten başarılı), yalnızca loglanıyor. NULL yol ve storage dışı mutlak URL
(`placehold.co` gibi) için silme denenmiyor.
DELETE politikasının gerçekten var olduğu kanıtlandı (varsayılmadı):
`20260816090300_storage.sql` satır 91-99 `avatars_delete_own`. Form check tarafı incelendi:
orada aynı borç YOK — her form check kendi dosyalarını tutuyor, üzerine yazma yok.

**2. `42501` (RLS reddi) güvenlik olayı olarak loglanmıyordu.** Kök neden loglama eksikliği
DEĞİLDİ: hook'lar `throw new Error(error.message)` yazıyordu ve düz `Error`'da `code` alanı
olmadığı için PostgREST'in `42501` kodu ÇAĞRI NOKTASINDA atılıyordu. Yeni
`src/lib/query/supabase-error.ts` (`SupabaseQueryError` + `wrapSupabaseError()`) kodu
koruyor; çözüm merkezî — TanStack Query'nin `QueryCache`/`MutationCache` `onError` kancası
(`src/lib/query/queryClient.ts`) tek noktadan yakalıyor, 20+ hook'a tekrarlayan `catch`
eklenmedi. 9 hook dosyasında toplam ~32 çağrı noktası sarıldı. Storage ve GoTrue çağrıları
bilerek SARILMADI (PostgREST değil, `42501` döndürmezler).
**TARAYICI-SUNUCU TUZAĞI:** `src/lib/api/response.ts`'teki `logSecurityEvent()`
KULLANILMADI — `next/server`'dan `NextResponse` import ediyor ve hook'lar `'use client'`;
sunucu modülü tarayıcı paketine sızardı. Ayrı `src/lib/query/security-event.ts` yazıldı,
`.next/static/` içinde sıfır eşleşme ile doğrulandı.
**DÜRÜST SINIR (borç olarak kaydedildi, §5):** bu log yalnızca kullanıcının KENDİ konsoluna
yazıyor — saldırgan kendi konsolunu görür, biz görmeyiz. Gerçek sunucu tarafı güvenlik
kaydı için ayrı bir uç gerekir; kapsam dışı bırakıldı, tek değişim noktası
`queryClient.ts`'teki `reportRlsDenialIfNeeded`.

**3. AC-05 bildirim şablonu kuplajı çözüldü.** Yeni
`supabase/migrations/20260817180000_program_submission_rpc.sql`:
`submit_program_for_approval(p_client_id, p_workout_data)` `SECURITY DEFINER` RPC'si onay
satırını ve koç bildirimini TEK İŞLEMDE yazıyor; şablon metni artık YALNIZCA RPC gövdesinde.
`useProgramApprovals.ts`'teki `notifications` insert'i ve şablon metni tamamen kaldırıldı.
**GERÇEK DAVRANIŞ HATASI DÜZELDİ:** eski akışta bildirim hedefi istemciden geliyordu ve koç
bulunamazsa bildirim DANIŞANIN KENDİSİNE düşüyordu — koç programdan sessizce habersiz
kalıyordu. Artık koç sunucuda çözülüyor.
Onay kapısı ölçülerek doğrulandı (varsayılmadı): RPC `SECURITY DEFINER` olduğu için RLS
politikaları devrede değil, bu yüzden sahiplik gövdede elle doğrulanıyor; ama onay kapısı
bir TRIGGER'dır ve trigger'lar BYPASSRLS'ten etkilenmez. Senaryo 80 bunu canlı kanıtlıyor.
`notifications_insert` politikasından `is_coach_profile(client_id)` dalı KALDIRILDI (grep ile
doğrulandı: o dalı kullanan tek çağrı taşınan çağrıydı) — danışan artık `notifications`'a
yalnızca kendi satırını yazabiliyor. `notifications_guard_content()` KORUNDU ama şablonu
söküldü, rol tabanlı kurala dönüştürüldü ki biri politikaya dalı geri koyarsa delik
SESSİZCE açılmasın.

**4. Koçun avatarı danışana açıldı.** `20260817180100_avatar_visibility.sql`:
`avatar_object_owner(text)` + politikaya `is_coach(avatar_object_owner(name))` dalı. Dosya
adı ayrıştırmasıyla yetki vermek risklidir; dört güvence yazıldı: katı regex (kanonik 36
karakterlik UUID, adda `/` yok), `::uuid` cast'i yalnızca regex'in doğruladığı dalda çalışır
(politika içinde fırlayan hata `createSignedUrl`'i HERKES için kırardı), ayrıştırma
başarısızsa NULL → `is_coach(NULL)` = false (belirsizlik daima redde düşer), ön ek
sahtelenemez (`avatars_insert_own` adın `auth.uid()` ile başlamasını şart koşuyor).
`form-checks-media` değişmedi. Danışanların BİRBİRİNİN avatarını göremediği testle
kilitlendi.

**5. Sequence yetkileri.** `20260817180200_sequence_grants.sql`: `authenticated`/`anon`
için sequence UPDATE (`setval`) kaldırıldı, `USAGE`+`SELECT` KORUNDU (yoksa INSERT'ler
kırılırdı). `alter default privileges` GEREKLİYDİ — ölçülen `pg_default_acl`
`authenticated=w` içeriyordu, yani gelecekteki her sequence yetkiyi geri kazanırdı (AC-03
turundaki tablo tuzağının aynısı).
**Migration yazarken canlı bir Postgres tuzağı yakalandı:** `has_sequence_privilege()` ile
`relkind='S'` filtresi aynı `WHERE`'de olunca planlayıcı fonksiyonu filtreden ÖNCE çalıştırdı
ve `db reset` `"pg_toast_16488" is not a sequence (42809)` ile patladı; `as materialized` CTE
çitiyle çözüldü. Kırmızı-yeşil koşusunun yan ürünü olarak bulgunun anlattığı DoS CANLI
gerçekleşti: başarılı `setval` sayacı 1'e çekti ve sonraki INSERT `duplicate key` verdi.

**6. Katalog import'u — borç kodda değil İŞLETİMDEYDİ.** `scripts/import-catalog.mjs` ve
`clean-foods.mjs` zaten yazılmıştı ve olgundu (idempotent `onConflict: 'name'` upsert,
dry-run, 500'lük batch, dosya içi tekilleştirme, mojibake onarımı); `package.json` script
girdileri de vardı. Eksik olan tek şey HİÇ ÇALIŞTIRILMAMIŞ olmalarıydı. Kanonik dosya olarak
`clean_exercises_v2.csv` (150 KB) seçildi, ham `exercises.csv` (8.7 MB) değil — ikisi de
aynı 1324 satırı temsil ediyor ama ham dosya 95 sütunlu (6 dilde talimat alanları) ve
şemadaki 6 sütuna eşlenmiyor.
Sonuç: `exercises` 10 → **1328**, `food_database` 10 → **591**. İkinci koşuda sayılar
değişmedi (idempotans kanıtı). Türkçe kodlama geri okumayla doğrulandı (`Tavuk Göğsü`,
`Kırmızı Mercimek (pişmiş)`), bozuk kayıtlar onarıldı (`sled 45в° calf press` →
`sled 45° calf press`). Script test edilebilir hale getirildi (saf fonksiyonlar export,
`import.meta.url` guard) + `scripts/import-catalog.d.mts` + 33 birim testi.

**7. Katalog import'u iki kusuru açığa çıkardı.** Bu tur "borcu kapatmak"la kalmadı,
borcun GERÇEK ŞEKLİNİ ortaya çıkardı. İkisi de import'tan önce vardı ama 10 demo satırla
görünmüyordu:

- **Sessiz doğruluk hatası:** `supabase/config.toml` `max_rows = 1000`. `useExercises()`
  1328 satır istiyordu → 328 egzersiz SESSİZCE kayboluyordu, hata da verilmiyordu.
- **Performans:** `useCatalog.ts` sayfalamasız `select('*')` yapıyor ve `WorkoutTab.tsx:109`
  / `NutritionTab.tsx:47` bunu mount anında çağırıyor. Giriş sonrası yükleme 30 sn'yi aştı ve
  E2E KARARSIZLAŞTI — iki ardışık tam koşuda FARKLI testler düştü (`daily-log.spec.ts:48`,
  `dashboard.spec.ts:22`), ikisinin kök nedeni aynıydı: `page.waitForURL` zaman aşımı.

Kullanıcı kararı: ASGARİ düzeltme şimdi, tam çözüm Faz 2'ye. `useCatalog.ts`'e
`fetchAllRows(fetchPage, context, pageSize=1000, maxPages=50)` eklendi; `.range()`
döngüsüyle tüm satırlar geliyor, sonsuz döngü koruması var (50 sayfa aşılırsa `logger.warn`

- kısmi sonuç). Gerçek PostgREST'e karşı kanıtlandı: exercises 2 istekte 1328 (0-999 +
  1000-1327), food_database 1 istekte 591; tek geniş `range` ile eski davranış 1000'de kesiyor.
  **Kolon projeksiyonu YAPILAMADI** — `exercises` tablosunun 7 kolonunun HEPSİ kullanılıyor
  (`gif_url`/`image` canlı antrenmandaki GIF gösterimini besliyor, `WorkoutTab.tsx:356-359,
413-432`), `food_database`'in 3 kolonunun hepsi kullanılıyor. Atılacak ağır alan yok.

**8. Bayat kayıtlar ve mekanik borçlar.** `playwright.config.ts`'teki A-12 yorumu
`src/env.ts` → `src/env.server.ts` olarak düzeltildi (kontrol Faz 1.5'te taşınmıştı).
`docs/security/AUDIT.md`'de GERÇEK bir iç çelişki bulundu ve düzeltildi: §2'de A-12 hâlâ
`src/env.ts` ile kapatılmış görünüyordu, oysa §4c aynı şemanın `src/env.server.ts`'e
taşındığını anlatıyor. Dört bayat kayıt bağımsız doğrulandı (`src/middleware.ts` yok,
`src/app/actions.ts` yok, AI tel protokolü zaten `client_id`, `npm audit --omit=dev` 0).
`db:types` diff'i alındı: 29 satır, TAMAMEN EKLEME, hiç kayıp yok. Yeni tablo/kolon/enum
yok; 4 yeni `Functions` girdisi — bu turun iki fonksiyonu + **Faz 1.5'ten kalan, elle
yazılmış dosyada eksik olan `backfill_program_approval_review` ve `is_end_user_write` geri
kazanıldı**. Üretilen sürüm benimsendi.
Ölü `SubmitProgramForApprovalInput.coachId` alanı ve `WorkoutTab.tsx`'teki gönderimi
kaldırıldı (`useCoachId()` hook'unun kendisi KORUNDU — `MessagesTab`/`useMessages`'ta canlı
kullanımları var).

**GÜNCELLEME — "Faz 1a — AI tel protokolü" kaydı (yukarıda, bu §3'te) BAYATTIR:** o paragraf
`RecommendationRequest.student_id`'nin "bilinçli olarak değiştirilmediğini" söylüyor. Bu
Faz 1.7 turunda kaynaktan doğrulandı ki bu artık DOĞRU DEĞİL —
`ai_backend/app/schemas/recommendations.py:27` `client_id: str | None = None`,
`src/lib/api/types.ts:66` `client_id?: string`, `src/lib/validation/schemas.ts:231`
`client_id: uuidField.optional()` — üçü de zaten `client_id`, `student_id` DEĞİL. `git log`
alan adının rol yeniden adlandırma commit'inde (`78e5d7b`, Faz 1a) zaten `client_id`'ye
çevrildiğini gösteriyor; yukarıdaki kayıt o zamandan beri hiç güncellenmemiş bir belge
hatası. Doğru durum: alan zaten hizalı, ek iş gerekmiyor. Bu not, o paragrafı SİLMEDEN
düzeltir (bkz. dosya kuralları).

**Doğrulama (main thread koştu, gerçek sayılar; §1 tablosuna işlendi):**

- `npm run type-check` → temiz
- `npm run lint` → 0 hata, 12 bilinen uyarı
- `npm run test` → **426/426** (35 dosya) — faz başında 363
- `npm run build` → başarılı
- `npx supabase db reset` → 0 hata, 18 migration + seed
- `npm run test:rls` → **85/85** — faz başında 76
- `npm run test:transform` → 26/26
- `npm run ratchet` → yeşil, emoji tavanı 60 → 59'a indirildi (`[OK] emoji: 59 / tavan 59`)
- `npm run format:check` → temiz
- `uv run ruff check .` / `uv run mypy app` / `uv run pytest` → temiz / 28 dosya /
  **82/82, %94.94**
- Katalog: `exercises` **1328**, `food_database` **591**
- `npm run test:e2e` → **42/42, ÜÇ ARDIŞIK KOŞUDA** (44.8s / 40.3s / 40.5s). Kararsızlık
  öncesi koşular 41/42 idi ve 54.8s/57.9s sürüyordu — düzeltme hem doğruluğu hem süreyi
  iyileştirdi.

**Kaydedilen borçlar (§5'e işlendi):**

- Katalog hâlâ mount anında TOPTAN istemciye çekiliyor; sayfalama/sanallaştırma UI'da yok.
  Sunucu taraflı arama + sayfalama Faz 2 egzersiz kütüphanesi işine bağlandı. Yük boyutu
  değişmedi, yalnızca artık eksik değil.
- `42501` logu yalnızca istemci konsoluna yazıyor; gerçek sunucu tarafı güvenlik kaydı yok.
- Birikmiş ESKİ yetim storage dosyaları için toplu temizlik yapılmadı (toplu silme, ayrı
  onay ister).
- `useApproveProgram` (koç yolu) hâlâ 3 ayrı ATOMİK OLMAYAN çağrı yapıyor; aynı RPC muamelesi
  için aday. Şablon kuplajı yok (koç serbest metin yazıyor).
- `supabase_admin` varsayılan ACL boşluğu sequence'ler için de kapatılamıyor (tablolardakiyle
  aynı, `must be member of role`); senaryo 84 dinamik okuduğu için istisna doğarsa test
  kırılır.
- RLS senaryo 83 `nextval` işlemsel olmadığı için her koşuda `exercises` id'lerinde 1 boşluk
  bırakıyor (zararsız, dosyada belgelendi).
- `exercises.csv` (8.7 MB ham) hâlâ repoda; `data/README.md` Git LFS öneriyor.

**Durum:** Faz 1.7 tamamlandı. Sıradaki iş **Faz 2 — Koç-Danışan Çekirdek Akışı**. İlk
mekanik işi emoji → Lucide dönüşümü ve E2E locator güncellemeleri aynı PR'da (ADR-0016);
`LoopRing` ilk göründüğü ekranla birlikte yazılır (ADR-0017, AC-1.6.7 oraya devredildi);
Katman B restilizasyonu (49 `font-black`, 17 `rounded-3xl`, 14 gradyan) bu fazda doğal
olarak dönüşür (ADR-0018); katalog için sunucu taraflı arama + sayfalama da bu fazın işi.
**Faz sırası notu:** yol haritasındaki kalan fazlar büyük ölçüde faz düzeyinde
paralelleşmiyor — Faz 2 ve Faz 4 aynı dosyalara dokunuyor (`StatsTab.tsx`,
`CoachUserManagement.tsx`), Faz 3'ün de bir UI kuyruğu var (`ai_suggested` → `confirmed`
onay ekranı, makro dashboard). Gerçek paralellik ekseni faz-vs-faz değil, backend-vs-web:
Faz 3'ün `ai_backend/**` yarısı Faz 2 ile çakışmadan yürüyebilir.

---

### Doğrulama tablosu — Faz 1.7 satırları

| Kontrol                                                      | Komut                                                     | Durum                                                                  | Tarih      |
| ------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| Tip kontrolü (Faz 1.7 — borç temizliği sonrası)              | `npm run type-check`                                      | Temiz                                                                  | 2026-08-17 |
| Lint (Faz 1.7 — borç temizliği sonrası)                      | `npm run lint`                                            | Temiz — 0 hata, 12 bilinen uyarı                                       | 2026-08-17 |
| Birim/bileşen testleri (Faz 1.7 — borç temizliği sonrası)    | `npm run test`                                            | **426/426 (35 dosya)** — faz başında 363                               | 2026-08-17 |
| Production build (Faz 1.7 — borç temizliği sonrası)          | `npm run build`                                           | Başarılı                                                               | 2026-08-17 |
| Veritabanı migration'ları (Faz 1.7 — borç temizliği sonrası) | `npx supabase db reset`                                   | 0 hata — 18 migration + seed                                           | 2026-08-17 |
| RLS politika testleri (Faz 1.7 — borç temizliği sonrası)     | `npm run test:rls`                                        | **85/85** — faz başında 76                                             | 2026-08-17 |
| Plan transform testleri (Faz 1.7 — borç temizliği sonrası)   | `npm run test:transform`                                  | 26/26                                                                  | 2026-08-17 |
| CI ratchet (Faz 1.7 — borç temizliği sonrası)                | `npm run ratchet`                                         | Yeşil — emoji tavanı 60 → 59'a indirildi (`[OK] emoji: 59 / tavan 59`) | 2026-08-17 |
| Biçim (Faz 1.7 — borç temizliği sonrası)                     | `npm run format:check`                                    | Temiz                                                                  | 2026-08-17 |
| Backend lint/tip/test (Faz 1.7 — borç temizliği sonrası)     | `uv run ruff check . && uv run mypy app && uv run pytest` | Temiz — 28 dosya mypy; **pytest 82/82, kapsam %94.94**                 | 2026-08-17 |
| Katalog import'u (Faz 1.7)                                   | `node scripts/import-catalog.mjs`                         | `exercises` 10 → **1328**, `food_database` 10 → **591**                | 2026-08-17 |
| E2E testleri (Faz 1.7 — borç temizliği sonrası)              | `npm run test:e2e`                                        | **42/42, üç ardışık koşuda** (44.8s / 40.3s / 40.5s)                   | 2026-08-17 |

---

## Eski §5 — Faz 1.7'de doğan borçlar

Kapanmayanlar canlı [`docs/PROGRESS.md`](../PROGRESS.md) borç tablosunda `B-xxx` kimliğiyle
izlenir.

**YENİ BORÇLAR (Faz 1.7'de kaynaktan tespit edildi, 2026-08-17):**

| Borç                                                                    | Not                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Katalog `select('*')` ile sayfalamasız, toptan istemciye çekiliyor      | `useCatalog.ts` `fetchAllRows` sonsuz döngü koruması ekledi ama sayfalama/sanallaştırma UI'da yok; mount anında tüm `exercises`/`food_database` çekiliyor. Sunucu taraflı arama + sayfalama Faz 2 egzersiz kütüphanesi işine bağlandı. |
| `42501` güvenlik olay günlüğü yalnızca istemci konsoluna yazıyor        | `src/lib/query/security-event.ts` merkezî yakalıyor ama sunucuya ulaşmıyor; saldırgan kendi konsolunu görür, biz görmeyiz. Gerçek sunucu tarafı güvenlik kaydı için ayrı bir uç gerekir, kapsam dışı bırakıldı.                        |
| Birikmiş ESKİ yetim storage dosyaları için toplu temizlik yapılmadı     | `removeStoredObject()` yalnızca YENİ avatar yüklemelerinde eskiyi siliyor; migration öncesinden birikmiş yetim dosyalar duruyor. Toplu silme ayrı kullanıcı onayı ister (CLAUDE.md destructive command kuralı).                        |
| `useApproveProgram` (koç yolu) hâlâ 3 ayrı ATOMİK OLMAYAN çağrı yapıyor | AC-05'in danışan→koç yönü RPC'ye taşındı (`submit_program_for_approval`) ama koçun onay yolu değişmedi; aynı RPC muamelesi için aday. Şablon kuplajı yok (koç serbest metin yazıyor), bu yüzden AC-05 kapsamına dahil edilmedi.        |
| `supabase_admin` varsayılan ACL boşluğu sequence'ler için kapatılamıyor | AC-03 turundaki tablo tuzağının sequence eşdeğeri; `must be member of role` hatası. Pratik etki sınırlı (13/13 tablo `postgres` sahipli) ama senaryo 84 dinamik okuduğu için gelecekte istisna doğarsa test kırılır.                   |
| RLS senaryo 83 her koşuda `exercises` id'lerinde 1 boşluk bırakıyor     | `nextval` işlemsel olmadığı için testin `ROLLBACK` ile geri aldığı denemeler sequence'i geri sarmıyor. Zararsız (yalnızca id boşluğu), dosyada belgelendi.                                                                             |
| `exercises.csv` (8.7 MB ham) hâlâ repoda                                | Kanonik import kaynağı `clean_exercises_v2.csv` (150 KB) oldu; ham 95 sütunlu dosya artık import'ta kullanılmıyor ama repodan silinmedi. `data/README.md` Git LFS öneriyor (ertelenen iş, §8).                                         |
