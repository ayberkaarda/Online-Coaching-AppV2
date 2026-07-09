const fs = require('fs');

console.log("⏳ Besin CSV Temizleme işlemi başlıyor...");

try {
  // İndirdiğin kaggle dosyasının adının 'daily_food_nutrition_dataset.csv' olduğunu varsayıyorum
  const rawData = fs.readFileSync('daily_food_nutrition_dataset.csv', 'utf8');
  const lines = rawData.split('\n');
  const headers = lines[0].toLowerCase().split(',');

  // CSV'nin içindeki sütun isimlerini bul (İndirdiğin CSV'ye göre buradaki isimler değişebilir)
  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('food'));
  const calIdx = headers.findIndex(h => h.includes('calor') || h.includes('kcal') || h.includes('energy'));

  let cleanCSV = 'name,calories_per_100g\n';

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (row.length > Math.max(nameIdx, calIdx)) {
        const name = (row[nameIdx] || '').replace(/"/g, '').trim();
        const calories = parseFloat((row[calIdx] || '').replace(/"/g, '').trim()) || 0;
        
        // Türkçe karakterli örnek besinleri de Python AI ile uyuşması için manuel ekleyebilirsin
        if (name && calories > 0) {
            cleanCSV += `"${name}",${calories}\n`;
        }
    }
  }

  fs.writeFileSync('clean_foods.csv', cleanCSV);
  console.log("✅ İŞLEM TAMAM! 'clean_foods.csv' dosyası oluşturuldu. Supabase'e import edebilirsin.");
} catch (error) {
  console.log("❌ Hata oluştu:", error.message);
}