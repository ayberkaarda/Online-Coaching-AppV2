// İMZA ÖĞE — HALKA (ADR-0017), React Native / react-native-svg karşılığı.
//
// TEK ANLAM KURALI: halka YALNIZCA döngü/ilerleme durumu kodlar (haftalık seri,
// kilo hedefine ilerleme). Dekorasyon — avatar çerçevesi, buton süsü, arka plan deseni —
// YASAKTIR. Web'deki `LoopRing` ile aynı sözleşme.
//
// KRİTİK KISIT (ADR-0017): dolgu YALNIZCA state kaynaklı `strokeDashoffset`tir. Hiçbir
// animasyon/keyframe yoktur — hareket azaltma tercihi halkayı yanlış bir değerde
// donduramaz; değer her zaman gerçek veridir.

import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, G } from 'react-native-svg'

import { useTheme } from '../../lib/theme'

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
  const center = size / 2
  const radius = Math.max(0, (size - strokeWidth) / 2)
  const circumference = 2 * Math.PI * radius
  const progress = ringProgress(value, max)

  const track = theme.colors.border
  const fill = celebrating ? theme.colors.success : theme.colors.accent

  const nodes = []
  if (segments === undefined) {
    // Sürekli halka: tek dolgu dairesi, offset state'ten.
    nodes.push(
      <Circle
        key="progress"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={fill}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
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
