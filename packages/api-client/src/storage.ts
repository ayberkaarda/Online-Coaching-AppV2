// Supabase Storage yardımcıları — imzalı (signed) adres üretimi.
//
// NEDEN: `avatars` ve `form-checks-media` bucket'ları PRIVATE'tır
// (bkz. supabase/migrations/20260817100000_private_storage.sql). Public okuma
// yolu (`/storage/v1/object/public/...`) kapalıdır; veritabanı kolonları tam URL
// değil YOL saklar (`front_pose_path`, `back_pose_path`, `avatar_path`).
// Görseller okunurken bu yollardan süreli imzalı adres üretilir.
//
// HATA POLİTİKASI: Bu modül ASLA fırlatmaz. Silinmiş/eksik bir dosya ya da yetki
// hatası yüzünden liste sorgusu patlamamalı; `null` dönülür ve çağıran taraf
// placeholder gösterir.
//
// SUPABASE İSTEMCİSİ (ADR-0024 Ek-1): aşağıdaki üç fonksiyon React HOOK'U DEĞİLDİR, bu yüzden
// `useSupabaseClient()` çağıramazlar (hook kuralları izin vermez). İstemci AÇIK İLK PARAMETRE
// olarak geçer; çağıran dört hook (`useFormChecks`, `useMessages`, `useProfile`,
// `useProgressPhotos`) onu context'ten alıp iletir. Modül seviyesi bir setter BİLEREK
// reddedildi — ADR'nin kaçındığı singleton desenini birebir yeniden üretirdi.

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@repo/logger'
import type { Database } from '@repo/types'

export const AVATAR_BUCKET = 'avatars'
export const FORM_CHECK_BUCKET = 'form-checks-media'
/** Sohbet eki (mesaj başına opsiyonel foto) — bkz. 20260817190200_message_attachments.sql. */
export const MESSAGE_ATTACHMENT_BUCKET = 'message-attachments'

/**
 * İmzalı adreslerin geçerlilik süresi (saniye).
 * Plan I-4: TTL ≤ 1 saat. Adres tarayıcı geçmişine/loglara sızarsa etki penceresi
 * bu süreyle sınırlıdır. TanStack Query `staleTime` değerleri bundan KISA
 * tutulmalıdır ki önbellekteki adres süresi dolmadan tazelensin.
 */
export const SIGNED_URL_TTL_SECONDS = 3600

/**
 * İmzalı adres içeren sorgular için `staleTime` (ms) — TTL'in YARISI.
 * Önbellekteki kayıt, içindeki adresin süresi dolmadan çok önce bayatlar; böylece
 * bir sonraki kullanımda taze imza üretilir ve kullanıcı 400/expired görsel görmez.
 */
export const SIGNED_URL_STALE_TIME_MS = (SIGNED_URL_TTL_SECONDS / 2) * 1000

/** Boş/anlamsız yolları (null, '', yalnızca boşluk) eler. */
function normalizePath(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null
  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Bir değerin gerçekten bucket-içi bir YOL olup olmadığını doğrular.
 *
 * NEDEN: `20260817100000_private_storage.sql` mevcut satırlardaki tam public URL'leri
 * yola çevirdi ama storage dışı mutlak URL'leri (ör. eski `placehold.co` kayıtları)
 * bilerek dönüştürmedi (bkz. docs/PROGRESS.md §5 "Yetim storage dosyaları
 * temizlenmiyor"). Böyle bir değeri `storage.remove()`'a vermek anlamsız/tehlikelidir
 * (yol gibi görünen bir harici URL asla bucket'ta bulunmaz, ama yine de temizlik
 * mantığı yalnızca gerçek yollarla çalışmalı).
 */
function isStoragePath(path: string): boolean {
  return !/^https?:\/\//i.test(path)
}

/**
 * Nesnenin bucket içindeki yolundan indirme için önerilecek dosya adını üretir.
 * (`a/b/c-uuid.png` -> `c-uuid.png`). Saf fonksiyondur, boş sonuç `null` döner.
 */
export function attachmentFileNameFromPath(path: string | null | undefined): string | null {
  const normalized = normalizePath(path)
  if (!normalized) return null
  const last = normalized.split('/').pop()?.trim()
  return last && last.length > 0 ? last : null
}

/**
 * Tek bir yol için imzalı adres üretir.
 *
 * ###########################################################################
 * # B-008 — SATIR İÇİ (INLINE) GÖSTERİM YOLU. BİLEREK `download` YOK.       #
 * #                                                                         #
 * # Bu fonksiyonun ürettiği adres `<img src>` içinde kullanılır (avatar,     #
 * # form check pozları, ilerleme fotoğrafları, sohbet eki). Storage bu       #
 * # adreste `Content-Disposition` GÖNDERMEZ, yani görsel sayfada çizilir.    #
 * # İNDİRME davranışı gereken yer için AYRI bir fonksiyon vardır:            #
 * # `createSignedDownloadUrl` (aşağıda). İkisinin ayrı olmasının sebebi      #
 * # B-008'in kapanış koşuluyla `<img>` gösteriminin ÇELİŞMESİDİR: aynı       #
 * # adrese `download` eklenirse tarayıcı için hâlâ görsel olabilir ama       #
 * # davranış tarayıcı/sürüm bağımlı hâle gelir; ölçülebilir tek tasarım      #
 * # "hangi adres nereye gidiyor"un AÇIKÇA ayrılmasıdır.                      #
 * ###########################################################################
 *
 * @returns İmzalı adres, ya da yol boşsa / dosya yoksa / yetki yoksa `null`.
 */
export async function createSignedUrl(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string | null | undefined
): Promise<string | null> {
  const normalized = normalizePath(path)
  if (!normalized) return null

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      logger.warn({ bucket, path: normalized, err: error?.message }, 'İmzalı adres üretilemedi')
      return null
    }

    return data.signedUrl
  } catch (err) {
    logger.warn(
      { bucket, path: normalized, err: err instanceof Error ? err.message : String(err) },
      'İmzalı adres üretimi beklenmedik şekilde başarısız oldu'
    )
    return null
  }
}

/**
 * B-008 — İNDİRME adresi: imzalı adrese `download` seçeneği eklenir.
 *
 * ###########################################################################
 * # API GERÇEĞİ (UYDURULMADI, İKİ KAYNAKTAN DOĞRULANDI)                     #
 * #                                                                         #
 * # 1) Tip tanımı — @supabase/storage-js@2.112.3                            #
 * #    `createSignedUrl(path, expiresIn, options?: {                        #
 * #        download?: string | boolean; transform?: …; cacheNonce?: … })`   #
 * #    Uygulaması (`src/packages/StorageFileApi.ts`):                        #
 * #      if (options?.download)                                             #
 * #        query.set('download', options.download === true ? '' : …)        #
 * #    Yani `download: true` -> `?download=`, `download: 'ad.png'` ->       #
 * #    `?download=ad.png`. DİKKAT: değer FALSY olursa parametre HİÇ         #
 * #    EKLENMEZ (`download: ''` sessizce inline'a düşer) — bu yüzden        #
 * #    aşağıda dosya adı boşsa `true`'ya düşülür, boş string'e DEĞİL.        #
 * #                                                                         #
 * # 2) Canlı ölçüm (yerel storage-api v1.69.0, aynı imzalı adres):          #
 * #      GET …/object/sign/<b>/<p>?token=…            -> (disposition YOK)  #
 * #      GET …/object/sign/<b>/<p>?token=…&download=  -> content-disposition:#
 * #                                                      attachment;        #
 * #    B-008'in "inline servis ediliyor" iddiası da bu ölçümle doğrulandı.  #
 * ###########################################################################
 *
 * Dosya adı verilirse `Content-Disposition: attachment; filename=…` olur; verilmezse
 * yalnızca `attachment` gelir ve tarayıcı adı adresten türetir.
 */
export async function createSignedDownloadUrl(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string | null | undefined,
  fileName?: string | null
): Promise<string | null> {
  const normalized = normalizePath(path)
  if (!normalized) return null

  // Boş/whitespace ad `download: ''` üretip parametreyi SESSİZCE düşürürdü (yukarıdaki
  // falsy tuzağı) -> indirme yerine inline'a dönerdi. Bu yüzden `true`'ya düşülür.
  const suggested =
    typeof fileName === 'string' && fileName.trim().length > 0 ? fileName.trim() : null

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS, { download: suggested ?? true })

    if (error || !data?.signedUrl) {
      logger.warn(
        { bucket, path: normalized, err: error?.message },
        'İmzalı indirme adresi üretilemedi'
      )
      return null
    }

    return data.signedUrl
  } catch (err) {
    logger.warn(
      { bucket, path: normalized, err: err instanceof Error ? err.message : String(err) },
      'İmzalı indirme adresi üretimi beklenmedik şekilde başarısız oldu'
    )
    return null
  }
}

/**
 * Bucket içindeki bir nesneyi siler (yetim dosya temizliği — ör. eski avatar).
 *
 * SÖZLEŞME: `createSignedUrl` ile aynı — ASLA fırlatmaz. Silme başarısız olursa
 * (ağ, izin, dosya zaten yok) `false` döner; çağıran taraf bunu kullanıcıya hata
 * olarak GÖSTERMEMELİ, yalnızca loglamalıdır — silme her zaman başarılı bir yazma
 * işleminden SONRA denenir, o yüzden başarısızlığı akışı bozmamalıdır.
 *
 * `path` null/boş ise veya gerçek bir bucket yolu değilse (storage dışı mutlak
 * URL — bkz. `isStoragePath`) hiç istek atılmaz, doğrudan `false` döner.
 *
 * @returns Silme başarılıysa `true`, aksi hâlde `false`.
 */
export async function removeStoredObject(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string | null | undefined
): Promise<boolean> {
  const normalized = normalizePath(path)
  if (!normalized || !isStoragePath(normalized)) return false

  try {
    const { error } = await client.storage.from(bucket).remove([normalized])

    if (error) {
      logger.warn({ bucket, path: normalized, err: error.message }, 'Depolanan nesne silinemedi')
      return false
    }

    return true
  } catch (err) {
    logger.warn(
      { bucket, path: normalized, err: err instanceof Error ? err.message : String(err) },
      'Depolanan nesne silimi beklenmedik şekilde başarısız oldu'
    )
    return false
  }
}

/**
 * Birden çok yol için TEK istekte imzalı adres üretir (supabase-js çoğul API'si).
 * Her fotoğraf için ayrı istek atılmaz — koç panelindeki liste sorguları N+1 olmaz.
 *
 * @returns yol -> imzalı adres eşlemesi. Üretilemeyen yollar haritada YER ALMAZ,
 *          böylece çağıran taraf `map.get(path) ?? null` ile placeholder'a düşer.
 */
export async function createSignedUrls(
  client: SupabaseClient<Database>,
  bucket: string,
  paths: readonly (string | null | undefined)[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // Boş/null yolları ele, tekrarları teke indir (aynı yol iki kez imzalanmasın).
  const unique = [...new Set(paths.map(normalizePath).filter((p): p is string => p !== null))]
  if (unique.length === 0) return result

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)

    if (error || !data) {
      logger.warn(
        { bucket, count: unique.length, err: error?.message },
        'Toplu imzalı adres üretimi başarısız'
      )
      return result
    }

    for (const item of data) {
      // Tek tek dosya hataları (ör. "Object not found") tüm listeyi düşürmez.
      if (item.error || !item.path || !item.signedUrl) {
        logger.warn({ bucket, path: item.path, err: item.error }, 'İmzalı adres üretilemedi')
        continue
      }
      result.set(item.path, item.signedUrl)
    }

    return result
  } catch (err) {
    logger.warn(
      { bucket, count: unique.length, err: err instanceof Error ? err.message : String(err) },
      'Toplu imzalı adres üretimi beklenmedik şekilde başarısız oldu'
    )
    return result
  }
}
