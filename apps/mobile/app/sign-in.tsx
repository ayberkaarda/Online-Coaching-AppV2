import { Button, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'

// PLACEHOLDER auth ekranı — GERÇEK KİMLİK DOĞRULAMA YOK (Faz 4.5 commit 6 kapsamı).
// Supabase istemcisi, SecureStore oturum deposu ve @repo/api-client tüketimi bilerek
// dışarıda: api-client hook'ları web'e özgü `sonner` (DOM toast) import ettiği için mobil
// veri katmanı ayrı bir dilime bırakıldı. Alanlar hiçbir yere gönderilmez, hiçbir şey
// saklanmaz; ekran yalnızca yerleşim ve yönlendirme iskeletidir.
export default function SignInScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Giriş</Text>
      <Text style={styles.note}>
        Bu ekran şimdilik yalnızca bir iskelet: kimlik doğrulama sonraki dilimde bağlanacak.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="E-posta"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={false}
      />
      <TextInput style={styles.input} placeholder="Şifre" secureTextEntry editable={false} />
      <Button title="Panele dön" onPress={() => router.replace('/')} />
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
})
