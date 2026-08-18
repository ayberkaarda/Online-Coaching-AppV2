'use client'

// Haftalık antrenman planı: AI üretimi, sürükle-bırak egzersiz kütüphanesi,
// koç onay akışı, canlı ("gym modu") antrenman takibi ve set bazlı kayıt listesi.
//
// FAZ 2c (§4.1) — bu dosyanın antrenman akışındaki rolü:
//   * Koç: haftalık plan CRUD (`save_workout_plan` RPC'si üzerinden).
//   * Danışan: günün antrenmanı, video embed, SET BAZLI log girişi.
//   * Tamamlama: tüm planlı setler girildiğinde oturumun TÜM satırlarına AYNI
//     `completed_at` damgası yazılır (denormalize oturum damgası — bkz.
//     `src/hooks/useWorkoutLogs.ts` ve supabase/README.md §4h).
//
// KİMLİK (ADR-0018 Katman B): bu ekran esaslı biçimde elden geçirildiği için
// dokunulan her yerde eski dil dönüştürüldü — 900 ağırlık sınıfı yerine
// boyut+token hiyerarşisi (yazı tipleri 700'de tavanlı), 24px yarıçap sınıfı
// yerine `rounded-panel`/`rounded-card`/`rounded-control`, gradyanlar yerine düz
// token yüzeyi, ham gri/slate sınıfları yerine `text-fg`/`text-fg-muted`.
// NOT: ratchet sayaçları ham alt-dize sayar, bu yüzden eski sınıf adları bu
// yorumda bilerek LİTERAL olarak yazılmaz (yorumda geçse bile sayaca girerdi).

import {
  BookOpen,
  Bot,
  Check,
  ClipboardList,
  Clock,
  Download,
  Dumbbell,
  Eye,
  Lightbulb,
  Send,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import { toast } from 'sonner'

import { QueryState, SkeletonTable } from '@/components/ui'
import GymMode, { type GymModeExercise } from '@/components/workout/GymMode'
import {
  groupLogsIntoSessions,
  isSessionComplete,
  useApproveProgram,
  useCreateWorkoutLogs,
  useExercises,
  useGenerateWorkout,
  usePendingApprovals,
  useSaveWorkoutPlan,
  useSubmitProgramForApproval,
  useWorkoutLogs,
  useWorkoutPlan,
  type WorkoutSetInput,
} from '@/hooks'
import {
  rowsToSessionExercises,
  totalPlannedSets,
  useWorkoutPlanExercises,
  type SessionExercise,
} from '@/hooks/useWorkoutSession'
import type { SplitType } from '@/lib/api/types'
import { DAYS, getTodayName } from '@/lib/utils'
import {
  DAY_NAMES,
  parseWorkoutPlan,
  type DayName,
  type Json,
  type UserRole,
  type WorkoutPlan,
} from '@repo/types'

export interface WorkoutTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
  onDownloadImage: () => void
}

/** Dinlenme süreleri (saniye) — halkanın `max` değeri de budur. */
const REST_BETWEEN_SETS_SECONDS = 90
const REST_BETWEEN_EXERCISES_SECONDS = 120

function emptyWorkoutPlan(): WorkoutPlan {
  const plan = {} as WorkoutPlan
  for (const day of DAY_NAMES) plan[day] = ''
  return plan
}

/** Tek bir günü değiştirip yeni plan nesnesi döndürür (tip güvenli kopya). */
function withDay(plan: WorkoutPlan, day: DayName, value: string): WorkoutPlan {
  const next: WorkoutPlan = { ...plan }
  next[day] = value
  return next
}

/** `program_approvals.workout_data` Json olarak saklanır; güvenle plana çevirir. */
function jsonToWorkoutPlan(value: Json): WorkoutPlan {
  return parseWorkoutPlan(typeof value === 'string' ? value : JSON.stringify(value))
}

/**
 * "1. Bench Press - 4x8 | notlar" biçimindeki satırları canlı antrenman
 * hareketlerine çevirir. Format bozuksa satır atlanır.
 *
 * YEDEK YOL: kanonik kaynak `workout_plan_exercises` satırlarıdır (ayrıştırıcı
 * SQL'de, `explode_plan_day`). Bu fonksiyon yalnızca plan HENÜZ KAYDEDİLMEMİŞKEN
 * (koçun/danışanın taslağı ekranda dururken) devreye girer; o durumda plan
 * satırı — dolayısıyla `plan_exercise_id` — yoktur.
 */
export function parseDayPlan(plan: string): SessionExercise[] {
  const result: SessionExercise[] = []

  for (const line of plan.split('\n')) {
    if (!/^\d+\./.test(line) && !line.includes('-')) continue

    const parts = line.split('-')
    if (parts.length < 2) continue

    const rawName = parts[0]
    const rawSetsReps = parts[1]
    if (rawName === undefined || rawSetsReps === undefined) continue

    const name = rawName.replace(/^\d+\.\s*/, '').trim()
    if (!name) continue

    const setsReps = (rawSetsReps.split('|')[0] ?? '').trim().split(/[xX]/)
    const sets = Number.parseInt(setsReps[0] ?? '', 10) || 3
    const reps = Number.parseInt(setsReps[1] ?? '', 10) || 12

    result.push({ planExerciseId: null, name, sets, reps, videoUrl: null })
  }

  return result
}

export default function WorkoutTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
  onDownloadImage,
}: WorkoutTabProps): JSX.Element {
  const exercisesQuery = useExercises()
  const planQuery = useWorkoutPlan(targetId)
  const planExercisesQuery = useWorkoutPlanExercises(targetId)
  const approvalsQuery = usePendingApprovals(targetId)
  const logsQuery = useWorkoutLogs(targetId)

  const savePlan = useSaveWorkoutPlan()
  const submitForApproval = useSubmitProgramForApproval()
  const approveProgram = useApproveProgram()
  const createWorkoutLogs = useCreateWorkoutLogs()
  const generateWorkout = useGenerateWorkout()

  const exerciseDB = useMemo(() => exercisesQuery.data ?? [], [exercisesQuery.data])
  const pendingApprovals = approvalsQuery.data ?? []
  const firstApproval = pendingApprovals[0]

  // `getTodayName()` `new Date()` okur; render sırasında çağrılırsa React 19
  // `purity` kuralını ihlal eder. Lazy state başlatıcısı ile bir kez okunur.
  const [today] = useState<DayName>(() => getTodayName())

  const [workoutData, setWorkoutData] = useState<WorkoutPlan>(() => emptyWorkoutPlan())

  // targetId değiştiğinde düzenleme taslağını sunucudan gelen planla tazeler.
  // React'in "prop değişince state ayarla" kalıbı: render sırasında setState,
  // effect kullanmadan — böylece cascading render oluşmaz ve set-state-in-effect
  // lint hatası ortadan kalkar. Anahtar yalnızca targetId değil, "targetId + planın
  // yüklenmiş olması" — planQuery.data asenkron geldiği için targetId değişir değişmez
  // henüz undefined olabilir; veri gelince taslağı yükleyebilmek için isFetched de anahtara girer.
  // Aynı danışan için anahtar sabit kaldığı sürece (ör. arka planda refetch) kullanıcının
  // düzenlemeleri ezilmez.
  const planKey = targetId ? `${targetId}:${planQuery.isFetched ? '1' : '0'}` : 'none'
  const [loadedPlanKey, setLoadedPlanKey] = useState(planKey)
  if (planKey !== loadedPlanKey) {
    setLoadedPlanKey(planKey)
    setWorkoutData(
      targetId && planQuery.isFetched ? (planQuery.data ?? emptyWorkoutPlan()) : emptyWorkoutPlan()
    )
  }

  const isWaitingMyApproval = userRole === 'client' && pendingApprovals.length > 0

  // Günün antrenmanı KANONİK kaynaktan gelir: kimlikli plan satırları.
  const todaySessionExercises = useMemo(
    () => rowsToSessionExercises(planExercisesQuery.data, today),
    [planExercisesQuery.data, today]
  )

  // Set kayıtları oturumlara gruplanır (`completed_at` denormalize damgası).
  const sessions = useMemo(() => groupLogsIntoSessions(logsQuery.data), [logsQuery.data])

  // --- AI antrenör ------------------------------------------------------------
  const [smartSplit, setSmartSplit] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')

  const generateSmartWorkout = async (): Promise<void> => {
    if (!smartSplit) {
      toast.error('Lütfen bir şablon seçin!')
      return
    }

    // TODO: yaş / hedef / kilo danışanın profilinden okunmalı (şimdilik sabit).
    const result = await generateWorkout.mutateAsync({
      split_type: smartSplit as SplitType,
      user_prompt: aiPrompt,
      age: 20,
      goal: 'bulk',
      weight: 75,
    })

    const next = emptyWorkoutPlan()
    for (const day of DAY_NAMES) {
      next[day] = result.workout_plan[day] ?? ''
    }
    setWorkoutData(next)
  }

  // --- Onay akışı -------------------------------------------------------------
  const sendToCoachForApproval = (): void => {
    if (!currentUserId) {
      toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      return
    }
    const hasContent = DAY_NAMES.some((day) => workoutData[day].trim() !== '')
    if (!hasContent) {
      toast.error('Program boş olamaz!')
      return
    }

    // Bildirim koça gider; koç bulunamazsa onay kaydı yine de oluşturulur.
    submitForApproval.mutate({
      clientId: currentUserId,
      plan: workoutData,
    })
  }

  const handleApprove = (): void => {
    if (!firstApproval) return
    approveProgram.mutate({
      approvalId: firstApproval.id,
      clientId: firstApproval.client_id,
      plan: jsonToWorkoutPlan(firstApproval.workout_data),
    })
  }

  const handleSaveProgram = (): void => {
    const clientIds =
      userRole === 'coach' ? selectedClientIds : currentUserId ? [currentUserId] : []
    if (clientIds.length === 0) {
      toast.error('Danışan seçin!')
      return
    }
    savePlan.mutate({ clientIds, plan: workoutData })
  }

  // --- Sürükle-bırak + klavye alternatifi -------------------------------------
  const [dragOverDay, setDragOverDay] = useState<DayName | null>(null)
  const [draggingName, setDraggingName] = useState<string | null>(null)
  const [keyboardTargetDay, setKeyboardTargetDay] = useState<DayName>(today)

  const appendExercise = (day: DayName, exerciseName: string): void => {
    setWorkoutData((prev) => {
      const currentText = prev[day]
      const line = `${exerciseName} - 3x10`
      const newText = currentText.trim() === '' ? line : `${currentText}\n${line}`
      return withDay(prev, day, newText)
    })
  }

  const handleDragStart = (event: DragEvent<HTMLDivElement>, exerciseName: string): void => {
    event.dataTransfer.setData('text/plain', exerciseName)
    setDraggingName(exerciseName)
  }

  const handleDragEnd = (): void => setDraggingName(null)

  const handleDragOver = (event: DragEvent<HTMLTextAreaElement>, day: DayName): void => {
    event.preventDefault()
    setDragOverDay(day)
  }

  const handleDragLeave = (): void => setDragOverDay(null)

  const handleDrop = (event: DragEvent<HTMLTextAreaElement>, day: DayName): void => {
    event.preventDefault()
    setDragOverDay(null)
    setDraggingName(null)

    const exerciseName = event.dataTransfer.getData('text/plain')
    if (exerciseName) appendExercise(day, exerciseName)
  }

  // --- Egzersiz kütüphanesi ---------------------------------------------------
  const [recommenderFilter, setRecommenderFilter] = useState('')

  const filteredExercises = useMemo(() => {
    if (!recommenderFilter) return exerciseDB
    const q = recommenderFilter.toLowerCase()
    return exerciseDB.filter(
      (ex) =>
        ex.name.toLowerCase().includes(q) ||
        ex.body_part?.toLowerCase().includes(q) ||
        ex.target?.toLowerCase().includes(q) ||
        ex.equipment?.toLowerCase().includes(q)
    )
  }, [exerciseDB, recommenderFilter])

  const visibleExercises = filteredExercises.slice(0, 30)

  // --- Canlı antrenman modu ---------------------------------------------------
  const [isLiveWorkout, setIsLiveWorkout] = useState(false)
  const [liveExercises, setLiveExercises] = useState<SessionExercise[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [currentSet, setCurrentSet] = useState(1)
  const [liveWeight, setLiveWeight] = useState('')
  const [liveReps, setLiveReps] = useState('')
  const [restTime, setRestTime] = useState(0)
  const [restTotal, setRestTotal] = useState(REST_BETWEEN_SETS_SECONDS)
  const [completedSets, setCompletedSets] = useState<WorkoutSetInput[]>([])

  useEffect(() => {
    if (restTime <= 0) return
    const timer = setInterval(() => setRestTime((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [restTime])

  const plannedSetCount = totalPlannedSets(liveExercises)

  const startLiveWorkout = (): void => {
    const todaysPlan = workoutData[today] ?? ''

    // Kanonik kaynak plan satırlarıdır; henüz kaydedilmemiş taslak için metin
    // ayrıştırmasına düşülür (o durumda plan bağı — FK — kurulamaz).
    const exercises =
      todaySessionExercises.length > 0 ? todaySessionExercises : parseDayPlan(todaysPlan)

    if (exercises.length === 0) {
      toast.error(
        todaysPlan.trim() === '' || todaysPlan.toLowerCase().includes('dinlenme')
          ? 'Bugün dinlenme günün veya atanmış bir antrenman yok! Kaslarını dinlendir.'
          : 'Antrenman formatı uygun değil.'
      )
      return
    }

    setLiveExercises(exercises)
    setCurrentExIdx(0)
    setCurrentSet(1)
    setCompletedSets([])
    setLiveWeight('')
    setLiveReps('')
    setRestTime(0)
    setRestTotal(REST_BETWEEN_SETS_SECONDS)
    setIsLiveWorkout(true)
  }

  const handleCompleteSet = (): void => {
    const ex = liveExercises[currentExIdx]
    if (!ex) return

    if (!liveWeight || !liveReps) {
      toast.error('Lütfen bu set için kilo ve tekrar gir!')
      return
    }

    // `set_number` OTURUM içindeki sıradır (bkz. useWorkoutLogs.ts): tüm setler
    // tek toplu insert ile yazıldığı için `created_at` onları sıralayamaz.
    setCompletedSets((prev) => [
      ...prev,
      {
        exercise_name: ex.name,
        set_number: prev.length + 1,
        plan_exercise_id: ex.planExerciseId,
        weight_kg: Number.parseFloat(liveWeight),
        reps: Number.parseInt(liveReps, 10),
        rpe: null,
      },
    ])

    if (currentSet < ex.sets) {
      setCurrentSet((prev) => prev + 1)
      setRestTotal(REST_BETWEEN_SETS_SECONDS)
      setRestTime(REST_BETWEEN_SETS_SECONDS)
    } else if (currentExIdx < liveExercises.length - 1) {
      setCurrentExIdx((prev) => prev + 1)
      setCurrentSet(1)
      setRestTotal(REST_BETWEEN_EXERCISES_SECONDS)
      setRestTime(REST_BETWEEN_EXERCISES_SECONDS)
      setLiveWeight('')
    } else {
      // KUTLAMA ANI (AC-1.6.7 işaretli nokta #1): görsel karşılığı artık
      // ADR-0017'nin imza öğesidir — `GymMode` bitiş sahnesinde `LoopRing`
      // kapanır ve Kapanış yeşiline döner. Emoji kullanılmaz (ADR-0016);
      // toast yalnızca ekran okuyucu/duyuru kanalıdır.
      toast.success('İNANILMAZ! Bugünün tüm hareketlerini tamamladın!')
      setCurrentExIdx((prev) => prev + 1)
      setRestTime(0)
    }
  }

  const finishLiveWorkout = async (): Promise<void> => {
    if (completedSets.length === 0 || !currentUserId) {
      setIsLiveWorkout(false)
      return
    }

    // OTURUM DAMGASI: yalnızca TÜM planlı setler girildiyse basılır ve
    // `buildWorkoutLogRows` onu satırların TAMAMINA aynen yazar. Yarım bırakılan
    // antrenmanda damga NULL kalır — "set girildi, antrenman bitirilmedi".
    const completedAt = isSessionComplete(completedSets.length, plannedSetCount)
      ? new Date().toISOString()
      : null

    // Başarı/hata toast'ı hook içinde gösterilir.
    await createWorkoutLogs.mutateAsync({
      clientId: currentUserId,
      sets: completedSets,
      completedAt,
    })
    setIsLiveWorkout(false)
  }

  if (isLiveWorkout) {
    const gymExercises: GymModeExercise[] = liveExercises.map((exercise) => {
      const details = exerciseDB.find(
        (candidate) => candidate.name.toLowerCase() === exercise.name.toLowerCase()
      )
      return {
        planExerciseId: exercise.planExerciseId,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        videoUrl: exercise.videoUrl,
        gifSrc: details?.image ?? null,
        animatedGifSrc: details?.gif_url ?? null,
        equipment: details?.equipment ?? null,
      }
    })

    return (
      <GymMode
        dayLabel={today}
        exercises={gymExercises}
        currentIndex={currentExIdx}
        currentSet={currentSet}
        restSeconds={restTime}
        restTotalSeconds={restTotal}
        completedSetCount={completedSets.length}
        plannedSetCount={plannedSetCount}
        weight={liveWeight}
        reps={liveReps}
        isSaving={createWorkoutLogs.isPending}
        onWeightChange={setLiveWeight}
        onRepsChange={setLiveReps}
        onCompleteSet={handleCompleteSet}
        onSkipRest={() => setRestTime(0)}
        onFinish={() => void finishLiveWorkout()}
      />
    )
  }

  return (
    <div className="animate-fadeIn space-y-8">
      {userRole === 'coach' && firstApproval ? (
        <div className="rounded-panel border border-warning/30 bg-warning/10 p-5">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-warning">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> ONAY BEKLEYEN PROGRAM
            VAR
          </h4>
          <p className="mb-4 text-sm text-fg-muted">
            Danışan yapay zeka ile tasarladığı bu programı onayına sundu. İncele ve onayla.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setWorkoutData(jsonToWorkoutPlan(firstApproval.workout_data))}
              className="flex items-center gap-1.5 rounded-control border border-warning/40 bg-surface px-4 py-2 text-xs font-semibold text-warning"
            >
              <Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Taslağı Görüntüle
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveProgram.isPending}
              aria-busy={approveProgram.isPending}
              className="flex items-center gap-1.5 rounded-control bg-warning px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Onayla ve Profiline İşle
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b border-border pb-3">
        <h4 className="font-display text-lg font-bold text-fg">Haftalık Antrenman Planı</h4>
        <div className="flex gap-2">
          {userRole === 'client' && !isWaitingMyApproval && (
            <button
              type="button"
              onClick={startLiveWorkout}
              className="flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-xs font-bold text-accent-fg shadow-sm"
            >
              <Dumbbell aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> BUGÜNÜ BAŞLAT
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadImage}
            className="flex items-center gap-1.5 rounded-control bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Görsel
          </button>
        </div>
      </div>

      {/* isWaitingMyApproval yalnızca userRole === 'client' iken true olabilir (bkz. tanım),
          bu yüzden ek bir 'coach' kontrolü gereksizdir — koç için bu blok zaten görünür. */}
      {!isWaitingMyApproval && (
        <div className="mb-6 flex flex-col items-start gap-4 rounded-panel border border-border bg-surface p-5 md:flex-row">
          <Bot aria-hidden="true" className="mt-2 h-10 w-10 shrink-0 text-accent" />
          <div className="w-full flex-1 space-y-3">
            <div>
              <label
                htmlFor="ai-split"
                className="mb-1 block text-xs font-bold uppercase tracking-wide text-accent"
              >
                AKILLI ANTRENÖR (AI)
              </label>
              <select
                id="ai-split"
                value={smartSplit}
                onChange={(e) => setSmartSplit(e.target.value)}
                className="w-full rounded-control border border-border bg-canvas p-3 text-sm font-semibold text-fg outline-none focus:border-accent"
              >
                <option value="">Şablon Seçin...</option>
                <option value="ppl_torso_limbs">PPL + Torso + Limbs (5 Günlük)</option>
                <option value="ppl">Push / Pull / Legs (3 Günlük)</option>
                <option value="upper_lower">Upper / Lower (4 Günlük)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="ai-workout-prompt"
                className="mb-1 block text-xs font-semibold text-fg-muted"
              >
                AI&apos;A TALİMAT VER (PROMPT)
              </label>
              <textarea
                id="ai-workout-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Örn: Çarşamba dinlenme. Sadece dumbell kullanacağım..."
                className="min-h-[60px] w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generateSmartWorkout()}
            disabled={generateWorkout.isPending}
            aria-busy={generateWorkout.isPending}
            className="flex h-full w-full items-center justify-center gap-1.5 rounded-control bg-accent px-8 py-4 text-sm font-bold text-accent-fg disabled:opacity-50 md:w-auto"
          >
            {generateWorkout.isPending ? (
              'Analiz Ediliyor...'
            ) : (
              <>
                Oluştur
                <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div
          className={`w-full ${
            userRole === 'coach' ? 'lg:w-2/3' : ''
          } h-fit overflow-x-auto rounded-card border border-border`}
        >
          <QueryState
            isLoading={planQuery.isLoading}
            isError={planQuery.isError}
            error={planQuery.error}
            skeleton={<SkeletonTable rows={7} cols={2} />}
            onRetry={() => void planQuery.refetch()}
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Haftalık antrenman planı: gün ve o güne ait hareketler.
              </caption>
              <thead className="border-b border-border bg-surface">
                <tr>
                  <th scope="col" className="p-3">
                    Gün
                  </th>
                  <th scope="col" className="p-3">
                    Hareketler (Set x Tekrar)
                  </th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day) => (
                  <tr key={day} className="border-b border-border">
                    <th scope="row" className="p-3 text-left font-semibold text-fg">
                      {day}
                    </th>
                    <td className="p-2">
                      <label htmlFor={`workout-${day}`} className="sr-only">
                        {day} antrenman içeriği
                      </label>
                      <textarea
                        id={`workout-${day}`}
                        disabled={userRole === 'client' && isWaitingMyApproval}
                        value={workoutData[day]}
                        onChange={(e) => {
                          const value = e.target.value
                          setWorkoutData((prev) => withDay(prev, day, value))
                        }}
                        onDragOver={(e) => handleDragOver(e, day)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day)}
                        placeholder={
                          userRole === 'coach'
                            ? 'Manuel yazabilir veya sağdan sürükleyebilirsiniz...'
                            : ''
                        }
                        className={`min-h-[120px] w-full rounded-control border bg-transparent p-2 text-fg outline-none transition-all ${
                          dragOverDay === day
                            ? 'border-accent bg-accent/5 ring-2 ring-accent/50'
                            : 'border-transparent hover:border-border focus:border-accent'
                        }`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </QueryState>
        </div>

        {userRole === 'coach' && (
          <div className="sticky top-4 h-fit w-full rounded-panel border border-border bg-surface p-5 lg:w-1/3">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg">
              <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" /> Egzersiz Kütüphanesi
            </h4>
            <p className="mb-4 flex items-start gap-1.5 text-[10px] font-medium italic text-fg-muted">
              <Lightbulb aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Hareketi tutup soldaki günlerin içine sürükleyin veya &quot;Ekle&quot; butonunu
                kullanın.
              </span>
            </p>

            <label htmlFor="exercise-filter" className="sr-only">
              Hareket ara
            </label>
            <input
              id="exercise-filter"
              type="text"
              placeholder="Hareket Ara (Örn: Incline...)"
              value={recommenderFilter}
              onChange={(e) => setRecommenderFilter(e.target.value)}
              className="mb-4 w-full rounded-control border border-border bg-canvas p-2.5 text-xs text-fg outline-none focus:border-accent"
            />

            <label htmlFor="exercise-target-day" className="sr-only">
              Eklenecek gün
            </label>
            <select
              id="exercise-target-day"
              value={keyboardTargetDay}
              onChange={(e) => setKeyboardTargetDay(e.target.value as DayName)}
              className="mb-4 w-full rounded-control border border-border bg-canvas p-2.5 text-xs text-fg outline-none focus:border-accent"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <span className="sr-only" aria-live="polite">
              {filteredExercises.length} sonuç
            </span>

            <QueryState
              isLoading={exercisesQuery.isLoading}
              isError={exercisesQuery.isError}
              error={exercisesQuery.error}
              isEmpty={visibleExercises.length === 0}
              emptyMessage="Sonuç bulunamadı."
              onRetry={() => void exercisesQuery.refetch()}
            >
              <div className="custom-scrollbar max-h-[500px] space-y-2 overflow-y-auto">
                {visibleExercises.map((ex) => (
                  <div
                    key={ex.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, ex.name)}
                    onDragEnd={handleDragEnd}
                    className={`group cursor-grab rounded-card border border-border bg-canvas p-3 transition-all hover:border-accent hover:bg-accent/5 active:cursor-grabbing ${
                      draggingName === ex.name ? 'scale-95 opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-fg">{ex.name}</p>
                        <div className="mt-1 flex gap-2">
                          <span className="rounded bg-accent/10 px-2 text-[9px] text-accent">
                            {ex.target ?? ex.body_part}
                          </span>
                          <span className="rounded bg-fg/5 px-2 text-[9px] text-fg-muted">
                            {ex.equipment}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => appendExercise(keyboardTargetDay, ex.name)}
                        aria-label={`${ex.name} hareketini ${keyboardTargetDay} gününe ekle`}
                        className="shrink-0 rounded-control bg-accent/10 px-2 py-1 text-[10px] font-semibold text-accent transition-all hover:bg-accent hover:text-accent-fg"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </QueryState>
          </div>
        )}
      </div>

      {/* SET BAZLI KAYITLAR — AC-2.1'in "koç logu görür" adımı burada kapanır.
          Oturumlar `completed_at` damgasına göre gruplanır; damgası olmayan
          satırlar "bitirilmemiş" oturum olarak ayrı görünür. */}
      <section className="rounded-panel border border-border bg-surface p-5">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-fg">
          <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" /> Antrenman Kayıtları
        </h4>
        <QueryState
          isLoading={logsQuery.isLoading}
          isError={logsQuery.isError}
          error={logsQuery.error}
          isEmpty={sessions.length === 0}
          emptyMessage="Henüz set kaydı yok."
          onRetry={() => void logsQuery.refetch()}
        >
          <ul className="space-y-4">
            {sessions.slice(0, 5).map((session) => (
              <li key={session.key} className="rounded-card border border-border bg-canvas p-4">
                <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-fg-muted">
                  <span className="font-mono tabular-nums text-fg">
                    {session.sortedAt.slice(0, 10)} {session.sortedAt.slice(11, 16)}
                  </span>
                  <span>·</span>
                  <span>{session.sets.length} set</span>
                  <span>·</span>
                  <span className={session.completedAt === null ? 'text-warning' : 'text-success'}>
                    {session.completedAt === null ? 'Bitirilmedi' : 'Tamamlandı'}
                  </span>
                </p>
                <ul className="space-y-1">
                  {session.sets.map((set) => (
                    <li key={set.id} className="flex flex-wrap gap-2 text-xs text-fg">
                      <span className="font-mono tabular-nums text-fg-muted">
                        {set.set_number ?? '-'}.
                      </span>
                      <span className="font-semibold">{set.exercise_name}</span>
                      <span className="font-mono tabular-nums text-fg-muted">
                        {set.weight_kg ?? '-'} kg x {set.reps ?? '-'}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </QueryState>
      </section>

      {userRole === 'coach' ? (
        <button
          type="button"
          onClick={handleSaveProgram}
          disabled={savePlan.isPending}
          aria-busy={savePlan.isPending}
          className="w-full rounded-control bg-success py-4 font-bold text-white shadow-sm transition-transform hover:opacity-90 active:scale-95 disabled:opacity-50"
        >
          Antrenman Tablosunu Güncelle
        </button>
      ) : (
        <button
          type="button"
          onClick={sendToCoachForApproval}
          disabled={isWaitingMyApproval || submitForApproval.isPending}
          aria-busy={submitForApproval.isPending}
          className={`flex w-full items-center justify-center gap-2 rounded-control py-4 font-bold shadow-sm transition-all ${
            isWaitingMyApproval
              ? 'cursor-not-allowed bg-border text-fg-muted'
              : 'bg-warning text-white hover:opacity-90'
          }`}
        >
          {isWaitingMyApproval ? (
            <>
              <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
              Koçun Onayı Bekleniyor...
            </>
          ) : (
            <>
              <Send aria-hidden="true" className="h-4 w-4 shrink-0" />
              Bu Programı Koça Onaya Gönder
            </>
          )}
        </button>
      )}
    </div>
  )
}
