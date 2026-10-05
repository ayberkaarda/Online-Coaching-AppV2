// Mobil tasarım token'ları — "Kor & Kemik" kimliğinin (.orchestra/brand-proposal.md)
// React Native karşılığı. Renkler `lib/palette.ts`'te (saf modül, web tokens.ts ile
// eşitliği palette-parity.test.mts doğrular); burada radius, boşluk, tipografi, gölge
// ve aktif temayı seçen `useTheme` bulunur. Token ADLARI web sözleşmesiyle aynıdır.

import { Platform, useColorScheme, type ViewStyle } from 'react-native'

import { palette, type Colors, type ThemeName } from './palette'

export { palette, type ColorToken, type Colors, type ThemeName } from './palette'

// ── Köşe yarıçapı (§5: adlar korunur, değerler değişir; badge için sm) ──────
export const radius = {
  sm: 6,
  control: 10,
  card: 16,
  panel: 24,
  pill: 999,
} as const

// ── Boşluk ölçeği (§5: 4px ızgara — 4·8·12·16·24·32·48) ─────────────────────
// `xl` (20) mevcut ekran/kart düzenini korumak için tutulur; 4'ün katıdır.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const

// ── Tipografi (§4): display=Bricolage Grotesque, metin=Instrument Sans, veri=JetBrains Mono.
// RN'de ağırlık font AİLE ADINA gömülüdür; her ağırlık ayrı family key'idir ve
// `lib/fonts.ts` anahtarlarıyla BİREBİR eşleşir.
export const fontFamily = {
  displaySemibold: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  bodyRegular: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemibold: 'InstrumentSans_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
} as const

// Ölçek 1.25: 12 · 14 · 16 (gövde) · 20 · 25 · 31 · 39 · 49. Satır yüksekliği gövdede
// 1.5, başlıkta 1.15. Etiket 12px, +%6 harf aralığı (0.72), büyük harf (tr-TR).
export const typography = {
  displayXl: { fontFamily: fontFamily.displayBold, fontSize: 39, lineHeight: 45 },
  displayLg: { fontFamily: fontFamily.displayBold, fontSize: 31, lineHeight: 36 },
  displayMd: { fontFamily: fontFamily.displaySemibold, fontSize: 25, lineHeight: 29 },
  displaySm: { fontFamily: fontFamily.displaySemibold, fontSize: 20, lineHeight: 23 },
  bodyLg: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fontFamily.bodyRegular, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fontFamily.bodySemibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.72 },
  monoXl: { fontFamily: fontFamily.mono, fontSize: 49, lineHeight: 56 },
  monoLg: { fontFamily: fontFamily.mono, fontSize: 25, lineHeight: 29 },
  monoMd: { fontFamily: fontFamily.mono, fontSize: 16, lineHeight: 20 },
  monoSm: { fontFamily: fontFamily.mono, fontSize: 14, lineHeight: 18 },
} as const

export type TypographyVariant = keyof typeof typography

/** ≥31px display/sayaç metninde Dynamic Type tavanı (§4). Gövde/UI'da tavan yok. */
export const DISPLAY_SCALE_THRESHOLD = 31
export const DISPLAY_MAX_FONT_SCALE = 1.5

// ── Gölge (§5): açık temada tek kademe "raised"; koyu temada gölge yok (yükselme
// daha açık yüzey kademesiyle verilir). Kart gölgesizdir (1px border).
function raisedShadow(name: ThemeName): ViewStyle {
  if (name === 'dark') return {}
  return Platform.select<ViewStyle>({
    android: { elevation: 4 },
    default: {
      shadowColor: '#17150F',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
  })
}

export interface Theme {
  name: ThemeName
  colors: Colors
  radius: typeof radius
  spacing: typeof spacing
  typography: typeof typography
  fontFamily: typeof fontFamily
  shadow: { raised: ViewStyle }
}

/**
 * Aktif temayı `useColorScheme` üzerinden seçer (app.json `userInterfaceStyle: automatic`,
 * tema sistem tercihini izler). `null`/`undefined` → açık tema (kanonik referans).
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
    shadow: { raised: raisedShadow(name) },
  }
}
