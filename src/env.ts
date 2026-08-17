// İstemci ortam değişkenlerinin çalışma zamanı doğrulaması (zod).
//
// AC-11 (güvenlik denetimi, findings-access-control.md): sunucu şeması (`serverSchema`,
// `getServerEnv`, `resetServerEnvCache`) buradan `src/env.server.ts`'e TAŞINDI. Bu dosya artık
// YALNIZCA istemci bundle'ına girmesi güvenli olan `NEXT_PUBLIC_*` değerlerini barındırır.
// KRİTİK: bu dosya `src/env.server.ts`'i (veya `server-only` içeren başka bir modülü) ASLA
// import ETMEMELİDİR — aksi halde `server-only` istemci build'ini kırar. Sunucu env'e ihtiyaç
// duyan kod `@/env.server`'dan `getServerEnv()` import etmelidir.

import { z } from 'zod'

import { formatEnvError } from '@/env.shared'

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
})

export type ClientEnv = z.infer<typeof clientSchema>

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
