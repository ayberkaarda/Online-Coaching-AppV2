import { useEffect } from 'react'
import { Text } from 'react-native'
import { Link } from 'expo-router'
import { createConsoleLogger } from '@repo/logger'
import { PlaceholderScreen } from '../../components/PlaceholderScreen'

// WORKSPACE-TS ÇÖZÜMLEME KANITI (1/2): `createConsoleLogger` bir ÇALIŞMA ZAMANI değeridir,
// tip değil — yani derlemede silinmez ve Metro `packages/logger/src/index.ts`'i (ham,
// build edilmemiş TypeScript, pnpm symlink'inin ardında) gerçekten çözüp transpile etmek
// ZORUNDA kalır. `expo export` başarılı olursa bu iddia cihazsız olarak kanıtlanmış olur.
const logger = createConsoleLogger({ app: 'mobile', screen: 'dashboard' })

export default function DashboardScreen() {
  useEffect(() => {
    logger.info({ event: 'screen_mount' }, 'Panel ekranı açıldı')
  }, [])

  return (
    <PlaceholderScreen
      title="Panel"
      description="Günlük özet, duyurular ve istatistikler burada olacak."
    >
      <Link href="/sign-in">
        <Text>Giriş ekranını aç</Text>
      </Link>
    </PlaceholderScreen>
  )
}
