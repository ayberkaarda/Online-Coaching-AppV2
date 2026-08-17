'use client'

// Danışanın koç onayına sunduğu antrenman programları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { planToRpcPayload } from '@/hooks/usePlans'
import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
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
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface SubmitProgramForApprovalInput {
  clientId: string
  plan: WorkoutPlan
  /** Bildirimin gideceği koç id'si. Verilmezse bildirim öğrencinin kendisine düşer. */
  coachId?: string
}

export function useSubmitProgramForApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      plan,
      coachId,
    }: SubmitProgramForApprovalInput): Promise<ProgramApproval> => {
      const { data, error } = await supabase
        .from('program_approvals')
        .insert({ client_id: clientId, workout_data: planToJson(plan), status: 'pending' })
        .select()
        .single()
      if (error) throw new Error(error.message)

      // !!! BU METNİ TEK BAŞINA DEĞİŞTİRMEYİN !!!
      // Danışan -> koç bildirim metni artık sunucuda BİREBİR doğrulanıyor:
      // `notifications_guard_content()` trigger'ı (supabase/migrations/
      // 20260817160200_column_guards.sql, `c_client_to_coach_messages` dizisi)
      // yalnızca bu tam metni kabul ediyor. `title` alanı da HİÇ gönderilmemeli
      // (trigger onun NULL olmasını şart koşuyor). Metin burada değişir de o
      // migration'daki dizi güncellenmezse program gönderme akışı 42501
      // (insufficient_privilege) ile KIRILIR. Değiştirmeniz gerekiyorsa ÖNCE
      // yeni bir migration ile trigger'ı, SONRA bu satırı güncelleyin.
      const { error: notifyError } = await supabase.from('notifications').insert({
        client_id: coachId ?? clientId,
        message: '🔔 Yeni bir antrenman programı onayınıza sunuldu.',
      })
      if (notifyError) throw new Error(notifyError.message)

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
      if (planError) throw new Error(planError.message)

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
      if (approvalError) throw new Error(approvalError.message)

      const { error: notifyError } = await supabase.from('notifications').insert({
        client_id: clientId,
        message: '✅ Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.',
      })
      if (notifyError) throw new Error(notifyError.message)
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
