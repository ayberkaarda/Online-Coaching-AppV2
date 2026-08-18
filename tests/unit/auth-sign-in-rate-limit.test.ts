import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A-01 (güvenlik denetimi, HIGH — giriş kaba kuvvet koruması) regresyon testleri.
//
// BAĞLAM: `supabase/config.toml`'daki `[auth.rate_limit]` konteynere ULAŞIYOR
// (`GOTRUE_RATE_LIMIT_OTP=30`) ama FİİLEN UYGULANMIYOR — canlı ölçüm: aynı IP'den 180 ardışık
// yanlış şifre → 180/180 HTTP 400, sıfır 429 (upstream hatası:
// github.com/supabase/supabase/issues/41947). Koruma bu yüzden uygulama katmanına
// (`/api/auth/sign-in` + `src/lib/api/auth-rate-limit.ts`) kuruldu.
//
// KIRMIZI-YEŞİL KANITI: `checkLoginQuota` içindeki e-posta kovası kontrolü devre dışı
// bırakılıp `{ allowed: true, ... }` döndürülürse "11. deneme 429" testi KIRILIR (11/11 istek
// 401 döner — yani düzeltme öncesi canlı davranışın birebir aynısı). Fiilen çalıştırılıp
// doğrulandı.
//
// `src/lib/supabase/server.ts` `server-only` içerir; route dosyası onu import ettiği için
// vitest (jsdom) ortamında etkisizleştirilmesi gerekir. `vi.mock` hoisting nedeniyle
// importlardan ÖNCE, dosyanın en üstünde olmalı.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createCookieBoundServerClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => {
  const silentLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((): typeof silentLogger => silentLogger),
  }
  return {
    logger: silentLogger,
    createRequestLogger: vi.fn((): typeof silentLogger => silentLogger),
  }
})

import { POST } from '@/app/api/auth/sign-in/route'
import { resetServerEnvCache } from '@/env.server'
import { LOGIN_FAILURE_LIMIT, normalizeEmail } from '@/lib/api/auth-rate-limit'
import { resetRateLimit } from '@/lib/rate-limit'
import { createCookieBoundServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

interface SignInResult {
  data: { session: Record<string, unknown> | null; user: Record<string, unknown> | null }
  error: { message: string; status?: number } | null
}

const VALID_PASSWORD = 'Passw0rd!23'
const WRONG_PASSWORD = 'YanlisSifre123!'

/** GoTrue'nun yanlış şifre / var olmayan hesap için döndürdüğü gerçek hata. */
const INVALID_CREDENTIALS: SignInResult = {
  data: { session: null, user: null },
  error: { message: 'Invalid login credentials', status: 400 },
}

/**
 * GoTrue sürüm/yapılandırmaya göre FARKLI bir metin de dönebilir. Kullanıcı sayımı testi
 * bilerek bu ayrımı zorlar: route her ikisini de aynı jenerik yanıta indirgemek zorundadır.
 */
const USER_NOT_FOUND: SignInResult = {
  data: { session: null, user: null },
  error: { message: 'User not found', status: 400 },
}

const SUCCESS: SignInResult = {
  data: {
    session: {
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-456',
      expires_at: 1_800_000_000,
      user: { id: '11111111-1111-4111-8111-111111111111' },
    },
    user: { id: '11111111-1111-4111-8111-111111111111' },
  },
  error: null,
}

const signInWithPassword = vi.fn<(credentials: unknown) => Promise<SignInResult>>()
const applyCookies = vi.fn()

function setSignInResult(result: SignInResult): void {
  signInWithPassword.mockResolvedValue(result)
}

function buildRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/auth/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

interface ErrorBody {
  error: { code: string; message: string; request_id?: string; details?: unknown }
}

async function attempt(
  email: string,
  password: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
  const response = await POST(buildRequest({ email, password }, headers))
  return {
    status: response.status,
    body: (await response.json()) as unknown,
    retryAfter: response.headers.get('Retry-After'),
  }
}

/** Ardışık N başarısız denemenin durum kodlarını döndürür. */
async function failNTimes(email: string, n: number, headers: Record<string, string> = {}) {
  const statuses: number[] = []
  for (let i = 0; i < n; i++) {
    statuses.push((await attempt(email, WRONG_PASSWORD, headers)).status)
  }
  return statuses
}

// ---------------------------------------------------------------------------

describe('POST /api/auth/sign-in — kaba kuvvet koruması (A-01)', () => {
  beforeEach(() => {
    // `getServerEnv()` (`resolveTrustedClientIp` üzerinden) tarayıcıda hata fırlatır; test
    // ortamı jsdom olduğu için gerçek sunucu ortamını simüle ediyoruz
    // (bkz. tests/unit/proxy-auth.test.ts'teki aynı desen).
    vi.stubGlobal('window', undefined)
    resetRateLimit()
    resetServerEnvCache()
    signInWithPassword.mockReset()
    applyCookies.mockReset()
    // A-05 (B-006): route artık cookie'ye bağlı istemciyi kullanıyor. Bu dosya hız sınırını
    // ölçer, cookie yazımını DEĞİL — gerçek `Set-Cookie` üretimi
    // `tests/unit/auth-cookie-session.test.ts` içinde, kütüphane mock'lanmadan doğrulanır.
    vi.mocked(createCookieBoundServerClient).mockReturnValue({
      supabase: { auth: { signInWithPassword } },
      applyCookies,
    } as unknown as ReturnType<typeof createCookieBoundServerClient>)
    setSignInResult(INVALID_CREDENTIALS)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetRateLimit()
    resetServerEnvCache()
  })

  // -------------------------------------------------------------------------
  // 1) Eşik
  // -------------------------------------------------------------------------

  it(`${LOGIN_FAILURE_LIMIT} başarısız denemeden sonra ${LOGIN_FAILURE_LIMIT + 1}. deneme 429 döner`, async () => {
    const email = 'kilit@example.com'

    const statuses = await failNTimes(email, LOGIN_FAILURE_LIMIT)
    expect(statuses).toEqual(Array<number>(LOGIN_FAILURE_LIMIT).fill(401))

    const blocked = await attempt(email, WRONG_PASSWORD)
    expect(blocked.status).toBe(429)
    expect((blocked.body as ErrorBody).error.code).toBe('LOGIN_RATE_LIMIT_EXCEEDED')

    // Düzeltme ÖNCESİ canlı davranış: 180/180 istek 400/401, sıfır 429.
    expect(statuses).not.toContain(429)
  })

  it('kilitli hesapta Supabase’e (upstream) HİÇ istek gitmez — GoTrue de korunur', async () => {
    const email = 'upstream@example.com'
    await failNTimes(email, LOGIN_FAILURE_LIMIT)
    expect(signInWithPassword).toHaveBeenCalledTimes(LOGIN_FAILURE_LIMIT)

    await attempt(email, WRONG_PASSWORD)
    expect(signInWithPassword).toHaveBeenCalledTimes(LOGIN_FAILURE_LIMIT)
  })

  it('kilitli hesaba istek yağdırmak pencereyi UZATMAZ (sayaç artmaz, Retry-After azalır)', async () => {
    const email = 'uzatma@example.com'
    await failNTimes(email, LOGIN_FAILURE_LIMIT)

    const first = await attempt(email, WRONG_PASSWORD)
    for (let i = 0; i < 20; i++) await attempt(email, WRONG_PASSWORD)
    const last = await attempt(email, WRONG_PASSWORD)

    expect(first.retryAfter).not.toBeNull()
    expect(last.retryAfter).not.toBeNull()
    expect(Number(last.retryAfter)).toBeLessThanOrEqual(Number(first.retryAfter))
  })

  // -------------------------------------------------------------------------
  // 2) Başarılı giriş sayacı sıfırlar
  // -------------------------------------------------------------------------

  it('başarılı giriş sayacı sıfırlar (9 başarısız + 1 başarılı + tekrar başarısızlar → hemen 429 olmaz)', async () => {
    const email = 'sifirla@example.com'

    const before = await failNTimes(email, LOGIN_FAILURE_LIMIT - 1)
    expect(before).toEqual(Array<number>(LOGIN_FAILURE_LIMIT - 1).fill(401))

    setSignInResult(SUCCESS)
    const ok = await attempt(email, VALID_PASSWORD)
    expect(ok.status).toBe(200)

    // Sayaç sıfırlandıysa yeniden TAM eşik kadar başarısız deneme hakkı olmalı.
    setSignInResult(INVALID_CREDENTIALS)
    const after = await failNTimes(email, LOGIN_FAILURE_LIMIT)
    expect(after).toEqual(Array<number>(LOGIN_FAILURE_LIMIT).fill(401))

    // Ve ancak ondan SONRA kilitlenmeli.
    expect((await attempt(email, WRONG_PASSWORD)).status).toBe(429)
  })

  it('başarılı giriş 200 döner; token GÖVDEDE TAŞINMAZ, oturum cookie olarak yazılır (A-05)', async () => {
    setSignInResult(SUCCESS)
    const response = await POST(buildRequest({ email: 'ok@example.com', password: VALID_PASSWORD }))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    // A-05 (B-006) regresyonu: token'lar `Set-Cookie`'ye taşındı, JSON gövdesinde OLMAMALI.
    expect(body.access_token).toBeUndefined()
    expect(body.refresh_token).toBeUndefined()
    // Cookie'ler yanıta gerçekten uygulanmalı (aksi halde tarayıcı oturumu hiç kurulmaz).
    expect(applyCookies).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  // -------------------------------------------------------------------------
  // 3) Farklı e-postalar birbirini kilitlemez  (IP TABANLI TASARIMA KAYMADIĞININ KANITI)
  // -------------------------------------------------------------------------

  it('farklı e-postalar birbirini KİLİTLEMEZ — anahtar IP değil e-postadır', async () => {
    // Saldırganın hedefi tamamen dolduruluyor...
    await failNTimes('kurban@example.com', LOGIN_FAILURE_LIMIT)
    expect((await attempt('kurban@example.com', WRONG_PASSWORD)).status).toBe(429)

    // ...ama BAŞKA bir kullanıcı (aynı istek kaynağı, aynı paylaşılan "unknown" IP kovası)
    // hiç etkilenmemeli. IP tabanlı bir tasarımda bu 429 olurdu — asıl regresyon budur.
    expect((await attempt('masum@example.com', WRONG_PASSWORD)).status).toBe(401)

    // Ve masum kullanıcı doğru şifreyle GİRİŞ YAPABİLMELİ (koruma DoS'a dönüşmemeli).
    setSignInResult(SUCCESS)
    expect((await attempt('masum@example.com', VALID_PASSWORD)).status).toBe(200)
  })

  it('yüzlerce farklı e-postaya saldırılsa bile (sprey) meşru kullanıcı giriş yapabilir — IP kovası paylaşılan "unknown" iken uygulanmaz', async () => {
    // TRUSTED_PROXY_COUNT varsayılanı 0 → güvenilir IP yok → IP kovası bilinçli olarak atlanır.
    for (let i = 0; i < 60; i++) {
      await attempt(`sprey${i}@example.com`, WRONG_PASSWORD)
    }

    setSignInResult(SUCCESS)
    expect((await attempt('mesru@example.com', VALID_PASSWORD)).status).toBe(200)
  })

  // -------------------------------------------------------------------------
  // 4) E-posta normalizasyonu (Türkçe locale tuzağı dahil)
  // -------------------------------------------------------------------------

  it('büyük/küçük harf ve boşluk farkı AYNI kovaya düşer (Test@Example.COM ≡ test@example.com)', async () => {
    const variants = [
      'test@example.com',
      'Test@Example.COM',
      'TEST@EXAMPLE.COM',
      '  test@example.com  ',
      'tEsT@eXaMpLe.CoM',
    ]

    // 10 deneme, biçimleri dönüşümlü kullanarak — hepsi tek kovaya düşmeli.
    const statuses: number[] = []
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
      const variant = variants[i % variants.length] as string
      statuses.push((await attempt(variant, WRONG_PASSWORD)).status)
    }
    expect(statuses).toEqual(Array<number>(LOGIN_FAILURE_LIMIT).fill(401))

    // 11. deneme — hangi biçimde gelirse gelsin kilitli olmalı.
    for (const variant of variants) {
      expect((await attempt(variant, WRONG_PASSWORD)).status).toBe(429)
    }
  })

  it("Türkçe I/ı tuzağı: 'IBRAHIM@...' ile 'ibrahim@...' AYNI kovaya düşer (tr-TR locale'inde düşmezdi)", async () => {
    // Bu, hız sınırlayıcıya GERÇEKTEN ULAŞAN Türkçe tuzağıdır ve tamamen ASCII'dir:
    // `toLocaleLowerCase()` argümansız çağrılıp sunucu tr-TR locale'inde olsaydı
    // 'I' → 'ı' olur, `IBRAHIM@x.com` ile `ibrahim@x.com` FARKLI kovalara düşer ve saldırgan
    // yalnızca büyük harfe geçerek limiti ikiye katlardı.
    const upper = 'IBRAHIM@Example.com'
    const lower = 'ibrahim@example.com'

    expect(normalizeEmail(upper)).toBe(normalizeEmail(lower))

    const statuses: number[] = []
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
      statuses.push((await attempt(i % 2 === 0 ? upper : lower, WRONG_PASSWORD)).status)
    }
    expect(statuses).toEqual(Array<number>(LOGIN_FAILURE_LIMIT).fill(401))
    expect((await attempt(upper, WRONG_PASSWORD)).status).toBe(429)
    expect((await attempt(lower, WRONG_PASSWORD)).status).toBe(429)
  })

  it('ASCII DIŞI yerel ad (İbrahim@...) hız sınırlayıcıya ulaşmadan 422 alır — istemci formuyla aynı davranış', async () => {
    // zod `.email()` regex'i yerel adda ASCII dışı karakter kabul etmez. Bu davranış
    // `loginSchema` (istemci formu) ile AYNIDIR, dolayısıyla böyle bir hesap zaten
    // oluşturulamaz. Sabitlenmesinin nedeni: ileride `.email()` gevşetilirse bu testin
    // düşüp normalizasyon kovası kararının yeniden gözden geçirilmesini zorlaması.
    const result = await attempt('İbrahim@example.com', WRONG_PASSWORD)
    expect(result.status).toBe(422)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('baştaki/sondaki boşluk trim edilir: "  a@b.com  " ile "a@b.com" AYNI kovaya düşer', async () => {
    const padded = '  bosluk@example.com  '
    const clean = 'bosluk@example.com'

    const statuses: number[] = []
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
      statuses.push((await attempt(i % 2 === 0 ? padded : clean, WRONG_PASSWORD)).status)
    }
    expect(statuses).toEqual(Array<number>(LOGIN_FAILURE_LIMIT).fill(401))
    expect((await attempt(padded, WRONG_PASSWORD)).status).toBe(429)

    // Supabase'e TRIM EDİLMİŞ e-posta gitmeli (aksi halde meşru giriş boşluk yüzünden düşer).
    const sentEmails = signInWithPassword.mock.calls.map(
      (call) => (call[0] as { email: string }).email
    )
    expect(sentEmails.every((sent) => sent === clean)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 5) Kullanıcı sayımı (user enumeration) yok
  // -------------------------------------------------------------------------

  it('yanlış şifre ile var olmayan hesap AYNI durum kodunu ve AYNI hata gövdesini döner', async () => {
    setSignInResult(INVALID_CREDENTIALS)
    const wrongPassword = await attempt('mevcut@example.com', WRONG_PASSWORD)

    setSignInResult(USER_NOT_FOUND)
    const noSuchUser = await attempt('yok@example.com', WRONG_PASSWORD)

    expect(wrongPassword.status).toBe(noSuchUser.status)
    expect(wrongPassword.status).toBe(401)

    const a = (wrongPassword.body as ErrorBody).error
    const b = (noSuchUser.body as ErrorBody).error

    expect(a.code).toBe(b.code)
    expect(a.message).toBe(b.message)
    expect(a.message).toBe('E-posta veya şifre hatalı!')
    // `details` hiçbirinde olmamalı — ayırt edici tek bir bit bile sızmamalı.
    expect(a.details).toBeUndefined()
    expect(b.details).toBeUndefined()
    // `request_id` her istekte farklıdır ama HER İKİSİNDE de vardır; varlığı/yokluğu ayırt
    // edici bir sinyal değildir. Alan kümeleri birebir aynı olmalı.
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())

    // GoTrue'nun ham metni ("User not found" vb.) istemciye ASLA sızmamalı.
    const rawWrong = JSON.stringify(wrongPassword.body)
    const rawMissing = JSON.stringify(noSuchUser.body)
    expect(rawMissing).not.toContain('User not found')
    expect(rawWrong).not.toContain('Invalid login credentials')
  })

  // -------------------------------------------------------------------------
  // 6) Retry-After
  // -------------------------------------------------------------------------

  it('429 yanıtı Retry-After başlığı taşır ve mesaj ne yapılacağını Türkçe söyler', async () => {
    const email = 'retry@example.com'
    await failNTimes(email, LOGIN_FAILURE_LIMIT)

    const blocked = await attempt(email, WRONG_PASSWORD)

    expect(blocked.status).toBe(429)
    expect(blocked.retryAfter).not.toBeNull()
    const seconds = Number(blocked.retryAfter)
    expect(Number.isInteger(seconds)).toBe(true)
    expect(seconds).toBeGreaterThan(0)
    expect(seconds).toBeLessThanOrEqual(15 * 60)

    const message = (blocked.body as ErrorBody).error.message
    expect(message).toContain('Çok fazla başarısız giriş denemesi')
    expect(message).toContain('dakika sonra tekrar deneyin')
    expect(message).toContain('şifrenizi sıfırlayın')
  })

  // -------------------------------------------------------------------------
  // 7) Girdi doğrulama
  // -------------------------------------------------------------------------

  it('bozuk JSON 400, geçersiz gövde 422 döner ve upstream çağrılmaz', async () => {
    const badJson = await POST(buildRequest('{ bozuk', {}))
    expect(badJson.status).toBe(400)
    expect(((await badJson.json()) as ErrorBody).error.code).toBe('INVALID_JSON')

    const badBody = await attempt('gecersiz-eposta', '')
    expect(badBody.status).toBe(422)
    expect((badBody.body as ErrorBody).error.code).toBe('VALIDATION_ERROR')

    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 8) İkincil IP kovası — YALNIZCA güvenilir IP çözülebiliyorsa
  // -------------------------------------------------------------------------

  it('TRUSTED_PROXY_COUNT=1 iken IP kovası devreye girer; farklı IP’ler birbirini etkilemez', async () => {
    vi.stubEnv('TRUSTED_PROXY_COUNT', '1')
    resetServerEnvCache()

    const attacker = { 'x-forwarded-for': '203.0.113.7' }
    const innocent = { 'x-forwarded-for': '198.51.100.4' }

    // Saldırgan IP'sinden bir hesabı kilitle.
    await failNTimes('hedef@example.com', LOGIN_FAILURE_LIMIT, attacker)
    expect((await attempt('hedef@example.com', WRONG_PASSWORD, attacker)).status).toBe(429)

    // Aynı IP'den BAŞKA bir e-posta hâlâ denenebilir (IP tavanı 300, çok cömert).
    expect((await attempt('baska@example.com', WRONG_PASSWORD, attacker)).status).toBe(401)

    // Farklı IP'den meşru kullanıcı etkilenmez.
    setSignInResult(SUCCESS)
    expect((await attempt('mesru@example.com', VALID_PASSWORD, innocent)).status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// `normalizeEmail` — Türkçe locale tuzağının birim testi
// ---------------------------------------------------------------------------

describe('normalizeEmail — Türkçe-güvenli (locale-invariant) normalizasyon', () => {
  it('trim + küçük harf uygular', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com')
  })

  it('idempotenttir', () => {
    const once = normalizeEmail('İbrahim@Example.com')
    expect(normalizeEmail(once)).toBe(once)
  })

  it("HOST locale'inden bağımsızdır: 'I' harfi Türkçedeki gibi noktasız 'ı'ya DÖNÜŞMEZ", () => {
    // TUZAK: `toLocaleLowerCase()` ARGÜMANSIZ çağrılırsa host locale'ini kullanır. Sunucu
    // tr-TR ise 'I' → 'ı' olur ve aynı hesap ortama göre FARKLI kovaya düşer; saldırgan
    // yalnızca büyük/küçük harf değiştirerek limiti atlayabilirdi.
    expect('KULLANICI@X.COM'.toLocaleLowerCase('tr')).toBe('kullanıcı@x.com') // tuzağın kanıtı
    expect(normalizeEmail('KULLANICI@X.COM')).toBe('kullanici@x.com') // bizim davranışımız
  })

  it("Türkçe 'İ' (U+0130) ile ayrık 'i'+U+0307 yazımı AYNI anahtara katlanır", () => {
    expect(normalizeEmail('İ@x.com')).toBe(normalizeEmail('i̇@x.com'))
  })

  it('ASCII olmayan diğer Türkçe harfler (ş, ğ, ü, ö, ç) bozulmadan küçültülür', () => {
    expect(normalizeEmail('ŞGÜÖÇ@x.com')).toBe('şgüöç@x.com')
  })
})
