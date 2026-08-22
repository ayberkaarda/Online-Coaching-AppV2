'use client'

// Offline-öncelikli antrenman OTURUMU (workout_sessions) + periyodizasyon
// (mesocycles) — "İmza Dilimi" Tur 2 C1 (saf-online veri katmanı).
//
// Şema: supabase/migrations/20260821120000_bb_signature_slice.sql.
//
// SÖZLEŞME: mutasyon GÖVDELERİ burada YOKTUR — `../api/workout-session.ts`
// içindeki dışa açık saf fonksiyonları (`insertWorkoutSession`,
// `completeWorkoutSession`, `insertWorkoutSetIdempotent`) `useMutation`
// `mutationFn` ile sarar (bkz. `useAi.ts` deseni). Bu ayrım BİLİNÇLİDİR:
// mobil offline-engine (sonraki checkpoint) aynı fonksiyonları bir
// kuyruk/flush döngüsünden, React'siz, İMPERATİF çağıracak — hook'a
// kilitlenselerdi bu mümkün olmazdı.
//
// `workout_logs.set_type` gibi tekil-set alanları için AYRI bir hook YOK:
// `useWorkoutLogs.ts::useWorkoutLogs` zaten TÜM setleri (`client_id` bazlı,
// oturum farkı gözetmeden) okur; bu dosya yalnızca OTURUM KONTEYNERİNİ
// (`workout_sessions`) ve PERİYODİZASYONU (`mesocycles`) ekler.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  completeWorkoutSession,
  insertWorkoutSession,
  insertWorkoutSetIdempotent,
  type CompleteWorkoutSessionInput,
  type WorkoutLogInsert,
  type WorkoutSession,
  type WorkoutSessionInsert,
} from '../api/workout-session'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import { queryKeyRoots, queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import type { Tables, TablesInsert } from '@repo/types'

// #############################################################################
// ## MESOCYCLES — periyodizasyon (koç-CRUD MİNİMUM; okuma öncelikli)         ##
// #############################################################################

/**
 * `mesocycles` satırı — DB kolon adlarıyla (domain'in `MesocycleSpec`'i
 * camelCase'tir: `name/weeks/deloadWeek/goal`; bu satır `id`/`plan_id`/
 * `position` gibi CRUD için gereken kimlik alanlarını da taşır, bu yüzden
 * bilerek `MesocycleSpec`'e daraltılmadan DÜZ okunur).
 */
export type MesocycleRow = Tables<'mesocycles'>

/**
 * Mezosiklüleri `position` sırasına göre dizer. SAF fonksiyon.
 *
 * Sunucu tarafında `.order('position', { foreignTable: 'mesocycles' })`
 * KULLANILMAZ: iç içe (nested) `select` üzerinde ilişkili tablo sıralaması
 * `usePlans.ts`/`useWorkoutSession.ts`'teki mevcut desenle TUTARSIZ olurdu —
 * onlar da `position`'ı İSTEMCİDE sıralar (bkz. `rowsToSessionExercises`).
 */
export function sortMesocyclesByPosition(
  rows: readonly MesocycleRow[] | null | undefined
): MesocycleRow[] {
  if (!rows || rows.length === 0) return []
  return rows.slice().sort((a, b) => a.position - b.position)
}

/**
 * Aktif planın mezosiklüleri. `useWorkoutPlanExercises` ile AYNI desen:
 * `clientId` -> aktif `workout_plans` satırı -> iç içe `mesocycles(*)`.
 */
export function useMesocycles(clientId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.mesocycles(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<MesocycleRow[]> => {
      const { data, error } = await supabase
        .from('workout_plans')
        .select('id, mesocycles(*)')
        .eq('client_id', clientId ?? '')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw wrapSupabaseError(error, { table: 'workout_plans', op: 'select' })
      return sortMesocyclesByPosition(data?.mesocycles)
    },
  })
}

/**
 * TEK bir mezosiklüyü kaydeder (yeni/güncelleme — `id` verilirse günceller).
 *
 * MİNİMUM koç-CRUD: tam `save_workout_plan` RPC'sindeki gibi toplu
 * "sil-ve-yeniden-yaz" YOKTUR (bu dilimde gerekmiyor); tek satırlık `upsert`
 * yeterlidir. Toplu mezosiklü yeniden sıralama/silme sonraki bir işin konusu.
 */
export function useSaveMesocycle() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TablesInsert<'mesocycles'>): Promise<MesocycleRow> => {
      const { data, error } = await supabase.from('mesocycles').upsert(input).select().single()
      if (error) throw wrapSupabaseError(error, { table: 'mesocycles', op: 'upsert' })
      return data
    },
    onSuccess: () => {
      // Satır yalnızca `plan_id` taşır, `client_id` taşımaz (sahiplik plandan
      // TÜRETİLİR — bkz. migration). Hangi danışanın önbelleği etkilendiği tek
      // satırdan bilinemez; kök ön ekle TÜM `mesocycles` önbelleği bayatlanır.
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.mesocycles })
      notify.success('Mezosiklü kaydedildi.')
    },
    onError: (error: Error) => {
      notify.error(`Mezosiklü kaydedilemedi: ${error.message}`)
    },
  })
}

// #############################################################################
// ## WORKOUT_SESSIONS — offline oturum konteyneri                            ##
// #############################################################################

/**
 * Bir danışanın TAMAMLANMIŞ antrenman oturumları (`ended_at` dolu), en
 * yeniden eskiye. Soft-delete edilmiş (`deleted_at` dolu) satırlar RLS
 * tarafından FİLTRELENMEZ (bkz. migration yorumu: "gizleme uygulama
 * sorumluluğudur") — burada `deleted_at is null` ile elenir.
 */
export function useWorkoutSessions(clientId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.workoutSessions(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<WorkoutSession[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('client_id', clientId ?? '')
        .is('deleted_at', null)
        .not('ended_at', 'is', null)
        .order('ended_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'workout_sessions', op: 'select' })
      return data
    },
  })
}

/**
 * Yeni bir antrenman oturumu başlatır — gövdesi `insertWorkoutSession`
 * (İDEMPOTENT, bkz. o dosyanın başlığı). `id` ÇAĞIRAN tarafından üretilir.
 *
 * BİLEREK başarı toast'ı YOK: oturum başlatma sıradan bir arka plan/navigasyon
 * adımıdır (gym moduna girişte otomatik tetiklenir) ve offline flush'ta
 * İDEMPOTENT retry'lar sessizce tekrar çağrılabilir — her denemede toast
 * gürültü üretirdi. Hata her zaman bildirilir.
 */
export function useStartWorkoutSession() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (row: WorkoutSessionInsert) => insertWorkoutSession(supabase, row),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions(session.client_id) })
    },
    onError: (error: Error) => {
      notify.error(`Antrenman oturumu başlatılamadı: ${error.message}`)
    },
  })
}

export type CompleteWorkoutSessionVariables = CompleteWorkoutSessionInput

/**
 * Bir antrenman oturumunu bitirir — gövdesi `completeWorkoutSession`.
 *
 * `clientId` HOOK PARAMETRESİDİR (mutasyon değişkeni değil) — tıpkı
 * `useMessages.ts::useMarkConversationRead(clientId)` deseninde olduğu gibi:
 * `completeWorkoutSession`'ın girdisinde `client_id` YOK (yalnızca `id`), bu
 * yüzden hangi danışanın oturum listesinin bayatlatılacağı çağıran taraftan
 * kapanış (closure) ile alınır.
 */
export function useCompleteWorkoutSession(clientId?: string) {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CompleteWorkoutSessionVariables) => completeWorkoutSession(supabase, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions(clientId) })
      notify.success('Antrenman tamamlandı.')
    },
    onError: (error: Error) => {
      notify.error(`Antrenman tamamlanamadı: ${error.message}`)
    },
  })
}

// #############################################################################
// ## WORKOUT_LOGS (set) — İDEMPOTENT tekil set yazımı                        ##
// #############################################################################

/**
 * TEK bir seti İDEMPOTENT yazar — gövdesi `insertWorkoutSetIdempotent`.
 * Başarı toast'ı/invalidate `useWorkoutLogs.ts::useCreateWorkoutLog` deseniyle
 * BİREBİR aynıdır (görev sözleşmesi gereği).
 */
export function useCreateWorkoutSet() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (row: WorkoutLogInsert) => insertWorkoutSetIdempotent(supabase, row),
    onSuccess: (_void, row) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutLogs(row.client_id) })
      notify.success('Set kaydedildi.')
    },
    onError: (error: Error) => {
      notify.error(`Set kaydedilemedi: ${error.message}`)
    },
  })
}
