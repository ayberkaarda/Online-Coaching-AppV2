'use client'

// Oturum durumu ve kimlik doğrulama mutasyonları.
// Supabase auth olayları React Query önbelleğiyle senkron tutulur.

import type { Session } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ApiError, apiFetch } from '../api/client'
import { logger } from '@repo/logger'
import { queryKeyRoots, queryKeys } from '../query/keys'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'

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
  const supabase = useSupabaseClient()
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
  }, [supabase, queryClient])

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

/**
 * `/api/auth/sign-in` başarı yanıtı (bkz. `src/app/api/auth/sign-in/route.ts`).
 *
 * A-05 (B-006): gövde artık TOKEN TAŞIMAZ — oturum `Set-Cookie` ile gelir. Gövde yalnızca
 * "işlem başarılı" sinyalidir (204 yerine gerçek bir JSON: `apiFetch` 204'te `undefined`
 * döndürüp çağıran tarafta gereksiz dallanma yaratırdı).
 */
interface SignInResponse {
  ok: true
}

export function useSignIn() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    // A-01: giriş artık tarayıcıdan DOĞRUDAN GoTrue'ya gitmez. `supabase.auth.
    // signInWithPassword` çağrısı sunucuya (`/api/auth/sign-in`) taşındı; böylece uygulama
    // katmanı kaba kuvvet sınırı (e-posta başına 10 başarısız deneme / 15 dk) araya girebilir.
    // Supabase'in kendi hız sınırı fiilen uygulanmıyor (upstream hatası — bkz. route.ts).
    //
    // A-05 (B-006): oturum artık `localStorage`'da değil COOKIE'de saklanıyor. Sunucu
    // başarılı girişte oturum cookie'lerini `Set-Cookie` ile yazar; istemcinin yapması
    // gereken tek şey o cookie'yi OKUMAKTIR. Bu yüzden `setSession(tokens)` çağrısı
    // KALDIRILDI — token istemciye artık JSON gövdesiyle gelmiyor.
    //
    // `getSession()` cookie deposundan okur, oturumu belleğe alır ve `onAuthStateChange`
    // olayını tetikler; dolayısıyla mevcut istemci oturum yönetimi (TanStack Query
    // invalidation, realtime abonelikleri, `useSession` tüketicileri) HİÇ DEĞİŞMEDEN
    // çalışmaya devam eder. Hook'un dışa dönük imzası ve dönüş şekli de aynı kaldı.
    mutationFn: async ({ email, password }: SignInInput): Promise<Session> => {
      // `apiFetch` başarısız yanıtı `ApiError`a çevirir; `ApiError.message` sunucunun
      // Türkçe mesajıdır (401 için jenerik "E-posta veya şifre hatalı!", 429 için ne
      // yapılacağını söyleyen kilit mesajı). `ApiError extends Error` olduğundan
      // `onError`/`signIn.error` tüketicileri değişmez.
      await apiFetch<SignInResponse>('/api/auth/sign-in', {
        method: 'POST',
        json: { email, password },
      })

      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error(error.message)
      if (!data.session) throw new Error('Oturum başlatılamadı. Lütfen tekrar deneyin.')
      return data.session
    },
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.session(), session)
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
      notify.success('Giriş başarılı.')
    },
    onError: (error: Error) => {
      notify.error(`Giriş yapılamadı: ${error.message}`)
    },
  })
}

export function useSignOut() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      // ######################################################################
      // # KAPSAM `local` — `global` DEĞİL (varsayılan buydu, DEĞİŞTİRİLDİ)   #
      // #                                                                    #
      // # `signOut()` parametresiz çağrıldığında GoTrue varsayılanı          #
      // # `scope: 'global'`dır: kullanıcının TÜM cihazlarındaki oturumları   #
      // # iptal eder. Yani telefondan "Çıkış yap" diyen kullanıcı,           #
      // # masaüstündeki açık oturumundan da DÜŞÜYORDU. Bunu kimse istemedi;  #
      // # "çıkış", basılan cihazdan çıkmak demektir.                         #
      // #                                                                    #
      // # E2E tarafında da yarış üretiyordu: `auth.spec.ts`in logout         #
      // # senaryosu, paralel koşan başka bir spec'in oturumunu öldürüp o     #
      // # spec'i rastgele kırıyordu (B-037'nin tarif ettiği imza).           #
      // #                                                                    #
      // # "TÜM CİHAZLARDAN ÇIK" HÂLÂ MEŞRU BİR İHTİYAÇTIR — ama AYRI ve     #
      // # AÇIK bir eylem olmalıdır ("Diğer tüm oturumları kapat" düğmesi,    #
      // # `scope: 'global'` ile). Sıradan çıkışın yan etkisi olarak          #
      // # yapılmamalı: kullanıcı ne olduğunu görmeden diğer cihazlarından    #
      // # atılıyor.                                                          #
      // ######################################################################
      const { error } = await supabase.auth.signOut({ scope: 'local' })
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
      notify.success('Çıkış yapıldı.')
    },
    onError: (error: Error) => {
      notify.error(`Çıkış yapılamadı: ${error.message}`)
    },
  })
}

export function useUpdatePassword() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  return useMutation({
    mutationFn: async (password: string): Promise<void> => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      notify.success('Şifreniz başarıyla değiştirildi.')
    },
    onError: (error: Error) => {
      notify.error(`Şifre güncellenemedi: ${error.message}`)
    },
  })
}

// ---------------------------------------------------------------------------
// Şifre sıfırlama (Faz 4.7 dilim 3 — B-05x)
// ---------------------------------------------------------------------------

export interface RequestPasswordResetInput {
  email: string
  /**
   * Sıfırlama bağlantısının kullanıcıyı geri getireceği adres. Supabase panelindeki
   * "Redirect URLs" allowlist'inde OLMAK ZORUNDADIR (yerelde
   * `http://localhost:3000/reset-password`); aksi halde GoTrue bağlantıyı reddeder.
   *
   * Bu paket web VE mobil arasında paylaşıldığı için `window` üzerinden TÜRETİLMEZ —
   * çağıran (web sayfası) `clientEnv.NEXT_PUBLIC_APP_URL` gibi platforma özgü bir
   * kaynaktan AÇIKÇA vermelidir. Verilmez ve tarayıcıdaysak `window.location.origin`
   * yedeğine düşülür; o da yoksa (SSR/mobil) alan hiç gönderilmez ve Supabase panelde
   * ayarlı varsayılan Site URL'i kullanır.
   */
  redirectTo?: string
}

/**
 * Kullanıcının KENDİ tetiklediği şifre sıfırlama e-postası
 * (`/forgot-password` → `supabase.auth.resetPasswordForEmail`).
 *
 * KULLANICI SAYIMI YOK: Supabase bu uç nokta için hesap var/yok bilgisini sızdırmaz —
 * her iki durumda da AYNI başarı yanıtını döner (`{ data: {}, error: null }`). Bu yüzden
 * `onError` BİLEREK toast GÖSTERMEZ: çağıran sayfa (`/forgot-password`) network/biçim
 * hatalarında bile her zaman aynı nötr mesajı göstermelidir — burada bir hata toast'u
 * "bu e-posta kayıtlı değil" gibi okunabilir ve sayımı geri getirirdi. Hata yine de
 * `mutation.error` üzerinden erişilebilir kalır (network hatası ayrımı sayfanın kendi
 * kararıdır), ama VARSAYILAN akış onu göstermez.
 */
export function useRequestPasswordReset() {
  const supabase = useSupabaseClient()
  return useMutation({
    mutationFn: async ({ email, redirectTo }: RequestPasswordResetInput): Promise<void> => {
      const resolvedRedirectTo =
        redirectTo ??
        (typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        ...(resolvedRedirectTo ? { redirectTo: resolvedRedirectTo } : {}),
      })
      if (error) throw new Error(error.message)
    },
  })
}

export interface CoachResetClientPasswordInput {
  /**
   * Hedef danışanın `profiles.id`'si. E-posta İSTEMCİDEN ALINMAZ ve bu hook'a hiç
   * VERİLMEZ — sunucu ucu (`/api/coach/reset-client-password`) koçun kimliğini
   * doğruladıktan sonra danışanın kayıtlı e-postasını KENDİSİ okur. Böylece bir koç,
   * (form alanı elle değiştirilse bile) rastgele bir e-postaya sıfırlama bağlantısı
   * tetikleyemez.
   */
  clientId: string
}

interface CoachResetClientPasswordResponse {
  ok: true
}

/**
 * KOÇ TETİKLEMELİ şifre sıfırlama (Faz 4.7 dilim 3).
 *
 * Koç bağlantıyı ASLA GÖRMEZ ve danışan adına GİRİŞ YAPILMAZ (impersonation yok): sunucu
 * ucu Supabase'in `resetPasswordForEmail`'ini KENDİSİ çağırır, e-postayı Supabase kendi
 * SMTP'siyle danışana gönderir ve bağlantı YANITA HİÇ KONMAZ — bu mutasyonun başarı
 * yanıtı yalnızca `{ ok: true }`'dur. Her tetikleme sunucu tarafında denetim kaydına
 * yazılır (bkz. route.ts).
 */
export function useCoachResetClientPassword() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  return useMutation({
    // ######################################################################
    // # `Authorization: Bearer` AÇIKÇA EKLENİR — cookie'den OKUNMAZ         #
    // # Route (`reset-client-password/route.ts` §1) kimliği YALNIZCA        #
    // # `Authorization` başlığından okur (cookie kabul etmez; CSRF yüzeyi   #
    // # açmamak için `account/delete` ile aynı gerekçe). Bu yüzden          #
    // # `useInviteClient` deseni izlenir: token `supabase.auth.getSession()`#
    // # ten okunup başlığa ELLE konur.                                     #
    // #                                                                    #
    // # NEDEN UYKUDA KALDI: bu hook henüz HİÇBİR arayüzden çağrılmıyor      #
    // # (koç arayüzüne bağlanmamış). Başlıksız çağrı yalnızca UI'a          #
    // # bağlandığında 401 üretirdi; o güne kadar sessizce kırık kalırdı —   #
    // # bu düzeltme, bağlanmadan ÖNCE deseni doğrusuyla hizalar.            #
    // ######################################################################
    mutationFn: async (
      input: CoachResetClientPasswordInput
    ): Promise<CoachResetClientPasswordResponse> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new ApiError(
          401,
          'NOT_AUTHENTICATED',
          'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
        )
      }

      return apiFetch<CoachResetClientPasswordResponse>('/api/coach/reset-client-password', {
        method: 'POST',
        json: input,
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    },
    onSuccess: () => {
      notify.success('Danışana şifre sıfırlama bağlantısı gönderildi.')
    },
    onError: (error: Error) => {
      notify.error(`Şifre sıfırlama tetiklenemedi: ${error.message}`)
    },
  })
}

// ---------------------------------------------------------------------------
// Danışan daveti (Faz 4.9 dilim 2 — arayüz)
// ---------------------------------------------------------------------------

export interface InviteClientInput {
  email: string
  /** Boş/undefined gönderilebilir — sunucu şeması opsiyonel kabul eder. */
  full_name?: string
}

interface InviteClientResponse {
  ok: true
}

/**
 * KOÇ TETİKLEMELİ danışan daveti (`/api/coach/invite-client`, ADR-0027).
 *
 * Sunucu ucu `supabase.auth.admin.inviteUserByEmail`'i KENDİSİ çağırır; davet
 * bağlantısı/token'ı YANITA HİÇ KONMAZ — başarı yanıtı `useCoachResetClientPassword`
 * ile AYNI şekilde yalnızca `{ ok: true }`'dur.
 *
 * ######################################################################
 * # `Authorization: Bearer` AÇIKÇA EKLENİR — cookie'den OKUNMAZ         #
 * # Route (`route.ts` §1) kimliği YALNIZCA `Authorization` başlığından  #
 * # okur (CSRF yüzeyi açmamak için, `account/delete` ile aynı gerekçe). #
 * # Bu yüzden `useDeleteAccount` deseni izlenir: token `supabase.auth.  #
 * # getSession()`ten okunup başlığa ELLE konur.                        #
 * ######################################################################
 *
 * BAŞARI/HATA METNİ BURADA GÖSTERİLMEZ (jenerik bir toast YOKTUR): 409
 * (`EMAIL_ALREADY_REGISTERED`), 403 (`MFA_REQUIRED` — ayrıca Güvenlik bölümüne
 * bağlantı gerektirir), 429 ve 503 durumları form seviyesinde AYIRT EDİLEREK
 * gösterilir (bkz. `InviteClientForm`); tek bir jenerik toast bu ayrımı
 * kaybederdi. `mutation.error` (bir `ApiError`) ve `mutation.isSuccess` çağıran
 * tarafından okunur.
 */
export function useInviteClient() {
  const supabase = useSupabaseClient()
  return useMutation({
    mutationFn: async (input: InviteClientInput): Promise<InviteClientResponse> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new ApiError(
          401,
          'NOT_AUTHENTICATED',
          'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
        )
      }

      return apiFetch<InviteClientResponse>('/api/coach/invite-client', {
        method: 'POST',
        json: input,
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    },
  })
}
