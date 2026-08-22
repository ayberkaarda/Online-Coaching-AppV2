// Outbox motorunun REACT sürücüsü — "İmza Dilimi" Tur 2 C4.
//
// Providers ağacında (QueryClientProvider içinde, supabase erişimi için) bir kez
// mount edilir; hiçbir şey RENDER ETMEZ (null). Görevleri:
//   • Mount'ta `initQueue()` + ilk flush (CRASH RECOVERY: önceki oturumdan kalan
//     pending create_session/create_set/complete_session bu ilk flush'ta drenajlanır).
//   • `AppState` 'active' (foreground'a dönüş) → backoff sıfırla + flush.
//   • `requestFlush()` (enqueue sonrası / rozete dokunma) → hemen flush.
//   • pending>0 kaldıkça EXPONENTIAL BACKOFF ile retry (2s,4s,…,60s tavan).
// Online tespiti YOK (NetInfo yok): flush = dene → hata → backoff → foreground /
// manuel tetikleyici. C1 fonksiyonları idempotent olduğu için tekrar denemeler
// güvenlidir.

import {
  completeWorkoutSession,
  insertWorkoutSession,
  insertWorkoutSetIdempotent,
  type CompleteWorkoutSessionInput,
  type WorkoutLogInsert,
  type WorkoutSessionInsert,
} from '@repo/api-client/api/workout-session'
import { useSupabaseClient } from '@repo/api-client/context'
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { flushQueue, type OpHandlers } from './engine'
import { initQueue, markFailed, markSynced, pendingCount, pendingItems } from './queue'
import { onFlushRequest, refreshPendingCount } from './syncStore'

const BACKOFF_BASE_MS = 2000
const BACKOFF_MAX_MS = 60000

/** op→C1-fonksiyon eşlemesi (AC-2.4: supabase.from motor içinde YOK, C1'de). */
const opHandlers: OpHandlers = {
  create_session: (supabase, payload) =>
    insertWorkoutSession(supabase, payload as WorkoutSessionInsert),
  create_set: (supabase, payload) =>
    insertWorkoutSetIdempotent(supabase, payload as WorkoutLogInsert),
  complete_session: (supabase, payload) =>
    completeWorkoutSession(supabase, payload as CompleteWorkoutSessionInput),
}

export function SyncEngine(): null {
  const supabase = useSupabaseClient()

  // Yeniden render'a karşı sabit tutulacak zamanlayıcı/kilit/backoff durumu.
  const flushingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    function clearTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    function scheduleRetry(): void {
      clearTimer()
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** attemptRef.current, BACKOFF_MAX_MS)
      attemptRef.current += 1
      timerRef.current = setTimeout(() => {
        void runFlush()
      }, delay)
    }

    async function runFlush(): Promise<void> {
      if (cancelled || flushingRef.current) return
      if (pendingCount() === 0) {
        clearTimer()
        attemptRef.current = 0
        refreshPendingCount()
        return
      }
      flushingRef.current = true
      try {
        const result = await flushQueue(supabase, {
          pendingItems,
          markSynced,
          markFailed,
          handlers: opHandlers,
        })
        refreshPendingCount()
        if (result.failed || result.remaining > 0) {
          scheduleRetry() // hâlâ pending → backoff ile yeniden dene
        } else {
          clearTimer()
          attemptRef.current = 0
        }
      } finally {
        flushingRef.current = false
      }
    }

    /** Dış tetikleyici (enqueue / rozet): backoff'u sıfırla, hemen dene. */
    function flushNow(): void {
      attemptRef.current = 0
      void runFlush()
    }

    // 1) Mount: tabloyu kur, sayacı tazele, ilk flush (crash recovery drenajı).
    initQueue()
    refreshPendingCount()
    flushNow()

    // 2) Foreground'a dönüşte flush (online olma ihtimali en yüksek an).
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') flushNow()
    })

    // 3) enqueue sonrası / rozete dokunma → hemen flush.
    const unregister = onFlushRequest(flushNow)

    return () => {
      cancelled = true
      clearTimer()
      appStateSub.remove()
      unregister()
    }
  }, [supabase])

  return null
}
