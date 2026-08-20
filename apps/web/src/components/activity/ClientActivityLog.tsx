'use client'

// Danışanın KENDİ etkinlik kaydı — TAM AYRINTI (saat/dakika dahil).
//
// Faz 4.8 §7c: "Danışan kendi kaydını görür — koç görünümüyle simetrik
// değildir, danışan kendi geçmişine tam erişir." Bu, KVKK m.11 erişim hakkının
// karşılığıdır; koç görünümündeki gün-hassasiyeti sınırı (bkz.
// `CoachActivitySummary.tsx`) BU bileşene UYGULANMAZ — burada saat/dakika
// BİLEREK render edilir.
//
// Rıza VER/GERİ ÇEK düğmesi BİLEREK YOK: dilim 2'nin uçları
// (`grant_activity_consent`/`revoke_activity_consent`) henüz kurulmadı
// (yalnızca `service_role`e açık, tarayıcı çağıramaz). Bu bileşen SALT OKUR;
// üç rıza durumunu ayrı ayrı ANLATIR ama hiçbirini DEĞİŞTİRMEZ.

import { CalendarClock, CircleHelp, Lock } from 'lucide-react'
import type { JSX } from 'react'

import {
  activityEventLabel,
  activityPlatformLabel,
  formatDurationLabel,
  sessionDurationSec,
  useActivityConsentState,
  useActivityEvents,
  useActivitySessions,
  type ActivityEvent,
  type ActivitySession,
} from '@repo/api-client'

import { EmptyState, QueryState, SkeletonCard } from '@/components/ui'
import { formatDateTimeTR } from '@/lib/utils'

export interface ClientActivityLogProps {
  userId?: string
}

function SessionRow({ session }: { session: ActivitySession }): JSX.Element {
  const durationLabel = formatDurationLabel(sessionDurationSec(session))
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-fg">
          {formatDateTimeTR(session.started_at)} — {formatDateTimeTR(session.last_seen_at)}
        </p>
        <p className="text-xs text-fg-muted">{activityPlatformLabel(session.platform)}</p>
      </div>
      <span className="whitespace-nowrap rounded-control bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
        {durationLabel}
      </span>
    </li>
  )
}

function EventRow({ event }: { event: ActivityEvent }): JSX.Element {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-fg">{activityEventLabel(event.event)}</p>
        <p className="text-xs text-fg-muted">
          {formatDateTimeTR(event.occurred_at)}
          {event.tab ? ` · ${event.tab}` : ''}
        </p>
      </div>
      {event.duration_sec !== null && (
        <span className="whitespace-nowrap rounded-control bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
          {formatDurationLabel(event.duration_sec)}
        </span>
      )}
    </li>
  )
}

export function ClientActivityLog({ userId }: ClientActivityLogProps): JSX.Element {
  const consentQuery = useActivityConsentState(userId)
  const consentState = consentQuery.data
  const dataEnabled = consentState === 'granted'

  const sessionsQuery = useActivitySessions(userId, { enabled: dataEnabled })
  const eventsQuery = useActivityEvents(userId, { enabled: dataEnabled })

  if (consentQuery.isLoading) return <SkeletonCard />

  if (consentQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-panel border border-danger/30 bg-danger/5 p-5 text-sm text-danger"
      >
        Rıza durumu okunamadı. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  // Üç durum AYRI AYRI ele alınır: her biri kendi `case`inde, farklı bir metin
  // üretir (`revoked` ile `undecided` KASITLI OLARAK aynı metne DÜŞMEZ —
  // ikisi farklı gerçekleri anlatır). `default` yalnızca `userId` henüz
  // gelmediği (sorgu `enabled: false`) ara durumu karşılar.
  switch (consentState) {
    case 'undecided':
      return (
        <EmptyState
          icon={<CircleHelp aria-hidden="true" className="h-7 w-7 text-fg-muted" />}
          title="Aktivite kaydı için henüz bir karar vermediniz."
          description="Rıza ekranı yakında burada olacak. Karar verene kadar davranış verisi (sekme görüntüleme, oturum açma/kapama gibi) toplanmaz."
        />
      )
    case 'revoked':
      return (
        <EmptyState
          icon={<Lock aria-hidden="true" className="h-7 w-7 text-fg-muted" />}
          title="Aktivite kaydınızı kapattınız."
          description="Kapatma anında geçmiş kayıtlarınız da kalıcı olarak silindi (KVKK m.7) — gösterilecek bir kayıt yok."
        />
      )
    case 'granted':
      break
    default:
      return <SkeletonCard />
  }

  const sessions = sessionsQuery.data ?? []
  const events = eventsQuery.data ?? []
  const isEmpty = sessions.length === 0 && events.length === 0

  return (
    <div className="space-y-8">
      <QueryState
        isLoading={sessionsQuery.isLoading || eventsQuery.isLoading}
        isError={sessionsQuery.isError || eventsQuery.isError}
        error={sessionsQuery.error ?? eventsQuery.error}
        isEmpty={isEmpty}
        emptyMessage="Henüz bir etkinlik kaydınız yok."
        onRetry={() => {
          void sessionsQuery.refetch()
          void eventsQuery.refetch()
        }}
      >
        <div className="space-y-8">
          <section aria-labelledby="client-activity-sessions-heading">
            <h3
              id="client-activity-sessions-heading"
              className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-fg-muted"
            >
              <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
              Oturumlar
            </h3>
            {sessions.length === 0 ? (
              <p className="text-sm text-fg-muted">Kayıtlı oturum yok.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="client-activity-events-heading">
            <h3
              id="client-activity-events-heading"
              className="mb-3 text-sm font-bold uppercase tracking-wider text-fg-muted"
            >
              Olaylar
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-fg-muted">Kayıtlı olay yok.</p>
            ) : (
              <ul className="space-y-2">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </QueryState>
    </div>
  )
}
