'use client'

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const downloadCSV = (data, filename, isText = false) => {
  if (!data || data.length === 0) {
    alert("İndirilecek veri bulunamadı.");
    return;
  }
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
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function DashboardTabs({ currentUserId, userRole, students }) {
  const [activeTab, setActiveTab] = useState('formCheck');
  const exportRef = useRef(null);

  // Arama, Sayfalama, Seçim
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 5;

  // Öncesi/Sonrası (Before/After) State'leri
  const [compareMode, setCompareMode] = useState(false);
  const [beforeImageId, setBeforeImageId] = useState('');
  const [afterImageId, setAfterImageId] = useState('');

  const studentsList = students?.filter(s => s.role !== 'admin') || [];
  const filteredStudents = studentsList.filter(s => s.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const criticalStudents = studentsList.filter(s => s.current_streak === 0);

  const nextBtn = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));
  const prevBtn = () => setCurrentPage(p => Math.max(0, p - 1));
  const toggleStudent = (id) => setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]);
  const selectAll = () => setSelectedStudentIds(selectedStudentIds.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));

  const targetId = userRole === 'admin' ? (selectedStudentIds.length === 1 ? selectedStudentIds[0] : null) : currentUserId;

  // Veriler
  const [fetchedFormChecks, setFetchedFormChecks] = useState([]);
  const [fetchedDailyLogs, setFetchedDailyLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [nutritionPlan, setNutritionPlan] = useState('');
  const [workoutPlan, setWorkoutPlan] = useState('');
  const [currentStreak, setCurrentStreak] = useState(0);

  // Form State'leri
  const [isUploading, setIsUploading] = useState(false);
  const [weight, setWeight] = useState('');
  const [water, setWater] = useState('');
  const [sodium, setSodium] = useState('');
  const [protein, setProtein] = useState('');
  const [carb, setCarb] = useState('');
  const [fat, setFat] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [liftWeight, setLiftWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');

  useEffect(() => {
    if (userRole === 'admin') {
      const fetchTemplates = async () => {
        const { data } = await supabase.from('program_templates').select('*');
        setTemplates(data || []);
      };
      fetchTemplates();
    }

    if (!targetId) {
      setFetchedFormChecks([]); setFetchedDailyLogs([]); setAnnouncements([]); setWorkoutLogs([]); setNutritionPlan(''); setWorkoutPlan('');
      return;
    }

    const fetchData = async () => {
      if (activeTab === 'formCheck' || activeTab === 'stats') {
        const { data } = await supabase.from('form_checks').select('*').eq('student_id', targetId).order('created_at', { ascending: false });
        setFetchedFormChecks(data || []);
        if (data?.length >= 2) {
          setBeforeImageId(data[data.length - 1].id);
          setAfterImageId(data[0].id);
        }
      } else if (activeTab === 'daily') {
        const { data } = await supabase.from('daily_logs').select('*').eq('student_id', targetId).order('log_date', { ascending: false });
        setFetchedDailyLogs(data || []);
      } else if (activeTab === 'workout') {
        const { data } = await supabase.from('workout_logs').select('*').eq('student_id', targetId).order('created_at', { ascending: false });
        setWorkoutLogs(data || []);
      } else if (activeTab === 'announcements') {
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data } = await supabase.from('notifications').select('*').eq('student_id', targetId).gte('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false });
        setAnnouncements(data || []);
      }
      
      const { data: profileData } = await supabase.from('profiles').select('nutrition_plan, workout_plan, current_streak').eq('id', targetId).single();
      if (profileData) {
        setNutritionPlan(profileData.nutrition_plan || '');
        setWorkoutPlan(profileData.workout_plan || '');
        setCurrentStreak(profileData.current_streak || 0);
      }
    };
    fetchData();
  }, [activeTab, targetId, userRole]);

  useEffect(() => {
    if (userRole === 'student' && currentUserId) {
      const getInitialAnnouncements = async () => {
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data } = await supabase.from('notifications').select('id').eq('student_id', currentUserId).gte('created_at', thirtyDaysAgo.toISOString());
        setAnnouncements(data || []);
      };
      getInitialAnnouncements();
    }
  }, [currentUserId, userRole]);

  const handleSaveProgram = async (type) => {
    if (selectedStudentIds.length === 0) return alert("Lütfen programı atamak için en az bir öğrenci seçin!");
    const updateData = type === 'nutrition' ? { nutrition_plan: nutritionPlan } : { workout_plan: workoutPlan };
    for (const sId of selectedStudentIds) {
      await supabase.from('profiles').update(updateData).eq('id', sId);
    }
    alert(`Program ${selectedStudentIds.length} öğrenciye başarıyla atandı!`);
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!currentUserId || !weight) return alert("Kilo giriniz.");
    const file = e.target.poseImage.files[0];
    if (!file) return alert("Fotoğraf seçiniz.");

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUserId}-${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('form-checks-media').upload(`poses/${fileName}`, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('form-checks-media').getPublicUrl(`poses/${fileName}`);

      await supabase.from('form_checks').insert([{ student_id: currentUserId, current_weight: parseFloat(weight), front_pose_url: publicUrl, notes: "Yeni form" }]);
      await supabase.rpc('increment_streak', { user_id: currentUserId }).catch(() => {});

      alert("Form başarıyla iletildi!");
      e.target.reset(); setWeight('');
      const { data } = await supabase.from('form_checks').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false });
      setFetchedFormChecks(data || []);
    } catch (error) {
      alert("Hata: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDailySubmit = async (e) => {
    e.preventDefault();
    await supabase.from('daily_logs').insert([{ student_id: currentUserId, water_lt: parseFloat(water), sodium_mg: parseInt(sodium), macros: { protein, carb, fat } }]);
    alert("Günlük veriler kaydedildi!");
    setWater(''); setSodium(''); setProtein(''); setCarb(''); setFat('');
    const { data } = await supabase.from('daily_logs').select('*').eq('student_id', currentUserId).order('log_date', { ascending: false });
    setFetchedDailyLogs(data || []);
  };

  const handleWorkoutLogSubmit = async (e) => {
    e.preventDefault();
    await supabase.from('workout_logs').insert([{ student_id: currentUserId, exercise_name: exerciseName, weight_kg: parseFloat(liftWeight), reps: parseInt(reps), rpe: parseInt(rpe) || null }]);
    setExerciseName(''); setLiftWeight(''); setReps(''); setRpe('');
    const { data } = await supabase.from('workout_logs').select('*').eq('student_id', currentUserId).order('created_at', { ascending: false });
    setWorkoutLogs(data || []);
  };

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 2 });
    const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `kocluk_${activeTab}.png`; link.click();
  };

  const currentStudentProfile = students?.find(s => s.id === currentUserId);

  const chartData = {
    labels: fetchedFormChecks.slice().reverse().map(c => new Date(c.created_at).toLocaleDateString('tr-TR')),
    datasets: [{
        label: 'Vücut Ağırlığı (kg)',
        data: fetchedFormChecks.slice().reverse().map(c => c.current_weight),
        borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)',
        tension: 0.4, fill: true, pointBackgroundColor: '#8b5cf6', pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#8b5cf6', pointRadius: 5, pointHoverRadius: 7,
    }],
  };
  const chartOptions = { responsive: true, plugins: { legend: { position: 'top', labels: { color: '#888' } }, title: { display: false } }, scales: { y: { ticks: { color: '#888' }, grid: { color: 'rgba(200, 200, 200, 0.1)' } }, x: { ticks: { color: '#888' }, grid: { display: false } } } };

  // Makro Oran Hesaplayıcı
  const getMacroPercentage = (p, c, f) => {
    const pro = parseFloat(p) || 0; const car = parseFloat(c) || 0; const fat = parseFloat(f) || 0;
    const total = pro + car + fat;
    if (total === 0) return { p: 0, c: 0, f: 0 };
    return { p: (pro/total)*100, c: (car/total)*100, f: (fat/total)*100 };
  };

  return (
    <div className="w-full mt-4">
      {userRole === 'student' && (
        <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-transparent p-4 rounded-2xl border border-orange-500/20">
          <div>
            <h3 className="text-sm font-black text-orange-600 dark:text-orange-400">🔥 GÜNLÜK SERİ (STREAK)</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">Raporları aksatmadan ilerliyorsun, bozma!</p>
          </div>
          <div className="text-3xl font-black text-orange-500 drop-shadow-md animate-pulse">
          {currentStreak} GÜN
          </div>
        </div>
      )}

      {userRole === 'admin' && (
        <>
          {criticalStudents.length > 0 && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-4">
              <h3 className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span> Acil İlgilenilmesi Gerekenler
              </h3>
              <div className="flex gap-3 overflow-x-auto hide-scrollbar">
                {criticalStudents.map(s => (
                  <div key={s.id} onClick={() => toggleStudent(s.id)} className="cursor-pointer bg-white dark:bg-[#16161d] px-3 py-2 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm border border-red-100 dark:border-red-900/20 whitespace-nowrap hover:scale-105 transition-transform">
                    ⚠️ {s.full_name.split(' ')[0]}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8 bg-white dark:bg-[#16161d] rounded-3xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden p-5 transition-all">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-gray-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-brand-purple uppercase tracking-widest">Öğrenci Yönetimi</h3>
              </div>
              <div className="relative w-full md:w-64">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">🔍</span>
                <input type="text" placeholder="Öğrenci Ara..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-sm focus:outline-none focus:border-brand-purple transition-all" />
              </div>
              <div className="flex items-center gap-4 w-full md:w-auto justify-between">
                <button onClick={selectAll} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-brand-purple hover:text-white transition-all whitespace-nowrap">
                  {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0 ? 'SEÇİMİ TEMİZLE' : 'TÜMÜNÜ SEÇ'}
                </button>
                <div className="flex gap-2">
                  <button onClick={prevBtn} disabled={currentPage === 0} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 disabled:opacity-30 hover:bg-brand-purple hover:text-white transition-all">{'<'}</button>
                  <button onClick={nextBtn} disabled={currentPage >= totalPages - 1 || totalPages === 0} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 disabled:opacity-30 hover:bg-brand-purple hover:text-white transition-all">{'>'}</button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden relative w-full h-24">
              {filteredStudents.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs font-bold text-gray-400">Aramayla eşleşen öğrenci bulunamadı.</div>
              ) : (
                <div className="flex transition-transform duration-500 ease-out absolute left-0 top-0 h-full" style={{ transform: `translateX(-${currentPage * 100}%)`, width: `${totalPages * 100}%` }}>
                  {Array.from({ length: totalPages }).map((_, pageIndex) => (
                    <div key={pageIndex} className="flex gap-4 justify-around px-2" style={{ width: `${100 / totalPages}%` }}>
                      {filteredStudents.slice(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE).map(student => {
                        const isSelected = selectedStudentIds.includes(student.id);
                        return (
                          <div key={student.id} onClick={() => toggleStudent(student.id)} className="flex flex-col items-center gap-2 cursor-pointer group w-16 relative">
                            <div className="relative">
                              <img src={`https://ui-avatars.com/api/?name=${student.full_name}&background=random&color=fff&bold=true`} alt={student.full_name} className={`w-14 h-14 rounded-full object-cover transition-all duration-300 shadow-sm ${isSelected ? 'ring-4 ring-brand-purple scale-110' : 'opacity-60 group-hover:scale-105 group-hover:opacity-100 grayscale hover:grayscale-0'}`} />
                              {student.current_streak > 0 && <span className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-zinc-900">{student.current_streak}</span>}
                            </div>
                            <span className={`text-[10px] font-bold text-center w-full truncate ${isSelected ? 'text-brand-purple' : 'text-gray-500'}`}>{student.full_name.split(' ')[0]}</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SEKMELER */}
      <div className="flex overflow-x-auto hide-scrollbar gap-6 border-b border-gray-200 dark:border-zinc-800 text-sm font-medium pb-2">
        {['announcements', 'stats', 'formCheck', 'daily', 'nutrition', 'workout'].map((tab) => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)} 
            className={`pb-2 whitespace-nowrap transition-all relative flex items-center gap-2 ${activeTab === tab ? 'text-brand-purple font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            {tab === 'announcements' && (<>🔔 Duyurular {announcements.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce">{announcements.length}</span>}</>)}
            {tab === 'stats' && '📈 İstatistikler'}
            {tab === 'formCheck' && '📸 Form Check'}
            {tab === 'daily' && '📊 Günlük Veriler'}
            {tab === 'nutrition' && '🥗 Beslenme'}
            {tab === 'workout' && '🏋️ Antrenman'}
            {activeTab === tab && <span className="absolute bottom-[-9px] left-0 w-full h-[2px] bg-brand-purple shadow-[0_0_8px_rgba(139,92,246,0.8)]" />}
          </button>
        ))}
      </div>

      <div className="flex justify-end mt-4">
        <button onClick={handleDownloadImage} className="text-xs bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 px-3 py-2 rounded-lg font-bold transition-all">Görsel İndir</button>
      </div>

      <div ref={exportRef} className="mt-4 bg-white dark:bg-[#16161d] rounded-3xl p-5 md:p-8 border border-gray-100 dark:border-zinc-800 shadow-sm min-h-[400px]">
        
        {userRole === 'admin' && selectedStudentIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 font-bold text-sm">
            <span className="text-4xl mb-3 opacity-50">👥</span>Lütfen yukarıdaki panelden en az bir öğrenci seçin.
          </div>
        ) : (
          <>
            {activeTab === 'stats' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="border-b dark:border-zinc-800 pb-3">
                  <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Gelişim Analizi</h4>
                </div>
                {userRole === 'admin' && selectedStudentIds.length > 1 ? (
                  <p className="text-sm text-brand-purple font-bold text-center py-10">Grafikleri görüntülemek için sadece 1 öğrenci seçili bırakın.</p>
                ) : fetchedFormChecks.length < 2 ? (
                  <div className="p-8 text-center text-sm font-medium text-gray-400 bg-gray-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800">Grafik oluşturabilmek için en az 2 form check verisine ihtiyaç var.</div>
                ) : (
                  <div className="p-4 bg-gray-50 dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"><Line data={chartData} options={chartOptions} /></div>
                )}
              </div>
            )}

            {activeTab === 'announcements' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="border-b dark:border-zinc-800 pb-3"><h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Son 30 Günün Duyuruları</h4></div>
                {userRole === 'admin' && selectedStudentIds.length > 1 ? (
                  <p className="text-sm text-brand-purple font-bold text-center py-10">Sadece 1 öğrenci seçili bırakın.</p>
                ) : announcements.length === 0 ? (
                  <div className="p-8 text-center text-sm font-medium text-gray-400 bg-gray-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800">Duyuru bulunmuyor.</div>
                ) : (
                  <div className="space-y-4">
                    {announcements.map(ann => (
                      <div key={ann.id} className="p-5 bg-gradient-to-br from-brand-purple/5 to-transparent dark:from-brand-purple/10 dark:to-transparent border border-brand-purple/20 rounded-2xl relative overflow-hidden">
                        <div className="absolute left-0 top-0 w-1 h-full bg-brand-purple" />
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-black text-brand-purple text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>YENİ DUYURU</span>
                          <span className="text-[11px] font-bold text-gray-500 bg-white dark:bg-zinc-900 px-3 py-1 rounded-lg border border-gray-100 dark:border-zinc-800">{new Date(ann.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{ann.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'nutrition' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
                  <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Güncel Beslenme Programı</h4>
                  <button onClick={() => downloadCSV(nutritionPlan, 'Beslenme_Programi', true)} className="text-xs font-bold px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-all flex items-center gap-2">📊 CSV İndir</button>
                </div>
                {userRole === 'admin' ? (
                  <div className="space-y-3">
                    <div className="flex justify-end mb-2">
                      <select onChange={(e) => e.target.value && setNutritionPlan(e.target.value)} className="p-2 text-xs font-bold rounded-lg border border-brand-purple/30 bg-brand-purple/5 text-brand-purple focus:outline-none">
                        <option value="">+ Hazır Şablon Kullan</option>
                        {templates.filter(t => t.category === 'nutrition').map(t => <option key={t.id} value={t.content}>{t.title}</option>)}
                      </select>
                    </div>
                    <textarea value={nutritionPlan} onChange={(e) => setNutritionPlan(e.target.value)} placeholder="Örn: 3000 Kalori..." className="w-full h-48 p-4 rounded-xl border dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none" />
                    <button onClick={() => handleSaveProgram('nutrition')} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all">{selectedStudentIds.length > 1 ? 'Toplu Beslenme Programı Ata' : 'Beslenme Programını Güncelle'}</button>
                  </div>
                ) : (
                  <div className="p-5 bg-gray-50 dark:bg-zinc-950 rounded-2xl whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{nutritionPlan || "Koçunuz henüz bir beslenme programı atamadı."}</div>
                )}
              </div>
            )}

            {activeTab === 'workout' && (
              <div className="space-y-8 animate-fadeIn">
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
                    <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Güncel Antrenman Programı</h4>
                    <button onClick={() => downloadCSV(workoutPlan, 'Antrenman_Programi', true)} className="text-xs font-bold px-3 py-1.5 bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 rounded-lg transition-all flex items-center gap-2">📊 CSV İndir</button>
                  </div>
                  {userRole === 'admin' ? (
                    <div className="space-y-3">
                      <div className="flex justify-end mb-2">
                        <select onChange={(e) => e.target.value && setWorkoutPlan(e.target.value)} className="p-2 text-xs font-bold rounded-lg border border-brand-purple/30 bg-brand-purple/5 text-brand-purple focus:outline-none">
                          <option value="">+ Hazır Şablon Kullan</option>
                          {templates.filter(t => t.category === 'workout').map(t => <option key={t.id} value={t.content}>{t.title}</option>)}
                        </select>
                      </div>
                      <textarea value={workoutPlan} onChange={(e) => setWorkoutPlan(e.target.value)} placeholder="Örn: Push/Pull/Legs Split..." className="w-full h-48 p-4 rounded-xl border dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none" />
                      <button onClick={() => handleSaveProgram('workout')} className="w-full py-3 bg-brand-purple hover:bg-brand-purpleHover text-white font-bold rounded-xl text-sm transition-all">{selectedStudentIds.length > 1 ? 'Toplu Antrenman Programı Ata' : 'Antrenman Programını Güncelle'}</button>
                    </div>
                  ) : (
                    <div className="p-5 bg-gray-50 dark:bg-zinc-950 rounded-2xl whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{workoutPlan || "Koçunuz henüz bir antrenman programı atamadı."}</div>
                  )}
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-100 dark:border-zinc-800">
                  <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
                    <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">İnteraktif Antrenman Günlüğü</h4>
                    {workoutLogs.length > 0 && <button onClick={() => downloadCSV(workoutLogs, 'Antrenman_Gecmisi', false)} className="text-xs font-bold px-3 py-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-lg transition-all">📥 Logları İndir</button>}
                  </div>
                  
                  {userRole === 'student' && (
                    <form onSubmit={handleWorkoutLogSubmit} className="bg-gray-50 dark:bg-zinc-950 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 space-y-3 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input type="text" placeholder="Hareket Adı (Örn: Bench Press)" value={exerciseName} onChange={e => setExerciseName(e.target.value)} required className="md:col-span-2 p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-brand-purple" />
                        <input type="number" step="0.5" placeholder="Kilo (kg)" value={liftWeight} onChange={e => setLiftWeight(e.target.value)} required className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-brand-purple" />
                        <input type="number" placeholder="Tekrar" value={reps} onChange={e => setReps(e.target.value)} required className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-brand-purple" />
                      </div>
                      <div className="flex items-center gap-3">
                        <input type="number" placeholder="RPE (Opsiyonel 1-10)" min="1" max="10" value={rpe} onChange={e => setRpe(e.target.value)} className="w-1/3 p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:border-brand-purple" />
                        <button type="submit" className="w-2/3 py-3 bg-brand-purple text-white font-bold rounded-xl text-sm shadow-md hover:bg-brand-purpleHover transition-colors">Kayıt Ekle</button>
                      </div>
                    </form>
                  )}

                  {userRole === 'admin' && selectedStudentIds.length > 1 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Geçmişi görmek için tek öğrenci seçin.</p>
                  ) : (
                    <div className="space-y-2">
                      {workoutLogs.length === 0 && <p className="text-sm text-gray-400 py-4">Henüz antrenman kaydı girilmedi.</p>}
                      {workoutLogs.map(log => (
                        <div key={log.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-zinc-950 border border-gray-100 dark:border-zinc-800 rounded-xl hover:border-brand-purple/30 transition-colors">
                          <div><p className="font-bold text-gray-800 dark:text-zinc-200 text-sm">{log.exercise_name}</p><p className="text-[10px] text-gray-500 mt-0.5">{new Date(log.created_at).toLocaleDateString('tr-TR')}</p></div>
                          <div className="flex gap-2 text-xs font-mono font-bold">
                            <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-md text-brand-purple">{log.weight_kg} kg</span>
                            <span className="bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded-md text-blue-500">{log.reps} Tekrar</span>
                            {log.rpe && <span className="bg-orange-100 dark:bg-orange-900/20 px-2 py-1 rounded-md text-orange-600">RPE {log.rpe}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === YENİ: BEFORE/AFTER EKLENMİŞ FORM CHECK === */}
            {activeTab === 'formCheck' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center border-b dark:border-zinc-800 pb-3">
                  <h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Form Geçmişi ve Kıyaslama</h4>
                  {fetchedFormChecks.length >= 2 && (
                    <button onClick={() => setCompareMode(!compareMode)} className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${compareMode ? 'bg-red-500 text-white shadow-md shadow-red-500/30' : 'bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20'}`}>
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
                          <label className="block text-xs font-bold text-gray-500 mb-1">PODYUM / FORM FOTOĞRAFI</label>
                          <input type="file" name="poseImage" accept="image/*" required className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:bg-brand-purple/10 file:text-brand-purple file:font-bold cursor-pointer hover:file:bg-brand-purple/20 transition-all" />
                        </div>
                      </div>
                      <button type="submit" disabled={isUploading} className="w-full py-3 bg-brand-purple text-white font-bold rounded-xl text-sm disabled:opacity-50 shadow-lg shadow-brand-purple/30">
                        {isUploading ? 'Görsel Yükleniyor...' : 'Formu Antrenörüme Gönder'}
                      </button>
                  </form>
                )}
                
                {userRole === 'admin' && selectedStudentIds.length > 1 ? (
                  <p className="text-sm text-brand-purple font-bold text-center py-10">Form geçmişini görüntülemek için sadece 1 öğrenci seçili bırakın.</p>
                ) : (
                  <>
                    {/* KIYASLAMA MODU (BEFORE / AFTER) */}
                    {compareMode ? (
                      <div className="space-y-6 bg-gray-50 dark:bg-zinc-950 p-6 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-inner">
                        <div className="flex flex-col md:flex-row gap-6">
                          {/* ÖNCESİ (BEFORE) */}
                          <div className="flex-1 space-y-3">
                            <label className="block text-sm font-black text-gray-600 dark:text-gray-300 text-center uppercase tracking-widest border-b dark:border-zinc-800 pb-2">Öncesi (Before)</label>
                            <select value={beforeImageId} onChange={(e) => setBeforeImageId(e.target.value)} className="w-full p-2 rounded-lg border dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold focus:outline-none focus:border-brand-purple">
                              {fetchedFormChecks.map(check => (
                                <option key={check.id} value={check.id}>{new Date(check.created_at).toLocaleDateString('tr-TR')} - {check.current_weight} kg</option>
                              ))}
                            </select>
                            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden shadow-lg border-4 border-gray-200 dark:border-zinc-800">
                              <img src={fetchedFormChecks.find(c => c.id === beforeImageId)?.front_pose_url} alt="Before" className="object-cover w-full h-full" />
                            </div>
                          </div>

                          {/* SONRASI (AFTER) */}
                          <div className="flex-1 space-y-3">
                            <label className="block text-sm font-black text-brand-purple text-center uppercase tracking-widest border-b dark:border-zinc-800 pb-2">Sonrası (After)</label>
                            <select value={afterImageId} onChange={(e) => setAfterImageId(e.target.value)} className="w-full p-2 rounded-lg border dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-bold focus:outline-none focus:border-brand-purple">
                              {fetchedFormChecks.map(check => (
                                <option key={check.id} value={check.id}>{new Date(check.created_at).toLocaleDateString('tr-TR')} - {check.current_weight} kg</option>
                              ))}
                            </select>
                            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden shadow-lg border-4 border-brand-purple">
                              <img src={fetchedFormChecks.find(c => c.id === afterImageId)?.front_pose_url} alt="After" className="object-cover w-full h-full" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fetchedFormChecks.length === 0 && <p className="text-sm text-gray-400">Kayıt bulunamadı.</p>}
                        {fetchedFormChecks.map(check => (
                          <div key={check.id} className="flex gap-4 p-4 bg-gray-50 dark:bg-zinc-950 rounded-2xl items-center border border-gray-100 dark:border-zinc-800 hover:scale-[1.02] transition-transform shadow-sm">
                            <img src={check.front_pose_url} alt="Form" className="w-20 h-20 object-cover rounded-xl shadow-sm" />
                            <div className="text-sm">
                              <p className="font-black text-brand-purple text-lg">{check.current_weight} kg</p>
                              <p className="text-xs font-medium text-gray-500 mt-1">{new Date(check.created_at).toLocaleDateString('tr-TR')} - {new Date(check.created_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* === YENİ: GÖRSEL MAKRO İLERLEME ÇUBUKLU GÜNLÜK VERİLER === */}
            {activeTab === 'daily' && (
              <div className="space-y-6 animate-fadeIn">
                {userRole === 'student' && (
                  <form onSubmit={handleDailySubmit} className="space-y-4 border-b dark:border-zinc-800 pb-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">SU (Litre)</label>
                        <input type="number" step="0.1" value={water} onChange={e => setWater(e.target.value)} required className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">SODYUM (mg)</label>
                        <input type="number" value={sodium} onChange={e => setSodium(e.target.value)} required className="w-full p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <input type="number" placeholder="Protein (g)" value={protein} onChange={e => setProtein(e.target.value)} required className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm font-medium focus:outline-none focus:border-brand-purple" />
                      <input type="number" placeholder="Karb (g)" value={carb} onChange={e => setCarb(e.target.value)} required className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm font-medium focus:outline-none focus:border-brand-purple" />
                      <input type="number" placeholder="Yağ (g)" value={fat} onChange={e => setFat(e.target.value)} required className="p-3 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm font-medium focus:outline-none focus:border-brand-purple" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-brand-purple text-white font-bold rounded-xl text-sm shadow-lg shadow-brand-purple/30">Günlük Verileri Antrenörüme Gönder</button>
                  </form>
                )}
                
                {userRole === 'admin' && selectedStudentIds.length > 1 ? (
                  <p className="text-sm text-brand-purple font-bold text-center py-10">Günlük verileri görüntülemek için sadece 1 öğrenci seçili bırakın.</p>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-gray-800 dark:text-zinc-200">Rapor Geçmişi ve Makro Dağılımı</h4>
                      {fetchedDailyLogs.length > 0 && <button onClick={() => downloadCSV(fetchedDailyLogs, 'Gunluk_Veriler', false)} className="text-xs font-bold px-3 py-1.5 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 rounded-lg transition-all">📊 Excel İndir</button>}
                    </div>
                    <div className="space-y-4">
                      {fetchedDailyLogs.length === 0 && <p className="text-sm text-gray-400">Kayıt bulunamadı.</p>}
                      {fetchedDailyLogs.map(log => {
                        const macros = getMacroPercentage(log.macros?.protein, log.macros?.carb, log.macros?.fat);
                        return (
                          <div key={log.id} className="p-5 bg-gray-50 dark:bg-zinc-950 rounded-3xl text-sm border border-gray-100 dark:border-zinc-800 hover:border-brand-purple/30 transition-colors shadow-sm">
                            <div className="flex justify-between items-center mb-4">
                              <span className="font-bold text-gray-800 dark:text-zinc-200">{new Date(log.log_date).toLocaleDateString('tr-TR')}</span>
                              <span className="font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-lg">💧 {log.water_lt}L | 🧂 {log.sodium_mg}mg</span>
                            </div>
                            
                            {/* İlerleme Çubuğu */}
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-red-500">Protein: {log.macros?.protein}g</span>
                                <span className="text-blue-500">Karb: {log.macros?.carb}g</span>
                                <span className="text-yellow-500">Yağ: {log.macros?.fat}g</span>
                              </div>
                              <div className="w-full h-3 flex rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800">
                                <div style={{ width: `${macros.p}%` }} className="bg-red-500 h-full transition-all duration-500"></div>
                                <div style={{ width: `${macros.c}%` }} className="bg-blue-500 h-full transition-all duration-500"></div>
                                <div style={{ width: `${macros.f}%` }} className="bg-yellow-500 h-full transition-all duration-500"></div>
                              </div>
                            </div>

                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}