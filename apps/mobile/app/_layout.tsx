import { useIsCoach, useMfaStatus, useSession } from '@repo/api-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'

import { fontAssets } from '../lib/fonts'
import { AppProviders } from '../lib/providers'
import { fontFamily, useTheme } from '../lib/theme'

// Kök yerleşim (B-052): önce paylaşılan sağlayıcılar (Supabase/Notifier/Query enjeksiyonu),
// sonra OTURUM + ROL + MFA kapısı. Faz 4.7+: ADR-0015 fontları + tema.
//
// KAPI — Fable kararları (mobil YALNIZ danışan uygulamasıdır):
//   * oturum yok            -> giriş ekranı
//   * coach rolü            -> "koç paneli web'de" ekranı (VERİ GÖSTERİLMEZ)
//   * MFA gerektiren danışan-> "web kullanın" ekranı (v1'de mobil MFA yok)
//   * normal danışan        -> sekmeler
//
// `Stack.Protected` (expo-router 57) kullanılır: guard `false` olan ekran ağaçtan düşer ve
// router ilk uygun ekrana otomatik geçer — elle `router.replace` gerekmez. Durumlar birbirini
// dışlar, bu yüzden aynı anda YALNIZCA bir guard `true`'dur.

// ADR-0015 tipografisi yüklenene kadar açılış ekranı görünür kalsın — fontsuz ilk boyama
// (sistem fontuyla "flaş") engellenir.
void SplashScreen.preventAutoHideAsync()

type Gate = 'loading' | 'signed-out' | 'coach' | 'mfa' | 'client'

function useGate(): Gate {
  const { data: session, isLoading: sessionLoading } = useSession()

  // Rol ve MFA yalnızca OTURUM VARKEN anlamlıdır; oturumsuzken bu sorguların hatalı
  // sonuçları yönlendirmeyi ETKİLEMEZ, çünkü 'signed-out' erken döner.
  const isCoachQuery = useIsCoach()
  const mfaQuery = useMfaStatus()

  if (sessionLoading) return 'loading'
  if (!session) return 'signed-out'
  // Rol/MFA net cevabı gelene KADAR danışan tabına düşürme (koç bir an bile RLS'in reddedeceği
  // boş danışan ekranını görmesin). `isPending` ilk yüklemeyi, `isFetching` giriş sonrası
  // yeniden çekmeyi (sign-in.tsx `invalidateQueries`) kapsar — böylece parola girişinden hemen
  // sonra koç sekmeleri "flaş"lamaz. Sorgu KESİN hata verirse (retry yok) `isFetching`/`isPending`
  // ikisi de düşer ve en iyi çaba kararına geçilir; kapı takılıp kalmaz.
  if (
    isCoachQuery.isPending ||
    isCoachQuery.isFetching ||
    mfaQuery.isPending ||
    mfaQuery.isFetching
  ) {
    return 'loading'
  }
  if (isCoachQuery.data === true) return 'coach'
  // Parolayla giriş her zaman aal1 verir; danışanın DOĞRULANMIŞ bir faktörü varsa
  // `needsStepUp` true olur (currentLevel !== nextLevel) — mobil v1'de step-up yok.
  if (mfaQuery.data?.needsStepUp === true) return 'mfa'
  return 'client'
}

function RootNavigator() {
  const gate = useGate()
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
      <Stack.Protected guard={gate === 'loading'}>
        <Stack.Screen name="loading" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'signed-out'}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'coach'}>
        <Stack.Screen name="coach-web" options={{ title: 'Koç paneli' }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'mfa'}>
        <Stack.Screen name="mfa-web" options={{ title: 'İki adımlı doğrulama' }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'client'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets)

  // Fontlar yüklenince (veya yüklenemezse) açılış ekranını kapat. Hata olsa da uygulama
  // sistem fontuyla açılır — kilitlenmez.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <AppProviders>
      <RootNavigator />
      <StatusBar style="auto" />
    </AppProviders>
  )
}
