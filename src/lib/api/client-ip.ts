// Güvenilen ters proxy zincirinden istemci IP'sini çözer.
//
// Bu modül HEM Next.js proxy runtime'ı (`src/proxy.ts`) HEM de `/api/**` route handler'ları
// tarafından kullanılır. Kendisi doğrudan `import 'server-only'` İÇERMEZ (yine de bilerek sunucu
// dışında çağrılmaz — `getServerEnv()` tarayıcıda çağrılırsa zaten hata fırlatır), ama AC-11
// (güvenlik denetimi, findings-access-control.md) sonrası aşağıdaki `@/env.server` importu
// ÜZERİNDEN dolaylı olarak `server-only`'yi de içeri çekiyor.
//
// DAHA ÖNCEKİ NOT ("proxy/middleware runtime'ı server-only paketini desteklemez") YANLIŞTI —
// bu repodaki Next.js sürümünde webpack derleyicisi `middleware` katmanını `WEBPACK_LAYERS.
// GROUP.serverOnly` içinde sınıflandırır (bkz. `node_modules/next/dist/lib/constants.js`) ve
// `server-only`'yi o katmanda no-op bir modüle alias'lar (bkz.
// `node_modules/next/dist/build/create-compiler-aliases.js`, `createServerOnlyClientOnlyAliases`);
// yani `src/proxy.ts` içinde `server-only` fiilen SORUNSUZ ÇALIŞIR. `pnpm run build` ile
// doğrulandı (bkz. AC-11 kabul kanıtı).
//
// Mantık A-02'den (güvenlik denetimi, findings-app-surface.md §3.2) devralınmıştır; daha önce
// `src/proxy.ts` içinde yaşıyordu ve A-01 (giriş kaba kuvvet koruması) ile ikinci bir çağıran
// eklendiği için buraya taşındı. DAVRANIŞ DEĞİŞMEDİ.

import { getServerEnv } from '@/env.server'

/**
 * `X-Forwarded-For` standart olarak "client, proxy1, proxy2, ..." biçiminde SOLDAN SAĞA büyür:
 * her hop, kendi gördüğü bağlantı IP'sini zincirin SONUNA ekler. `TRUSTED_PROXY_COUNT` (N)
 * güvenilen hop sayısıdır; zincirin SONDAN N'inci değeri (`parts[parts.length - N]`) en yakın
 * güvenilen hop tarafından eklenmiştir ve istemci tarafından değiştirilemez (istemci yalnızca
 * kendinden ÖNCEKİ — daha soldaki — değerleri sahteleyebilir).
 *
 * N=0 (varsayılan, yapılandırılmamış) iken bu index her zaman dizi sınırlarının dışına düşer,
 * dolayısıyla fonksiyon doğal olarak "hiçbir başlığa güvenme" davranışına düşer.
 *
 * @returns Güvenilebilir bir istemci IP'si, ya da böyle bir IP TESPİT EDİLEMİYORSA `null`.
 *          `null` "bu isteği bir istemciyle ilişkilendiremiyorum" demektir — çağıranlar buna
 *          göre davranmalıdır (bkz. `src/lib/api/auth-rate-limit.ts`, IP kovası kararı).
 */
export function resolveTrustedClientIp(headers: Headers): string | null {
  const trustedProxyCount = getServerEnv().TRUSTED_PROXY_COUNT

  if (trustedProxyCount <= 0) return null

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const index = parts.length - trustedProxyCount
    const candidate = index >= 0 ? parts[index] : undefined
    if (candidate) return candidate
  }

  // X-Real-IP de aynı güven varsayımına tabidir (yalnızca bir ters proxy'nin kendi gördüğü tek
  // bağlantı IP'sini yazdığı, istemcinin doğrudan ayarlayamadığı bir başlık).
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return null
}
