'use client'

// Giriş sayfası: react-hook-form + zod doğrulaması ile Supabase oturum açma.

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useForm } from 'react-hook-form'

import { useSignIn } from '@repo/api-client'
import { loginSchema, type LoginInput } from '@repo/types/schemas'

import { SarmalLogo } from '@/components/brand/SarmalMark'

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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8">
        <div className="mb-8 text-center">
          <h1 className="mb-3 flex justify-center">
            <SarmalLogo fontSize={31} />
          </h1>
          <p className="text-sm font-medium text-fg-muted">Sisteme Giriş Yapın</p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mb-6 rounded-control border border-danger/30 bg-danger/10 p-4 text-center text-sm font-bold text-danger"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted"
            >
              E-POSTA ADRESİ
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="w-full rounded-control border border-border-control bg-surface-sunken p-4 text-sm transition-colors focus:border-accent focus:outline-none"
              placeholder="ornek@email.com"
              {...register('email')}
            />
            {errors.email && (
              <p id="login-email-error" role="alert" className="mt-1 text-xs font-bold text-danger">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted"
            >
              ŞİFRE
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? 'true' : 'false'}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              className="w-full rounded-control border border-border-control bg-surface-sunken p-4 text-sm transition-colors focus:border-accent focus:outline-none"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p
                id="login-password-error"
                role="alert"
                className="mt-1 text-xs font-bold text-danger"
              >
                {errors.password.message}
              </p>
            )}
            <Link
              href="/forgot-password"
              className="mt-2 inline-block text-xs font-bold uppercase tracking-[0.06em] text-fg-muted hover:text-accent"
            >
              Şifremi unuttum
            </Link>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-control bg-accent py-4 text-sm font-bold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP'}
          </button>
        </form>
      </div>
    </div>
  )
}
