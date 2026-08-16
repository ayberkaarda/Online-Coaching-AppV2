# 0011 — AI proxy'lerinin Bearer token ile korunması

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

Dördüncü oturumda (`docs/DISCOVERY.md` envanteri) bulunan üçüncü kritik kırık: `/api/ai/*`
proxy uçlarında (bkz. `0004-ai-servisi-proxy-zorunlu.md`) **oturum kontrolü yoktu** — bu,
planın §5.3 şartını ihlal ediyordu. Giriş yapmamış herhangi biri AI backend'ini (dolayısıyla
FastAPI'nin işlem gücünü ve dolaylı olarak `API_KEY` korumalı upstream'i) kullanabiliyordu.
AI proxy'nin var oluş amacı (bkz. ADR-0004) zaten güvenlik/gözlemlenebilirlikti; kimlik
doğrulaması eksikliği bu amacı kısmen boşa çıkarıyordu.

## Karar

`src/lib/api/ai.ts` istemci tarafında her AI isteğine `Authorization: Bearer <token>`
header'ı ekleyecek şekilde güncellendi; `src/lib/api/proxy.ts` sunucu tarafında
(`handleAiProxy`) bu token'ı Supabase `getUser()` ile doğruluyor. Kimliksiz istek, upstream
FastAPI'ye **hiç ulaşmıyor** — proxy katmanında reddediliyor.

## Sonuçlar

### Olumlu

- Kimliksiz erişim tamamen kapatıldı; FastAPI backend'i yalnızca kimliği doğrulanmış
  kullanıcıların isteklerini görüyor.
- `0004-ai-servisi-proxy-zorunlu.md`'deki proxy zorunluluğu artık kimlik doğrulamasıyla
  tamamlanmış oluyor — proxy hem ağ hem kimlik sınırı olarak çalışıyor.
- Regresyon koruması eklendi: `tests/unit/proxy-auth.test.ts` (12 test); en kritik iddia:
  kimliksiz istekte `fetch` **hiç çağrılmıyor**.

### Olumsuz / kabul edilen bedeller

- İstemci tarafında her AI çağrısında güncel bir Supabase oturum token'ı taşınması
  gerekiyor — token süresi dolmuşsa/oturum kapalıysa ek hata yönetimi gerekiyor.
- Bu kırığın daha önce testlerden kaçmış olması, ilk sürümde bu tür kritik güvenlik
  kontrollerinin test kapsamı dışında kaldığını gösteriyor (bkz. `docs/PROGRESS.md` §3
  "Regresyon korumaları").

### Etkilenen dosyalar

- `src/lib/api/ai.ts`
- `src/lib/api/proxy.ts`
- `tests/unit/proxy-auth.test.ts`
