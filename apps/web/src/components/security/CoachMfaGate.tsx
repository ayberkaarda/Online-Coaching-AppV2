'use client'

// Koç için MFA zorunluluğu yönlendirme kapısı — Faz 4.7 dilim 1.
//
// ─────────────────────────────────────────────────────────────────────────────
// BU BİR GÜVENLİK SINIRI DEĞİLDİR
// ─────────────────────────────────────────────────────────────────────────────
// Gerçek kapı veritabanındaki RESTRICTIVE RLS politikasıdır (`mfa_aal2_gate`,
// bkz. `packages/api-client/src/hooks/useMfa.ts` başlık yorumu ve
// `supabase/migrations/20260819120000_mfa_aal2_gate.sql`):
//
//   not is_coach() or (select auth.jwt() ->> 'aal') = 'aal2'
//
// Bu bileşenin tek işi, aal1'deki bir koçun "sebebi anlaşılmayan boş panel"
// görmesini engelleyip onu doğrudan `/profile#guvenlik`'e yönlendirmektir. `fetch`
// ile trivially atlatılabilen bir istemci yönlendirmesidir — yetkilendirme YAPMAZ.

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { useIsCoach, useMfaStatus, useSession } from '@repo/api-client'

/** Render etmez, yalnızca gerekirse `/profile#guvenlik`'e yönlendirir. */
export function CoachMfaGate(): null {
  const router = useRouter()
  const sessionQuery = useSession()
  const isCoachQuery = useIsCoach()
  const statusQuery = useMfaStatus()

  // Yönlendirme YALNIZCA BİR KEZ tetiklenir: aksi hâlde `router.replace` sonrası
  // hook'lar yeniden çalışıp koşul hâlâ doğruyken (yönlendirme henüz tamamlanmadan
  // ara render'larda) tekrar tekrar `replace` çağrılabilir.
  const hasRedirected = useRef(false)

  useEffect(() => {
    if (hasRedirected.current) return

    // Oturum yok / yükleniyor / hata verdi -> hiçbir şey yapma.
    if (sessionQuery.isLoading || sessionQuery.isError || !sessionQuery.data) return
    // Rol sorgusu yükleniyor / hata verdi -> hiçbir şey yapma (yanlış yönlendirme riski).
    if (isCoachQuery.isLoading || isCoachQuery.isError) return
    // MFA durumu yükleniyor / hata verdi -> hiçbir şey yapma.
    if (statusQuery.isLoading || statusQuery.isError || !statusQuery.data) return

    const isCoach = isCoachQuery.data === true
    const needsMfa = !statusQuery.data.hasVerifiedFactor || statusQuery.data.needsStepUp

    if (isCoach && needsMfa) {
      hasRedirected.current = true
      router.replace('/profile#guvenlik')
    }
  }, [
    router,
    sessionQuery.data,
    sessionQuery.isLoading,
    sessionQuery.isError,
    isCoachQuery.data,
    isCoachQuery.isLoading,
    isCoachQuery.isError,
    statusQuery.data,
    statusQuery.isLoading,
    statusQuery.isError,
  ])

  return null
}
