// Buton — accent zemin + control köşe (8px). Web'in birincil buton deseninin RN karşılığı.
// Dokunma hedefi ≥44px (minHeight 48). Durumlar: pending (spinner), disabled (soluk), basılı
// (reanimated ile scale 0.97 + hafif opaklık, `fast` süre — Motion Doktrini). Gradyan/gölge YOK.

import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { duration, easing } from '../../lib/motion'
import { useTheme, type Colors } from '../../lib/theme'
import { motionDuration, useReducedMotion } from '../../lib/useReducedMotion'
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
  const reducedMotion = useReducedMotion()

  // 0 = dinlenme, 1 = basılı. Ölçek 1 → 0.97, opaklık 1 → 0.85 (hafif) buradan türer.
  const pressProgress = useSharedValue(0)

  const pressedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * 0.03 }],
    opacity: 1 - pressProgress.value * 0.15,
  }))

  const setPressed = (pressed: boolean) => {
    const d = motionDuration(duration.fast, reducedMotion)
    pressProgress.value = withTiming(pressed ? 1 : 0, { duration: d, easing: easing.standard })
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: pending }}
      style={[
        styles.base,
        {
          backgroundColor: skin.bg,
          borderColor: skin.border,
          borderRadius: theme.radius.control,
        },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <Animated.View style={[styles.inner, pressedStyle]}>
        {pending ? (
          <ActivityIndicator color={theme.colors[skin.fg]} size="small" />
        ) : (
          <Body variant="bodyMedium" color={skin.fg}>
            {title}
          </Body>
        )}
      </Animated.View>
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
  disabled: { opacity: 0.45 },
})
