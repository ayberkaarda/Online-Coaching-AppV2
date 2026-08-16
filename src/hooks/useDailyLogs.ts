'use client'

// Günlük su / sodyum / makro kayıtları.
// `macros` alanı Json olarak saklanır; okurken `parseMacros` ile daraltılır.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import { parseMacros, type DailyLog, type Macros } from '@/types'

export function useDailyLogs(studentId?: string) {
  return useQuery({
    queryKey: queryKeys.dailyLogs(studentId),
    enabled: Boolean(studentId),
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('student_id', studentId ?? '')
        .order('log_date', { ascending: false })
      if (error) throw new Error(error.message)

      return data.map((row) => ({ ...row, macros: parseMacros(row.macros) }))
    },
  })
}

export interface CreateDailyLogInput {
  studentId: string
  water_lt: number | null
  sodium_mg: number | null
  macros: Macros
  /** YYYY-MM-DD. Verilmezse veritabanı `current_date` kullanır. */
  log_date?: string
}

/**
 * Günlük kaydı oluşturur/günceller.
 * Şemada `(student_id, log_date)` benzersizdir; bu yüzden insert değil UPSERT kullanılır.
 */
export function useCreateDailyLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      studentId,
      water_lt,
      sodium_mg,
      macros,
      log_date,
    }: CreateDailyLogInput): Promise<DailyLog> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .upsert(
          {
            student_id: studentId,
            water_lt,
            sodium_mg,
            macros: { protein: macros.protein, carb: macros.carb, fat: macros.fat },
            ...(log_date ? { log_date } : {}),
          },
          { onConflict: 'student_id,log_date' }
        )
        .select()
        .single()
      if (error) throw new Error(error.message)

      return { ...data, macros: parseMacros(data.macros) }
    },
    onSuccess: (_log, { studentId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs(studentId) })
      toast.success('Günlük veriler kaydedildi.')
    },
    onError: (error: Error) => {
      toast.error(`Günlük veriler kaydedilemedi: ${error.message}`)
    },
  })
}
