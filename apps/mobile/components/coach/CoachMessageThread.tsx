import {
  useMarkConversationRead,
  useMessageAttachmentUrl,
  useMessages,
  useSendMessage,
} from '@repo/api-client'
import type { Message } from '@repo/types'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type ListRenderItemInfo,
} from 'react-native'

import { useTheme, type Theme } from '../../lib/theme'
import { Body, EmptyState, ErrorState, Input, LoadingState } from '../ui'

// KOÇ MESAJ THREAD'İ (ADR-0028 yetenek 2) — koç <-> seçili danışan birebir sohbet. Danışan
// `(tabs)/chat.tsx` YENİDEN KULLANILMAZ (o danışan-yüzü); AYNI paylaşılan hook'lar ama koç yüzü:
// currentUser = KOÇ, partner = seçili danışan. Konuşmanın `client_id`'si otomatik danışan olur
// (`resolveConversationClientId`). Mobilden ek YÜKLEME yok (ADR-0028); var olan ekler
// (web'den) SATIR İÇİ görüntülenir.

function formatTime(iso: string): string {
  const date = new Date(iso)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Ek imzalı adresi ayrı bileşende çözülür (Hook kuralı: renderItem içinde doğrudan çağrılamaz). */
function MessageAttachment({ path, theme }: { path: string; theme: Theme }) {
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
        {message.attachment_path ? (
          <MessageAttachment path={message.attachment_path} theme={theme} />
        ) : null}
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

export function CoachMessageThread({
  coachUserId,
  clientId,
}: {
  coachUserId: string
  clientId: string
}) {
  const theme = useTheme()
  const messages = useMessages(coachUserId, clientId)
  const sendMessage = useSendMessage()
  // Konuşmanın `client_id`'si seçili danışandır — koçun karşı tarafından gelen okunmamışları
  // bu bölüm açılınca okundu işaretle.
  const markRead = useMarkConversationRead(clientId)
  const [draft, setDraft] = useState('')
  const listRef = useRef<FlatList<Message>>(null)

  useEffect(() => {
    markRead.mutate()
    // Bağımlılık kasıtlı olarak yalnızca kimliklerdir: `markRead.mutate` her render'da yeni
    // referans alır, onu eklemek bölüm açıkken sonsuz yeniden tetiklenmeye yol açardı
    // (chat.tsx'teki useFocusEffect deseniyle aynı gerekçe).
  }, [clientId, coachUserId])

  function handleSend() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    sendMessage.mutate({ senderId: coachUserId, receiverId: clientId, message: text })
  }

  const items = messages.data ?? []

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          {messages.isLoading ? (
            <LoadingState label="Mesajlar yükleniyor" />
          ) : messages.isError ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <ErrorState message="Mesajlar yüklenemedi." onRetry={() => void messages.refetch()} />
            </View>
          ) : items.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <EmptyState title="Henüz mesaj yok" description="Danışanına ilk mesajı gönder." />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              style={{ flex: 1 }}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: ListRenderItemInfo<Message>) => (
                <MessageBubble message={item} isMe={item.sender_id === coachUserId} theme={theme} />
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
