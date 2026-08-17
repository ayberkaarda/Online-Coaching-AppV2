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

import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase/client'

export const AVATAR_BUCKET = 'avatars'
export const FORM_CHECK_BUCKET = 'form-checks-media'

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
 * Tek bir yol için imzalı adres üretir.
 * @returns İmzalı adres, ya da yol boşsa / dosya yoksa / yetki yoksa `null`.
 */
export async function createSignedUrl(
  bucket: string,
  path: string | null | undefined
): Promise<string | null> {
  const normalized = normalizePath(path)
  if (!normalized) return null

  try {
    const { data, error } = await supabase.storage
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
  bucket: string,
  path: string | null | undefined
): Promise<boolean> {
  const normalized = normalizePath(path)
  if (!normalized || !isStoragePath(normalized)) return false

  try {
    const { error } = await supabase.storage.from(bucket).remove([normalized])

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
  bucket: string,
  paths: readonly (string | null | undefined)[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // Boş/null yolları ele, tekrarları teke indir (aynı yol iki kez imzalanmasın).
  const unique = [...new Set(paths.map(normalizePath).filter((p): p is string => p !== null))]
  if (unique.length === 0) return result

  try {
    const { data, error } = await supabase.storage
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
