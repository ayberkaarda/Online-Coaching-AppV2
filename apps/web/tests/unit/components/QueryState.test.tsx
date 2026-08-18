import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { QueryState } from '@/components/ui/QueryState'
import { ApiError } from '@repo/api-client/api/client'

import { fireEvent, screen } from '../test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('QueryState', () => {
  it('isLoading true iken verilen skeleton render edilir', () => {
    render(
      <QueryState isLoading isError={false} skeleton={<div>ÖZEL İSKELET</div>}>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByText('ÖZEL İSKELET')).toBeInTheDocument()
    expect(screen.queryByText('İçerik')).not.toBeInTheDocument()
  })

  it('isLoading true ve skeleton verilmezse varsayılan SkeletonCard render edilir', () => {
    render(
      <QueryState isLoading isError={false}>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('İçerik')).not.toBeInTheDocument()
  })

  it('isError true iken role="alert" içeren hata kutusu ve Türkçe genel mesaj görünür', () => {
    render(
      <QueryState isLoading={false} isError>
        <div>İçerik</div>
      </QueryState>
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Veriler yüklenirken bir hata oluştu. Lütfen tekrar deneyin.')
  })

  it('ApiError verildiğinde onun message alanı görünür', () => {
    const error = new ApiError(404, 'NOT_FOUND', 'Kayıt bulunamadı, özel mesaj.')

    render(
      <QueryState isLoading={false} isError error={error}>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Kayıt bulunamadı, özel mesaj.')
  })

  it('onRetry verildiğinde "Tekrar Dene" butonu tıklanınca çağrılır', () => {
    const onRetry = vi.fn()

    render(
      <QueryState isLoading={false} isError onRetry={onRetry}>
        <div>İçerik</div>
      </QueryState>
    )

    const button = screen.getByRole('button', { name: 'Tekrar Dene' })
    fireEvent.click(button)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('onRetry verilmezse "Tekrar Dene" butonu görünmez', () => {
    render(
      <QueryState isLoading={false} isError>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.queryByRole('button', { name: 'Tekrar Dene' })).not.toBeInTheDocument()
  })

  it('isEmpty true iken emptyMessage görünür, children görünmez', () => {
    render(
      <QueryState isLoading={false} isError={false} isEmpty emptyMessage="Henüz kayıt yok.">
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByText('Henüz kayıt yok.')).toBeInTheDocument()
    expect(screen.queryByText('İçerik')).not.toBeInTheDocument()
  })

  it('isEmpty true ve emptyMessage verilmezse varsayılan "Kayıt bulunamadı." görünür', () => {
    render(
      <QueryState isLoading={false} isError={false} isEmpty>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByText('Kayıt bulunamadı.')).toBeInTheDocument()
  })

  it('hiçbir durum aktif değilse children render edilir', () => {
    render(
      <QueryState isLoading={false} isError={false}>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByText('İçerik')).toBeInTheDocument()
  })

  it("öncelik sırası: isLoading isError'dan önce gelir", () => {
    render(
      <QueryState isLoading isError skeleton={<div>YÜKLENİYOR</div>}>
        <div>İçerik</div>
      </QueryState>
    )

    expect(screen.getByText('YÜKLENİYOR')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
