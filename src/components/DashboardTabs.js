'use client'
import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";

// Modüllerimizi içeri aktarıyoruz
import StatsTab from "./tabs/StatsTab";
import AnnouncementsTab from "./tabs/AnnouncementsTab";
import FormCheckTab from "./tabs/FormCheckTab";
import DailyLogTab from "./tabs/DailyLogTab";
import NutritionTab from "./tabs/NutritionTab";
import WorkoutTab from "./tabs/WorkoutTab";

export function DashboardTabs({ currentUserId, userRole, students }) {
  const [activeTab, setActiveTab] = useState('formCheck');
  const exportRef = useRef(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 5;

  const [currentStreak, setCurrentStreak] = useState(0);
  const [announcements, setAnnouncements] = useState([]);

  const studentsList = students?.filter(s => s.role !== 'admin') || [];
  const filteredStudents = studentsList.filter(s => s.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
  const criticalStudents = studentsList.filter(s => s.current_streak === 0);
  
  const targetId = userRole === 'admin' ? (selectedStudentIds.length === 1 ? selectedStudentIds[0] : null) : currentUserId;

  useEffect(() => {
    if (!targetId) return;
    
    // Öğrencinin streak bilgisini çek
    supabase.from('profiles').select('current_streak').eq('id', targetId).single()
      .then(({ data }) => setCurrentStreak(data?.current_streak || 0));

    // Duyuruları çek (Rozet için)
    const d = new Date(); d.setDate(d.getDate() - 30);
    supabase.from('notifications').select('*').eq('student_id', targetId).gte('created_at', d.toISOString()).order('created_at', { ascending: false })
      .then(({ data }) => setAnnouncements(data || []));
      
  }, [targetId]);

  const handleDownloadImage = async () => {
    if (!exportRef.current) return;
    const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 2 });
    const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `kocluk_${activeTab}.png`; link.click();
  };

  const toggleStudent = (id) => setSelectedStudentIds(prev => prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]);
  const selectAll = () => setSelectedStudentIds(selectedStudentIds.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));
  const nextBtn = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));
  const prevBtn = () => setCurrentPage(p => Math.max(0, p - 1));

  // Ortak Gönderilecek Proplar
  const tabProps = {
    targetId,
    currentUserId,
    userRole,
    selectedStudentIds,
    onDownloadImage: handleDownloadImage
  };

  return (
    <div className="w-full mt-4">
      {/* Öğrenci Başlığı (Streak) */}
      {userRole === 'student' && (
        <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-orange-500/10 to-transparent p-4 rounded-2xl border border-orange-500/20">
          <div>
            <h3 className="text-sm font-black text-orange-600 dark:text-orange-400">🔥 GÜNLÜK SERİ (STREAK)</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">Raporları aksatmadan ilerliyorsun, bozma!</p>
          </div>
          <div className="text-3xl font-black text-orange-500 drop-shadow-md animate-pulse">{currentStreak} GÜN</div>
        </div>
      )}

      {/* Admin Öğrenci Paneli */}
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
              <div><h3 className="text-sm font-black text-brand-purple uppercase tracking-widest">Öğrenci Yönetimi</h3></div>
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

      {/* SEKMELER MENÜSÜ */}
      <div className="flex overflow-x-auto hide-scrollbar gap-6 border-b border-gray-200 dark:border-zinc-800 text-sm font-medium pb-2">
        {['announcements', 'stats', 'formCheck', 'daily', 'nutrition', 'workout'].map((tab) => (
          <button 
            key={tab} onClick={() => setActiveTab(tab)} 
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

      {/* RENDER EDİLEN AKTİF SEKME İÇERİĞİ */}
      <div ref={exportRef} className="mt-4 bg-white dark:bg-[#16161d] rounded-3xl p-5 md:p-8 border border-gray-100 dark:border-zinc-800 shadow-sm min-h-[400px]">
        {userRole === 'admin' && selectedStudentIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 font-bold text-sm">
            <span className="text-4xl mb-3 opacity-50">👥</span>Lütfen yukarıdaki panelden en az bir öğrenci seçin.
          </div>
        ) : (
          <>
            {activeTab === 'stats' && <StatsTab {...tabProps} />}
            {activeTab === 'announcements' && <AnnouncementsTab announcements={announcements} userRole={userRole} selectedStudentIds={selectedStudentIds} />}
            {activeTab === 'formCheck' && <FormCheckTab {...tabProps} />}
            {activeTab === 'daily' && <DailyLogTab {...tabProps} />}
            {activeTab === 'nutrition' && <NutritionTab {...tabProps} />}
            {activeTab === 'workout' && <WorkoutTab {...tabProps} />}
          </>
        )}
      </div>
    </div>
  );
}