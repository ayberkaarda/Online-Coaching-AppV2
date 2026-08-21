import { PlaceholderScreen } from '../components/PlaceholderScreen'
import { SignOutButton } from '../components/SignOutButton'

// FAKTÖRSÜZ KOÇ (nadir) — ADR-0028: koç acil-erişim paneli aal2 step-up ile kapılıdır ve
// step-up mevcut bir TOTP faktörü gerektirir. Kayıt (QR okutma) mobilde SUNULMAZ (Karar 1) —
// hiç faktörü olmayan koç kurulumu web'de yapmalıdır. Bu ekran o durumu (RLS'in göstereceği
// boş/hatalı deneyim yerine) anlamlı, kısa bir yönlendirmeye çevirir.
export default function CoachNoMfaScreen() {
  return (
    <PlaceholderScreen
      title="Önce iki adımlı doğrulama"
      description="Acil-erişim paneli için hesabınızda iki adımlı doğrulama kurulu olmalı. Kurulum (QR kod) yalnızca web uygulamasındadır; kurduktan sonra buradan kodla giriş yapabilirsiniz."
      icon="shield-outline"
    >
      <SignOutButton />
    </PlaceholderScreen>
  )
}
