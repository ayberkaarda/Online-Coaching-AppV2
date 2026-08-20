'use client'

// Danışan daveti — koç arayüzü (Faz 4.9 dilim 2).
//
// Sunucu ucu : `apps/web/src/app/api/coach/invite-client/route.ts` (bu dilimde DEĞİŞMEDİ)
// Hook       : `useInviteClient` (`packages/api-client/src/hooks/useSession.ts`)
// Karar kaydı: `docs/adr/0027-danisan-daveti.md`
//
// ─────────────────────────────────────────────────────────────────────────────
// HATA METİNLERİ SUNUCUDAN GELİR, BURADA TEKRAR YAZILMAZ
// ─────────────────────────────────────────────────────────────────────────────
// `ApiError.message`, route'un ürettiği Türkçe metnin AYNISIdır (409 için
// `EMAIL_TAKEN_MESSAGE`, 403 için `MFA_REQUIRED_MESSAGE`, 429 için hız sınırı metni,
// 503 için yapılandırma metni — bkz. route.ts). Burada ikinci bir kopya tutmak drift
// riski taşırdı (biri değişip diğeri unutulur, bkz. ADR-0027 Karar 2'nin "asıl garanti"
// tartışmasındaki AYNI disiplin). TEK istisna `MFA_REQUIRED`: sunucu mesajı yeterli ama
// arayüz AYRICA Güvenlik bölümüne bir bağlantı ekler (`/profile#guvenlik`, `CoachMfaGate`
// ile AYNI hedef) — bunu sunucu döndüremez, yalnızca kod (`MFA_REQUIRED`) üzerinden
// istemcide eklenir.
//
// BAĞLANTI/TOKEN HİÇ GÖSTERİLMEZ: sunucu yanıtı zaten `{ ok: true }`'dan başka bir şey
// TAŞIMAZ (ADR-0027 Karar 1) — başarı durumunda yalnızca "e-posta gönderildi" denir.

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import type { JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useInviteClient } from '@repo/api-client'
import { ApiError } from '@repo/api-client/api/client'

const inviteClientFormSchema = z.object({
  email: z
    .string({ required_error: 'E-posta adresi zorunludur.' })
    .trim()
    .min(1, { message: 'E-posta adresi zorunludur.' })
    .email({ message: 'Geçerli bir e-posta adresi girin.' }),
  full_name: z
    .string()
    .trim()
    .max(120, { message: 'Ad soyad en fazla 120 karakter olabilir.' })
    .optional(),
})

type InviteClientFormValues = z.infer<typeof inviteClientFormSchema>

const GENERIC_ERROR_MESSAGE = 'Davet gönderilemedi. Lütfen tekrar deneyin.'

export function InviteClientForm(): JSX.Element {
  const inviteClient = useInviteClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteClientFormValues>({ resolver: zodResolver(inviteClientFormSchema) })

  const error = inviteClient.error
  const isApiError = ApiError.isApiError(error)
  // MFA_REQUIRED'da mesaj yeterli değildir: koç NEREYE gideceğini bilmeli — bkz. dosya başlığı.
  const isMfaRequired = isApiError && (error as ApiError).code === 'MFA_REQUIRED'

  const onSubmit = handleSubmit((values) => {
    inviteClient.mutate(
      { email: values.email, full_name: values.full_name ? values.full_name : undefined },
      { onSuccess: () => reset() }
    )
  })

  return (
    <section
      aria-labelledby="invite-client-heading"
      className="mb-8 rounded-panel border border-border bg-surface p-6"
    >
      <h3 id="invite-client-heading" className="mb-1 text-xl font-bold text-fg">
        Danışan Davet Et
      </h3>
      <p className="mb-4 text-sm text-fg-muted">
        Girdiğiniz e-postaya bir davet bağlantısı gönderilir; danışan şifresini kendisi belirler.
      </p>

      {inviteClient.isSuccess && (
        <div
          role="status"
          className="mb-4 rounded-control border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-600 dark:text-emerald-400"
        >
          Davet e-postası gönderildi.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 space-y-2 rounded-control border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-600 dark:text-red-400"
        >
          <p>{isApiError ? (error as ApiError).message : GENERIC_ERROR_MESSAGE}</p>
          {isMfaRequired && (
            <Link href="/profile#guvenlik" className="inline-block underline">
              Güvenlik bölümüne git
            </Link>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div>
          <label
            htmlFor="invite-client-email"
            className="mb-1 block text-xs font-bold uppercase tracking-wider text-fg-muted"
          >
            E-posta
          </label>
          <input
            id="invite-client-email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'invite-client-email-error' : undefined}
            className="w-full rounded-control border border-border bg-canvas p-3 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="danisan@ornek.com"
            {...register('email')}
          />
          {errors.email && (
            <p
              id="invite-client-email-error"
              role="alert"
              className="mt-1 text-xs font-bold text-red-500"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="invite-client-full-name"
            className="mb-1 block text-xs font-bold uppercase tracking-wider text-fg-muted"
          >
            Ad Soyad (opsiyonel)
          </label>
          <input
            id="invite-client-full-name"
            type="text"
            autoComplete="name"
            className="w-full rounded-control border border-border bg-canvas p-3 text-sm text-fg focus:border-accent focus:outline-none"
            placeholder="Ayşe Yılmaz"
            {...register('full_name')}
          />
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={inviteClient.isPending}
            aria-busy={inviteClient.isPending}
            className="rounded-control bg-accent px-5 py-3 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {inviteClient.isPending ? 'Gönderiliyor...' : 'Davet Gönder'}
          </button>
        </div>
      </form>
    </section>
  )
}
