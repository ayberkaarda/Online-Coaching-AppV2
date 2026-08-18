// Content-Security-Policy üretiminin TEK kaynağı (A-14 / borç B-007).
//
// Önceden CSP `next.config.mjs` içinde statik bir string olarak üretiliyor ve `headers()`
// üzerinden servis ediliyordu; `script-src` Next.js'in inline bootstrap script'i (App Router
// hydration verisi) yüzünden `'unsafe-inline'` içermek zorundaydı. Nonce her istekte taze
// üretilmesi gerektiği için statik yapılandırmada üretilemez — bu yüzden CSP buraya taşındı ve
// `src/proxy.ts` her istekte bu modülü çağırır. `next.config.mjs` artık CSP başlığı YAYMAZ
// (diğer güvenlik başlıkları orada kalır); aksi halde iki farklı CSP başlığı yayılır ve
// tarayıcı ikisinin KESİŞİMİNİ uygular — nonce'lu politika sessizce etkisizleşirdi.
//
// Kaynak: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
// Kararlar: docs/adr/0022-oturum-depolamasi-cookie-ve-nonce-csp.md (Karar 4, 5, 6)

/**
 * Nonce üreteci.
 *
 * Next 16'da proxy VARSAYILAN OLARAK Node.js runtime'ında koşar (proxy.md §Runtime), yani
 * `Buffer` teknik olarak erişilebilir. Yine de bilinçli olarak `Buffer` KULLANILMIYOR:
 * `crypto.getRandomValues` + `btoa` ikilisi hem Node hem Edge runtime'ında hem de vitest'in
 * `jsdom` ortamında çalışır — bu modül bir gün Edge'e taşınırsa ya da doğrudan test edilirse
 * kırılmaz. 16 bayt (128 bit) entropi, CSP nonce'u için fazlasıyla yeterlidir.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * CSP'nin yapılandırılan Supabase örneğine (yerel yığın dahil) izin vermesi için
 * `NEXT_PUBLIC_SUPABASE_URL`'den http(s) ve ws(s) origin'leri türetilir. Sabit `*.supabase.co`
 * deseni `npx supabase start` ile gelen `http://127.0.0.1:54321` adresini kapsamazdı.
 *
 * A-15 (güvenlik denetimi, findings-app-surface.md): burada ASLA `https://*.supabase.co` /
 * `wss://*.supabase.co` wildcard'ı üretilmez — o wildcard bizim projemiz dışındaki HERHANGİ bir
 * Supabase projesine bağlanmayı serbest bırakıyordu ve gereksizdi (gerçek origin zaten ayrıca
 * ekleniyor). Yalnızca bu fonksiyonun ürettiği somut origin'ler kullanılır.
 */
export function supabaseCspOrigins(
  rawUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): string[] {
  if (!rawUrl) return []
  try {
    const { origin } = new URL(rawUrl)
    return [origin, origin.replace(/^http/, 'ws')]
  } catch {
    return []
  }
}

export type CspOptions = {
  /** Bu istek için üretilmiş taze nonce. */
  nonce: string
  /** `'unsafe-eval'` yalnızca development'ta eklenir (React'in hata ayıklama `eval`'i). */
  isDev?: boolean
  /** Test edilebilirlik için enjekte edilebilir; varsayılan `NEXT_PUBLIC_SUPABASE_URL`. */
  supabaseUrl?: string
}

/**
 * Tek bir istek için CSP başlık değerini üretir.
 *
 * `script-src`: `'unsafe-inline'` KALDIRILDI, yerine `'nonce-<n>'` geldi (A-14'ün özü).
 * `'unsafe-eval'` YALNIZCA development'ta gerekir (Fast Refresh / React'in sunucu hata
 * yığınlarını tarayıcıda yeniden kurmak için kullandığı `eval`); production'da yoktur.
 *
 * `'strict-dynamic'` BİLİNÇLİ OLARAK YOK (ADR-0022 Karar 6): host tabanlı kaynak listelerini
 * (`'self'`) tamamen yok sayar ve Next'in nonce vermediği herhangi bir script'i sessizce
 * kırabilir. `'self' 'nonce-<n>'` bu uygulama için yeterli ve daha düşük risklidir.
 *
 * `style-src 'unsafe-inline'` BİLİNÇLİ OLARAK KALIYOR (ADR-0022 Karar 4): nonce'lar inline
 * `style="..."` NİTELİKLERİNE uygulanmaz — bunlar ayrı bir direktif olan `style-src-attr`
 * altına düşer ve Next'in nonce mekanizması onu kapsamaz. Kod tabanında 17 yerde `style={{...}}`
 * var ve `recharts` çalışma anında inline stil yazıyor; buradan `'unsafe-inline'` kaldırılırsa
 * grafikler ve animasyonlar kırılır. Bu kalan boşluk ayrı bir borç olarak izleniyor.
 */
export function buildContentSecurityPolicy(options: CspOptions): string {
  const {
    nonce,
    isDev = process.env.NODE_ENV === 'development',
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
  } = options

  const supabaseOrigins = supabaseCspOrigins(supabaseUrl)
  // `connect-src` hem http(s) hem ws(s) origin'ine ihtiyaç duyar (realtime kanalları);
  // `img-src` yalnızca http(s) üzerinden resim çeker, ws origin'i orada anlamsızdır.
  // "İlk eleman http'tir" varsayımına dayanmamak için niyet açıkça belirtiliyor.
  const supabaseHttpOrigin = supabaseOrigins.find((origin) => origin.startsWith('http')) ?? ''

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, ...(isDev ? ["'unsafe-eval'"] : [])]
  // `ui-avatars.com` uygulamanın avatar fallback'i için bilerek KALIYOR. Boş origin'lerin
  // çift boşluk üretmemesi için direktifler `filter(Boolean)` ile temiz birleştirilir.
  const imgSrc = ["'self'", 'data:', 'blob:', 'https://ui-avatars.com', supabaseHttpOrigin].filter(
    Boolean
  )
  const connectSrc = ["'self'", ...supabaseOrigins].filter(Boolean)

  return [
    "default-src 'self';",
    `script-src ${scriptSrc.join(' ')};`,
    "style-src 'self' 'unsafe-inline';",
    `img-src ${imgSrc.join(' ')};`,
    "font-src 'self' data:;",
    `connect-src ${connectSrc.join(' ')};`,
    "frame-ancestors 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "object-src 'none';",
    'upgrade-insecure-requests',
  ]
    .join(' ')
    .trim()
}
