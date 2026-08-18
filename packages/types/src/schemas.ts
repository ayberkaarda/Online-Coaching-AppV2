// Tüm form ve API girdileri için zod şemaları. Hata mesajları TÜRKÇE'dir.
// Aynı şemalar hem react-hook-form resolver'ında hem route handler'larda kullanılır.

import { z } from 'zod'

import { DAY_NAMES } from './domain'

// ---------------------------------------------------------------------------
// Ortak parçalar
// ---------------------------------------------------------------------------

const emailField = z
  .string({ required_error: 'E-posta zorunludur.' })
  .min(1, { message: 'E-posta zorunludur.' })
  .email({ message: 'Geçerli bir e-posta adresi girin.' })

const uuidField = z.string().uuid({ message: 'Geçersiz kayıt kimliği.' })

const goalEnum = z.enum(['cut', 'bulk', 'maintain'], {
  errorMap: () => ({ message: 'Hedef "cut", "bulk" veya "maintain" olmalıdır.' }),
})

const genderEnum = z.enum(['male', 'female'], {
  errorMap: () => ({ message: 'Cinsiyet "male" veya "female" olmalıdır.' }),
})

const splitTypeEnum = z.enum(['ppl_torso_limbs', 'ppl', 'upper_lower', 'torso_limbs'], {
  errorMap: () => ({ message: 'Geçersiz antrenman şablonu seçildi.' }),
})

const dayEnum = z.enum(DAY_NAMES, {
  errorMap: () => ({ message: 'Geçerli bir gün seçin.' }),
})

const macroSampleSchema = z.object({
  protein: z.coerce.number().min(0, { message: 'Protein 0’dan küçük olamaz.' }),
  carb: z.coerce.number().min(0, { message: 'Karbonhidrat 0’dan küçük olamaz.' }),
  fat: z.coerce.number().min(0, { message: 'Yağ 0’dan küçük olamaz.' }),
})

// ---------------------------------------------------------------------------
// Kimlik doğrulama
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: 'Şifre zorunludur.' })
    .min(6, { message: 'Şifre en az 6 karakter olmalıdır.' }),
})
export type LoginInput = z.infer<typeof loginSchema>

export const passwordChangeSchema = z.object({
  password: z
    .string({ required_error: 'Şifre zorunludur.' })
    .min(8, { message: 'Şifre en az 8 karakter olmalıdır.' })
    .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, { message: 'Şifre en az bir harf içermelidir.' })
    .regex(/[0-9]/, { message: 'Şifre en az bir rakam içermelidir.' }),
})
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>

export const createClientSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: 'Şifre zorunludur.' })
    .min(8, { message: 'Şifre en az 8 karakter olmalıdır.' }),
  fullName: z
    .string({ required_error: 'Ad soyad zorunludur.' })
    .trim()
    .min(2, { message: 'Ad soyad en az 2 karakter olmalıdır.' })
    .max(80, { message: 'Ad soyad en fazla 80 karakter olabilir.' }),
})
export type CreateClientInput = z.infer<typeof createClientSchema>

// ---------------------------------------------------------------------------
// Günlük takip
// ---------------------------------------------------------------------------

export const dailyLogSchema = z.object({
  water_lt: z.coerce
    .number({ invalid_type_error: 'Su miktarı sayı olmalıdır.' })
    .min(0, { message: 'Su miktarı 0’dan küçük olamaz.' })
    .max(20, { message: 'Su miktarı en fazla 20 litre olabilir.' }),
  sodium_mg: z.coerce
    .number({ invalid_type_error: 'Sodyum miktarı sayı olmalıdır.' })
    .int({ message: 'Sodyum miktarı tam sayı olmalıdır.' })
    .min(0, { message: 'Sodyum miktarı 0’dan küçük olamaz.' })
    .max(50_000, { message: 'Sodyum miktarı en fazla 50000 mg olabilir.' }),
  protein: z.coerce
    .number({ invalid_type_error: 'Protein sayı olmalıdır.' })
    .min(0, { message: 'Protein 0’dan küçük olamaz.' })
    .max(2000, { message: 'Protein en fazla 2000 g olabilir.' }),
  carb: z.coerce
    .number({ invalid_type_error: 'Karbonhidrat sayı olmalıdır.' })
    .min(0, { message: 'Karbonhidrat 0’dan küçük olamaz.' })
    .max(2000, { message: 'Karbonhidrat en fazla 2000 g olabilir.' }),
  fat: z.coerce
    .number({ invalid_type_error: 'Yağ sayı olmalıdır.' })
    .min(0, { message: 'Yağ 0’dan küçük olamaz.' })
    .max(2000, { message: 'Yağ en fazla 2000 g olabilir.' }),
})
export type DailyLogInput = z.infer<typeof dailyLogSchema>

export const formCheckSchema = z.object({
  weight: z.coerce
    .number({ invalid_type_error: 'Kilo sayı olmalıdır.' })
    .min(20, { message: 'Kilo en az 20 kg olabilir.' })
    .max(400, { message: 'Kilo en fazla 400 kg olabilir.' }),
  notes: z.string().max(500, { message: 'Not en fazla 500 karakter olabilir.' }).optional(),
})
export type FormCheckInput = z.infer<typeof formCheckSchema>

export const workoutLogSchema = z.object({
  exercise_name: z
    .string({ required_error: 'Hareket adı zorunludur.' })
    .trim()
    .min(1, { message: 'Hareket adı zorunludur.' })
    .max(120, { message: 'Hareket adı en fazla 120 karakter olabilir.' }),
  weight_kg: z.coerce
    .number({ invalid_type_error: 'Ağırlık sayı olmalıdır.' })
    .min(0, { message: 'Ağırlık 0’dan küçük olamaz.' })
    .max(1000, { message: 'Ağırlık en fazla 1000 kg olabilir.' }),
  reps: z.coerce
    .number({ invalid_type_error: 'Tekrar sayısı sayı olmalıdır.' })
    .int({ message: 'Tekrar sayısı tam sayı olmalıdır.' })
    .min(1, { message: 'Tekrar sayısı en az 1 olmalıdır.' })
    .max(1000, { message: 'Tekrar sayısı en fazla 1000 olabilir.' }),
  rpe: z.coerce
    .number({ invalid_type_error: 'RPE sayı olmalıdır.' })
    .int({ message: 'RPE tam sayı olmalıdır.' })
    .min(1, { message: 'RPE en az 1 olmalıdır.' })
    .max(10, { message: 'RPE en fazla 10 olabilir.' })
    .optional(),
})
export type WorkoutLogInput = z.infer<typeof workoutLogSchema>

// ---------------------------------------------------------------------------
// Bildirim & plan
// ---------------------------------------------------------------------------

export const notificationSchema = z.object({
  target: z.union([z.literal('all'), uuidField], {
    errorMap: () => ({ message: 'Alıcı "all" veya geçerli bir kullanıcı olmalıdır.' }),
  }),
  title: z
    .string({ required_error: 'Başlık zorunludur.' })
    .trim()
    .min(1, { message: 'Başlık zorunludur.' })
    .max(120, { message: 'Başlık en fazla 120 karakter olabilir.' }),
  message: z
    .string({ required_error: 'Mesaj zorunludur.' })
    .trim()
    .min(1, { message: 'Mesaj zorunludur.' })
    .max(2000, { message: 'Mesaj en fazla 2000 karakter olabilir.' }),
})
export type NotificationInput = z.infer<typeof notificationSchema>

export const quickAddFoodSchema = z.object({
  day: dayEnum,
  foodName: z
    .string({ required_error: 'Besin adı zorunludur.' })
    .trim()
    .min(1, { message: 'Besin adı zorunludur.' })
    .max(120, { message: 'Besin adı en fazla 120 karakter olabilir.' }),
  grams: z.coerce
    .number({ invalid_type_error: 'Gramaj sayı olmalıdır.' })
    .min(1, { message: 'Gramaj en az 1 olmalıdır.' })
    .max(5000, { message: 'Gramaj en fazla 5000 olabilir.' }),
})
export type QuickAddFoodInput = z.infer<typeof quickAddFoodSchema>

// NOT (Faz 1b Adım 3b): `planUpdateSchema` / `PlanUpdateInput` KALDIRILDI.
// Şema, DEPRECATED `profiles.workout_plan` / `profiles.nutrition_plan` kolonlarına
// yazan profil güncellemesini doğruluyordu. Antrenman alanı Adım 2'de düşmüştü;
// beslenme cutover'ıyla (Adım 3b) geriye tüketicisi kalmadı. Planlar artık
// `save_workout_plan` / `save_nutrition_plan` RPC'leriyle yazılıyor ve doğrulama
// SQL tarafındadır (gün anahtarı CHECK'leri + RPC'nin hata yükseltmesi).

// ---------------------------------------------------------------------------
// AI backend girdileri (proxy route'larında kullanılır)
// ---------------------------------------------------------------------------

export const aiWorkoutSchema = z.object({
  split_type: splitTypeEnum,
  user_prompt: z
    .string()
    .max(2000, { message: 'Talimat en fazla 2000 karakter olabilir.' })
    .default(''),
  age: z.coerce
    .number({ invalid_type_error: 'Yaş sayı olmalıdır.' })
    .int({ message: 'Yaş tam sayı olmalıdır.' })
    .min(10, { message: 'Yaş en az 10 olmalıdır.' })
    .max(100, { message: 'Yaş en fazla 100 olabilir.' }),
  goal: goalEnum,
  weight: z.coerce
    .number({ invalid_type_error: 'Kilo sayı olmalıdır.' })
    .min(20, { message: 'Kilo en az 20 kg olmalıdır.' })
    .max(400, { message: 'Kilo en fazla 400 kg olabilir.' }),
})
export type AiWorkoutInput = z.infer<typeof aiWorkoutSchema>

export const aiDietSchema = z.object({
  age: z.coerce
    .number({ invalid_type_error: 'Yaş sayı olmalıdır.' })
    .min(10, { message: 'Yaş en az 10 olmalıdır.' })
    .max(100, { message: 'Yaş en fazla 100 olabilir.' }),
  height_cm: z.coerce
    .number({ invalid_type_error: 'Boy sayı olmalıdır.' })
    .min(80, { message: 'Boy en az 80 cm olmalıdır.' })
    .max(260, { message: 'Boy en fazla 260 cm olabilir.' }),
  weight_kg: z.coerce
    .number({ invalid_type_error: 'Kilo sayı olmalıdır.' })
    .min(20, { message: 'Kilo en az 20 kg olmalıdır.' })
    .max(400, { message: 'Kilo en fazla 400 kg olabilir.' }),
  gender: genderEnum,
  steps: z.coerce
    .number({ invalid_type_error: 'Adım sayısı sayı olmalıdır.' })
    .int({ message: 'Adım sayısı tam sayı olmalıdır.' })
    .min(0, { message: 'Adım sayısı 0’dan küçük olamaz.' })
    .max(100_000, { message: 'Adım sayısı en fazla 100000 olabilir.' }),
  goal: goalEnum,
  user_prompt: z
    .string()
    .max(2000, { message: 'Talimat en fazla 2000 karakter olabilir.' })
    .default(''),
})
export type AiDietInput = z.infer<typeof aiDietSchema>

export const recommendationSchema = z.object({
  // AI backend tel protokolü: alan adı ai_backend/app/schemas/recommendations.py ile eşleşmeli (bkz. Faz 1a rol yeniden adlandırması).
  client_id: uuidField.optional(),
  goal: goalEnum,
  recent_weights: z
    .array(z.coerce.number())
    .max(365, { message: 'En fazla 365 kilo kaydı gönderilebilir.' })
    .default([]),
  recent_macros: z
    .array(macroSampleSchema)
    .max(365, { message: 'En fazla 365 makro kaydı gönderilebilir.' })
    .default([]),
  adherence_days: z.coerce
    .number({ invalid_type_error: 'Uyum gün sayısı sayı olmalıdır.' })
    .int({ message: 'Uyum gün sayısı tam sayı olmalıdır.' })
    .min(0, { message: 'Uyum gün sayısı 0’dan küçük olamaz.' })
    .max(365, { message: 'Uyum gün sayısı en fazla 365 olabilir.' })
    .default(0),
})
export type RecommendationSchemaInput = z.infer<typeof recommendationSchema>

// ---------------------------------------------------------------------------
// Hata biçimlendirme
// ---------------------------------------------------------------------------

/** Zod hatasını `{ path, message }` listesine çevirir (API yanıtı / form gösterimi için). */
export function formatZodError(e: z.ZodError): { path: string; message: string }[] {
  return e.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}
