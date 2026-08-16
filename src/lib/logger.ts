// Ortak logger arayüzü: sunucuda pino, tarayıcıda hafif konsol adaptörü.
// GÜVENLİK: token/şifre gibi alanlar pino `redact` listesiyle maskelenir;
// hiçbir yerde ham kimlik bilgisi loglanmaz.

import { getServerEnv } from '@/env'

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

/** Loglardan tamamen çıkarılacak hassas alanlar. */
const REDACT_PATHS = [
  '*.password',
  '*.token',
  '*.access_token',
  '*.apiKey',
  '*.authorization',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
]

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
      const context = Object.keys(bindings).length > 0 ? bindings : undefined

      if (typeof obj === 'string' && msg === undefined) {
        if (context) console[method](prefix, obj, context)
        else console[method](prefix, obj)
        return
      }

      if (context) console[method](prefix, msg ?? '', obj, context)
      else console[method](prefix, msg ?? '', obj)
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

      const env = getServerEnv()
      const baseOptions: Record<string, unknown> = {
        level: env.LOG_LEVEL,
        redact: { paths: REDACT_PATHS, remove: true },
      }

      // Geliştirmede okunabilir çıktı; pino-pretty kurulu değilse sessizce JSON'a düşer.
      if (env.NODE_ENV === 'development') {
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
