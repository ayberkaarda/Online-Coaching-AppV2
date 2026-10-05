import plugin from 'tailwindcss/plugin'

import { durations, easings } from './src/design/motion'
import { tokens } from './src/design/tokens'

import type { TokenName } from './src/design/tokens'
import type { Config } from 'tailwindcss'

/**
 * `#RRGGBB` → `'R G B'` (boşlukla ayrılmış ham kanallar).
 *
 * KRİTİK: CSS değişkenine `rgb()` SARMALAYICISI OLMADAN, ham kanal olarak yazılır.
 * Yalnızca böyle yazıldığında Tailwind'in `<alpha-value>` yer tutucusu opaklık
 * değiştiricileriyle (`bg-accent/10`, `border-accent/20`, …) geçerli bir
 * `rgb(182 61 11 / 0.1)` üretebilir. Değişkene düz hex yazılırsa bu kullanımlar
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
  surfaceSunken: '--color-surface-sunken',
  surfaceRaised: '--color-surface-raised',
  border: '--color-border',
  borderControl: '--color-border-control',
  textPrimary: '--color-fg',
  textSecondary: '--color-fg-muted',
  accent: '--color-accent',
  accentContrast: '--color-accent-fg',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  info: '--color-info',
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
        'surface-sunken': withAlpha('--color-surface-sunken'),
        'surface-raised': withAlpha('--color-surface-raised'),
        border: withAlpha('--color-border'),
        'border-control': withAlpha('--color-border-control'),
        fg: withAlpha('--color-fg'),
        'fg-muted': withAlpha('--color-fg-muted'),
        accent: withAlpha('--color-accent'),
        'accent-fg': withAlpha('--color-accent-fg'),
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        danger: withAlpha('--color-danger'),
        info: withAlpha('--color-info'),
        'focus-ring': withAlpha('--color-focus-ring'),
      },
      // Düz `border` / `divide` sınıfları da dekoratif ayırıcı token'ını kullanır —
      // `dark:border-*` eşleştirmesine gerek kalmaz.
      borderColor: {
        DEFAULT: withAlpha('--color-border'),
      },
      fontFamily: {
        // next/font (src/app/layout.tsx) bu değişkenleri <html> üzerinde tanımlar.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Kor & Kemik tipografi ölçeği (1.25 oranı): 12 · 14 · 16 · 20 · 25 · 31 · 39 · 49.
        // 12/14/16 Tailwind'in xs/sm/base varsayılanlarıdır. Gövde satır yüksekliği 1.5,
        // başlık/sayaç 1.15. Varsayılan `text-*` anahtarları EZİLMEZ.
        '20': ['1.25rem', { lineHeight: '1.5' }],
        '25': ['1.5625rem', { lineHeight: '1.15' }],
        '31': ['1.9375rem', { lineHeight: '1.15' }],
        '39': ['2.4375rem', { lineHeight: '1.15' }],
        '49': ['3.0625rem', { lineHeight: '1.15' }],
      },
      borderRadius: {
        // Kor & Kemik şekil dili — adlar korunur, değerler mobil ile birebir aynı.
        sm: '6px', // badge
        control: '10px', // input, buton
        card: '16px', // kart
        panel: '24px', // sheet / büyük panel
        pill: '999px', // chip, halka
      },
      boxShadow: {
        // Açık temada TEK kademe (yalnız surfaceRaised: modal, popover, sheet).
        // Koyu temada gölge yok — değişken `.dark` altında `none` olur (aşağıdaki plugin).
        raised: 'var(--shadow-raised)',
      },
      // Motion Doktrini (src/design/motion.ts) — TEK KAYNAK. Süre/eğri burada
      // ms/cubic-bezier olarak ELLE yazılmaz; `duration-fast|base|reward` ve
      // `ease-standard|decelerate|accelerate` yardımcı sınıfları bu nesnelerden üretilir.
      transitionDuration: {
        fast: `${durations.fast}ms`,
        base: `${durations.base}ms`,
        reward: `${durations.reward}ms`,
      },
      transitionTimingFunction: {
        standard: easings.standard,
        decelerate: easings.decelerate,
        accelerate: easings.accelerate,
      },
      keyframes: {
        // Düz opaklık geçişi — dikey kayma yok ("ritim, gösteri değil").
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        // Skeleton -> içerik geçişi (mikro #4). Süre/eğri motion.ts'ten.
        fadeIn: `fadeIn ${durations.base}ms ${easings.decelerate}`,
        // Skeleton nabzı — sistemdeki TEK döngüsel animasyon (1.6s).
        pulse: 'pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [
    // CSS değişkenleri TEK KAYNAKTAN (tokens.ts) üretilir; globals.css'e elle yazılmaz.
    // `next-themes` (attribute="class") <html> üzerine `.dark` koyar, `darkMode: 'class'`
    // ile birlikte tema değişimi tüm token'ları aynı anda çevirir.
    plugin(({ addBase }) => {
      addBase({
        ':root': {
          ...themeVariables(tokens.light),
          '--shadow-raised': '0 1px 2px rgba(23, 21, 15, 0.06), 0 8px 24px rgba(23, 21, 15, 0.08)',
          colorScheme: 'light',
        },
        '.dark': {
          ...themeVariables(tokens.dark),
          '--shadow-raised': 'none',
          colorScheme: 'dark',
        },
      })
    }),
  ],
}

export default config
