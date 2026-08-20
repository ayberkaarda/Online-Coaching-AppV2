import { useWorkoutPlan } from '@repo/api-client'
import { DAY_NAMES } from '@repo/types'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useCurrentUserId } from '../../lib/useCurrentUserId'

// ANTRENMAN sekmesi (B-052 dilim 2) — GERÇEK veri, salt okuma.
//
// `useWorkoutPlan` aktif planı `workout_plans` + `workout_plan_exercises`'ten okuyup gün
// bazında `Record<gün, string>` şekline geri üretir (paketteki `rowsToWorkoutPlan`). Web ile
// AYNI hook, AYNI şekil; gün sırası tek kaynak `DAY_NAMES`'ten gelir.
export default function PlanScreen() {
  const userId = useCurrentUserId()
  const plan = useWorkoutPlan(userId)

  if (plan.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (plan.isError || !plan.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>Antrenman planı yüklenemedi.</Text>
      </View>
    )
  }

  const days = DAY_NAMES.filter((day) => plan.data[day].trim().length > 0)

  if (days.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Henüz aktif bir antrenman planınız yok.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {days.map((day) => (
        <View key={day} style={styles.dayCard}>
          <Text style={styles.dayTitle}>{day}</Text>
          <Text style={styles.dayBody}>{plan.data[day].trim()}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dayCard: {
    borderWidth: 1,
    borderColor: '#e2e2e7',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  dayTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  dayBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    color: '#c1121f',
    fontSize: 15,
  },
  empty: {
    fontSize: 15,
    opacity: 0.6,
    textAlign: 'center',
  },
})
