// Supabase/PostgREST sorgu hatalarını `.code` alanını KORUYARAK fırlatmak için yardımcı.
//
// SORUN (A-10 kalanı, bkz. docs/security/AUDIT.md §4c "Kayıtlı borçlar"): `packages/api-client/src/hooks/**`
// içindeki her çağrı noktası bugüne kadar `throw new Error(error.message)` yazıyordu — bu, düz
// bir `Error` ürettiği için Supabase'in PostgREST hata nesnesindeki `.code` alanını (RLS reddinde
// `42501`) SESSİZCE ATIYORDU. `@repo/api-client/query/queryClient` içindeki merkezi
// `QueryCache`/`MutationCache` `onError` kancası `42501`'i tespit edebilsin diye, hook'lar artık
// `throw new Error(error.message)` yerine `throw wrapSupabaseError(error, { table, op })`
// kullanır. `.message` BİREBİR AYNI kalır (bkz. constructor) — bu yüzden mevcut `toast.error`
// metinleri DEĞİŞMEZ, yalnızca hatanın taşıdığı bilgi zenginleşir.
export class SupabaseQueryError extends Error {
  /** PostgREST/Postgres hata kodu (ör. `42501` = insufficient_privilege / RLS reddi). */
  readonly code?: string
  /** Sorgunun hedef tablosu, biliniyorsa (ör. `'daily_logs'`). RPC çağrılarında fonksiyon adı. */
  readonly table?: string
  /** İşlem türü, biliniyorsa. */
  readonly op?: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | 'rpc'

  constructor(
    error: { message: string; code?: string },
    context?: { table?: string; op?: SupabaseQueryError['op'] }
  ) {
    super(error.message)
    this.name = 'SupabaseQueryError'
    this.code = error.code
    this.table = context?.table
    this.op = context?.op

    // TS'in Error alt sınıfı tuzağı: prototip zincirini elle düzelt.
    Object.setPrototypeOf(this, SupabaseQueryError.prototype)
  }
}

/**
 * `throw new Error(error.message)` yerine kullanılacak tek satırlık yardımcı.
 * Dönen değer FIRLATILMAZ, çağıran `throw wrapSupabaseError(...)` yazmalıdır — böylece
 * TypeScript'in "bu dal hiçbir zaman dönmüyor" akış analizinden faydalanılır.
 */
export function wrapSupabaseError(
  error: { message: string; code?: string },
  context?: { table?: string; op?: SupabaseQueryError['op'] }
): SupabaseQueryError {
  return new SupabaseQueryError(error, context)
}
