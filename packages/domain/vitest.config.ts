import { defineConfig } from 'vitest/config'

// Paket kendi vitest koşumuna sahip (Faz 4.5 commit 7 notu — paket başına bölünme burada
// gerçekleşiyor). %100 eşik BİLEREK MANDAL değil hedef: bu paket saf hesap fonksiyonları
// içerir, her dal (RangeError yolları dahil) test edilebilir olmalı — apps/web'in tarihsel
// %60 mandalıyla karıştırılmamalı.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
      // `index.ts` (barrel, yalnızca re-export) ve `types.ts` (yalnızca tip tanımı, çalışma
      // zamanı kodu yok) v8'in "0 statement = 0%" satırlarını rapordan temizlemek için hariç
      // tutulur — asıl hesap mantığı strength/intensity/energy dosyalarında.
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/types.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
