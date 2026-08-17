import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AnnouncementsTab from '@/components/tabs/AnnouncementsTab'
import type { Notification } from '@/types'

import { screen } from '../test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    client_id: 's-1',
    title: 'Başlık',
    message: 'Bir mesaj',
    is_read: false,
    created_at: '2026-08-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('AnnouncementsTab', () => {
  it('boş dizi verildiğinde boş durum metni görünür', () => {
    render(<AnnouncementsTab announcements={[]} userRole="client" selectedClientIds={[]} />)

    expect(screen.getByText('Duyuru bulunmuyor.')).toBeInTheDocument()
  })

  it('duyuru listesindeki her message render edilir', () => {
    const announcements = [
      makeNotification({ id: 'n-1', message: 'İlk duyuru mesajı' }),
      makeNotification({ id: 'n-2', message: 'İkinci duyuru mesajı' }),
    ]

    render(
      <AnnouncementsTab announcements={announcements} userRole="client" selectedClientIds={[]} />
    )

    expect(screen.getByText('İlk duyuru mesajı')).toBeInTheDocument()
    expect(screen.getByText('İkinci duyuru mesajı')).toBeInTheDocument()
  })

  it('title varsa render edilir (regresyon: eskiden başlık gösterilmiyordu)', () => {
    const announcements = [
      makeNotification({ id: 'n-1', title: 'Önemli Duyuru', message: 'Detaylar' }),
    ]

    render(
      <AnnouncementsTab announcements={announcements} userRole="client" selectedClientIds={[]} />
    )

    expect(screen.getByText('Önemli Duyuru')).toBeInTheDocument()
  })

  it('title null ise başlık elemanı hiç yoktur', () => {
    const announcements = [makeNotification({ id: 'n-1', title: null, message: 'Başlıksız mesaj' })]

    const { container } = render(
      <AnnouncementsTab announcements={announcements} userRole="client" selectedClientIds={[]} />
    )

    expect(screen.getByText('Başlıksız mesaj')).toBeInTheDocument()
    expect(container.querySelector('h5')).not.toBeInTheDocument()
  })

  it('coach rolünde birden fazla danışan seçiliyken uyarı görünür ve liste render edilmez', () => {
    const announcements = [makeNotification({ id: 'n-1', message: 'Görünmemeli' })]

    render(
      <AnnouncementsTab
        announcements={announcements}
        userRole="coach"
        selectedClientIds={['a', 'b']}
      />
    )

    expect(screen.getByText('Sadece 1 danışan seçili bırakın.')).toBeInTheDocument()
    expect(screen.queryByText('Görünmemeli')).not.toBeInTheDocument()
  })

  it('coach rolünde tek danışan seçiliyken liste normal render edilir', () => {
    const announcements = [makeNotification({ id: 'n-1', message: 'Görünmeli' })]

    render(
      <AnnouncementsTab announcements={announcements} userRole="coach" selectedClientIds={['a']} />
    )

    expect(screen.getByText('Görünmeli')).toBeInTheDocument()
  })

  it('tarih Türkçe formatta görünür', () => {
    const createdAt = '2026-08-10T12:00:00.000Z'
    const announcements = [makeNotification({ id: 'n-1', created_at: createdAt })]

    render(
      <AnnouncementsTab announcements={announcements} userRole="client" selectedClientIds={[]} />
    )

    const expected = new Date(createdAt).toLocaleDateString('tr-TR')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
