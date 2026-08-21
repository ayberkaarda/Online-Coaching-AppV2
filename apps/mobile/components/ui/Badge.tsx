// Rozet/Pill — küçük durum etiketi (seri, tarih, uyarı). Ton token'dan gelir; zemin
// rengin düşük opaklıklı hâli, metin tam renk. Daire DEĞİL (ADR-0017: daire yalnız halka) —
// pill köşesi kullanılır ama form belirgin biçimde yatay kapsül, tam çember değil.

import { View, type ViewStyle } from 'react-native'

import { useTheme, type ColorToken } from '../../lib/theme'
import { Body } from './Text'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE_COLOR: Record<Tone, ColorToken> = {
  neutral: 'textSecondary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
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
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.pill,
          paddingHorizontal: 12,
          paddingVertical: 5,
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
