/**
 * Supabase `{ data, error }` sonucunu açar; hata varsa fırlatır.
 * Query/Mutation hook'larında hata durumlarının sessizce yutulmasını engeller.
 *
 * Faz 4.5 commit 5 (ADR-0024 "Sonuçlar"): bu yardımcı eskiden
 * `apps/web/src/lib/supabase/client.ts` içindeydi ama istemciye HİÇ bağlı değil — bu yüzden
 * pakete taşınırken context'ten bağımsız, düz bir fonksiyon olarak korundu.
 */
export function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
