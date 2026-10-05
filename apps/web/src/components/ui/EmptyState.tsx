// Veri bulunamadığında gösterilen nötr boş durum kutusu. İkon verilmezse illüstrasyon,
// marka sembolünün ince çizgili 48'lik sürümüdür (tek dekoratif motif — Kor & Kemik §5).

import type { ReactNode } from 'react'

import { SarmalMark } from '@/components/brand/SarmalMark'

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
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-10 text-center"
    >
      {icon ? (
        <span className="text-31" aria-hidden="true">
          {icon}
        </span>
      ) : (
        <SarmalMark size={48} thin className="text-fg-muted" />
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action}
    </div>
  )
}
