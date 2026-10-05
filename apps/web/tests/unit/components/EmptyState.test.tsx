import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmptyState } from '@/components/ui/EmptyState'

import { screen } from '../test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('EmptyState', () => {
  it('title ve description render edilir', () => {
    render(<EmptyState title="Kayıt bulunamadı." description="Henüz hiç veri eklenmedi." />)

    expect(screen.getByText('Kayıt bulunamadı.')).toBeInTheDocument()
    expect(screen.getByText('Henüz hiç veri eklenmedi.')).toBeInTheDocument()
  })

  it('description verilmezse render edilmez', () => {
    render(<EmptyState title="Kayıt bulunamadı." />)

    expect(screen.getByText('Kayıt bulunamadı.')).toBeInTheDocument()
    expect(screen.queryByText('Henüz hiç veri eklenmedi.')).not.toBeInTheDocument()
  })

  it('action verildiğinde görünür', () => {
    render(
      <EmptyState title="Kayıt bulunamadı." action={<button type="button">Yeni Ekle</button>} />
    )

    expect(screen.getByRole('button', { name: 'Yeni Ekle' })).toBeInTheDocument()
  })

  it('icon aria-hidden ile render edilir', () => {
    render(<EmptyState title="Kayıt bulunamadı." icon="🔔" />)

    const icon = screen.getByText('🔔')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('icon verilmezse yerine dekoratif ince sarmal sembolü çizilir', () => {
    const { container } = render(<EmptyState title="Kayıt bulunamadı." />)

    const decorative = container.querySelectorAll('[aria-hidden="true"]')
    expect(decorative).toHaveLength(1)
    expect(decorative[0]?.tagName.toLowerCase()).toBe('svg')
    expect(decorative[0]?.getAttribute('viewBox')).toBe('0 0 48 48')
  })
})
