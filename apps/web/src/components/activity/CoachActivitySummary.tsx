'use client'

// Koç görünümü — GÜN hassasiyetinde özet (Faz 4.8 §7c).
//
// ###########################################################################
// # MAHREMİYET SINIRI BU DOSYADA ÜÇ KEZ KORUNUR (dilim 3c'de biri EKLENDİ)  #
// ###########################################################################
//   0) VERİ KATMANINDA (ASIL SINIR — dilim 3c): `useCoachActivitySummary`
//      artık ham satır çekmiyor, `public.coach_activity_summary(uuid, integer)`
//      RPC'sini çağırıyor. O fonksiyon `(day date, total_seconds integer,
//      event_counts jsonb)` döndürür — yani saat/dakika bu bileşene GELMEZ,
//      "gösterilmiyor" değil, ORTADA YOKTUR. Dilim 3b'de ham damgalar ağdan
//      iniyordu ve sınır yalnızca (1) ve (2) ile duruyordu.
//   1) TİP SEVİYESİNDE: `useCoachActivitySummary` yalnızca `CoachActivityDaySummary`
//      döner ve o tipte saat/dakika taşıyan TEK BİR alan YOKTUR (`date: string`,
//      `YYYY-MM-DD`). Bu bileşen `ActivitySession`/`ActivityEvent`in ham
//      `started_at`/`occurred_at` alanlarını HİÇ GÖRMEZ — import bile etmez.
//   2) BİÇİMLENDİRMEDE: `formatDayLabel` yalnızca GÜN üretir (`Intl`
//      `day/month/year`); `apps/web/src/lib/utils.ts`teki `formatDateTimeTR`
//      (saat/dakika basan fonksiyon) BU DOSYADA HİÇ İMPORT EDİLMEZ —
//      `apps/web/tests/unit/activity-views.test.tsx` bunu regresyona karşı
//      kilitler ve AYRICA hook'un aldığı VERİDE saat/dakika taşıyan bir alan
//      olmadığını doğrular.
//
// Rıza durumu üç ayrı dalda ele alınır (bkz. `packages/api-client/src/hooks/useActivityLog.ts`
// başlığı); `revoked` ve `undecided` BİLEREK AYNI METNE düşmez — ikisi farklı
// gerçekleri anlatır ve "hiç açmadı" ifadesi HİÇBİRİNDE kullanılmaz (bu ifade
// `revoked` için YANLIŞ bilgi olurdu: danışan daha önce açmıştı).

import { CalendarClock, CircleHelp, Lock, ShieldAlert } from 'lucide-react'
import type { JSX } from 'react'

import {
  ACTIVITY_EVENT_TYPES,
  activityEventLabel,
  COACH_ACTIVITY_SUMMARY_DAYS,
  formatDurationLabel,
  useActivityConsentState,
  useCoachActivitySummary,
  useMfaStatus,
  type CoachActivityDaySummary,
} from '@repo/api-client'

import { EmptyState, SkeletonCard } from '@/components/ui'

export interface CoachActivitySummaryProps {
  /** Seçili danışanın id'si. `undefined` iken hiçbir sorgu çalışmaz (SkeletonCard gösterilir). */
  clientId?: string
}

/** "17 Ağustos 2026" — GÜN hassasiyeti, saat/dakika YOK. `new Date(y, m, d)` YEREL yapıcıdır (UTC ayrıştırma yok, gün kaymaz). */
function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function DayRow({ day }: { day: CoachActivityDaySummary }): JSX.Element {
  const activeTypes = ACTIVITY_EVENT_TYPES.filter((type) => (day.eventCounts[type] ?? 0) > 0)
  return (
    <li className="space-y-2 rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-fg">{formatDayLabel(day.date)}</p>
        {day.totalDurationSec > 0 && (
          <span className="whitespace-nowrap rounded-control bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
            {formatDurationLabel(day.totalDurationSec)}
          </span>
        )}
      </div>
      {activeTypes.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {activeTypes.map((type) => (
            <li
              key={type}
              className="rounded-control bg-canvas px-2 py-1 text-xs font-medium text-fg-muted"
            >
              {activityEventLabel(type)}: {day.eventCounts[type]}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Rıza `granted`iyken çalışan alt bileşen — hook, yalnızca bu dal render edildiğinde bağlanır. */
function CoachActivityDays({ clientId }: { clientId?: string }): JSX.Element {
  const summaryQuery = useCoachActivitySummary(clientId)

  if (summaryQuery.isLoading) return <SkeletonCard />

  if (summaryQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-panel border border-danger/30 bg-danger/5 p-5 text-sm text-danger"
      >
        Etkinlik özeti okunamadı. Lütfen tekrar deneyin.
      </div>
    )
  }

  const summary = summaryQuery.data
  if (!summary || summary.days.length === 0) {
    // Pencere ARTIK AÇIKÇA SÖYLENİYOR: RPC son `p_days` günü döndürür
    // (varsayılan 30). "Henüz bir kayıt yok" demek, 40 gün önce aktif olmuş bir
    // danışan için YANLIŞ bilgi olurdu.
    return <EmptyState title={`Son ${COACH_ACTIVITY_SUMMARY_DAYS} günde etkinlik kaydı yok.`} />
  }

  return (
    <div className="space-y-3">
      {summary.lastActiveDate && (
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
          <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
          Son aktif: {formatDayLabel(summary.lastActiveDate)}
        </p>
      )}
      <ul className="space-y-2">
        {summary.days.map((day) => (
          <DayRow key={day.date} day={day} />
        ))}
      </ul>
    </div>
  )
}

export function CoachActivitySummary({ clientId }: CoachActivitySummaryProps): JSX.Element {
  const mfaStatusQuery = useMfaStatus()
  const consentQuery = useActivityConsentState(clientId)

  if (mfaStatusQuery.isLoading) return <SkeletonCard />

  // ###########################################################################
  // # aal2 KONTROLÜ GÜVENLİK SINIRI DEĞİL (gerçek sınır `mfa_aal2_gate` RLS'i) #
  // # — ama koç aal1'deyse RESTRICTIVE politika sorguyu REDDETMEZ, SESSİZCE 0  #
  // # satır döner. Bu kontrol olmasaydı aal1'deki bir koç "danışan hiç aktif   #
  // # olmamış" gibi YANLIŞ bir izlenime kapılırdı; burada AYRIŞTIRILIR.        #
  // ###########################################################################
  if (mfaStatusQuery.data && !mfaStatusQuery.data.isAal2) {
    return (
      <EmptyState
        icon={<ShieldAlert aria-hidden="true" className="h-7 w-7 text-fg-muted" />}
        title="Bu görünüm için iki adımlı doğrulama gerekli."
        description="Danışan aktivite özetini görmek için hesabınızda aal2 (iki adımlı doğrulanmış) bir oturum gerekir."
      />
    )
  }

  if (consentQuery.isLoading) return <SkeletonCard />

  if (consentQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-panel border border-danger/30 bg-danger/5 p-5 text-sm text-danger"
      >
        Rıza durumu okunamadı. Lütfen tekrar deneyin.
      </div>
    )
  }

  // Üç durum AYRI AYRI ele alınır — bkz. dosya başı notu. `default` yalnızca
  // `clientId` henüz seçilmediği (sorgu `enabled: false`) ara durumu karşılar.
  switch (consentQuery.data) {
    case 'revoked':
      return (
        <EmptyState
          icon={<Lock aria-hidden="true" className="h-7 w-7 text-fg-muted" />}
          title="Aktivite kaydı kapalı."
          description="Danışan etkinlik kaydını kapattı (daha önce açmış olabilir) — gösterilecek bir kayıt yok."
        />
      )
    case 'undecided':
      return (
        <EmptyState
          icon={<CircleHelp aria-hidden="true" className="h-7 w-7 text-fg-muted" />}
          title="Aktivite kaydı için henüz karar verilmedi."
          description="Danışan bu özelliği açıp açmayacağına henüz karar vermedi — gösterilecek bir kayıt yok."
        />
      )
    case 'granted':
      return <CoachActivityDays clientId={clientId} />
    default:
      return <SkeletonCard />
  }
}
