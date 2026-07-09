'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationForm } from "@/components/NotificationForm";
import { DashboardTabs } from "@/components/DashboardTabs";

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [students, setStudents] = useState([]);
  
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.replace('/login');
    
    setIsAuthenticated(true);
    setCurrentUser(session.user);

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    setUserRole(profile?.role || 'student');

    if (profile?.role === 'admin') {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      setStudents(data || []);
    } else {
      fetchNotifications(session.user.id);
    }
  }

  async function fetchNotifications(userId) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('student_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  }

  async function markAsRead(notifId) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
    setNotifications(notifications.filter(n => n.id !== notifId));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f0f12]">
        <div className="animate-pulse text-brand-purple font-black text-xl tracking-widest">
          SİSTEM YÜKLENİYOR...
        </div>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 py-12 relative max-w-6xl">
      <div className="absolute top-4 left-4 flex gap-2 items-center z-50">
        
        {/* ÖĞRENCİ BİLDİRİM ZİLİ */}
        {userRole === 'student' && (
          <div className="relative">
            <button 
              onClick={() => setShowNotifs(!showNotifs)} 
              className="p-2 text-xl hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-all relative"
            >
              🔔
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute top-12 left-0 w-80 bg-white dark:bg-[#16161d] rounded-2xl shadow-2xl border border-gray-100 dark:border-zinc-800 overflow-hidden">
                <div className="p-4 border-b dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 font-bold text-sm">Gelen Kutusu</div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">Yeni bildiriminiz yok.</div>
                  ) : (
                    notifications.map(notif => (
                      <div key={notif.id} className="p-4 border-b dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors">
                        <h4 className="font-bold text-sm text-brand-purple mb-1">{notif.title}</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">{notif.message}</p>
                        <button onClick={() => markAsRead(notif.id)} className="text-xs font-bold text-emerald-500 hover:text-emerald-600 flex items-center gap-1">
                          ✓ Okundu İşaretle
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AKILLI MENÜ BUTONLARI */}
        {userRole === 'admin' ? (
          <button onClick={() => router.push('/users')} className="p-2 text-sm font-bold text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-all flex items-center gap-2">
            👥 <span className="hidden sm:inline">Kullanıcı Yönetimi</span>
          </button>
        ) : (
          <button onClick={() => router.push('/profile')} className="p-2 text-sm font-bold text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-all flex items-center gap-2">
            ⚙️ <span className="hidden sm:inline">Profilim</span>
          </button>
        )}
        
        <button onClick={handleLogout} className="p-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all flex items-center gap-2">
          🚪 <span className="hidden sm:inline">Çıkış Yap</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="text-center mb-12 space-y-2 mt-12 md:mt-0">
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-purple-400">
          Closed-Loop Coaching Hub
        </h1>
        <p className="text-sm md:text-base font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          {userRole === 'admin' ? 'Yönetici Paneli' : 'Öğrenci Paneli'}
        </p>
      </header>

      <div className={`flex flex-col lg:flex-row gap-8 items-start`}>
        {userRole === 'admin' && (
          <div className="w-full lg:w-1/3 space-y-6">
            <NotificationForm students={students} />
          </div>
        )}
        <div className={`w-full ${userRole === 'admin' ? 'lg:w-2/3' : 'max-w-3xl mx-auto'}`}>
          <DashboardTabs currentUserId={currentUser?.id} userRole={userRole} students={students} />
        </div>
      </div>
    </main>
  );
}