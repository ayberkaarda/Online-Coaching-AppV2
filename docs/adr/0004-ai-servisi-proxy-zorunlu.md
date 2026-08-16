# 0004 — AI servisine erişimin Next.js proxy'si üzerinden zorunlu kılınması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

FastAPI AI servisinin (`ai_backend/`) bağımsız, ölçeklenebilir bir servis olarak
konuşlanması gerekiyordu; ancak tarayıcıdan doğrudan erişim (`http://localhost:8000` gibi)
güvenlik ve gözlemlenebilirlik riskleri taşıyordu — API anahtarı sızıntısı, gevşek CORS
(`["*"]` + credentials), rate limit'in tek katmanda kolayca atlanabilmesi ve isteklerin uçtan
uca izlenememesi.

## Karar

Tarayıcı, FastAPI'ye **hiçbir zaman doğrudan** istek atmaz; her zaman
`src/app/api/ai/{workout,nutrition,recommendations}/route.ts` üzerinden geçer
(`src/lib/api/proxy.ts` → `handleAiProxy`). Detaylı tasarım için bkz.
`docs/ARCHITECTURE.md` §5.

## Sonuçlar

### Olumlu

- FastAPI'nin `CORS_ORIGINS`'i tek bir origin'e (Next.js) kilitlenebildi.
- `API_KEY` (`X-API-Key` header'ı) tarayıcıya hiç gitmiyor, yalnızca sunucu-sunucu isteğinde
  ekleniyor.
- Çift katmanlı rate limiting (Next.js `proxy.ts` + FastAPI `slowapi`) tek bir servisin
  atlanmasıyla sınırın delinmesini engelliyor.
- Her isteğe `crypto.randomUUID()` ile üretilen `requestId`, hem Next.js pino loguna hem
  FastAPI'ye giden `X-Request-ID` header'ına yazılıyor — tek bir isteğin uçtan uca izi tek
  kimlikle sürülebiliyor.
- Hata eşlemesi standardize edildi (400/422/502/503, `docs/ARCHITECTURE.md` §5 tablosu);
  istemci tarafında tek tip `ApiError` fırlatılıyor (bkz. `0008-apierror-firlatma.md`).

### Olumsuz / kabul edilen bedeller

- Next.js sunucusu her AI isteğinde ek bir hop (proxy) ekliyor — gecikme marjinal olarak
  artıyor.
- Proxy katmanının kendisi (`handleAiProxy`) ek bir bakım yüzeyi.

### Etkilenen dosyalar

- `src/app/api/ai/workout/route.ts`
- `src/app/api/ai/nutrition/route.ts`
- `src/app/api/ai/recommendations/route.ts`
- `src/lib/api/proxy.ts`
- `src/lib/api/ai.ts`
- `ai_backend/app/core/config.py` (`CORS_ORIGINS`)
