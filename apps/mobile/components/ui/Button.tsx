// Buton — accent zemin + control köşe (8px). Web'in birincil buton deseninin RN karşılığı.
// Dokunma hedefi ≥44px (minHeight 48). Durumlar: pending (spinner), disabled (soluk), basılı
// (hafif opaklık). Gradyan/gölge YOK (web disiplini).

import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'

import { useTheme, type Colors } from '../../lib/theme'
import { Body } from './Text'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  pending?: boolean
  style?: ViewStyle
  accessibilityLabel?: string
}

function surfaceFor(
  variant: Variant,
  colors: Colors
): { bg: string; border: string; fg: keyof Colors } {
  switch (variant) {
    case 'primary':
      return { bg: colors.accent, border: colors.accent, fg: 'accentContrast' }
    case 'danger':
      return { bg: colors.danger, border: colors.danger, fg: 'accentContrast' }
    case 'secondary':
      return { bg: colors.surface, border: colors.border, fg: 'textPrimary' }
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', fg: 'accent' }
  }
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  pending = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme()
  const isDisabled = disabled || pending
  const skin = surfaceFor(variant, theme.colors)

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: pending }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: skin.bg,
          borderColor: skin.border,
          borderRadius: theme.radius.control,
        },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.inner}>
        {pending ? (
          <ActivityIndicator color={theme.colors[skin.fg]} size="small" />
        ) : (
          <Body variant="bodyMedium" color={skin.fg}>
            {title}
          </Body>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
})
