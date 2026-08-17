// Tip bildirimleri — `scripts/identity-ratchet.mjs`'in saf (dosya sistemine
// bağımlı olmayan) dışa aktarımları için. `tsconfig.json`'da `allowJs: false`
// bilinçli bir karar olduğundan (ADR-0001, TypeScript strict migrasyonu) bu
// .mjs dosyası TypeScript tarafından doğrudan taranmıyor; test dosyası
// (`tests/unit/identity-ratchet.test.ts`) onu import ettiğinde TS7016 ("could
// not find a declaration file") ile karşılaşmaması için bu ELLE YAZILMIŞ
// bildirim dosyası kullanılıyor. `allowJs`/`checkJs` açılmadı — bu dosya
// dışında hiçbir davranış değişmedi.
//
// Bu dosya `identity-ratchet.mjs` ile İÇERİK olarak senkron tutulmalıdır:
// .mjs'teki dışa aktarımlar değişirse burası da güncellenmelidir.

export type LiteralBaselineEntry = {
  kind: 'literal'
  literal: string
  caseInsensitive: boolean
  ceiling: number
  label: string
}

export type EmojiBaselineEntry = {
  kind: 'emoji'
  ceiling: number
  label: string
}

export type RegexBaselineEntry = {
  kind: 'regex'
  pattern: RegExp
  ceiling: number
  label: string
}

export type BaselineEntry = LiteralBaselineEntry | EmojiBaselineEntry | RegexBaselineEntry

export type Baselines = Record<string, BaselineEntry>

export const BASELINES: Baselines

export interface RatchetFile {
  path: string
  content: string
}

export interface CounterFileHit {
  path: string
  count: number
}

export interface CounterResult {
  count: number
  files: CounterFileHit[]
}

export type CountsByKey = Record<string, CounterResult>

export interface RatchetViolation {
  key: string
  label: string
  ceiling: number
  actual: number
  files: CounterFileHit[]
}

export interface RatchetImprovement {
  key: string
  label: string
  ceiling: number
  actual: number
}

export interface RatchetEvaluation {
  ok: boolean
  violations: RatchetViolation[]
  improvements: RatchetImprovement[]
}

export declare function stripComments(src: string): string
export declare function countEmoji(text: string): number
export declare function countPatterns(files: RatchetFile[], baselines?: Baselines): CountsByKey
export declare function evaluateRatchet(
  counts: CountsByKey,
  baselines?: Baselines
): RatchetEvaluation
