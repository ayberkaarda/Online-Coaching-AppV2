// Mobil için ESLint flat config. `expo lint`in çektiği `eslint-config-expo` BİLEREK
// kurulmadı — bu commit'te yeni bir dış paket kümesi eklenmiyor; kurallar workspace'in ortak
// tabanından (`@repo/config/eslint/base.mjs`) gelir, tıpkı apps/web gibi (ADR-0023 madde 1).
//
// Parser AÇIKÇA verilir: apps/web'de TypeScript parser'ı `eslint-config-next` üzerinden
// dolaylı geliyor, mobilde öyle bir paket yok — parser'sız ESLint her .tsx dosyasında
// "Parsing error: Unexpected token <" ile düşer (ÖLÇÜLDÜ). Sürüm, repoda `eslint-config-next`
// üzerinden ZATEN çözülmüş olan 8.62.x ile aynıdır; sanal depoya yeni bir paket girmez.
import { defineConfig, globalIgnores } from 'eslint/config'
import tsParser from '@typescript-eslint/parser'
import baseConfig from '@repo/config/eslint/base.mjs'

const eslintConfig = defineConfig([
  globalIgnores([
    // Expo'nun ürettiği artefaktlar — kaynak değil, lint edilmez.
    '.expo/**',
    'dist/**',
    'expo-env.d.ts',
    'node_modules/**',
  ]),
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
])

export default eslintConfig
