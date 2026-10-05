'use client'

// Koçun tek bir danışana ya da tüm danışanlara duyuru göndermesini sağlayan form.
// Doğrulama zod (notificationSchema) + react-hook-form ile yapılır.

import { zodResolver } from '@hookform/resolvers/zod'
import { Megaphone } from 'lucide-react'
import { useForm } from 'react-hook-form'
import type { JSX } from 'react'

import { useSendNotification } from '@repo/api-client'
import { notificationSchema, type NotificationInput } from '@repo/types/schemas'
import type { Profile } from '@repo/types'

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
    <div className="rounded-card border border-border bg-surface p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Megaphone aria-hidden="true" className="h-6 w-6 shrink-0 text-accent" />
        <h3 className="text-lg font-bold text-fg">Duyuru &amp; Mesaj Gönder</h3>
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label
            htmlFor="notification-target"
            className="mb-2 block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted"
          >
            KİME
          </label>
          <select
            id="notification-target"
            {...register('target')}
            aria-invalid={errors.target ? 'true' : 'false'}
            aria-describedby={errors.target ? 'notification-target-error' : undefined}
            className="w-full rounded-control border border-border-control bg-surface-sunken p-3.5 text-sm font-medium focus:border-accent focus:outline-none"
          >
            {/* `<option>` içinde ikon render edilemez (tarayıcı yalnızca düz metin
                gösterir), bu yüzden burada emoji ikonun yerine düz metin geçer. */}
            <option value="all">Tüm Danışanlar</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
          {errors.target ? (
            <p
              id="notification-target-error"
              role="alert"
              className="mt-1 text-xs font-bold text-danger"
            >
              {errors.target.message}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="notification-title"
            className="mb-2 block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted"
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
            className="w-full rounded-control border border-border-control bg-surface-sunken p-3.5 text-sm focus:border-accent focus:outline-none"
          />
          {errors.title ? (
            <p
              id="notification-title-error"
              role="alert"
              className="mt-1 text-xs font-bold text-danger"
            >
              {errors.title.message}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="notification-message"
            className="mb-2 block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted"
          >
            MESAJ DETAYI
          </label>
          <textarea
            id="notification-message"
            {...register('message')}
            aria-invalid={errors.message ? 'true' : 'false'}
            aria-describedby={errors.message ? 'notification-message-error' : undefined}
            placeholder="Kardiyo süreleri 10 dakika artırıldı..."
            className="h-32 w-full resize-none rounded-control border border-border-control bg-surface-sunken p-3.5 text-sm focus:border-accent focus:outline-none"
          />
          {errors.message ? (
            <p
              id="notification-message-error"
              role="alert"
              className="mt-1 text-xs font-bold text-danger"
            >
              {errors.message.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSending}
          aria-busy={isSending}
          className="w-full rounded-control bg-accent py-4 text-sm font-bold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {isSending ? 'Gönderiliyor...' : 'Gönder'}
        </button>
      </form>
    </div>
  )
}
