'use client'

// Form check (haftalık kilo + poz fotoğrafı) hook'ları.
// Fotoğraflar `form-checks-media` bucket'ında `poses/<uid>-<uuid>.<ext>` yoluna yüklenir;
// storage RLS politikaları tam olarak bu ön eki bekler.
//
// MAHREMİYET: Bucket PRIVATE'tır. Veritabanı kolonları (`front_pose_path`,
// `back_pose_path`) tam URL değil YOL saklar; okuma anında süreli imzalı adres
// üretilir (bkz. src/lib/storage.ts).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { logger } from '@/lib/logger'
import { queryKeyRoots, queryKeys } from '@/lib/query/keys'
import { FORM_CHECK_BUCKET, SIGNED_URL_STALE_TIME_MS, createSignedUrls } from '@/lib/storage'
import { supabase } from '@/lib/supabase/client'
import { assertValidImageFile } from '@/lib/upload-validation'
import type { FormCheck } from '@/types'

/**
 * Form check satırı + poz fotoğrafları için üretilmiş imzalı adresler.
 *
 * `FormCheck` = `Tables<'form_checks'>` olduğu için inceleme alanları
 * (`status`, `coach_feedback`, `reviewed_at`, `reviewed_by` — bkz.
 * 20260817150000_form_check_review.sql) bu tipe ŞEMADAN gelir ve aşağıdaki
 * `select('*')` sorgusuyla otomatik olarak dönüşe dahil olur. Faz 2'nin koç
 * geri bildirim akışı bunları burada hazır bulur.
 */
export interface FormCheckWithUrls extends FormCheck {
  /** `front_pose_path` için imzalı adres; dosya yoksa/erişilemiyorsa `null`. */
  frontPoseSignedUrl: string | null
  /** `back_pose_path` için imzalı adres; dosya yoksa/erişilemiyorsa `null`. */
  backPoseSignedUrl: string | null
}

export function useFormChecks(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.formChecks(clientId),
    enabled: Boolean(clientId),
    // İmzalı adresler TTL'lidir; kayıt, adres süresi dolmadan (TTL/2) bayatlar.
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<FormCheckWithUrls[]> => {
      const { data, error } = await supabase
        .from('form_checks')
        .select('*')
        .eq('client_id', clientId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      // Tüm yollar TEK istekte imzalanır (fotoğraf başına ayrı istek yok).
      const signed = await createSignedUrls(
        FORM_CHECK_BUCKET,
        data.flatMap((row) => [row.front_pose_path, row.back_pose_path])
      )

      return data.map((row) => ({
        ...row,
        frontPoseSignedUrl: row.front_pose_path ? (signed.get(row.front_pose_path) ?? null) : null,
        backPoseSignedUrl: row.back_pose_path ? (signed.get(row.back_pose_path) ?? null) : null,
      }))
    },
  })
}

export interface SubmitFormCheckInput {
  clientId: string
  currentWeight: number
  frontFile: File
  backFile?: File
  notes?: string
}

/** Pozu yükler ve bucket İÇİNDEKİ YOLU döner (tam URL değil — kolonlar yol saklar). */
async function uploadPose(clientId: string, file: File): Promise<string> {
  // Uzantı dosya adından DEĞİL, magic-byte ile tespit edilen gerçek içerikten türetilir (A-21).
  const { mime, extension } = await assertValidImageFile(file)
  const path = `poses/${clientId}-${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage
    .from(FORM_CHECK_BUCKET)
    .upload(path, file, { contentType: mime })
  if (error) throw new Error(error.message)

  return path
}

export function useSubmitFormCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      clientId,
      currentWeight,
      frontFile,
      backFile,
      notes,
    }: SubmitFormCheckInput): Promise<FormCheck> => {
      const frontPath = await uploadPose(clientId, frontFile)
      const backPath = backFile ? await uploadPose(clientId, backFile) : null

      // İNCELEME ALANLARI BİLEREK GÖNDERİLMEZ (status / coach_feedback /
      // reviewed_at / reviewed_by): `status` kolon varsayılanıyla 'pending'
      // olur, geri kalanı NULL kalır. Danışan bu alanları zaten yazamaz —
      // `form_checks_guard_review` trigger'ı 42501 ile reddeder.
      const { data, error } = await supabase
        .from('form_checks')
        .insert({
          client_id: clientId,
          current_weight: currentWeight,
          front_pose_path: frontPath,
          back_pose_path: backPath,
          notes: notes ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      // Seri (streak) güncellemesi kritik değildir: hata akışı bozmaz, sadece loglanır.
      const { error: rpcError } = await supabase.rpc('increment_streak', { user_id: clientId })
      if (rpcError) {
        logger.warn({ err: rpcError.message }, 'increment_streak RPC başarısız')
      }

      return data
    },
    onSuccess: (_formCheck, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.formChecks(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(clientId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.lastCheckins })
      toast.success('Formunuz koçunuza iletildi.')
    },
    onError: (error: Error) => {
      toast.error(`Form gönderilemedi: ${error.message}`)
    },
  })
}

/** Danışan id'si -> son form check tarihi (ISO). Koç panelinde takip için. */
export function useLastCheckins() {
  return useQuery({
    queryKey: queryKeys.lastCheckins(),
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('form_checks')
        .select('client_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      const lastByClient: Record<string, string> = {}
      for (const row of data) {
        // Sonuç azalan sırada geldiği için ilk görülen kayıt en yenisidir.
        if (!lastByClient[row.client_id]) {
          lastByClient[row.client_id] = row.created_at
        }
      }
      return lastByClient
    },
  })
}
