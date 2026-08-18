'use client'

// Açı etiketli ilerleme fotoğrafları (Faz 4d, active_planprogram.md §6).
//
// MAHREMİYET: `progress-photos` bucket'ı PRIVATE'tır
// (bkz. supabase/migrations/20260817220000_progress_tracking.sql). Veritabanı
// kolonu (`photo_path`) tam URL değil YOL saklar; okuma anında süreli imzalı
// adres üretilir (bkz. src/lib/storage.ts) — `getPublicUrl` KULLANILMAZ.
//
// YOL SÖZLEŞMESİ (migration §3, `progress_photos_path_chk`): tam olarak
// `<client_id>/<uuid>.<ext>` — tek seviye klasör = sahip. Bu şart şemada
// CHECK ile de zorlanır; yanlış kurulmuş bir yol INSERT'te `23514` ile
// reddedilir (bkz. bu dosyanın testleri, tests/unit/progress-photos.test.tsx).
//
// KOÇ SALT OKUR: RLS INSERT/UPDATE/DELETE'i yalnızca `client_id = auth.uid()`e
// açar (migration §5). `useUploadProgressPhoto`/`useDeleteProgressPhoto`
// koç tarafından çağrılırsa Postgres `42501` ile reddeder — istemci tarafı
// `readOnly` bayrağı (bkz. src/components/progress/ProgressPhotos.tsx) bu
// gerçeğin YALNIZCA kozmetik yansımasıdır, tek savunma katmanı DEĞİLDİR.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { SIGNED_URL_STALE_TIME_MS, createSignedUrls, removeStoredObject } from '@/lib/storage'
import { supabase } from '@/lib/supabase/client'
import { assertValidImageFile } from '@/lib/upload-validation'
import type { Enums, Tables } from '@/types'

export const PROGRESS_PHOTOS_BUCKET = 'progress-photos'

export type ProgressPhotoAngle = Enums<'progress_photo_angle'>

/** ENUM'un TS union'ından türetilmiş sabit liste — açı seçicisi bunu döngüler. */
export const PROGRESS_PHOTO_ANGLES: readonly ProgressPhotoAngle[] = ['front', 'side', 'back']

/** Açı -> Türkçe etiket. `Record<ProgressPhotoAngle, string>` olduğu için yeni bir
 * enum değeri eklenirse TypeScript burada eksik anahtarı DERLEME ZAMANINDA yakalar. */
export const PROGRESS_PHOTO_ANGLE_LABELS: Record<ProgressPhotoAngle, string> = {
  front: 'Ön',
  side: 'Yan',
  back: 'Arka',
}

export type ProgressPhotoRow = Tables<'progress_photos'>

/** `progress_photos` satırı + `photo_path` için üretilmiş imzalı adres. */
export interface ProgressPhotoWithUrl extends ProgressPhotoRow {
  /** İmzalı adres; dosya yoksa/erişilemiyorsa `null`. */
  signedUrl: string | null
}

/**
 * Bir danışanın TÜM ilerleme fotoğrafları, EN YENİDEN eskiye
 * (`taken_on desc, created_at desc`). Sıralama bilinçlidir: `taken_on`da
 * TEKİLLİK yoktur (aynı gün yeniden çekim meşrudur, bkz. migration yorumu);
 * `created_at desc` ikincil anahtarı aynı gün/açı için EN YENİ satırın listenin
 * başında (dolayısıyla açı bazlı gruplamada İLK eleman) olmasını garanti eder.
 */
export function useProgressPhotos(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.progressPhotos(clientId),
    enabled: Boolean(clientId),
    // İmzalı adresler TTL'lidir; kayıt, adres süresi dolmadan (TTL/2) bayatlar.
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<ProgressPhotoWithUrl[]> => {
      const { data, error } = await supabase
        .from('progress_photos')
        .select('*')
        .eq('client_id', clientId ?? '')
        .order('taken_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'progress_photos', op: 'select' })

      // Tüm yollar TEK istekte imzalanır (fotoğraf başına ayrı istek yok — N+1 önlenir).
      const signed = await createSignedUrls(
        PROGRESS_PHOTOS_BUCKET,
        data.map((row) => row.photo_path)
      )

      return data.map((row) => ({ ...row, signedUrl: signed.get(row.photo_path) ?? null }))
    },
  })
}

export interface UploadProgressPhotoInput {
  clientId: string
  angle: ProgressPhotoAngle
  file: File
  /**
   * Çekim günü (`YYYY-MM-DD`) — kullanıcının YEREL günü (`todayIsoDate()`,
   * src/lib/date.ts).
   *
   * ZORUNLU (opsiyonel DEĞİL): opsiyonelken çağıran göndermediğinde satır
   * veritabanının `default current_date` (UTC) değerini alıyordu. Galeri,
   * karşılaştırma seçicileri ve `taken_on desc` sıralaması bu tarihi
   * kullanıcının günü sanarak gösterir; UTC+3'te gece 00:00–03:00 arasında
   * yüklenen fotoğraf "dün" etiketiyle görünür ve önce/sonra sıralamasını
   * bozardı. Kullanıcıya tarih SEÇTİRMEK ayrı bir özelliktir — bu alan şu an
   * her zaman "bugün"le doldurulur.
   */
  takenOn: string
}

export function useUploadProgressPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      angle,
      file,
      takenOn,
    }: UploadProgressPhotoInput): Promise<ProgressPhotoRow> => {
      // Uzantı dosya adından DEĞİL, magic-byte ile tespit edilen gerçek içerikten
      // türetilir (A-21) — bkz. src/lib/upload-validation.ts.
      const { mime, extension } = await assertValidImageFile(file)

      // YOL SÖZLEŞMESİ (progress_photos_path_chk ile BİREBİR): <client_id>/<uuid>.<ext>.
      // Klasör satırın client_id'sinden BAŞKA bir şey OLAMAZ — aksi hâlde INSERT
      // `23514` ile reddedilir (şema kendi kendini korur, ama yine de burada
      // doğru kurulmalı ki hata hiç oluşmasın).
      const path = `${clientId}/${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(PROGRESS_PHOTOS_BUCKET)
        .upload(path, file, { contentType: mime })
      if (uploadError) throw new Error(uploadError.message)

      const { data, error } = await supabase
        .from('progress_photos')
        .insert({
          client_id: clientId,
          angle,
          photo_path: path,
          // DAİMA gönderilir — DB varsayılanına (UTC `current_date`) ASLA düşülmez.
          taken_on: takenOn,
        })
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'progress_photos', op: 'insert' })

      return data
    },
    onSuccess: (_data, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.progressPhotos(clientId) })
      toast.success('Fotoğraf yüklendi.')
    },
    onError: (error: Error) => {
      toast.error(`Fotoğraf yüklenemedi: ${error.message}`)
    },
  })
}

export interface DeleteProgressPhotoInput {
  photoId: string
  clientId: string
  photoPath: string
}

/**
 * Satırı siler, ardından bucket nesnesini best-effort temizler.
 *
 * SIRA: önce tablo satırı, sonra dosya — `useUploadAvatar`'daki "sıra kritiktir"
 * dersinin tersi ama aynı gerekçeyle: satır silme başarısız olursa dosya HİÇ
 * silinmeye çalışılmaz (henüz bir satır tarafından işaret ediliyor olabilir);
 * satır silindikten sonra dosya silme başarısız olursa (ağ/izin) akış yine de
 * BAŞARILI sayılır — `removeStoredObject` asla fırlatmaz, yalnızca loglar.
 */
export function useDeleteProgressPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ photoId, photoPath }: DeleteProgressPhotoInput): Promise<void> => {
      const { error } = await supabase.from('progress_photos').delete().eq('id', photoId)
      if (error) throw wrapSupabaseError(error, { table: 'progress_photos', op: 'delete' })

      await removeStoredObject(PROGRESS_PHOTOS_BUCKET, photoPath)
    },
    onSuccess: (_void, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.progressPhotos(clientId) })
      toast.success('Fotoğraf silindi.')
    },
    onError: (error: Error) => {
      toast.error(`Fotoğraf silinemedi: ${error.message}`)
    },
  })
}
