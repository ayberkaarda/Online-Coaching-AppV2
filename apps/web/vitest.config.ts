import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Faz 4.5 commit 5 (ADR-0024): veri katmanı `packages/api-client`'a, logger çekirdeği
// `packages/logger`'a taşındı ama TESTLERİ hâlâ BURADA (paket başına vitest bölünmesi
// commit 7'ye ertelendi, ADR-0023 madde 4). Kapsam yapılandırması bu yüzden `apps/web`'in
// DIŞINA çıkmak zorunda; aksi hâlde MANDAL sessizce anlamını yitirirdi (ÖLÇÜLDÜ: taşınan
// ~3.500 satır ve onları örten testler payda/paydan birlikte düşünce satır oranı
// %53.85 -> %51.26'ya indi ve 52 eşiğini kırdı — kod değişmediği hâlde).
//
// `coverage.allowExternal` ZORUNLU: `@vitest/coverage-v8` filtrelemeyi `test-exclude` ile
// yapar ve varsayılan `relativePath` kipinde `config.root`'un (apps/web) DIŞINDAKİ her
// dosyayı SESSİZCE eler — `../../packages/**` kalıbı hiçbir uyarı vermeden hiçbir şeyle
// eşleşmez (ÖLÇÜLDÜ). `allowExternal: true` mutlak yol eşleşmesine geçirir; bu kipte
// include/exclude kalıplarının TAMAMI mutlak olmak zorundadır.
const repoRoot = path.resolve(__dirname, '../..').split(path.sep).join('/')
const webRoot = `${repoRoot}/apps/web`

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      allowExternal: true,
      include: [`${webRoot}/src/**/*.{ts,tsx}`, `${repoRoot}/packages/*/src/**/*.{ts,tsx}`],
      exclude: [
        `${webRoot}/src/**/*.d.ts`,
        `${webRoot}/src/**/*.test.{ts,tsx}`,
        `${webRoot}/src/app/**/layout.tsx`,
        `${webRoot}/src/app/**/error.tsx`,
        `${webRoot}/src/app/providers.tsx`,
        // `packages/types` eskiden `src/types/**` olarak HARİÇ tutuluyordu (üretilmiş
        // `database.ts` + kendi ayrı testi olan `schemas.ts`); paket taşıması yalnızca
        // adresini değiştirdi, ölçüm kümesini değiştirmemeli.
        `${repoRoot}/packages/types/src/**`,
        // `@repo/domain` kendi paketinde %100 kapsamla test ediliyor (bkz.
        // packages/domain/package.json test:coverage); apps/web onu henüz import
        // ETMİYOR, dolayısıyla burada ölçülürse paydaya 0%'lik ölü satır olarak
        // girer ve eşiği gerekçesiz düşürür — `packages/types` istisnasıyla AYNI mantık.
        `${repoRoot}/packages/domain/src/**`,
      ],
      // `lines`/`statements` 60 → 52: ölçülen gerçek değer %53.85 (4975/9238), eşik onun
      // hemen altına TEK YÖNLÜ MANDAL olarak konuldu (bkz. docs/PROGRESS.md §3 B-046).
      // Aspirasyonel 60 eşiği sürekli kırmızı kalıyordu ve hiçbir regresyonu
      // yakalamıyordu — kırmızı bir kapı, kapı değildir. `functions: 60` (ölçülen %64.2)
      // ve `branches: 55` (ölçülen %80.4) zaten geçiyor, DOKUNULMADI. 60'a dönüş borç
      // olarak izleniyor; MessagesTab/FormCheckTab/WorkoutTab testleri yazılınca kapanır.
      //
      // GERİ ÇIKARILDI (B-046 kapanışı): `MessagesTab`/`FormCheckTab` için davranış testleri
      // yazıldı (bkz. tests/unit/messages-tab.test.tsx, tests/unit/form-check-tab.test.tsx) —
      // `WorkoutTab`'e gerek KALMADI, iki dosya tek başına eşiği aşırdı. Ölçülen gerçek değer
      // %61.21 (5443/8892) — 52'nin geçici mandalı 60'a geri çekildi.
      thresholds: { lines: 60, functions: 60, branches: 55, statements: 60 },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
