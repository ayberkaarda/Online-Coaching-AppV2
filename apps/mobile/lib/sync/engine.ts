// Outbox FLUSH motoru — saf, React'siz, test edilebilir. "İmza Dilimi" Tur 2 C4.
//
// ─────────────────────────────────────────────────────────────────────────────
// AC-2.4 KANITI: burada `supabase.from(`/`supabase.rpc(` YOKTUR
// ─────────────────────────────────────────────────────────────────────────────
// Motor kendi Supabase erişimini KURMAZ; C1'in dışa açık saf fonksiyonlarını
// (`insertWorkoutSession` vb.) çağıran HANDLER'ları enjekte alır. `supabase.from`
// yalnızca `packages/api-client` içinde geçer (AC-2.4). Handler eşlemesi (op→fn)
// enjekte edildiği için bu modül api-client'ı RUNTIME'da import etmez — yalnızca
// tip import'ları (derlemede silinir), böylece bu dosya native/expo-sqlite yükü
// olmadan Node'da unit test edilebilir.
//
// FIFO + STOP-ON-FAILURE: öğeler id ASC işlenir; ilk hatada DURULUR. Böylece
// `create_session` başarısız olursa ona bağlı `create_set`'ler denenmez (FK), ve
// sıra korunur — sonraki flush baştan (aynı başarısız öğeden) devam eder.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@repo/types'

import type { QueueItem, SyncOp } from './queue'

/** Bir op'u işleyen fonksiyon — payload çözülmüş (parse edilmiş) hâlde alır. */
export type OpHandler = (supabase: SupabaseClient<Database>, payload: unknown) => Promise<unknown>

/** op→handler saf eşlemesi. SyncEngine.tsx gerçek C1 fonksiyonlarını enjekte eder. */
export type OpHandlers = Record<SyncOp, OpHandler>

/**
 * TEK bir kuyruk öğesini işler: op'a göre handler seç, payload'u JSON.parse et,
 * çağır. Saf ve mock'lanabilir — op→fn eşlemesinin doğruluğu burada test edilir.
 */
export async function dispatchItem(
  supabase: SupabaseClient<Database>,
  item: Pick<QueueItem, 'op' | 'payload'>,
  handlers: OpHandlers
): Promise<void> {
  const handler = handlers[item.op]
  if (!handler) throw new Error(`Bilinmeyen sync op: ${String(item.op)}`)
  await handler(supabase, JSON.parse(item.payload))
}

/** `flushQueue`'nun enjekte bağımlılıkları — kuyruk deposu + handler eşlemesi. */
export interface FlushDeps {
  pendingItems: () => QueueItem[]
  markSynced: (id: number) => void
  markFailed: (id: number) => void
  handlers: OpHandlers
}

export interface FlushResult {
  /** Bu turda başarıyla senkronlanan öğe sayısı. */
  synced: number
  /** İlk hatada durulduysa geriye kalan (işlenmemiş) öğe sayısı. */
  remaining: number
  /** Bu turda bir hata olduysa (stop-on-failure tetiklendi). */
  failed: boolean
}

/**
 * Bekleyen öğeleri FIFO işler. Başarı → `markSynced`. Hata → `markFailed` +
 * **o öğede DUR** (backoff'u SyncEngine yönetir; sıradaki flush baştan dener).
 */
export async function flushQueue(
  supabase: SupabaseClient<Database>,
  deps: FlushDeps
): Promise<FlushResult> {
  const items = deps.pendingItems()
  let synced = 0
  for (const item of items) {
    try {
      await dispatchItem(supabase, item, deps.handlers)
      deps.markSynced(item.id)
      synced += 1
    } catch {
      // Bu öğe hâlâ pending kalır; sayaç artar. FIFO garantisi için DUR.
      deps.markFailed(item.id)
      return { synced, remaining: items.length - synced, failed: true }
    }
  }
  return { synced, remaining: 0, failed: false }
}
