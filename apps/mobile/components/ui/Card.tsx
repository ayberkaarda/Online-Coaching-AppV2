// Kart yüzeyi — surfaceRaised zemin + 1px görünür kenarlık + token'lı köşe. Web'in kart
// desenlerinin RN karşılığı. Açık temada Tebeşir zemin üstünde beyaz kart + kenar "pop"
// yapar; koyu temada surfaceRaised (#313337) zeminden açılır. Gölge YOK (kimlik disiplini) —
// yükselme kenarlık + yüzey kademesiyle kurulur (ADR-0015).

import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

import { useTheme } from '../../lib/theme'

interface CardProps {
  children: ReactNode
  /** panel = 16px köşe (hero bloklar); card = 12px köşe. İkisi de surfaceRaised. */
  variant?: 'card' | 'panel'
  style?: ViewStyle
}

export function Card({ children, variant = 'card', style }: CardProps) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfaceRaised,
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
