# 0002 — Sunucu state yönetimi için TanStack Query seçimi

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi

## Bağlam

Supabase verisi + Supabase Realtime event'leri + AI proxy sonuçları için tutarlı bir
istemci-taraflı cache/senkronizasyon katmanı gerekiyordu. Önceki tek-dosyalık halde manuel
`useState`/`useEffect` tabanlı veri çekimi vardı; bu, cache tutarlılığı, yeniden deneme
stratejisi ve Realtime ile senkronizasyon açısından ölçeklenmiyordu.

## Karar

Redux veya SWR yerine **TanStack Query** benimsendi:

- Merkezi `queryKeys` fabrikası (`src/lib/query/keys.ts`) — tüm anahtarlar buradan üretilir,
  elle dizi yazılmaz. Kök anahtarlar (`queryKeyRoots`) prefix-invalidation için ayrı tutulur.
- Tip güvenli önbellek yapılandırması (`src/lib/query/queryClient.ts`): `staleTime: 60s`,
  `gcTime: 5dk`, `refetchOnWindowFocus: false`.
- Yeniden deneme stratejisi `ApiError` durumuna göre dallanır: 4xx istemci hataları tekrar
  denenmez, diğer hatalar en fazla 2 kez denenir; mutasyonlar hiç yeniden denenmez
  (`retry: 0`).
- Supabase Realtime event'leri (`messages`, `notifications`, `program_approvals`) doğrudan
  DOM'a yazılmaz; `invalidateQueries` (veya düşük hacimli akışlarda `setQueryData`) ile
  köprülenir — tek doğruluk kaynağı TanStack Query cache'i kalır.

Detaylı davranış için bkz. `docs/ARCHITECTURE.md` §4.

## Sonuçlar

### Olumlu

- Veri çekme mantığı bileşenlerden hook'lara (`src/hooks/`) taşındı; manuel
  `useState`/`useEffect` tabanlı veri çekimi ortadan kalktı.
- Optimistic update (bildirim okundu işaretleme, mesaj gönderme) düşük riskli akışlarda
  kullanılabildi; yüksek etkili akışlar (program onay/ret) sunucu yanıtı beklenerek
  senkronize kalabildi.
- Sunucuda (RSC/server action) her istek için taze bir `QueryClient` (`makeQueryClient()`),
  tarayıcıda modül seviyesinde önbelleklenen tek örnek (`browserQueryClient`) — sunucu
  isteklerinin birbirinin cache'ini kirletmesi engellendi.

### Olumsuz / kabul edilen bedeller

- Ek bağımlılık ve öğrenme eğrisi (Redux/SWR'a kıyasla daha fazla kavram: query key
  fabrikası, invalidation stratejisi, retry politikası).
- Realtime köprüleme mantığı (`invalidateQueries` vs. `setQueryData`) her tablo için ayrı
  ayrı düşünülmesi gereken bir tasarım kararı haline geldi.

### Etkilenen dosyalar

- `src/lib/query/keys.ts`
- `src/lib/query/queryClient.ts`
- `src/hooks/*`
