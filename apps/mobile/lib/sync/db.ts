// Outbox SQLite tutamacının PLATFORMA DUYARLI sınırı — "İmza Dilimi" Tur 2 C4.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN PLATFORM AYRIMI (`db.native.ts` + bu web/SSG tabanı)
// ─────────────────────────────────────────────────────────────────────────────
// `expo-sqlite`'ın WEB derlemesi bir `wa-sqlite.wasm` asset'i EAGER import eder;
// `expo export`'un web hedefi (SSG) bu wasm'ı çözemez ve bundling PATLAR. Oysa
// mobilin GERÇEK yolu native'dir — web yalnızca bir derleme hedefidir (aynı
// gerekçe `lib/supabase.ts`'te SecureStore/web ayrımında da geçerli). Bu yüzden
// gerçek SQLite tutamacı `db.native.ts`'e taşınır (Metro yalnız ios/android'de
// çözer); bu taban dosya web/SSG için BELLEK-İÇİ zararsız bir shim sağlar —
// kuyruk web'de anlamlı çalışmaz (orada offline-outbox gereksizdir) ama import
// güvenlidir ve prerender çökmez.
//
// tsc `./db`'yi bu dosyaya çözer (platform uzantılarını bilmez); native yol
// `getSyncDb`'nin AYNI imzasını `db.native.ts`'te sağlar (yapısal uyum).

/** expo-sqlite `SQLiteDatabase`'in kuyruğun kullandığı senkron alt-kümesi. */
export interface SyncDb {
  execSync(source: string): void
  runSync(source: string, ...params: Array<string | number | null>): void
  getAllSync<T>(source: string, ...params: Array<string | number | null>): T[]
  getFirstSync<T>(source: string, ...params: Array<string | number | null>): T | null
}

/** Web/SSG bellek-içi shim — no-op yazma, boş okuma. Native'de override edilir. */
export function getSyncDb(): SyncDb {
  return {
    execSync() {},
    runSync() {},
    getAllSync<T>(): T[] {
      return []
    },
    getFirstSync<T>(): T | null {
      return null
    },
  }
}
