// Borç B-046: `FormCheckTab` (haftalık form check gönderimi + öncesi/sonrası kıyaslama) 0
// kapsamdaydı. `@repo/api-client` barrel'i TAMAMEN mock'lanır (nutrition-logs.test.ts Bölüm C
// ile AYNI desen) — veri katmanı zaten kendi hook testlerinde kapsanıyor (bkz.
// tests/unit/form-check-queue.test.tsx); burada yalnızca bileşenin sunum + form doğrulama +
// kullanıcı etkileşim mantığı doğrulanır.
//
// KAPSAM:
//   1) Koç birden fazla danışan seçtiğinde liste/form yerine uyarı gösterilir.
//   2) Yükleniyor / hata (+ retry) / boş durum.
//   3) Kayıt listesi: beklemede rozeti, koç geri bildirimi, eksik fotoğraf yer tutucusu.
//   4) Danışan formu: geçersiz kilo (zod) hata mesajı gösterir, mutateAsync ÇAĞRILMAZ.
//   5) Fotoğraf seçilmeden gönderim engellenir (fileError).
//   6) Geçersiz dosya `toast.error` + satır içi hata gösterir.
//   7) Geçerli gönderim: submitFormCheck.mutateAsync DOĞRU payload ile çağrılır.
//   8) Koç rolünde form HİÇ render edilmez.
//   9) Kıyaslama (öncesi/sonrası) modu: buton yalnızca >=2 kayıtta görünür, seçimler
//      varsayılan en eski/en yeni kayıttır.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return {
    ...actual,
    useFormChecks: vi.fn(),
    useSubmitFormCheck: vi.fn(),
  }
})

vi.mock('@repo/api-client/upload-validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client/upload-validation')>()
  return {
    ...actual,
    validateImageFile: vi.fn(),
  }
})

import FormCheckTab from '@/components/tabs/FormCheckTab'
import { useFormChecks, useSubmitFormCheck } from '@repo/api-client'
import { validateImageFile } from '@repo/api-client/upload-validation'
import type { FormCheckWithUrls } from '@repo/api-client/hooks/useFormChecks'
import { toast } from 'sonner'

const CLIENT_ID = 'client-2222222-2222-4222-8222-222222222222'

function mockQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function mockMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...overrides,
  }
}

function formCheck(overrides: Partial<FormCheckWithUrls> = {}): FormCheckWithUrls {
  return {
    id: 'fc-1',
    client_id: CLIENT_ID,
    current_weight: 82.4,
    front_pose_path: 'poses/front.jpg',
    back_pose_path: null,
    notes: null,
    created_at: '2026-08-10T09:00:00.000Z',
    status: 'pending',
    coach_feedback: null,
    reviewed_at: null,
    reviewed_by: null,
    frontPoseSignedUrl: 'https://signed/front.jpg',
    backPoseSignedUrl: null,
    ...overrides,
  }
}

function mockFormCheckHooks(
  overrides: {
    formChecks?: Record<string, unknown>
    submit?: Record<string, unknown>
  } = {}
) {
  vi.mocked(useFormChecks).mockReturnValue(
    mockQuery({ data: [], ...overrides.formChecks }) as unknown as ReturnType<typeof useFormChecks>
  )
  const submitFormCheck = mockMutation(overrides.submit)
  vi.mocked(useSubmitFormCheck).mockReturnValue(
    submitFormCheck as unknown as ReturnType<typeof useSubmitFormCheck>
  )
  return { submitFormCheck }
}

function renderTab(props: {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: 'coach' | 'client' | null
  selectedClientIds: string[]
}) {
  return render(<FormCheckTab {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(validateImageFile).mockResolvedValue({ ok: true, mime: 'image/png', extension: 'png' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FormCheckTab — koç danışan seçimi', () => {
  it('koç birden fazla danışan seçtiğinde liste yerine uyarı gösterir', () => {
    mockFormCheckHooks({ formChecks: { data: [formCheck()] } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID, 'client-3'],
    })

    expect(screen.getByText('Sadece 1 danışan seçili bırakın.')).toBeInTheDocument()
    expect(screen.queryByText('82.4 kg')).not.toBeInTheDocument()
  })
})

describe('FormCheckTab — yükleniyor / hata / boş durum', () => {
  it('yükleniyorken iskelet gösterilir', () => {
    mockFormCheckHooks({ formChecks: { isLoading: true } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
  })

  it('hata durumunda uyarı gösterilir ve "Tekrar Dene" refetch çağırır', async () => {
    const refetch = vi.fn()
    mockFormCheckHooks({
      formChecks: { isError: true, error: new Error('ağ hatası'), refetch },
    })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const alert = screen.getByRole('alert')
    const user = userEvent.setup()
    await user.click(within(alert).getByRole('button', { name: 'Tekrar Dene' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('kayıt yokken "Kayıt bulunamadı." mesajı gösterir', () => {
    mockFormCheckHooks({ formChecks: { data: [] } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Kayıt bulunamadı.')).toBeInTheDocument()
  })
})

describe('FormCheckTab — kayıt listesi', () => {
  it('beklemedeki kayıt "Beklemede" rozetiyle, incelenmiş kayıt koç geri bildirimiyle görünür', () => {
    mockFormCheckHooks({
      formChecks: {
        data: [
          formCheck({ id: 'fc-pending', current_weight: 82.4, status: 'pending' }),
          formCheck({
            id: 'fc-reviewed',
            current_weight: 80.1,
            status: 'reviewed',
            coach_feedback: 'Harika gidiyorsun!',
          }),
        ],
      },
    })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const pendingCard = screen.getByRole('group', { name: 'Form check kaydı, 82.4 kg' })
    expect(within(pendingCard).getByText('Beklemede')).toBeInTheDocument()

    const reviewedCard = screen.getByRole('group', { name: 'Form check kaydı, 80.1 kg' })
    expect(within(reviewedCard).queryByText('Beklemede')).not.toBeInTheDocument()
    expect(within(reviewedCard).getByText('Harika gidiyorsun!')).toBeInTheDocument()
  })

  it('fotoğrafı olmayan kayıt için kırık görsel yerine yer tutucu ikon gösterir', () => {
    mockFormCheckHooks({
      formChecks: {
        data: [formCheck({ front_pose_path: null, frontPoseSignedUrl: null })],
      },
    })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const card = screen.getByRole('group', { name: 'Form check kaydı, 82.4 kg' })
    expect(within(card).queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('FormCheckTab — danışan formu doğrulama', () => {
  it('geçersiz kilo (20 kg altı) zod hata mesajını gösterir, mutateAsync ÇAĞRILMAZ', async () => {
    const { submitFormCheck } = mockFormCheckHooks()
    const user = userEvent.setup()

    renderTab({
      targetId: undefined,
      currentUserId: CLIENT_ID,
      userRole: 'client',
      selectedClientIds: [],
    })

    await user.type(screen.getByLabelText('GÜNCEL KİLO (KG)'), '5')
    await user.click(screen.getByRole('button', { name: 'Formu Antrenörüme Gönder' }))

    expect(await screen.findByText('Kilo en az 20 kg olabilir.')).toBeInTheDocument()
    expect(submitFormCheck.mutateAsync).not.toHaveBeenCalled()
  })

  it('kilo geçerli ama fotoğraf seçilmemişse gönderim engellenir, uyarı gösterilir', async () => {
    const { submitFormCheck } = mockFormCheckHooks()
    const user = userEvent.setup()

    renderTab({
      targetId: undefined,
      currentUserId: CLIENT_ID,
      userRole: 'client',
      selectedClientIds: [],
    })

    await user.type(screen.getByLabelText('GÜNCEL KİLO (KG)'), '82.5')
    await user.click(screen.getByRole('button', { name: 'Formu Antrenörüme Gönder' }))

    expect(await screen.findByText('Lütfen bir podyum fotoğrafı seçin.')).toBeInTheDocument()
    expect(submitFormCheck.mutateAsync).not.toHaveBeenCalled()
  })

  it('geçersiz dosya seçilince toast.error + satır içi hata gösterir, poseFile ayarlanmaz', async () => {
    mockFormCheckHooks()
    vi.mocked(validateImageFile).mockResolvedValue({
      ok: false,
      code: 'CONTENT_MISMATCH',
      message: 'Dosyanın içeriği bildirilen türle uyuşmuyor.',
    })
    const user = userEvent.setup()

    renderTab({
      targetId: undefined,
      currentUserId: CLIENT_ID,
      userRole: 'client',
      selectedClientIds: [],
    })

    const fileInput = screen.getByLabelText('PODYUM FOTOĞRAFI')
    const badFile = new File(['x'], 'evil.png', { type: 'image/png' })
    await user.upload(fileInput, badFile)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Dosyanın içeriği bildirilen türle uyuşmuyor.')
    )
    expect(
      await screen.findByText('Dosyanın içeriği bildirilen türle uyuşmuyor.')
    ).toBeInTheDocument()
  })

  it('geçerli kilo + fotoğrafla gönderim submitFormCheck.mutateAsync DOĞRU payload ile çağrılır', async () => {
    const { submitFormCheck } = mockFormCheckHooks()
    const user = userEvent.setup()

    renderTab({
      targetId: undefined,
      currentUserId: CLIENT_ID,
      userRole: 'client',
      selectedClientIds: [],
    })

    const goodFile = new File(['x'], 'pose.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('PODYUM FOTOĞRAFI'), goodFile)
    await user.type(screen.getByLabelText('GÜNCEL KİLO (KG)'), '82.5')
    await user.click(screen.getByRole('button', { name: 'Formu Antrenörüme Gönder' }))

    await waitFor(() =>
      expect(submitFormCheck.mutateAsync).toHaveBeenCalledWith({
        clientId: CLIENT_ID,
        currentWeight: 82.5,
        frontFile: goodFile,
        notes: 'Yeni form',
      })
    )
  })
})

describe('FormCheckTab — rol bazlı form görünürlüğü', () => {
  it('koç rolünde gönderim formu HİÇ render edilmez', () => {
    mockFormCheckHooks()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.queryByLabelText('GÜNCEL KİLO (KG)')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Formu Antrenörüme Gönder' })
    ).not.toBeInTheDocument()
  })
})

describe('FormCheckTab — öncesi/sonrası kıyaslama', () => {
  it('2den az kayıtta kıyaslama butonu görünmez', () => {
    mockFormCheckHooks({ formChecks: { data: [formCheck()] } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.queryByRole('button', { name: 'Öncesi / Sonrası Yap' })).not.toBeInTheDocument()
  })

  it('>=2 kayıtta kıyaslama açılınca varsayılan seçim en eski/en yeni kayıttır', async () => {
    mockFormCheckHooks({
      formChecks: {
        data: [
          formCheck({ id: 'newest', current_weight: 80, created_at: '2026-08-15T09:00:00.000Z' }),
          formCheck({ id: 'oldest', current_weight: 85, created_at: '2026-08-01T09:00:00.000Z' }),
        ],
      },
    })
    const user = userEvent.setup()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: 'coach-1',
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    await user.click(screen.getByRole('button', { name: 'Öncesi / Sonrası Yap' }))

    const beforeSelect = screen.getByLabelText('Öncesi kaydını seç') as HTMLSelectElement
    const afterSelect = screen.getByLabelText('Sonrası kaydını seç') as HTMLSelectElement
    // Sorgu `created_at desc` döndüğü için dizinin SONUNCUSU (index 1) en eski
    // ("öncesi" varsayılanı), İLKİ (index 0) en yeni ("sonrası" varsayılanı).
    expect(beforeSelect.value).toBe('oldest')
    expect(afterSelect.value).toBe('newest')

    await user.click(screen.getByRole('button', { name: 'Kıyaslamayı Kapat' }))
    expect(screen.queryByLabelText('Öncesi kaydını seç')).not.toBeInTheDocument()
  })
})
