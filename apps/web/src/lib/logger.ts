// Ortak logger arayüzü: sunucuda pino, tarayıcıda hafif konsol adaptörü.
// GÜVENLİK: token/şifre gibi alanlar pino `redact` listesiyle maskelenir;
// hiçbir yerde ham kimlik bilgisi loglanmaz.
//
// AC-11 (güvenlik denetimi, findings-access-control.md): bu dosya TARAYICIDA DA ÇALIŞIYOR
// (bkz. `createConsoleLogger` aşağıda). `@/env.server`'ın `import 'server-only'` içermesi
// nedeniyle bu dosyada modül tepe seviyesinde `@/env.server` import etmek istemci build'ini
// TAMAMEN KIRAR. Bu yüzden `@/env` (client env) importu da BİLEREK YOK — `getServerEnv()`
// yalnızca aşağıdaki `createPinoLogger()` içindeki `NEXT_RUNTIME === 'nodejs'` dalında
// gerekiyordu ve o dal zaten istemci derlemesinde sabit `false` olup tamamen elendiği için,
// ihtiyaç duyulan İKİ değer (`LOG_LEVEL`, `NODE_ENV`) doğrudan `process.env`'den okunuyor.
// Zod şeması yerine basit bir allowlist + `'info'` varsayılanı yeterli: bu değerler yalnızca
// pino seçenekleri için kullanılıyor, güvenlik kritik bir doğrulama değil.

export interface Logger {
  trace(obj: unknown, msg?: string): void
  debug(obj: unknown, msg?: string): void
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
  fatal(obj: unknown, msg?: string): void
  child(bindings: Record<string, unknown>): Logger
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// A-11 (güvenlik denetimi, findings-app-surface.md §2/§5 Grup 5): önceki liste yalnızca kimlik
// bilgisi alanlarını kapsıyordu (password/token/apiKey/authorization); bir profil/plan nesnesi
// olduğu gibi loglanırsa e-posta, kilo, makro, beslenme/antrenman planı düz metin sızıyordu.
// Bu liste PII + SAĞLIK verisini de kapsayacak şekilde genişletildi.
//
// KRİTİK TUZAK: pino'nun kendi log SATIRI mesajı `msg` anahtarındadır (`msgKey` varsayılanı),
// `message` DEĞİL — yani aşağıdaki `message` girdisi pino'nun `log.warn(obj, 'metin')`
// çağrısındaki insan-okunur `msg` alanını ASLA etkilemez; yalnızca loglanan NESNE içindeki
// (`obj.message`, `obj.foo.message` gibi) alanları hedefler. Bunu bir testle kanıtlıyoruz
// (`tests/unit/logger-redact.test.ts`): redact sonrası `msg` alanı bozulmadan okunabilir kalıyor.
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
// Tarayıcı adaptörü için hafif maskeleme (A-11)
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

/** Tarayıcı konsol adaptöründe loglanan nesneyi (bindings dahil) maskeler. */
export function maskForConsole(value: unknown): unknown {
  return maskSensitiveDeep(value, new WeakSet(), 0)
}

// ---------------------------------------------------------------------------
// Tarayıcı adaptörü (pino/browser yerine — bundle şişmesin)
// ---------------------------------------------------------------------------

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
}

function createConsoleLogger(bindings: Record<string, unknown> = {}): Logger {
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
// Sunucu (pino)
// ---------------------------------------------------------------------------

type PinoLike = Logger & { child(bindings: Record<string, unknown>): PinoLike }
type PinoFactory = (options: Record<string, unknown>) => PinoLike

// `require` @types/node olmadan da tiplensin diye yerel bildirim.
declare const require: ((id: string) => unknown) | undefined

/**
 * pino'yu YALNIZCA Node.js sunucu çalışma zamanında yükler.
 * `process.env.NEXT_RUNTIME` istemci derlemesinde sabit olarak değiştiği için
 * bu dal client bundle'dan tamamen elenir.
 */
function createPinoLogger(): Logger | null {
  // Bu koşul istemci derlemesinde sabit `false` olur; blok tamamen elenir.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      if (typeof require !== 'function') return null

      const mod = require('pino') as PinoFactory | { default: PinoFactory }
      const pino: PinoFactory = typeof mod === 'function' ? mod : mod.default

      // `@/env.server`'ın zod şeması yerine basit bir allowlist: bu iki değer yalnızca pino
      // seçenekleri için kullanılıyor (güvenlik kritik doğrulama değil), `@/env.server`'ı
      // import etmeden (yukarıdaki dosya-üstü not) aynı varsayılanları üretir.
      const VALID_LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
      const rawLogLevel = process.env.LOG_LEVEL
      const logLevel = (VALID_LOG_LEVELS as readonly string[]).includes(rawLogLevel ?? '')
        ? (rawLogLevel as (typeof VALID_LOG_LEVELS)[number])
        : 'info'
      const nodeEnv = process.env.NODE_ENV

      const baseOptions: Record<string, unknown> = {
        level: logLevel,
        redact: { paths: REDACT_PATHS, remove: true },
      }

      // Geliştirmede okunabilir çıktı; pino-pretty kurulu değilse sessizce JSON'a düşer.
      if (nodeEnv === 'development') {
        try {
          return pino({
            ...baseOptions,
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
            },
          })
        } catch {
          return pino(baseOptions)
        }
      }

      return pino(baseOptions)
    } catch {
      // pino yüklenemedi (ör. edge runtime, test ortamı) — konsol adaptörüne düş.
      return null
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Dışa açılan logger
// ---------------------------------------------------------------------------

function createLogger(): Logger {
  if (typeof window !== 'undefined') return createConsoleLogger()
  return createPinoLogger() ?? createConsoleLogger()
}

export const logger: Logger = createLogger()

/** İstek bazlı bağlam taşıyan alt logger (route handler'larda kullanılır). */
export function createRequestLogger(requestId: string): Logger {
  return logger.child({ requestId })
}
