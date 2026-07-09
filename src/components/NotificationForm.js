'use client'

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export function NotificationForm({ students }) {
  const [target, setTarget] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!title) return alert("Lütfen bir başlık girin.");
    
    setIsSending(true);

    try {
      if (target === 'all') {
        // Tüm öğrencilere (admin hariç) gönder
        const studentList = students.filter(s => s.role !== 'admin');
        const notifications = studentList.map(s => ({
          student_id: s.id,
          title: title,
          message: message
        }));
        
        const { error } = await supabase.from('notifications').insert(notifications);
        if (error) throw error;
      } else {
        // Sadece seçili öğrenciye gönder
        const { error } = await supabase.from('notifications').insert([{
          student_id: target,
          title: title,
          message: message
        }]);
        if (error) throw error;
      }

      alert("🚀 Duyuru başarıyla fırlatıldı!");
      setTitle('');
      setMessage('');
      setTarget('all');
    } catch (error) {
      alert("Hata oluştu: " + error.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#16161d] p-6 md:p-8 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">📢</span>
        <h3 className="font-black text-lg text-gray-800 dark:text-zinc-200">Duyuru & Mesaj Gönder</h3>
      </div>
      
      <form onSubmit={handleSendNotification} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">KİME</label>
          <select 
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple font-medium"
          >
            <option value="all">🌐 Tüm Öğrenciler</option>
            {students?.filter(s => s.role !== 'admin').map(s => (
              <option key={s.id} value={s.id}>👤 {s.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">BAŞLIK</label>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn: Yeni Antrenman Bloklarına Geçiş" 
            className="w-full p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">MESAJ DETAYI</label>
          <textarea 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Kardiyo süreleri 10 dakika artırıldı..." 
            className="w-full h-32 p-3.5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 text-sm focus:outline-none focus:border-brand-purple resize-none"
          />
        </div>

        <button 
          type="submit" 
          disabled={isSending}
          className="w-full py-4 bg-gradient-to-r from-brand-purple to-purple-600 hover:from-purple-600 hover:to-brand-purple text-white font-black rounded-xl text-sm transition-all disabled:opacity-50 shadow-lg shadow-purple-500/30"
        >
          {isSending ? 'Gönderiliyor...' : 'Gönder'}
        </button>
      </form>
    </div>
  );
}