'use client'

// Danışanın koç onayına sunduğu antrenman programları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { planToRpcPayload } from '@/hooks/usePlans'
import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { supabase } from '@/lib/supabase/client'
import type { Json, ProgramApproval, WorkoutPlan } from '@/types'

/** WorkoutPlan bir arayüz/mapped tip olduğu için Json'a açıkça daraltılır. */
function planToJson(plan: WorkoutPlan): Json {
  return plan as unknown as Json
}

export function usePendingApprovals(clientId?: string) {
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
      toast.success('Program taslağı koçuna gönderildi.')
    },
    onError: (error: Error) => {
      toast.error(`Program gönderilemedi: ${error.message}`)
    },
  })
}

export interface ApproveProgramInput {
  approvalId: string
  clientId: string
  plan: WorkoutPlan
}

export function useApproveProgram() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ approvalId, clientId, plan }: ApproveProgramInput): Promise<void> => {
      // SIRA KRİTİK: önce plan yazılır, sonra onay 'approved' işaretlenir.
      // Plan yazımı başarısız olursa onay 'pending' kalır — "onaylandı ama plan
      // işlenmedi" tutarsızlığı oluşmaz.
      //
      // `plan` bileşende `program_approvals.workout_data` jsonb'sinden
      // `parseWorkoutPlan` ile normalize edilerek gelir; `planToRpcPayload`
      // ayrıca yalnızca 7 geçerli gün anahtarını göndermeyi garanti eder.
      const { error: planError } = await supabase.rpc('save_workout_plan', {
        p_client_ids: [clientId],
        p_plan: planToRpcPayload(plan),
      })
      if (planError) throw wrapSupabaseError(planError, { table: 'save_workout_plan', op: 'rpc' })

      // `reviewed_by` / `reviewed_at` artık burada GÖNDERİLMİYOR: sunucuda
      // `program_approvals_guard_review()` trigger'ı (supabase/migrations/
      // 20260817160000_program_approval_guard.sql) bu iki alanı `auth.uid()` /
      // `now()` ile dolduruyor ve istemciden gelen HER değeri EZİYOR (AC-07).
      // Onları yine de göndermek kodu okuyanı "denetim izi istemciden geliyor"
      // diye yanıltırdı. `status: 'approved'` gönderimi KALIYOR — trigger hangi
      // dalın çalışacağına bunun eski/yeni değerine bakarak karar veriyor.
      const { error: approvalError } = await supabase
        .from('program_approvals')
        .update({
          status: 'approved',
        })
        .eq('id', approvalId)
      if (approvalError)
        throw wrapSupabaseError(approvalError, { table: 'program_approvals', op: 'update' })

      const { error: notifyError } = await supabase.from('notifications').insert({
        client_id: clientId,
        message: '✅ Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.',
      })
      if (notifyError)
        throw wrapSupabaseError(notifyError, { table: 'notifications', op: 'insert' })
    },
    onSuccess: (_result, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.programApprovals(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.workoutPlan(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      toast.success('Program onaylandı ve öğrencinin profiline işlendi.')
    },
    onError: (error: Error) => {
      toast.error(`Program onaylanamadı: ${error.message}`)
    },
  })
}
