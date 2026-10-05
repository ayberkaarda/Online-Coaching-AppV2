'use client'

// Sağ alt köşede sabit duran açık/koyu tema anahtarı.
// Hidrasyon uyuşmazlığını önlemek için mount olana kadar hiçbir şey render etmez.

import { Moon, Sun } from 'lucide-react'
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
      className="group fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full border border-border bg-surface-raised p-4 shadow-raised transition-colors duration-fast ease-standard"
      title="Temayı Değiştir"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {isDark ? (
        <Sun
          aria-hidden="true"
          className="h-6 w-6 transition-colors duration-base group-hover:text-accent"
        />
      ) : (
        <Moon
          aria-hidden="true"
          className="h-6 w-6 transition-colors duration-base group-hover:text-accent"
        />
      )}
    </button>
  )
}
