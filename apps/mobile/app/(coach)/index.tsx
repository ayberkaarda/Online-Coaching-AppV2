import { useLastCheckins, usePendingFormChecks, useProfiles, useSignOut } from '@repo/api-client'
import type { ProfileWithAvatar } from '@repo/api-client'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  IconButton,
  Label,
  LoadingState,
  SectionHeader,
} from '../../components/ui'
import { useTheme, type Theme } from '../../lib/theme'

// KOÇ DASHBOARD (ADR-0028) — acil-erişimin giriş ekranı: bekleyen form-check özeti + salt-okur
// danışan listesi. Danışan seçilince detay ekranına (aktivite + mesaj + form-check inceleme)
// geçilir. Kimlik disiplini: gradyan/halka YOK (halka yalnız danışan haftalık döngüsü), kartlar
// primitive `Card`, renkler token'dan.

/** "21 Ağu" — son check-in tarihi için kısa, Intl'siz (Hermes) etiket. */
const MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
]

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()] ?? ''}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

function Avatar({ client, theme }: { client: ProfileWithAvatar; theme: Theme }) {
  const size = 44
  if (client.avatarSignedUrl) {
    return (
      <Image
        source={{ uri: client.avatarSignedUrl }}
        style={{ width: size, height: size, borderRadius: theme.radius.control }}
        accessibilityLabel={`${client.full_name} profil fotoğrafı`}
      />
    )
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.control,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Body variant="bodyMedium" color="textSecondary">
        {initials(client.full_name)}
      </Body>
    </View>
  )
}

function ClientRow({
  client,
  lastCheckin,
  pendingCount,
  theme,
  onPress,
}: {
  client: ProfileWithAvatar
  lastCheckin?: string
  pendingCount: number
  theme: Theme
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${client.full_name} danışan detayını aç`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Avatar client={client} theme={theme} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Body variant="bodyMedium" style={{ flexShrink: 1 }}>
                {client.full_name}
              </Body>
              {!client.is_active ? <Badge label="Pasif" tone="neutral" /> : null}
            </View>
            <Body variant="bodySm" color="textSecondary">
              {lastCheckin ? `Son form-check · ${shortDate(lastCheckin)}` : 'Form-check yok'}
            </Body>
          </View>
          {pendingCount > 0 ? <Badge label={`${pendingCount} bekliyor`} tone="warning" /> : null}
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </View>
      </Card>
    </Pressable>
  )
}

export default function CoachDashboard() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const signOut = useSignOut()

  const profiles = useProfiles()
  const pending = usePendingFormChecks()
  const lastCheckins = useLastCheckins()

  const clients = (profiles.data ?? []).filter((p) => p.role === 'client')
  const pendingByClient = (pending.data ?? []).reduce<Record<string, number>>((acc, fc) => {
    acc[fc.client_id] = (acc[fc.client_id] ?? 0) + 1
    return acc
  }, {})
  const pendingTotal = pending.data?.length ?? 0

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Kendi başlık satırı: koç kimliği + çıkış (danışan Panel'inin ayar dişlisi deseniyle
          tutarlı, ama koç yüzü). */}
      <View
        style={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 2 }}>
          <Label>ACİL-ERİŞİM</Label>
          <Heading variant="displayMd">Koç paneli</Heading>
        </View>
        <IconButton
          name="log-out-outline"
          onPress={() => signOut.mutate()}
          accessibilityLabel="Hesaptan çıkış yap"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        {/* Bekleyen form-check özeti */}
        <Card variant="panel">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radius.control,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="clipboard-outline" size={22} color={theme.colors.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Body variant="bodyMedium">Bekleyen form-check</Body>
              <Body variant="bodySm" color="textSecondary">
                {pending.isLoading
                  ? 'Yükleniyor…'
                  : pendingTotal === 0
                    ? 'Kuyrukta bekleyen inceleme yok.'
                    : `${pendingTotal} inceleme bekliyor.`}
              </Body>
            </View>
            {pendingTotal > 0 ? <Badge label={String(pendingTotal)} tone="warning" /> : null}
          </View>
        </Card>

        <SectionHeader icon="people-outline" title="DANIŞANLAR" />

        {profiles.isLoading ? (
          <LoadingState label="Danışanlar yükleniyor" />
        ) : profiles.isError ? (
          <ErrorState message="Danışanlar yüklenemedi." onRetry={() => void profiles.refetch()} />
        ) : clients.length === 0 ? (
          <EmptyState title="Danışan yok" description="Henüz kayıtlı bir danışan görünmüyor." />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {clients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                lastCheckin={lastCheckins.data?.[client.id]}
                pendingCount={pendingByClient[client.id] ?? 0}
                theme={theme}
                onPress={() => router.push({ pathname: '/client/[id]', params: { id: client.id } })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
