'use client'

// Profil okuma/güncelleme ve avatar yükleme hook'ları.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import type { Profile, TablesUpdate } from '@/types'

const AVATAR_BUCKET = 'avatars'

/** Tek bir kullanıcının profili. */
export function useProfile(userId?: string) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId ?? '')
        .single()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** Tüm profiller (koç paneli için), en yeniden eskiye. */
export function useProfiles() {
  return useQuery({
    queryKey: queryKeys.profiles(),
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface UpdateProfileInput {
  id: string
  values: TablesUpdate<'profiles'>
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: UpdateProfileInput): Promise<Profile> => {
      const { data, error } = await supabase
        .from('profiles')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile(profile.id), profile)
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profile })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profiles })
      toast.success('Profil güncellendi.')
    },
    onError: (error: Error) => {
      toast.error(`Profil güncellenemedi: ${error.message}`)
    },
  })
}

export interface UploadAvatarInput {
  userId: string
  file: File
}

/**
 * Avatarı `avatars` bucket'ının köküne `<uid>-<uuid>.<ext>` adıyla yükler
 * (storage RLS politikaları bu ön eke bakar) ve profili günceller.
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

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
      if (updateError) throw new Error(updateError.message)

      return publicUrl
    },
    onSuccess: (_publicUrl, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.profiles })
      toast.success('Profil fotoğrafı güncellendi.')
    },
    onError: (error: Error) => {
      toast.error(`Fotoğraf yüklenemedi: ${error.message}`)
    },
  })
}
