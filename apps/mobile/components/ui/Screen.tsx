// Ekran kabuğu — güvenli alan + tema zemini. Her danışan ekranı bununla sarılır ki
// zemin token'dan gelsin (açık/koyu) ve içerik çentik/ev çubuğuyla çakışmasın.

import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../../lib/theme'

interface ScreenProps {
  children: ReactNode
  /** İçerik kaydırılabilir mi (uzun listeler için). Varsayılan true. */
  scroll?: boolean
  /** İçeriği dikeyde ortala (giriş/boş durum ekranları). */
  center?: boolean
  contentStyle?: ViewStyle
  /** Üst güvenli alanı uygula (başlıksız ekranlarda gerekir). Varsayılan false. */
  edgeTop?: boolean
}

export function Screen({
  children,
  scroll = true,
  center = false,
  contentStyle,
  edgeTop = false,
}: ScreenProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const padding: ViewStyle = {
    padding: theme.spacing.xl,
    paddingTop: (edgeTop ? insets.top : 0) + theme.spacing.xl,
    paddingBottom: insets.bottom + theme.spacing.xl,
    gap: theme.spacing.lg,
  }

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.colors.bg }]}
        contentContainerStyle={[padding, center && styles.centerContent, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
  }

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: theme.colors.bg },
        padding,
        center && styles.centerContent,
        contentStyle,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
})
