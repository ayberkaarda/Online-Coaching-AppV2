// Tipografi ilkelleri — "Kor & Kemik" üç ailesini (Bricolage Grotesque / Instrument Sans /
// JetBrains Mono) token'lı 1.25 ölçeğiyle sarar. Ham `<Text>` + serpme fontSize yerine
// bunlar kullanılır; renk her zaman temadan gelir (ham hex serpme yok).
// Ölçekleme (§4): gövde/UI'da Dynamic Type tavanı YOK; ≥31px display/sayaçta tavan 1.5.

import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native'

import {
  DISPLAY_MAX_FONT_SCALE,
  DISPLAY_SCALE_THRESHOLD,
  useTheme,
  type ColorToken,
  type TypographyVariant,
} from '../../lib/theme'

interface BaseProps extends RNTextProps {
  variant?: TypographyVariant
  /** Renk token'ı; verilmezse birincil metin. */
  color?: ColorToken
  style?: TextStyle | TextStyle[]
}

function ThemedText({ variant = 'body', color = 'textPrimary', style, ...rest }: BaseProps) {
  const theme = useTheme()
  const spec = theme.typography[variant]
  const cap = spec.fontSize >= DISPLAY_SCALE_THRESHOLD ? DISPLAY_MAX_FONT_SCALE : undefined
  return (
    <RNText
      maxFontSizeMultiplier={cap}
      style={[spec, { color: theme.colors[color] }, style as TextStyle]}
      {...rest}
    />
  )
}

/** Sayfa/kart başlığı — Bricolage Grotesque (display). */
export function Heading({ variant = 'displayMd', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/** Gövde metni — Instrument Sans. */
export function Body({ variant = 'body', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/** Veri/sayı — JetBrains Mono (tabular). kg, gün, tekrar, sayaç. */
export function Mono({ variant = 'monoMd', ...rest }: BaseProps) {
  return <ThemedText variant={variant} {...rest} />
}

/**
 * Küçük büyük-harf etiketi (12px, +%6 aralık). Düz metin çocuklar `tr-TR` yerel ayarıyla
 * büyütülür (i→İ); tamamı büyük harf YALNIZ bu etikette kullanılır.
 */
export function Label({
  variant = 'label',
  color = 'textSecondary',
  children,
  ...rest
}: BaseProps) {
  const text = typeof children === 'string' ? children.toLocaleUpperCase('tr-TR') : children
  return (
    <ThemedText variant={variant} color={color} {...rest}>
      {text}
    </ThemedText>
  )
}
