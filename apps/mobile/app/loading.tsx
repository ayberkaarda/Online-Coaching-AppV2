import { View } from 'react-native'

import { LoadingState } from '../components/ui'
import { useTheme } from '../lib/theme'

// Oturum/rol/MFA çözülene kadar gösterilen ara ekran (B-052). Kapı (`app/_layout.tsx`)
// net cevabı alınca otomatik olarak doğru ekrana geçer. Faz 4.7+: token'lı zemin.
export default function LoadingScreen() {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <LoadingState />
    </View>
  )
}
