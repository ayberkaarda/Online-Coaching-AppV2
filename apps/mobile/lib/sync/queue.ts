// Transactional OUTBOX kuyruğu (expo-sqlite) — "İmza Dilimi" Tur 2 C4.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN GENERIC OUTBOX (ayna-tablo DEĞİL) — Fable mimari kararı
// ─────────────────────────────────────────────────────────────────────────────
// SQLite burada `workout_sessions`/`workout_logs`'un yerel bir KOPYASI (ayna)
// değildir; yalnızca "sunucuya gitmesi gereken mutasyonlar"ın FIFO bir günlüğüdür.
// Aktif oturum ekranı HER ZAMAN (online olsa bile) buraya yazar — tek yazma yolu;
// online tespiti YOK. Flusher (engine.ts + SyncEngine.tsx) online olduğunda
// kuyruğu iter. İki kod yolu (online/offline) BİLEREK yoktur.
//
// LWW yoktur: tek cihaz, append-only, silme yok. FIFO + `client_mutation_id`
// idempotency (C1 fonksiyonları zaten idempotent: session upsert onConflict id /
// log insert + 23505 no-op) çakışmayı gereksiz kılar.
//
// expo-sqlite SDK 57 SENKRON API'si (native, ana thread): `openDatabaseSync` +
// `execSync`/`runSync`/`getAllSync`/`getFirstSync`. Kuyruk işlemleri küçük ve
// hızlıdır; senkron API React dışı flush döngüsünü (engine) basitleştirir.
// DB tutamacı `./db` ARDINDAN gelir — PLATFORM AYRIMI (bkz. db.ts başlığı): web
// export'unun wa-sqlite.wasm bundling'ini kırmamak için gerçek SQLite yalnız
// native'de (`db.native.ts`) yüklenir; bu dosya `expo-sqlite`'ı DOĞRUDAN import ETMEZ.

import { getSyncDb } from './db'

/** Kuyruğa yazılabilen mutasyon türleri — C1'in üç saf fonksiyonuna eşlenir. */
export type SyncOp = 'create_session' | 'create_set' | 'complete_session'

/** `sync_queue` satırının aynen okunmuş hâli (SELECT *). */
export interface QueueItem {
  id: number
  op: SyncOp
  /** İlgili C1 fonksiyonunun girdi objesi — `JSON.stringify` ile saklanır. */
  payload: string
  client_mutation_id: string | null
  status: string
  attempt_count: number
  created_at: string
}

/**
 * Kuyruk tablosunu oluşturur — İDEMPOTENT (`IF NOT EXISTS`). Uygulama/oturum
 * açılışında (SyncEngine mount) çağrılır; her çağrıda güvenle tekrarlanabilir.
 */
export function initQueue(): void {
  getSyncDb().execSync(
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_mutation_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`
  )
}

/**
 * Bir mutasyonu kuyruğa EKLER (`status='pending'`). `payload` JSON'a çevrilir.
 * `id` AUTOINCREMENT olduğu için ekleme sırası = FIFO sırası garantidir.
 */
export function enqueue(op: SyncOp, payload: object, clientMutationId?: string | null): void {
  getSyncDb().runSync(
    `INSERT INTO sync_queue (op, payload, client_mutation_id, status, attempt_count, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?);`,
    op,
    JSON.stringify(payload),
    clientMutationId ?? null,
    new Date().toISOString()
  )
}

/**
 * Bekleyen tüm öğeler, **id ASC = FIFO**. `create_session` her zaman ilgili
 * `create_set`'lerden ÖNCE eklendiği için FK sırası kendiliğinden korunur.
 */
export function pendingItems(): QueueItem[] {
  return getSyncDb().getAllSync<QueueItem>(
    `SELECT id, op, payload, client_mutation_id, status, attempt_count, created_at
     FROM sync_queue WHERE status = 'pending' ORDER BY id ASC;`
  )
}

/** Öğeyi kalıcı olarak "gitti" işaretler (bir daha çekilmez). */
export function markSynced(id: number): void {
  getSyncDb().runSync(`UPDATE sync_queue SET status = 'synced' WHERE id = ?;`, id)
}

/**
 * Deneme başarısız — sayacı artırır ama öğe HÂLÂ `pending` kalır (retry). FIFO
 * korunur: engine ilk hatada durur, öğe sıradaki flush'ta baştan denenir.
 */
export function markFailed(id: number): void {
  getSyncDb().runSync(`UPDATE sync_queue SET attempt_count = attempt_count + 1 WHERE id = ?;`, id)
}

/** Bekleyen öğe sayısı — rozet (`usePendingSyncCount`) kaynağı. */
export function pendingCount(): number {
  const row = getSyncDb().getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'pending';`
  )
  return row?.count ?? 0
}
