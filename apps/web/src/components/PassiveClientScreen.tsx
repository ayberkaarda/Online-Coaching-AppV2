'use client'

// PASİF DANIŞAN EKRANI — Faz 4.10.
//
// Koçluk hizmeti sona ermiş (pasifleştirilmiş) bir danışan giriş yaptığında
// dashboard yerine BU ekranı görür (bkz. `apps/web/src/app/page.tsx` mount
// kapısı). Yalnızca İKİ eylem sunulur: hesabı sil + çıkış.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN BU BİR "EKRAN", BİR RLS SINIRI DEĞİL
// ─────────────────────────────────────────────────────────────────────────────
// Gerçek engel veritabanındadır: `account_active_gate` RESTRICTIVE politikası
// (`supabase/migrations/20260820180000_account_active_state.sql`) pasif danışanı
// 15 tablonun HİÇBİRİNİ okuyamaz/yazamaz yapar; yalnızca KENDİ `profiles`
// satırını okuyabilir (bu ekranın `is_active`/`full_name`i okuyabilmesi için).
// Bu bileşen yalnızca o gerçeği kullanıcıya AÇIKLAR ve iki meşru çıkışı sunar —
// `fetch` ile atlansa bile arkasında okunacak veri YOKTUR.
//
// ─────────────────────────────────────────────────────────────────────────────
// KVKK: SİLME HAKKI HER ZAMAN AÇIK
// ─────────────────────────────────────────────────────────────────────────────
// `useDeleteAccount` `/api/account/delete` service_role ucuna gider ve RLS'ten
// ETKİLENMEZ (ADR-0025). Yani pasif danışan giriş engellenmediği için silme
// akışına HER ZAMAN ulaşır — auth ban'ın (reddedilen alternatif) engelleyeceği
// tam da bu haktır. Silme onayı, profil sayfasındaki (`DeleteAccountSection`)
// AYNI çift-onay disiplinini izler (niyet + `HESABIMI SİL` yazarak doğrulama).

import { AlertTriangle, LogOut, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useState } from 'react'

import { DELETE_ACCOUNT_CONFIRMATION, useDeleteAccount, useSignOut } from '@repo/api-client'

export function PassiveClientScreen(): JSX.Element {
  const router = useRouter()
  const deleteAccount = useDeleteAccount()
  const signOut = useSignOut()

  const [isArmed, setIsArmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  // TÜRKÇE İ/ı: cümle noktalı büyük İ içerir; ÜZERİNDE katlama YAPILMAZ (gerekçe
  // `@repo/api-client` `DELETE_ACCOUNT_CONFIRMATION` doc-comment'i). Yalnızca trim + birebir.
  const isPhraseCorrect = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION
  const canSubmit = isPhraseCorrect && !deleteAccount.isPending

  function handleDelete(): void {
    if (!canSubmit) return
    deleteAccount.mutate(
      { confirmation: confirmation.trim() },
      {
        onSuccess: () => {
          router.replace('/login')
        },
      }
    )
  }

  function handleLogout(): void {
    signOut.mutate(undefined, {
      onSuccess: () => router.push('/login'),
    })
  }

  return (
    <main
      id="main-content"
      className="container mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12 sm:px-6"
    >
      <section
        aria-labelledby="passive-heading"
        className="rounded-panel border border-border bg-surface p-6 md:p-8"
      >
        <h1 id="passive-heading" className="mb-3 text-2xl font-bold text-fg">
          Koçluk hizmetiniz sona erdi
        </h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          Koçluk hizmetiniz sona erdi; yeniden başlamak için koçunuzla iletişime geçin. Hesabınız
          açık kalır ancak verileriniz görüntülenemez. Dilerseniz aşağıdan hesabınızı kalıcı olarak
          silebilir ya da çıkış yapabilirsiniz.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={signOut.isPending || deleteAccount.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            {signOut.isPending ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
          </button>
        </div>
      </section>

      {/* --- HESAP SİLME (KVKK unutulma hakkı) --- */}
      <section
        aria-labelledby="passive-delete-heading"
        className="mt-6 rounded-panel border-2 border-danger/30 bg-danger/60 p-6"
      >
        <h2
          id="passive-delete-heading"
          className="mb-3 flex items-center gap-2 text-lg font-bold text-danger"
        >
          <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
          Hesabımı Sil
        </h2>
        <p className="text-sm font-medium leading-relaxed text-danger/90">
          Hesabınızı sildiğinizde <strong>geri dönüşü yoktur</strong>. Profiliniz, programlarınız,
          kayıtlarınız, ölçümleriniz, fotoğraflarınız ve koçunuzla olan tüm yazışmalarınız kalıcı
          olarak silinir ve kurtarılamaz.
        </p>

        {!isArmed ? (
          <button
            type="button"
            onClick={() => setIsArmed(true)}
            disabled={deleteAccount.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-control border-2 border-danger px-5 py-3 text-sm font-bold text-danger transition-colors hover:bg-danger/90 hover:text-surface disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
            Hesabımı Sil
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            <label
              htmlFor="passive-delete-confirmation"
              className="block text-sm font-bold text-danger"
            >
              Onaylamak için aşağıdaki kutuya{' '}
              <code className="rounded bg-danger/15 px-1.5 py-0.5 font-mono text-danger">
                {DELETE_ACCOUNT_CONFIRMATION}
              </code>{' '}
              yazın
            </label>
            <input
              id="passive-delete-confirmation"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="passive-delete-confirmation-hint"
              className="w-full max-w-sm rounded-control border-2 border-danger/40 bg-surface p-3 text-sm font-medium focus:border-danger focus:outline-none"
            />
            <p id="passive-delete-confirmation-hint" className="text-xs font-medium text-danger/80">
              {isPhraseCorrect
                ? 'Onay metni doğru. Aşağıdaki düğmeye bastığınızda hesabınız kalıcı olarak silinecek.'
                : 'Silme düğmesi, onay metnini birebir yazana kadar etkinleşmez.'}
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canSubmit}
                aria-busy={deleteAccount.isPending}
                className="inline-flex items-center gap-2 rounded-control bg-danger px-5 py-3 text-sm font-bold text-surface transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                {deleteAccount.isPending ? 'Siliniyor...' : 'Hesabımı kalıcı olarak sil'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsArmed(false)
                  setConfirmation('')
                }}
                disabled={deleteAccount.isPending}
                className="rounded-control border border-border px-5 py-3 text-sm font-bold text-fg transition-colors hover:bg-canvas disabled:opacity-40"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
