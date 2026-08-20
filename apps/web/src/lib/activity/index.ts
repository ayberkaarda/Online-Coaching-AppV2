// Faz 4.8 dilim 2 — etkinlik kaydı modülünün DIŞA AÇIK yüzeyi.
//
// `./tracker` BİLEREK BURADAN DIŞA AKTARILMAZ. Sebebi ağaç sarsma değil, BAĞIMLILIK
// SIZINTISIDIR: `tracker.tsx` React'i, `@repo/api-client/context`i ve dolaylı olarak
// Supabase tarayıcı istemcisini çeker. Sekme bileşenleri yalnızca
// `recordActivityEvent` istiyor; barrel tracker'ı da taşısaydı o bileşenlerin
// (ve mevcut birim testlerinin) modül grafiğine tüm etkinlik altyapısı girerdi.
//
// Kullanım rehberi:
//   * Bileşenden olay yayınlamak    -> `import { recordActivityEvent } from '@/lib/activity/emit'`
//   * Sağlayıcıya bağlamak          -> `import { ActivityTracker } from '@/lib/activity/tracker'`
//   * Rıza arayüzü (dilim 3)        -> bu barrel (contract sabitleri + transport)

export {
  ACTIVITY_CONSENT_VERSION,
  ACTIVITY_EVENTS,
  ACTIVITY_PLATFORMS,
  MAX_DURATION_SEC,
  MAX_TAB_LENGTH,
  TAB_PATTERN,
  activityBodySchema,
  activityConsentBodySchema,
  parseRecordActivityResult,
  type ActivityBody,
  type ActivityConsentBody,
  type ActivityEvent,
  type ActivityPlatform,
  type RecordActivityResult,
} from './contract'

export {
  ACTIVITY_CONSENT_CHANGED_EVENT,
  announceActivityConsentChange,
  recordActivityEvent,
  recordTabView,
  registerActivitySink,
  type ActivitySink,
} from './emit'

export {
  ACTIVITY_CONSENT_ENDPOINT,
  ACTIVITY_ENDPOINT,
  grantActivityConsent,
  revokeActivityConsent,
  type ConsentMutationResult,
} from './transport'
