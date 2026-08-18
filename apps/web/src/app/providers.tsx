'use client'

// Uygulama genelindeki istemci sağlayıcıları: React Query, tema, bildirim (toast) ve hata sınırı.

import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Toaster } from 'sonner'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { getQueryClient } from '@/lib/query/queryClient'

// Devtools yalnızca geliştirme ortamında render edilir; ayrı chunk olduğu için
// production paketine yüklenmez.
const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then((mod) => ({ default: mod.ReactQueryDevtools })),
  { ssr: false }
)

// `nonce` A-14 (borç B-007) ile eklendi. GEREKÇE: `next-themes`'in `ThemeProvider`'ı, sayfa
// hydration'dan ÖNCE doğru temayı uygulayıp "yanlış tema flash'ını" (FOUC) engelleyen bir
// INLINE `<script>` render eder. `script-src`'tan `'unsafe-inline'` kaldırıldığı için bu
// script nonce almazsa tarayıcı tarafından BLOKLANIR — uygulama çalışmaya devam eder (tema
// React effect'iyle yine uygulanır) ama her sayfa yüklemesinde bir CSP ihlali üretilir ve
// karanlık modda beyaz bir flash görülür. next-themes (v0.4.6) bu senaryo için `nonce`
// prop'unu resmen destekliyor.
//
// Nonce zinciri: `src/proxy.ts` istek başına taze nonce üretip `x-nonce` İSTEK başlığına
// yazar -> `src/app/layout.tsx` onu `headers()` ile okur -> buraya prop olarak iner.
export function Providers({
  children,
  nonce,
}: {
  children: ReactNode
  /** Proxy'nin ürettiği istek-başına CSP nonce'u; `next-themes`'in inline script'ine geçer. */
  nonce?: string
}): JSX.Element {
  // useState ile sabitlenir: Fast Refresh sırasında önbellek sıfırlanmasın.
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster richColors closeButton position="top-right" />
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
