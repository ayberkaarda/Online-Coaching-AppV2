// Borç B-046: `MessagesTab` (koç <-> danışan birebir sohbet) 0 kapsamdaydı.
// Bu dosya bileşeni `@repo/api-client`'ın barrel'ini TAMAMEN mock'layarak (nutrition-logs.test.ts
// Bölüm C ile AYNI desen) render eder — gerçek Supabase/realtime çağrısı YAPILMAZ, yalnızca
// bileşenin sunum + etkileşim mantığı doğrulanır (veri katmanı zaten kendi hook testlerinde
// kapsanıyor, bkz. tests/unit/message-conversation.test.ts, message-attachment.test.ts).
//
// KAPSAM:
//   1) Koç birden fazla/sıfır danışan seçtiğinde sohbet yerine uyarı gösterilir.
//   2) Boş durum ("Henüz mesaj yok").
//   3) Mesaj listesi: kendi/karşı balonu, sistem mesajı, iletildi/görüldü ikonları.
//   4) Yükleniyor / hata (+ "Tekrar Dene" -> refetch) durumları.
//   5) Mesaj gönderme: metin submit edilince `sendMessage.mutate` DOĞRU payload'la çağrılır,
//      input temizlenir; boş metin gönderilemez (buton disabled).
//   6) Sohbet partneri belirlenemediğinde (`useCoachId` null) gönderim toast hatası verir.
//   7) Ek dosya seçimi: geçersiz dosya `toast.error` ile reddedilir; geçerli dosya önizleme gösterir.
//   8) Çevrimiçi/çevrimdışı göstergesi ve okunmamış rozet.

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
    useCoachId: vi.fn(),
    useMarkConversationRead: vi.fn(),
    useMessageAttachmentDownloadUrl: vi.fn(),
    useMessageAttachmentUrl: vi.fn(),
    useMessages: vi.fn(),
    usePresence: vi.fn(),
    useSendMessage: vi.fn(),
    useUnreadCount: vi.fn(),
  }
})

vi.mock('@repo/api-client/upload-validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client/upload-validation')>()
  return {
    ...actual,
    assertValidImageFile: vi.fn(),
  }
})

import MessagesTab from '@/components/tabs/MessagesTab'
import {
  useCoachId,
  useMarkConversationRead,
  useMessageAttachmentDownloadUrl,
  useMessageAttachmentUrl,
  useMessages,
  usePresence,
  useSendMessage,
  useUnreadCount,
} from '@repo/api-client'
import { assertValidImageFile, UploadValidationError } from '@repo/api-client/upload-validation'
import { toast } from 'sonner'
import type { Message } from '@repo/types'

const COACH_ID = 'coach-11111111-1111-4111-8111-111111111111'
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
    mutateAsync: vi.fn(),
    isPending: false,
    ...overrides,
  }
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    client_id: CLIENT_ID,
    sender_id: CLIENT_ID,
    receiver_id: COACH_ID,
    message: 'Merhaba koç!',
    kind: 'user',
    is_read: false,
    read_at: null,
    attachment_path: null,
    created_at: '2026-08-17T10:00:00.000Z',
    ...overrides,
  }
}

/** MessagesTab'in bağımlı olduğu 7 hook'u makul varsayılanlarla mock'lar. */
function mockMessagesHooks(
  overrides: {
    coachId?: Record<string, unknown>
    messages?: Record<string, unknown>
    unreadCount?: Record<string, unknown>
    isOnline?: (userId: string) => boolean
  } = {}
) {
  vi.mocked(useCoachId).mockReturnValue(
    mockQuery({ data: COACH_ID, ...overrides.coachId }) as unknown as ReturnType<typeof useCoachId>
  )
  vi.mocked(useMarkConversationRead).mockReturnValue(
    mockMutation() as unknown as ReturnType<typeof useMarkConversationRead>
  )
  vi.mocked(useMessageAttachmentUrl).mockReturnValue(
    mockQuery({ data: undefined }) as unknown as ReturnType<typeof useMessageAttachmentUrl>
  )
  // B-008: indirme adresi GÖSTERİM adresinden AYRI bir hook'tan gelir; varsayılan
  // olarak boştur (görsel görünmeden ikinci imza istenmez).
  vi.mocked(useMessageAttachmentDownloadUrl).mockReturnValue(
    mockQuery({ data: undefined }) as unknown as ReturnType<typeof useMessageAttachmentDownloadUrl>
  )
  vi.mocked(useMessages).mockReturnValue(
    mockQuery({ data: [], ...overrides.messages }) as unknown as ReturnType<typeof useMessages>
  )
  vi.mocked(usePresence).mockReturnValue({
    isOnline: overrides.isOnline ?? (() => false),
  } as unknown as ReturnType<typeof usePresence>)
  const sendMessage = mockMutation()
  vi.mocked(useSendMessage).mockReturnValue(
    sendMessage as unknown as ReturnType<typeof useSendMessage>
  )
  vi.mocked(useUnreadCount).mockReturnValue(
    mockQuery({ data: 0, ...overrides.unreadCount }) as unknown as ReturnType<typeof useUnreadCount>
  )
  return { sendMessage }
}

function renderTab(props: {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: 'coach' | 'client' | null
  selectedClientIds: string[]
}) {
  return render(<MessagesTab {...props} />)
}

// jsdom `scrollIntoView`'ü uygulamıyor; bileşen mesaj listesi her değiştiğinde
// (100ms gecikmeli) çağırıyor — testler arasında hâlâ bekleyen bir zamanlayıcı
// varsa gerçek DOM elemanında bu metot olmadığından fırlar (bkz. ilk çalıştırmadaki
// "Uncaught Exception" — bileşen kaynağının hatası DEĞİL, salt jsdom eksikliği).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MessagesTab — koç danışan seçimi', () => {
  it('koç sıfır veya birden fazla danışan seçtiğinde sohbet yerine uyarı gösterir, hook hiç sorgulanmaz', () => {
    mockMessagesHooks()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID, 'client-3'],
    })

    expect(
      screen.getByText('Sohbet etmek için sadece 1 danışan seçili bırakın.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
  })
})

describe('MessagesTab — boş durum', () => {
  it('hiç mesaj yokken "Henüz mesaj yok" metnini gösterir', () => {
    mockMessagesHooks({ messages: { data: [] } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Henüz mesaj yok. İlk mesajı gönder!')).toBeInTheDocument()
  })
})

describe('MessagesTab — mesaj listesi', () => {
  it('kendi mesajı sağda, karşı taraf mesajı solda görünür; iletildi/görüldü ikonları doğru', () => {
    mockMessagesHooks({
      messages: {
        data: [
          message({ id: 'm1', sender_id: COACH_ID, receiver_id: CLIENT_ID, message: 'Selam!' }),
          message({
            id: 'm2',
            sender_id: COACH_ID,
            receiver_id: CLIENT_ID,
            message: 'Görüldü mü acaba',
            read_at: '2026-08-17T10:05:00.000Z',
          }),
        ],
      },
    })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Selam!')).toBeInTheDocument()
    // read_at yokken "İletildi" (tek tik), varken "Görüldü" (çift tik) — sr-only metinle ayırt edilir.
    expect(screen.getByText('İletildi')).toBeInTheDocument()
    expect(screen.getByText('Görüldü')).toBeInTheDocument()
  })

  it('sistem mesajı balon değil, ortalanmış bilgi rozeti olarak render edilir', () => {
    mockMessagesHooks({
      messages: {
        data: [message({ id: 'sys-1', kind: 'system', message: 'Form check incelendi.' })],
      },
    })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Form check incelendi.')).toBeInTheDocument()
  })

  it('ek fotoğrafı olan mesaj imzalı adresle görseli gösterir', async () => {
    mockMessagesHooks({
      messages: {
        data: [
          message({
            id: 'm-att',
            sender_id: CLIENT_ID,
            receiver_id: COACH_ID,
            attachment_path: 'convo/1-abc.png',
          }),
        ],
      },
    })
    // mockMessagesHooks varsayılan olarak useMessageAttachmentUrl'yi `data: undefined` ile
    // ayarlar — bu testin asıl senaryosu için ÇAĞRIDAN SONRA gerçek adresle ezilir.
    vi.mocked(useMessageAttachmentUrl).mockReturnValue(
      mockQuery({ data: 'https://signed/photo.jpg', isLoading: false }) as unknown as ReturnType<
        typeof useMessageAttachmentUrl
      >
    )

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const image = await screen.findByAltText('Karşı taraf tarafından gönderilen fotoğraf')
    expect(image).toHaveAttribute('src', 'https://signed/photo.jpg')
  })

  it('B-008: indirme bağlantısı GÖSTERİM adresini DEĞİL, `download` içeren adresi kullanır', async () => {
    mockMessagesHooks({
      messages: {
        data: [
          message({
            id: 'm-att-dl',
            sender_id: CLIENT_ID,
            receiver_id: COACH_ID,
            attachment_path: 'convo/1-abc.png',
          }),
        ],
      },
    })
    vi.mocked(useMessageAttachmentUrl).mockReturnValue(
      mockQuery({ data: 'https://signed/photo.jpg', isLoading: false }) as unknown as ReturnType<
        typeof useMessageAttachmentUrl
      >
    )
    vi.mocked(useMessageAttachmentDownloadUrl).mockReturnValue(
      mockQuery({
        data: 'https://signed/photo.jpg?download=photo.png',
        isLoading: false,
      }) as unknown as ReturnType<typeof useMessageAttachmentDownloadUrl>
    )

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    // `<img>` INLINE adresi korur (kırılmaması gereken yol)...
    const image = await screen.findByAltText('Karşı taraf tarafından gönderilen fotoğraf')
    expect(image).toHaveAttribute('src', 'https://signed/photo.jpg')

    // ...bağlantı ise `download` parametreli adrese gider (Content-Disposition: attachment).
    const link = screen.getByRole('link', { name: 'İndir' })
    expect(link).toHaveAttribute('href', 'https://signed/photo.jpg?download=photo.png')
  })
})

describe('MessagesTab — yükleniyor / hata durumları', () => {
  it('yükleniyorken iskelet gösterilir, mesaj listesi render edilmez', () => {
    mockMessagesHooks({ messages: { isLoading: true } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    // Sayfada çevrimiçi göstergesinin de `role="status"` bir sarmalayıcısı var; iskeleti
    // kendine özgü "Yükleniyor…" sr-only etiketiyle ayırt ediyoruz.
    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument()
    expect(screen.queryByText('Henüz mesaj yok. İlk mesajı gönder!')).not.toBeInTheDocument()
  })

  it('hata durumunda uyarı gösterilir ve "Tekrar Dene" refetch çağırır', async () => {
    const refetch = vi.fn()
    mockMessagesHooks({ messages: { isError: true, error: new Error('ağ hatası'), refetch } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(alert).getByRole('button', { name: 'Tekrar Dene' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('MessagesTab — mesaj gönderme', () => {
  it('boş metinle "Gönder" butonu devre dışıdır', () => {
    mockMessagesHooks()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByRole('button', { name: 'Gönder' })).toBeDisabled()
  })

  it('metin girilip gönderilince sendMessage.mutate DOĞRU payload ile çağrılır ve input temizlenir', async () => {
    const { sendMessage } = mockMessagesHooks()
    const user = userEvent.setup()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const input = screen.getByLabelText('Mesajınız')
    await user.type(input, 'Bugün nasıl geçti?')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    expect(sendMessage.mutate).toHaveBeenCalledWith({
      senderId: COACH_ID,
      receiverId: CLIENT_ID,
      message: 'Bugün nasıl geçti?',
      clientId: CLIENT_ID,
      file: undefined,
    })
    expect(input).toHaveValue('')
  })

  it('sohbet partneri belirlenemezse (koç kimliği bulunamadı) gönderim toast hatası verir, mutate ÇAĞRILMAZ', async () => {
    const { sendMessage } = mockMessagesHooks({ coachId: { data: null } })
    const user = userEvent.setup()

    renderTab({
      targetId: undefined,
      currentUserId: CLIENT_ID,
      userRole: 'client',
      selectedClientIds: [],
    })

    const input = screen.getByLabelText('Mesajınız')
    await user.type(input, 'Kimse yok mu?')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    expect(toast.error).toHaveBeenCalledWith('Sohbet edilecek kişi bulunamadı.')
    expect(sendMessage.mutate).not.toHaveBeenCalled()
  })
})

describe('MessagesTab — fotoğraf eki seçimi', () => {
  it('geçersiz dosya seçilince toast.error UploadValidationError mesajını gösterir, önizleme oluşmaz', async () => {
    mockMessagesHooks()
    vi.mocked(assertValidImageFile).mockRejectedValue(
      new UploadValidationError('CONTENT_MISMATCH', 'Dosya içeriği türüyle uyuşmuyor.')
    )
    const user = userEvent.setup()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const fileInput = screen.getByLabelText('Fotoğraf ekle', { selector: 'input' })
    const badFile = new File(['x'], 'evil.png', { type: 'image/png' })
    await user.upload(fileInput, badFile)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Dosya içeriği türüyle uyuşmuyor.')
    )
    expect(screen.queryByAltText('Gönderilecek fotoğraf önizlemesi')).not.toBeInTheDocument()
  })

  it('geçerli dosya seçilince önizleme gösterilir ve gönderimde file alanı doldurulur', async () => {
    const { sendMessage } = mockMessagesHooks()
    vi.mocked(assertValidImageFile).mockResolvedValue({ mime: 'image/png', extension: 'png' })
    const user = userEvent.setup()

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    const fileInput = screen.getByLabelText('Fotoğraf ekle', { selector: 'input' })
    const goodFile = new File(['x'], 'ok.png', { type: 'image/png' })
    await user.upload(fileInput, goodFile)

    expect(await screen.findByAltText('Gönderilecek fotoğraf önizlemesi')).toBeInTheDocument()

    const input = screen.getByLabelText('Mesajınız')
    await user.type(input, 'İşte fotoğraf')
    await user.click(screen.getByRole('button', { name: 'Gönder' }))

    expect(sendMessage.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'İşte fotoğraf', file: goodFile })
    )
  })
})

describe('MessagesTab — çevrimiçi göstergesi ve okunmamış rozet', () => {
  it('karşı taraf çevrimiçiyken "Çevrimiçi" yazar', () => {
    mockMessagesHooks({ isOnline: () => true })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Çevrimiçi')).toBeInTheDocument()
  })

  it('karşı taraf çevrimdışıyken "Çevrimdışı" yazar', () => {
    mockMessagesHooks({ isOnline: () => false })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByText('Çevrimdışı')).toBeInTheDocument()
  })

  it('okunmamış mesaj sayısı > 0 iken rozet gösterilir', () => {
    mockMessagesHooks({ unreadCount: { data: 3 } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.getByRole('status', { name: '3 okunmamış mesaj' })).toHaveTextContent('3')
  })

  it('okunmamış mesaj yokken rozet render EDİLMEZ', () => {
    mockMessagesHooks({ unreadCount: { data: 0 } })

    renderTab({
      targetId: CLIENT_ID,
      currentUserId: COACH_ID,
      userRole: 'coach',
      selectedClientIds: [CLIENT_ID],
    })

    expect(screen.queryByText(/okunmamış mesaj/)).not.toBeInTheDocument()
  })
})
