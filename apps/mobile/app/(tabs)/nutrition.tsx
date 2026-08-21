import {
  sumNutritionLogsForDate,
  useCreateNutritionLog,
  useDeleteNutritionLog,
  useNutritionLogs,
  useNutritionTargets,
  type NutritionLog,
  type NutritionTotals,
} from '@repo/api-client'
import { todayIsoDate } from '@repo/api-client/date'
import { useState } from 'react'
import { View } from 'react-native'

import {
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  LoadingState,
  Mono,
  Screen,
  SectionHeader,
} from '../../components/ui'
import { useTheme } from '../../lib/theme'
import { useCurrentUserId } from '../../lib/useCurrentUserId'

// BESLENME sekmesi (B-066) — danışan-odaklı minimum çekirdek: bugünün makro
// ilerlemesi, bugünün öğün listesi, öğün ekleme formu. Koç-yüzü işler (AI diyet
// üretimi, makro hedef CRUD, yiyecek katalog araması) KAPSAM DIŞI — bunlar web'in
// koç tarafında kalır. Hedef alanları `number | null`: `null` = "koç hedef
// vermedi" ve bu `0`'dan AYRI tutulur (bkz. `useNutritionTargets` dosya notu) —
// hedefi olmayan makroda ilerleme çubuğu YERİNE "Hedef verilmedi" metni gösterilir.
// Halka (ProgressRing) burada KULLANILMAZ (ADR-0017 tek anlam — halka yalnız
// Panel'deki haftalık döngü).

const MACRO_ROWS: ReadonlyArray<{
  key: keyof NutritionTotals
  label: string
  unit: string
}> = [
  { key: 'kcal', label: 'KALORİ', unit: 'kcal' },
  { key: 'protein_g', label: 'PROTEİN', unit: 'g' },
  { key: 'carb_g', label: 'KARBONHİDRAT', unit: 'g' },
  { key: 'fat_g', label: 'YAĞ', unit: 'g' },
]

/** Boş girişi `null`e çevirir; ASLA `0`a düşürmez (kullanıcı hiçbir şey girmemiştir). */
function parseOptionalNumber(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** Bir öğün satırının makro özeti — girilmemiş alanlar atlanır. */
function formatMacroLine(log: NutritionLog): string {
  const parts: string[] = []
  if (log.kcal !== null) parts.push(`${log.kcal} kcal`)
  if (log.protein_g !== null) parts.push(`P ${log.protein_g}g`)
  if (log.carb_g !== null) parts.push(`K ${log.carb_g}g`)
  if (log.fat_g !== null) parts.push(`Y ${log.fat_g}g`)
  return parts.length > 0 ? parts.join(' · ') : 'Makro girilmedi'
}

/** Tek makro satırı: hedef varsa ilerleme çubuğu, yoksa "Hedef verilmedi". */
function MacroProgressRow({
  label,
  unit,
  value,
  target,
}: {
  label: string
  unit: string
  value: number
  target: number | null
}) {
  const theme = useTheme()
  const hasTarget = target !== null
  const percent = hasTarget ? (target > 0 ? Math.min(100, (value / target) * 100) : 100) : 0

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Body variant="label" color="textSecondary">
          {label}
        </Body>
        {hasTarget ? (
          <Mono variant="monoSm">
            {value} / {target} {unit}
          </Mono>
        ) : (
          <Body variant="bodySm" color="textSecondary">
            Hedef verilmedi
          </Body>
        )}
      </View>
      {hasTarget ? (
        <View
          style={{
            height: 6,
            borderRadius: theme.radius.control,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${percent}%`,
              height: '100%',
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.control,
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

export default function NutritionScreen() {
  const userId = useCurrentUserId()
  const logs = useNutritionLogs(userId)
  const targets = useNutritionTargets(userId)
  const createLog = useCreateNutritionLog()
  const deleteLog = useDeleteNutritionLog()

  const [description, setDescription] = useState('')
  const [kcalText, setKcalText] = useState('')
  const [proteinText, setProteinText] = useState('')
  const [carbText, setCarbText] = useState('')
  const [fatText, setFatText] = useState('')

  const today = todayIsoDate()
  const todaysLogs = (logs.data ?? []).filter((log) => log.log_date === today)
  const totals = sumNutritionLogsForDate(logs.data ?? [], today)

  function handleAddMeal() {
    if (!userId) return
    const trimmedDescription = description.trim()
    if (trimmedDescription.length === 0) return

    createLog.mutate(
      {
        clientId: userId,
        description: trimmedDescription,
        kcal: parseOptionalNumber(kcalText),
        protein_g: parseOptionalNumber(proteinText),
        carb_g: parseOptionalNumber(carbText),
        fat_g: parseOptionalNumber(fatText),
        log_date: today,
      },
      {
        onSuccess: () => {
          setDescription('')
          setKcalText('')
          setProteinText('')
          setCarbText('')
          setFatText('')
        },
      }
    )
  }

  function handleDeleteMeal(id: string) {
    if (!userId) return
    deleteLog.mutate({ id, clientId: userId })
  }

  return (
    <Screen>
      {/* Bugünün makro ilerlemesi */}
      <SectionHeader icon="flame" title="BUGÜNÜN MAKROLARI" />
      {targets.isLoading ? (
        <LoadingState label="Hedefler yükleniyor" />
      ) : targets.isError ? (
        <ErrorState message="Makro hedefleri yüklenemedi." onRetry={() => void targets.refetch()} />
      ) : (
        <Card variant="panel" style={{ gap: 16 }}>
          {MACRO_ROWS.map((row) => (
            <MacroProgressRow
              key={row.key}
              label={row.label}
              unit={row.unit}
              value={totals[row.key]}
              target={targets.data ? targets.data[row.key] : null}
            />
          ))}
        </Card>
      )}

      {/* Bugünün öğün listesi */}
      <SectionHeader icon="restaurant" title="BUGÜNÜN ÖĞÜNLERİ" />
      {logs.isLoading ? (
        <LoadingState label="Öğünler yükleniyor" />
      ) : logs.isError ? (
        <ErrorState message="Öğünler yüklenemedi." onRetry={() => void logs.refetch()} />
      ) : todaysLogs.length === 0 ? (
        <EmptyState
          title="Bugün henüz öğün eklenmedi"
          description="Aşağıdaki formdan ilk öğününü ekle."
        />
      ) : (
        <View style={{ gap: 8 }}>
          {todaysLogs.map((log) => (
            <Card key={log.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Body variant="bodyMedium">{log.description}</Body>
                <Body variant="bodySm" color="textSecondary">
                  {formatMacroLine(log)}
                </Body>
              </View>
              <IconButton
                name="trash-outline"
                color="danger"
                size={20}
                onPress={() => handleDeleteMeal(log.id)}
                accessibilityLabel={`${log.description} kaydını sil`}
              />
            </Card>
          ))}
        </View>
      )}

      {/* Öğün ekle formu */}
      <SectionHeader icon="add-circle" title="ÖĞÜN EKLE" />
      <Card variant="panel">
        <Input
          label="AÇIKLAMA"
          placeholder="Örn. Izgara tavuk + pilav"
          value={description}
          onChangeText={setDescription}
          editable={!createLog.isPending}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input
            label="KALORİ (KCAL)"
            placeholder="Örn. 450"
            keyboardType="numeric"
            value={kcalText}
            onChangeText={setKcalText}
            editable={!createLog.isPending}
            containerStyle={{ flex: 1 }}
            mono
          />
          <Input
            label="PROTEİN (G)"
            placeholder="Örn. 30"
            keyboardType="numeric"
            value={proteinText}
            onChangeText={setProteinText}
            editable={!createLog.isPending}
            containerStyle={{ flex: 1 }}
            mono
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input
            label="KARBONHİDRAT (G)"
            placeholder="Örn. 40"
            keyboardType="numeric"
            value={carbText}
            onChangeText={setCarbText}
            editable={!createLog.isPending}
            containerStyle={{ flex: 1 }}
            mono
          />
          <Input
            label="YAĞ (G)"
            placeholder="Örn. 15"
            keyboardType="numeric"
            value={fatText}
            onChangeText={setFatText}
            editable={!createLog.isPending}
            containerStyle={{ flex: 1 }}
            mono
          />
        </View>
        <Button
          title="Öğün ekle"
          onPress={handleAddMeal}
          pending={createLog.isPending}
          disabled={description.trim().length === 0}
          accessibilityLabel="Bugüne öğün ekle"
        />
      </Card>
    </Screen>
  )
}
