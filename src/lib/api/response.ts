// Route handler'ların ortak yanıt yardımcıları.
//
// `errorResponse` daha önce `src/lib/api/proxy.ts` içinde yaşıyordu; A-01 (giriş kaba kuvvet
// koruması) ile ikinci bir çağıran (`/api/auth/sign-in`) eklendiğinde buraya taşındı, böylece
// auth route'u AI proxy modülünün tamamını içe aktarmak zorunda kalmaz. Gövde biçimi
// (`ApiErrorBody`, bkz. `./types.ts`) ve davranış DEĞİŞMEDİ; `proxy.ts` geriye dönük uyumluluk
// için aynı adı yeniden dışa aktarır.

import { NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

/** Standart hata gövdesi (`ApiErrorBody`) üretir. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
  extraHeaders?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id: requestId,
        ...(details !== undefined ? { details } : {}),
      },
    },
    {
      status,
      headers: {
        'X-Request-ID': requestId,
        'Cache-Control': 'no-store',
        ...extraHeaders,
      },
    }
  )
}

// ---------------------------------------------------------------------------
// A-10 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5): güvenlik olayları için
// korelasyon anahtarlı (`event` alanı + varsa `requestId`) merkezi loglama yardımcısı.
// ---------------------------------------------------------------------------

/**
 * Güvenlik olayını `logger.warn` ile, korelasyon için `event` alanıyla loglar. Çağıran
 * `fields` içine ham token/şifre/tam e-posta KOYMAMALIDIR — bu fonksiyon içerik doğrulaması
 * yapmaz, sorumluluk çağırandadır (bkz. `src/proxy.ts` ve `src/app/api/auth/sign-in/route.ts`
 * içindeki IP/e-posta maskeleme örnekleri).
 *
 * Kullanım örneği (kalan iş, bkz. proje raporu): Supabase/PostgREST `42501` (RLS reddi)
 * hatasını yakalayan bir çağrı noktası bu fonksiyonu `logSecurityEvent('rls_denied', { ... })`
 * ile çağırmalıdır. Bu turda böyle bir çağrı noktası bu ajanın sahip olduğu dosyalarda (bu
 * dosya, `proxy.ts`, `response.ts`, `auth-rate-limit.ts`, sign-in route) YOKTUR — RLS'e karşı
 * doğrudan sorgu yapan kod `src/hooks/**` altındadır ve bu ajanın kapsamı dışındadır.
 */
export function logSecurityEvent(event: string, fields?: Record<string, unknown>): void {
  logger.warn({ event, ...fields }, `Güvenlik olayı: ${event}`)
}
