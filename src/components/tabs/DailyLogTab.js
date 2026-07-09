'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { downloadCSV, getMacroPercentage } from "@/lib/helpers";

export default function DailyLogTab({ targetId, currentUserId, userRole, selectedStudentIds }) {
  const [fetchedDailyLogs, setFetchedDailyLogs] = useState([]);
  const [water, setWater] = useState('');
  const [sodium, setSodium] = useState('');
  const [protein, setProtein] = useState('');
  const [carb, setCarb] = useState('');
  const [fat, setFat] = useState('');

  useEffect(() => {
    if (!targetId) return;
    supabase.from('daily_logs').select('*').eq('student_id', targetId).order('log_date', { ascending: false })
      .then(({ data }) => setFetchedDailyLogs(data || []));
  }, [targetId]);

  const handleDailySubmit = async (e) => {
    e.preventDefault();
    await supabase.from('daily_logs').insert([{ student_id: currentUserId, water_lt: parseFloat(water), sodium_mg: parseInt(sodium), macros: { protein, carb, fat } }]);
    alert("Günlük veriler kaydedildi!");
    setWater(''); setSodium(''); setProtein(''); setCarb(''); setFat('');
    supabase.from('daily_logs').select('*').eq('student_id', currentUserId).order('log_date', { ascending: false }).then(({ data }) => setFetchedDailyLogs(data || []));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {userRole === 'student' && (
        <form onSubmit={handleDailySubmit} className="space-y-4 border-b dark:border-zinc-800 pb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">SU (Litre)</label>
              <input type="number" step="0.1" value={water} onChange={e => setWater(e.target.value)} required className="w-full p-3 rounded-xl border outline-none focus:border-brand-purple" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">SODYUM (mg)</label>
              <input type="number" value={sodium} onChange={e => setSodium(e.target.value)} required className="w-full p-3 rounded-xl border outline-none focus:border-brand-purple" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input type="number" placeholder="Protein (g)" value={protein} onChange={e => setProtein(e.target.value)} required className="p-3 rounded-xl border outline-none" />
            <input type="number" placeholder="Karb (g)" value={carb} onChange={e => setCarb(e.target.value)} required className="p-3 rounded-xl border outline-none" />
            <input type="number" placeholder="Yağ (g)" value={fat} onChange={e => setFat(e.target.value)} required className="p-3 rounded-xl border outline-none" />
          </div>
          <button type="submit" className="w-full py-3 bg-brand-purple text-white font-bold rounded-xl shadow-lg">Antrenörüme Gönder</button>
        </form>
      )}
      
      {userRole === 'admin' && selectedStudentIds.length > 1 ? (
        <p className="text-sm text-brand-purple font-bold text-center py-10">Sadece 1 öğrenci seçili bırakın.</p>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-gray-800 dark:text-zinc-200">Rapor Geçmişi ve Makro Dağılımı</h4>
            {fetchedDailyLogs.length > 0 && <button onClick={() => downloadCSV(fetchedDailyLogs, 'Gunluk_Veriler', false)} className="text-xs font-bold px-3 py-1.5 bg-blue-500/10 text-blue-600 rounded-lg">📊 Excel İndir</button>}
          </div>
          <div className="space-y-4">
            {fetchedDailyLogs.length === 0 && <p className="text-sm text-gray-400">Kayıt bulunamadı.</p>}
            {fetchedDailyLogs.map(log => {
              const macros = getMacroPercentage(log.macros?.protein, log.macros?.carb, log.macros?.fat);
              return (
                <div key={log.id} className="p-5 bg-gray-50 dark:bg-zinc-950 rounded-3xl text-sm border hover:border-brand-purple/30 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-bold">{new Date(log.log_date).toLocaleDateString('tr-TR')}</span>
                    <span className="font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg">💧 {log.water_lt}L | 🧂 {log.sodium_mg}mg</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-red-500">Pro: {log.macros?.protein}g</span>
                      <span className="text-blue-500">Karb: {log.macros?.carb}g</span>
                      <span className="text-yellow-500">Yağ: {log.macros?.fat}g</span>
                    </div>
                    <div className="w-full h-3 flex rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800">
                      <div style={{ width: `${macros.p}%` }} className="bg-red-500 h-full"></div>
                      <div style={{ width: `${macros.c}%` }} className="bg-blue-500 h-full"></div>
                      <div style={{ width: `${macros.f}%` }} className="bg-yellow-500 h-full"></div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  );
}