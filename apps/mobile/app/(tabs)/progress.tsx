import {
  summarizeMetric,
  useProgressTrend,
  useUpsertProgressEntry,
  validateProgressEntry,
  type ProgressEntryValues,
} from '@repo/api-client'
import { todayIsoDate } from '@repo/api-client/date'
import { useState } from 'react'
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import { useCurrentUserId } from '../../lib/useCurrentUserId'

// İLERLEME sekmesi (B-052 dilim 3) — tek YAZMA yolu: günün kilosu.
//
// Web'deki `StatsTab`'in mantığı paket üzerinden mobilde tüketilir: `validateProgressEntry`
// (CHECK kısıtlarının istemci karşılığı), `useUpsertProgressEntry` (AC-4.1: aynı güne ikinci
// giriş satırı GÜNCELLER) ve `useProgressTrend` (AC-4.2: tek endpoint). Grafik KÜTÜPHANESİ
// eklenmedi (kapsam dışı) — trend, ölçüm noktalarının metinsel listesi olarak gösterilir.
export default function ProgressScreen() {
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Bugünün kilosu (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn. 72.5"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          editable={!upsert.isPending}
        />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        {upsert.isPending ? (
          <ActivityIndicator />
        ) : (
          <Button title="Kaydet" onPress={handleSave} disabled={weight.trim().length === 0} />
        )}
      </View>

      <Text style={styles.sectionTitle}>Son 30 gün</Text>

      {trend.isLoading ? (
        <ActivityIndicator />
      ) : trend.isError ? (
        <Text style={styles.error}>Trend yüklenemedi.</Text>
      ) : measured.length === 0 ? (
        <Text style={styles.empty}>Bu aralıkta ölçüm yok.</Text>
      ) : (
        <>
          {summary?.delta !== null && summary?.delta !== undefined ? (
            <Text style={styles.delta}>
              Değişim: {summary.delta > 0 ? '+' : ''}
              {summary.delta.toFixed(1)} kg ({summary.count} ölçüm)
            </Text>
          ) : null}
          {measured.map((point) => (
            <View key={point.date} style={styles.row}>
              <Text style={styles.rowDate}>{point.label}</Text>
              <Text style={styles.rowValue}>{point.weight_kg} kg</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e2e7',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  cardLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c7c7cc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  delta: {
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e2e7',
  },
  rowDate: {
    fontSize: 15,
    opacity: 0.7,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#c1121f',
    fontSize: 14,
  },
  empty: {
    fontSize: 15,
    opacity: 0.6,
  },
})
