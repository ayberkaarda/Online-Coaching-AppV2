// Koşu başında iki hazırlık yapılır:
//
//   1) Paylaşılan kaynak kilitlerinin kökünü temizler.
//      GEREKÇE: kilitler `os.tmpdir()` altında yaşar ve normalde fixture teardown'ı
//      tarafından bırakılır. Ancak bir koşu SIGINT (Ctrl+C) ile kesilirse veya bir
//      worker süreci çökerse kilit dizinleri diskte kalabilir. `resource-lock.ts`
//      içindeki yaş bazlı geri alma bunu 5 dk sonra zaten çözer; buradaki temizlik
//      yeni koşunun o 5 dk'yı BEKLEMEMESİNİ sağlar.
//
//   2) Koç hesabında DOĞRULANMIŞ bir TOTP faktörü olmasını garantiler (Faz 4.7).
//      GEREKÇE: `mfa_aal2_gate` politikası koçtan `aal2` istiyor; `aal2`ye çıkmanın
//      tek yolu bir TOTP faktörünü doğrulamaktır. Kayıt BURADA, worker'lar
//      başlamadan önce ve TEK sürede yapılır — çünkü GoTrue'nun kayıt akışı
//      doğrulanmamış faktörleri temizler ve paralel worker'lar aynı anda kayıt
//      olsaydı biri diğerinin faktörünü silerdi. Ayrıntı: `coach-mfa.ts`.
//
//      Bu adım YEREL yığına da CI'a da aynı şekilde davranır: faktör varsa
//      yeniden kurmaz, yalnızca elindeki secret'ın hâlâ çalıştığını KANITLAR.
//
//   3) Koç için TEK bir `aal2` tarayıcı oturumu üretip cookie'lerini diske alır.
//      GEREKÇE: GoTrue, başarılı bir MFA doğrulamasında kullanıcının DİĞER TÜM
//      oturumlarını iptal ediyor (ölçüldü, bkz. `coach-mfa.ts` başlığı). Her koç
//      testinde step-up yapılsaydı paralel worker'lar birbirinin oturumunu
//      öldürürdü. Onun yerine koşu başına tek oturum açılır; `loginAsCoach`
//      yalnızca o oturumun cookie'lerini kopyalar.
//
//      SIRA ÖNEMLİ: (1) kilit kökünü siler, durum dosyası da orada yaşadığı için
//      önceki koşudan kalan bayat token böylece kendiliğinden düşer; (2) faktör
//      hazır olmadan (3) adımı zaten doğrulama ekranını geçemez.
//
// NOT — Playwright `webServer`i `globalSetup`TAN ÖNCE ayağa kaldırır
// (`createGlobalSetupTasks`, plugin setup adımları globalSetup'tan önce gelir),
// yani (3) adımının uygulamaya bağlanabilmesi garantidir.

import fs from 'node:fs'

import { ensureCoachTotpFactor } from './coach-mfa'
import { createCoachAal2State } from './fixtures'
import { LOCK_ROOT } from './resource-lock'

export default async function globalSetup(): Promise<void> {
  fs.rmSync(LOCK_ROOT, { recursive: true, force: true })
  fs.mkdirSync(LOCK_ROOT, { recursive: true })

  await ensureCoachTotpFactor()
  await createCoachAal2State()
}
