'use client'

// "Güvenlik" bölümü — TOTP çok faktörlü kimlik doğrulama (MFA) kaydı, seviye
// yükseltme (step-up) ve faktör yönetimi. `/profile#guvenlik` içinde render edilir.
//
// ─────────────────────────────────────────────────────────────────────────────
// BU BİLEŞEN BİR GÜVENLİK SINIRI DEĞİLDİR
// ─────────────────────────────────────────────────────────────────────────────
// Aşağıdaki üç dal ("kayıt", "seviye yükseltme", "faktör listesi") yalnızca doğru
// EKRANI göstermek içindir; yetkilendirme yapmaz. Gerçek sınır veritabanındaki
// RESTRICTIVE RLS politikasıdır (`mfa_aal2_gate`) — bkz.
// `packages/api-client/src/hooks/useMfa.ts` başlık yorumu ve
// `supabase/migrations/20260819120000_mfa_aal2_gate.sql`.

import { Copy, KeyRound, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import type { JSX } from 'react'
import { useState } from 'react'

import {
  MFA_TOTP_CODE_LENGTH,
  emptyMfaStatus,
  isValidTotpCode,
  normalizeTotpCode,
  useEnrollTotp,
  useMfaStatus,
  useUnenrollFactor,
  useVerifyTotp,
} from '@repo/api-client'
import type { MfaStatus } from '@repo/api-client'
import type { Factor } from '@supabase/supabase-js'
import { QueryState } from '@/components/ui'

/** Secret'i panoya kopyalar; API yoksa/reddedilirse SESSİZCE yutar (jsdom'da da). */
async function copySecretToClipboard(secret: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(secret)
  } catch {
    // Panoya erişim yoksa (jsdom, izin reddi, HTTP bağlamı) sessizce yutulur:
    // secret zaten ekranda düz metin olarak duruyor, kullanıcı elle seçip kopyalayabilir.
  }
}

/** Kayıt/seviye-yükseltme ortak 6 haneli kod girişi. */
function TotpCodeInput({
  id,
  code,
  onCodeChange,
}: {
  id: string
  code: string
  onCodeChange: (value: string) => void
}): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-gray-800 dark:text-zinc-200">
        Kimlik doğrulayıcı uygulamadaki 6 haneli kod
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={MFA_TOTP_CODE_LENGTH}
        value={code}
        onChange={(event) => onCodeChange(normalizeTotpCode(event.target.value))}
        placeholder="123456"
        className="w-full max-w-[12rem] rounded-xl border-2 border-gray-300 bg-gray-50 p-3 text-center font-mono text-lg tracking-[0.3em] focus:border-accent focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
      />
    </div>
  )
}

/** (a) Doğrulanmış faktör yokken kayıt akışı: kur -> QR + secret göster -> doğrula. */
function EnrollFlow(): JSX.Element {
  const enrollTotp = useEnrollTotp()
  const verifyTotp = useVerifyTotp()
  const [code, setCode] = useState('')

  const enrollment = enrollTotp.data

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        Hesabınıza kimlik doğrulayıcı uygulama (Google Authenticator, 1Password, Authy vb.) ile
        ikinci bir güvenlik katmanı ekleyin.
      </p>

      {!enrollment ? (
        <button
          type="button"
          onClick={() => enrollTotp.mutate()}
          disabled={enrollTotp.isPending}
          aria-busy={enrollTotp.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          {enrollTotp.isPending ? 'Kurulum başlatılıyor...' : 'Kurulumu Başlat'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrDataUrl}
              alt="TOTP kurulum QR kodu"
              className="h-40 w-40 shrink-0 rounded-xl border-2 border-gray-200 bg-white p-2 dark:border-zinc-700"
            />
            <div className="w-full space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                QR okutamıyorsanız bu kodu elle girin
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all break-all rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm text-gray-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {enrollment.secret}
                </code>
                <button
                  type="button"
                  onClick={() => void copySecretToClipboard(enrollment.secret)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Kopyala
                </button>
              </div>
              <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Bu kod, kurtarma yolunun TAMAMIDIR: parola kasanıza kaydedin. Bunu sıfırlayan bir
                sunucu ucu YOKTUR — böyle bir uç, hesabınız ele geçirilirse tüm danışanlarınızın
                ikinci faktörünü tek hamlede yok eden bir devralma yüzeyi olurdu.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <TotpCodeInput id="mfa-enroll-code" code={code} onCodeChange={setCode} />
            <button
              type="button"
              onClick={() =>
                verifyTotp.mutate(
                  { factorId: enrollment.factorId, code },
                  { onSuccess: () => setCode('') }
                )
              }
              disabled={!isValidTotpCode(code) || verifyTotp.isPending}
              aria-busy={verifyTotp.isPending}
              className="h-fit rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {verifyTotp.isPending ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** (b) Faktör var ama oturum aal1 — seviye yükseltme. */
function StepUpFlow({ factor }: { factor: Factor }): JSX.Element {
  const verifyTotp = useVerifyTotp()
  const [code, setCode] = useState('')

  return (
    <div className="space-y-4">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Oturumunuz doğrulanmadı. Devam etmek için kimlik doğrulayıcı uygulamadaki kodu girin.
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <TotpCodeInput id="mfa-stepup-code" code={code} onCodeChange={setCode} />
        <button
          type="button"
          onClick={() =>
            verifyTotp.mutate({ factorId: factor.id, code }, { onSuccess: () => setCode('') })
          }
          disabled={!isValidTotpCode(code) || verifyTotp.isPending}
          aria-busy={verifyTotp.isPending}
          className="h-fit rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {verifyTotp.isPending ? 'Doğrulanıyor...' : 'Doğrula'}
        </button>
      </div>
    </div>
  )
}

/** (c) Oturum aal2 — kayıtlı faktör listesi + kaldırma. */
function FactorList({ factors }: { factors: Factor[] }): JSX.Element {
  const unenrollFactor = useUnenrollFactor()
  const [armedFactorId, setArmedFactorId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {factors.map((factor) => {
          const label = factor.friendly_name ?? factor.factor_type
          const isArmed = armedFactorId === factor.id
          return (
            <li
              key={factor.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2">
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-zinc-200">{label}</p>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Eklendi: {new Date(factor.created_at).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>

              {!isArmed ? (
                <button
                  type="button"
                  onClick={() => setArmedFactorId(factor.id)}
                  aria-label={`${label} faktörünü kaldır`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Kaldır
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-red-700 dark:text-red-400">
                    Emin misiniz?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      unenrollFactor.mutate({ factorId: factor.id })
                      setArmedFactorId(null)
                    }}
                    disabled={unenrollFactor.isPending}
                    aria-busy={unenrollFactor.isPending}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Evet, kaldır
                  </button>
                  <button
                    type="button"
                    onClick={() => setArmedFactorId(null)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        Son faktörünüzü kaldırırsanız bir sonraki girişinizde koç verilerine erişemezsiniz; tekrar
        erişim için yeniden kayıt olmanız gerekir.
      </p>
    </div>
  )
}

function SecurityBody({ status }: { status: MfaStatus }): JSX.Element {
  if (status.isAal2) return <FactorList factors={status.factors} />
  if (status.hasVerifiedFactor && status.needsStepUp && status.verifiedTotpFactor) {
    return <StepUpFlow factor={status.verifiedTotpFactor} />
  }
  return <EnrollFlow />
}

export function SecuritySection(): JSX.Element {
  const statusQuery = useMfaStatus()

  return (
    <section
      aria-labelledby="security-heading"
      className="mt-8 rounded-2xl border-2 border-gray-200 bg-white p-6 dark:border-zinc-800 dark:bg-[#16161d]"
    >
      <h2
        id="security-heading"
        className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-zinc-200"
      >
        <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
        İki Adımlı Doğrulama (TOTP)
      </h2>

      <QueryState
        isLoading={statusQuery.isLoading}
        isError={statusQuery.isError}
        error={statusQuery.error}
        onRetry={() => void statusQuery.refetch()}
      >
        <SecurityBody status={statusQuery.data ?? emptyMfaStatus()} />
      </QueryState>
    </section>
  )
}
