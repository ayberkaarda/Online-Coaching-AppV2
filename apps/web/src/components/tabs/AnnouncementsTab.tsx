'use client'

// Son 30 günün duyurularını listeler. Veri DashboardTabs'tan prop olarak gelir
// (orada `useNotifications(targetId, { sinceDays: 30 })` ile çekilir).

import { Bell } from 'lucide-react'
import type { JSX } from 'react'

import { EmptyState } from '@/components/ui'
import { formatDateTR } from '@/lib/utils'
import type { Notification, UserRole } from '@repo/types'

export interface AnnouncementsTabProps {
  announcements: Notification[]
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

export default function AnnouncementsTab({
  announcements,
  userRole,
  selectedClientIds,
}: AnnouncementsTabProps): JSX.Element {
  return (
    <div className="animate-fadeIn space-y-4">
      <div className="border-b pb-3 dark:border-zinc-800">
        <h4 className="text-lg font-bold text-gray-800 dark:text-zinc-200">
          Son 30 Günün Duyuruları
        </h4>
      </div>

      {userRole === 'coach' && selectedClientIds.length > 1 ? (
        <p className="py-10 text-center text-sm font-bold text-accent">
          Sadece 1 danışan seçili bırakın.
        </p>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={<Bell aria-hidden="true" className="h-8 w-8" />}
          title="Duyuru bulunmuyor."
        />
      ) : (
        <div className="space-y-4">
          {announcements.map((ann) => (
            <article
              key={ann.id}
              className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-transparent p-5"
            >
              <div className="absolute left-0 top-0 h-full w-1 bg-accent" aria-hidden="true" />
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-black text-accent">
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-red-500"
                    aria-hidden="true"
                  />
                  YENİ DUYURU
                </span>
                <span className="rounded-lg border bg-white px-3 py-1 text-[11px] font-bold text-gray-500 dark:bg-zinc-900">
                  {formatDateTR(ann.created_at)}
                </span>
              </div>
              {ann.title ? (
                <h5 className="mb-1 text-sm font-black text-gray-800 dark:text-zinc-100">
                  {ann.title}
                </h5>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                {ann.message}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
