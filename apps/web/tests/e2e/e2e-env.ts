// E2E paketinin ORTAM SABİTLERİ — tek kaynak.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN AYRI BİR MODÜL
// ─────────────────────────────────────────────────────────────────────────────
// Bu iki değer (Supabase adresi + anon anahtar) artık İKİ AYRI süreçte lazım:
//
//   1. `playwright.config.ts` -> `webServer.env`  : uygulamayı build edip başlatan
//      Next.js süreci (NEXT_PUBLIC_* değerleri BUILD ZAMANINDA bundle'a gömülür).
//   2. `coach-mfa.ts`         -> `global-setup`   : koçun TOTP faktörünü kuran
//      Node tarafı Supabase istemcisi (Faz 4.7 dilim 2).
//
// İkisi AYNI hedefi göstermek ZORUNDA: global-setup A projesine faktör kurup
// tarayıcı B projesine giderse, koç "faktörün yok" ekranında kalır ve tüm koç
// spec'leri anlaşılmaz biçimde düşer. Değerler iki dosyaya kopyalansaydı bu
// ayrışma SESSİZ olurdu; burada tek yerde durur.
//
// Test kullanıcıları da (`TEST_USERS`) buraya taşındı: `coach-mfa.ts` koçun
// e-postasını bilmek zorunda ve `fixtures.ts`ten alsaydı iki modül DÖNGÜSEL
// import ederdi (fixtures -> coach-mfa -> fixtures). `fixtures.ts` bunları
// yeniden dışa aktarır, yani spec dosyalarının import satırları DEĞİŞMEDİ.

import fs from 'node:fs'
import path from 'node:path'

/**
 * Supabase adresi. Anahtarın aksine SIR DEĞİL ve gitleaks'i de tetiklemez, bu yüzden
 * yerel yığının varsayılanı burada durabilir. Dışarıdan verilen değer önceliklidir
 * (CI kendi ortam değişkenlerini geçirir); `playwright.config.ts` tepesindeki KATMAN 1
 * iddiası bu değerin BARINDIRILAN bir projeyi göstermediğini ayrıca doğrular.
 */
export const E2E_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

/**
 * Anon anahtarı — YALNIZCA ortamdan/`.env.local`dan okunur.
 *
 * ###########################################################################
 * # BURAYA SABİT (HARDCODED) ANAHTAR YAZILMAZ — GERİ GELMESİN               #
 * #                                                                         #
 * # Buraya bir kez yazıldı ve CI'ın `security` job'unu kırdı. Değer yerel    #
 * # Supabase'in HERKESE AÇIK demo anon key'idir (`supabase status` her       #
 * # kurulumda aynısını üretir) — yani gerçek bir sır DEĞİLDİR. Ama:          #
 * #                                                                         #
 * #   1. gitleaks bunu ayırt EDEMEZ: gördüğü şey bir JWT'dir, "leaks found"  #
 * #      der ve push'u kırar. Aynı satır daha önce                           #
 * #      `account-deletion.spec.ts`ten tam da bu yüzden kaldırılmıştı; env'i #
 * #      tek kaynağa toplayan refactor onu geri getirdi. ÜÇÜNCÜ kez olmasın. #
 * #   2. Sabit bir varsayılan, CI'ın verdiği anahtar ile yerelin SESSİZCE    #
 * #      ayrışmasına yol açar: yanlış anahtar "geçersiz JWT" değil, sadece   #
 * #      "giriş başarısız" gibi görünür ve saatler yakar.                    #
 * #                                                                         #
 * # Hiçbir kaynakta bulunamazsa SESSİZ VARSAYILANA DÜŞÜLMEZ, açık bir hata   #
 * # fırlatılır (aşağıda).                                                    #
 * ###########################################################################
 *
 * Üç kaynak, sırayla (`account-deletion.spec.ts` -> `resolveServiceRoleKey` ile AYNI desen):
 *   1. `NEXT_PUBLIC_SUPABASE_ANON_KEY` — uygulamanın kullandığı ad; CI e2e job'u bunu verir.
 *   2. `ANON_KEY`                      — `supabase status -o env` çıktısının verdiği ad
 *                                        (CI bunu `$GITHUB_ENV`e yazar).
 *   3. `apps/web/.env.local`           — yerelde kabuk değişkeni set edilmemiş olur;
 *                                        `next start` dosyayı kendisi okur, test süreci
 *                                        okumaz. Burada elle ayrıştırılır.
 */
function resolveAnonKey(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.ANON_KEY
  if (fromEnv) return fromEnv

  const envFile = path.resolve(__dirname, '../../.env.local')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^\s*NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+?)\s*$/.exec(line)
      if (match?.[1]) return match[1].replace(/^["']|["']$/g, '')
    }
  }

  throw new Error(
    [
      'E2E: Supabase anon anahtarı bulunamadı — paket bu değer olmadan koşamaz.',
      '',
      'Aranan yerler (sırayla):',
      '  1. NEXT_PUBLIC_SUPABASE_ANON_KEY ortam değişkeni',
      '  2. ANON_KEY ortam değişkeni (`supabase status -o env` bu adı verir)',
      `  3. ${envFile}`,
      '',
      'Ne yapmalı:',
      '  - Yerelde: yerel yığını başlatın (`npx supabase start`) ve apps/web/.env.local',
      '    dosyasına NEXT_PUBLIC_SUPABASE_ANON_KEY satırını yazın (`npx supabase status`).',
      '  - Tek seferlik: NEXT_PUBLIC_SUPABASE_ANON_KEY=<anahtar> pnpm run test:e2e',
      '',
      'NOT: buraya sabit bir varsayılan anahtar YAZILMAZ — gitleaks onu sızıntı sayıp',
      "CI'ın security job'unu kırar (bkz. bu dosyadaki yorum).",
    ].join('\n')
  )
}

export const E2E_SUPABASE_ANON_KEY = resolveAnonKey()

/**
 * Uygulamanın E2E koşusundaki adresi. `playwright.config.ts` bunu hem `use.baseURL`
 * hem `webServer.url` olarak kullanır; `fixtures.ts` -> `createCoachAal2State()` de
 * kendi tarayıcısını buna bağlar (o tarayıcı `use.baseURL`'i devralmaz, çünkü
 * global-setup içinde elle açılır).
 */
export const E2E_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export interface TestUser {
  email: string
  password: string
}

// E-postalar supabase/seed.sql'den; env ile geçersiz kılınabilir (bkz. tests/e2e/README.md).
export const TEST_USERS: { client: TestUser; coach: TestUser } = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? 'client1@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
  coach: {
    email: process.env.E2E_COACH_EMAIL ?? 'coach@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
}
