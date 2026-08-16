import 'server-only'

// RLS'yi bypass eden servis rolü istemcisi. YALNIZCA sunucu tarafında kullanılır.
// `server-only` importu sayesinde istemci bileşeninden import edilirse build kırılır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { clientEnv, getServerEnv } from '@/env'
import type { Database } from '@/types/database'

let adminClient: SupabaseClient<Database> | null = null

/**
 * Servis rolü anahtarıyla oluşturulmuş Supabase istemcisi.
 * Anahtar tanımlı değilse açıklayıcı hata fırlatır.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (adminClient) return adminClient

  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Yönetici işlemleri için bu anahtar zorunludur; ' +
        '.env.local dosyanıza ekleyin (bu anahtar asla istemciye gönderilmemelidir).',
    )
  }

  adminClient = createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
