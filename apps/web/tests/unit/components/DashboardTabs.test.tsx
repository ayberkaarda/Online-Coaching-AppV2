import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardTabs } from '@/components/DashboardTabs'
import { useNotifications, useProfile } from '@repo/api-client'
import type { Notification, Profile } from '@repo/types'

import { fireEvent, screen } from '../test-utils'

vi.mock('@repo/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/api-client')>()
  return { ...actual, useProfile: vi.fn(), useNotifications: vi.fn() }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}))

// Ağır bağımlılıkları (recharts, chart.js, html2canvas) çeken alt sekmeleri mock'la —
// DashboardTabs'ın kendi mantığını (sekme geçişi, klavye navigasyonu) izole et.
vi.mock('@/components/tabs/AnnouncementsTab', () => ({
  default: () => <div>ANNOUNCEMENTS_TAB</div>,
}))
vi.mock('@/components/tabs/StatsTab', () => ({ default: () => <div>STATS_TAB</div> }))
vi.mock('@/components/tabs/FormCheckTab', () => ({ default: () => <div>FORM_CHECK_TAB</div> }))
vi.mock('@/components/tabs/DailyLogTab', () => ({ default: () => <div>DAILY_LOG_TAB</div> }))
vi.mock('@/components/tabs/NutritionTab', () => ({ default: () => <div>NUTRITION_TAB</div> }))
vi.mock('@/components/tabs/WorkoutTab', () => ({ default: () => <div>WORKOUT_TAB</div> }))
vi.mock('@/components/tabs/MessagesTab', () => ({ default: () => <div>MESSAGES_TAB</div> }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

interface MockProfileResult {
  data: Profile | undefined
}

function mockProfileQuery(
  overrides: Partial<MockProfileResult> = {}
): ReturnType<typeof useProfile> {
  const base: MockProfileResult = { data: undefined }
  return { ...base, ...overrides } as unknown as ReturnType<typeof useProfile>
}

interface MockNotificationsResult {
  data: Notification[] | undefined
}

function mockNotificationsQuery(
  overrides: Partial<MockNotificationsResult> = {}
): ReturnType<typeof useNotifications> {
  const base: MockNotificationsResult = { data: undefined }
  return { ...base, ...overrides } as unknown as ReturnType<typeof useNotifications>
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'std-1',
    full_name: 'Ahmet Yılmaz',
    email: 'client1@example.com',
    role: 'client',
    avatar_path: null,
    nutrition_plan: null,
    workout_plan: null,
    current_streak: 0,
    is_active: true,
    last_checkin_at: null,
    // Faz 4.8 (§7c) etkinlik kaydı rıza kolonları — profiles Row'un parçası.
    activity_consent_granted_at: null,
    activity_consent_revoked_at: null,
    activity_consent_version: null,
    // Künye dilimi — profiles Row'un parçası (ikisi de nullable).
    birth_date: null,
    height_cm: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function setupDefaultHooks(): void {
  vi.mocked(useProfile).mockReturnValue(mockProfileQuery())
  vi.mocked(useNotifications).mockReturnValue(mockNotificationsQuery())
}

describe('DashboardTabs', () => {
  it('sekme listesi role="tablist", her sekme role="tab" ve aktif sekmede aria-selected="true" olur', () => {
    setupDefaultHooks()

    render(<DashboardTabs currentUserId="std-1" userRole="client" clients={[]} />)

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(7)

    // Varsayılan aktif sekme 'formCheck'.
    const formCheckTab = screen.getByRole('tab', { name: /form check/i })
    expect(formCheckTab).toHaveAttribute('aria-selected', 'true')

    const otherTabs = tabs.filter((tab) => tab !== formCheckTab)
    for (const tab of otherTabs) {
      expect(tab).toHaveAttribute('aria-selected', 'false')
    }
  })

  it('sekmeye tıklayınca ilgili tabpanel içeriği değişir', () => {
    setupDefaultHooks()

    render(<DashboardTabs currentUserId="std-1" userRole="client" clients={[]} />)

    expect(screen.getByText('FORM_CHECK_TAB')).toBeInTheDocument()
    expect(screen.queryByText('DAILY_LOG_TAB')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /günlük veriler/i }))

    expect(screen.getByText('DAILY_LOG_TAB')).toBeInTheDocument()
    expect(screen.queryByText('FORM_CHECK_TAB')).not.toBeInTheDocument()

    const dailyTab = screen.getByRole('tab', { name: /günlük veriler/i })
    expect(dailyTab).toHaveAttribute('aria-selected', 'true')
  })

  it('klavye navigasyonu: ArrowRight/ArrowLeft/Home/End ile aktif sekme ve odak değişir', () => {
    setupDefaultHooks()

    render(<DashboardTabs currentUserId="std-1" userRole="client" clients={[]} />)

    const tablist = screen.getByRole('tablist')

    // Sıra: announcements, stats, formCheck(varsayılan), daily, nutrition, workout, messages.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    const dailyTab = screen.getByRole('tab', { name: /günlük veriler/i })
    expect(dailyTab).toHaveAttribute('aria-selected', 'true')
    expect(dailyTab).toHaveFocus()

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    const formCheckTab = screen.getByRole('tab', { name: /form check/i })
    expect(formCheckTab).toHaveAttribute('aria-selected', 'true')
    expect(formCheckTab).toHaveFocus()

    fireEvent.keyDown(tablist, { key: 'Home' })
    const announcementsTab = screen.getByRole('tab', { name: /duyurular/i })
    expect(announcementsTab).toHaveAttribute('aria-selected', 'true')
    expect(announcementsTab).toHaveFocus()

    fireEvent.keyDown(tablist, { key: 'End' })
    const messagesTab = screen.getByRole('tab', { name: /sohbet/i })
    expect(messagesTab).toHaveAttribute('aria-selected', 'true')
    expect(messagesTab).toHaveFocus()
  })

  it('userRole="coach" ve hiç danışan seçili değilken uyarı mesajı görünür', () => {
    setupDefaultHooks()

    render(<DashboardTabs currentUserId="coach-1" userRole="coach" clients={[]} />)

    expect(
      screen.getByText('Lütfen yukarıdaki panelden en az bir danışan seçin.')
    ).toBeInTheDocument()
    expect(screen.queryByText('FORM_CHECK_TAB')).not.toBeInTheDocument()
  })

  it('userRole="client" iken streak başlığı görünür', () => {
    vi.mocked(useProfile).mockReturnValue(
      mockProfileQuery({ data: makeProfile({ current_streak: 9 }) })
    )
    vi.mocked(useNotifications).mockReturnValue(mockNotificationsQuery())

    render(<DashboardTabs currentUserId="std-1" userRole="client" clients={[]} />)

    expect(screen.getByText(/GÜNLÜK SERİ/)).toBeInTheDocument()
    expect(screen.getByText('9 GÜN')).toBeInTheDocument()
  })
})
