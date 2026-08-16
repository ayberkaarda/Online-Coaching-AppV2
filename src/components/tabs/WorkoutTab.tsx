'use client'

// Haftalık antrenman planı: AI üretimi, sürükle-bırak egzersiz kütüphanesi,
// koç onay akışı ve canlı ("gym modu") antrenman takibi.

import { useEffect, useMemo, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import { toast } from 'sonner'

import { QueryState, SkeletonTable } from '@/components/ui'
import {
  useApproveProgram,
  useCoachId,
  useCreateWorkoutLogs,
  useExercises,
  useGenerateWorkout,
  usePendingApprovals,
  useSaveWorkoutPlan,
  useSubmitProgramForApproval,
  useWorkoutLogs,
  useWorkoutPlan,
} from '@/hooks'
import type { SplitType } from '@/lib/api/types'
import { DAYS, formatTime, getTodayName } from '@/lib/utils'
import {
  DAY_NAMES,
  parseWorkoutPlan,
  type DayName,
  type Json,
  type UserRole,
  type WorkoutPlan,
} from '@/types'

export interface WorkoutTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
  onDownloadImage: () => void
}

interface LiveExercise {
  name: string
  sets: number
  reps: number
}

interface CompletedSet {
  exercise_name: string
  weight_kg: number
  reps: number
  rpe: number | null
}

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
 */
function parseDayPlan(plan: string): LiveExercise[] {
  const result: LiveExercise[] = []

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

    result.push({ name, sets, reps })
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
  const approvalsQuery = usePendingApprovals(targetId)
  const { data: coachId } = useCoachId()

  const savePlan = useSaveWorkoutPlan()
  const submitForApproval = useSubmitProgramForApproval()
  const approveProgram = useApproveProgram()
  const createWorkoutLogs = useCreateWorkoutLogs()
  const generateWorkout = useGenerateWorkout()

  // Canlı antrenman bittiğinde geçmiş setler tazelensin diye önbellek burada tutulur.
  useWorkoutLogs(targetId)

  const exerciseDB = useMemo(() => exercisesQuery.data ?? [], [exercisesQuery.data])
  const pendingApprovals = approvalsQuery.data ?? []
  const firstApproval = pendingApprovals[0]

  const [workoutData, setWorkoutData] = useState<WorkoutPlan>(() => emptyWorkoutPlan())

  // targetId değiştiğinde düzenleme taslağını sunucudan gelen planla tazeler.
  // React'in "prop değişince state ayarlama" kalıbı: render sırasında setState,
  // effect kullanmadan — böylece cascading render oluşmaz ve set-state-in-effect
  // lint hatası ortadan kalkar. Anahtar yalnızca targetId değil, "targetId + planın
  // yüklenmiş olması" — planQuery.data asenkron geldiği için targetId değişir değişmez
  // henüz undefined olabilir; veri gelince taslağı yükleyebilmek için isFetched de anahtara girer.
  // Aynı öğrenci için anahtar sabit kaldığı sürece (ör. arka planda refetch) kullanıcının
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

  // --- AI antrenör ------------------------------------------------------------
  const [smartSplit, setSmartSplit] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')

  const generateSmartWorkout = async (): Promise<void> => {
    if (!smartSplit) {
      toast.error('Lütfen bir şablon seçin!')
      return
    }

    // TODO: yaş / hedef / kilo öğrencinin profilinden okunmalı (şimdilik sabit).
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
      ...(coachId ? { coachId } : {}),
    })
  }

  const handleApprove = (): void => {
    if (!firstApproval) return
    approveProgram.mutate({
      approvalId: firstApproval.id,
      clientId: firstApproval.client_id,
      plan: jsonToWorkoutPlan(firstApproval.workout_data),
      ...(currentUserId ? { reviewerId: currentUserId } : {}),
    })
  }

  const handleSaveProgram = (): void => {
    const clientIds =
      userRole === 'coach' ? selectedClientIds : currentUserId ? [currentUserId] : []
    if (clientIds.length === 0) {
      toast.error('Öğrenci seçin!')
      return
    }
    savePlan.mutate({ clientIds, plan: workoutData })
  }

  // --- Sürükle-bırak + klavye alternatifi -------------------------------------
  const [dragOverDay, setDragOverDay] = useState<DayName | null>(null)
  const [draggingName, setDraggingName] = useState<string | null>(null)
  const [keyboardTargetDay, setKeyboardTargetDay] = useState<DayName>(() => getTodayName())

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
  const [liveExercises, setLiveExercises] = useState<LiveExercise[]>([])
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [currentSet, setCurrentSet] = useState(1)
  const [liveWeight, setLiveWeight] = useState('')
  const [liveReps, setLiveReps] = useState('')
  const [restTime, setRestTime] = useState(0)
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([])
  const [isGifPlaying, setIsGifPlaying] = useState(false)

  useEffect(() => {
    if (restTime <= 0) return
    const timer = setInterval(() => setRestTime((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [restTime])

  const startLiveWorkout = (): void => {
    const today = getTodayName()
    const todaysPlan = workoutData[today]

    if (!todaysPlan || todaysPlan.toLowerCase().includes('dinlenme') || todaysPlan.trim() === '') {
      toast.error('Bugün dinlenme günün veya atanmış bir antrenman yok! Kaslarını dinlendir.')
      return
    }

    const parsed = parseDayPlan(todaysPlan)
    if (parsed.length === 0) {
      toast.error('Antrenman formatı uygun değil.')
      return
    }

    setLiveExercises(parsed)
    setCurrentExIdx(0)
    setCurrentSet(1)
    setCompletedSets([])
    setLiveWeight('')
    setLiveReps('')
    setRestTime(0)
    setIsLiveWorkout(true)
  }

  const handleCompleteSet = (): void => {
    const ex = liveExercises[currentExIdx]
    if (!ex) return

    if (!liveWeight || !liveReps) {
      toast.error('Lütfen bu set için kilo ve tekrar gir!')
      return
    }

    setCompletedSets((prev) => [
      ...prev,
      {
        exercise_name: ex.name,
        weight_kg: Number.parseFloat(liveWeight),
        reps: Number.parseInt(liveReps, 10),
        rpe: null,
      },
    ])

    if (currentSet < ex.sets) {
      setCurrentSet((prev) => prev + 1)
      setRestTime(90)
    } else if (currentExIdx < liveExercises.length - 1) {
      setCurrentExIdx((prev) => prev + 1)
      setCurrentSet(1)
      setRestTime(120)
      setLiveWeight('')
    } else {
      toast.success('🎉 İNANILMAZ! Bugünün tüm hareketlerini tamamladın!')
      setCurrentExIdx((prev) => prev + 1)
      setRestTime(0)
    }
  }

  const finishLiveWorkout = async (): Promise<void> => {
    if (completedSets.length === 0 || !currentUserId) {
      setIsLiveWorkout(false)
      return
    }
    // Başarı/hata toast'ı hook içinde gösterilir.
    await createWorkoutLogs.mutateAsync({ clientId: currentUserId, sets: completedSets })
    setIsLiveWorkout(false)
  }

  if (isLiveWorkout) {
    const currentExercise = liveExercises[currentExIdx]
    const exDetails = currentExercise
      ? exerciseDB.find((e) => e.name.toLowerCase() === currentExercise.name.toLowerCase())
      : undefined
    const gifSrc = exDetails
      ? isGifPlaying && exDetails.gif_url
        ? exDetails.gif_url
        : (exDetails.image ?? exDetails.gif_url)
      : null

    return (
      <div className="relative mt-4 flex w-full animate-fadeIn flex-col items-center rounded-3xl border border-gray-100 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-[#16161d] md:p-10">
        <button
          type="button"
          onClick={() => void finishLiveWorkout()}
          className="absolute right-4 top-4 rounded-lg bg-red-500/10 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-500/20"
        >
          Bitir
        </button>
        <h3 className="mb-2 text-xl font-black text-brand-purple">
          <span aria-hidden="true">🏋️</span> CANLI GYM MODU
        </h3>
        <p className="mb-6 text-sm font-bold uppercase text-gray-500">
          {getTodayName()} Antrenmanı
        </p>

        {currentExercise ? (
          <div className="w-full max-w-md rounded-3xl border bg-gray-50 p-6 text-center shadow-inner dark:bg-zinc-900">
            {restTime > 0 ? (
              <div className="flex animate-pulse flex-col items-center py-6">
                <p className="mb-2 font-bold text-gray-500">DİNLENME SÜRESİ</p>
                <div
                  role="timer"
                  aria-live="polite"
                  aria-label={`Dinlenme süresi ${formatTime(restTime)}`}
                  className="font-mono text-6xl font-black text-brand-purple"
                >
                  {formatTime(restTime)}
                </div>
                <button
                  type="button"
                  onClick={() => setRestTime(0)}
                  className="mt-4 text-xs text-gray-400 underline"
                >
                  Süreyi Atla
                </button>
              </div>
            ) : (
              <>
                <p className="mb-4 inline-block rounded-full bg-brand-purple/10 px-3 py-1 text-sm font-bold text-brand-purple">
                  Hareket {currentExIdx + 1} / {liveExercises.length}
                </p>

                {/* HOVER OYNATICI */}
                <div
                  className="group relative mb-4 flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-gray-300 bg-zinc-200 dark:border-zinc-800 dark:bg-black"
                  onMouseEnter={() => setIsGifPlaying(true)}
                  onMouseLeave={() => setIsGifPlaying(false)}
                >
                  {gifSrc ? (
                    <>
                      <img
                        src={gifSrc}
                        alt={`${currentExercise.name} hareketinin gösterimi`}
                        loading="lazy"
                        className={`h-full w-full object-cover transition-all duration-300 ${
                          isGifPlaying ? 'scale-105 opacity-100' : 'scale-100 opacity-60 grayscale'
                        }`}
                      />
                      {!isGifPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-black/60 px-4 py-2 text-xs font-bold text-white backdrop-blur-sm transition-transform group-hover:scale-110">
                            <span aria-hidden="true">▶️</span> Oynatmak için Üzerine Gel
                          </div>
                        </div>
                      )}
                      {exDetails?.equipment ? (
                        <span className="absolute bottom-2 right-2 z-10 rounded-md bg-black/80 px-2 py-1 text-[10px] text-white">
                          {exDetails.equipment}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="text-3xl" aria-hidden="true">
                        🎥
                      </span>
                      <span className="text-[10px] font-bold">Görsel Bulunamadı</span>
                    </div>
                  )}
                </div>

                <h2 className="mb-2 text-2xl font-black text-gray-800 dark:text-zinc-100">
                  {currentExercise.name}
                </h2>
                <p className="mb-6 text-lg font-bold text-gray-500">
                  Set {currentSet} / {currentExercise.sets}{' '}
                  <span className="text-brand-purple opacity-50">
                    ({currentExercise.reps} Tekrar)
                  </span>
                </p>

                <p className="sr-only" aria-live="polite">
                  {currentExercise.name}, set {currentSet} / {currentExercise.sets}, hedef{' '}
                  {currentExercise.reps} tekrar.
                </p>

                <div className="mb-6 flex gap-4">
                  <div className="flex-1">
                    <label
                      htmlFor="live-weight"
                      className="mb-1 block text-[10px] font-bold text-gray-400"
                    >
                      KİLO (KG)
                    </label>
                    <input
                      id="live-weight"
                      type="number"
                      value={liveWeight}
                      onChange={(e) => setLiveWeight(e.target.value)}
                      className="w-full rounded-2xl border-2 p-4 text-center text-xl font-black outline-none focus:border-brand-purple dark:bg-black"
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="live-reps"
                      className="mb-1 block text-[10px] font-bold text-gray-400"
                    >
                      TEKRAR
                    </label>
                    <input
                      id="live-reps"
                      type="number"
                      value={liveReps}
                      onChange={(e) => setLiveReps(e.target.value)}
                      placeholder={currentExercise.reps.toString()}
                      className="w-full rounded-2xl border-2 p-4 text-center text-xl font-black outline-none focus:border-brand-purple dark:bg-black"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCompleteSet}
                  className="w-full rounded-2xl bg-brand-purple py-4 text-lg font-black text-white shadow-lg active:scale-95"
                >
                  {currentSet === currentExercise.sets ? 'Son Seti Tamamla' : 'Seti Tamamla'}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="py-10 text-center">
            <div className="mb-4 text-6xl" aria-hidden="true">
              🏆
            </div>
            <h2 className="mb-2 text-2xl font-black text-emerald-500">MÜKEMMEL İŞ!</h2>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fadeIn space-y-8">
      {userRole === 'coach' && firstApproval ? (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm dark:bg-orange-900/20">
          <h4 className="mb-2 flex items-center gap-2 font-black text-orange-600">
            <span aria-hidden="true">⚠️</span> ONAY BEKLEYEN PROGRAM VAR
          </h4>
          <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            Öğrenci yapay zeka ile tasarladığı bu programı onayına sundu. İncele ve onayla.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setWorkoutData(jsonToWorkoutPlan(firstApproval.workout_data))}
              className="rounded-lg border border-orange-200 bg-white px-4 py-2 text-xs font-bold text-orange-600 shadow-sm dark:bg-black"
            >
              <span aria-hidden="true">👀</span> Taslağı Görüntüle
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveProgram.isPending}
              aria-busy={approveProgram.isPending}
              className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-black text-white shadow-md hover:bg-orange-600 disabled:opacity-50"
            >
              <span aria-hidden="true">✅</span> Onayla ve Profiline İşle
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between border-b pb-3 dark:border-zinc-800">
        <h4 className="text-lg font-bold text-gray-800 dark:text-zinc-200">
          Haftalık Antrenman Planı
        </h4>
        <div className="flex gap-2">
          {userRole === 'client' && !isWaitingMyApproval && (
            <button
              type="button"
              onClick={startLiveWorkout}
              className="animate-pulse rounded-lg bg-brand-purple px-4 py-2 text-xs font-black text-white shadow-lg"
            >
              <span aria-hidden="true">🏋️</span> BUGÜNÜ BAŞLAT
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadImage}
            className="rounded-lg bg-brand-purple/10 px-3 py-1.5 text-xs font-bold text-brand-purple"
          >
            <span aria-hidden="true">🖼️</span> Görsel
          </button>
        </div>
      </div>

      {/* isWaitingMyApproval yalnızca userRole === 'client' iken true olabilir (bkz. tanım),
          bu yüzden ek bir 'coach' kontrolü gereksizdir — koç için bu blok zaten görünür. */}
      {!isWaitingMyApproval && (
        <div className="mb-6 flex flex-col items-start gap-4 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-brand-purple/5 p-5 shadow-sm md:flex-row">
          <div className="pt-2 text-4xl" aria-hidden="true">
            🤖
          </div>
          <div className="w-full flex-1 space-y-3">
            <div>
              <label htmlFor="ai-split" className="mb-1 block text-xs font-black text-blue-600">
                AKILLI ANTRENÖR (AI)
              </label>
              <select
                id="ai-split"
                value={smartSplit}
                onChange={(e) => setSmartSplit(e.target.value)}
                className="w-full rounded-xl border bg-white p-3 text-sm font-bold outline-none dark:bg-zinc-900"
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
                className="mb-1 block text-xs font-bold text-gray-500"
              >
                AI&apos;A TALİMAT VER (PROMPT)
              </label>
              <textarea
                id="ai-workout-prompt"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Örn: Çarşamba dinlenme. Sadece dumbell kullanacağım..."
                className="min-h-[60px] w-full rounded-xl border bg-white p-3 text-xs outline-none dark:bg-zinc-900"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generateSmartWorkout()}
            disabled={generateWorkout.isPending}
            aria-busy={generateWorkout.isPending}
            className="h-full w-full rounded-xl bg-blue-600 px-8 py-4 text-sm font-black text-white disabled:opacity-50 md:w-auto"
          >
            {generateWorkout.isPending ? 'Analiz Ediliyor...' : 'Oluştur ✨'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div
          className={`w-full ${
            userRole === 'coach' ? 'lg:w-2/3' : ''
          } h-fit overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800`}
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
              <thead className="border-b bg-gray-50 dark:bg-zinc-900">
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
                  <tr key={day} className="border-b hover:bg-gray-50/50">
                    <th scope="row" className="p-3 text-left font-bold">
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
                        className={`min-h-[120px] w-full rounded-lg border bg-transparent p-2 outline-none transition-all ${
                          dragOverDay === day
                            ? 'border-brand-purple bg-brand-purple/5 ring-2 ring-brand-purple/50'
                            : 'border-transparent hover:border-gray-200 focus:border-brand-purple'
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
          <div className="sticky top-4 h-fit w-full rounded-2xl border bg-gray-50 p-5 dark:bg-zinc-900 lg:w-1/3">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-black">
              <span aria-hidden="true">📚</span> Egzersiz Kütüphanesi
            </h4>
            <p className="mb-4 text-[10px] font-medium italic text-gray-500">
              <span aria-hidden="true">💡</span> Hareketi tutup soldaki günlerin içine sürükleyin
              veya &quot;Ekle&quot; butonunu kullanın.
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
              className="mb-4 w-full rounded-xl border bg-white p-2.5 text-xs outline-none focus:border-brand-purple dark:border-zinc-700 dark:bg-black"
            />

            <label htmlFor="exercise-target-day" className="sr-only">
              Eklenecek gün
            </label>
            <select
              id="exercise-target-day"
              value={keyboardTargetDay}
              onChange={(e) => setKeyboardTargetDay(e.target.value as DayName)}
              className="mb-4 w-full rounded-xl border bg-white p-2.5 text-xs outline-none focus:border-brand-purple dark:border-zinc-700 dark:bg-black"
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
                    className={`group cursor-grab rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:border-brand-purple hover:bg-brand-purple/5 active:cursor-grabbing dark:border-zinc-800 dark:bg-[#16161d] ${
                      draggingName === ex.name ? 'scale-95 opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          {ex.name}
                        </p>
                        <div className="mt-1 flex gap-2 opacity-70">
                          <span className="rounded bg-brand-purple/10 px-2 text-[9px] text-brand-purple">
                            {ex.target ?? ex.body_part}
                          </span>
                          <span className="rounded bg-blue-500/10 px-2 text-[9px] text-blue-500">
                            {ex.equipment}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => appendExercise(keyboardTargetDay, ex.name)}
                        aria-label={`${ex.name} hareketini ${keyboardTargetDay} gününe ekle`}
                        className="shrink-0 rounded-lg bg-brand-purple/10 px-2 py-1 text-[10px] font-bold text-brand-purple transition-all hover:bg-brand-purple hover:text-white"
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

      {userRole === 'coach' ? (
        <button
          type="button"
          onClick={handleSaveProgram}
          disabled={savePlan.isPending}
          aria-busy={savePlan.isPending}
          className="w-full rounded-xl bg-emerald-500 py-4 font-black text-white shadow-md transition-transform hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
        >
          Antrenman Tablosunu Güncelle
        </button>
      ) : (
        <button
          type="button"
          onClick={sendToCoachForApproval}
          disabled={isWaitingMyApproval || submitForApproval.isPending}
          aria-busy={submitForApproval.isPending}
          className={`w-full rounded-xl py-4 font-black shadow-md transition-all ${
            isWaitingMyApproval
              ? 'cursor-not-allowed bg-gray-400 text-white'
              : 'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          {isWaitingMyApproval
            ? '⏳ Koçun Onayı Bekleniyor...'
            : '📨 Bu Programı Koça Onaya Gönder'}
        </button>
      )}
    </div>
  )
}
