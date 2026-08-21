// Ayar/menü sheet'i — Panel başlığındaki dişli ikonundan açılır. Çıkış yap buradadır
// (Panel gövdesinden çıkarıldı: gövdede havada bir çıkış linki hem bitmemiş görünüyor
// hem yanlış yerdi). React Native `Modal` ile alttan kayan panel + karartılmış zemin.
//
// Aç/kapa geçişi: Modal'ın kendi `animationType` sistemi (sabit sistem hızı/eğrisi) yerine
// reanimated ile sürülür — panel `decelerate` eğrisiyle kayar, zemin aynı sürede solar
// (motion.ts, `base`). Kapanışta gerçek unmount, çıkış geçişi bitene kadar ertelenir ki
// panel aniden kesilmesin. Hareket azaltma açıkken süre 0 — panel/zemin anında son durumuna geçer.

import { useEffect, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { duration, easing } from '../lib/motion'
import { useTheme } from '../lib/theme'
import { motionDuration, useReducedMotion } from '../lib/useReducedMotion'
import { Body, Heading } from './ui'
import { IconButton } from './ui/IconButton'
import { SignOutButton } from './SignOutButton'

interface SettingsSheetProps {
  visible: boolean
  onClose: () => void
  userName?: string
}

// Panelin ekran altına ne kadar taşacağı — gerçek yükseklik ölçmeye gerek bırakmayan,
// içerikten belirgin şekilde büyük sabit bir kayma mesafesi.
const SLIDE_DISTANCE = 480

export function SettingsSheet({ visible, onClose, userName }: SettingsSheetProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const reducedMotion = useReducedMotion()

  // Modal, kapanış geçişi bitene kadar takılı kalır (aksi halde panel aniden kesilir).
  const [mounted, setMounted] = useState(visible)
  // 0 = kapalı, 1 = açık.
  const progress = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    const d = motionDuration(duration.base, reducedMotion)
    if (visible) {
      setMounted(true)
      progress.value = d === 0 ? 1 : withTiming(1, { duration: d, easing: easing.decelerate })
    } else if (d === 0) {
      progress.value = 0
      setMounted(false)
    } else {
      progress.value = withTiming(0, { duration: d, easing: easing.decelerate }, (finished) => {
        if (finished) runOnJS(setMounted)(false)
      })
    }
  }, [visible, reducedMotion, progress])

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SLIDE_DISTANCE }],
  }))

  if (!mounted) return null

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {/* Karartılmış zemin — dışına dokununca kapanır. */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Menüyü kapat"
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]} />
        {/* İçerik alanı — dokunuşu yut (arkaya geçip kapatmasın). */}
        <Pressable onPress={() => {}}>
          <Animated.View
            style={[
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderTopLeftRadius: theme.radius.panel,
                borderTopRightRadius: theme.radius.panel,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
                paddingHorizontal: theme.spacing.xl,
                paddingTop: theme.spacing.lg,
                paddingBottom: insets.bottom + theme.spacing.xl,
                gap: theme.spacing.lg,
              },
              panelStyle,
            ]}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Heading variant="displaySm">Ayarlar</Heading>
              <IconButton name="close" onPress={onClose} accessibilityLabel="Menüyü kapat" />
            </View>

            {userName ? (
              <View style={{ gap: 2 }}>
                <Body variant="bodyMedium">{userName}</Body>
                <Body variant="bodySm" color="textSecondary">
                  Danışan hesabı · Sarmal
                </Body>
              </View>
            ) : null}

            <SignOutButton />
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
})
