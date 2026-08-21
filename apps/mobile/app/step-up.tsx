import { isValidTotpCode, normalizeTotpCode, useMfaStatus, useVerifyTotp } from '@repo/api-client'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { View } from 'react-native'

import { SignOutButton } from '../components/SignOutButton'
import { Body, Button, Card, Heading, Input, LoadingState, Screen } from '../components/ui'
import { useTheme } from '../lib/theme'

// STEP-UP EKRANI (B-065 / ADR-0028) — aal1→aal2 SEVİYE YÜKSELTME.
//
// Bu ekran mevcut, DOĞRULANMIŞ bir TOTP faktörünü `challenge()` + `verify()` ile onaylatır.
// KAYIT (enroll / QR okutma) YOKTUR (ADR-0028 Karar 1): mobilde ilk kez MFA'ya kaydolan koç
// senaryosu kapsam dışıdır; QR'ı aynı telefonda hem üretip hem okutmak anlamsızdır.
//
// EKRAN ROLÜ BİLMEZ: kök kapı (`_layout.tsx`) hem koçu hem opt-in MFA danışanını `needsStepUp`
// dalıyla buraya yollar. `useVerifyTotp` başarıda TÜM query'leri invalidate eder → kapı yeniden
// değerlenir ve koç→panel, danışan→tabs olarak DOĞRU dağıtır (bkz. hook başlığı).
//
// GERÇEK SINIR VERİTABANINDADIR: `mfa_aal2_gate` RESTRICTIVE RLS (14 tablo) aal1'de koça hiçbir
// satır göstermez; bu ekran o "0 satır / permission denied" deneyimini anlamlı bir adıma çevirir.
export default function StepUpScreen() {
  const theme = useTheme()
  const { data: status, isLoading } = useMfaStatus()
  const verifyTotp = useVerifyTotp()
  const [code, setCode] = useState('')

  const factor = status?.verifiedTotpFactor ?? null

  if (isLoading) {
    return (
      <Screen scroll={false} center edgeTop>
        <LoadingState label="Doğrulama hazırlanıyor" />
      </Screen>
    )
  }

  // SAVUNMACI: kapı normalde faktörü olmayan kullanıcıyı buraya yollamaz (coach-no-mfa'ya ya
  // da client'a düşer). Yine de faktör null gelirse boş adımda kilitlenmesin, çıkış sunulur.
  if (!factor) {
    return (
      <Screen center edgeTop contentStyle={{ gap: theme.spacing.lg }}>
        <Card variant="panel" style={{ gap: theme.spacing.sm }}>
          <Heading variant="displaySm">Doğrulama faktörü bulunamadı</Heading>
          <Body color="textSecondary">
            Hesabınızda kayıtlı bir iki adımlı doğrulama faktörü görünmüyor. Kurulumu web
            uygulamasından tamamlayıp tekrar giriş yapın.
          </Body>
        </Card>
        <SignOutButton />
      </Screen>
    )
  }

  function handleVerify() {
    if (!factor) return
    verifyTotp.mutate({ factorId: factor.id, code }, { onSuccess: () => setCode('') })
  }

  return (
    <Screen center edgeTop contentStyle={{ gap: theme.spacing.lg }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radius.panel,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'center',
        }}
      >
        <Ionicons name="shield-checkmark-outline" size={30} color={theme.colors.accent} />
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Heading variant="displayMd" style={{ textAlign: 'center' }}>
          İki adımlı doğrulama
        </Heading>
        <Body variant="bodyLg" color="textSecondary" style={{ textAlign: 'center' }}>
          Devam etmek için kimlik doğrulayıcı uygulamanızdaki 6 haneli kodu girin.
        </Body>
      </View>

      <Card variant="panel" style={{ gap: theme.spacing.md }}>
        <Input
          label="Doğrulama kodu"
          leftIcon="keypad-outline"
          mono
          value={code}
          onChangeText={(text) => setCode(normalizeTotpCode(text))}
          placeholder="123456"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          editable={!verifyTotp.isPending}
          accessibilityLabel="Doğrulama kodu"
        />
        <Button
          title="Doğrula"
          onPress={handleVerify}
          pending={verifyTotp.isPending}
          disabled={!isValidTotpCode(code)}
        />
      </Card>

      {/* B-061 (ADR-0028 §Bilinçli kapsam dışı): GoTrue verify diğer oturumları iptal eder
          (ADR-0026 §Kalan risk 6). Kullanıcı bunu ÖNCEDEN bilsin. */}
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.sm,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface,
          padding: theme.spacing.md,
        }}
      >
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={theme.colors.warning}
          style={{ marginTop: 1 }}
        />
        <Body variant="bodySm" color="textSecondary" style={{ flex: 1 }}>
          Doğrulama, diğer cihazlardaki oturumlarınızı sonlandırır.
        </Body>
      </View>

      <SignOutButton />
    </Screen>
  )
}
