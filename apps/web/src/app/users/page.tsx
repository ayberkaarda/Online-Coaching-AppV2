'use client'

// Kullanıcı yönetim merkezi (yalnızca koç). Not: istemci tarafı kontrol yalnızca UX
// içindir; gerçek yetkilendirme Supabase RLS'tedir (bkz. supabase/migrations/20260816090200_rls_policies.sql).

import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useEffect } from 'react'

import { useProfile, useProfiles, useSession } from '@repo/api-client'
import { QueryState, SkeletonCard } from '@/components/ui'
import { CoachUserManagement } from '@/components/CoachUserManagement'
import { InviteClientForm } from '@/components/InviteClientForm'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function UsersPage(): JSX.Element {
  const router = useRouter()

  const { data: session, isLoading: isSessionLoading } = useSession()
  const userId = session?.user.id
  const { data: profile, isLoading: isProfileLoading } = useProfile(userId)
  const isCoach = profile?.role === 'coach'

  const { data: clients, isLoading: isClientsLoading, isError, error, refetch } = useProfiles()

  useEffect(() => {
    if (isSessionLoading) return
    if (!session) {
      router.replace('/login')
      return
    }
    if (!isProfileLoading && profile && !isCoach) {
      router.replace('/')
    }
  }, [isSessionLoading, session, isProfileLoading, profile, isCoach, router])

  const isLoading = isSessionLoading || isProfileLoading || isClientsLoading

  return (
    <main id="main-content" className="container relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="absolute left-4 top-4 flex gap-2">
        {/* Metin `sm` altında gizlendiği için buton mobilde YALNIZ-İKON olur;
            erişilebilir adı `aria-label` sabitler (ADR-0016 erişilebilirlik
            kuralı — dashboard'daki eşdeğer butonlarla aynı kalıp). */}
        <button
          onClick={() => router.push('/')}
          aria-label="Ana Sayfaya Dön"
          className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-accent transition-all hover:bg-accent/10"
        >
          <span aria-hidden="true">←</span>{' '}
          <span className="hidden sm:inline">Ana Sayfaya Dön</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="mb-12 mt-12 text-center md:mt-0">
        <h1 className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-5xl">
          Kullanıcı Yönetim Merkezi
        </h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-widest text-gray-500 md:text-base">
          Danışan Analiz ve Program Editörü
        </p>
      </header>

      <QueryState
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        skeleton={
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        }
      >
        <InviteClientForm />
        <CoachUserManagement clients={clients ?? []} />
      </QueryState>
    </main>
  )
}
