# Arşiv — Faz 4.6: Güvenlik Tamamlama (2026-08-19)

**Özet.** `active_planprogram.md` §7a'da tanımlanan Faz 4.6'nın beş kabul kriterinin
(AC) **tamamı karşılandı — Faz 4.6 TAMAMEN KAPANDI.** İlk turda AC-4.6.1/4.6.2 (B-042 —
KVKK/GDPR hesap silme) ve AC-4.6.3 (B-043 — AI günlük kota) kapandı; aynı gün ikinci bir
paralel turda AC-4.6.4 (B-028 — magic-byte doğrulaması, B-008 — `Content-Disposition`)
ve onunla birlikte AC-4.6.5 (§0.2 kapı komutlarının tamamı yeşil) de kapandı.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md) §3/§5.
> Kabul kriterlerinin kaynak tanımı: `active_planprogram.md` §7a (bu dosyaya dokunulmadı).

---

## AC durumu

| AC       | Tanım (özet)                                                                                                       | Durum          |
| -------- | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| AC-4.6.1 | Danışan kendi hesabını silebilir; auth kullanıcısı + ilişkili satırlar + storage kapsanır, idempotent              | **KARŞILANDI** |
| AC-4.6.2 | Silme sonrası eski JWT ile hiçbir veriye erişilemez; denetim kaydı kişisel veri içermez, redaction testinden geçer | **KARŞILANDI** |
| AC-4.6.3 | AI uçlarında kullanıcı başına günlük kota; aşımda TR mesajlı 429; kotanın yarışla aşılamadığı testle gösterilir    | **KARŞILANDI** |
| AC-4.6.4 | B-028 kapanır (sahte MIME negatif testiyle) ve B-008 kapanır                                                       | **KARŞILANDI** |
| AC-4.6.5 | §0.2 kapı komutlarının tamamı yeşil                                                                                | **KARŞILANDI** |

---

## Kapanan borçlar

### B-042 — KVKK/GDPR hesap silme akışı TAMAMLANDI

Danışan kendi hesabını kalıcı olarak silebiliyor. Mimari kararlar `docs/adr/0025-hesap-silme-ve-service-role-sunucu-yolu.md`'de (bu turda değiştirilmedi, yalnızca referans veriliyor).

- **Migration** `supabase/migrations/20260819100000_account_deletion.sql`:
  - `account_deletions` denetim tablosu — kayıtta **uid/e-posta/ad/IP yok**.
  - `account_deletion_manifest()` — silinecek satırların envanterini çıkarır.
  - `delete_account()` — asıl silme fonksiyonu.
  - İkisi de **`SECURITY DEFINER`**; EXECUTE yalnızca `service_role`'e verildi (`anon`/`authenticated`'ten kaldırıldı).
  - **14 tablo doğrulandı** (şemadaki 16 tablodan 2'si katalog — `exercises`/`food_database` — kullanıcıya özel veri değil, kapsam dışı).
  - `storage.objects`'ten SQL ile silmek platform kısıtı yüzünden yasak olduğundan `delete_account()` **fail-closed** tasarlandı: geriye storage nesnesi kalırsa hiçbir satır silinmez (kısmi silme yerine sıfır silme).
- **Sunucu yolu:** `apps/web/src/app/api/account/delete/route.ts` — Bearer auth ile `service_role`'ü ilk kez çalışma zamanında kullanan uç.
- **İstemci:** `packages/api-client/src/hooks/useAccount.ts`.
- **UI:** profil sayfasında çift onaylı silme akışı.

**Kanıt:**

- RLS senaryoları **118 → 124** (6 yeni): 119 (tam süpürme), 120 (izolasyon —
  başka bir kullanıcının verisi etkilenmiyor), 121 (idempotanslık — ikinci çağrı hata
  üretmiyor), 122 (danışan kendi hesabını doğrudan SQL'den silemiyor, yalnızca
  `service_role` yolu), 123 (denetim kaydı sözleşmesi — kişisel veri yok), 124 (yetki
  yüzeyi sürüklenme testi + koç kapısı).
- E2E `apps/web/tests/e2e/account-deletion.spec.ts` **4/4 gerçekten koştu** (yerel).

### B-043 — AI günlük kotası TAMAMLANDI

- `apps/web/src/lib/api/ai-quota.ts` yazıldı; `proxy.ts`'e "0.4) Kota" adımı olarak
  eklendi — doğrulanmış `user.id` ile çalışıyor, bu sayede kimlik doğrulama gidiş-dönüşü
  2'den 1'e indirildi.
- `AI_QUOTA_DAILY_LIMIT` `env.server.ts` zod şemasında tanımlı; varsayılan **20**,
  geçersiz değerde başlangıçta hata verir (**sessiz sınırsız kota yok**).
- Aşımda **429** + Türkçe hata mesajı + `Retry-After` başlığı.
- Gün penceresi `@repo/api-client`'ın `date` modülündeki `todayIsoDate()`'ten — proje
  genelinde tek kaynak korunuyor (Faz 4'ün UTC/yerel tarih hatası düzeltmesiyle aynı
  fonksiyon).
- **Yarış testi** (AC-4.6.3'ün çekirdeği): eşzamanlı `Promise.all` çağrılarında geçen
  istek sayısının limiti **aşmadığı** kanıtlandı.

### B-056 — WorkoutTab AI formu TAMAMLANDI

`apps/web/src/components/tabs/WorkoutTab.tsx`'teki sabit `age: 20, goal: 'bulk',
weight: 75` gönderimi kaldırıldı. `NutritionTab` deseniyle aynı yaklaşım: `useForm` +
`zodResolver` + mevcut `aiWorkoutSchema`. Kilo alanı `useProgressEntries` ile son
ölçümden ön dolduruluyor; kayıt yoksa **boş bırakılıyor** (sahte varsayılan yazılmadı).
3 yeni test.

### B-040 — TAMAMLANDI (seed.sql'e dokunulmadan)

`apps/web/tests/e2e/plans.spec.ts` artık akışın sonunda danışanla yeni bir `pending`
onay kaydı üretiyor; test artık kendi tükettiği fikstürü kendi yeniliyor, koçun demo
kuyruğu E2E koşusundan sonra boşalmıyor. `supabase/seed.sql` değişmedi.

### B-028 + B-008 — TAMAMLANDI (AC-4.6.4 kapandı, aynı gün ikinci paralel tur)

**Mimari ölçüm.** Dosya tarayıcıdan **doğrudan** Storage'a gidiyor (`useMessages.ts` →
`storage.from('message-attachments').upload()`), arada route yok. "Yüklemeyi route'a
taşı" seçeneği üç ölçülebilir sebeple **reddedildi**: (1) Vercel serverless gövde tavanı
4.5 MB, bucket tavanı 5 MB → 4.5-5 MB arası meşru fotoğraflar sessizce kırılırdı; (2) yol
sahipliği bugün RLS ile zorlanıyor (`message_attachments_insert_own`), route'a taşımak
`service_role` ile yazmayı gerektirirdi; (3) aynı bayt iki kez ağdan geçerdi.

**Seçilen çözüm — yükleme sonrası doğrulama + veritabanı kapısı.**
`POST /api/attachments/verify` nesnenin ilk 32 baytını kendi okur, uyumsuzsa nesneyi
siler ve 422 döner. Bu uç TEK BAŞINA güvenlik sınırı değil (istemci atlayabilir); asıl
kapı veritabanında: `messages` üzerinde `AFTER INSERT` tetikleyicisi, ek içeren satırı
yalnızca sunucunun bıraktığı **damga** varsa kabul ediyor; damgayı yazan RPC'nin
`EXECUTE`'u yalnız `service_role`'de.

**TOCTOU eTag ile kapatıldı.** Baytlar ve `etag` aynı HTTP yanıtından geliyor; damgaya
eTag yazılıyor, tetikleyici `storage.objects.metadata->>'eTag'` ile karşılaştırıyor —
doğrula-sonra-değiştir (yeniden yükleme / sil+yükle) reddediliyor. Damga tek kullanımlık
ve 15 dk sonra bayat.

**İki ince karar.**

- Tetikleyici `AFTER INSERT` çünkü CHECK'ler BEFORE tetikleyicilerden sonra
  değerlendirilir; BEFORE olsaydı senaryo 89c/89d'nin ölçtüğü 23514 invaryantı 42501 ile
  gölgelenirdi.
- Tetikleyici `SECURITY INVOKER` olmak ZORUNDA: DEFINER içinde `current_user='postgres'`
  olur, `is_end_user_write()` hep false döner ve kapı sessizce açılırdı — yetki
  gerektiren küçük parça ayrı DEFINER yardımcıya (`consume_attachment_verification`)
  taşındı, RLS senaryo 126 bunu ölçüyor.

**Magic-byte tek kaynak.** `packages/api-client/src/upload-validation.ts` — yeni
çevre-bağımsız `validateImageBytes(head, reportedType)`; istemci sarmalayıcı, sunucu
aynı fonksiyonu çağırıyor. `MAGIC_BYTE_SNIFF_LENGTH = 32` hem istemcinin `file.slice()`
penceresi hem sunucunun `Range: bytes=0-31` başlığı. Tür listesi DEĞİŞMEDİ
(jpeg/png/webp/avif).

**B-008 — `createSignedUrl` API gerçeği doğrulandı** (`@supabase/storage-js@2.112.3` tip
tanımı + canlı ölçüm, storage-api v1.69.0): `?token=…` → `Content-Disposition` YOK;
`?token=…&download=` → `content-disposition: attachment;`. **Falsy tuzağı:**
`download: ''` parametreyi sessizce düşürüyor, bu yüzden boş ad `true`'ya düşürülüyor
(bkz. `docs/PROGRESS.md` §4 tuzak). Yollar ayrıldı: `createSignedUrl` inline kalıyor
(`<img src>` — avatar/poz/ilerleme/sohbet eki), yeni `createSignedDownloadUrl` yalnız
`MessagesTab`'daki "İndir" bağlantısında.

**Sahte MIME kırmızı-yeşil kanıtı.** `validateImageBytes` çağrısı geçici olarak B-028
öncesi davranışa (yalnız beyan edilen tür allowlist'te mi) çevrildi → 4 test kırmızı
("image/png diyen ama baytları PNG olmayan dosyayı reddeder", "yürütülebilir (MZ)
içerik", "sıfır baytlık nesne", "`image/jpg` yazımı"); magic-byte kararı geri konunca
37/37 yeşil.

**Canlı uçtan uca kanıt** (yerel yığın, gerçek kullanıcı JWT'si, sonrası temizlendi):
`Content-Type: image/png` + HTML baytları yüklemesi 200 döndü (B-028'in öncülü canlı
doğrulandı) → sunucunun `Range` okuması 206 + eTag + ilk baytlar `<html><script` →
damgasız INSERT **403/42501 "ek dosyasi sunucu tarafinda dogrulanmamis"** → damga
yazılınca aynı INSERT geçti.

**Yeni/değişen dosyalar:** yeni
`supabase/migrations/20260819110000_attachment_magic_byte_verification.sql`,
`apps/web/src/app/api/attachments/{verification-core.ts,verify/route.ts}`,
`apps/web/tests/unit/attachment-validation.test.ts` (37 senaryo); değişen
`upload-validation.ts`, `storage.ts`, `useMessages.ts`, `query/keys.ts`,
`packages/types/src/database.ts`, `MessagesTab.tsx`, `supabase/tests/rls.test.sql`,
`messages-tab.test.tsx`.

**Kapı doğrulama tablosu (AC-4.6.5'in kanıtı):**

| Kapı                                     | Sonuç                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm run test` / `test:coverage`        | 62 dosya / **763 test** · stmts+lines **%62.73** · branch 81.82 · funcs 64.14 (eşik 60/60/55, düşürülmedi) |
| `pnpm run test:rls`                      | **126 senaryo** (124 → +2: 125, 126)                                                                       |
| `pnpm run lint`                          | 0 hata (mevcut `<img>` uyarıları)                                                                          |
| `pnpm run type-check` / `type-check:e2e` | temiz                                                                                                      |
| `pnpm run format:check`                  | temiz                                                                                                      |
| `pnpm run build`                         | başarılı                                                                                                   |
| `pnpm audit --prod --audit-level=high`   | exit 0                                                                                                     |

**Bu turda kapsam dışı kalanlar borç olarak açıldı** (bkz. `docs/PROGRESS.md` §3):
`form-checks-media`/`avatars`/`progress-photos` bucket'larında aynı magic-byte
doğrulaması yok (**B-059**); ek dosya gönderme akışının E2E senaryosu yok (**B-060**).

---

## Kapanmayan / açık kalan

### B-033 — env dosyası (kapanmadı, karar verildi)

`apps/web/.env.hosted.local` içindeki düz metin `service_role` anahtarı bu turda
silinmedi. Karar (Fable, 2026-08-19): önce Supabase panelinden JWT secret rotate
edilecek (kullanıcı aksiyonu — publishable + secret key'e geçiş, sonra legacy JWT devre
dışı bırakılacak), sonra dosyadaki `SUPABASE_SERVICE_ROLE_KEY` satırı tamamen silinecek;
yeni anahtar diske hiç yazılmayacak, oturumda `$env:` ile set edilecek. Ayrıntı:
`docs/PROGRESS.md` §3.

**Dağıtım sözleşmesi notu:** `SUPABASE_SERVICE_ROLE_KEY` artık iki runtime yolunun ön
koşulu — hesap silme (B-042/ADR-0025) ve fotoğraflı mesaj gönderme (B-028'in damga
yazımı). Anahtar yoksa ikisi de **fail-closed 503** verir, sessizce çalışmaz. Sır
yönetimi yordamı: [`docs/ops/sir-yonetimi.md`](../ops/sir-yonetimi.md) (bu dosyaya
dokunulmadı, yalnızca referans).

---

## Faz 4.6 sonucu

**TAMAMEN KAPANDI (2026-08-19).** Beş AC'nin tamamı karşılandı. Sırada Faz 5 — Sağlık
Verisi Senkronizasyonu (`active_planprogram.md` §8); ayrıca bekleyen kullanıcı
aksiyonları (B-033 anahtar rotasyonu, B-030 gerçek hosted yedeği, repo'nun OneDrive
dışına taşınması) ve dependabot majör kararları var. Ayrıntı: `docs/PROGRESS.md` §5.
