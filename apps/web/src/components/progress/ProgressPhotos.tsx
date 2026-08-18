'use client'

// Açı etiketli ilerleme fotoğrafları + önce/sonra karşılaştırma (Faz 4d,
// active_planprogram.md §6). Bileşen KENDİ VERİSİNİ KENDİ ÇEKER
// (`useProgressPhotos`); çağıran yalnızca `clientId` + `readOnly` geçer
// (bkz. dosya başı sözleşme notu, main thread'in belirlediği imza).
//
// KOÇ GÖRÜNÜMÜ SALT-OKUNUR (§6): `readOnly=true` iken yükleme/silme arayüzü
// HİÇ RENDER EDİLMEZ. Bu yalnızca kozmetik değildir — RLS de aynı sınırı
// çizer (koç için INSERT/UPDATE/DELETE `42501`, bkz. useProgressPhotos.ts
// dosya başı notu); UI, DB'nin zaten reddettiği bir işlemi hiç TEKLİF ETMEZ.
//
// MAHREMİYET: fotoğraflar PRIVATE bucket'tadır; `useProgressPhotos` her satır
// için süreli imzalı adres üretir. Adres `null` ise (dosya yok / erişim yok)
// kırık görsel yerine boş durum gösterilir.

import { ImageOff, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent, JSX } from 'react'
import { toast } from 'sonner'

import { EmptyState, QueryState, SkeletonCard } from '@/components/ui'
import {
  PROGRESS_PHOTO_ANGLES,
  PROGRESS_PHOTO_ANGLE_LABELS,
  useDeleteProgressPhoto,
  useProgressPhotos,
  useUploadProgressPhoto,
  type ProgressPhotoAngle,
  type ProgressPhotoWithUrl,
} from '@repo/api-client'
import { todayIsoDate } from '@repo/api-client/date'
import { ALLOWED_IMAGE_MIME, validateImageFile } from '@repo/api-client/upload-validation'
import { formatDateTR } from '@/lib/utils'

import { BeforeAfterSlider } from './BeforeAfterSlider'

export interface ProgressPhotosProps {
  clientId: string
  /** Koç görünümü: yükleme/silme sunulmaz, yalnızca görüntüleme ve karşılaştırma. */
  readOnly: boolean
}

/** Boş açı grupları için başlangıç haritası — `Record` olduğu için üçüncü bir
 * enum değeri eklenirse TypeScript burada eksik anahtarı derleme zamanında yakalar. */
function groupByAngle(
  photos: readonly ProgressPhotoWithUrl[]
): Record<ProgressPhotoAngle, ProgressPhotoWithUrl[]> {
  const groups: Record<ProgressPhotoAngle, ProgressPhotoWithUrl[]> = {
    front: [],
    side: [],
    back: [],
  }
  for (const photo of photos) {
    groups[photo.angle].push(photo)
  }
  return groups
}

function photoAlt(photo: ProgressPhotoWithUrl): string {
  return `${PROGRESS_PHOTO_ANGLE_LABELS[photo.angle]} açı, ${formatDateTR(photo.taken_on)}`
}

export function ProgressPhotos({ clientId, readOnly }: ProgressPhotosProps): JSX.Element {
  const { data, isLoading, isError, error, refetch } = useProgressPhotos(clientId)
  const uploadPhoto = useUploadProgressPhoto()
  const deletePhoto = useDeleteProgressPhoto()

  const photos = data ?? []
  const photosByAngle = groupByAngle(photos)

  // --- Yükleme formu (yalnızca !readOnly) -----------------------------------
  const [angle, setAngle] = useState<ProgressPhotoAngle>('front')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const selected = event.target.files?.[0] ?? null
    if (!selected) {
      setFile(null)
      return
    }

    // A-20/A-07: dosya seçildiği anda (submit beklenmeden) boyut/tip/magic-byte doğrulanır.
    void validateImageFile(selected).then((result) => {
      if (!result.ok) {
        toast.error(result.message)
        setFileError(result.message)
        setFile(null)
        setFileInputKey((k) => k + 1)
        return
      }
      setFile(selected)
      setFileError(null)
    })
  }

  const handleUpload = async (): Promise<void> => {
    if (!file) {
      setFileError('Lütfen bir fotoğraf seçin.')
      return
    }
    // `takenOn` AÇIKÇA gönderilir: kullanıcının YEREL günü. DB'nin UTC
    // `current_date` varsayılanına düşülseydi, UTC+3'te gece 00:00–03:00
    // arasında yüklenen fotoğraf "dün" etiketiyle listelenirdi
    // (bkz. `@repo/api-client/date`). Tarih SEÇTİRMEK ayrı bir özelliktir.
    await uploadPhoto.mutateAsync({ clientId, angle, file, takenOn: todayIsoDate() })
    setFile(null)
    setFileError(null)
    setFileInputKey((k) => k + 1)
  }

  // --- Önce/sonra karşılaştırma ----------------------------------------------
  const [compareAngle, setCompareAngle] = useState<ProgressPhotoAngle>('front')
  const [beforeOverride, setBeforeOverride] = useState<string | null>(null)
  const [afterOverride, setAfterOverride] = useState<string | null>(null)

  // Açı değişince manuel seçimler sıfırlanır (effect yerine render sırası
  // prev-value kalıbı — bkz. FormCheckTab.tsx'teki aynı desen).
  const [prevCompareAngle, setPrevCompareAngle] = useState(compareAngle)
  if (compareAngle !== prevCompareAngle) {
    setPrevCompareAngle(compareAngle)
    setBeforeOverride(null)
    setAfterOverride(null)
  }

  // Liste `useProgressPhotos` tarafından zaten `taken_on desc, created_at desc`
  // sıralanır: aynı gün/açı için birden fazla çekimde EN YENİ satır listenin
  // BAŞINDADIR (migration yorumu: "belirsizlikte en yeni satırı seçer").
  const compareList = photosByAngle[compareAngle]
  const canCompare = compareList.length >= 2
  const defaultBeforeId = canCompare ? (compareList[compareList.length - 1]?.id ?? null) : null
  const defaultAfterId = canCompare ? (compareList[0]?.id ?? null) : null
  const beforeId = beforeOverride ?? defaultBeforeId
  const afterId = afterOverride ?? defaultAfterId
  const beforePhoto = compareList.find((p) => p.id === beforeId)
  const afterPhoto = compareList.find((p) => p.id === afterId)

  const handleDelete = (photo: ProgressPhotoWithUrl): void => {
    deletePhoto.mutate({ photoId: photo.id, clientId, photoPath: photo.photo_path })
  }

  return (
    <div className="space-y-6">
      {!readOnly && (
        <div className="space-y-3 rounded-panel border border-border bg-surface p-4">
          <h4 className="text-sm font-bold text-fg">Yeni İlerleme Fotoğrafı</h4>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:w-1/3">
              <label
                htmlFor="progress-photo-angle"
                className="mb-1 block text-xs font-bold text-fg-muted"
              >
                AÇI
              </label>
              <select
                id="progress-photo-angle"
                value={angle}
                onChange={(event) => setAngle(event.target.value as ProgressPhotoAngle)}
                className="w-full rounded-control border border-border bg-canvas p-2.5 text-sm text-fg outline-none focus:border-accent"
              >
                {PROGRESS_PHOTO_ANGLES.map((value) => (
                  <option key={value} value={value}>
                    {PROGRESS_PHOTO_ANGLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label
                htmlFor="progress-photo-file"
                className="mb-1 block text-xs font-bold text-fg-muted"
              >
                FOTOĞRAF
              </label>
              <input
                id="progress-photo-file"
                key={fileInputKey}
                type="file"
                accept={ALLOWED_IMAGE_MIME.join(',')}
                capture="environment"
                onChange={handleFileChange}
                aria-invalid={fileError ? 'true' : 'false'}
                aria-describedby={fileError ? 'progress-photo-file-error' : undefined}
                className="w-full cursor-pointer text-xs text-fg-muted file:mr-3 file:rounded-control file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-accent"
              />
              {fileError ? (
                <p
                  id="progress-photo-file-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-danger"
                >
                  {fileError}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploadPhoto.isPending}
            aria-busy={uploadPhoto.isPending}
            className="inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-sm font-bold text-accent-fg disabled:opacity-50"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            {uploadPhoto.isPending ? 'Yükleniyor…' : 'Fotoğrafı Yükle'}
          </button>
        </div>
      )}

      <QueryState
        isLoading={isLoading}
        isError={isError}
        error={error}
        isEmpty={photos.length === 0}
        skeleton={<SkeletonCard />}
        emptyMessage="Henüz ilerleme fotoğrafı yok."
        onRetry={() => void refetch()}
      >
        <div className="space-y-6">
          {/* --- Önce/sonra karşılaştırma --- */}
          <div className="space-y-3 rounded-panel border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-fg">Öncesi / Sonrası</h4>
              <div>
                <label htmlFor="progress-photo-compare-angle" className="sr-only">
                  Karşılaştırma açısı
                </label>
                <select
                  id="progress-photo-compare-angle"
                  value={compareAngle}
                  onChange={(event) => setCompareAngle(event.target.value as ProgressPhotoAngle)}
                  className="rounded-control border border-border bg-canvas p-2 text-xs font-bold text-fg outline-none focus:border-accent"
                >
                  {PROGRESS_PHOTO_ANGLES.map((value) => (
                    <option key={value} value={value}>
                      {PROGRESS_PHOTO_ANGLE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {canCompare && beforePhoto && afterPhoto ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="progress-photo-before"
                      className="mb-1 block text-xs font-bold text-fg-muted"
                    >
                      ÖNCESİ
                    </label>
                    <select
                      id="progress-photo-before"
                      value={beforeId ?? ''}
                      onChange={(event) => setBeforeOverride(event.target.value)}
                      className="w-full rounded-control border border-border bg-canvas p-2 text-xs font-bold text-fg outline-none"
                    >
                      {compareList.map((photo) => (
                        <option key={photo.id} value={photo.id}>
                          {formatDateTR(photo.taken_on)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="progress-photo-after"
                      className="mb-1 block text-xs font-bold text-fg-muted"
                    >
                      SONRASI
                    </label>
                    <select
                      id="progress-photo-after"
                      value={afterId ?? ''}
                      onChange={(event) => setAfterOverride(event.target.value)}
                      className="w-full rounded-control border border-border bg-canvas p-2 text-xs font-bold text-fg outline-none"
                    >
                      {compareList.map((photo) => (
                        <option key={photo.id} value={photo.id}>
                          {formatDateTR(photo.taken_on)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {beforePhoto.signedUrl && afterPhoto.signedUrl ? (
                  <BeforeAfterSlider
                    beforeUrl={beforePhoto.signedUrl}
                    beforeAlt={`Öncesi: ${photoAlt(beforePhoto)}`}
                    afterUrl={afterPhoto.signedUrl}
                    afterAlt={`Sonrası: ${photoAlt(afterPhoto)}`}
                  />
                ) : (
                  <EmptyState
                    icon={<ImageOff aria-hidden="true" className="h-6 w-6" />}
                    title="Bu kayıtlar için fotoğraf yüklenemedi."
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">
                {PROGRESS_PHOTO_ANGLE_LABELS[compareAngle]} açısında karşılaştırma için en az 2
                fotoğraf gerekli.
              </p>
            )}
          </div>

          {/* --- Galeri (açıya göre gruplu) --- */}
          <div className="space-y-4">
            {PROGRESS_PHOTO_ANGLES.filter((value) => photosByAngle[value].length > 0).map(
              (value) => (
                <div key={value} className="space-y-2">
                  <h5 className="text-xs font-bold uppercase tracking-wide text-fg-muted">
                    {PROGRESS_PHOTO_ANGLE_LABELS[value]}
                  </h5>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {photosByAngle[value].map((photo) => (
                      <div
                        key={photo.id}
                        role="group"
                        aria-label={photoAlt(photo)}
                        className="relative aspect-[3/4] overflow-hidden rounded-card border border-border bg-canvas"
                      >
                        {photo.signedUrl ? (
                          <img
                            src={photo.signedUrl}
                            alt={photoAlt(photo)}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-full w-full items-center justify-center text-fg-muted"
                          >
                            <ImageOff className="h-6 w-6" />
                          </div>
                        )}
                        <span className="absolute bottom-0 left-0 right-0 bg-canvas/80 px-2 py-1 text-center text-[11px] font-bold text-fg">
                          {formatDateTR(photo.taken_on)}
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleDelete(photo)}
                            disabled={deletePhoto.isPending}
                            aria-label={`${photoAlt(photo)} fotoğrafını sil`}
                            className="absolute right-1 top-1 rounded-control bg-canvas/80 p-1.5 text-danger disabled:opacity-50"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </QueryState>
    </div>
  )
}

export default ProgressPhotos
