import 'server-only'

// AI proxy route'larının ortak iskeleti: doğrulama, upstream çağrısı, hata maskeleme.
// GÜVENLİK: upstream hata detayları/stack istemciye ASLA sızdırılmaz, yalnızca loglanır.

import { NextResponse } from 'next/server'
import type { z } from 'zod'

import { getServerEnv } from '@/env'
import { errorResponse } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatZodError } from '@/lib/validation/schemas'

const UPSTREAM_TIMEOUT_MS = 30_000

// `errorResponse` `./response.ts`'e taşındı (A-01: `/api/auth/sign-in` de kullanıyor).
// Mevcut içe aktarmalar (`import { errorResponse } from '@/lib/api/proxy'`) kırılmasın diye
// buradan yeniden dışa aktarılır.
export { errorResponse }

/**
 * Gövdeyi doğrulayıp Python AI backend'ine iletir ve yanıtını aynen döndürür.
 *
 * @param upstreamPath `/analyze/workout` gibi, AI_BACKEND_URL'e eklenen yol.
 */
export async function handleAiProxy<TOut>(
  request: Request,
  schema: z.ZodType<TOut, z.ZodTypeDef, unknown>,
  upstreamPath: string
): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  let log = createRequestLogger(requestId)

  // 0) Oturum doğrulama — plan §5.3: "auth zorunlu, kullanıcı kimliği server'da JWT'den
  // alınır (client'tan user_id kabul etme)". `Authorization: Bearer <token>` başlığı
  // Supabase'e karşı doğrulanır; kullanıcı kimliği yalnızca loglama için tutulur ve
  // upstream'e (FastAPI) gövdede GÖNDERİLMEZ.
  // NOT: Rate limit anahtarı hâlâ IP tabanlıdır (bkz. src/proxy.ts) — burada değişmedi.
  const authHeader = request.headers.get('authorization')
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
  const accessToken = bearerMatch?.[1]?.trim()

  if (!accessToken) {
    log.warn({ upstreamPath }, 'AI proxy: Authorization başlığı eksik/biçimsiz')
    return errorResponse(
      401,
      'NOT_AUTHENTICATED',
      'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
      requestId
    )
  }

  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    log.warn({ upstreamPath, err: userError }, 'AI proxy: geçersiz veya süresi dolmuş oturum')
    return errorResponse(
      401,
      'NOT_AUTHENTICATED',
      'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.',
      requestId
    )
  }

  log = log.child({ userId: userData.user.id })

  // 1) Gövdeyi oku
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  // 2) Doğrula
  const parsed = schema.safeParse(rawBody)
  if (!parsed.success) {
    const details = formatZodError(parsed.error)
    log.warn({ upstreamPath, details }, 'AI proxy doğrulama hatası')
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Gönderilen bilgiler geçersiz. Lütfen alanları kontrol edin.',
      requestId,
      details
    )
  }

  // 3) Upstream'e ilet
  const env = getServerEnv()
  const upstreamUrl = `${env.AI_BACKEND_URL.replace(/\/+$/, '')}${upstreamPath}`

  // A-09 (güvenlik denetimi, findings-app-surface.md §7 Grup 2 — ajanlar arası sözleşme):
  // FastAPI hız sınırlayıcısı `get_remote_address` ile PROXY'nin IP'sini görüyor, yani tüm
  // kullanıcılar tek ortak kovayı paylaşıyordu. Doğrulanmış kullanıcı kimliği (adım 0'da
  // `auth.getUser(accessToken)` ile GoTrue'ya karşı doğrulandı) burada upstream'e AYRI bir
  // başlıkla iletilir — GÖVDEYE DEĞİL. Backend bu başlığa yalnızca geçerli bir API anahtarı
  // taşıyan istekte güvenir (ai_backend tarafı). Kimlik İSTEMCİ GÖVDESİNDEN ASLA alınmaz;
  // `userData.user.id` yalnızca yukarıdaki doğrulanmış Supabase oturumundan gelir.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    'X-User-Id': userData.user.id,
  }
  if (env.AI_BACKEND_API_KEY) headers['X-API-Key'] = env.AI_BACKEND_API_KEY

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch (error) {
    log.error({ upstreamPath, err: error }, 'AI backend’e ulaşılamadı')
    return errorResponse(
      503,
      'AI_BACKEND_UNAVAILABLE',
      'Python AI sunucusuna ulaşılamadı. Sunucunun çalıştığından emin olun.',
      requestId
    )
  } finally {
    clearTimeout(timeoutId)
  }

  // 4) Upstream hatası — detay sızdırma
  if (!upstreamResponse.ok) {
    const upstreamText = await upstreamResponse.text().catch(() => '')
    log.error(
      { upstreamPath, status: upstreamResponse.status, body: upstreamText.slice(0, 2000) },
      'AI backend hata döndü'
    )
    return errorResponse(
      502,
      'AI_BACKEND_ERROR',
      'Yapay zeka servisi şu anda yanıt vermiyor.',
      requestId
    )
  }

  // 5) Başarılı yanıtı aynen ilet
  let data: unknown
  try {
    data = await upstreamResponse.json()
  } catch (error) {
    log.error({ upstreamPath, err: error }, 'AI backend geçersiz JSON döndü')
    return errorResponse(
      502,
      'AI_BACKEND_ERROR',
      'Yapay zeka servisi şu anda yanıt vermiyor.',
      requestId
    )
  }

  log.info({ upstreamPath }, 'AI proxy başarılı')

  return NextResponse.json(data, {
    headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
  })
}
