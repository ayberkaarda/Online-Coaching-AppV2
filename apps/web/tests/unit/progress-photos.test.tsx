// Faz 4d — açı etiketli ilerleme fotoğrafları + önce/sonra karşılaştırma
// (packages/api-client/src/hooks/useProgressPhotos.ts, src/components/progress/ProgressPhotos.tsx,
// src/components/progress/BeforeAfterSlider.tsx).
//
// Kapsam (bkz. görev talimatı "TESTLER"):
//   1) Geçersiz dosya (magic byte uyuşmazlığı) reddediliyor.
//   2) Yol sözleşmesi DB CHECK'ine (`progress_photos_path_chk`) uygun kuruluyor.
//   3) `readOnly` iken yükleme/silme arayüzü render EDİLMİYOR.
//   4) Slider konumu state'ten geliyor; `prefers-reduced-motion` altında da
//      DOĞRU konumu gösteriyor (kritik regresyon — AC-1.6.7/LoopRing sınıfı hata).
//   5) Boş durum ve tek-fotoğraf durumu.
//   6) Aynı gün/açı için birden fazla fotoğrafta `created_at desc` seçimi.

import { createElement } from 'react'
import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 4.5 commit 5 (ADR-0024): Supabase istemcisi artık modül singleton'ı DEĞİL — hook'lar
// onu `<SupabaseClientProvider>`'dan alıyor. Bu yüzden `vi.mock('@/lib/supabase/client', ...)`
// KALKTI; sahte istemci sıradan bir nesne olarak kurulup sarmalayıcıyla enjekte ediliyor.
const fromMock = vi.fn()
const uploadMock = vi.fn()

// `importOriginal` spread'i ZORUNLU: `apps/web/src/lib/logger.ts` (ErrorBoundary üzerinden
// bileşen ağacına giriyor) bu paketten `createConsoleLogger`/`maskForConsole`/`REDACT_PATHS`
// import ediyor — yalnızca `logger` döndüren bir mock o modülü yüklenemez hâle getirirdi.
vi.mock('@repo/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@repo/logger')>()),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// `createSignedUrls`/`removeStoredObject` gerçek storage isteği atmaz — testin kendisi
// hangi yolların imzalandığını ve dönen adresleri kontrol eder.
const createSignedUrlsMock = vi.fn()
const removeStoredObjectMock = vi.fn()
vi.mock('@repo/api-client/storage', () => ({
  PROGRESS_PHOTOS_BUCKET: 'progress-photos',
  SIGNED_URL_STALE_TIME_MS: 1_800_000,
  createSignedUrls: (...args: unknown[]) => createSignedUrlsMock(...args),
  removeStoredObject: (...args: unknown[]) => removeStoredObjectMock(...args),
}))

// Yükleme doğrulaması ('@repo/api-client/upload-validation') KASITLI OLARAK mock'lanmaz — bu dosyanın
// asıl testi budur: gerçek magic-byte kontrolü reddediyor mu?

import { ProgressPhotos } from '@/components/progress/ProgressPhotos'
import { BeforeAfterSlider } from '@/components/progress/BeforeAfterSlider'
import { SupabaseClientProvider } from '@repo/api-client/context'
import {
  useDeleteProgressPhoto,
  useProgressPhotos,
  useUploadProgressPhoto,
} from '@repo/api-client/hooks/useProgressPhotos'

import { asSupabaseClient } from './test-utils'

const supabase = asSupabaseClient({
  from: fromMock,
  storage: { from: vi.fn(() => ({ upload: uploadMock })) },
})

const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// `progress_photos_path_chk` ile BİREBİR aynı desen (bkz. migration §3).
const PATH_CHK_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,10}$/

const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(16).fill(0),
])
const HTML_BYTES = new TextEncoder().encode('<html><body>evil</body></html>')

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      SupabaseClientProvider,
      { client: supabase },
      createElement(QueryClientProvider, { client: queryClient }, children)
    )
  }
}

interface MockPhotoRow {
  id: string
  client_id: string
  taken_on: string
  angle: 'front' | 'side' | 'back'
  photo_path: string
  created_at: string
}

function wireSelectChain(rows: MockPhotoRow[]) {
  const orderMock2 = vi.fn().mockResolvedValue({ data: rows, error: null })
  const orderMock1 = vi.fn(() => ({ order: orderMock2 }))
  const eqMock = vi.fn(() => ({ order: orderMock1 }))
  const selectMock = vi.fn(() => ({ eq: eqMock }))
  return { selectMock, eqMock, orderMock1, orderMock2 }
}

beforeEach(() => {
  vi.clearAllMocks()
  createSignedUrlsMock.mockResolvedValue(new Map())
  removeStoredObjectMock.mockResolvedValue(true)
})

// ---------------------------------------------------------------------------
// 1) Geçersiz dosya (magic byte uyuşmazlığı) reddediliyor
// ---------------------------------------------------------------------------
describe('useUploadProgressPhoto — geçersiz dosya reddi', () => {
  it('içerik/tür uyuşmazlığında (CONTENT_MISMATCH) storage.upload / insert HİÇ ÇAĞRILMAZ', async () => {
    fromMock.mockImplementation((table: string) => {
      throw new Error(`beklenmeyen tablo çağrısı: ${table}`)
    })

    const { result } = renderHook(() => useUploadProgressPhoto(), { wrapper: createWrapper() })
    // 'image/png' etiketli ama gerçekte HTML gövdeli dosya -> gerçek magic-byte
    // kontrolü (mock'lanmadı) bunu CONTENT_MISMATCH ile reddeder.
    const badFile = makeFile(HTML_BYTES, 'evil.png', 'image/png')

    result.current.mutate({
      clientId: CLIENT_ID,
      angle: 'front',
      file: badFile,
      takenOn: '2026-08-17',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(uploadMock).not.toHaveBeenCalled()
    expect(fromMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 2) Yol sözleşmesi DB CHECK'ine (`progress_photos_path_chk`) uygun kuruluyor
// ---------------------------------------------------------------------------
describe('useUploadProgressPhoto — yol sözleşmesi', () => {
  it('yol tam olarak <client_id>/<uuid>.<ext> biçimindedir ve klasör client_id ile EŞİTTİR', async () => {
    uploadMock.mockResolvedValue({ error: null })
    const insertedRow: MockPhotoRow = {
      id: 'photo-1',
      client_id: CLIENT_ID,
      taken_on: '2026-08-17',
      angle: 'front',
      photo_path: 'placeholder', // aşağıda gerçek çağrıdan okunacak
      created_at: '2026-08-17T08:00:00.000Z',
    }
    const singleMock = vi.fn(() => Promise.resolve({ data: insertedRow, error: null }))
    const selectMock = vi.fn(() => ({ single: singleMock }))
    const insertMock = vi.fn((_payload: Record<string, unknown>) => ({ select: selectMock }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'progress_photos') return { insert: insertMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })

    const { result } = renderHook(() => useUploadProgressPhoto(), { wrapper: createWrapper() })
    const file = makeFile(PNG_BYTES, 'photo.png', 'image/png')

    result.current.mutate({ clientId: CLIENT_ID, angle: 'side', file, takenOn: '2026-08-17' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Storage'a giden yol DB CHECK'inin BEKLEDİĞİ desene uyuyor: tek seviye
    // klasör (kanonik UUID) + '/' + kanonik UUID + '.' + uzantı — VE klasör
    // satırın client_id'sine EŞİT (aksi hâlde gerçek DB'de 23514 alınırdı).
    const uploadedPath = uploadMock.mock.calls[0]?.[0] as string
    expect(uploadedPath).toMatch(PATH_CHK_RE)
    expect(uploadedPath.split('/')[0]).toBe(CLIENT_ID)
    expect(uploadMock).toHaveBeenCalledWith(uploadedPath, file, { contentType: 'image/png' })

    // Uzantı dosya ADINDAN değil, gerçek magic-byte tespitinden geldi (A-21):
    // dosya adı 'photo.png' ama biz PNG bayt verdik, ikisi tutarlı; asıl kanıt
    // extension'ın MIME_EXTENSION haritasından ('png') geldiğidir.
    expect(uploadedPath.endsWith('.png')).toBe(true)

    // Tabloya YAZILAN photo_path, storage'a YÜKLENEN yolla BİREBİR AYNI olmalı
    // — aksi hâlde satır ile dosya farklı nesnelere işaret eder.
    const insertPayload = insertMock.mock.calls[0]?.[0] as Record<string, unknown>
    // `taken_on` payload'da DAİMA vardır (alan zorunlu): DB'nin UTC
    // `current_date` varsayılanına düşülmez — bkz.
    // tests/unit/local-date-consistency.test.ts.
    expect(insertPayload).toEqual({
      client_id: CLIENT_ID,
      angle: 'side',
      photo_path: uploadedPath,
      taken_on: '2026-08-17',
    })
    expect(UUID_RE.test(uploadedPath.split('/')[1]?.split('.')[0] ?? '')).toBe(true)
  })
})

describe('useDeleteProgressPhoto — satır + best-effort dosya temizliği', () => {
  it('önce tablo satırını siler, ardından bucket nesnesini best-effort temizler', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const deleteMock = vi.fn(() => ({ eq: eqMock }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'progress_photos') return { delete: deleteMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })
    const photoPath = `${CLIENT_ID}/11111111-1111-4111-8111-111111111111.png`

    const { result } = renderHook(() => useDeleteProgressPhoto(), { wrapper: createWrapper() })
    result.current.mutate({ photoId: 'photo-1', clientId: CLIENT_ID, photoPath })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqMock).toHaveBeenCalledWith('id', 'photo-1')
    expect(removeStoredObjectMock).toHaveBeenCalledWith(supabase, 'progress-photos', photoPath)
  })
})

// ---------------------------------------------------------------------------
// 6) Aynı gün/açı için birden fazla fotoğrafta `created_at desc` seçimi
// ---------------------------------------------------------------------------
describe('useProgressPhotos — sıralama sözleşmesi', () => {
  it('sorgu taken_on desc SONRA created_at desc ile sıralanır (belirsizlikte en yeni satır seçilsin diye)', async () => {
    const { selectMock, eqMock, orderMock1, orderMock2 } = wireSelectChain([])
    fromMock.mockImplementation((table: string) => {
      if (table === 'progress_photos') return { select: selectMock }
      throw new Error(`beklenmeyen tablo: ${table}`)
    })

    const { result } = renderHook(() => useProgressPhotos(CLIENT_ID), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(selectMock).toHaveBeenCalledWith('*')
    expect(eqMock).toHaveBeenCalledWith('client_id', CLIENT_ID)
    expect(orderMock1).toHaveBeenCalledWith('taken_on', { ascending: false })
    expect(orderMock2).toHaveBeenCalledWith('created_at', { ascending: false })
  })
})

// ---------------------------------------------------------------------------
// Component-level: readOnly, boş durum, tek-fotoğraf durumu, created_at desc
// tüketimi (galeri + karşılaştırma varsayılanları)
// ---------------------------------------------------------------------------

function rowsFor(angle: 'front' | 'side' | 'back'): MockPhotoRow[] {
  return [
    // EN YENİ (aynı gün, daha yeni created_at) — listenin BAŞINDA olmalı.
    {
      id: 'newest-same-day',
      client_id: CLIENT_ID,
      taken_on: '2026-08-17',
      angle,
      photo_path: `${CLIENT_ID}/11111111-1111-4111-8111-111111111111.png`,
      created_at: '2026-08-17T18:00:00.000Z',
    },
    // Aynı GÜN, ama daha ESKİ created_at — ikinci sırada (created_at desc tuzağı).
    {
      id: 'older-same-day',
      client_id: CLIENT_ID,
      taken_on: '2026-08-17',
      angle,
      photo_path: `${CLIENT_ID}/22222222-2222-4222-8222-222222222222.png`,
      created_at: '2026-08-17T08:00:00.000Z',
    },
    // Daha ESKİ bir gün — en sonda (öncesi/sonrası'nın "öncesi" varsayılanı).
    {
      id: 'oldest-day',
      client_id: CLIENT_ID,
      taken_on: '2026-08-01',
      angle,
      photo_path: `${CLIENT_ID}/33333333-3333-4333-8333-333333333333.png`,
      created_at: '2026-08-01T08:00:00.000Z',
    },
  ]
}

function wireProgressPhotosQuery(rows: MockPhotoRow[]) {
  const { selectMock } = wireSelectChain(rows)
  fromMock.mockImplementation((table: string) => {
    if (table === 'progress_photos') return { select: selectMock }
    throw new Error(`beklenmeyen tablo: ${table}`)
  })
  createSignedUrlsMock.mockResolvedValue(
    new Map(rows.map((row) => [row.photo_path, `https://signed/${row.id}`]))
  )
}

function renderProgressPhotos(props: { readOnly: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    createElement(
      SupabaseClientProvider,
      { client: supabase },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ProgressPhotos, { clientId: CLIENT_ID, readOnly: props.readOnly })
      )
    )
  )
}

describe('ProgressPhotos — boş durum', () => {
  it('hiç fotoğraf yokken anlamlı Türkçe boş durum mesajı gösterir', async () => {
    wireProgressPhotosQuery([])
    renderProgressPhotos({ readOnly: false })

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Henüz ilerleme fotoğrafı yok.')
    )
  })
})

describe('ProgressPhotos — tek fotoğraf durumu', () => {
  it('bir açıda tek fotoğraf varken karşılaştırma "en az 2 fotoğraf gerekli" der', async () => {
    wireProgressPhotosQuery([rowsFor('front')[0] as MockPhotoRow])
    renderProgressPhotos({ readOnly: false })

    await waitFor(() =>
      expect(
        screen.getByText(/Ön açısında karşılaştırma için en az 2 fotoğraf gerekli\./)
      ).toBeInTheDocument()
    )
  })
})

describe('ProgressPhotos — readOnly (koç görünümü, RLS gerçeği)', () => {
  it('readOnly=true iken yükleme formu ve silme butonları HİÇ render edilmez', async () => {
    wireProgressPhotosQuery(rowsFor('front'))
    renderProgressPhotos({ readOnly: true })

    await waitFor(() => expect(screen.getAllByRole('group').length).toBeGreaterThan(0))

    // Yükleme arayüzü: dosya input'u yok.
    expect(screen.queryByLabelText('FOTOĞRAF')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fotoğrafı Yükle/ })).not.toBeInTheDocument()
    // Silme arayüzü: hiçbir "sil" butonu yok.
    expect(screen.queryByRole('button', { name: /sil/i })).not.toBeInTheDocument()
  })

  it('readOnly=false iken yükleme formu ve silme butonları GÖRÜNÜR', async () => {
    wireProgressPhotosQuery(rowsFor('front'))
    renderProgressPhotos({ readOnly: false })

    await waitFor(() => expect(screen.getAllByRole('group').length).toBeGreaterThan(0))

    expect(screen.getByLabelText('FOTOĞRAF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fotoğrafı Yükle/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /sil$/i }).length).toBeGreaterThan(0)
  })
})

describe('ProgressPhotos — created_at desc seçimi (aynı gün/açı çoklu çekim)', () => {
  it('"Sonrası" varsayılanı aynı GÜNÜN en YENİ created_at satırıdır, "Öncesi" en eski günün satırıdır', async () => {
    wireProgressPhotosQuery(rowsFor('front'))
    renderProgressPhotos({ readOnly: false })

    await waitFor(() => expect(screen.getByLabelText('SONRASI')).toBeInTheDocument())

    const afterSelect = screen.getByLabelText('SONRASI') as HTMLSelectElement
    const beforeSelect = screen.getByLabelText('ÖNCESİ') as HTMLSelectElement

    // Aynı gün (2026-08-17) için İKİ satır var; varsayılan "sonrası" bunların
    // EN YENİ created_at'lısı olmalı (migration yorumu: "belirsizlikte en yeni
    // satırı seçer"), eski aynı-gün satırı DEĞİL.
    expect(afterSelect.value).toBe('newest-same-day')
    // "Öncesi" varsayılanı en eski günün (2026-08-01) tek satırıdır.
    expect(beforeSelect.value).toBe('oldest-day')

    // Seçim listesindeki sıra da sorgunun döndürdüğü sırayı yansıtır: en yeni
    // ilk, aynı-gün-eski ikinci, en eski gün son.
    const optionIds = within(afterSelect)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
    expect(optionIds).toEqual(['newest-same-day', 'older-same-day', 'oldest-day'])
  })
})

// ---------------------------------------------------------------------------
// 4) BeforeAfterSlider — konum state'tendir, reduced-motion altında bilgi kaybı YOK
// ---------------------------------------------------------------------------

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const originalMatchMedia = window.matchMedia

function setReducedMotion(enabled: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === REDUCED_MOTION_QUERY ? enabled : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('BeforeAfterSlider — dolgu STATE kaynaklıdır, animasyon kaynaklı DEĞİL', () => {
  it('başlangıç konumu %50, clip-path doğrudan bu değerden hesaplanır', () => {
    const { getByTestId } = render(
      createElement(BeforeAfterSlider, {
        beforeUrl: 'https://signed/before.jpg',
        beforeAlt: 'Öncesi',
        afterUrl: 'https://signed/after.jpg',
        afterAlt: 'Sonrası',
      })
    )

    const clip = getByTestId('progress-photo-after-clip')
    expect(clip.getAttribute('style')).toContain('clip-path: inset(0 50% 0 0)')
  })

  it('kaydırıcı hareket ettirilince clip-path DOĞRUDAN state değerine göre güncellenir', () => {
    const { getByTestId } = render(
      createElement(BeforeAfterSlider, {
        beforeUrl: 'https://signed/before.jpg',
        beforeAlt: 'Öncesi',
        afterUrl: 'https://signed/after.jpg',
        afterAlt: 'Sonrası',
      })
    )

    const slider = getByTestId('progress-photo-slider')
    fireEvent.change(slider, { target: { value: '80' } })

    const clip = getByTestId('progress-photo-after-clip')
    // value=80 -> clip-path inset(0 20% 0 0) -> "sonrası" %80 görünür.
    expect(clip.getAttribute('style')).toContain('clip-path: inset(0 20% 0 0)')
  })

  it('hiçbir yerde CSS animasyonu/geçişi kullanılmaz (global reduced-motion kuralı donduramaz)', () => {
    setReducedMotion(true)
    const { container } = render(
      createElement(BeforeAfterSlider, {
        beforeUrl: 'https://signed/before.jpg',
        beforeAlt: 'Öncesi',
        afterUrl: 'https://signed/after.jpg',
        afterAlt: 'Sonrası',
      })
    )

    for (const element of container.querySelectorAll('*')) {
      expect(element.getAttribute('class') ?? '').not.toMatch(/\b(animate|transition)-/)
    }
  })

  it('AC-1.6.7 sınıfı regresyon: prefers-reduced-motion AÇIKKEN de kaydırıcı hareketi DOĞRU konumu üretir', () => {
    setReducedMotion(true)
    const { getByTestId } = render(
      createElement(BeforeAfterSlider, {
        beforeUrl: 'https://signed/before.jpg',
        beforeAlt: 'Öncesi',
        afterUrl: 'https://signed/after.jpg',
        afterAlt: 'Sonrası',
      })
    )

    const slider = getByTestId('progress-photo-slider')
    fireEvent.change(slider, { target: { value: '25' } })

    const clip = getByTestId('progress-photo-after-clip')
    // Konum reduced-motion'dan TAMAMEN bağımsız: aynı değer, aynı clip-path.
    // globals.css'teki `animation-duration: 0.01ms !important` kuralının
    // dondurabileceği hiçbir animasyon/geçiş burada YOK.
    expect(clip.getAttribute('style')).toContain('clip-path: inset(0 75% 0 0)')
  })

  it('kaydırıcı klavyeyle kullanılabilir: <input type="range"> + Türkçe aria-label', () => {
    render(
      createElement(BeforeAfterSlider, {
        beforeUrl: 'https://signed/before.jpg',
        beforeAlt: 'Öncesi',
        afterUrl: 'https://signed/after.jpg',
        afterAlt: 'Sonrası',
      })
    )

    const slider = screen.getByRole('slider', {
      name: 'Öncesi ve sonrası fotoğrafları karşılaştırma kaydırıcısı',
    })
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '100')
  })
})
