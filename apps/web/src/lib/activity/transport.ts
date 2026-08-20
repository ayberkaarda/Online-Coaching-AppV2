// Faz 4.8 dilim 2 — TARAYICI -> `/api/activity` TAŞIMA KATMANI.
//
// ═════════════════════════════════════════════════════════════════════════════
// `navigator.sendBeacon` KULLANILMAZ — VE BU BİR TERCİH DEĞİL, ZORUNLULUKTUR
// ═════════════════════════════════════════════════════════════════════════════
// §7c: "Kapanış sinyali `sendBeacon` DEĞİL `fetch(keepalive:true)` — `sendBeacon`
// `Authorization` başlığı taşıyamaz." Uç, kimliği YALNIZCA `Authorization: Bearer`
// başlığından okuyor (cookie ile kimlik doğrulama CSRF yüzeyi açardı, bkz.
// `src/app/api/activity/shared.ts`). `sendBeacon` özel başlık ekleyemediği için o
// kapıdan geçemez. `fetch(..., { keepalive: true })` hem başlık taşır hem de sayfa
// kapanırken isteğin tamamlanmasını garanti eder.
//
// `keepalive` GÖVDE SINIRI (64 KB, tarayıcı başına) burada sorun değildir: en büyük
// gövde ~200 bayttır ve uç zaten 4 KB'da kesiyor.

import type { ActivityBody } from './contract'
import type { ActivityPostOutcome } from './controller'

export const ACTIVITY_ENDPOINT = '/api/activity'
export const ACTIVITY_CONSENT_ENDPOINT = '/api/activity/consent'

/** `Retry-After` yoksa kullanılacak varsayılan bekleme. */
const DEFAULT_RETRY_AFTER_MS = 60_000

function parseRetryAfterMs(response: Response): number {
  const header = response.headers.get('Retry-After')
  if (!header) return DEFAULT_RETRY_AFTER_MS
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_AFTER_MS
  return seconds * 1000
}

/**
 * Tek bir etkinlik sinyalini gönderir. **FIRLATMAZ** — ağ hatası da dâhil her
 * sonucu `ActivityPostOutcome`'a çevirir (denetleyicinin sözleşmesi bunu şart
 * koşuyor: heartbeat hiçbir koşulda uygulamayı kirletmemeli).
 */
export async function postActivitySignal(
  body: ActivityBody,
  options: { accessToken: string; keepalive: boolean; fetchImpl?: typeof fetch }
): Promise<ActivityPostOutcome> {
  const doFetch = options.fetchImpl ?? globalThis.fetch

  let response: Response
  try {
    response = await doFetch(ACTIVITY_ENDPOINT, {
      method: 'POST',
      keepalive: options.keepalive,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { kind: 'error' }
  }

  // 204: rıza yok VEYA oturum bize ait değil. Gövde YOKTUR — ayrım bilerek
  // verilmiyor (bkz. route'un KARAR bloğu).
  if (response.status === 204) return { kind: 'denied' }
  if (response.status === 401) return { kind: 'unauthenticated' }
  if (response.status === 429) {
    return { kind: 'rate-limited', retryAfterMs: parseRetryAfterMs(response) }
  }
  if (!response.ok) return { kind: 'error' }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { kind: 'error' }
  }

  if (typeof payload !== 'object' || payload === null) return { kind: 'error' }
  const record = payload as Record<string, unknown>
  if (typeof record.session_id !== 'string') return { kind: 'error' }

  return {
    kind: 'ok',
    sessionId: record.session_id,
    sessionStarted: record.session_started === true,
  }
}

// ---------------------------------------------------------------------------
// Rıza uçları — dilim 3'ün arayüzü de bunları kullanır
// ---------------------------------------------------------------------------

export interface ConsentMutationResult {
  ok: boolean
  status: number
}

/** Rıza verir (`POST /api/activity/consent`). Fırlatmaz. */
export async function grantActivityConsent(
  version: number,
  options: { accessToken: string; fetchImpl?: typeof fetch }
): Promise<ConsentMutationResult> {
  return consentRequest('POST', JSON.stringify({ version }), options)
}

/** Rızayı geri çeker VE tüm etkinlik satırlarını sildirir (`DELETE`). Fırlatmaz. */
export async function revokeActivityConsent(options: {
  accessToken: string
  fetchImpl?: typeof fetch
}): Promise<ConsentMutationResult> {
  return consentRequest('DELETE', undefined, options)
}

async function consentRequest(
  method: 'POST' | 'DELETE',
  body: string | undefined,
  options: { accessToken: string; fetchImpl?: typeof fetch }
): Promise<ConsentMutationResult> {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  try {
    const response = await doFetch(ACTIVITY_CONSENT_ENDPOINT, {
      method,
      cache: 'no-store',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${options.accessToken}`,
      },
      body,
    })
    return { ok: response.ok, status: response.status }
  } catch {
    return { ok: false, status: 0 }
  }
}
