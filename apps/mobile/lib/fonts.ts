// Yüklenecek font varlıkları ("Kor & Kemik" tipografisi, brand-proposal §4). Anahtarlar
// `lib/theme.ts` `fontFamily` değerleriyle BİREBİR aynıdır — `useFonts` bu anahtarlarla
// kaydeder, bileşenler aynı anahtarı `fontFamily` olarak kullanır. Yalnız kararın izin
// verdiği ağırlıklar yüklenir: Bricolage 600/700, Instrument Sans 400/500/600, JetBrains Mono 500.
//
// Ağırlık başına ALT YOL import edilir (`/600SemiBold`): paket kökünden import, metro'nun
// paketteki TÜM ağırlıkların ttf'sini (≈30 dosya) bundle'a koymasına yol açıyordu (ÖLÇÜLDÜ).

import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold'
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold'
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular'
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium'
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium'

export const fontAssets = {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  JetBrainsMono_500Medium,
} as const
