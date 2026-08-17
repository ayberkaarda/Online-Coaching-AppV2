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

const serverSchema = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    AI_BACKEND_URL: z.string().url().default('http://localhost:8000'),
    AI_BACKEND_API_KEY: z.string().optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
    // A-02 (güvenlik denetimi, findings-app-surface.md §3.2): `src/proxy.ts` hız sınırlayıcısı
    // `X-Forwarded-For`/`X-Real-IP` başlıklarını sorgusuz kabul ediyordu; istemci bu başlıkları
    // serbestçe ayarlayabildiği için sınırlayıcı tamamen atlanabiliyordu (canlı kanıt: dönen XFF
    // ile 25/25 istek kabul edildi). Kaç GÜVENİLEN ters proxy'nin XFF zincirine kendi gördüğü
    // IP'yi eklediğini belirtir; sondan bu kadar hop güvenilir sayılır (bkz. `src/proxy.ts`
    // `getClientIp`). VARSAYILAN 0'DIR — yapılandırılmamışsa hiçbir başlığa güvenilmez
    // (güvenli varsayılan): sahte başlıkla sınırsız kova üretmek, aşırı sıkı paylaşılan bir
    // kovadan daha kötüdür. Tek-hop güvenilir bir edge'in (ör. Vercel) arkasında 1 yapın.
    TRUSTED_PROXY_COUNT: z.coerce.number().int().nonnegative().default(0),
  })
  .superRefine((env, ctx) => {
    // A-12 (güvenlik denetimi, findings-app-surface.md §3.4/§7 Grup 1): `AI_BACKEND_API_KEY`
    // production'da opsiyonel bırakılırsa, ai_backend tarafındaki A-04 (anahtar ayarlanmamışsa
    // guard'ın no-op/fail-open olması) ile birleşip her iki uç da SESSİZCE kimliksiz çalışır.
    // Prod'da eksikse build/başlangıçta anlaşılır bir hatayla fail-fast et; dev/test'te
    // opsiyonel kalır (aksi halde mevcut test zinciri kırılır).
    if (env.NODE_ENV === 'production' && !env.AI_BACKEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_BACKEND_API_KEY'],
        message:
          'Production ortamında AI_BACKEND_API_KEY zorunludur. ai_backend servisinin API_KEY ' +
          "ortam değişkeniyle aynı değeri ayarlayın; aksi halde AI backend guard'ı kimliksiz " +
          'isteklere açık kalabilir (bkz. docs/security/findings-app-surface.md A-04/A-12).',
      })
    }
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
    TRUSTED_PROXY_COUNT: process.env.TRUSTED_PROXY_COUNT,
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
