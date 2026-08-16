'use client'

// Danışanın koç onayına sunduğu antrenman programları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

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
  /** Onaylayan koçun id'si (`reviewed_by`). */
  reviewerId?: string
}

export function useApproveProgram() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      approvalId,
      clientId,
      plan,
      reviewerId,
    }: ApproveProgramInput): Promise<void> => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ workout_plan: JSON.stringify(plan) })
        .eq('id', clientId)
      if (profileError) throw new Error(profileError.message)

      const { error: approvalError } = await supabase
        .from('program_approvals')
        .update({
          status: 'approved',
          reviewed_by: reviewerId ?? null,
          reviewed_at: new Date().toISOString(),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      toast.success('Program onaylandı ve öğrencinin profiline işlendi.')
    },
    onError: (error: Error) => {
      toast.error(`Program onaylanamadı: ${error.message}`)
    },
  })
}
