import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

// Kök yerleşim: sekme grubu ile placeholder auth ekranını aynı Stack altında tutar.
// expo-router seçildi çünkü her ekran dosya yolundan otomatik bir URL alır — Faz 7'nin
// push bildirimi derin bağlantıları için elle `linking` tablosu tutulmayacak (ADR-0023).
export default function RootLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Giriş' }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}
