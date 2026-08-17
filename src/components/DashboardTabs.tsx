'use client'

// Panelin sekme kabuğu: koç için danışan seçimi/arama, danışan için streak başlığı
// ve seçili sekmenin içeriğini render eder.

import {
  Bell,
  Camera,
  ClipboardList,
  Dumbbell,
  Flame,
  MessageCircle,
  Salad,
  Search,
  TrendingUp,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { toast } from 'sonner'

import { useNotifications, useProfile } from '@/hooks'
import type { Profile, UserRole } from '@/types'

import AnnouncementsTab from './tabs/AnnouncementsTab'
import DailyLogTab from './tabs/DailyLogTab'
import FormCheckTab from './tabs/FormCheckTab'
import MessagesTab from './tabs/MessagesTab'
import NutritionTab from './tabs/NutritionTab'
import StatsTab from './tabs/StatsTab'
import WorkoutTab from './tabs/WorkoutTab'

export interface DashboardTabsProps {
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  clients: Profile[]
}

const TABS = [
  'announcements',
  'stats',
  'formCheck',
  'daily',
  'nutrition',
  'workout',
  'messages',
] as const

type TabKey = (typeof TABS)[number]

const ITEMS_PER_PAGE = 5

export function DashboardTabs({
  currentUserId,
  userRole,
  clients,
}: DashboardTabsProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('formCheck')
  const exportRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)

  const clientsList = clients.filter((c) => c.role !== 'coach')
  const filteredClients = clientsList.filter((c) =>
    (c.full_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  )
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE)
  const safeTotalPages = Math.max(totalPages, 1)
  const criticalClients = clientsList.filter((c) => c.current_streak === 0)

  const targetId =
    userRole === 'coach'
      ? selectedClientIds.length === 1
        ? selectedClientIds[0]
        : undefined
      : currentUserId

  const { data: profile } = useProfile(targetId)
  const currentStreak = profile?.current_streak ?? 0

  const { data: announcementData } = useNotifications(targetId, { sinceDays: 30 })
  const announcements = announcementData ?? []

  const handleDownloadImage = async (): Promise<void> => {
    if (!exportRef.current) return
    try {
      // Dinamik import: 1.4MB'lık paket ilk yüklemede bundle'a girmesin.
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(exportRef.current, { backgroundColor: null, scale: 2 })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `kocluk_${activeTab}.png`
      link.click()
    } catch {
      toast.error('Görsel oluşturulamadı. Lütfen tekrar deneyin.')
    }
  }

  const toggleClient = (id: string): void =>
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    )

  const selectAll = (): void =>
    setSelectedClientIds(
      selectedClientIds.length === filteredClients.length ? [] : filteredClients.map((c) => c.id)
    )

  const nextBtn = (): void => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
  const prevBtn = (): void => setCurrentPage((p) => Math.max(0, p - 1))

  const focusTab = (tab: TabKey): void => {
    setActiveTab(tab)
    tabRefs.current[tab]?.focus()
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = TABS.indexOf(activeTab)
    if (index < 0) return

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab(TABS[(index + 1) % TABS.length] as TabKey)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab(TABS[(index - 1 + TABS.length) % TABS.length] as TabKey)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(TABS[0])
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(TABS[TABS.length - 1] as TabKey)
    }
  }

  const tabProps = {
    targetId,
    currentUserId,
    userRole,
    selectedClientIds,
    onDownloadImage: () => void handleDownloadImage(),
  }

  return (
    <div className="mt-4 w-full">
      {/* Danışan Başlığı (Streak) */}
      {userRole === 'client' && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent p-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black text-orange-600 dark:text-orange-400">
              <Flame aria-hidden="true" className="h-4 w-4 shrink-0" />
              GÜNLÜK SERİ (STREAK)
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Raporları aksatmadan ilerliyorsun, bozma!
            </p>
          </div>
          <div className="animate-pulse text-3xl font-black text-orange-500 drop-shadow-md">
            {currentStreak} GÜN
          </div>
        </div>
      )}

      {/* Koç Danışan Paneli */}
      {userRole === 'coach' && (
        <>
          {criticalClients.length > 0 && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                <span className="h-2 w-2 animate-ping rounded-full bg-red-500" aria-hidden="true" />{' '}
                Acil İlgilenilmesi Gerekenler
              </h3>
              <div className="hide-scrollbar flex gap-3 overflow-x-auto">
                {criticalClients.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => toggleClient(c.id)}
                    aria-pressed={selectedClientIds.includes(c.id)}
                    aria-label={`${c.full_name ?? 'Danışan'} seç`}
                    className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition-transform hover:scale-105 dark:border-red-900/20 dark:bg-[#16161d] dark:text-gray-300"
                  >
                    <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    {(c.full_name ?? '').split(' ')[0] ?? ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition-all dark:border-zinc-800 dark:bg-[#16161d]">
            <div className="mb-6 flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 dark:border-zinc-800 md:flex-row md:items-center">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-accent">
                  Danışan Yönetimi
                </h3>
              </div>
              <div className="relative w-full md:w-64">
                <Search
                  aria-hidden="true"
                  className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-400"
                />
                <label htmlFor="client-search" className="sr-only">
                  Danışan Ara
                </label>
                <input
                  id="client-search"
                  type="text"
                  placeholder="Danışan Ara..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm transition-all focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div className="flex w-full items-center justify-between gap-4 md:w-auto">
                <button
                  type="button"
                  onClick={selectAll}
                  className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 transition-all hover:bg-accent hover:text-white dark:bg-zinc-800 dark:text-gray-300"
                >
                  {selectedClientIds.length === filteredClients.length && filteredClients.length > 0
                    ? 'SEÇİMİ TEMİZLE'
                    : 'TÜMÜNÜ SEÇ'}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={prevBtn}
                    disabled={currentPage === 0}
                    aria-label="Önceki sayfa"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-all hover:bg-accent hover:text-white disabled:opacity-30 dark:bg-zinc-800"
                  >
                    <span aria-hidden="true">{'<'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={nextBtn}
                    disabled={currentPage >= totalPages - 1 || totalPages === 0}
                    aria-label="Sonraki sayfa"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 transition-all hover:bg-accent hover:text-white disabled:opacity-30 dark:bg-zinc-800"
                  >
                    <span aria-hidden="true">{'>'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative h-24 w-full overflow-hidden">
              {filteredClients.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs font-bold text-gray-400">
                  Aramayla eşleşen danışan bulunamadı.
                </div>
              ) : (
                <div
                  className="absolute left-0 top-0 flex h-full transition-transform duration-500 ease-out"
                  style={{
                    transform: `translateX(-${currentPage * 100}%)`,
                    width: `${safeTotalPages * 100}%`,
                  }}
                >
                  {Array.from({ length: safeTotalPages }).map((_, pageIndex) => (
                    <div
                      key={pageIndex}
                      className="flex justify-around gap-4 px-2"
                      style={{ width: `${100 / safeTotalPages}%` }}
                    >
                      {filteredClients
                        .slice(pageIndex * ITEMS_PER_PAGE, (pageIndex + 1) * ITEMS_PER_PAGE)
                        .map((client) => {
                          const isSelected = selectedClientIds.includes(client.id)
                          const fullName = client.full_name ?? ''
                          const firstName = fullName.split(' ')[0] ?? ''
                          return (
                            <button
                              type="button"
                              key={client.id}
                              onClick={() => toggleClient(client.id)}
                              aria-pressed={isSelected}
                              aria-label={`${fullName || 'Danışan'} seç`}
                              className="group relative flex w-16 cursor-pointer flex-col items-center gap-2"
                            >
                              <div className="relative">
                                <img
                                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                                    fullName
                                  )}&background=random&color=fff&bold=true`}
                                  alt=""
                                  loading="lazy"
                                  className={`h-14 w-14 rounded-full object-cover shadow-sm transition-all duration-300 ${
                                    isSelected
                                      ? 'scale-110 ring-4 ring-accent'
                                      : 'opacity-60 grayscale hover:grayscale-0 group-hover:scale-105 group-hover:opacity-100'
                                  }`}
                                />
                                {client.current_streak > 0 && (
                                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-orange-500 text-[9px] font-black text-white dark:border-zinc-900">
                                    {client.current_streak}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`w-full truncate text-center text-[10px] font-bold ${
                                  isSelected ? 'text-accent' : 'text-gray-500'
                                }`}
                              >
                                {firstName}
                              </span>
                            </button>
                          )
                        })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SEKMELER MENÜSÜ */}
      <div
        role="tablist"
        aria-label="Panel sekmeleri"
        onKeyDown={handleTabKeyDown}
        className="hide-scrollbar flex gap-6 overflow-x-auto border-b border-gray-200 pb-2 text-sm font-medium dark:border-zinc-800"
      >
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab}
            id={`tab-${tab}`}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            ref={(el) => {
              tabRefs.current[tab] = el
            }}
            onClick={() => setActiveTab(tab)}
            className={`relative flex items-center gap-2 whitespace-nowrap pb-2 transition-all ${
              activeTab === tab
                ? 'font-bold text-accent'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'announcements' && (
              <>
                <Bell aria-hidden="true" className="h-4 w-4 shrink-0" /> Duyurular{' '}
                {announcements.length > 0 && (
                  <span className="animate-bounce rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">
                    {announcements.length}
                  </span>
                )}
              </>
            )}
            {tab === 'stats' && (
              <>
                <TrendingUp aria-hidden="true" className="h-4 w-4 shrink-0" /> İstatistikler
              </>
            )}
            {tab === 'formCheck' && (
              <>
                <Camera aria-hidden="true" className="h-4 w-4 shrink-0" /> Form Check
              </>
            )}
            {tab === 'daily' && (
              <>
                <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0" /> Günlük Veriler
              </>
            )}
            {tab === 'nutrition' && (
              <>
                <Salad aria-hidden="true" className="h-4 w-4 shrink-0" /> Beslenme
              </>
            )}
            {tab === 'workout' && (
              <>
                <Dumbbell aria-hidden="true" className="h-4 w-4 shrink-0" /> Antrenman
              </>
            )}
            {tab === 'messages' && (
              <>
                <MessageCircle aria-hidden="true" className="h-4 w-4 shrink-0" /> Sohbet
              </>
            )}
            {activeTab === tab && (
              <span
                aria-hidden="true"
                // Kutu gölgesi CSS değişkenine bağlanır: `rgb(var(--color-accent) / N)`
                // globals.css'teki aynı desendir, ham marka moru bırakmaz.
                className="absolute bottom-[-9px] left-0 h-[2px] w-full bg-accent shadow-[0_0_8px_rgb(var(--color-accent)_/_0.8)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* RENDER EDİLEN AKTİF SEKME İÇERİĞİ */}
      <div
        ref={exportRef}
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="mt-4 min-h-[400px] rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-[#16161d] md:p-8"
      >
        {userRole === 'coach' && selectedClientIds.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-sm font-bold text-gray-500">
            <Users aria-hidden="true" className="mb-3 h-10 w-10 opacity-50" />
            Lütfen yukarıdaki panelden en az bir danışan seçin.
          </div>
        ) : (
          <>
            {activeTab === 'stats' && (
              <StatsTab
                targetId={targetId}
                userRole={userRole}
                selectedClientIds={selectedClientIds}
              />
            )}
            {activeTab === 'announcements' && (
              <AnnouncementsTab
                announcements={announcements}
                userRole={userRole}
                selectedClientIds={selectedClientIds}
              />
            )}
            {activeTab === 'formCheck' && (
              <FormCheckTab
                targetId={tabProps.targetId}
                currentUserId={tabProps.currentUserId}
                userRole={tabProps.userRole}
                selectedClientIds={tabProps.selectedClientIds}
              />
            )}
            {activeTab === 'daily' && (
              <DailyLogTab
                targetId={tabProps.targetId}
                currentUserId={tabProps.currentUserId}
                userRole={tabProps.userRole}
                selectedClientIds={tabProps.selectedClientIds}
              />
            )}
            {activeTab === 'nutrition' && (
              <NutritionTab
                targetId={tabProps.targetId}
                currentUserId={tabProps.currentUserId}
                userRole={tabProps.userRole}
                selectedClientIds={tabProps.selectedClientIds}
                onDownloadImage={tabProps.onDownloadImage}
              />
            )}
            {activeTab === 'workout' && (
              <WorkoutTab
                targetId={tabProps.targetId}
                currentUserId={tabProps.currentUserId}
                userRole={tabProps.userRole}
                selectedClientIds={tabProps.selectedClientIds}
                onDownloadImage={tabProps.onDownloadImage}
              />
            )}
            {activeTab === 'messages' && (
              <MessagesTab
                targetId={tabProps.targetId}
                currentUserId={tabProps.currentUserId}
                userRole={tabProps.userRole}
                selectedClientIds={tabProps.selectedClientIds}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
