# Arşiv — Faz 1a (2026-08-17)

**Özet.** Rol enum'u ve kod tabanı `admin`/`student` → `coach`/`client` olarak yeniden
adlandırıldı (`RENAME VALUE` + OID korunumu sayesinde veri ve politika kaybı olmadan);
`docs/ARCHITECTURE.md` §7'deki gömülü ADR-lite kayıtları `docs/adr/` dosyalarına ayrıştırıldı;
storage bucket'ları private yapılıp okuma imzalı adrese (TTL 1 saat) taşındı; AI tel
protokolünün hizalanması bilinçli olarak ertelendi. Faz 1 çıkış kriterleri (§6a) de burada.

> `docs/PROGRESS.md`'den taşınmış tamamlanmış iş kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 36–49, 330–431, 1630–1676 —
> 2026-08-17'de taşındı.
>
> **Not — buradaki bir kayıt sonradan yanlış çıktı:** "Faz 1a — AI tel protokolü" bölümü
> `RecommendationRequest.student_id`'nin bilinçli olarak değiştirilmediğini söyler. Faz 1.7
> turunda kaynaktan doğrulandı ki alan zaten `client_id`'dir. Bölüm, düzeltmenin izlenebilir
> kalması için silinmeden korunmuştur.

---

### Faz 1a — çıkış kriterleri (2026-08-17, rol yeniden adlandırması)

`active_planprogram.md` §3.1 (R4) rol adlandırma maddesinin ilk parçası bağımsız bir migration
olarak yürütüldü: `supabase/migrations/20260817090000_rename_roles.sql`.

**Kapsam:**

- Enum: `user_role` değerleri `admin` → `coach`, `student` → `client` (`ALTER TYPE ... RENAME
VALUE`).
- Fonksiyon: `public.is_admin(uuid)` → `public.is_coach(uuid)` (imza korundu).
- Kolonlar: 5 tabloda (`notifications`, `form_checks`, `daily_logs`, `workout_logs`,
  `program_approvals`) `student_id` → `client_id`; bağımlı indeks/kısıt/FK adları da hizalandı.
- Kod: `isAdmin()` → `isCoach()`, `useAdminId()` → `useCoachId()`, `AdminUserManagement.tsx` →
  `CoachUserManagement.tsx`, `selectedStudentIds` → `selectedClientIds`, `createStudentSchema` →
  `createClientSchema` (38 dosya).

**`RENAME VALUE`'nun veriyi koruduğu doğrulandı:** `ALTER TYPE ... RENAME VALUE` etiketin
`pg_enum` OID'ini korur; satır verisi ve politika ifadelerindeki enum sabitleri OID ile
saklandığı için hem mevcut satırlar hem de RLS ifadeleri otomatik olarak yeni etiketi gösterir.
`db reset` sonrası `profiles` tablosunda 1 coach + 2 client satır sayısıyla veri sağlam kaldı —
veri kaybı olmadı.

**Fonksiyon yeniden adlandırmanın politikaları bozmadığı (OID) doğrulandı:** `ALTER FUNCTION
... RENAME TO` fonksiyonun OID'ini korur; RLS politikaları fonksiyona OID ile referans verdiği
için `is_admin()` → `is_coach()` sonrası **34 politika** (public + storage.objects) hiçbiri
düşmeden otomatik olarak yeni fonksiyon adına döndü (`pg_policies` çıktısı doğrulandı).

**Kritik istisna — `increment_streak()` elle güncellendi:** plpgsql gövdesi `public.is_admin()`
çağrısını **ad ile** çözer (OID ile değil). Adım 6'daki yeniden adlandırmadan sonra bu çağrı
sessizce çalışma zamanında `function public.is_admin() does not exist` hatasıyla kırılacaktı —
migration bu yüzden `increment_streak()`'i `CREATE OR REPLACE` ile ayrıca güncelledi (gövdesi
`public.is_coach()` çağırır hale geldi, imza — `user_id` parametre adı dahil — değişmedi).

**Bilinçli istisnalar:**

- AI backend tel protokolünde `student_id` alanı korundu
  (`ai_backend/app/schemas/recommendations.py` bu adı bekliyor) — ayrı bir işte hizalanacak.
- Kullanıcıya görünen Türkçe arayüz metinleri değişmedi ("Öğrenci Paneli", "Yönetici Paneli",
  "Öğrenci Portföyü", "Öğrenci Ara" vb.) — ürün dili ayrı bir iş.
- Eski migration dosyaları (`20260816*`) hâlâ eski adları içeriyor; zaman sıralı uygulandığı
  için doğru çalışıyor, sorun değil.

**Doğrulama:** `db reset` sıfırdan, 19/19 RLS, 192/192 birim, 16/16 E2E, build başarılı (bkz.
§1 tablosuna eklenen 2026-08-17 satırları).

**ADR ayrıştırması:** Aynı oturumda `active_planprogram.md` §0.6 (R10) / AC-1.7 kapsamındaki
ADR ayrıştırma işi de tamamlandı — `docs/ARCHITECTURE.md` §7'deki 6 gömülü "ADR-lite" kaydı
`docs/adr/NNNN-<slug>.md` dosyalarına ayrıştırıldı ve rol yeniden adlandırma kararı yeni bir
ADR (`0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md`) olarak eklendi; bu da eski
`0003-rol-enum-degerlerinin-korunmasi.md` kararının yerini aldı (`Durum: Yerini aldı: 0013`).
`docs/adr/README.md` indeksi itibarıyla dizinde toplam **13 ADR dosyası** var (0001–0013).

### Faz 1a — storage mahremiyeti (2026-08-17)

`active_planprogram.md` §3.3 / I-4 çıkış kriteri `supabase/migrations/20260817100000_private_storage.sql`
ile karşılandı.

**Kapsam:**

- `storage.buckets`: `avatars` ve `form-checks-media` artık `public = false` (önceden ikisi de
  `true`).
- Kolonlar tam URL değil YOL saklıyor: `form_checks.front_pose_url` → `front_pose_path`,
  `form_checks.back_pose_url` → `back_pose_path`, `profiles.avatar_url` → `avatar_path`. Mevcut
  satırlardaki tam public URL'ler aynı migration içinde regex ile yola dönüştürüldü
  (storage dışı mutlak URL'ler — ör. `placehold.co` — bilinçli olarak dönüştürülmedi, bkz.
  Bölüm 5).
- `storage.objects` üzerindeki eski "herkese açık okuma" politikaları
  (`avatars_public_read`, `form_checks_public_read`, `anon` dahil) kaldırıldı; yerine iki yeni
  SELECT politikası geldi: `avatars_select_own_or_coach`,
  `form_checks_select_own_or_coach` — ikisi de "sahip veya koç" (`public.is_coach()`), yalnız
  `authenticated` rolüne.
- Yeni `src/lib/storage.ts`: `SIGNED_URL_TTL_SECONDS = 3600` (I-4'ün "TTL ≤ 1 saat" şartı),
  `SIGNED_URL_STALE_TIME_MS` = TTL'in yarısı (30 dk) — imzalı adres içeren TanStack Query
  sorguları bu süreyle bayatlatılır ki önbellekteki adres süresi dolmadan tazelensin.
  `createSignedUrl`/`createSignedUrls` (toplu, N+1 önler) hata durumunda **fırlatmaz**, `null`
  döner; çağıran taraf placeholder gösterir.
- Güncellenen hook'lar: `useFormChecks` artık `FormCheckWithUrls[]` döner (imzalı
  `frontPoseUrl`/`backPoseUrl` alanları eklenmiş), `useProfile`/`useProfiles` artık
  `ProfileWithAvatar[]`/`ProfileWithAvatar` döner (imzalı `avatarUrl`).
  `src/components/AdminUserManagement.tsx` (→ `CoachUserManagement.tsx`, bkz. rol yeniden
  adlandırma bölümü) bu imzalı adresleri kullanacak şekilde güncellendi.

**Mahremiyet kanıtı (curl ile doğrulandı, AC-1.6/AC-2.3):**

| Erişim yolu                                                     | Beklenen   | Gözlenen                             |
| --------------------------------------------------------------- | ---------- | ------------------------------------ |
| Kimliksiz `GET /storage/v1/object/public/<bucket>/<path>`       | Erişilemez | **400** `NoSuchBucket`               |
| Anon key ile `GET /storage/v1/object/<bucket>/<path>` (imzasız) | Erişilemez | **400** `NoSuchKey`                  |
| İmzalı adres (`createSignedUrl` çıktısı), sahibi veya koç       | Erişilir   | **200**                              |
| Bozulmuş/geçersiz imza                                          | Erişilemez | **400**                              |
| Başka bir danışanın dosyası için imza üretmeye çalışma          | Reddedilir | İmza üretilemiyor (RLS SELECT reddi) |
| Koçun aynı dosya için imza üretmesi                             | İzinli     | İmza üretiliyor                      |

### Faz 1a — AI tel protokolü (2026-08-17)

`RecommendationRequest.student_id` alanı hem `ai_backend/app/schemas/recommendations.py`
(Pydantic) hem TypeScript tarafında (`src/lib/api/types.ts` → `RecommendationInput.student_id`,
`src/lib/validation/schemas.ts` → `recommendationSchema.student_id`) **bilinçli olarak
değiştirilmedi**. Gerekçe: bu uç (`/api/ai/recommendations` → FastAPI `/recommendations`) kod
tabanında hiçbir yerden çağrılmıyor (`useRecommendations` hook'u tanımlı ama hiçbir bileşen
kullanmıyor); adı hizalamak izole, riski olmayan bir değişiklik ama bu turun kapsamı dışında
bırakıldı — ayrı bir işte, gerçek bir tüketici eklendiğinde hizalanacak.

---

### Doğrulama tablosu — Faz 1a satırları

| Kontrol                                                                | Komut                                                     | Durum                                                                                           | Tarih      |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| Veritabanı migration'ları (rol yeniden adlandırması sonrası)           | `npx supabase db reset`                                   | Sıfırdan uygulandı, hatasız (`20260817090000_rename_roles.sql` dahil)                           | 2026-08-17 |
| RLS politika testleri (rol yeniden adlandırması sonrası)               | `npm run test:rls`                                        | 19/19 — tekrar doğrulandı, hiçbir senaryo düşmedi                                               | 2026-08-17 |
| Birim/bileşen testleri (rol yeniden adlandırması sonrası)              | `npm run test`                                            | 192/192 — tekrar doğrulandı                                                                     | 2026-08-17 |
| E2E testleri (rol yeniden adlandırması sonrası)                        | `npm run test:e2e`                                        | 16 senaryo × 2 profil — tekrar doğrulandı                                                       | 2026-08-17 |
| Production build (rol yeniden adlandırması sonrası)                    | `npm run build`                                           | Başarılı — tekrar doğrulandı                                                                    | 2026-08-17 |
| Tip kontrolü (storage mahremiyeti + AI tel protokolü sonrası)          | `npm run type-check`                                      | Temiz                                                                                           | 2026-08-17 |
| Lint (storage mahremiyeti + AI tel protokolü sonrası)                  | `npm run lint`                                            | Temiz — 0 hata, 12 bilinçli uyarı                                                               | 2026-08-17 |
| Biçim (storage mahremiyeti + AI tel protokolü sonrası)                 | `npm run format:check`                                    | Temiz                                                                                           | 2026-08-17 |
| Birim/bileşen testleri (storage mahremiyeti sonrası)                   | `npm run test`                                            | **203/203 (18 dosya)** — `src/lib/storage.ts` testleri dahil                                    | 2026-08-17 |
| Production build (storage mahremiyeti sonrası)                         | `npm run build`                                           | Başarılı                                                                                        | 2026-08-17 |
| Veritabanı migration'ları (storage mahremiyeti sonrası)                | `npx supabase db reset`                                   | Sıfırdan uygulandı, hatasız (`20260817100000_private_storage.sql` dahil), katalog geri yüklendi | 2026-08-17 |
| RLS politika testleri (storage mahremiyeti sonrası)                    | `npm run test:rls`                                        | 19/19 — tekrar doğrulandı                                                                       | 2026-08-17 |
| E2E testleri (storage mahremiyeti sonrası)                             | `npm run test:e2e`                                        | 16/16 (chromium) — signed URL akışıyla tekrar doğrulandı                                        | 2026-08-17 |
| Backend lint/tip/test (storage mahremiyeti + AI tel protokolü sonrası) | `uv run ruff check . && uv run mypy app && uv run pytest` | Temiz — 63 test, kapsam %92                                                                     | 2026-08-17 |

---

## 6a. Faz 1 çıkış kriterleri (unutulmaması gereken devir borçları)

Bu bölüm, ertelenen işlerin kaybolmaması için sözleşme niteliğindedir. Faz 1 "bitti"
sayılabilmesi için aşağıdaki maddelerin tamamı karşılanmalıdır:

1. ~~**Hiçbir storage bucket'ı public kalmayacak.** `avatars` ve `form-checks-media` private
   yapılacak, erişim signed URL (TTL ≤ 1 saat) ile olacak~~ — `active_planprogram.md` I-4
   değişmezi bunu zaten şart koşuyor.
   **TAMAMLANDI (2026-08-17, Faz 1a):** `supabase/migrations/20260817100000_private_storage.sql`
   ile ikisi de `public = false` yapıldı; okuma `src/lib/storage.ts`'teki
   `createSignedUrl`/`createSignedUrls` ile TTL 3600 sn imzalı adresle yapılıyor; bkz. §3
   "Faz 1a — storage mahremiyeti".
2. ~~**`form_checks.front_pose_url`/`back_pose_url` kolonları tam URL değil, bucket içi YOL
   saklayacak.** Mevcut satırlar için veri dönüşümü yazılacak.~~ İstemci okuma anında signed URL
   üretecek (`src/hooks/useFormChecks.ts` ve `src/components/AdminUserManagement.tsx`
   güncellenecek).
   **TAMAMLANDI (2026-08-17, Faz 1a):** Kolonlar `front_pose_path`/`back_pose_path` olarak
   yeniden adlandırıldı, mevcut tam public URL'ler aynı migration'da yola dönüştürüldü;
   `useFormChecks` artık imzalı adresli `FormCheckWithUrls[]` döner.
3. ~~**`avatars` için aynısı** — `profiles.avatar_url` yol saklayacak (`src/hooks/useProfile.ts`).~~
   **TAMAMLANDI (2026-08-17, Faz 1a):** `avatar_url` → `avatar_path` yeniden adlandırıldı;
   `useProfile`/`useProfiles` artık imzalı adresli `ProfileWithAvatar` döner.
4. ~~Rol enum'u `admin`/`student` → `coach`/`client`~~ (tek koçlu model; `coach_id` YOK).
   **TAMAMLANDI (2026-08-17, Faz 1a):** `supabase/migrations/20260817090000_rename_roles.sql`
   ile uygulandı; bkz. §3 "Faz 1a — çıkış kriterleri".

**Ayrıca tamamlandı (Faz 1a kapsamında, bu listenin parçası olmasa da ilişkili):** ADR
ayrıştırması (`active_planprogram.md` §0.6/AC-1.7) — bkz. §3 "Faz 1a — çıkış kriterleri".

**Faz 1b'ye devreden (bu listede kalan, henüz karşılanmamış maddeler):**

- Planlar `profiles` içindeki JSON string'lerden normalize tablolara taşınacak; veri
  migrasyonu yazılacak (bkz. `active_planprogram.md` §3.5, ve aşağıda §6b "Sıradaki iş — Faz
  1b").
- `src/middleware.ts` → Next 16 `proxy` konvansiyonuna göç — Faz 1b'nin kapsamında değil, ayrı
  bir bakım işi olarak açık kalıyor.

**ÖNEMLİ NOT:** Uygulama yayında olmasa da `.env.local` **barındırılan** bir Supabase
projesini gösteriyor (`nxftmxkpmuyeelrmwofv.supabase.co`). Migration'lar yalnızca YEREL yığına
uygulandı. Barındırılan projede gerçek danışan verisi/fotoğrafı varsa, oradaki bucket'lar hâlâ
public olabilir ve Faz 1'de bu projeye geçiş yapılırken veri dönüşümü planlanmalıdır.
**ÇÖZÜLDÜ (2026-08-17, hosted senkronizasyonu):** hosted şeması sıfırlanıp 25 migration'ın
tamamı `db push` ile uygulandı; üç bucket da artık `public = false` (5 MB, 6 MIME tipi) —
hosted ve yerel storage yapılandırması artık senkron. `.env.local`'ın hâlâ hosted'ı gösterdiği
gerçeği DEĞİŞMEDİ (bkz. §5 "yeni borç" satırı) — yalnızca "hosted senkron değil" öncülü
geçersizleşti; env karışıklığı riski ayrı, hâlâ açık bir konu olarak duruyor. Detay:
`docs/adr/0020-hosted-senkronizasyon-stratejisi.md`.
