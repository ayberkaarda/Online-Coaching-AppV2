// Faz 4.8 dilim 2 — ETKİNLİK KAYDI SÖZLEŞMESİ (saf modül).
//
// Bu dosya BİLEREK bağımlılıksızdır (yalnızca `zod`): hem SUNUCU tarafı
// (`src/app/api/activity/**`) hem TARAYICI tarafı (`src/lib/activity/tracker.tsx`)
// aynı sabitleri okur. `server-only` İÇE AKTARILMAZ, `next/server` İÇE AKTARILMAZ —
// aksi hâlde istemci paketine giremezdi ve iki taraf iki ayrı kopya kapalı liste
// taşımak zorunda kalırdı (sessizce ayrışan iki gerçek).
//
// KAPALI LİSTELER TEK KAYNAKTAN TÜRETİLMEZ, KOPYALANIR — VE BU BİLİNÇLİDİR:
// asıl kaynak veritabanıdır (`activity_events_event_chk` /
// `activity_sessions_platform_chk`, bkz. supabase/migrations/20260820090000_activity_log.sql).
// Buradaki kopya bir İKİNCİ kapıdır: geçersiz bir değer veritabanına hiç gitmeden
// 422 ile reddedilir. İkisi ayrışırsa veritabanı kazanır (23514 -> 400) ve
// `tests/unit/activity-endpoint.test.ts` bu ayrışmayı yakalayacak şekilde
// listeleri birebir iddia eder.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Kapalı listeler
// ---------------------------------------------------------------------------

/** §7c'nin kapalı olay listesi — `activity_events_event_chk` ile BİREBİR. */
export const ACTIVITY_EVENTS = [
  'tab_view',
  'daily_log_submitted',
  'form_check_uploaded',
  'message_sent',
  'ai_generated',
  'login',
  'logout',
] as const

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number]

/** `activity_sessions_platform_chk` ile BİREBİR. */
export const ACTIVITY_PLATFORMS = ['web', 'mobile'] as const

export type ActivityPlatform = (typeof ACTIVITY_PLATFORMS)[number]

/**
 * Rıza metninin (aydınlatma metni) sürümü. Metin değişirse bu sayı ARTIRILIR ve
 * kullanıcıdan YENİDEN rıza istenir — veritabanı `profiles.activity_consent_version`
 * içinde hangi sürümün onaylandığını saklar (`grant_activity_consent(uuid, integer)`
 * `p_version`'ı zorunlu tutar: "hangi aydınlatma metninin onaylandığı BİLİNMEDEN
 * rıza kaydedilemez").
 *
 * Sunucu, istemcinin gönderdiği sürüme KÖRÜ KÖRÜNE güvenmez: gövdedeki değer bu
 * sabitten BÜYÜK olamaz (istemci "gelecekteki" bir metni onaylamış gibi
 * gösteremesin). Küçük bir değer kabul edilir — kullanıcı gerçekten eski metni
 * görmüş olabilir (dağıtım sırasında açık kalan sekme).
 */
export const ACTIVITY_CONSENT_VERSION = 1

/** `activity_events_tab_chk` tavanı (`char_length between 1 and 40`). */
export const MAX_TAB_LENGTH = 40

/**
 * `tab` bir SEKME ETİKETİDİR, URL DEĞİL (`activity_events.tab` yorumu: "URL, sorgu
 * parametresi veya serbest metin DEĞİLDİR"). Veritabanı yalnızca UZUNLUK
 * kontrol edebiliyor; "serbest metin değil" iddiasını uygulama katmanı bu desenle
 * ayakta tutar: yalnızca harf/rakam/`_`/`-`. Boşluk, `/`, `?`, `#`, `:` ve `.`
 * REDDEDİLİR — yani bir yol, sorgu dizesi veya cümle bu kapıdan geçemez.
 */
export const TAB_PATTERN = /^[A-Za-z0-9_-]{1,40}$/

/**
 * `duration_sec` tavanı. Veritabanı yalnızca `>= 0` istiyor; burada bir ÜST sınır da
 * konur: 12 saat. Tek bir sekme görüntülemesi bundan uzun olamaz (30 dk hareketsizlik
 * zaten oturumu bitiriyor), dolayısıyla daha büyük bir değer ya bozuk bir istemci
 * saatidir ya da kasıtlı bir çöp kayıttır — gün özetini bozmadan burada durur.
 */
export const MAX_DURATION_SEC = 12 * 60 * 60

// ---------------------------------------------------------------------------
// `POST /api/activity` gövdesi
// ---------------------------------------------------------------------------
//
// GÖVDEDE `user_id` YOKTUR VE OLMAYACAKTIR. Kimlik YALNIZCA doğrulanmış JWT'den
// gelir (bkz. route). `.strict()` bilerek kullanılır: gövdeye `user_id` sızdırmaya
// çalışan bir istemci SESSİZCE yok sayılmak yerine 422 alır — "kimlik gövdeden
// kabul edilmiyor" iddiası böylece test edilebilir bir davranışa dönüşür.

export const activityBodySchema = z
  .object({
    /**
     * `undefined`/`null` => SAF HEARTBEAT (yalnızca `last_seen_at` tazelenir, sıfır
     * yeni satır). Bu, `record_activity`'nin `p_event default null` sözleşmesidir.
     */
    event: z.enum(ACTIVITY_EVENTS).nullish(),
    /** İstemcinin elindeki oturum; yoksa sunucu yeni oturum açar ve id'yi döner. */
    session_id: z.string().uuid({ message: 'Geçersiz oturum kimliği.' }).nullish(),
    tab: z
      .string()
      .regex(TAB_PATTERN, { message: 'Geçersiz sekme etiketi.' })
      .max(MAX_TAB_LENGTH)
      .nullish(),
    duration_sec: z.number().int().min(0).max(MAX_DURATION_SEC).nullish(),
    /**
     * İstemci saati. Sunucu bunu ZORUNLU KILMAZ (yoksa `now()` kullanılır) ve
     * KÖRÜ KÖRÜNE de kabul etmez: veritabanı ±sapma penceresinin (5 dk ileri /
     * 1 gün geri) dışındaki damgaları 22023 ile reddeder.
     */
    occurred_at: z.string().datetime({ offset: true }).nullish(),
    /**
     * `web` varsayılanı bilinçlidir: bu uç bugün yalnızca web istemcisi tarafından
     * çağrılıyor; `apps/mobile` geldiğinde AÇIKÇA `"mobile"` göndermek zorunda kalır.
     */
    platform: z.enum(ACTIVITY_PLATFORMS).default('web'),
  })
  .strict()

export type ActivityBody = z.infer<typeof activityBodySchema>

// ---------------------------------------------------------------------------
// `POST /api/activity/consent` gövdesi
// ---------------------------------------------------------------------------

export const activityConsentBodySchema = z
  .object({
    version: z
      .number()
      .int()
      .min(1, { message: 'Rıza metni sürümü pozitif olmalıdır.' })
      .max(ACTIVITY_CONSENT_VERSION, {
        message: 'Bilinmeyen rıza metni sürümü.',
      }),
  })
  .strict()

export type ActivityConsentBody = z.infer<typeof activityConsentBodySchema>

// ---------------------------------------------------------------------------
// `record_activity()` dönüşü
// ---------------------------------------------------------------------------

export interface RecordActivityResult {
  sessionId: string
  eventId: string | null
  sessionStarted: boolean
}

/**
 * `record_activity()`'nin `jsonb` dönüşünü normalize eder. Biçim beklenenden
 * SAPARSA `null` döner — çağıran o zaman gürültülü bir 500 üretir. `account/delete`
 * route'undaki `parseDeletionResult` ile AYNI disiplin: "yaklaşık doğru" bir
 * yanıtı sessizce istemciye geçirmek, istemcinin ELİNDEKİ oturum kimliğini
 * bozacağı için sonraki tüm sinyalleri de bozardı.
 */
export function parseRecordActivityResult(raw: unknown): RecordActivityResult | null {
  if (typeof raw !== 'object' || raw === null) return null

  const value = raw as Record<string, unknown>
  const sessionId = value.session_id
  const eventId = value.event_id
  const sessionStarted = value.session_started

  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  if (eventId !== null && typeof eventId !== 'string') return null
  if (typeof sessionStarted !== 'boolean') return null

  return { sessionId, eventId: eventId ?? null, sessionStarted }
}
