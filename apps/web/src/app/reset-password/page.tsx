'use client'

// Yeni şifre belirleme sayfası (Faz 4.7 dilim 3; Faz 4.9 dilim 2'de davet akışı eklendi).
//
// Buraya ÜÇ yoldan gelinir:
//   1) `/forgot-password`'un gönderdiği e-postadaki bağlantı (kendi tetiklemesi, `type=recovery`).
//   2) Koçun `/api/coach/reset-client-password` ile tetiklediği e-postadaki bağlantı
//      (`type=recovery`).
//   3) Koçun `/api/coach/invite-client` ile tetiklediği DAVET e-postasındaki bağlantı
//      (`type=invite`, ADR-0027). Aynı `redirectTo` (bu sayfa) üç akış tarafından paylaşılır
//      (ADR-0027 §Allowlist notu) — token TİPİ farklıdır, sayfa DEĞİL.
// Üçü de AYNI Supabase akışını kullanır: GoTrue bağlantıyı `redirectTo` (bu sayfa) adresine
// yönlendirirken tarayıcı istemcisine (`detectSessionInUrl: true`, bkz.
// `src/lib/supabase/client.ts`) kurtarma/davet oturumu tokenlarını taşır. İstemci bunu otomatik
// işler ve `PASSWORD_RECOVERY` (yalnızca `type=recovery`de) ya da `SIGNED_IN` (`type=invite`
// DAHİL diğer her şeyde) olayını yayınlar; biz olayı DEĞİL, oluşan OTURUMU bekleriz
// (`event === 'PASSWORD_RECOVERY' || session` — ikisi de forma geçit verir).
//
// ─────────────────────────────────────────────────────────────────────────────
// TOKEN TİPİ NASIL AYIRT EDİLİR — `readFlowTypeFromLocation`
// ─────────────────────────────────────────────────────────────────────────────
// `onAuthStateChange` olayı TEK BAŞINA davet ile sıfırlamayı AYIRT ETMEZ: her ikisi de
// implicit-grant hash akışı kullanır ve yalnızca `type=recovery` özel bir olay
// (`PASSWORD_RECOVERY`) üretir — `type=invite` da (tıpkı sıradan bir giriş gibi) `SIGNED_IN`
// olarak yayınlanır (bkz. `@supabase/auth-js` `GoTrueClient._initialize`). Bu yüzden metin
// AYRIMI URL'deki GoTrue `type` parametresi DOĞRUDAN okunarak yapılır — bağlantı geçersizliği
// için zaten kullanılan `error`/`error_code` okuma tekniğinin AYNISI (aşağıdaki
// `readLinkErrorFromLocation`).
//
// GÜVENİLİRLİK NOTU: bu istemci `flowType: 'pkce'` ile kurulur (bkz.
// `@supabase/ssr`'ın `createBrowserClient` varsayılanı) ama davet/sıfırlama e-postaları
// SUNUCUDA (service_role / anon istemci) tetiklenir — alıcının tarayıcısında saklı bir PKCE
// `code_verifier` YOKTUR. GoTrue bu durumda klasik implicit hash biçimine (`#access_token=
// ...&type=invite|recovery`) düşer; `@supabase/auth-js` yalnızca PKCE `?code=` akışında
// `history.replaceState` ile URL'i temizler, implicit hash'e DOKUNMAZ — yani `type` parametresi
// `onAuthStateChange` tetiklendikten SONRA bile URL'de okunabilir kalır.
//
// AYIRT EDİLEMEZSE (`type` eksik/tanınmayan bir değer — örn. ileride PKCE'ye taşınırsa)
// `readFlowTypeFromLocation` `null` döner ve aşağıdaki metin sabitleri VARSAYILAN (nötr,
// "şifre sıfırlama" diliyle yazılmış ama davet bağlamında da yanlış OKUNMAYAN) metne düşer —
// hiçbir zaman ikisi arasında YANLIŞ bir seçim yapılmaz, belirsizlikte nötr kalınır.
//
// BAĞLANTI GEÇERSİZ/SÜRESİ DOLMUŞ: Supabase bu durumda sayfaya `#error=...&error_code=
// otp_expired&error_description=...` gibi bir hash ekler — bunu ayrıştırıp anlaşılır bir
// Türkçe hata gösteriyoruz. Hiçbir zaman "sessizce" boş bir form göstermiyoruz.

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { useSupabaseClient, useUpdatePassword } from '@repo/api-client'
import { passwordChangeSchema, type PasswordChangeInput } from '@repo/types/schemas'

/**
 * Bağlantı geçerliliği durum makinesi.
 *   - `checking`: sayfa yeni açıldı, `detectSessionInUrl` işlemini tamamlamadı.
 *   - `ready`: kurtarma oturumu kuruldu, yeni şifre formu gösterilebilir.
 *   - `invalid`: hash'te açık bir hata VAR ya da makul bir süre içinde oturum hiç kurulmadı.
 */
type LinkStatus = 'checking' | 'ready' | 'invalid'

/** `detectSessionInUrl` işlemi için üst sınır — bundan sonra "geçersiz" kabul edilir. */
const SESSION_DETECT_TIMEOUT_MS = 4000

/**
 * GoTrue'nun hash'e eklediği `error_description` alanını okunabilir Türkçeye çevirir.
 * Bilinmeyen kodlarda ham (URL-decode edilmiş) açıklama gösterilir — sessiz kalmaktan iyidir.
 */
// NÖTR METİN: bu fonksiyon `type` parametresini KULLANMAZ (davet/sıfırlama ayrımı yapmaz) —
// "bağlantı" kelimesi hem davet hem sıfırlama bağlamında doğru okunur; iki AYRI metin tutmak
// (bkz. dosya başlığı "ayırt edilemezse" notu) burada gereksiz bir dallanma olurdu.
function describeLinkError(errorCode: string | null, description: string | null): string {
  if (errorCode === 'otp_expired') {
    return 'Bu bağlantının süresi dolmuş. Lütfen yeni bir bağlantı isteyin.'
  }
  if (description) return description
  return 'Bu bağlantı geçersiz. Lütfen yeni bir bağlantı isteyin.'
}

/**
 * URL'de (hash VEYA query — Supabase sürüme/akışa göre ikisinden birini kullanabiliyor)
 * GoTrue'nun eklediği bir hata parametresi var mı? Varsa okunabilir Türkçe mesajı üretir.
 *
 * BİLEREK render SIRASINDA (bir `useState` lazy initializer'ı içinde) çağrılır, bir
 * `useEffect` İÇİNDE DEĞİL: `react-hooks/set-state-in-effect` kuralı bir effect gövdesinde
 * SENKRON `setState` çağrısını yasaklar (cascading render riski) — bu bilgi zaten İLK
 * render'da (URL zaten mevcut) belli olduğundan, effect'e hiç taşınmasına gerek yoktur.
 */
function readLinkErrorFromLocation(): string | null {
  if (typeof window === 'undefined') return null

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  const errorCode = hashParams.get('error_code') ?? searchParams.get('error_code')
  const errorDescriptionRaw =
    hashParams.get('error_description') ?? searchParams.get('error_description')
  const errorDescription = errorDescriptionRaw
    ? decodeURIComponent(errorDescriptionRaw.replace(/\+/g, ' '))
    : null
  const hasError = Boolean(
    errorCode ?? errorDescription ?? hashParams.get('error') ?? searchParams.get('error')
  )

  if (!hasError) return null
  return describeLinkError(errorCode, errorDescription)
}

type InviteFlowType = 'invite' | 'recovery' | null

/**
 * GoTrue'nun implicit-grant bağlantısına eklediği `type` parametresini (hash VEYA query —
 * `error_code` okuyucusuyla AYNI iki-kaynaklı desen) okur. Güvenilirlik gerekçesi ve
 * ayırt edilemeyen durumun nasıl ele alındığı dosya başlığındadır.
 */
function readFlowTypeFromLocation(): InviteFlowType {
  if (typeof window === 'undefined') return null

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  // GoTrue'nun kendi ayrıştırıcısıyla AYNI öncelik: query, hash'in ÜZERİNE yazar.
  const type = new URLSearchParams(window.location.search).get('type') ?? hashParams.get('type')

  if (type === 'invite') return 'invite'
  if (type === 'recovery') return 'recovery'
  return null
}

/** Davet bağlamında farklılaşan metinler; `recovery` VE ayırt edilemeyen (`null`) durum AYNI
 *  (nötr, "şifre sıfırlama" dilindeki ama davet bağlamında da yanlış okunmayan) metni paylaşır —
 *  bkz. dosya başlığı "ayırt edilemezse" notu. */
function copyForFlowType(flowType: InviteFlowType): {
  title: string
  subtitle: string
  intro: string | null
  passwordLabel: string
  submitIdle: string
  submitPending: string
  successMessage: string
} {
  if (flowType === 'invite') {
    return {
      title: 'Hesabınızı Oluşturun',
      subtitle: 'Danışan Daveti',
      intro: 'Koçunuz sizi davet etti. Devam etmek için bir şifre belirleyin.',
      passwordLabel: 'ŞİFRENİZİ BELİRLEYİN',
      submitIdle: 'HESABI OLUŞTUR',
      submitPending: 'OLUŞTURULUYOR...',
      successMessage: 'Hesabınız oluşturuldu. Artık giriş yapabilirsiniz.',
    }
  }
  return {
    title: 'Yeni Şifre Belirle',
    subtitle: 'Şifre Sıfırlama',
    intro: null,
    passwordLabel: 'YENİ ŞİFRE',
    submitIdle: 'ŞİFREYİ GÜNCELLE',
    submitPending: 'GÜNCELLENİYOR...',
    successMessage: 'Şifreniz güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.',
  }
}

export default function ResetPasswordPage(): JSX.Element {
  const router = useRouter()
  const supabase = useSupabaseClient()
  const updatePassword = useUpdatePassword()
  // Lazy initializer: yalnızca İLK render'da bir kez çalışır (React garantisi).
  const [initialLinkError] = useState<string | null>(() => readLinkErrorFromLocation())
  const [flowType] = useState<InviteFlowType>(() => readFlowTypeFromLocation())
  const copy = copyForFlowType(flowType)
  const [status, setStatus] = useState<LinkStatus>(initialLinkError ? 'invalid' : 'checking')
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(initialLinkError)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeSchema) })

  useEffect(() => {
    // URL zaten AÇIK bir hata taşıyordu (yukarıdaki lazy initializer'da tespit edildi) —
    // kurtarma oturumu için abonelik kurmaya hiç gerek yok.
    if (initialLinkError) return

    let settled = false
    const markReady = () => {
      if (settled) return
      settled = true
      setStatus('ready')
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) markReady()
    })

    // Bağlantı sayfa mount olmadan ÖNCE işlenmiş olabilir — mevcut oturumu da ayrıca kontrol et.
    // `setState` burada bir PROMISE CALLBACK'İ içinde çağrılıyor (senkron değil, effect
    // gövdesinin kendisinde değil) — `react-hooks/set-state-in-effect` bu deseni kabul eder.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
    })

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        setLinkErrorMessage(
          'Bu bağlantı geçersiz ya da süresi dolmuş. Lütfen yeni bir bağlantı isteyin.'
        )
        setStatus('invalid')
      }
    }, SESSION_DETECT_TIMEOUT_MS)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [supabase, initialLinkError])

  const onSubmit = handleSubmit((values) => {
    updatePassword.mutate(values.password, {
      onSuccess: () => setDone(true),
    })
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0f0f12]">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-2xl dark:border-zinc-800 dark:bg-[#16161d]">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-800 dark:text-zinc-200">{copy.title}</h1>
          <p className="text-sm font-medium uppercase tracking-widest text-gray-500">
            {copy.subtitle}
          </p>
        </div>

        {status === 'checking' && (
          <p className="text-center text-sm font-medium text-gray-500" role="status">
            Bağlantı doğrulanıyor...
          </p>
        )}

        {status === 'invalid' && (
          <div className="space-y-6">
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-bold text-red-600 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-400"
            >
              {linkErrorMessage}
            </div>
            <Link
              href="/forgot-password"
              className="block w-full rounded-xl bg-accent py-4 text-center text-sm font-bold text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-90"
            >
              YENİ BAĞLANTI İSTE
            </Link>
          </div>
        )}

        {status === 'ready' && done && (
          <div className="space-y-6">
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400"
            >
              {copy.successMessage}
            </div>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="block w-full rounded-xl bg-accent py-4 text-center text-sm font-bold text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-90"
            >
              GİRİŞE GİT
            </button>
          </div>
        )}

        {status === 'ready' && !done && (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {copy.intro && (
              <p className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
                {copy.intro}
              </p>
            )}
            {updatePassword.error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-bold text-red-600 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-400"
              >
                {updatePassword.error.message}
              </div>
            )}

            <div>
              <label
                htmlFor="reset-password-new"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                {copy.passwordLabel}
              </label>
              <input
                id="reset-password-new"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={errors.password ? 'reset-password-new-error' : undefined}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm transition-colors focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <p
                  id="reset-password-new-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={updatePassword.isPending}
              className="w-full rounded-xl bg-accent py-4 text-sm font-bold text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {updatePassword.isPending ? copy.submitPending : copy.submitIdle}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
