// data/ altındaki temizlenmiş katalog CSV'lerini Supabase'e aktarır.
//
//   data/clean_exercises_v2.csv  ->  public.exercises
//   data/clean_foods.csv         ->  public.food_database
//
// Script IDEMPOTENT'tir: `name` sütunu üzerinden upsert yapar, bu yüzden kaç kez
// çalıştırılırsa çalıştırılsın tablodaki satır sayısı artmaz, yalnızca mevcut
// satırlar güncellenir.
//
// Kullanım:
//   npm run db:import-catalog
//   node scripts/import-catalog.mjs --dry-run
//   node scripts/import-catalog.mjs --foods-only
//
// Gerekli ortam değişkenleri:
//   SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
//
// Not: `.env.local` BİLEREK okunmaz. O dosya barındırılan (production) projeye
// işaret ettiği için, kazayla canlı veritabanına yazmayı önlemek adına
// değişkenler her çalıştırmada kabuktan açıkça verilmelidir.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
const BATCH_SIZE = 500

// ---------------------------------------------------------------------------
// 1) CLI argümanları
// ---------------------------------------------------------------------------

const USAGE = `
Katalog CSV import aracı

Kullanım:
  node scripts/import-catalog.mjs [seçenekler]

Seçenekler:
  --exercises-only   Yalnızca data/clean_exercises_v2.csv -> exercises
  --foods-only       Yalnızca data/clean_foods.csv -> food_database
  --dry-run          Hiçbir şey yazmaz; ne yapacağını raporlar
  --help, -h         Bu yardımı gösterir

Ortam değişkenleri:
  SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL)   Supabase proje URL'i
  SUPABASE_SERVICE_ROLE_KEY                      Service-role anahtarı

Service-role anahtarı zorunludur: exercises/food_database tablolarına yazma
yetkisi RLS politikalarında yalnızca koça açıktır.
--dry-run modunda ortam değişkenleri opsiyoneldir (bağlanmadan da rapor üretir).
`.trim()

function parseArgs(argv) {
  const opts = { exercisesOnly: false, foodsOnly: false, dryRun: false, help: false }
  for (const arg of argv) {
    switch (arg) {
      case '--exercises-only':
        opts.exercisesOnly = true
        break
      case '--foods-only':
        opts.foodsOnly = true
        break
      case '--dry-run':
        opts.dryRun = true
        break
      case '--help':
      case '-h':
        opts.help = true
        break
      default:
        return { error: `Bilinmeyen seçenek: ${arg}` }
    }
  }
  if (opts.exercisesOnly && opts.foodsOnly) {
    return { error: '--exercises-only ve --foods-only birlikte kullanılamaz.' }
  }
  return { opts }
}

// ---------------------------------------------------------------------------
// 2) CSV ayrıştırma (bağımlılıksız, RFC 4180 uyumlu durum makinesi)
//    - tırnaklı alanları, alan içi virgülü ve kaçırılmış çift tırnağı ("") işler
//    - satır sonu \n ve \r\n destekli
//    - BOM varsa atılır
// ---------------------------------------------------------------------------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // BOM

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let started = false // bu satırda hiç karakter/alan görüldü mü

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // tamamen boş satırları (yalnızca tek boş alan) atla
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
    started = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"' // kaçırılmış çift tırnak
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      started = true
    } else if (ch === ',') {
      endField()
      started = true
    } else if (ch === '\n') {
      endRow()
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else {
      field += ch
      started = true
    }
  }

  if (started || field !== '' || row.length > 0) endRow()
  return rows
}

// CSV satırlarını başlık isimlerine göre nesneye çevirir.
function toRecords(rows) {
  if (rows.length === 0) return { header: [], records: [] }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const records = rows.slice(1).map((cells) => {
    const rec = {}
    header.forEach((key, idx) => {
      rec[key] = cells[idx] ?? ''
    })
    return rec
  })
  return { header, records }
}

// ---------------------------------------------------------------------------
// 3) Kodlama (mojibake) onarımı
//
//    İki ayrı bozulma sınıfı ele alınır:
//      a) Klasik latin-1 çift kodlaması:  "45Â° side bend"
//      b) CP1251 (Windows-1251) çözümlemesi: "sled 45в° calf press"
//         Burada UTF-8 baytları (C2 B0 = "°") Kiril kod sayfasıyla okunmuş,
//         "В°" olmuş, ardından isimler küçük harfe çevrilince "в°" hâline gelmiştir.
//
//    Onarım KÖRLEMESİNE uygulanmaz: yalnızca bozulma imzası taşıyan alanlara
//    dokunulur ve sonuç geçerli UTF-8 değilse orijinal metin korunur. Böylece
//    temiz Türkçe (ç, ğ, ı, ö, ş, ü) veya "sauté", "Ragù" gibi metinler bozulmaz.
// ---------------------------------------------------------------------------

const utf8Strict = new TextDecoder('utf-8', { fatal: true })

// CP1251 karakter -> bayt tersi haritası, TextDecoder üzerinden runtime'da üretilir.
const cp1251CharToByte = (() => {
  try {
    const dec = new TextDecoder('windows-1251')
    const map = new Map()
    for (let b = 0; b < 256; b++) {
      const ch = dec.decode(new Uint8Array([b]))
      // CP1251'de tanımsız baytlar U+FFFD döner; haritaya alınmaz.
      if (ch.codePointAt(0) !== 0xfffd && !map.has(ch)) map.set(ch, b)
    }
    if (map.size < 200) return null // beklenmedik/eksik tablo -> güvenli tarafta kal
    return map
  } catch {
    return null // ICU'da windows-1251 yoksa bu onarım yolu devre dışı kalır
  }
})()

function decodeUtf8OrNull(bytes) {
  try {
    return utf8Strict.decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

// Bozulma imzalari (kaynak dosyada gorunmez karakter kalmasin diye \u kacislariyla)
const LATIN1_MOJIBAKE = /[\u00C2-\u00F4][\u0080-\u00BF]/ // UTF-8 lead + devam bayti, latin-1 okunmus
const CYRILLIC = /[\u0400-\u04FF]/ // Kiril blogu -- CP1251 cozumlemesinin imzasi
const NON_ASCII = /[^\u0000-\u007F]/

// (a) latin-1 cift kodlamasi: "Ã" / "Â" / "Å" / "Ä" + devam bayti imzasi
function repairLatin1(text) {
  if (!LATIN1_MOJIBAKE.test(text)) return null
  // latin-1'e sığmayan bir karakter varsa Buffer dönüşümü bilgi kaybeder -> dokunma
  for (const ch of text) if (ch.codePointAt(0) > 0xff) return null
  const fixed = decodeUtf8OrNull(Buffer.from(text, 'latin1'))
  return fixed && fixed !== text ? fixed : null
}

// (b) CP1251 çözümlemesi: Latin metnin ortasına düşmüş Kiril harfi imzası
function repairCp1251(text) {
  if (!cp1251CharToByte) return null
  if (!CYRILLIC.test(text)) return null
  // Tamamen Kiril bir metin gerçek Rusça olabilir; yalnızca Latin harflerle
  // karışmış olanları bozulma adayı say.
  if (!/[A-Za-z]/.test(text)) return null

  // Küçük harfe çevirme adımı yüzünden Kiril harfin hangi bayttan geldiği
  // belirsizdir (küçük 'в' = 0xE2, büyük 'В' = 0xC2). Bu yüzden Kiril harfler
  // için iki aday bayt denenir; kombinasyon sayısı sınırlandırılır.
  const perChar = []
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code < 0x80) {
      perChar.push([code])
      continue
    }
    const candidates = []
    const direct = cp1251CharToByte.get(ch)
    const upper = cp1251CharToByte.get(ch.toUpperCase())
    if (upper !== undefined) candidates.push(upper)
    if (direct !== undefined && direct !== upper) candidates.push(direct)
    if (candidates.length === 0) return null // haritalanamayan karakter -> onarma
    perChar.push(candidates)
  }

  const ambiguous = perChar.filter((c) => c.length > 1).length
  if (ambiguous > 8) return null // kombinatorik patlamayı engelle

  const total = perChar.reduce((acc, c) => acc * c.length, 1)
  for (let combo = 0; combo < total; combo++) {
    const bytes = []
    let rest = combo
    for (const candidates of perChar) {
      bytes.push(candidates[rest % candidates.length])
      rest = Math.floor(rest / candidates.length)
    }
    const decoded = decodeUtf8OrNull(bytes)
    // Onarım ancak Kiril tamamen kaybolduysa başarılı sayılır.
    if (decoded && decoded !== text && !CYRILLIC.test(decoded)) return decoded
  }
  return null
}

const repairSamples = []

function repairEncoding(text) {
  if (!text || !NON_ASCII.test(text)) return text
  const fixed = repairLatin1(text) ?? repairCp1251(text)
  if (!fixed) return text
  if (repairSamples.length < 10) repairSamples.push({ before: text, after: fixed })
  return fixed
}

// ---------------------------------------------------------------------------
// 4) Yardımcılar
// ---------------------------------------------------------------------------

function readCsvFile(fileName) {
  const filePath = path.resolve(DATA_DIR, fileName)
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV dosyası bulunamadı: ${filePath}`)
  }
  return { filePath, text: fs.readFileSync(filePath, 'utf8') }
}

// Boş string'i null'a çevirir (opsiyonel text sütunları için).
function nullIfEmpty(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function formatDuration(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} sn`
}

// ---------------------------------------------------------------------------
// 5) Kaynak tanımları — CSV -> tablo dönüşümü
// ---------------------------------------------------------------------------

const SOURCES = {
  exercises: {
    table: 'exercises',
    file: 'clean_exercises_v2.csv',
    label: 'Egzersizler',
    // Bir CSV kaydını tablo satırına çevirir; geçersizse { skip: 'sebep' } döner.
    map(rec) {
      const name = repairEncoding((rec.name ?? '').trim())
      if (!name) return { skip: 'boş name' }
      return {
        row: {
          name,
          body_part: nullIfEmpty(repairEncoding(rec.body_part ?? '')),
          target: nullIfEmpty(repairEncoding(rec.target ?? '')),
          equipment: nullIfEmpty(repairEncoding(rec.equipment ?? '')),
          gif_url: nullIfEmpty(rec.gif_url ?? ''),
          image: nullIfEmpty(rec.image ?? ''),
        },
      }
    },
  },
  foods: {
    table: 'food_database',
    file: 'clean_foods.csv',
    label: 'Besinler',
    map(rec) {
      const name = repairEncoding((rec.name ?? '').trim())
      if (!name) return { skip: 'boş name' }

      const raw = (rec.calories_per_100g ?? '').trim()
      const calories = Number(raw)
      if (raw === '' || !Number.isFinite(calories)) return { skip: 'sayısal olmayan kalori' }
      if (calories < 0) return { skip: 'negatif kalori' }
      // numeric(7,2) taşmasını önle
      if (calories > 99999.99) return { skip: 'kalori aralık dışı (>99999.99)' }

      return { row: { name, calories_per_100g: Math.round(calories * 100) / 100 } }
    },
  },
}

// ---------------------------------------------------------------------------
// 6) Tek bir kaynağı işle
// ---------------------------------------------------------------------------

async function importSource(source, { client, dryRun }) {
  const startedAt = performance.now()
  const { filePath, text } = readCsvFile(source.file)
  const { header, records } = toRecords(parseCsv(text))

  if (!header.includes('name')) {
    throw new Error(`${source.file}: 'name' sütunu bulunamadı. Başlık: ${header.join(', ')}`)
  }

  const skipReasons = new Map()
  const byName = new Map() // dosya içi tekilleştirme: aynı isimde son kayıt kazanır
  let duplicates = 0

  for (const rec of records) {
    const result = source.map(rec)
    if (result.skip) {
      skipReasons.set(result.skip, (skipReasons.get(result.skip) ?? 0) + 1)
      continue
    }
    // Postgres, tek ON CONFLICT komutunda aynı satırı iki kez güncelleyemez:
    // "ON CONFLICT DO UPDATE command cannot affect row a second time".
    // Bu yüzden upsert'e göndermeden ÖNCE dosya içinde tekilleştiriyoruz.
    if (byName.has(result.row.name)) duplicates++
    byName.set(result.row.name, result.row)
  }

  const rows = [...byName.values()]
  const batches = chunk(rows, BATCH_SIZE)
  let written = 0

  if (!dryRun) {
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const { error } = await client
        .from(source.table)
        .upsert(batch, { onConflict: 'name', ignoreDuplicates: false })
      if (error) {
        throw new Error(
          `${source.table}: ${i + 1}. parti (${batch.length} satır) yazılamadı — ${error.message}`
        )
      }
      written += batch.length
      process.stdout.write(
        `   ${source.table}: parti ${i + 1}/${batches.length} tamam (${written}/${rows.length})\r`
      )
    }
    if (batches.length > 0) process.stdout.write('\n')
  }

  const skipped = [...skipReasons.values()].reduce((a, b) => a + b, 0)

  return {
    label: source.label,
    table: source.table,
    file: path.relative(process.cwd(), filePath),
    read: records.length,
    skipped,
    skipReasons,
    duplicates,
    unique: rows.length,
    written: dryRun ? 0 : written,
    batches: batches.length,
    durationMs: performance.now() - startedAt,
  }
}

// ---------------------------------------------------------------------------
// 7) Raporlama
// ---------------------------------------------------------------------------

function printSummary(results, { dryRun }) {
  const columns = [
    ['Kaynak', (r) => r.label],
    ['Tablo', (r) => r.table],
    ['Okunan', (r) => String(r.read)],
    ['Atlanan', (r) => String(r.skipped)],
    ['Tekrarlı', (r) => String(r.duplicates)],
    ['Tekil', (r) => String(r.unique)],
    ['Yazılan', (r) => (dryRun ? '-' : String(r.written))],
    ['Süre', (r) => formatDuration(r.durationMs)],
  ]

  const widths = columns.map(([title, get]) =>
    Math.max(title.length, ...results.map((r) => get(r).length))
  )
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')

  console.log('')
  console.log(line(columns.map(([title]) => title)))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const r of results) console.log(line(columns.map(([, get]) => get(r))))

  for (const r of results) {
    if (r.skipReasons.size > 0) {
      const detail = [...r.skipReasons.entries()].map(([reason, n]) => `${reason}: ${n}`).join(', ')
      console.log(`\n   ${r.table} atlama nedenleri -> ${detail}`)
    }
  }
}

async function printTableCounts(client, tables) {
  console.log('\nVeritabanındaki toplam satır sayıları:')
  for (const table of tables) {
    const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`   ${table}: sayılamadı — ${error.message}`)
    } else {
      console.log(`   ${table}: ${count}`)
    }
  }
}

// ---------------------------------------------------------------------------
// 8) Giriş noktası
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.error) {
    console.error(`Hata: ${parsed.error}\n`)
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  const { opts } = parsed
  if (opts.help) {
    console.log(USAGE)
    return
  }

  const selected = []
  if (!opts.foodsOnly) selected.push(SOURCES.exercises)
  if (!opts.exercisesOnly) selected.push(SOURCES.foods)

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let client = null
  if (!url || !serviceKey) {
    const missing = [
      !url ? 'SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL)' : null,
      !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
    ].filter(Boolean)

    if (!opts.dryRun) {
      console.error('Hata: Supabase bağlantısı için gerekli ortam değişkenleri eksik.')
      console.error(`Eksik: ${missing.join(', ')}`)
      console.error(
        'Service-role anahtarı gerekli, çünkü exercises/food_database tablolarına yazma yetkisi RLS politikalarında yalnızca koça açık.'
      )
      console.error('Ayrıntı için: node scripts/import-catalog.mjs --help')
      process.exitCode = 1
      return
    }
    console.log(
      `Uyarı: ${missing.join(', ')} tanımlı değil — --dry-run veritabanına bağlanmadan çalışacak.`
    )
  } else {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  console.log(opts.dryRun ? 'Katalog import (DENEME / --dry-run)' : 'Katalog import başlıyor')
  console.log(`   Hedef  : ${url ?? '(bağlantı yok)'}`)
  console.log(`   Kaynak : ${selected.map((s) => s.file).join(', ')}`)

  const results = []
  for (const source of selected) {
    results.push(await importSource(source, { client, dryRun: opts.dryRun }))
  }

  if (repairSamples.length > 0) {
    console.log('\nKodlama onarımı uygulanan alanlar (ilk örnekler):')
    for (const { before, after } of repairSamples) {
      console.log(`   ${JSON.stringify(before)}  ->  ${JSON.stringify(after)}`)
    }
  } else {
    console.log('\nKodlama onarımı gerektiren alan bulunamadı.')
  }

  printSummary(results, { dryRun: opts.dryRun })

  if (client) {
    await printTableCounts(
      client,
      results.map((r) => r.table)
    )
  }

  if (opts.dryRun) {
    console.log('\n--dry-run: veritabanına hiçbir şey yazılmadı.')
  } else {
    console.log('\nImport tamamlandı.')
  }
}

try {
  await main()
} catch (error) {
  console.error(`\nHata: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
