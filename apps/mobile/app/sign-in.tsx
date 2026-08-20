import { useSupabaseClient } from '@repo/api-client/context'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native'

// GERÇEK giriş ekranı (B-052 dilim 1).
//
// NEDEN `useSignIn` (paket hook'u) DEĞİL, doğrudan `supabase.auth.signInWithPassword`:
// `useSignIn` girişi kendi SUNUCUMUZUN `/api/auth/sign-in` ucuna taşır (uygulama katmanı
// kaba kuvvet sınırı için — useSession.ts). O uç `apps/web`'e aittir; mobil HOSTED GoTrue'ya
// DOĞRUDAN gider (kendi hız sınırı orada). Yine de istemci enjekte edilmiş paket üzerinden
// (`useSupabaseClient()`) alınır — ADR-0024 enjeksiyon deseninin tüketimi budur.
//
// Oturum başarıda SecureStore'a yazılır (fabrika `persistSession: true`); `useSession`'ın
// `onAuthStateChange` dinleyicisi oturum önbelleğini doldurur ve `app/_layout.tsx` kapısı
// otomatik olarak doğru ekrana geçer — burada elle yönlendirme YOKTUR.
export default function SignInScreen() {
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Giriş</Text>
      <Text style={styles.note}>Danışan hesabınızla giriş yapın.</Text>

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!submitting}
      />
      <TextInput
        style={styles.input}
        placeholder="Şifre"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {submitting ? (
        <ActivityIndicator />
      ) : (
        <Button
          title="Giriş yap"
          onPress={handleSignIn}
          disabled={email.trim().length === 0 || password.length === 0}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  note: {
    fontSize: 14,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c7c7cc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    color: '#c1121f',
    fontSize: 14,
  },
})
