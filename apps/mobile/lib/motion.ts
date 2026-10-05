// Hareket token'ları — "Ritim, gösteri değil" (brand-proposal §6). Web ile aynı süre/eğri
// değerleri; sıçrama/bounce/elastic YOK, döngüsel animasyon YOK (tek istisna skeleton nabzı).
// TÜM mobil animasyonlar ve haptikler bu dosyadan beslenir — bileşende ham ms/bezier yazılmaz.

import * as Haptics from 'expo-haptics'
import { Platform } from 'react-native'
import { Easing } from 'react-native-reanimated'

/** Süreler (ms). fast = basış/hover, base = sayfa/sheet, reward = set/PR ödül anı,
 * pulse = skeleton nabzı (tek döngüsel istisna). */
export const duration = {
  fast: 120,
  base: 220,
  reward: 600,
  pulse: 1600,
} as const

/** Eğriler. standard = genel, decelerate = giriş, accelerate = çıkış. */
export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0, 0, 0, 1),
  accelerate: Easing.bezier(0.3, 0, 1, 1),
} as const

/** Basışta ölçek (§6). */
export const PRESS_SCALE = 0.97

// Haptikler azaltılmış harekette de KALIR (§6). Web'de / desteklenmeyen cihazda sessizce yutulur.
function safe(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return
  run().catch(() => undefined)
}

export const haptic = {
  /** Buton basışı. */
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Set tamamlandı / PR anı. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
} as const
