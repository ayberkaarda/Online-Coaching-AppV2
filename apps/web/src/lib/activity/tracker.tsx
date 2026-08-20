'use client'

// Faz 4.8 dilim 2 — HEARTBEAT'İN UYGULAMAYA BAĞLANDIĞI YER.
//
// ═════════════════════════════════════════════════════════════════════════════
// KARAR — NEDEN `Providers` İÇİNDE BİR BİLEŞEN, NEDEN BİR SAYFA HOOK'U DEĞİL
// ═════════════════════════════════════════════════════════════════════════════
//   1) KAPSAM. `src/app/layout.tsx` `<Providers>`'ı TÜM rotaların üstüne koyuyor.
//      Heartbeat'i `app/page.tsx` içinde bir hook olarak kursaydık `/profile`,
//      `/users` ve dilim 3'ün `/verilerim` sayfası KAPSAM DIŞI kalırdı — "kullanıcı
//      uygulamada aktifti" ölçümü, kullanıcının panelden çıktığı anda susardı.
//   2) TEKİLLİK. Sayfa hook'u her rotada YENİDEN mount olurdu; her mount yeni bir
//      zamanlayıcı ve yeni bir "ilk sinyal" demektir. Sağlayıcı ağacında tek bir
//      mount vardır ve rota geçişlerinde SÖKÜLMEZ.
//   3) BAĞIMLILIK. Supabase istemcisine (token + `onAuthStateChange`) ihtiyaç var;
//      o istemci `<SupabaseClientProvider>` ile enjekte ediliyor (ADR-0024), yani
//      bu bileşen ZORUNLU olarak o sağlayıcının İÇİNDE durmalı.
//
// SAĞLAYICI SIRASI DEĞİŞTİRİLMEDİ: bileşen mevcut sağlayıcıların arasına
// GİRMİYOR, en içteki ağaca bir KARDEŞ olarak ekleniyor ve `null` render ediyor —
// DOM'a, layout'a veya CSS'e hiçbir etkisi yok.
//
// ═════════════════════════════════════════════════════════════════════════════
// RIZA KAPALIYKEN SIFIR AĞ TRAFİĞİ
// ═════════════════════════════════════════════════════════════════════════════
// `activity_consent_state(uuid)` SECURITY INVOKER'dır ve EXECUTE yetkisi
// `authenticated`'a da verilmiştir (migration §3) — yani tarayıcı bunu KENDİ
// kimliğiyle, RLS altında okuyabilir. Durum OTURUM BAŞINA BİR KEZ okunur; `granted`
// değilse denetleyici hiç kurulmaz, tek bir `/api/activity` isteği bile çıkmaz.
// Rıza ekranı durumu değiştirdiğinde `announceActivityConsentChange()` ile
// (window olayı) haber verir ve burada YENİDEN okunur — sayfa yenilemeye gerek yok.

import { useEffect } from 'react'
import type { JSX } from 'react'

import { useSupabaseClient } from '@repo/api-client/context'

import {
  HEARTBEAT_INTERVAL_MS,
  createActivityController,
  type ActivityController,
} from './controller'
import { ACTIVITY_CONSENT_CHANGED_EVENT, registerActivitySink } from './emit'
import { postActivitySignal } from './transport'

/** `sessionStorage` anahtarları — kullanıcı başına ayrı. */
function sessionKey(userId: string): string {
  return `activity:session:${userId}`
}

function loginFlagKey(userId: string): string {
  return `activity:login-sent:${userId}`
}

/**
 * NEDEN `sessionStorage`, `localStorage` DEĞİL: heartbeat'in tüm semantiği SEKME
 * kapsamlıdır (`document.visibilityState` sekme başınadır, `pagehide` sekme
 * başınadır, `tab_view` süresi sekme başınadır). Oturum kimliğini pencereler
 * arasında paylaşmak, arka planda unutulmuş bir sekmenin kullanıcının kapattığı
 * bir oturumu diriltmesine yol açardı. Sekme kapanınca kimlik de gider; 30 dk
 * sonra sunucu o oturumu zaten bayat sayar.
 */
function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    // Safari private mode / kısıtlı depolama: kimlik tutulamaz, sunucu her
    // sinyalde yeni oturum açar. Bozulma değil, yalnızca daha çok oturum satırı.
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    // yok say — bkz. `readStorage`
  }
}

/** 204 döngüsüne karşı emniyet: bu kadar denemeden sonra sessizce vazgeçilir. */
const MAX_SELF_HEAL_ATTEMPTS = 3

export function ActivityTracker(): JSX.Element | null {
  const supabase = useSupabaseClient()

  useEffect(() => {
    let disposed = false
    let controller: ActivityController | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null
    let accessToken: string | null = null
    let userId: string | null = null
    let selfHealAttempts = 0

    // -----------------------------------------------------------------------
    // Denetleyicinin kurulumu / sökülmesi
    // -----------------------------------------------------------------------

    function teardown(): void {
      controller?.stop()
      controller = null
      registerActivitySink(null)
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    function startTracking(): void {
      if (controller || disposed || userId === null) return

      const trackedUserId = userId

      controller = createActivityController({
        now: () => Date.now(),
        loadSessionId: () => readStorage(sessionKey(trackedUserId)),
        saveSessionId: (value) => writeStorage(sessionKey(trackedUserId), value),
        post: (body, options) => {
          // Token yoksa isteği hiç kurma: kimliksiz istek 401 alır ve boşuna
          // sunucuya iş yaptırır.
          if (accessToken === null) return Promise.resolve({ kind: 'error' as const })
          return postActivitySignal(body, {
            accessToken,
            keepalive: options.keepalive,
          })
        },
        onDenied: () => {
          // 204'ün iki anlamı var (rıza kapandı / oturum bize ait değil); ikisinin
          // de doğru yanıtı rıza durumunu YENİDEN OKUMAK. `MAX_SELF_HEAL_ATTEMPTS`
          // sonsuz döngüyü keser.
          teardown()
          if (selfHealAttempts >= MAX_SELF_HEAL_ATTEMPTS) return
          selfHealAttempts += 1
          void refreshConsent()
        },
      })

      controller.start()

      // Sekme bileşenleri ve alan olayları buradan geçer (bkz. `./emit.ts`).
      registerActivitySink({
        event: (event) => controller?.event(event),
        tab: (tab) => controller?.tab(tab),
      })

      // §7c: "Heartbeat 60 sn, yalnızca sekme görünürken". Zamanlayıcı çalışmaya
      // devam eder ama GÖRÜNÜR DEĞİLKEN sinyal göndermez — `setInterval`'ı
      // durdurup yeniden kurmak yerine tek bir koşul, arka planda kısılan
      // (throttled) zamanlayıcılarla daha öngörülebilir davranıyor.
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') controller?.tick()
      }, HEARTBEAT_INTERVAL_MS)

      emitLoginOnce(trackedUserId)
    }

    /**
     * `login` olayı SEKME BAŞINA BİR KEZ. `onAuthStateChange` `SIGNED_IN`'i sayfa
     * yenilemede / sekme odağında da tetikleyebiliyor; bayrak olmasaydı "giriş"
     * sayısı gerçek girişleri değil sayfa yüklemelerini sayardı. Bayrak
     * `SIGNED_OUT`'ta temizlenir, yani aynı sekmede çıkıp yeniden giren kullanıcı
     * ikinci bir `login` üretir.
     */
    function emitLoginOnce(id: string): void {
      if (readStorage(loginFlagKey(id)) === '1') return
      writeStorage(loginFlagKey(id), '1')
      controller?.event('login')
    }

    // -----------------------------------------------------------------------
    // Rıza durumu
    // -----------------------------------------------------------------------

    async function refreshConsent(): Promise<void> {
      if (disposed) return
      if (userId === null || accessToken === null) {
        teardown()
        return
      }

      const { data, error } = await supabase.rpc('activity_consent_state', {
        p_user_id: userId,
      })

      if (disposed) return

      // Hata durumunda FAIL-CLOSED: durumu bilmiyorsak sinyal göndermeyiz.
      // "Bilmiyorum" ile "rıza var" aynı şey değildir.
      if (error || data !== 'granted') {
        teardown()
        return
      }

      startTracking()
    }

    // -----------------------------------------------------------------------
    // Oturum takibi
    // -----------------------------------------------------------------------

    // SAVUNMA KAPISI: `<Providers>` birçok birim testinde SAHTE bir Supabase
    // istemcisiyle (yalnızca referans kimliği ölçülen boş bir nesne) render
    // ediliyor. Etkinlik izleyicisi, kendisiyle hiç ilgisi olmayan o testleri
    // ÇÖKERTMEMELİDİR — auth yüzeyi yoksa sessizce devre dışı kalır. Üretimde
    // istemci her zaman `SupabaseClient`tır ve bu dal hiç çalışmaz.
    if (typeof supabase.auth?.getSession !== 'function') return

    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return
      const session = data.session
      if (!session) return
      accessToken = session.access_token
      userId = session.user.id
      void refreshConsent()
    })

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return

      if (event === 'SIGNED_OUT' || !session) {
        // ÇIKIŞ SİNYALİ TOKEN HÂLÂ ELİMİZDEYKEN GÖNDERİLİR. `send()` isteği
        // SENKRON olarak başlatır (fetch promise'i beklenmez), bu yüzden hemen
        // ardından sökme yapmak sinyali iptal etmez. Yine de EN İYİ ÇABADIR:
        // GoTrue oturumu çoktan geçersiz kılmışsa uç 401 döner ve olay düşer —
        // kabul edilen sınır (§7c "logout" olayı için tek istemci yolu budur;
        // sunucu tarafından yayınlamak, istemcinin `session_id`'sini bilmediği
        // için her çıkışta SAHTE bir yeni oturum açardı).
        controller?.event('logout')
        if (userId !== null) writeStorage(loginFlagKey(userId), null)
        teardown()
        accessToken = null
        userId = null
        return
      }

      const nextUserId = session.user.id
      accessToken = session.access_token

      if (nextUserId !== userId) {
        // Kullanıcı değişti (giriş ya da hesap değişimi): eski denetleyici gider.
        teardown()
        userId = nextUserId
        selfHealAttempts = 0
        void refreshConsent()
        return
      }

      // Aynı kullanıcı, yalnızca token yenilendi (`TOKEN_REFRESHED`): denetleyici
      // olduğu gibi kalır, bir sonraki sinyal yeni token'ı kullanır.
      if (!controller) void refreshConsent()
    })

    // -----------------------------------------------------------------------
    // Tarayıcı olayları
    // -----------------------------------------------------------------------

    function handleVisibilityChange(): void {
      if (!controller) return
      if (document.visibilityState === 'visible') controller.onVisible()
      // Arka plana düşüş: açık `tab_view` süresi KAPATILIR. `keepalive` burada da
      // açık — mobil tarayıcılarda "hidden" çoğu zaman sayfanın son anıdır.
      else controller.onHidden({ keepalive: true })
    }

    function handlePageHide(): void {
      controller?.onHidden({ keepalive: true })
    }

    function handleConsentChanged(): void {
      selfHealAttempts = 0
      teardown()
      void refreshConsent()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    // `pagehide`, `beforeunload`'ın aksine bfcache ile uyumludur ve mobil
    // Safari'de güvenilir şekilde tetiklenir.
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener(ACTIVITY_CONSENT_CHANGED_EVENT, handleConsentChanged)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener(ACTIVITY_CONSENT_CHANGED_EVENT, handleConsentChanged)
      authSubscription.subscription.unsubscribe()
      teardown()
    }
  }, [supabase])

  return null
}
