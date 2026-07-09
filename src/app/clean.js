const fs = require('fs');

console.log("⏳ CSV Temizleme işlemi başlıyor...");

try {
  // Dosyanın var olup olmadığını kontrol et
  if (!fs.existsSync('exercises.csv')) {
    console.log("❌ HATA: 'exercises.csv' dosyası bu klasörde bulunamadı!");
    console.log("Lütfen CSV dosyasının clean.js ile aynı klasörde olduğundan emin ol.");
    process.exit();
  }

  const rawData = fs.readFileSync('exercises.csv', 'utf8');
  const lines = rawData.split('\n');
  const headers = lines[0].split(',');

  const nameIdx = headers.indexOf('name');
  const bodyPartIdx = headers.indexOf('body_part');
  const targetIdx = headers.indexOf('target');
  const equipmentIdx = headers.indexOf('equipment');

  let cleanCSV = 'name,body_part,target,equipment\n';

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Virgülleri ayıran ama tırnak içindeki metinleri bozmayan özel ayırıcı
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (row.length > Math.max(nameIdx, bodyPartIdx, targetIdx, equipmentIdx)) {
        const name = (row[nameIdx] || '').replace(/"/g, '').trim();
        const bodyPart = (row[bodyPartIdx] || '').replace(/"/g, '').trim();
        const target = (row[targetIdx] || '').replace(/"/g, '').trim();
        const equipment = (row[equipmentIdx] || '').replace(/"/g, '').trim();
        
        if (name) {
            cleanCSV += `"${name}","${bodyPart}","${target}","${equipment}"\n`;
        }
    }
  }

  fs.writeFileSync('clean_exercises.csv', cleanCSV);
  console.log("✅ İŞLEM TAMAM!");
  console.log("Tüm gereksiz sütunlar silindi. 'clean_exercises.csv' dosyası oluşturuldu.");
  
} catch (error) {
  console.log("❌ Beklenmeyen bir hata oluştu:", error.message);
}