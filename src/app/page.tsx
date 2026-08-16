'use client'

// Ana panel (Dashboard): oturum + role göre admin/öğrenci görünümü, bildirim zili.

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import {
  useMarkNotificationRead,
  useNotifications,
  useProfile,
  useProfiles,
  useSession,
  useSignOut,
} from '@/hooks'
import { DashboardTabs } from '@/components/DashboardTabs'
import { NotificationForm } from '@/components/NotificationForm'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function DashboardPage(): JSX.Element {
  const router = useRouter()

  const { data: session, isLoading: isSessionLoading } = useSession()
  const userId = session?.user.id

  const { data: profile } = useProfile(userId)
  const role = profile?.role

  const { data: allProfiles } = useProfiles()
  const { data: notifications } = useNotifications(userId, { unreadOnly: true })

  const signOut = useSignOut()
  const markAsRead = useMarkNotificationRead()

  const [showNotifs, setShowNotifs] = useState(false)
  const notifRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace('/login')
    }
  }, [isSessionLoading, session, router])

  // Panel dışına tıklayınca veya Escape'e basınca bildirim panelini kapat.
  useEffect(() => {
    if (!showNotifs) return

    function handleClickOutside(event: MouseEvent): void {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifs(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setShowNotifs(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showNotifs])

  function handleLogout(): void {
    signOut.mutate(undefined, {
      onSuccess: () => router.push('/login'),
    })
  }

  const students = allProfiles ?? []
  const notifList = notifications ?? []
  const unreadCount = notifList.length

  if (isSessionLoading || !session) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0f0f12]"
      >
        <div className="animate-pulse text-xl font-black tracking-widest text-brand-purple">
          SİSTEM YÜKLENİYOR...
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="container relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="absolute left-4 top-4 z-50 flex items-center gap-2">
        {/* ÖĞRENCİ BİLDİRİM ZİLİ */}
        {role === 'student' && (
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              aria-label={`Bildirimler${unreadCount > 0 ? `, ${unreadCount} okunmamış` : ''}`}
              aria-expanded={showNotifs}
              aria-haspopup="menu"
              aria-controls="notification-panel"
              className="relative rounded-lg p-2 text-xl transition-all hover:bg-gray-100 dark:hover:bg-zinc-800"
            >
              <span aria-hidden="true">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
                  <span className="sr-only">{unreadCount} okunmamış bildirim</span>
                </span>
              )}
            </button>

            {showNotifs && (
              <div
                id="notification-panel"
                role="region"
                aria-label="Gelen kutusu"
                className="absolute left-0 top-12 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#16161d]"
              >
                <div className="border-b bg-gray-50 p-4 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-950">
                  Gelen Kutusu
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifList.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      Yeni bildiriminiz yok.
                    </div>
                  ) : (
                    notifList.map((notif) => (
                      <div
                        key={notif.id}
                        className="border-b p-4 transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <h4 className="mb-1 text-sm font-bold text-brand-purple">{notif.title}</h4>
                        <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
                          {notif.message}
                        </p>
                        <button
                          onClick={() => markAsRead.mutate({ id: notif.id, userId })}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-500 hover:text-emerald-600"
                        >
                          ✓ Okundu İşaretle
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AKILLI MENÜ BUTONLARI */}
        {role === 'admin' ? (
          <button
            onClick={() => router.push('/users')}
            aria-label="Kullanıcı Yönetimi"
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-brand-purple transition-all hover:bg-brand-purple/10"
          >
            <span aria-hidden="true">👥</span>{' '}
            <span className="hidden sm:inline">Kullanıcı Yönetimi</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/profile')}
            aria-label="Profilim"
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-brand-purple transition-all hover:bg-brand-purple/10"
          >
            <span aria-hidden="true">⚙️</span> <span className="hidden sm:inline">Profilim</span>
          </button>
        )}

        <button
          onClick={handleLogout}
          aria-label="Çıkış Yap"
          className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-red-500 transition-all hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <span aria-hidden="true">🚪</span> <span className="hidden sm:inline">Çıkış Yap</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="mb-12 mt-12 space-y-2 text-center md:mt-0">
        <h1 className="bg-gradient-to-r from-brand-purple to-purple-400 bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-5xl">
          Closed-Loop Coaching Hub
        </h1>
        <p className="text-sm font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400 md:text-base">
          {role === 'admin' ? 'Yönetici Paneli' : 'Öğrenci Paneli'}
        </p>
      </header>

      <div className="flex flex-col items-start gap-8 lg:flex-row">
        {role === 'admin' && (
          <div className="w-full space-y-6 lg:w-1/3">
            <NotificationForm students={students} />
          </div>
        )}
        <div className={`w-full ${role === 'admin' ? 'lg:w-2/3' : 'mx-auto max-w-3xl'}`}>
          <DashboardTabs currentUserId={userId} userRole={role} students={students} />
        </div>
      </div>
    </main>
  )
}
