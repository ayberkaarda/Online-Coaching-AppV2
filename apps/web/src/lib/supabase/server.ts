import 'server-only'

// Server Component / Route Handler için anon key'li Supabase istemcileri.
//
// İKİ AYRI FABRİKA VAR, bilerek:
//
//   1) `createServerSupabaseClient(accessToken?)` — STATELESS. Kimliği `Authorization: Bearer`
//      başlığından alır, hiçbir oturum saklamaz. API route'ları (AI proxy'si, /api/health)
//      kimliği HÂLÂ bu yolla doğrular; cookie yalnızca DEPOLAMA ortamıdır, kimlik doğrulama
//      ortamı DEĞİL. Cookie tabanlı kimlik doğrulamaya geçmek CSRF yüzeyi açardı — bu tur onu
//      açmıyor. İmzası da AYNEN korunur: birden çok birim testi ve route bu şekle bağlı.
//
//   2) `createCookieBoundServerClient(request)` — A-05 (B-006). Oturumu isteğin `Cookie`
//      başlığından okur ve oturum değiştiğinde (giriş, token yenileme, çıkış) yeni cookie'leri
//      YANITA yazar. Şu an yalnızca `/api/auth/sign-in` kullanır.

import { createServerClient, parseCookieHeader, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextResponse } from 'next/server'

import { clientEnv } from '@/env'
import type { Database } from '@repo/types'

/**
 * @param accessToken Kullanıcının Supabase access token'ı. Verilirse istekler
 *                    o kullanıcının kimliğiyle (RLS altında) çalışır.
 */
export function createServerSupabaseClient(accessToken?: string): SupabaseClient<Database> {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    }
  )
}

export interface CookieBoundServerClient {
  supabase: SupabaseClient<Database>
  /**
   * Biriken oturum cookie'lerini yanıta `Set-Cookie` olarak yazar. Supabase çağrılarından
   * SONRA, yanıtı döndürmeden hemen önce çağrılmalıdır.
   */
  applyCookies: (response: NextResponse) => void
}

/**
 * `Secure` bayrağı ORTAMDAN türetilir, `NODE_ENV`'den DEĞİL.
 *
 * TUZAK: E2E paketi `pnpm run build && pnpm run start` ile, yani `NODE_ENV=production` altında
 * ama `http://localhost:3000` üzerinden koşar. `Secure` koşulsuz set edilseydi tarayıcı
 * cookie'yi düz http'de HİÇ saklamazdı → oturum kurulamaz → tüm E2E paketi düşerdi.
 *
 * `X-Forwarded-Proto` BİLEREK okunmaz: `TRUSTED_PROXY_COUNT` varsayılanı 0 olduğu için bu
 * repoda hiçbir forward başlığına güvenilmiyor (bkz. `src/lib/api/client-ip.ts`). İstek
 * protokolü tek güvenilir kaynaktır ve tarayıcı tarafındaki `window.location.protocol`
 * kontrolüyle (bkz. `client.ts`) AYNI sonucu üretir.
 */
function isSecureRequest(request: Request): boolean {
  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * İsteğin cookie'lerine bağlı Supabase istemcisi (A-05 / B-006).
 *
 * `setAll` çağrıları önce bir diziye biriktirilir, sonra `applyCookies(response)` ile
 * `NextResponse` üzerine uygulanır. `cookies()` yerine bu açık yol tercih edildi: Route
 * Handler içinde ne yazıldığı görünür ve birim testinde doğrudan doğrulanabilir.
 */
export function createCookieBoundServerClient(request: Request): CookieBoundServerClient {
  const pending: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // `name` BİLEREK verilmiyor — bkz. `client.ts`'teki aynı not (iki taraf da URL'den
      // türeyen varsayılan adı kullanır; parçalama kütüphaneye bırakılır).
      // `httpOnly` de BİLEREK set edilmiyor: kütüphanenin varsayılanı zaten `false` ve bu
      // bilinçli bir karardır (gerekçe `client.ts` başındaki blokta).
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: isSecureRequest(request),
      },
      cookies: {
        getAll: () => parseCookieHeader(request.headers.get('cookie') ?? ''),
        setAll: (cookiesToSet) => {
          pending.push(...cookiesToSet)
        },
      },
    }
  )

  return {
    supabase,
    applyCookies: (response) => {
      for (const { name, value, options } of pending) {
        // `CookieOptions` (`cookie` paketinin `SerializeOptions`'ı) Next'in
        // `ResponseCookie`'sinde karşılığı olmayan alanlar da taşıyabilir (`encode` vb.);
        // bu yüzden alanlar tek tek aktarılır.
        response.cookies.set({
          name,
          value,
          path: options.path,
          domain: options.domain,
          maxAge: options.maxAge,
          expires: options.expires,
          httpOnly: options.httpOnly,
          secure: options.secure,
          sameSite: options.sameSite,
        })
      }
      // Kütüphane `setAll`'a ayrıca `Cache-Control: private, no-store...` başlıkları da
      // geçirir; onları uygulamıyoruz çünkü route zaten `Cache-Control: no-store` yazıyor
      // (aynı etki, tek kaynak).
      pending.length = 0
    },
  }
}
