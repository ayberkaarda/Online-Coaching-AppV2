import { beforeEach, describe, expect, it } from 'vitest'

import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'

// A-19 (güvenlik denetimi, findings-app-surface.md §3.2 ikincil etki): `MAX_KEYS` (10.000)
// aşıldığında önceki davranış `buckets.clear()` ile TÜM sayaçları sıfırlıyordu — bir
// saldırgan 10.000 sahte anahtar üreterek diğer TÜM kullanıcıların hız sınırı durumunu da
// sıfırlayabiliyordu (sınırlayıcının kendisi bir DoS koluydu). Bu dosya `rate-limit.test.ts`'in
// YANINA YENİ eklendi (mevcut dosyaya dokunulmadı).
//
// MAX_KEYS `src/lib/rate-limit.ts`'te dışa açılmıyor (kasıtlı iç detay); burada testin kendi
// bildiği sabit sayıyla (kaynaktakiyle birebir aynı) MAX_KEYS'i AŞACAK kadar anahtar üretilir.
const MAX_KEYS = 10_000

describe('checkRateLimit — MAX_KEYS taşmasında LRU tahliyesi (A-19)', () => {
  beforeEach(() => {
    resetRateLimit()
  })

  it('taşma sırasında düzenli aralıklarla kullanılan bir anahtarın sayacı SIFIRLANMAZ; gerçekten atıl bir anahtar ise tahliye edilir', () => {
    const opts = { limit: 1_000_000, windowMs: 60_000 }

    // 1) "active-key" ilk anahtar olarak eklenir (count=1).
    const first = checkRateLimit('active-key', opts)
    expect(first.remaining).toBe(999_999)
    let activeInvocations = 1

    // 2) MAX_KEYS'i aşacak kadar farklı "filler" anahtarı ekle; "active-key"i periyodik
    //    olarak yeniden çağırarak Map'in SONUNDA (en-son-kullanılan konumda) tut.
    const extraFillers = 500
    for (let i = 0; i < MAX_KEYS + extraFillers; i++) {
      checkRateLimit(`filler-${i}`, opts)
      if (i % 250 === 0) {
        checkRateLimit('active-key', opts)
        activeInvocations++
      }
    }

    // 3) "active-key" hâlâ birikmiş sayacını korumalı. ÖNCEKİ davranışta (`buckets.clear()`)
    //    taşma anında TÜM sayaçlar sıfırlanırdı; bu durumda `count` burada yeniden 1 olurdu
    //    ve `remaining` 999_999'a dönerdi.
    const afterFlood = checkRateLimit('active-key', opts)
    activeInvocations++
    expect(afterFlood.remaining).toBe(1_000_000 - activeInvocations)
    expect(afterFlood.remaining).toBeLessThan(999_999)

    // 4) Döngünün EN BAŞINDA eklenip bir daha HİÇ dokunulmayan bir "filler" anahtarı gerçekten
    //    tahliye edilmiş olmalı: yeniden çağrıldığında TAZE bir kova (count=1) ile karşılanır.
    const staleRevisited = checkRateLimit('filler-0', opts)
    expect(staleRevisited.remaining).toBe(999_999)

    // 5) Döngünün SONUNA eklenen (en taze) bir "filler" anahtarı hâlâ Map'te olmalı:
    //    yeniden çağrıldığında sayaç birikir (count=2), sıfırlanmaz.
    const recentFillerKey = `filler-${MAX_KEYS + extraFillers - 1}`
    const recentRevisited = checkRateLimit(recentFillerKey, opts)
    expect(recentRevisited.remaining).toBe(999_998)
  })

  it('taşma sonrası farklı anahtarlar birbirini etkilemeye devam etmez (izolasyon korunur)', () => {
    const opts = { limit: 2, windowMs: 60_000 }

    for (let i = 0; i < MAX_KEYS + 100; i++) {
      checkRateLimit(`bulk-${i}`, { limit: 1_000_000, windowMs: 60_000 })
    }

    const a1 = checkRateLimit('isolated-a', opts)
    const b1 = checkRateLimit('isolated-b', opts)
    expect(a1.success).toBe(true)
    expect(b1.success).toBe(true)

    const a2 = checkRateLimit('isolated-a', opts)
    expect(a2.success).toBe(true)
    expect(a2.remaining).toBe(0)

    // "isolated-b" hâlâ kendi (ilk) sayacında olmalı, "isolated-a"nın ikinci çağrısından
    // etkilenmemiş olmalı.
    const b2 = checkRateLimit('isolated-b', opts)
    expect(b2.remaining).toBe(0)
  })
})
