import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { SignOutButton } from '../components/SignOutButton'

// KOÇ KAPISI (Fable kararı): mobil YALNIZ danışan uygulamasıdır. Koç rolüyle giriş yapan
// kullanıcıya koç panelinin web'de olduğu söylenir ve HİÇBİR VERİ gösterilmez. (Zaten
// `mfa_aal2_gate` RLS'i aal1'deki koça 14 tabloyu göstermezdi; bu ekran o boş/hatalı
// deneyimi anlamlı bir mesaja çevirir.)
export default function CoachWebScreen() {
  return (
    <PlaceholderScreen
      title="Koç paneli web'de"
      description="Koçluk yönetimi (danışanlar, planlar, onaylar) yalnızca web uygulamasında kullanılabilir. Mobil uygulama danışanlar içindir."
    >
      <SignOutButton />
    </PlaceholderScreen>
  )
}
