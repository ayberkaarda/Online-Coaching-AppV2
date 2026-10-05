// Görsel kimlik token'larının sözleşme testi — "Kor & Kemik" (marka kararı v2 §3).
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
  'surfaceSunken',
  'surfaceRaised',
  'border',
  'borderControl',
  'textPrimary',
  'textSecondary',
  'accent',
  'accentContrast',
  'success',
  'warning',
  'danger',
  'info',
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
    expect(contrastRatio('#B63D0B', '#B63D0B')).toBeCloseTo(1, 5)
    expect(contrastRatio('#121110', '#F5F2EC')).toBeCloseTo(contrastRatio('#F5F2EC', '#121110'), 10)
  })

  it('bilinen bir referans değeri yeniden üretir (WCAG örneği)', () => {
    // #777777 beyaz üstünde 4.48:1 — AA eşiğini kıl payı geçemeyen klasik örnek.
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })
})

describe('tokens.ts sözleşmesi', () => {
  it('light ve dark olmak üzere tam olarak iki değer seti içerir', () => {
    expect(Object.keys(tokens).sort()).toEqual(['dark', 'light'])
  })

  it.each(THEMES)('%s setinde 15 semantik anahtarın tamamı tanımlı', (theme) => {
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

  it('Kor & Kemik adlandırılmış çekirdek renkleri birebir korunuyor', () => {
    expect(tokens.light.bg).toBe('#F5F2EC') // Kemik
    expect(tokens.dark.bg).toBe('#121110') // Gece
    expect(tokens.light.accent).toBe('#B63D0B') // Kor
    expect(tokens.dark.accent).toBe('#FF8A4C') // Kor, koyu tema durağı
    expect(tokens.light.info).toBe('#0E6E78') // Su
    expect(tokens.dark.info).toBe('#4CC3CF') // Su, koyu tema durağı
  })

  it('accentContrast ve focusRing sözleşmesi korunuyor (focusRing = accent)', () => {
    for (const theme of THEMES) {
      expect(tokens[theme].focusRing).toBe(tokens[theme].accent)
    }
    expect(tokens.light.accentContrast).toBe('#FFFFFF')
    expect(tokens.dark.accentContrast).toBe(tokens.dark.bg)
  })

  it('nötrler saf gri değil, sıcak gridir (R ≥ G ≥ B ve R > B)', () => {
    const neutrals = [
      'bg',
      'surfaceSunken',
      'border',
      'borderControl',
      'textPrimary',
      'textSecondary',
    ] as const
    for (const theme of THEMES) {
      for (const name of neutrals) {
        const [r, g, b] = channels(tokens[theme][name])
        expect(r >= g && g >= b && r > b, `${theme}.${name} sıcak olmalı`).toBe(true)
      }
    }
  })

  it('eski marka morları (violet-500, Menevis) hiçbir token değerinde yok', () => {
    // Hex parçalı yazılıyor ki ratchet script'inin ham-hex sayacı bu dosyayı
    // yanlış pozitif olarak saymasın (ADR-0018: grep tabanlı sayaç).
    const legacy = ['#8b' + '5cf6', '#5b' + '48d9', '#a7' + '9bff']
    for (const theme of THEMES) {
      for (const name of TOKEN_NAMES) {
        expect(legacy).not.toContain(tokens[theme][name].toLowerCase())
      }
    }
  })
})

// ── Kontrast matrisi (marka kararı v2 §3) ─────────────────────────────────────
// Açık temada metin token'ları bg / surface (= surfaceRaised) / surfaceSunken üstünde;
// koyu temada bg / surface / surfaceSunken / surfaceRaised üstünde ölçülür. Beklenen
// değerler öneride hesaplanıp yayımlanan matristir (2 ondalığa yuvarlanmış).
const GROUNDS: Record<ThemeName, TokenName[]> = {
  light: ['bg', 'surface', 'surfaceSunken'],
  dark: ['bg', 'surface', 'surfaceSunken', 'surfaceRaised'],
}

const MATRIX: Record<ThemeName, Partial<Record<TokenName, number[]>>> = {
  light: {
    textPrimary: [16.33, 18.25, 14.82],
    textSecondary: [6.42, 7.17, 5.82],
    accent: [5.13, 5.74, 4.66],
    focusRing: [5.13, 5.74, 4.66],
    success: [5.08, 5.68, 4.61],
    warning: [5.24, 5.86, 4.76],
    danger: [6.06, 6.78, 5.5],
    info: [5.34, 5.97, 4.84],
    borderControl: [3.85, 4.3, 3.49],
  },
  dark: {
    textPrimary: [16.46, 15.15, 17.26, 13.84],
    textSecondary: [7.19, 6.62, 7.54, 6.05],
    accent: [8.08, 7.43, 8.47, 6.79],
    focusRing: [8.08, 7.43, 8.47, 6.79],
    success: [9.17, 8.44, 9.62, 7.71],
    warning: [10.25, 9.44, 10.75, 8.62],
    danger: [6.94, 6.39, 7.28, 5.84],
    info: [8.99, 8.28, 9.43, 7.57],
    borderControl: [3.98, 3.66, 4.17, 3.34],
  },
}

const TEXT_TOKENS: TokenName[] = [
  'textPrimary',
  'textSecondary',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
]

describe('kontrast matrisi — her metin token her yüzeyde AA, her kontrol sınırı 3:1', () => {
  for (const theme of THEMES) {
    describe(`${theme} teması`, () => {
      for (const [fg, expected] of Object.entries(MATRIX[theme]) as [TokenName, number[]][]) {
        it(`${fg} yayımlanan matrisi yeniden üretir`, () => {
          GROUNDS[theme].forEach((ground, i) => {
            const ratio = contrastRatio(tokens[theme][fg], tokens[theme][ground])
            // Yayımlanan değerler 2 ondalığa yuvarlanmıştır; ±0.006 yuvarlama payıdır.
            expect(
              Math.abs(ratio - (expected[i] ?? Number.NaN)),
              `${theme}: ${fg} / ${ground} = ${ratio.toFixed(3)} (beklenen ${expected[i]})`
            ).toBeLessThanOrEqual(0.006)
          })
        })
      }

      it.each(TEXT_TOKENS)('%s her yüzeyde ≥ 4.5:1', (fg) => {
        for (const ground of GROUNDS[theme]) {
          const ratio = contrastRatio(tokens[theme][fg], tokens[theme][ground])
          expect(ratio, `${theme}: ${fg} / ${ground} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            4.5
          )
        }
      })

      it('borderControl ve focusRing her yüzeyde ≥ 3:1 (WCAG 1.4.11)', () => {
        for (const ground of GROUNDS[theme]) {
          for (const fg of ['borderControl', 'focusRing'] as const) {
            expect(contrastRatio(tokens[theme][fg], tokens[theme][ground])).toBeGreaterThanOrEqual(
              3
            )
          }
        }
      })

      it('gövde metni zeminde AAA (≥ 7:1)', () => {
        expect(contrastRatio(tokens[theme].textPrimary, tokens[theme].bg)).toBeGreaterThanOrEqual(7)
      })

      it('accentContrast kor dolgu üstünde ≥ 4.5:1', () => {
        expect(
          contrastRatio(tokens[theme].accentContrast, tokens[theme].accent)
        ).toBeGreaterThanOrEqual(4.5)
      })
    })
  }

  it('accentContrast / accent yayımlanan değerleri tutar (5.74 / 8.08)', () => {
    expect(contrastRatio(tokens.light.accentContrast, tokens.light.accent)).toBeCloseTo(5.74, 2)
    expect(contrastRatio(tokens.dark.accentContrast, tokens.dark.accent)).toBeCloseTo(8.08, 2)
  })

  it('dolgu üstü metin: beyaz/success 5.68, beyaz/danger 6.78 (açık tema)', () => {
    expect(contrastRatio('#FFFFFF', tokens.light.success)).toBeCloseTo(5.68, 2)
    expect(contrastRatio('#FFFFFF', tokens.light.danger)).toBeCloseTo(6.78, 2)
  })

  it('durum dolguları üstündeki `text-surface` iki temada da ≥ 4.5:1', () => {
    for (const theme of THEMES) {
      for (const fill of ['success', 'warning', 'danger', 'info'] as const) {
        const ratio = contrastRatio(tokens[theme].surface, tokens[theme][fill])
        expect(ratio, `${theme}: surface / ${fill} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          4.5
        )
      }
    }
  })

  it('koyu temada yükselme açılmayla verilir (sunken < bg < surface < raised)', () => {
    const l = (name: TokenName): number => relativeLuminance(tokens.dark[name])
    expect(l('surfaceSunken')).toBeLessThan(l('bg'))
    expect(l('bg')).toBeLessThan(l('surface'))
    expect(l('surface')).toBeLessThan(l('surfaceRaised'))
  })

  it('açık temada sunken zeminden koyudur; kart ve raised beyazdır', () => {
    const l = (name: TokenName): number => relativeLuminance(tokens.light[name])
    expect(l('surfaceSunken')).toBeLessThan(l('bg'))
    expect(tokens.light.surface).toBe('#FFFFFF')
    expect(tokens.light.surfaceRaised).toBe('#FFFFFF')
  })
})

describe('hexToRgbChannels — Tailwind <alpha-value> köprüsü', () => {
  it("hex'i boşlukla ayrılmış ham RGB kanallarına çevirir", () => {
    expect(hexToRgbChannels('#B63D0B')).toBe('182 61 11')
    expect(hexToRgbChannels('#F5F2EC')).toBe('245 242 236')
    expect(hexToRgbChannels('#121110')).toBe('18 17 16')
    expect(hexToRgbChannels('#000000')).toBe('0 0 0')
    expect(hexToRgbChannels('#FFFFFF')).toBe('255 255 255')
  })

  it('küçük harfli hex de kabul edilir', () => {
    expect(hexToRgbChannels('#ff8a4c')).toBe('255 138 76')
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
