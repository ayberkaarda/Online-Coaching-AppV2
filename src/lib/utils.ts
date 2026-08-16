// Genel amaçlı yardımcılar (eski src/lib/helpers.js'in tiplenmiş hâli).
// Davranış birebir korunmuştur; tek fark: alert() yerine toast, SSR'da sessiz çıkış.

import { toast } from 'sonner'

import { DAY_NAMES, type DayName } from '@/types/domain'

/** Geriye dönük uyumluluk için eski `DAYS` adı (içerik DAY_NAMES ile aynı). */
export const DAYS: readonly DayName[] = DAY_NAMES

/** `getDay()` sırasına göre gün adları (0 = Pazar). */
const WEEKDAY_BY_INDEX: readonly DayName[] = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
]

/** Hücre değerini CSV için metne çevirir; iç içe nesne/dizi değerler JSON olarak serileştirilir. */
function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Veriyi CSV olarak indirir. `isText` true ise tek hücrelik "Program Detayı" çıktısı üretir.
 * Tarayıcı dışında (SSR) sessizce çıkar.
 */
export function downloadCSV(
  data: Record<string, unknown>[] | string,
  filename: string,
  isText = false
): void {
  if (typeof document === 'undefined') return

  if (!data || data.length === 0) {
    toast.error('İndirilecek veri bulunamadı.')
    return
  }

  // Excel'in UTF-8 algılaması için BOM (U+FEFF).
  let csvContent = String.fromCharCode(0xfeff)

  if (isText) {
    const formattedText = `"${String(data).replace(/"/g, '""')}"`
    csvContent += 'Program Detayı\n' + formattedText
  } else {
    const rows = Array.isArray(data) ? data : []
    const first = rows[0]
    if (!first) {
      toast.error('İndirilecek veri bulunamadı.')
      return
    }

    const headers = Object.keys(first).join(',')
    const body = rows
      .map((obj) =>
        Object.values(obj)
          .map((value) => `"${toCsvCell(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')

    csvContent += headers + '\n' + body
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function toNumberOrZero(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed || 0 : 0
}

/** Protein/karbonhidrat/yağ değerlerinin yüzdesel dağılımı (toplam 0 ise hepsi 0). */
export function getMacroPercentage(
  p: unknown,
  c: unknown,
  f: unknown
): { p: number; c: number; f: number } {
  const pro = toNumberOrZero(p)
  const car = toNumberOrZero(c)
  const fat = toNumberOrZero(f)
  const total = pro + car + fat

  if (total === 0) return { p: 0, c: 0, f: 0 }

  return {
    p: (pro / total) * 100,
    c: (car / total) * 100,
    f: (fat / total) * 100,
  }
}

/** Bugünün Türkçe gün adı. `date` parametresi test edilebilirlik içindir. */
export function getTodayName(date: Date = new Date()): DayName {
  return WEEKDAY_BY_INDEX[date.getDay()] ?? 'Pazartesi'
}

/** Saniyeyi "d:ss" biçiminde gösterir (dinlenme sayacı). */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/** Koşullu Tailwind sınıflarını birleştirir. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 16.08.2026 biçiminde tarih. */
export function formatDateTR(value: string | Date): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('tr-TR')
}

/** 16.08.2026 14:30 biçiminde tarih + saat. */
export function formatDateTimeTR(value: string | Date): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** Verilen tarihin üzerinden geçen tam gün sayısı. */
export function daysSince(value: string | Date, now: Date = new Date()): number {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return 0
  const diffMs = now.getTime() - date.getTime()
  return Math.floor(diffMs / 86_400_000)
}
