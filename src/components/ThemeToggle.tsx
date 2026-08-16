'use client'

// Sağ alt köşede sabit duran açık/koyu tema anahtarı.
// Hidrasyon uyuşmazlığını önlemek için mount olana kadar hiçbir şey render etmez.

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'

// Effect gövdesinde senkron setState yasaklandığı için (react-hooks/set-state-in-effect),
// "mount oldu mu" sorusunu useSyncExternalStore ile harici bir gerçeğe bağlıyoruz:
// sunucu/ilk hidrasyonda false, istemci mount'undan sonra true döner.
const emptySubscribe = () => () => {}

export function ThemeToggle(): JSX.Element | null {
  const { theme, setTheme, systemTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  if (!mounted) return null

  // useTheme() `string | undefined` döner; 'system' seçiliyse gerçek temayı çöz.
  const currentTheme: string | undefined = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="group fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full border border-gray-200 bg-white p-4 shadow-2xl transition-all duration-300 hover:scale-110 dark:border-zinc-800 dark:bg-zinc-900"
      title="Temayı Değiştir"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {isDark ? (
        <span
          aria-hidden="true"
          className="text-2xl drop-shadow-md transition-colors duration-300 group-hover:text-yellow-400"
        >
          ☀️
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="text-2xl drop-shadow-md transition-colors duration-300 group-hover:text-brand-purple"
        >
          🌙
        </span>
      )}
    </button>
  )
}
