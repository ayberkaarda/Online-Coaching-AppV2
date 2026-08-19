// `packages/*` (kütüphane paketleri) için ortak ESLint yapılandırması — B-049, Faz 4.5
// commit 7b. Bu ana kadar kök `lint` script'i yalnızca `pnpm --filter web run lint`
// çağırıyordu; repo kod kütlesinin çoğu `packages/*`'a taşındığı hâlde HİÇ lint'lenmiyordu.
//
// `apps/web` bu dosyayı KULLANMAZ: orada TypeScript parser'ı `eslint-config-next` üzerinden
// dolaylı geliyor ve Next'e özgü kural setiyle birlikte kuruluyor (bkz.
// apps/web/eslint.config.mjs). `apps/mobile` de kendi parser'ını açıkça kuruyor. Burası
// yalnızca Next'i/Expo'yu tanımayan, çıplak TS paketleri içindir.
//
// Parser AÇIKÇA verilmek ZORUNDA: parser'sız ESLint her tip anotasyonunda "Parsing error"
// ile düşer. `@typescript-eslint/parser` bu paketin (@repo/config) KENDİ dependency'sidir —
// böylece tüketen her paket yalnızca `eslint` + `@repo/config` bildirmekle yetinir, parser
// sürümü tek yerden yönetilir.
//
// Düz dizi olarak dışa aktarılır (tıpkı base.mjs gibi); `defineConfig` çağrılmaz ki
// @repo/config'in `eslint` paketine bağımlı olması gerekmesin.

import tsParser from '@typescript-eslint/parser'

import baseConfig from './base.mjs'

/** @type {import('eslint').Linter.Config[]} */
const packageConfig = [
  {
    // Flat config'te `ignores` TEK BAŞINA bir nesnede verilirse global ignore olur.
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
  ...baseConfig,
]

export default packageConfig
