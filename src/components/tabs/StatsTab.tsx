'use client'

// Form check kayıtlarından kilo değişim grafiği (Chart.js).
// Grafiğe ekran okuyucular için metin özeti eşlik eder.

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { JSX } from 'react'

import { QueryState, SkeletonChart } from '@/components/ui'
import { tokens } from '@/design/tokens'
import { useFormChecks } from '@/hooks'
import { formatDateTR } from '@/lib/utils'
import type { UserRole } from '@/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

/**
 * `#RRGGBB` → klasik `rgba(r, g, b, a)`.
 *
 * Chart.js bu string'i doğrudan canvas 2D context `fillStyle` olarak kullanıyor;
 * klasik virgüllü söz dizimi (CSS Color 3) tüm motorlarda garanti destekleniyor,
 * CSS Color 4'ün boşluklu `rgb(r g b / a)` biçimi eski/mobil canvas
 * uygulamalarında güvenilir değil. `tailwind.config.ts`'teki `hexToRgbChannels`
 * ile aynı ayrıştırma mantığı, farklı çıktı biçimiyle (client bundle'a Node'a
 * özgü `tailwindcss/plugin` bağımlılığı taşımamak için yerel tutuluyor).
 */
function hexToRgba(hex: string, alpha: number): string {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (digits === undefined) throw new Error(`Geçersiz hex: ${hex}`)
  const value = Number.parseInt(digits, 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface StatsTabProps {
  targetId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

export default function StatsTab({
  targetId,
  userRole,
  selectedClientIds,
}: StatsTabProps): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useFormChecks(targetId)

  const formChecks = data ?? []
  // Sorgu en yeniden eskiye gelir; grafik kronolojik olmalı.
  const chronological = [...formChecks].reverse()

  const chartData: ChartData<'line'> = {
    labels: chronological.map((c) => formatDateTR(c.created_at)),
    datasets: [
      {
        label: 'Vücut Ağırlığı (kg)',
        data: chronological.map((c) => c.current_weight),
        // Chart.js JS renk değeri bekliyor; statik tokens.light.accent kullanılıyor
        // (tema duyarlı grafik renkleri Faz 4 grafik tekleştirme işine ait, bkz. AC-4.3).
        borderColor: tokens.light.accent,
        backgroundColor: hexToRgba(tokens.light.accent, 0.2),
        tension: 0.4,
        fill: true,
        pointRadius: 5,
      },
    ],
  }

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top', labels: { color: '#888' } },
      title: { display: false },
    },
    scales: {
      y: { ticks: { color: '#888' }, grid: { color: 'rgba(200, 200, 200, 0.1)' } },
      x: { ticks: { color: '#888' }, grid: { display: false } },
    },
  }

  const first = chronological[0]
  const last = chronological[chronological.length - 1]
  const summary =
    first && last
      ? `İlk kayıt ${first.current_weight} kg, son kayıt ${last.current_weight} kg, net değişim ${(
          last.current_weight - first.current_weight
        ).toFixed(1)} kg.`
      : ''

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="border-b pb-3 dark:border-zinc-800">
        <h4 className="text-lg font-bold text-gray-800 dark:text-zinc-200">Gelişim Analizi</h4>
      </div>

      {userRole === 'coach' && selectedClientIds.length > 1 ? (
        <p className="py-10 text-center text-sm font-bold text-accent">
          Grafikleri görüntülemek için sadece 1 danışan seçili bırakın.
        </p>
      ) : (
        <QueryState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={formChecks.length < 2}
          skeleton={<SkeletonChart />}
          emptyMessage="Grafik oluşturabilmek için en az 2 form check verisine ihtiyaç var."
          onRetry={() => void refetch()}
        >
          <figure className="rounded-2xl border border-gray-100 bg-gray-50 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <Line data={chartData} options={chartOptions} />
            <figcaption className="sr-only">Vücut ağırlığı değişim grafiği. {summary}</figcaption>
          </figure>
        </QueryState>
      )}
    </div>
  )
}
