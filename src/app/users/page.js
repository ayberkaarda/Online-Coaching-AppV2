'use client'

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdminUserManagement } from "@/components/AdminUserManagement";

export default function UsersPage() {
  const router = useRouter();
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  async function checkAdmin() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
    
    if (profile?.role !== 'admin') {
      router.replace('/'); // Admin değilse ana sayfaya geri şutla
      return;
    }

    // Admin ise öğrencileri çek
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setStudents(data || []);
    setIsLoading(false);
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;

  return (
    <main className="container mx-auto px-4 sm:px-6 py-12 relative max-w-6xl">
      <div className="absolute top-4 left-4 flex gap-2">
        <button onClick={() => router.push('/')} className="p-2 text-sm font-bold text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-all flex items-center gap-2">
          ← <span className="hidden sm:inline">Ana Sayfaya Dön</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="text-center mb-12 mt-12 md:mt-0">
        <h1 className="text-3xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-purple-400">
          Kullanıcı Yönetim Merkezi
        </h1>
        <p className="text-sm md:text-base font-medium text-gray-500 mt-2 uppercase tracking-widest">
          Öğrenci Analiz ve Program Editörü
        </p>
      </header>

      {/* Admin User Management Bileşenini Buraya Çağırıyoruz */}
      <AdminUserManagement students={students} />
    </main>
  );
}