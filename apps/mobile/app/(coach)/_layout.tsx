import { Stack } from 'expo-router'

import { fontFamily, useTheme } from '../../lib/theme'

// KOÇ ACİL-ERİŞİM grubu (B-065 / ADR-0028). Kök kapı yalnızca aal2 koç için bu grubu mount
// eder (guard `gate === 'coach'`), bu yüzden buradaki tüm sorgular aal2 altında çalışır ve
// `mfa_aal2_gate` RLS'i açıktır — bileşenler MFA'yı AYRICA kontrol etmez.
//
// Dashboard (index) kendi başlık satırını çizer (koç adı + çıkış), bu yüzden başlığı gizli;
// danışan detayı (client/[id]) navigatör başlığını (geri düğmesi + danışan adı) kullanır.
export default function CoachLayout() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontFamily: fontFamily.displaySemibold,
          color: theme.colors.textPrimary,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="client/[id]" options={{ title: 'Danışan' }} />
    </Stack>
  )
}
