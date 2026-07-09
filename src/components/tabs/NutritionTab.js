'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DAYS, downloadCSV } from "@/lib/helpers";

export default function NutritionTab({ targetId, currentUserId, userRole, selectedStudentIds, onDownloadImage }) {
  const [foodDB, setFoodDB] = useState([]);
  const [nutritionData, setNutritionData] = useState(DAYS.reduce((a, d) => ({ ...a, [d]: { items: '', total: 0 } }), {}));
  
  // Hızlı Ekle State'leri
  const [quickAddDay, setQuickAddDay] = useState(DAYS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedFood, setSelectedFood] = useState(null);
  const [quickAddGrams, setQuickAddGrams] = useState(100);

  // Akıllı Diyetisyen & Yapay Zeka State'leri
  const [studentMetrics, setStudentMetrics] = useState({ age: 20, height_cm: 175, weight_kg: 70, gender: 'male', steps: 6000, goal: 'maintain' });
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetCalories, setTargetCalories] = useState(0);

  useEffect(() => {
    supabase.from('food_database').select('*').then(({ data }) => setFoodDB(data || []));
  }, []);

  useEffect(() => {
    if (!targetId) return;
    supabase.from('profiles').select('nutrition_plan').eq('id', targetId).single().then(({ data }) => {
      if (data?.nutrition_plan) {
        try { setNutritionData(JSON.parse(data.nutrition_plan)); } catch(e) {}
      } else { setNutritionData(DAYS.reduce((a, d) => ({ ...a, [d]: { items: '', total: 0 } }), {})); }
    });
  }, [targetId]);

  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      const filtered = foodDB.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
      setSuggestions(filtered.slice(0, 5));
    } else { setSuggestions([]); }
  }, [searchQuery, foodDB]);

  const calculateCalories = (foodName, grams) => {
    const food = foodDB.find(f => f.name.toLowerCase() === foodName.toLowerCase().trim());
    if (!food) return 0;
    return Math.round((food.calories_per_100g * grams) / 100);
  };

  // 🤖 YENİ: Python Yapay Zeka Diyet Jeneratörü
  const generateSmartDiet = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("http://localhost:8000/api/generate-ai-diet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: studentMetrics.age,
          height_cm: studentMetrics.height_cm,
          weight_kg: studentMetrics.weight_kg,
          gender: studentMetrics.gender,
          steps: parseInt(studentMetrics.steps),
          goal: studentMetrics.goal,
          user_prompt: aiPrompt
        })
      });

      const result = await response.json();

      if (result.status === "success") {
        setTargetCalories(result.target_calories);
        
        // AI'dan gelen "Besin:Gramaj" formatındaki planı frontend tablosuna işle
        const newNutritionData = {};
        for (const day of DAYS) {
          const itemsString = result.diet_plan[day] || "";
          let dayTotal = 0;
          
          itemsString.split(',').forEach(item => {
            const parts = item.split(':');
            if(parts.length === 2) dayTotal += calculateCalories(parts[0], parseInt(parts[1]) || 0);
          });

          newNutritionData[day] = { items: itemsString, total: dayTotal };
        }
        setNutritionData(newNutritionData);
        
      } else { alert("AI Sunucusundan hata döndü."); }
    } catch (error) {
      console.error("AI Bağlantı Hatası:", error);
      alert("Yapay Zeka (Python) sunucusuna ulaşılamadı. Python terminalini (localhost:8000) başlattığınızdan emin olun!");
    } finally { setIsGenerating(false); }
  };

  const handleQuickAdd = () => {
    if (!selectedFood) return alert("Lütfen listeden bir besin seçin.");
    if (!quickAddGrams || quickAddGrams <= 0) return alert("Geçerli bir gramaj girin.");

    const newEntry = `${selectedFood.name}:${quickAddGrams}`;
    const currentDayData = nutritionData[quickAddDay];
    const newItemsString = currentDayData.items ? `${currentDayData.items}, ${newEntry}` : newEntry;
    
    let total = 0;
    newItemsString.split(',').forEach(item => {
      const parts = item.split(':');
      if(parts.length === 2) total += calculateCalories(parts[0], parseInt(parts[1]) || 0);
    });

    setNutritionData(prev => ({ ...prev, [quickAddDay]: { items: newItemsString, total } }));
    setSearchQuery(''); setSelectedFood(null); setQuickAddGrams(100);
  };

  const handleManualNutritionChange = (day, value) => {
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
    const target = userRole === 'admin' ? selectedStudentIds : [currentUserId];
    if (target.length === 0) return alert("Öğrenci seçin!");
    const updateData = { nutrition_plan: JSON.stringify(nutritionData) };
    for (const sId of target) await supabase.from('profiles').update(updateData).eq('id', sId);
    alert("Beslenme Programı başarıyla güncellendi!");
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
        <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Haftalık Beslenme Planı</h4>
        <div className="flex gap-2">
          <button onClick={onDownloadImage} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple rounded-lg">🖼️ Görsel İndir</button>
          <button onClick={() => downloadCSV([nutritionData], 'Beslenme_Programi', false)} className="text-xs font-bold px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg">📊 CSV İndir</button>
        </div>
      </div>

      {/* 🧠 YENİ AKILLI DİYETİSYEN PANELİ */}
      <div className="bg-gradient-to-br from-brand-purple/5 to-transparent border border-brand-purple/20 p-5 rounded-2xl shadow-inner mb-6">
        <h4 className="font-black text-brand-purple text-sm mb-4 flex items-center gap-2">🧠 AI DİYETİSYEN & KALORİ HESAPLAYICI</h4>
        <div className="flex flex-col md:flex-row gap-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1">
            <input type="number" placeholder="Yaş" value={studentMetrics.age} onChange={e => setStudentMetrics({...studentMetrics, age: e.target.value})} className="p-3 rounded-xl text-xs border bg-white dark:bg-zinc-900 outline-none focus:border-brand-purple" title="Yaş" />
            <input type="number" placeholder="Boy (cm)" value={studentMetrics.height_cm} onChange={e => setStudentMetrics({...studentMetrics, height_cm: e.target.value})} className="p-3 rounded-xl text-xs border bg-white dark:bg-zinc-900 outline-none focus:border-brand-purple" title="Boy (cm)" />
            <input type="number" placeholder="Kilo (kg)" value={studentMetrics.weight_kg} onChange={e => setStudentMetrics({...studentMetrics, weight_kg: e.target.value})} className="p-3 rounded-xl text-xs border bg-white dark:bg-zinc-900 outline-none focus:border-brand-purple" title="Kilo (kg)" />
            <select value={studentMetrics.gender} onChange={e => setStudentMetrics({...studentMetrics, gender: e.target.value})} className="p-3 rounded-xl text-xs border bg-white dark:bg-zinc-900 outline-none focus:border-brand-purple">
              <option value="male">Erkek</option><option value="female">Kadın</option>
            </select>
            {/* GÜNLÜK ADIM SAYISI DROPDOWN */}
            <select value={studentMetrics.steps} onChange={e => setStudentMetrics({...studentMetrics, steps: e.target.value})} className="p-3 rounded-xl text-xs border bg-white dark:bg-zinc-900 outline-none focus:border-brand-purple">
              <option value={4000}>&lt; 5.000 Adım (Masa Başı)</option>
              <option value={6500}>5.000 - 8.000 Adım</option>
              <option value={9000}>8.000 - 10.000 Adım</option>
              <option value={11000}>10.000 - 12.000 Adım</option>
              <option value={13000}>12.000+ Adım (Çok Hareketli)</option>
            </select>
            <select value={studentMetrics.goal} onChange={e => setStudentMetrics({...studentMetrics, goal: e.target.value})} className="p-3 rounded-xl text-xs border font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 outline-none focus:border-orange-500">
              <option value="maintain">Koruma (0 kcal)</option><option value="cut">Definasyon (-500 kcal)</option><option value="bulk">Bulk (+500 kcal)</option>
            </select>
          </div>
          
          <div className="flex-1 flex flex-col gap-3">
            <textarea 
              value={aiPrompt} 
              onChange={(e) => setAiPrompt(e.target.value)} 
              placeholder="Örn: Yulaf ve tavuk yemem alternatif öner. Yağı zeytinyağı + kuruyemiş olarak ayarla..." 
              className="w-full p-3 rounded-xl border bg-white dark:bg-zinc-900 text-xs outline-none focus:border-brand-purple min-h-[90px]" 
            />
            <div className="flex items-center gap-3">
              {targetCalories > 0 && (
                <div className="flex-1 p-3 bg-white dark:bg-zinc-900 rounded-xl border flex items-center justify-center">
                   <p className="text-[10px] text-gray-500 font-bold mr-2">HEDEF:</p>
                   <p className="text-xl font-black text-brand-purple">{targetCalories} <span className="text-xs">kcal</span></p>
                </div>
              )}
              <button onClick={generateSmartDiet} disabled={isGenerating} className="flex-1 p-3 bg-brand-purple text-white text-sm font-bold rounded-xl hover:bg-brand-purpleHover transition-all shadow-md disabled:opacity-50">
                {isGenerating ? 'Hesaplanıyor...' : 'Oluştur ✨'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 🔍 HIZLI BESİN EKLEME PANELİ (Oto-Tamamlama) */}
      <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-4 rounded-2xl flex flex-col md:flex-row items-end gap-4 shadow-sm relative z-10">
        <div className="w-full md:w-1/4">
          <label className="block text-[10px] font-bold text-gray-500 mb-1">GÜN SEÇ</label>
          <select value={quickAddDay} onChange={(e) => setQuickAddDay(e.target.value)} className="w-full p-2.5 rounded-xl border dark:border-zinc-700 bg-white dark:bg-black text-sm outline-none">
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        
        <div className="w-full md:w-2/4 relative">
          <label className="block text-[10px] font-bold text-gray-500 mb-1">BESİN ARA</label>
          <input 
            type="text" placeholder="Örn: Yulaf, Tavuk..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSelectedFood(null); }}
            className="w-full p-2.5 rounded-xl border dark:border-zinc-700 bg-white dark:bg-black text-sm outline-none focus:border-brand-purple"
          />
          {suggestions.length > 0 && !selectedFood && (
            <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
              {suggestions.map(food => (
                <div key={food.id} onClick={() => { setSelectedFood(food); setSearchQuery(food.name); setSuggestions([]); }} className="p-3 text-sm hover:bg-brand-purple/10 cursor-pointer border-b last:border-0 dark:border-zinc-800">
                  <span className="font-bold">{food.name}</span> <span className="text-[10px] text-gray-500">({food.calories_per_100g} kcal/100g)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="w-full md:w-1/4">
          <label className="block text-[10px] font-bold text-gray-500 mb-1">GRAMAJ</label>
          <input type="number" value={quickAddGrams} onChange={(e) => setQuickAddGrams(e.target.value)} className="w-full p-2.5 rounded-xl border dark:border-zinc-700 bg-white dark:bg-black text-sm outline-none focus:border-brand-purple" />
        </div>

        <button onClick={handleQuickAdd} className="w-full md:w-auto px-6 py-2.5 bg-brand-purple text-white font-bold rounded-xl whitespace-nowrap shadow-md active:scale-95 transition-transform">Hızlı Ekle ⚡</button>
      </div>
      
      {/* TABLO */}
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
              <tr key={day} className="border-b border-gray-100 dark:border-zinc-800/50 hover:bg-gray-50/50 transition-colors">
                <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{day}</td>
                <td className="p-2">
                  <input 
                    value={nutritionData[day]?.items || ''} onChange={(e) => handleManualNutritionChange(day, e.target.value)} placeholder="Manuel de yazabilirsiniz..." 
                    className="w-full p-2 bg-transparent border border-transparent hover:border-gray-200 focus:border-brand-purple dark:hover:border-zinc-700 rounded-lg outline-none transition-all"
                  />
                </td>
                <td className="p-3 font-black text-brand-purple">{nutritionData[day]?.total || 0} <span className="text-xs font-bold opacity-50">kcal</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <button onClick={handleSaveProgram} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-sm shadow-md transition-transform active:scale-95">
        Beslenme Tablosunu Kaydet
      </button>
    </div>
  );
}