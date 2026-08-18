'use client'

// Supabase istemcisinin ENJEKSİYON noktası (ADR-0024).
//
// Bu paket Supabase istemcisini MODÜL SEVİYESİNDE import ETMEZ — `apps/web`'in
// `createBrowserSupabaseClient()`'ı `@supabase/ssr` üzerinden `document.cookie`'ye yazar ve
// React Native'de `document` yoktur; paket o istemciyi doğrudan import etseydi mobilde import
// edildiği anda çökerdi. Bunun yerine her uygulama KENDİ istemcisini kurar ve buradan enjekte
// eder: web cookie deposuyla, mobil `expo-secure-store` tabanlı bir `auth.storage`
// adaptörüyle. Paket tarafında HİÇBİR platform dallanması yoktur.
//
// REFERANS KARARLILIĞI (kritik): `useMessages` bu istemci üzerinden `supabase.channel(...)`
// realtime aboneliği kuruyor ve abonelik `useEffect` bağımlılık dizisinde istemciyi taşıyor.
// Sağlayıcıya her render'da YENİ bir istemci verilirse abonelik her render'da sökülüp yeniden
// kurulur (bağlantı çırpınması, kaçırılan mesajlar). Bu yüzden sağlayıcıyı kuran taraf
// istemciyi bir kez üretmek ZORUNDADIR — `apps/web/src/app/providers.tsx` bunu
// `useState(createBrowserSupabaseClient)` ile yapar (fabrika ayrıca modül seviyesinde de
// tekilleştirilmiştir). Kanıt: `apps/web/tests/unit/supabase-client-context.test.tsx`.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, createElement, useContext, type ReactNode } from 'react'

import type { Database } from '@repo/types'

const SupabaseClientContext = createContext<SupabaseClient<Database> | null>(null)

export function SupabaseClientProvider({
  client,
  children,
}: {
  client: SupabaseClient<Database>
  /**
   * OPSİYONEL yazıldı (ADR'deki taslakta zorunluydu): `React.createElement(Provider, props,
   * ...children)` aşırı yüklemesi, props tipinde `children` ZORUNLU olduğunda eşleşmiyor —
   * `.ts` (JSX'siz) test dosyaları sarmalayıcıyı ancak `children`'ı props NESNESİNE koyarak
   * kurabilirdi, o da `react/no-children-prop` lint hatası veriyor. Çalışma zamanı davranışı
   * aynıdır; çocuksuz bir sağlayıcı zaten anlamlı bir kullanım değil.
   */
  children?: ReactNode
}) {
  // JSX yerine `createElement`: bu dosya ham TS olarak yayınlanıyor ve JSX derlemesi tüketen
  // tarafın (Next `transpilePackages`, Metro) sorumluluğunda. `createElement` her iki tarafta
  // da ek yapılandırma gerektirmez.
  return createElement(SupabaseClientContext.Provider, { value: client }, children)
}

/** Her hook'un kullandığı tek giriş noktası. Provider dışında çağrılırsa fırlatır. */
export function useSupabaseClient(): SupabaseClient<Database> {
  const client = useContext(SupabaseClientContext)
  if (!client) {
    throw new Error(
      'useSupabaseClient() bir <SupabaseClientProvider> içinde çağrılmalı — istemci enjekte edilmedi.'
    )
  }
  return client
}
