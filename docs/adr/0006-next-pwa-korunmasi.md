# 0006 — `next-pwa`'nın korunması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi

## Bağlam

Danışanların antrenman sırasında (spor salonunda, zayıf bağlantıda) `workout_logs`/
`profiles` verisine erişebilmesi gerekiyor. `next-pwa` v5 bir webpack eklentisidir ve
Next.js 16'nın varsayılan derleyicisi Turbopack ile çakışır.

## Karar

`next-pwa` service worker'ı korunur; yalnızca `workout_logs` REST çağrıları `NetworkFirst`
stratejisiyle 1 hafta önbelleklenir. Storage nesneleri (form-check fotoğrafları) kasıtlı
olarak **hiç önbelleklenmez** (`NetworkOnly`) — cihaz hafızasını ve kullanıcı fotoğraflarının
çevrimdışı sızma riskini sınırlamak için. `next.config.mjs`'te `withPWA(...)` sarmalayıcısı
üretimde aktif, geliştirmede (`NODE_ENV === 'development'`) devre dışı.

Bu ADR, ilgili build-motoru kararıyla (bkz. `0012-pwa-webpack-build.md`) birlikte
okunmalıdır — `next-pwa`'yı korumak, build'in `next build --webpack` ile alınması kararını
doğrudan gerektirir.

## Sonuçlar

### Olumlu

- Danışanlar zayıf bağlantıda dahi son bilinen antrenman/profil verisine erişebiliyor.
- Form-check fotoğrafları gibi hassas medya asla cihazda önbelleğe yazılmıyor.

### Olumsuz / kabul edilen bedeller

- App Router hydration script'i nedeniyle CSP `script-src` içinde `'unsafe-inline'`
  gereksinimi doğdu (nonce tabanlı CSP'ye geçiş ayrı bir iyileştirme olarak
  `next.config.mjs` içinde TODO ile işaretli).
- `next-pwa` v5 sürdürülmüyor, Next.js 16 ile uyumu resmî olarak doğrulanmadı
  (`UPGRADE_NOTES.md` §7 risk tablosu); `@ducanh2912/next-pwa`'ya geçiş değerlendirilmesi
  ertelendi.
- Turbopack'in hız avantajından üretim build'inde faydalanılamıyor (`next build --webpack`
  zorunlu).
- Sağlamlaştırma turunda bir mahremiyet açığı bulundu ve düzeltildi: `runtimeCaching` kuralı
  başlangıçta `profiles` yanıtlarını da (e-posta + beslenme/antrenman programları dahil) 7
  gün cihazda tutuyordu; `profiles` önbellekten çıkarıldı ve `useSignOut`
  `queryClient.clear()` + workbox cache temizliği yapacak şekilde güncellendi (bkz.
  `docs/PROGRESS.md` §3 "Sağlamlaştırma turu").

### Etkilenen dosyalar

- `next.config.mjs` (`withPWA(...)`, `runtimeCaching`)
- `package.json` (`build`/`dev` script'leri: `next build --webpack` / `next dev --webpack`)
- `src/hooks/useSignOut.ts` (mahremiyet düzeltmesi)
