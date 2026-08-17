'use client'

// Günlük su / sodyum / makro kayıtları.
// `macros` alanı Json olarak saklanır; okurken `parseMacros` ile daraltılır.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { supabase } from '@/lib/supabase/client'
import { parseMacros, type DailyLog, type Macros } from '@/types'

export function useDailyLogs(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.dailyLogs(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('client_id', clientId ?? '')
        .order('log_date', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'daily_logs', op: 'select' })

      return data.map((row) => ({ ...row, macros: parseMacros(row.macros) }))
    },
  })
}

export interface CreateDailyLogInput {
  clientId: string
  water_lt: number | null
  sodium_mg: number | null
  macros: Macros
  /** YYYY-MM-DD. Verilmezse veritabanı `current_date` kullanır. */
  log_date?: string
}

/**
 * Günlük kaydı oluşturur/günceller.
 * Şemada `(client_id, log_date)` benzersizdir; bu yüzden insert değil UPSERT kullanılır.
 */
export function useCreateDailyLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      water_lt,
      sodium_mg,
      macros,
      log_date,
    }: CreateDailyLogInput): Promise<DailyLog> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .upsert(
          {
            client_id: clientId,
            water_lt,
            sodium_mg,
            macros: { protein: macros.protein, carb: macros.carb, fat: macros.fat },
            ...(log_date ? { log_date } : {}),
          },
          { onConflict: 'client_id,log_date' }
        )
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'daily_logs', op: 'upsert' })

      return { ...data, macros: parseMacros(data.macros) }
    },
    onSuccess: (_log, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogs(clientId) })
      toast.success('Günlük veriler kaydedildi.')
    },
    onError: (error: Error) => {
      toast.error(`Günlük veriler kaydedilemedi: ${error.message}`)
    },
  })
}
