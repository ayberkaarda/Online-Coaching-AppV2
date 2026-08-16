// Ortam değişkenlerinin çalışma zamanı doğrulaması (zod).
// Client ve server şemaları AYRIDIR: sunucu sırları asla istemci paketine sızmaz.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Şemalar
// ---------------------------------------------------------------------------

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  AI_BACKEND_URL: z.string().url().default('http://localhost:8000'),
  AI_BACKEND_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
})

export type ClientEnv = z.infer<typeof clientSchema>
export type ServerEnv = z.infer<typeof serverSchema>

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * Zod hatasını okunabilir Türkçe metne çevirir.
 * GÜVENLİK: yalnızca alan adı ve hata mesajı yazılır, DEĞERLER ASLA yazılmaz.
 */
function formatEnvError(scope: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join('.') || '(kök)'
    return `  - ${path}: ${issue.message}`
  })
  return (
    `Ortam değişkeni doğrulaması başarısız (${scope}).\n` +
    `${lines.join('\n')}\n` +
    `.env.local dosyanızı .env.example ile karşılaştırın.`
  )
}

const isTestEnv = process.env.NODE_ENV === 'test'

// ---------------------------------------------------------------------------
// Client env
// ---------------------------------------------------------------------------

// KRİTİK: NEXT_PUBLIC_* değişkenleri Next.js tarafından build sırasında
// metin olarak yerine yazılır (inline). `process.env[isim]` gibi dinamik erişim
// ÇALIŞMAZ; bu yüzden her biri tam adıyla, açıkça okunur.
const rawClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}

// Test ortamında (vitest) gerçek Supabase anahtarları bulunmaz.
// Testlerin ortam eksikliği yüzünden patlamaması için sahte varsayılanlara düşülür.
// Bu dallanma YALNIZCA NODE_ENV === 'test' iken çalışır.
const TEST_CLIENT_ENV: ClientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-0123456789abcdef',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

function parseClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse(rawClientEnv)

  if (parsed.success) return parsed.data

  if (isTestEnv) {
    return {
      ...TEST_CLIENT_ENV,
      ...(rawClientEnv.NEXT_PUBLIC_SUPABASE_URL
        ? { NEXT_PUBLIC_SUPABASE_URL: rawClientEnv.NEXT_PUBLIC_SUPABASE_URL }
        : {}),
      ...(rawClientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: rawClientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY }
        : {}),
    }
  }

  throw new Error(formatEnvError('istemci', parsed.error))
}

/** Hem tarayıcıda hem sunucuda güvenle okunabilen public ortam değerleri. */
export const clientEnv: ClientEnv = parseClientEnv()

// ---------------------------------------------------------------------------
// Server env
// ---------------------------------------------------------------------------

let cachedServerEnv: ServerEnv | null = null

/**
 * Sunucu tarafı ortam değişkenleri. Modül seviyesinde önbelleklenir.
 * Tarayıcıda çağrılması hatadır — sırların istemciye sızmasını engeller.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() sunucu dışında çağrılamaz')
  }

  if (cachedServerEnv) return cachedServerEnv

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_BACKEND_URL: process.env.AI_BACKEND_URL,
    AI_BACKEND_API_KEY: process.env.AI_BACKEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
  })

  if (!parsed.success) {
    throw new Error(formatEnvError('sunucu', parsed.error))
  }

  cachedServerEnv = parsed.data
  return cachedServerEnv
}

/** Test yardımcısı: önbelleği temizler (üretim kodunda kullanılmaz). */
export function resetServerEnvCache(): void {
  cachedServerEnv = null
}
