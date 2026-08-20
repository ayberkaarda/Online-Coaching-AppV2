// Mobil bildirim (Notifier) uygulaması (B-052) — `NotifierProvider`'a enjekte edilir.
//
// `@repo/api-client` hook'ları toast'ı `useNotifier()` üzerinden enjeksiyonla alır (borç
// B-050): paket web'e özgü DOM toast kütüphanesine (`sonner`) bağlı KALMASIN diye. Web
// `sonnerNotifier`'ı enjekte eder; mobil, DOM'a hiç dokunmayan bir RN `Alert` sarmalayıcısı
// enjekte eder. `sonner` Metro grafiğine ASLA girmez — B-050 tam olarak bunun içindi.
//
// REFERANS KARARLILIĞI: notifier bir efektin bağımlılık dizisinde taşınabildiği için (bkz.
// notify.tsx `NOOP_NOTIFIER` notu) MODÜL SEVİYESİNDE TEK bir sabit nesnedir — her render'da
// yeni nesne üretilmez.

import { Alert } from 'react-native'

import type { Notifier } from '@repo/api-client/notify'

export const alertNotifier: Notifier = {
  success: (message: string) => Alert.alert('Tamam', message),
  error: (message: string) => Alert.alert('Hata', message),
  info: (message: string) => Alert.alert('Bilgi', message),
}
