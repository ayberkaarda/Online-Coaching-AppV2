'use client'

// Haftalık form check: öğrenci kilo + podyum fotoğrafı gönderir,
// geçmiş kayıtlar listelenir ve öncesi/sonrası kıyaslaması yapılabilir.
//
// Fotoğraflar PRIVATE bucket'tadır: `useFormChecks` her satır için süreli imzalı
// adres (`frontPoseSignedUrl`) üretir. Adres `null` ise (dosya yok / erişim yok)
// kırık görsel yerine boş durum / placeholder gösterilir.

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import type { ChangeEvent, JSX } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { EmptyState, QueryState, SkeletonCard } from '@/components/ui'
import { useFormChecks, useSubmitFormCheck } from '@/hooks'
import { ALLOWED_IMAGE_MIME, validateImageFile } from '@/lib/upload-validation'
import { formatDateTR, formatDateTimeTR } from '@/lib/utils'
import { formCheckSchema, type FormCheckInput } from '@/lib/validation/schemas'
import type { UserRole } from '@/types'

export interface FormCheckTabProps {
  targetId: string | undefined
  currentUserId: string | undefined
  userRole: UserRole | null | undefined
  selectedClientIds: string[]
}

export default function FormCheckTab({
  targetId,
  currentUserId,
  userRole,
  selectedClientIds,
}: FormCheckTabProps): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useFormChecks(targetId)
  const submitFormCheck = useSubmitFormCheck()

  const formChecks = data ?? []

  const [compareMode, setCompareMode] = useState(false)
  // Kıyaslama seçimleri türetilmiş değer; state yalnızca kullanıcının manuel seçimini (override) tutar.
  const [beforeOverride, setBeforeOverride] = useState<string | null>(null)
  const [afterOverride, setAfterOverride] = useState<string | null>(null)

  const [poseFile, setPoseFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // Dosya input'u ref ile değil, key değiştirilip yeniden mount edilerek sıfırlanır (refs kuralı).
  const [fileInputKey, setFileInputKey] = useState(0)

  // Hedef öğrenci değişince manuel seçimler sıfırlanır (effect yerine render sırası prev-value kalıbı).
  const [prevTargetId, setPrevTargetId] = useState(targetId)
  if (targetId !== prevTargetId) {
    setPrevTargetId(targetId)
    setBeforeOverride(null)
    setAfterOverride(null)
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormCheckInput>({ resolver: zodResolver(formCheckSchema) })

  // Kıyaslama varsayılanları veriden türetilir: en eski = "öncesi", en yeni = "sonrası"; 2'den az kayıtta boş.
  const defaultBeforeId =
    formChecks.length >= 2 ? (formChecks[formChecks.length - 1]?.id ?? '') : ''
  const defaultAfterId = formChecks.length >= 2 ? (formChecks[0]?.id ?? '') : ''
  const beforeImageId = beforeOverride ?? defaultBeforeId
  const afterImageId = afterOverride ?? defaultAfterId

  // A-20/A-07: dosya seçildiği anda (submit beklenmeden) boyut/tip/magic-byte doğrulanır.
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setPoseFile(null)
      return
    }

    void validateImageFile(file).then((result) => {
      if (!result.ok) {
        toast.error(result.message)
        setFileError(result.message)
        setPoseFile(null)
        // key artınca input yeniden mount olur; reddedilen seçim temizlenir.
        setFileInputKey((k) => k + 1)
        return
      }
      setPoseFile(file)
      setFileError(null)
    })
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!currentUserId) {
      toast.error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      return
    }
    if (!poseFile) {
      setFileError('Lütfen bir podyum fotoğrafı seçin.')
      return
    }

    // Başarı/hata toast'ı hook içinde gösterilir.
    await submitFormCheck.mutateAsync({
      clientId: currentUserId,
      currentWeight: values.weight,
      frontFile: poseFile,
      notes: 'Yeni form',
    })

    reset()
    setPoseFile(null)
    setFileError(null)
    // key artınca input yeniden mount olur; seçili dosya value='' ile aynı şekilde temizlenir.
    setFileInputKey((k) => k + 1)
  })

  const isUploading = isSubmitting || submitFormCheck.isPending

  const beforeCheck = formChecks.find((c) => c.id === beforeImageId)
  const afterCheck = formChecks.find((c) => c.id === afterImageId)

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex items-center justify-between border-b pb-3 dark:border-zinc-800">
        <h4 className="text-lg font-bold text-gray-800 dark:text-zinc-200">
          Form Geçmişi ve Kıyaslama
        </h4>
        {formChecks.length >= 2 && (
          <button
            type="button"
            onClick={() => setCompareMode(!compareMode)}
            aria-pressed={compareMode}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
              compareMode ? 'bg-red-500 text-white' : 'bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            {compareMode ? 'Kıyaslamayı Kapat' : 'Öncesi / Sonrası Yap'}
          </button>
        )}
      </div>

      {userRole === 'client' && !compareMode && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 border-b pb-6 dark:border-zinc-800"
        >
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="w-full md:w-1/2">
              <label
                htmlFor="formcheck-weight"
                className="mb-1 block text-xs font-bold text-gray-500"
              >
                GÜNCEL KİLO (KG)
              </label>
              <input
                id="formcheck-weight"
                type="number"
                step="0.1"
                {...register('weight')}
                aria-invalid={errors.weight ? 'true' : 'false'}
                aria-describedby={errors.weight ? 'formcheck-weight-error' : undefined}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
              />
              {errors.weight ? (
                <p
                  id="formcheck-weight-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.weight.message}
                </p>
              ) : null}
            </div>
            <div className="w-full md:w-1/2">
              <label
                htmlFor="formcheck-pose"
                className="mb-1 block text-xs font-bold text-gray-500"
              >
                PODYUM FOTOĞRAFI
              </label>
              <input
                id="formcheck-pose"
                key={fileInputKey}
                type="file"
                accept={ALLOWED_IMAGE_MIME.join(',')}
                onChange={handleFileChange}
                aria-invalid={fileError ? 'true' : 'false'}
                aria-describedby={fileError ? 'formcheck-pose-error' : undefined}
                className="w-full cursor-pointer text-xs text-gray-500 transition-all file:mr-4 file:rounded-xl file:border-0 file:bg-accent/10 file:px-4 file:py-2.5 file:font-bold file:text-accent hover:file:bg-accent/20"
              />
              {fileError ? (
                <p
                  id="formcheck-pose-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {fileError}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            disabled={isUploading}
            aria-busy={isUploading}
            className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isUploading ? 'Yükleniyor...' : 'Formu Antrenörüme Gönder'}
          </button>
        </form>
      )}

      {userRole === 'coach' && selectedClientIds.length > 1 ? (
        <p className="py-10 text-center text-sm font-bold text-accent">
          Sadece 1 öğrenci seçili bırakın.
        </p>
      ) : (
        <QueryState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={formChecks.length === 0}
          skeleton={<SkeletonCard />}
          emptyMessage="Kayıt bulunamadı."
          onRetry={() => void refetch()}
        >
          {compareMode ? (
            <div className="flex flex-col gap-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 dark:border-zinc-800 dark:bg-zinc-950 md:flex-row">
              <div className="flex-1 space-y-3">
                <span className="block border-b pb-2 text-center text-sm font-black uppercase">
                  Öncesi
                </span>
                <label htmlFor="formcheck-before" className="sr-only">
                  Öncesi kaydını seç
                </label>
                <select
                  id="formcheck-before"
                  value={beforeImageId}
                  onChange={(e) => setBeforeOverride(e.target.value)}
                  className="w-full rounded-lg border p-2 text-xs font-bold outline-none"
                >
                  {formChecks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDateTR(c.created_at)} - {c.current_weight} kg
                    </option>
                  ))}
                </select>
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-4 border-gray-200 shadow-lg dark:border-zinc-800">
                  {beforeCheck?.frontPoseSignedUrl ? (
                    <img
                      src={beforeCheck.frontPoseSignedUrl}
                      alt={`Öncesi: ${formatDateTR(beforeCheck.created_at)}, ${beforeCheck.current_weight} kg`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <EmptyState icon="🖼️" title="Bu kayıt için fotoğraf bulunamadı." />
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-3">
                <span className="block border-b pb-2 text-center text-sm font-black uppercase text-accent">
                  Sonrası
                </span>
                <label htmlFor="formcheck-after" className="sr-only">
                  Sonrası kaydını seç
                </label>
                <select
                  id="formcheck-after"
                  value={afterImageId}
                  onChange={(e) => setAfterOverride(e.target.value)}
                  className="w-full rounded-lg border p-2 text-xs font-bold outline-none"
                >
                  {formChecks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatDateTR(c.created_at)} - {c.current_weight} kg
                    </option>
                  ))}
                </select>
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-4 border-accent shadow-lg">
                  {afterCheck?.frontPoseSignedUrl ? (
                    <img
                      src={afterCheck.frontPoseSignedUrl}
                      alt={`Sonrası: ${formatDateTR(afterCheck.created_at)}, ${afterCheck.current_weight} kg`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <EmptyState icon="🖼️" title="Bu kayıt için fotoğraf bulunamadı." />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {formChecks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-center gap-4 rounded-2xl border bg-gray-50 p-4 shadow-sm transition-transform hover:scale-[1.02] dark:bg-zinc-950"
                >
                  {check.frontPoseSignedUrl ? (
                    <img
                      src={check.frontPoseSignedUrl}
                      alt={`${formatDateTR(check.created_at)} tarihli form fotoğrafı`}
                      loading="lazy"
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-20 w-20 items-center justify-center rounded-xl bg-gray-200 text-2xl dark:bg-zinc-800"
                    >
                      🖼️
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="text-lg font-black text-accent">{check.current_weight} kg</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatDateTimeTR(check.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryState>
      )}
    </div>
  )
}
