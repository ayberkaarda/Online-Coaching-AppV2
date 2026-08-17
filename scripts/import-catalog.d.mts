// Tip bildirimleri — `scripts/import-catalog.mjs`'in saf (dosya sistemine/DB'ye
// bağımlı olmayan) dışa aktarımları için. `tsconfig.json`'da `allowJs: false`
// bilinçli bir karar olduğundan (ADR-0001, TypeScript strict migrasyonu) bu
// .mjs dosyası TypeScript tarafından doğrudan taranmıyor; test dosyası
// (`tests/unit/catalog-import.test.ts`) onu import ettiğinde TS7016 ("could
// not find a declaration file") ile karşılaşmaması için bu ELLE YAZILMIŞ
// bildirim dosyası kullanılıyor (bkz. `scripts/identity-ratchet.d.mts` için
// aynı desen). `allowJs`/`checkJs` açılmadı — bu dosya dışında hiçbir davranış
// değişmedi.
//
// Bu dosya `import-catalog.mjs` ile İÇERİK olarak senkron tutulmalıdır:
// .mjs'teki dışa aktarımlar değişirse burası da güncellenmelidir.

export declare function parseCsv(text: string): string[][]

export interface CsvRecords {
  header: string[]
  records: Record<string, string>[]
}

export declare function toRecords(rows: string[][]): CsvRecords

export declare function repairEncoding(text: string): string

export declare function nullIfEmpty(value: string | null | undefined): string | null

export declare function chunk<T>(items: T[], size: number): T[][]

export interface ExerciseRow {
  name: string
  body_part: string | null
  target: string | null
  equipment: string | null
  gif_url: string | null
  image: string | null
}

export interface FoodRow {
  name: string
  calories_per_100g: number
}

export type MapResult<TRow> = { row: TRow; skip?: undefined } | { row?: undefined; skip: string }

export interface Source<TRow> {
  table: string
  file: string
  label: string
  map(rec: Record<string, string>): MapResult<TRow>
}

export interface Sources {
  exercises: Source<ExerciseRow>
  foods: Source<FoodRow>
}

export declare const SOURCES: Sources

export interface TransformResult<TRow> {
  rows: TRow[]
  skipReasons: Map<string, number>
  duplicates: number
}

export declare function transformRecords<TRow>(
  source: Source<TRow>,
  records: Record<string, string>[]
): TransformResult<TRow>
