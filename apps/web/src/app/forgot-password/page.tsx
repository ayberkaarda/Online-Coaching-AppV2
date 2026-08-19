'use client'

// Şifremi unuttum sayfası (Faz 4.7 dilim 3).
//
// GÜVENLİK — KULLANICI SAYIMI YOK: bu sayfa gönderim SONRASINDA her zaman AYNI nötr mesajı
// gösterir ("Bu adres kayıtlıysa..."). Supabase'in `resetPasswordForEmail`'i zaten hesap
// var/yok bilgisini sızdırmaz (bkz. `useRequestPasswordReset` doc-comment'i,
// `packages/api-client/src/hooks/useSession.ts`), ama asıl disiplin BURADADIR: mutasyon
// başarılı da olsa (ağ hatası, zaman aşımı vb.) BAŞARISIZ da olsa arayüz AYNI ekranı
// gösterir. `onSettled` bilerek `onSuccess` yerine kullanılıyor — aksi halde bir hata
// durumunda kullanıcı "e-posta gönderilemedi" gibi ayırt edici bir sinyal görürdü.

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import type { JSX } from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useRequestPasswordReset } from '@repo/api-client'
import { clientEnv } from '@/env'

// `packages/types/src/schemas.ts` BİLEREK DEĞİŞTİRİLMEDİ (bu dilimin dosya kapsamı dışında);
// e-posta biçimi doğrulaması burada yerel olarak, `loginSchema`'daki alanla AYNI kurallarla
// tanımlanır.
const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'E-posta zorunludur.' })
    .trim()
    .min(1, { message: 'E-posta zorunludur.' })
    .email({ message: 'Geçerli bir e-posta adresi girin.' }),
})
type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

const NEUTRAL_MESSAGE =
  'Bu adres kayıtlıysa, şifre sıfırlama bağlantısı içeren bir e-posta gönderdik. ' +
  'Gelen kutunuzu (ve spam klasörünü) kontrol edin.'

export default function ForgotPasswordPage(): JSX.Element {
  const [submitted, setSubmitted] = useState(false)
  const requestReset = useRequestPasswordReset()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  const isPending = requestReset.isPending

  const onSubmit = handleSubmit((values) => {
    requestReset.mutate(
      {
        email: values.email,
        redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/reset-password`,
      },
      {
        // Başarı/başarısızlık FARK ETMEZ — hesap sayımı sızdırmamak için her zaman aynı
        // nötr ekran gösterilir (bkz. dosya başı notu).
        onSettled: () => setSubmitted(true),
      }
    )
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0f0f12]">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-2xl dark:border-zinc-800 dark:bg-[#16161d]">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-800 dark:text-zinc-200">
            Şifremi Unuttum
          </h1>
          <p className="text-sm font-medium uppercase tracking-widest text-gray-500">
            Sıfırlama Bağlantısı İsteyin
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-sm font-bold text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400"
            >
              {NEUTRAL_MESSAGE}
            </div>
            <Link
              href="/login"
              className="block w-full rounded-xl bg-accent py-4 text-center text-sm font-bold text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-90"
            >
              GİRİŞE DÖN
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <p className="text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-400">
              Hesabınıza kayıtlı e-posta adresini girin; kayıtlıysa bir sıfırlama bağlantısı
              gönderelim.
            </p>

            <div>
              <label
                htmlFor="forgot-password-email"
                className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                E-POSTA ADRESİ
              </label>
              <input
                id="forgot-password-email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'forgot-password-email-error' : undefined}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm transition-colors focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                placeholder="ornek@email.com"
                {...register('email')}
              />
              {errors.email && (
                <p
                  id="forgot-password-email-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.email.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-accent py-4 text-sm font-bold text-white shadow-lg shadow-accent/30 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'GÖNDERİLİYOR...' : 'SIFIRLAMA BAĞLANTISI GÖNDER'}
            </button>

            <Link
              href="/login"
              className="block text-center text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-accent"
            >
              Girişe dön
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
