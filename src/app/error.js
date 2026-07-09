'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }) {
  useEffect(() => {
    // Hatayı tarayıcı konsoluna zorla yazdır
    console.error("YAKALANAN KRİTİK HATA:", error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200 p-8">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-2xl border border-red-200 dark:border-red-900 max-w-2xl w-full">
        <h2 className="text-3xl font-black mb-4 text-red-600 dark:text-red-500">🚨 Kritik Çökme Tespit Edildi!</h2>
        <p className="font-bold mb-2">Beyaz ekranın sebebi şu:</p>
        
        <div className="bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300 p-4 rounded-xl w-full overflow-auto font-mono text-sm mb-6 border border-red-200 dark:border-red-900">
          {error.message}
        </div>
        
        <button
          onClick={() => reset()}
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all w-full"
        >
          Sistemi Yeniden Yüklemeyi Dene
        </button>
      </div>
    </div>
  )
}