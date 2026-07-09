'use client'
export default function AnnouncementsTab({ announcements, userRole, selectedStudentIds }) {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="border-b dark:border-zinc-800 pb-3"><h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Son 30 Günün Duyuruları</h4></div>
      {userRole === 'admin' && selectedStudentIds.length > 1 ? (
        <p className="text-sm text-brand-purple font-bold text-center py-10">Sadece 1 öğrenci seçili bırakın.</p>
      ) : announcements.length === 0 ? (
        <div className="p-8 text-center text-sm font-medium text-gray-400 bg-gray-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800">Duyuru bulunmuyor.</div>
      ) : (
        <div className="space-y-4">
          {announcements.map(ann => (
            <div key={ann.id} className="p-5 bg-gradient-to-br from-brand-purple/5 to-transparent border border-brand-purple/20 rounded-2xl relative overflow-hidden">
              <div className="absolute left-0 top-0 w-1 h-full bg-brand-purple" />
              <div className="flex justify-between items-center mb-3">
                <span className="font-black text-brand-purple text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>YENİ DUYURU</span>
                <span className="text-[11px] font-bold text-gray-500 bg-white dark:bg-zinc-900 px-3 py-1 rounded-lg border">{new Date(ann.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{ann.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}