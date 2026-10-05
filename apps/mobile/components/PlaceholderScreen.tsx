import type { ReactNode } from 'react'
import { View } from 'react-native'

import { useTheme } from '../lib/theme'
import { Body, Heading, Icon, Screen } from './ui'
import type { IconName } from './ui'

// Kapı/placeholder ekranlarının ortak kabuğu (coach-web, mfa-web, boş sekmeler).
// "Kor & Kemik" kimliğiyle sade ama markalı — accent ikon işareti + ortalanmış
// başlık + açıklama. İkon işlevseldir (ekranın konusunu anlatır), dekoratif daire değil.
export function PlaceholderScreen({
  title,
  description,
  icon = 'sparkles',
  children,
}: {
  title: string
  description: string
  icon?: IconName
  children?: ReactNode
}) {
  const theme = useTheme()
  return (
    <Screen center edgeTop contentStyle={{ gap: 16 }}>
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
        }}
      >
        <Icon name={icon} size={30} color={theme.colors.accent} />
      </View>
      <Heading variant="displayMd" style={{ textAlign: 'center' }}>
        {title}
      </Heading>
      <Body variant="bodyLg" color="textSecondary" style={{ textAlign: 'center' }}>
        {description}
      </Body>
      {children}
    </Screen>
  )
}
