// Palet eşitlik testi — mobil palet = web palet (brand-proposal §3, Astra #11).
//
// Web tokens.ts TEK KAYNAKTIR; mobil `lib/palette.ts` onu değer değer yeniden bildirir
// (metro/tsconfig cross-app çözümü yok). Bu test iki dosyayı doğrudan yükleyip her tema ×
// her token için hex eşitliğini, ayrıca token KÜMESİNİN aynı olduğunu doğrular — biri
// güncellenip diğeri unutulursa kırılır. Ek olarak mobil paletin WCAG kontrast matrisini
// (her metin token'ı her yüzeyde ≥4.5, borderControl ≥3) bağımsız olarak denetler.
//
// NEDEN `.mts`: mobil tsconfig include'ı `**/*.ts` — `node:test` import'ları type-check'i
// @types/node gerektirmeden bozmasın (engine.test.mts ile aynı gerekçe).
// Çalıştır: `node --test apps/mobile/lib/palette-parity.test.mts`

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { tokens as web } from '../../web/src/design/tokens.ts'
import { palette as mobile } from './palette.ts'

const themes = ['light', 'dark'] as const

test('mobil ve web aynı token kümesine sahip (her tema)', () => {
  for (const t of themes) {
    assert.deepEqual(
      Object.keys(mobile[t]).sort(),
      Object.keys(web[t]).sort(),
      `${t}: token adları farklı`
    )
  }
})

test('mobil palet web paletiyle birebir aynı (her tema × her token)', () => {
  for (const t of themes) {
    for (const [name, hex] of Object.entries(mobile[t])) {
      const w = (web[t] as Record<string, string>)[name]
      assert.equal(hex.toUpperCase(), w?.toUpperCase(), `${t}.${name}: mobil ${hex} ≠ web ${w}`)
    }
  }
})

// ── WCAG 2.1 kontrast (mobil palet bağımsız denetim) ──────────────────────────
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const TEXT = [
  'textPrimary',
  'textSecondary',
  'accent',
  'focusRing',
  'success',
  'warning',
  'danger',
  'info',
] as const
const SURFACES = ['bg', 'surface', 'surfaceSunken', 'surfaceRaised'] as const

test("her metin token'ı her yüzeyde ≥4.5:1, borderControl ≥3:1", () => {
  for (const t of themes) {
    const p = mobile[t]
    for (const s of SURFACES) {
      for (const tok of TEXT) {
        const r = contrast(p[tok], p[s])
        assert.ok(r >= 4.5, `${t}: ${tok} / ${s} = ${r.toFixed(2)} < 4.5`)
      }
      const rb = contrast(p.borderControl, p[s])
      assert.ok(rb >= 3, `${t}: borderControl / ${s} = ${rb.toFixed(2)} < 3`)
    }
    const ra = contrast(p.accentContrast, p.accent)
    assert.ok(ra >= 4.5, `${t}: accentContrast / accent = ${ra.toFixed(2)}`)
  }
})
