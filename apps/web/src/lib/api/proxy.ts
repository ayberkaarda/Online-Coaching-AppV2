import 'server-only'

// AI proxy route'larının ortak iskeleti: doğrulama, upstream çağrısı, hata maskeleme.
// GÜVENLİK: upstream hata detayları/stack istemciye ASLA sızdırılmaz, yalnızca loglanır.

import { NextResponse } from 'next/server'
import type { z } from 'zod'

import { getServerEnv } from '@/env.server'
import { aiQuotaExceededResponse, checkAndConsumeAiQuota } from '@/lib/api/ai-quota'
import { errorResponse } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatZodError } from '@repo/types/schemas'

const UPSTREAM_TIMEOUT_MS = 30_000

// A-08 (güvenlik denetimi, findings-app-surface.md §3.8): meşru AI proxy gövdesi (antrenman/
// beslenme planı girdisi) en fazla birkaç yüz bayt/birkaç KB'lık JSON'dur; 64 KB bunun için
// cömert bir tavan. Öncesinde sınır yoktu — Next.js'in sessiz 10 MB kesme davranışına kalınmıştı
// (bellek/CPU tüketim vektörü, bkz. bulgu). `export`: `tests/unit/proxy-body-size.test.ts`
// sınırı burayla senkron kalsın diye kopyalamak yerine doğrudan bu sabiti içe aktarır.
export const MAX_BODY_BYTES = 64 * 1024

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

  // 0.4) Kullanıcı başına GÜNLÜK AI kotası (B-043 / AC-4.6.3) — bkz. `src/lib/api/ai-quota.ts`
  // başlığı. Doğrulanmış `userData.user.id` (yukarıda `auth.getUser` ile İMZA DOĞRULAMALI
  // olarak elde edildi) kullanılır — JWT `sub` alanı doğrulamasız OKUNMAZ, çünkü sahte bir
  // token'a kurbanın user_id'sini yazıp kurbanın kotasını TÜKETMEK (griefing) mümkün olurdu.
  // Kota, gövde okuma/doğrulama (adım 0.5/1/2) ve upstream çağrısı (adım 3) BAŞLAMADAN ÖNCE
  // kontrol edilir — aşımda maliyetli hiçbir iş yapılmaz.
  const quota = checkAndConsumeAiQuota(userData.user.id)
  if (!quota.allowed) {
    log.warn({ upstreamPath, limit: quota.limit }, 'AI proxy: günlük kota aşıldı')
    return aiQuotaExceededResponse(quota, requestId)
  }

  // 0.5) Gövde boyutu — ucuz ÖN kontrol (A-08). `Content-Length` istemci tarafından bildirilir,
  // dolayısıyla GÜVENİLMEZ (sahte/eksik olabilir, chunked/streaming istekte hiç yoktur); varsa
  // erken reddetmek akışı hiç başlatmadan tasarruf sağlar. ASIL savunma bu değildir — aşağıdaki
  // 1. adımda gövde STREAM SIRASINDA sınırlanır; bu ön kontrol tamamen atlanabilir olsa da
  // (`Content-Length` yok/yalan) arkasındaki akış-bazlı kontrol atlatılamaz.
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const declaredLength = Number(contentLengthHeader)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      log.warn(
        { upstreamPath, declaredLength },
        'AI proxy: Content-Length beyanı gövde boyutu sınırını aşıyor'
      )
      return errorResponse(
        413,
        'PAYLOAD_TOO_LARGE',
        'İstek gövdesi çok büyük. Lütfen daha küçük bir istek gönderin.',
        requestId
      )
    }
  }

  // 1) Gövdeyi oku — ASIL savunma (A-08). `request.text()` gövdeyi ÖNCE tamamen belleğe alıp
  // SONRA bayt sayımı yapardı; bu, `Content-Length` olmayan (chunked/streaming) bir istekte
  // saldırganın gönderdiği DEV bir gövdeyi biz reddetmeden önce tamamen okumuş/bellekte tutmuş
  // olmamız anlamına gelirdi — A-08'in tarif ettiği DoS vektörünün ta kendisi. Bunun yerine
  // gövde `ReadableStream` üzerinden PARÇA PARÇA okunur; biriken bayt sayısı `MAX_BODY_BYTES`'ı
  // AŞAR AŞMAZ `reader.cancel()` ile akış DERHAL durdurulur ve kalan baytlar hiç okunmadan/
  // belleğe alınmadan 413 dönülür.
  let bodyText: string
  if (request.body === null) {
    // Gövdesiz istek — `JSON.parse('')` aşağıda `INVALID_JSON`'a düşecek, mevcut davranış korunur.
    bodyText = ''
  } else {
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let receivedBytes = 0
    let exceededLimit = false

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue

        receivedBytes += value.byteLength
        if (receivedBytes > MAX_BODY_BYTES) {
          exceededLimit = true
          // Kalan chunk'lar HİÇ okunmaz/belleğe alınmaz — asıl DoS savunması budur.
          await reader.cancel()
          break
        }
        chunks.push(value)
      }
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
    }

    if (exceededLimit) {
      log.warn({ upstreamPath }, 'AI proxy: gövde boyutu sınırı aşıldı (stream erken iptal edildi)')
      return errorResponse(
        413,
        'PAYLOAD_TOO_LARGE',
        'İstek gövdesi çok büyük. Lütfen daha küçük bir istek gönderin.',
        requestId
      )
    }

    const combined = new Uint8Array(receivedBytes)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }
    bodyText = new TextDecoder('utf-8').decode(combined)
  }

  let rawBody: unknown
  try {
    rawBody = JSON.parse(bodyText)
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
    // A-16 (güvenlik denetimi, findings-app-surface.md §3.11): önceki mesaj "Python AI
    // sunucusuna ulaşılamadı..." diyerek upstream'in teknolojisini (FastAPI/Python) istemciye
    // ifşa ediyordu — teknik detay yalnızca aşağıdaki `log.error` ile sunucuda kalır, gövdeye
    // ASLA girmez.
    log.error({ upstreamPath, err: error }, 'AI backend’e ulaşılamadı')
    return errorResponse(
      503,
      'AI_BACKEND_UNAVAILABLE',
      'Yapay zeka servisine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.',
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
