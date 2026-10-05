// Sarmal sembolü — "Yükselen sarmal" (brand-proposal §2), react-native-svg ile.
// Üç optik sürüm: 48 (logo/splash/≥32px), 24 (UI ≥20px), 16 (≤19px). Küçük boyda kontur
// kalınlaşmaz, tur sayısı azalır. Gövde textPrimary (currentColor), kol accent.
// `mono` tek renkli sürümdür; `thin` boş durum illüstrasyonu için ince çizgili 48'lik sürüm.

import Svg, { G, Path } from 'react-native-svg'

import { useTheme, type ColorToken } from '../../lib/theme'

const OPTICAL = {
  48: {
    stroke: 4,
    body: 'M20.2 20.3 C19.6 19.2 17.4 18.5 15.7 20 C14.1 21.5 13.8 25 16.2 27.2 C18.5 29.4 23.4 29.3 26.1 26 C28.8 22.8 28.4 16.6 24.2 13.4 C20 10.2 12.5 10.9 8.8 16 C5.1 21.1 6.1 29.8 12.1 34.1 C18.1 38.4 28.2 37 33 30.1',
    arm: 'M33 30.1 L41.6 17.7',
  },
  24: {
    stroke: 2.5,
    body: 'M8.7 12.1 C9.2 12.8 10.8 13.2 11.9 12.1 C12.9 11 13 8.7 11.4 7.3 C9.8 5.9 6.6 6 4.9 8.2 C3.2 10.4 3.5 14.4 6.3 16.4 C9.1 18.5 13.9 17.9 16.2 14.5',
    arm: 'M16.2 14.5 L20.2 8.8',
  },
  16: {
    stroke: 2,
    body: 'M7.5 7.6 C8.2 7.1 8.4 5.6 7.4 4.6 C6.3 3.6 4.1 3.6 2.8 5.1 C1.6 6.7 1.8 9.7 3.9 11.2 C5.9 12.7 9.6 12.3 11.4 9.7',
    arm: 'M11.4 9.7 L14 6',
  },
} as const

type Optical = keyof typeof OPTICAL

/** Boya göre optik sürüm: ≥32 → 48, ≥20 → 24, aksi 16. */
export function opticalFor(size: number): Optical {
  if (size >= 32) return 48
  if (size >= 20) return 24
  return 16
}

interface SarmalMarkProps {
  size?: number
  /** Gövde rengi token'ı (varsayılan textPrimary). */
  color?: ColorToken
  /** Tek renk: kol da gövde rengini alır (ör. accent zemin üstünde accentContrast). */
  mono?: boolean
  /** İnce çizgili 48'lik sürüm (boş durum illüstrasyonu). */
  thin?: boolean
  /** Erişilebilir ad; verilmezse dekoratif sayılır. */
  label?: string
}

export function SarmalMark({
  size = 48,
  color = 'textPrimary',
  mono = false,
  thin = false,
  label,
}: SarmalMarkProps) {
  const theme = useTheme()
  const version: Optical = thin ? 48 : opticalFor(size)
  const spec = OPTICAL[version]
  const bodyColor = theme.colors[color]
  const armColor = mono ? bodyColor : theme.colors.accent
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${version} ${version}`}
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
    >
      <G
        fill="none"
        strokeWidth={thin ? 1.5 : spec.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d={spec.body} stroke={bodyColor} />
        <Path d={spec.arm} stroke={armColor} />
      </G>
    </Svg>
  )
}
