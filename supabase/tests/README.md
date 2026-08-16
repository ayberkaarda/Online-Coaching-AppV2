# RLS Testleri

`rls.test.sql`, `public` şemasındaki Row Level Security (RLS) politikalarını
doğrulayan, tekrar çalıştırılabilir bir SQL test paketidir. `active_planprogram.md`
AC-1.2 ("RLS test script'i ile senaryolar doğrulanır") kabul kriterinin
karşılığıdır ve `20260816100000_fix_rls_visibility.sql` ile düzeltilen iki
regresyonun (koç profilinin görünmemesi, danışanın koça bildirim yazamaması)
geri gelmesine karşı kalıcı koruma sağlar.

## Ne yapar

19 senaryo çalıştırır: görünürlük (kim hangi profili görebilir), satır
izolasyonu (danışanlar birbirinin verisini göremez), yazma yetkisi (kimin
neye yazabileceği — yetki yükseltme ve spam koruması dahil), mesajlaşma
izolasyonu ve katalog tabloları (exercises/food_database) erişimi.

Her senaryo `authenticated` veya `anon` rolüne, `SET LOCAL request.jwt.claims`
ile ilgili kullanıcının `sub` claim'ini vererek geçer (bkz. `auth.uid()`
tanımı) ve **beklenen ile gerçek sonucu karşılaştırır**. Uyuşmazlıkta
`raise exception` ile script durur; bu psql'i sıfırdan farklı çıkış koduyla
sonlandırır (`ON_ERROR_STOP=1` sayesinde), yani CI'da kırmızı verir. Sessizce
geçen (her zaman yeşil) bir test script'i değildir.

## Nasıl çalıştırılır

```bash
npm run test:rls
```

Doğrudan da çalıştırılabilir:

```bash
docker exec -i supabase_db_my-coaching-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/rls.test.sql
```

## Önkoşul

- Yerel Supabase Docker yığını ayakta olmalı (`supabase start`).
- `supabase/seed.sql` uygulanmış olmalı (seed kimlikleri script içinde
  sabittir: koç `11111111-…`, danışan A `22222222-…`, danışan B `33333333-…`).

## Veriyi değiştirmez

Her senaryo kendi `BEGIN; ... ROLLBACK;` bloğu içinde çalışır — yazma
senaryoları (insert/update denemeleri) dahil hiçbir satır gerçek tabloda
kalıcı olarak değişmez. Script birden çok kez, herhangi bir sırada güvenle
tekrar çalıştırılabilir.

## CI'a ekleme notu

GitHub Actions içinde bir job, Supabase CLI ile yerel yığını ayağa kaldırıp
(`supabase start`) migration + seed'i uyguladıktan sonra bu script'i
`docker exec` üzerinden çalıştırabilir; script'in çıkış kodu (`$?`) job'ın
başarı/başarısızlığını belirler (`ON_ERROR_STOP=1` sayesinde ekstra bir
kontrol yazmaya gerek yoktur). `active_planprogram.md` §13'teki "RLS (SQL
testleri, CI'da)" kalemi bu script'e bağlanır.
