// Faz 4.8 dilim 2 — OLAY YAYINLAMA KAPISI (bağımlılıksız).
//
// ═════════════════════════════════════════════════════════════════════════════
// NEDEN BİR "SINK KAYIT DEFTERİ", NEDEN DOĞRUDAN İMPORT DEĞİL
// ═════════════════════════════════════════════════════════════════════════════
// `daily_log_submitted` / `form_check_uploaded` / `message_sent` / `ai_generated`
// olaylarını yayınlayacak yerler sekme BİLEŞENLERİDİR (`src/components/tabs/**`).
// O bileşenler `@/lib/activity/tracker`ı DOĞRUDAN içe aktarsaydı:
//
//   * her biri Supabase tarayıcı istemcisini, `@/env`i ve zod'u kendi modül
//     grafiğine çekerdi (mevcut bileşen birim testleri bu yüzden ortam değişkeni
//     kurmadan çöker),
//   * ve etkinlik altyapısı, onsuz da çalışması gereken bileşenler için SERT bir
//     bağımlılık hâline gelirdi.
//
// Bu dosyanın ÇALIŞMA ZAMANI BAĞIMLILIĞI SIFIRDIR (yalnızca `import type`).
// `ActivityTracker` mount olduğunda kendini buraya kaydeder; kaydolmadan önce —
// ve rıza kapalıyken hiç kaydolmaz — her çağrı SESSİZ BİR NO-OP'tur. Yani bir
// bileşenden `recordActivityEvent('message_sent')` çağırmak, en kötü ihtimalle
// hiçbir şey yapmaz; asla fırlatmaz ve asla bir Promise sızdırmaz.

import type { ActivityEvent } from './contract'

/** `ActivityTracker`ın kayıt ettiği alıcı. */
export interface ActivitySink {
  /** Kapalı listeden bir olay. */
  event: (event: ActivityEvent) => void
  /** Aktif sekme değişti; süre muhasebesi (`duration_sec`) alıcıya aittir. */
  tab: (tab: string) => void
}

let sink: ActivitySink | null = null

/**
 * Alıcıyı kaydeder; `null` verilirse kaydı siler (unmount). SON KAYIT KAZANIR —
 * React Strict Mode'da effect iki kez koştuğunda ikinci kayıt birincinin yerini
 * alır, iki alıcı birden birikmez.
 */
export function registerActivitySink(next: ActivitySink | null): void {
  sink = next
}

/**
 * Kapalı listeden bir etkinlik olayı yayınlar. Alıcı yoksa (rıza kapalı, oturum
 * yok, sağlayıcı henüz mount olmadı) SESSİZCE düşer.
 *
 * ÇAĞIRAN `await` ETMEZ VE ETMEMELİDİR: etkinlik kaydı, kullanıcının asıl işini
 * (mesaj gönderme, günlük kaydetme) hiçbir koşulda geciktirmemeli veya
 * başarısızlığıyla kirletmemelidir.
 */
export function recordActivityEvent(event: ActivityEvent): void {
  sink?.event(event)
}

/**
 * Aktif sekmenin değiştiğini bildirir. ÖNCEKİ sekmenin `tab_view` satırı
 * `duration_sec` ile KAPATILIR; yenisi açılır (bkz. `./controller.ts`).
 */
export function recordTabView(tab: string): void {
  sink?.tab(tab)
}

/**
 * Rıza durumu arayüzden değiştirildiğinde (rıza ekranı) tarayıcıya duyurulur.
 * `ActivityTracker` bu olayı dinler ve `activity_consent_state`'i YENİDEN okur —
 * böylece rıza verildiği anda heartbeat sayfa yenilenmeden başlar, geri
 * çekildiği anda susar.
 *
 * OLAY ADI BİR SÖZLEŞMEDİR: rıza arayüzü (dilim 3, `components/activity/**`) bu
 * modülü içe aktarmak zorunda kalmasın diye `window` üzerinden gevşek bağlı
 * bırakıldı; iki ayrı ajanın paralel çalıştığı bir turda tek yönlü bir bağ,
 * karşılıklı import'tan daha güvenlidir.
 */
export const ACTIVITY_CONSENT_CHANGED_EVENT = 'activity:consent-changed'

/** Rıza değişimini duyurur (tarayıcı dışında no-op). */
export function announceActivityConsentChange(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ACTIVITY_CONSENT_CHANGED_EVENT))
}
