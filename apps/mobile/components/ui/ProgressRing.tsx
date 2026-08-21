// İMZA ÖĞE — HALKA (ADR-0017), React Native / react-native-svg karşılığı.
//
// TEK ANLAM KURALI: halka YALNIZCA döngü/ilerleme durumu kodlar (haftalık seri,
// kilo hedefine ilerleme). Dekorasyon — avatar çerçevesi, buton süsü, arka plan deseni —
// YASAKTIR. Web'deki `LoopRing` ile aynı sözleşme.
//
// KRİTİK KISIT (ADR-0017): dolgu her zaman state kaynaklı gerçek değerdir — hiçbir pulse/loop/
// kutlama animasyonu YOK. Tek istisna (Motion Doktrini): sürekli halkada (segmentsiz) mount'ta
// mevcut değere TEK SEFERLİK bir çizim geçişi oynar (boştan gerçek değere, `slow` + decelerate);
// bu geçiş halkanın döngü anlamına giden yoldur, sonraki veri güncellemeleri ANINDA (animasyonsuz)
// yansır — halka asla eski/yanlış bir değerde donmaz. Hareket azaltma açıkken çizim atlanır,
// halka doğrudan gerçek değerde açılır. Segmentli halka (haftalık seri) sabit kalır: ayrık
// segmentleri sırayla açmak liste "stagger" izlenimi verir (KAÇIN listesinde), o yüzden
// segment durumları her zaman anlık/gerçek.

import { useEffect, useRef, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'

import { duration, easing } from '../../lib/motion'
import { useTheme } from '../../lib/theme'
import { motionDuration, useReducedMotion } from '../../lib/useReducedMotion'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** Ham değeri 0–1'e indirger; geçersiz girdide 0 (halka asla uydurma dolgu göstermez). */
export function ringProgress(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
}

interface ProgressRingProps {
  value: number
  max: number
  /** Erişilebilir ad — halka BİLGİ taşır, zorunludur. */
  label: string
  /** Ekran okuyucuya okunacak insan-okur değer (ör. "5 / 7 gün"). */
  valueText?: string
  /** Segment sayısı (7 = haftalık döngü). Yoksa sürekli halka. */
  segments?: number
  /** Döngü kapandığında Kapanış yeşiline döner (ADR-0017 kutlama). */
  celebrating?: boolean
  size?: number
  strokeWidth?: number
  /** Halkanın ortasındaki içerik (ör. seri sayısı). */
  children?: ReactNode
}

export function ProgressRing({
  value,
  max,
  label,
  valueText,
  segments,
  celebrating = false,
  size = 132,
  strokeWidth = 12,
  children,
}: ProgressRingProps) {
  const theme = useTheme()
  const reducedMotion = useReducedMotion()
  const center = size / 2
  const radius = Math.max(0, (size - strokeWidth) / 2)
  const circumference = 2 * Math.PI * radius
  const progress = ringProgress(value, max)

  const track = theme.colors.border
  const fill = celebrating ? theme.colors.success : theme.colors.accent

  // Sürekli halkanın dolum ofseti — mount'ta boştan (circumference) gerçek değere tek
  // seferlik geçiş yapar; sonraki güncellemeler anında (animasyonsuz) uygulanır.
  const dashOffset = useSharedValue(circumference)
  const hasDrawn = useRef(false)

  useEffect(() => {
    if (segments !== undefined) return // segmentli halka bu geçişe girmez
    const target = circumference * (1 - progress)
    if (!hasDrawn.current) {
      hasDrawn.current = true
      const d = motionDuration(duration.slow, reducedMotion)
      dashOffset.value =
        d === 0 ? target : withTiming(target, { duration: d, easing: easing.decelerate })
    } else {
      dashOffset.value = target
    }
  }, [circumference, progress, segments, reducedMotion, dashOffset])

  const animatedDashProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }))

  const nodes = []
  if (segments === undefined) {
    // Sürekli halka: tek dolgu dairesi, ofseti mount'ta çizilen paylaşılan değerden gelir.
    nodes.push(
      <AnimatedCircle
        key="progress"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={fill}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        animatedProps={animatedDashProps}
      />
    )
  } else {
    // Segmentli halka: her segment ayrı daire; Math.floor ile yarım segment dolu gösterilmez.
    const count = Math.max(1, Math.floor(segments))
    const step = circumference / count
    const gap = Math.min(step * 0.18, strokeWidth * 1.5)
    const arc = Math.max(0, step - gap)
    const filled = Math.min(count, Math.floor(progress * count + 1e-9))
    for (let i = 0; i < count; i += 1) {
      nodes.push(
        <Circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={i < filled ? fill : track}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={`${arc} ${circumference - arc}`}
          strokeDashoffset={-(i * step)}
        />
      )
    }
  }

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityLabel={label}
      accessibilityValue={{
        min: 0,
        max,
        now: value,
        ...(valueText === undefined ? {} : { text: valueText }),
      }}
    >
      <Svg width={size} height={size}>
        {/* -90° döndürme: döngü 12 yönünden başlar. Statik transform, animasyon değil. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          {/* Sürekli halkada arka iz; segmentli halkada izler zaten yukarıda çizildi. */}
          {segments === undefined ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={track}
              strokeWidth={strokeWidth}
            />
          ) : null}
          {nodes}
        </G>
      </Svg>
      {children === undefined ? null : <View style={styles.center}>{children}</View>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
