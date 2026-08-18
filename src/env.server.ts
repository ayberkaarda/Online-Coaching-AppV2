// Sunucu tarafı ortam değişkenlerinin çalışma zamanı doğrulaması (zod).
//
// AC-11 (güvenlik denetimi, findings-access-control.md): önceden bu şema `src/env.ts` içinde,
// `clientEnv` ile AYNI modülde, modül tepe seviyesinde yaşıyordu. `src/env.ts` istemci
// bundle'ına dahil edildiği için `SUPABASE_SERVICE_ROLE_KEY`, `AI_BACKEND_URL`,
// `AI_BACKEND_API_KEY`, `TRUSTED_PROXY_COUNT` gibi değişken ADLARI (değerler değil, ama
// adların kendisi de hassastır — saldırgana hangi sunucu sırlarının var olduğunu, dolayısıyla
// nereyi hedefleyeceğini söyler) istemci paketine string sabiti olarak gömülüyordu.
//
// `import 'server-only'` bu dosyanın YANLIŞLIKLA bir istemci bileşeninden/modülünden import
// edilmesini build-time hatasına çevirir (bkz. `src/lib/api/proxy.ts` satır 1 — aynı desen
// projede zaten kullanılıyor).
import 'server-only'

import { z } from 'zod'

import { formatEnvError } from '@/env.shared'

const serverSchema = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    AI_BACKEND_URL: z.string().url().default('http://localhost:8000'),
    AI_BACKEND_API_KEY: z.string().optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
    // A-02 (güvenlik denetimi, findings-app-surface.md §3.2): `src/proxy.ts` hız sınırlayıcısı
    // `X-Forwarded-For`/`X-Real-IP` başlıklarını sorgusuz kabul ediyordu; istemci bu başlıkları
    // serbestçe ayarlayabildiği için sınırlayıcı tamamen atlanabiliyordu (canlı kanıt: dönen XFF
    // ile 25/25 istek kabul edildi). Kaç GÜVENİLEN ters proxy'nin XFF zincirine kendi gördüğü
    // IP'yi eklediğini belirtir; sondan bu kadar hop güvenilir sayılır (bkz. `src/proxy.ts`
    // `getClientIp`). VARSAYILAN 0'DIR — yapılandırılmamışsa hiçbir başlığa güvenilmez
    // (güvenli varsayılan): sahte başlıkla sınırsız kova üretmek, aşırı sıkı paylaşılan bir
    // kovadan daha kötüdür. Tek-hop güvenilir bir edge'in (ör. Vercel) arkasında 1 yapın.
    TRUSTED_PROXY_COUNT: z.coerce.number().int().nonnegative().default(0),
  })
  .superRefine((env, ctx) => {
    // A-12 (güvenlik denetimi, findings-app-surface.md §3.4/§7 Grup 1): `AI_BACKEND_API_KEY`
    // production'da opsiyonel bırakılırsa, ai_backend tarafındaki A-04 (anahtar ayarlanmamışsa
    // guard'ın no-op/fail-open olması) ile birleşip her iki uç da SESSİZCE kimliksiz çalışır.
    // Prod'da eksikse build/başlangıçta anlaşılır bir hatayla fail-fast et; dev/test'te
    // opsiyonel kalır (aksi halde mevcut test zinciri kırılır).
    if (env.NODE_ENV === 'production' && !env.AI_BACKEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_BACKEND_API_KEY'],
        message:
          'Production ortamında AI_BACKEND_API_KEY zorunludur. ai_backend servisinin API_KEY ' +
          "ortam değişkeniyle aynı değeri ayarlayın; aksi halde AI backend guard'ı kimliksiz " +
          'isteklere açık kalabilir (bkz. docs/security/findings-app-surface.md A-04/A-12).',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverSchema>

/**
 * KATMAN 2 — BARINDIRILAN (hosted) SUPABASE PROJESİNE KAZA ESERİ SUNUCU TARAFI ERİŞİM.
 *
 * KAPATILAN YOL: bu süreçte `SUPABASE_SERVICE_ROLE_KEY` ile atılan her istek RLS'i BAYPAS
 * eder. Yerelde çalıştığını sanan bir `pnpm run build && pnpm run start` (ya da bir bakım
 * script'i) barındırılan projeye yönlendirilmişse, gerçek production verisini hiçbir satır
 * seviyesinde politika durdurmadan yazabilir/silebilir. Bu, kaza eseri yazmanın EN PAHALI
 * yoludur, o yüzden burada FAIL-CLOSED kesilir.
 *
 * `NODE_ENV`'E KASITLI OLARAK KOŞULLANMADI. İlk akla gelen `NODE_ENV !== 'production'`
 * koşulu İŞE YARAMAZ: tehlikeli yol tam olarak `pnpm run build && pnpm run start` üzerinden
 * geçer ve `next start` NODE_ENV=production ile koşar. Guard, korumaya çalıştığı senaryonun
 * içinde kendini kapatırdı. Bunun regresyon testi: `tests/unit/env-hosted-guard.test.ts`
 * ("NODE_ENV=production iken de fırlatır").
 *
 * NEYİ KAPATMAZ: tarayıcıdan DOĞRUDAN Supabase'e giden yazmaları (ör. `daily-log`). Bu dosya
 * `server-only`'dir, kodu istemci paketine hiç girmez; proxy yalnızca `/api/*` görür. Uzak
 * hedefe giden tarayıcı yolu KATMAN 0 (`.env.local` artık yerel yığını gösterir) ve KATMAN 1
 * (`playwright.config.ts` iddiası) ile kapatılır. Aynı sebeple gerçek production'da tarayıcı
 * barındırılan projeye MEŞRU şekilde bağlanmaya devam eder — bu guard onu etkilemez.
 *
 * NE ZAMAN DEĞERLENDİRİLİR: `NEXT_PUBLIC_*` değişkenleri sunucu paketine de BUILD-TIME'da
 * gömülür, yani aşağıdaki `process.env.NEXT_PUBLIC_SUPABASE_URL` uygulamanın BUILD ALINDIĞI
 * hedefi verir (ölçüldü: `next start` sırasında bu değişkeni değiştirmek guard'ın gördüğü
 * değeri değiştirmez). Bu istenen davranıştır — uygulamanın gerçekten konuşacağı proje
 * build-time'da belirlenir. `ALLOW_HOSTED_TARGET` ise sıradan bir sunucu değişkeni olduğu için
 * ÇALIŞMA ZAMANINDA okunur; yeniden build almadan verilebilir. Guard `next build`'i DÜŞÜRMEZ
 * (build `getServerEnv()` çağırmaz), ilk İSTEKTE düşer.
 *
 * DEPLOY SÖZLEŞMESİ: gerçek production ortamında (Vercel/Docker) `ALLOW_HOSTED_TARGET=1`
 * AYARLANMAK ZORUNDADIR; aksi halde uygulama ilk istekte bilinçli olarak düşer.
 * Bkz. `.env.example` ve `docs/DEPLOYMENT.md` §5.1.
 */
const HOSTED_SUPABASE_HOST = /\.supabase\.(co|com)$/

function assertHostedTargetAllowed(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    // Ayrıştırılamayan değer: ham metni sondaki `/` olmadan değerlendir — hatalı biçimli
    // bir URL guard'ı ATLATMAMALI.
    host = url.replace(/\/+$/, '')
  }

  if (!HOSTED_SUPABASE_HOST.test(host)) return
  if (process.env.ALLOW_HOSTED_TARGET === '1') return

  throw new Error(
    'Sunucu tarafı ortam BARINDIRILAN (uzak) bir Supabase projesine yönlendirilmiş: ' +
      `${host}\n` +
      "Bu süreç SUPABASE_SERVICE_ROLE_KEY ile RLS'i baypas ederek yazabildiği için, kaza eseri " +
      'gerçek production verisini değiştirme riski vardır ve istek reddedildi.\n' +
      '\n' +
      'Ne yapmalı:\n' +
      '  - Yerel geliştirme/test: `.env.local` dosyanızın yerel yığını (http://127.0.0.1:54321) ' +
      'gösterdiğinden emin olun (`npx supabase status`).\n' +
      '  - Barındırılan projeye BİLEREK bağlanıyorsanız: `pnpm run dev:hosted` (ya da ' +
      '`pnpm run start:hosted`) kullanın — bunlar `.env.hosted.local` üzerinden ' +
      'ALLOW_HOSTED_TARGET=1 sağlar.\n' +
      '  - Gerçek production dağıtımı (Vercel/Docker): ortam değişkenlerine ' +
      'ALLOW_HOSTED_TARGET=1 ekleyin (bkz. docs/DEPLOYMENT.md §5).'
  )
}

let cachedServerEnv: ServerEnv | null = null

/**
 * Sunucu tarafı ortam değişkenleri. Modül seviyesinde önbelleklenir.
 * Tarayıcıda çağrılması hatadır — sırların istemciye sızmasını engeller.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() sunucu dışında çağrılamaz')
  }

  if (cachedServerEnv) return cachedServerEnv

  // KATMAN 2: şema doğrulamasından ÖNCE. Hedef yanlışsa diğer değişkenlerin geçerli olup
  // olmaması önemsizdir; ayrıca hata fırlattığı için hiçbir şey önbelleğe alınmaz ve guard
  // her çağrıda yeniden çalışır (fail-closed).
  assertHostedTargetAllowed()

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_BACKEND_URL: process.env.AI_BACKEND_URL,
    AI_BACKEND_API_KEY: process.env.AI_BACKEND_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
    TRUSTED_PROXY_COUNT: process.env.TRUSTED_PROXY_COUNT,
  })

  if (!parsed.success) {
    throw new Error(formatEnvError('sunucu', parsed.error))
  }

  cachedServerEnv = parsed.data
  return cachedServerEnv
}

/** Test yardımcısı: önbelleği temizler (üretim kodunda kullanılmaz). */
export function resetServerEnvCache(): void {
  cachedServerEnv = null
}
