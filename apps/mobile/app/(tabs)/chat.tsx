// SOHBET sekmesi (B-067) — DANIŞAN <-> koç birebir mesajlaşma. Geçmiş, realtime
// abonelik, optimistic gönderim ve okundu tespiti TAMAMEN `@repo/api-client` hook'larıyla
// yönetilir (useMessages/useSendMessage/useMarkConversationRead) — bu dosyada doğrudan
// Supabase çağrısı YOKTUR. Desen web `MessagesTab.tsx`'ten teyit edildi: danışan tarafında
// sohbet partneri = koç (`useCoachId`), konuşmanın `client_id`'si = kendi userId'sidir (koç
// olmayan taraf tektir, bkz. `resolveConversationClientId`). Mobilden ek YÜKLEME yok (Fable
// kararı) — var olan ekler (web'den gönderilmiş) `useMessageAttachmentUrl` ile SATIR İÇİ
// görüntülenir, yükleme UI'ı eklenmedi.

import { Ionicons } from '@expo/vector-icons'
import {
  useCoachId,
  useMarkConversationRead,
  useMessageAttachmentUrl,
  useMessages,
  useSendMessage,
} from '@repo/api-client'
import type { Message } from '@repo/types'
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type ListRenderItemInfo,
} from 'react-native'

import {
  Body,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  SectionHeader,
} from '../../components/ui'
import { useTheme, type Theme } from '../../lib/theme'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

/** "14:05" — Intl'e güvenmeden (Hermes) elle biçimlenir (index.tsx'teki `todayLabel` deseniyle tutarlı). */
function formatTime(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Bir mesaj ekinin imzalı görüntüleme adresini çözer ve balonun içinde gösterir.
 *
 * Ayrı bileşen olmasının nedeni React Hook kuralı: `useMessageAttachmentUrl` her mesaj
 * için ayrı çağrılmalı, bu da `.map()`/`renderItem` gövdesinde DOĞRUDAN çağrılamaz
 * (koşullu/döngüsel hook çağrısı yasak). Bucket PRIVATE olduğu için imzalı adres kullanılır.
 */
function MessageAttachment({ path }: { path: string }) {
  const theme = useTheme()
  const { data: url, isLoading } = useMessageAttachmentUrl(path)

  if (isLoading) {
    return (
      <View
        style={{
          height: 140,
          width: 180,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.border,
          opacity: 0.4,
        }}
      />
    )
  }

  if (!url) return null

  return (
    <Image
      source={{ uri: url }}
      style={{ height: 160, width: 200, borderRadius: theme.radius.card }}
      resizeMode="cover"
      accessibilityLabel="Mesaj eki"
    />
  )
}

/** Tek mesaj balonu — kendi mesajın sağda accent zemin, koçunki solda surface zemin. */
function MessageBubble({
  message,
  isMe,
  theme,
}: {
  message: Message
  isMe: boolean
  theme: Theme
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '78%',
          gap: 6,
          borderRadius: theme.radius.card,
          borderBottomRightRadius: isMe ? 4 : theme.radius.card,
          borderBottomLeftRadius: isMe ? theme.radius.card : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: isMe ? theme.colors.accent : theme.colors.surfaceRaised,
          borderWidth: isMe ? 0 : 1,
          borderColor: theme.colors.border,
        }}
      >
        {message.attachment_path ? <MessageAttachment path={message.attachment_path} /> : null}
        <Body variant="body" color={isMe ? 'accentContrast' : 'textPrimary'}>
          {message.message}
        </Body>
        <Body
          variant="bodySm"
          color={isMe ? 'accentContrast' : 'textSecondary'}
          style={{ alignSelf: 'flex-end', opacity: isMe ? 0.75 : 1 }}
        >
          {formatTime(message.created_at)}
        </Body>
      </View>
    </View>
  )
}

export default function ChatScreen() {
  const theme = useTheme()
  const userId = useCurrentUserId()
  const coach = useCoachId()
  const coachId = coach.data ?? undefined
  const messages = useMessages(userId, coachId)
  const sendMessage = useSendMessage()
  const markRead = useMarkConversationRead(userId)
  const [draft, setDraft] = useState('')
  const listRef = useRef<FlatList<Message>>(null)

  // Ekran odaklandığında (mount dahil — expo-router `useFocusEffect` ilk odakta da
  // tetiklenir) karşı taraftan gelen okunmamışları okundu işaretle. Danışan için
  // konuşmanın `client_id`'si kendi `userId`'sidir (bkz. `resolveConversationClientId`).
  useFocusEffect(
    useCallback(() => {
      if (userId) markRead.mutate()
      // Bağımlılık kasıtlı olarak yalnızca `userId`dir: `markRead.mutate` her render'da
      // yeni referans alır, onu eklemek odaklanma dışında da yeniden tetiklenmesine yol açardı.
    }, [userId])
  )

  function handleSend() {
    const text = draft.trim()
    if (!text || !userId || !coachId) return
    setDraft('')
    sendMessage.mutate({ senderId: userId, receiverId: coachId, message: text })
  }

  if (coach.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState label="Sohbet yükleniyor" />
      </View>
    )
  }

  if (coach.isError) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center' }}>
        <ErrorState message="Koç bilgisi yüklenemedi." onRetry={() => void coach.refetch()} />
      </View>
    )
  }

  if (!coachId) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center' }}>
        <EmptyState title="Koç atanmadı" description="Henüz bir koç atanmadı." />
      </View>
    )
  }

  const items = messages.data ?? []

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={{ flex: 1, padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <SectionHeader icon="chatbubble-ellipses" title="KOÇ İLE SOHBET" />

        <View style={{ flex: 1 }}>
          {messages.isLoading ? (
            <LoadingState label="Mesajlar yükleniyor" />
          ) : messages.isError ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <ErrorState message="Mesajlar yüklenemedi." onRetry={() => void messages.refetch()} />
            </View>
          ) : items.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState title="Henüz mesaj yok" description="Koçunla ilk mesajı gönder." />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              style={{ flex: 1 }}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: ListRenderItemInfo<Message>) => (
                <MessageBubble message={item} isMe={item.sender_id === userId} theme={theme} />
              )}
              contentContainerStyle={{ gap: theme.spacing.md, paddingVertical: theme.spacing.sm }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
          <Input
            containerStyle={{ flex: 1 }}
            placeholder="Mesajınızı yazın…"
            value={draft}
            onChangeText={setDraft}
            multiline
            style={{ maxHeight: 120 }}
            editable={!sendMessage.isPending}
            accessibilityLabel="Mesaj metni"
          />
          <Pressable
            onPress={handleSend}
            disabled={draft.trim().length === 0 || sendMessage.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mesajı gönder"
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: theme.radius.control,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accent,
              opacity:
                draft.trim().length === 0 || sendMessage.isPending ? 0.45 : pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="send" size={20} color={theme.colors.accentContrast} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
