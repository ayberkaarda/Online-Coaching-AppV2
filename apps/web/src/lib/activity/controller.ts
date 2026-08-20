// Faz 4.8 dilim 2 — İSTEMCİ HEARTBEAT DURUM MAKİNESİ (React'ten BAĞIMSIZ).
//
// Tarayıcı API'leri (`document.visibilityState`, `setInterval`, `pagehide`,
// Supabase istemcisi) `./tracker.tsx` içinde kalır; KARAR MANTIĞI burada, saf ve
// enjekte edilen bağımlılıklarla durur. Gerekçe: bu mantığın tamamı zamanlayıcı,
// görünürlük ve ağ hatalarıyla ilgilidir — jsdom'da gerçek zamanlayıcılarla
// kovalamak yerine sahte saat + sahte `post` ile DOĞRUDAN test edilir
// (`tests/unit/activity-heartbeat.test.ts`).
//
// ═════════════════════════════════════════════════════════════════════════════
// KİM NEYE KARAR VERİR
// ═════════════════════════════════════════════════════════════════════════════
// SUNUCU/VERİTABANI karar verir : oturum ne zaman bayatlar (30 dk), platform
//                                 değişince yeni oturum açılır mı, purge ne zaman
//                                 çalışır, rıza var mı.
// İSTEMCİ karar verir           : ne zaman SİNYAL GÖNDERİLİR (60 sn, yalnızca
//                                 görünürken), sekmede ne kadar kalındı
//                                 (`duration_sec`) ve rıza kapalıyken ağa HİÇ
//                                 çıkılmaz.
// Bu ayrım bilinçlidir: istemcinin saati ve uykuya dalan sekmesi oturum sınırını
// belirleyemez, sunucu da kullanıcının hangi sekmeye baktığını bilemez.

import type { ActivityBody, ActivityEvent } from './contract'

/** Heartbeat aralığı — §7c: "Heartbeat 60 sn". */
export const HEARTBEAT_INTERVAL_MS = 60_000

/**
 * OTOMATİK sinyaller (heartbeat + görünürlük geçişleri) arasındaki EN AZ boşluk.
 *
 * Bu, sunucudaki hız sınırının (`src/lib/activity/rate-limit.ts`, 30/dk) İSTEMCİ
 * TARAFINDAKİ karşılığıdır ve onun YERİNE GEÇMEZ — sunucu kapısı zaten
 * atlatılamaz. Buradaki boğma, MEŞRU istemcinin o kapıya hiç DEĞMEMESİNİ sağlar:
 * alt+tab ile hızlıca gidip gelen bir kullanıcı `visibilitychange` başına bir
 * sinyal üretirdi; 5 sn'lik taban, dakikada en fazla ~12 otomatik sinyal demektir.
 *
 * KULLANICI OLAYLARI (mesaj, günlük, form check, AI) bu boğmaya TABİ DEĞİLDİR:
 * onlar seyrektir, gerçek bir eylemi temsil eder ve düşürülmeleri VERİ KAYBIDIR.
 */
export const MIN_AUTO_SIGNAL_GAP_MS = 5_000

/** 429 sonrası bekleme tavanı — sunucu saçma bir `Retry-After` verse bile. */
export const MAX_BACKOFF_MS = 5 * 60_000

export type ActivityPostOutcome =
  /** 200 — satır yazıldı; sunucunun oturum kimliği benimsenir. */
  | { kind: 'ok'; sessionId: string; sessionStarted: boolean }
  /** 204 — rıza yok VEYA oturum bize ait değil. Ayrım BİLEREK verilmez. */
  | { kind: 'denied' }
  /** 401 — oturum bitti. */
  | { kind: 'unauthenticated' }
  /** 429 — hız sınırı; `retryAfterMs` kadar susulur. */
  | { kind: 'rate-limited'; retryAfterMs: number }
  /** Ağ/5xx — bu sinyal düşer, durum makinesi bozulmaz. */
  | { kind: 'error' }

export interface ActivityControllerDeps {
  /** Tek sinyali sunucuya götürür. FIRLATMAMALIDIR — hataları `error`'a çevirir. */
  post: (body: ActivityBody, options: { keepalive: boolean }) => Promise<ActivityPostOutcome>
  /** Test edilebilir saat. */
  now: () => number
  /** Sekme kapsamlı oturum kimliği deposu (bkz. `./tracker.tsx`, `sessionStorage`). */
  loadSessionId: () => string | null
  saveSessionId: (sessionId: string | null) => void
  /**
   * 204 alındığında çağrılır. İki anlamı vardır (rıza kapandı / oturum bize ait
   * değil) ve ikisinin de doğru yanıtı AYNIDIR: rıza durumunu YENİDEN OKU.
   * Gerçekten kapandıysa denetleyici durur; açıksa (yani 204 yabancı oturumdan
   * geldiyse) taze bir oturumla devam edilir — kendi kendini onarma.
   */
  onDenied: () => void
}

export interface ActivityController {
  /** Rıza doğrulandıktan SONRA çağrılır: ilk sinyali gönderir. */
  start: () => void
  /** Rıza kapandı / oturum bitti / bileşen söküldü. */
  stop: () => void
  /** `setInterval` tik'i — yalnızca sekme görünürken çağrılmalıdır. */
  tick: () => void
  /** Sekme yeniden görünür oldu. */
  onVisible: () => void
  /**
   * Sekme arka plana düştü ya da sayfa kapanıyor. Açık `tab_view` süresi KAPATILIR.
   * `keepalive`, `pagehide` yolunda zorunludur (`fetch(keepalive: true)`).
   */
  onHidden: (options?: { keepalive?: boolean }) => void
  /** Kapalı listeden bir olay. */
  event: (event: ActivityEvent) => void
  /** Aktif sekme değişti. */
  tab: (tab: string) => void
  /** Yalnızca test/teşhis için: iç durumun okunabilir kopyası. */
  snapshot: () => {
    running: boolean
    sessionId: string | null
    currentTab: string | null
    suspendedUntil: number
  }
}

export function createActivityController(deps: ActivityControllerDeps): ActivityController {
  let running = false
  let sessionId: string | null = null
  let currentTab: string | null = null
  let tabEnteredAt = 0
  let lastAutoSignalAt = 0
  let suspendedUntil = 0

  function send(
    payload: Omit<ActivityBody, 'platform'>,
    options: { keepalive?: boolean; auto?: boolean } = {}
  ): void {
    if (!running) return

    const at = deps.now()
    if (at < suspendedUntil) return

    // Otomatik sinyaller boğulur; kullanıcı olayları boğulmaz (bkz. sabit yorumu).
    if (options.auto) {
      if (at - lastAutoSignalAt < MIN_AUTO_SIGNAL_GAP_MS) return
      lastAutoSignalAt = at
    }

    const body: ActivityBody = {
      ...payload,
      // Oturum kimliği HER ZAMAN elimizdekinden gelir; `null` ise sunucu yeni açar.
      session_id: sessionId,
      platform: 'web',
    }

    // Kasıtlı olarak `await` EDİLMEZ: heartbeat hiçbir kullanıcı eylemini
    // bekletmez. `post` fırlatmama sözü verdiği için `catch` gerekmez, yine de
    // savunma amaçlı bir `.catch` bırakılır (yakalanmayan Promise reddi, bir
    // Sentry/konsol gürültüsünden fazlası değil ama gereksizdir).
    void deps
      .post(body, { keepalive: options.keepalive ?? false })
      .then(handleOutcome)
      .catch(() => undefined)
  }

  function handleOutcome(outcome: ActivityPostOutcome): void {
    switch (outcome.kind) {
      case 'ok':
        // `session_started` true ise elimizdeki oturum bayatlamıştı; yeni id
        // BENİMSENİR. Bu karar sunucuya aittir, istemci yalnızca uygular.
        sessionId = outcome.sessionId
        deps.saveSessionId(sessionId)
        return

      case 'denied':
        // 204 — hiçbir satır yazılmadı. Elimizdeki oturum kimliği ARTIK
        // GÜVENİLMEZ (ya rıza kapandı ya da o kimlik bize ait değildi): atılır.
        sessionId = null
        deps.saveSessionId(null)
        running = false
        deps.onDenied()
        return

      case 'unauthenticated':
        stop()
        return

      case 'rate-limited':
        suspendedUntil = deps.now() + Math.min(outcome.retryAfterMs, MAX_BACKOFF_MS)
        return

      case 'error':
        // Tek bir sinyalin düşmesi kabul edilebilir: sonraki heartbeat 60 sn
        // sonra zaten gelir ve `last_seen_at` mutlak değil, EN BÜYÜK değerle
        // güncellenir (`greatest(...)`), yani kayıp sinyal veriyi bozmaz.
        return
    }
  }

  /** Açık `tab_view` süresini kapatır ve sinyali gönderir. */
  function closeTabView(options: { keepalive?: boolean } = {}): void {
    if (currentTab === null) return

    const seconds = Math.max(0, Math.round((deps.now() - tabEnteredAt) / 1000))
    send(
      { event: 'tab_view', tab: currentTab, duration_sec: seconds },
      { keepalive: options.keepalive }
    )
    // Sayaç sıfırlanır ama SEKME ADI KORUNUR: kullanıcı geri döndüğünde aynı
    // sekmede yeni bir görüntüleme penceresi başlar.
    tabEnteredAt = deps.now()
  }

  function stop(): void {
    running = false
  }

  return {
    start(): void {
      if (running) return
      running = true
      suspendedUntil = 0
      lastAutoSignalAt = 0
      sessionId = deps.loadSessionId()
      tabEnteredAt = deps.now()
      // İlk sinyal SAF HEARTBEAT'tir (olay yok): oturumu açar / tazeler.
      send({}, { auto: true })
    },

    stop,

    tick(): void {
      send({}, { auto: true })
    },

    onVisible(): void {
      // Sekme geri geldi: süre sayacı YENİDEN başlar (arka planda geçen süre
      // "sekmede geçirilen süre" değildir) ve oturum hemen tazelenir.
      tabEnteredAt = deps.now()
      send({}, { auto: true })
    },

    onHidden(options): void {
      closeTabView({ keepalive: options?.keepalive })
    },

    event(event: ActivityEvent): void {
      send({ event })
    },

    tab(tab: string): void {
      if (currentTab === tab) return
      // ÖNCE önceki sekmenin satırı süresiyle kapatılır, SONRA yenisi açılır.
      closeTabView()
      currentTab = tab
      tabEnteredAt = deps.now()
    },

    snapshot() {
      return { running, sessionId, currentTab, suspendedUntil }
    },
  }
}
