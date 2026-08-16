// Antrenman üretimi proxy'si: /api/ai/workout -> AI_BACKEND_URL/analyze/workout
// API anahtarı yalnızca sunucuda kullanılır, istemciye asla gönderilmez.

import { handleAiProxy } from '@/lib/api/proxy'
import { aiWorkoutSchema } from '@/lib/validation/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleAiProxy(request, aiWorkoutSchema, '/analyze/workout')
}
