import 'server-only'

// KVKK / GDPR "UNUTULMA HAKKI" — HESAP SİLME UCU (borç B-042, AC-4.6.1 / AC-4.6.2).
// Karar kaydı: docs/adr/0025-hesap-silme-ve-service-role-sunucu-yolu.md
// Veritabanı yarısı: supabase/migrations/20260819100000_account_deletion.sql
//
// ─────────────────────────────────────────────────────────────────────────────
// BU, `service_role`ÜN ÇALIŞMA ZAMANINDA KULLANILDIĞI İLK VE ŞU AN TEK YOLDUR.
// ─────────────────────────────────────────────────────────────────────────────
// Bugüne kadar `SUPABASE_SERVICE_ROLE_KEY` yalnızca depo dışı bakım script'lerinde
// (`scripts/import-catalog.mjs`, `scripts/clean-e2e-data.mjs`) kullanılıyordu; uygulama
// süreci onu hiç OKUMUYORDU. Bu dosya o sınırı geçiyor, çünkü iki iş anon/kullanıcı
// yetkisiyle YAPILAMAZ (ADR-0025 §Karar'da ölçümleriyle):
//
//   1. `auth.users` satırını silmek — hiçbir `authenticated` rolü bunu yapamaz.
//   2. Koçun DANIŞANIN KONUŞMA KLASÖRÜNE yüklediği mesaj eklerini silmek —
//      `message_attachments_delete_own_or_coach` politikası danışana YALNIZCA kendi
//      yüklediği nesneyi sildirir; koçun yüklediği ek, danışanın kendi yetkisiyle
//      SİLİNEMEZ ve yetim kalırdı.
//
// ANAHTARIN DİSİPLİNİ:
//   * Yalnızca sunucu ortam değişkeninde yaşar (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_`
//     ÖNEKİ YOK) ve `getServerEnv()` üzerinden okunur — o modül `import 'server-only'`
//     taşır, yani bu yol istemci paketine hiç girmez (AC-11).
//   * Bu dosya da `import 'server-only'` ile başlar: yanlışlıkla bir istemci bileşeninden
//     import edilirse build-time hatası verir, çalışma zamanında sızmaz.
//   * Anahtar HİÇBİR log satırına, hiçbir hata gövdesine ve hiçbir yanıt başlığına
//     yazılmaz. Aşağıdaki tüm `log.*` çağrıları yalnızca `event` + SAYI alanları taşır.
//
// ─────────────────────────────────────────────────────────────────────────────
// LOG DİSİPLİNİ — SİLİNEN KULLANICININ uid'si LOGLANMAZ
// ─────────────────────────────────────────────────────────────────────────────
// AI proxy'si (`src/lib/api/proxy.ts`) log'a `userId` ekler; BURADA BİLEREK EKLENMEZ.
// Sebep: denetim satırı (`public.account_deletions`) KİŞİSEL VERİ İÇERMEYECEK şekilde
// tasarlandı (AC-4.6.2); aynı isteğin sunucu logunda uid'yi bırakmak o kararı anlamsız
// kılardı — "unutulan" kullanıcı log arşivinde durmaya devam ederdi. Korelasyon
// `requestId` üzerinden yapılır ve o değer denetim satırına da yazılır (`request_id`),
// yani "hangi log satırı hangi silmeye ait" sorusu uid olmadan cevaplanabilir.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { clientEnv } from '@/env'
import { getServerEnv } from '@/env.server'
import { errorResponse } from '@/lib/api/response'
import { createRequestLogger } from '@/lib/logger'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  MAX_STORAGE_PASSES,
  deleteAccountBodySchema,
  parseDeletionResult,
  parseManifest,
} from '../deletion-core'
import type { Database } from '@repo/types'
import { formatZodError } from '@repo/types/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_AUTHENTICATED_MESSAGE = 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.'

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID()
  const log = createRequestLogger(requestId)

  // ---------------------------------------------------------------------------
  // 1) KİMLİK — `Authorization: Bearer <token>`
  //
  //    COOKIE İLE DOĞRULAMA BİLEREK KULLANILMADI. `src/lib/supabase/server.ts`in
  //    başındaki not bunu zaten karara bağlamıştı: cookie yalnızca DEPOLAMA ortamıdır,
  //    kimlik doğrulama ortamı değil — cookie'ye dayanan bir uç CSRF yüzeyi açar.
  //    Tarayıcı, üçüncü taraf bir sayfadan `Authorization` başlığı GÖNDEREMEZ; bu yüzden
  //    Bearer, uygulamanın en yıkıcı ucu için doğru seçimdir. Aynı desen `/api/ai/*`te
  //    zaten kullanılıyor.
  // ---------------------------------------------------------------------------
  const authHeader = request.headers.get('authorization')
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()

  if (!accessToken) {
    log.warn({ event: 'account_delete_unauthenticated' }, 'Hesap silme: Authorization eksik')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  // Token GoTrue'ya karşı doğrulanır (imza + süre + kullanıcının HÂLÂ var olması).
  // `getUser(token)` ağ çağrısıdır ve tam da bunu ölçer: silinmiş bir kullanıcının
  // token'ı burada 401 alır — idempotanslığın ilk katmanı budur.
  const authClient = createServerSupabaseClient(accessToken)
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData.user) {
    log.warn({ event: 'account_delete_invalid_session' }, 'Hesap silme: geçersiz oturum')
    return errorResponse(401, 'NOT_AUTHENTICATED', NOT_AUTHENTICATED_MESSAGE, requestId)
  }

  // Silinecek kimlik YALNIZCA buradan gelir. Gövdede uid KABUL EDİLMEZ (bkz.
  // `deleteAccountBodySchema` doc-comment'i).
  const userId = userData.user.id

  // ---------------------------------------------------------------------------
  // 2) GÖVDE — ikinci onay adımının SUNUCU tarafı
  //
  //    Onay cümlesi arayüzde de isteniyor (profile/page.tsx), ama arayüz doğrulaması
  //    bir GÜVENLİK sınırı değildir: `fetch` ile doğrudan çağıran bir istemci onu
  //    atlar. Cümle burada TEKRAR doğrulanır; "çift onay" iddiası ancak böyle gerçek olur.
  // ---------------------------------------------------------------------------
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'İstek gövdesi geçerli bir JSON değil.', requestId)
  }

  const parsed = deleteAccountBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    log.warn({ event: 'account_delete_confirmation_rejected' }, 'Hesap silme: onay metni geçersiz')
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      'Hesap silme onaylanmadı. Silmeyi tamamlamak için istenen onay metnini birebir yazmalısınız.',
      requestId,
      formatZodError(parsed.error)
    )
  }

  // ---------------------------------------------------------------------------
  // 3) SERVICE ROLE İSTEMCİSİ — fail-closed
  // ---------------------------------------------------------------------------
  const serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    // Anahtar yapılandırılmamış. SESSİZCE "sildim" DEMEK en kötü davranıştır: kullanıcı
    // hesabının gittiğini sanır, veri yerinde durur. Gürültülü 503 dönülür.
    log.error(
      { event: 'account_delete_unconfigured' },
      'Hesap silme: SUPABASE_SERVICE_ROLE_KEY yapılandırılmamış'
    )
    return errorResponse(
      503,
      'ACCOUNT_DELETION_UNAVAILABLE',
      'Hesap silme şu anda yapılandırılmamış. Lütfen daha sonra tekrar deneyin veya destek ile iletişime geçin.',
      requestId
    )
  }

  const admin = createClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // ---------------------------------------------------------------------------
  // 4) STORAGE — FİZİKSEL DOSYALAR ÖNCE
  //
  //    ###########################################################################
  //    # SIRA KRİTİKTİR VE TERSİ ÇEVRİLEMEZ                                       #
  //    # `storage.objects`tan SQL ile satır silmek PLATFORM TARAFINDAN YASAKTIR   #
  //    # (`storage.protect_delete()` trigger'ı, canlı ölçüm migration §3c'de).    #
  //    # Yasak yerindedir: satırı silmek diskteki/S3'teki baytı BIRAKIR.          #
  //    # Dolayısıyla dosyalar YALNIZCA Storage API ile gider ve bu, veritabanı    #
  //    # transaksiyonunun DIŞINDA kalan tek adımdır.                              #
  //    #                                                                          #
  //    # Bu yüzden dosyalar ÖNCE silinir: adım yarıda kalırsa hesap HÂLÂ AYAKTADIR#
  //    # (kullanıcı tekrar dener, hiçbir şey kaybolmamıştır). Ters sırada olsaydı #
  //    # -- önce hesap, sonra dosyalar -- yarıda kalan bir koşu, sahibi artık var #
  //    # olmayan ve hiçbir sorgunun bulamayacağı YETİM fotoğraflar bırakırdı.     #
  //    ###########################################################################
  // ---------------------------------------------------------------------------
  let storageObjectsDeleted = 0

  for (let pass = 0; pass < MAX_STORAGE_PASSES; pass += 1) {
    const { data: rawManifest, error: manifestError } = await admin.rpc(
      'account_deletion_manifest',
      { p_user_id: userId }
    )

    if (manifestError) {
      log.error(
        { event: 'account_delete_manifest_failed', err: manifestError.message },
        'Hesap silme: manifest okunamadı'
      )
      return errorResponse(
        500,
        'ACCOUNT_DELETION_FAILED',
        'Hesap silinemedi. Hiçbir veri değiştirilmedi; lütfen tekrar deneyin.',
        requestId
      )
    }

    const manifest = parseManifest(rawManifest)
    if (!manifest) {
      log.error({ event: 'account_delete_manifest_shape' }, 'Hesap silme: manifest biçimi bozuk')
      return errorResponse(
        500,
        'ACCOUNT_DELETION_FAILED',
        'Hesap silinemedi. Hiçbir veri değiştirilmedi; lütfen tekrar deneyin.',
        requestId
      )
    }

    // Kullanıcı arada silinmiş olabilir (aynı anda iki sekme). İDEMPOTANSLIK: hata değil.
    if (!manifest.userExists) break

    if (manifest.storageTotal === 0) break

    for (const [bucket, paths] of Object.entries(manifest.storage)) {
      const { data: removed, error: removeError } = await admin.storage.from(bucket).remove(paths)

      if (removeError) {
        // Tek bir bucket'ın hatası akışı DÜŞÜRMEZ: sonraki tur kalanları yeniden dener.
        // Üç tur da yetmezse aşağıdaki `delete_account()` zaten fail-closed reddeder.
        log.warn(
          { event: 'account_delete_storage_remove_failed', bucket, err: removeError.message },
          'Hesap silme: storage nesneleri silinemedi'
        )
        continue
      }

      storageObjectsDeleted += removed?.length ?? 0
    }
  }

  // ---------------------------------------------------------------------------
  // 5) VERİTABANI — TEK TRANSAKSİYON
  //
  //    `delete_account()` şunları AYNI transaksiyonda yapar: auth kullanıcısını siler
  //    (14 tablo FK CASCADE ile gider), silme sonrası satır sayımıyla eksiksizliği
  //    KANITLAR ve kişisel veri içermeyen denetim satırını yazar. Ayrıntılı gerekçe:
  //    supabase/migrations/20260819100000_account_deletion.sql §3.
  // ---------------------------------------------------------------------------
  const { data: rawResult, error: deleteError } = await admin.rpc('delete_account', {
    p_user_id: userId,
    p_request_id: requestId,
    p_storage_objects_deleted: storageObjectsDeleted,
  })

  if (deleteError) {
    log.error(
      { event: 'account_delete_failed', err: deleteError.message },
      'Hesap silme: veritabanı reddetti'
    )
    return errorResponse(
      500,
      'ACCOUNT_DELETION_FAILED',
      'Hesap silinemedi. Hiçbir veri değiştirilmedi; lütfen tekrar deneyin.',
      requestId
    )
  }

  const result = parseDeletionResult(rawResult)
  if (!result) {
    log.error({ event: 'account_delete_result_shape' }, 'Hesap silme: sonuç biçimi bozuk')
    return errorResponse(
      500,
      'ACCOUNT_DELETION_FAILED',
      'Hesap silinemedi. Hiçbir veri değiştirilmedi; lütfen tekrar deneyin.',
      requestId
    )
  }

  // Başarı log'u: uid YOK, e-posta YOK — yalnızca sayılar (bkz. dosya başındaki log
  // disiplini notu).
  log.info(
    {
      event: 'account_deleted',
      alreadyDeleted: result.alreadyDeleted,
      rowsDeleted: result.rowTotal,
      storageObjectsDeleted: result.storageObjectsDeleted,
    },
    'Hesap silindi'
  )

  return NextResponse.json(
    {
      ok: true,
      // `alreadyDeleted` istemciye AÇIKÇA bildirilir: ikinci çağrı da 200 döner
      // (AC-4.6.1 idempotanslık) ama arayüz "zaten silinmişti" diyebilsin.
      alreadyDeleted: result.alreadyDeleted,
      rowsDeleted: result.rowTotal,
      storageObjectsDeleted: result.storageObjectsDeleted,
    },
    {
      status: 200,
      headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' },
    }
  )
}
