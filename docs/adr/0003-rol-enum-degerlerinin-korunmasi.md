# 0003 — Veritabanı rol enum değerlerinin (`admin`/`student`) korunması

- **Durum:** Yerini aldı: 0013
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

> **Not:** Bu karar `0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md` ile
> geçersiz kılınmıştır. Aşağıdaki metin tarihsel kayıt olarak korunmuştur.

## Bağlam

Ürün dilinde roller "koç" ve "danışan" olarak anılıyor; ancak veritabanı enum'u ve mevcut
satırlar `admin`/`student` değerlerini kullanıyor. Enum değerlerini yeniden adlandırmak
(`ALTER TYPE ... RENAME VALUE`) tüm bağımlı RLS politikalarının ve `is_admin()` /
`profile_role()` RPC fonksiyonlarının gözden geçirilmesini gerektirir ve geriye dönük veri
riski taşır.

## Karar

Enum değerleri **değiştirilmedi**; yalnızca UI/dokümantasyon seviyesinde bir terim eşlemesi
yapıldı: "koç = admin, danışan = student". Bu eşleme kod tabanı genelinde (bu doküman dahil)
açıkça belirtiliyor.

## Sonuçlar

### Olumlu

- RLS politikaları, RPC imzaları (`is_admin`, `profile_role`) ve mevcut satırlar değişmeden
  kaldı — geriye dönük veri taşıma riski alınmadı.
- Karar geri alınabilir kalıyor; yeniden adlandırma ayrı, izole bir migration'a
  ertelenebiliyor.

### Olumsuz / kabul edilen bedeller

- İsimlendirme, kod ile ürün dili arasında sürekli zihinsel çeviri gerektiriyor (bkz.
  `UPGRADE_NOTES.md` §7 risk tablosu).
- İleride yeniden adlandırma bir migration + tüm RLS/RPC gözden geçirmesi gerektirecek.

### Etkilenen dosyalar

- Veritabanı tarafında hiçbiri (kasıtlı olarak).
- `docs/ARCHITECTURE.md` (terim eşlemesi notu).

## Güncel durum notu

Bu ADR'nin **yerini** Faz 1'de kısmen `0007-tek-kocluk-model.md` alıyor: Faz 1 çıkış
kriterlerinde (`docs/PROGRESS.md` §6a madde 4) rol enum'unun `admin`/`student` →
`coach`/`client`'a taşınması artık tek koçlu modelin (bkz. ADR-0007) şema yeniden yazımına
bağlanmış durumda — ayrı bir iş olarak değil, Faz 1'in parçası olarak yapılacak.
