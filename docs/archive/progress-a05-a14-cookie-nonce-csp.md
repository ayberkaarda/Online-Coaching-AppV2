# Arşiv — A-05 (cookie oturumu) + A-14 (nonce tabanlı CSP): ADR-0022 uygulaması (2026-08-18)

**Özet.** ADR-0022'nin ertelediği iki güvenlik borcu (B-006/A-05, B-007/A-14) tek turda,
Faz 4.5'ten (monorepo + Expo) bilinçli olarak önce kapatıldı. Oturum deposu
`localStorage`'dan `@supabase/ssr` ile cookie'ye taşındı — `httpOnly` DEĞİL, ADR'nin Karar
1'inin bilinçli sonucu. CSP `script-src` `'unsafe-inline'`'dan istek başına taze nonce'a
geçti; bu geçiş iki gizli tuzağı ortaya çıkardı: `export const dynamic = 'force-dynamic'`
istemci bileşeni dosyalarında sessizce yok sayılıyordu (çözüm kök layout'ta `await
connection()`, bedeli tüm rota ağacının dinamikleşmesi) ve `next-themes`'in tema-flash
önleyici inline script'i nonce'suz kalıp CSP tarafından bloklanacaktı (çözüm: kütüphanenin
resmi `nonce` prop'u + proxy → layout → `Providers` zinciri). Kapanış kapsamı dar tutuldu:
A-05 token'ı JS'ten gizlemiyor, A-14 yalnızca `script-src`'ı kapsıyor — `style-src
'unsafe-inline'` bilinçli olarak kalıyor.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Bu dosya tur kapanışında doğrudan yazılmıştır (2026-08-17'den sonraki dosya kuralı
> gereği) — `docs/PROGRESS.md`'den taşınmış bir metin değildir.
> Karar kaydı: [`docs/adr/0022-oturum-depolamasi-cookie-ve-nonce-csp.md`](../adr/0022-oturum-depolamasi-cookie-ve-nonce-csp.md).

---

## A-05 — Oturum depolaması: `localStorage` → cookie (2026-08-18)

Yeni bağımlılık `@supabase/ssr@^0.12.4`. Yan etki: npm lock'ta `@supabase/*` ailesi
`2.110.x → 2.112.3`'e çıktı (mevcut `^2.110.0` aralığı içinde kalarak) ve transitif olarak
`cookie@1.1.1` geldi — lock diff'i beklenenden geniş oldu, ama semver ihlali yok.

**`src/lib/supabase/client.ts`:** `createClient` yerine `@supabase/ssr`'ın
`createBrowserClient`'ı geldi. Dışa dönük API — `createBrowserSupabaseClient`, `supabase`
singleton'ı, `unwrap` — birebir korundu; 8 unit test bu modülün sınırını mock'luyor ve hiçbiri
değişmedi. Cookie adı BİLEREK elle verilmedi: iki taraf da (`client.ts` + `server.ts`)
`NEXT_PUBLIC_SUPABASE_URL`'den türeyen kütüphane varsayılanını (`sb-<ref>-auth-token`)
kullanıyor — elle bir ad verilseydi iki taraf birebir eşleşmek zorunda kalırdı ve büyük
oturumların `.0`/`.1` parçalarına bölünmesini kütüphane yerine elle yönetmek gerekirdi.

**`src/lib/supabase/server.ts`:** mevcut `createServerSupabaseClient(accessToken?)` **aynen
korundu** — 6 test ve AI proxy route'ları bu imzaya bağlı, stateless kalmaya devam ediyor,
kimliği hâlâ `Authorization: Bearer` başlığından okuyor. Yanına yeni bir ikinci fabrika
eklendi: `createCookieBoundServerClient(request)`, `{ supabase, applyCookies(response) }`
döndürüyor. `setAll` çağrıları önce bir diziye biriktirilip `applyCookies` çağrıldığında
`NextResponse.cookies.set(...)` ile tek tek uygulanıyor — `cookies()` yerine bu açık yol
seçildi çünkü Route Handler içinde ne yazıldığı görünür ve birim testinde doğrudan
doğrulanabilir. Şu an yalnızca `/api/auth/sign-in` bu ikinci fabrikayı kullanıyor.

**`src/app/api/auth/sign-in/route.ts`:** 1–3 ve 5. adımlar (doğrulama, hız sınırı, jenerik
hata, A-10 loglaması) hiç değişmedi; yalnızca yanıt şekli değişti — gövde artık yalnızca
`{ ok: true }`, token'lar `Set-Cookie` başlıklarıyla gidiyor. Dosyadaki eski bir yorum
("A-05 yapıldığında istemci hiç token GÖRMEYECEK, httpOnly") ADR-0022'nin düzelttiği yanlış
bir varsayımdı; kod değişikliği sırasında güncellendi.

**`src/hooks/useSession.ts`:** `setSession(tokens)` çağrısı kalktı, yerine `getSession()` ile
cookie'den hidrasyon geldi. Hook imzaları, toast metinleri ve hata mesajları değişmedi.

### `Secure` bayrağı istek protokolünden türetilir, `NODE_ENV`'den değil

Hem `client.ts` (`isSecureContext()`, tarayıcıda `window.location.protocol`) hem `server.ts`
(`isSecureRequest()`, sunucuda `new URL(request.url).protocol`) aynı kuralı uyguluyor: cookie
yalnızca gerçek `https` isteğinde `Secure` alıyor. `NODE_ENV`'e bağlanmadı çünkü E2E paketi
`npm run build && npm run start` ile, yani `NODE_ENV=production` altında ama düz
`http://localhost:3000` üzerinden koşuyor (ADR-0020'de daha önce tespit edilmiş aynı tuzak) —
koşulsuz `Secure` tüm E2E paketini sessizce kırardı. `X-Forwarded-Proto` **bilerek
okunmuyor**: repoda `TRUSTED_PROXY_COUNT` varsayılanı `0`, hiçbir forward başlığına
güvenilmiyor (A-02'nin XFF güven modeliyle aynı disiplin).

### Cookie'ler `httpOnly` DEĞİL

ADR-0022 Karar 1'in bilinçli sonucu. Uygulama tarayıcıdan doğrudan `supabase.from(...)`
çağırıyor ve `useMessages` realtime `.channel(...)` aboneliği kuruyor — cookie `httpOnly`
olsaydı `getSession()` istemcide `null` döner, RLS altındaki tüm istemci sorguları çökerdi.
Bu geçişin kazancı "token'ı JS'ten gizlemek" değil: SSR-uyumlu tek oturum deposu,
`Secure`/`SameSite=Lax` nitelikleri ve XSS yüzeyinin A-14 ile ayrıca daraltılması. Token hâlâ
JS'ten okunabilir; bu kabul edilmiş bir sonuç, kaçırılmış bir ayrıntı değil.

### Realtime `setAuth` gerekmedi — tahminle değil kaynaktan doğrulandı

`supabase-js`'in realtime istemcisi `accessToken` **callback'i** ile kuruluyor; callback
`auth.getSession()`'a düşüyor, o da her çağrıda cookie'den taze okuyor. PostgREST tarafında
da `fetchWithAuth` her istekte token'ı yeniden çözüyor. Yani cookie'ye geçiş sonrası
realtime/PostgREST'in oturumu manuel olarak yeniden beslemesi gerekmedi — ikisi de zaten
aynı `getSession()` kaynağına bağlıydı.

### `flowType` zorla `pkce` oldu

`createBrowserClient`/`createServerClient` bunu override edilemez şekilde set ediyor. Bu
repoda e-posta linkli akış (şifre sıfırlama, e-posta onayı, `exchangeCodeForSession`) hiç
kullanılmıyor — bugün etkisiz, ama ileride şifre sıfırlama eklenirse PKCE akışına göre
yazılmalı.

### `setAll`'ın `Cache-Control` başlıkları uygulanmadı

`@supabase/ssr`'ın `setAll` ile geçirdiği `Cache-Control` başlıkları bilerek yok sayıldı;
route'un zaten yazdığı `Cache-Control: no-store` tek kaynak olarak kaldı (aynı etki, çift
kaynak yok).

---

## A-14 — CSP: `'unsafe-inline'` → nonce tabanlı (2026-08-18)

CSP üretimi `next.config.mjs`'teki statik string'den `src/lib/security/csp.ts`'ye taşındı
(`generateNonce`, `supabaseCspOrigins`, `buildContentSecurityPolicy`). `next.config.mjs`'te
diğer altı güvenlik başlığı (HSTS, nosniff, X-Frame-Options, Referrer-Policy,
Permissions-Policy, X-DNS-Prefetch-Control) `/:path*` üzerinde aynen kaldı; **artık oradan
CSP yayılmıyor** — yayılsaydı tarayıcı iki CSP başlığının kesişimini uygular ve eski
`'unsafe-inline'`'lı politika nonce'lu olanı sessizce etkisizleştirirdi. A-15'in fail-closed
`throw`'u (production'da `NEXT_PUBLIC_SUPABASE_URL` yoksa build patlar) `next.config.mjs`'te
korundu.

`src/proxy.ts` iki matcher girdisi aldı: `/api/:path*` (hız sınırı, davranışı bit bit aynı) +
Next dokümanının önerdiği nesne biçimli sayfa matcher'ı (`api`/`_next/static`/`_next/image`/
`favicon.ico` hariç tüm yollar, prefetch istekleri `missing` koşuluyla dışarıda). `proxy()`
içinde yol `/api/` ile başlamıyorsa CSP dalı çalışıyor, hız sınırı kovalarına hiç
dokunmuyor — sayfa gezinmeleri (her `next/link` tıklaması + RSC isteği) aynı kovayı
doldurup kullanıcıyı 429'a düşürmesin diye.

**`getServerEnv()` bilerek API dalına taşındı.** Taşınmasaydı matcher genişlediği için her
sayfa isteği sunucu env doğrulamasından geçecek ve `.env.local`'da `AI_BACKEND_API_KEY`
olmadığından **tüm sayfalar 500 dönecekti** — CSP geçişinin kendisiyle ilgisiz bir
regresyon, canlıya çıkmadan yakalandı.

Nonce üreteci: `crypto.getRandomValues(new Uint8Array(16))` + `btoa(...)`, 128 bit entropi.
`Buffer` bilinçli olarak kullanılmadı — Next 16'da proxy varsayılan olarak Node.js
runtime'ında koşsa da `getRandomValues`/`btoa` ikilisi Node, Edge ve vitest'in `jsdom`
ortamının üçünde de çalışıyor; modül bir gün Edge'e taşınırsa veya doğrudan test edilirse
kırılmaz.

### Bulgu — `export const dynamic = 'force-dynamic'` istemci sayfalarında sessiz no-op

Nonce yalnızca sunucuda render edilen sayfalara uygulanabiliyor; build zamanında üretilmiş
statik HTML'in bootstrap script'inde nonce olmuyor ve `script-src 'self' 'nonce-<n>'` onu
bloklayıp beyaz ekran üretiyor (kaynak: `node_modules/next/dist/docs/01-app/02-guides/
content-security-policy.md`, "Static vs Dynamic Rendering with CSP"). Standart çözüm sayfa
dosyasına `export const dynamic = 'force-dynamic'` eklemek gibi görünüyordu — ama **beş
sayfaya da eklenip gerçek build alınarak ölçüldü:** `/`, `/login`, `/profile`, `/users`
dördü de `'use client'`; Next 16 route segment config'ini bu dosyalarda **yok sayıyor**, build
route tablosunda dördü de `○` (statik) kalmaya devam etti. Yalnızca sunucu bileşeni olan
`/_not-found` beklendiği gibi `ƒ`ye (dinamik) döndü.

**Çözüm:** ağaçtaki tek sunucu bileşeni olan kök layout'ta (`src/app/layout.tsx`) `await
connection()` — bu, o segmenti (dolayısıyla onun altındaki tüm ağacı) istek anında render
edilmeye zorluyor. **Sonuç, ADR-0022 Karar 5'in öngördüğünden daha geniş:** ADR "beş sayfa
dinamikleşecek" diyordu, gerçekte **tüm rota ağacı** dinamikleşti — aynı yönde ama daha
kapsamlı bir bedel. Beş sayfa dosyasına hiç dokunulmadı; tek değişiklik kök layout'ta.

Bu, gelecekteki bir oturumun tekrar düşebileceği bir tuzak: **istemci bileşeni dosyalarına
`export const dynamic` eklemek Next 16'da hiçbir şey yapmaz, sessizce.** Dinamik render
zorlamak isteyen bir sunucu bileşeni (genelde layout) gerekir.

### Bulgu — `next-themes` inline script'i nonce almıyordu

İlk turda her sayfada tam bir nonce'suz `<script>` kalıyordu — `next-themes`'in
hydration'dan önce doğru temayı uygulayıp "yanlış tema flash'ını" (FOUC) engelleyen inline
script'i. `script-src`'tan `'unsafe-inline'` kalktığı için bu script bloklanacaktı: uygulama
çalışmaya devam ederdi (tema React effect'iyle yine uygulanır) ama her yüklemede bir CSP
ihlali üretilir ve karanlık modda beyaz bir flash görülürdü.

**Çözüm:** `next-themes@0.4.6`'nın belgeli `nonce` prop'u kullanıldı. Nonce zinciri:
`src/proxy.ts` üretir → `x-nonce` **istek** başlığına yazar → `src/app/layout.tsx`
`headers()` ile okur → `src/app/providers.tsx`'teki `Providers` bileşenine prop olarak
geçer → `ThemeProvider`'a iner. Proxy'nin çalışmadığı bir yol olursa `nonce` `undefined`'a
düşer ve `next-themes` eski (nonce'suz) davranışına geri döner — sert bir hata değil,
yumuşak bozulma.

**Ölçüm:** nonce'suz `<script>` sayısı beş sayfada **1 → 0**. Gerçek `curl` ile alınan CSP
başlığı:

```
default-src 'self'; script-src 'self' 'nonce-<n>'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://ui-avatars.com http://127.0.0.1:54321;
font-src 'self' data:; connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests
```

İki ardışık istek farklı nonce üretti; HTML'deki `nonce` değeri başlıktakiyle birebir aynı;
tek CSP başlığı var (ikinci kaynak yok, `next.config.mjs`'in yayınladığı bir CSP kalmadığı
kanıtlandı).

### `style-src 'unsafe-inline'` bilinçli olarak kaldı

Nonce'lar inline `style="..."` **niteliklerine** uygulanmaz — bunlar `style-src-attr` adlı
ayrı bir direktif altına düşer ve Next'in nonce mekanizması onu kapsamaz. Kod tabanında 17
yerde `style={{...}}` kullanımı var ve `recharts` çalışma anında inline stil yazıyor;
`style-src`'tan `'unsafe-inline'` kaldırılsaydı grafikler ve animasyonlar kırılırdı
(ADR-0022 Karar 4). `'strict-dynamic'` de kullanılmadı (Karar 6): host tabanlı kaynak
listelerini yok sayar ve Next'in nonce vermediği herhangi bir script'i sessizce kırabilir;
`'self' 'nonce-<n>'` bu uygulama için yeterli ve daha düşük riskli kabul edildi.

---

## Yeni testler

- `tests/unit/auth-cookie-session.test.ts` — 6 senaryo: `Set-Cookie` var / gövdede token yok,
  `HttpOnly` yok, `Secure` http'de yok / https'te var, `useSignIn` `setSession` çağırmıyor.
- `tests/unit/csp-nonce.test.ts` — 10 senaryo: nonce var, `unsafe-inline` yok, `style-src`
  korunuyor, `'strict-dynamic'` yok, ardışık nonce'lar farklı, `x-nonce` istek başlığıyla
  eşleşiyor, wildcard yok, sayfa istekleri hız sınırına girmiyor, layout nonce'u
  `Providers`'a geçiriyor.
- `auth-sign-in-rate-limit.test.ts` ve `security-events.test.ts` mock'ları yeni sunucu
  fonksiyonuna göre güncellendi; iddiaların kendisi değişmedi.
- Layout testinin kırmızı-yeşil kanıtı ölçüldü: `nonce={nonce}` prop'u silindiğinde 1 test
  düşüyor.

---

## Doğrulama tablosu

| Kontrol                | Komut                                            | Sonuç                                                                                        |
| ---------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Tip kontrolü           | `npm run type-check`                             | Temiz                                                                                        |
| Lint                   | `npm run lint`                                   | 0 hata, 17 uyarı (taban korundu)                                                             |
| Biçim                  | `npm run format:check`                           | Temiz                                                                                        |
| Birim/bileşen testleri | `npm run test`                                   | **614/614 (50 dosya)** — tur başında 598/48                                                  |
| Production build       | `npm run build`                                  | Başarılı; route tablosunda `○` kalmadı, 10 rotanın hepsi `ƒ`                                 |
| Nonce uygulanması      | `next start` + `curl`                            | 5 sayfada nonce'suz `<script>` = **0** (yama öncesi 1)                                       |
| E2E (paralel, yerel)   | `npm run test:e2e`                               | **52/54** — düşen ikili `plans.spec.ts:292` ve `progress.spec.ts:66`                         |
| E2E (aynı ikili, seri) | `npx playwright test plans progress --workers=1` | **14/14** — düşüşün B-037 (yerel paralellik) olduğu, cookie/CSP kaynaklı olmadığı kanıtlandı |

---

## Doğan borçlar

- **`style-src 'unsafe-inline'` kalıcı bir boşluk olarak duruyor.** Nonce inline `style`
  niteliklerine uygulanmıyor; 17 yerde `style={{}}` + `recharts`'ın çalışma anında yazdığı
  stiller bu direktifi bilerek `'unsafe-inline'`'da tutuyor (bkz. ADR-0022 Karar 4).
- **Cookie geçişi sonrası tarayıcılarda eski `sb-*-auth-token` `localStorage` artıkları
  temizlenmiyor.** Yeni oturum cookie'de tutuluyor ama önceki sürümde `localStorage`'a
  yazılmış token satırları hiçbir yerde silinmiyor; kalıcı ama zararsız bir artık.
- **Deploy sonrası tüm kullanıcılar bir kez yeniden giriş yapmak zorunda** (borç değil,
  operasyonel not) — depolama ortamı değiştiği için mevcut `localStorage` oturumları yeni
  cookie tabanlı okuma yoluna otomatik taşınmıyor.

Numaralandırma (`B-xxx`) bu dosyanın kapsamı dışında — canlı borç kütüğü
[`docs/PROGRESS.md`](../PROGRESS.md)'de tutulur.

---

## Sonraki adımlar

A-05 ve A-14 kapandı; B-006 ve B-007 borçları kapandı. ADR-0022'nin öngördüğü zamanlama
kararı gereği bu tur Faz 4.5 — Monorepo ve Mobil Temel'den (`active_planprogram.md` §7)
önce yürütüldü: `packages/api-client`'ın auth yüzeyi artık son şeklini aldığı için monorepo
taşıması sırasında ikinci bir kesim gerekmeyecek.
