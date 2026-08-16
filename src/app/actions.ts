'use server'

// Server Actions: öğrenci oluşturma/silme, bildirim gönderme, form-check gönderme.
//
// NOT: Bu action'lar admin panelinden kullanılmak üzere hazırdır; mevcut bileşenler
// şu an doğrudan supabase-js kullanıyor olabilir. Yine de doğru ve tip güvenli hâldedir.
//
// YETKİLENDİRME: Server Action'lar tarayıcının Supabase oturum çerezine erişemez, bu yüzden
// her admin action'ının İLK argümanı `actorAccessToken`'dır. Çağıran taraf, mutasyonu
// tetiklemeden önce `supabase.auth.getSession()` ile oturumu okuyup `session.access_token`'ı
// geçmelidir. Bu token `createServerSupabaseClient(accessToken)` ile doğrulanır ve
// `profiles.role === 'admin'` kontrol edilir; aksi hâlde işlem reddedilir. FormData içine
// gizli bir "actor" alanı koymak güvenli DEĞİLDİR (istemci tarafından serbestçe değiştirilebilir),
// bu yüzden bu yöntem tercih edilmemiştir.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  createStudentSchema,
  formatZodError,
  formCheckSchema,
  notificationSchema,
} from '@/lib/validation/schemas'
import type { TablesInsert } from '@/types'

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

const GENERIC_ERROR = 'İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.'
const UNAUTHORIZED_ERROR = 'Bu işlem için yetkiniz yok.'
const INVALID_SESSION_ERROR = 'Oturumunuz geçersiz. Lütfen tekrar giriş yapın.'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function toFieldErrors(zodError: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of formatZodError(zodError)) {
    if (!(issue.path in fieldErrors)) fieldErrors[issue.path] = issue.message
  }
  return fieldErrors
}

type ActorResult = { ok: true; userId: string } | { ok: false; error: string }

/**
 * `actorAccessToken`'ı doğrular ve (istenirse) çağıranın admin olduğunu kontrol eder.
 * Doğrulama, çağıranın kendi RLS bağlamında çalışan bir istemci ile yapılır — böylece
 * kimliği başkasının token'ıyla taklit edilemez.
 */
async function verifyActor(accessToken: string, requireAdmin: boolean): Promise<ActorResult> {
  if (!accessToken) return { ok: false, error: UNAUTHORIZED_ERROR }

  const client = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await client.auth.getUser(accessToken)

  if (userError || !userData.user) {
    return { ok: false, error: INVALID_SESSION_ERROR }
  }

  if (!requireAdmin) return { ok: true, userId: userData.user.id }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    return { ok: false, error: UNAUTHORIZED_ERROR }
  }

  return { ok: true, userId: userData.user.id }
}

/** Supabase Auth'un bilinen hata mesajlarını kullanıcıya gösterilebilir Türkçe metne çevirir. */
function mapAuthCreateUserError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'Bu e-posta zaten kayıtlı.'
  }
  return GENERIC_ERROR
}

// ---------------------------------------------------------------------------
// 1. Öğrenci Oluşturma Eylemi (Admin Yetkili)
// ---------------------------------------------------------------------------

export async function createStudentAction(
  actorAccessToken: string,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const actor = await verifyActor(actorAccessToken, true)
  if (!actor.ok) return { success: false, error: actor.error }

  const parsed = createStudentSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Girdiğiniz bilgileri kontrol edin.',
      fieldErrors: toFieldErrors(parsed.error),
    }
  }

  const { email, password, fullName } = parsed.data
  const adminClient = getSupabaseAdmin()

  // NOT: `handle_new_user()` trigger'ı (on_auth_user_created) auth.users'a INSERT
  // olur olmaz profiles satırını KENDİSİ oluşturur; role/full_name'i
  // raw_user_meta_data'dan okur. Bu yüzden aşağıda user_metadata gönderiyoruz ki
  // trigger doğru değerlerle profili oluştursun.
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'student' },
  })

  if (authError || !authData.user) {
    logger.error({ err: authError, email }, 'Öğrenci oluşturma: auth kullanıcısı oluşturulamadı')
    return { success: false, error: mapAuthCreateUserError(authError?.message ?? '') }
  }

  // Trigger profili çoktan oluşturmuş olabileceğinden `insert` yerine `upsert`
  // kullanılır (onConflict: 'id') — satır varsa doğru değerlerle güncellenir,
  // yoksa (trigger yoksa/başarısız olduysa) burada oluşturulur.
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert([{ id: authData.user.id, full_name: fullName, role: 'student', email }], {
      onConflict: 'id',
    })

  if (profileError) {
    logger.error(
      { err: profileError, userId: authData.user.id },
      'Öğrenci oluşturma: profil kaydı oluşturulamadı'
    )
    // Auth kaydı yetim kalmasın diye geri al.
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: GENERIC_ERROR }
  }

  revalidatePath('/')
  revalidatePath('/users')
  return { success: true, data: { id: authData.user.id } }
}

// ---------------------------------------------------------------------------
// 2. Öğrenci Silme Eylemi (Admin Yetkili)
// ---------------------------------------------------------------------------

export async function deleteStudentAction(
  actorAccessToken: string,
  studentId: string
): Promise<ActionResult> {
  const actor = await verifyActor(actorAccessToken, true)
  if (!actor.ok) return { success: false, error: actor.error }

  const parsedId = z.string().uuid({ message: 'Geçersiz kullanıcı kimliği.' }).safeParse(studentId)
  if (!parsedId.success) {
    return { success: false, error: parsedId.error.issues[0]?.message ?? GENERIC_ERROR }
  }

  const adminClient = getSupabaseAdmin()
  const { error } = await adminClient.auth.admin.deleteUser(parsedId.data)

  if (error) {
    logger.error({ err: error, studentId }, 'Öğrenci silme başarısız')
    return { success: false, error: GENERIC_ERROR }
  }

  revalidatePath('/')
  revalidatePath('/users')
  return { success: true }
}

// ---------------------------------------------------------------------------
// 3. Bildirim Gönderme Eylemi (Admin Yetkili)
// ---------------------------------------------------------------------------

export async function sendNotificationAction(
  actorAccessToken: string,
  formData: FormData
): Promise<ActionResult<{ count: number }>> {
  const actor = await verifyActor(actorAccessToken, true)
  if (!actor.ok) return { success: false, error: actor.error }

  const parsed = notificationSchema.safeParse({
    target: formData.get('target'),
    title: formData.get('title'),
    message: formData.get('message'),
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Girdiğiniz bilgileri kontrol edin.',
      fieldErrors: toFieldErrors(parsed.error),
    }
  }

  const { target, title, message } = parsed.data
  const adminClient = getSupabaseAdmin()

  let studentIds: string[]

  if (target === 'all') {
    const { data: students, error: studentsError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('role', 'student')

    if (studentsError) {
      logger.error({ err: studentsError }, 'Bildirim gönderme: öğrenci listesi alınamadı')
      return { success: false, error: GENERIC_ERROR }
    }

    studentIds = (students ?? []).map((s) => s.id)
  } else {
    studentIds = [target]
  }

  if (studentIds.length === 0) {
    return { success: false, error: 'Gönderilecek alıcı bulunamadı.' }
  }

  // KRİTİK HATA DÜZELTMESİ: eski kod var olmayan `target_student_id` sütununa yazıyordu;
  // bildirimler bu yüzden hiç görünmüyordu. Doğru sütun `student_id`.
  const rows: TablesInsert<'notifications'>[] = studentIds.map((studentId) => ({
    student_id: studentId,
    title,
    message,
  }))

  const { error } = await adminClient.from('notifications').insert(rows)

  if (error) {
    logger.error({ err: error, count: rows.length }, 'Bildirim gönderme başarısız')
    return { success: false, error: GENERIC_ERROR }
  }

  revalidatePath('/')
  return { success: true, data: { count: rows.length } }
}

// ---------------------------------------------------------------------------
// 4. Form Check Gönderme Eylemi (Öğrenci Yetkili)
// ---------------------------------------------------------------------------

const submitFormCheckInputSchema = formCheckSchema.extend({
  student_id: z.string().uuid({ message: 'Geçersiz öğrenci kimliği.' }),
  front_pose_url: z.string().url({ message: 'Geçersiz görsel adresi.' }).optional(),
  back_pose_url: z.string().url({ message: 'Geçersiz görsel adresi.' }).optional(),
})

export interface SubmitFormCheckActionInput {
  studentId: string
  weight: number | string
  notes?: string
  frontPoseUrl?: string
  backPoseUrl?: string
}

export async function submitFormCheckAction(
  actorAccessToken: string,
  input: SubmitFormCheckActionInput
): Promise<ActionResult> {
  const actor = await verifyActor(actorAccessToken, false)
  if (!actor.ok) return { success: false, error: actor.error }

  if (actor.userId !== input.studentId) {
    return { success: false, error: UNAUTHORIZED_ERROR }
  }

  const parsed = submitFormCheckInputSchema.safeParse({
    student_id: input.studentId,
    weight: input.weight,
    notes: input.notes,
    front_pose_url: input.frontPoseUrl,
    back_pose_url: input.backPoseUrl,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Girdiğiniz bilgileri kontrol edin.',
      fieldErrors: toFieldErrors(parsed.error),
    }
  }

  const { student_id, weight, notes, front_pose_url, back_pose_url } = parsed.data

  // Servis rolü YERİNE çağıranın kendi access token'ıyla (RLS altında) çalışan istemci
  // kullanılır — savunma katmanı olarak ikinci bir güvence: öğrenci kendi kaydı dışına
  // yazmak istese bile hem yukarıdaki kontrol hem de RLS politikaları engeller.
  const client = createServerSupabaseClient(actorAccessToken)
  const { error } = await client.from('form_checks').insert([
    {
      student_id,
      current_weight: weight,
      front_pose_url: front_pose_url ?? null,
      back_pose_url: back_pose_url ?? null,
      notes: notes ?? null,
    },
  ])

  if (error) {
    logger.error({ err: error, studentId: student_id }, 'Form check gönderme başarısız')
    return { success: false, error: GENERIC_ERROR }
  }

  revalidatePath('/')
  return { success: true }
}
