// Route geçişleri sırasında gösterilen genel iskelet ekranı.

import type { JSX } from 'react'

import { SkeletonCard, SkeletonText } from '@/components/ui'

export default function Loading(): JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="container mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6"
    >
      <span className="sr-only">Yükleniyor…</span>
      <SkeletonCard />
      <SkeletonText lines={4} />
    </div>
  )
}
