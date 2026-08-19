'use client'

// Danışanın koç onayına sunduğu antrenman programları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { planToRpcPayload } from './usePlans'
import { queryKeyRoots, queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import type { Json, ProgramApproval, WorkoutPlan } from '@repo/types'

/** WorkoutPlan bir arayüz/mapped tip olduğu için Json'a açıkça daraltılır. */
function planToJson(plan: WorkoutPlan): Json {
  return plan as unknown as Json
}

export function usePendingApprovals(clientId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.programApprovals(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ProgramApproval[]> => {
      const { data, error } = await supabase
        .from('program_approvals')
        .select('*')
        .eq('client_id', clientId ?? '')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'program_approvals', op: 'select' })
      return data
    },
  })
}

export interface SubmitProgramForApprovalInput {
  clientId: string
  plan: WorkoutPlan
}

export function useSubmitProgramForApproval() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      plan,
    }: SubmitProgramForApprovalInput): Promise<ProgramApproval> => {
      // TEK ÇAĞRI, ATOMİK: onay satırı + koça giden bildirim aynı sunucu
      // fonksiyonunda yazılır. Bildirim metni ARTIK BURADA YOK — tek sahibi
      // RPC gövdesindeki `c_coach_notification` sabitidir. (Eskiden metin hem
      // burada hem `notifications_guard_content()` trigger'ında yaşıyordu;
      // biri diğerinden bağımsız değişirse akış 42501 ile kırılıyordu —
      // docs/security/AUDIT.md §4b'de kayıtlı borç, bu turda kapatıldı.)
      //
      // Onay kapısı (AC-01) ATLANMIYOR: RPC `SECURITY DEFINER` olsa da
      // `program_approvals_guard_review()` bir TRIGGER'dır ve BYPASSRLS'ten
      // etkilenmez; bu INSERT'te de ateşlenip status/reviewed_* alanlarını
      // doğrular. Sahiplik (`p_client_id = auth.uid()`) RPC gövdesinde elle
      // kontrol edilir.
      const { data, error } = await supabase.rpc('submit_program_for_approval', {
        p_client_id: clientId,
        p_workout_data: planToJson(plan),
      })
      if (error) throw wrapSupabaseError(error, { table: 'submit_program_for_approval', op: 'rpc' })
      if (!data) throw new Error('Program gönderildi ama onay kaydı okunamadı.')

      return data
    },
    onSuccess: (_approval, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.programApprovals(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      notify.success('Program taslağı koçuna gönderildi.')
    },
    onError: (error: Error) => {
      notify.error(`Program gönderilemedi: ${error.message}`)
    },
  })
}

export interface ApproveProgramInput {
  approvalId: string
  clientId: string
  plan: WorkoutPlan
}

export function useApproveProgram() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ approvalId, clientId, plan }: ApproveProgramInput): Promise<void> => {
      // TEK ÇAĞRI, ATOMİK (B-019): plan yazımı + onayın 'approved' işaretlenmesi
      // + danışana giden bildirim aynı sunucu fonksiyonunun gövdesinde, yani TEK
      // TRANSAKSİYONDA olur. Eskiden bu üç iş üç ayrı ağ çağrısıydı ve ikincisi
      // ya da üçüncüsü düştüğünde yarım durum KALICI oluyordu ("plan yazıldı ama
      // onay hâlâ pending", "onaylandı ama danışan habersiz"). İstemcinin geri
      // alabileceği bir yol da yoktu.
      //
      // Bildirim metni ARTIK BURADA YOK — tek sahibi RPC gövdesindeki
      // `c_client_notification` sabitidir. `reviewed_by`/`reviewed_at` de
      // gönderilmez: sunucuda `program_approvals_guard_review()` trigger'ı
      // (20260817160000) bu iki alanı `auth.uid()`/`now()` ile doldurur (AC-07).
      // RPC `SECURITY INVOKER`dır: yetki modeli değişmedi, üç yazma da koçun
      // kimliğiyle ve RLS açıkken yapılır.
      //
      // `plan` bileşende `program_approvals.workout_data` jsonb'sinden
      // `parseWorkoutPlan` ile normalize edilerek gelir; `planToRpcPayload`
      // ayrıca yalnızca 7 geçerli gün anahtarını göndermeyi garanti eder.
      const { error } = await supabase.rpc('approve_program', {
        p_approval_id: approvalId,
        p_client_id: clientId,
        p_plan: planToRpcPayload(plan),
      })
      if (error) throw wrapSupabaseError(error, { table: 'approve_program', op: 'rpc' })
    },
    onSuccess: (_result, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.programApprovals(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutPlan(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      notify.success('Program onaylandı ve danışanın profiline işlendi.')
    },
    onError: (error: Error) => {
      notify.error(`Program onaylanamadı: ${error.message}`)
    },
  })
}
