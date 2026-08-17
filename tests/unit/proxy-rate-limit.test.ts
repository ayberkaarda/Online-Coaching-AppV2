import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { resetServerEnvCache } from '@/env'
import { resetRateLimit } from '@/lib/rate-limit'
import { proxy } from '@/proxy'

// A-02 (güvenlik denetimi, findings-app-surface.md §3.2): `src/proxy.ts` eskiden
// `X-Forwarded-For`'un İLK değerini sorgusuz kabul ediyordu. Canlı kanıt: dönen (her istekte
// farklı) XFF ile 25/25 istek kabul edildi, tek bir 429 yok, `Remaining` hep 19'da kaldı —
// hız sınırlayıcı fiilen atlandı.
//
// A-18 (aynı rapor, aynı bölüm): 3 AI route'u (`/api/ai/workout`, `/api/ai/nutrition`,
// `/api/ai/recommendations`) yola bağlı ayrı kovalarda olduğu için aynı IP fiilen limit×3
// istek atabiliyordu.
//
// KIRMIZI-YEŞİL KANITI (A-02): bu dosyadaki "dönen XFF" testi, düzeltmeden ÖNCEKİ kodla
// (XFF'in ilk değerini koşulsuz güvenen `getClientIp`) KIRMIZI olur — her istek farklı bir
// kovaya düşer, hiçbiri 429 almaz. Düzeltmeden SONRA (varsayılan `TRUSTED_PROXY_COUNT=0`
// iken hiçbir başlığa güvenilmeyip tüm istekler ortak "unknown" kovasında toplanması)
// YEŞİL olur.
//
// NOT: Test ortamı `jsdom`dır, `window` her zaman tanımlıdır; `getServerEnv()` sunucu dışı
// ortamda hata fırlattığından `vi.stubGlobal('window', undefined)` ile simüle ediyoruz
// (bkz. tests/unit/proxy-auth.test.ts'teki aynı desen).

function buildRequest(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers })
}

describe('proxy — IP güven modeli ve hız sınırı kovası (A-02, A-18)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    resetServerEnvCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetRateLimit()
    resetServerEnvCache()
  })

  it('[A-02, kontrol grubu] sabit XFF ile ardışık istekler limit aşılınca 429 döner', () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '3')
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000')
    resetServerEnvCache()

    const statuses: number[] = []
    for (let i = 1; i <= 5; i++) {
      const response = proxy(buildRequest('/api/some-route', { 'x-forwarded-for': '203.0.113.9' }))
      statuses.push(response.status)
    }

    expect(statuses).toEqual([200, 200, 200, 429, 429])
  })

  it('[A-02, bypass denemesi] her istekte FARKLI bir XFF gönderilse bile (denetimdeki canlı senaryoyla birebir aynı) limit aşılınca 429 döner — TRUSTED_PROXY_COUNT yapılandırılmadığı sürece XFF güvenilmez', () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '3')
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000')
    resetServerEnvCache()

    const statuses: number[] = []
    for (let i = 1; i <= 5; i++) {
      const response = proxy(
        buildRequest('/api/some-route', { 'x-forwarded-for': `198.51.100.${i}` })
      )
      statuses.push(response.status)
    }

    // Düzeltme ÖNCESİ: [200,200,200,200,200] (25/25 kabul, audit §3.2 Test 2 ile aynı desen).
    // Düzeltme SONRASI: sabit XFF testiyle AYNI sonuç — bypass kapandı.
    expect(statuses).toEqual([200, 200, 200, 429, 429])
  })

  it('[A-02] TRUSTED_PROXY_COUNT=1 iken zincirin SONDAN 1. değeri (güvenilir hop tarafından eklenen) kullanılır; istemcinin soldaki sahte değeri yok sayılır', () => {
    vi.stubEnv('RATE_LIMIT_MAX_REQUESTS', '1')
    vi.stubEnv('RATE_LIMIT_WINDOW_MS', '60000')
    vi.stubEnv('TRUSTED_PROXY_COUNT', '1')
    resetServerEnvCache()

    // İstemci "1.1.1.1" diye sahteler; güvenilir TEK proxy kendi gördüğü gerçek bağlantı
    // IP'sini ("9.9.9.9") SONA ekler -> zincir "1.1.1.1, 9.9.9.9" -> sondan 1. = 9.9.9.9.
    const r1 = proxy(buildRequest('/api/some-route', { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))
    expect(r1.status).toBe(200)

    // İkinci istekte istemci SOLDAKİ (sahteleyebildiği) değeri değiştirse bile SAĞDAKİ
    // (proxy'nin eklediği, sahtelenemeyen) değer aynıysa aynı kovaya düşer -> limit(1) aşılır.
    const r2 = proxy(buildRequest('/api/some-route', { 'x-forwarded-for': '2.2.2.2, 9.9.9.9' }))
    expect(r2.status).toBe(429)

    // Üçüncü istekte güvenilir proxy'nin eklediği GERÇEK IP farklıysa (10.10.10.10) bu meşru
    // farklı bir kullanıcıdır, kendi kovasında başarılı olmalı.
    const r3 = proxy(buildRequest('/api/some-route', { 'x-forwarded-for': '1.1.1.1, 10.10.10.10' }))
    expect(r3.status).toBe(200)
  })

  it("[A-18] farklı AI route'ları (workout/nutrition/recommendations) aynı IP için AYNI paylaşılan kovayı kullanır", () => {
    resetServerEnvCache()
    const headers = { 'x-forwarded-for': 'ignored-because-untrusted-by-default' }

    const r1 = proxy(buildRequest('/api/ai/workout', headers))
    expect(r1.headers.get('X-RateLimit-Remaining')).toBe('19')

    const r2 = proxy(buildRequest('/api/ai/nutrition', headers))
    // Ayrı bir route ama AYNI paylaşılan AI kovası (`${ip}:ai`) -> 18, yeniden 19 DEĞİL.
    expect(r2.headers.get('X-RateLimit-Remaining')).toBe('18')

    const r3 = proxy(buildRequest('/api/ai/recommendations', headers))
    expect(r3.headers.get('X-RateLimit-Remaining')).toBe('17')
  })

  it('[A-17] /api/health artık hız sınırından muaf değildir (cömert bir tavana tabidir)', () => {
    resetServerEnvCache()
    const response = proxy(buildRequest('/api/health'))

    expect(response.status).toBe(200)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('120')
  })
})
