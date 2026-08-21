import { Ionicons } from '@expo/vector-icons'
import { useSupabaseClient } from '@repo/api-client/context'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'

import { Body, Button, Card, Heading, Input, Screen } from '../components/ui'
import { useTheme } from '../lib/theme'

// GERÇEK giriş ekranı (B-052 dilim 1). Faz 4.7: ADR-0015 kimliğiyle güzelleştirildi —
// marka başlığı + tanımlı kart + ikonlu girişler.
//
// NEDEN `useSignIn` (paket hook'u) DEĞİL, doğrudan `supabase.auth.signInWithPassword`:
// `useSignIn` girişi kendi SUNUCUMUZUN `/api/auth/sign-in` ucuna taşır (uygulama katmanı
// kaba kuvvet sınırı için — useSession.ts). O uç `apps/web`'e aittir; mobil HOSTED GoTrue'ya
// DOĞRUDAN gider (kendi hız sınırı orada). Yine de istemci enjekte edilmiş paket üzerinden
// (`useSupabaseClient()`) alınır — ADR-0024 enjeksiyon deseninin tüketimi budur.
//
// Oturum başarıda SecureStore'a yazılır (fabrika `persistSession: true`); `useSession`'ın
// `onAuthStateChange` dinleyicisi oturum önbelleğini doldurur ve `app/_layout.tsx` kapısı
// otomatik olarak doğru ekrana geçer — burada elle yönlendirme YOKTUR. Sunum değişti,
// veri/oturum mantığı AYNI kaldı.
export default function SignInScreen() {
  const theme = useTheme()
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSignIn() {
    setError(null)
    setSubmitting(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        // GoTrue "Invalid login credentials" döner; kullanıcıya nötr Türkçe mesaj.
        setError('E-posta veya şifre hatalı.')
        return
      }
      // Rol/MFA sorguları oturumsuzken hata almış olabilir; kapının doğru kararı verebilmesi
      // için tazelenir (oturum sorgusu `onAuthStateChange` ile zaten dolar).
      await queryClient.invalidateQueries()
    } catch {
      setError('Giriş yapılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0

  return (
    <Screen center scroll={false} edgeTop contentStyle={{ gap: 24 }}>
      {/* Marka başlığı — accent işaret + ad. Halka DEĞİL (tek anlam kuralı). */}
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: theme.radius.panel,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="fitness" size={30} color={theme.colors.accentContrast} />
        </View>
        <Heading variant="displayLg">Sarmal</Heading>
        <Body variant="bodyLg" color="textSecondary" style={{ textAlign: 'center' }}>
          Danışan hesabınızla giriş yapın.
        </Body>
      </View>

      <Card variant="panel" style={{ width: '100%', gap: 16 }}>
        <Input
          label="E-POSTA"
          leftIcon="mail-outline"
          placeholder="ornek@eposta.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />
        <Input
          label="ŞİFRE"
          leftIcon="lock-closed-outline"
          placeholder="••••••••"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
          error={error}
        />
        <Button
          title="Giriş yap"
          onPress={handleSignIn}
          pending={submitting}
          disabled={!canSubmit}
          style={{ marginTop: 4 }}
          accessibilityLabel="Danışan hesabıyla giriş yap"
        />
      </Card>
    </Screen>
  )
}
