const fs = require('fs');

console.log("⏳ V2 CSV Temizleme işlemi başlıyor (Görseller dahil)...");

try {
  const rawData = fs.readFileSync('exercises.csv', 'utf8');
  const lines = rawData.split('\n');
  const headers = lines[0].split(',');

  const nameIdx = headers.indexOf('name');
  const bodyPartIdx = headers.indexOf('body_part');
  const targetIdx = headers.indexOf('target');
  const equipmentIdx = headers.indexOf('equipment');
  const gifUrlIdx = headers.indexOf('gif_url');
  const imageIdx = headers.indexOf('image'); 

  let cleanCSV = 'name,body_part,target,equipment,gif_url,image\n';

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    
    if (row.length > Math.max(nameIdx, bodyPartIdx, targetIdx, equipmentIdx)) {
        const name = (row[nameIdx] || '').replace(/"/g, '').trim();
        const bodyPart = (row[bodyPartIdx] || '').replace(/"/g, '').trim();
        const target = (row[targetIdx] || '').replace(/"/g, '').trim();
        const equipment = (row[equipmentIdx] || '').replace(/"/g, '').trim();
        const gifUrl = gifUrlIdx !== -1 ? (row[gifUrlIdx] || '').replace(/"/g, '').trim() : '';
        const image = imageIdx !== -1 ? (row[imageIdx] || '').replace(/"/g, '').trim() : '';
        
        if (name) {
            cleanCSV += `"${name}","${bodyPart}","${target}","${equipment}","${gifUrl}","${image}"\n`;
        }
    }
  }

  fs.writeFileSync('clean_exercises_v2.csv', cleanCSV);
  console.log("✅ İŞLEM TAMAM! Linkler dahil edildi ve 'clean_exercises_v2.csv' oluşturuldu.");
} catch (error) {
  console.log("❌ Hata oluştu:", error.message);
}