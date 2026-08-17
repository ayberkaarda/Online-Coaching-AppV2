'use client'

// Koç <-> danışan birebir sohbeti. Geçmiş, realtime abonelik, presence ve
// optimistic gönderim tamamen `@/hooks` içindeki hook'lar tarafından yönetilir.

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { toast } from 'sonner'

import { QueryState, SkeletonText } from '@/components/ui'
import { useCoachId, useMessages, usePresence, useSendMessage } from '@/hooks'
import type { UserRole } from '@/types'

export interface MessagesTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

export default function MessagesTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
}: MessagesTabProps): JSX.Element {
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const { data: coachId } = useCoachId()
  const chatPartnerId = userRole === 'coach' ? targetId : (coachId ?? undefined)

  const { data, isLoading, isError, error, refetch } = useMessages(currentUserId, chatPartnerId)
  const sendMessage = useSendMessage()
  const { isOnline } = usePresence(currentUserId)

  const messages = data ?? []
  const isTargetOnline = chatPartnerId ? isOnline(chatPartnerId) : false

  // Liste her değiştiğinde en alta kaydır (DOM güncellemesi için kısa gecikme).
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [messages.length])

  const handleSend = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = newMessage.trim()
    if (!text) return

    if (!currentUserId || !chatPartnerId) {
      toast.error('Sohbet edilecek kişi bulunamadı.')
      return
    }

    setNewMessage('')
    // Optimistic güncelleme ve hata toast'ı hook içinde yapılır.
    sendMessage.mutate({ senderId: currentUserId, receiverId: chatPartnerId, message: text })
  }

  if (userRole === 'coach' && selectedClientIds.length !== 1) {
    return (
      <p className="py-10 text-center text-sm font-bold text-accent">
        Sohbet etmek için sadece 1 danışan seçili bırakın.
      </p>
    )
  }

  return (
    <div className="flex h-[500px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-inner dark:border-zinc-800 dark:bg-[#121212]">
      {/* Sohbet Başlığı */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#16161d]">
        <h4 className="text-sm font-bold text-gray-800 dark:text-zinc-200">
          {userRole === 'coach' ? 'Danışan ile Sohbet' : 'Koç ile Sohbet'}
        </h4>

        <div className="flex items-center gap-1.5" role="status" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            {isTargetOnline ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </>
            ) : (
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </span>
          <span
            className={`text-xs font-bold ${
              isTargetOnline
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isTargetOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
          </span>
        </div>
      </div>

      {/* Mesaj Kutusu */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Mesajlar"
        className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-4"
      >
        <QueryState
          isLoading={isLoading}
          isError={isError}
          error={error}
          skeleton={<SkeletonText lines={4} />}
          onRetry={() => void refetch()}
        >
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs font-bold text-gray-400">
              Henüz mesaj yok. İlk mesajı gönder!
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((msg) => {
                const isMe = msg.sender_id === currentUserId
                return (
                  <li key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[70%] rounded-2xl p-3 text-sm ${
                        isMe
                          ? 'rounded-br-none bg-accent text-white'
                          : 'rounded-bl-none border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200'
                      }`}
                    >
                      <span className="sr-only">{isMe ? 'Sen: ' : 'Karşı taraf: '}</span>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <span
                        className={`mt-1 block text-right text-[9px] ${
                          isMe ? 'text-accent-200 opacity-70' : 'text-gray-400'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Gönderme Formu */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#16161d]"
      >
        <label htmlFor="chat-message" className="sr-only">
          Mesajınız
        </label>
        <input
          id="chat-message"
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Mesajınızı yazın..."
          className="flex-1 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={!newMessage.trim()}
          className="rounded-xl bg-accent px-6 py-3 font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          Gönder
        </button>
      </form>
    </div>
  )
}
