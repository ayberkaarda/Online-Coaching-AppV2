'use client'

import { useTheme } from "next-themes" // Eğik çizgi değil TİRE (-) olmalı!
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const currentTheme = theme === 'system' ? systemTheme : theme

  return (
    <button
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="fixed bottom-6 right-6 p-4 rounded-full bg-white dark:bg-zinc-900 shadow-2xl border border-gray-200 dark:border-zinc-800 transition-all duration-300 hover:scale-110 z-50 flex items-center justify-center group"
      title="Temayı Değiştir"
    >
      {currentTheme === "dark" ? (
        <span className="text-2xl group-hover:text-yellow-400 transition-colors duration-300 drop-shadow-md">☀️</span>
      ) : (
        <span className="text-2xl group-hover:text-brand-purple transition-colors duration-300 drop-shadow-md">🌙</span>
      )}
    </button>
  )
}