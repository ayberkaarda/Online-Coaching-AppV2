// Tip bildirimleri — `scripts/clean-e2e-data.mjs`'in saf (dosya sistemine/DB'ye
// bağımlı olmayan) dışa aktarımları için. `tsconfig.json`'da `allowJs: false`
// bilinçli bir karar olduğundan (ADR-0001) bu .mjs dosyası TypeScript tarafından
// doğrudan taranmıyor; test dosyası (`tests/unit/clean-e2e-data.test.ts`) onu
// import ettiğinde TS7016 ("could not find a declaration file") almasın diye bu
// ELLE YAZILMIŞ bildirim dosyası kullanılıyor (bkz. `scripts/import-catalog.d.mts`
// ve `scripts/identity-ratchet.d.mts` — aynı desen).
//
// Bu dosya `clean-e2e-data.mjs` ile İÇERİK olarak senkron tutulmalıdır:
// .mjs'teki dışa aktarımlar değişirse burası da güncellenmelidir.

/** Veritabanından okunan satır — ölçüt yüklemlerine gevşek biçimde girer. */
export type CleanupRow = Record<string, unknown>

export interface TableRule {
  /** public şemasındaki tablo adı. */
  table: string
  /** Türkçe rapor başlığı. */
  label: string
  /** PostgREST select listesi. */
  columns: string
  /** FK ile bağlı olunan EBEVEYN tablolar — silme sırası buradan türetilir. */
  dependsOn: string[]
  /** Ölçütün gerekçesi (rapora basılır). */
  reason: string
  /** SAF yüklem: true -> satır E2E artığıdır. */
  match(row: CleanupRow): boolean
  /** dry-run listesinde satırı özetler. */
  describe(row: CleanupRow): string
}

export interface OutOfScopeEntry {
  table: string
  reason: string
}

export interface StorageRule {
  bucket: string
  label: string
  /** Silme sonrası hayatta kalan satırların referans kolonları. */
  references: { table: string; columns: string[] }
}

export interface CleanupOptions {
  apply: boolean
  skipStorage: boolean
  quiet: boolean
  help: boolean
}

export type ParseArgsResult =
  { opts: CleanupOptions; error?: undefined } | { opts?: undefined; error: string }

export interface GuardDrift {
  table: string
  before: number | undefined
  after: number | undefined
}

export const E2E_MARKER: string
export const APP_POSE_PATH_RE: RegExp
export const TABLE_RULES: TableRule[]
export const OUT_OF_SCOPE: OutOfScopeEntry[]
export const GUARD_TABLES: string[]
export const STORAGE_RULES: StorageRule[]

export declare function startsWithMarker(value: unknown): boolean
export declare function containsMarker(value: unknown): boolean
export declare function isLocalTarget(url: unknown): boolean
export declare function parseArgs(argv: string[]): ParseArgsResult
export declare function selectRows<TRow extends CleanupRow>(
  rule: Pick<TableRule, 'match'>,
  rows: TRow[]
): { matched: TRow[]; skipped: TRow[] }
export declare function orderTablesForDelete<TRule extends { table: string; dependsOn?: string[] }>(
  rules: TRule[]
): TRule[]
export declare function findOrphanObjects(
  objectPaths: string[],
  referencedPaths: Iterable<string>
): string[]
export declare function collectReferencedPaths(
  rows: CleanupRow[],
  columns: string[],
  excludeIds?: Iterable<unknown>
): Set<string>
export declare function diffGuardCounts(
  before: Record<string, number>,
  after: Record<string, number>
): GuardDrift[]
