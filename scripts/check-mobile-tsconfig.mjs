// B-057 GUARD — `apps/mobile/tsconfig.json`'un `expo` tarafından sessizce yeniden
// yazılmasını CI'da yakalar.
//
// SORUN: `expo start` / `expo run` / `expo export` çalıştırıldığında Expo,
// `apps/mobile/tsconfig.json`'u kendi şablonuna göre YENİDEN YAZAR:
//   * TÜM yorumları siler (dosyadaki `//` açıklama satırları),
//   * `include` dizisinden `.expo/types/**/*.ts` ve `expo-env.d.ts` girdilerini ÇIKARIR,
//   * Prettier'ın reddettiği bir biçime sokar.
// Bu rewrite yerelde sessizce olur; farkında olmadan commit'lenirse bu turda İKİ KEZ
// CI'ı kırdı (bkz. docs/PROGRESS.md §4 tuzak kaydı).
//
// NEDEN CI, NEDEN git-hook DEĞİL: git-hook yerelde `--no-verify` ile ATLANABİLİR ve taze
// bir checkout'ta hiç kurulu olmayabilir — yani sessizce delinebilir. CI adımı
// atlanamaz; kapı burada olmalı. Bu script `mobile` job'unda, `expo` komutları
// (`expo-doctor`/`expo export`) çalışmadan ÖNCE koşar, böylece COMMIT'LENMİŞ dosyayı
// (checkout hâlini) doğrular — CI içinde expo'nun rewrite'ını değil.
//
// KAPSAM: yalnız `apps/mobile/tsconfig.json` OKUNUR, ASLA DEĞİŞTİRİLMEZ. Prettier biçim
// denetimi ayrı bir CI adımıyla (`prettier --check`) yapılır; bu script yapısal
// (anahtar alan) değişmezleri doğrular.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const tsconfigPath = resolve(here, '..', 'apps', 'mobile', 'tsconfig.json')

/** `include` dizisinde MUTLAKA bulunması gereken, expo rewrite'ının çıkardığı girdiler. */
const REQUIRED_INCLUDE = ['.expo/types/**/*.ts', 'expo-env.d.ts']

function fail(message) {
  console.error(`::error file=apps/mobile/tsconfig.json::${message}`)
  console.error(
    'apps/mobile/tsconfig.json, beklenen biçimden SAPMIŞ görünüyor. En olası neden: bir\n' +
      '`expo start`/`expo export` çalıştırması dosyayı yeniden yazdı (yorumları sildi,\n' +
      "`include`'dan .expo/types + expo-env.d.ts girdilerini çıkardı) ve bu hâli commit'lendi.\n" +
      "DÜZELTME: dosyayı bilinen doğru hâline geri getir (git ile geri al) ve o rewrite'ı\n" +
      "commit'leme. Guard'ın kendisi dosyayı DEĞİŞTİRMEZ."
  )
  process.exit(1)
}

let raw
try {
  raw = readFileSync(tsconfigPath, 'utf8')
} catch (err) {
  fail(`Dosya okunamadı: ${err.message}`)
}

// 1) YORUM KORUNUMU — expo rewrite TÜM yorumları siler. Dosyada en az bir `//` açıklama
//    satırı bulunmalı. (Bu dosyanın hiçbir string değeri `//` içermez, bu yüzden `//`
//    varlığı yorumların korunduğunun güvenli bir kanıtıdır.)
if (!/^\s*\/\//m.test(raw)) {
  fail('Açıklama yorumları (`//`) silinmiş — expo rewrite imzası.')
}

// 2) YAPISAL DEĞİŞMEZLER — yorumları soyup JSON olarak ayrıştır, `include`'u doğrula.
//    Yorum soyma STRING-FARKINDA olmalı: `paths` içindeki `"@/*"`/`"./*"` gibi değerler
//    `/*` içerir; naif bir regex bunları blok yorumu sanıp dosyayı bozar.
function stripJsoncComments(source) {
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    const next = source[i + 1]
    if (inLine) {
      if (ch === '\n') {
        inLine = false
        out += ch
      }
      continue
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false
        i++
      }
      continue
    }
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      continue
    }
    if (ch === '/' && next === '/') {
      inLine = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlock = true
      i++
      continue
    }
    out += ch
  }
  return out
}

const withoutComments = stripJsoncComments(raw)

let parsed
try {
  parsed = JSON.parse(withoutComments)
} catch (err) {
  fail(`Yorumlar soyulduktan sonra JSON olarak ayrıştırılamadı: ${err.message}`)
}

const include = Array.isArray(parsed.include) ? parsed.include : []
const missing = REQUIRED_INCLUDE.filter((entry) => !include.includes(entry))
if (missing.length > 0) {
  fail(`\`include\` dizisinde eksik girdi(ler): ${missing.join(', ')}`)
}

console.log('apps/mobile/tsconfig.json guard: geçti — yorumlar ve include değişmezleri yerinde.')
