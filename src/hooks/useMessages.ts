'use client'

// Koç <-> danışan birebir sohbeti: geçmiş, realtime dinleme, presence ve optimistic gönderim.

import type { RealtimePresenceState } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import type { Message } from '@/types'

interface PresencePayload {
  user_id: string
  online_at: string
}

function isMessageRow(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<Message>
  return typeof row.id === 'string' && typeof row.sender_id === 'string'
}

/**
 * İki kullanıcı arasındaki mesajlar (eskiden yeniye) + realtime INSERT aboneliği.
 * Anahtar yön bağımsızdır: (a,b) ve (b,a) aynı önbelleği kullanır.
 */
export function useMessages(currentUserId?: string, partnerId?: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!currentUserId || !partnerId) return

    const key = queryKeys.messages(currentUserId, partnerId)
    const channelName = `messages:${[currentUserId, partnerId].sort().join(':')}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row: unknown = payload.new
          if (!isMessageRow(row)) return

          const belongsToThread =
            (row.sender_id === currentUserId && row.receiver_id === partnerId) ||
            (row.sender_id === partnerId && row.receiver_id === currentUserId)
          if (!belongsToThread) return

          queryClient.setQueryData<Message[]>(key, (previous) => {
            const list = previous ?? []
            if (list.some((item) => item.id === row.id)) return list
            // Optimistic kopyayı (varsa) gerçek kayıtla değiştir.
            const withoutOptimistic = list.filter(
              (item) =>
                !(
                  item.id.startsWith('optimistic-') &&
                  item.message === row.message &&
                  item.sender_id === row.sender_id
                )
            )
            return [...withoutOptimistic, row]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, partnerId, queryClient])

  return useQuery({
    queryKey: queryKeys.messages(currentUserId, partnerId),
    enabled: Boolean(currentUserId && partnerId),
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),` +
            `and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
        )
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface SendMessageInput {
  senderId: string
  receiverId: string
  message: string
}

interface SendMessageContext {
  key: readonly unknown[]
  previous: Message[] | undefined
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation<Message, Error, SendMessageInput, SendMessageContext>({
    mutationFn: async ({ senderId, receiverId, message }): Promise<Message> => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender_id: senderId, receiver_id: receiverId, message })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onMutate: async ({ senderId, receiverId, message }) => {
      const key = queryKeys.messages(senderId, receiverId)
      await queryClient.cancelQueries({ queryKey: key })

      const previous = queryClient.getQueryData<Message[]>(key)

      const optimistic: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        is_read: false,
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData<Message[]>(key, [...(previous ?? []), optimistic])

      return { key, previous }
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous)
      }
      toast.error(`Mesaj gönderilemedi: ${error.message}`)
    },
    onSettled: (_data, _error, { senderId, receiverId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(senderId, receiverId) })
    },
  })
}

/** Global presence kanalı: karşı tarafın çevrimiçi olup olmadığını bildirir. */
export function usePresence(currentUserId?: string) {
  const [onlineIds, setOnlineIds] = useState<string[]>([])

  useEffect(() => {
    // Guard dalında artık setState çağrılmıyor (set-state-in-effect lint hatasını önler);
    // "çevrimiçi mi" sorusu aşağıda currentUserId'ye göre türetiliyor, bu yüzden
    // currentUserId yokken abone olmadan çıkmak yeterli — bayat onlineIds sızmaz.
    if (!currentUserId) return

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: currentUserId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state: RealtimePresenceState<PresencePayload> =
          channel.presenceState<PresencePayload>()
        const ids = new Set<string>()
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (typeof entry.user_id === 'string') ids.add(entry.user_id)
          }
        }
        setOnlineIds([...ids])
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [currentUserId])

  // currentUserId yokken kimse çevrimiçi sayılmaz: kanal hiç kurulmadığından onlineIds
  // bayat/eski kullanıcı verisi taşıyor olsa bile bu dal onu görünmez kılar.
  const isOnline = useCallback(
    (userId: string) => (currentUserId ? onlineIds.includes(userId) : false),
    [currentUserId, onlineIds]
  )

  return { isOnline }
}

/** Danışanın sohbet edeceği koçun (role = 'admin') id'si. */
export function useAdminId() {
  return useQuery({
    queryKey: queryKeys.adminId(),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.id ?? null
    },
  })
}
