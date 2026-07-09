'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DAYS, downloadCSV } from "@/lib/helpers";

export default function NutritionTab({ targetId, userRole, selectedStudentIds, onDownloadImage }) {
  const [foodDB, setFoodDB] = useState([]);
  const [nutritionData, setNutritionData] = useState(DAYS.reduce((a, d) => ({ ...a, [d]: { items: '', total: 0 } }), {}));
  const [studentMetrics, setStudentMetrics] = useState({ age: 20, height_cm: 175, weight_kg: 70, gender: 'male', activity_level: 1.55, goal: 'maintain' });
  const [targetCalories, setTargetCalories] = useState(0);
  const [targetMacros, setTargetMacros] = useState({ protein: 0, carb: 0, fat: 0 });

  useEffect(() => {
    supabase.from('food_database').select('*').then(({ data }) => setFoodDB(data || []));
  }, []);

  useEffect(() => {
    if (!targetId) return;
    supabase.from('profiles').select('nutrition_plan').eq('id', targetId).single().then(({ data }) => {
      if (data?.nutrition_plan) {
        try { setNutritionData(JSON.parse(data.nutrition_plan)); } catch(e) {}
      } else {
        setNutritionData(DAYS.reduce((a, d) => ({ ...a, [d]: { items: '', total: 0 } }), {}));
      }
    });
  }, [targetId]);

  const calculateDietTarget = () => {
    const { age, height_cm, weight_kg, gender, activity_level, goal } = studentMetrics;
    let bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age);
    bmr += gender === 'male' ? 5 : -161;
    let tdee = bmr * activity_level;
    let finalCalories = tdee;
    let pPct = 0.30, cPct = 0.40, fPct = 0.30; 

    if (goal === 'cut') { finalCalories -= 500; pPct = 0.40; cPct = 0.30; fPct = 0.30; } 
    else if (goal === 'bulk') { finalCalories += 500; pPct = 0.25; cPct = 0.50; fPct = 0.25; }
    
    finalCalories = Math.round(finalCalories);
    setTargetCalories(finalCalories);
    setTargetMacros({ protein: Math.round((finalCalories * pPct) / 4), carb: Math.round((finalCalories * cPct) / 4), fat: Math.round((finalCalories * fPct) / 9) });
  };

  const calculateCalories = (foodName, grams) => {
    const food = foodDB.find(f => f.name.toLowerCase() === foodName.toLowerCase().trim());
    if (!food) return 0;
    return Math.round((food.calories_per_100g * grams) / 100);
  };

  const handleNutritionChange = (day, value) => {
    let total = 0;
    if(value) {
      value.split(',').forEach(item => {
        const parts = item.split(':');
        if(parts.length === 2) total += calculateCalories(parts[0], parseInt(parts[1]) || 0);
      });
    }
    setNutritionData(prev => ({ ...prev, [day]: { items: value, total } }));
  };

  const handleSaveProgram = async () => {
    if (selectedStudentIds.length === 0) return alert("Öğrenci seçin!");
    const updateData = { nutrition_plan: JSON.stringify(nutritionData) };
    for (const sId of selectedStudentIds) await supabase.from('profiles').update(updateData).eq('id', sId);
    alert("Beslenme Programı başarıyla atandı!");
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
        <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Haftalık Beslenme Planı</h4>
        <div className="flex gap-2">
          <button onClick={onDownloadImage} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 rounded-lg transition-all flex items-center gap-2">🖼️ Görsel İndir</button>
          <button onClick={() => downloadCSV([nutritionData], 'Beslenme_Programi', false)} className="text-xs font-bold px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 rounded-lg transition-all flex items-center gap-2">📊 CSV İndir</button>
        </div>
      </div>

      {userRole === 'admin' && (
        <div className="bg-gradient-to-br from-brand-purple/5 to-transparent border border-brand-purple/20 p-5 rounded-2xl shadow-inner mb-6">
          <h4 className="font-black text-brand-purple text-sm mb-4 flex items-center gap-2">🧠 AKILLI DİYET HESAPLAYICI</h4>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-4">
            <input type="number" placeholder="Yaş" value={studentMetrics.age} onChange={e => setStudentMetrics({...studentMetrics, age: e.target.value})} className="p-2 rounded-lg text-xs border border-brand-purple/20 focus:outline-none" title="Yaş" />
            <input type="number" placeholder="Boy (cm)" value={studentMetrics.height_cm} onChange={e => setStudentMetrics({...studentMetrics, height_cm: e.target.value})} className="p-2 rounded-lg text-xs border border-brand-purple/20 focus:outline-none" title="Boy (cm)" />
            <input type="number" placeholder="Kilo (kg)" value={studentMetrics.weight_kg} onChange={e => setStudentMetrics({...studentMetrics, weight_kg: e.target.value})} className="p-2 rounded-lg text-xs border border-brand-purple/20 focus:outline-none" title="Kilo (kg)" />
            <select value={studentMetrics.gender} onChange={e => setStudentMetrics({...studentMetrics, gender: e.target.value})} className="p-2 rounded-lg text-xs border border-brand-purple/20 focus:outline-none">
              <option value="male">Erkek</option><option value="female">Kadın</option>
            </select>
            <select value={studentMetrics.activity_level} onChange={e => setStudentMetrics({...studentMetrics, activity_level: parseFloat(e.target.value)})} className="p-2 rounded-lg text-xs border border-brand-purple/20 focus:outline-none">
              <option value={1.2}>Hareketsiz (Masa başı)</option><option value={1.375}>Az Hareketli (Hafif idman)</option><option value={1.55}>Orta Hareketli (3-5 gün)</option><option value={1.725}>Çok Hareketli (6-7 gün)</option>
            </select>
            <select value={studentMetrics.goal} onChange={e => setStudentMetrics({...studentMetrics, goal: e.target.value})} className="p-2 rounded-lg text-xs border border-orange-500/30 bg-orange-50 dark:bg-orange-900/20 font-bold focus:outline-none">
              <option value="maintain">Koruma (0 kcal)</option><option value="cut">Definasyon (-500 kcal)</option><option value="bulk">Bulk (+500 kcal)</option>
            </select>
            <button onClick={calculateDietTarget} className="p-2 bg-brand-purple text-white text-xs font-bold rounded-lg hover:bg-brand-purpleHover transition-all shadow-md">HESAPLA</button>
          </div>
          {targetCalories > 0 && (
            <div className="flex flex-wrap gap-4 items-center bg-white dark:bg-zinc-900 p-4 rounded-xl border border-brand-purple/20">
              <div className="text-center px-4 border-r border-gray-100 dark:border-zinc-800">
                <p className="text-[10px] text-gray-500 font-bold">HEDEF KALORİ</p><p className="text-2xl font-black text-brand-purple">{targetCalories} <span className="text-sm">kcal</span></p>
              </div>
              <div className="flex gap-6 text-center pl-2">
                <div><p className="text-[10px] text-gray-500 font-bold">PROTEİN</p><p className="font-bold text-red-500">{targetMacros.protein}g</p></div>
                <div><p className="text-[10px] text-gray-500 font-bold">KARBONHİDRAT</p><p className="font-bold text-blue-500">{targetMacros.carb}g</p></div>
                <div><p className="text-[10px] text-gray-500 font-bold">YAĞ</p><p className="font-bold text-yellow-500">{targetMacros.fat}g</p></div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="overflow-x-auto border border-gray-200 dark:border-zinc-800 rounded-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
            <tr>
              <th className="p-3 font-bold text-gray-600 dark:text-gray-300 w-1/4">Gün</th>
              <th className="p-3 font-bold text-gray-600 dark:text-gray-300">Besinler (Besin:Gramaj)</th>
              <th className="p-3 font-bold text-gray-600 dark:text-gray-300 w-1/6">Otomatik Kalori</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day => (
              <tr key={day} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{day}</td>
                <td className="p-2">
                  <input 
                    disabled={userRole !== 'admin'} value={nutritionData[day]?.items || ''} onChange={(e) => handleNutritionChange(day, e.target.value)}
                    placeholder="Örn: Yulaf:100" className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-brand-purple dark:hover:border-zinc-700 rounded-lg outline-none transition-all disabled:opacity-80"
                  />
                </td>
                <td className="p-3 font-black text-brand-purple">{nutritionData[day]?.total || 0} <span className="text-xs font-bold opacity-50">kcal</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {userRole === 'admin' && (
        <button onClick={handleSaveProgram} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all shadow-md">
          Beslenme Tablosunu Güncelle
        </button>
      )}
    </div>
  );
}