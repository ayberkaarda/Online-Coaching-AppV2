// Paylaşılan, dile/ortama özgü genel ESLint kuralları (Next'e özgü uzantı ve proje-yerleşimi
// ignore'ları tüketen pakette kalır — bkz. apps/web/eslint.config.mjs, ADR-0023 madde 1,
// Faz 4.5 commit 3). Flat config dizisi olarak dışa aktarılır; tüketen taraf kendi dizisine
// spread eder (`...baseConfig`).

/** @type {import('eslint').Linter.Config[]} */
const baseConfig = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
]

export default baseConfig
