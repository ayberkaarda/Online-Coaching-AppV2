// Çıkış düğmesi — paylaşılan `useSignOut` hook'unu (@repo/api-client) tüketir.
// Ayar sheet'i içinde kullanılır (Panel gövdesinden çıkarıldı). Mantık AYNI.
//
// `useSignOut` `supabase.auth.signOut({ scope: 'local' })` çağırır (yalnız BU cihazdan
// çıkar, diğer oturumları düşürmez — useSession.ts başlığı), önbelleği temizler ve
// `onAuthStateChange` üzerinden oturum sorgusunu boşaltır. Oturum boşalınca
// `app/_layout.tsx`'teki kapı otomatik olarak giriş ekranına döner — burada elle
// yönlendirme yoktur.

import { useSignOut } from '@repo/api-client'

import { Button } from './ui'

export function SignOutButton() {
  const signOut = useSignOut()
  return (
    <Button
      title="Çıkış yap"
      variant="secondary"
      pending={signOut.isPending}
      onPress={() => signOut.mutate()}
      accessibilityLabel="Hesaptan çıkış yap"
    />
  )
}
