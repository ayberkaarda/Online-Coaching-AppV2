'use client'

// Beslenme sekmesi. Üç bağımsız parça bir araya gelir (§4.2):
//   1) Koç: günlük makro hedefi (nutrition_plans.target_*) — CRUD, salt koç.
//   2) Herkes: hedef vs gerçekleşen makro dashboard'u — YATAY BAR, halka DEĞİL
//      (ADR-0017 tek anlam kuralı: halka yalnızca döngü durumu kodlar, makro
//      bir bütçedir). Bkz. `computeMacroBudget` / `MacroDashboard` altında.
//   3) Danışan: manuel öğün ekleme/silme (nutrition_logs) — koç SALT OKUR,
//      arayüz koça hiçbir yazma eylemi SUNMAZ (bkz. useNutritionLogs.ts RLS notu).
// Ayrıca eskiden beri var olan "Haftalık Beslenme Planı" (öğün ŞABLONU,
// nutrition_plans/nutrition_plan_meals, save_nutrition_plan() RPC'si) AYNEN
// korunur — bu görev o akışı YENİDEN YAZMAZ, yalnızca görsel dili token'lara
// taşır (ADR-0018 Katman B).

import { zodResolver } from '@hookform/resolvers/zod'
import { Brain, Download, FileSpreadsheet, Plus, Sparkles, Target, Trash2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { QueryState, SkeletonTable } from '@/components/ui'
import {
  sumNutritionLogsForDate,
  useCreateNutritionLog,
  useDeleteNutritionLog,
  useFoods,
  useGenerateDiet,
  useNutritionLogs,
  useNutritionPlan,
  useNutritionTargets,
  useSaveNutritionPlan,
  useSetNutritionTargets,
  type NutritionLog,
  type NutritionTargets,
  type NutritionTotals,
} from '@/hooks'
import { todayIsoDate } from '@/lib/date'
import { DAYS, downloadCSV, formatDateTR } from '@/lib/utils'
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

// =============================================================================
// MAKRO BÜTÇESİ — hesap (saf fonksiyon, tests/unit/macro-dashboard.test.tsx)
// =============================================================================
//
// ADR-0017: makro bir DÖNGÜ değil bir BÜTÇEDİR, bu yüzden imza öğe halkası
// buraya GİRMEZ (tek anlam kuralı — halka yalnızca döngü/çevrim durumu
// kodlar). Bu yüzden aşağıdaki `MacroDashboard` bileşeni YATAY BAR kullanır;
// hiçbir `<svg>`/`stroke-dashoffset` içermez (regresyon: aynı test dosyası).
//
// AŞIM KARARI: bar dolgusu her zaman [0, 100] aralığına KIRPILIR (bir bar
// konteynerin dışına taşamaz) ama gerçek sayılar ASLA gizlenmez — metin her
// zaman "gerçekleşen / hedef" birimini gösterir ve hedef aşıldığında
// `danger` token'ıyla + "+X aşım" ek metniyle FARK edilir kılınır. Yüzde
// %90'a ulaştığında (henüz aşılmadan) `warning` tonuna geçilir — kullanıcı
// bütçeyi aşmadan ÖNCE uyarılır. Bu, bir halkanın "dolup taşması" gibi
// belirsiz bir görsel duruma girmeden aşımı KESİN biçimde iletir.
export type MacroBudgetState = 'no-target' | 'under' | 'near' | 'over'

export interface MacroBudget {
  state: MacroBudgetState
  /** Bar dolgu genişliği — HER ZAMAN 0-100 aralığına kırpılır. */
  fillPercent: number
  /** Hedefi aşan miktar (yalnızca `state === 'over'` iken > 0 anlamlıdır). */
  overBy: number
}

/** %90 ve üzeri "yaklaşıldı" (near) sayılır — aşım ÖNCESİ uyarı eşiği. */
const NEAR_THRESHOLD = 0.9

/**
 * Hedef vs gerçekleşen tek bir makronun bütçe durumunu hesaplar.
 *
 * `target === null` -> "koç henüz hedef vermedi" (0 İLE KARIŞTIRILMAZ, bkz.
 * 20260817190100 migration yorumu). Bu durumda bar dolgusu 0'dır ama bunun
 * anlamı `MacroDashboard`'da "hedef yok" metniyle ayrıca belirtilir — salt
 * `fillPercent: 0` görüp "hedef 0 kcal, hiç aşılmadı" sonucuna VARILMAZ.
 *
 * `target === 0`: gerçek bir bütçedir (0 bir hedeftir, yokluk değildir). 0'a
 * karşı herhangi bir pozitif tüketim doğrudan AŞIMDIR (bölme sıfıra
 * bölünmeden ayrıca ele alınır).
 */
export function computeMacroBudget(target: number | null, actual: number): MacroBudget {
  if (target === null) return { state: 'no-target', fillPercent: 0, overBy: 0 }

  if (target === 0) {
    return actual > 0
      ? { state: 'over', fillPercent: 100, overBy: actual }
      : { state: 'under', fillPercent: 0, overBy: 0 }
  }

  const ratio = actual / target
  if (ratio > 1) return { state: 'over', fillPercent: 100, overBy: actual - target }

  const fillPercent = Math.max(ratio, 0) * 100
  const state: MacroBudgetState = ratio >= NEAR_THRESHOLD ? 'near' : 'under'
  return { state, fillPercent, overBy: 0 }
}

const MACRO_ROWS: ReadonlyArray<{
  key: keyof NutritionTargets
  label: string
  unit: string
}> = [
  { key: 'kcal', label: 'Kalori', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carb_g', label: 'Karbonhidrat', unit: 'g' },
  { key: 'fat_g', label: 'Yağ', unit: 'g' },
]

const BAR_COLOR_BY_STATE: Record<MacroBudgetState, string> = {
  'no-target': 'bg-border',
  under: 'bg-accent',
  near: 'bg-warning',
  over: 'bg-danger',
}

function MacroBudgetRow({
  label,
  unit,
  target,
  actual,
}: {
  label: string
  unit: string
  target: number | null
  actual: number
}): JSX.Element {
  const budget = computeMacroBudget(target, actual)
  const roundedActual = Math.round(actual)

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
        <span className="font-bold text-fg-muted">{label}</span>
        <span className={`font-bold ${budget.state === 'over' ? 'text-danger' : 'text-fg'}`}>
          {target === null ? (
            <>
              {roundedActual} {unit}{' '}
              <span className="font-normal text-fg-muted">(hedef belirlenmedi)</span>
            </>
          ) : (
            <>
              {roundedActual} / {target} {unit}
              {budget.state === 'over' && (
                <span className="ml-1 font-normal text-danger">
                  (+{Math.round(budget.overBy)} {unit} aşım)
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} bütçesi`}
        aria-valuemin={0}
        aria-valuemax={target ?? undefined}
        aria-valuenow={target !== null ? Math.min(roundedActual, target) : undefined}
        aria-valuetext={target === null ? 'Hedef belirlenmedi' : undefined}
        className="h-2.5 w-full overflow-hidden rounded-control bg-canvas"
      >
        <div
          className={`h-full rounded-control transition-all ${BAR_COLOR_BY_STATE[budget.state]}`}
          style={{ width: `${budget.fillPercent}%` }}
        />
      </div>
    </div>
  )
}

export interface MacroDashboardProps {
  targets: NutritionTargets
  totals: NutritionTotals
}

/** Hedef vs gerçekleşen — YATAY BAR (ADR-0017: halka değil, makro bir bütçedir). */
export function MacroDashboard({ targets, totals }: MacroDashboardProps): JSX.Element {
  return (
    <div className="space-y-4 rounded-panel border border-border bg-surface p-5">
      <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
        <Target aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
        Günlük Makro Durumu
      </h4>
      <div className="space-y-3">
        {MACRO_ROWS.map((row) => (
          <MacroBudgetRow
            key={row.key}
            label={row.label}
            unit={row.unit}
            target={targets[row.key]}
            actual={totals[row.key]}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// KOÇ: günlük makro hedefi editörü
// =============================================================================

/** Sayı girişi state'i metin olarak tutulur: boş string = `null` (hedef verilmedi), "0" = 0 (gerçek hedef). */
type TargetDraft = Record<keyof NutritionTargets, string>

function targetsToDraft(targets: NutritionTargets): TargetDraft {
  return {
    kcal: targets.kcal === null ? '' : String(targets.kcal),
    protein_g: targets.protein_g === null ? '' : String(targets.protein_g),
    carb_g: targets.carb_g === null ? '' : String(targets.carb_g),
    fat_g: targets.fat_g === null ? '' : String(targets.fat_g),
  }
}

/** Boş string -> `null`; aksi hâlde tam sayı. Geçersiz/negatif girişte `undefined` döner. */
function parseTargetField(raw: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

const TARGET_FIELD_META: ReadonlyArray<{
  key: keyof NutritionTargets
  label: string
  placeholder: string
}> = [
  { key: 'kcal', label: 'Günlük Kalori Hedefi (kcal)', placeholder: 'Örn: 2200' },
  { key: 'protein_g', label: 'Protein Hedefi (g)', placeholder: 'Örn: 160' },
  { key: 'carb_g', label: 'Karbonhidrat Hedefi (g)', placeholder: 'Örn: 220' },
  { key: 'fat_g', label: 'Yağ Hedefi (g)', placeholder: 'Örn: 70' },
]

function CoachTargetEditor({ clientId }: { clientId: string }): JSX.Element {
  const targetsQuery = useNutritionTargets(clientId)
  const setTargets = useSetNutritionTargets()

  const serverTargets = targetsQuery.data
  const draftKey = `${clientId}:${targetsQuery.isFetched ? '1' : '0'}`
  const [loadedDraftKey, setLoadedDraftKey] = useState(draftKey)
  // `{} as NutritionTargets` KULLANILMAZ: `targetsToDraft` her alanı `=== null` ile
  // kontrol eder, `undefined` bu kontrolü GEÇMEZ ve `String(undefined)` = "undefined"
  // metnini kutulara yazardı (query henüz senkron olmadan önceki ilk render'da).
  const [draft, setDraft] = useState<TargetDraft>(() =>
    targetsToDraft({ kcal: null, protein_g: null, carb_g: null, fat_g: null })
  )
  if (draftKey !== loadedDraftKey) {
    setLoadedDraftKey(draftKey)
    setDraft(
      targetsToDraft(serverTargets ?? { kcal: null, protein_g: null, carb_g: null, fat_g: null })
    )
  }

  const handleSave = (): void => {
    const parsed: Partial<NutritionTargets> = {}
    for (const { key, label } of TARGET_FIELD_META) {
      const value = parseTargetField(draft[key])
      if (value === undefined) {
        toast.error(`${label}: geçerli, negatif olmayan bir tam sayı girin ya da boş bırakın.`)
        return
      }
      parsed[key] = value
    }

    setTargets.mutate({
      clientId,
      targets: parsed as NutritionTargets,
    })
  }

  return (
    <div className="space-y-4 rounded-panel border border-accent/20 bg-surface p-5">
      <h4 className="flex items-center gap-2 text-sm font-bold text-accent">
        <Target aria-hidden="true" className="h-4 w-4 shrink-0" />
        Günlük Makro Hedefi
      </h4>
      <p className="text-xs text-fg-muted">
        Danışan ilerlemesini bu hedefe göre görür. Bir alanı boş bırakmak &quot;hedef
        verilmedi&quot; anlamına gelir — 0 girmek gerçek bir sıfır hedeftir.
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {TARGET_FIELD_META.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label
              htmlFor={`nutrition-target-${key}`}
              className="mb-1 block text-[10px] font-bold text-fg-muted"
            >
              {label}
            </label>
            <input
              id={`nutrition-target-${key}`}
              type="number"
              min={0}
              step={1}
              placeholder={placeholder}
              value={draft[key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={setTargets.isPending}
        aria-busy={setTargets.isPending}
        className="w-full rounded-control bg-accent py-2.5 text-sm font-bold text-accent-fg shadow-sm transition-transform active:scale-95 disabled:opacity-50 md:w-auto md:px-6"
      >
        Hedefi Kaydet
      </button>
    </div>
  )
}

// =============================================================================
// DANIŞAN: manuel öğün ekleme + geçmiş
// =============================================================================

/** Ondalık olmayan pozitif sayı ayrıştırır; boş string `null`, geçersiz değer `undefined` döner. */
function parseOptionalNonNegativeInt(raw: string): number | null | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

interface MealLogListProps {
  logs: NutritionLog[]
  /** Yalnızca danışan KENDİ kaydını silebilir; koç görünümünde `false` — SUNULMAZ (RLS zaten reddeder, ama arayüz hiç teklif etmez). */
  allowDelete: boolean
  onDelete?: (log: NutritionLog) => void
  isDeleting?: boolean
}

function MealLogList({ logs, allowDelete, onDelete, isDeleting }: MealLogListProps): JSX.Element {
  if (logs.length === 0) {
    return <p className="py-6 text-center text-xs font-bold text-fg-muted">Henüz öğün kaydı yok.</p>
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex items-center justify-between gap-3 rounded-control border border-border bg-canvas p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-bold text-fg">{log.description}</p>
            <p className="text-xs text-fg-muted">
              {formatDateTR(log.log_date)}
              {log.kcal !== null && ` · ${log.kcal} kcal`}
              {log.protein_g !== null && ` · P ${log.protein_g}g`}
              {log.carb_g !== null && ` · K ${log.carb_g}g`}
              {log.fat_g !== null && ` · Y ${log.fat_g}g`}
            </p>
          </div>
          {allowDelete && (
            <button
              type="button"
              onClick={() => onDelete?.(log)}
              disabled={isDeleting}
              aria-label={`${log.description} kaydını sil`}
              className="shrink-0 rounded-control p-2 text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

interface ClientMealSectionProps {
  clientId: string
  logs: NutritionLog[]
  foodDB: FoodItem[]
}

function ClientMealSection({ clientId, logs, foodDB }: ClientMealSectionProps): JSX.Element {
  const createLog = useCreateNutritionLog()
  const deleteLog = useDeleteNutritionLog()

  const [description, setDescription] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carb, setCarb] = useState('')
  const [fat, setFat] = useState('')
  const [assistFood, setAssistFood] = useState('')
  const [assistGrams, setAssistGrams] = useState('100')

  const handleCalculateFromFood = (): void => {
    const grams = Number.parseInt(assistGrams, 10)
    const food = foodDB.find((f) => f.name.toLowerCase() === assistFood.toLowerCase().trim())
    if (!food) {
      toast.error('Katalogda bu isimde bir besin bulunamadı.')
      return
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      toast.error('Geçerli bir gramaj girin.')
      return
    }
    const computedKcal = Math.round((food.calories_per_100g * grams) / 100)
    setKcal(String(computedKcal))
    setDescription((prev) => (prev.trim() === '' ? `${food.name} ${grams}g` : prev))
  }

  const handleSubmit = (): void => {
    if (description.trim() === '') {
      toast.error('Öğün açıklaması girin.')
      return
    }
    const parsedKcal = parseOptionalNonNegativeInt(kcal)
    const parsedProtein = parseOptionalNonNegativeInt(protein)
    const parsedCarb = parseOptionalNonNegativeInt(carb)
    const parsedFat = parseOptionalNonNegativeInt(fat)
    if (
      parsedKcal === undefined ||
      parsedProtein === undefined ||
      parsedCarb === undefined ||
      parsedFat === undefined
    ) {
      toast.error('Makro alanları negatif olmayan tam sayı olmalı (boş bırakılabilir).')
      return
    }

    createLog.mutate(
      {
        clientId,
        description: description.trim(),
        kcal: parsedKcal,
        protein_g: parsedProtein,
        carb_g: parsedCarb,
        fat_g: parsedFat,
        // Kullanıcının YEREL günü, AÇIKÇA gönderilir: dashboard (`todayTotals`)
        // aynı `todayIsoDate()` değeriyle filtreler. Alan boş bırakılıp DB'nin
        // UTC `current_date` varsayılanına düşülseydi, UTC+3'te gece
        // 00:00–03:00 arasında eklenen öğün "dün"e yazılır ve toplamda hiç
        // görünmezdi (bkz. src/lib/date.ts).
        log_date: todayIsoDate(),
      },
      {
        onSuccess: () => {
          setDescription('')
          setKcal('')
          setProtein('')
          setCarb('')
          setFat('')
          setAssistFood('')
          setAssistGrams('100')
        },
      }
    )
  }

  return (
    <div className="space-y-4 rounded-panel border border-border bg-surface p-5">
      <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
        <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
        Öğün Ekle
      </h4>

      <div className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
        <div>
          <label
            htmlFor="nutrition-log-food"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            BESİNDEN HESAPLA (opsiyonel)
          </label>
          <input
            id="nutrition-log-food"
            list="nutrition-log-food-options"
            value={assistFood}
            onChange={(e) => setAssistFood(e.target.value)}
            placeholder="Katalogdan besin ara..."
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
          <datalist id="nutrition-log-food-options">
            {foodDB.map((food) => (
              <option key={food.id} value={food.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label
            htmlFor="nutrition-log-grams"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            GRAMAJ
          </label>
          <input
            id="nutrition-log-grams"
            type="number"
            min={0}
            value={assistGrams}
            onChange={(e) => setAssistGrams(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={handleCalculateFromFood}
          className="self-end rounded-control border border-accent/30 px-4 py-2.5 text-xs font-bold text-accent transition-colors hover:bg-accent/10"
        >
          Kaloriyi Hesapla
        </button>
      </div>

      <div>
        <label
          htmlFor="nutrition-log-description"
          className="mb-1 block text-[10px] font-bold text-fg-muted"
        >
          AÇIKLAMA
        </label>
        <input
          id="nutrition-log-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Örn: Izgara tavuk + pilav"
          className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label
            htmlFor="nutrition-log-kcal"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            KALORİ
          </label>
          <input
            id="nutrition-log-kcal"
            type="number"
            min={0}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <div>
          <label
            htmlFor="nutrition-log-protein"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            PROTEİN (g)
          </label>
          <input
            id="nutrition-log-protein"
            type="number"
            min={0}
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <div>
          <label
            htmlFor="nutrition-log-carb"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            KARB (g)
          </label>
          <input
            id="nutrition-log-carb"
            type="number"
            min={0}
            value={carb}
            onChange={(e) => setCarb(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <div>
          <label
            htmlFor="nutrition-log-fat"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            YAĞ (g)
          </label>
          <input
            id="nutrition-log-fat"
            type="number"
            min={0}
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={createLog.isPending}
        aria-busy={createLog.isPending}
        className="w-full rounded-control bg-accent py-2.5 text-sm font-bold text-accent-fg shadow-sm transition-transform active:scale-95 disabled:opacity-50"
      >
        Öğünü Ekle
      </button>

      <MealLogList
        logs={logs}
        allowDelete
        isDeleting={deleteLog.isPending}
        onDelete={(log) => deleteLog.mutate({ id: log.id, clientId })}
      />
    </div>
  )
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

  const isCoachRole = userRole === 'coach'
  // Hedef/dashboard/öğün paneli TEK danışan bağlamında anlamlıdır (DailyLogTab.tsx
  // ile aynı kısıt): koç birden fazla danışan seçtiyse targetId hangisine ait
  // belirsizleşir.
  const showSingleClientPanels = !isCoachRole || selectedClientIds.length <= 1

  const targetsQuery = useNutritionTargets(targetId)
  const logsQuery = useNutritionLogs(targetId)
  const todayTotals = useMemo(
    () => sumNutritionLogsForDate(logsQuery.data ?? [], todayIsoDate()),
    [logsQuery.data]
  )

  const foodDB: FoodItem[] = useMemo(() => foodsQuery.data ?? [], [foodsQuery.data])

  const [nutritionData, setNutritionData] = useState<NutritionPlan>(() => emptyPlan())
  const [targetCalories, setTargetCalories] = useState(0)

  // targetId değiştiğinde düzenleme taslağını sunucudan gelen planla tazeler.
  // React'in "prop değişince state ayarlama" kalıbı: render sırasında setState,
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
      toast.error('Danışan seçin!')
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
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h4 className="text-lg font-bold text-fg">Haftalık Beslenme Planı</h4>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDownloadImage}
            className="flex items-center gap-1.5 rounded-control bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent"
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Görsel İndir
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 rounded-control bg-success/10 px-3 py-1.5 text-xs font-bold text-success"
          >
            <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> CSV İndir
          </button>
        </div>
      </div>

      {/* MAKRO HEDEFİ + DASHBOARD (§4.2 1&2) — tek danışan bağlamında */}
      {showSingleClientPanels && targetId ? (
        <div className="space-y-4">
          {isCoachRole && <CoachTargetEditor clientId={targetId} />}
          <QueryState
            isLoading={targetsQuery.isLoading || logsQuery.isLoading}
            isError={targetsQuery.isError || logsQuery.isError}
            error={targetsQuery.error ?? logsQuery.error}
            onRetry={() => {
              void targetsQuery.refetch()
              void logsQuery.refetch()
            }}
          >
            <MacroDashboard
              targets={
                targetsQuery.data ?? { kcal: null, protein_g: null, carb_g: null, fat_g: null }
              }
              totals={todayTotals}
            />
          </QueryState>

          {/* ÖĞÜN EKLEME/GEÇMİŞİ (§4.2 3) — YALNIZCA danışan yazar. Koç görünümünde
              yalnızca salt-okunur geçmiş listesi vardır, EKLEME/SİLME kontrolü hiç
              RENDER EDİLMEZ (RLS zaten 42501 ile reddeder, ama arayüz teklif bile
              etmez — bkz. useNutritionLogs.ts dosya başı notu). */}
          {!isCoachRole && currentUserId ? (
            <ClientMealSection
              clientId={currentUserId}
              logs={logsQuery.data ?? []}
              foodDB={foodDB}
            />
          ) : isCoachRole ? (
            <div className="space-y-2 rounded-panel border border-border bg-surface p-5">
              <h4 className="text-sm font-bold text-fg">Danışanın Öğün Geçmişi (salt okunur)</h4>
              <p className="text-xs text-fg-muted">
                Öğün kayıtlarını yalnızca danışan ekleyip silebilir; koç burada sadece görüntüler.
              </p>
              <MealLogList logs={logsQuery.data ?? []} allowDelete={false} />
            </div>
          ) : null}
        </div>
      ) : isCoachRole ? (
        <p className="rounded-panel border border-border bg-surface py-6 text-center text-sm font-bold text-accent">
          Makro hedefi ve öğün geçmişi için tek danışan seçili bırakın.
        </p>
      ) : null}

      {/* AKILLI DİYETİSYEN PANELİ */}
      <form
        onSubmit={onGenerate}
        noValidate
        className="mb-6 rounded-panel border border-accent/20 bg-surface p-5 shadow-inner"
      >
        <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-accent">
          <Brain aria-hidden="true" className="h-4 w-4 shrink-0" /> AI DİYETİSYEN &amp; KALORİ
          HESAPLAYICI
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
                className="w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
              />
              {errors.age ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-danger">
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
                className="w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
              />
              {errors.height_cm ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-danger">
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
                className="w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
              />
              {errors.weight_kg ? (
                <p role="alert" className="mt-1 text-[10px] font-bold text-danger">
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
                className="w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
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
                className="w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
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
                className="w-full rounded-control border border-warning/40 bg-warning/10 p-3 text-xs font-bold text-warning outline-none focus:border-warning"
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
              className="min-h-[90px] w-full rounded-control border border-border bg-canvas p-3 text-xs text-fg outline-none focus:border-accent"
            />
            <div className="flex items-center gap-3">
              {targetCalories > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-1 items-center justify-center rounded-control border border-border bg-canvas p-3"
                >
                  <p className="mr-2 text-[10px] font-bold text-fg-muted">HEDEF:</p>
                  <p className="text-xl font-bold text-accent">
                    {targetCalories} <span className="text-xs">kcal</span>
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={isGenerating}
                aria-busy={isGenerating}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-accent p-3 text-sm font-bold text-accent-fg shadow-md transition-all hover:bg-accent/90 disabled:opacity-50"
              >
                {isGenerating ? (
                  'Hesaplanıyor...'
                ) : (
                  <>
                    Oluştur
                    <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* HIZLI BESİN EKLEME PANELİ (Oto-Tamamlama) */}
      <div className="relative z-10 flex flex-col items-end gap-4 rounded-panel border border-border bg-canvas p-4 shadow-sm md:flex-row">
        <div className="w-full md:w-1/4">
          <label htmlFor="quick-add-day" className="mb-1 block text-[10px] font-bold text-fg-muted">
            GÜN SEÇ
          </label>
          <select
            id="quick-add-day"
            value={quickAddDay}
            onChange={(e) => setQuickAddDay(e.target.value as DayName)}
            className="w-full rounded-control border border-border bg-surface p-2.5 text-sm text-fg outline-none"
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
            className="mb-1 block text-[10px] font-bold text-fg-muted"
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
            className="w-full rounded-control border border-border bg-surface p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
          {isListOpen && (
            <div
              id="quick-add-listbox"
              role="listbox"
              aria-label="Besin önerileri"
              className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-control border border-border bg-surface shadow-xl"
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
                  className={`w-full cursor-pointer border-b border-border p-3 text-left text-sm last:border-0 ${
                    index === activeIndex ? 'bg-accent/10' : 'hover:bg-accent/10'
                  }`}
                >
                  <span className="font-bold text-fg">{food.name}</span>{' '}
                  <span className="text-[10px] text-fg-muted">
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
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            GRAMAJ
          </label>
          <input
            id="quick-add-grams"
            type="number"
            value={quickAddGrams}
            onChange={(e) => setQuickAddGrams(e.target.value)}
            className="w-full rounded-control border border-border bg-surface p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>

        <button
          type="button"
          onClick={handleQuickAdd}
          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-accent px-6 py-2.5 font-bold text-accent-fg shadow-md transition-transform active:scale-95 md:w-auto"
        >
          Hızlı Ekle
          <Zap aria-hidden="true" className="h-4 w-4 shrink-0" />
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
        <div className="overflow-x-auto rounded-control border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Haftalık beslenme planı: gün, besinler ve otomatik hesaplanan kalori.
            </caption>
            <thead className="border-b border-border bg-canvas">
              <tr>
                <th scope="col" className="w-1/4 p-3 font-bold text-fg-muted">
                  Gün
                </th>
                <th scope="col" className="p-3 font-bold text-fg-muted">
                  Besinler (Besin:Gramaj)
                </th>
                <th scope="col" className="w-1/6 p-3 font-bold text-fg-muted">
                  Otomatik Kalori
                </th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => (
                <tr
                  key={day}
                  className="border-b border-border/50 transition-colors hover:bg-canvas/50"
                >
                  <th scope="row" className="p-3 text-left font-bold text-fg">
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
                      className="w-full rounded-control border border-transparent bg-transparent p-2 text-fg outline-none transition-all hover:border-border focus:border-accent"
                    />
                  </td>
                  <td className="p-3 font-bold text-accent">
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
        className="w-full rounded-control bg-success py-4 text-sm font-bold text-accent-fg shadow-md transition-transform hover:bg-success/90 active:scale-95 disabled:opacity-50"
      >
        Beslenme Tablosunu Kaydet
      </button>
    </div>
  )
}
