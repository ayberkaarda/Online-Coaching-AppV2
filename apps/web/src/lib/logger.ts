// Sunucu (pino) logger dalı + ortak logger giriş noktası.
//
// Faz 4.5 commit 5 (ADR-0024 Ek-2): dosyanın PLATFORMDAN BAĞIMSIZ çekirdeği — `Logger`
// arayüzü, `REDACT_PATHS`, `maskForConsole`, `createConsoleLogger` — `@repo/logger`'a taşındı.
// Burada YALNIZCA sunucuya özgü pino dalı ve `typeof window` dallanan orkestratör kaldı;
// gerekçe: `packages/api-client` (ve ileride `apps/mobile`) logger'a bağımlı ve paketler
// uygulamalara bağımlı olamaz, ama pino'nun `require('pino')` çağrısı Metro'da çözülemez.
// Gerçek pino tüketicileri (`src/lib/api/proxy.ts`, `response.ts`, sign-in route, `src/proxy.ts`)
// zaten burada, `apps/web`'de.
//
// GÜVENLİK: token/şifre gibi alanlar pino `redact` listesiyle (`REDACT_PATHS`) maskelenir;
// hiçbir yerde ham kimlik bilgisi loglanmaz.
//
// AC-11 (güvenlik denetimi, findings-access-control.md): bu dosya TARAYICIDA DA ÇALIŞIYOR
// (`createLogger` altındaki konsol dalı). `@/env.server`'ın `import 'server-only'` içermesi
// nedeniyle bu dosyada modül tepe seviyesinde `@/env.server` import etmek istemci build'ini
// TAMAMEN KIRAR. Bu yüzden `@/env` (client env) importu da BİLEREK YOK — `getServerEnv()`
// yalnızca aşağıdaki `createPinoLogger()` içindeki `NEXT_RUNTIME === 'nodejs'` dalında
// gerekiyordu ve o dal zaten istemci derlemesinde sabit `false` olup tamamen elendiği için,
// ihtiyaç duyulan İKİ değer (`LOG_LEVEL`, `NODE_ENV`) doğrudan `process.env`'den okunuyor.
// Zod şeması yerine basit bir allowlist + `'info'` varsayılanı yeterli: bu değerler yalnızca
// pino seçenekleri için kullanılıyor, güvenlik kritik bir doğrulama değil.

import { REDACT_PATHS, createConsoleLogger, maskForConsole, type Logger } from '@repo/logger'

// Çekirdeğin dışa açık yüzeyi `@/lib/logger` üzerinden de erişilebilir kalır: `apps/web`
// içindeki 6 tüketici (`ErrorBoundary`, `app/error.tsx`, `proxy.ts`, `api/proxy.ts`,
// `api/response.ts`, sign-in route) ve `tests/unit/logger-redact.test.ts` import yolunu
// değiştirmek zorunda kalmasın.
export { REDACT_PATHS, createConsoleLogger, maskForConsole }
export type { Logger }

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
