// İkon düğmesi — başlık/eylem ikonları (ayar dişlisi vb.). Dokunma hedefi ≥44px.
// Renk token'dan; basılıyken hafif opaklık. Ionicons @expo/vector-icons'tan gelir
// (Expo ile uyumlu, ADR-0016 lucide kararı web'e özgü; mobilde Ionicons tercih edilir).

import { Ionicons } from '@expo/vector-icons'
import { Pressable, type ViewStyle } from 'react-native'

import { useTheme, type ColorToken } from '../../lib/theme'

export type IconName = keyof typeof Ionicons.glyphMap

interface IconButtonProps {
  name: IconName
  onPress: () => void
  accessibilityLabel: string
  color?: ColorToken
  size?: number
  style?: ViewStyle
}

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  color = 'textPrimary',
  size = 24,
  style,
}: IconButtonProps) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.control,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={name} size={size} color={theme.colors[color]} />
    </Pressable>
  )
}
