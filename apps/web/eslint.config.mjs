import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
// Paylaşılan, dile/ortama özgü genel kurallar @repo/config'ten gelir (ADR-0023 madde 1,
// Faz 4.5 commit 3). Next'e özgü uzantı (yukarıdaki nextVitals) ve proje-yerleşimine özgü
// ignore'lar burada, apps/web'de kalır.
import baseConfig from '@repo/config/eslint/base.mjs'

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
  ...baseConfig,
])

export default eslintConfig
