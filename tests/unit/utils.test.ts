import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { toast } from 'sonner'

import {
  cn,
  daysSince,
  downloadCSV,
  formatDateTimeTR,
  formatDateTR,
  formatTime,
  getMacroPercentage,
  getTodayName,
} from '@/lib/utils'

// jsdom'un Blob implementasyonu `.text()` ve `.arrayBuffer()` metotlarını sağlamıyor;
// bu yüzden Blob içeriğini FileReader üzerinden okuyoruz.
function readBlobAsBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Blob okunamadı'))
    reader.readAsArrayBuffer(blob)
  })
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Blob okunamadı'))
    reader.readAsText(blob, 'utf-8')
  })
}

describe('getMacroPercentage', () => {
  it('normal dağılımda yüzdelerin toplamı 100 olur', () => {
    const result = getMacroPercentage(30, 50, 20)
    expect(result.p + result.c + result.f).toBeCloseTo(100)
    expect(result.p).toBeCloseTo(30)
    expect(result.c).toBeCloseTo(50)
    expect(result.f).toBeCloseTo(20)
  })

  it('hepsi sıfırsa {p:0,c:0,f:0} döner', () => {
    expect(getMacroPercentage(0, 0, 0)).toEqual({ p: 0, c: 0, f: 0 })
  })

  it('string sayısal girdileri kabul eder', () => {
    const result = getMacroPercentage('30', '50', '20')
    expect(result.p).toBeCloseTo(30)
    expect(result.c).toBeCloseTo(50)
    expect(result.f).toBeCloseTo(20)
  })

  it('null/undefined/NaN girdileri 0 olarak sayılır', () => {
    const result = getMacroPercentage(null, undefined, NaN)
    expect(result).toEqual({ p: 0, c: 0, f: 0 })
  })

  it('tek makro dolu ise o makro %100 olur', () => {
    const result = getMacroPercentage(10, 0, 0)
    expect(result).toEqual({ p: 100, c: 0, f: 0 })
  })
})

describe('formatTime', () => {
  it('0 saniye "0:00" olur', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('9 saniye "0:09" olur (tek haneli saniye sıfırla doldurulur)', () => {
    expect(formatTime(9)).toBe('0:09')
  })

  it('60 saniye "1:00" olur', () => {
    expect(formatTime(60)).toBe('1:00')
  })

  it('90 saniye "1:30" olur', () => {
    expect(formatTime(90)).toBe('1:30')
  })

  it('125 saniye "2:05" olur', () => {
    expect(formatTime(125)).toBe('2:05')
  })

  it('3600 saniye "60:00" olur (saat formatına dönüştürülmez)', () => {
    expect(formatTime(3600)).toBe('60:00')
  })
})

describe('getTodayName', () => {
  // 2026-08-16 Pazar gününden başlayarak 7 ardışık günü doğrula.
  // UTC kaymasından kaçınmak için saat 12:00 (öğlen) verildi.
  const cases: [string, string][] = [
    ['2026-08-16T12:00:00', 'Pazar'],
    ['2026-08-17T12:00:00', 'Pazartesi'],
    ['2026-08-18T12:00:00', 'Salı'],
    ['2026-08-19T12:00:00', 'Çarşamba'],
    ['2026-08-20T12:00:00', 'Perşembe'],
    ['2026-08-21T12:00:00', 'Cuma'],
    ['2026-08-22T12:00:00', 'Cumartesi'],
  ]

  it.each(cases)('%s tarihi için doğru Türkçe gün adını döner (%s)', (iso, expected) => {
    expect(getTodayName(new Date(iso))).toBe(expected)
  })

  it('parametre verilmezse sistem tarihini kullanır', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00'))
    expect(getTodayName()).toBe('Pazartesi')
    vi.useRealTimers()
  })
})

describe('formatDateTR', () => {
  it('geçerli bir tarihte boş olmayan, gün/ay/yıl içeren bir metin döner', () => {
    const result = formatDateTR(new Date(2026, 7, 16))
    expect(result).not.toBe('')
    expect(result).toContain('2026')
    expect(result).toContain('16')
    expect(result).toContain('08')
  })

  it('geçersiz tarihte "-" döner', () => {
    expect(formatDateTR('not-a-date')).toBe('-')
  })
})

describe('formatDateTimeTR', () => {
  it('geçerli bir tarih+saatte boş olmayan, tarih ve saat bileşenleri içeren bir metin döner', () => {
    const result = formatDateTimeTR(new Date(2026, 7, 16, 14, 30))
    expect(result).not.toBe('')
    expect(result).toContain('2026')
    expect(result).toContain('14')
  })

  it('geçersiz tarihte "-" döner', () => {
    expect(formatDateTimeTR('not-a-date')).toBe('-')
  })
})

describe('daysSince', () => {
  // NOT: Görev tanımı "Math.ceil davranışına göre" test yazılmasını öngörüyordu,
  // ancak kaynak kodda `Math.floor(diffMs / 86_400_000)` kullanılıyor. Testler
  // gerçek (Math.floor) davranışına göre yazıldı.
  it('aynı zaman damgasında 0 döner (Math.floor davranışı)', () => {
    const now = new Date('2026-08-16T10:00:00')
    expect(daysSince(new Date('2026-08-16T10:00:00'), now)).toBe(0)
  })

  it('7 gün önceki bir tarih için 7 döner', () => {
    const now = new Date('2026-08-16T00:00:00')
    const value = new Date('2026-08-09T00:00:00')
    expect(daysSince(value, now)).toBe(7)
  })

  it('geçersiz tarihte 0 döner', () => {
    expect(daysSince('not-a-date')).toBe(0)
  })
})

describe('cn', () => {
  it('false/null/undefined değerlerini eler, kalanları boşlukla birleştirir', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c')
  })

  it('hiç geçerli sınıf yoksa boş string döner', () => {
    expect(cn(false, null, undefined)).toBe('')
  })
})

describe('downloadCSV', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('boş dizi verildiğinde indirme yapmaz ve hata toast’ı gösterir', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    downloadCSV([], 'dosya')
    expect(toast.error).toHaveBeenCalledWith('İndirilecek veri bulunamadı.')
    expect(createElementSpy).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('normal bir dizi verildiğinde BOM ile başlayan Blob oluşturur ve dosya.csv olarak indirir', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    downloadCSV([{ a: 1, b: 2 }], 'dosya')

    expect(createElementSpy).toHaveBeenCalledWith('a')
    const anchor = createElementSpy.mock.results[0]?.value as HTMLAnchorElement
    expect(anchor.getAttribute('download')).toBe('dosya.csv')

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob

    // NOT: Blob.text() UTF-8 TextDecoder'ın varsayılan davranışı gereği baştaki BOM'u
    // sessizce kırpabilir; bu yüzden BOM'un fiilen yazıldığını ham baytlar üzerinden
    // (EF BB BF) doğruluyoruz, decode edilmiş metin üzerinden değil.
    const bytes = await readBlobAsBytes(blob)
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])

    const text = await readBlobAsText(blob)
    expect(text).toContain('a,b')

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('isText=true verildiğinde metin dalı çalışır ve tırnaklanmış tek hücre üretir', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    downloadCSV('Program içeriği', 'program-detayi', true)

    const anchor = createElementSpy.mock.results[0]?.value as HTMLAnchorElement
    expect(anchor.getAttribute('download')).toBe('program-detayi.csv')

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob
    const text = await readBlobAsText(blob)
    expect(text).toContain('Program Detayı')
    expect(text).toContain('"Program içeriği"')
  })
})
