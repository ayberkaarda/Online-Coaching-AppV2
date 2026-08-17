# 0014 — Danışanın kendi beslenme planını kaydedebilmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

`active_planprogram.md` §3.2, normalize plan tabloları için "plan tablolarına **yalnızca koç**
yazar" diyor. Faz 1b Adım 3a, beslenme planlarını `profiles.nutrition_plan` JSON string
kolonundan `public.nutrition_plans` + `public.nutrition_plan_meals` tablolarına taşırken bu
kuralın bugünkü ürün davranışıyla çeliştiği görüldü.

Doğrulanan mevcut davranış:

- `src/components/tabs/NutritionTab.tsx` içindeki **"Beslenme Tablosunu Kaydet"** butonu role
  bakılmaksızın render ediliyor; aynı dosyadaki `handleSaveProgram`, `userRole === 'coach'`
  değilse `clientIds = [currentUserId]` kuruyor. Yani danışan **kendi** beslenme planını
  doğrudan kaydediyor.
- Antrenman tarafındaki onay akışının (`program_approvals`, `src/hooks/useProgramApprovals.ts`)
  **beslenme karşılığı yok** — beslenme planı için "onaya sun / koç onaylasın" diye bir yüzey
  bulunmuyor.
- Bu davranış `tests/e2e/plans.spec.ts` içindeki "danışan kendi beslenme planını kaydeder ve
  yenilemeden sonra da görür" senaryosuyla kilitli; testin kendi yorumunda da bunun bilinçli
  bir davranış kilidi olduğu yazılı.

RLS politikalarını §3.2'ye harfiyen yazmak (yazmayı yalnızca `is_coach()`'a açmak), Adım 3b'nin
kod cutover'ında bu akışı **sessizce** kırardı: buton görünmeye devam eder, kaydetme isteği
RLS ihlaliyle reddedilirdi.

Aynı çelişki bir adım önce antrenman tarafında da yaşandı ve orada da mevcut davranış korundu
(`supabase/migrations/20260817110000_workout_plan_tables.sql` §6 sapma notu). Bu ADR o kararın
beslenme karşılığını kayıt altına alır; aradaki fark, antrenmanda en azından bir onay akışının
bulunması, beslenmede ise hiç bulunmamasıdır.

## Karar

`nutrition_plans` ve `nutrition_plan_meals` RLS politikaları §3.2'den **bilinçli olarak sapar**:
danışan **yalnızca kendi** `client_id`'sine ait plan ve öğün satırlarına yazabilir
(INSERT / UPDATE / DELETE). Koç her zaman yazabilir.

- `nutrition_plans` INSERT / UPDATE / DELETE: `public.is_coach() or client_id = auth.uid()`
- `nutrition_plan_meals` INSERT / UPDATE / DELETE: aynı koşul, plan üzerinden `EXISTS` ile
  türetilir
- SELECT: `client_id = auth.uid() or public.is_coach()`
- `anon` rolünden tüm yetkiler `REVOKE` edilir

Yazma RPC'si `public.save_nutrition_plan(uuid[], jsonb)` `SECURITY INVOKER`'dır — RLS çağırana
uygulanır ve ihlal hâlinde hata yükselir, çağrı atomik olarak geri alınır.

Sapmanın sınırı testlerle kilitlenmiştir (`supabase/tests/rls.test.sql`):

- senaryo 30 — danışan kendi beslenme planına yazabilir (davranışın kendisi)
- senaryo 31 — danışan başka danışanın planına yazamaz
- senaryo 34 — `save_nutrition_plan` başkasının id'siyle RLS hatası verir
- senaryo 35 — karma listede atomiklik: kısmi yazma olmaz

## Sonuçlar

### Olumlu

- Mevcut ürün davranışı Adım 3b cutover'ında **sessizce kırılmaz**; kullanıcıya görünen
  "Beslenme Tablosunu Kaydet" akışı normalize tablolar üzerinde aynen çalışmaya devam eder.
- Politikalar antrenman tarafıyla (`workout_plans` / `workout_plan_exercises`) birebir aynı
  şekle sahip olur; iki plan yüzeyi arasında açıklanması gereken bir yetki farkı kalmaz.
- Sapmanın **sınırı** makine tarafından korunur: danışan-danışan sızıntısı dört ayrı RLS
  senaryosuyla kapalıdır.

### Olumsuz / kabul edilen bedeller

- Danışan, koçun verdiği beslenme planını **değiştirebilir**. Koç için bir **denetim izi yok**:
  `nutrition_plans` tablosunda satırı kimin yazdığını tutan bir kolon bulunmuyor, yalnızca
  `updated_at` var. Koç, planın danışan tarafından değiştirildiğini fark edemeyebilir.
- `save_nutrition_plan` aktif planın **tüm** öğün satırlarını silip yeniden yazdığı ve Faz 1b'de
  yeni versiyon üretilmediği için, danışanın kaydı koçun önceki içeriğinin üzerine yazar; eski
  içeriğe dönmenin bir yolu yoktur.
- Ürün planı (`active_planprogram.md` §3.2) ile veritabanı gerçeği arasında belgelenmiş bir
  fark oluşur. Bu fark üç yerde birden yazılıdır (migration §6 blok yorumu,
  `supabase/README.md` §4, bu ADR).

### Gözden geçirme koşulu

Beslenmeye de bir onay akışı gelirse (antrenmandaki `program_approvals` benzeri bir "önerilen
plan" yüzeyi), bu ADR **gözden geçirilmelidir**: danışanın yazması o yüzeye taşınır ve
`nutrition_plans` / `nutrition_plan_meals` yazma politikaları §3.2'ye, yani yalnızca koça
daraltılır.

### Etkilenen dosyalar

- `supabase/migrations/20260817130000_nutrition_plan_tables.sql`
- `supabase/tests/rls.test.sql`
- `supabase/README.md`
