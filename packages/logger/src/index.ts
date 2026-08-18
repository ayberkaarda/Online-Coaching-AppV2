// Platformdan BAĞIMSIZ logger çekirdeği (ADR-0024 Ek-2, Faz 4.5 commit 5).
//
// Bu dosya `apps/web/src/lib/logger.ts`'ten AYRILDI. Ayrılma gerekçesi: `packages/api-client`'a
// taşınan modüller (`storage.ts`, `query/queryClient.ts`, `query/security-event.ts`,
// `hooks/useCatalog.ts`, `hooks/useFormChecks.ts`, `hooks/useSession.ts`) logger'a bağımlı;
// monorepo'da paketler uygulamalara bağımlı OLAMAZ (bağımlılık yönü tersine döner).
//
// pino dallanması (`createPinoLogger`, `NEXT_RUNTIME` kontrolü) BİLEREK burada DEĞİLDİR:
// `require('pino')` çağrısı Metro'nun (React Native) modül grafiğine girer ve `fs`/
// `worker_threads` bağımlılıkları polyfill'siz çözülemez. Gerçek pino tüketicileri
// (`apps/web` içindeki `lib/api/proxy.ts`, `lib/api/response.ts`, sign-in route, `proxy.ts`)
// zaten `apps/web`'de kaldığı için pino dalı da orada kalır ve bu çekirdeği import eder.
//
// GÜVENLİK: token/şifre gibi alanlar `REDACT_PATHS` (pino `redact`) ve `maskForConsole`
// (konsol adaptörü) ile maskelenir; hiçbir yerde ham kimlik bilgisi loglanmaz.

export interface Logger {
  trace(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
  fatal(obj: unknown, msg?: string): void
  child(bindings: Record<string, unknown>): Logger
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// A-11 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5): önceki liste yalnızca kimlik
// bilgisi alanlarını kapsıyordu (password/token/apiKey/authorization); bir profil/plan nesnesi
// olduğu gibi loglanırsa e-posta, kilo, makro, beslenme/antrenman planı düz metin sızıyordu.
// Bu liste PII + SAĞLIK verisini de kapsayacak şekilde genişletildi.
//
// KRİTİK TUZAK: pino'nun kendi log SATIRI mesajı `msg` anahtarındadır (`msgKey` varsayılanı),
// `message` DEĞİL — yani aşağıdaki `message` girdisi pino'nun `log.warn(obj, 'metin')`
// çağrısındaki insan-okunur `msg` alanını ASLA etkilemez; yalnızca loglanan NESNE içindeki
// (`obj.message`, `obj.foo.message` gibi) alanları hedefler. Bunu bir testle kanıtlıyoruz
// (`apps/web/tests/unit/logger-redact.test.ts`): redact sonrası `msg` alanı okunabilir kalıyor.
const SENSITIVE_KEYS = [
  // Kimlik bilgisi (önceki liste)
  'password',
  'token',
  'access_token',
  'apiKey',
  'authorization',
  // PII
  'email',
  'full_name',
  'phone',
  // Sağlık / plan verisi
  'current_weight',
  'weight',
  'height',
  'measurements',
  'macros',
  'nutrition_plan',
  'workout_plan',
  'notes',
  'coach_feedback',
  'message',
  'body',
]

/**
 * Loglardan tamamen çıkarılacak hassas alanlar. Her anahtar kök, `*.` (bir seviye iç içe) ve
 * `*.*.` (iki seviye iç içe) düzeyinde eşleştirilir — pino'nun `redact.paths` sözdizimi
 * (bkz. https://getpino.io/#/docs/redaction).
 */
export const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
  'req.headers.authorization',
  'req.headers["x-api-key"]',
]

// ---------------------------------------------------------------------------
// Konsol adaptörü için hafif maskeleme (A-11)
// ---------------------------------------------------------------------------
//
// `createConsoleLogger` pino KULLANMAZ (bkz. aşağıdaki not), yani pino'nun `redact` desteği
// tarayıcıda hiç devreye girmiyordu — konsola PII/sağlık verisi maskesiz basılıyordu. Harici
// paket eklemeden (bundle şişmesin diye), yalnızca ANAHTAR ADI eşleşmesine bakan sığ-tarama
// bir derin maskeleme uyguluyoruz. Değer tipine bakmaz (ör. iç içe obje/dizi de dahil).

/** Döngüsel referans + aşırı derinlikte sonsuz özyinelemeyi önlemek için sınır. */
const MAX_MASK_DEPTH = 8
const REDACTED_PLACEHOLDER = '[Redacted]'

function maskSensitiveDeep(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_MASK_DEPTH) return value

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveDeep(item, seen, depth + 1))
  }

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)

    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEYS.includes(key)
        ? REDACTED_PLACEHOLDER
        : maskSensitiveDeep(val, seen, depth + 1)
    }
    return result
  }

  return value
}

/** Konsol adaptöründe loglanan nesneyi (bindings dahil) maskeler. */
export function maskForConsole(value: unknown): unknown {
  return maskSensitiveDeep(value, new WeakSet(), 0)
}

// ---------------------------------------------------------------------------
// Konsol adaptörü (pino/browser yerine — bundle şişmesin)
// ---------------------------------------------------------------------------

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
}

export function createConsoleLogger(bindings: Record<string, unknown> = {}): Logger {
  const emit =
    (level: LogLevel) =>
    (obj: unknown, msg?: string): void => {
      const method = CONSOLE_METHOD[level]
      const prefix = `[${level}]`
      // A-11: bindings (`.child({...})` ile eklenen bağlam) ve `obj` (log çağrısına geçirilen
      // veri nesnesi) — pino'nun sunucu tarafındaki `redact`'inin tarayıcı karşılığı olarak
      // maskelenir. `msg` (insan-okunur metin) HİÇBİR ZAMAN maskelenmez — o zaten ayrı bir
      // parametre, bu fonksiyon ona hiç dokunmaz.
      const maskedBindings =
        Object.keys(bindings).length > 0
          ? (maskForConsole(bindings) as Record<string, unknown>)
          : undefined

      if (typeof obj === 'string' && msg === undefined) {
        if (maskedBindings) console[method](prefix, obj, maskedBindings)
        else console[method](prefix, obj)
        return
      }

      const maskedObj = maskForConsole(obj)
      if (maskedBindings) console[method](prefix, msg ?? '', maskedObj, maskedBindings)
      else console[method](prefix, msg ?? '', maskedObj)
    }

  return {
    trace: emit('trace'),
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
    fatal: emit('fatal'),
    child: (childBindings) => createConsoleLogger({ ...bindings, ...childBindings }),
  }
}

// ---------------------------------------------------------------------------
// Dışa açılan varsayılan logger (platformdan bağımsız)
// ---------------------------------------------------------------------------
//
// `packages/api-client`'ın (ve ileride `apps/mobile`'ın) kullandığı hazır örnek. Konsol
// adaptörü web ve mobilde BİREBİR aynı davrandığı için burada bir platform dallanması ya da
// context enjeksiyonu YOKTUR (ADR-0024 Ek-2, reddedilen alternatif (c)).
//
// `apps/web` bu örneği KULLANMAZ: kendi `src/lib/logger.ts`'i sunucuda pino'ya dallanan
// AYRI bir `logger` üretir. Tarayıcıda ikisi de aynı konsol adaptörüdür; sunucuda ise
// `packages/api-client` kodu zaten hiç çalışmaz (hepsi `'use client'` hook'u).
export const logger: Logger = createConsoleLogger()

/** İstek/bağlam bazlı alt logger. */
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId })
}
