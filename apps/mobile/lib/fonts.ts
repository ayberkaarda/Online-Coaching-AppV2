// Yüklenecek font varlıkları (ADR-0015 tipografisi). Anahtarlar `lib/theme.ts`
// `fontFamily` değerleriyle BİREBİR aynıdır — `useFonts` bu anahtarlarla kaydeder,
// bileşenler aynı anahtarı `fontFamily` olarak kullanır. Yalnız ADR-0015'in izin
// verdiği ağırlıklar yüklenir (Archivo 600/700, Hanken 400/500/600, Plex Mono 500).

import { Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo'
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
} from '@expo-google-fonts/hanken-grotesk'
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono'

export const fontAssets = {
  Archivo_600SemiBold,
  Archivo_700Bold,
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  IBMPlexMono_500Medium,
} as const
