import type { JSX } from 'react'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

import { fireEvent, screen } from '../test-utils'

function Boom(): JSX.Element {
  throw new Error('patlama testi')
}

// React hata sınırı testleri konsola gürültü basar (React'in kendi uyarısı + logger.error).
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('ErrorBoundary', () => {
  it('hata fırlatan bir alt bileşen render edildiğinde varsayılan fallback görünür ve onError çağrılır', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Bir şeyler ters gitti')
    expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('özel fallback fonksiyonu verildiğinde o render edilir ve reset çağrılabilir', () => {
    const resetSpy = vi.fn()

    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>ÖZEL HATA: {error.message}</p>
            <button
              type="button"
              onClick={() => {
                resetSpy()
                reset()
              }}
            >
              Sıfırla
            </button>
          </div>
        )}
      >
        <Boom />
      </ErrorBoundary>
    )

    expect(screen.getByText('ÖZEL HATA: patlama testi')).toBeInTheDocument()
    expect(screen.queryByText('Bir şeyler ters gitti')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sıfırla' }))
    expect(resetSpy).toHaveBeenCalledTimes(1)
  })

  it('hata yokken children normal render edilir', () => {
    render(
      <ErrorBoundary>
        <div>Normal İçerik</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Normal İçerik')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
