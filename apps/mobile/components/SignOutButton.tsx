// Çıkış düğmesi — paylaşılan `useSignOut` hook'unu (@repo/api-client) tüketir.
//
// `useSignOut` `supabase.auth.signOut({ scope: 'local' })` çağırır (yalnız BU cihazdan
// çıkar, diğer oturumları düşürmez — useSession.ts başlığı), önbelleği temizler ve
// `onAuthStateChange` üzerinden oturum sorgusunu boşaltır. Oturum boşalınca
// `app/_layout.tsx`'teki kapı otomatik olarak giriş ekranına döner — burada elle
// yönlendirme yoktur.

import { useSignOut } from '@repo/api-client'
import { Button, View } from 'react-native'

export function SignOutButton() {
  const signOut = useSignOut()
  return (
    <View>
      <Button
        title={signOut.isPending ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
        color="#c1121f"
        onPress={() => signOut.mutate()}
        disabled={signOut.isPending}
      />
    </View>
  )
}
