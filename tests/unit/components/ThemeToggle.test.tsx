import { render } from '@testing-library/react'
import { useTheme } from 'next-themes'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from '@/components/ThemeToggle'

import { fireEvent, screen, waitFor } from '../test-utils'

vi.mock('next-themes', () => ({
  useTheme: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('ThemeToggle', () => {
  it('koyu temadayken butona tıklayınca setTheme("light") çağrılır ve aria-label açık temaya geçişi belirtir', async () => {
    const setTheme = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      setTheme,
      systemTheme: 'dark',
      themes: ['light', 'dark'],
      resolvedTheme: 'dark',
    })

    render(<ThemeToggle />)

    const button = await waitFor(() => screen.getByRole('button'))
    expect(button).toHaveAttribute('aria-label', 'Açık temaya geç')

    fireEvent.click(button)
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('açık temadayken butona tıklayınca setTheme("dark") çağrılır ve aria-label koyu temaya geçişi belirtir', async () => {
    const setTheme = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      setTheme,
      systemTheme: 'light',
      themes: ['light', 'dark'],
      resolvedTheme: 'light',
    })

    render(<ThemeToggle />)

    const button = await waitFor(() => screen.getByRole('button'))
    expect(button).toHaveAttribute('aria-label', 'Koyu temaya geç')

    fireEvent.click(button)
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('theme "system" iken gerçek tema systemTheme üzerinden çözülür', async () => {
    const setTheme = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'system',
      setTheme,
      systemTheme: 'dark',
      themes: ['light', 'dark'],
      resolvedTheme: 'dark',
    })

    render(<ThemeToggle />)

    const button = await waitFor(() => screen.getByRole('button'))
    // systemTheme 'dark' olduğu için buton açık temaya geçişi önermeli.
    expect(button).toHaveAttribute('aria-label', 'Açık temaya geç')
  })
})
