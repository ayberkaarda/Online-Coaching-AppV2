# 0012 — PWA'nın korunması ve build'in `next build --webpack` ile alınması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi

## Bağlam

Next.js 16, varsayılan derleyici olarak Turbopack'e geçti. Ancak `next-pwa` v5 bir webpack
eklentisidir (service worker/workbox üretimi webpack'in build grafiğine bağımlı) ve
Turbopack ile çakışıyor — build sırasında hata veriyor. PWA'nın korunması gerekliliği
(danışanların zayıf bağlantıda antrenman verisine erişebilmesi, bkz.
`0006-next-pwa-korunmasi.md`) ile Next.js 16'nın varsayılan derleyicisi arasında doğrudan
bir çakışma ortaya çıktı.

## Karar

Turbopack'e geçiş **yapılmadı**; PWA korundu ve bunun doğal sonucu olarak build webpack
motoruyla alınıyor. `package.json` `build`/`dev` script'leri `next build --webpack` /
`next dev --webpack` olarak sabitlendi (bkz. `active_planprogram.md` revizyon notu R8,
teknoloji tablosu: "Build motoru — webpack — `next build --webpack`").

## Sonuçlar

### Olumlu

- PWA/service worker işlevselliği (çevrimdışı `workout_logs` erişimi) hiçbir feda edilme
  olmadan korundu.
- Karar açıkça `package.json` script'lerine yansıtıldı — geliştiricinin "neden Turbopack
  kullanılmıyor" sorusuna kod içinde doğrudan cevap var.

### Olumsuz / kabul edilen bedeller

- Next.js 16'nın Turbopack'in getirdiği hız avantajlarından (daha hızlı dev-server başlatma,
  daha hızlı incremental build) production build'de faydalanılamıyor.
- `@ducanh2912/next-pwa` gibi alternatifler de webpack tabanlı olduğundan bu bir "geçici"
  çözüm değil — Turbopack'e geçiş, PWA'yı tamamen bırakmayı (veya Turbopack destekli başka
  bir service-worker çözümü bulmayı) gerektiriyor; bu iş şu an için ertelenmiş durumda
  (bkz. `docs/PROGRESS.md` §8 "Ertelenenler": `next-pwa` → `@ducanh2912/next-pwa` veya
  Turbopack'e geçiş).

### Etkilenen dosyalar

- `package.json` (`build`, `dev` script'leri)
- `next.config.mjs` (`withPWA(...)` sarmalayıcısı)
- `active_planprogram.md` §1.3 teknoloji tablosu (plan revizyonu — R8)
