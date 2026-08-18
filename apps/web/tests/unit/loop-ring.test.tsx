// AC-1.6.7 — `LoopRing` hareket azaltma altında BİLGİ KAYBETMEZ.
//
// Bu dosya Faz 1.6'dan Faz 2'ye devredilen tek kabul kriterinin makine kanıtıdır
// (ADR-0017 "KRİTİK KISIT", active_planprogram.md §3b "Kabul kriterleri").
//
// KANITLANAN ÜÇ ŞEY:
//   1. Dolgu STATE'ten gelir (CSS animasyonundan değil): `stroke-dashoffset`
//      değeri yalnızca `value`/`max`'ın fonksiyonudur ve bileşende hiçbir
//      `animation`/`@keyframes`/`animate-*` kullanılmaz. `globals.css` içindeki
//      global `@media (prefers-reduced-motion: reduce) { * { animation-duration:
//      0.01ms !important } }` kuralının donduracağı bir şey YOKTUR.
//   2. `prefers-reduced-motion: reduce` altında halka DOĞRU DEĞERİ GÖSTERİR —
//      hareket tercihi açıkken ve kapalıyken üretilen dolgu BİREBİR AYNIDIR;
//      yalnızca geçiş (`transition`) düşer.
//   3. Halka YALNIZCA döngü durumu kodlar: izinli üç kullanım yeri vardır
//      (ADR-0017 tek anlam kuralı), dekoratif bir kullanım gürültülü biçimde
//      reddedilir ve halka her zaman erişilebilir bir ölçüm (`progressbar`)
//      olarak yayımlanır.

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LOOP_RING_PURPOSES,
  LoopRing,
  loopRingDashOffset,
  loopRingGeometry,
  loopRingProgress,
  type LoopRingPurpose,
} from '@/components/ui/LoopRing'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const originalMatchMedia = window.matchMedia

/** `prefers-reduced-motion` tercihini test başına ayarlar. */
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
  vi.restoreAllMocks()
})

const SIZE = 160
const STROKE = 12
const { circumference } = loopRingGeometry(SIZE, STROKE)

function renderRing(props: { value: number; max: number; celebrating?: boolean }) {
  return render(
    <LoopRing
      purpose="gym-session"
      label="Dinlenme döngüsü"
      size={SIZE}
      strokeWidth={STROKE}
      {...props}
    />
  )
}

describe('LoopRing — saf geometri (dolgunun kaynağı)', () => {
  it('ilerlemeyi 0–1 aralığına indirger ve uydurma değer üretmez', () => {
    expect(loopRingProgress(0, 7)).toBe(0)
    expect(loopRingProgress(5, 7)).toBeCloseTo(5 / 7, 10)
    expect(loopRingProgress(9, 7)).toBe(1)
    expect(loopRingProgress(-3, 7)).toBe(0)
    // max <= 0 / NaN / Infinity: veri yok demektir, halka BOŞ gösterir.
    expect(loopRingProgress(3, 0)).toBe(0)
    expect(loopRingProgress(Number.NaN, 7)).toBe(0)
    expect(loopRingProgress(3, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('dashoffset ilerlemenin BİREBİR fonksiyonudur (0 -> tam çevre, 1 -> 0)', () => {
    expect(loopRingDashOffset(circumference, 0)).toBeCloseTo(circumference, 10)
    expect(loopRingDashOffset(circumference, 1)).toBeCloseTo(0, 10)
    expect(loopRingDashOffset(circumference, 0.25)).toBeCloseTo(circumference * 0.75, 10)
  })
})

describe('LoopRing — dolgu STATE kaynaklıdır, animasyon kaynaklı DEĞİL', () => {
  it('stroke-dashoffset değeri doğrudan value/max ile hesaplanır', () => {
    setReducedMotion(false)
    renderRing({ value: 45, max: 90 })

    const arc = screen.getByTestId('loop-ring-progress')
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.5, 6)
    expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(circumference, 6)
  })

  it('hiçbir yerde CSS animasyonu kullanılmaz (global reduced-motion kuralı bu halkayı donduramaz)', () => {
    setReducedMotion(true)
    const { container } = renderRing({ value: 63, max: 90 })

    for (const element of container.querySelectorAll('*')) {
      // `animate-*` Tailwind sınıfı yok...
      expect(element.getAttribute('class') ?? '').not.toMatch(/\banimate-/)
      // ...ve inline bir `animation` bildirimi de yok.
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/animation/)
    }
  })
})

describe('AC-1.6.7 — hareket azaltma altında BİLGİ KAYBI YOK', () => {
  it('reduce açıkken ve kapalıyken dolgu BİREBİR AYNIDIR', () => {
    setReducedMotion(false)
    const normal = renderRing({ value: 63, max: 90 })
    const normalOffset = normal.getByTestId('loop-ring-progress').getAttribute('stroke-dashoffset')
    normal.unmount()

    setReducedMotion(true)
    const reduced = renderRing({ value: 63, max: 90 })
    const reducedRoot = reduced.getByTestId('loop-ring')
    const reducedArc = reduced.getByTestId('loop-ring-progress')

    expect(reducedRoot).toHaveAttribute('data-reduced-motion', 'true')
    // ASIL İDDİA: bilgi aynı. %70 dolu halka %70 dolu görünür.
    expect(reducedArc.getAttribute('stroke-dashoffset')).toBe(normalOffset)
    expect(Number(reducedArc.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.3, 6)
    // Erişilebilir ölçüm de aynı değeri söyler.
    expect(reduced.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63')
  })

  it('kutlama dönüşü reduce altında GEÇİŞSİZ düz renk değişimine iner', () => {
    setReducedMotion(true)
    const { getByTestId, unmount } = renderRing({ value: 90, max: 90, celebrating: true })
    const arc = getByTestId('loop-ring-progress')

    // Renk Kapanış yeşiline döndü...
    expect(arc.getAttribute('class') ?? '').toContain('stroke-success')
    // ...ama geçiş YOK (düz, anlık renk değişimi).
    expect(arc.getAttribute('class') ?? '').toContain('transition-none')
    // Halka gerçekten kapalı: dashoffset 0.
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 6)
    unmount()

    // Hareket azaltma KAPALIYKEN aynı kutlama geçişlidir — tek fark budur.
    setReducedMotion(false)
    const motion = renderRing({ value: 90, max: 90, celebrating: true })
    const motionArc = motion.getByTestId('loop-ring-progress')
    expect(motionArc.getAttribute('class') ?? '').toContain('stroke-success')
    expect(motionArc.getAttribute('class') ?? '').toContain('transition-[stroke-dashoffset,stroke]')
    expect(Number(motionArc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 6)
  })

  it('segmentli halka da reduce altında aynı sayıda dolu segment gösterir', () => {
    setReducedMotion(true)
    render(
      <LoopRing
        purpose="weekly-cycle"
        value={5}
        max={7}
        segments={7}
        label="Haftalık döngü"
        size={SIZE}
        strokeWidth={STROKE}
      />
    )

    const segments = screen.getAllByTestId('loop-ring-segment')
    expect(segments).toHaveLength(7)
    expect(segments.filter((s) => s.getAttribute('data-filled') === 'true')).toHaveLength(5)
    // Yarım segment YUVARLANARAK doluymuş gibi gösterilmez.
    expect(segments[5]).toHaveAttribute('data-filled', 'false')
  })
})

describe('ADR-0017 tek anlam kuralı — halka yalnızca döngü durumu kodlar', () => {
  it('izinli kullanım yerleri ADR-0017 ile birebir üç tanedir', () => {
    expect([...LOOP_RING_PURPOSES]).toEqual(['weekly-cycle', 'gym-session', 'coach-triage'])
  })

  it('her izinli kullanımda halka ÖLÇÜM olarak yayımlanır (dekoratif mod yok)', () => {
    setReducedMotion(false)
    for (const purpose of LOOP_RING_PURPOSES) {
      const view = render(
        <LoopRing purpose={purpose} value={2} max={4} label={`${purpose} döngüsü`} />
      )
      const bar = view.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '2')
      expect(bar).toHaveAttribute('aria-valuemax', '4')
      expect(bar).toHaveAccessibleName(`${purpose} döngüsü`)
      view.unmount()
    }
  })

  it('dekoratif bir kullanım (ör. avatar çerçevesi) SESSİZCE kabul edilmez', () => {
    setReducedMotion(false)
    // Tip sistemi bunu zaten reddeder; burada tipi bilerek atlayıp çalışma
    // zamanı kilidinin de tuttuğu doğrulanır.
    const decorative = 'avatar-frame' as unknown as LoopRingPurpose
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<LoopRing purpose={decorative} value={1} max={1} label="süs" />)).toThrow(
      /tek anlam kurali/
    )
    spy.mockRestore()
  })
})
