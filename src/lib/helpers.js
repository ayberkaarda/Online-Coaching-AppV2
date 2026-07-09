export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const downloadCSV = (data, filename, isText = false) => {
  if (!data || data.length === 0) return alert("İndirilecek veri bulunamadı.");
  let csvContent = "\uFEFF";
  if (isText) {
    const formattedText = `"${String(data).replace(/"/g, '""')}"`;
    csvContent += "Program Detayı\n" + formattedText;
  } else {
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(obj => Object.values(obj).map(value => `"${value}"`).join(",")).join("\n");
    csvContent += headers + "\n" + rows;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.setAttribute("href", URL.createObjectURL(blob));
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

export const getMacroPercentage = (p, c, f) => {
  const pro = parseFloat(p) || 0; const car = parseFloat(c) || 0; const fat = parseFloat(f) || 0;
  const total = pro + car + fat;
  return total === 0 ? { p: 0, c: 0, f: 0 } : { p: (pro/total)*100, c: (car/total)*100, f: (fat/total)*100 };
};

export const getTodayName = () => {
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  return days[new Date().getDay()];
};

export const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};