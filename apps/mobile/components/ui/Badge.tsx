// Rozet — küçük durum etiketi (seri, tarih, uyarı). Ton token'dan gelir; metin tam renk,
// zemin sunken yüzey. Köşe `radius.sm` (6, brand-proposal §5). Durum rengi tek sinyal
// değildir: etiket metni her zaman anlamı taşır.

import { View, type ViewStyle } from 'react-native'

import { useTheme, type ColorToken } from '../../lib/theme'
import { Body } from './Text'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const TONE_COLOR: Record<Tone, ColorToken> = {
  neutral: 'textSecondary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
}

interface BadgeProps {
  label: string
  tone?: Tone
  style?: ViewStyle
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme()
  const token = TONE_COLOR[tone]
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: theme.colors.surfaceSunken,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
        style,
      ]}
    >
      <Body variant="label" color={token}>
        {label}
      </Body>
    </View>
  )
}
