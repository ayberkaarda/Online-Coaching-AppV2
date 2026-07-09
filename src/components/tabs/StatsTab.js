'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function StatsTab({ targetId, userRole, selectedStudentIds }) {
  const [fetchedFormChecks, setFetchedFormChecks] = useState([]);

  useEffect(() => {
    if (!targetId) return;
    supabase.from('form_checks').select('*').eq('student_id', targetId).order('created_at', { ascending: false })
      .then(({ data }) => setFetchedFormChecks(data || []));
  }, [targetId]);

  const chartData = {
    labels: fetchedFormChecks.slice().reverse().map(c => new Date(c.created_at).toLocaleDateString('tr-TR')),
    datasets: [{ label: 'Vücut Ağırlığı (kg)', data: fetchedFormChecks.slice().reverse().map(c => c.current_weight), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)', tension: 0.4, fill: true, pointRadius: 5 }],
  };
  const chartOptions = { responsive: true, plugins: { legend: { position: 'top', labels: { color: '#888' } }, title: { display: false } }, scales: { y: { ticks: { color: '#888' }, grid: { color: 'rgba(200, 200, 200, 0.1)' } }, x: { ticks: { color: '#888' }, grid: { display: false } } } };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="border-b dark:border-zinc-800 pb-3"><h4 className="font-bold text-lg text-gray-800 dark:text-zinc-200">Gelişim Analizi</h4></div>
      {userRole === 'admin' && selectedStudentIds.length > 1 ? (
        <p className="text-sm text-brand-purple font-bold text-center py-10">Grafikleri görüntülemek için sadece 1 öğrenci seçili bırakın.</p>
      ) : fetchedFormChecks.length < 2 ? (
        <div className="p-8 text-center text-sm font-medium text-gray-400 bg-gray-50 dark:bg-zinc-950/50 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-800">Grafik oluşturabilmek için en az 2 form check verisine ihtiyaç var.</div>
      ) : (
        <div className="p-4 bg-gray-50 dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"><Line data={chartData} options={chartOptions} /></div>
      )}
    </div>
  );
}