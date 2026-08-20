import { summarizeMetric, useProfile, useProgressTrend } from '@repo/api-client'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { SignOutButton } from '../../components/SignOutButton'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

// PANEL sekmesi (B-052 dilim 2) — GERÇEK veriye bağlı, salt okuma.
//
// MONOREPO KANITI (çalışma zamanı): buradaki `useProfile` / `useProgressTrend`, web'in de
// kullandığı `@repo/api-client` hook'larının TA KENDİSİDİR (ayrı bir mobil kopya yok). Aynı
// TanStack Query hook'u iki app'te; veri, enjekte edilen mobil Supabase istemcisi üzerinden
// RLS altında gelir (danışan yalnızca KENDİ satırını görür).
export default function DashboardScreen() {
  const userId = useCurrentUserId()
  const profile = useProfile(userId)
  // Son kilo ölçümünü panelde göstermek için trendi kullan (7/30/90 aralığı sekmesiyle AYNI
  // endpoint — `progress` sekmesiyle önbelleği paylaşır, ikinci ağ isteği yok).
  const trend = useProgressTrend(userId)

  if (profile.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (profile.isError || !profile.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Profil yüklenemedi.</Text>
        <SignOutButton />
      </View>
    )
  }

  const weight = trend.data ? summarizeMetric(trend.data, 'weight_kg') : null

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Merhaba, {profile.data.full_name}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Güncel seri</Text>
        <Text style={styles.cardValue}>{profile.data.current_streak} gün</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Son kilo ölçümü</Text>
        {trend.isLoading ? (
          <ActivityIndicator />
        ) : weight?.last ? (
          <Text style={styles.cardValue}>
            {weight.last.value} kg
            <Text style={styles.cardMeta}> · {weight.last.date}</Text>
          </Text>
        ) : (
          <Text style={styles.cardMeta}>Henüz ölçüm yok — İlerleme sekmesinden ekleyin.</Text>
        )}
      </View>

      <SignOutButton />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e7',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  cardLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 13,
    opacity: 0.6,
    fontWeight: '400',
  },
  error: {
    color: '#c1121f',
    fontSize: 15,
  },
})
