'use client'

// Hesap yönetimi — KVKK / GDPR "unutulma hakkı" (borç B-042, AC-4.6.1 / AC-4.6.2).
//
// Sunucu ucu : `apps/web/src/app/api/account/delete/route.ts`
// Veritabanı : `supabase/migrations/20260819100000_account_deletion.sql`
// Karar kaydı: `docs/adr/0025-hesap-silme-ve-service-role-sunucu-yolu.md`
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN SUPABASE'E DOĞRUDAN GİTMİYOR
// ─────────────────────────────────────────────────────────────────────────────
// Paketteki diğer mutasyonların neredeyse hepsi `supabase.from(...)` / `supabase.rpc(...)`
// ile tarayıcıdan doğrudan gider. Hesap silme GİDEMEZ: `auth.users` satırını silmek
// `service_role` gerektirir ve o anahtar tarayıcıya ASLA verilemez. Bu yüzden hook
// `useSignIn` ile aynı deseni kullanır — kendi sunucumuzdaki bir uca `apiFetch` ile gider
// (ADR-0025 §Karar).

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { logger } from '@repo/logger'

import { ApiError, apiFetch } from '../api/client'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import { queryKeys } from '../query/keys'

/**
 * Kullanıcının HARFİ HARFİNE yazması gereken onay cümlesi.
 *
 * TÜRKÇE İ/ı TUZAĞI: cümle noktalı büyük İ (U+0130) içerir ve bu değer üzerinde
 * `toUpperCase()`/`toLowerCase()` ÇAĞRILMAZ — JS'in katlaması Türkçe İ/ı eşlemesini
 * bilmez ve kullanıcının ekranda gördüğü metni yazmasına rağmen reddedilmesine yol açar
 * (aynı tuzak `tests/e2e/fixtures.ts` ve `normalizeEmail`'de daha önce ısırdı).
 * Karşılaştırma yalnızca `trim()` sonrası BAYT BAYT eşitliktir.
 *
 * SUNUCU TARAFINDAKİ İKİZİ: `apps/web/src/app/api/account/deletion-core.ts`
 * (`DELETE_CONFIRMATION_PHRASE`). İki değerin eşit olduğu
 * `apps/web/tests/unit/account-deletion.test.ts` içinde ÖLÇÜLÜR — biri değişip diğeri
 * unutulursa test kırılır. Paket `apps/web`'ten import EDEMEZ (bağımlılık yönü tersine
 * dönerdi ve mobil de aynı paketi tüketiyor), bu yüzden sabit iki yerde durur.
 */
export const DELETE_ACCOUNT_CONFIRMATION = 'HESABIMI SİL'

export interface DeleteAccountInput {
  /** Kullanıcının yazdığı onay metni. Sunucu bunu TEKRAR doğrular. */
  confirmation: string
}

export interface DeleteAccountResult {
  ok: true
  /** Hesap bu çağrıdan ÖNCE zaten silinmişti (idempotanslık). */
  alreadyDeleted: boolean
  rowsDeleted: number
  storageObjectsDeleted: number
}

/**
 * Hesabı ve ilişkili TÜM verisini kalıcı olarak siler.
 *
 * ###########################################################################
 * # BAŞARIDAN SONRA OTURUM ARTIK YOKTUR                                     #
 * # Sunucu `auth.users` satırını sildiği an `auth.sessions` ve              #
 * # `auth.refresh_tokens` de CASCADE ile gider: token YENİLENEMEZ.          #
 * # Elimizdeki erişim JWT'si imzası bakımından süresi dolana kadar (yerel   #
 * # yapılandırmada 900 sn) hâlâ "geçerli" görünür, ama arkasında okunacak   #
 * # HİÇBİR satır kalmamıştır (ADR-0025 §Kalan risk).                        #
 * #                                                                         #
 * # Bu yüzden `onSuccess` üç şey yapar ve ÜÇÜ DE hata yutar:                #
 * #   1. `signOut()` — yerel depodaki cookie'yi temizler. Sunucu tarafı     #
 * #      çağrısı 401/403 dönebilir (kullanıcı artık yok); ÖNEMSİZDİR,       #
 * #      amaç yerel token'ı atmaktır.                                       #
 * #   2. `queryClient.clear()` — bellekteki tüm veri düşer. Paylaşılan bir  #
 * #      cihazda sonraki kullanıcıya sızıntı olmaz.                         #
 * #   3. Yönlendirme ÇAĞIRANA bırakılır (hook navigasyon bilmez; web        #
 * #      `router.replace('/login')`, mobil kendi yığınını sıfırlar).        #
 * ###########################################################################
 */
export function useDeleteAccount(): UseMutationResult<
  DeleteAccountResult,
  Error,
  DeleteAccountInput
> {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ confirmation }: DeleteAccountInput): Promise<DeleteAccountResult> => {
      // Oturum token'ı: sunucu ucu `Authorization: Bearer` bekler (cookie DEĞİL — CSRF
      // yüzeyi açmamak için; gerekçe route.ts §1'de). `useAi`'daki `getAuthHeaders` ile
      // aynı desen.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new ApiError(
          401,
          'NOT_AUTHENTICATED',
          'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'
        )
      }

      return apiFetch<DeleteAccountResult>('/api/account/delete', {
        method: 'POST',
        json: { confirmation },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    },

    onSuccess: async (result) => {
      try {
        await supabase.auth.signOut()
      } catch (error) {
        // Kullanıcı sunucuda ARTIK YOK; GoTrue çağrısının reddetmesi beklenen bir
        // durumdur ve akışı bozmamalıdır. Yerel token zaten `signOut` denemesiyle
        // temizlenir; temizlenemezse de arkasında okunacak veri kalmamıştır.
        logger.warn({ err: error }, 'Hesap silindikten sonra signOut reddedildi (beklenen)')
      }

      queryClient.setQueryData(queryKeys.session(), null)
      queryClient.clear()

      notify.success(
        result.alreadyDeleted
          ? 'Hesabınız zaten silinmişti.'
          : 'Hesabınız ve tüm verileriniz kalıcı olarak silindi.'
      )
    },

    onError: (error: Error) => {
      notify.error(`Hesap silinemedi: ${error.message}`)
    },
  })
}
