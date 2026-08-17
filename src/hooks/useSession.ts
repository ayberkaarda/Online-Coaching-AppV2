'use client'

// Oturum durumu ve kimlik doğrulama mutasyonları.
// Supabase auth olayları React Query önbelleğiyle senkron tutulur.

import type { Session } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'

/**
 * Service worker'ın (`next-pwa`/workbox) tuttuğu çevrimdışı önbellekleri temizler.
 * `caches` API'si her ortamda yok (SSR, eski tarayıcı, test) — güvenli sarmalayıcı.
 * Temizlik başarısız olsa da logout akışını bozmamak için hata yutulur.
 */
async function clearOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return
  try {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((k) => k.startsWith('offline-') || k.startsWith('workbox-'))
        .map((k) => caches.delete(k))
    )
  } catch (error) {
    logger.warn({ err: error }, 'Çevrimdışı önbellek temizlenemedi')
  }
}

/** Aktif Supabase oturumu. Oturum değiştiğinde önbellek otomatik tazelenir. */
export function useSession(): UseQueryResult<Session | null, Error> {
  const queryClient = useQueryClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(queryKeys.session(), session ?? null)
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [queryClient])

  return useQuery({
    queryKey: queryKeys.session(),
    queryFn: async (): Promise<Session | null> => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error(error.message)
      return data.session
    },
    staleTime: 30_000,
  })
}

export interface SignInInput {
  email: string
  password: string
}

/** `/api/auth/sign-in` başarı yanıtı (bkz. `src/app/api/auth/sign-in/route.ts`). */
interface SignInResponse {
  access_token: string
  refresh_token: string
  expires_at: number | null
}

export function useSignIn() {
  const queryClient = useQueryClient()

  return useMutation({
    // A-01: giriş artık tarayıcıdan DOĞRUDAN GoTrue'ya gitmez. `supabase.auth.
    // signInWithPassword` çağrısı sunucuya (`/api/auth/sign-in`) taşındı; böylece uygulama
    // katmanı kaba kuvvet sınırı (e-posta başına 10 başarısız deneme / 15 dk) araya girebilir.
    // Supabase'in kendi hız sınırı fiilen uygulanmıyor (upstream hatası — bkz. route.ts).
    //
    // Dönen token'larla `setSession` çağrılır: bu, `onAuthStateChange` olayını tetikler,
    // dolayısıyla mevcut istemci oturum yönetimi (TanStack Query invalidation, realtime
    // abonelikleri, `useSession` tüketicileri) HİÇ DEĞİŞMEDEN çalışmaya devam eder.
    // Hook'un dışa dönük imzası ve dönüş şekli de aynı kaldı.
    mutationFn: async ({ email, password }: SignInInput): Promise<Session> => {
      // `apiFetch` başarısız yanıtı `ApiError`a çevirir; `ApiError.message` sunucunun
      // Türkçe mesajıdır (401 için jenerik "E-posta veya şifre hatalı!", 429 için ne
      // yapılacağını söyleyen kilit mesajı). `ApiError extends Error` olduğundan
      // `onError`/`signIn.error` tüketicileri değişmez.
      const tokens = await apiFetch<SignInResponse>('/api/auth/sign-in', {
        method: 'POST',
        json: { email, password },
      })

      const { data, error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('Oturum başlatılamadı. Lütfen tekrar deneyin.')
      return data.session
    },
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.session(), session)
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
      toast.success('Giriş başarılı.')
    },
    onError: (error: Error) => {
      toast.error(`Giriş yapılamadı: ${error.message}`)
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.auth.signOut()
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      queryClient.setQueryData(queryKeys.session(), null)
      // Farklı kullanıcıya ait veri sızmasın diye tüm önbellek temizlenir.
      queryClient.clear()
      // Service worker'ın cihazda tuttuğu offline-workout-data / workbox
      // önbellekleri de temizlenir (paylaşılan cihazda sonraki kullanıcıya
      // veri sızmasın diye).
      await clearOfflineCaches()
      toast.success('Çıkış yapıldı.')
    },
    onError: (error: Error) => {
      toast.error(`Çıkış yapılamadı: ${error.message}`)
    },
  })
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (password: string): Promise<void> => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success('Şifreniz başarıyla değiştirildi.')
    },
    onError: (error: Error) => {
      toast.error(`Şifre güncellenemedi: ${error.message}`)
    },
  })
}
