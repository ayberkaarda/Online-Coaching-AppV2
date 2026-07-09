'use client'

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        // Giriş başarılıysa ana sayfaya yönlendir
        router.push('/');
      }
    } catch (err) {
      setErrorMsg("Beklenmeyen bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f0f12] p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#16161d] p-8 rounded-3xl shadow-2xl border border-gray-100 dark:border-zinc-800">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-purple to-purple-500 mb-2">
            Coaching Hub
          </h1>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">
            Sisteme Giriş Yapın
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-xl text-red-600 dark:text-red-400 text-sm font-bold text-center">
            {errorMsg === 'Invalid login credentials' ? 'E-posta veya şifre hatalı!' : errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">E-POSTA ADRESİ</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple transition-colors"
              placeholder="ornek@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">ŞİFRE</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-4 bg-gradient-to-r from-brand-purple to-purple-600 hover:from-purple-600 hover:to-brand-purple text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50"
          >
            {isLoading ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}
          </button>
        </form>

      </div>
    </div>
  );
}