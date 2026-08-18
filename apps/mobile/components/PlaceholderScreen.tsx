import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

// Faz 4.5 commit 6 iskeletinin tek görsel yapıtaşı: her sekme aynı boş-durum kartını
// gösterir. Gerçek ekranlar (veri katmanı, @repo/api-client tüketimi) sonraki dilimde
// gelecek — burada bilerek yalnızca yerleşim ve navigasyon kanıtlanıyor.
export function PlaceholderScreen({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  description: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: 'center',
  },
})
