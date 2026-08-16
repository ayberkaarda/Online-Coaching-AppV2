'use client'

// Haftalık beslenme planı: AI diyetisyen, oto-tamamlamalı hızlı besin ekleme
// ve gün bazlı otomatik kalori hesabı. Plan `profiles.nutrition_plan` içinde saklanır.

import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { QueryState, SkeletonTable } from '@/components/ui'
import { useFoods, useGenerateDiet, useNutritionPlan, useSaveNutritionPlan } from '@/hooks'
import { DAYS, downloadCSV } from '@/lib/utils'
import { aiDietSchema, type AiDietInput } from '@/lib/validation/schemas'
import { DAY_NAMES, type DayName, type FoodItem, type NutritionPlan, type UserRole } from '@/types'

export interface NutritionTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
  onDownloadImage: () => void
}

function emptyPlan(): NutritionPlan {
  const plan = {} as NutritionPlan
  for (const day of DAY_NAMES) plan[day] = { items: '', total: 0 }
  return plan
}

/** Tek bir günü değiştirip yeni plan nesnesi döndürür (tip güvenli kopya). */
function withDay(plan: NutritionPlan, day: DayName, items: string, total: number): NutritionPlan {
  const next: NutritionPlan = { ...plan }
  next[day] = { items, total }
  return next
}

export default function NutritionTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
  onDownloadImage,
}: NutritionTabProps): JSX.Element {
  const foodsQuery = useFoods()
  const planQuery = useNutritionPlan(targetId)
  const savePlan = useSaveNutritionPlan()
  const generateDiet = useGenerateDiet()

  const foodDB: FoodItem[] = useMemo(() => foodsQuery.data ?? [], [foodsQuery.data])

  const [nutritionData, setNutritionData] = useState<NutritionPlan>(() => emptyPlan())
  const [targetCalories, setTargetCalories] = useState(0)

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
    setNutritionData(
      targetId && planQuery.isFetched ? (planQuery.data ?? emptyPlan()) : emptyPlan()
    )
  }

  // --- Hızlı besin ekleme (combobox) -----------------------------------------
  const [quickAddDay, setQuickAddDay] = useState<DayName>(DAY_NAMES[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null)
  const [quickAddGrams, setQuickAddGrams] = useState('100')
  const [activeIndex, setActiveIndex] = useState(-1)

  const suggestions = useMemo(() => {
    if (searchQuery.trim().length <= 1 || selectedFood) return []
    const q = searchQuery.toLowerCase()
    return foodDB.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 5)
  }, [searchQuery, selectedFood, foodDB])

  const isListOpen = suggestions.length > 0
  const activeOption = activeIndex >= 0 ? suggestions[activeIndex] : undefined

  const calculateCalories = (foodName: string, grams: number): number => {
    const food = foodDB.find((f) => f.name.toLowerCase() === foodName.toLowerCase().trim())
    if (!food) return 0
    return Math.round((food.calories_per_100g * grams) / 100)
  }

  /** "Yulaf:80, Tavuk:200" biçimindeki listenin toplam kalorisini hesaplar. */
  const sumCalories = (itemsString: string): number => {
    let total = 0
    for (const item of itemsString.split(',')) {
      const parts = item.split(':')
      if (parts.length !== 2) continue
      const name = parts[0]
      const grams = parts[1]
      if (name === undefined || grams === undefined) continue
      total += calculateCalories(name, Number.parseInt(grams, 10) || 0)
    }
    return total
  }

  const pickFood = (food: FoodItem): void => {
    setSelectedFood(food)
    setSearchQuery(food.name)
    setActiveIndex(-1)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!isListOpen) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
    } else if (event.key === 'Enter') {
      const candidate = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0]
      if (candidate) {
        event.preventDefault()
        pickFood(candidate)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setActiveIndex(-1)
      setSearchQuery('')
    }
  }

  const handleQuickAdd = (): void => {
    if (!selectedFood) {
      toast.error('Lütfen listeden bir besin seçin.')
      return
    }
    const grams = Number.parseInt(quickAddGrams, 10)
    if (!Number.isFinite(grams) || grams <= 0) {
      toast.error('Geçerli bir gramaj girin.')
      return
    }

    const newEntry = `${selectedFood.name}:${grams}`
    const current = nutritionData[quickAddDay]
    const newItemsString = current.items ? `${current.items}, ${newEntry}` : newEntry

    setNutritionData((prev) =>
      withDay(prev, quickAddDay, newItemsString, sumCalories(newItemsString))
    )
    setSearchQuery('')
    setSelectedFood(null)
    setQuickAddGrams('100')
    setActiveIndex(-1)
  }

  const handleManualNutritionChange = (day: DayName, value: string): void => {
    setNutritionData((prev) => withDay(prev, day, value, sumCalories(value)))
  }

  // --- AI diyetisyen ----------------------------------------------------------
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AiDietInput>({
    resolver: zodResolver(aiDietSchema),
    defaultValues: {
      age: 20,
      height_cm: 175,
      weight_kg: 70,
      gender: 'male',
      steps: 6500,
      goal: 'maintain',
      user_prompt: '',
    },
  })

  const onGenerate = handleSubmit(async (values) => {
    // İstek Next.js proxy route'una gider; hata mesajları hook/proxy tarafından verilir.
    const result = await generateDiet.mutateAsync(values)

    setTargetCalories(result.target_calories)

    const next = emptyPlan()
    for (const day of DAY_NAMES) {
      const itemsString = result.diet_plan[day] ?? ''
      next[day] = { items: itemsString, total: sumCalories(itemsString) }
    }
    setNutritionData(next)
  })

  // --- Kaydetme ---------------------------------------------------------------
  const handleSaveProgram = (): void => {
    const clientIds =
      userRole === 'coach' ? selectedClientIds : currentUserId ? [currentUserId] : []
    if (clientIds.length === 0) {
      toast.error('Öğrenci seçin!')
      return
    }
    // Başarı/hata toast'ı hook içinde gösterilir.
    savePlan.mutate({ clientIds, plan: nutritionData })
  }

  const handleDownloadCsv = (): void => {
    // Mevcut davranış korunur: her gün ayrı bir sütun olarak tek satırda dışa aktarılır.
    const row = Object.fromEntries(DAY_NAMES.map((day) => [day, nutritionData[day]] as const))
    downloadCSV([row], 'Beslenme_Programi', false)
  }

  const isGenerating = generateDiet.isPending

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex items-center justify-between border-b pb-3 dark:border-zinc-800">
        <h4 className="text-lg font-bold text-gray-800 dark:text-zinc-200">
          Haftalık Beslenme Planı
        </h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDownloadImage}
            className="rounded-lg bg-brand-purple/10 px-3 py-1.5 text-xs font-bold text-brand-purple"
          >
            <span aria-hidden="true">🖼️</span> Görsel İndir
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600"
          >
            <span aria-hidden="true">📊</span> CSV İndir
          </button>
        </div>
      </div>

      {/* AKILLI DİYETİSYEN PANELİ */}
      <form
        onSubmit={onGenerate}
        noValidate
        className="mb-6 rounded-2xl border border-brand-purple/20 bg-gradient-to-br from-brand-purple/5 to-transparent p-5 shadow-inner"
      >
        <h4 className="mb-4 flex items-center gap-2 text-sm font-black text-brand-purple">
          <span aria-hidden="true">🧠</span> AI DİYETİSYEN &amp; KALORİ HESAPLAYICI
        </h4>
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="ai-diet-age" className="sr-only">
                Yaş
              </label>
              <input
                id="ai-diet-age"
                type="number"
                placeholder="Yaş"
                {...register('age')}
                aria-invalid={errors.age ? 'true' : 'false'}
                className="w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
              />
              {errors.age ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-red-500">
                  {errors.age.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ai-diet-height" className="sr-only">
                Boy (cm)
              </label>
              <input
                id="ai-diet-height"
                type="number"
                placeholder="Boy (cm)"
                {...register('height_cm')}
                aria-invalid={errors.height_cm ? 'true' : 'false'}
                className="w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
              />
              {errors.height_cm ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-red-500">
                  {errors.height_cm.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ai-diet-weight" className="sr-only">
                Kilo (kg)
              </label>
              <input
                id="ai-diet-weight"
                type="number"
                placeholder="Kilo (kg)"
                {...register('weight_kg')}
                aria-invalid={errors.weight_kg ? 'true' : 'false'}
                className="w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
              />
              {errors.weight_kg ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-red-500">
                  {errors.weight_kg.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ai-diet-gender" className="sr-only">
                Cinsiyet
              </label>
              <select
                id="ai-diet-gender"
                {...register('gender')}
                className="w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
              >
                <option value="male">Erkek</option>
                <option value="female">Kadın</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-diet-steps" className="sr-only">
                Günlük adım sayısı
              </label>
              <select
                id="ai-diet-steps"
                {...register('steps')}
                className="w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
              >
                <option value={4000}>&lt; 5.000 Adım (Masa Başı)</option>
                <option value={6500}>5.000 - 8.000 Adım</option>
                <option value={9000}>8.000 - 10.000 Adım</option>
                <option value={11000}>10.000 - 12.000 Adım</option>
                <option value={13000}>12.000+ Adım (Çok Hareketli)</option>
              </select>
            </div>
            <div>
              <label htmlFor="ai-diet-goal" className="sr-only">
                Hedef
              </label>
              <select
                id="ai-diet-goal"
                {...register('goal')}
                className="w-full rounded-xl border bg-orange-50 p-3 text-xs font-bold text-orange-600 outline-none focus:border-orange-500 dark:bg-orange-900/20"
              >
                <option value="maintain">Koruma (0 kcal)</option>
                <option value="cut">Definasyon (-500 kcal)</option>
                <option value="bulk">Bulk (+500 kcal)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <label htmlFor="ai-diet-prompt" className="sr-only">
              Yapay zekâya talimat
            </label>
            <textarea
              id="ai-diet-prompt"
              {...register('user_prompt')}
              placeholder="Örn: Yulaf ve tavuk yemem alternatif öner. Yağı zeytinyağı + kuruyemiş olarak ayarla..."
              className="min-h-[90px] w-full rounded-xl border bg-white p-3 text-xs outline-none focus:border-brand-purple dark:bg-zinc-900"
            />
            <div className="flex items-center gap-3">
              {targetCalories > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-1 items-center justify-center rounded-xl border bg-white p-3 dark:bg-zinc-900"
                >
                  <p className="mr-2 text-[10px] font-bold text-gray-500">HEDEF:</p>
                  <p className="text-xl font-black text-brand-purple">
                    {targetCalories} <span className="text-xs">kcal</span>
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={isGenerating}
                aria-busy={isGenerating}
                className="flex-1 rounded-xl bg-brand-purple p-3 text-sm font-bold text-white shadow-md transition-all hover:bg-brand-purpleHover disabled:opacity-50"
              >
                {isGenerating ? 'Hesaplanıyor...' : 'Oluştur ✨'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* HIZLI BESİN EKLEME PANELİ (Oto-Tamamlama) */}
      <div className="relative z-10 flex flex-col items-end gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row">
        <div className="w-full md:w-1/4">
          <label htmlFor="quick-add-day" className="mb-1 block text-[10px] font-bold text-gray-500">
            GÜN SEÇ
          </label>
          <select
            id="quick-add-day"
            value={quickAddDay}
            onChange={(e) => setQuickAddDay(e.target.value as DayName)}
            className="w-full rounded-xl border bg-white p-2.5 text-sm outline-none dark:border-zinc-700 dark:bg-black"
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-2/4">
          <label
            htmlFor="quick-add-search"
            className="mb-1 block text-[10px] font-bold text-gray-500"
          >
            BESİN ARA
          </label>
          <input
            id="quick-add-search"
            type="text"
            role="combobox"
            aria-expanded={isListOpen}
            aria-controls="quick-add-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? `food-option-${activeOption.id}` : undefined}
            placeholder="Örn: Yulaf, Tavuk..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSelectedFood(null)
              setActiveIndex(-1)
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full rounded-xl border bg-white p-2.5 text-sm outline-none focus:border-brand-purple dark:border-zinc-700 dark:bg-black"
          />
          {isListOpen && (
            <div
              id="quick-add-listbox"
              role="listbox"
              aria-label="Besin önerileri"
              className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            >
              {suggestions.map((food, index) => (
                <button
                  type="button"
                  key={food.id}
                  id={`food-option-${food.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => pickFood(food)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full cursor-pointer border-b p-3 text-left text-sm last:border-0 dark:border-zinc-800 ${
                    index === activeIndex ? 'bg-brand-purple/10' : 'hover:bg-brand-purple/10'
                  }`}
                >
                  <span className="font-bold">{food.name}</span>{' '}
                  <span className="text-[10px] text-gray-500">
                    ({food.calories_per_100g} kcal/100g)
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-full md:w-1/4">
          <label
            htmlFor="quick-add-grams"
            className="mb-1 block text-[10px] font-bold text-gray-500"
          >
            GRAMAJ
          </label>
          <input
            id="quick-add-grams"
            type="number"
            value={quickAddGrams}
            onChange={(e) => setQuickAddGrams(e.target.value)}
            className="w-full rounded-xl border bg-white p-2.5 text-sm outline-none focus:border-brand-purple dark:border-zinc-700 dark:bg-black"
          />
        </div>

        <button
          type="button"
          onClick={handleQuickAdd}
          className="w-full whitespace-nowrap rounded-xl bg-brand-purple px-6 py-2.5 font-bold text-white shadow-md transition-transform active:scale-95 md:w-auto"
        >
          Hızlı Ekle <span aria-hidden="true">⚡</span>
        </button>
      </div>

      {/* TABLO */}
      <QueryState
        isLoading={planQuery.isLoading || foodsQuery.isLoading}
        isError={planQuery.isError}
        error={planQuery.error}
        skeleton={<SkeletonTable rows={7} cols={3} />}
        onRetry={() => void planQuery.refetch()}
      >
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Haftalık beslenme planı: gün, besinler ve otomatik hesaplanan kalori.
            </caption>
            <thead className="border-b border-gray-200 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="w-1/4 p-3 font-bold text-gray-600 dark:text-gray-300">
                  Gün
                </th>
                <th scope="col" className="p-3 font-bold text-gray-600 dark:text-gray-300">
                  Besinler (Besin:Gramaj)
                </th>
                <th scope="col" className="w-1/6 p-3 font-bold text-gray-600 dark:text-gray-300">
                  Otomatik Kalori
                </th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr
                  key={day}
                  className="border-b border-gray-100 transition-colors hover:bg-gray-50/50 dark:border-zinc-800/50"
                >
                  <th
                    scope="row"
                    className="p-3 text-left font-bold text-gray-700 dark:text-gray-300"
                  >
                    {day}
                  </th>
                  <td className="p-2">
                    <label htmlFor={`nutrition-${day}`} className="sr-only">
                      {day} besinleri
                    </label>
                    <input
                      id={`nutrition-${day}`}
                      value={nutritionData[day].items}
                      onChange={(e) => handleManualNutritionChange(day, e.target.value)}
                      placeholder="Manuel de yazabilirsiniz..."
                      className="w-full rounded-lg border border-transparent bg-transparent p-2 outline-none transition-all hover:border-gray-200 focus:border-brand-purple dark:hover:border-zinc-700"
                    />
                  </td>
                  <td className="p-3 font-black text-brand-purple">
                    {nutritionData[day].total}{' '}
                    <span className="text-xs font-bold opacity-50">kcal</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>

      <button
        type="button"
        onClick={handleSaveProgram}
        disabled={savePlan.isPending}
        aria-busy={savePlan.isPending}
        className="w-full rounded-xl bg-emerald-500 py-4 text-sm font-black text-white shadow-md transition-transform hover:bg-emerald-600 active:scale-95 disabled:opacity-50"
      >
        Beslenme Tablosunu Kaydet
      </button>
    </div>
  )
}
