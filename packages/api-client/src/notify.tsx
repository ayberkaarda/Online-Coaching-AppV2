'use client'

// Bildirim (toast) ENJEKSİYON noktası — Supabase istemcisiyle BİREBİR aynı gerekçe
// (ADR-0024, borç B-050).
//
// Bu paket web'e özgü hiçbir toast kütüphanesini MODÜL SEVİYESİNDE import ETMEZ: web toast
// kütüphaneleri DOM'a bağlıdır (kendi kapsayıcılarını `document.body`'ye takarlar). Paket
// böyle bir kütüphaneyi doğrudan import etseydi, `@repo/api-client`'tan tek bir hook kullanan
// mobil ekran bile Metro'nun modül grafiğine o kütüphaneyi — dolayısıyla `document`/`window`
// bağımlılığını — sokardı. Bunun yerine her uygulama KENDİ bildirim uygulamasını enjekte eder:
// web `apps/web/src/lib/notifier.ts`'teki sarmalayıcıyı, mobil ileride kendi yerel
// toast/snackbar'ını. Paket tarafında HİÇBİR platform dallanması yoktur.

import { createContext, createElement, useContext, type ReactNode } from 'react'

import { logger } from '@repo/logger'

/** Uygulamaların sağlaması gereken minimum bildirim yüzeyi (hook'ların kullandığı üç seviye). */
export type Notifier = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const NotifierContext = createContext<Notifier | null>(null)

let warnedAboutMissingProvider = false

/** Sağlayıcısız çalışıldığında log'u BİR KEZ yaz — her mutasyonda tekrarlanırsa gürültü olur. */
function warnMissingProviderOnce(): void {
  if (warnedAboutMissingProvider) return
  warnedAboutMissingProvider = true
  logger.warn({}, 'NotifierProvider yok; bildirimler yutuluyor')
}

/**
 * Sağlayıcı yokken dönen no-op bildirim.
 *
 * REFERANS KARARLILIĞI (kritik): MODÜL SEVİYESİNDE TEK bir sabittir. `useNotifier()` her
 * çağrıda yeni bir nesne üretseydi, notifier'ı `useEffect` bağımlılık dizisinde ya da bir
 * `useCallback` içinde taşıyan yerler (ör. `useMessages`'ın realtime kanal aboneliği) her
 * render'da yeniden kurulurdu — `context.tsx`'teki aynı tuzak.
 */
const NOOP_NOTIFIER: Notifier = {
  success: () => warnMissingProviderOnce(),
  error: () => warnMissingProviderOnce(),
  info: () => warnMissingProviderOnce(),
}

export function NotifierProvider({
  notifier,
  children,
}: {
  notifier: Notifier
  /** `SupabaseClientProvider` ile aynı gerekçeyle OPSİYONEL — bkz. context.tsx. */
  children?: ReactNode
}) {
  // JSX yerine `createElement`: bu dosya ham TS olarak yayınlanıyor, derleme tüketen tarafta.
  return createElement(NotifierContext.Provider, { value: notifier }, children)
}

/**
 * Her hook'un kullandığı tek bildirim giriş noktası.
 *
 * `useSupabaseClient()`'ın aksine sağlayıcı yoksa FIRLATMAZ: Supabase istemcisi olmadan hook
 * hiçbir iş yapamaz ama bildirim yalnızca bir yan etkidir. Sessiz no-op sayesinde mobil ekranlar
 * ve sağlayıcı kurmayan birim testleri sarmalayıcı eklemeden çalışabilir; eksiklik ilk yutulan
 * bildirimde bir kez log'lanır.
 */
export function useNotifier(): Notifier {
  return useContext(NotifierContext) ?? NOOP_NOTIFIER
}
