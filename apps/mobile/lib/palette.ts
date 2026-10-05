// Mobil palet — "Kor & Kemik" kimliği (.orchestra/brand-proposal.md §3). SAF modül:
// react-native import ETMEZ, böylece `node --test` ile web `tokens.ts`'e karşı eşitlik
// testi (palette-parity.test.mts) doğrudan bu dosyayı yükleyebilir.
//
// Token adları web sözleşmesiyle aynıdır (accentContrast, focusRing korunur; yeni:
// surfaceSunken, borderControl, info). Değerler web `apps/web/src/design/tokens.ts`
// ile BİREBİR aynı olmak zorundadır — palette-parity testi bunu doğrular.
//
// Adlandırılmış çekirdek: Kemik #F5F2EC · Gece #121110 · Kor #B63D0B / #FF8A4C.

export const palette = {
  light: {
    bg: '#F5F2EC',
    surface: '#FFFFFF',
    surfaceSunken: '#ECE7DE',
    surfaceRaised: '#FFFFFF',
    border: '#D9D2C5',
    borderControl: '#81796B',
    textPrimary: '#17150F',
    textSecondary: '#5C574E',
    accent: '#B63D0B',
    accentContrast: '#FFFFFF',
    focusRing: '#B63D0B',
    success: '#2B7449',
    warning: '#825F00',
    danger: '#B4123F',
    info: '#0E6E78',
  },
  dark: {
    bg: '#121110',
    surface: '#1C1A17',
    surfaceSunken: '#0B0A09',
    surfaceRaised: '#24221F',
    border: '#36322C',
    borderControl: '#7A7266',
    textPrimary: '#F3EFE8',
    textSecondary: '#A69F93',
    accent: '#FF8A4C',
    accentContrast: '#121110',
    focusRing: '#FF8A4C',
    success: '#5FC98A',
    warning: '#E8B931',
    danger: '#FF6B8B',
    info: '#4CC3CF',
  },
} as const

export type ThemeName = keyof typeof palette
export type ColorToken = keyof (typeof palette)['light']
/** Aktif temanın renk sözlüğü — token adı → hex. light/dark ikisi de bu şekle uyar. */
export type Colors = Record<ColorToken, string>
