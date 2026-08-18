'use client'

// Profil okuma/güncelleme ve avatar yükleme hook'ları.
//
// MAHREMİYET: `avatars` bucket'ı PRIVATE'tır. `profiles.avatar_path` tam URL değil
// YOL saklar; okuma anında süreli imzalı adres üretilir (bkz. `@repo/api-client/storage`).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import {
  AVATAR_BUCKET,
  SIGNED_URL_STALE_TIME_MS,
  createSignedUrl,
  createSignedUrls,
  removeStoredObject,
} from '../storage'
import { useSupabaseClient } from '../context'
import { assertValidImageFile } from '../upload-validation'
import type { Profile } from '@repo/types'

/** Profil satırı + avatar için üretilmiş imzalı adres. */
export interface ProfileWithAvatar extends Profile {
  /** `avatar_path` için imzalı adres; avatar yoksa/erişilemiyorsa `null`. */
  avatarSignedUrl: string | null
}

/** Tek bir kullanıcının profili. */
export function useProfile(userId?: string) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.profile(userId),
    enabled: Boolean(userId),
    // İmzalı adres TTL'lidir; kayıt, adres süresi dolmadan (TTL/2) bayatlar.
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<ProfileWithAvatar> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId ?? '')
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'profiles', op: 'select' })

      return {
        ...data,
        avatarSignedUrl: await createSignedUrl(supabase, AVATAR_BUCKET, data.avatar_path),
      }
    },
  })
}

/** Tüm profiller (koç paneli için), en yeniden eskiye. */
export function useProfiles() {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.profiles(),
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<ProfileWithAvatar[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'profiles', op: 'select' })

      // Tüm avatarlar TEK istekte imzalanır (profil başına ayrı istek yok).
      const signed = await createSignedUrls(
        supabase,
        AVATAR_BUCKET,
        data.map((row) => row.avatar_path)
      )

      return data.map((row) => ({
        ...row,
        avatarSignedUrl: row.avatar_path ? (signed.get(row.avatar_path) ?? null) : null,
      }))
    },
  })
}

export interface UploadAvatarInput {
  userId: string
  file: File
}

/**
 * Avatarı `avatars` bucket'ının köküne `<uid>-<uuid>.<ext>` adıyla yükler
 * (storage RLS politikaları bu ön eke bakar) ve profildeki YOLU günceller.
 * Tam URL saklanmaz; görüntüleme anında imzalı adres üretilir.
 *
 * YETİM DOSYA TEMİZLİĞİ: eski avatar, yeni yol profile YAZILDIKTAN SONRA silinir
 * (bkz. `removeStoredObject`). SIRA KRİTİKTİR — asla yükleme/güncelleme öncesinde
 * veya arasında silinmez: `profiles.avatar_path` güncellemesi başarısız olursa
 * (adım 2) eski dosya adım 3'e hiç ulaşmaz, aksi hâlde kullanıcı hem eski hem yeni
 * avatarını kaybeder. Silme başarısız olursa (ağ/izin/dosya zaten yok) mutasyon
 * yine BAŞARILI sayılır — yükleme zaten tamamlanmıştır; hata kullanıcıya
 * gösterilmez, yalnızca `removeStoredObject` içinde loglanır.
 *
 * @returns Bucket içindeki yeni yol (dosya adı).
 */
export function useUploadAvatar() {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, file }: UploadAvatarInput): Promise<string> => {
      // Silme adayı: güncellemeden ÖNCEKİ yol. Bu değer yalnızca OKUNUR — hiçbir
      // silme işlemi burada tetiklenmez (bkz. fonksiyon üstü not, "SIRA KRİTİKTİR").
      const { data: existing, error: fetchError } = await supabase
        .from('profiles')
        .select('avatar_path')
        .eq('id', userId)
        .single()
      if (fetchError) throw wrapSupabaseError(fetchError, { table: 'profiles', op: 'select' })
      const previousPath = existing.avatar_path

      // Uzantı dosya adından DEĞİL, magic-byte ile tespit edilen gerçek içerikten türetilir (A-21).
      const { mime, extension } = await assertValidImageFile(file)
      const fileName = `${userId}-${crypto.randomUUID()}.${extension}`

      // (1) Yeni dosyayı yükle.
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false, contentType: mime })
      if (uploadError) throw new Error(uploadError.message)

      // (2) Profildeki yolu güncelle. Başarısız olursa aşağıdaki (3) HİÇ çalışmaz —
      // fırlatılan hata mutationFn'i burada keser.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: fileName })
        .eq('id', userId)
      if (updateError) throw wrapSupabaseError(updateError, { table: 'profiles', op: 'update' })

      // (3) ANCAK BUNDAN SONRA eski dosyayı sil. `removeStoredObject` NULL/boş
      // yolda ve storage dışı mutlak URL'lerde (ör. `placehold.co`) hiç istek
      // atmaz; kendi dosyasının üstüne yazma gibi bir edge-case'te de (aynı yol)
      // silme denenmez.
      if (previousPath && previousPath !== fileName) {
        await removeStoredObject(supabase, AVATAR_BUCKET, previousPath)
      }

      return fileName
    },
    onSuccess: (_avatarPath, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profiles })
      toast.success('Profil fotoğrafı güncellendi.')
    },
    onError: (error: Error) => {
      toast.error(`Fotoğraf yüklenemedi: ${error.message}`)
    },
  })
}
