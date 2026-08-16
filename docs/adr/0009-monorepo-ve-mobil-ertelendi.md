# 0009 — Monorepo ve mobil uygulamanın Faz 4.5'e ertelenmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

`active_planprogram.md`'nin önceki sürümü (v1.0), Faz 0 kapsamında pnpm workspaces +
Turborepo tabanlı bir monorepo dönüşümünü (`packages/*`) ve bir Expo (React Native) mobil
uygulama iskeletini erken bir aşamada öngörüyordu. Ancak bu, mevcut tek-repo Next.js
uygulamasını riske atan en yıkıcı yapısal adımdır (build sistemi, script'ler, CI, dosya
yolları — hepsi değişir) ve hiçbir doğrudan kullanıcı değeri üretmez. Monorepo'nun **tek**
gerekçesi mobil uygulamanın `packages/types` / `@repo/api-client` gibi paylaşılan paketlere
ihtiyaç duymasıdır; mobil ise ürün yol haritasında ancak Faz 5 (sağlık verisi/HealthKit
entegrasyonu) civarında zorunlu hale geliyor.

## Karar

Monorepo dönüşümü (pnpm + Turborepo, `packages/*`) ve Expo mobil iskeleti **Faz 4.5'e**
ertelendi (bkz. `active_planprogram.md` revizyon notu R2, R2b). Faz 0 ikiye bölündü:
tamamlanmış işler "Faz 0 — Temel (TAMAMLANDI)" olarak işaretlendi; monorepo/Expo ayrı,
gelecekteki bir faza taşındı. Mevcut tek-repo yapısında (`src/` altında Next.js 16), Faz 1
veri modeli/RLS işiyle devam edilecek.

## Sonuçlar

### Olumlu

- Faz 1 (veri modeli + RLS, en kritik iş) mevcut tek-repo yapısı üzerinde, ek yapısal
  değişiklik riski almadan ilerleyebiliyor.
- Mobil ihtiyacı gerçekten doğana kadar (Faz 5 sağlık verisi entegrasyonu) monorepo'nun
  bakım yükü (Turborepo pipeline yapılandırması, paylaşılan paket versiyonlama) hiç
  üstlenilmiyor.
- `active_planprogram.md` §1.2 topoloji diyagramı mevcut duruma çekildi:
  `apps/mobile · Expo RN · Faz 4.5` olarak etiketlendi, `@repo/api-client` →
  `src/hooks` + `src/lib/api` eşlemesi netleştirildi (R9).

### Olumsuz / kabul edilen bedeller

- Mobil uygulama isteyen kullanıcılar için teslim tarihi öteleniyor.
- Faz 4.5'e gelindiğinde monorepo dönüşümü yine de yapılacak — bu iş ortadan kalkmıyor,
  yalnızca zamanlaması değişiyor; o noktada `next build --webpack` / `next-pwa` kısıtının
  (bkz. `0012-pwa-webpack-build.md`) Turborepo pipeline'ına nasıl uyarlanacağı ayrıca ele
  alınmalı.
- `I-3` (`packages/types`) geçici olarak `src/types`'a uyarlandı; Faz 4.5'te tekrar
  taşınacak.

### Etkilenen dosyalar

- `active_planprogram.md` §1.2, Faz 0 ve Faz 4.5 bölümleri (plan revizyonu — R2, R2b, R9)
