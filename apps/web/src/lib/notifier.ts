// `@repo/api-client`'ın bildirim portunun WEB uygulaması (borç B-050).
//
// Paket bir toast kütüphanesi import etmez, `Notifier` arayüzünü ister; web tarafında onu
// `sonner` karşılar (kullanıcıya görünen `<Toaster>` `app/providers.tsx`'te render edilir).
//
// REFERANS KARARLILIĞI: MODÜL SEVİYESİNDE TEK bir sabittir. `providers.tsx` her render'da
// yeni bir nesne üretseydi, notifier'ı bağımlılık dizisinde taşıyan tüketiciler (realtime
// abonelikler gibi) gereksiz yere yeniden kurulurdu — Supabase istemcisiyle aynı tuzak.

import { toast } from 'sonner'

import type { Notifier } from '@repo/api-client/notify'

export const sonnerNotifier: Notifier = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
  info: (message) => toast.info(message),
}
