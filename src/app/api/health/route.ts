// Sağlık kontrolü ucu. Docker HEALTHCHECK ve yük dengeleyiciler bunu çağırır.
// Rate limit'ten muaftır (bkz. src/middleware.ts).

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
