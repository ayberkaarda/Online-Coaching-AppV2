// Yükleniyor iskeletleri. Ekran okuyucular için kapsayıcıda role="status",
// görsel parçalarda aria-hidden kullanılır.

import { cn } from '@/lib/utils'

const BASE = 'animate-pulse rounded-xl bg-gray-200 dark:bg-zinc-800'

export interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn(BASE, className)} />
}

function LoadingLabel() {
  return <span className="sr-only">Yükleniyor…</span>
}

export interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div role="status" aria-live="polite" className={cn('space-y-2', className)}>
      <LoadingLabel />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-4 rounded-3xl border border-gray-100 p-6 dark:border-zinc-800"
    >
      <LoadingLabel />
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

export interface SkeletonTableProps {
  rows?: number
  cols?: number
}

export function SkeletonTable({ rows = 5, cols = 3 }: SkeletonTableProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800"
    >
      <LoadingLabel />
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-3">
            {Array.from({ length: cols }).map((_, colIndex) => (
              <Skeleton key={colIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <LoadingLabel />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
