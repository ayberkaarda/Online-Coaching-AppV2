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
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-fg">
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
        className="w-full max-w-[12rem] rounded-control border-2 border-border-control bg-surface-sunken p-3 text-center font-mono text-lg tracking-[0.3em] focus:border-accent focus:outline-none"
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
      <p className="text-sm font-medium leading-relaxed text-fg">
        Hesabınıza kimlik doğrulayıcı uygulama (Google Authenticator, 1Password, Authy vb.) ile
        ikinci bir güvenlik katmanı ekleyin.
      </p>

      {!enrollment ? (
        <button
          type="button"
          onClick={() => enrollTotp.mutate()}
          disabled={enrollTotp.isPending}
          aria-busy={enrollTotp.isPending}
          className="inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3 text-sm font-bold text-accent-fg transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="h-40 w-40 shrink-0 rounded-control border-2 border-border bg-white p-2"
            />
            <div className="w-full space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.06em] text-fg-muted">
                QR okutamıyorsanız bu kodu elle girin
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all break-all rounded-lg bg-surface-sunken px-3 py-2 font-mono text-sm text-fg">
                  {enrollment.secret}
                </code>
                <button
                  type="button"
                  onClick={() => void copySecretToClipboard(enrollment.secret)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold text-fg transition-colors hover:bg-surface-sunken"
                >
                  <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Kopyala
                </button>
              </div>
              <p className="rounded-control border-2 border-warning/40 bg-warning/10 p-3 text-xs font-bold leading-relaxed text-warning">
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
              className="h-fit rounded-control bg-success px-5 py-3 text-sm font-bold text-surface transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
        className="flex items-start gap-2 rounded-control border-2 border-warning/40 bg-warning/10 p-3 text-sm font-bold text-warning"
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
          className="h-fit rounded-control bg-success px-5 py-3 text-sm font-bold text-surface transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="text-sm font-bold text-fg">{label}</p>
                  <p className="text-xs font-medium text-fg-muted">
                    Eklendi: {new Date(factor.created_at).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>

              {!isArmed ? (
                <button
                  type="button"
                  onClick={() => setArmedFactorId(factor.id)}
                  aria-label={`${label} faktörünü kaldır`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger/10"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  Kaldır
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-danger">Emin misiniz?</span>
                  <button
                    type="button"
                    onClick={() => {
                      unenrollFactor.mutate({ factorId: factor.id })
                      setArmedFactorId(null)
                    }}
                    disabled={unenrollFactor.isPending}
                    aria-busy={unenrollFactor.isPending}
                    className="rounded-lg bg-danger px-3 py-2 text-xs font-bold text-surface transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Evet, kaldır
                  </button>
                  <button
                    type="button"
                    onClick={() => setArmedFactorId(null)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold text-fg transition-colors hover:bg-surface-sunken"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="rounded-control border-2 border-warning/40 bg-warning/10 p-3 text-xs font-bold leading-relaxed text-warning">
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
      className="mt-8 rounded-card border-2 border-border bg-surface p-6"
    >
      <h2 id="security-heading" className="mb-3 flex items-center gap-2 text-lg font-bold text-fg">
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
