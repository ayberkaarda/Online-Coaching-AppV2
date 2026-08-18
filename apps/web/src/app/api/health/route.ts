// Sağlık kontrolü ucu. Docker HEALTHCHECK ve yük dengeleyiciler bunu çağırır.
//
// A-17 (güvenlik denetimi, findings-app-surface.md §2): bu uç eskiden hız sınırından TAMAMEN
// muaftı ve sürüm bilgisini KİMLİKSİZ her çağrıya döndürüyordu (parmak izi çıkarma yüzeyi).
// Şimdi:
//  1) `src/proxy.ts` cömert ama sınırsız olmayan bir tavana tabi tutuyor (HEALTH_LIMIT) —
//     Docker HEALTHCHECK 30 sn'de bir çağırdığından (dakikada 2 istek) bu tavana asla çarpmaz.
//  2) `version` alanı yalnızca DOĞRULANMIŞ bir `Authorization: Bearer <token>` başlığıyla gelen
//     çağrıda döner; kimliksiz/anonim çağrı yalnızca sade bir durum yanıtı alır. Docker
//     HEALTHCHECK ve dış uptime monitörleri Authorization göndermez, yalnızca HTTP 200 bekler
//     — bu davranış değişikliği onları KIRMAZ (bkz. Dockerfile HEALTHCHECK, sadece 200 kontrolü).

import { NextResponse } from 'next/server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function isAuthenticated(request: Request): Promise<boolean> {
  const authHeader = request.headers.get('authorization')
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i)
  const accessToken = bearerMatch?.[1]?.trim()
  if (!accessToken) return false

  try {
    const client = createServerSupabaseClient(accessToken)
    const { data, error } = await client.auth.getUser(accessToken)
    return !error && !!data.user
  } catch {
    // Supabase'e ulaşılamazsa bile health endpoint'i 200 dönmeye devam etmeli;
    // yalnızca sürüm bilgisini kimliksiz muamele ederek gizler.
    return false
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const authenticated = await isAuthenticated(request)

  const body = authenticated
    ? {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.1.0',
      }
    : {
        status: 'ok' as const,
        timestamp: new Date().toISOString(),
      }

  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
