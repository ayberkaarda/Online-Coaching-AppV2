'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function FormCheckTab({ targetId, currentUserId, userRole, selectedStudentIds }) {
  const [fetchedFormChecks, setFetchedFormChecks] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [beforeImageId, setBeforeImageId] = useState('');
  const [afterImageId, setAfterImageId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [weight, setWeight] = useState('');

  useEffect(() => {
    if (!targetId) return;
    supabase.from('form_checks').select('*').eq('student_id', targetId).order('created_at', { ascending: false }).then(({ data }) => {
      setFetchedFormChecks(data || []);
      if (data?.length >= 2) { setBeforeImageId(data[data.length - 1].id); setAfterImageId(data[0].id); }
    });
  }, [targetId]);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!currentUserId || !weight) return alert("Kilo giriniz.");
    const file = e.target.poseImage.files[0];
    if (!file) return alert("Fotoğraf seçiniz.");
    setIsUploading(true);
    try {
      const fileName = `${currentUserId}-${Math.random()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('form-checks-media').upload(`poses/${fileName}`, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('form-checks-media').getPublicUrl(`poses/${fileName}`);
      await supabase.from('form_checks').insert([{ student_id: currentUserId, current_weight: parseFloat(weight), front_pose_url: publicUrl, notes: "Yeni form" }]);
      await supabase.rpc('increment_streak', { user_id: currentUserId }).catch(() => {});
      alert("Form başarıyla iletildi!");
      e.target.reset(); setWeight('');
      const { data } = await supabase.from('form_checks').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false });
      setFetchedFormChecks(data || []);
    } catch (error) { alert("Hata: " + error.message); } finally { setIsUploading(false); }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
        <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Form Geçmişi ve Kıyaslama</h4>
        {fetchedFormChecks.length >= 2 && (
          <button onClick={() => setCompareMode(!compareMode)} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${compareMode ? 'bg-red-500 text-white' : 'bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20'}`}>
            {compareMode ? 'Kıyaslamayı Kapat' : 'Öncesi / Sonrası Yap'}
          </button>
        )}
      </div>

      {userRole === 'student' && !compareMode && (
        <form onSubmit={handleFileUpload} className="space-y-4 border-b dark:border-zinc-800 pb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-1/2">
              <label className="block text-xs font-bold text-gray-500 mb-1">GÜNCEL KİLO (KG)</label>
              <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} required className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple" />
            </div>
            <div className="w-full md:w-1/2">
              <label className="block text-xs font-bold text-gray-500 mb-1">PODYUM FOTOĞRAFI</label>
              <input type="file" name="poseImage" accept="image/*" required className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-brand-purple/10 file:text-brand-purple file:font-bold cursor-pointer hover:file:bg-brand-purple/20 transition-all" />
            </div>
          </div>
          <button type="submit" disabled={isUploading} className="w-full py-3 bg-brand-purple text-white font-bold rounded-xl text-sm disabled:opacity-50">
            {isUploading ? 'Yükleniyor...' : 'Formu Antrenörüme Gönder'}
          </button>
        </form>
      )}
      
      {userRole === 'admin' && selectedStudentIds.length > 1 ? (
        <p className="text-sm text-brand-purple font-bold text-center py-10">Sadece 1 öğrenci seçili bırakın.</p>
      ) : (
        <>
          {compareMode ? (
            <div className="flex flex-col md:flex-row gap-6 bg-gray-50 dark:bg-zinc-950 p-6 rounded-2xl border border-gray-200 dark:border-zinc-800">
              <div className="flex-1 space-y-3">
                <label className="block text-sm font-black text-center uppercase border-b pb-2">Öncesi</label>
                <select value={beforeImageId} onChange={(e) => setBeforeImageId(e.target.value)} className="w-full p-2 rounded-lg border text-xs font-bold outline-none">
                  {fetchedFormChecks.map(c => <option key={c.id} value={c.id}>{new Date(c.created_at).toLocaleDateString()} - {c.current_weight} kg</option>)}
                </select>
                <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden shadow-lg border-4 border-gray-200 dark:border-zinc-800">
                  <img src={fetchedFormChecks.find(c => c.id === beforeImageId)?.front_pose_url} alt="Before" className="object-cover w-full h-full" />
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <label className="block text-sm font-black text-brand-purple text-center uppercase border-b pb-2">Sonrası</label>
                <select value={afterImageId} onChange={(e) => setAfterImageId(e.target.value)} className="w-full p-2 rounded-lg border text-xs font-bold outline-none">
                  {fetchedFormChecks.map(c => <option key={c.id} value={c.id}>{new Date(c.created_at).toLocaleDateString()} - {c.current_weight} kg</option>)}
                </select>
                <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden shadow-lg border-4 border-brand-purple">
                  <img src={fetchedFormChecks.find(c => c.id === afterImageId)?.front_pose_url} alt="After" className="object-cover w-full h-full" />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fetchedFormChecks.length === 0 && <p className="text-sm text-gray-400">Kayıt bulunamadı.</p>}
              {fetchedFormChecks.map(check => (
                <div key={check.id} className="flex gap-4 p-4 bg-gray-50 dark:bg-zinc-950 rounded-2xl items-center border hover:scale-[1.02] transition-transform shadow-sm">
                  <img src={check.front_pose_url} alt="Form" className="w-20 h-20 object-cover rounded-xl" />
                  <div className="text-sm">
                    <p className="font-black text-brand-purple text-lg">{check.current_weight} kg</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(check.created_at).toLocaleDateString('tr-TR')} - {new Date(check.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}