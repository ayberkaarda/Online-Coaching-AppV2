'use client'

// Bildirim (duyuru) okuma, okundu işaretleme ve gönderme hook'ları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys, type NotificationQueryOptions } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import type { Notification, TablesInsert } from '@/types'

export type { NotificationQueryOptions }

/**
 * Kullanıcının bildirimleri (en yeniden eskiye).
 * @param opts.unreadOnly Yalnızca okunmamışlar.
 * @param opts.sinceDays  Son N günlük kayıtlar.
 */
export function useNotifications(userId?: string, opts?: NotificationQueryOptions) {
  return useQuery({
    queryKey: queryKeys.notifications(userId, opts),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Notification[]> => {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('student_id', userId ?? '')

      if (opts?.unreadOnly) query = query.eq('is_read', false)

      if (opts?.sinceDays !== undefined) {
        const since = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString()
        query = query.gte('created_at', since)
      }

      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface MarkNotificationReadInput {
  id: string
  userId?: string
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: MarkNotificationReadInput): Promise<void> => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
    },
    onError: (error: Error) => {
      toast.error(`Bildirim güncellenemedi: ${error.message}`)
    },
  })
}

export interface SendNotificationInput {
  /** Tek alıcı için tek elemanlı dizi, toplu duyuru için tüm öğrenci id'leri. */
  studentIds: string[]
  title?: string | null
  message: string
}

export function useSendNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ studentIds, title, message }: SendNotificationInput): Promise<number> => {
      if (studentIds.length === 0) {
        throw new Error('En az bir alıcı seçmelisiniz.')
      }

      const rows: TablesInsert<'notifications'>[] = studentIds.map((studentId) => ({
        student_id: studentId,
        title: title ?? null,
        message,
      }))

      const { error } = await supabase.from('notifications').insert(rows)
      if (error) throw new Error(error.message)
      return rows.length
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      toast.success(
        count > 1 ? `Duyuru ${count} kişiye gönderildi.` : 'Bildirim başarıyla gönderildi.'
      )
    },
    onError: (error: Error) => {
      toast.error(`Bildirim gönderilemedi: ${error.message}`)
    },
  })
}
