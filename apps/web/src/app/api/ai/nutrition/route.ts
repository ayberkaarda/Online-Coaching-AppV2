// Beslenme planı proxy'si: /api/ai/nutrition -> AI_BACKEND_URL/analyze/nutrition

import { handleAiProxy } from '@/lib/api/proxy'
import { aiDietSchema } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleAiProxy(request, aiDietSchema, '/analyze/nutrition')
}
