// İkon düğmesi — başlık/eylem ikonları (ayar dişlisi vb.). Dokunma hedefi ≥44px.
// Renk token'dan; basılıyken hafif opaklık. İkonlar Lucide (brand-proposal §5, web ile aynı aile).

import { Pressable, type ViewStyle } from 'react-native'

import { useTheme, type ColorToken } from '../../lib/theme'
import { Icon, type IconName } from './Icon'

export type { IconName } from './Icon'

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
  size = 22,
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
      <Icon name={name} size={size} color={theme.colors[color]} />
    </Pressable>
  )
}
