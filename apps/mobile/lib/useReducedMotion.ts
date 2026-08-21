// Hareket azaltma tercihi — TEK KAYNAK. Tüm animasyonlar bu hook'tan (ve altındaki
// `motionDuration` yardımcısından) geçer; çağıran yerlerde tek tek if/else YAZILMAZ.
//
// reanimated'ın kendi `useReducedMotion`'ı yalnız uygulama açılışındaki sistem değerini
// verir ve oturum içi değişimde yeniden render tetiklemez (bkz. kütüphane dokümanı).
// Bu yüzden ilk render için reanimated'ın senkron başlangıç değeriyle tohumlanır (animasyon
// açılışta yanlışlıkla oynamasın), ardından RN `AccessibilityInfo` canlı dinleyicisiyle
// (ayarlar ekranında tercih değişirse) güncellenir.

import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated'

/** Hareket azaltma açık mı? Açıksa TÜM animasyonlar süre 0 ile (yani atlanmış) çalışmalı. */
export function useReducedMotion(): boolean {
  const initial = useSystemReducedMotion()
  const [reduced, setReduced] = useState(initial)

  useEffect(() => {
    let mounted = true

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(enabled)
      })
      .catch(() => {
        // Platformda desteklenmiyor/okunamadı — reanimated'ın açılış değeri geçerli kalır.
      })

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduced(enabled)
    })

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduced
}

/**
 * Verilen süreyi hareket azaltma tercihine göre çözer — açıksa 0 (animasyon atlanır),
 * kapalıysa süre aynen döner. Çağrı yerinde koşullu dallanma yerine bu kullanılır:
 * `withTiming(target, { duration: motionDuration(duration.base, reducedMotion) })`.
 */
export function motionDuration(ms: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ms
}
