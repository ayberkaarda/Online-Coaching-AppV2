# 0010 — Koç profilinin tüm authenticated kullanıcılara görünür kılınması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

Dördüncü oturumda (`docs/DISCOVERY.md` envanteri sırasında) kritik bir kırık bulundu:
`profiles_select` RLS politikası `id = auth.uid() OR is_admin()` biçimindeydi — yani bir
danışan yalnızca kendi profilini ve (eğer kendisi koçsa) her şeyi görebiliyordu, ama sıradan
bir danışan **koçun profil satırını hiç göremiyordu**. Bunun sonucu: `useAdminId()` hook'u
`null` dönüyordu, `MessagesTab`'da sohbet partneri boş kalıyordu — danışan mesajlaşmayı hiç
kullanamıyordu (bkz. `docs/PROGRESS.md` §3 "Kritik kırık düzeltmeleri", madde 1).

## Karar

`supabase/migrations/20260816100000_fix_rls_visibility.sql` ile `profiles_select`
politikasına `role = 'admin'` koşulu eklendi (satırın kendi kolonu üzerinden, alt sorgu
değil — özyineleme riski yok). Sonuç: koçun profil satırı (e-posta dahil) artık **tüm**
authenticated kullanıcılara görünür.

## Sonuçlar

### Olumlu

- Mesajlaşma akışı çalışır hale geldi — `useAdminId()` artık koçun `id`'sini doğru
  döndürüyor.
- Tek koçlu modelle (bkz. `0007-tek-kocluk-model.md`) tutarlı: platformda zaten tek bir koç
  var, "hangi danışan hangi koçu görebilir" sorusu anlamsızlaşıyor — koç zaten herkesin
  koçu.
- Politika değişikliği minimal ve özyineleme riski taşımıyor (kolon karşılaştırması, alt
  sorgu yok).

### Olumsuz / kabul edilen bedeller

- **Bilinçli mahremiyet takası:** koçun e-postası da dahil olmak üzere profil satırı artık
  herkese açık. Tek koçlu modelde bu kabul edildi; koça özel hassas bir kolon eklenirse
  (ör. telefon numarası, özel notlar) kolon-sınırlı bir view'a geçilmesi gerekecek.
- Bu takas migration başlığında ve `supabase/README.md`'de kayıt altına alınmıştır — sessiz
  bir yan etki değil, belgelenmiş bir karardır.
- Çok koçlu bir modele geri dönülürse (bkz. `0007-tek-kocluk-model.md` "geri dönüşü pahalı"
  notu) bu politika de yeniden tasarlanmak zorunda kalır.

### Etkilenen dosyalar

- `supabase/migrations/20260816100000_fix_rls_visibility.sql`
- `supabase/README.md` (RLS matrisi notu)
- `src/hooks/useAdminId.ts` (dolaylı olarak — artık doğru veri alıyor)
