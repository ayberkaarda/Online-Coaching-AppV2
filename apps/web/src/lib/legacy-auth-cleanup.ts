// B-045 — A-05/A-14 (ADR-0022) turunda oturum deposu `localStorage`'dan cookie'ye taşındı
// (bkz. `src/lib/supabase/client.ts`), ama daha önce giriş yapmış tarayıcılarda eski
// `sb-<proje-ref>-auth-token` `localStorage` anahtarları (ve büyük oturumların `.0`/`.1`
// parçaları) hiç temizlenmiyordu. Bu anahtarlar artık HİÇBİR yerde okunmuyor ama içlerinde
// JWT + refresh token duruyor — kalıcı bir sızma yüzeyi (kaynak:
// `docs/archive/progress-a05-a14-cookie-nonce-csp.md` "Doğan borçlar"). Bu modül tek seferlik,
// istemci tarafı bir temizlik sağlar.

import { logger } from '@repo/logger'

/**
 * `@supabase/ssr`/`supabase-js`'in varsayılan (elle ad verilmemiş) depolama anahtar biçimi:
 * `sb-<proje-ref>-auth-token`, büyük oturumlar `.0`, `.1`, ... gibi sayısal soneklerle
 * parçalanabilir (bkz. `src/lib/supabase/client.ts` üstündeki yorum — cookie adı da AYNI
 * biçimi kullanıyor).
 *
 * Desen BİLEREK dar tutuldu: yalnızca `sb-` ile başlayıp `-auth-token` ile biten (isteğe
 * bağlı `.<sayı>` sonekli) anahtarlar eşleşir. `-auth-token` son eki ZORUNLU olduğu için
 * `sb-` önekiyle başlayan ama farklı bir amaca hizmet eden olası bir anahtar (bu kod
 * tabanında şu an yok) yanlışlıkla silinmez — yalnızca eski Supabase oturum token'ları
 * hedeflenir.
 */
const LEGACY_SUPABASE_AUTH_TOKEN_KEY_PATTERN = /^sb-.+-auth-token(\.\d+)?$/

/**
 * Eski (cookie geçişi öncesi) Supabase oturum anahtarlarını `localStorage`'dan siler ve
 * silinen anahtar sayısını döner.
 *
 * - SSR güvenli: `window` yoksa hiç dokunmadan `0` döner.
 * - `localStorage` erişimi try/catch içindedir — gizli sekme / kapatılmış depolama gibi
 *   durumlarda `SecurityError` fırlatabilir; bu durumda sessizce `0` döner, uygulamayı
 *   kırmaz.
 * - Anahtarlar ÖNCE toplanır, SONRA silinir — iterasyon sırasında koleksiyonu değiştirip
 *   `localStorage.key(i)` indekslerini kaydırma hatasına düşülmez.
 */
export function clearLegacySupabaseAuthStorage(): number {
  if (typeof window === 'undefined') return 0

  try {
    const { localStorage } = window
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && LEGACY_SUPABASE_AUTH_TOKEN_KEY_PATTERN.test(key)) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }

    if (keysToRemove.length > 0) {
      logger.info(
        { count: keysToRemove.length },
        'B-045: eski Supabase auth-token localStorage anahtarları temizlendi'
      )
    }

    return keysToRemove.length
  } catch {
    // Gizli sekme / kapalı depolama gibi durumlarda localStorage erişimi SecurityError
    // fırlatabilir — sessizce vazgeç, uygulamayı kırma.
    return 0
  }
}
