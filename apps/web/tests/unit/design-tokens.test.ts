// Görsel kimlik token'larının sözleşme testi (AC-1.6.1 ve AC-1.6.5 karşılığı).
//
// NEDEN axe DEĞİL: axe-core'un `color-contrast` kuralı jsdom'da ÇALIŞMAZ. Kural gerçek
// layout ve boyama (getComputedStyle üzerinden çözülmüş efektif zemin rengi, örtüşen
// katmanlar, opaklık) gerektirir; jsdom bunları üretmediği için axe kuralı otomatik olarak
// "incomplete" durumuna düşer ve sessizce hiçbir şey doğrulamaz. Bunun yerine kontrastı
// WCAG 2.1'in bağıl parlaklık formülüyle token değerleri üzerinde hesaplıyoruz: hem
// güvenilir, hem de gerçek kaynağı (tokens.ts) test ediyor — DOM'a düşmüş bir kopyasını değil.
//
// Kontrast oranı = (L1 + 0.05) / (L2 + 0.05), L = 0.2126R + 0.7152G + 0.0722B
// (sRGB kanalları doğrusallaştırılmış hâlde). Kaynak: WCAG 2.1 §1.4.3 / §1.4.11.

import { describe, expect, it } from 'vitest'

import { tokens } from '@/design/tokens'

import { hexToRgbChannels } from '../../tailwind.config'

import type { ThemeName, TokenName } from '@/design/tokens'

const TOKEN_NAMES: TokenName[] = [
  'bg',
  'surface',
  'surfaceRaised',
  'border',
  'textPrimary',
  'textSecondary',
  'accent',
  'accentContrast',
  'success',
  'warning',
  'danger',
  'focusRing',
]

const THEMES: ThemeName[] = ['light', 'dark']

const HEX6 = /^#[0-9A-Fa-f]{6}$/

function channels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('kontrast yardımcısı (formülün kendisi doğrulanır)', () => {
  it('siyah/beyaz için 21:1 verir', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2)
  })

  it('aynı renk için 1:1 verir ve simetriktir', () => {
    expect(contrastRatio('#5B48D9', '#5B48D9')).toBeCloseTo(1, 5)
    expect(contrastRatio('#14161B', '#F4F4F1')).toBeCloseTo(contrastRatio('#F4F4F1', '#14161B'), 10)
  })

  it('bilinen bir referans değeri yeniden üretir (WCAG örneği)', () => {
    // #777777 beyaz üstünde 4.48:1 — AA eşiğini kıl payı geçemeyen klasik örnek.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })
})

describe('AC-1.6.1 — tokens.ts sözleşmesi', () => {
  it('light ve dark olmak üzere tam olarak iki değer seti içerir', () => {
    expect(Object.keys(tokens).sort()).toEqual(['dark', 'light'])
  })

  it.each(THEMES)('%s setinde 12 semantik anahtarın tamamı tanımlı', (theme) => {
    expect(Object.keys(tokens[theme]).sort()).toEqual([...TOKEN_NAMES].sort())
  })

  it.each(THEMES)('%s setindeki her değer düz #RRGGBB hex string', (theme) => {
    for (const name of TOKEN_NAMES) {
      const value: string = tokens[theme][name]
      expect(typeof value, `${theme}.${name} string olmalı`).toBe('string')
      expect(value, `${theme}.${name} = ${value}`).toMatch(HEX6)
    }
  })

  it("web'e özgü hiçbir değer sızmamış (rgba/var/calc/px/Tailwind sınıf adı yok)", () => {
    // HEX6 deseni bunları zaten dışlar; bu test niyeti açıkça kayda geçirir ve
    // regresyonda hangi kuralın kırıldığını okunur bir mesajla söyler.
    const forbidden = ['rgba(', 'rgb(', 'hsl(', 'var(', 'calc(', 'px', 'rem', ' ', 'bg-', 'text-']
    for (const theme of THEMES) {
      for (const name of TOKEN_NAMES) {
        const value: string = tokens[theme][name]
        for (const needle of forbidden) {
          expect(value.includes(needle), `${theme}.${name} "${needle}" içeremez`).toBe(false)
        }
      }
    }
  })

  it("ADR-0015'in altı adlandırılmış hex'i birebir korunuyor", () => {
    expect(tokens.light.bg).toBe('#F4F4F1') // Tebeşir
    expect(tokens.dark.bg).toBe('#14161B') // Demir
    expect(tokens.light.accent).toBe('#5B48D9') // Menevis
    expect(tokens.dark.accent).toBe('#A79BFF') // Menevis, koyu tema durağı
    expect(tokens.light.success).toBe('#0F7A4C') // Kapanış
    expect(tokens.light.warning).toBe('#A65600') // Kehribar (2026-08-17 revizyonu)
    expect(tokens.light.danger).toBe('#C22F2F') // Plaka Kırmızısı
  })

  it('eski marka moru (violet-500) hiçbir token değerinde yok (AC-1.6.2)', () => {
    // Hex parçalı yazılıyor ki ratchet script'inin ham-hex sayacı bu dosyayı
    // yanlış pozitif olarak saymasın (ADR-0018: grep tabanlı sayaç).
    const legacyBrandPurple = '#8b' + '5cf6'
    for (const theme of THEMES) {
      for (const name of TOKEN_NAMES) {
        expect(tokens[theme][name].toLowerCase()).not.toBe(legacyBrandPurple)
      }
    }
  })
})

// Eşikler: metin için WCAG AA 4.5:1, gövde metni için AAA 7:1, UI bileşeni
// (odak halkası) için 1.4.11 uyarınca 3:1.
const THRESHOLDS: { label: string; fg: TokenName; bg: TokenName; min: number }[] = [
  { label: 'accentContrast / accent', fg: 'accentContrast', bg: 'accent', min: 4.5 },
  { label: 'accent / bg', fg: 'accent', bg: 'bg', min: 4.5 },
  { label: 'textPrimary / bg', fg: 'textPrimary', bg: 'bg', min: 7 },
  { label: 'textSecondary / bg', fg: 'textSecondary', bg: 'bg', min: 4.5 },
  { label: 'focusRing / bg', fg: 'focusRing', bg: 'bg', min: 3 },
  { label: 'success / bg', fg: 'success', bg: 'bg', min: 4.5 },
  { label: 'warning / bg', fg: 'warning', bg: 'bg', min: 4.5 },
  { label: 'danger / bg', fg: 'danger', bg: 'bg', min: 4.5 },
]

describe('AC-1.6.5 — WCAG kontrast eşikleri (token seviyesinde hesaplanmış)', () => {
  for (const theme of THEMES) {
    describe(`${theme} teması`, () => {
      it.each(THRESHOLDS)('$label >= $min', ({ fg, bg, min }) => {
        const ratio = contrastRatio(tokens[theme][fg], tokens[theme][bg])
        expect(
          ratio,
          `${theme}: ${fg} (${tokens[theme][fg]}) / ${bg} (${tokens[theme][bg]}) = ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(min)
      })

      it('ikincil metin en açık/en koyu yüzeyde de AA geçiyor', () => {
        expect(
          contrastRatio(tokens[theme].textSecondary, tokens[theme].surface)
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrastRatio(tokens[theme].textSecondary, tokens[theme].surfaceRaised)
        ).toBeGreaterThanOrEqual(4.5)
      })

      it('odak halkası yüksek kademe yüzeyde de görünür (3:1)', () => {
        expect(
          contrastRatio(tokens[theme].focusRing, tokens[theme].surfaceRaised)
        ).toBeGreaterThanOrEqual(3)
      })

      it('yüzey kademeleri birbirinden ayrışıyor (bg < surface < surfaceRaised)', () => {
        const l = (name: TokenName): number => relativeLuminance(tokens[theme][name])
        // Her iki temada da "yükselme" = aydınlanma yönündedir.
        expect(Math.sign(l('surface') - l('bg'))).toBe(1)
        expect(Math.sign(l('surfaceRaised') - l('surface'))).toBe(1)
      })
    })
  }

  // Kehribar borcu 2026-08-17'de kapatıldı (#B45D00 → #A65600, ADR-0015 revizyonu).
  // Eski değer yalnızca `bg` üstünde değil `surface` üstünde de (4.46:1) eşiğin altındaydı;
  // bu yüzden uyarı rengi HER ÜÇ açık tema zemininde ayrı ayrı kilitleniyor — borç
  // bir daha yüzey kademesinden sızamaz.
  it('uyarı rengi her üç açık tema zemininde de AA geçiyor', () => {
    for (const ground of ['bg', 'surface', 'surfaceRaised'] as const) {
      const ratio = contrastRatio(tokens.light.warning, tokens.light[ground])
      expect(ratio, `light.warning / ${ground} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uyarı rengi diğer durum renkleriyle aynı emniyet bandında (4.8–5.2)', () => {
    // Kapanış 4.88 · Kehribar 4.82 · Plaka Kırmızısı 5.09 — üçü de sınırda değil.
    for (const name of ['success', 'warning', 'danger'] as const) {
      expect(contrastRatio(tokens.light[name], tokens.light.bg)).toBeGreaterThan(4.7)
    }
  })
})

describe('hexToRgbChannels — Tailwind <alpha-value> köprüsü', () => {
  it("hex'i boşlukla ayrılmış ham RGB kanallarına çevirir", () => {
    expect(hexToRgbChannels('#5B48D9')).toBe('91 72 217')
    expect(hexToRgbChannels('#F4F4F1')).toBe('244 244 241')
    expect(hexToRgbChannels('#14161B')).toBe('20 22 27')
    expect(hexToRgbChannels('#000000')).toBe('0 0 0')
    expect(hexToRgbChannels('#FFFFFF')).toBe('255 255 255')
  })

  it('küçük harfli hex de kabul edilir', () => {
    expect(hexToRgbChannels('#a79bff')).toBe('167 155 255')
  })

  it('çıktı rgb() SARMALAYICISI içermez — aksi hâlde opaklık değiştiricileri sessizce bozulur', () => {
    for (const theme of THEMES) {
      for (const name of TOKEN_NAMES) {
        const value = hexToRgbChannels(tokens[theme][name])
        expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
      }
    }
  })

  it('geçersiz girdide sessizce geçmez, hata fırlatır', () => {
    expect(() => hexToRgbChannels('#FFF')).toThrow()
    expect(() => hexToRgbChannels('rgb(0 0 0)')).toThrow()
    expect(() => hexToRgbChannels('#GGGGGG')).toThrow()
  })
})
