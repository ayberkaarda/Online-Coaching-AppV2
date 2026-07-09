'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DAYS, downloadCSV, getTodayName, formatTime } from "@/lib/helpers";

export default function WorkoutTab({ targetId, currentUserId, userRole, selectedStudentIds, onDownloadImage }) {
  const [exerciseDB, setExerciseDB] = useState([]);
  const [workoutData, setWorkoutData] = useState(DAYS.reduce((a, d) => ({ ...a, [d]: '' }), {}));
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [smartSplit, setSmartSplit] = useState('');
  const [recommenderFilter, setRecommenderFilter] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [adminApprovals, setAdminApprovals] = useState([]);

// --- ÖĞRENCİ İÇİN: KOÇA ONAYA GÖNDER ---
const sendToCoachForApproval = async () => {
  if (!workoutData || Object.keys(workoutData).length === 0) return alert("Program boş olamaz!");
  // Gym Mode States
  const [isLiveWorkout, setIsLiveWorkout] = useState(false);
  const [liveExercises, setLiveExercises] = useState([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [liveWeight, setLiveWeight] = useState('');
  const [liveReps, setLiveReps] = useState('');
  const [restTime, setRestTime] = useState(0);
  const [completedSets, setCompletedSets] = useState([]);

  // Manual Log States
  const [exerciseName, setExerciseName] = useState('');
  const [liftWeight, setLiftWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');

  useEffect(() => {
    supabase.from('exercises').select('name, body_part, target, equipment').then(({ data }) => setExerciseDB(data || []));
  }, []);

  useEffect(() => {
    if (!targetId) return;
    supabase.from('profiles').select('workout_plan').eq('id', targetId).single().then(({ data }) => {
      if (data?.workout_plan) {
        try { setWorkoutData(JSON.parse(data.workout_plan)); } catch(e) {}
      } else {
        setWorkoutData(DAYS.reduce((a, d) => ({ ...a, [d]: '' }), {}));
      }
    });

    supabase.from('workout_logs').select('*').eq('student_id', targetId).order('created_at', { ascending: false }).then(({ data }) => {
      setWorkoutLogs(data || []);
    });
  }, [targetId]);

  useEffect(() => {
    let timer;
    if (restTime > 0) timer = setInterval(() => setRestTime(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [restTime]);

  const handleSaveProgram = async () => {
    if (selectedStudentIds.length === 0) return alert("Öğrenci seçin!");
    const updateData = { workout_plan: JSON.stringify(workoutData) };
    for (const sId of selectedStudentIds) await supabase.from('profiles').update(updateData).eq('id', sId);
    alert("Antrenman Programı başarıyla atandı!");
  };

  const generateSmartWorkout = () => {
    if (!smartSplit) return alert("Lütfen bir şablon seçin!");
    const splitConfigs = {
      'ppl': ['Push', 'Pull', 'Legs', 'Dinlenme', 'Push', 'Pull', 'Legs'],
      'upper_lower': ['Upper', 'Lower', 'Dinlenme', 'Upper', 'Lower', 'Dinlenme', 'Dinlenme'],
      'torso_limbs': ['Torso', 'Limbs', 'Dinlenme', 'Torso', 'Limbs', 'Dinlenme', 'Dinlenme'],
      'full_body': ['Full Body', 'Dinlenme', 'Full Body', 'Dinlenme', 'Full Body', 'Dinlenme', 'Dinlenme'],
      'bro_split': ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Dinlenme', 'Dinlenme']
    };
    const muscleMap = {
      'Push': ['chest', 'shoulders', 'triceps', 'deltoids'], 'Pull': ['back', 'biceps', 'forearms', 'lats'], 'Legs': ['upper legs', 'lower legs', 'glutes', 'calves', 'quads', 'hamstrings'],
      'Upper': ['chest', 'back', 'shoulders', 'biceps', 'triceps'], 'Lower': ['upper legs', 'lower legs', 'glutes', 'calves'], 'Torso': ['chest', 'back', 'shoulders', 'abs', 'waist'],
      'Limbs': ['biceps', 'triceps', 'upper legs', 'lower legs', 'calves', 'forearms'], 'Full Body': ['chest', 'back', 'upper legs', 'shoulders', 'biceps'], 
      'Chest': ['chest', 'pectorals'], 'Back': ['back', 'lats'], 'Shoulders': ['shoulders', 'deltoids'], 'Arms': ['biceps', 'triceps', 'forearms']
    };

    const daysConfig = splitConfigs[smartSplit];
    const newWorkoutData = {};

    daysConfig.forEach((dayType, index) => {
      const dayName = DAYS[index];
      if (dayType === 'Dinlenme') {
        newWorkoutData[dayName] = 'Dinlenme';
      } else {
        const targetMuscles = muscleMap[dayType] || [];
        const availableExercises = exerciseDB.filter(ex => targetMuscles.some(m => ex.body_part?.toLowerCase().includes(m) || ex.target?.toLowerCase().includes(m)));
        if (availableExercises.length > 0) {
          const shuffled = [...availableExercises].sort(() => 0.5 - Math.random());
          newWorkoutData[dayName] = shuffled.slice(0, 5).map((ex, i) => `${i + 1}. ${ex.name} - ${i < 2 ? '4x10' : '3x12'}`).join('\n');
        } else {
          newWorkoutData[dayName] = `${dayType} Günü (Manuel Hareket Ekle)`;
        }
      }
    });
    setWorkoutData(newWorkoutData);
  };

  const startLiveWorkout = () => {
    const today = getTodayName();
    const todaysPlan = workoutData[today];
    
    if (!todaysPlan || todaysPlan.toLowerCase().includes('dinlenme') || todaysPlan.trim() === '') {
      return alert("Bugün dinlenme günün veya atanmış bir antrenman yok! Kaslarını dinlendir.");
    }
    const parsed = todaysPlan.split('\n').map(line => {
      const lastDash = line.lastIndexOf('-');
      if (lastDash === -1) return null;
      const name = line.substring(0, lastDash).replace(/^\d+\.\s*/, '').trim();
      const setsReps = line.substring(lastDash + 1).trim().split(/[xX]/);
      return { name, sets: parseInt(setsReps[0]) || 3, reps: parseInt(setsReps[1]) || 12 };
    }).filter(Boolean);

    if(parsed.length === 0) return alert("Antrenman formatı uygun değil. Sistem 'Hareket Adı - SetxTekrar' formatı bekliyor.");

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
    const { data } = await supabase.from('workout_logs').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false });
    setWorkoutLogs(data || []);
  };

  const handleWorkoutLogSubmit = async (e) => {
    e.preventDefault();
    await supabase.from('workout_logs').insert([{ student_id: currentUserId, exercise_name: exerciseName, weight_kg: parseFloat(liftWeight), reps: parseInt(reps), rpe: parseInt(rpe) || null }]);
    setExerciseName(''); setLiftWeight(''); setReps(''); setRpe('');
    const { data } = await supabase.from('workout_logs').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false });
    setWorkoutLogs(data || []);
  };

  if (isLiveWorkout) {
    const currentExercise = liveExercises[currentExIdx];
    return (
      <div className="w-full mt-4 bg-white dark:bg-[#16161d] rounded-3xl p-6 md:p-10 border border-gray-100 dark:border-zinc-800 shadow-xl flex flex-col items-center animate-fadeIn relative">
        <button onClick={finishLiveWorkout} className="absolute top-4 right-4 text-xs font-bold px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg">Antrenmanı Bitir</button>
        <h3 className="text-brand-purple font-black text-xl mb-2">🏋️ CANLI GYM MODU</h3>
        <p className="text-gray-500 text-sm font-bold mb-8 uppercase">{getTodayName()} Antrenmanı</p>

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
                <h2 className="text-3xl font-black text-gray-800 dark:text-zinc-100 mb-2">{currentExercise.name}</h2>
                <p className="text-gray-500 font-bold text-lg mb-8">Set {currentSet} / {currentExercise.sets} <span className="text-brand-purple opacity-50">({currentExercise.reps} Tekrar)</span></p>

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
      <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
        <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Haftalık Antrenman Planı</h4>
        <div className="flex gap-2">
          {userRole === 'student' && <button onClick={startLiveWorkout} className="text-xs font-black px-4 py-2 bg-brand-purple text-white rounded-lg shadow-lg hover:bg-brand-purpleHover animate-pulse">🏋️ BUGÜNÜN ANTRENMANINI BAŞLAT</button>}
          <button onClick={onDownloadImage} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple rounded-lg">🖼️ Görsel İndir</button>
          <button onClick={() => downloadCSV([workoutData], 'Antrenman_Programi', false)} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple rounded-lg">📊 CSV İndir</button>
        </div>
      </div>

      {userRole === 'admin' && (
        <div className="flex items-center gap-3 bg-gradient-to-r from-blue-500/10 to-brand-purple/5 p-4 rounded-2xl border border-blue-500/20 shadow-sm mb-6">
          <div className="text-2xl">🤖</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-blue-600 mb-1">AKILLI ANTRENÖR ŞABLONU</p>
            <select value={smartSplit} onChange={(e) => setSmartSplit(e.target.value)} className="w-full p-2 bg-white dark:bg-zinc-900 border rounded-lg text-sm focus:outline-none focus:border-brand-purple">
              <option value="">Şablon Seçin...</option><option value="ppl">Push / Pull / Legs</option><option value="upper_lower">Upper / Lower</option><option value="torso_limbs">Torso / Limbs</option><option value="full_body">Full Body</option><option value="bro_split">Bro Split</option>
            </select>
          </div>
          <button onClick={generateSmartWorkout} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl">Otomatik Oluştur</button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className={`w-full ${userRole === 'admin' ? 'lg:w-2/3' : ''} overflow-x-auto border border-gray-200 dark:border-zinc-800 rounded-xl h-fit`}>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-zinc-900 border-b"><tr><th className="p-3">Gün</th><th className="p-3">Hareketler (Set x Tekrar)</th></tr></thead>
            <tbody>
              {DAYS.map(day => {
                const isToday = day === getTodayName();
                return (
                  <tr key={day} className={`border-b ${userRole === 'student' && isToday ? 'bg-brand-purple/5' : 'hover:bg-gray-50/50'}`}>
                    <td className={`p-3 font-bold ${userRole === 'student' && isToday ? 'text-brand-purple' : ''}`}>{day} {userRole === 'student' && isToday && <span className="block text-[10px] opacity-70">(Bugün)</span>}</td>
                    <td className="p-2">
                      {userRole === 'admin' ? (
                        <textarea value={workoutData[day] || ''} onChange={(e) => setWorkoutData(prev => ({...prev, [day]: e.target.value}))} className="w-full p-2 bg-transparent border-transparent hover:border-gray-200 focus:border-brand-purple rounded-lg outline-none min-h-[120px]" />
                      ) : ( <div className="p-2 whitespace-pre-wrap">{workoutData[day] || '-'}</div> )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {userRole === 'admin' && (
          <div className="w-full lg:w-1/3 bg-gray-50 dark:bg-zinc-900 border p-5 rounded-2xl h-fit">
            <h4 className="font-black text-sm mb-4">🔍 KÜTÜPHANEDE ARA</h4>
            <input type="text" placeholder="Kas veya Ekipman" value={recommenderFilter} onChange={(e) => setRecommenderFilter(e.target.value)} className="w-full p-2 mb-4 rounded-xl border focus:border-brand-purple outline-none" />
            <div className="space-y-2 max-h-[400px] overflow-y-auto hide-scrollbar">
              {exerciseDB.filter(ex => recommenderFilter ? ex.body_part?.toLowerCase().includes(recommenderFilter.toLowerCase()) || ex.target?.toLowerCase().includes(recommenderFilter.toLowerCase()) || ex.equipment?.toLowerCase().includes(recommenderFilter.toLowerCase()) : true).slice(0, 30).map((ex, i) => (
                <div key={i} className="p-3 bg-white dark:bg-[#16161d] rounded-xl border shadow-sm"><p className="font-bold text-xs">{ex.name}</p><div className="flex gap-2 mt-1 opacity-70"><span className="text-[9px] bg-brand-purple/10 text-brand-purple px-2 rounded">{ex.target || ex.body_part}</span><span className="text-[9px] bg-blue-500/10 text-blue-500 px-2 rounded">{ex.equipment}</span></div></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {userRole === 'admin' && <button onClick={handleSaveProgram} className="w-full py-3 bg-brand-purple text-white font-bold rounded-xl shadow-md">Antrenman Tablosunu Güncelle</button>}

      <div className="space-y-4 pt-6 border-t dark:border-zinc-800 mt-8">
        <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
          <h4 className="font-bold text-lg">Antrenman Geçmişi</h4>
          {workoutLogs.length > 0 && <button onClick={() => downloadCSV(workoutLogs, 'Antrenman_Gecmisi', false)} className="text-xs font-bold px-3 py-1.5 bg-blue-500/10 text-blue-600 rounded-lg">📥 Logları İndir</button>}
        </div>
        
        {userRole === 'student' && (
          <form onSubmit={handleWorkoutLogSubmit} className="bg-gray-50 dark:bg-zinc-950 p-4 rounded-2xl border space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="text" placeholder="Hareket Adı" value={exerciseName} onChange={e => setExerciseName(e.target.value)} required className="md:col-span-2 p-3 rounded-xl border outline-none" />
              <input type="number" step="0.5" placeholder="Kilo" value={liftWeight} onChange={e => setLiftWeight(e.target.value)} required className="p-3 rounded-xl border outline-none" />
              <input type="number" placeholder="Tekrar" value={reps} onChange={e => setReps(e.target.value)} required className="p-3 rounded-xl border outline-none" />
            </div>
            <div className="flex items-center gap-3">
              <input type="number" placeholder="RPE (Opsiyonel)" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} className="w-1/3 p-3 rounded-xl border outline-none" />
              <button type="submit" className="w-2/3 py-3 bg-brand-purple text-white font-bold rounded-xl">Kayıt Ekle</button>
            </div>
          </form>
        )}

        {userRole === 'admin' && selectedStudentIds.length > 1 ? (
          <p className="text-sm text-gray-400 text-center py-4">Geçmişi görmek için tek öğrenci seçin.</p>
        ) : (
          <div className="space-y-2">
            {workoutLogs.length === 0 && <p className="text-sm text-gray-400 py-4">Henüz kayıt yok.</p>}
            {workoutLogs.map(log => (
              <div key={log.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-zinc-950 border rounded-xl">
                <div><p className="font-bold text-sm">{log.exercise_name}</p><p className="text-[10px] text-gray-500">{new Date(log.created_at).toLocaleDateString('tr-TR')}</p></div>
                <div className="flex gap-2 text-xs font-mono font-bold">
                  <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-md text-brand-purple">{log.weight_kg} kg</span><span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-md text-blue-500">{log.reps} Tekrar</span>{log.rpe && <span className="bg-orange-100 px-2 py-1 rounded-md text-orange-600">RPE {log.rpe}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}}