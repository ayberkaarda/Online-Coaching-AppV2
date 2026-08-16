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

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  // useState ile sabitlenir: Fast Refresh sırasında önbellek sıfırlanmasın.
  const [queryClient] = useState(getQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ErrorBoundary>{children}</ErrorBoundary>
        <Toaster richColors closeButton position="top-right" />
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
