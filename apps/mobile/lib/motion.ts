// Hareket token'ları — web ile birebir aynı süre/easing değerleri (ADR-0015 disiplini:
// sakin, ağır; sıçrama/bounce/elastic YOK). TÜM mobil animasyonlar bu dosyadan beslenir —
// bileşen içinde ham ms/bezier değeri YAZILMAZ.

import { Easing } from 'react-native-reanimated'

/** Süreler (ms). fast = mikro etkileşim (buton basılı), base = standart geçiş,
 * slow = vurgulu/tek seferlik giriş (ör. halka çizimi). */
export const duration = {
  fast: 120,
  base: 200,
  slow: 450,
} as const

/** Easing eğrileri (reanimated `Easing.bezier`). standard = genel amaçlı geçiş,
 * decelerate = ekrana giren/yerleşen öğeler (sheet açılışı, halka çizimi). */
export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0, 0, 0.2, 1),
} as const
