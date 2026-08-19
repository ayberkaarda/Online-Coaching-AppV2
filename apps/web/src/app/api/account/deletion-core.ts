// Hesap silme akışının SAF (I/O'suz) çekirdeği — doğrulama şeması, onay cümlesi ve
// veritabanı manifestosunun ayrıştırılması.
//
// NEDEN AYRI DOSYA: `route.ts` içinde `server-only` modüller (env.server, supabase/server)
// import ediliyor ve dosya bir Next.js route handler'ı olarak değerlendiriliyor. Buradaki
// mantık ise TAMAMEN saf: birim testi (`tests/unit/account-deletion.test.ts`) bunu hiçbir
// sunucu bağlamı kurmadan doğrudan çağırabilsin diye ayrıldı. Aynı desen
// `src/lib/api/auth-rate-limit.ts` ile `src/app/api/auth/sign-in/route.ts` arasında da var.

import { z } from 'zod'

/**
 * Kullanıcının HARFİ HARFİNE yazması gereken onay cümlesi (ikinci onay adımı).
 *
 * ###########################################################################
 * # TÜRKÇE İ/ı TUZAĞI — BU DEĞER ÜZERİNDE ASLA `toUpperCase()`/`toLowerCase()`
 * # ÇAĞRILMAZ.                                                              #
 * #                                                                         #
 * # Cümle noktalı büyük İ (U+0130) içerir. JS'in `toUpperCase()`i `i` -> `I` #
 * # (noktasız) üretir, `toLowerCase()` ise `İ` -> `i̇` (i + birleşen nokta,   #
 * # İKİ kod noktası) üretir. Yani herhangi bir "normalize edelim" adımı,     #
 * # kullanıcının EKRANDA GÖRDÜĞÜ metni yazmasına rağmen reddedilmesine yol   #
 * # açardı. Repoda bu tuzak daha önce E2E seçicilerinde (tests/e2e/          #
 * # fixtures.ts) ve hız sınırı anahtarında (`normalizeEmail`) iki kez ısırdı.#
 * #                                                                         #
 * # ÇÖZÜM: yalnızca `trim()`, sonra BAYT BAYT eşitlik. Kullanıcı arayüzde    #
 * # gösterilen metni kopyalayabilir ya da birebir yazabilir; başka hiçbir    #
 * # dönüşüm yapılmaz. Bu, geri dönüşü olmayan bir işlem için doğru katılık   #
 * # seviyesidir: "yaklaşık doğru" bir onay, onay değildir.                   #
 * ###########################################################################
 *
 * Aynı sabit istemcide de kullanılır (`profile/page.tsx`); tek kaynak burasıdır ve
 * `@repo/api-client`'taki `useDeleteAccount` üzerinden yeniden dışa aktarılmaz —
 * sunucu ve istemci AYNI dosyadan okumak zorunda olmadığı için (ikisi de sabiti kendi
 * tarafında tutar) değeri değiştiren kişi İKİ yeri de değiştirmelidir; bunu unutmamak
 * için birim testi iki değerin eşitliğini ölçer.
 */
export const DELETE_CONFIRMATION_PHRASE = 'HESABIMI SİL'

/**
 * İstek gövdesi.
 *
 * `confirmation` dışında HİÇBİR ALAN YOKTUR — özellikle `userId` YOKTUR. Silinecek
 * kullanıcı yalnızca ve yalnızca doğrulanmış Bearer token'dan türetilir (plan §5.3:
 * "kullanıcı kimliği server'da JWT'den alınır, client'tan user_id kabul etme"). Gövdede
 * bir uid kabul etmek, tek satırlık bir yetki kontrolü hatasının TÜM hesapları silinebilir
 * hâle getirmesi demek olurdu.
 */
export const deleteAccountBodySchema = z.object({
  confirmation: z
    .string({ required_error: 'Onay metni zorunludur.' })
    // `.trim()` doğrulamadan ÖNCE: kopyala-yapıştırın getirdiği baştaki/sondaki boşluk
    // meşru bir onayı reddetmemeli. Ortadaki boşluklara DOKUNULMAZ (cümlede tek boşluk var).
    .trim()
    .refine((value) => value === DELETE_CONFIRMATION_PHRASE, {
      message: `Onay metni birebir "${DELETE_CONFIRMATION_PHRASE}" olmalıdır.`,
    }),
})

export type DeleteAccountBody = z.infer<typeof deleteAccountBodySchema>

/**
 * `public.account_deletion_manifest()`in döndürdüğü jsonb'nin istemci tarafındaki karşılığı.
 * `Json` tipi (üretilmiş `database.ts`) yapısız olduğu için burada TİPLENİR ve
 * `parseManifest` ile ÇALIŞMA ZAMANINDA doğrulanır — RPC'nin şekli değişirse sessizce
 * yanlış davranmak yerine gürültü çıkar.
 */
export interface DeletionManifest {
  userExists: boolean
  /** bucket adı -> silinecek nesne yolları */
  storage: Record<string, string[]>
  storageTotal: number
  rowTotal: number
}

/**
 * RPC çıktısını doğrular ve normalize eder. Beklenmeyen bir şekilde `null` döner —
 * çağıran bunu 500'e çevirir. FIRLATMAZ: route handler'da tek bir hata yolu olsun diye.
 */
export function parseManifest(raw: unknown): DeletionManifest | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  if (typeof value.user_exists !== 'boolean') return null
  if (typeof value.row_total !== 'number') return null
  if (typeof value.storage_total !== 'number') return null

  const storage: Record<string, string[]> = {}
  const rawStorage = value.storage
  if (typeof rawStorage === 'object' && rawStorage !== null) {
    for (const [bucket, names] of Object.entries(rawStorage as Record<string, unknown>)) {
      // Yalnızca string dizileri kabul edilir. Bozuk bir giriş SESSİZCE atlanmaz:
      // tüm manifest geçersiz sayılır, çünkü "bir bucket'ı atlayarak silmek" en kötü
      // sonuçtur (yetim dosya kalır ve kimse fark etmez).
      if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) return null
      if (names.length > 0) storage[bucket] = names as string[]
    }
  }

  return {
    userExists: value.user_exists,
    storage,
    storageTotal: value.storage_total,
    rowTotal: value.row_total,
  }
}

/**
 * `public.delete_account()` çıktısı.
 */
export interface DeletionResult {
  alreadyDeleted: boolean
  rowTotal: number
  storageObjectsDeleted: number
}

export function parseDeletionResult(raw: unknown): DeletionResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  if (typeof value.already_deleted !== 'boolean') return null
  if (typeof value.row_total !== 'number') return null
  if (typeof value.storage_objects_deleted !== 'number') return null

  return {
    alreadyDeleted: value.already_deleted,
    rowTotal: value.row_total,
    storageObjectsDeleted: value.storage_objects_deleted,
  }
}

/**
 * Storage temizliği için kaç TUR denenir.
 *
 * NEDEN 1'DEN FAZLA: manifest okunduktan sonra, `delete_account()` çağrılmadan önce yeni
 * bir nesne yüklenmiş olabilir (kullanıcı başka bir sekmede fotoğraf yüklüyorsa). O durumda
 * `delete_account()` fail-closed davranıp reddeder (bkz. migration §3c) ve hiçbir şey
 * silinmez. İkinci tur o nesneyi de yakalar.
 *
 * NEDEN SONSUZ DEĞİL: yükleme yapmaya devam eden bir istemci akışı süresiz kilitleyebilirdi.
 * 3 tur sonunda hâlâ nesne kalıyorsa istek anlaşılır bir hatayla reddedilir; kullanıcı
 * yüklemeyi bitirip tekrar dener. Yarım silme HİÇBİR turda oluşmaz.
 */
export const MAX_STORAGE_PASSES = 3
