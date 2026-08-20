// Uygulama genelindeki istemci sağlayıcıları (B-052) — web'in
// `apps/web/src/app/providers.tsx`'inin mobil emsali.
//
// ADR-0024 KANITI: `@repo/api-client` üç enjeksiyon portu tanımlar — Supabase istemcisi
// (`SupabaseClientProvider`), bildirim (`NotifierProvider`) ve TanStack Query
// (`QueryClientProvider`). Web bunlara cookie tabanlı istemci + `sonner` enjekte eder;
// mobil AYNI portlara SecureStore tabanlı istemci + RN `Alert` notifier enjekte eder.
// Paketin kendisi hiçbir platforma dallanmaz.

import { SupabaseClientProvider } from '@repo/api-client/context'
import { NotifierProvider } from '@repo/api-client/notify'
import { makeQueryClient } from '@repo/api-client/query/queryClient'
import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { alertNotifier } from './notifier'
import { createMobileSupabaseClient } from './supabase'

export function AppProviders({ children }: { children: ReactNode }) {
  // `useState` fabrikaları ZORUNLU (referans kararlılığı): Supabase istemcisi ve
  // QueryClient bir kez üretilip render'lar arası sabit tutulur — aksi halde realtime
  // abonelikleri/önbellek her render'da sökülüp kurulurdu (context.tsx başlığı).
  const [queryClient] = useState(makeQueryClient)
  const [supabaseClient] = useState(createMobileSupabaseClient)

  return (
    <SupabaseClientProvider client={supabaseClient}>
      <NotifierProvider notifier={alertNotifier}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NotifierProvider>
    </SupabaseClientProvider>
  )
}
