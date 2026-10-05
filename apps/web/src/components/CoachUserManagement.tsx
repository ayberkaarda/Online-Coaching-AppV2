'use client'

// Koç paneli danışan portföyü: kart listesi + detay çekmecesi.
//
// Faz 1b sonrası çekmece tamamen ANALİTİK bir görünümdür (kilo trendi, makro
// grafiği, before/after kıyaslama, form hatırlatması). Buradaki ham metin
// program editörleri KALDIRILDI: hem antrenman hem beslenme planı artık kendi
// normalize tablolarında yaşıyor ve yalnızca ilgili sekmelerden yazılıyor;
// bu editörler cutover sonrası DEPRECATED profil kolonlarına yazan "ölü yazma"
// hâline gelmişti (koç kaydediyor, danışan hiç görmüyordu).
//
// ###########################################################################
// # B-036 — KİLO GRAFİĞİ ARTIK `progress_entries`TEN BESLENİYOR              #
// #                                                                           #
// # Bu grafik Faz 4c'ye kadar `form_checks.current_weight`ten çiziliyordu;    #
// # `StatsTab` ise aynı dönemde `progress_entries`e geçmişti. İki ekran AYNI  #
// # danışan için FARKLI kilo eğrileri gösteriyordu (drift) — AC-4.2'nin       #
// # ("grafik verisi TEK endpoint'ten gelir ve TÜM EKRANLAR AYNI SERİYİ        #
// # çizer") doğrudan ihlali. Artık ikisi de `useProgressTrend`i çağırır.      #
// #                                                                           #
// # DRIFT VERİ KATMANINDA KAPANDI, GÖRÜNTÜLEME HİLESİYLE DEĞİL:              #
// # `20260818090000_form_check_weight_to_progress.sql` bir AFTER INSERT       #
// # trigger'ı + idempotent bir backfill ile form check kilolarını             #
// # `progress_entries`e taşır. Yani bu bileşenin iki kaynağı istemcide        #
// # birleştirmesine GEREK YOKTUR; tek tablo okur.                             #
// #                                                                           #
// # DAVRANIŞ DEĞİŞİKLİĞİ (bilinçli, kabul edildi): eski `1 Hafta / 1 Ay /    #
// # Tümü` seçicisi §6'nın 7/30/90 GÜN seçicisiyle değişti. "Tümü" KALKTI —    #
// # `useProgressTrend` sabit uzunlukta bir seri üretir (boş günler GAP kalır, #
// # interpolasyon YOKTUR) ve sınırsız bir aralık bu sözleşmeyle bağdaşmaz.    #
// # Karşılığında koç ile danışan ARTIK AYNI GRAFİĞİ görür.                    #
// #                                                                           #
// # POZ KARTLARINDAKİ "82 kg" ETİKETLERİ KALDI: onlar FOTOĞRAFIN meta         #
// # verisidir ("bu kare çekildiğinde tartı bunu gösteriyordu"), trend serisi  #
// # değildir (migration KARAR 4).                                             #
// ###########################################################################

import { Activity, Bell, Clock, ImageOff, UserCheck, UserX } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { CoachActivitySummary } from '@/components/activity/CoachActivitySummary'
import { EmptyState, SkeletonCard, SkeletonChart } from '@/components/ui'
import { chartColors, chartTooltipStyle } from '@/design/chart'
import {
  DEFAULT_TREND_RANGE_DAYS,
  TREND_RANGE_DAYS,
  summarizeMetric,
  useDailyLogs,
  useFormChecks,
  useLastCheckins,
  usePendingFormChecks,
  useProgressTrend,
  useReviewFormCheck,
  useSendNotification,
  useSession,
  useSetClientActiveState,
  type TrendRangeDays,
} from '@repo/api-client'
import { ApiError } from '@repo/api-client/api/client'
import type { ProfileWithAvatar } from '@repo/api-client/hooks/useProfile'
import { daysSince, formatDateTR, formatDateTimeTR } from '@/lib/utils'

export interface CoachUserManagementProps {
  /** `useProfiles()` çıktısı: profil satırı + avatar için imzalı adres. */
  clients: ProfileWithAvatar[]
}

export function CoachUserManagement({ clients }: CoachUserManagementProps): JSX.Element {
  const [selectedClient, setSelectedClient] = useState<ProfileWithAvatar | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [trendRangeDays, setTrendRangeDays] = useState<TrendRangeDays>(DEFAULT_TREND_RANGE_DAYS)
  // Kıyaslama seçimleri türetilmiş değer; state yalnızca kullanıcının manuel seçimini (override) tutar.
  const [beforePoseOverride, setBeforePoseOverride] = useState<string | null>(null)
  const [afterPoseOverride, setAfterPoseOverride] = useState<string | null>(null)
  // "Şimdi" render sırasında değil, lazy initializer + event handler'larda hesaplanır (saflık kuralı).
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // Aktif/pasif durum değişimi (Faz 4.10). Tek onay adımı yeterli: işlem geri
  // alınabilir (koç istediğinde tersine çevirir).
  const setClientActive = useSetClientActiveState()
  // `null` = onay istenmedi; aksi halde bekleyen eylem.
  const [activeConfirm, setActiveConfirm] = useState<'deactivate' | 'reactivate' | null>(null)

  // Prop değişince state'i ayarlamanın resmî React kalıbı: effect yerine render sırasında senkronlama.
  const [prevClientId, setPrevClientId] = useState<string | null>(selectedClient?.id ?? null)
  if ((selectedClient?.id ?? null) !== prevClientId) {
    setPrevClientId(selectedClient?.id ?? null)
    setBeforePoseOverride(null)
    setAfterPoseOverride(null)
    // Danışan değişince bekleyen onay adımı düşer (yanlış danışana uygulanmasın).
    setActiveConfirm(null)
  }

  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  // Kapanış animasyonu için kurulan setTimeout'un id'si; unmount'ta sızıntı olmaması için tutulur.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: lastCheckins } = useLastCheckins()
  const formChecksQuery = useFormChecks(selectedClient?.id)
  const dailyLogsQuery = useDailyLogs(selectedClient?.id)
  // AC-4.2'nin TEK ENDPOINT'i. `StatsTab` de aynı hook'u aynı anahtarla çağırır
  // -> koç ile danışan AYNI seriyi görür (bkz. dosya başlığı, B-036).
  const trendQuery = useProgressTrend(selectedClient?.id, trendRangeDays)
  const sendNotification = useSendNotification()
  const { data: session } = useSession()
  const coachId = session?.user.id
  const pendingFormChecksQuery = usePendingFormChecks()
  const reviewFormCheck = useReviewFormCheck()
  // Kuyruktaki her kayıt için ayrı, kaydedilmemiş geri bildirim taslağı.
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({})

  const poses = useMemo(() => formChecksQuery.data ?? [], [formChecksQuery.data])
  const pendingFormChecks = pendingFormChecksQuery.data ?? []

  const clientNameFor = useCallback(
    (clientId: string): string => clients.find((c) => c.id === clientId)?.full_name ?? 'Danışan',
    [clients]
  )

  const handleReviewFormCheck = (formCheckId: string, clientId: string): void => {
    if (!coachId) {
      toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      return
    }
    const coachFeedback = (feedbackDrafts[formCheckId] ?? '').trim()
    if (coachFeedback.length === 0) {
      toast.error('Lütfen bir geri bildirim yazın.')
      return
    }
    reviewFormCheck.mutate(
      { formCheckId, clientId, coachFeedback },
      {
        onSuccess: () => {
          setFeedbackDrafts((prev) => {
            if (!(formCheckId in prev)) return prev
            const next = { ...prev }
            delete next[formCheckId]
            return next
          })
        },
      }
    )
  }

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
      title: 'Check-in Zamanı!',
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

  // Seri BURADA ÜRETİLMEZ: `useProgressTrend` (-> `buildTrendSeries`) üretir.
  // Özet de aynı seriden türetilir, ham satırlardan DEĞİL — böylece grafik ile
  // altındaki metin ASLA birbirinden ayrışamaz.
  const trend = trendQuery.data
  const weightSummaryData = trend ? summarizeMetric(trend, 'weight_kg') : null
  const weightSummary =
    weightSummaryData?.first && weightSummaryData.last
      ? `İlk ölçüm ${weightSummaryData.first.value} kg, son ölçüm ${weightSummaryData.last.value} kg, net değişim ${(
          weightSummaryData.delta ?? 0
        ).toFixed(1)} kg.`
      : ''

  const beforePose = poses.find((p) => p.id === beforePoseId)
  const afterPose = poses.find((p) => p.id === afterPoseId)
  const clientCards = clients.filter((c) => c.role !== 'coach')
  const isLoading = formChecksQuery.isLoading || dailyLogsQuery.isLoading || trendQuery.isLoading

  // `is_active` güncel değeri `clients` prop'undan okunur (selectedClient bir
  // ANLIK KOPYADIR ve mutasyon sonrası bayatlar); mutasyon `profiles` önbelleğini
  // geçersiz kılınca prop tazelenir ve buton kendiliğinden döner.
  const selectedClientLive = clients.find((c) => c.id === selectedClient?.id) ?? selectedClient
  const isClientActive = selectedClientLive?.is_active ?? true

  const setActiveError = setClientActive.error
  const isSetActiveApiError = ApiError.isApiError(setActiveError)
  // MFA_REQUIRED'da mesaj yeterli değil: koç NEREYE gideceğini bilmeli (davet
  // formuyla aynı kalıp).
  const isSetActiveMfaRequired =
    isSetActiveApiError && (setActiveError as ApiError).code === 'MFA_REQUIRED'

  const handleToggleActive = (): void => {
    if (!selectedClient) return
    const nextActive = !isClientActive
    setClientActive.mutate(
      { client_id: selectedClient.id, active: nextActive },
      {
        onSuccess: () => {
          setActiveConfirm(null)
          toast.success(
            nextActive ? 'Danışan yeniden aktifleştirildi.' : 'Danışan pasifleştirildi.'
          )
        },
      }
    )
  }

  return (
    <div>
      {/* --- BEKLEYEN FORM CHECK KUYRUĞU ---
          Konum kararı: bu bölüm (danışan portföyünün üstünde) ayrı bir sekme/route
          yerine BURADA yaşıyor çünkü koç zaten bu ekranı "danışan durumu" özeti
          olarak kullanıyor (bkz. aşağıdaki gecikme göstergeleri); ayrı bir yüzey
          açmak aynı bilgiyi iki yerde göstermek olurdu. Kuyruk TÜM danışanları
          kapsar (usePendingFormChecks — client bazlı değil), portföy kartlarının
          altındaki `isCheckinLate` göstergesiyle aynı "triage" amacına hizmet eder. */}
      {pendingFormChecks.length > 0 && (
        <section aria-labelledby="pending-form-checks-heading" className="mb-8">
          <h3
            id="pending-form-checks-heading"
            className="mb-4 flex items-center gap-2 text-xl font-bold text-fg"
          >
            Bekleyen Form Checkler
            <span className="rounded-control bg-warning/10 px-2 py-0.5 text-sm font-bold text-warning">
              {pendingFormChecks.length}
            </span>
          </h3>
          <div className="space-y-4">
            {pendingFormChecks.map((item) => (
              <div
                key={item.id}
                role="group"
                // Erişilebilir/test kancası: her kart, karşılık geldiği kaydı benzersiz
                // tanımlayan bir grup adına sahip. Bu hem ekran okuyucuda "hangi
                // danışanın hangi kaydı" sorusunu cevaplar hem de E2E'nin (bkz.
                // tests/e2e/form-check.spec.ts) `getByRole('group', {name})` ile TAM
                // OLARAK doğru kartı (metin bazlı `div` taramasıyla yanlışlıkla iç içe
                // geçmiş bir alt div'i DEĞİL) hedeflemesini sağlar.
                aria-label={`${clientNameFor(item.client_id)} form check kaydı, ${item.current_weight} kg`}
                className="rounded-panel border border-border bg-surface p-4"
              >
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="flex shrink-0 gap-2">
                    {item.frontPoseSignedUrl ? (
                      <img
                        src={item.frontPoseSignedUrl}
                        alt={`${clientNameFor(item.client_id)} — ön poz, ${item.current_weight} kg`}
                        loading="lazy"
                        className="h-24 w-24 rounded-card object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-24 w-24 items-center justify-center rounded-card bg-canvas text-fg-muted"
                      >
                        <ImageOff className="h-7 w-7" />
                      </div>
                    )}
                    {item.back_pose_path && (
                      <>
                        {item.backPoseSignedUrl ? (
                          <img
                            src={item.backPoseSignedUrl}
                            alt={`${clientNameFor(item.client_id)} — arka poz, ${item.current_weight} kg`}
                            loading="lazy"
                            className="h-24 w-24 rounded-card object-cover"
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-24 w-24 items-center justify-center rounded-card bg-canvas text-fg-muted"
                          >
                            <ImageOff className="h-7 w-7" />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-fg">
                        {clientNameFor(item.client_id)}{' '}
                        <span className="font-normal text-fg-muted">
                          · {item.current_weight} kg
                        </span>
                      </p>
                      <p className="flex items-center gap-1 text-xs text-fg-muted">
                        <Clock aria-hidden="true" className="h-3 w-3" />
                        {formatDateTimeTR(item.created_at)}
                      </p>
                    </div>
                    {item.notes ? <p className="text-sm text-fg-muted">{item.notes}</p> : null}
                    <label htmlFor={`form-check-feedback-${item.id}`} className="sr-only">
                      {clientNameFor(item.client_id)} için geri bildirim
                    </label>
                    <textarea
                      id={`form-check-feedback-${item.id}`}
                      value={feedbackDrafts[item.id] ?? ''}
                      onChange={(event) =>
                        setFeedbackDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      placeholder="Geri bildiriminizi yazın..."
                      rows={2}
                      className="w-full rounded-control border border-border-control bg-canvas p-2 text-sm text-fg focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleReviewFormCheck(item.id, item.client_id)}
                      disabled={reviewFormCheck.isPending || !coachId}
                      aria-busy={reviewFormCheck.isPending}
                      className="rounded-control bg-accent px-4 py-2 text-xs font-bold text-accent-fg disabled:opacity-50"
                    >
                      İncele ve Gönder
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <h3 className="mb-6 text-xl font-bold text-fg">Danışan Portföyü</h3>

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
              className="group relative w-full cursor-pointer rounded-card border border-border bg-surface p-5 text-left transition-all hover:border-accent"
            >
              {/* Durum yalnızca renkle anlatılmasın diye metin karşılığı sr-only olarak eklenir. */}
              <span
                aria-hidden="true"
                className={`absolute right-4 top-4 h-3 w-3 rounded-full ${
                  late ? 'bg-danger' : 'bg-success'
                }`}
              />
              <span className="sr-only">{late ? 'Form gecikti' : 'Form güncel'}</span>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-accent/20 bg-accent/10 text-lg font-bold text-accent">
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
                  <h4 className="font-bold text-fg transition-colors group-hover:text-accent">
                    {client.full_name}
                  </h4>
                  <p className="text-xs text-fg-muted">{client.email}</p>
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
        <div className="absolute inset-0 bg-black/50" onClick={closeDrawer} aria-hidden="true" />

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-drawer-title"
          className={`absolute right-0 top-0 h-full w-full max-w-2xl transform overflow-y-auto border-l border-border bg-canvas shadow-raised transition-transform duration-base ease-decelerate ${
            isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {selectedClient && (
            <div className="space-y-8 p-6 pb-24 md:p-8">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 id="client-drawer-title" className="font-display text-2xl font-bold text-fg">
                    {selectedClient.full_name}
                  </h2>
                  <button
                    type="button"
                    onClick={sendCheckinReminder}
                    disabled={sendNotification.isPending}
                    className="mt-2 flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-surface transition-all hover:bg-danger/90 disabled:opacity-50"
                  >
                    <Bell aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> Form Hatırlatması
                    Gönder
                  </button>
                </div>
                <button
                  type="button"
                  ref={closeButtonRef}
                  onClick={closeDrawer}
                  aria-label="Danışan detayını kapat"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-border font-bold text-fg-muted transition-all hover:bg-danger hover:text-surface"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>

              {/* --- HESAP DURUMU (aktif/pasif) — Faz 4.10 ---
                  Konum kararı: yükleme iskeletinin DIŞINDA (header'ın hemen
                  altında) çünkü bu eylem danışanın analitik verisine (trend/makro)
                  bağlı DEĞİLDİR; koç, veriler yüklenmeden de danışanı
                  pasifleştirebilmeli. Pasif danışanın kendisi bu ekranı GÖRMEZ —
                  o kendi cihazında `PassiveClientScreen`'i görür. */}
              <section
                aria-labelledby="account-state-heading"
                className="rounded-panel border border-border bg-surface p-4"
              >
                <h3 id="account-state-heading" className="mb-1 text-sm font-bold text-fg-muted">
                  Hesap Durumu
                </h3>
                <p className="mb-3 text-sm text-fg-muted">
                  {isClientActive
                    ? 'Bu danışanın hesabı aktif. Koçluk hizmeti sona erdiyse hesabı pasifleştirebilirsiniz: pasif danışan sisteme girer ama verilerini göremez, yalnızca hesabını silebilir veya çıkış yapabilir.'
                    : 'Bu danışanın hesabı PASİF. Verilerine erişimi kapalı. Yeniden aktifleştirdiğinizde tüm verisine yeniden erişir.'}
                </p>

                {setActiveError && (
                  <div
                    role="alert"
                    className="mb-3 space-y-2 rounded-control border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger"
                  >
                    <p>
                      {isSetActiveApiError
                        ? (setActiveError as ApiError).message
                        : 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.'}
                    </p>
                    {isSetActiveMfaRequired && (
                      <Link href="/profile#guvenlik" className="inline-block underline">
                        Güvenlik bölümüne git
                      </Link>
                    )}
                  </div>
                )}

                {activeConfirm === null ? (
                  <button
                    type="button"
                    onClick={() => setActiveConfirm(isClientActive ? 'deactivate' : 'reactivate')}
                    disabled={setClientActive.isPending}
                    className={
                      isClientActive
                        ? 'inline-flex items-center gap-2 rounded-control bg-danger px-4 py-2 text-sm font-bold text-surface transition-colors hover:bg-danger/90 disabled:opacity-50'
                        : 'inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50'
                    }
                  >
                    {isClientActive ? (
                      <UserX aria-hidden="true" className="h-4 w-4 shrink-0" />
                    ) : (
                      <UserCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
                    )}
                    {isClientActive ? 'Pasifleştir' : 'Yeniden aktifleştir'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-fg">
                      {activeConfirm === 'deactivate'
                        ? `${selectedClient.full_name} pasifleştirilsin mi? Danışan artık verilerini göremeyecek.`
                        : `${selectedClient.full_name} yeniden aktifleştirilsin mi? Danışan tüm verisine yeniden erişecek.`}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleToggleActive}
                        disabled={setClientActive.isPending}
                        aria-busy={setClientActive.isPending}
                        className={
                          activeConfirm === 'deactivate'
                            ? 'inline-flex items-center gap-2 rounded-control bg-danger px-4 py-2 text-sm font-bold text-surface transition-colors hover:bg-danger/90 disabled:opacity-50'
                            : 'inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50'
                        }
                      >
                        {setClientActive.isPending
                          ? 'İşleniyor...'
                          : activeConfirm === 'deactivate'
                            ? 'Evet, pasifleştir'
                            : 'Evet, aktifleştir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveConfirm(null)}
                        disabled={setClientActive.isPending}
                        className="rounded-control border border-border px-4 py-2 text-sm font-bold text-fg transition-colors hover:bg-canvas disabled:opacity-50"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {isLoading ? (
                <div className="flex flex-col gap-6">
                  <SkeletonChart />
                  <SkeletonCard />
                </div>
              ) : (
                <>
                  <div className="rounded-card border border-border bg-surface p-6">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-fg-muted">Kilo Değişim Trendi</h3>
                      {/* ARALIK SEÇİCİ — §6: 7/30/90 GÜN. `StatsTab` ile AYNI
                          değerler ve AYNI hook parametresi; "Tümü" seçeneği
                          bilinçli olarak KALDIRILDI (bkz. dosya başlığı). */}
                      <div
                        role="group"
                        aria-label="Trend aralığı"
                        className="flex rounded-lg bg-surface-sunken p-1"
                      >
                        {TREND_RANGE_DAYS.map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => {
                              setTrendRangeDays(days)
                              // "Şimdi" event handler'da tazelenir; render saf kalır.
                              // (Gecikme göstergeleri `nowMs`'e bakar.)
                              setNowMs(Date.now())
                            }}
                            aria-pressed={trendRangeDays === days}
                            className={`rounded-md px-3 py-1 text-xs font-bold ${
                              trendRangeDays === days ? 'bg-surface text-accent' : 'text-fg-muted'
                            }`}
                          >
                            {days} gün
                          </button>
                        ))}
                      </div>
                    </div>
                    <figure className="h-64 w-full">
                      {trend && trend.measuredDays > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={trend.points}
                              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke={chartColors.grid}
                                vertical={false}
                              />
                              <XAxis
                                dataKey="label"
                                stroke={chartColors.axis}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={16}
                              />
                              <YAxis
                                stroke={chartColors.axis}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                domain={['dataMin - 1', 'dataMax + 1']}
                              />
                              <Tooltip contentStyle={chartTooltipStyle} />
                              <Area
                                type="monotone"
                                dataKey="weight_kg"
                                name="Kilo (kg)"
                                // İNTERPOLASYON YOK (§6): seri ölçümsüz gün için
                                // `null` taşır ve `connectNulls` AÇIKÇA false'tur —
                                // recharts varsayılanına GÜVENİLMEZ, sessizce
                                // dönerse boşluklar kapanır ve kimse fark etmez.
                                // `StatsTab`teki grafikle BİREBİR aynı sözleşme.
                                connectNulls={false}
                                // Tema duyarlı seri rengi (src/design/chart.ts).
                                stroke={chartColors.series1}
                                fill={chartColors.series1}
                                fillOpacity={0.2}
                                strokeWidth={3}
                                dot={{ r: 4, fill: chartColors.series1 }}
                                activeDot={{ r: 6 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                          <figcaption className="sr-only">
                            Kilo değişim grafiği, son {trend.rangeDays} gün. {trend.measuredDays}{' '}
                            ölçüm günü. {weightSummary} Ölçüm yapılmayan günlerde çizgi kesilir; ara
                            değer üretilmez.
                          </figcaption>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-fg-muted">
                          Seçili aralıkta kayıtlı ölçüm yok.
                        </div>
                      )}
                    </figure>
                  </div>

                  <div className="rounded-card border border-border bg-surface p-6">
                    <h3 className="mb-4 text-sm font-bold text-fg-muted">
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
                                stroke={chartColors.grid}
                                vertical={false}
                              />
                              <XAxis
                                dataKey="date"
                                stroke={chartColors.axis}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                stroke={chartColors.axis}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip contentStyle={chartTooltipStyle} />
                              <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                              <Bar
                                dataKey="Protein"
                                stackId="a"
                                fill={chartColors.series1}
                                radius={[0, 0, 4, 4]}
                              />
                              <Bar dataKey="Karb" stackId="a" fill={chartColors.series2} />
                              <Bar
                                dataKey="Yag"
                                stackId="a"
                                fill={chartColors.series3}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                          <figcaption className="sr-only">
                            Son {macroData.length} günün protein, karbonhidrat ve yağ alımını
                            gösteren yığılmış sütun grafiği.
                          </figcaption>
                        </>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-fg-muted">
                          Veri yok.
                        </div>
                      )}
                    </figure>
                  </div>

                  {/* --- ETKİNLİK ÖZETİ (Faz 4.8 §7c, dilim 3b) ---
                      Konum kararı: bu drawer zaten "seçili danışan" bağlamını taşıyan TEK
                      yüzey (trend/makro/poz kıyaslama hepsi burada) — ayrı bir sekme/route
                      açmak aynı "danışan durumu" bilgisini ikinci bir yerde tekrar ederdi
                      (bkz. dosya başı, bekleyen form check kuyruğu için aynı gerekçe).
                      İÇERİK BİLEREK GÜN HASSASİYETİNDEDİR: `CoachActivitySummary` saat/dakika
                      damgası TAŞIMAYAN bir tip üzerinden çalışır (bkz. o dosyanın başlığı) —
                      danışanın "Verilerim" sayfasındaki (`apps/web/src/app/verilerim`) tam
                      ayrıntılı görünümle KARIŞTIRILMAMALIDIR. */}
                  <div className="rounded-panel border border-border bg-surface p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-fg-muted">
                      <Activity aria-hidden="true" className="h-4 w-4 shrink-0" />
                      Etkinlik Özeti
                    </h3>
                    <CoachActivitySummary clientId={selectedClient.id} />
                  </div>

                  {poses.length > 0 && (
                    <div className="rounded-card border border-border bg-surface p-6">
                      <h3 className="mb-4 text-sm font-bold text-fg-muted">
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
                            className="w-full rounded-control border bg-surface-sunken p-3 text-sm font-bold focus:border-accent focus:outline-none"
                          >
                            {poses.map((pose) => (
                              <option key={`before-${pose.id}`} value={pose.id}>
                                {formatDateTR(pose.created_at)} ({pose.current_weight} kg)
                              </option>
                            ))}
                          </select>
                          {beforePose?.frontPoseSignedUrl ? (
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border-2 border-border">
                              <img
                                src={beforePose.frontPoseSignedUrl}
                                alt={`Öncesi: ${formatDateTR(beforePose.created_at)}, ${beforePose.current_weight} kg`}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 w-full bg-surface-sunken p-4">
                                <span className="rounded bg-fg px-2 py-1 text-xs font-bold uppercase tracking-[0.06em] text-canvas">
                                  Before
                                </span>
                                <p className="mt-1 font-bold text-fg">
                                  {beforePose.current_weight} kg
                                </p>
                              </div>
                            </div>
                          ) : (
                            // İmzalı adres üretilemedi (dosya yok/erişim yok) — kırık görsel yerine boş durum.
                            <EmptyState
                              icon={<ImageOff aria-hidden="true" className="h-8 w-8" />}
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
                            className="w-full rounded-control border border-accent bg-accent/5 p-3 text-sm font-bold text-accent focus:outline-none"
                          >
                            {poses.map((pose) => (
                              <option key={`after-${pose.id}`} value={pose.id}>
                                {formatDateTR(pose.created_at)} ({pose.current_weight} kg)
                              </option>
                            ))}
                          </select>
                          {afterPose?.frontPoseSignedUrl ? (
                            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border-2 border-accent">
                              <img
                                src={afterPose.frontPoseSignedUrl}
                                alt={`Sonrası: ${formatDateTR(afterPose.created_at)}, ${afterPose.current_weight} kg`}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 w-full bg-accent/90 p-4">
                                <span className="rounded-sm bg-surface px-2 py-1 text-xs font-bold uppercase tracking-[0.06em] text-accent">
                                  After
                                </span>
                                <p className="mt-1 font-bold text-accent-fg">
                                  {afterPose.current_weight} kg
                                </p>
                              </div>
                            </div>
                          ) : (
                            <EmptyState
                              icon={<ImageOff aria-hidden="true" className="h-8 w-8" />}
                              title="Bu kayıt için fotoğraf görüntülenemiyor."
                            />
                          )}
                        </div>
                      </div>
                      {beforePose && afterPose && (
                        <div className="mt-6 flex items-center justify-between rounded-control border border-border bg-surface-sunken p-4">
                          <span className="text-sm font-bold text-fg-muted">Net Değişim</span>
                          <span
                            className={`text-xl font-bold ${
                              afterPose.current_weight > beforePose.current_weight
                                ? 'text-success'
                                : afterPose.current_weight < beforePose.current_weight
                                  ? 'text-accent'
                                  : 'text-fg-muted'
                            }`}
                          >
                            {afterPose.current_weight > beforePose.current_weight ? '+' : ''}
                            {(afterPose.current_weight - beforePose.current_weight).toFixed(1)} kg
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-6 border-t pt-6">
                    {/* Beslenme editörü bilinçli olarak KALDIRILDI: plan artık
                        `nutrition_plans` tablolarında tutuluyor ve buradaki ham metin
                        editörü ölü yazma yapıyordu (koç kaydediyor, danışan göremiyordu).
                        Tam editör "Beslenme" sekmesinde. */}
                    <div className="space-y-2 rounded-control border border-accent/30 bg-accent/5 p-4">
                      <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-accent">
                        Beslenme Programı
                      </h4>
                      <p className="text-sm font-medium leading-relaxed text-fg-muted">
                        Beslenme programı buradan düzenlenmez. Gün bazlı tablo, besin kütüphanesi ve
                        otomatik kalori hesabı için üstteki{' '}
                        <span className="font-bold text-accent">Beslenme</span> sekmesini kullanın.
                      </p>
                    </div>
                    {/* Antrenman editörü bilinçli olarak KALDIRILDI: plan artık
                        `workout_plans` tablolarında tutuluyor ve buradaki ham metin
                        editörü ölü yazma yapıyordu (koç kaydediyor, danışan göremiyordu).
                        Tam editör "Antrenman" sekmesinde. */}
                    <div className="space-y-2 rounded-control border border-success/30 bg-success/5 p-4">
                      <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-success">
                        Antrenman Programı
                      </h4>
                      <p className="text-sm font-medium leading-relaxed text-fg-muted">
                        Antrenman programı buradan düzenlenmez. Gün bazlı editör, hareket
                        kütüphanesi ve otomatik program üretici için üstteki{' '}
                        <span className="font-bold text-success">Antrenman</span> sekmesini
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
