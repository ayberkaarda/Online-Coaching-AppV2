import { Ionicons } from '@expo/vector-icons'
import {
  rowsToSessionExercises,
  useCompleteWorkoutSession,
  useCreateWorkoutSet,
  useStartWorkoutSession,
  useWorkoutPlanExercises,
  type SessionExercise,
} from '@repo/api-client'
import type { WorkoutLogInsert } from '@repo/api-client/api/workout-session'
import { DAY_NAMES, type DayName, type Tables } from '@repo/types'
import { Stack } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Mono,
  Screen,
  SectionHeader,
} from '../components/ui'
import { useTheme } from '../lib/theme'
import { useCurrentUserId } from '../lib/useCurrentUserId'

// AKTİF ANTRENMAN / GRANÜLER GÜNLÜK ekranı (C3) — "İmza Dilimi" Tur 2. ÖNCE SAF ONLINE
// (Fable kararı): oturum başlatma + set yazımı C1'in yeni hook'larıyla DOĞRUDAN sunucuya
// gider. C4 (sonraki checkpoint) bu yazımı offline kuyruğa bağlayacak — bu yüzden set
// yazımının TAMAMI `logSet` TEK yerel handler'ından geçer (aşağıda işaretli), C4 yalnızca
// o fonksiyonun GÖVDESİNİ bir kuyruk/flush adımıyla değiştirecek, çağrı yerlerine dokunmaz.
//
// `periodization.tsx` (C2) İLE AYNI konum deseni: `(tabs)` DIŞINDA kök `app/` altında bir
// stack ekranı, `_layout.tsx`'e KAYITLI DEĞİL — expo-router dosya tabanlı routing'te bu
// gate'siz erişilebilir bir ekran üretir, `router.push('/workout-session')` yeterlidir.
//
// Kimlik disiplini korunur: token renk, Card/Input/Button/SectionHeader, gradyan yok. Bu
// ekrana özgü tek/RPE-RIR/set_type seçiciler `components/ui/**`e EKLENMEDİ (görev kapsamı
// bu paketi yasaklıyor) — yerel, küçük `Chip` ilkeliyle (IconButton'daki basılı-opaklık
// deseniyle BİREBİR) burada tanımlanır.

type IntensityMode = 'rpe' | 'rir'
type SetType = Tables<'workout_logs'>['set_type']

const SET_TYPE_OPTIONS: ReadonlyArray<{ value: SetType; label: string }> = [
  { value: 'warmup', label: 'Isınma' },
  { value: 'working', label: 'Çalışma' },
  { value: 'drop', label: 'Düşüş' },
  { value: 'failure', label: 'Başarısızlık' },
]

/** Bugünün `DayName`'i — yerel takvim günü, `Date#getDay()`'in Pazartesi-başlangıçlı karşılığı. */
function todayDayName(now: Date = new Date()): DayName {
  const jsDay = now.getDay() // 0 = Pazar … 6 = Cumartesi
  const index = (jsDay + 6) % 7 // 0 = Pazartesi … 6 = Pazar (DAY_NAMES sırası)
  return DAY_NAMES[index] ?? 'Pazartesi'
}

/** Seçilebilir küçük etiket — basılıyken opaklık düşer (IconButton deseni), seçiliyken accent dolgu. */
function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
          borderRadius: theme.radius.pill,
          paddingHorizontal: 14,
          paddingVertical: 8,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Body variant="bodySm" color={selected ? 'accentContrast' : 'textPrimary'}>
        {label}
      </Body>
    </Pressable>
  )
}

/** Girilmiş bir tekil set — logSet'e giden `WorkoutLogInsert` + gösterim için oturum-yerel id. */
interface LoggedSetEntry {
  localId: string
  row: WorkoutLogInsert
}

function formatLoggedSet(row: WorkoutLogInsert): string {
  const parts: string[] = []
  if (row.weight_kg !== null && row.weight_kg !== undefined) parts.push(`${row.weight_kg} kg`)
  if (row.reps !== null && row.reps !== undefined) parts.push(`${row.reps} tekrar`)
  if (row.rpe !== null && row.rpe !== undefined) parts.push(`RPE ${row.rpe}`)
  if (row.rir !== null && row.rir !== undefined) parts.push(`RIR ${row.rir}`)
  return parts.join(' · ')
}

export default function WorkoutSessionScreen() {
  const theme = useTheme()
  const userId = useCurrentUserId()

  const plan = useWorkoutPlanExercises(userId)
  const startSession = useStartWorkoutSession()
  const completeSession = useCompleteWorkoutSession(userId)
  const createSet = useCreateWorkoutSet()

  const todaysExercises = useMemo(
    () => rowsToSessionExercises(plan.data, todayDayName()),
    [plan.data]
  )

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionSource, setSessionSource] = useState<'freestyle' | 'program' | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null)
  const [freeExerciseName, setFreeExerciseName] = useState('')
  const [loggedSets, setLoggedSets] = useState<LoggedSetEntry[]>([])

  const [weightText, setWeightText] = useState('')
  const [repsText, setRepsText] = useState('')
  const [intensityMode, setIntensityMode] = useState<IntensityMode>('rpe')
  const [intensityText, setIntensityText] = useState('')
  const [setType, setSetType] = useState<SetType>('working')
  const [difficultyText, setDifficultyText] = useState('')

  const setsForSelectedExercise = selectedExercise
    ? loggedSets.filter((entry) => entry.row.exercise_name === selectedExercise.name)
    : []
  const nextSetNumber = setsForSelectedExercise.length + 1

  function handleStartSession(source: 'freestyle' | 'program') {
    if (!userId) return
    const id = crypto.randomUUID()
    // Oturum kimliği İSTEMCİDE üretilir ve HEMEN yerel state'e yazılır (offline-öncelikli
    // sözleşme — bkz. `insertWorkoutSession` başlığı): setler sunucu onayını beklemeden bu
    // id'yi referans alabilir; upsert İDEMPOTENT olduğu için ikinci deneme zararsızdır.
    setActiveSessionId(id)
    setSessionSource(source)
    setSelectedExercise(source === 'program' ? (todaysExercises[0] ?? null) : null)
    setLoggedSets([])
    startSession.mutate({
      id,
      client_id: userId,
      source,
      started_at: new Date().toISOString(),
    })
  }

  function selectPlanExercise(exercise: SessionExercise) {
    setSelectedExercise(exercise)
    setFreeExerciseName('')
  }

  function selectFreeExercise() {
    const trimmed = freeExerciseName.trim()
    if (trimmed.length === 0) return
    setSelectedExercise({ planExerciseId: null, name: trimmed, sets: 0, reps: 0, videoUrl: null })
  }

  /**
   * TEK yerel yazma noktası — set girişinin TAMAMI buradan geçer.
   * C4: offline kuyruk buraya bağlanacak (bu gövde bir kuyruğa `enqueue` ile değişecek,
   * çağrı yerleri — "Set ekle" butonu — DEĞİŞMEYECEK).
   */
  function logSet(row: WorkoutLogInsert) {
    setLoggedSets((prev) => [
      { localId: row.client_mutation_id ?? crypto.randomUUID(), row },
      ...prev,
    ])
    createSet.mutate(row)
  }

  function handleAddSet() {
    if (!userId || !activeSessionId || !selectedExercise) return
    const reps = Number(repsText.trim().replace(',', '.'))
    if (!Number.isFinite(reps) || reps <= 0) return

    const weightTrimmed = weightText.trim()
    const weight_kg = weightTrimmed.length > 0 ? Number(weightTrimmed.replace(',', '.')) : null

    const intensityTrimmed = intensityText.trim()
    const intensityValue =
      intensityTrimmed.length > 0 ? Number(intensityTrimmed.replace(',', '.')) : null
    const rpe = intensityMode === 'rpe' ? intensityValue : null
    const rir = intensityMode === 'rir' ? intensityValue : null

    const row: WorkoutLogInsert = {
      client_id: userId,
      session_id: activeSessionId,
      exercise_name: selectedExercise.name,
      plan_exercise_id: selectedExercise.planExerciseId,
      weight_kg: weight_kg !== null && Number.isFinite(weight_kg) ? weight_kg : null,
      reps,
      rpe: rpe !== null && Number.isFinite(rpe) ? rpe : null,
      rir: rir !== null && Number.isFinite(rir) ? rir : null,
      set_type: setType,
      set_number: nextSetNumber,
      client_mutation_id: crypto.randomUUID(),
    }

    logSet(row)
    setWeightText('')
    setRepsText('')
    setIntensityText('')
  }

  function handleCompleteSession() {
    if (!activeSessionId) return
    const difficultyTrimmed = difficultyText.trim()
    const perceived_difficulty =
      difficultyTrimmed.length > 0 ? Number(difficultyTrimmed.replace(',', '.')) : null

    completeSession.mutate({
      id: activeSessionId,
      ended_at: new Date().toISOString(),
      perceived_difficulty:
        perceived_difficulty !== null && Number.isFinite(perceived_difficulty)
          ? perceived_difficulty
          : null,
    })

    setActiveSessionId(null)
    setSessionSource(null)
    setSelectedExercise(null)
    setLoggedSets([])
    setDifficultyText('')
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Antrenman' }} />

      {activeSessionId === null ? (
        <>
          <SectionHeader icon="barbell-outline" title="OTURUM BAŞLAT" />
          {plan.isLoading ? (
            <LoadingState label="Plan yükleniyor" />
          ) : plan.isError ? (
            <ErrorState message="Plan yüklenemedi." onRetry={() => void plan.refetch()} />
          ) : (
            <Card>
              <Body variant="bodySm" color="textSecondary">
                {todaysExercises.length > 0
                  ? `Bugün (${todayDayName()}) için ${todaysExercises.length} egzersiz planlı.`
                  : 'Bugün için planlı bir egzersiz yok — serbest antrenman başlatabilirsin.'}
              </Body>
              <Button
                title="Bugünün Programını Başlat"
                onPress={() => handleStartSession('program')}
                disabled={todaysExercises.length === 0 || !userId}
                pending={startSession.isPending && sessionSource === 'program'}
                accessibilityLabel="Bugünün program egzersizleriyle antrenman başlat"
              />
              <Button
                title="Serbest Antrenman Başlat"
                variant="secondary"
                onPress={() => handleStartSession('freestyle')}
                disabled={!userId}
                pending={startSession.isPending && sessionSource === 'freestyle'}
                accessibilityLabel="Serbest antrenman başlat"
              />
            </Card>
          )}
        </>
      ) : (
        <>
          <SectionHeader icon="play-circle" title="AKTİF OTURUM" />
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={sessionSource === 'program' ? 'Program' : 'Serbest'} tone="accent" />
            <Body variant="bodySm" color="textSecondary">
              {loggedSets.length} set girildi
            </Body>
          </Card>

          <SectionHeader icon="list-outline" title="EGZERSİZ" />
          {sessionSource === 'program' && todaysExercises.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {todaysExercises.map((exercise) => (
                <Chip
                  key={exercise.planExerciseId ?? exercise.name}
                  label={`${exercise.name} · ${exercise.sets}×${exercise.reps}`}
                  selected={
                    selectedExercise?.planExerciseId === exercise.planExerciseId &&
                    selectedExercise?.name === exercise.name
                  }
                  onPress={() => selectPlanExercise(exercise)}
                />
              ))}
            </View>
          ) : null}
          <Card style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Input
              label="EK / SERBEST EGZERSİZ"
              placeholder="Örn. Barfiks"
              value={freeExerciseName}
              onChangeText={setFreeExerciseName}
              containerStyle={{ flex: 1 }}
            />
            <Button
              title="Seç"
              variant="secondary"
              onPress={selectFreeExercise}
              disabled={freeExerciseName.trim().length === 0}
              accessibilityLabel="Girilen egzersizi seç"
            />
          </Card>

          {selectedExercise ? (
            <>
              <SectionHeader icon="add-circle" title={`SET EKLE · ${selectedExercise.name}`} />
              <Card variant="panel">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="layers-outline" size={16} color={theme.colors.accent} />
                  <Mono variant="monoSm" color="textSecondary">
                    SET #{nextSetNumber}
                  </Mono>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Input
                    label="AĞIRLIK (KG)"
                    placeholder="Örn. 60"
                    keyboardType="numeric"
                    value={weightText}
                    onChangeText={setWeightText}
                    containerStyle={{ flex: 1 }}
                    mono
                  />
                  <Input
                    label="TEKRAR"
                    placeholder="Örn. 10"
                    keyboardType="numeric"
                    value={repsText}
                    onChangeText={setRepsText}
                    containerStyle={{ flex: 1 }}
                    mono
                  />
                </View>

                <Label>YOĞUNLUK</Label>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip
                    label="RPE"
                    selected={intensityMode === 'rpe'}
                    onPress={() => setIntensityMode('rpe')}
                  />
                  <Chip
                    label="RIR"
                    selected={intensityMode === 'rir'}
                    onPress={() => setIntensityMode('rir')}
                  />
                  <Input
                    placeholder={intensityMode === 'rpe' ? 'Örn. 8' : 'Örn. 2'}
                    keyboardType="numeric"
                    value={intensityText}
                    onChangeText={setIntensityText}
                    containerStyle={{ flex: 1 }}
                    mono
                  />
                </View>

                <Label>SET TİPİ</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SET_TYPE_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={setType === option.value}
                      onPress={() => setSetType(option.value)}
                    />
                  ))}
                </View>

                <Button
                  title="Set ekle"
                  onPress={handleAddSet}
                  disabled={repsText.trim().length === 0}
                  pending={createSet.isPending}
                  accessibilityLabel="Bu seti kaydet"
                />
              </Card>
            </>
          ) : (
            <EmptyState
              title="Bir egzersiz seç"
              description="Set girmeden önce yukarıdan bir egzersiz seç veya serbest egzersiz ekle."
            />
          )}

          {loggedSets.length > 0 ? (
            <>
              <SectionHeader icon="checkmark-done-outline" title="GİRİLEN SETLER" />
              <Card style={{ gap: 0, paddingVertical: 4 }}>
                {loggedSets.map((entry, index) => (
                  <View
                    key={entry.localId}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    <View style={{ gap: 2, flex: 1 }}>
                      <Body variant="bodySm">
                        {entry.row.exercise_name} · SET #{entry.row.set_number}
                      </Body>
                      <Mono variant="monoSm" color="textSecondary">
                        {formatLoggedSet(entry.row)}
                      </Mono>
                    </View>
                    <Badge
                      label={
                        SET_TYPE_OPTIONS.find((o) => o.value === entry.row.set_type)?.label ??
                        entry.row.set_type ??
                        'Çalışma'
                      }
                      tone={entry.row.set_type === 'failure' ? 'danger' : 'neutral'}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <SectionHeader icon="flag-outline" title="OTURUMU BİTİR" />
          <Card>
            <Input
              label="ALGILANAN ZORLUK (1-10, OPSİYONEL)"
              placeholder="Örn. 7"
              keyboardType="numeric"
              value={difficultyText}
              onChangeText={setDifficultyText}
              mono
            />
            <Button
              title="Oturumu bitir"
              variant="secondary"
              onPress={handleCompleteSession}
              pending={completeSession.isPending}
              accessibilityLabel="Antrenman oturumunu bitir"
            />
          </Card>
        </>
      )}
    </Screen>
  )
}
