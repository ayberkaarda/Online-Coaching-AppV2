'use client'

// Form check (haftalık kilo + poz fotoğrafı) hook'ları.
// Fotoğraflar `form-checks-media` bucket'ında `poses/<uid>-<uuid>.<ext>` yoluna yüklenir;
// storage RLS politikaları tam olarak bu ön eki bekler.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import type { FormCheck } from '@/types'

const FORM_CHECK_BUCKET = 'form-checks-media'

export function useFormChecks(studentId?: string) {
  return useQuery({
    queryKey: queryKeys.formChecks(studentId),
    enabled: Boolean(studentId),
    queryFn: async (): Promise<FormCheck[]> => {
      const { data, error } = await supabase
        .from('form_checks')
        .select('*')
        .eq('student_id', studentId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface SubmitFormCheckInput {
  studentId: string
  currentWeight: number
  frontFile: File
  backFile?: File
  notes?: string
}

async function uploadPose(studentId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `poses/${studentId}-${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from(FORM_CHECK_BUCKET).upload(path, file)
  if (error) throw new Error(error.message)

  const {
    data: { publicUrl },
  } = supabase.storage.from(FORM_CHECK_BUCKET).getPublicUrl(path)

  return publicUrl
}

export function useSubmitFormCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      studentId,
      currentWeight,
      frontFile,
      backFile,
      notes,
    }: SubmitFormCheckInput): Promise<FormCheck> => {
      const frontUrl = await uploadPose(studentId, frontFile)
      const backUrl = backFile ? await uploadPose(studentId, backFile) : null

      const { data, error } = await supabase
        .from('form_checks')
        .insert({
          student_id: studentId,
          current_weight: currentWeight,
          front_pose_url: frontUrl,
          back_pose_url: backUrl,
          notes: notes ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      // Seri (streak) güncellemesi kritik değildir: hata akışı bozmaz, sadece loglanır.
      const { error: rpcError } = await supabase.rpc('increment_streak', { user_id: studentId })
      if (rpcError) {
        logger.warn({ err: rpcError.message }, 'increment_streak RPC başarısız')
      }

      return data
    },
    onSuccess: (_formCheck, { studentId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.formChecks(studentId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(studentId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.lastCheckins })
      toast.success('Formunuz koçunuza iletildi.')
    },
    onError: (error: Error) => {
      toast.error(`Form gönderilemedi: ${error.message}`)
    },
  })
}

/** Öğrenci id'si -> son form check tarihi (ISO). Koç panelinde takip için. */
export function useLastCheckins() {
  return useQuery({
    queryKey: queryKeys.lastCheckins(),
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('form_checks')
        .select('student_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      const lastByStudent: Record<string, string> = {}
      for (const row of data) {
        // Sonuç azalan sırada geldiği için ilk görülen kayıt en yenisidir.
        if (!lastByStudent[row.student_id]) {
          lastByStudent[row.student_id] = row.created_at
        }
      }
      return lastByStudent
    },
  })
}
