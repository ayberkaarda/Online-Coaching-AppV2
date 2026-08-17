# 0001 — TypeScript strict moduna geçiş

- **Durum:** Kabul edildi (devam eden migrasyon)
- **Tarih:** 2026-08-16
- **Karar verenler:** Proje sahibi

## Bağlam

Proje düz JavaScript (`.js`) tek-dosyalık bir hobi projesi olarak başladı. "v1.0
production-ready yükseltmesi" kapsamında `src/` altı paralel olarak `.ts`/`.tsx`'e taşındı
(bkz. `UPGRADE_NOTES.md` §2.1). Tip güvenliği olmadan `undefined`/`null` erişimleri ve şema
uyuşmazlıkları yalnızca çalışma zamanında ortaya çıkıyordu.

## Karar

`tsconfig.json`'da aşağıdaki strict ayarlar açıldı:

- `strict: true`
- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- `noUnusedLocals` / `noUnusedParameters`
- `allowJs: false`
- `moduleResolution: "bundler"`

`src/` altındaki tüm kaynak dosyalar `.ts`/`.tsx`'e taşındı; eski `.js` dosyaları
(`src/lib/supabase.js`, `src/lib/helpers.js`, `src/components/ThemeProvider.js`,
`src/app/clean.js`, `jsconfig.json`) kaldırıldı.

## Sonuçlar

### Olumlu

- Derleme zamanında yakalanan hata sınıfı genişledi (özellikle `undefined`/`null` erişimleri).
- `src/types/database.ts` gibi tip üretim araçları (`npm run db:types`) migrasyonu
  kolaylaştırıyor.

### Olumsuz / kabul edilen bedeller

- Geçiş dönemi boyunca (artık tamamlanmış olsa da) `.js` ve `.ts` dosyaları bir arada
  bulunuyordu.
- `src/types/database.ts` başlangıçta **elle yazıldı**; gerçek şemayla senkron olduğu ilk
  seferde doğrulanmamıştı (ikinci oturumda `npm run db:types` ile yeniden üretilip elle
  yazılanla birebir eşleştiği doğrulandı — 183 alan, sıfır fark, bkz. `docs/PROGRESS.md` §2).

### Etkilenen dosyalar

- `tsconfig.json`
- `src/**/*.ts`, `src/**/*.tsx` (tüm kaynak ağacı)
- `src/types/database.ts`, `src/types/domain.ts`, `src/types/index.ts`
