import { useIsCoach, useMfaStatus, useSession } from '@repo/api-client'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'

import { fontAssets } from '../lib/fonts'
import { AppProviders } from '../lib/providers'
import { fontFamily, useTheme } from '../lib/theme'

// Kök yerleşim: önce paylaşılan sağlayıcılar (Supabase/Notifier/Query enjeksiyonu),
// sonra OTURUM + ROL + MFA kapısı. Faz 4.7+: ADR-0015 fontları + tema.
//
// KAPI — ADR-0028 (B-052'nin "mobil = yalnız danışan" kararı TERSİNE ÇEVRİLDİ):
//   * oturum yok             -> giriş ekranı
//   * step-up gerekli        -> aal1→aal2 yükseltme ekranı (KOÇ VEYA opt-in MFA danışanı)
//   * aal2 koç               -> ACİL-ERİŞİM koç paneli (dar, salt-okur ağırlıklı)
//   * faktörsüz koç (nadir)  -> "web'den MFA kur" mesajı
//   * normal danışan         -> sekmeler (aal2 danışan da buraya düşer)
//
// `mfa_aal2_gate` RLS'i (14 tablo, platform-bağımsız) gerçek sınırdır; bu kapı yalnızca
// KULLANICIYI DOĞRU EKRANA GÖTÜRÜR (bkz. `useMfa.ts` başlığı "BU HOOK BİR GÜVENLİK SINIRI
// DEĞİLDİR"). Step-up ekranı rolü BİLMEZ — yalnızca doğrular; verify sonrası kapı yeniden
// değerlenir ve koç→panel, danışan→tabs olarak DOĞRU dağıtır.
//
// `Stack.Protected` (expo-router 57): guard `false` olan ekran ağaçtan düşer ve router ilk
// uygun ekrana otomatik geçer — elle `router.replace` gerekmez. Durumlar birbirini dışlar,
// bu yüzden aynı anda YALNIZCA bir guard `true`'dur.

// ADR-0015 tipografisi yüklenene kadar açılış ekranı görünür kalsın — fontsuz ilk boyama
// (sistem fontuyla "flaş") engellenir.
void SplashScreen.preventAutoHideAsync()

type Gate = 'loading' | 'signed-out' | 'step-up' | 'coach' | 'coach-no-mfa' | 'client'

function useGate(): Gate {
  const { data: session, isLoading: sessionLoading } = useSession()

  // Rol ve MFA yalnızca OTURUM VARKEN anlamlıdır; oturumsuzken bu sorguların hatalı
  // sonuçları yönlendirmeyi ETKİLEMEZ, çünkü 'signed-out' erken döner.
  const isCoachQuery = useIsCoach()
  const mfaQuery = useMfaStatus()

  if (sessionLoading) return 'loading'
  if (!session) return 'signed-out'
  // Rol/MFA'nın YALNIZCA İLK cevabını bekle (`isPending`) — ARKA PLAN refetch'ini (`isFetching`)
  // KAPIYA SOKMA. Sebep bir oscillation hatasıydı: step-up ekranı (ve gate) aynı
  // `['mfa','status']` query'sini gözler; o query `staleTime:0`'dır (verify sonrası bayat aal1
  // dönmesin diye — DEĞİŞTİRME), bu yüzden step-up mount olunca refetch tetikler → `isFetching`
  // dalı gate'i 'loading'e düşürür → step-up unmount → refetch biter → tekrar mount → SONSUZ
  // DÖNGÜ. `isPending` bunların hepsini zaten doğru karşılar: İLK GİRİŞ'te (session gelince
  // enabled olan query) `isPending:true` → gate 'loading' (parola sonrası flaş YOK); arka plan
  // refetch'te (navigasyon/focus/step-up mount, verify invalidate) `isPending:false` + veri VAR
  // → gate mevcut veriyle karar verir, unmount YOK → döngü kırılır. Verify sonrası son durum da
  // doğru: refetch bitince `isAal2:true` gelir ve gate 'coach' (panel) verir.
  // KESİN hata verirse (retry yok) `isPending` düşer ve en iyi çaba kararına geçilir.
  if (isCoachQuery.isPending || mfaQuery.isPending) {
    return 'loading'
  }
  // Faktörü var ama oturum aal1: KOÇ VEYA DANIŞAN aynı step-up ekranına gider. Bu dal koç
  // dalından ÖNCE gelir çünkü koç parolayla girince hep aal1'dir ve step-up olmadan RLS 14
  // tabloyu reddeder — koçu doğrudan panele yollasaydık boş/hatalı ekran görürdü.
  if (mfaQuery.data?.needsStepUp === true) return 'step-up'
  if (isCoachQuery.data === true) {
    // aal2 koç → panel; faktörsüz koç (needsStepUp false + isAal2 false) → web'de kur mesajı.
    return mfaQuery.data?.isAal2 === true ? 'coach' : 'coach-no-mfa'
  }
  // Normal danışan (aal2 danışan da buraya düşer → tabs).
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
      <Stack.Protected guard={gate === 'step-up'}>
        <Stack.Screen name="step-up" options={{ title: 'İki adımlı doğrulama' }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'coach'}>
        <Stack.Screen name="(coach)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'coach-no-mfa'}>
        <Stack.Screen name="coach-no-mfa" options={{ title: 'Koç paneli' }} />
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
