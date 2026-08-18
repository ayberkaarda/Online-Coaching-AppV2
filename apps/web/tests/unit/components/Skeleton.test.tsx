import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonText,
} from '@/components/ui/Skeleton'

import { screen } from '../test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('Skeleton', () => {
  it('className prop\'unu temel sınıflarla birleştirir ve aria-hidden="true" taşır', () => {
    const { container } = render(<Skeleton className="h-10 w-10" />)
    const el = container.firstElementChild as HTMLElement

    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.className).toContain('h-10')
    expect(el.className).toContain('w-10')
    expect(el.className).toContain('animate-pulse')
  })
})

describe('SkeletonText', () => {
  it('varsayılan olarak 3 satır üretir', () => {
    const { container } = render(<SkeletonText />)
    const lines = container.querySelectorAll('[aria-hidden="true"]')
    expect(lines).toHaveLength(3)
  })

  it("lines prop'u kadar satır üretir", () => {
    const { container } = render(<SkeletonText lines={5} />)
    const lines = container.querySelectorAll('[aria-hidden="true"]')
    expect(lines).toHaveLength(5)
  })

  it('kapsayıcıda role="status" ve "Yükleniyor" içeren sr-only metin bulunur', () => {
    render(<SkeletonText />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Yükleniyor')
  })
})

describe('SkeletonTable', () => {
  it('varsayılan olarak 5x3 hücre üretir', () => {
    const { container } = render(<SkeletonTable />)
    const cells = container.querySelectorAll('[aria-hidden="true"]')
    expect(cells).toHaveLength(15)
  })

  it('rows x cols kadar hücre üretir', () => {
    const { container } = render(<SkeletonTable rows={2} cols={4} />)
    const cells = container.querySelectorAll('[aria-hidden="true"]')
    expect(cells).toHaveLength(8)
  })

  it('kapsayıcıda role="status" ve "Yükleniyor" içeren sr-only metin bulunur', () => {
    render(<SkeletonTable />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Yükleniyor')
  })
})

describe('SkeletonCard', () => {
  it('role="status" içerir ve "Yükleniyor" metni sr-only olarak bulunur', () => {
    render(<SkeletonCard />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Yükleniyor')
  })
})

describe('SkeletonChart', () => {
  it('role="status" içerir ve "Yükleniyor" metni sr-only olarak bulunur', () => {
    render(<SkeletonChart />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Yükleniyor')
  })
})
