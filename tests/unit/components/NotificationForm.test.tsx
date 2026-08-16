import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NotificationForm } from '@/components/NotificationForm'
import { useSendNotification } from '@/hooks'
import type { Profile } from '@/types'

import { screen, userEvent, waitFor } from '../test-utils'

vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>()
  return { ...actual, useSendNotification: vi.fn() }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p-1',
    full_name: 'Test Kullanıcı',
    email: 'test@example.com',
    role: 'student',
    avatar_url: null,
    nutrition_plan: null,
    workout_plan: null,
    current_streak: 0,
    last_checkin_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// NotificationForm yalnızca bu alanları okur; useMutation'ın tüm union tipini taklit
// etmek yerine gerçekten kullanılan alanları modelleyip gerçek dönüş tipine cast ediyoruz.
interface MockSendNotificationResult {
  mutateAsync: ReturnType<typeof vi.fn>
  isPending: boolean
}

function mockSendNotification(
  overrides: Partial<MockSendNotificationResult> = {}
): ReturnType<typeof useSendNotification> {
  const base: MockSendNotificationResult = {
    mutateAsync: vi.fn().mockResolvedValue(1),
    isPending: false,
  }
  return { ...base, ...overrides } as unknown as ReturnType<typeof useSendNotification>
}

// notificationSchema, target alanı için "all" veya geçerli bir UUID bekliyor;
// bu yüzden sahte öğrenci id'leri gerçekçi UUID v4 formatında olmalı.
const STUDENT_1_ID = '11111111-1111-4111-8111-111111111111'
const STUDENT_2_ID = '22222222-2222-4222-8222-222222222222'

const students: Profile[] = [
  makeProfile({ id: 'coach-1', role: 'admin', full_name: 'Deniz Koç' }),
  makeProfile({ id: STUDENT_1_ID, role: 'student', full_name: 'Ahmet Yılmaz' }),
  makeProfile({ id: STUDENT_2_ID, role: 'student', full_name: 'Elif Demir' }),
]

describe('NotificationForm', () => {
  it('boş başlıkla gönderince zod hata mesajı role="alert" ile görünür ve mutation çağrılmaz', async () => {
    const mutation = mockSendNotification()
    vi.mocked(useSendNotification).mockReturnValue(mutation)
    const user = userEvent.setup()

    render(<NotificationForm students={students} />)

    await user.type(screen.getByLabelText('MESAJ DETAYI'), 'Sadece mesaj dolduruldu.')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Başlık zorunludur.')
    expect(mutation.mutateAsync).not.toHaveBeenCalled()
  })

  it('geçerli form + target="all" ile mutation admin olmayan tüm öğrencilerin id\'leriyle çağrılır', async () => {
    const mutation = mockSendNotification()
    vi.mocked(useSendNotification).mockReturnValue(mutation)
    const user = userEvent.setup()

    render(<NotificationForm students={students} />)

    await user.type(screen.getByLabelText('BAŞLIK'), 'Yeni Duyuru')
    await user.type(screen.getByLabelText('MESAJ DETAYI'), 'Herkese mesaj.')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      studentIds: [STUDENT_1_ID, STUDENT_2_ID],
      title: 'Yeni Duyuru',
      message: 'Herkese mesaj.',
    })
  })

  it('tek öğrenci seçilince mutation studentIds: [seçilenId] ile çağrılır', async () => {
    const mutation = mockSendNotification()
    vi.mocked(useSendNotification).mockReturnValue(mutation)
    const user = userEvent.setup()

    render(<NotificationForm students={students} />)

    await user.selectOptions(screen.getByLabelText('KİME'), STUDENT_1_ID)
    await user.type(screen.getByLabelText('BAŞLIK'), 'Özel Not')
    await user.type(screen.getByLabelText('MESAJ DETAYI'), 'Sadece sana.')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      studentIds: [STUDENT_1_ID],
      title: 'Özel Not',
      message: 'Sadece sana.',
    })
  })

  it('isPending iken buton disabled olur ve metin "Gönderiliyor..." olur', () => {
    const mutation = mockSendNotification({ isPending: true })
    vi.mocked(useSendNotification).mockReturnValue(mutation)

    render(<NotificationForm students={students} />)

    const button = screen.getByRole('button', { name: 'Gönderiliyor...' })
    expect(button).toBeDisabled()
  })

  it("tüm input'ların erişilebilir bir adı vardır (getByLabelText)", () => {
    const mutation = mockSendNotification()
    vi.mocked(useSendNotification).mockReturnValue(mutation)

    render(<NotificationForm students={students} />)

    expect(screen.getByLabelText('KİME')).toBeInTheDocument()
    expect(screen.getByLabelText('BAŞLIK')).toBeInTheDocument()
    expect(screen.getByLabelText('MESAJ DETAYI')).toBeInTheDocument()
  })
})
