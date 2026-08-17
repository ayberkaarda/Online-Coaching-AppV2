'use client'

// Koçun tek bir öğrenciye ya da tüm öğrencilere duyuru göndermesini sağlayan form.
// Doğrulama zod (notificationSchema) + react-hook-form ile yapılır.

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { JSX } from 'react'

import { useSendNotification } from '@/hooks'
import { notificationSchema, type NotificationInput } from '@/lib/validation/schemas'
import type { Profile } from '@/types'

export interface NotificationFormProps {
  clients: Profile[]
}

export function NotificationForm({ clients }: NotificationFormProps): JSX.Element {
  const sendNotification = useSendNotification()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotificationInput>({
    resolver: zodResolver(notificationSchema),
    defaultValues: { target: 'all', title: '', message: '' },
  })

  const clientOptions = clients.filter((c) => c.role !== 'coach')

  const onSubmit = handleSubmit(async (values) => {
    const clientIds = values.target === 'all' ? clientOptions.map((c) => c.id) : [values.target]

    // Başarı/hata toast'ları hook içinde gösteriliyor; burada tekrarlanmaz.
    await sendNotification.mutateAsync({
      clientIds,
      title: values.title,
      message: values.message,
    })
    reset({ target: 'all', title: '', message: '' })
  })

  const isSending = isSubmitting || sendNotification.isPending

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d] md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          📢
        </span>
        <h3 className="text-lg font-black text-gray-800 dark:text-zinc-200">
          Duyuru &amp; Mesaj Gönder
        </h3>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label
            htmlFor="notification-target"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
          >
            KİME
          </label>
          <select
            id="notification-target"
            {...register('target')}
            aria-invalid={errors.target ? 'true' : 'false'}
            aria-describedby={errors.target ? 'notification-target-error' : undefined}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm font-medium focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
          >
            <option value="all">🌐 Tüm Öğrenciler</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                👤 {c.full_name}
              </option>
            ))}
          </select>
          {errors.target ? (
            <p
              id="notification-target-error"
              role="alert"
              className="mt-1 text-xs font-bold text-red-500"
            >
              {errors.target.message}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="notification-title"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
          >
            BAŞLIK
          </label>
          <input
            id="notification-title"
            type="text"
            {...register('title')}
            aria-invalid={errors.title ? 'true' : 'false'}
            aria-describedby={errors.title ? 'notification-title-error' : undefined}
            placeholder="Örn: Yeni Antrenman Bloklarına Geçiş"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
          />
          {errors.title ? (
            <p
              id="notification-title-error"
              role="alert"
              className="mt-1 text-xs font-bold text-red-500"
            >
              {errors.title.message}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="notification-message"
            className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
          >
            MESAJ DETAYI
          </label>
          <textarea
            id="notification-message"
            {...register('message')}
            aria-invalid={errors.message ? 'true' : 'false'}
            aria-describedby={errors.message ? 'notification-message-error' : undefined}
            placeholder="Kardiyo süreleri 10 dakika artırıldı..."
            className="h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
          />
          {errors.message ? (
            <p
              id="notification-message-error"
              role="alert"
              className="mt-1 text-xs font-bold text-red-500"
            >
              {errors.message.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSending}
          aria-busy={isSending}
          className="w-full rounded-xl bg-gradient-to-r from-accent to-purple-600 py-4 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-accent disabled:opacity-50"
        >
          {isSending ? 'Gönderiliyor...' : 'Gönder'}
        </button>
      </form>
    </div>
  )
}
