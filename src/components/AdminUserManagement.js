'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

export function AdminUserManagement({ students }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [studentData, setStudentData] = useState({ macros: [], poses: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [weightChartPeriod, setWeightChartPeriod] = useState('month');
  const [beforePose, setBeforePose] = useState(null);
  const [afterPose, setAfterPose] = useState(null);
  
  // YENİ: Öğrencilerin son form tarihlerini tutan state
  const [lastCheckins, setLastCheckins] = useState({});

  useEffect(() => {
    // Sayfa açıldığında tüm öğrencilerin son form tarihlerini hızlıca çek
    const fetchLastCheckins = async () => {
      const { data } = await supabase.from('form_checks').select('student_id, created_at').order('created_at', { ascending: false });
      if (data) {
        const latest = {};
        data.forEach(item => {
          if (!latest[item.student_id]) latest[item.student_id] = item.created_at;
        });
        setLastCheckins(latest);
      }
    };
    fetchLastCheckins();
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const fetchStudentDetails = async () => {
      setIsLoading(true);
      const { data: formChecks } = await supabase.from('form_checks').select('*').eq('student_id', selectedStudent.id).order('created_at', { ascending: false });
      const { data: dailyLogs } = await supabase.from('daily_logs').select('*').eq('student_id', selectedStudent.id).order('log_date', { ascending: false }).limit(14);

      const macroChartData = (dailyLogs || []).map(log => ({
        date: new Date(log.log_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        Protein: log.macros?.protein || 0,
        Karb: log.macros?.carb || 0,
        Yag: log.macros?.fat || 0
      })).reverse();

      setStudentData({ macros: macroChartData, poses: formChecks || [] });
      setIsLoading(false);
    };
    fetchStudentDetails();
  }, [selectedStudent]);

  useEffect(() => {
    if (studentData.poses && studentData.poses.length > 0) {
      setAfterPose(studentData.poses[0]); 
      setBeforePose(studentData.poses[studentData.poses.length - 1]); 
    } else {
      setAfterPose(null); setBeforePose(null);
    }
  }, [studentData.poses]);

  const openDrawer = (student) => {
    setSelectedStudent(student);
    setIsDrawerOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    document.body.style.overflow = 'auto';
    setTimeout(() => setSelectedStudent(null), 300);
  };

  // YENİ: Tek Tıkla Hatırlatma Gönderici
  const sendCheckinReminder = async () => {
    if (!selectedStudent) return;
    try {
      await supabase.from('notifications').insert([{
        student_id: selectedStudent.id,
        title: "⚠️ Check-in Zamanı!",
        message: "Koçunuz güncel formunuzu bekliyor. Lütfen kilonuzu ve form fotoğraflarınızı sisteme yükleyin."
      }]);
      alert(`${selectedStudent.full_name} adlı öğrenciye hatırlatma bildirimi gönderildi!`);
    } catch (error) {
      alert("Hata: " + error.message);
    }
  };

  // Öğrencinin form durumu hesaplayıcı (7 Günü geçtiyse Kırmızı)
  const getStatusColor = (studentId) => {
    const lastDate = lastCheckins[studentId];
    if (!lastDate) return 'bg-red-500'; // Hiç atmamış
    
    const diffTime = Math.abs(new Date() - new Date(lastDate));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays > 7 ? 'bg-red-500' : 'bg-emerald-500';
  };

  const getFilteredWeightData = () => {
    if (!studentData.poses || studentData.poses.length === 0) return [];
    const now = new Date();
    let cutoffDate = new Date(0); 
    if (weightChartPeriod === 'week') cutoffDate = new Date(now.setDate(now.getDate() - 7));
    else if (weightChartPeriod === 'month') cutoffDate = new Date(now.setDate(now.getDate() - 30));

    return studentData.poses
      .filter(pose => new Date(pose.created_at) >= cutoffDate)
      .map(pose => ({ date: new Date(pose.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), kilo: pose.current_weight }))
      .reverse(); 
  };

  const activeWeightData = getFilteredWeightData();
  const adminStudents = students?.filter(s => s.role !== 'admin') || [];

  return (
    <div>
      <h3 className="text-xl font-black text-gray-800 dark:text-zinc-200 mb-6">Öğrenci Portföyü</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {adminStudents.map(student => (
          <div key={student.id} onClick={() => openDrawer(student)} className="relative p-5 bg-white dark:bg-[#16161d] rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm cursor-pointer hover:border-brand-purple dark:hover:border-brand-purple transition-all group">
            
            {/* YENİ: Trafik Lambası Göstergesi */}
            <div className={`absolute top-4 right-4 w-3 h-3 rounded-full animate-pulse shadow-sm ${getStatusColor(student.id)}`} title="Yeşil: Form Güncel | Kırmızı: Form Gecikti"></div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-purple/10 text-brand-purple flex items-center justify-center font-black text-lg overflow-hidden border border-brand-purple/20">
                 {student.avatar_url ? <img src={student.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : student.full_name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-gray-800 dark:text-zinc-200 group-hover:text-brand-purple transition-colors">{student.full_name}</h4>
                <p className="text-xs text-gray-500">{student.email}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* --- SLIDE-OVER DRAWER --- */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDrawer} />

        <div className={`absolute right-0 top-0 h-full w-full max-w-2xl bg-slate-50 dark:bg-[#0f0f12] shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedStudent && (
            <div className="p-6 md:p-8 space-y-8 pb-24">
              
              <div className="flex justify-between items-center pb-4 border-b dark:border-zinc-800">
                <div>
                  <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-purple-500">{selectedStudent.full_name}</h2>
                  {/* YENİ: Tek Tıkla Bildirim Gönder Butonu */}
                  <button onClick={sendCheckinReminder} className="mt-2 text-xs font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1">
                    🔔 Form Hatırlatması Gönder
                  </button>
                </div>
                <button onClick={closeDrawer} className="w-10 h-10 bg-gray-200 dark:bg-zinc-800 rounded-full flex items-center justify-center font-bold text-gray-600 dark:text-gray-400 hover:bg-red-500 hover:text-white transition-all">✕</button>
              </div>

              {isLoading ? (
                <div className="animate-pulse flex flex-col gap-6"><div className="h-64 bg-gray-200 dark:bg-zinc-800 rounded-2xl w-full"></div></div>
              ) : (
                <>
                  <div className="bg-white dark:bg-[#16161d] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wider">Kilo Değişim Trendi</h3>
                      <div className="flex bg-gray-100 dark:bg-zinc-900 p-1 rounded-lg">
                        <button onClick={() => setWeightChartPeriod('week')} className={`px-3 py-1 text-xs font-bold rounded-md ${weightChartPeriod === 'week' ? 'bg-white dark:bg-zinc-700 text-brand-purple' : 'text-gray-500'}`}>1 Hafta</button>
                        <button onClick={() => setWeightChartPeriod('month')} className={`px-3 py-1 text-xs font-bold rounded-md ${weightChartPeriod === 'month' ? 'bg-white dark:bg-zinc-700 text-brand-purple' : 'text-gray-500'}`}>1 Ay</button>
                        <button onClick={() => setWeightChartPeriod('all')} className={`px-3 py-1 text-xs font-bold rounded-md ${weightChartPeriod === 'all' ? 'bg-white dark:bg-zinc-700 text-brand-purple' : 'text-gray-500'}`}>Tümü</button>
                      </div>
                    </div>
                    <div className="h-64 w-full">
                      {activeWeightData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={activeWeightData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
                            <Tooltip contentStyle={{ backgroundColor: '#16161d', border: '1px solid #27272a', borderRadius: '12px', color: '#fff' }} />
                            <Line type="monotone" dataKey="kilo" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (<div className="flex h-full items-center justify-center text-sm text-gray-500">Veri yok.</div>)}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#16161d] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                    <h3 className="font-bold text-sm text-gray-500 mb-4 uppercase tracking-wider">Son 14 Günlük Makro Alımı</h3>
                    <div className="h-72 w-full">
                      {studentData.macros.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={studentData.macros} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#16161d', border: '1px solid #27272a', borderRadius: '12px' }} />
                            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                            <Bar dataKey="Protein" stackId="a" fill="#8b5cf6" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="Karb" stackId="a" fill="#3b82f6" />
                            <Bar dataKey="Yag" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (<div className="flex h-full items-center justify-center text-sm text-gray-500">Veri yok.</div>)}
                    </div>
                  </div>

                  {studentData.poses.length > 0 && (
                    <div className="bg-white dark:bg-[#16161d] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
                      <h3 className="font-bold text-sm text-gray-500 mb-4 uppercase tracking-wider">Gelişim Kıyaslama (Before / After)</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <select value={beforePose?.id || ''} onChange={(e) => setBeforePose(studentData.poses.find(p => p.id === e.target.value))} className="w-full p-3 rounded-xl border dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm font-bold focus:outline-none focus:border-brand-purple">
                            {studentData.poses.map(pose => <option key={`before-${pose.id}`} value={pose.id}>{new Date(pose.created_at).toLocaleDateString('tr-TR')} ({pose.current_weight} kg)</option>)}
                          </select>
                          {beforePose && (
                            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-zinc-800">
                              <img src={beforePose.front_pose_url} alt="Before" className="object-cover w-full h-full" />
                              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-4">
                                <span className="bg-zinc-800 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Before</span>
                                <p className="text-white font-bold mt-1">{beforePose.current_weight} kg</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          <select value={afterPose?.id || ''} onChange={(e) => setAfterPose(studentData.poses.find(p => p.id === e.target.value))} className="w-full p-3 rounded-xl border border-brand-purple bg-brand-purple/5 dark:bg-brand-purple/10 text-brand-purple text-sm font-bold focus:outline-none">
                            {studentData.poses.map(pose => <option key={`after-${pose.id}`} value={pose.id}>{new Date(pose.created_at).toLocaleDateString('tr-TR')} ({pose.current_weight} kg)</option>)}
                          </select>
                          {afterPose && (
                            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden border-2 border-brand-purple">
                              <img src={afterPose.front_pose_url} alt="After" className="object-cover w-full h-full" />
                              <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-brand-purple/90 to-transparent p-4">
                                <span className="bg-white text-brand-purple text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">After</span>
                                <p className="text-white font-bold mt-1">{afterPose.current_weight} kg</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {beforePose && afterPose && (
                        <div className="mt-6 p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl flex justify-between items-center border border-gray-100 dark:border-zinc-800">
                          <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">Net Değişim</span>
                          <span className={`text-xl font-black ${afterPose.current_weight > beforePose.current_weight ? 'text-emerald-500' : afterPose.current_weight < beforePose.current_weight ? 'text-brand-purple' : 'text-gray-500'}`}>
                            {afterPose.current_weight > beforePose.current_weight ? '+' : ''}{(afterPose.current_weight - beforePose.current_weight).toFixed(1)} kg
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-6 pt-6 border-t dark:border-zinc-800">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-brand-purple uppercase tracking-wider">Beslenme Programı (Admin Editörü)</label>
                      <textarea defaultValue={selectedStudent.nutrition_plan} id={`nutrition-${selectedStudent.id}`} className="w-full h-32 p-4 rounded-xl border dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple" />
                      <button onClick={async () => { const val = document.getElementById(`nutrition-${selectedStudent.id}`).value; await supabase.from('profiles').update({ nutrition_plan: val }).eq('id', selectedStudent.id); alert('Kaydedildi!'); }} className="w-full py-3 bg-zinc-800 hover:bg-black dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black font-bold rounded-xl text-sm transition-all">Beslenmeyi Kaydet</button>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Antrenman Programı (Admin Editörü)</label>
                      <textarea defaultValue={selectedStudent.workout_plan} id={`workout-${selectedStudent.id}`} className="w-full h-32 p-4 rounded-xl border dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-emerald-500" />
                      <button onClick={async () => { const val = document.getElementById(`workout-${selectedStudent.id}`).value; await supabase.from('profiles').update({ workout_plan: val }).eq('id', selectedStudent.id); alert('Kaydedildi!'); }} className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-all">Antrenmanı Kaydet</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}