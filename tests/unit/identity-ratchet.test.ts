import { describe, expect, it } from 'vitest'

import {
  BASELINES,
  countEmoji,
  countPatterns,
  evaluateRatchet,
  stripComments,
} from '../../scripts/identity-ratchet.mjs'

// ADR-0018 / active_planprogram.md §3b.4: CI ratchet (tek yönlü mandal). Bu dosya
// scripts/identity-ratchet.mjs'in dışa aktardığı SAF fonksiyonları test eder —
// dosya sistemine hiç dokunulmaz, tüm "dosyalar" bellekte oluşturulan sahte
// { path, content } nesneleridir.

// Test baseline'ı — gerçek BASELINES'tan BAĞIMSIZ, küçük ve okunması kolay bir
// tavan seti. Gerçek script'in üretim tavanlarına (49/14/17/0/60) bağımlı
// olmamak testleri BASELINES değiştikçe kırılmaktan korur.
const TEST_BASELINES = {
  'font-black': {
    kind: 'literal' as const,
    literal: 'font-black',
    caseInsensitive: false,
    ceiling: 2,
    label: 'test: font-black',
  },
  '8b5cf6': {
    kind: 'literal' as const,
    literal: '8b5cf6',
    caseInsensitive: true,
    ceiling: 0,
    label: 'test: 8b5cf6',
  },
  emoji: {
    kind: 'emoji' as const,
    ceiling: 1,
    label: 'test: emoji',
  },
}

describe('identity-ratchet — countPatterns', () => {
  it('tavanın ALTINDAKİ bir değer için violation üretmez (evaluateRatchet.ok === true)', () => {
    const files = [
      { path: 'src/app/a.tsx', content: 'export const A = () => <div className="font-black" />' },
    ]

    const counts = countPatterns(files, TEST_BASELINES)
    // `noUncheckedIndexedAccess` sözlük erişimini `| undefined` yapar; anahtarın
    // TEST_BASELINES'ta tanımlı olduğunu (dolayısıyla countPatterns çıktısında da
    // var olacağını) biliyoruz — `!` burada gerçek bir güvenlik açığı değil.
    expect(counts['font-black']!.count).toBe(1)

    const evaluation = evaluateRatchet(counts, TEST_BASELINES)
    expect(evaluation.ok).toBe(true)
    expect(evaluation.violations).toHaveLength(0)
    // Tavan (2) mevcut değerden (1) büyük olduğu için bir "iyileşme" önerisi bekleniyor.
    expect(evaluation.improvements.some((i) => i.key === 'font-black')).toBe(true)
  })

  it('tavanın ÜSTÜNDEKİ bir değer için hata + suçlu dosya listesi üretir', () => {
    const files = [
      { path: 'src/app/a.tsx', content: 'font-black font-black' },
      { path: 'src/app/b.tsx', content: 'font-black' },
    ]

    const counts = countPatterns(files, TEST_BASELINES)
    expect(counts['font-black']!.count).toBe(3) // tavan: 2

    const evaluation = evaluateRatchet(counts, TEST_BASELINES)
    expect(evaluation.ok).toBe(false)

    const violation = evaluation.violations.find((v) => v.key === 'font-black')
    expect(violation).toBeDefined()
    expect(violation?.ceiling).toBe(2)
    expect(violation?.actual).toBe(3)
    // Suçlu dosyalar listelenmeli — yalnızca sayı değil, nereye bakılacağı da net olmalı.
    expect(violation?.files.map((f) => f.path).sort()).toEqual(['src/app/a.tsx', 'src/app/b.tsx'])
    expect(violation?.files.find((f) => f.path === 'src/app/a.tsx')?.count).toBe(2)
    expect(violation?.files.find((f) => f.path === 'src/app/b.tsx')?.count).toBe(1)
  })

  it('tavana TAM EŞİT bir değer için violation üretmez ve iyileşme önermez', () => {
    const files = [{ path: 'src/app/a.tsx', content: 'font-black font-black' }]

    const counts = countPatterns(files, TEST_BASELINES)
    expect(counts['font-black']!.count).toBe(2)

    const evaluation = evaluateRatchet(counts, TEST_BASELINES)
    expect(evaluation.ok).toBe(true)
    expect(evaluation.violations).toHaveLength(0)
    expect(evaluation.improvements.some((i) => i.key === 'font-black')).toBe(false)
  })

  it('`8b5cf6` sayacı büyük/küçük harf duyarsızdır', () => {
    const files = [
      { path: 'src/app/a.tsx', content: 'color: #8B5CF6;' },
      { path: 'src/app/b.tsx', content: 'color: #8b5cf6;' },
      { path: 'src/app/c.tsx', content: 'color: #8B5cF6;' },
    ]

    const counts = countPatterns(files, TEST_BASELINES)
    expect(counts['8b5cf6']!.count).toBe(3)

    const evaluation = evaluateRatchet(counts, TEST_BASELINES)
    expect(evaluation.ok).toBe(false)
    const violation = evaluation.violations.find((v) => v.key === '8b5cf6')
    expect(violation?.actual).toBe(3)
    expect(violation?.files).toHaveLength(3)
  })
})

describe('identity-ratchet — emoji sayacı (Intl.Segmenter + Extended_Pictographic)', () => {
  it('ZWJ ile birleşen bir aile emojisini (👨‍👩‍👧) TEK emoji olarak sayar', () => {
    // 👨‍👩‍👧 = MAN + ZWJ + WOMAN + ZWJ + GIRL — kod noktası bazlı naif bir sayım
    // bunu 3 (veya ZWJ'leri de sayarsa 5) olarak sayardı; grafem kümesi bazlı
    // sayım TEK bir kullanıcı-görünür emoji olarak saymalı.
    expect(countEmoji('👨‍👩‍👧')).toBe(1)
  })

  it('birden fazla bağımsız emojiyi ayrı ayrı sayar', () => {
    expect(countEmoji('😀 metin 🎉 daha metin 👨‍👩‍👧')).toBe(3)
  })

  it('BMP (Miscellaneous Symbols) sembollerini de sayar (naif yüksek-aralık regex kaçırırdı)', () => {
    // U+2600 BLACK SUN WITH RAYS ve U+26A0 WARNING SIGN — ikisi de 0x1F300 altında,
    // `[\u{1F300}-\u{1FAFF}]` gibi naif bir aralık bunları KAÇIRIR. Unicode'un
    // `Extended_Pictographic` verisi bunları emoji-uyumlu olarak işaretler; ama
    // ör. U+2605 BLACK STAR (görsel olarak emoji gibi dursa da) İŞARETLEMEZ —
    // bu resmi veri setinin kod-noktası aralığından değil, Unicode'un kendi
    // emoji-data.txt sınıflandırmasından geldiğinin kanıtıdır.
    expect(countEmoji('☀')).toBe(1) // U+2600 BLACK SUN WITH RAYS
    expect(countEmoji('⚠')).toBe(1) // U+26A0 WARNING SIGN
    expect(countEmoji('★')).toBe(0) // U+2605 BLACK STAR — Extended_Pictographic DEĞİL
  })

  it('emoji İÇERMEYEN Türkçe metni saymaz', () => {
    expect(countEmoji('ışığı gördüğünde çok üşüdüm')).toBe(0)
  })

  it('countPatterns emoji sayarken kod yorumlarını (comments) hariç tutar, string/JSX metnini sayar', () => {
    const files = [
      {
        path: 'src/app/a.tsx',
        content: [
          '// bu bir yorum satırı 😀 (SAYILMAMALI)',
          '/* blok yorum 🎉 da SAYILMAMALI */',
          'export const A = () => <div>Merhaba 👋</div>',
          "const s = '🔥 string literal SAYILMALI'",
        ].join('\n'),
      },
    ]

    const counts = countPatterns(files, TEST_BASELINES)
    // Yalnızca 👋 ve 🔥 sayılmalı (2); yorumlardaki 😀 ve 🎉 sayılmamalı.
    expect(counts.emoji!.count).toBe(2)
  })

  it('stripComments string literal içeriğini değiştirmeden bırakır, yorumları boşaltır', () => {
    const src = "// yorum\nconst x = 'değişmeyen string'; /* blok */ const y = 1"
    const stripped = stripComments(src)
    expect(stripped).toContain("'değişmeyen string'")
    expect(stripped).not.toContain('yorum')
    expect(stripped).not.toContain('blok')
  })
})

describe('identity-ratchet — eski-marka-moru-ondalik (ondalık RGB 139/92/246)', () => {
  // Bu blok GERÇEK üretim `BASELINES`'ını (kopya değil) kullanır — amaç, testin
  // script'te gerçekten çalışan regex'i doğrulaması, ayrı/kayabilecek bir
  // kopyasını değil.

  it('virgüllü + boşluklu klasik biçimi yakalar: "139, 92, 246"', () => {
    const files = [{ path: 'src/components/tabs/StatsTab.tsx', content: 'rgba(139, 92, 246, 0.2)' }]
    const counts = countPatterns(files, BASELINES)
    expect(counts['eski-marka-moru-ondalik']!.count).toBe(1)
  })

  it('boşluksuz virgüllü biçimi yakalar: "139,92,246"', () => {
    const files = [
      {
        path: 'src/components/DashboardTabs.tsx',
        content: 'shadow-[0_0_8px_rgba(139,92,246,0.8)]',
      },
    ]
    const counts = countPatterns(files, BASELINES)
    expect(counts['eski-marka-moru-ondalik']!.count).toBe(1)
  })

  it('yalnızca boşlukla ayrılmış (virgülsüz, modern CSS rgb() sözdizimi) biçimi yakalar: "139 92 246"', () => {
    const files = [{ path: 'src/app/globals.css', content: 'color: rgb(139 92 246 / 0.5);' }]
    const counts = countPatterns(files, BASELINES)
    expect(counts['eski-marka-moru-ondalik']!.count).toBe(1)
  })

  it('alakasız bir üçlüyü YANLIŞ POZİTİF olarak yakalamaz: "139, 92, 200"', () => {
    const files = [{ path: 'src/app/a.tsx', content: 'rgba(139, 92, 200, 0.2)' }]
    const counts = countPatterns(files, BASELINES)
    expect(counts['eski-marka-moru-ondalik']!.count).toBe(0)
  })

  it('bitişik/alakasız rakam dizilerini yakalamaz (kelime sınırı korumasi): "1392 92246"', () => {
    const files = [{ path: 'src/app/a.tsx', content: 'const weirdIds = [1392, 92246]' }]
    const counts = countPatterns(files, BASELINES)
    expect(counts['eski-marka-moru-ondalik']!.count).toBe(0)
  })

  it('tavanın (0) üstüne çıkınca hata + suçlu dosya listesi üretir', () => {
    const files = [{ path: 'src/components/tabs/StatsTab.tsx', content: 'rgba(139, 92, 246, 0.2)' }]
    const counts = countPatterns(files, BASELINES)
    const evaluation = evaluateRatchet(counts, BASELINES)
    expect(evaluation.ok).toBe(false)
    const violation = evaluation.violations.find((v) => v.key === 'eski-marka-moru-ondalik')
    expect(violation?.actual).toBe(1)
    expect(violation?.ceiling).toBe(0)
    expect(violation?.files.map((f) => f.path)).toEqual(['src/components/tabs/StatsTab.tsx'])
  })
})
