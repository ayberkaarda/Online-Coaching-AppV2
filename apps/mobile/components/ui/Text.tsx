// Tipografi ilkelleri — ADR-0015 üç ailesini (Archivo/Hanken/IBM Plex Mono) token'lı
// boyut ölçeğiyle sarar. Ham `<Text>` + serpme fontSize yerine bunlar kullanılır;
// renk her zaman temadan gelir (ham hex serpme yok).

import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native'

import { useTheme, type ColorToken, type TypographyVariant } from '../../lib/theme'

interface BaseProps extends RNTextProps {
  variant?: TypographyVariant
  /** Renk token'ı; verilmezse birincil metin. */
  color?: ColorToken
  style?: TextStyle | TextStyle[]
}

function ThemedText({ variant = 'body', color = 'textPrimary', style, ...rest }: BaseProps) {
  const theme = useTheme()
  return (
    <RNText
      style={[theme.typography[variant], { color: theme.colors[color] }, style as TextStyle]}
      {...rest}
    />
  )
}

/** Sayfa/kart başlığı — Archivo (display). */
export function Heading({ variant = 'displayMd', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/** Gövde metni — Hanken Grotesk. */
export function Body({ variant = 'body', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/** Veri/sayı — IBM Plex Mono (tabular). kg, gün, tekrar. */
export function Mono({ variant = 'monoMd', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/** Küçük büyük-harf etiketi (kart üstü ikincil başlık). */
export function Label({ variant = 'label', color = 'textSecondary', ...rest }: BaseProps) {
  return <ThemedText variant={variant} color={color} {...rest} />
}
