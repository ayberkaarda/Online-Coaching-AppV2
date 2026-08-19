// Antrenman üretimi proxy'si: /api/ai/workout -> AI_BACKEND_URL/analyze/workout
// API anahtarı yalnızca sunucuda kullanılır, istemciye asla gönderilmez.
//
// B-043 / AC-4.6.3: kullanıcı başına GÜNLÜK AI kotası burada DEĞİL, `handleAiProxy` içinde
// (auth adımından hemen sonra) uygulanır — bkz. `src/lib/api/proxy.ts` ve
// `src/lib/api/ai-quota.ts`. Üç AI route'u tek bir paylaşılan günlük kovayı paylaşır.

import { handleAiProxy } from '@/lib/api/proxy'
import { aiWorkoutSchema } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleAiProxy(request, aiWorkoutSchema, '/analyze/workout')
}
