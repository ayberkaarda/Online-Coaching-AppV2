# 0005 — Bellek içi rate limiter'ın sınırı

- **Durum:** Kabul edildi (bilinen kısıtla)
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi

## Bağlam

`src/lib/rate-limit.ts` (Next.js middleware) ve FastAPI `slowapi`'nin varsayılan
`MemoryStorage`'ı, istek sayaçlarını process belleğinde tutar. Paylaşımlı bir sayaç deposu
(ör. Redis) kurmak ek altyapı ve operasyonel karmaşıklık gerektirir.

## Karar

Tek-instance dağıtımlar için (mevcut hedef: Vercel'de tek Next.js fonksiyon havuzu,
Railway/Fly.io'da tek FastAPI instance'ı) bellek içi sayaç yeterli kabul edildi; ek altyapı
(Redis/Upstash) şimdilik eklenmedi.

## Sonuçlar

### Olumlu

- Ek altyapı bağımlılığı (Redis, bağlantı yönetimi, ek maliyet) olmadan rate limiting canlıya
  alınabildi.
- Mevcut tek-instance dağıtım hedefiyle tutarlı, basit bir çözüm.

### Olumsuz / kabul edilen bedeller

- **Çoklu instance'a (yatay ölçekleme) geçildiğinde bu limiter işe yaramaz hale gelir** — her
  instance kendi sayacını tutar, gerçek toplam istek sayısı `N × limit`'e kadar çıkabilir.
- Yatay ölçekleme gündeme geldiğinde paylaşılan bir sayaç deposu (Redis, Upstash) zorunlu
  hale gelecek; bu, mevcut kod tabanında **yapılmamıştır** (bkz. `UPGRADE_NOTES.md` §7 risk
  tablosu, `docs/PROGRESS.md` §8 "Ertelenenler").

### Etkilenen dosyalar

- `src/middleware.ts`
- `src/lib/rate-limit.ts`
- `ai_backend/app/core/rate_limit.py`
