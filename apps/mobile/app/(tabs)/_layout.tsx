import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { fontFamily, useTheme } from '../../lib/theme'

// Beş sekme. Etiketler web panelinin ürün diliyle birebir aynı
// (bkz. apps/web/src/components/DashboardTabs.tsx): Panel · Antrenman · Beslenme ·
// İlerleme · Sohbet. İkonlar @expo/vector-icons (Ionicons) — aktif tint accent (Menevis),
// pasif textSecondary; ikisi de token'dan. Panel (index) kendi başlık satırını çizer
// (karşılama + ayar dişlisi) — bu yüzden onun navigatör başlığı gizli.
const ICONS = {
  index: 'home',
  plan: 'barbell',
  nutrition: 'restaurant',
  progress: 'trending-up',
  chat: 'chatbubble-ellipses',
} as const

export default function TabsLayout() {
  const theme = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        headerStyle: { backgroundColor: theme.colors.bg },
        headerShadowVisible: false,
        headerTitleStyle: {
          fontFamily: fontFamily.displaySemibold,
          color: theme.colors.textPrimary,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontFamily: fontFamily.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name={ICONS.index} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Antrenman',
          tabBarIcon: ({ color }) => <Ionicons name={ICONS.plan} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Beslenme',
          tabBarIcon: ({ color }) => <Ionicons name={ICONS.nutrition} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'İlerleme',
          tabBarIcon: ({ color }) => <Ionicons name={ICONS.progress} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Sohbet',
          tabBarIcon: ({ color }) => <Ionicons name={ICONS.chat} size={22} color={color} />,
        }}
      />
    </Tabs>
  )
}
