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
 * NOT (A-10 kalanının kapanışı): Supabase/PostgREST `42501` (RLS reddi) hatasının çağrı noktası
 * artık `src/hooks/**`'te KURULDU, ama BU FONKSİYON ÜZERİNDEN DEĞİL —
 * `src/lib/query/queryClient.ts`'teki merkezi `QueryCache`/`MutationCache` `onError` kancası
 * `src/lib/query/security-event.ts`'teki tarayıcı-güvenli bir eşdeğeri (`logClientSecurityEvent`)
 * kullanır. Sebep: bu dosya `next/server`'dan `NextResponse` içe aktarıyor — tarayıcı paketine
 * (hook'lar `'use client'` ağacındadır) dahil edilmeye çalışılırsa build'i kırma riski taşır.
 * Bu fonksiyon (`logSecurityEvent`) yalnızca SUNUCU tarafı çağıranlar için kullanılmaya devam
 * eder (bkz. `src/proxy.ts`, `src/app/api/auth/sign-in/route.ts`).
 */
export function logSecurityEvent(event: string, fields?: Record<string, unknown>): void {
  logger.warn({ event, ...fields }, `Güvenlik olayı: ${event}`)
}
