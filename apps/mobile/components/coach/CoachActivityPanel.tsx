import {
  activityEventLabel,
  formatDurationLabel,
  useCoachActivitySummary,
  type ActivityEventType,
} from '@repo/api-client'
import { View } from 'react-native'

import { useTheme } from '../../lib/theme'
import { Badge, Body, Card, EmptyState, ErrorState, LoadingState, Mono, SectionHeader } from '../ui'

// KOÇ AKTİVİTE ÖZETİ (ADR-0028 yetenek 1) — SALT OKUR. Tek veri kaynağı
// `useCoachActivitySummary` → `coach_activity_summary` RPC'sidir; GÜN hassasiyetinde döner,
// saat/dakika DAMGASI ne ağdan iner ne render edilir (§7c mahremiyet sınırı, bkz. useActivityLog).
// Halka (ProgressRing) BURADA KULLANILMAZ — o yalnız danışan haftalık döngüsüdür (ADR-0017).

const WINDOW_DAYS = 14

/** "21 Ağu" — RPC'nin `YYYY-MM-DD` gün değeri için kısa, Intl'siz etiket. */
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

function shortDay(isoDate: string): string {
  // `YYYY-MM-DD` — parçalardan biçimle (yerel gün kayması olmadan; RPC zaten yerel günü verir).
  const [y, m, d] = isoDate.split('-').map((part) => Number(part))
  if (!y || !m || !d) return isoDate
  return `${d} ${MONTHS_SHORT[m - 1] ?? ''}`
}

export function CoachActivityPanel({ clientId }: { clientId: string }) {
  const theme = useTheme()
  const summary = useCoachActivitySummary(clientId, { days: WINDOW_DAYS })

  if (summary.isLoading) {
    return <LoadingState label="Aktivite yükleniyor" />
  }

  if (summary.isError) {
    return (
      <ErrorState message="Aktivite özeti yüklenemedi." onRetry={() => void summary.refetch()} />
    )
  }

  const days = summary.data?.days ?? []
  const lastActive = summary.data?.lastActiveDate ?? null

  if (days.length === 0) {
    return (
      <EmptyState
        title="Aktivite yok"
        description="Bu danışanın son 14 günde kayıtlı aktivitesi yok (rıza verilmemiş de olabilir)."
      />
    )
  }

  const totalSec = days.reduce((acc, day) => acc + day.totalDurationSec, 0)
  const eventTotals: Partial<Record<ActivityEventType, number>> = {}
  for (const day of days) {
    for (const [key, count] of Object.entries(day.eventCounts)) {
      const type = key as ActivityEventType
      eventTotals[type] = (eventTotals[type] ?? 0) + (count ?? 0)
    }
  }
  const eventRows = Object.entries(eventTotals).filter(([, count]) => (count ?? 0) > 0)

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card variant="panel">
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 2 }}>
            <Body variant="bodySm" color="textSecondary">
              Son 14 gün toplam süre
            </Body>
            <Mono variant="monoLg">{formatDurationLabel(totalSec)}</Mono>
          </View>
          {lastActive ? (
            <Badge label={`Son aktif · ${shortDay(lastActive)}`} tone="accent" />
          ) : null}
        </View>
      </Card>

      {eventRows.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader icon="pulse-outline" title="OLAY DÖKÜMÜ" />
          <Card>
            {eventRows.map(([key, count], index) => (
              <View
                key={key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: theme.spacing.xs,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Body variant="bodySm" color="textSecondary">
                  {activityEventLabel(key)}
                </Body>
                <Mono variant="monoSm">{count}</Mono>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader icon="calendar-outline" title="GÜNLÜK" />
        <Card>
          {days.map((day, index) => (
            <View
              key={day.date}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: theme.spacing.xs,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Body variant="bodySm">{shortDay(day.date)}</Body>
              <Mono variant="monoSm" color="textSecondary">
                {formatDurationLabel(day.totalDurationSec)}
              </Mono>
            </View>
          ))}
        </Card>
      </View>
    </View>
  )
}
