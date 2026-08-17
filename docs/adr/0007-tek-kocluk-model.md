# 0007 — Tek koçlu model benimsendi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi (kullanıcı kararı)

## Bağlam

`active_planprogram.md`'nin önceki sürümü (v1.0), §3.1'de `profiles.coach_id` kolonu ve
buna bağlı bir çok-koç RLS matrisi tanımlıyordu — yani birden fazla koçun aynı platformda
çalışabileceği, her koçun yalnızca kendi danışanlarını görebileceği bir model. Ancak ürünün
gerçek kullanım senaryosu (proje sahibinin kendi koçluk pratiği) her zaman **tek bir koç**
öngörüyor. Çok-koç desteği hem şema tarafında (`coach_id` FK, `EXISTS (... coach_id = ...)`
biçimli RLS koşulları) hem de uygulama tarafında (koç seçimi/atama akışları) ek karmaşıklık
gerektiriyordu ve hiçbir kullanıcı değeri karşılığında bu karmaşıklığı haklı çıkaracak bir
ihtiyaç yoktu.

## Karar

Kullanıcı kararıyla tek koçlu modele geçildi: `profiles.coach_id` kolonu ve çok-koç RLS
katmanı **reddedildi**. `active_planprogram.md` §3.1'den `coach_id` kaldırıldı, §3.2'deki
"koç yalnızca kendi danışanını görebilir" katmanı (`EXISTS (... coach_id = ...)` biçimli RLS
koşulları) sadeleştirildi — tek koç platformdaki tüm danışanları görür, ek eşleştirme
mantığına gerek yoktur (bkz. `active_planprogram.md` revizyon notu R3).

## Sonuçlar

### Olumlu

- Şema ve RLS matrisi önemli ölçüde sadeleşti — koç-danışan eşleştirme sorgularına,
  ekstra FK'ye ve ek RLS koşullarına gerek kalmadı.
- Uygulama tarafında koç atama/seçim UI'ı hiç yazılmayacak — kapsam daralması.
- Doğrudan sonucu: koç profilinin tüm authenticated kullanıcılara görünür kılınması kararı
  bu modelle tutarlı hale geldi (bkz. `0010-koc-profili-herkese-gorunur.md`) — tek koç zaten
  var olduğu için "hangi koç" sorusu ortadan kalkıyor.

### Olumsuz / kabul edilen bedeller

- **Geri dönüşü pahalı:** çok-koçluğa geçilmek istenirse `profiles.coach_id` **ek bir
  migration** ile yeniden getirilmesi ve RLS politikalarının yeniden yazılması gerekir.
- Ürün gelecekte birden fazla koç desteklemek isterse (ör. bir koçluk ajansı modeline
  geçilirse) bu ADR'nin gözden geçirilmesi ve muhtemelen yerini yeni bir ADR'nin alması
  gerekecek.
- Rol enum'unun (`admin`/`student` → `coach`/`client`) yeniden adlandırılması bu modelin
  Faz 1 şema yeniden yazımına bağlandı — ayrı bir iş olarak yapılmayacak (bkz.
  `0003-rol-enum-degerlerinin-korunmasi.md` "Güncel durum notu").

### Etkilenen dosyalar

- `active_planprogram.md` §3.1, §3.2 (plan revizyonu — R3)
- Faz 1 kapsamında: `profiles` tablosu şeması, ilgili RLS politikaları
