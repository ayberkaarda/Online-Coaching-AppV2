import { Ionicons } from '@expo/vector-icons'
import {
  useMesocycles,
  useWorkoutLogs,
  useWorkoutPlanExercises,
  type PlanExerciseRow,
} from '@repo/api-client'
import { estimate1RM, rpeToPercent } from '@repo/domain'
import { DAY_NAMES, isDayName, type DayName, type Tables, type WorkoutLog } from '@repo/types'
import { Stack } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'

import {
  Badge,
  Body,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Mono,
  Screen,
  SectionHeader,
} from '../components/ui'
import { useTheme } from '../lib/theme'
import { useCurrentUserId } from '../lib/useCurrentUserId'

// PERİYODİZASYON / ANALİZ ekranı (C2) — salt-okur, ONLINE. `(tabs)` DIŞINDA kök `app/`
// altında bir stack ekranı (bkz. sign-in.tsx/step-up.tsx deseni); `_layout.tsx`'e
// KAYITLI DEĞİL — expo-router dosya tabanlı routing'te bu, gate'siz erişilebilir bir
// stack ekranı üretir, `router.push('/periodization')` yeterlidir.
//
// Üç BAĞIMSIZ veri kaynağı ayrı ayrı yükleniyor/hata/boş ele alınır — biri (örn.
// mezosiklü) boş/hatalı olsa da diğerleri (haftalık plan, egzersiz rekorları) kendi
// başına çalışmaya devam eder:
//   1. `useMesocycles` (paket) — periyodizasyon özeti (ad/hafta/deload/hedef).
//   2. `useWorkoutPlanExercises` (paket, `useWorkoutSession.ts`) — AC-2.4 gereği ham
//      Supabase tablo sorguları yalnızca `packages/api-client` içinde kalmalı; bu ekran
//      KENDİ sorgusunu açmaz, gym modunun zaten kullandığı hook'u tüketir (`target_rpe` /
//      `target_percent_1rm` bu checkpoint'te hook'a eklendi). FLAT `PlanExerciseRow[]`
//      döner — gün bazlı gruplama burada (saf, Supabase'siz) yapılır.
//   3. `useWorkoutLogs` (paket) — egzersiz başına tahmini 1RM (Epley, `@repo/domain`).

/** `PlanExerciseRow[]`'u gün bazında gruplar, her grubu `position`'a göre sıralar. SAF fonksiyon. */
function groupPlanExercisesByDay(
  rows: readonly PlanExerciseRow[] | null | undefined
): Partial<Record<DayName, PlanExerciseRow[]>> {
  const byDay: Partial<Record<DayName, PlanExerciseRow[]>> = {}
  if (!rows || rows.length === 0) return byDay

  const buckets = new Map<DayName, PlanExerciseRow[]>()
  for (const row of rows) {
    if (!isDayName(row.day)) continue
    const bucket = buckets.get(row.day)
    if (bucket) bucket.push(row)
    else buckets.set(row.day, [row])
  }

  for (const day of DAY_NAMES) {
    const bucket = buckets.get(day)
    if (!bucket) continue
    byDay[day] = bucket.slice().sort((a, b) => a.position - b.position)
  }

  return byDay
}

const GOAL_LABEL: Record<Tables<'mesocycles'>['goal'], string> = {
  bulk: 'Kütle',
  cut: 'Kesim / Yağ Yakımı',
  recomp: 'Rekompozisyon',
  contest_prep: 'Yarışma Hazırlığı',
}

/** Setin ağırlık+tekrarından Epley 1RM'i; egzersiz adı bazında EN YÜKSEK tahmini tutar. */
function bestEstimated1RmByExercise(
  logs: readonly WorkoutLog[] | null | undefined
): Map<string, number> {
  const best = new Map<string, number>()
  if (!logs) return best
  for (const log of logs) {
    if (log.weight_kg === null || log.reps === null || log.reps < 1) continue
    const estimate = estimate1RM(log.weight_kg, log.reps, 'epley')
    const current = best.get(log.exercise_name)
    if (current === undefined || estimate > current) best.set(log.exercise_name, estimate)
  }
  return best
}

/** Plandaki TÜM günlerden benzersiz egzersiz etiketleri (isim varsa isim, yoksa ham satır). */
function uniqueExerciseLabels(byDay: Partial<Record<DayName, PlanExerciseRow[]>>): string[] {
  const labels = new Set<string>()
  for (const day of DAY_NAMES) {
    const rows = byDay[day]
    if (!rows) continue
    for (const row of rows) {
      const label = (row.name ?? row.raw_line).trim()
      if (label.length > 0) labels.add(label)
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'tr'))
}

/** "3×10" — yalnızca ikisi de doluysa. */
function formatSetsReps(row: PlanExerciseRow): string | null {
  if (row.target_sets === null || row.target_reps === null) return null
  return `${row.target_sets}×${row.target_reps}`
}

/**
 * "%75" (doğrudan kolon) ya da "%70 (RPE 8)" (RPE + tekrardan TÜRETİLMİŞ) — sırasıyla.
 * `rpeToPercent` 1–10 dışı RPE'de RangeError fırlatır; aralık guard'ı ile korunur.
 */
function formatPercent1Rm(row: PlanExerciseRow): string | null {
  if (row.target_percent_1rm !== null) return `%${row.target_percent_1rm}`
  if (row.target_rpe === null || row.target_reps === null) return null
  if (row.target_rpe < 1 || row.target_rpe > 10) return null
  const percent = rpeToPercent(row.target_rpe, row.target_reps)
  return `%${percent.toFixed(0)} (RPE ${row.target_rpe})`
}

export default function PeriodizationScreen() {
  const theme = useTheme()
  const userId = useCurrentUserId()
  const mesocycles = useMesocycles(userId)
  const plan = useWorkoutPlanExercises(userId)
  const logs = useWorkoutLogs(userId)

  const e1rmByExercise = useMemo(() => bestEstimated1RmByExercise(logs.data), [logs.data])
  const byDay = useMemo(() => groupPlanExercisesByDay(plan.data), [plan.data])
  const planDays = DAY_NAMES.filter((day) => (byDay[day]?.length ?? 0) > 0)
  const exerciseLabels = useMemo(() => uniqueExerciseLabels(byDay), [byDay])

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Periyodizasyon' }} />

      <SectionHeader icon="layers-outline" title="MEZOSİKLÜLER" />
      {mesocycles.isLoading ? (
        <LoadingState label="Mezosiklüler yükleniyor" />
      ) : mesocycles.isError ? (
        <ErrorState message="Mezosiklüler yüklenemedi." onRetry={() => void mesocycles.refetch()} />
      ) : (mesocycles.data ?? []).length === 0 ? (
        <EmptyState
          title="Periyodizasyon tanımlı değil"
          description="Bu plan için periyodizasyon tanımlı değil."
        />
      ) : (
        (mesocycles.data ?? []).map((meso) => (
          <Card key={meso.id}>
            <Heading variant="displaySm">{meso.name}</Heading>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Badge label={`${meso.weeks} hafta`} tone="accent" />
              {meso.deload_week !== null ? (
                <Badge label={`${meso.deload_week}. hafta deload`} tone="warning" />
              ) : null}
              <Badge label={GOAL_LABEL[meso.goal]} tone="neutral" />
            </View>
          </Card>
        ))
      )}

      <SectionHeader icon="calendar-outline" title="HAFTALIK PLAN" />
      {plan.isLoading ? (
        <LoadingState label="Haftalık plan yükleniyor" />
      ) : plan.isError ? (
        <ErrorState
          message={plan.error instanceof Error ? plan.error.message : 'Plan yüklenemedi.'}
          onRetry={() => void plan.refetch()}
        />
      ) : planDays.length === 0 ? (
        <EmptyState title="Aktif plan yok" description="Henüz aktif bir antrenman planınız yok." />
      ) : (
        planDays.map((day) => (
          <Card key={day}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.accent} />
              <Badge label={day} tone="accent" />
            </View>
            {(byDay[day] ?? []).map((row) => {
              const label = row.name?.trim() || row.raw_line.trim()
              const setsReps = formatSetsReps(row)
              const percent = formatPercent1Rm(row)
              return (
                <View key={row.id} style={{ gap: 2 }}>
                  <Body variant="bodyMedium">{label}</Body>
                  {setsReps || percent ? (
                    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                      {setsReps ? (
                        <Mono variant="monoSm" color="textSecondary">
                          {setsReps}
                        </Mono>
                      ) : null}
                      {percent ? (
                        <Mono variant="monoSm" color="textSecondary">
                          {percent}
                        </Mono>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </Card>
        ))
      )}

      {exerciseLabels.length > 0 ? (
        <>
          <SectionHeader icon="stats-chart" title="EGZERSİZ REKORLARI · TAHMİNİ 1RM" />
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {exerciseLabels.map((label, index) => {
              const value = e1rmByExercise.get(label)
              return (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                  }}
                >
                  <Body variant="bodySm" color="textSecondary">
                    {label}
                  </Body>
                  <Mono variant="monoMd">
                    {value !== undefined ? `${value.toFixed(1)} kg` : '—'}
                  </Mono>
                </View>
              )
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  )
}
