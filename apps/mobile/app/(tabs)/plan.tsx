import { Text } from 'react-native'
import { DAY_NAMES } from '@repo/types'
import { PlaceholderScreen } from '../../components/PlaceholderScreen'

// WORKSPACE-TS ÇÖZÜMLEME KANITI (2/2): `DAY_NAMES` de çalışma zamanı değeri; web ile mobil
// gün adları için TEK kaynağı paylaşır (`packages/types/src/domain.ts`). Tip-only bir import
// derlemede silinir ve hiçbir şey kanıtlamazdı — bu yüzden bilerek bir sabit seçildi.
export default function PlanScreen() {
  return (
    <PlaceholderScreen title="Antrenman" description="Haftalık antrenman planı burada olacak.">
      <Text>{DAY_NAMES.join(' · ')}</Text>
    </PlaceholderScreen>
  )
}
