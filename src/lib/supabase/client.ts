// Tarayıcı (ve genel amaçlı) Supabase istemcisi — anon key ile, RLS altında çalışır.
// Modül seviyesinde tekil (singleton) tutulur: her render'da yeni bağlantı açılmaz.
//
// A-05 (B-006): oturum artık `localStorage` yerine COOKIE'de saklanır. Depolama motoru
// `@supabase/ssr`'ın `createBrowserClient`'ıdır; oturumu `document.cookie` üzerinden okur/yazar,
// böylece AYNI oturum sunucu tarafında da (Route Handler / Server Component) görünür olur.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN `httpOnly` DEĞİL — BİLİNÇLİ KARAR
// ─────────────────────────────────────────────────────────────────────────────
// Uygulama veriyi tarayıcıdan DOĞRUDAN çekiyor (`supabase.from(...)`) ve `useMessages`
// realtime `.channel(...)` aboneliği kuruyor. Yani tarayıcı istemcisinin access token'ı
// OKUYABİLMESİ zorunlu. Cookie `httpOnly` yapılsaydı `getSession()` null dönerdi ve RLS
// altındaki TÜM istemci sorguları çökerdi.
//
// Dolayısıyla bu geçişin kazancı "token'ı JS'ten gizlemek" DEĞİLDİR. Kazanç:
//   * tek ve SSR-uyumlu bir oturum deposu (sunucu da aynı oturumu görebiliyor),
//   * `SameSite=Lax` + (https'te) `Secure` nitelikleriyle taşıma/karşı-site sertleştirmesi,
//   * XSS yüzeyinin nonce tabanlı CSP ile ayrıca daraltılması.
// Token hâlâ JS'ten okunabilir; bu tasarımın kabul edilmiş sonucudur.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { clientEnv } from '@/env'
import type { Database } from '@/types/database'

let browserClient: SupabaseClient<Database> | null = null

/**
 * `Secure` bayrağı ORTAMDAN türetilir, `NODE_ENV`'den DEĞİL.
 *
 * TUZAK: E2E paketi `npm run build && npm run start` ile, yani `NODE_ENV=production` altında
 * ama `http://localhost:3000` üzerinden koşar. `Secure` koşulsuz set edilseydi tarayıcı
 * cookie'yi düz http'de HİÇ saklamazdı → oturum kurulamaz → tüm E2E paketi düşerdi.
 *
 * Sunucu tarafındaki karşılığı `server.ts` içindedir (istek protokolünden türetir); iki taraf
 * AYNI sonucu üretmek ZORUNDA — aksi halde bir taraf `Secure`'lu, diğeri `Secure`'suz aynı adla
 * cookie yazar ve oturum sessizce bozulur.
 */
function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'https:'
}

/** Tarayıcı tarafı Supabase istemcisi (singleton). */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  browserClient = createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // `name` BİLEREK verilmiyor: cookie adı iki tarafta da `NEXT_PUBLIC_SUPABASE_URL`'den
      // türeyen varsayılandır (`sb-<ref>-auth-token`). Elle bir ad verilirse sunucu tarafında
      // BİREBİR aynısı verilmek zorunda kalırdı. Büyük oturumların `.0`/`.1` parçalarına
      // bölünmesini de kütüphane yapar; elle implemente edilmez.
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: isSecureContext(),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  )

  return browserClient
}

/** Geriye dönük uyumlu kısayol: `import { supabase } from '@/lib/supabase'`. */
export const supabase: SupabaseClient<Database> = createBrowserSupabaseClient()

/**
 * Supabase `{ data, error }` sonucunu açar; hata varsa fırlatır.
 * Query/Mutation hook'larında hata durumlarının sessizce yutulmasını engeller.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
