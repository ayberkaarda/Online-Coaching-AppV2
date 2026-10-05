// Kart yüzeyi — surface zemin + 1px dekoratif kenarlık + token'lı köşe (card 16 / panel 24).
// Kart gölgesizdir (brand-proposal §5): açık temada Kemik zemin üstünde beyaz kart, koyu temada
// Gece üstünde #1C1A17. Modal/sheet gibi yükselen yüzeyler `theme.shadow.raised` + surfaceRaised kullanır.
// İç boşluk mobilde 16.

import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

import { useTheme } from '../../lib/theme'

interface CardProps {
  children: ReactNode
  /** panel = 24px köşe (hero bloklar); card = 16px köşe. İkisi de surface. */
  variant?: 'card' | 'panel'
  style?: ViewStyle
}

export function Card({ children, variant = 'card', style }: CardProps) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: variant === 'panel' ? theme.radius.panel : theme.radius.card,
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
