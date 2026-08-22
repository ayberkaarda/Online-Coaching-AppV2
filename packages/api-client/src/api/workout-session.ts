// Offline-öncelikli antrenman oturumu + set yazma katmanı — "İmza Dilimi" Tur 2 C1.
//
// Şema sözleşmesi: supabase/migrations/20260821120000_bb_signature_slice.sql.
// AC-2.4: `supabase.from(`/`supabase.rpc(` YALNIZ `packages/api-client` içinde geçebilir.
//
// NEDEN DIŞA AÇIK SAF FONKSİYON (hook DEĞİL) — ADR-0024 Ek-1 deseni
// (bkz. `useMessages.ts::fetchCoachId`, `api/ai.ts::getAuthHeaders`):
//   Mobil offline-engine (sonraki checkpoint) bu fonksiyonları React'siz,
//   bir kuyruk/flush döngüsünden İMPERATİF çağıracak. Hook olsaydı bu mümkün
//   olmazdı. `hooks/useWorkoutSessions.ts` bu fonksiyonları TanStack Query
//   `mutationFn` ile sarar; web tarafı yalnızca o hook'ları kullanır.
//
// #############################################################################
// ## OFFLINE IDEMPOTENCY — İKİ FARKLI TEKNİK, İKİ FARKLI SEBEP                ##
// #############################################################################
//   (a) workout_sessions -> `.upsert(row, { onConflict: 'id', ignoreDuplicates: true })`.
//       `id` PRIMARY KEY'dir (kısmi DEĞİL) — Postgres'in ON CONFLICT arbiter
//       çıkarımı düz birincil anahtar indeksini sorunsuz eşler.
//   (b) workout_logs -> DÜZ `insert` + 23505'i no-op say.
//       `workout_logs_client_mutation_uniq` KISMİ bir indekstir
//       (`unique (client_id, client_mutation_id) where client_mutation_id is not null`).
//       Postgres'in ON CONFLICT belgelenmiş kuralı: kısmi bir indeks yalnızca
//       ON CONFLICT'in KENDİ `WHERE` yüklemi belirtilip indeksinkiyle EŞLEŞİRSE
//       arbiter seçilir (aksi hâlde "there is no unique or exclusion constraint
//       matching the ON CONFLICT specification" / 42P10). PostgREST'in JS
//       istemcisindeki `.upsert(..., { onConflict })` seçeneği yalnızca kolon
//       listesi üretir, bir `WHERE` yüklemi EKLEYEMEZ — yani
//       `.upsert(row, { onConflict: 'client_id,client_mutation_id' })` GERÇEK
//       bir çakışma olsun ya da olmasın HER ÇAĞRIDA 42P10 ile patlardı (arbiter
//       hiç bulunamaz). Bu yüzden (a)'daki upsert deseni BURADA TEKRARLANMAZ;
//       onun yerine düz `insert` kullanılır ve `workout_logs_client_mutation_uniq`
//       ikinci gönderimi 23505 (unique_violation) ile reddettiğinde bu no-op
//       sayılır — `supabase/tests/rls.test.sql` [158b] senaryosuyla birebir aynı
//       ret mekanizması, yalnızca istemci tarafında "başarı" olarak yorumlanır.
//       (`ignoreDuplicates: true` ile AYNI dışa dönük semantik: ikinci flush veri
//       çoğaltmaz, hata da fırlatmaz.)

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, TablesInsert, Tables } from '@repo/types'

import { wrapSupabaseError } from '../query/supabase-error'

export type WorkoutSession = Tables<'workout_sessions'>
export type WorkoutLogRow = Tables<'workout_logs'>

/**
 * `insertWorkoutSession`'ın girdisi. `id` (temel `TablesInsert`'te opsiyonel)
 * burada ZORUNLUDUR: sözleşme gereği kimlik İSTEMCİDE üretilir (çağıran, ör.
 * `crypto.randomUUID()`) — offline set'ler ack beklemeden bu id'yi referans
 * alabilsin diye.
 */
export type WorkoutSessionInsert = TablesInsert<'workout_sessions'> & { id: string }

/**
 * Bir antrenman oturumunu YAZAR — İDEMPOTENT.
 *
 * Aynı `id` ile ikinci çağrı (flush retry: "session gitti, set giderken koptu")
 * PK çakışmasında NO-OP'tur; bu fonksiyon yine de oturumun güncel satırını
 * döndürür (ilk yazımda upsert'in kendi `RETURNING`'i, tekrar çağrıda ayrı bir
 * `select`).
 */
export async function insertWorkoutSession(
  supabase: SupabaseClient<Database>,
  row: WorkoutSessionInsert
): Promise<WorkoutSession> {
  const { data, error } = await supabase
    .from('workout_sessions')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
    .select()
    .maybeSingle()
  if (error) throw wrapSupabaseError(error, { table: 'workout_sessions', op: 'upsert' })
  if (data) return data

  // `ignoreDuplicates: true` + PK çakışması -> PostgREST `DO NOTHING RETURNING *`
  // üretir; çakışan satır için RETURNING SIFIR satır verir (satır zaten
  // YAZILMIŞTI). Çağıran yine de oturumun KENDİSİNİ bekler — aynı id ile
  // mevcut satırı ayrıca çekeriz.
  const { data: existing, error: fetchError } = await supabase
    .from('workout_sessions')
    .select()
    .eq('id', row.id)
    .single()
  if (fetchError) throw wrapSupabaseError(fetchError, { table: 'workout_sessions', op: 'select' })
  return existing
}

export interface CompleteWorkoutSessionInput {
  id: string
  ended_at: string
  perceived_difficulty?: number | null
  notes?: string | null
}

/** Bir antrenman oturumunu bitirir (`ended_at` damgalanır). */
export async function completeWorkoutSession(
  supabase: SupabaseClient<Database>,
  { id, ended_at, perceived_difficulty, notes }: CompleteWorkoutSessionInput
): Promise<void> {
  const update: Pick<
    TablesInsert<'workout_sessions'>,
    'ended_at' | 'perceived_difficulty' | 'notes'
  > = { ended_at }
  if (perceived_difficulty !== undefined) update.perceived_difficulty = perceived_difficulty
  if (notes !== undefined) update.notes = notes

  const { error } = await supabase.from('workout_sessions').update(update).eq('id', id)
  if (error) throw wrapSupabaseError(error, { table: 'workout_sessions', op: 'update' })
}

/** `insertWorkoutSetIdempotent`'in girdisi — `workout_logs` satırının tamamı. */
export type WorkoutLogInsert = TablesInsert<'workout_logs'>

/**
 * TEK bir seti `workout_logs`'a İDEMPOTENT yazar.
 *
 * Neden `upsert` DEĞİL: yukarıdaki dosya başı nottaki (b) — arbiter kısmi
 * indeks. Düz `insert` + 23505 no-op deseni kullanılır.
 */
export async function insertWorkoutSetIdempotent(
  supabase: SupabaseClient<Database>,
  row: WorkoutLogInsert
): Promise<void> {
  const { error } = await supabase.from('workout_logs').insert(row)
  if (error) {
    // 23505 = unique_violation. `workout_logs_client_mutation_uniq` aynı
    // (client_id, client_mutation_id) ikinci gönderimini burada reddeder —
    // bu, "zaten yazılmış" anlamına gelir ve `ignoreDuplicates` ile AYNI dışa
    // dönük sonucu (sessiz no-op) üretir.
    if (error.code === '23505') return
    throw wrapSupabaseError(error, { table: 'workout_logs', op: 'insert' })
  }
}
