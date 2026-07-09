'use client'

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [password, setPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/login');
      
      setUser(session.user);
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(data);
    }
    loadProfile();
  }, [router]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      setProfile({ ...profile, avatar_url: publicUrl });
      alert('Profil fotoğrafı güncellendi!');
    } catch (error) {
      alert('Hata: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) alert('Şifre güncellenemedi: ' + error.message);
    else {
      alert('Şifreniz başarıyla değiştirildi!');
      setPassword('');
    }
  };

  if (!profile) return <div className="min-h-screen flex items-center justify-center">Yükleniyor...</div>;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <button onClick={() => router.push('/')} className="mb-6 text-brand-purple font-bold flex items-center gap-2 hover:opacity-80 transition-opacity">
        ← Ana Sayfaya Dön
      </button>

      <div className="bg-white dark:bg-[#16161d] rounded-3xl p-8 border border-gray-100 dark:border-zinc-800 shadow-xl mb-8 flex flex-col md:flex-row gap-8 items-center md:items-start">
        {/* Avatar Bölümü */}
        <div className="relative group cursor-pointer">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-brand-purple/20 group-hover:border-brand-purple transition-all bg-gray-100 dark:bg-zinc-900 flex items-center justify-center">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">👤</span>
            )}
          </div>
          <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          {isUploading && <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white text-xs font-bold">Yükleniyor...</div>}
        </div>

        {/* Kullanıcı Bilgileri & Şifre */}
        <div className="flex-1 w-full space-y-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-zinc-200">{profile.full_name}</h1>
            <p className="text-gray-500 font-medium">{user.email}</p>
          </div>
          <form onSubmit={handlePasswordChange} className="pt-4 border-t dark:border-zinc-800 flex gap-3 max-w-md">
            <input 
              type="password" 
              placeholder="Yeni Şifre Belirle" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 p-3 rounded-xl border dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple"
              required minLength={6}
            />
            <button type="submit" className="px-6 py-3 bg-zinc-800 hover:bg-black dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black font-bold rounded-xl text-sm transition-all">
              Güncelle
            </button>
          </form>
        </div>
      </div>

      {/* Program Görüntüleme Alanı */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-[#16161d] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
          <h3 className="font-black text-lg text-brand-purple border-b dark:border-zinc-800 pb-3 mb-4">🥗 Beslenme Programım</h3>
          <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
            {profile.nutrition_plan || "Koçunuz henüz bir beslenme programı atamadı."}
          </div>
        </div>
        
        <div className="bg-white dark:bg-[#16161d] p-6 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
          <h3 className="font-black text-lg text-emerald-500 border-b dark:border-zinc-800 pb-3 mb-4">🏋️ Antrenman Programım</h3>
          <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
            {profile.workout_plan || "Koçunuz henüz bir antrenman programı atamadı."}
          </div>
        </div>
      </div>
    </div>
  );
}