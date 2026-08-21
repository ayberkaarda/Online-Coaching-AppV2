import {
  summarizeMetric,
  useProgressTrend,
  useUpsertProgressEntry,
  validateProgressEntry,
  type ProgressEntryValues,
} from '@repo/api-client'
import { todayIsoDate } from '@repo/api-client/date'
import { useState } from 'react'
import { View } from 'react-native'

import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Mono,
  Screen,
  SectionHeader,
} from '../../components/ui'
import { useTheme } from '../../lib/theme'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

// İLERLEME sekmesi (B-052 dilim 3 + Faz 4.7 zenginleştirme) — tek YAZMA yolu: günün kilosu.
// ADR-0015 kimliği; sayılar IBM Plex Mono; bölüm başlığı ikonları. Doğrulama/mutation/hook
// mantığı DEĞİŞMEDİ.
//
// Web'deki `StatsTab`'in mantığı paket üzerinden mobilde tüketilir: `validateProgressEntry`
// (CHECK kısıtlarının istemci karşılığı), `useUpsertProgressEntry` (AC-4.1: aynı güne ikinci
// giriş satırı GÜNCELLER) ve `useProgressTrend` (AC-4.2: tek endpoint). Grafik KÜTÜPHANESİ
// eklenmedi (kapsam dışı) — trend, ölçüm noktalarının metinsel listesi olarak gösterilir.
export default function ProgressScreen() {
  const theme = useTheme()
  const userId = useCurrentUserId()
  const trend = useProgressTrend(userId)
  const upsert = useUpsertProgressEntry()
  const [weight, setWeight] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSave() {
    if (!userId) return
    const parsed = Number(weight.replace(',', '.'))
    const values: ProgressEntryValues = {
      weight_kg: Number.isFinite(parsed) ? parsed : null,
      waist_cm: null,
      chest_cm: null,
      arm_cm: null,
      thigh_cm: null,
      hip_cm: null,
      notes: null,
    }
    const message = validateProgressEntry(values)
    setValidationError(message)
    if (message) return

    upsert.mutate(
      { clientId: userId, entryDate: todayIsoDate(), ...values },
      { onSuccess: () => setWeight('') }
    )
  }

  const summary = trend.data ? summarizeMetric(trend.data, 'weight_kg') : null
  // En yeni ölçüm en üstte: trend noktaları eskiden yeniye sıralı; ters çevir.
  const measured = trend.data
    ? trend.data.points
        .filter((point) => point.weight_kg !== null)
        .slice()
        .reverse()
    : []

  const delta = summary?.delta
  const hasDelta = delta !== null && delta !== undefined

  return (
    <Screen>
      <SectionHeader icon="scale" title="GÜNLÜK KİLO KAYDI" />
      <Card variant="panel">
        <Input
          label="BUGÜNÜN KİLOSU (KG)"
          placeholder="Örn. 72.5"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          editable={!upsert.isPending}
          error={validationError}
          mono
        />
        <Button
          title="Kilo ekle"
          onPress={handleSave}
          pending={upsert.isPending}
          disabled={weight.trim().length === 0}
          accessibilityLabel="Bugünün kilosunu kaydet"
        />
      </Card>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionHeader icon="trending-up" title="SON 30 GÜN" />
        {hasDelta ? (
          <Badge
            label={`${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg · ${summary?.count} ölçüm`}
            tone={delta > 0 ? 'warning' : 'success'}
          />
        ) : null}
      </View>

      {trend.isLoading ? (
        <LoadingState label="Trend yükleniyor" />
      ) : trend.isError ? (
        <ErrorState message="Trend yüklenemedi." onRetry={() => void trend.refetch()} />
      ) : measured.length === 0 ? (
        <EmptyState
          title="Ölçüm yok"
          description="Bu aralıkta kilo ölçümü bulunmuyor. Yukarıdan ilk kaydını ekle."
        />
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {measured.map((point, index) => (
            <View
              key={point.date}
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
                {point.label}
              </Body>
              <Mono variant="monoMd">{point.weight_kg} kg</Mono>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  )
}
