import { Writable } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

// A-11 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5) regresyon testleri:
// `REDACT_PATHS` önceden yalnızca kimlik bilgisi alanlarını (password/token/apiKey/
// authorization) kapsıyordu — bir profil/plan nesnesi olduğu gibi loglanırsa e-posta, kilo,
// makro, beslenme/antrenman planı düz metin sızıyordu.
//
// Bu dosya İKİ ayrı yüzeyi test eder:
//   1) Sunucu (pino) — gerçek bir pino örneği kurup `REDACT_PATHS`'i kullanarak çıktıyı okur.
//   2) Tarayıcı (`createConsoleLogger`) — `logger` singleton'ı jsdom'da (`window` tanımlı)
//      otomatik olarak konsol adaptörüne düşer; `console.*` casus (spy) ile doğrulanır.
//
// KRİTİK TUZAK doğrulaması: pino'nun log satırı mesajı `msg` anahtarındadır (`message` DEĞİL).
// `REDACT_PATHS` içindeki `message`/`*.message`/`*.*.message` girdileri yalnızca loglanan
// NESNE içindeki `message` alanlarını hedefler — `log.warn(obj, 'insan-okunur metin')`
// çağrısındaki `msg` alanını ASLA bozmaz. Aşağıdaki testler bunu birebir kanıtlıyor.

import { logger, maskForConsole, REDACT_PATHS } from '@/lib/logger'

// ---------------------------------------------------------------------------
// 1) Sunucu (pino) — gerçek REDACT_PATHS ile
// ---------------------------------------------------------------------------

/** Senkron okunabilir bir yazılabilir akış kurar; her `write` çağrısı bir JSON log satırıdır. */
function makeCaptureStream(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString('utf-8'))
      cb()
    },
  })
  return {
    stream,
    lines: () => chunks.map((c) => JSON.parse(c) as Record<string, unknown>),
  }
}

// `require`, `pino`'yu test ortamında (Node altında çalışan vitest) doğrudan yükler — asıl
// `src/lib/logger.ts` bunu yalnızca `NEXT_RUNTIME==='nodejs'` iken yapar; burada REDACT_PATHS'in
// pino'nun GERÇEK redact motoruyla birlikte davranışını doğrudan test etmek istiyoruz.
const pino = require('pino') as (
  opts: Record<string, unknown>,
  stream: Writable
) => {
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
}

function makeServerLogger() {
  const capture = makeCaptureStream()
  // `base: null, timestamp: false`: pid/hostname/time alanlarını KALDIRIR — bu testler ham
  // alan değerlerinin log SATIRINDA (JSON.stringify(line)) hiç geçmediğini doğruluyor; epoch
  // zaman damgası gibi rastgele büyük sayılar olmadan bu kontrol DETERMİNİSTİK kalır (aksi
  // halde ör. "2200" gibi bir alt-dize, epoch'un rastgele basamaklarıyla çakışabilirdi).
  const log = pino(
    { redact: { paths: REDACT_PATHS, remove: true }, base: null, timestamp: false },
    capture.stream
  )
  return { log, lines: capture.lines }
}

describe('REDACT_PATHS — sunucu (pino)', () => {
  it('kök seviyede email/current_weight/nutrition_plan MASKELENİR, msg BOZULMAZ', () => {
    const { log, lines } = makeServerLogger()

    log.info(
      {
        email: 'kullanici@example.com',
        current_weight: 82.5,
        nutrition_plan: { calories: 2200, protein_g: 180 },
      },
      'Profil güncellendi'
    )

    const [line] = lines()
    expect(line).toBeDefined()
    // Asıl log mesajı (`msg`) bozulmamalı — bu, `message` redact tuzağının GERÇEKTEN
    // çözüldüğünün kanıtıdır.
    expect(line?.msg).toBe('Profil güncellendi')
    expect(line?.email).toBeUndefined()
    expect(line?.current_weight).toBeUndefined()
    expect(line?.nutrition_plan).toBeUndefined()

    const raw = JSON.stringify(line)
    expect(raw).not.toContain('kullanici@example.com')
    expect(raw).not.toContain('82.5')
    expect(raw).not.toContain('2200')
  })

  it('*. seviyesinde (bir iç içe) email/full_name/phone MASKELENİR', () => {
    const { log, lines } = makeServerLogger()

    log.warn(
      { profile: { email: 'gizli@example.com', full_name: 'Ayşe Yılmaz', phone: '+905551112233' } },
      'Kullanıcı profili işlendi'
    )

    const [line] = lines()
    const profile = line?.profile as Record<string, unknown> | undefined
    expect(profile).toBeDefined()
    expect(profile?.email).toBeUndefined()
    expect(profile?.full_name).toBeUndefined()
    expect(profile?.phone).toBeUndefined()

    const raw = JSON.stringify(line)
    expect(raw).not.toContain('gizli@example.com')
    expect(raw).not.toContain('Ayşe Yılmaz')
    expect(raw).not.toContain('+905551112233')
  })

  it('*.*. seviyesinde (iki iç içe) macros/measurements/weight/height MASKELENİR', () => {
    const { log, lines } = makeServerLogger()

    log.info(
      {
        payload: {
          // NOT: sarmalayıcı anahtar bilerek "body" DEĞİL "stats" — "body" kendisi de
          // SENSITIVE_KEYS listesinde olduğundan `*.body` yolu bu nesneyi zaten kök seviyede
          // (bir üst seviyede) redakte ederdi; bu test özellikle *.*. (iki iç içe) davranışını
          // izole test etmek istiyor.
          stats: {
            macros: { protein: 180, carbs: 250, fat: 70 },
            measurements: { waist: 82, chest: 100 },
            weight: 78.2,
            height: 178,
          },
        },
      },
      'AI proxy başarılı'
    )

    const [line] = lines()
    const payload = line?.payload as Record<string, unknown> | undefined
    const nested = payload?.stats as Record<string, unknown> | undefined
    expect(nested).toBeDefined()
    expect(nested?.macros).toBeUndefined()
    expect(nested?.measurements).toBeUndefined()
    expect(nested?.weight).toBeUndefined()
    expect(nested?.height).toBeUndefined()

    const raw = JSON.stringify(line)
    expect(raw).not.toContain('82')
    expect(raw).not.toContain('178')
  })

  it('workout_plan/notes/coach_feedback ve nesne-içi message alanı MASKELENİR', () => {
    const { log, lines } = makeServerLogger()

    log.info(
      {
        workout_plan: { split: 'ppl' },
        notes: 'danışan diz sakatlığı bildirdi',
        coach_feedback: 'form iyi, ağırlığı artır',
        message: 'bu nesnenin İÇİNDEKİ message alanı — msg DEĞİL',
      },
      'Gerçek log mesajı burada'
    )

    const [line] = lines()
    expect(line?.workout_plan).toBeUndefined()
    expect(line?.notes).toBeUndefined()
    expect(line?.coach_feedback).toBeUndefined()
    // Nesne içindeki `message` alanı redakte edilmiş olmalı...
    expect(line?.message).toBeUndefined()
    // ...ama pino'nun KENDİ `msg` alanı (asıl log satırı metni) BOZULMADAN kalmalı.
    expect(line?.msg).toBe('Gerçek log mesajı burada')
  })

  it('parola/token gibi eski (Grup öncesi) alanlar hâlâ maskeleniyor (regresyon)', () => {
    const { log, lines } = makeServerLogger()

    log.warn({ password: 'ultra-gizli-123', token: 'jwt-abc.def.ghi' }, 'Giriş denemesi')

    const [line] = lines()
    expect(line?.password).toBeUndefined()
    expect(line?.token).toBeUndefined()
    expect(line?.msg).toBe('Giriş denemesi')
  })
})

// ---------------------------------------------------------------------------
// 2) Tarayıcı adaptörü — jsdom'da `logger` singleton'ı console'a düşer
// ---------------------------------------------------------------------------

describe('logger (tarayıcı adaptörü, jsdom) — konsola PII/sağlık verisi maskesiz basılmaz', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('email/current_weight içeren nesne console.info’a MASKELİ olarak gider, msg metni bozulmaz', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logger.info({ email: 'tarayici@example.com', current_weight: 91 }, 'Profil kaydedildi')

    expect(spy).toHaveBeenCalledTimes(1)
    const args = spy.mock.calls[0]
    if (!args) throw new Error('console.info çağrılmadı')

    // İkinci argüman `msg` metnidir — bozulmamış olmalı.
    expect(args[1]).toBe('Profil kaydedildi')

    // Nesne argümanının SERİLEŞTİRİLMİŞ hali ham e-posta/kiloyu İÇERMEMELİ.
    const objArg = args[2]
    const raw = JSON.stringify(objArg)
    expect(raw).not.toContain('tarayici@example.com')
    expect(raw).not.toContain('91')
    expect(raw).toContain('[Redacted]')
  })

  it('warn seviyesinde nested (bir iç içe) email de maskelenir', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.warn({ user: { email: 'nested@example.com' } }, 'Uyarı')

    const args = spy.mock.calls[0]
    if (!args) throw new Error('console.warn çağrılmadı')
    const raw = JSON.stringify(args[2])
    expect(raw).not.toContain('nested@example.com')
    expect(raw).toContain('[Redacted]')
  })
})

// ---------------------------------------------------------------------------
// 3) `maskForConsole` — birim testleri (döngüsel referans, derinlik sınırı)
// ---------------------------------------------------------------------------

describe('maskForConsole', () => {
  it('hassas olmayan alanları DEĞİŞTİRMEDEN bırakır', () => {
    const input = { userId: 'abc-123', status: 'ok', count: 5 }
    expect(maskForConsole(input)).toEqual(input)
  })

  it('döngüsel referansta sonsuz döngüye girmeden [Circular] üretir', () => {
    const obj: Record<string, unknown> = { email: 'a@b.com' }
    obj.self = obj

    expect(() => maskForConsole(obj)).not.toThrow()
    const result = maskForConsole(obj) as Record<string, unknown>
    expect(result.email).toBe('[Redacted]')
    expect(result.self).toBe('[Circular]')
  })

  it('dizi içindeki nesnelerde de maskeleme uygulanır', () => {
    const input = [{ email: 'x@y.com' }, { email: 'z@y.com' }]
    const result = maskForConsole(input) as Array<Record<string, unknown>>
    expect(result[0]?.email).toBe('[Redacted]')
    expect(result[1]?.email).toBe('[Redacted]')
  })

  it('string/number/null gibi ilkel değerleri OLDUĞU GİBİ döner', () => {
    expect(maskForConsole('hello')).toBe('hello')
    expect(maskForConsole(42)).toBe(42)
    expect(maskForConsole(null)).toBeNull()
  })
})
