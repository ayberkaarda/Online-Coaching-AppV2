# 0013 — Rollerin `coach`/`client` olarak yeniden adlandırılması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-17
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

Bu ADR, `0003-rol-enum-degerlerinin-korunmasi.md`'nin yerini alır.

0003'te, veritabanı rol enum'unun (`admin`/`student`) yeniden adlandırılmaması kararı
alınmıştı. Gerekçe iki katmanlıydı: (1) `ALTER TYPE ... RENAME VALUE`'nun tüm bağımlı RLS
politikalarının ve `is_admin()` / `profile_role()` RPC fonksiyonlarının gözden geçirilmesini
gerektirmesi ve geriye dönük veri riski taşıması; (2) o an önceliğin "v1.0 production-ready"
yükseltmesini tamamlamak olması — izole, riskli bir şema göçünü o kapsamın dışında tutmak.
0003'ün kendisi de bu kararın kalıcı olmadığını, Faz 1'in şema yeniden yazımına
bağlanacağını not ediyordu.

Faz 1a ile bu koşullar değişti:

- Faz 1 şema işi zaten `user_role` enum'una ve bağımlı RLS politikalarına dokunuyordu —
  yeniden adlandırma artık ek, izole bir risk değil, zaten yapılan işin bir parçası.
- `ALTER TYPE ... RENAME VALUE`'nun etiketin `pg_enum` OID'ini koruduğu, dolayısıyla mevcut
  satır verisini bozmadığı doğrulandı: `db reset` sonrası `profiles` tablosunda coach 1,
  client 2 satır sayısıyla veri sağlam kaldı. Aynı OID-korumalı yeniden adlandırma
  `public.is_admin(uuid)` → `public.is_coach(uuid)` fonksiyonu için de geçerliydi; 34
  politika hiçbiri düşmeden otomatik olarak yeni fonksiyon adına döndü.
- "admin = koç, student = danışan" zihinsel çevirisini süresiz taşımanın maliyeti (kod
  okunurluğu, yeni katkıda bulunanlar için kafa karışıklığı, `is_admin()` gibi ürün diliyle
  uyuşmayan API adları) veri riski ortadan kalktığında artık kabul edilebilir değildi.

## Karar

Rol modeli, veritabanından koda kadar `coach`/`client` terminolojisine taşındı
(`supabase/migrations/20260817090000_rename_roles.sql`):

- `ALTER TYPE public.user_role RENAME VALUE 'admin' TO 'coach'` ve `'student' TO 'client'` —
  enum OID korunduğu için mevcut satır verisi bozulmadan taşındı.
- `public.is_admin(uuid)` → `public.is_coach(uuid)` olarak yeniden adlandırıldı. Postgres
  politika ifadeleri fonksiyonu OID ile tuttuğu için 34 politika otomatik olarak yeni ada
  döndü, hiçbiri düşmedi.
- 5 tabloda (`notifications`, `form_checks`, `daily_logs`, `workout_logs`,
  `program_approvals`) `student_id` → `client_id` kolon yeniden adlandırması yapıldı;
  bağımlı indeks, kısıt ve FK adları da hizalandı.
- Kod tarafında 38 dosya güncellendi: `isAdmin()` → `isCoach()`, `useAdminId()` →
  `useCoachId()`, `AdminUserManagement.tsx` → `CoachUserManagement.tsx`,
  `selectedStudentIds` → `selectedClientIds` vb.
- Bilinçli istisna: AI backend tel protokolündeki `student_id` alanı korundu (`ai_backend`
  bu adı bekliyor); ayrı bir işte hizalanacak.

Doğrulama: `db reset` ile sıfırdan kurulum, 19/19 RLS senaryosu, 192/192 birim testi, 16/16
E2E senaryosu ve başarılı build.

## Sonuçlar

### Olumlu

- Ürün dili (koç/danışan) ile veritabanı şeması ve kod artık birebir hizalı; 0003'ün kabul
  ettiği "sürekli zihinsel çeviri" bedeli ortadan kalktı.
- `is_coach()`, `useCoachId()` gibi adlar artık okunduğu gibi anlaşılıyor; `is_admin()`'in
  genel yetki sistemiyle karıştırılma riski kalmadı.
- Çok koçlu bir modele geçiş ileride gündeme gelirse (bkz. `0007-tek-kocluk-model.md`), rol
  adlandırması zaten doğru temel üzerinde olacağı için o geçiş bir isim değişikliği yükü
  taşımayacak.

### Olumsuz / kabul edilen bedeller

- Geniş kesitli bir diff: 38 dosya tek bir iş kapsamında değişti.
- Eski migration dosyaları hâlâ `admin`/`student` adlarını içeriyor; migration'lar zaman
  sıralı uygulandığı için işlevsel bir sorun değil, ama repoyu ilk kez inceleyen biri için
  kafa karıştırıcı olabilir.
- AI backend tel protokolü (`student_id` alanı) hizasız kaldı — bu ADR kapsamında bilinçli
  olarak ertelendi, ayrı bir iş olarak ele alınacak.
- Kullanıcıya görünen Türkçe arayüz metinleri hâlâ "Öğrenci"/"Yönetici" diyor; bu da ayrı bir
  iş.

### Etkilenen dosyalar

- `supabase/migrations/20260817090000_rename_roles.sql`
- `src/types/domain.ts`
- `src/hooks/**`
- `src/components/CoachUserManagement.tsx`
- `supabase/seed.sql`
- `supabase/tests/rls.test.sql`
