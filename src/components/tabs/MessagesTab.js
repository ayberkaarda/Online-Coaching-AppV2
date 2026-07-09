'use client'
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export default function MessagesTab({ targetId, currentUserId, userRole, selectedStudentIds }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [adminId, setAdminId] = useState(null);
  const messagesEndRef = useRef(null);

  // Öğrenci için Admin'in ID'sini bul
  useEffect(() => {
    if (userRole === 'student') {
      supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single()
        .then(({ data }) => setAdminId(data?.id));
    }
  }, [userRole]);

  // Mesajları Çek ve Supabase Realtime (Canlı) Dinlemeyi Başlat
  useEffect(() => {
    const chatPartnerId = userRole === 'admin' ? targetId : adminId;
    if (!currentUserId || !chatPartnerId) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${chatPartnerId}),and(sender_id.eq.${chatPartnerId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      scrollToBottom();
    };

    fetchMessages();

    // Supabase Anlık Dinleme (Realtime Subscription)
    const channel = supabase.channel('realtime-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new;
        if (
          (newMsg.sender_id === currentUserId && newMsg.receiver_id === chatPartnerId) ||
          (newMsg.sender_id === chatPartnerId && newMsg.receiver_id === currentUserId)
        ) {
          setMessages(prev => [...prev, newMsg]);
          scrollToBottom();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, targetId, adminId, userRole]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    const chatPartnerId = userRole === 'admin' ? targetId : adminId;
    if (!chatPartnerId) return alert("Sohbet edilecek kişi bulunamadı.");

    const msgData = {
      sender_id: currentUserId,
      receiver_id: chatPartnerId,
      message: newMessage.trim()
    };

    setNewMessage(''); // Inputu hemen temizle (Hızlı hissiyat)
    await supabase.from('messages').insert([msgData]);
  };

  if (userRole === 'admin' && (!selectedStudentIds || selectedStudentIds.length !== 1)) {
    return <p className="text-sm text-brand-purple font-bold text-center py-10">Sohbet etmek için sadece 1 öğrenci seçili bırakın.</p>;
  }

  return (
    <div className="flex flex-col h-[500px] bg-gray-50 dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-inner">
      {/* Sohbet Başlığı */}
      <div className="p-4 bg-white dark:bg-[#16161d] border-b border-gray-200 dark:border-zinc-800 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
        <h4 className="font-bold text-sm text-gray-800 dark:text-zinc-200">
          {userRole === 'admin' ? "Öğrenci ile Sohbet" : "Koç ile Sohbet"}
        </h4>
      </div>

      {/* Mesaj Kutusu */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 hide-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-gray-400 text-xs font-bold">
            Henüz mesaj yok. İlk mesajı gönder!
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] p-3 rounded-2xl text-sm ${isMe ? 'bg-brand-purple text-white rounded-br-none' : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-800 dark:text-zinc-200 rounded-bl-none shadow-sm'}`}>
                <p className="whitespace-pre-wrap">{msg.message}</p>
                <span className={`text-[9px] block mt-1 text-right ${isMe ? 'text-brand-purple-200 opacity-70' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Gönderme Formu */}
      <form onSubmit={sendMessage} className="p-4 bg-white dark:bg-[#16161d] border-t border-gray-200 dark:border-zinc-800 flex gap-2">
        <input 
          type="text" 
          value={newMessage} 
          onChange={(e) => setNewMessage(e.target.value)} 
          placeholder="Mesajınızı yazın..." 
          className="flex-1 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-sm focus:outline-none focus:border-brand-purple"
        />
        <button type="submit" disabled={!newMessage.trim()} className="px-6 py-3 bg-brand-purple text-white font-bold rounded-xl disabled:opacity-50 transition-transform active:scale-95 shadow-md">
          Gönder
        </button>
      </form>
    </div>
  );
}