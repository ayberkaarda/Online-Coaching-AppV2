# 0022 — Oturum depolamasının cookie'ye ve CSP'nin nonce tabanlı hale getirilmesi

- **Durum:** Uygulandı (2026-08-18) — kanıt: `archive/progress-a05-a14-cookie-nonce-csp.md`
  (kapı sonuçları: vitest 614/614, E2E yerel paralel 52/54 / seri doğrulama 14/14)
- **Tarih:** 2026-08-18
- **Karar verenler:** Proje sahibi

## Bağlam

`docs/security/AUDIT.md` iki açık madde taşıyor: **A-05** (oturum token'ları `localStorage`'da,
JS'ten okunabilir; borç `B-006`) ve **A-14** (CSP `script-src 'unsafe-inline'` içeriyor; borç
`B-007`). Faz 1.5 denetiminde Grup 5'in geri kalanı (AC-03, AC-06, AC-11, A-10 kısmi, A-11,
A-15, A-16, T-04 kısmi) kapatıldı ama bu ikisi **kullanıcı kararıyla** ayrı bir tura ertelendi
— `@supabase/ssr` httpOnly cookie geçişi + nonce tabanlı CSP tek işlem olarak ele alınacaktı
(bkz. `docs/security/AUDIT.md` §7). Bu ADR o ertelenen kararı kayda geçirir.

`next.config.mjs`'teki `scriptSrc` tanımının üstünde duran TODO bunu doğruluyor: `'unsafe-inline'`
Next.js'in inline bootstrap script'i (App Router hydration verisi) yüzünden gerekli ve "doğru
çözüm nonce tabanlı CSP'ye geçmek" olarak işaretli.

### Mimarinin sabit kabul edilen kısıtı

Uygulama tarayıcıdan **doğrudan** `supabase.from(...)` çağırıyor (`src/lib/supabase/client.ts`)
ve `src/hooks/useMessages.ts` realtime için `.channel(...)` kullanıyor. Bu, ayrı bir BFF katmanı
olmadan istemcinin Supabase oturumuna doğrudan erişmesi gerektiği anlamına gelir; güvenlik sınırı
token'ın gizliliği değil, veritabanı tarafındaki RLS'tir (bkz. `docs/security/AUDIT.md` §6 —
"Anon key'in istemci paketinde bulunması" zaten "bulgu değil, bilinçli karar" olarak kayıtlı).
Bu ADR'deki tüm kararlar bu kısıtı **değiştirmeden**, onun üzerine inşa edilir.

### Düzeltilen yanlış varsayım

`src/app/api/auth/sign-in/route.ts`, 6. adımdaki yorumda şunu söylüyordu:

> "A-05 (Grup 5, `@supabase/ssr` httpOnly cookie geçişi) yapıldığında bu gövde BOŞALIR: token'lar
> JSON yerine `Set-Cookie` ile httpOnly+Secure+SameSite olarak yazılacak ve istemci hiç token
> görmeyecek."

Bu **yanlıştı**. `@supabase/ssr`'ın `createBrowserClient`'ı oturumu `document.cookie` üzerinden
okur/yazar; cookie `httpOnly` yapılırsa tarayıcı JS'i ona erişemez, `getSession()` istemcide
`null` döner ve RLS altında çalışan tüm istemci sorguları (`supabase.from(...)`, realtime
`.channel(...)`) çöker. Tam `httpOnly` yalnızca **tüm** veri erişimi sunucuya (BFF) taşınırsa
mümkündür — bu, yukarıdaki sabit kısıtı ve `active_planprogram.md` §4'teki AC-2.4'ü ("bileşenlerde
doğrudan veri erişimi yoktur") yeniden tanımlayan, ayrı ve çok daha büyük bir iştir. Bu ADR bu yanlış varsayımı
düzeltir; `sign-in/route.ts`'teki not kod değişikliği sırasında güncellenmelidir.

## Karar

### 1. Cookie'ler `httpOnly` DEĞİL

Yukarıdaki gerekçeyle tam `httpOnly` bu mimaride uygulanamaz. **Kabul edilen sonuç:** XSS hâlâ
oturumu okuyabilir; bu geçişin kazanımı token'ı gizlemek değil, (a) SSR-uyumlu tek oturum deposu,
(b) `Secure` + `SameSite=Lax` nitelikleri, (c) A-14 ile birlikte XSS'in **gerçekleşme**
olasılığının düşürülmesidir.

### 2. API route'ları kimliği `Authorization: Bearer` ile doğrulamaya devam eder

Cookie yalnızca depolama ortamıdır; sunucu tarafı yetkilendirme sözleşmesi değişmez. Gerekçe:
cookie tabanlı kimlik doğrulamaya (istekte cookie'nin otomatik gönderilip sunucuda ona güvenilmesi)
geçmek CSRF yüzeyi açardı. `localStorage` bu açıdan CSRF'e doğası gereği bağışıktı (token'ı
isteğe elle eklemek gerekir) ve bu bağışıklık, depolama ortamı değişse de **bilinçli olarak**
korunuyor.

### 3. `Secure` bayrağı istek protokolünden türetilir, `NODE_ENV`'den değil

E2E paketi `npm run build && npm run start` ile, yani `NODE_ENV=production` altında ama
`http://localhost:3000` üzerinden koşuyor (bkz. `docs/adr/0020-hosted-senkronizasyon-stratejisi.md`
§3'teki "sonraki tur notu" — `next start`'ın her zaman `NODE_ENV=production` ile çalıştığı orada
da tespit edilmişti). Koşulsuz `Secure` (`NODE_ENV === 'production'` şartına bağlanırsa) tüm E2E
oturumlarını sessizce kırardı. Bu, **bilinen bir tuzak** olarak kayda geçiriliyor; `Secure`
bayrağı isteğin `https` üzerinden gelip gelmediğine bakılarak koşullanmalı.

### 4. A-14 yalnızca `script-src`'ı kapsar; `style-src 'unsafe-inline'` KALIR

Nonce'lar inline `style="..."` **niteliklerine** uygulanmaz — bunlar ayrı bir direktif olan
`style-src-attr` altına düşer ve Next.js'in nonce mekanizması onu kapsamaz (kaynak:
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). Kod tabanında 17
yerde `style={{...}}` kullanımı var ve `recharts` çalışma anında inline stil yazıyor;
`style-src`'tan `'unsafe-inline'` kaldırılırsa grafikler ve animasyonlar kırılır. `next.config.mjs`
şu an `"style-src 'self' 'unsafe-inline';"` içeriyor ve bu satır **değişmeyecek**. Kalan bu boşluk
yeni bir borç olarak izlenmelidir — numarası bu ADR'de atanmaz, `docs/PROGRESS.md`'nin borç
kütüğünde main thread tarafından verilecektir.

### 5. Nonce'un bedeli kabul ediliyor: tüm sayfalar dinamik render'a geçer

Next.js nonce'u yalnızca **sunucuda render edilen** sayfalara uygular; build zamanında üretilmiş
statik HTML'in bootstrap script'inde nonce olmaz ve CSP onu bloklar (kaynak: aynı
`content-security-policy.md`). Bugün statik üretilen 5 sayfa — `/`, `/_not-found`, `/login`,
`/profile`, `/users` — bu geçişle dinamik render'a geçer.

**Neden bedel düşük:** bu sayfalar zaten auth-gated, veriyi TanStack Query ile istemcide çeken
kabuklar (`docs/adr/0002-tanstack-query-secimi.md`); build sırasında anlamlı içerik prerender
edilmiyor, ISR/CDN önbelleği hâlihazırda kullanılmıyor.

**Feragat edilenler:** statik optimizasyon, ISR, CDN kenar önbelleği ve PPR (Partial
Prerendering) — PPR nonce ile uyumsuz.

> **Uygulama notu (2026-08-18):** yukarıdaki tahmin ("5 sayfa dinamikleşir") uygulama sırasında
> ölçüldü ve **saptı** — gerçekleşen bundan geniş. `export const dynamic = 'force-dynamic'`
> route segment config'i `/`, `/login`, `/profile`, `/users` dört sayfasında **sessiz no-op**
> çıktı: bu dördü `'use client'` bileşenleri ve Next 16 bu config'i istemci sayfalarında yok
> sayıyor (beşine de eklenip build alınarak doğrulandı — yalnızca sunucu bileşeni olan
> `/_not-found` gerçekten dinamikleşti). Çözüm, ağaçtaki tek sunucu bileşeni olan kök
> layout'ta (`src/app/layout.tsx`) `await connection()` çağrısı oldu; bunun sonucu öngörülen
> "5 sayfa" değil **tüm rota ağacının** dinamikleşmesidir (build çıktısında route tablosunda
> `○` (statik) kalmadı, 10/10 rota `ƒ` (dinamik)). Bedel kabul edilen yönde aynı kaldı
> (Karar 5'teki gerekçe geçerli), yalnızca kapsamı daha geniş. Ayrıntı:
> `archive/progress-a05-a14-cookie-nonce-csp.md`.

### 6. `'strict-dynamic'` KULLANILMIYOR (şimdilik)

`script-src 'self' 'nonce-<n>'` yeterli ve daha düşük risklidir. `'strict-dynamic'` host tabanlı
kaynak listelerini yok sayar ve Next'in nonce vermediği herhangi bir script'i sessizce kırabilir.
Gelecekte, gerekirse ayrı bir sertleştirme adımı olarak değerlendirilebilir; bu turun kapsamında
değil.

### Reddedilen alternatifler

- **Tam `httpOnly` cookie + BFF.** Tüm veri erişimini sunucuya taşır, mimariyi ve planın
  AC-2.4'ünü (`active_planprogram.md` §4) yeniden tanımlar, realtime'ı (`useMessages.ts`) doğrudan kullanılamaz hale getirir.
  Ayrı ve çok daha büyük bir iş — reddedildi.
- **`localStorage`'da kalıp yalnızca A-14'ü yapmak.** Taşınacak kodun nihai şeklini (SSR-uyumlu
  depolama arayüzü) belirlemez; Faz 4.5'te `packages/api-client`'ın auth yüzeyi bu kez cookie
  geçişiyle **ikinci kez** kesilmiş olurdu. Reddedildi.
- **Next'in deneysel `experimental.sri` (hash tabanlı CSP).** Statik üretimi korur ama deneysel
  ve App Router'a özgü; ayrıca Next'in inline bootstrap script'ini tek başına çözmez. Reddedildi.

### Zamanlama kararı: Faz 4.5'ten önce

Bu iş monorepo + Expo taşımasından (`0009`) **önce** yapılıyor. Gerekçe: A-05 sonrası doğru
mimari "`packages/api-client` Supabase istemcisini enjeksiyonla alır, her uygulama kendi auth
deposunu sahiplenir" biçimindedir (mobilde cookie değil `SecureStore` olacak). Monorepo önce
kesilirse `packages/api-client`, bugünkü `localStorage`-singleton'ıyla (`src/lib/supabase/client.ts`)
kesilir ve A-05 geldiğinde paketin dış yüzeyi **ikinci kez** yeniden tasarlanmak zorunda kalır
(AC-4.5.5). Ayrıca bu davranış değişikliğini 598 birim testi yeşilken tek değişkenle yapmak,
taşıma sonrası "E2E kırıldı — taşıma mı auth mu?" belirsizliğini baştan engelliyor.

> **Uygulama notu (2026-08-18) — öngörülmeyen iki bağımlılık.** Uygulama sırasında bu ADR
> yazılırken görülmeyen iki zincir ortaya çıktı:
>
> 1. **`next-themes` inline script'i nonce gerektiriyordu.** Tema FOUC önleyici olarak her
>    sayfaya enjekte edilen inline `<script>` nonce'suz kalınca CSP tarafından bloklanıyordu.
>    `next-themes@0.4.6`'nın belgeli `nonce` prop'uyla kapatıldı; zincir: `src/proxy.ts` nonce
>    üretir → `x-nonce` istek başlığı → `src/app/layout.tsx` `headers()` ile okur →
>    `src/app/providers.tsx` → `ThemeProvider`. Ölçüm: nonce'suz `<script>` sayısı beş sayfada
>    **1 → 0**.
> 2. **`getServerEnv()`'in proxy'ye taşınması gerekti.** Nonce üretimi ve CSP header'ı proxy
>    (`src/proxy.ts`, Next 16 konvansiyonu — `middleware.ts` değil) katmanında kuruldu; env
>    doğrulamasının aynı yerde çağrılması matcher'ın genişlemesiyle **tüm sayfaları** etkileyecek
>    şekilde `getServerEnv()`'in API route dalına taşınmasını gerektirdi — taşınmasaydı proxy'nin
>    genişleyen matcher'ı her sayfayı 500'e düşürürdü.
>
> Ayrıntı: `archive/progress-a05-a14-cookie-nonce-csp.md`.

## Sonuçlar

### Olumlu

- A-05 ve A-14, borç kütüğündeki `B-006`/`B-007` kayıtlarını kapatır; `next.config.mjs`'teki
  `script-src` TODO'su çözülür.
- Oturum deposu SSR-uyumlu tek bir katmana (`@supabase/ssr`) toplanır; `Secure` + `SameSite=Lax`
  nitelikleriyle en azından ağ üzerinde/ortak makinede kalıcı `localStorage` artığı riski azalır.
- `packages/api-client`'ın auth yüzeyi Faz 4.5'ten önce **son şeklini** alır — monorepo taşıması
  sırasında ikinci bir kesim gerekmez.
- Karar, 598 birim testi yeşilken tek değişkenli bir turda yapılıyor; taşıma ile karışan bir
  regresyon belirsizliği oluşmaz.

### Olumsuz / kabul edilen bedeller

- **XSS hâlâ oturumu okuyabilir** — cookie `httpOnly` değil, bu geçiş token'ı istemciden
  gizlemiyor (Karar 1). Kazanım yalnızca depolama biçimi ve XSS'in gerçekleşme olasılığının
  düşürülmesi.
- CSRF yüzeyi açmamak için API route'ları `Authorization: Bearer`'a bağımlı kalıyor — cookie
  geçişi kimlik doğrulama sözleşmesini basitleştirmiyor (Karar 2).
- `style-src 'unsafe-inline'` kalıcı bir boşluk olarak kalıyor (Karar 4); ayrı bir borç olarak
  izlenmesi gerekiyor.
- 5 sayfa statik üretimden dinamik render'a geçiyor; ISR, CDN kenar önbelleği ve PPR bu sayfalar
  için feragat ediliyor (Karar 5).
- `Secure` bayrağının `NODE_ENV`'den değil istek protokolünden türetilmesi gerektiği unutulursa
  E2E paketi sessizce kırılır — bu, uygulama sırasında dikkat edilmesi gereken bilinen bir tuzak
  olarak kayda geçirildi (Karar 3).
- `src/app/api/auth/sign-in/route.ts`'teki eski "istemci hiç token görmeyecek (httpOnly)" notu bu
  ADR ile **yanlış** ilan edildi; uygulama sırasında yorum güncellenmelidir.

### Etkilenen dosyalar

- `docs/adr/0022-oturum-depolamasi-cookie-ve-nonce-csp.md` (bu dosya)
- `docs/adr/README.md` (indeks satırı)
- Uygulama sırasında gerçekten değişen dosyalar (2026-08-18): `src/lib/supabase/client.ts`,
  `src/lib/supabase/server.ts`, `src/app/api/auth/sign-in/route.ts`, `src/hooks/useSession.ts`,
  `src/proxy.ts` (nonce üretimi — Next 16 konvansiyonu, `middleware.ts` DEĞİL),
  `src/lib/security/csp.ts` (yeni), `next.config.mjs`, `src/app/layout.tsx`,
  `src/app/providers.tsx`, `tests/unit/auth-cookie-session.test.ts` (yeni),
  `tests/unit/csp-nonce.test.ts` (yeni), `tests/unit/auth-sign-in-rate-limit.test.ts`,
  `tests/unit/security-events.test.ts`, `docs/PROGRESS.md` (borç kütüğü — `B-006`/`B-007`
  kapanışı ve yeni `B-044`/`B-045` borçları)
