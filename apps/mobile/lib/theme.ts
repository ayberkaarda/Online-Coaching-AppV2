// Mobil tasarım token'ları — web'in görsel kimliğinin ("Demir & Tebeşir", ADR-0015)
// React Native karşılığı. Renkler apps/web/src/design/tokens.ts ile BİREBİR aynı altı
// adlandırılmış hex ve türevleridir; token ADLARI da korunur (bg/surface/accent/…) ki
// koç paneli mobile geldiğinde (B-065) aynı sözlük kullanılabilsin.
//
// Neden web tokens.ts doğrudan import edilmiyor: kapsam sınırı apps/web'e dokunmayı
// yasaklar ve metro/tsconfig cross-app çözümü kurulmadı. Değerler burada yeniden
// bildirilir; tek kaynak yine ADR-0015'tir (değişirse iki yerde güncellenir).

import { useColorScheme } from 'react-native'

// ── Palet (ADR-0015 — altı adlandırılmış hex + türevler) ───────────────────
export const palette = {
  light: {
    bg: '#F4F4F1',
    surface: '#FAFAF8',
    surfaceRaised: '#FFFFFF',
    border: '#C7C8C6',
    textPrimary: '#14161B',
    textSecondary: '#626466',
    accent: '#5B48D9',
    accentContrast: '#F4F4F1',
    success: '#0F7A4C',
    warning: '#A65600',
    danger: '#C22F2F',
    focusRing: '#5B48D9',
  },
  dark: {
    bg: '#14161B',
    surface: '#24262A',
    surfaceRaised: '#313337',
    border: '#414246',
    textPrimary: '#F4F4F1',
    textSecondary: '#A6A6A6',
    accent: '#A79BFF',
    accentContrast: '#14161B',
    success: '#00B869',
    warning: '#F78000',
    danger: '#F97878',
    focusRing: '#A79BFF',
  },
} as const

export type ThemeName = keyof typeof palette
export type ColorToken = keyof (typeof palette)['light']
/** Aktif temanın renk sözlüğü — token adı → hex. light/dark ikisi de bu şekle uyar. */
export type Colors = Record<ColorToken, string>

// ── Köşe yarıçapı (ADR-0017: daire yalnız halkadır; kart/panel köşesi 8/12/16) ─
export const radius = {
  control: 8,
  card: 12,
  panel: 16,
  pill: 999,
} as const

// ── Boşluk ölçeği (4'ün katları) ───────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

// ── Tipografi (ADR-0015): display=Archivo, gövde=Hanken Grotesk, veri=IBM Plex Mono.
// RN'de ağırlık font AİLE ADINA gömülüdür (numeric fontWeight custom font ile güvenilmez),
// bu yüzden her ağırlık ayrı family key'idir; _layout.tsx bu key'lerle yükler.
export const fontFamily = {
  displaySemibold: 'Archivo_600SemiBold',
  displayBold: 'Archivo_700Bold',
  bodyRegular: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const

// Adlandırılmış metin stilleri — bileşenler boyut/satır yüksekliğini burada tek yerden alır.
export const typography = {
  displayLg: { fontFamily: fontFamily.displayBold, fontSize: 28, lineHeight: 34 },
  displayMd: { fontFamily: fontFamily.displaySemibold, fontSize: 22, lineHeight: 28 },
  displaySm: { fontFamily: fontFamily.displaySemibold, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fontFamily.bodyRegular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fontFamily.bodySemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  monoLg: { fontFamily: fontFamily.mono, fontSize: 24, lineHeight: 28 },
  monoMd: { fontFamily: fontFamily.mono, fontSize: 16, lineHeight: 20 },
  monoSm: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 16 },
} as const

export type TypographyVariant = keyof typeof typography

export interface Theme {
  name: ThemeName
  colors: Colors
  radius: typeof radius
  spacing: typeof spacing
  typography: typeof typography
  fontFamily: typeof fontFamily
}

/**
 * Aktif temayı `useColorScheme` üzerinden seçer (app.json `userInterfaceStyle: automatic`).
 * `null`/`undefined` (okunamadı) → açık tema; ADR-0015 kanonik referansı açık temadır.
 */
export function useTheme(): Theme {
  const scheme = useColorScheme()
  const name: ThemeName = scheme === 'dark' ? 'dark' : 'light'
  return {
    name,
    colors: palette[name],
    radius,
    spacing,
    typography,
    fontFamily,
  }
}
