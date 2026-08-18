# 0024 — `packages/api-client`'ın Supabase istemcisini enjeksiyonla alması

- **Durum:** Kabul edildi — uygulama Faz 4.5 commit 5'te
- **Tarih:** 2026-08-18
- **Karar verenler:** Proje sahibi

## Bağlam

`0022-oturum-depolamasi-cookie-ve-nonce-csp.md` oturum deposunu `localStorage`'dan cookie'ye
taşıdı ve kendi "Zamanlama kararı" bölümünde şunu kayda geçirdi: A-05 sonrası doğru mimari
"`packages/api-client` Supabase istemcisini enjeksiyonla alır, her uygulama kendi auth
deposunu sahiplenir" biçimindedir — mobilde depo cookie değil `SecureStore` olacaktır. Bu ADR
o taahhüdü somut bir arayüze çevirir.

Ölçüm (bu turda, `src` altında): **16 dosya** `@/lib/supabase/client`'ı doğrudan import ediyor
(görev tanımındaki "17" tahmini bu turda ölçülerek düzeltildi — gerçek sayı 16'dır). Liste
(hepsi `src/`, test dosyaları hariç):

| #   | Dosya                              |
| --- | ---------------------------------- |
| 1   | `src/hooks/useCatalog.ts`          |
| 2   | `src/hooks/useDailyLogs.ts`        |
| 3   | `src/hooks/useFormChecks.ts`       |
| 4   | `src/hooks/useMessages.ts`         |
| 5   | `src/hooks/useNotifications.ts`    |
| 6   | `src/hooks/useNutritionLogs.ts`    |
| 7   | `src/hooks/usePlans.ts`            |
| 8   | `src/hooks/useProfile.ts`          |
| 9   | `src/hooks/useProgramApprovals.ts` |
| 10  | `src/hooks/useProgressEntries.ts`  |
| 11  | `src/hooks/useProgressPhotos.ts`   |
| 12  | `src/hooks/useSession.ts`          |
| 13  | `src/hooks/useWorkoutLogs.ts`      |
| 14  | `src/hooks/useWorkoutSession.ts`   |
| 15  | `src/lib/api/ai.ts`                |
| 16  | `src/lib/storage.ts`               |

Ayrıca 9 test dosyası (`tests/unit/*.test.ts(x)`) aynı modülü `vi.mock('@/lib/supabase/client',
...)` ile taklit ediyor — bunlar üretim kodu değil, taşıma sırasında mock hedefinin
`@repo/api-client`'ın enjeksiyon arayüzüne göre güncellenmesi gerekir ama ayrı bir iş kalemi
değildir (aynı commit'in doğal parçası).

`@supabase/ssr`'ın `createBrowserClient`'ı `document.cookie` üzerinden okur/yazar — React
Native'de `document` yoktur, dolayısıyla bu istemci mobilde **hiç çalışmaz**. Mobil kendi
istemcisini `SecureStore` tabanlı bir `auth.storage` adaptörüyle kuracak (Faz 4.5 commit 6,
`apps/mobile` iskeleti; adaptörün kendisi bu ADR'nin kapsamı dışında, yalnızca "dışarıdan
verilir" sözleşmesi burada sabitleniyor).

## Karar

`packages/api-client` Supabase istemcisini **modül seviyesinde import etmez** — bugünkü
`src/lib/supabase/client.ts`'teki `export const supabase = createBrowserSupabaseClient()`
deseni pakete taşınmaz. Bunun yerine istemci **React context enjeksiyonu** ile dışarıdan
alınır.

### Somut arayüz

```ts
// packages/api-client/src/context.tsx
import { createContext, useContext } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@repo/types'

const SupabaseClientContext = createContext<SupabaseClient<Database> | null>(null)

export function SupabaseClientProvider({
  client,
  children,
}: {
  client: SupabaseClient<Database>
  children: React.ReactNode
}) {
  return (
    <SupabaseClientContext.Provider value={client}>{children}</SupabaseClientContext.Provider>
  )
}

/** Her hook'un kullandığı tek giriş noktası. Provider dışında çağrılırsa fırlatır. */
export function useSupabaseClient(): SupabaseClient<Database> {
  const client = useContext(SupabaseClientContext)
  if (!client) {
    throw new Error(
      'useSupabaseClient() bir <SupabaseClientProvider> içinde çağrılmalı — istemci enjekte edilmedi.'
    )
  }
  return client
}
```

Neden React context, `createApiClient(supabase)` fabrikası değil: paketin taşıdığı 16
tüketicinin tamamı zaten **React hook**'u (TanStack Query `useQuery`/`useMutation`
sarmalayıcıları) — bir fabrikanın döndürdüğü düz nesneyi her hook'a prop olarak geçirmek ya da
modül seviyesinde tekilleştirmek (ki bu tam da kaçınılan singleton deseni) gerekirdi. Context,
React'in kendi bağımlılık enjeksiyon mekanizmasıdır ve hook'ların `useContext` çağırması
dışında hiçbir imza değişikliği gerektirmez — çağıran bileşenler `useDailyLogs()`'u bugün
çağırdığı gibi çağırmaya devam eder.

Her hook içindeki

```ts
import { supabase } from '@/lib/supabase/client'
```

satırı

```ts
import { useSupabaseClient } from '../context'
// hook gövdesinin başında:
const supabase = useSupabaseClient()
```

ile değiştirilir — kullanım yeri (`supabase.from(...)`, `supabase.channel(...)`) **değişmez**,
yalnızca `supabase` değişkeninin geldiği yer değişir. Bu, mekanik bir codemod'a uygun,
davranışı değiştirmeyen bir dönüşümdür (bkz. Riskler).

### Her uygulama kendi auth deposunu sahiplenir

- **`apps/web`**: `createBrowserSupabaseClient()` (bugünkü `src/lib/supabase/client.ts`,
  `@supabase/ssr` cookie deposu) `apps/web`'de kalır (bkz.
  `0023-monorepo-kesim-plani.md` madde 8). `apps/web/app/providers.tsx`,
  `<SupabaseClientProvider client={createBrowserSupabaseClient()}>` ile ağacı sarar — bugün
  zaten var olan `QueryClientProvider`/`ThemeProvider` sarmalamasının yanına bir katman daha
  eklenir.
- **`apps/mobile`**: kendi `lib/supabase.ts`'i, `@supabase/supabase-js`'in `createClient`'ını
  `auth.storage`'ı `expo-secure-store`'a sarmalayan bir adaptörle çağırır. Aynı
  `SupabaseClientProvider` kök layout'ta kullanılır — paket tarafında **hiçbir platform
  dallanması yoktur**, yalnızca hangi istemcinin enjekte edildiği değişir.

### AC-4.5.5 ile uyum

AC-4.5.5: "`supabase.from(` çağrısı yalnızca `packages/api-client` içinde geçer." Context
deseni bunu **yapısal olarak** sağlar: `apps/web` ve `apps/mobile` kendi dosyalarında yalnızca
`createClient`/`createBrowserSupabaseClient` çağırır ve `<SupabaseClientProvider>`'a verir —
hiçbiri `.from(`/`.channel(` çağırmaz, çünkü sorgu mantığının tamamı zaten
`packages/api-client`'taki hook'ların içindedir (bugün de böyle: `src/app/**` ve
`src/components/**` hiçbir yerde doğrudan `supabase.from(` çağırmıyor, ölçüm:
`docs/discovery/faz-4.5-tasima-envanteri.md` §2). Şart taşıma sırasında **bozulmuyor**,
yalnızca istemcinin kaynağı singleton'dan context'e taşınıyor. Denetim: mevcut
`scripts/identity-ratchet.mjs` (ADR-0018) deseninde, `apps/web/**` ve `apps/mobile/**` içinde
`\.from\(` / `\.channel\(` grep'i sıfır sonuç vermeli — bu kontrol Faz 4.5 commit 7'de (CI
kapıları) bir CI adımı olarak eklenir.

### Reddedilen alternatifler

- **Singleton'ı `packages/api-client`'a taşımak.** Web'e özgü cookie deposunu (`@supabase/ssr`
  `createBrowserClient`, `document.cookie`) mobil pakete sızdırır — mobilde `document` yok,
  paket import edildiği anda çöker. Reddedildi.
- **Platform başına ayrı hook kopyaları** (`apps/web/hooks/useDailyLogs.ts` ve
  `apps/mobile/hooks/useDailyLogs.ts` ayrı ayrı yazılır). Kod paylaşımını — monorepo'nun
  Faz 4.5'e taşınmasının **tek** gerekçesi (`0009`) — doğrudan yok eder; her yeni domain hook'u
  iki kez yazılır ve iki kez bozulur. Reddedildi.
- **`createApiClient(supabase)` fabrikası (context yerine).** Hook'ların React olması
  nedeniyle fabrikanın döndürdüğü nesneyi ya modül seviyesinde tekilleştirmek (aynı singleton
  sorununu tekrar üretir) ya da her çağrı yerine prop olarak geçirmek (16 hook'un tamamının
  imzasını değiştirir, tüketici bileşenlerin tamamını da etkiler) gerekirdi. Context bu ikisini
  de gerektirmediği için tercih edildi.

## Riskler

- **16 dosyalık import değişimi, taşımanın en riskli dilimidir.** Her dosya davranışsal olarak
  aynı kalmalı (yalnızca `supabase`'in kaynağı değişiyor); ama 16 dosyanın her biri farklı bir
  domain'e dokunuyor (workout, nutrition, messages/realtime, progress, notifications, catalog,
  session, storage, AI proxy istemcisi) — tek bir dosyada gözden kaçan bir import, o domain'i
  sessizce kırar.
- **Mümkünse mekanik bir codemod ile yapılmalı**, elle 16 kez tekrarlanan bir düzenleme değil:
  dönüşüm her dosyada birebir aynı desendir (`import { supabase } from
'@/lib/supabase/client'` → `import { useSupabaseClient } from '../context'` + hook
  gövdesinde `const supabase = useSupabaseClient()`), bu da onu bir `jscodeshift`/`ts-morph`
  script'ine uygun kılıyor. Elle yapılırsa her dosya taşıma sonrası kendi testiyle ayrı ayrı
  doğrulanmalı.
- `useMessages.ts` özel bir durum: `supabase.channel(...)` ile realtime aboneliği kuruyor;
  context'ten alınan istemcinin referans kararlılığı (aynı client örneği re-render'lar arası
  korunmalı) burada özellikle önemli — `apps/web`'in `createBrowserSupabaseClient()`'ı zaten
  modül seviyesinde tekilleştirilmiş bir örnek döndürüyor (bkz. `0023` madde 8), bu davranış
  `providers.tsx`'teki tek çağrıyla korunur.
- 9 test dosyasının `vi.mock('@/lib/supabase/client', ...)` çağrıları, hook'lar
  `useSupabaseClient()`'a geçtiğinde test kurulumunun `<SupabaseClientProvider>` ile
  sarmalanmasını (ya da context'i mock etmesini) gerektirir — `tests/unit/test-utils.tsx`'teki
  ortak render sarmalayıcısı bu değişikliği tek yerden karşılayabilir, ama bu ayrı bir
  doğrulama adımıdır, otomatik gelmez.

## Sonuçlar

### Olumlu

- Mobil, web'in cookie tabanlı auth deposuna hiçbir şekilde bağımlı doğmuyor; `packages/api-client`
  iki platformda da **aynı kod**la çalışıyor, yalnızca enjekte edilen istemci farklı.
- AC-4.5.5'in "yalnızca `packages/api-client` içinde `supabase.from(`" şartı yapısal olarak
  sağlanıyor, elle disiplin gerektirmiyor.
- ADR-0022'nin "auth yüzeyi Faz 4.5'ten önce son şeklini alır" öngörüsü doğrulanıyor: bu ADR
  cookie deposunun **kendisini** değiştirmiyor, yalnızca ona erişim yolunu (singleton →
  context) değiştiriyor.

### Olumsuz / kabul edilen bedeller

- Her hook'a bir `useSupabaseClient()` çağrısı ekleniyor — küçük ama gerçek bir mekanik
  ek yük; 16 dosyanın tamamı aynı anda değişmek zorunda (kısmi geçiş, bazı hook'lar singleton
  bazıları context kullanırsa iki farklı Supabase istemci örneği aynı anda yaşar ve realtime/
  auth durumu senkronsuz kalabilir).
- Context sağlayıcısı olmadan çağrılan bir hook artık `throw` ediyor (önceden singleton her
  zaman vardı, sessizce çalışırdı) — bu **bilinçli bir davranış değişikliği**: eksik
  `<SupabaseClientProvider>` artık erken ve net başarısız oluyor, ama test kurulumlarının
  hepsinin sarmalayıcıyı eklemesi gerekiyor (bkz. Riskler).
- `unwrap<T>()` yardımcı fonksiyonu (bugün `src/lib/supabase/client.ts` içinde) istemciye bağlı
  olmadığı için pakete taşınırken context'ten bağımsız, düz bir yardımcı fonksiyon olarak
  kalmalı — taşıma sırasında yanlışlıkla context'e bağlanmamasına dikkat edilmeli.

### Etkilenen dosyalar

Bu ADR turunda (yalnızca dokümantasyon):

- `docs/adr/0024-api-client-supabase-enjeksiyonu.md` (bu dosya)
- `docs/adr/README.md` (indeks satırı)
- `docs/discovery/faz-4.5-tasima-envanteri.md` (Supabase singleton import envanteri, §2)

Faz 4.5 commit 5'te (bu ADR'nin kapsamı dışında, ileride):

- `packages/api-client/src/context.tsx` (yeni)
- 16 dosya (yukarıdaki tablo) — import kaynağı değişimi
- `apps/web/app/providers.tsx` — `SupabaseClientProvider` sarmalaması eklenir
- `apps/mobile/**` — kendi Supabase istemcisi + aynı sarmalama (commit 6 ile birlikte)
- `tests/unit/test-utils.tsx` ve ilgili 9 test dosyası — mock hedefi güncellenir
- `scripts/identity-ratchet.mjs` deseninde yeni bir CI kontrolü (commit 7)
