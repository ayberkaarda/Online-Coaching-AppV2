'use client'

// Profil okuma/güncelleme ve avatar yükleme hook'ları.
//
// MAHREMİYET: `avatars` bucket'ı PRIVATE'tır. `profiles.avatar_path` tam URL değil
// YOL saklar; okuma anında süreli imzalı adres üretilir (bkz. src/lib/storage.ts).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import {
  AVATAR_BUCKET,
  SIGNED_URL_STALE_TIME_MS,
  createSignedUrl,
  createSignedUrls,
} from '@/lib/storage'
import { supabase } from '@/lib/supabase/client'
import type { Profile } from '@/types'

/** Profil satırı + avatar için üretilmiş imzalı adres. */
export interface ProfileWithAvatar extends Profile {
  /** `avatar_path` için imzalı adres; avatar yoksa/erişilemiyorsa `null`. */
  avatarSignedUrl: string | null
}

/** Tek bir kullanıcının profili. */
export function useProfile(userId?: string) {
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
      if (error) throw new Error(error.message)

      return { ...data, avatarSignedUrl: await createSignedUrl(AVATAR_BUCKET, data.avatar_path) }
    },
  })
}

/** Tüm profiller (koç paneli için), en yeniden eskiye. */
export function useProfiles() {
  return useQuery({
    queryKey: queryKeys.profiles(),
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<ProfileWithAvatar[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      // Tüm avatarlar TEK istekte imzalanır (profil başına ayrı istek yok).
      const signed = await createSignedUrls(
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
 * @returns Bucket içindeki yol (dosya adı).
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, file }: UploadAvatarInput): Promise<string> => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${userId}-${crypto.randomUUID()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(fileName, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw new Error(uploadError.message)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_path: fileName })
        .eq('id', userId)
      if (updateError) throw new Error(updateError.message)

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
