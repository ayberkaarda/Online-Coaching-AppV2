'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DAYS, downloadCSV, getTodayName, formatTime } from "@/lib/helpers";

export default function WorkoutTab({ targetId, currentUserId, userRole, selectedStudentIds, onDownloadImage }) {
  const [exerciseDB, setExerciseDB] = useState([]);
  const [workoutData, setWorkoutData] = useState(DAYS.reduce((a, d) => ({ ...a, [d]: '' }), {}));
  const [workoutLogs, setWorkoutLogs] = useState([]);
  
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [isWaitingMyApproval, setIsWaitingMyApproval] = useState(false);

  const [smartSplit, setSmartSplit] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommenderFilter, setRecommenderFilter] = useState('');

  const [isLiveWorkout, setIsLiveWorkout] = useState(false);
  const [liveExercises, setLiveExercises] = useState([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [liveWeight, setLiveWeight] = useState('');
  const [liveReps, setLiveReps] = useState('');
  const [restTime, setRestTime] = useState(0);
  const [completedSets, setCompletedSets] = useState([]);
  
  // 🎥 GIF OYNATMA STATE'İ
  const [isGifPlaying, setIsGifPlaying] = useState(false);

  const [exerciseName, setExerciseName] = useState('');
  const [liftWeight, setLiftWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');

  useEffect(() => {
    // Kütüphaneden gif_url ve image (thumbnail) linklerini de çekiyoruz
    supabase.from('exercises').select('name, body_part, target, equipment, gif_url, image').then(({ data }) => setExerciseDB(data || []));
  }, []);

  useEffect(() => {
    const fetchTarget = userRole === 'admin' && selectedStudentIds.length === 1 ? selectedStudentIds[0] : currentUserId;
    if (!fetchTarget) return;

    supabase.from('profiles').select('workout_plan').eq('id', fetchTarget).single().then(({ data }) => {
      if (data?.workout_plan) {
        try { setWorkoutData(JSON.parse(data.workout_plan)); } catch(e) {}
      } else { setWorkoutData(DAYS.reduce((a, d) => ({ ...a, [d]: '' }), {})); }
    });

    supabase.from('workout_logs').select('*').eq('student_id', fetchTarget).order('created_at', { ascending: false }).then(({ data }) => setWorkoutLogs(data || []));

    supabase.from('program_approvals').select('*').eq('student_id', fetchTarget).eq('status', 'pending').then(({ data }) => {
      setPendingApprovals(data || []);
      if (userRole === 'student' && data?.length > 0) setIsWaitingMyApproval(true);
      else setIsWaitingMyApproval(false);
    });

  }, [targetId, currentUserId, userRole, selectedStudentIds]);

  useEffect(() => {
    let timer;
    if (restTime > 0) timer = setInterval(() => setRestTime(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [restTime]);

  const generateSmartWorkout = async () => {
    if (!smartSplit) return alert("Lütfen bir şablon seçin!");
    setIsGenerating(true);
    
    try {
      const response = await fetch("http://localhost:8000/api/generate-ai-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          split_type: smartSplit,
          user_prompt: aiPrompt,
          age: 20, 
          goal: "bulk",
          weight: 75
        })
      });

      const result = await response.json();
      if (result.status === "success") { setWorkoutData(result.workout_plan); } 
      else { alert("AI Sunucusundan hata döndü."); }
    } catch (error) {
      console.error("AI Bağlantı Hatası:", error);
      alert("Yapay Zeka (Python) sunucusuna ulaşılamadı. Python terminalini (localhost:8000) başlattığınızdan emin olun!");
    } finally { setIsGenerating(false); }
  };

  const sendToCoachForApproval = async () => {
    if (!workoutData || Object.keys(workoutData).length === 0) return alert("Program boş olamaz!");
    await supabase.from('program_approvals').insert([{ student_id: currentUserId, workout_data: workoutData, status: 'pending' }]);
    await supabase.from('notifications').insert([{ student_id: currentUserId, message: "🔔 Öğrenciniz yeni bir antrenman programını onayınıza sundu! (Admin Panelinden kontrol edin)" }]);
    setIsWaitingMyApproval(true);
    alert("Program taslağı koçuna gönderildi! Onaylandığında bildirim alacaksın.");
  };

  const approveProgram = async (approvalId, studentId, dataToApprove) => {
    await supabase.from('profiles').update({ workout_plan: JSON.stringify(dataToApprove) }).eq('id', studentId);
    await supabase.from('program_approvals').update({ status: 'approved' }).eq('id', approvalId);
    await supabase.from('notifications').insert([{ student_id: studentId, message: "✅ Koçun yeni antrenman programını onayladı! Artık kullanabilirsin." }]);
    alert("Program onaylandı ve öğrencinin profiline işlendi!");
    setPendingApprovals([]);
  };

  const handleSaveProgram = async () => {
    const target = userRole === 'admin' ? selectedStudentIds : [currentUserId];
    if (target.length === 0) return alert("Öğrenci seçin!");
    const updateData = { workout_plan: JSON.stringify(workoutData) };
    for (const sId of target) await supabase.from('profiles').update(updateData).eq('id', sId);
    alert("Antrenman Programı profiline kaydedildi!");
  };

  const startLiveWorkout = () => {
    const today = getTodayName();
    const todaysPlan = workoutData[today];
    
    if (!todaysPlan || todaysPlan.toLowerCase().includes('dinlenme') || todaysPlan.trim() === '') {
      return alert("Bugün dinlenme günün veya atanmış bir antrenman yok! Kaslarını dinlendir.");
    }

    const parsed = todaysPlan.split('\n').filter(line => /^\d+\./.test(line)).map(line => {
      const parts = line.split('-');
      if (parts.length < 2) return null;
      const name = parts[0].replace(/^\d+\.\s*/, '').trim();
      const setsReps = parts[1].split('|')[0].trim().split(/[xX]/);
      return { name, sets: parseInt(setsReps[0]) || 3, reps: parseInt(setsReps[1]) || 12 };
    }).filter(Boolean);

    if(parsed.length === 0) return alert("Antrenman formatı uygun değil.");
    setLiveExercises(parsed); setCurrentExIdx(0); setCurrentSet(1); setCompletedSets([]); setLiveWeight(''); setLiveReps(''); setRestTime(0); setIsLiveWorkout(true);
  };

  const handleCompleteSet = () => {
    if(!liveWeight || !liveReps) return alert("Lütfen bu set için kilo ve tekrar gir!");
    const ex = liveExercises[currentExIdx];
    setCompletedSets(prev => [...prev, { exercise_name: ex.name, weight_kg: parseFloat(liveWeight), reps: parseInt(liveReps), rpe: null }]);

    if (currentSet < ex.sets) {
      setCurrentSet(prev => prev + 1); setRestTime(90);
    } else {
      if (currentExIdx < liveExercises.length - 1) {
        setCurrentExIdx(prev => prev + 1); setCurrentSet(1); setRestTime(120); setLiveWeight('');
      } else {
        alert("🎉 İNANILMAZ! Bugünün tüm hareketlerini tamamladın!"); setRestTime(0);
      }
    }
  };

  const finishLiveWorkout = async () => {
    if (completedSets.length === 0) return setIsLiveWorkout(false);
    await supabase.from('workout_logs').insert(completedSets.map(s => ({ student_id: currentUserId, ...s })));
    alert("Antrenmanın başarıyla kaydedildi!");
    setIsLiveWorkout(false);
    supabase.from('workout_logs').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false }).then(({ data }) => setWorkoutLogs(data || []));
  };

  const handleWorkoutLogSubmit = async (e) => {
    e.preventDefault();
    await supabase.from('workout_logs').insert([{ student_id: currentUserId, exercise_name: exerciseName, weight_kg: parseFloat(liftWeight), reps: parseInt(reps), rpe: parseInt(rpe) || null }]);
    setExerciseName(''); setLiftWeight(''); setReps(''); setRpe('');
    supabase.from('workout_logs').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false }).then(({ data }) => setWorkoutLogs(data || []));
  };

  if (isLiveWorkout) {
    const currentExercise = liveExercises[currentExIdx];
    const exDetails = exerciseDB.find(e => e.name.toLowerCase() === currentExercise.name.toLowerCase());

    return (
      <div className="w-full mt-4 bg-white dark:bg-[#16161d] rounded-3xl p-6 md:p-10 border border-gray-100 dark:border-zinc-800 shadow-xl flex flex-col items-center animate-fadeIn relative">
        <button onClick={finishLiveWorkout} className="absolute top-4 right-4 text-xs font-bold px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg">Bitir</button>
        <h3 className="text-brand-purple font-black text-xl mb-2">🏋️ CANLI GYM MODU</h3>
        <p className="text-gray-500 text-sm font-bold mb-6 uppercase">{getTodayName()} Antrenmanı</p>

        {currentExIdx < liveExercises.length ? (
          <div className="w-full max-w-md bg-gray-50 dark:bg-zinc-900 rounded-3xl p-6 shadow-inner border text-center">
            {restTime > 0 ? (
              <div className="flex flex-col items-center py-6 animate-pulse">
                <p className="text-gray-500 font-bold mb-2">DİNLENME SÜRESİ</p>
                <div className="text-6xl font-black text-brand-purple font-mono">{formatTime(restTime)}</div>
                <button onClick={() => setRestTime(0)} className="mt-4 text-xs text-gray-400 underline">Süreyi Atla</button>
              </div>
            ) : (
              <>
                <p className="text-brand-purple font-bold text-sm bg-brand-purple/10 px-3 py-1 rounded-full mb-4 inline-block">Hareket {currentExIdx + 1} / {liveExercises.length}</p>
                
                {/* 🎥 YENİ: HOVER OYATICI (HOVER TO PLAY GIF) */}
                <div 
                  className="w-full h-48 bg-zinc-200 dark:bg-black rounded-xl mb-4 overflow-hidden flex items-center justify-center border border-gray-300 dark:border-zinc-800 relative cursor-pointer group"
                  onMouseEnter={() => setIsGifPlaying(true)}
                  onMouseLeave={() => setIsGifPlaying(false)}
                >
                  {exDetails?.gif_url || exDetails?.image ? (
                    <>
                      <img 
                        src={isGifPlaying && exDetails.gif_url ? exDetails.gif_url : (exDetails.image || exDetails.gif_url)} 
                        alt={currentExercise.name} 
                        className={`object-cover w-full h-full transition-all duration-300 ${isGifPlaying ? 'opacity-100 scale-105' : 'opacity-60 scale-100 grayscale'}`} 
                      />
                      {!isGifPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/60 text-white font-bold text-xs px-4 py-2 rounded-full backdrop-blur-sm group-hover:scale-110 transition-transform">
                            ▶️ Oynatmak için Üzerine Gel
                          </div>
                        </div>
                      )}
                      {exDetails?.equipment && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-md z-10">{exDetails.equipment}</span>}
                    </>
                  ) : (
                    <div className="text-gray-400 flex flex-col items-center gap-2">
                      <span className="text-3xl">🎥</span>
                      <span className="text-[10px] font-bold">Görsel Bulunamadı</span>
                    </div>
                  )}
                </div>

                <h2 className="text-2xl font-black text-gray-800 dark:text-zinc-100 mb-2">{currentExercise.name}</h2>
                <p className="text-gray-500 font-bold text-lg mb-6">Set {currentSet} / {currentExercise.sets} <span className="text-brand-purple opacity-50">({currentExercise.reps} Tekrar)</span></p>

                <div className="flex gap-4 mb-6">
                  <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">KİLO (KG)</label><input type="number" value={liveWeight} onChange={e => setLiveWeight(e.target.value)} className="w-full p-4 text-center text-xl font-black rounded-2xl border-2 dark:bg-black focus:border-brand-purple outline-none" /></div>
                  <div className="flex-1"><label className="block text-[10px] font-bold text-gray-400 mb-1">TEKRAR</label><input type="number" value={liveReps} onChange={e => setLiveReps(e.target.value)} placeholder={currentExercise.reps.toString()} className="w-full p-4 text-center text-xl font-black rounded-2xl border-2 dark:bg-black focus:border-brand-purple outline-none" /></div>
                </div>
                <button onClick={handleCompleteSet} className="w-full py-4 bg-brand-purple text-white text-lg font-black rounded-2xl active:scale-95 shadow-lg">{currentSet === currentExercise.sets ? 'Son Seti Tamamla' : 'Seti Tamamla'}</button>
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-10"><div className="text-6xl mb-4">🏆</div><h2 className="text-2xl font-black text-emerald-500 mb-2">MÜKEMMEL İŞ!</h2></div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {userRole === 'admin' && pendingApprovals.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 p-5 rounded-2xl shadow-sm">
          <h4 className="font-black text-orange-600 mb-2 flex items-center gap-2">⚠️ ONAY BEKLEYEN PROGRAM VAR</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">Öğrenci yapay zeka ile tasarladığı bu programı onayına sundu. İncele ve onayla.</p>
          <div className="flex gap-3">
            <button onClick={() => setWorkoutData(pendingApprovals[0].workout_data)} className="px-4 py-2 bg-white dark:bg-black border border-orange-200 text-orange-600 text-xs font-bold rounded-lg shadow-sm">👀 Taslağı Görüntüle</button>
            <button onClick={() => approveProgram(pendingApprovals[0].id, pendingApprovals[0].student_id, pendingApprovals[0].workout_data)} className="px-4 py-2 bg-orange-500 text-white text-xs font-black rounded-lg shadow-md hover:bg-orange-600">✅ Onayla ve Profiline İşle</button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
        <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Haftalık Antrenman Planı</h4>
        <div className="flex gap-2">
          {userRole === 'student' && !isWaitingMyApproval && <button onClick={startLiveWorkout} className="text-xs font-black px-4 py-2 bg-brand-purple text-white rounded-lg shadow-lg animate-pulse">🏋️ BUGÜNÜ BAŞLAT</button>}
          <button onClick={onDownloadImage} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple rounded-lg">🖼️ Görsel</button>
        </div>
      </div>

      {(!isWaitingMyApproval || userRole === 'admin') && (
        <div className="flex flex-col md:flex-row items-start gap-4 bg-gradient-to-br from-blue-500/10 to-brand-purple/5 p-5 rounded-2xl border border-blue-500/20 shadow-sm mb-6">
          <div className="text-4xl pt-2">🤖</div>
          <div className="flex-1 w-full space-y-3">
            <div>
              <p className="text-xs font-black text-blue-600 mb-1">AKILLI ANTRENÖR (AI)</p>
              <select value={smartSplit} onChange={(e) => setSmartSplit(e.target.value)} className="w-full p-3 bg-white dark:bg-zinc-900 border rounded-xl text-sm font-bold outline-none">
                <option value="">Şablon Seçin...</option><option value="ppl_torso_limbs">PPL + Torso + Limbs (5 Günlük)</option><option value="ppl">Push / Pull / Legs (3 Günlük)</option><option value="upper_lower">Upper / Lower (4 Günlük)</option>
              </select>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-500 mb-1">AI'A TALİMAT VER (PROMPT)</p>
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Örn: Çarşamba dinlenme. Sadece dumbell kullanacağım..." className="w-full p-3 bg-white dark:bg-zinc-900 border rounded-xl text-xs outline-none min-h-[60px]" />
            </div>
          </div>
          <button onClick={generateSmartWorkout} disabled={isGenerating} className="w-full md:w-auto h-full px-8 py-4 bg-blue-600 text-white font-black text-sm rounded-xl disabled:opacity-50">
            {isGenerating ? 'Analiz Ediliyor...' : 'Oluştur ✨'}
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className={`w-full ${userRole === 'admin' ? 'lg:w-2/3' : ''} overflow-x-auto border border-gray-200 dark:border-zinc-800 rounded-xl h-fit`}>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-zinc-900 border-b"><tr><th className="p-3">Gün</th><th className="p-3">Hareketler (Set x Tekrar)</th></tr></thead>
            <tbody>
              {DAYS.map(day => (
                <tr key={day} className={`border-b hover:bg-gray-50/50`}>
                  <td className={`p-3 font-bold`}>{day}</td>
                  <td className="p-2">
                    <textarea disabled={userRole === 'student' && isWaitingMyApproval} value={workoutData[day] || ''} onChange={(e) => setWorkoutData(prev => ({...prev, [day]: e.target.value}))} className="w-full p-2 bg-transparent border-transparent hover:border-gray-200 focus:border-brand-purple rounded-lg outline-none min-h-[120px]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {userRole === 'admin' && (
          <div className="w-full lg:w-1/3 bg-gray-50 dark:bg-zinc-900 border p-5 rounded-2xl h-fit">
            <h4 className="font-black text-sm mb-4">🔍 KÜTÜPHANEDE ARA</h4>
            <input type="text" placeholder="Kas veya Ekipman" value={recommenderFilter} onChange={(e) => setRecommenderFilter(e.target.value)} className="w-full p-2 mb-4 rounded-xl border focus:border-brand-purple outline-none" />
            <div className="space-y-2 max-h-[500px] overflow-y-auto hide-scrollbar">
              {exerciseDB.filter(ex => recommenderFilter ? ex.body_part?.toLowerCase().includes(recommenderFilter.toLowerCase()) || ex.target?.toLowerCase().includes(recommenderFilter.toLowerCase()) || ex.equipment?.toLowerCase().includes(recommenderFilter.toLowerCase()) : true).slice(0, 30).map((ex, i) => (
                <div key={i} className="p-3 bg-white dark:bg-[#16161d] rounded-xl border shadow-sm"><p className="font-bold text-xs">{ex.name}</p><div className="flex gap-2 mt-1 opacity-70"><span className="text-[9px] bg-brand-purple/10 text-brand-purple px-2 rounded">{ex.target || ex.body_part}</span><span className="text-[9px] bg-blue-500/10 text-blue-500 px-2 rounded">{ex.equipment}</span></div></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {userRole === 'admin' ? (
        <button onClick={handleSaveProgram} className="w-full py-4 bg-brand-purple text-white font-black rounded-xl shadow-md">Antrenman Tablosunu Güncelle</button>
      ) : (
        <button onClick={sendToCoachForApproval} disabled={isWaitingMyApproval} className={`w-full py-4 font-black rounded-xl shadow-md transition-all ${isWaitingMyApproval ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
          {isWaitingMyApproval ? '⏳ Koçun Onayı Bekleniyor...' : '📨 Bu Programı Koça Onaya Gönder'}
        </button>
      )}
    </div>
  );
}