import { Tabs } from 'expo-router'

// Beş placeholder sekme. Etiketler web panelinin ürün diliyle birebir aynı
// (bkz. apps/web/src/components/DashboardTabs.tsx): Panel · Antrenman · Beslenme ·
// İlerleme · Sohbet. İkon seti BİLEREK yok — ikon paketleri (@expo/ui, expo-symbols)
// bu commit'in bağımlılık kümesine alınmadı.
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: 'center' }}>
      <Tabs.Screen name="index" options={{ title: 'Panel' }} />
      <Tabs.Screen name="plan" options={{ title: 'Antrenman' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Beslenme' }} />
      <Tabs.Screen name="progress" options={{ title: 'İlerleme' }} />
      <Tabs.Screen name="chat" options={{ title: 'Sohbet' }} />
    </Tabs>
  )
}
