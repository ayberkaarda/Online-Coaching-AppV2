import 'server-only'

// Server Component / Route Handler için anon key'li Supabase istemcisi.
// Oturum saklamaz; istenirse kullanıcının access token'ı ile RLS bağlamında çalışır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { clientEnv } from '@/env'
import type { Database } from '@/types/database'

/**
 * @param accessToken Kullanıcının Supabase access token'ı. Verilirse istekler
 *                    o kullanıcının kimliğiyle (RLS altında) çalışır.
 */
export function createServerSupabaseClient(accessToken?: string): SupabaseClient<Database> {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    },
  )
}
