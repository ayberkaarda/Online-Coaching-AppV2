'use client'

// Bildirim (duyuru) okuma, okundu işaretleme ve gönderme hook'ları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { queryKeyRoots, queryKeys, type NotificationQueryOptions } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import type { Notification, TablesInsert } from '@repo/types'

export type { NotificationQueryOptions }

/**
 * Kullanıcının bildirimleri (en yeniden eskiye).
 * @param opts.unreadOnly Yalnızca okunmamışlar.
 * @param opts.sinceDays  Son N günlük kayıtlar.
 */
export function useNotifications(userId?: string, opts?: NotificationQueryOptions) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.notifications(userId, opts),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Notification[]> => {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('client_id', userId ?? '')

      if (opts?.unreadOnly) query = query.eq('is_read', false)

      if (opts?.sinceDays !== undefined) {
        const since = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString()
        query = query.gte('created_at', since)
      }

      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'notifications', op: 'select' })
      return data
    },
  })
}

export interface MarkNotificationReadInput {
  id: string
  userId?: string
}

export function useMarkNotificationRead() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: MarkNotificationReadInput): Promise<void> => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
      if (error) throw wrapSupabaseError(error, { table: 'notifications', op: 'update' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
    },
    onError: (error: Error) => {
      notify.error(`Bildirim güncellenemedi: ${error.message}`)
    },
  })
}

export interface SendNotificationInput {
  /** Tek alıcı için tek elemanlı dizi, toplu duyuru için tüm danışan id'leri. */
  clientIds: string[]
  title?: string | null
  message: string
}

export function useSendNotification() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientIds, title, message }: SendNotificationInput): Promise<number> => {
      if (clientIds.length === 0) {
        throw new Error('En az bir alıcı seçmelisiniz.')
      }

      const rows: TablesInsert<'notifications'>[] = clientIds.map((clientId) => ({
        client_id: clientId,
        title: title ?? null,
        message,
      }))

      const { error } = await supabase.from('notifications').insert(rows)
      if (error) throw wrapSupabaseError(error, { table: 'notifications', op: 'insert' })
      return rows.length
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.notifications })
      notify.success(
        count > 1 ? `Duyuru ${count} kişiye gönderildi.` : 'Bildirim başarıyla gönderildi.'
      )
    },
    onError: (error: Error) => {
      notify.error(`Bildirim gönderilemedi: ${error.message}`)
    },
  })
}
