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

## Uygulama sözleşmesi (2026-08-18 eki)

Bu ADR yazılırken iki kalem **fiyatlanmamıştı**: `apps/web/src/lib/storage.ts`'in
hook olmadığı için `useSupabaseClient()` çağıramaması, ve `apps/web/src/lib/logger.ts`'in
taşıma sonrası evi. İkisi de ölçüldü ve commit 5 başlamadan önce burada somut bir sözleşmeye
bağlandı. Yukarıdaki "Karar" bölümü **değişmedi** — bu yalnızca eksik iki kalemin eki, mevcut
metnin yerini almaz.

### Ek-1 — `storage.ts` hook değil: istemci parametre sözleşmesi

Ölçüm: `apps/web/src/lib/storage.ts` (173 satır) **üç düz `async function` export** ediyor —
`createSignedUrl` (satır 61), `removeStoredObject` (satır 101), `createSignedUrls` (satır 133) —
ve her biri gövdesinde doğrudan modül seviyesindeki `supabase` singleton'ını kullanıyor (`import
{ supabase } from '@/lib/supabase/client'`, satır 14). Bunlar React hook'u DEĞİL; dolayısıyla
Karar bölümündeki `const supabase = useSupabaseClient()` deseni bu üç fonksiyonun **içinde**
uygulanamaz — React hook kuralları hook olmayan bir fonksiyonun içinde `useContext` tabanlı bir
hook çağırmasına izin vermez.

Ölçülen tüketiciler — 4 hook (hepsi zaten §"Etkilenen dosyalar" tablosundaki 16 dosyanın
içinde, kendi `useSupabaseClient()` geçişlerini yapacaklar):

| Hook                             | Çağrı satırı | Fonksiyon(lar)                                              |
| -------------------------------- | ------------ | ----------------------------------------------------------- |
| `src/hooks/useFormChecks.ts`     | 66, 175      | `createSignedUrls`                                          |
| `src/hooks/useMessages.ts`       | 464          | `createSignedUrl`                                           |
| `src/hooks/useProfile.ts`        | 45, 63, 134  | `createSignedUrl`, `createSignedUrls`, `removeStoredObject` |
| `src/hooks/useProgressPhotos.ts` | 77, 179      | `createSignedUrls`, `removeStoredObject`                    |

**Karar: istemci açık ilk parametre olarak geçer.** Tam imzalar (bugünkü imzaların önüne
`client: SupabaseClient<Database>` eklenir, geri kalan parametre sırası ve dönüş tipleri
**değişmez**):

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@repo/types'

export async function createSignedUrl(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string | null | undefined
): Promise<string | null>

export async function removeStoredObject(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string | null | undefined
): Promise<boolean>

export async function createSignedUrls(
  client: SupabaseClient<Database>,
  bucket: string,
  paths: readonly (string | null | undefined)[]
): Promise<Map<string, string>>
```

Fonksiyon gövdelerinde `supabase.storage...` çağrıları `client.storage...` olarak değişir
(satır 69, 109, 144); geri kalan mantık (normalize, `isStoragePath`, hata politikası — asla
fırlatmaz) **birebir korunur**. Çağıran taraf deseni (örnek, `useProfile.ts`):

```ts
// Öncesi
import { createSignedUrl } from '@/lib/storage'
// ... hook gövdesinde:
avatarSignedUrl: await createSignedUrl(AVATAR_BUCKET, data.avatar_path)

// Sonrası
import { useSupabaseClient } from '@repo/api-client/context'
import { createSignedUrl } from '@repo/api-client/storage'
// ... hook gövdesinde:
const supabase = useSupabaseClient()
// ...
avatarSignedUrl: await createSignedUrl(supabase, AVATAR_BUCKET, data.avatar_path)
```

`useMessages.ts`'teki kullanım (satır 464) bir `queryFn: () => createSignedUrl(...)`
kapatması içinde; `supabase` değişkeni saran hook'un üst kapsamında `useSupabaseClient()`'tan
bir kez alınır ve closure ile taşınır — TanStack Query'nin `queryFn`'i her çağrıda yeniden
oluşturulmadığı sürece davranış değişmez.

#### Değerlendirilen alternatifler

- **Fabrika fonksiyonu** (`createStorageClient(client)` bağlı üç fonksiyon döndürür, hook
  `useMemo(() => createStorageClient(supabase), [supabase])` ile bir kez üretir). Reddedildi:
  üç fonksiyon zaten durumsuz (stateless); istemciyi bağlamak için bir nesne icat etmek, tek bir
  parametre eklemenin sağladığı sadeliğe hiçbir şey katmıyor, üstüne her hook'a bir `useMemo`
  yükü ekliyor.
- **Modül seviyesi setter** (`let _client; export function setStorageClient(c) { _client = c }`,
  fonksiyonlar `_client`'ı kapanışta okur). Reddedildi: bu ADR'nin Karar bölümünün tam olarak
  kaçındığı modül-seviyesi singleton desenini birebir yeniden üretiyor — mobil, `Provider`
  render edilmeden önce setter'ı çağırmayı unutursa sessizce web'in (ya da hiçbir) istemcisiyle
  çalışır; iki uygulama örneği (ör. test + gerçek render) aynı anda farklı istemci enjekte
  ederse son çağıran kazanır ve diğeri sessizce bozulur. AC-4.5.5'in "yalnızca
  `packages/api-client` içinde `.from(`" şartını yapısal değil disiplinle sağlar hale getirir —
  Karar bölümünün reddettiği "Singleton'ı `packages/api-client`'a taşımak" alternatifiyle aynı
  sınıf hatayı taşır.

#### Test etkisi

- **`apps/web/tests/unit/storage.test.ts`**: bugün `vi.mock('@/lib/supabase/client', () => ({
supabase: { storage: { from: fromMock } } }))` (satır 21-23) ile modülü taklit edip
  `createSignedUrl(AVATAR_BUCKET, 'uid-1.jpg')` gibi çağırıyor (satır 61). İstemci artık parametre
  olduğu için bu `vi.mock`/`vi.hoisted` bloğu (satır 9-23) **tamamen kalkar** — test yerine sahte
  bir istemci nesnesi kurup doğrudan geçirir: `createSignedUrl(fakeClient, AVATAR_BUCKET,
'uid-1.jpg')` (`fakeClient = { storage: { from: fromMock } } as unknown as
SupabaseClient<Database>`). Test dosyası `packages/api-client`'ın kendi test dizinine taşınır
  (bkz. taşıma envanteri §4, vitest config paket başına ayrılıyor).
- **`apps/web/tests/unit/storage-cleanup.test.ts`**: hem `removeStoredObject`'i doğrudan çağırıyor
  (satır 111 vb., `client` parametresi eklenmesi gerekir) hem de `useUploadAvatar`'ı (`useProfile.ts`)
  `renderHook` ile sürüyor (satır 150+). `useProfile.ts` da aynı commit'te `useSupabaseClient()`'a
  geçeceği için bugünkü `vi.mock('@/lib/supabase/client', ...)` (satır 38-45) kalkar;
  `createWrapper()` (satır 92-99) `QueryClientProvider`'ın yanına `<SupabaseClientProvider
client={fakeClient}>` eklemeli — bu, ADR'nin "Riskler" bölümünde zaten öngörülen 9 test
  dosyasının ortak kalıbıyla aynıdır.

### Ek-2 — `logger.ts`'in evi

Ölçüm: `apps/web/src/lib/logger.ts` (242 satır) tarayıcıda `createConsoleLogger` (satır 127,
pino KULLANMAZ, salt `console.*` + `maskForConsole` derin maskeleme), sunucuda `createPinoLogger`
(satır 179) kullanıyor; seçim `typeof window !== 'undefined'` (satır 233) ile yapılıyor.
`createPinoLogger` içindeki `require('pino')` (satır 185) **yalnızca**
`process.env.NEXT_RUNTIME === 'nodejs'` dalında çalışır (satır 181) — dosyanın kendi yorumu
(satır 176-177) bu dalın istemci derlemesinde webpack tarafından sabit `false`'a indirgenip
**tamamen elendiğini** iddia ediyor; bu, Next.js'in `DefinePlugin` + üretim minifikasyonuyla
bilinen, dosyanın bugün güvenle dayandığı bir davranış.

`apps/web/src` içinde logger'ı import eden **11 dosya** ölçüldü (`grep -rl "from
'@/lib/logger'"`), ikiye ayrılıyor:

| Grup                                                                                                                                                                 | Sayı | Kader (bu ADR + ADR-0023 kapsamı)                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sunucu-özel Route Handler / middleware yardımcıları (`src/lib/api/proxy.ts`, `src/lib/api/response.ts`, `src/app/api/auth/sign-in/route.ts`, `src/proxy.ts`)         | 4    | `apps/web`'de kalıyor (taşıma envanteri §3) — pino dalına gerçekten ihtiyaç duyuyor                                                                     |
| İstemci bileşenleri (`src/components/ui/ErrorBoundary.tsx`, `src/app/error.tsx`)                                                                                     | 2    | `apps/web`'de kalıyor — yalnızca konsol dalını kullanıyor                                                                                               |
| `packages/api-client`'a taşınacak modüller (`src/hooks/useFormChecks.ts`, `useCatalog.ts`, `useSession.ts`, `src/lib/storage.ts`, `src/lib/query/security-event.ts`) | 5    | konsol dalına ihtiyaç duyuyor, pino dalına **hiç** duymuyor — bunlar her zaman `'use client'` React hook'ları, hiçbir zaman sunucu tarafında çalışmıyor |

Yani `packages/api-client`'a taşınan hiçbir tüketici pino'ya ihtiyaç duymuyor; `apps/web`'de
kalan 4 Route Handler yardımcısı ise gerçekten pino'ya bağımlı. Sorun logger'ın kendisinin değil,
`packages/api-client`'ın (ve ileride `apps/mobile`'ın) `apps/web/src/lib/logger.ts`'e bağımlı hale
gelmesi — monorepo'da paketler uygulamalara bağımlı OLAMAZ (bağımlılık yönü tersine döner: `apps/web`
zaten `packages/api-client`'a bağımlı, tersi bir döngü kurar).

**Karar: yeni `packages/logger` paketi.** Platformdan bağımsız çekirdek (`Logger` arayüzü,
`REDACT_PATHS`/`SENSITIVE_KEYS`, `maskForConsole`, `createConsoleLogger`, ve bunlardan kurulan
hazır bir `logger = createConsoleLogger()` + `createRequestLogger`) bu pakete taşınır.
`REDACT_PATHS` gerçekten platformdan bağımsız — yalnızca anahtar-adı desenleri, hiçbir Node/DOM
API'sine dokunmuyor (ölçüldü, satır 37-71). `apps/web/src/lib/logger.ts` **kalır** ama küçülür:
yalnızca `createPinoLogger` + `typeof window` dallanan `createLogger()` orkestratörünü tutar,
çekirdeği `@repo/logger`'dan import eder. `packages/api-client`'ın 5 modülü (yukarıdaki tablo)
`@repo/logger`'dan doğrudan `logger` alır — pino'ya hiç dokunmadığı için `SupabaseClientProvider`
gibi bir context enjeksiyonuna ihtiyaçları yok, davranış platform başına değişmiyor.

#### Değerlendirilen alternatifler

- **(a) `logger.ts`'i bütünüyle `packages/api-client`'a taşımak.** Reddedildi — `apps/mobile`
  (commit 6) bu paketi Supabase istemcisiyle birlikte import edecek; `createPinoLogger`'daki
  `require('pino')` çağrısı `NEXT_RUNTIME` kontrolüyle çalışma zamanında ölü dal olsa da, bu
  eleme Next.js'in webpack `DefinePlugin`+üretim minifikasyonuna özgü bir davranış (dosyanın
  kendi yorumu, satır 176-177). React Native'in derleyicisi (Metro) `process.env.NEXT_RUNTIME`'ı
  tanımıyor/sabitlemiyor ve webpack'in yaptığı gibi ölü dalı çözümleme AŞAMASINDAN ÖNCE elemiyor
  — Metro dosyanın AST'sini tarayıp bulduğu her `require()` çağrısını modül grafiğine eklemeye
  çalışır, dal çalışma zamanında hiç yürütülmese bile. `pino` (ve `thread-stream`/`sonic-boom`
  gibi Node çekirdek modüllerine — `fs`, `worker_threads` — bağımlı alt bağımlılıkları) Metro'da
  polyfill'siz çözümlenemez; en olası sonuç bundle-time "Unable to resolve module" hatası. (Not:
  `apps/mobile` henüz yok — Faz 4.5 commit 6 — bu yüzden bu iddia bu turda gerçek bir Metro
  build'iyle DOĞRULANAMADI; belgelenmiş Metro davranışına dayanan bir çıkarımdır, commit 6'da
  ölçülerek teyit edilmeli.) Bu, ADR'nin Karar bölümünün "Singleton'ı `packages/api-client`'a
  taşımak" alternatifini reddetme gerekçesiyle (web'e özgü bir çalışma zamanı bağımlılığının
  mobile sızması) aynı sınıf risktir.
- **(c) `logger.ts` `apps/web`'de kalsın, `packages/api-client` ona context enjeksiyonuyla
  erişsin** (Supabase istemcisiyle simetrik bir `LoggerProvider`/`useLogger()`). Reddedildi, iki
  gerekçeyle: (1) Supabase istemciği için enjeksiyon gerekliydi çünkü platform başına GERÇEKTEN
  farklı bir uygulama var (cookie deposu vs. `SecureStore`); konsol adaptörü ise web ve mobilde
  **birebir aynı** — enjekte edilecek platforma özgü bir varyant yok, bu yüzden bir context
  katmanı yalnızca mekanik yük ekler (her kök layout'a bir `Provider` daha, "provider dışında
  çağrıldı" hata sınıfı bir kez daha). (2) Yapısal olarak ters: `packages/api-client`'ın
  `apps/web`'deki bir dosyaya bağımlı olması, monorepo'da paketlerin uygulamalara değil
  uygulamaların paketlere bağımlı olması gerektiği yönü tersine çevirir — `apps/web/src/lib/logger.ts`
  zaten `packages/api-client`'a bağımlı olacak (Karar bölümündeki context deseni üzerinden
  dolaylı olarak değil ama `providers.tsx` üzerinden doğrudan), döngüsel bir paket grafiği
  kurulurdu.

#### Etkilenen dosyalar (bu ekin kapsamı — commit 5'te, bu tur yalnızca sözleşme)

- `packages/logger/**` (yeni paket)
- `apps/web/src/lib/logger.ts` (küçülür, `@repo/logger`'ı import eder)
- `apps/web/src/lib/storage.ts` → `packages/api-client/src/storage.ts` (Ek-1 imzalarıyla)
- `apps/web/src/hooks/useFormChecks.ts`, `useMessages.ts`, `useProfile.ts`, `useProgressPhotos.ts`
  (storage çağrılarına `supabase` parametresi eklenir)
- `apps/web/src/lib/query/queryClient.ts`, `security-event.ts`, `supabase-error.ts` →
  `packages/api-client` (logger importu `@repo/logger`'a döner)
- `apps/web/tests/unit/storage.test.ts`, `storage-cleanup.test.ts` (Ek-1 test etkisi)

## Uygulama sonucu (Faz 4.5 commit 5, 2026-08-18)

Yukarıdaki "Uygulama sözleşmesi" eki commit 5 başlamadan **önce** yazıldı ve iki eksik kalemi
(storage.ts, logger.ts) fiyatlandırdı. Uygulama sırasında sözleşmede **öngörülmemiş** dört karar
noktası daha çıktı; dördü de uygulandı. Bu bölüm yalnızca bir ek, yukarıdaki "Karar" ve
"Uygulama sözleşmesi" bölümlerinin yerini almaz.

1. **`src/lib/api/ai.ts` de hook değildi** ve modül seviyesinde singleton kullanıyordu. Ek-1'in
   `storage.ts` için kurduğu aynı desen burada da uygulandı: `generateWorkoutPlan`,
   `generateDietPlan` ve `getRecommendations` fonksiyonlarının üçüne de `client:
SupabaseClient<Database>` açık ilk parametre olarak eklendi; `useAi.ts` istemciyi
   `useSupabaseClient()`'tan alıp bu üç fonksiyona iletiyor.
2. **`src/lib/date.ts` ve `src/lib/upload-validation.ts` da taşınmak zorunda kaldı.** Taşınan 5
   hook bu iki dosyaya bağımlıydı ve bir paket bir uygulamaya bağımlı olamaz (aynı Karar
   bölümünün "Reddedilen alternatifler"inde belirtilen yön kuralı). İkisi de
   `@repo/api-client/date` ve `@repo/api-client/upload-validation` olarak dışa açıldı;
   `apps/web` bileşenleri aynı yerden import ediyor, kod çoğaltması yok. `docs/discovery/
faz-4.5-tasima-envanteri.md`'nin §3 "Kaynak → hedef haritası"sı bu iki dosyayı
   "taşınmayacak" varsaymıştı — o varsayım yanlıştı, envanter düzeltildi.
3. **`export const supabase` singleton'ı kaldırıldı** (`apps/web/src/lib/supabase/client.ts`).
   Taşıma tamamlandıktan sonra bu singleton'ın tüketicisi sıfırdı; bırakmak, ADR'nin Karar
   bölümünün kaçındığı doğrudan modül-seviyesi erişim yolunu web tarafında yeniden üretirdi.
   `createBrowserSupabaseClient()` fonksiyonu modül-tekil (module-singleton çağrı deseni)
   kalmaya devam ediyor, tek çağıranı `providers.tsx`. Tüketicisi kalmayan `unwrap<T>()`
   yardımcı fonksiyonu da (bkz. Sonuçlar/Olumsuz bölümündeki uyarı) `packages/api-client`'a
   context'ten bağımsız, düz bir yardımcı olarak taşındı.
4. **`SupabaseClientProvider`'ın `children` prop'u opsiyonel yazıldı.** `React.createElement(
Provider, props, ...children)` aşırı yüklemesi `children` zorunlu tutulduğunda eşleşmiyor ve
   `.ts` uzantılı (JSX olmayan) test dosyaları sarmalayıcıyı `react/no-children-prop` lint
   hatası almadan kuramıyordu (ölçüldü: 8 hata). Çalışma zamanı davranışı değişmedi — `children`
   hâlâ fiilen her zaman geçiriliyor, yalnızca tip imzası gevşetildi. `context.tsx` ayrıca JSX
   yerine `createElement` kullanıyor; commit 6'da (`apps/mobile`) Metro'nun JSX derleme
   yapılandırmasına bir bağımlılık doğmasın diye bilinçli bir tercih.
