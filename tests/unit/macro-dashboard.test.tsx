// Makro dashboard'u (hedef vs gerçekleşen) — Faz 2d (§4.2).
//
// KAPSAM:
//   1) `computeMacroBudget` saf fonksiyonu: hedef NULL vs 0 ayrımı, aşım hesabı.
//   2) `MacroDashboard` bileşeni: hedef NULL iken ne gösterildiği, aşım
//      durumunun `danger` token'ıyla işaretlenmesi.
//   3) ADR-0017 REGRESYON TESTİ: dashboard HALKA (svg/circle) DEĞİL, YATAY BAR
//      (`role="progressbar"`) render eder — halka yalnızca döngü durumu kodlar
//      (tek anlam kuralı), makro bir bütçedir.
//
// `MacroDashboard` saf props alan bir bileşendir (targets/totals) — hiçbir
// hook'a bağlı değildir, bu yüzden burada `@/hooks` mock'lamaya GEREK YOKTUR.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { computeMacroBudget, MacroDashboard } from '@/components/tabs/NutritionTab'
import type { NutritionTargets, NutritionTotals } from '@/hooks'

const EMPTY_TARGETS: NutritionTargets = {
  kcal: null,
  protein_g: null,
  carb_g: null,
  fat_g: null,
}

const ZERO_TOTALS: NutritionTotals = {
  kcal: 0,
  protein_g: 0,
  carb_g: 0,
  fat_g: 0,
}

describe('computeMacroBudget', () => {
  it('hedef NULL ise "no-target" durumu döner (0 İLE KARIŞTIRILMAZ)', () => {
    expect(computeMacroBudget(null, 0)).toEqual({ state: 'no-target', fillPercent: 0, overBy: 0 })
    expect(computeMacroBudget(null, 500)).toEqual({
      state: 'no-target',
      fillPercent: 0,
      overBy: 0,
    })
  })

  it('hedef 0 ve gerçekleşen 0 ise "under" (bütçe tutuyor)', () => {
    expect(computeMacroBudget(0, 0)).toEqual({ state: 'under', fillPercent: 0, overBy: 0 })
  })

  it('hedef 0 ve gerçekleşen > 0 ise doğrudan "over" (sıfıra bölme özel durumu)', () => {
    expect(computeMacroBudget(0, 50)).toEqual({ state: 'over', fillPercent: 100, overBy: 50 })
  })

  it('gerçekleşen hedefin altındaysa "under", dolgu oranla orantılı', () => {
    expect(computeMacroBudget(2000, 1000)).toEqual({ state: 'under', fillPercent: 50, overBy: 0 })
  })

  it('gerçekleşen %90 eşiğine ulaşınca (henüz aşmadan) "near" olur', () => {
    const budget = computeMacroBudget(1000, 900)
    expect(budget.state).toBe('near')
    expect(budget.fillPercent).toBe(90)
    expect(budget.overBy).toBe(0)
  })

  it('gerçekleşen hedefi aşarsa "over"; dolgu 100de KIRPILIR ama aşım miktarı kaybolmaz', () => {
    expect(computeMacroBudget(2000, 2500)).toEqual({ state: 'over', fillPercent: 100, overBy: 500 })
  })

  it('tam hedefte (100%) henüz "over" değil, "near" sayılır (sınır aşılmadı)', () => {
    expect(computeMacroBudget(1000, 1000)).toEqual({ state: 'near', fillPercent: 100, overBy: 0 })
  })
})

describe('MacroDashboard — hedef NULL durumu', () => {
  it('hedef verilmemişse "hedef belirlenmedi" metni gösterir, sayıyı 0 ile karıştırmaz', () => {
    render(<MacroDashboard targets={EMPTY_TARGETS} totals={{ ...ZERO_TOTALS, kcal: 350 }} />)

    // Gerçekleşen değer (350) görünür...
    expect(screen.getByText(/350 kcal/)).toBeInTheDocument()
    // ...ama "hedef 0" ima EDİLMEZ, açıkça "belirlenmedi" yazar.
    expect(screen.getAllByText('(hedef belirlenmedi)').length).toBeGreaterThan(0)
    expect(screen.queryByText(/\/ 0 kcal/)).not.toBeInTheDocument()
  })

  it('hedef 0 olarak GERÇEKTEN verilmişse "belirlenmedi" YAZMAZ, "0" hedefini gösterir', () => {
    render(
      <MacroDashboard
        targets={{ kcal: 0, protein_g: null, carb_g: null, fat_g: null }}
        totals={ZERO_TOTALS}
      />
    )

    expect(screen.getByText(/0 \/ 0 kcal/)).toBeInTheDocument()
    // Yalnızca kcal satırı hedefli; protein/karb/yağ satırları hâlâ "belirlenmedi" olmalı.
    expect(screen.getAllByText('(hedef belirlenmedi)')).toHaveLength(3)
  })
})

describe('MacroDashboard — hedef aşımı', () => {
  it('aşım durumunda "aşım" metni ve danger rengi (text-danger) uygulanır', () => {
    render(
      <MacroDashboard
        targets={{ kcal: 2000, protein_g: null, carb_g: null, fat_g: null }}
        totals={{ ...ZERO_TOTALS, kcal: 2300 }}
      />
    )

    expect(screen.getByText(/\+300 kcal aşım/)).toBeInTheDocument()
    const kcalBar = screen.getByRole('progressbar', { name: 'Kalori bütçesi' })
    expect(kcalBar.firstElementChild).toHaveClass('bg-danger')
    // Dolgu 100'e kırpılmıştır — bar konteynerin dışına taşmaz.
    expect((kcalBar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  it('bütçe aşılmamışsa danger sınıfı UYGULANMAZ', () => {
    render(
      <MacroDashboard
        targets={{ kcal: 2000, protein_g: null, carb_g: null, fat_g: null }}
        totals={{ ...ZERO_TOTALS, kcal: 1000 }}
      />
    )

    const kcalBar = screen.getByRole('progressbar', { name: 'Kalori bütçesi' })
    expect(kcalBar.firstElementChild).not.toHaveClass('bg-danger')
    expect(screen.queryByText(/aşım/)).not.toBeInTheDocument()
  })
})

describe('MacroDashboard — ADR-0017 regresyon: HALKA DEĞİL, YATAY BAR', () => {
  it('imza öğe halkasının ÇİZİM MEKANİZMASINI (stroke-dashoffset/stroke-dasharray) HİÇ KULLANMAZ', () => {
    // NOT: başlıktaki `Target` ikonu (lucide) dekoratif bir <svg><circle> içerir
    // (`aria-hidden`, bullseye görseli) — bu bir simge, İLERLEME GÖSTERGESİ
    // değildir. ADR-0017'nin yasakladığı şey herhangi bir <circle> varlığı
    // değil, halkanın kendine özgü çizim sözleşmesidir: "state kaynaklı
    // `stroke-dashoffset` güncellemesi" (bkz. ADR-0017 "KRİTİK KISIT — hareket
    // azaltma"). Bu yüzden test, o mekanizmanın YOKLUĞUNU doğrudan arar; hangi
    // dekoratif ikonların kullanıldığına duyarlı DEĞİLDİR.
    const { container } = render(
      <MacroDashboard
        targets={{ kcal: 2000, protein_g: 150, carb_g: 200, fat_g: 60 }}
        totals={{ kcal: 1800, protein_g: 120, carb_g: 180, fat_g: 50 }}
      />
    )

    expect(container.querySelector('[stroke-dashoffset]')).toBeNull()
    expect(container.querySelector('[style*="stroke-dashoffset"]')).toBeNull()
    expect(container.querySelector('circle[stroke-dasharray]')).toBeNull()
  })

  it('her makro satırı `role="progressbar"` ile bir YATAY dolgu bar\'ı render eder', () => {
    render(
      <MacroDashboard
        targets={{ kcal: 2000, protein_g: 150, carb_g: 200, fat_g: 60 }}
        totals={{ kcal: 1800, protein_g: 120, carb_g: 180, fat_g: 50 }}
      />
    )

    const bars = screen.getAllByRole('progressbar')
    expect(bars).toHaveLength(4)
    for (const bar of bars) {
      // width stiliyle dolan bir <div> — halkanın stroke-dashoffset'i YOK.
      expect(bar.firstElementChild).toBeInstanceOf(HTMLDivElement)
      expect((bar.firstElementChild as HTMLElement).style.width).toMatch(/%$/)
    }
  })
})
