'use client'

// Profil sayfası: avatar yükleme, şifre değiştirme, beslenme/antrenman programı görüntüleme.

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import type { ChangeEvent, JSX } from 'react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import { useProfile, useSession, useUpdatePassword, useUploadAvatar } from '@/hooks'
import { SkeletonCard, SkeletonText } from '@/components/ui'
import { passwordChangeSchema, type PasswordChangeInput } from '@/lib/validation/schemas'
import { DAY_NAMES, parseNutritionPlan, parseWorkoutPlan } from '@/types/domain'

function isParsableJson(raw: string): boolean {
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

function WorkoutPlanView({ raw }: { raw: string | null }): JSX.Element {
  if (!raw) {
    return (
      <p className="text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        Koçunuz henüz bir antrenman programı atamadı.
      </p>
    )
  }

  if (!isParsableJson(raw)) {
    return (
      <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        {raw}
      </div>
    )
  }

  const plan = parseWorkoutPlan(raw)
  return (
    <ul className="space-y-3">
      {DAY_NAMES.map((day) => (
        <li key={day} className="text-sm">
          <span className="font-bold text-gray-800 dark:text-zinc-200">{day}: </span>
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {plan[day].trim() ? plan[day] : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

function NutritionPlanView({ raw }: { raw: string | null }): JSX.Element {
  if (!raw) {
    return (
      <p className="text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        Koçunuz henüz bir beslenme programı atamadı.
      </p>
    )
  }

  if (!isParsableJson(raw)) {
    return (
      <div className="whitespace-pre-wrap text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        {raw}
      </div>
    )
  }

  const plan = parseNutritionPlan(raw)
  return (
    <ul className="space-y-3">
      {DAY_NAMES.map((day) => {
        const entry = plan[day]
        return (
          <li key={day} className="text-sm">
            <span className="font-bold text-gray-800 dark:text-zinc-200">{day}: </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {entry.items.trim() ? `${entry.items} (${entry.total} kcal)` : '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export default function ProfilePage(): JSX.Element {
  const router = useRouter()

  const { data: session, isLoading: isSessionLoading } = useSession()
  const userId = session?.user.id
  const { data: profile, isLoading: isProfileLoading } = useProfile(userId)

  const uploadAvatar = useUploadAvatar()
  const updatePassword = useUpdatePassword()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeSchema) })

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace('/login')
    }
  }, [isSessionLoading, session, router])

  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file || !userId) return
    uploadAvatar.mutate({ userId, file })
    event.target.value = ''
  }

  const onSubmitPassword = handleSubmit((values) => {
    updatePassword.mutate(values.password, {
      onSuccess: () => reset(),
    })
  })

  if (isSessionLoading || isProfileLoading || !profile) {
    return (
      <div className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
        <SkeletonCard />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <SkeletonText lines={4} />
          <SkeletonText lines={4} />
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="container mx-auto max-w-4xl px-4 py-12">
      <button
        onClick={() => router.push('/')}
        className="mb-6 flex items-center gap-2 font-bold text-brand-purple transition-opacity hover:opacity-80"
      >
        ← Ana Sayfaya Dön
      </button>

      <div className="mb-8 flex flex-col items-center gap-8 rounded-3xl border border-gray-100 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-[#16161d] md:flex-row md:items-start">
        {/* Avatar Bölümü */}
        <div className="group relative cursor-pointer">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-brand-purple/20 bg-gray-100 transition-all group-hover:border-brand-purple dark:bg-zinc-900">
            {/* Avatar private bucket'tadır: adres imzalıdır ve süreye bağlıdır.
                İmza üretilemezse (dosya yok/erişim yok) kırık görsel yerine 👤 gösterilir. */}
            {profile.avatarSignedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarSignedUrl}
                alt={`${profile.full_name} profil fotoğrafı`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-4xl" aria-hidden="true">
                👤
              </span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            aria-label="Profil fotoğrafı yükle"
            aria-busy={uploadAvatar.isPending}
            onChange={handleAvatarUpload}
            disabled={uploadAvatar.isPending}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          {uploadAvatar.isPending && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-bold text-white"
            >
              Yükleniyor...
            </div>
          )}
        </div>

        {/* Kullanıcı Bilgileri & Şifre */}
        <div className="w-full flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-zinc-200">
              {profile.full_name}
            </h1>
            <p className="font-medium text-gray-500">{session?.user.email}</p>
          </div>
          <form
            onSubmit={onSubmitPassword}
            className="flex max-w-md flex-col gap-3 border-t pt-4 dark:border-zinc-800 sm:flex-row"
            noValidate
          >
            <div className="flex-1">
              <label htmlFor="new-password" className="sr-only">
                Yeni Şifre
              </label>
              <input
                id="new-password"
                type="password"
                placeholder="Yeni Şifre Belirle"
                autoComplete="new-password"
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={errors.password ? 'new-password-error' : undefined}
                className="w-full rounded-xl border bg-gray-50 p-3 text-sm focus:border-brand-purple focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                {...register('password')}
              />
              {errors.password && (
                <p
                  id="new-password-error"
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
              className="h-fit rounded-xl bg-zinc-800 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              Güncelle
            </button>
          </form>
        </div>
      </div>

      {/* Program Görüntüleme Alanı */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
          <h3 className="mb-4 border-b pb-3 text-lg font-black text-brand-purple dark:border-zinc-800">
            🥗 Beslenme Programım
          </h3>
          <NutritionPlanView raw={profile.nutrition_plan} />
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
          <h3 className="mb-4 border-b pb-3 text-lg font-black text-emerald-500 dark:border-zinc-800">
            🏋️ Antrenman Programım
          </h3>
          <WorkoutPlanView raw={profile.workout_plan} />
        </div>
      </div>
    </main>
  )
}
