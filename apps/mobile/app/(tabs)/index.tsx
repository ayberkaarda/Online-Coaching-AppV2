import { Ionicons } from '@expo/vector-icons'
import { summarizeMetric, useProfile, useProgressTrend, useWorkoutPlan } from '@repo/api-client'
import { DAY_NAMES } from '@repo/types'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { SettingsSheet } from '../../components/SettingsSheet'
import {
  Badge,
  Body,
  Card,
  ErrorState,
  Heading,
  IconButton,
  LoadingState,
  Mono,
  ProgressRing,
  Screen,
  SectionHeader,
} from '../../components/ui'
import { useTheme } from '../../lib/theme'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

// PANEL sekmesi (B-052 dilim 2 + Faz 4.7 zenginleştirme) — GERÇEK veriye bağlı, salt okuma.
// Hero = imza HALKA (ADR-0017 haftalık döngü); etrafı gerçek dashboard: bugünkü antrenman,
// son kilo, hızlı kilo-ekle eylemi. Çıkış Panel gövdesinden çıkarıldı → ayar sheet'ine taşındı.
// YENİ veri/hook UYDURULMADI: bugünkü antrenman mevcut useWorkoutPlan verisinden çıkarılır.
const WEEK_LENGTH = 7
const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

/** Bugünün DAY_NAMES adı (Pazartesi-başlangıçlı; JS getDay 0=Pazar). */
function todayDayName(): (typeof DAY_NAMES)[number] {
  const jsDay = new Date().getDay()
  // (jsDay + 6) % 7 her zaman 0–6; yine de noUncheckedIndexedAccess için güvenli fallback.
  return DAY_NAMES[(jsDay + 6) % 7] ?? 'Pazartesi'
}

/** "21 Ağustos · Perşembe" — Intl'e güvenmeden (Hermes) elle biçimlenir. */
function todayLabel() {
  const now = new Date()
  return `${now.getDate()} ${MONTHS_TR[now.getMonth()]} · ${todayDayName()}`
}

export default function DashboardScreen() {
  const theme = useTheme()
  const router = useRouter()
  const userId = useCurrentUserId()
  const profile = useProfile(userId)
  const trend = useProgressTrend(userId)
  const plan = useWorkoutPlan(userId)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (profile.isLoading) {
    return (
      <Screen scroll={false} center edgeTop>
        <LoadingState label="Panel yükleniyor" />
      </Screen>
    )
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen edgeTop>
        <ErrorState message="Profil yüklenemedi." onRetry={() => void profile.refetch()} />
      </Screen>
    )
  }

  const streak = profile.data.current_streak
  const weekProgress = Math.min(streak, WEEK_LENGTH)
  const weight = trend.data ? summarizeMetric(trend.data, 'weight_kg') : null

  const today = todayDayName()
  const todayWorkout = plan.data ? plan.data[today].trim() : ''

  return (
    <Screen edgeTop>
      {/* Başlık satırı: karşılama + tarih | ayar dişlisi */}
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Heading variant="displayLg">{profile.data.full_name}</Heading>
          <Body variant="bodySm" color="textSecondary">
            {todayLabel()}
          </Body>
        </View>
        <IconButton
          name="settings-outline"
          onPress={() => setSettingsOpen(true)}
          accessibilityLabel="Ayarlar menüsünü aç"
        />
      </View>

      {/* HERO — haftalık döngü halkası (ADR-0017 #1) */}
      <Card variant="panel" style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
        <SectionHeader icon="sync" title="HAFTALIK DÖNGÜ" />
        <ProgressRing
          value={weekProgress}
          max={WEEK_LENGTH}
          segments={WEEK_LENGTH}
          celebrating={weekProgress >= WEEK_LENGTH}
          label="Haftalık döngü serisi"
          valueText={`${weekProgress} / ${WEEK_LENGTH} gün`}
        >
          <Mono variant="monoLg">{streak}</Mono>
          <Body variant="bodySm" color="textSecondary">
            gün seri
          </Body>
        </ProgressRing>
      </Card>

      {/* Bugünkü antrenman — mevcut plan verisinden bugünün günü */}
      <View style={{ gap: 8 }}>
        <SectionHeader icon="barbell" title="BUGÜNKÜ ANTRENMAN" />
        <Card>
          {plan.isLoading ? (
            <Body variant="bodySm" color="textSecondary">
              Yükleniyor…
            </Body>
          ) : todayWorkout.length > 0 ? (
            <>
              <Badge label={today} tone="accent" />
              <Body variant="body" numberOfLines={4}>
                {todayWorkout}
              </Body>
              <Pressable
                onPress={() => router.navigate('/plan')}
                accessibilityRole="link"
                accessibilityLabel="Antrenman planını aç"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
              >
                <Body variant="bodySm" color="accent">
                  Planın tamamı
                </Body>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.accent} />
              </Pressable>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="bed-outline" size={22} color={theme.colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Body variant="bodyMedium">Bugün dinlenme</Body>
                <Body variant="bodySm" color="textSecondary">
                  {today} için plan yok. İyi bir toparlanma günü.
                </Body>
              </View>
            </View>
          )}
        </Card>
      </View>

      {/* Son kilo ölçümü */}
      <View style={{ gap: 8 }}>
        <SectionHeader icon="scale" title="SON KİLO ÖLÇÜMÜ" />
        <Card>
          {weight?.last ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}
            >
              <Mono variant="monoLg" color="textPrimary">
                {weight.last.value}
                <Mono variant="monoMd" color="textSecondary">
                  {' '}
                  kg
                </Mono>
              </Mono>
              <Badge label={weight.last.date} tone="neutral" />
            </View>
          ) : (
            <Body variant="bodySm" color="textSecondary">
              Henüz ölçüm yok — aşağıdan ilk kaydını ekle.
            </Body>
          )}
        </Card>
      </View>

      {/* Hızlı eylem — İlerleme sekmesine götürür (mevcut akış) */}
      <Pressable
        onPress={() => router.navigate('/progress')}
        accessibilityRole="button"
        accessibilityLabel="Kilo ekle ekranına git"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.control,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={24} color={theme.colors.accentContrast} />
          </View>
          <View style={{ flex: 1 }}>
            <Body variant="bodyMedium">Kilo ekle</Body>
            <Body variant="bodySm" color="textSecondary">
              Bugünün ölçümünü gir
            </Body>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </Card>
      </Pressable>

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={profile.data.full_name}
      />
    </Screen>
  )
}
