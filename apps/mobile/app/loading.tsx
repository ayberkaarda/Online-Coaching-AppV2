import { ActivityIndicator, StyleSheet, View } from 'react-native'

// Oturum/rol/MFA çözülene kadar gösterilen ara ekran (B-052). Kapı (`app/_layout.tsx`)
// net cevabı alınca otomatik olarak doğru ekrana geçer.
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
