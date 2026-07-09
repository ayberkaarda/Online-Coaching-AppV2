import { createClient } from '@supabase/supabase-js';

// Fallback (|| '') ekliyoruz ki anahtarlar bulunamazsa sistem beyaz ekrana düşmesin!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Eğer anahtarlar yoksa konsola uyarı fırlat
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Kritik Hata: Supabase URL veya Anon Key bulunamadı! .env.local dosyanızı kontrol edin.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getSupabaseAdmin = () => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};