import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Project-specific ignores:
    'tests/e2e/**',
    'data/**',
    'scripts/**',
    'ai_backend/**',
    // Supabase CLI'ın `.temp` altında ürettiği Deno dosyaları lint'i kırdığı için tüm supabase/ dizini hariç tutulur.
    'supabase/**',
    'coverage/**',
    'playwright-report/**',
  ]),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
])

export default eslintConfig
