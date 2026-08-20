// Künye (doğum tarihi + boy) — form sözleşmesi ve yaş türetimi.
//
// ###########################################################################
// # NEDEN "YAŞ" DEĞİL "DOĞUM TARİHİ" SAKLANIYOR                             #
// ###########################################################################
// `profiles` tablosunda `age` diye bir kolon YOKTUR ve olmayacaktır: yaş
// TÜRETİLMİŞ veridir ve yazıldığı günden itibaren her yıl sessizce yanlışlaşır
// (kullanıcı doğum gününde geri gelip düzeltmez). Doğum tarihi ise sabittir.
// Yaş bu dosyadaki `calculateAge()` ile GÖRÜNTÜLEME/HESAP anında üretilir —
// veritabanında iki kez temsil edilmez. Gerekçenin tamamı:
// `supabase/migrations/20260820170000_profile_body_metrics.sql` dosya başı.
//
// ###########################################################################
// # ÜÇ KATMANIN BİRBİRİYLE UYUŞMASI BU DOSYADA GÖRÜNÜR                      #
// ###########################################################################
// Aynı iki alan üç ayrı yerde sınırlanıyor ve üçü de FARKLI bir işi yapıyor:
//
//   1) SQL CHECK  (`profiles_birth_date_chk` / `profiles_height_cm_chk`)
//      -> FİZİKSEL OLARAK İMKÂNSIZ olanı reddeder (1900 öncesi, gelecek,
//         100-250 cm dışı, 1'den fazla ondalık). Değişmesi migration ister.
//   2) BU DOSYADAKİ ZOD ŞEMASI
//      -> ÜRÜN kuralını uygular ve kullanıcıya TÜRKÇE hata mesajı verir.
//         Şu an ürün kuralı = DB kuralı; ayrıştıkları gün (ör. "en az 13 yaş")
//         ayrım BURADA yaşar, şemada değil.
//   3) `aiWorkoutSchema` / `aiDietSchema` (`@repo/types/schemas`)
//      -> ai_backend'in TEL PROTOKOLÜ (yaş 10-100). Künye o forma girdi
//         ÜRETİR (ön doldurma), onun yerine GEÇMEZ.
//
// Sınırlar burada tek tek sabit olarak dışa açılır ki test dosyası (ve ileride
// bir mobil form) DB ile aynı sayıyı tekrar YAZMAK zorunda kalmasın.
//
// KONUM NOTU: şema `@repo/types/schemas` yerine burada duruyor çünkü tükettiği
// tek şey web profil formu ve `calculateAge()` ile BİRLİKTE anlam kazanıyor
// (şemanın sınırı ile türetimin sınırı aynı yerde okunmalı). Mobil tarafta da
// bir künye formu doğduğu gün ikisi birlikte `@repo/types`e taşınır.

import { z } from 'zod'

/** DB kısıtıyla (`profiles_height_cm_chk`) aynı alt sınır. */
export const HEIGHT_CM_MIN = 100
/** DB kısıtıyla (`profiles_height_cm_chk`) aynı üst sınır. */
export const HEIGHT_CM_MAX = 250
/** DB kısıtıyla (`profiles_birth_date_chk`) aynı alt sınır — bu tarih DAHİL DEĞİL. */
export const BIRTH_DATE_FLOOR = '1900-01-01'

/**
 * `YYYY-MM-DD` biçiminde YEREL bugün.
 *
 * `toISOString()` BİLEREK kullanılmaz: o UTC'ye çevirir ve UTC+3'te yerel
 * 00:00-03:00 penceresinde günü GERİ kaydırır — aynı tuzağın ölçülmüş hâli için
 * bkz. `@repo/api-client`'taki `date.ts` başlık yorumu ve
 * `apps/web/tests/unit/local-date-consistency.test.ts`.
 */
function todayLocalIso(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * `YYYY-MM-DD` metnini YEREL bir `Date`e çevirir; takvimde yoksa `null` döner.
 *
 * Tarih `new Date(string)` ile AYRIŞTIRILMAZ: `'1990-01-02'` biçimi
 * ECMAScript'te UTC olarak yorumlanır ve negatif ofsetli saat dilimlerinde günü
 * bir geri kaydırır — bu yüzden metin doğrudan parçalanır.
 *
 * `2026-02-31` gibi bir metin regex'ten GEÇER ama öyle bir gün YOKTUR; kurulan
 * `Date` sessizce 3 Mart'a taşar. Geri okuyup karşılaştırmak bunu eler.
 */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }
  return parsed
}

/**
 * Metin `YYYY-MM-DD` biçiminde GERÇEK bir takvim günü mü?
 *
 * Şemada AYRI bir refine olarak durur ve `calculateAge` ile KARIŞTIRILMAMALIDIR:
 * `calculateAge` gelecekteki bir tarih için de `null` döner (yaş negatif
 * olamaz), oysa "gelecek tarih" ile "hiç var olmayan tarih" kullanıcıya FARKLI
 * mesaj göstermesi gereken iki ayrı hatadır.
 */
export function isCalendarDate(value: string): boolean {
  return parseLocalDate(value) !== null
}

/**
 * `YYYY-MM-DD` doğum tarihinden TAMAMLANMIŞ yaşı hesaplar.
 *
 * Doğum günü GELMEDİYSE yaş bir eksiktir (takvim yılı farkı değil, tamamlanmış
 * yıl sayısı döner).
 *
 * @param birthDate `profiles.birth_date` değeri (`null` olabilir — künye zorunlu değil).
 * @param now Test edilebilirlik için "şimdi"; üretimde verilmez.
 * @returns Yaş, ya da tarih yoksa/ayrıştırılamıyorsa/gelecekteyse `null`.
 */
export function calculateAge(
  birthDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!birthDate) return null

  const parsed = parseLocalDate(birthDate)
  if (!parsed) return null

  const year = parsed.getFullYear()
  const month = parsed.getMonth() + 1
  const day = parsed.getDate()

  let age = now.getFullYear() - year
  const currentMonth = now.getMonth() + 1
  const hasHadBirthday = currentMonth > month || (currentMonth === month && now.getDate() >= day)
  if (!hasHadBirthday) age -= 1

  return age >= 0 ? age : null
}

/**
 * Boş metni `null`'a çevirir.
 *
 * Künye ZORUNLU DEĞİLDİR ve kullanıcı girdiği bir değeri SİLEBİLMELİDİR. HTML
 * form alanları boşken `''` üretir; `''` doğrudan zod'a girseydi `z.coerce
 * .number()` onu `0`a çevirir ve "boyu 0 cm" diye reddederdi — yani alanı
 * temizlemek imkânsız olurdu.
 */
function emptyToNull(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  return value
}

/**
 * Künye formunun doğrulama sözleşmesi.
 *
 * İki alan da `null` olabilir (künye opsiyoneldir); `null` dalları refine
 * zincirine HİÇ girmez çünkü `.nullable()` en dışta durur.
 */
export const bodyMetricsSchema = z.object({
  birth_date: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Geçerli bir doğum tarihi seçin.' })
      .refine(isCalendarDate, { message: 'Geçerli bir doğum tarihi seçin.' })
      .refine((value) => value > BIRTH_DATE_FLOOR, {
        message: 'Doğum tarihi 1900 yılından önce olamaz.',
      })
      .refine((value) => value <= todayLocalIso(), {
        message: 'Doğum tarihi gelecekte olamaz.',
      })
      .nullable()
  ),
  height_cm: z.preprocess(
    emptyToNull,
    z.coerce
      .number({ invalid_type_error: 'Boy sayı olmalıdır.' })
      .min(HEIGHT_CM_MIN, { message: `Boy en az ${HEIGHT_CM_MIN} cm olmalıdır.` })
      .max(HEIGHT_CM_MAX, { message: `Boy en fazla ${HEIGHT_CM_MAX} cm olabilir.` })
      // DB `scale(height_cm) <= 1` istiyor. Kayan nokta yüzünden `n * 10`
      // tamsayı çıkmayabilir (178.3 * 10 = 1783.0000000000002), bu yüzden
      // karşılaştırma yuvarlanmış değerin KENDİSİYLE yapılır.
      .refine((value) => Math.round(value * 10) / 10 === value, {
        message: 'Boy en fazla bir ondalık basamak içerebilir (ör. 178.5).',
      })
      .nullable()
  ),
})

export type BodyMetricsInput = z.infer<typeof bodyMetricsSchema>
