// Route handler'ların ortak yanıt yardımcıları.
//
// `errorResponse` daha önce `src/lib/api/proxy.ts` içinde yaşıyordu; A-01 (giriş kaba kuvvet
// koruması) ile ikinci bir çağıran (`/api/auth/sign-in`) eklendiğinde buraya taşındı, böylece
// auth route'u AI proxy modülünün tamamını içe aktarmak zorunda kalmaz. Gövde biçimi
// (`ApiErrorBody`, bkz. `./types.ts`) ve davranış DEĞİŞMEDİ; `proxy.ts` geriye dönük uyumluluk
// için aynı adı yeniden dışa aktarır.

import { NextResponse } from 'next/server'

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
