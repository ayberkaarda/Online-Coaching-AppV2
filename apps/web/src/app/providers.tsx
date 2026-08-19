'use client'

// Uygulama genelindeki istemci sağlayıcıları: React Query, tema, bildirim (toast) ve hata sınırı.

import { SupabaseClientProvider } from '@repo/api-client/context'
import { NotifierProvider } from '@repo/api-client/notify'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { Toaster } from 'sonner'

import { getQueryClient } from '@repo/api-client/query/queryClient'

import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { clearLegacySupabaseAuthStorage } from '@/lib/legacy-auth-cleanup'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { sonnerNotifier } from '@/lib/notifier'

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
  // Faz 4.5 commit 5 (ADR-0024): `@repo/api-client` Supabase istemcisini modül seviyesinde
  // import ETMEZ, buradan enjeksiyonla alır. Web'in cookie tabanlı deposu böylece pakete
  // (ve ileride apps/mobile'a) sızmaz.
  //
  // REFERANS KARARLILIĞI — `useState` fabrikası ZORUNLU: `useMessages`/`usePresence`
  // `supabase.channel(...)` aboneliğini `useEffect` içinde kuruyor ve istemci bağımlılık
  // dizisinde. Her render'da yeni bir istemci verilseydi realtime kanalı her render'da
  // sökülüp yeniden kurulurdu. `createBrowserSupabaseClient()` ayrıca modül seviyesinde de
  // tekilleştirilmiş bir örnek döndürür (bkz. `@/lib/supabase/client`), yani koruma iki
  // katmanlı. Kanıt: `tests/unit/supabase-client-context.test.tsx`.
  const [supabaseClient] = useState(createBrowserSupabaseClient)

  // B-045: A-05 ile oturum deposu cookie'ye taşındı ama önceden giriş yapmış tarayıcılarda
  // eski `sb-*-auth-token` localStorage artıkları (JWT + refresh token) hiç temizlenmiyordu —
  // mount'ta bir kez, tek seferlik temizlik.
  useEffect(() => {
    clearLegacySupabaseAuthStorage()
  }, [])

  return (
    <SupabaseClientProvider client={supabaseClient}>
      {/* Borç B-050: `@repo/api-client` hook'ları toast'ı da enjeksiyonla alır — paket
          web'e özgü DOM toast kütüphanesine bağlı kalmasın diye. `sonnerNotifier` modül
          seviyesinde sabittir, bu yüzden burada `useState`/`useMemo` gerekmez. */}
      <NotifierProvider notifier={sonnerNotifier}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
            <ErrorBoundary>{children}</ErrorBoundary>
            <Toaster richColors closeButton position="top-right" />
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
          </ThemeProvider>
        </QueryClientProvider>
      </NotifierProvider>
    </SupabaseClientProvider>
  )
}
