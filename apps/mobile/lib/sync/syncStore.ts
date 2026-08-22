// Rozet kaynağı + flush-tetikleyici köprüsü — "İmza Dilimi" Tur 2 C4.
//
// İki minik yayın (pub/sub) burada birleşir:
//   1) Bekleyen sayısı: `useSyncExternalStore` ile UI (rozet) okur. enqueue ve
//      her flush sonrası `refreshPendingCount()` çağrılır.
//   2) Flush isteği: ekran yeni öğe eklediğinde ya da rozete dokunulduğunda
//      `requestFlush()` çağırır; SyncEngine `onFlushRequest` ile dinler ve
//      hemen (backoff'u sıfırlayarak) flush eder. NetInfo YOK — "şimdi dene".
//
// Neden context değil modül-seviyesi store: enqueue React ağacı DIŞINDAN (saf
// `logSet` gövdesi) da tetiklenebilmeli; global bir observable en yalın yol.

import { useSyncExternalStore } from 'react'

import { pendingCount } from './queue'

// ── Bekleyen sayısı observable ───────────────────────────────────────────────
let current = 0
const countListeners = new Set<() => void>()

function emitCount(): void {
  for (const listener of countListeners) listener()
}

/** Kuyruğu okuyup yayınlanan bekleyen sayısını tazeler (enqueue/flush sonrası). */
export function refreshPendingCount(): void {
  const next = pendingCount()
  if (next !== current) {
    current = next
    emitCount()
  }
}

function subscribeCount(listener: () => void): () => void {
  countListeners.add(listener)
  return () => countListeners.delete(listener)
}

function getCountSnapshot(): number {
  return current
}

/** Rozet hook'u — `usePendingSyncCount() > 0` iken "Senkron bekliyor (n)" gösterilir. */
export function usePendingSyncCount(): number {
  return useSyncExternalStore(subscribeCount, getCountSnapshot, getCountSnapshot)
}

// ── Flush isteği köprüsü ─────────────────────────────────────────────────────
let flushHandler: (() => void) | null = null

/** SyncEngine flush fonksiyonunu kaydeder; kayıt kaldırıcıyı döndürür. */
export function onFlushRequest(handler: () => void): () => void {
  flushHandler = handler
  return () => {
    if (flushHandler === handler) flushHandler = null
  }
}

/** "Şimdi flush et" — enqueue sonrası ve rozete dokununca çağrılır. */
export function requestFlush(): void {
  flushHandler?.()
}
