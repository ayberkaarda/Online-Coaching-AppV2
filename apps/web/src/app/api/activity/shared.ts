import 'server-only'

// Faz 4.8 dilim 2 — `/api/activity` ve `/api/activity/consent` UÇLARININ ORTAK İSKELETİ.
//
// İki route da AYNI üç adımı yapıyor (Bearer kimlik doğrulama, service_role istemcisi,
// PostgREST hatasının SQLSTATE'ini okuma); üçü de kopyalanırsa iki dosya sessizce
// ayrışabilir. `src/app/api/account/deletion-core.ts`'nin route'undan ayrılmış saf
// çekirdek deseniyle AYNI mantık.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN service_role — VE NEDEN BU GEREKLİ BİR SINIR AŞIMI
// ─────────────────────────────────────────────────────────────────────────────
// `record_activity`, `grant_activity_consent` ve `revoke_activity_consent`
// SECURITY DEFINER'dır ve EXECUTE yetkisi YALNIZCA `service_role`'a verilmiştir
// (bkz. supabase/migrations/20260820090000_activity_log.sql). Bu, §7c'nin
// "tarayıcıdan doğrudan Supabase yazımı YOK" kararının şema seviyesindeki
// karşılığıdır: `activity_sessions`/`activity_events` tablolarına ve rıza
// damgalarına yazan TEK yol bu Next route'larıdır. Anon/`authenticated` anahtarla
// çağrılırsa Postgres 42501 verir — yani kural koda değil, veritabanına gömülüdür.
//
// ANAHTAR DİSİPLİNİ (`src/app/api/account/delete/route.ts` ile birebir aynı):
// yalnızca `getServerEnv()` üzerinden okunur (`server-only` taşır), hiçbir log
// satırına / hata gövdesine / yanıt başlığına yazılmaz.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { clientEnv } from '@/env'
import { getServerEnv } from '@/env.server'
import { errorResponse } from '@/lib/api/response'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@repo/types'

export const NOT_AUTHENTICATED_MESSAGE = 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'

export const UNCONFIGURED_MESSAGE =
  'Etkinlik kaydı şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin.'

/**
 * `Authorization: Bearer <token>` doğrular ve DOĞRULANMIŞ kullanıcı kimliğini döner.
 *
 * COOKIE İLE DOĞRULAMA BİLEREK KULLANILMADI — `account/delete` ve
 * `coach/reset-client-password` route'larıyla AYNI gerekçe: cookie yalnızca DEPOLAMA
 * ortamıdır, kimlik doğrulama ortamı değildir ve cookie'ye dayanan bir uç CSRF yüzeyi
 * açar. Tarayıcı üçüncü taraf bir sayfadan `Authorization` başlığı GÖNDEREMEZ.
 *
 * Bu ayrıca `sendBeacon`'ın neden kullanılamadığının da sebebidir (§7c): `sendBeacon`
 * özel başlık taşıyamaz, dolayısıyla bu kapıdan geçemez. İstemci
 * `fetch(url, { keepalive: true })` kullanır.
 *
 * @returns Hata durumunda hazır `NextResponse`, başarıda `{ userId }`.
 */
export async function authenticateActivityRequest(
  request: Request,
  requestId: string
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get('authorization')
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!accessToken) {
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  const authClient = createServerSupabaseClient(accessToken)
  const { data, error } = await authClient.auth.getUser(accessToken)

  if (error || !data.user) {
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  // ###########################################################################
  // KİMLİK YALNIZCA BURADAN GELİR. Gövde şemaları (`activityBodySchema`,
  // `activityConsentBodySchema`) `.strict()`'tir ve `user_id` alanı TAŞIMAZ —
  // gövdesine kimlik koymaya çalışan bir istemci 422 alır, sessizce yok
  // sayılmaz. Koçun BAŞKASININ rızasını verememesi/alamaması da buradan gelir:
  // uçlarda HEDEF PARAMETRESİ YOKTUR, yani "yetki kontrolü" değil YAPISAL bir
  // imkânsızlıktır.
  // ###########################################################################
  return { userId: data.user.id }
}

/**
 * `service_role` istemcisi. Anahtar yapılandırılmamışsa `null` döner — çağıran
 * gürültülü bir 503 üretir (SESSİZCE "kaydettim" DEMEK en kötü davranıştır;
 * `account/delete` route'undaki aynı fail-closed kural).
 */
export function createActivityAdminClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null

  return createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * PostgREST hata nesnesinden SQLSTATE'i okur.
 *
 * Migration'ın sözleşmesi (§4 başlığı) şu kodları GARANTİ eder:
 *   `42501` rıza yok / başkasının oturumu · `22023` eksik-anlamsız parametre ·
 *   `23514` kapalı liste dışı event/platform · `23503` profil yok.
 * Hata MESAJINA asla bakılmaz (metin Türkçe/serbesttir ve değişebilir); yalnızca
 * kod dallandırma yapar.
 */
export function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export const SQLSTATE = {
  /** Rıza yok (undecided | revoked) VEYA oturum başka kullanıcıya ait. */
  INSUFFICIENT_PRIVILEGE: '42501',
  /** Eksik veya anlamsız parametre (null zorunlu alan, sapmış `occurred_at`). */
  INVALID_PARAMETER_VALUE: '22023',
  /** CHECK ihlali — kapalı liste dışı `event` / `platform`. */
  CHECK_VIOLATION: '23514',
  /** FK ihlali — profil yok. */
  FOREIGN_KEY_VIOLATION: '23503',
} as const
