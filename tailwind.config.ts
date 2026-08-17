import plugin from 'tailwindcss/plugin'

import { tokens } from './src/design/tokens'

import type { TokenName } from './src/design/tokens'
import type { Config } from 'tailwindcss'

/**
 * `#RRGGBB` → `'R G B'` (boşlukla ayrılmış ham kanallar).
 *
 * KRİTİK: CSS değişkenine `rgb()` SARMALAYICISI OLMADAN, ham kanal olarak yazılır.
 * Yalnızca böyle yazıldığında Tailwind'in `<alpha-value>` yer tutucusu opaklık
 * değiştiricileriyle (`bg-accent/10`, `border-accent/20`, …) geçerli bir
 * `rgb(91 72 217 / 0.1)` üretebilir. Değişkene düz hex yazılırsa bu kullanımlar
 * hata vermeden SESSİZCE renk üretmez.
 */
export function hexToRgbChannels(hex: string): string {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (digits === undefined) throw new Error(`tokens.ts geçersiz hex içeriyor: ${hex}`)
  const value = Number.parseInt(digits, 16)
  return `${(value >> 16) & 0xff} ${(value >> 8) & 0xff} ${value & 0xff}`
}

/** Semantik token adı → CSS değişkeni. Tailwind renk anahtarları bunların karşılığıdır. */
const cssVariableName: Record<TokenName, string> = {
  bg: '--color-canvas',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  border: '--color-border',
  textPrimary: '--color-fg',
  textSecondary: '--color-fg-muted',
  accent: '--color-accent',
  accentContrast: '--color-accent-fg',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  focusRing: '--color-focus-ring',
}

/** Bir tema setini CSS değişkeni bildirimlerine çevirir (tek kaynak: tokens.ts). */
function themeVariables(theme: (typeof tokens)['light' | 'dark']): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const [name, variable] of Object.entries(cssVariableName) as [TokenName, string][]) {
    declarations[variable] = hexToRgbChannels(theme[name])
  }
  return declarations
}

/** `<alpha-value>` kalıbı olmadan opaklık değiştiricileri çalışmaz. */
const withAlpha = (variable: string): string => `rgb(var(${variable}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: withAlpha('--color-canvas'),
        surface: withAlpha('--color-surface'),
        'surface-raised': withAlpha('--color-surface-raised'),
        border: withAlpha('--color-border'),
        fg: withAlpha('--color-fg'),
        'fg-muted': withAlpha('--color-fg-muted'),
        accent: withAlpha('--color-accent'),
        'accent-fg': withAlpha('--color-accent-fg'),
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        danger: withAlpha('--color-danger'),
        'focus-ring': withAlpha('--color-focus-ring'),
      },
      fontFamily: {
        // next/font (src/app/layout.tsx) bu değişkenleri <html> üzerinde tanımlar.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // ADR-0015 tipografi ölçeği: 12 / 14 / 16 / 18 / 22 / 28 / 36.
        // 12=text-xs, 14=text-sm, 16=text-base, 18=text-lg, 36=text-4xl karşılıkları
        // Tailwind varsayılanlarında zaten var; varsayılanlar EZİLMEZ (mevcut
        // `text-*` kullanımları kırılmasın). Yalnızca ölçekte eksik olan iki adım eklenir.
        '22': ['1.375rem', { lineHeight: '1.75rem' }],
        '28': ['1.75rem', { lineHeight: '2.125rem' }],
      },
      borderRadius: {
        // ADR-0015 yarıçap ölçeği: 8 / 12 / 16. Bu üç değer sayısal olarak Tailwind'in
        // lg / xl / 2xl varsayılanlarına eşittir; burada semantik adlar eklenir ki
        // Katman B (Faz 2) `rounded-3xl` (24px) kullanımlarını bunlarla değiştirebilsin.
        // Varsayılan anahtarlar KALDIRILMAZ — 17 `rounded-3xl` kullanımı hâlâ çalışıyor.
        control: '8px',
        card: '12px',
        panel: '16px',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out',
      },
    },
  },
  plugins: [
    // CSS değişkenleri TEK KAYNAKTAN (tokens.ts) üretilir; globals.css'e elle yazılmaz.
    // `next-themes` (attribute="class") <html> üzerine `.dark` koyar, `darkMode: 'class'`
    // ile birlikte tema değişimi tüm token'ları aynı anda çevirir.
    plugin(({ addBase }) => {
      addBase({
        ':root': themeVariables(tokens.light),
        '.dark': themeVariables(tokens.dark),
      })
    }),
  ],
}

export default config
