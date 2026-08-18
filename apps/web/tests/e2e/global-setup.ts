// Koşu başında paylaşılan kaynak kilitlerinin kökünü temizler.
//
// GEREKÇE: kilitler `os.tmpdir()` altında yaşar ve normalde fixture teardown'ı
// tarafından bırakılır. Ancak bir koşu SIGINT (Ctrl+C) ile kesilirse veya bir
// worker süreci çökerse kilit dizinleri diskte kalabilir. `resource-lock.ts`
// içindeki yaş bazlı geri alma bunu 5 dk sonra zaten çözer; buradaki temizlik
// yeni koşunun o 5 dk'yı BEKLEMEMESİNİ sağlar.

import fs from 'node:fs'

import { LOCK_ROOT } from './resource-lock'

export default function globalSetup(): void {
  fs.rmSync(LOCK_ROOT, { recursive: true, force: true })
  fs.mkdirSync(LOCK_ROOT, { recursive: true })
}
