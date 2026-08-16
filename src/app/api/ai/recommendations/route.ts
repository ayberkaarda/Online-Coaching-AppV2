// Öneri motoru proxy'si: /api/ai/recommendations -> AI_BACKEND_URL/recommendations

import { handleAiProxy } from '@/lib/api/proxy'
import { recommendationSchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleAiProxy(request, recommendationSchema, '/recommendations')
}
