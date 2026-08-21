import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { SignOutButton } from '../components/SignOutButton'

// MFA KAPISI (Fable kararı): iki adımlı doğrulama tanımlı danışan mobil v1'de
// DESTEKLENMEZ. Parolayla giriş yalnızca aal1 verir; step-up (challenge + verify) akışı
// mobile getirilmedi — bu yüzden bu danışan web'e yönlendirilir. (Kod yazılmadı, yalnızca
// kapı: mobil MFA akışı sonraki bir dilimin işi.)
export default function MfaWebScreen() {
  return (
    <PlaceholderScreen
      title="İki adımlı doğrulama gerekli"
      description="Hesabınızda iki adımlı doğrulama (MFA) açık. Mobil uygulama şimdilik MFA doğrulamasını desteklemiyor — lütfen web uygulamasından giriş yapın."
      icon="shield-checkmark-outline"
    >
      <SignOutButton />
    </PlaceholderScreen>
  )
}
