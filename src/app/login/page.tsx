'use client'

// Giriş sayfası: react-hook-form + zod doğrulaması ile Supabase oturum açma.

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useForm } from 'react-hook-form'

import { useSignIn } from '@/hooks'
import { loginSchema, type LoginInput } from '@/lib/validation/schemas'

export default function LoginPage(): JSX.Element {
  const router = useRouter()
  const signIn = useSignIn()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const isPending = signIn.isPending
  const rawErrorMessage = signIn.error?.message
  const errorMsg =
    rawErrorMessage === 'Invalid login credentials' ? 'E-posta veya şifre hatalı!' : rawErrorMessage

  const onSubmit = handleSubmit((values) => {
    signIn.mutate(values, {
      onSuccess: () => {
        router.push('/')
        router.refresh()
      },
    })
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-[#0f0f12]">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 shadow-2xl dark:border-zinc-800 dark:bg-[#16161d]">
        <div className="mb-8 text-center">
          <h1 className="mb-2 bg-gradient-to-r from-accent to-purple-500 bg-clip-text text-3xl font-black text-transparent">
            Coaching Hub
          </h1>
          <p className="text-sm font-medium uppercase tracking-widest text-gray-500">
            Sisteme Giriş Yapın
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm font-bold text-red-600 dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-400"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
            >
              E-POSTA ADRESİ
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm transition-colors focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="ornek@email.com"
              {...register('email')}
            />
            {errors.email && (
              <p
                id="login-email-error"
                role="alert"
                className="mt-1 text-xs font-bold text-red-500"
              >
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500"
            >
              ŞİFRE
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm transition-colors focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p
                id="login-password-error"
                role="alert"
                className="mt-1 text-xs font-bold text-red-500"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-gradient-to-r from-accent to-purple-600 py-4 text-sm font-black text-white shadow-lg shadow-purple-500/30 transition-all hover:from-purple-600 hover:to-accent disabled:opacity-50"
          >
            {isPending ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}
          </button>
        </form>
      </div>
    </div>
  )
}
