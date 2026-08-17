'use client'

// Koç <-> danışan birebir sohbeti. Geçmiş, realtime abonelik, presence, okundu
// tespiti ve optimistic gönderim tamamen `@/hooks` içindeki hook'lar tarafından
// yönetilir. Bu bileşen yalnızca sunum + kullanıcı etkileşimidir (AC-2.4:
// doğrudan Supabase sorgu çağrısı bu dosyada YOKTUR — hepsi `@/hooks/useMessages`
// içinde).

import { Check, CheckCheck, ImageOff, Info, Paperclip, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, JSX } from 'react'
import { toast } from 'sonner'

import { QueryState, SkeletonText } from '@/components/ui'
import {
  resolveConversationClientId,
  useCoachId,
  useMarkConversationRead,
  useMessageAttachmentUrl,
  useMessages,
  usePresence,
  useSendMessage,
  useUnreadCount,
} from '@/hooks'
import { UploadValidationError, assertValidImageFile } from '@/lib/upload-validation'
import type { Message, UserRole } from '@/types'

export interface MessagesTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

/**
 * Bir mesaj ekinin imzalı görüntüleme adresini çözer ve gösterir.
 *
 * Ayrı bileşen olmasının nedeni React Hook kuralı: `useMessageAttachmentUrl`
 * her mesaj için ayrı çağrılmalı, bu da `.map()` gövdesinde DOĞRUDAN
 * çağrılamaz (koşullu/döngüsel hook çağrısı yasak). Bucket PRIVATE olduğu için
 * `getPublicUrl` yerine imzalı adres kullanılır (I-4).
 */
function MessageAttachmentImage({
  path,
  senderLabel,
}: {
  path: string
  senderLabel: string
}): JSX.Element {
  const { data: url, isLoading } = useMessageAttachmentUrl(path)

  if (isLoading) {
    return (
      <div
        className="flex h-40 w-48 items-center justify-center rounded-card bg-surface"
        aria-hidden="true"
      >
        <span className="h-6 w-6 animate-pulse rounded-full bg-border" />
      </div>
    )
  }

  if (!url) {
    return (
      <div className="flex h-24 w-48 flex-col items-center justify-center gap-1 rounded-card bg-surface text-fg-muted">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs">Fotoğraf yüklenemedi</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- imzalı adres kısa ömürlü (TTL 3600 sn), next/image önbelleği bu süreyle çakışır.
    <img
      src={url}
      alt={`${senderLabel} tarafından gönderilen fotoğraf`}
      className="max-h-64 w-full max-w-[220px] rounded-card object-cover"
    />
  )
}

export default function MessagesTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
}: MessagesTabProps): JSX.Element {
  const [newMessage, setNewMessage] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { data: coachId } = useCoachId()
  const chatPartnerId = userRole === 'coach' ? targetId : (coachId ?? undefined)
  const clientId = resolveConversationClientId(currentUserId, chatPartnerId, coachId)

  const { data, isLoading, isError, error, refetch } = useMessages(currentUserId, chatPartnerId)
  const sendMessage = useSendMessage()
  const markConversationRead = useMarkConversationRead(clientId)
  const { data: unreadCount = 0 } = useUnreadCount(clientId)
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

  // ---------------------------------------------------------------------------
  // "Okundu" tespiti (§4.4: "karşı taraf mesajı görüntüleyince read_at").
  //
  // KARAR: ne "sekme açıldı -> hepsi okundu" (görüntülenmemiş mesajları da
  // okunmuş sayar) ne de hiçbir tespit (rozet hiç sıfırlanmaz). Seçilen yöntem:
  // karşı taraftan gelen HENÜZ OKUNMAMIŞ her mesaj balonu kendi
  // `data-message-id`'siyle ayrı ayrı bir `IntersectionObserver`a kaydolur;
  // balon GERÇEKTEN görünür alana girdiğinde VE `document.visibilityState ===
  // 'visible'` olduğunda (tarayıcı sekmesi arka planda değil) okundu mutation'ı
  // tetiklenir. İkinci koşul olmadan "sohbet DOM'da mounted ama pencere
  // arka planda" durumu yanlışlıkla "görüldü" sayılırdı.
  //
  // Mutation zaten TOPLU çalışır (tüm konuşmanın okunmamışlarını tek istekte
  // işaretler, bkz. useMarkConversationRead) ve sunucuda `.is('read_at', null)`
  // ile filtrelenir; bu yüzden birden fazla balon aynı anda görünür
  // olduğunda/kaydırma sırasında tekrar tetiklenmesi ZARARSIZDIR (idempotent,
  // 0 satır güncellenince `onSuccess` sayaç sorgusunu bile invalidate etmez).
  // ---------------------------------------------------------------------------
  const observerRef = useRef<IntersectionObserver | null>(null)
  const intersectingUnreadRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const root = messageListRef.current
    if (!root) return
    // Cleanup'ta `.current`'ı DOĞRUDAN okumak yerine sabit bir yerel referansa
    // bağlanır (`intersectingUnreadRef.current` DOM'a değil salt bir `Set`e
    // işaret etse de, react-hooks/exhaustive-deps genel kuralı budur).
    const intersecting = intersectingUnreadRef.current

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-message-id')
          if (!id) continue
          if (entry.isIntersecting) intersecting.add(id)
          else intersecting.delete(id)
        }
        if (intersecting.size > 0 && document.visibilityState === 'visible') {
          markConversationRead.mutate()
        }
      },
      { root, threshold: 0.6 }
    )
    observerRef.current = observer
    return () => {
      observer.disconnect()
      observerRef.current = null
      intersecting.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markConversationRead her render'da yeni referans; yalnızca konuşma değiştiğinde gözlemci yeniden kurulmalı.
  }, [clientId])

  // Sekme arka plandayken görünür kalmış (ama tetiklenmemiş) bir balon varsa,
  // sekme tekrar öne geldiğinde yeniden dene.
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && intersectingUnreadRef.current.size > 0) {
        markConversationRead.mutate()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca mount/unmount'ta bağlanır; mutate referansı stabil davranışı değiştirmez.
  }, [])

  const observeUnreadBubble = useCallback((node: HTMLLIElement | null) => {
    const observer = observerRef.current
    if (!observer) return
    if (node) observer.observe(node)
  }, [])

  // ---------------------------------------------------------------------------
  // Ek seçimi: gönderim ANINA kadar beklemek yerine seçim anında doğrulanır
  // (magic-byte dahil — bkz. src/lib/upload-validation.ts) ki kullanıcı
  // geçersiz bir dosyayı yazıp "Gönder"e bastıktan SONRA değil, hemen öğrensin.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl)
    }
  }, [attachmentPreviewUrl])

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = '' // aynı dosya art arda seçilebilsin diye sıfırlanır
    if (!file) return

    try {
      await assertValidImageFile(file)
    } catch (err) {
      const message = err instanceof UploadValidationError ? err.message : 'Dosya doğrulanamadı.'
      toast.error(message)
      return
    }

    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl)
    setAttachmentFile(file)
    setAttachmentPreviewUrl(URL.createObjectURL(file))
  }

  const clearAttachment = (): void => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl)
    setAttachmentFile(null)
    setAttachmentPreviewUrl(null)
  }

  const handleSend = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = newMessage.trim()
    if (!text) return

    if (!currentUserId || !chatPartnerId) {
      toast.error('Sohbet edilecek kişi bulunamadı.')
      return
    }

    setNewMessage('')
    const file = attachmentFile ?? undefined
    clearAttachment()
    // Optimistic güncelleme ve hata toast'ı hook içinde yapılır.
    sendMessage.mutate({
      senderId: currentUserId,
      receiverId: chatPartnerId,
      message: text,
      clientId,
      file,
    })
  }

  if (userRole === 'coach' && selectedClientIds.length !== 1) {
    return (
      <p className="py-10 text-center text-sm font-bold text-accent">
        Sohbet etmek için sadece 1 danışan seçili bırakın.
      </p>
    )
  }

  return (
    <div className="flex h-[500px] flex-col overflow-hidden rounded-panel border border-border bg-canvas shadow-inner">
      {/* Sohbet Başlığı */}
      <div className="flex items-center justify-between border-b border-border bg-surface-raised p-4">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-fg">
            {userRole === 'coach' ? 'Danışan ile Sohbet' : 'Koç ile Sohbet'}
          </h4>
          {unreadCount > 0 && (
            <span
              className="rounded-control bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg"
              role="status"
              aria-label={`${unreadCount} okunmamış mesaj`}
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5" role="status" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            {isTargetOnline ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </>
            ) : (
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-border" />
            )}
          </span>
          <span
            className={`text-xs font-bold ${isTargetOnline ? 'text-success' : 'text-fg-muted'}`}
          >
            {isTargetOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
          </span>
        </div>
      </div>

      {/* Mesaj Kutusu */}
      <div
        ref={messageListRef}
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
            <div className="flex h-full items-center justify-center text-xs font-bold text-fg-muted">
              Henüz mesaj yok. İlk mesajı gönder!
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((msg: Message) => {
                if (msg.kind === 'system') {
                  return (
                    <li key={msg.id} className="flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-control bg-surface px-3 py-1 text-xs text-fg-muted">
                        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {msg.message}
                      </span>
                    </li>
                  )
                }

                const isMe = msg.sender_id === currentUserId

                return (
                  <li
                    key={msg.id}
                    data-message-id={msg.id}
                    // GÖZLEM TÜM GELEN balonlara bağlanır (yalnızca `read_at === null`
                    // olanlara değil): `ref` fonksiyon KİMLİĞİ mesaj okunduktan sonra
                    // DEĞİŞMEMELİDİR — değişseydi React eski ref'i `null` ile çağırır,
                    // biz de gözlemciden çıkarmazdık (unobserve edecek referans kalmaz),
                    // balon kaydırıldıkça sonsuza dek gereksiz callback tetiklenirdi.
                    // Zaten okunmuş bir balonun görünür olması `markConversationRead`ı
                    // tekrar tetiklese bile ZARARSIZDIR (sunucu `.is('read_at', null)`
                    // ile filtreler, 0 satır güncellenir).
                    ref={!isMe ? observeUnreadBubble : undefined}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-panel p-3 text-sm ${
                        isMe
                          ? 'rounded-br-none bg-accent text-accent-fg'
                          : 'rounded-bl-none border border-border bg-surface-raised text-fg shadow-sm'
                      }`}
                    >
                      <span className="sr-only">{isMe ? 'Sen: ' : 'Karşı taraf: '}</span>
                      {msg.attachment_path && (
                        <div className="mb-2">
                          <MessageAttachmentImage
                            path={msg.attachment_path}
                            senderLabel={isMe ? 'Sen' : 'Karşı taraf'}
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <span
                        className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${
                          isMe ? 'text-accent-fg/70' : 'text-fg-muted'
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {isMe &&
                          (msg.read_at ? (
                            <>
                              <CheckCheck className="h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">Görüldü</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">İletildi</span>
                            </>
                          ))}
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

      {/* Ek önizleme */}
      {attachmentPreviewUrl && (
        <div className="flex items-center gap-2 border-t border-border bg-surface-raised px-4 pt-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- yerel blob önizleme, next/image'a uygun değil */}
            <img
              src={attachmentPreviewUrl}
              alt="Gönderilecek fotoğraf önizlemesi"
              className="h-16 w-16 rounded-card object-cover"
            />
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="Fotoğrafı kaldır"
              className="absolute -right-1.5 -top-1.5 rounded-full bg-danger p-0.5 text-accent-fg"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <span className="text-xs text-fg-muted">Fotoğraf eklendi</span>
        </div>
      )}

      {/* Mesaj Gönderme Formu */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-border bg-surface-raised p-4"
      >
        <label htmlFor="chat-message" className="sr-only">
          Mesajınız
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/avif"
          onChange={(e) => void handleFileSelect(e)}
          className="sr-only"
          aria-label="Fotoğraf ekle"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Fotoğraf ekle"
          className="shrink-0 rounded-card border border-border bg-canvas px-3 text-fg-muted transition-colors hover:text-accent"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          id="chat-message"
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Mesajınızı yazın..."
          className="flex-1 rounded-card border border-border bg-canvas p-3 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sendMessage.isPending}
          className="rounded-card bg-accent px-6 py-3 font-bold text-accent-fg shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          Gönder
        </button>
      </form>
    </div>
  )
}
