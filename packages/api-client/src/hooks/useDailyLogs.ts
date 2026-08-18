'use client'

// Günlük su / sodyum / makro kayıtları.
// `macros` alanı Json olarak saklanır; okurken `parseMacros` ile daraltılır.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import { parseMacros, type DailyLog, type Macros } from '@repo/types'

export function useDailyLogs(clientId?: string) {
  const supabase = useSupabaseClient()
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
  /**
   * `YYYY-MM-DD` — kullanıcının YEREL günü (`todayIsoDate()`, `@repo/api-client/date`).
   *
   * ZORUNLU (opsiyonel DEĞİL): alan opsiyonelken çağıran göndermediğinde satır
   * veritabanının `default current_date` değerini (UTC) alıyordu. UTC+3'te
   * gece 00:00–03:00 arasında gönderilen rapor bir ÖNCEKİ güne yazılır ve
   * `(client_id, log_date)` tekilliği yüzünden dünün kaydını EZERDİ. Zorunlu
   * tip, yeni bir çağıran eklendiğinde derleyicinin tarihi sormasını sağlar.
   */
  log_date: string
}

/**
 * Günlük kaydı oluşturur/günceller.
 * Şemada `(client_id, log_date)` benzersizdir; bu yüzden insert değil UPSERT kullanılır.
 * `log_date` DAİMA istemciden gelir (yerel gün) — DB varsayılanı yalnızca bir
 * güvenlik ağıdır, bu yolun kullandığı değer DEĞİLDİR.
 */
export function useCreateDailyLog() {
  const supabase = useSupabaseClient()
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
            log_date,
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
