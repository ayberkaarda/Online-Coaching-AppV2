// Tarayıcı (ve genel amaçlı) Supabase istemcisi — anon key ile, RLS altında çalışır.
// Modül seviyesinde tekil (singleton) tutulur: her render'da yeni bağlantı açılmaz.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { clientEnv } from '@/env'
import type { Database } from '@/types/database'

let browserClient: SupabaseClient<Database> | null = null

/** Tarayıcı tarafı Supabase istemcisi (singleton). */
export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient

  browserClient = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  )

  return browserClient
}

/** Geriye dönük uyumlu kısayol: `import { supabase } from '@/lib/supabase'`. */
export const supabase: SupabaseClient<Database> = createBrowserSupabaseClient()

/**
 * Supabase `{ data, error }` sonucunu açar; hata varsa fırlatır.
 * Query/Mutation hook'larında hata durumlarının sessizce yutulmasını engeller.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
