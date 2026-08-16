# 0008 — `Result<T>` yerine tipli `ApiError` fırlatma

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi + Claude Code

## Bağlam

`active_planprogram.md`'nin önceki sürümü (v1.0) §3.4'te bir `Result<T>` sözleşmesi
öngörüyordu — başarı/hata durumunu dönüş değeri olarak taşıyan bir sarmalayıcı tip
(`Ok<T> | Err<E>` benzeri bir desen). Ancak gerçekte kod tabanı zaten TanStack Query
üzerine kuruluydu (bkz. `0002-tanstack-query-secimi.md`) ve TanStack Query'nin hata
makinesi (`isError`, `error`, `retry` mantığı) `queryFn`/`mutationFn`'in **fırlatmasına**
dayanır. `Result<T>` dönen bir istemci fonksiyonu her `queryFn` sınırında yine `throw`'a
çevrilmek zorunda kalıyordu — yani plan, kod tabanının fiilen kullandığı desenle çelişiyordu.

## Karar

`Result<T>` sözleşmesi **kaldırıldı**; yerine mevcut ve çalışan tipli `ApiError` fırlatma
modeli benimsendi. `src/lib/api/client.ts` (`apiFetch`) tüm başarısız yanıtları tek tip
`ApiError` (`status`, `code`, `message`, `details`, `requestId` alanlarıyla) olarak fırlatır;
UI katmanı yalnızca bu tek tipe karşı kod yazar (`ApiError.isApiError(e)` ile daraltma).
Query key sözleşmesi de `src/lib/query/keys.ts`'teki gerçek şekle uyarlandı (bkz.
`active_planprogram.md` revizyon notu R5).

## Sonuçlar

### Olumlu

- TanStack Query'nin retry/hata makinesiyle sürtünmesiz uyum — 4xx hatalarda retry yok,
  diğerlerinde en fazla 2 deneme (bkz. `0002-tanstack-query-secimi.md`).
- UI katmanı tek bir hata tipine karşı kod yazıyor; `Result<T>` ↔ `throw` çevirisi katmanı
  ortadan kalktı.
- AI proxy hata eşlemesi (`docs/ARCHITECTURE.md` §5 tablosu: `INVALID_JSON`,
  `VALIDATION_ERROR`, `AI_BACKEND_UNAVAILABLE`, `AI_BACKEND_ERROR`) doğrudan `ApiError.code`
  alanına yansıyor.

### Olumsuz / kabul edilen bedeller

- `Result<T>` desenini tercih eden ekipler/geliştiriciler için (hataların tip sisteminde
  açıkça göründüğü, `throw`'un "unchecked" olduğu bir model) bu bir tercih kaybı sayılabilir
  — fonksiyon imzasına bakarak bir çağrının hata fırlatıp fırlatmayacağı anlaşılmaz.
- Plan v1.1'de §3.4'ün düzeltilmesi ayrı bir iş kalemi olarak işaretlendi: `ApiError`'a
  planın asıl istediği iki bilgiyi (bkz. `active_planprogram.md` ilgili bölüm) taşıyan alan
  eklemeleri Faz 1'de tamamlanacak.

### Etkilenen dosyalar

- `src/lib/api/client.ts` (`apiFetch`, `ApiError` sınıfı)
- `src/lib/api/proxy.ts` (`handleAiProxy` hata eşlemesi)
- `src/lib/query/queryClient.ts` (retry stratejisi)
- `active_planprogram.md` §3.4 (plan revizyonu — R5)
