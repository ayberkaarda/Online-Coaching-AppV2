import { usePendingFormChecks, useProfile } from '@repo/api-client'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import { CoachActivityPanel } from '../../../components/coach/CoachActivityPanel'
import { CoachFormCheckReview } from '../../../components/coach/CoachFormCheckReview'
import { CoachMessageThread } from '../../../components/coach/CoachMessageThread'
import { Body, ErrorState, LoadingState } from '../../../components/ui'
import type { IconName } from '../../../components/ui'
import { useTheme, type Theme } from '../../../lib/theme'
import { useCurrentUserId } from '../../../lib/useCurrentUserId'

// DANIŞAN DETAYI (ADR-0028) — seçili danışan için üç yetenek TEK ekranda, segment seçiciyle:
// Aktivite (salt-okur özet) · Mesaj (koç <-> danışan) · Form-check (bekleyen inceleme).
// Segment seçici sayesinde aynı anda tek bölüm render edilir → mesaj thread'i (FlatList +
// KeyboardAvoidingView) tam yüksekliği alır, iç içe kaydırma çakışması olmaz.
//
// Bu ekran yalnızca gate === 'coach' (aal2 koç) altında mount edilir; tüm sorgular aal2'de
// çalışır, `mfa_aal2_gate` RLS'i açıktır.

type Section = 'activity' | 'chat' | 'formcheck'

const SEGMENTS: { key: Section; label: string; icon: IconName }[] = [
  { key: 'activity', label: 'Aktivite', icon: 'pulse-outline' },
  { key: 'chat', label: 'Mesaj', icon: 'chatbubble-ellipses-outline' },
  { key: 'formcheck', label: 'Form-check', icon: 'clipboard-outline' },
]

function SegmentButton({
  segment,
  active,
  badge,
  theme,
  onPress,
}: {
  segment: { key: Section; label: string; icon: IconName }
  active: boolean
  badge?: number
  theme: Theme
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={segment.label}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 40,
        borderRadius: theme.radius.control,
        backgroundColor: active ? theme.colors.accent : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons
        name={segment.icon}
        size={16}
        color={active ? theme.colors.accentContrast : theme.colors.textSecondary}
      />
      <Body variant="label" color={active ? 'accentContrast' : 'textSecondary'}>
        {segment.label}
      </Body>
      {badge && badge > 0 ? (
        <View
          style={{
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            backgroundColor: active ? theme.colors.accentContrast : theme.colors.warning,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body variant="bodySm" color={active ? 'accent' : 'accentContrast'}>
            {badge}
          </Body>
        </View>
      ) : null}
    </Pressable>
  )
}

export default function ClientDetailScreen() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ id: string }>()
  const clientId = params.id
  const coachUserId = useCurrentUserId()

  const profile = useProfile(clientId)
  const pending = usePendingFormChecks()
  const [section, setSection] = useState<Section>('activity')

  const clientName = profile.data?.full_name ?? 'Danışan'
  const pendingCount = (pending.data ?? []).filter((fc) => fc.client_id === clientId).length

  // SAVUNMACI: kimlik yoksa (kapıdan gelen yol normalde ikisini de garanti eder) hata göster.
  if (!clientId || !coachUserId) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Danışan' }} />
        <ErrorState message="Danışan bilgisi çözülemedi." />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Stack.Screen options={{ title: clientName }} />

      {/* Segment seçici */}
      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.xs,
          margin: theme.spacing.xl,
          marginBottom: theme.spacing.md,
          padding: theme.spacing.xs,
          borderRadius: theme.radius.control,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {SEGMENTS.map((seg) => (
          <SegmentButton
            key={seg.key}
            segment={seg}
            active={section === seg.key}
            badge={seg.key === 'formcheck' ? pendingCount : undefined}
            theme={theme}
            onPress={() => setSection(seg.key)}
          />
        ))}
      </View>

      {profile.isLoading ? (
        <LoadingState label="Danışan yükleniyor" />
      ) : section === 'chat' ? (
        <View
          style={{
            flex: 1,
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.md,
          }}
        >
          <CoachMessageThread coachUserId={coachUserId} clientId={clientId} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.xxxl,
            gap: theme.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {section === 'activity' ? (
            <CoachActivityPanel clientId={clientId} />
          ) : (
            <CoachFormCheckReview clientId={clientId} />
          )}
        </ScrollView>
      )}
    </View>
  )
}
