'use client'

// Ana panel (Dashboard): oturum + role göre koç/danışan görünümü, bildirim zili.

import { Bell, LogOut, Settings, Users } from 'lucide-react'
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
} from '@repo/api-client'
import { SarmalLogo } from '@/components/brand/SarmalMark'
import { DashboardTabs } from '@/components/DashboardTabs'
import { NotificationForm } from '@/components/NotificationForm'
import { PassiveClientScreen } from '@/components/PassiveClientScreen'
import { ThemeToggle } from '@/components/ThemeToggle'
import { CoachMfaGate } from '@/components/security/CoachMfaGate'

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

  const clients = allProfiles ?? []
  const notifList = notifications ?? []
  const unreadCount = notifList.length

  if (isSessionLoading || !session) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-canvas"
      >
        <div className="text-xl font-bold tracking-widest text-accent">
          SİSTEM YÜKLENİYOR...
        </div>
      </div>
    )
  }

  // PASİF DANIŞAN KAPISI (Faz 4.10): koçluk hizmeti sona ermiş danışan, dashboard
  // yerine yalnızca "hesabı sil / çıkış" ekranını görür. Gerçek engel veritabanı
  // RLS'indedir (account_active_gate); bu yalnızca doğru ekranı çizer. `is_active`
  // pasif danışanın KENDİ profiles satırından okunabilir (RLS istisnası), yani bu
  // kontrol pasif danışanda da güvenilir çalışır. Profil henüz yüklenmediyse
  // (is_active bilinmiyor) kapı tetiklenmez; role='coach' asla pasifleşemez.
  if (profile && profile.role === 'client' && profile.is_active === false) {
    return <PassiveClientScreen />
  }

  return (
    <main id="main-content" className="container relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {/* `/login` başarılı girişte `router.push('/')` yapıyor, yani `/` her oturumun ilk
          durağıdır; proxy/middleware katmanı rolü BİLEMEZ (rol `profiles` tablosunda ve
          aal1'de o tablo koça RLS ile kapalı), oradan sormak `service_role` yüzeyini
          genişletirdi (ADR-0025 §3'ün sınırı). Bu yüzden kapı burada, istemcide. */}
      <CoachMfaGate />
      <div className="absolute left-4 top-4 z-50 flex items-center gap-2">
        {/* DANIŞAN BİLDİRİM ZİLİ */}
        {role === 'client' && (
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              aria-label={`Bildirimler${unreadCount > 0 ? `, ${unreadCount} okunmamış` : ''}`}
              aria-expanded={showNotifs}
              aria-haspopup="menu"
              aria-controls="notification-panel"
              className="relative rounded-lg p-2 transition-all hover:bg-surface-sunken"
            >
              <Bell aria-hidden="true" className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-danger"></span>
                  <span className="sr-only">{unreadCount} okunmamış bildirim</span>
                </span>
              )}
            </button>

            {showNotifs && (
              <div
                id="notification-panel"
                role="region"
                aria-label="Gelen kutusu"
                className="absolute left-0 top-12 w-80 overflow-hidden rounded-card border border-border bg-surface-raised shadow-raised"
              >
                <div className="border-b bg-surface-sunken p-4 text-sm font-bold">Gelen Kutusu</div>
                <div className="max-h-72 overflow-y-auto">
                  {notifList.length === 0 ? (
                    <div className="p-6 text-center text-sm text-fg-muted">
                      Yeni bildiriminiz yok.
                    </div>
                  ) : (
                    notifList.map((notif) => (
                      <div
                        key={notif.id}
                        className="border-b p-4 transition-colors hover:bg-surface-sunken"
                      >
                        <h4 className="mb-1 text-sm font-bold text-accent">{notif.title}</h4>
                        <p className="mb-3 text-xs text-fg-muted">{notif.message}</p>
                        <button
                          onClick={() => markAsRead.mutate({ id: notif.id, userId })}
                          className="flex items-center gap-1 text-xs font-bold text-success hover:text-success"
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
        {role === 'coach' ? (
          <button
            onClick={() => router.push('/users')}
            aria-label="Kullanıcı Yönetimi"
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-accent transition-all hover:bg-accent/10"
          >
            <Users aria-hidden="true" className="h-4 w-4" />{' '}
            <span className="hidden sm:inline">Kullanıcı Yönetimi</span>
          </button>
        ) : (
          <button
            onClick={() => router.push('/profile')}
            aria-label="Profilim"
            className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-accent transition-all hover:bg-accent/10"
          >
            <Settings aria-hidden="true" className="h-4 w-4" />{' '}
            <span className="hidden sm:inline">Profilim</span>
          </button>
        )}

        <button
          onClick={handleLogout}
          aria-label="Çıkış Yap"
          className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-danger transition-all hover:bg-danger/10"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />{' '}
          <span className="hidden sm:inline">Çıkış Yap</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="mb-12 mt-12 space-y-2 text-center md:mt-0">
        <h1 className="flex justify-center">
          <SarmalLogo fontSize={39} />
        </h1>
        <p className="text-sm font-medium text-fg-muted md:text-base">
          {role === 'coach' ? 'Koç Paneli' : 'Danışan Paneli'}
        </p>
      </header>

      <div className="flex flex-col items-start gap-8 lg:flex-row">
        {role === 'coach' && (
          <div className="w-full space-y-6 lg:w-1/3">
            <NotificationForm clients={clients} />
          </div>
        )}
        <div className={`w-full ${role === 'coach' ? 'lg:w-2/3' : 'mx-auto max-w-3xl'}`}>
          <DashboardTabs currentUserId={userId} userRole={role} clients={clients} />
        </div>
      </div>
    </main>
  )
}
