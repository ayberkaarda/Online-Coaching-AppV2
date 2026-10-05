// "Yükselen sarmal" — Sarmal'ın sembolü (marka kararı v2 "Kor & Kemik", §2).
//
// Tek merkezli Arşimet sarmalı; dış uç son teğet doğrultusunda düz bir kolla sağ üste
// çıkar (ok ucu yok). Üç optik sürüm vardır: küçük boylarda kontur kalınlaşmaz, TUR
// SAYISI azalır (48: 1,75 tur · 24: 1,25 tur · 16: 1,0 tur). Gövde `currentColor`,
// kol `rgb(var(--color-accent))` — tema ile birlikte döner. `mono` sürümde ikisi de
// `currentColor`. Statik dosyalar (dış kullanım) `public/brand/sarmal-mark*.svg`.

import type { JSX } from 'react'

const VERSIONS = {
  48: {
    body: 'M20.2 20.3 C19.6 19.2 17.4 18.5 15.7 20 C14.1 21.5 13.8 25 16.2 27.2 C18.5 29.4 23.4 29.3 26.1 26 C28.8 22.8 28.4 16.6 24.2 13.4 C20 10.2 12.5 10.9 8.8 16 C5.1 21.1 6.1 29.8 12.1 34.1 C18.1 38.4 28.2 37 33 30.1',
    arm: 'M33 30.1 L41.6 17.7',
    stroke: 4,
  },
  24: {
    body: 'M8.7 12.1 C9.2 12.8 10.8 13.2 11.9 12.1 C12.9 11 13 8.7 11.4 7.3 C9.8 5.9 6.6 6 4.9 8.2 C3.2 10.4 3.5 14.4 6.3 16.4 C9.1 18.5 13.9 17.9 16.2 14.5',
    arm: 'M16.2 14.5 L20.2 8.8',
    stroke: 2.5,
  },
  16: {
    body: 'M7.5 7.6 C8.2 7.1 8.4 5.6 7.4 4.6 C6.3 3.6 4.1 3.6 2.8 5.1 C1.6 6.7 1.8 9.7 3.9 11.2 C5.9 12.7 9.6 12.3 11.4 9.7',
    arm: 'M11.4 9.7 L14 6',
    stroke: 2,
  },
} as const

/** Görüntülenen boya uygun optik sürüm: ≤19px → 16, ≤31px → 24, üstü → 48. */
export function sarmalVersionFor(size: number): 16 | 24 | 48 {
  if (size <= 19) return 16
  if (size < 32) return 24
  return 48
}

export interface SarmalMarkProps {
  /** Piksel boyu (kare). */
  size?: number
  /** Tek renk: kol da `currentColor` olur. */
  mono?: boolean
  /** İnce çizgili sürüm (boş durum illüstrasyonu). Yalnız 48'lik sürümde anlamlıdır. */
  thin?: boolean
  className?: string
  /** Verilirse sembol erişilebilir bir görsel olur; verilmezse dekoratiftir. */
  title?: string
}

export function SarmalMark({
  size = 24,
  mono = false,
  thin = false,
  className,
  title,
}: SarmalMarkProps): JSX.Element {
  const version = sarmalVersionFor(size)
  const v = VERSIONS[version]
  const strokeWidth = thin ? v.stroke / 2 : v.stroke
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${version} ${version}`}
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={v.body} stroke="currentColor" />
      <path d={v.arm} stroke={mono ? 'currentColor' : 'rgb(var(--color-accent))'} />
    </svg>
  )
}

export interface SarmalLogoProps {
  /** Logotype'ın font boyu (px). Sembol x-yüksekliğine ortalanır. */
  fontSize?: number
  className?: string
}

/**
 * Logotype: sembol solda + "sarmal" (küçük harf, Bricolage Grotesque 700, -2% aralık).
 * Sembol ile yazı arası boşluk sembol genişliğinin %35'i.
 */
export function SarmalLogo({ fontSize = 32, className }: SarmalLogoProps): JSX.Element {
  const markSize = Math.round(fontSize * 1.3)
  return (
    <span
      className={`inline-flex items-center font-display font-bold text-fg ${className ?? ''}`}
      style={{
        fontSize,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        gap: Math.round(markSize * 0.35),
      }}
    >
      <SarmalMark size={markSize} />
      <span>sarmal</span>
    </span>
  )
}
