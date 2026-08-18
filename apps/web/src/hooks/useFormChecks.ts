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
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { FORM_CHECK_BUCKET, SIGNED_URL_STALE_TIME_MS, createSignedUrls } from '@/lib/storage'
import { supabase } from '@/lib/supabase/client'
import { assertValidImageFile } from '@/lib/upload-validation'
import type { FormCheck } from '@repo/types'

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

/**
 * Koç kuyruğu (`status = 'pending'`) için ayrı bir sorgu anahtarı.
 *
 * NOT (dosya sahipliği kısıtı): anahtarlar normalde YALNIZCA `src/lib/query/keys.ts`
 * içindeki merkezi fabrikadan üretilir (§3.4). Faz 2'nin dört paralel dilimi
 * `src/lib/**`'i PAYLAŞIYOR ve bu dilimin sahiplik listesi o dosyaya dokunmayı
 * yasaklıyor; bu yüzden anahtar burada, `queryKeyRoots.formChecks` ÖN EKİYLE
 * yerel olarak tanımlanır. Ön ek aynı kaldığı için `invalidateQueries({queryKey:
 * queryKeyRoots.formChecks})` bu kaydı da temizler. Faz 2 birleşiminde bu anahtar
 * `queryKeys.pendingFormChecks()` olarak merkezi fabrikaya taşınmalıdır.
 */
const PENDING_FORM_CHECKS_KEY = [...queryKeyRoots.formChecks, 'pending'] as const

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
      if (error) throw wrapSupabaseError(error, { table: 'form_checks', op: 'select' })

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
      if (error) throw wrapSupabaseError(error, { table: 'form_checks', op: 'insert' })

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

/**
 * Koç kuyruğu: TÜM danışanların `status = 'pending'` form check'leri, EN ESKİDEN
 * yeniye (FIFO — kuyrukta en uzun bekleyen ilk sırada). `form_checks_pending_queue_idx`
 * kısmi indeksi (bkz. 20260817150000_form_check_review.sql §7) tam olarak bu
 * sorguyu hedefler.
 *
 * `useFormChecks(clientId)`'ten AYRIDIR: o tek bir danışanın TÜM geçmişini
 * (durum farketmeksizin) döner; bu ise TÜM danışanların yalnızca bekleyenlerini.
 */
export function usePendingFormChecks() {
  return useQuery({
    queryKey: PENDING_FORM_CHECKS_KEY,
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: async (): Promise<FormCheckWithUrls[]> => {
      const { data, error } = await supabase
        .from('form_checks')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw wrapSupabaseError(error, { table: 'form_checks', op: 'select' })

      // Tüm yollar TEK istekte imzalanır (danışan başına ayrı istek yok — N+1 önlenir).
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

/**
 * Form check 'reviewed' olduğunda bildirim yayınlar. İKİ kanal denenir; hiçbiri
 * çağıranı BLOKE ETMEZ (asıl işlem — `status` güncellemesi — zaten tamamlanmıştır,
 * bkz. `useReviewFormCheck` altındaki "NEDEN BLOKE ETMİYOR" notu).
 *
 * 1) SİSTEM MESAJI (`messages`, `kind='system'`) — plan §4.3'ün istediği ASIL kanal.
 *    Artık `supabase.rpc('post_system_message', ...)` ile yazılır (bkz.
 *    `supabase/migrations/20260817200000_system_message_rpc.sql`,
 *    `supabase/README.md` §4h). Mesaj METNİ İSTEMCİDEN GÖNDERİLMEZ: RPC yalnızca
 *    olay türünü (`'form_check_reviewed'`) ve referansı (`formCheckId`) alır,
 *    metni `form_checks.coach_feedback`'ten SUNUCUDA üretir (AC-05 dersi — bkz.
 *    migration başlığı). `42501` artık BEKLENEN bir sonuç DEĞİLDİR (RPC koç için
 *    açıktır); bir hata alınırsa gerçek bir arızadır ve `logger.error` + görünür
 *    bir uyarı toast'ı ile yüzeye çıkarılır (aşağıya bakınız).
 * 2) BİLDİRİM (`notifications`) — bugün fiilen ÇALIŞAN yol; `CoachUserManagement.tsx`
 *    içindeki `sendCheckinReminder` ile AYNI, halihazırda doğrulanmış deseni kullanır.
 *    "Push Faz 7'de aktifleşecek, şimdi event yayınla" talimatının somut karşılığı
 *    budur: Faz 7'nin `device_push_tokens` + Edge Function'ı bu tabloyu okuyup push
 *    gönderecek şekilde tasarlandı (bkz. active_planprogram.md §10); bugün yalnızca
 *    satır yazılır, gerçek push dispatch'i bu görevin kapsamı DIŞINDADIR. Bu kanalın
 *    metni burada, istemcide üretilir — `notifications_guard_content()` koç yolunu
 *    (`is_coach()`) serbest bırakır (bkz. 20260817180000 §3), yani bu RPC'nin
 *    kapsamı DIŞINDADIR ve değişmedi.
 */
async function publishFormCheckReviewedEvent({
  formCheckId,
  clientId,
  feedback,
}: {
  formCheckId: string
  clientId: string
  feedback: string
}): Promise<void> {
  const trimmed = feedback.trim()
  const text =
    trimmed.length > 0
      ? `Koçunuz form check'inize geri bildirim yazdı: "${trimmed}"`
      : 'Koçunuz form check’inizi inceledi.'

  const { error: messageError } = await supabase.rpc('post_system_message', {
    p_client_id: clientId,
    p_event_type: 'form_check_reviewed',
    p_ref_id: formCheckId,
  })
  if (messageError) {
    // BEKLENMEYEN: RPC koç için açık, referans (formCheckId) az önce bu akışın
    // kendisi tarafından 'reviewed' yapıldı. Bir hata alınırsa gerçek bir arızadır
    // (bkz. useReviewFormCheck üzerindeki "NEDEN BLOKE ETMİYOR" notu — asıl işlem
    // zaten tamamlandığı için burada FIRLATILMAZ, ama artık SESSİZCE de yutulmaz).
    logger.error(
      { err: messageError.message, clientId, formCheckId },
      'Form check sistem mesajı (post_system_message RPC) yazılamadı'
    )
    toast.error('Danışana sistem mesajı gönderilemedi (geri bildirim yine de kaydedildi).')
  }

  const { error: notificationError } = await supabase.from('notifications').insert({
    client_id: clientId,
    title: 'Form Check İncelendi',
    message: text,
  })
  if (notificationError) {
    logger.warn({ err: notificationError.message, clientId }, 'Form check bildirimi yazılamadı')
  }
}

export interface ReviewFormCheckInput {
  formCheckId: string
  clientId: string
  coachFeedback: string
}

/**
 * Koç geri bildirimi: `form_checks` -> `status='reviewed'` + `coach_feedback`.
 * `reviewed_at` / `reviewed_by` İSTEMCİDEN GÖNDERİLMEZ — SUNUCUDA doldurulur
 * (`form_checks_guard_review` trigger'ı, bkz. 20260817150000_form_check_review.sql §6).
 *
 * NEDEN `publishFormCheckReviewedEvent` HATASI BU MUTASYONU BLOKE ETMEZ:
 * asıl işlem (`status='reviewed'` yazımı) yukarıdaki `update` ile ZATEN
 * TAMAMLANMIŞTIR ve geri alınmaz (tasarım gereği — form check inceleme kararı
 * sistem mesajından bağımsız bir gerçektir). Bildirim RPC'si (`post_system_message`)
 * BAŞARISIZ olursa mutasyonu `throw` ile reddetmek YANLIŞ bir sinyal verirdi:
 * `onError` "Geri bildirim gönderilemedi" derdi ama geri bildirim ZATEN
 * kaydedilmişti — koç muhtemelen TEKRAR denerdi (zararsız ama kafa karıştırıcı).
 * Bunun yerine hata `publishFormCheckReviewedEvent` içinde loglanır VE ayrı,
 * görünür bir `toast.error` ile bildirilir (artık 42501 BEKLENMEDİĞİ için
 * sessizce yutulmaz) — koç gerçek durumu (inceleme kaydedildi, bildirim
 * gitmedi) doğru öğrenir.
 */
export function useReviewFormCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      formCheckId,
      clientId,
      coachFeedback,
    }: ReviewFormCheckInput): Promise<FormCheck> => {
      const { data, error } = await supabase
        .from('form_checks')
        .update({ status: 'reviewed', coach_feedback: coachFeedback })
        .eq('id', formCheckId)
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'form_checks', op: 'update' })

      await publishFormCheckReviewedEvent({ formCheckId, clientId, feedback: coachFeedback })

      return data
    },
    onSuccess: (_data, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: PENDING_FORM_CHECKS_KEY })
      void queryClient.invalidateQueries({ queryKey: queryKeys.formChecks(clientId) })
      toast.success('Geri bildirim danışana iletildi.')
    },
    onError: (error: Error) => {
      toast.error(`Geri bildirim gönderilemedi: ${error.message}`)
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
      if (error) throw wrapSupabaseError(error, { table: 'form_checks', op: 'select' })

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
