'use client'

// Koç paneli öğrenci portföyü: kart listesi + detay çekmecesi (kilo trendi,
// makro grafiği, before/after kıyaslama ve program editörleri).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { EmptyState, SkeletonCard, SkeletonChart } from '@/components/ui'
import {
  useDailyLogs,
  useFormChecks,
  useLastCheckins,
  useSendNotification,
  useUpdateProfile,
} from '@/hooks'
import type { ProfileWithAvatar } from '@/hooks/useProfile'
import { daysSince, formatDateTR } from '@/lib/utils'

export interface CoachUserManagementProps {
  /** `useProfiles()` çıktısı: profil satırı + avatar için imzalı adres. */
  clients: ProfileWithAvatar[]
}

type WeightPeriod = 'week' | 'month' | 'all'

export function CoachUserManagement({ clients }: CoachUserManagementProps): JSX.Element {
  const [selectedClient, setSelectedClient] = useState<ProfileWithAvatar | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [weightChartPeriod, setWeightChartPeriod] = useState<WeightPeriod>('month')
  // Kıyaslama seçimleri türetilmiş değer; state yalnızca kullanıcının manuel seçimini (override) tutar.
  const [beforePoseOverride, setBeforePoseOverride] = useState<string | null>(null)
  const [afterPoseOverride, setAfterPoseOverride] = useState<string | null>(null)
  // "Şimdi" render sırasında değil, lazy initializer + event handler'larda hesaplanır (saflık kuralı).
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Yalnızca beslenme taslağı: antrenman editörü bu çekmeceden kaldırıldı
  // (Faz 1b Adım 2 — plan kaynağı `workout_plans` tabloları, "Antrenman" sekmesi).
  const [nutritionDraft, setNutritionDraft] = useState('')

  // Prop değişince state'i ayarlamanın resmî React kalıbı: effect yerine render sırasında senkronlama.
  const [prevClientId, setPrevClientId] = useState<string | null>(selectedClient?.id ?? null)
  if ((selectedClient?.id ?? null) !== prevClientId) {
    setPrevClientId(selectedClient?.id ?? null)
    setNutritionDraft(selectedClient?.nutrition_plan ?? '')
    setBeforePoseOverride(null)
    setAfterPoseOverride(null)
  }

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // Kapanış animasyonu için kurulan setTimeout'un id'si; unmount'ta sızıntı olmaması için tutulur.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: lastCheckins } = useLastCheckins()
  const formChecksQuery = useFormChecks(selectedClient?.id)
  const dailyLogsQuery = useDailyLogs(selectedClient?.id)
  const sendNotification = useSendNotification()
  const updateProfile = useUpdateProfile()

  const poses = useMemo(() => formChecksQuery.data ?? [], [formChecksQuery.data])

  // Son 14 günlük makro grafiği (sorgu en yeniden eskiye gelir).
  const macroData = useMemo(() => {
    const logs = (dailyLogsQuery.data ?? []).slice(0, 14)
    return logs
      .map((log) => ({
        date: new Date(log.log_date).toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'short',
        }),
        Protein: log.macros.protein,
        Karb: log.macros.carb,
        Yag: log.macros.fat,
      }))
      .reverse()
  }, [dailyLogsQuery.data])

  // Varsayılanlar veriden türetilir (en yeni = "after", en eski = "before"); veri yoksa boş.
  const defaultAfterPoseId = poses[0]?.id ?? ''
  const defaultBeforePoseId = poses[poses.length - 1]?.id ?? ''
  const afterPoseId = afterPoseOverride ?? defaultAfterPoseId
  const beforePoseId = beforePoseOverride ?? defaultBeforePoseId

  const closeDrawer = useCallback((): void => {
    setIsDrawerOpen(false)
    triggerRef.current?.focus()
    // Önceki bekleyen timer varsa iptal edilir, unmount'ta da temizlenmesi için ref'te saklanır.
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setSelectedClient(null), 300)
  }, [])

  // Bileşen unmount olursa bekleyen kapanma timer'ı temizlenir; gövdede setState yok.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  // Çekmece açıkken sayfa kaydırması kilitlenir; kapanınca cleanup ile geri alınır.
  useEffect(() => {
    if (!isDrawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isDrawerOpen])

  useEffect(() => {
    if (!isDrawerOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isDrawerOpen, closeDrawer])

  useEffect(() => {
    if (isDrawerOpen) closeButtonRef.current?.focus()
  }, [isDrawerOpen])

  const openDrawer = (client: ProfileWithAvatar, trigger: HTMLButtonElement): void => {
    triggerRef.current = trigger
    setSelectedClient(client)
    setIsDrawerOpen(true)
  }

  const sendCheckinReminder = (): void => {
    if (!selectedClient) return
    // Başarı/hata toast'ı hook içinde gösterilir.
    sendNotification.mutate({
      clientIds: [selectedClient.id],
      title: '⚠️ Check-in Zamanı!',
      message:
        'Koçunuz güncel formunuzu bekliyor. Lütfen kilonuzu ve form fotoğraflarınızı sisteme yükleyin.',
    })
  }

  /** 7 günden eskiyse veya hiç form yoksa kırmızı. */
  const isCheckinLate = (clientId: string): boolean => {
    const lastDate = lastCheckins?.[clientId]
    if (!lastDate) return true
    // Render saf kalsın diye "şimdi" argümanı Date.now() yerine state'teki `nowMs`'ten üretilir.
    return daysSince(lastDate, new Date(nowMs)) > 7
  }

  const filteredWeightData = useMemo(() => {
    if (poses.length === 0) return []

    // Render saf kalsın diye Date.now() yerine state'teki `nowMs` kullanılır.
    let cutoff = new Date(0)
    if (weightChartPeriod === 'week') cutoff = new Date(nowMs - 7 * 86_400_000)
    else if (weightChartPeriod === 'month') cutoff = new Date(nowMs - 30 * 86_400_000)

    return poses
      .filter((pose) => new Date(pose.created_at) >= cutoff)
      .map((pose) => ({
        date: new Date(pose.created_at).toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'short',
        }),
        kilo: pose.current_weight,
      }))
      .reverse()
  }, [poses, weightChartPeriod, nowMs])

  const firstWeight = filteredWeightData[0]
  const lastWeight = filteredWeightData[filteredWeightData.length - 1]
  const weightSummary =
    firstWeight && lastWeight
      ? `İlk kayıt ${firstWeight.kilo} kg, son kayıt ${lastWeight.kilo} kg, net değişim ${(
          lastWeight.kilo - firstWeight.kilo
        ).toFixed(1)} kg.`
      : ''

  const beforePose = poses.find((p) => p.id === beforePoseId)
  const afterPose = poses.find((p) => p.id === afterPoseId)
  const clientCards = clients.filter((c) => c.role !== 'coach')
  const isLoading = formChecksQuery.isLoading || dailyLogsQuery.isLoading

  return (
    <div>
      <h3 className="mb-6 text-xl font-black text-gray-800 dark:text-zinc-200">Öğrenci Portföyü</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {clientCards.map((client) => {
          const late = isCheckinLate(client.id)
          return (
            <button
              type="button"
              key={client.id}
              onClick={(event) => {
                // Drawer açılırken filtre eşiği bayatlamasın diye "şimdi" tazelenir.
                // Bu çağrı satır içi event handler'da olmalı; bileşen gövdesindeki bir
                // fonksiyona taşınırsa react-hooks/purity kuralı render kapsamı sayar.
                setNowMs(Date.now())
                openDrawer(client, event.currentTarget)
              }}
              className="group relative w-full cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:border-brand-purple dark:border-zinc-800 dark:bg-[#16161d] dark:hover:border-brand-purple"
            >
              {/* Durum yalnızca renkle anlatılmasın diye metin karşılığı sr-only olarak eklenir. */}
              <span
                aria-hidden="true"
                className={`absolute right-4 top-4 h-3 w-3 animate-pulse rounded-full shadow-sm ${
                  late ? 'bg-red-500' : 'bg-emerald-500'
                }`}
              />
              <span className="sr-only">{late ? 'Form gecikti' : 'Form güncel'}</span>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-brand-purple/20 bg-brand-purple/10 text-lg font-black text-brand-purple">
                  {/* Private bucket: imzalı adres yoksa baş harf gösterilir (kırık görsel yok). */}
                  {client.avatarSignedUrl ? (
                    <img
                      src={client.avatarSignedUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (client.full_name ?? '?').charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 transition-colors group-hover:text-brand-purple dark:text-zinc-200">
                    {client.full_name}
                  </h4>
                  <p className="text-xs text-gray-500">{client.email}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* --- SLIDE-OVER DRAWER --- */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={closeDrawer}
          aria-hidden="true"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-drawer-title"
          className={`absolute right-0 top-0 h-full w-full max-w-2xl transform overflow-y-auto border-l border-zinc-200 bg-slate-50 shadow-2xl transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-[#0f0f12] ${
            isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {selectedClient && (
            <div className="space-y-8 p-6 pb-24 md:p-8">
              <div className="flex items-center justify-between border-b pb-4 dark:border-zinc-800">
                <div>
                  <h2
                    id="client-drawer-title"
                    className="bg-gradient-to-r from-brand-purple to-purple-500 bg-clip-text text-2xl font-black text-transparent"
                  >
                    {selectedClient.full_name}
                  </h2>
                  <button
                    type="button"
                    onClick={sendCheckinReminder}
                    disabled={sendNotification.isPending}
                    className="mt-2 flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-600 disabled:opacity-50"
                  >
                    <span aria-hidden="true">🔔</span> Form Hatırlatması Gönder
                  </button>
                </div>
                <button
                  type="button"
                  ref={closeButtonRef}
                  onClick={closeDrawer}
                  aria-label="Öğrenci detayını kapat"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 font-bold text-gray-600 transition-all hover:bg-red-500 hover:text-white dark:bg-zinc-800 dark:text-gray-400"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              {isLoading ? (
                <div className="flex flex-col gap-6">
                  <SkeletonChart />
                  <SkeletonCard />
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                        Kilo Değişim Trendi
                      </h3>
                      <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-zinc-900">
                        <button
                          type="button"
                          onClick={() => {
                            // "Şimdi" event handler'da tazelenir; render saf kalır.
                            setWeightChartPeriod('week')
                            setNowMs(Date.now())
                          }}
                          aria-pressed={weightChartPeriod === 'week'}
                          className={`rounded-md px-3 py-1 text-xs font-bold ${
                            weightChartPeriod === 'week'
                              ? 'bg-white text-brand-purple dark:bg-zinc-700'
                              : 'text-gray-500'
                          }`}
                        >
                          1 Hafta
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWeightChartPeriod('month')
                            setNowMs(Date.now())
                          }}
                          aria-pressed={weightChartPeriod === 'month'}
                          className={`rounded-md px-3 py-1 text-xs font-bold ${
                            weightChartPeriod === 'month'
                              ? 'bg-white text-brand-purple dark:bg-zinc-700'
                              : 'text-gray-500'
                          }`}
                        >
                          1 Ay
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWeightChartPeriod('all')
                            setNowMs(Date.now())
                          }}
                          aria-pressed={weightChartPeriod === 'all'}
                          className={`rounded-md px-3 py-1 text-xs font-bold ${
                            weightChartPeriod === 'all'
                              ? 'bg-white text-brand-purple dark:bg-zinc-700'
                              : 'text-gray-500'
                          }`}
                        >
                          Tümü
                        </button>
                      </div>
                    </div>
                    <figure className="h-64 w-full">
                      {filteredWeightData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={filteredWeightData}
                              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="currentColor"
                                className="text-gray-300 dark:text-zinc-700"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                domain={['dataMin - 1', 'dataMax + 1']}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#16161d',
                                  border: '1px solid #27272a',
                                  borderRadius: '12px',
                                  color: '#fff',
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="kilo"
                                stroke="#8b5cf6"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#8b5cf6' }}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                          <figcaption className="sr-only">
                            Kilo değişim grafiği: {filteredWeightData.length} kayıt. {weightSummary}
                          </figcaption>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500">
                          Veri yok.
                        </div>
                      )}
                    </figure>
                  </div>

                  <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
                    <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
                      Son 14 Günlük Makro Alımı
                    </h3>
                    <figure className="h-72 w-full">
                      {macroData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={macroData}
                              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="currentColor"
                                className="text-gray-300 dark:text-zinc-700"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                stroke="#666"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#16161d',
                                  border: '1px solid #27272a',
                                  borderRadius: '12px',
                                }}
                              />
                              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                              <Bar
                                dataKey="Protein"
                                stackId="a"
                                fill="#8b5cf6"
                                radius={[0, 0, 4, 4]}
                              />
                              <Bar dataKey="Karb" stackId="a" fill="#3b82f6" />
                              <Bar dataKey="Yag" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                          <figcaption className="sr-only">
                            Son {macroData.length} günün protein, karbonhidrat ve yağ alımını
                            gösteren yığılmış sütun grafiği.
                          </figcaption>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500">
                          Veri yok.
                        </div>
                      )}
                    </figure>
                  </div>

                  {poses.length > 0 && (
                    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
                      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
                        Gelişim Kıyaslama (Before / After)
                      </h3>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                          <label htmlFor="coach-before-pose" className="sr-only">
                            Öncesi kaydını seç
                          </label>
                          <select
                            id="coach-before-pose"
                            value={beforePoseId}
                            onChange={(e) => setBeforePoseOverride(e.target.value)}
                            className="w-full rounded-xl border bg-gray-50 p-3 text-sm font-bold focus:border-brand-purple focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            {poses.map((pose) => (
                              <option key={`before-${pose.id}`} value={pose.id}>
                                {formatDateTR(pose.created_at)} ({pose.current_weight} kg)
                              </option>
                            ))}
                          </select>
                          {beforePose?.frontPoseSignedUrl ? (
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 border-gray-200 dark:border-zinc-800">
                              <img
                                src={beforePose.frontPoseSignedUrl}
                                alt={`Öncesi: ${formatDateTR(beforePose.created_at)}, ${beforePose.current_weight} kg`}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4">
                                <span className="rounded bg-zinc-800 px-2 py-1 text-xs font-bold uppercase tracking-wider text-white">
                                  Before
                                </span>
                                <p className="mt-1 font-bold text-white">
                                  {beforePose.current_weight} kg
                                </p>
                              </div>
                            </div>
                          ) : (
                            // İmzalı adres üretilemedi (dosya yok/erişim yok) — kırık görsel yerine boş durum.
                            <EmptyState
                              icon="🖼️"
                              title="Bu kayıt için fotoğraf görüntülenemiyor."
                            />
                          )}
                        </div>
                        <div className="space-y-3">
                          <label htmlFor="coach-after-pose" className="sr-only">
                            Sonrası kaydını seç
                          </label>
                          <select
                            id="coach-after-pose"
                            value={afterPoseId}
                            onChange={(e) => setAfterPoseOverride(e.target.value)}
                            className="w-full rounded-xl border border-brand-purple bg-brand-purple/5 p-3 text-sm font-bold text-brand-purple focus:outline-none dark:bg-brand-purple/10"
                          >
                            {poses.map((pose) => (
                              <option key={`after-${pose.id}`} value={pose.id}>
                                {formatDateTR(pose.created_at)} ({pose.current_weight} kg)
                              </option>
                            ))}
                          </select>
                          {afterPose?.frontPoseSignedUrl ? (
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 border-brand-purple">
                              <img
                                src={afterPose.frontPoseSignedUrl}
                                alt={`Sonrası: ${formatDateTR(afterPose.created_at)}, ${afterPose.current_weight} kg`}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-brand-purple/90 to-transparent p-4">
                                <span className="rounded bg-white px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand-purple">
                                  After
                                </span>
                                <p className="mt-1 font-bold text-white">
                                  {afterPose.current_weight} kg
                                </p>
                              </div>
                            </div>
                          ) : (
                            <EmptyState
                              icon="🖼️"
                              title="Bu kayıt için fotoğraf görüntülenemiyor."
                            />
                          )}
                        </div>
                      </div>
                      {beforePose && afterPose && (
                        <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                          <span className="text-sm font-bold uppercase tracking-wider text-gray-500">
                            Net Değişim
                          </span>
                          <span
                            className={`text-xl font-black ${
                              afterPose.current_weight > beforePose.current_weight
                                ? 'text-emerald-500'
                                : afterPose.current_weight < beforePose.current_weight
                                  ? 'text-brand-purple'
                                  : 'text-gray-500'
                            }`}
                          >
                            {afterPose.current_weight > beforePose.current_weight ? '+' : ''}
                            {(afterPose.current_weight - beforePose.current_weight).toFixed(1)} kg
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-6 border-t pt-6 dark:border-zinc-800">
                    <div className="space-y-2">
                      <label
                        htmlFor="coach-nutrition-editor"
                        className="text-xs font-bold uppercase tracking-wider text-brand-purple"
                      >
                        Beslenme Programı (Admin Editörü)
                      </label>
                      <textarea
                        id="coach-nutrition-editor"
                        value={nutritionDraft}
                        onChange={(e) => setNutritionDraft(e.target.value)}
                        className="h-32 w-full rounded-xl border bg-white p-4 text-sm focus:border-brand-purple focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateProfile.mutate({
                            id: selectedClient.id,
                            values: { nutrition_plan: nutritionDraft },
                          })
                        }
                        disabled={updateProfile.isPending}
                        className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition-all hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
                      >
                        Beslenmeyi Kaydet
                      </button>
                    </div>
                    {/* Antrenman editörü bilinçli olarak KALDIRILDI: plan artık
                        `workout_plans` tablolarında tutuluyor ve buradaki ham metin
                        editörü ölü yazma yapıyordu (koç kaydediyor, danışan göremiyordu).
                        Tam editör "Antrenman" sekmesinde. */}
                    <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                        Antrenman Programı
                      </h4>
                      <p className="text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-400">
                        Antrenman programı buradan düzenlenmez. Gün bazlı editör, hareket
                        kütüphanesi ve AI desteği için üstteki{' '}
                        <span className="font-bold text-emerald-500">Antrenman</span> sekmesini
                        kullanın.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
