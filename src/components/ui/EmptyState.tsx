// Veri bulunamadığında gösterilen nötr boş durum kutusu.

import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center dark:border-zinc-800"
    >
      {icon ? (
        <span className="text-3xl" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="text-sm font-black text-gray-700 dark:text-zinc-200">{title}</h3>
      {description ? (
        <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
