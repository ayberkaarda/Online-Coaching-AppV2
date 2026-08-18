'use client'

// İlerleme takibi sekmesi — Faz 4c (§6).
//
// ÜÇ PARÇA:
//   1) TREND GRAFİĞİ — `progress_entries`, 7/30/90 gün aralık seçici, metrik
//      seçici (kilo + beş çevre ölçüsü). Veri TEK endpoint'ten (`useProgressTrend`)
//      gelir; bu bileşen kendi sorgusunu YAZMAZ (AC-4.2, AC-2.4).
//   2) ÖLÇÜM GİRİŞİ — YALNIZCA danışan. Aynı güne ikinci giriş yeni satır
//      açmaz, o günün kaydını günceller (AC-4.1 — upsert, bkz. hook).
//   3) İLERLEME FOTOĞRAFLARI — `ProgressPhotos` (Faz 4d) kendi verisini kendi
//      çeker; buradan yalnızca `clientId` + `readOnly` alır.
//
// ###########################################################################
// # ESKİ GRAFİĞİN AKIBETİ — `useFormChecks` KİLO GRAFİĞİ KALDIRILDI          #
// #                                                                           #
// # Bu sekme Faz 4c'ye kadar kiloyu `form_checks.current_weight`'ten          #
// # çiziyordu. Artık ÇİZMİYOR; trend `progress_entries`ten gelir. Gerekçe:    #
// #                                                                           #
// #  * AC-4.2 "grafik verisi TEK endpoint'ten gelir ve TÜM EKRANLAR AYNI      #
// #    SERİYİ çizer" der. Aynı ekranda ikinci bir kilo serisini BAŞKA bir     #
// #    tablodan çizmek tam olarak bu maddenin yasakladığı şeydir: iki kilo    #
// #    eğrisi birbirini tutmaz ve kullanıcı hangisinin "gerçek" olduğunu      #
// #    bilemez.                                                               #
// #  * İki kaynağı İSTEMCİDE BİRLEŞTİRMEK de seçilmedi. Migration            #
// #    (20260817220000, KARAR 1b) `progress_entries.weight_kg` tipini         #
// #    `form_checks.current_weight` ile BİREBİR aynı seçti ve gerekçesini     #
// #    açıkça yazdı: "Faz 4'ün sonraki dilimi O VERİYİ BURAYA TAŞIYACAK;      #
// #    kaynak ile hedef tipinin aynı olması taşımanın satır düşürmesini       #
// #    imkânsız kılar." Yani birleştirme bir VERİ TAŞIMA (migration) işidir,  #
// #    kalıcı bir görüntüleme hilesi değil. İstemcide birleştirmek o          #
// #    taşımayı sonsuza kadar erteler ve "aynı kilo iki kez" (taşıma sonrası  #
// #    hem form_check hem progress_entry) hatasını doğurur.                   #
// #  * VERİ KAYBI YOKTUR: form check kiloları `form_checks` tablosunda        #
// #    DURUYOR ve arayüzde iki yerde görünmeye devam ediyor — "Form Check"    #
// #    sekmesindeki kayıt listesi ve koç panelindeki (`CoachUserManagement`)  #
// #    kilo grafiği. Bu dilim hiçbir satır silmedi.                           #
// ###########################################################################

import { LineChart as LineChartIcon, Ruler } from 'lucide-react'
import { useState } from 'react'
import type { JSX } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { ProgressPhotos } from '@/components/progress/ProgressPhotos'
import { QueryState, SkeletonChart } from '@/components/ui'
import { tokens } from '@/design/tokens'
import {
  DEFAULT_TREND_RANGE_DAYS,
  PROGRESS_METRICS,
  TREND_RANGE_DAYS,
  summarizeMetric,
  useProgressTrend,
  useUpsertProgressEntry,
  validateProgressEntry,
  type ProgressEntryValues,
  type ProgressMetricKey,
  type ProgressMetricMeta,
  type TrendRangeDays,
} from '@/hooks'
import { todayIsoDate } from '@/lib/date'
import { formatDateTR } from '@/lib/utils'
import type { UserRole } from '@/types'

export interface StatsTabProps {
  targetId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

/** Boş metin `null` (= ölçülmedi, 0 DEĞİL); geçersiz metin `undefined`. */
function parseMeasurement(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

type MeasurementDraft = Record<ProgressMetricKey, string>

const EMPTY_DRAFT: MeasurementDraft = {
  weight_kg: '',
  waist_cm: '',
  chest_cm: '',
  arm_cm: '',
  thigh_cm: '',
  hip_cm: '',
}

// ===========================================================================
// ÖLÇÜM GİRİŞİ — YALNIZCA DANIŞAN
// ===========================================================================
//
// Koç bu bileşeni HİÇ render etmez (aşağıdaki `!isCoach` koşulu). RLS zaten
// 42501 ile reddederdi (migration KARAR 3), ama arayüz eylemi TEKLİF BİLE
// ETMEZ — `NutritionTab`'ın `ClientMealSection` deseniyle aynı.

function ProgressEntryForm({ clientId }: { clientId: string }): JSX.Element {
  const upsert = useUpsertProgressEntry()

  const [entryDate, setEntryDate] = useState(() => todayIsoDate())
  const [draft, setDraft] = useState<MeasurementDraft>(EMPTY_DRAFT)
  const [notes, setNotes] = useState('')

  const handleSubmit = (): void => {
    const values: Partial<ProgressEntryValues> = {}
    for (const metric of PROGRESS_METRICS) {
      const parsed = parseMeasurement(draft[metric.key])
      if (parsed === undefined) {
        toast.error(`${metric.label}: sayısal bir değer girin ya da boş bırakın.`)
        return
      }
      values[metric.key] = parsed
    }

    const trimmedNotes = notes.trim()
    const payload: ProgressEntryValues = {
      ...(values as ProgressEntryValues),
      notes: trimmedNotes === '' ? null : trimmedNotes,
    }

    // `progress_entries_not_empty_chk` ve aralık CHECK'lerinin arayüz karşılığı:
    // kullanıcı ham 23514 metnini GÖRMEZ (bkz. validateProgressEntry).
    const problem = validateProgressEntry(payload)
    if (problem) {
      toast.error(problem)
      return
    }

    upsert.mutate(
      { clientId, entryDate, ...payload },
      {
        onSuccess: () => {
          setDraft(EMPTY_DRAFT)
          setNotes('')
        },
      }
    )
  }

  return (
    <div className="space-y-4 rounded-panel border border-border bg-surface p-5">
      <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
        <Ruler aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
        Ölçüm Girişi
      </h4>
      <p className="text-xs text-fg-muted">
        Günde tek kayıt tutulur: aynı güne ikinci giriş yeni satır oluşturmaz, o günün kaydını
        günceller. Boş bıraktığınız alan &quot;ölçülmedi&quot; demektir (0 değil).
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label
            htmlFor="progress-entry-date"
            className="mb-1 block text-[10px] font-bold text-fg-muted"
          >
            Ölçüm Tarihi
          </label>
          <input
            id="progress-entry-date"
            type="date"
            value={entryDate}
            max={todayIsoDate()}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
          />
        </div>

        {PROGRESS_METRICS.map((metric) => (
          <div key={metric.key}>
            <label
              htmlFor={`progress-entry-${metric.key}`}
              className="mb-1 block text-[10px] font-bold text-fg-muted"
            >
              {metric.label} ({metric.unit})
            </label>
            <input
              id={`progress-entry-${metric.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={draft[metric.key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [metric.key]: e.target.value }))}
              className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>

      <div>
        <label
          htmlFor="progress-entry-notes"
          className="mb-1 block text-[10px] font-bold text-fg-muted"
        >
          Not (opsiyonel)
        </label>
        <textarea
          id="progress-entry-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Örn: sabah aç karnına ölçüldü"
          className="min-h-[70px] w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={upsert.isPending}
        aria-busy={upsert.isPending}
        className="w-full rounded-control bg-accent py-2.5 text-sm font-bold text-accent-fg shadow-sm transition-transform active:scale-95 disabled:opacity-50 md:w-auto md:px-6"
      >
        Ölçümü Kaydet
      </button>
    </div>
  )
}

// ===========================================================================
// TREND GRAFİĞİ
// ===========================================================================

export interface ProgressTrendChartProps {
  clientId: string
  rangeDays: TrendRangeDays
  metric: ProgressMetricMeta
}

function ProgressTrendChart({ clientId, rangeDays, metric }: ProgressTrendChartProps): JSX.Element {
  // TEK ENDPOINT (AC-4.2): seri `buildTrendSeries` ile ÜRETİLİR, burada
  // yeniden hesaplanmaz. Başka bir ekran aynı seriyi çizmek isterse aynı
  // hook'u (ya da aynı saf fonksiyonu) çağırır.
  const { data: trend, isLoading, isError, error, refetch } = useProgressTrend(clientId, rangeDays)

  const summary = trend ? summarizeMetric(trend, metric.key) : null

  return (
    <QueryState
      isLoading={isLoading}
      isError={isError}
      error={error}
      isEmpty={trend !== undefined && trend.measuredDays === 0}
      skeleton={<SkeletonChart />}
      emptyMessage="Seçili aralıkta kayıtlı ölçüm yok."
      onRetry={() => void refetch()}
    >
      {trend && summary ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
            <p className="font-bold text-fg-muted">
              Seçili aralıkta {trend.measuredDays} ölçüm günü kayıtlı.
            </p>
            {summary.last ? (
              <p className="font-bold text-fg">
                Son ölçüm: {formatDateTR(summary.last.date)} · {summary.last.value} {metric.unit}
                {summary.delta !== null && summary.count > 1 ? (
                  <span className="ml-1 font-normal text-fg-muted">
                    (net {summary.delta > 0 ? '+' : ''}
                    {summary.delta.toFixed(1)} {metric.unit})
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="font-bold text-fg-muted">
                Bu aralıkta {metric.label.toLocaleLowerCase('tr-TR')} ölçümü yok.
              </p>
            )}
          </div>

          <figure className="rounded-panel border border-border bg-canvas p-4 shadow-sm">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.points} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    className="text-border"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    // recharts JS renk değeri bekliyor; `CoachUserManagement.tsx`'teki
                    // grafik deseniyle tutarlı olması için statik tokens.light.*
                    // kullanılıyor (tema duyarlı grafik renkleri ayrı bir iştir).
                    stroke={tokens.light.textSecondary}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    stroke={tokens.light.textSecondary}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - 1', 'dataMax + 1']}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: tokens.dark.surface,
                      border: `1px solid ${tokens.dark.border}`,
                      borderRadius: '12px',
                      color: tokens.dark.textPrimary,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric.key}
                    name={`${metric.label} (${metric.unit})`}
                    // ###############################################################
                    // # İNTERPOLASYON YOK (§6) — İKİ ŞARTIN İKİNCİSİ                 #
                    // #                                                               #
                    // # Seri, ölçüm olmayan gün için `null` taşır (birinci şart,      #
                    // # `buildTrendSeries`). `connectNulls` AÇIKÇA `false`:           #
                    // # recharts'ın BUGÜNKÜ varsayılanı da `false`'tur, ama bu bir    #
                    // # VARSAYILANA GÜVENMEK olurdu — sessizce değişirse (ya da bir   #
                    // # yükseltmede tersine dönerse) grafik boş günleri komşularıyla  #
                    // # birleştirir ve KİMSE fark etmez. Açık yazım o riski kapatır;  #
                    // # `tests/unit/progress-trend.test.tsx` gerçek SVG yolunu        #
                    // # (path `d`) okuyarak çizginin GERÇEKTEN kesildiğini doğrular.  #
                    // ###############################################################
                    connectNulls={false}
                    stroke={tokens.light.accent}
                    fill={tokens.light.accent}
                    fillOpacity={0.2}
                    strokeWidth={3}
                    dot={{ r: 4, fill: tokens.light.accent }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              {metric.label} trendi, son {trend.rangeDays} gün. {trend.measuredDays} ölçüm günü.
              {summary.first && summary.last
                ? ` İlk ölçüm ${summary.first.value} ${metric.unit}, son ölçüm ${summary.last.value} ${metric.unit}.`
                : ''}{' '}
              Ölçüm yapılmayan günlerde çizgi kesilir; ara değer üretilmez.
            </figcaption>
          </figure>
        </div>
      ) : null}
    </QueryState>
  )
}

// ===========================================================================
// SEKME
// ===========================================================================

export default function StatsTab({
  targetId,
  userRole,
  selectedClientIds,
}: StatsTabProps): JSX.Element {
  const isCoach = userRole === 'coach'
  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(DEFAULT_TREND_RANGE_DAYS)
  const [metricKey, setMetricKey] = useState<ProgressMetricKey>('weight_kg')

  const metric = PROGRESS_METRICS.find((item) => item.key === metricKey) ?? PROGRESS_METRICS[0]

  if (isCoach && selectedClientIds.length > 1) {
    return (
      <div className="animate-fadeIn space-y-6">
        <div className="border-b border-border pb-3">
          <h4 className="text-lg font-bold text-fg">Gelişim Analizi</h4>
        </div>
        <p className="py-10 text-center text-sm font-bold text-accent">
          Grafikleri görüntülemek için sadece 1 danışan seçili bırakın.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="border-b border-border pb-3">
        <h4 className="flex items-center gap-2 text-lg font-bold text-fg">
          <LineChartIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
          Gelişim Analizi
        </h4>
      </div>

      {/* ARALIK + METRİK SEÇİCİ — ikisi de yalnızca GÖRÜNÜMÜ değiştirir;
          seri kaynağı (useProgressTrend) tektir. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Trend aralığı"
          className="flex gap-1 rounded-control border border-border bg-surface p-1"
        >
          {TREND_RANGE_DAYS.map((days) => (
            <button
              type="button"
              key={days}
              onClick={() => setRangeDays(days)}
              aria-pressed={rangeDays === days}
              className={`rounded-control px-3 py-1 text-xs font-bold transition-colors ${
                rangeDays === days ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {days} gün
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="progress-metric" className="sr-only">
            Grafik metriği
          </label>
          <select
            id="progress-metric"
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value as ProgressMetricKey)}
            className="rounded-control border border-border bg-surface p-2 text-xs font-bold text-fg outline-none focus:border-accent"
          >
            {PROGRESS_METRICS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.unit})
              </option>
            ))}
          </select>
        </div>
      </div>

      {targetId ? (
        <ProgressTrendChart clientId={targetId} rangeDays={rangeDays} metric={metric} />
      ) : (
        <p className="py-10 text-center text-sm font-bold text-fg-muted">
          Trend görüntülemek için bir danışan seçin.
        </p>
      )}

      {/* GİRİŞ — yalnızca danışan (§6 "koç görünümü salt-okunur"). */}
      {targetId ? (
        isCoach ? (
          <div className="space-y-1 rounded-panel border border-border bg-surface p-5">
            <h4 className="text-sm font-bold text-fg">Danışanın ölçüm geçmişi (salt okunur)</h4>
            <p className="text-xs text-fg-muted">
              Kilo ve çevre ölçümlerini yalnızca danışan girip güncelleyebilir; koç burada sadece
              görüntüler.
            </p>
          </div>
        ) : (
          <ProgressEntryForm clientId={targetId} />
        )
      ) : null}

      {/* İLERLEME FOTOĞRAFLARI (Faz 4d) — kendi verisini kendi çeker. */}
      {targetId ? <ProgressPhotos clientId={targetId} readOnly={isCoach} /> : null}
    </div>
  )
}
