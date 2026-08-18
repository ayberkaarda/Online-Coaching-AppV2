'use client'

// Günlük su / sodyum / makro raporu: danışan formu + geçmiş kayıtların makro dağılımı.
// Kayıt `useCreateDailyLog` ile UPSERT edilir (aynı gün tekrar gönderilirse güncellenir).

import { zodResolver } from '@hookform/resolvers/zod'
import { Droplet, FileSpreadsheet } from 'lucide-react'
import { useForm } from 'react-hook-form'
import type { JSX } from 'react'
import { toast } from 'sonner'

import { QueryState, SkeletonCard } from '@/components/ui'
import { useCreateDailyLog, useDailyLogs } from '@/hooks'
import { todayIsoDate } from '@/lib/date'
import { downloadCSV, formatDateTR, getMacroPercentage } from '@/lib/utils'
import { dailyLogSchema, type DailyLogInput } from '@/lib/validation/schemas'
import type { UserRole } from '@/types'

export interface DailyLogTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

export default function DailyLogTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
}: DailyLogTabProps): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useDailyLogs(targetId)
  const createDailyLog = useCreateDailyLog()

  const logs = data ?? []

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DailyLogInput>({ resolver: zodResolver(dailyLogSchema) })

  const onSubmit = handleSubmit(async (values) => {
    if (!currentUserId) {
      toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      return
    }

    // Başarı/hata toast'ı hook içinde gösterilir; aynı gün için kayıt UPSERT edilir.
    await createDailyLog.mutateAsync({
      clientId: currentUserId,
      water_lt: values.water_lt,
      sodium_mg: values.sodium_mg,
      macros: { protein: values.protein, carb: values.carb, fat: values.fat },
      // Kullanıcının YEREL günü, AÇIKÇA gönderilir — DB'nin UTC `current_date`
      // varsayılanına düşülseydi gece 00:00–03:00 arasında (UTC+3) gönderilen
      // rapor DÜNÜN kaydını ezerdi (bkz. src/lib/date.ts).
      log_date: todayIsoDate(),
    })
    reset()
  })

  const isSaving = isSubmitting || createDailyLog.isPending

  const handleDownload = (): void => {
    downloadCSV(
      logs.map((log) => ({
        tarih: log.log_date,
        su_lt: log.water_lt ?? 0,
        sodyum_mg: log.sodium_mg ?? 0,
        protein_g: log.macros.protein,
        karbonhidrat_g: log.macros.carb,
        yag_g: log.macros.fat,
      })),
      'Gunluk_Veriler',
      false
    )
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {userRole === 'client' && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 border-b pb-6 dark:border-zinc-800"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="daily-water" className="mb-1 block text-xs font-bold text-gray-500">
                SU (Litre)
              </label>
              <input
                id="daily-water"
                type="number"
                step="0.1"
                {...register('water_lt')}
                aria-invalid={errors.water_lt ? 'true' : 'false'}
                aria-describedby={errors.water_lt ? 'daily-water-error' : undefined}
                className="w-full rounded-xl border p-3 outline-none focus:border-accent"
              />
              {errors.water_lt ? (
                <p
                  id="daily-water-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.water_lt.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="daily-sodium" className="mb-1 block text-xs font-bold text-gray-500">
                SODYUM (mg)
              </label>
              <input
                id="daily-sodium"
                type="number"
                {...register('sodium_mg')}
                aria-invalid={errors.sodium_mg ? 'true' : 'false'}
                aria-describedby={errors.sodium_mg ? 'daily-sodium-error' : undefined}
                className="w-full rounded-xl border p-3 outline-none focus:border-accent"
              />
              {errors.sodium_mg ? (
                <p
                  id="daily-sodium-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.sodium_mg.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="daily-protein" className="sr-only">
                Protein (g)
              </label>
              <input
                id="daily-protein"
                type="number"
                placeholder="Protein (g)"
                {...register('protein')}
                aria-invalid={errors.protein ? 'true' : 'false'}
                aria-describedby={errors.protein ? 'daily-protein-error' : undefined}
                className="w-full rounded-xl border p-3 outline-none"
              />
              {errors.protein ? (
                <p
                  id="daily-protein-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.protein.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="daily-carb" className="sr-only">
                Karbonhidrat (g)
              </label>
              <input
                id="daily-carb"
                type="number"
                placeholder="Karb (g)"
                {...register('carb')}
                aria-invalid={errors.carb ? 'true' : 'false'}
                aria-describedby={errors.carb ? 'daily-carb-error' : undefined}
                className="w-full rounded-xl border p-3 outline-none"
              />
              {errors.carb ? (
                <p
                  id="daily-carb-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.carb.message}
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="daily-fat" className="sr-only">
                Yağ (g)
              </label>
              <input
                id="daily-fat"
                type="number"
                placeholder="Yağ (g)"
                {...register('fat')}
                aria-invalid={errors.fat ? 'true' : 'false'}
                aria-describedby={errors.fat ? 'daily-fat-error' : undefined}
                className="w-full rounded-xl border p-3 outline-none"
              />
              {errors.fat ? (
                <p
                  id="daily-fat-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.fat.message}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving}
            className="w-full rounded-xl bg-accent py-3 font-bold text-white shadow-lg disabled:opacity-50"
          >
            Antrenörüme Gönder
          </button>
        </form>
      )}

      {userRole === 'coach' && selectedClientIds.length > 1 ? (
        <p className="py-10 text-center text-sm font-bold text-accent">
          Sadece 1 danışan seçili bırakın.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800 dark:text-zinc-200">
              Rapor Geçmişi ve Makro Dağılımı
            </h4>
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-600"
              >
                <FileSpreadsheet aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Excel İndir
              </button>
            )}
          </div>

          <QueryState
            isLoading={isLoading}
            isError={isError}
            error={error}
            isEmpty={logs.length === 0}
            skeleton={<SkeletonCard />}
            emptyMessage="Kayıt bulunamadı."
            onRetry={() => void refetch()}
          >
            <div className="space-y-4">
              {logs.map((log) => {
                const percent = getMacroPercentage(
                  log.macros.protein,
                  log.macros.carb,
                  log.macros.fat
                )
                return (
                  <div
                    key={log.id}
                    className="rounded-3xl border bg-gray-50 p-5 text-sm shadow-sm hover:border-accent/30 dark:bg-zinc-950"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-bold">{formatDateTR(log.log_date)}</span>
                      {/* Sodyum için lucide setinde bir "tuzluk" ikonu yok; emoji
                          yerine düz metin etiket kullanılır (ADR-0016: ikon
                          bulunmuyorsa metne indirilir). */}
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1 font-black text-emerald-500">
                        <Droplet aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {log.water_lt}L | Sodyum {log.sodium_mg}mg
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-red-500">Pro: {log.macros.protein}g</span>
                        <span className="text-blue-500">Karb: {log.macros.carb}g</span>
                        <span className="text-yellow-500">Yağ: {log.macros.fat}g</span>
                      </div>
                      <div
                        role="img"
                        aria-label={`Protein %${Math.round(percent.p)}, karbonhidrat %${Math.round(
                          percent.c
                        )}, yağ %${Math.round(percent.f)}`}
                        className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-800"
                      >
                        <div style={{ width: `${percent.p}%` }} className="h-full bg-red-500" />
                        <div style={{ width: `${percent.c}%` }} className="h-full bg-blue-500" />
                        <div style={{ width: `${percent.f}%` }} className="h-full bg-yellow-500" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </QueryState>
        </>
      )}
    </div>
  )
}
