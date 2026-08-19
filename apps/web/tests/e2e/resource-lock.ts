// PAYLAŞILAN KAYNAK KİLİDİ — E2E test izolasyonunun temeli.
//
// SORUN (ölçüldü, tahmin değil):
//   Bu paket TEK bir veritabanına ve seed'deki SABİT iki danışan hesabına
//   (client1 / client2) karşı koşuyor. Eş zamanlılık İKİ boyutlu:
//     1) `fullyParallel: true` -> aynı projedeki farklı spec DOSYALARI (ve
//        dosya içi testler) ayrı worker'larda aynı anda koşar.
//     2) `projects: [chromium, 'Mobile Chrome']` -> HER spec dosyası AYNI
//        anda İKİ kez koşar, aynı hesaplara yazarak.
//   Bazı yazma işlemleri "tüm kaydı değiştir" semantiğinde (`save_workout_plan`
//   RPC'si planın YEDİ GÜNÜNÜ birden yeniden yazar), yani benzersiz metin
//   üretmek YETMEZ: A testinin yazdığını B testi tamamen ezer.
//   Kanıt (düzeltme öncesi tam paket koşusu):
//     plans.spec.ts "Pazartesi antrenman içeriği" bekliyordu
//       Expected: "E2E Antrenman 658387264"
//       Received: "1. E2E Gym 49103761 - 2x5"   <- workout.spec.ts'in verisi
//
// ÇÖZÜM:
//   Her test, MUTASYONA UĞRATTIĞI mantıksal kaynakları (ör. `workout-plan:client1`)
//   `resource()` anotasyonuyla İLAN EDER. Aşağıdaki otomatik fixture, test
//   gövdesi başlamadan önce bu kaynakların hepsini dışlamalı olarak kilitler ve
//   test bitince bırakır. Aynı kaynağa dokunan testler sıraya girer; FARKLI
//   kaynaklara dokunan testler tam paralel koşmaya DEVAM eder.
//
//   Kilit süreçler arası (worker'lar arası) ve projeler arası çalışmak
//   zorunda olduğu için `fs.mkdirSync` üzerine kuruludur: dizin oluşturma
//   NTFS'te de POSIX'te de ATOMİKTİR (ya sen yaratırsın ya `EEXIST` alırsın),
//   bu yüzden ek bir kilit kütüphanesi gerekmez.
//
// NEDEN `retries` DEĞİL: yeniden deneme çakışmayı GİZLER, çözmez — ve gerçek
// bir regresyonu da gizleyebilir. Kilit çakışmayı ORTADAN KALDIRIR.
// NEDEN `workers: 1` DEĞİL: paketin tamamı seri koşarsa geri bildirim süresi
// katlanır; oysa testlerin çoğu (auth, dashboard, mesajlaşma, form check...)
// birbirinden bağımsız kaynaklara dokunuyor ve paralel koşabilir.

import { test as base } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Anotasyon tipi — fixture kilitlenecek kaynakları buradan okur. */
const RESOURCE_ANNOTATION = 'shared-resource'

/**
 * Kilit dizinlerinin kökü.
 *
 * `os.tmpdir()` BİLİNÇLİ: depo OneDrive ile senkronize bir klasörde duruyor;
 * senkronizasyon ajanı kilit dizinlerini kopyalayıp/geciktirip kilit
 * semantiğini bozabilir. Ayrıca `test-results/` Playwright tarafından koşu
 * başında temizlendiği için orası da uygun değil.
 */
export const LOCK_ROOT = path.join(os.tmpdir(), 'my-coaching-appv2-e2e-locks')

/**
 * Bir kilidin "sahipsiz" sayılacağı yaş. Bir worker süreci kilidi tutarken
 * çökerse dizin diskte kalır; bu süreden yaşlı kilitler geri alınır.
 * En uzun test timeout'u 90 sn (form-check.spec.ts) olduğundan 5 dk fazlasıyla
 * güvenli bir üst sınırdır — canlı bir testin kilidi ASLA çalınmaz.
 */
const STALE_LOCK_MS = 5 * 60_000

/** Kilit beklerken vazgeçme sınırı. Aşılırsa test anlaşılır bir hatayla düşer. */
const ACQUIRE_TIMEOUT_MS = 5 * 60_000

/**
 * Bir testin mutasyona uğrattığı paylaşılan kaynağı ilan eder.
 *
 * Kullanım:
 *   test('...', { annotation: resource('workout-plan:client1') }, async ({ page }) => { ... })
 *   test('...', { annotation: [resource('a'), resource('b')] }, async ({ page }) => { ... })
 *
 * Anahtar SÖZLEŞMESİ: `<kaynak>:<hesap>` (ör. `nutrition-plan:client2`).
 * Aynı satıra yazan iki test AYNI anahtarı kullanmalıdır; farklı satırlara
 * yazanlar farklı anahtar kullanarak paralelliği korur.
 */
export function resource(key: string): { type: string; description: string } {
  return { type: RESOURCE_ANNOTATION, description: key }
}

/** Anahtarı güvenli bir dizin adına çevirir (`:` Windows'ta dosya adında geçersizdir). */
function lockDirFor(key: string): string {
  return path.join(LOCK_ROOT, key.replace(/[^a-zA-Z0-9._-]/g, '_'))
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Tek bir kaynağı kilitler; kilit başkasındaysa serbest kalana kadar bekler. */
async function acquire(key: string): Promise<void> {
  const dir = lockDirFor(key)
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS

  for (;;) {
    try {
      // ATOMİK adım: dizin ya bu süreç tarafından yaratılır ya da EEXIST alınır.
      // (`recursive: false` ŞART — `recursive: true` var olan dizinde hata
      // VERMEZ ve kilit anlamını tamamen kaybederdi.)
      fs.mkdirSync(dir, { recursive: false })
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // Kök dizin yok (global-setup çalışmamış olabilir) — yarat ve tekrar dene.
        fs.mkdirSync(LOCK_ROOT, { recursive: true })
        continue
      }
      if (code !== 'EEXIST') throw error
    }

    // Sahipsiz (çökmüş worker'dan kalan) kilidi geri al.
    try {
      if (Date.now() - fs.statSync(dir).mtimeMs > STALE_LOCK_MS) {
        fs.rmSync(dir, { recursive: true, force: true })
        continue
      }
    } catch {
      // Dizin aradaki sürede serbest bırakıldı; bir sonraki denemede yakalanır.
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Paylaşılan kaynak kilidi alınamadı: "${key}" (${ACQUIRE_TIMEOUT_MS} ms bekleme aşıldı). ` +
          `Kilit dizini: ${dir}`
      )
    }

    // Rastgele jitter: aynı kaynağı bekleyen worker'lar aynı anda uyanıp
    // birbirini aç bırakmasın (thundering herd).
    await sleep(40 + Math.floor(Math.random() * 80))
  }
}

function release(key: string): void {
  fs.rmSync(lockDirFor(key), { recursive: true, force: true })
}

/**
 * Kilidi TEST GÖVDESİ DIŞINDAN almak için tek yol (fixture, global-setup, yardımcı).
 *
 * `resource(...)` anotasyonu yalnızca bir testin kendi ömrü boyunca kilit tutar;
 * koç `aal2` oturum durumunun üretimi gibi TESTLER ARASI paylaşılan bir işlem
 * (bkz. `fixtures.ts` -> `loginAsCoach`) o mekanizmaya sığmaz: iki worker aynı
 * anda üretmeye kalkarsa GoTrue'nun MFA doğrulaması diğerinin oturumunu iptal
 * eder (ölçüm: `coach-mfa.ts` başlığı). Aynı `mkdirSync` kilidi burada da
 * kullanılır — süreçler ve projeler arası çalışan TEK mekanizma odur.
 */
export async function withResourceLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  await acquire(key)
  try {
    return await fn()
  } finally {
    release(key)
  }
}

/**
 * Paylaşılan kaynak kilidini uygulayan otomatik fixture.
 *
 * Kaynak ilan ETMEYEN testler için tamamen no-op'tur (auth/dashboard gibi
 * salt-okunur testler tam paralel koşmaya devam eder).
 */
export const test = base.extend<{ sharedResourceLock: void }>({
  sharedResourceLock: [
    async ({}, use, testInfo) => {
      const keys = [
        ...new Set(
          testInfo.annotations
            .filter((annotation) => annotation.type === RESOURCE_ANNOTATION)
            .map((annotation) => annotation.description)
            .filter((description): description is string => Boolean(description))
        ),
      ]
        // SIRALAMA ZORUNLU: tüm testler kilitleri aynı (küresel) sırada aldığı
        // için "A'yı tutup B'yi bekleyen" ile "B'yi tutup A'yı bekleyen"
        // döngüsü oluşamaz — kilitlenme (deadlock) yapısal olarak imkânsızdır.
        .sort()

      const held: string[] = []
      const waitStartedAt = Date.now()

      try {
        for (const key of keys) {
          await acquire(key)
          held.push(key)
        }

        const waitedMs = Date.now() - waitStartedAt
        if (waitedMs > 0) {
          // Kuyrukta geçen süre testin KENDİ bütçesinden düşmemeli: aksi halde
          // sırasını bekleyen bir test, hiçbir şey yapmadan timeout'a düşerdi.
          // Bu, timeout'u "şişirmek" DEĞİLDİR — testin gövdesine ayrılan süre
          // (30 sn / 90 sn) değişmeden kalır, yalnızca bekleme süresi geri verilir.
          testInfo.setTimeout(testInfo.timeout + waitedMs)
          if (waitedMs > 250) {
            testInfo.annotations.push({
              type: 'shared-resource-wait',
              description: `${keys.join(', ')} için ${waitedMs} ms kuyrukta beklendi`,
            })
          }
        }

        await use()
      } finally {
        // Testin nasıl bittiğinden (geçti / düştü / timeout) bağımsız olarak
        // kilit MUTLAKA bırakılır; fixture teardown'ı her durumda çalışır.
        for (const key of held.reverse()) release(key)
      }
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
