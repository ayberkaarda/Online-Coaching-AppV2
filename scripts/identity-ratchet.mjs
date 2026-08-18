// CI ratchet (tek yönlü mandal) — ADR-0018.
//
// Eski görsel dilin (font-black, gradyanlar, rounded-3xl, ham #8b5cf6 — hem HEX hem
// ONDALIK RGB biçimiyle —, emoji) kod tabanına yeniden SIZMASINI engeller. Faz 1.6
// (ADR-0018 Katman A) yalnızca token
// sistemini kurar; ekranlar bilerek eski dili Faz 2'ye kadar taşımaya devam eder
// (49 font-black, 17 rounded-3xl, 14 gradyan). Bu script o sayıların ARTMASINI
// engeller — iyileşmeyi zorlamaz, yalnızca kötüleşmeyi engeller. Bir PR bir sayacı
// düşürürse, yeni (daha düşük) değer bu dosyada elle güncellenip yeni tavan olur.
//
// Baseline'lar (BASELINES) BİLEREK ayrı bir JSON/config dosyasında DEĞİL, bu
// dosyanın içinde saklanıyor: tavan değişikliği böylece her zaman code review'da
// görünen bir kod diff'i olur (bkz. ADR-0018 "CI ratchet — tek yönlü mandal").
//
// Kullanım:
//   node scripts/identity-ratchet.mjs
//   node scripts/identity-ratchet.mjs --json
//   npm run ratchet
//
// Harici bağımlılık YOK — yalnızca Node'un fs/path/url modülleri kullanılır.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
// Faz 4.5 (ADR-0023): uygulama kaynağı `apps/web/src`e taşındı; script kökte kaldı.
const SRC_DIR = path.resolve(ROOT_DIR, 'apps', 'web', 'src')

// Taranan uzantılar — ADR-0018 kapsamı `src/**/*.{ts,tsx,css}`.
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.css'])

// ---------------------------------------------------------------------------
// BASELINES — tek yönlü mandal tablosu (ADR-0018, active_planprogram.md §3b.4).
//
// `ceiling`, ilgili sayacın 2026-08-17 itibarıyla ölçülen değeridir. Bu değerin
// ÜSTÜNE çıkmak CI'da hatadır. ALTINA düşmek hata değildir — bilgi mesajı basılır
// ve yeni (daha düşük) sayı bu tabloda elle baseline yapılabilir. Tavan asla
// script tarafından otomatik yükseltilmez.
// ---------------------------------------------------------------------------
export const BASELINES = {
  'font-black': {
    kind: 'literal',
    literal: 'font-black',
    caseInsensitive: false,
    // 2026-08-17: Faz 2 Katman B dönüşümüyle 49 -> 25'e düştü; ADR-0018 gereği
    // yeni tavan ölçülen değere indirildi (bkz. "düşürdüğünde yeni değer
    // baseline olur, tavan asla yükselmez").
    ceiling: 25,
    label: "`font-black` sınıfı (900 ağırlık — Faz 1.6 kapsamı dışı, Faz 2 Katman B'de dönüşür)",
  },
  'bg-gradient-to-': {
    kind: 'literal',
    literal: 'bg-gradient-to-',
    caseInsensitive: false,
    // 2026-08-17: Faz 2 Katman B dönüşümüyle 14 -> 12'ye düştü; tavan buna indirildi.
    ceiling: 12,
    label: "`bg-gradient-to-*` gradyanları (Faz 2 Katman B'de dönüşür)",
  },
  'rounded-3xl': {
    kind: 'literal',
    literal: 'rounded-3xl',
    caseInsensitive: false,
    // 2026-08-17: Faz 2 Katman B dönüşümüyle 17 -> 15'e düştü; tavan buna indirildi.
    ceiling: 15,
    label: "`rounded-3xl` sınıfı (Faz 2 Katman B'de dönüşür)",
  },
  '8b5cf6': {
    kind: 'literal',
    literal: '8b5cf6',
    caseInsensitive: true,
    ceiling: 0,
    label: "ham `#8b5cf6` rengi (Faz 1.6 kapsamı — token'a çekilip 0'da kilitlenir, AC-1.6.2)",
  },
  'eski-marka-moru-ondalik': {
    kind: 'regex',
    // #8b5cf6 ONDALIK RGB üçlüsü olarak: R=139, G=92, B=246. `8b5cf6` literal
    // sayacı yalnızca HEX yazımını yakalar; bu üçlü `rgba(139, 92, 246, 0.2)`
    // (Chart.js dolgu rengi) ve `shadow-[0_0_8px_rgba(139,92,246,0.8)]` (Tailwind
    // keyfi değer / glow gölgesi) gibi yerlerde HİÇ hex string'i olmadan aynı
    // rengi temsil eder — bu turda ikisi de yalnızca ELLE arayarak bulundu.
    // Regex boşluk/virgül biçiminden bağımsız olmalı: `139, 92, 246` (klasik
    // virgüllü), `139,92,246` (boşluksuz) ve `139 92 246` (modern CSS
    // `rgb(139 92 246 / 0.2)` boşluklu sözdizimi) hepsi eşleşmeli — bu yüzden
    // virgül `,?` ile OPSİYONEL, ayraçlar `\s*` ile serbest bırakıldı. `\b`
    // kelime sınırları "1392" veya "92246" gibi bitişik/alakasız sayı
    // dizilerinin YANLIŞLIKLA eşleşmesini engeller (rakam-rakam arasında \b
    // oluşmaz, dolayısıyla "139" yalnızca gerçekten "139" iken eşleşir).
    pattern: /\b139\b\s*,?\s*\b92\b\s*,?\s*\b246\b/g,
    ceiling: 0,
    label:
      'ham #8b5cf6 renginin ONDALIK RGB biçimi (139, 92, 246) — hex sayaç bunu YAKALAMAZ, Faz 1.6 kapsamı, AC-1.6.2',
  },
  emoji: {
    kind: 'emoji',
    // Bu sayı script'in KENDİ ölçüm yöntemiyle (bkz. aşağıdaki `countEmoji` /
    // `stripComments`) ölçülür — 2026-08-17'de baseline 59 idi. Faz 2a
    // (ADR-0016 Lucide dönüşümü) tüm fonksiyonel emoji'leri `lucide-react`
    // ikonlarına çevirdi; ölçüm 0'a indi ve ADR-0018'in "düşürdüğünde yeni
    // değer baseline olur" kuralı gereği tavan 0'da KİLİTLENDİ. Bundan
    // sonra src/**/*.{ts,tsx,css} içine giren HER emoji CI'ı kırar.
    // Kutlama anları da emoji ile kodlanmaz (ADR-0016 tek istisna kuralı):
    // karşılığı ADR-0017'nin imza öğesi `LoopRing`'dir.
    ceiling: 0,
    label: 'JSX/string emoji kullanımı (ADR-0016 — Lucide dönüşümü sonrası 0’da kilitli)',
  },
}

// ---------------------------------------------------------------------------
// Dosya toplama
// ---------------------------------------------------------------------------

/** `src/` altında taranacak uzantılara sahip tüm dosyaların MUTLAK yollarını döndürür. */
function collectFiles(dir) {
  const results = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(full))
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Literal sayaçlar (font-black, bg-gradient-to-, rounded-3xl, 8b5cf6)
// ---------------------------------------------------------------------------

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `grep -o <literal> | wc -l` ile birebir aynı yöntem: örtüşmeyen, ham alt-dize sayımı. */
function countLiteralOccurrences(content, literal, caseInsensitive) {
  const re = new RegExp(escapeRegExp(literal), caseInsensitive ? 'gi' : 'g')
  const matches = content.match(re)
  return matches ? matches.length : 0
}

/**
 * Serbest biçimli (regex tabanlı) sayaçlar için — ör. `eski-marka-moru-ondalik`.
 * `String.prototype.match` global bayraklı bir regex'te çağrıldığında dahili
 * olarak `lastIndex`'i sıfırlar, bu yüzden aynı (global) RegExp nesnesini
 * birden çok dosya için tekrar tekrar güvenle kullanabiliriz.
 */
function countRegexOccurrences(content, pattern) {
  const matches = content.match(pattern)
  return matches ? matches.length : 0
}

// ---------------------------------------------------------------------------
// Emoji sayacı
//
// Üç bilinen tuzak (bkz. ADR-0018 ve görev tanımı) ve bu script'in her birine
// verdiği yanıt:
//
//   (a) ZWJ ile birleşen aile/meslek emojileri (ör. 👨‍👩‍👧) birden çok kod
//       noktasından oluşur; kod-noktası bazlı sayım bunu 3-5 ayrı emoji sayar.
//       Çözüm: `Intl.Segmenter('grapheme')` ile metni GRAFEM KÜMELERİNE böl —
//       ZWJ dizileri UAX#29 grafem sınırı kurallarına göre TEK kümedir, yani
//       tek grafem = tek "kullanıcının gördüğü emoji" (Node 18+ destekler;
//       burada v26 kullanılıyor).
//   (b) `[\u{1F300}-\u{1FAFF}]` gibi naif, yalnızca "yüksek" kod noktalarını
//       kapsayan bir aralık ☀ (U+2600 BLACK SUN WITH RAYS), ⚠ (U+26A0 WARNING
//       SIGN), ✅ (U+2705 WHITE HEAVY CHECK MARK) gibi BMP içindeki
//       (Miscellaneous Symbols bloğundaki) emoji-uyumlu sembolleri KAÇIRIR.
//       Çözüm: kod noktası aralığı yerine Unicode'un emoji-data.txt kaynaklı
//       RESMİ `\p{Extended_Pictographic}` özelliğini kullan — bu özellik
//       "emoji olarak kullanılabilecek pictographic karakterler" kümesini
//       blok/aralıktan bağımsız tanımlar. Not: bu resmi küme her "sembol
//       görünümlü" karakteri içermez — ör. düz ★ (U+2605 BLACK STAR) veya düz
//       ✓ (U+2713 CHECK MARK) Unicode'a göre pictographic SAYILMAZ (emoji
//       varyantları ✅/⭐ ayrı kod noktalarıdır). Bu, kod noktası aralığı
//       yerine resmi sınıflandırmayı kullanmanın tam olarak beklenen
//       davranışıdır — "emoji gibi görünen her sembol" değil, "Unicode'un
//       emoji kümesi" sayılır.
//   (c) Kod yorumlarındaki (`//`, `/* */`) emojiler ekranda GÖRÜNMEZ; ADR-0018
//       ve görev tanımı yalnızca string literal / JSX metnindeki kullanımın
//       sayılmasını istiyor. Tam bir TS/TSX parser'ı harici bağımlılık
//       gerektirir (yasak); bunun yerine `stripComments` adında hafif bir
//       durum makinesi (lexer) kullanılıyor: `//`, `/* */` içeriğini boşluğa
//       çevirir, string/template literal içeriğini OLDUĞU GİBİ bırakır (JSX
//       metni zaten hiçbir tırnak içinde değildir, dolayısıyla dokunulmadan
//       kalır). Tam bir parser değildir — ör. bir regex literal'i içindeki
//       `/.../ ` bu lexer tarafından yanlış yorumlanabilir. ADR-0018 bu tür
//       yanlış pozitif riskini ("grep tabanlıdır... basitliği bu riske
//       tercih edildi") zaten kabul ediyor; aynı ödünleşim burada da geçerli.
// ---------------------------------------------------------------------------

const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const GRAPHEME_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' })

/**
 * Kaynak kodundan yorumları (`//...`, `/*...*​/`) sıyırır; string/template
 * literal içeriğini ve JSX metnini OLDUĞU GİBİ bırakır. Tam bir parser
 * DEĞİLDİR — bkz. yukarıdaki (c) notu.
 */
export function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  // Template literal içinde `${ ... }` ifadesine girildiğinde, o ifadenin
  // parantez derinliğini burada tutuyoruz; derinlik 0'a inince STR_TEMPLATE
  // durumuna geri dönülür.
  const templateExprDepth = []
  let state = 'CODE'

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    switch (state) {
      case 'CODE': {
        if (c === '/' && c2 === '/') {
          state = 'LINE_COMMENT'
          i += 2
          continue
        }
        if (c === '/' && c2 === '*') {
          state = 'BLOCK_COMMENT'
          i += 2
          continue
        }
        if (c === "'") {
          state = 'STR_SINGLE'
          out += c
          i++
          continue
        }
        if (c === '"') {
          state = 'STR_DOUBLE'
          out += c
          i++
          continue
        }
        if (c === '`') {
          state = 'STR_TEMPLATE'
          out += c
          i++
          continue
        }
        if (templateExprDepth.length > 0) {
          if (c === '{') templateExprDepth[templateExprDepth.length - 1]++
          else if (c === '}') {
            templateExprDepth[templateExprDepth.length - 1]--
            if (templateExprDepth[templateExprDepth.length - 1] === 0) {
              templateExprDepth.pop()
              out += c
              state = 'STR_TEMPLATE'
              i++
              continue
            }
          }
        }
        out += c
        i++
        continue
      }
      case 'LINE_COMMENT': {
        if (c === '\n') {
          out += c
          state = 'CODE'
        }
        i++
        continue
      }
      case 'BLOCK_COMMENT': {
        if (c === '*' && c2 === '/') {
          state = 'CODE'
          i += 2
          continue
        }
        if (c === '\n') out += c
        i++
        continue
      }
      case 'STR_SINGLE':
      case 'STR_DOUBLE': {
        const quote = state === 'STR_SINGLE' ? "'" : '"'
        if (c === '\\') {
          out += c + (c2 ?? '')
          i += 2
          continue
        }
        out += c
        i++
        if (c === quote) state = 'CODE'
        continue
      }
      case 'STR_TEMPLATE': {
        if (c === '\\') {
          out += c + (c2 ?? '')
          i += 2
          continue
        }
        if (c === '`') {
          out += c
          state = 'CODE'
          i++
          continue
        }
        if (c === '$' && c2 === '{') {
          out += c + c2
          templateExprDepth.push(1)
          state = 'CODE'
          i += 2
          continue
        }
        out += c
        i++
        continue
      }
    }
  }
  return out
}

/** Metindeki grafem kümesi başına 1 emoji sayan, ZWJ/varyasyon seçici duyarlı sayaç. */
export function countEmoji(text) {
  let count = 0
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
    if (EXTENDED_PICTOGRAPHIC.test(segment)) count++
  }
  return count
}

// ---------------------------------------------------------------------------
// Saf sayma fonksiyonu — dosya sistemine bağımlı DEĞİLDİR, testlerde doğrudan
// çağrılabilir.
// ---------------------------------------------------------------------------

/**
 * @param {Array<{ path: string, content: string }>} files
 * @param {typeof BASELINES} baselines
 * @returns {Record<string, { count: number, files: Array<{ path: string, count: number }> }>}
 */
export function countPatterns(files, baselines = BASELINES) {
  const results = {}

  for (const [key, baseline] of Object.entries(baselines)) {
    const fileCounts = []
    let total = 0

    for (const file of files) {
      let n
      if (baseline.kind === 'emoji') {
        n = countEmoji(stripComments(file.content))
      } else if (baseline.kind === 'regex') {
        n = countRegexOccurrences(file.content, baseline.pattern)
      } else {
        n = countLiteralOccurrences(file.content, baseline.literal, baseline.caseInsensitive)
      }
      if (n > 0) {
        fileCounts.push({ path: file.path, count: n })
        total += n
      }
    }

    fileCounts.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    results[key] = { count: total, files: fileCounts }
  }

  return results
}

/**
 * Sayım sonuçlarını tavanlarla karşılaştırır. Dosya sistemine bağımlı DEĞİLDİR.
 * @param {ReturnType<typeof countPatterns>} counts
 * @param {typeof BASELINES} baselines
 */
export function evaluateRatchet(counts, baselines = BASELINES) {
  const violations = []
  const improvements = []

  for (const [key, baseline] of Object.entries(baselines)) {
    const result = counts[key]
    if (!result) continue

    if (result.count > baseline.ceiling) {
      violations.push({
        key,
        label: baseline.label,
        ceiling: baseline.ceiling,
        actual: result.count,
        files: result.files,
      })
    } else if (result.count < baseline.ceiling) {
      improvements.push({
        key,
        label: baseline.label,
        ceiling: baseline.ceiling,
        actual: result.count,
      })
    }
  }

  return { ok: violations.length === 0, violations, improvements }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHumanReadable(counts, evaluation) {
  console.log('Kimlik ratchet (ADR-0018) — src/**/*.{ts,tsx,css} tarandı.\n')

  for (const [key, baseline] of Object.entries(BASELINES)) {
    const result = counts[key]
    const status =
      result.count > baseline.ceiling
        ? 'İHLAL'
        : result.count === baseline.ceiling
          ? 'OK'
          : 'İYİLEŞME'
    console.log(
      `  [${status}] ${key}: ${result.count} / tavan ${baseline.ceiling} — ${baseline.label}`
    )
  }
  console.log('')

  if (evaluation.violations.length > 0) {
    console.error('HATA: aşağıdaki sayaçlar kilitli tavanın ÜSTÜNE çıktı:\n')
    for (const v of evaluation.violations) {
      console.error(`  - ${v.key}: tavan ${v.ceiling}, mevcut ${v.actual} (${v.label})`)
      console.error(`    Artışa neden olan dosyalar (azalan sırada):`)
      for (const f of v.files) {
        console.error(`      ${f.path} (${f.count})`)
      }
      console.error('')
    }
    console.error(
      'Tavan asla otomatik yükselmez. Bu bir Faz 2 (Katman B) ekran dönüşümü değilse, ' +
        'eklediğiniz eski-dil kullanımını geri alın. Bilerek düşürüyorsanız ' +
        'scripts/identity-ratchet.mjs içindeki BASELINES.ceiling değerini elle güncelleyin.'
    )
  }

  if (evaluation.improvements.length > 0) {
    console.log('BİLGİ: aşağıdaki sayaçlar tavanın ALTINDA — tavan düşürülebilir:\n')
    for (const imp of evaluation.improvements) {
      console.log(
        `  - ${imp.key}: tavan ${imp.ceiling}, mevcut ${imp.actual} → önerilen yeni tavan: ${imp.actual}`
      )
    }
    console.log('')
  }

  if (evaluation.ok && evaluation.improvements.length === 0) {
    console.log('Tüm sayaçlar tavanla eşit. Ratchet yeşil.')
  } else if (evaluation.ok) {
    console.log('Ratchet yeşil (hiçbir tavan aşılmadı).')
  }
}

function printJson(counts, evaluation) {
  const payload = {
    ok: evaluation.ok,
    counters: Object.fromEntries(
      Object.entries(counts).map(([key, result]) => [
        key,
        { count: result.count, ceiling: BASELINES[key].ceiling, files: result.files },
      ])
    ),
    violations: evaluation.violations,
    improvements: evaluation.improvements,
  }
  console.log(JSON.stringify(payload, null, 2))
}

function main() {
  const args = process.argv.slice(2)
  const jsonOutput = args.includes('--json')

  const absoluteFiles = collectFiles(SRC_DIR)
  const files = absoluteFiles.map((absPath) => ({
    path: path.relative(ROOT_DIR, absPath).split(path.sep).join('/'),
    content: fs.readFileSync(absPath, 'utf8'),
  }))

  const counts = countPatterns(files)
  const evaluation = evaluateRatchet(counts)

  if (jsonOutput) {
    printJson(counts, evaluation)
  } else {
    printHumanReadable(counts, evaluation)
  }

  process.exitCode = evaluation.ok ? 0 : 1
}

// Yalnızca doğrudan `node scripts/identity-ratchet.mjs` ile çalıştırıldığında
// CLI'ı tetikle — testler `countPatterns`/`evaluateRatchet`'i import ederken
// bu bloğun çalışmasını istemez.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
