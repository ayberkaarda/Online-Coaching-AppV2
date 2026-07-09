'use server'

import { getSupabaseAdmin, supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// 1. Öğrenci Oluşturma Eylemi (Admin Yetkili)
export async function createStudentAction(formData) {
  const email = formData.get('email');
  const password = formData.get('password');
  const fullName = formData.get('fullName');

  const adminClient = getSupabaseAdmin();

  // Auth sistemine kullanıcı ekle
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return { success: false, error: authError.message };

  // Profil tablosuna kayıt at
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert([{ id: authData.user.id, full_name: fullName, role: 'student' }]);

  if (profileError) return { success: false, error: profileError.message };

  revalidatePath('/');
  return { success: true };
}

// 2. Öğrenci Silme Eylemi (Admin Yetkili)
export async function deleteStudentAction(studentId) {
  const adminClient = getSupabaseAdmin();

  const { error } = await adminClient.auth.admin.deleteUser(studentId);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}

// 3. Bildirim Gönderme Eylemi
export async function sendNotificationAction(formData) {
  const target = formData.get('target'); // 'all' veya spesifik student_id
  const title = formData.get('title');
  const message = formData.get('message');

  const insertData = {
    title,
    message,
    target_student_id: target === 'all' ? null : target
  };

  const { error } = await supabase.from('notifications').insert([insertData]);
  if (error) return { success: false, error: error.message };

  revalidatePath('/');
  return { success: true };
}

// 4. Form Check Gönderme Eylemi (Öğrenci Yetkili)
export async function submitFormCheckAction({ studentId, weight, notes, frontPoseUrl, backPoseUrl }) {
  const { error } = await supabase.from('form_checks').insert([
    {
      student_id: studentId,
      current_weight: parseFloat(weight),
      front_pose_url: frontPoseUrl,
      back_pose_url: backPoseUrl,
      notes: notes
    }
  ]);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true };
}