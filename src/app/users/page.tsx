'use client'

// Kullanıcı yönetim merkezi (yalnızca admin). Not: istemci tarafı kontrol yalnızca UX
// içindir; gerçek yetkilendirme Supabase RLS'tedir (bkz. supabase/migrations/20260816090200_rls_policies.sql).

import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useEffect } from 'react'

import { useProfile, useProfiles, useSession } from '@/hooks'
import { QueryState, SkeletonCard } from '@/components/ui'
import { AdminUserManagement } from '@/components/AdminUserManagement'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function UsersPage(): JSX.Element {
  const router = useRouter()

  const { data: session, isLoading: isSessionLoading } = useSession()
  const userId = session?.user.id
  const { data: profile, isLoading: isProfileLoading } = useProfile(userId)
  const isAdmin = profile?.role === 'admin'

  const { data: students, isLoading: isStudentsLoading, isError, error, refetch } = useProfiles()

  useEffect(() => {
    if (isSessionLoading) return
    if (!session) {
      router.replace('/login')
      return
    }
    if (!isProfileLoading && profile && !isAdmin) {
      router.replace('/')
    }
  }, [isSessionLoading, session, isProfileLoading, profile, isAdmin, router])

  const isLoading = isSessionLoading || isProfileLoading || isStudentsLoading

  return (
    <main id="main-content" className="container relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="absolute left-4 top-4 flex gap-2">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 rounded-lg p-2 text-sm font-bold text-brand-purple transition-all hover:bg-brand-purple/10"
        >
          <span aria-hidden="true">←</span>{' '}
          <span className="hidden sm:inline">Ana Sayfaya Dön</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="mb-12 mt-12 text-center md:mt-0">
        <h1 className="bg-gradient-to-r from-brand-purple to-purple-400 bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-5xl">
          Kullanıcı Yönetim Merkezi
        </h1>
        <p className="mt-2 text-sm font-medium uppercase tracking-widest text-gray-500 md:text-base">
          Öğrenci Analiz ve Program Editörü
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
        <AdminUserManagement students={students ?? []} />
      </QueryState>
    </main>
  )
}
