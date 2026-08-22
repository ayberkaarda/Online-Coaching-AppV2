// GERÇEK expo-sqlite tutamacı — YALNIZ native (ios/android). "İmza Dilimi" Tur 2 C4.
//
// Metro bu `.native.ts`'i yalnızca native derlemede çözer; web hedefi tabandaki
// `db.ts` shim'ini kullanır (bkz. o dosyanın başlığı — web'in wa-sqlite.wasm
// bundling'ini bu ayrım engeller). expo-sqlite SDK 57 SENKRON API'si: küçük ve
// hızlı kuyruk işlemleri için `openDatabaseSync` + `execSync`/`runSync`/
// `getAllSync`/`getFirstSync`. `SQLiteDatabase` yapısal olarak `SyncDb`'yi karşılar.

import * as SQLite from 'expo-sqlite'

import type { SyncDb } from './db'

const DB_NAME = 'sarmal-sync.db'

let db: SQLite.SQLiteDatabase | null = null

/** Tek DB tutamacı (tembel açılır; native tutamaç referans kararlı olmalı). */
export function getSyncDb(): SyncDb {
  if (db === null) db = SQLite.openDatabaseSync(DB_NAME)
  return db
}
