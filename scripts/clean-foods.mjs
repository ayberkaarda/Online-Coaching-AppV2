// Kaggle'dan indirilen ham besin veri setini Supabase `food_database` tablosuna
// import edilebilecek basit bir { name, calories_per_100g } CSV formatına indirger.
//
// Kullanım:
//   node scripts/clean-foods.mjs [input] [output]
//   npm run clean:foods -- [input] [output]
//
// input  varsayılan: data/daily_food_nutrition_dataset.csv
// output varsayılan: data/clean_foods.csv
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')

const [, , inputArg, outputArg] = process.argv

const inputPath = path.resolve(dataDir, inputArg ?? 'daily_food_nutrition_dataset.csv')
const outputPath = path.resolve(dataDir, outputArg ?? 'clean_foods.csv')

console.log('⏳ Besin CSV Temizleme işlemi başlıyor...')
console.log(`   Girdi : ${inputPath}`)
console.log(`   Çıktı : ${outputPath}`)

try {
  const rawData = fs.readFileSync(inputPath, 'utf8')
  const lines = rawData.split('\n')
  const headers = lines[0].toLowerCase().split(',')

  // CSV'nin içindeki sütun isimlerini bul (indirilen CSV'ye göre isimler değişebilir)
  const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('food'))
  const calIdx = headers.findIndex(
    (h) => h.includes('calor') || h.includes('kcal') || h.includes('energy')
  )

  if (nameIdx === -1 || calIdx === -1) {
    throw new Error(
      'CSV başlıklarında isim veya kalori sütunu bulunamadı. Beklenen anahtar kelimeler: name/food, calor/kcal/energy.'
    )
  }

  let cleanCSV = 'name,calories_per_100g\n'

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)

    if (row.length > Math.max(nameIdx, calIdx)) {
      const name = (row[nameIdx] || '').replace(/"/g, '').trim()
      const calories = parseFloat((row[calIdx] || '').replace(/"/g, '').trim()) || 0

      if (name && calories > 0) {
        cleanCSV += `"${name}",${calories}\n`
      }
    }
  }

  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(outputPath, cleanCSV)
  console.log(
    `✅ İŞLEM TAMAM! '${path.basename(outputPath)}' dosyası oluşturuldu. Supabase'e import edebilirsin.`
  )
} catch (error) {
  console.error('❌ Hata oluştu:', error.message)
  process.exitCode = 1
}
