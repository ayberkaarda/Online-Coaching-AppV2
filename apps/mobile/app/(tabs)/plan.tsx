import { Ionicons } from '@expo/vector-icons'
import { useWorkoutPlan } from '@repo/api-client'
import { DAY_NAMES } from '@repo/types'
import { useRouter } from 'expo-router'
import { View } from 'react-native'

import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionHeader,
} from '../../components/ui'
import { useTheme } from '../../lib/theme'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

// ANTRENMAN sekmesi (B-052 dilim 2 + Faz 4.7 zenginleştirme) — GERÇEK veri, salt okuma.
// ADR-0015 kart listesi + bölüm başlığı ikonu. Veri/hook mantığı DEĞİŞMEDİ.
//
// `useWorkoutPlan` aktif planı `workout_plans` + `workout_plan_exercises`'ten okuyup gün
// bazında `Record<gün, string>` şekline geri üretir (paketteki `rowsToWorkoutPlan`). Web ile
// AYNI hook, AYNI şekil; gün sırası tek kaynak `DAY_NAMES`'ten gelir.
export default function PlanScreen() {
  const theme = useTheme()
  const router = useRouter()
  const userId = useCurrentUserId()
  const plan = useWorkoutPlan(userId)

  if (plan.isLoading) {
    return (
      <Screen scroll={false} center>
        <LoadingState label="Antrenman planı yükleniyor" />
      </Screen>
    )
  }

  if (plan.isError || !plan.data) {
    return (
      <Screen>
        <ErrorState message="Antrenman planı yüklenemedi." onRetry={() => void plan.refetch()} />
      </Screen>
    )
  }

  const days = DAY_NAMES.filter((day) => plan.data[day].trim().length > 0)

  if (days.length === 0) {
    return (
      <Screen scroll={false} center>
        <EmptyState
          title="Aktif plan yok"
          description="Henüz aktif bir antrenman planınız yok. Koçunuz plan atadığında burada görünür."
          action={
            <Button
              title="Antrenmanı Başlat"
              onPress={() => router.push('/workout-session')}
              accessibilityLabel="Antrenman oturumu ekranına git"
            />
          }
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <SectionHeader icon="barbell" title={`ANTRENMAN PROGRAMI · ${days.length} GÜN`} />
      {days.map((day) => (
        <Card key={day}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="calendar-outline" size={16} color={theme.colors.accent} />
            <Badge label={day} tone="accent" />
          </View>
          <Body variant="body">{plan.data[day].trim()}</Body>
        </Card>
      ))}
      <Button
        title="Antrenmanı Başlat"
        onPress={() => router.push('/workout-session')}
        accessibilityLabel="Antrenman oturumu ekranına git"
      />
      <Button
        title="Periyodizasyon / Analiz"
        variant="secondary"
        onPress={() => router.push('/periodization')}
        accessibilityLabel="Periyodizasyon ve analiz ekranına git"
      />
    </Screen>
  )
}
