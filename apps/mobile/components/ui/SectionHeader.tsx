// Bölüm başlığı — küçük satır-içi işlevsel Lucide ikon + büyük-harf etiket.
// Halka değildir (tek anlam kuralı korunur; ikonlar dekoratif daire değil).

import { View } from 'react-native'

import { useTheme } from '../../lib/theme'
import { Icon, type IconName } from './Icon'
import { Label } from './Text'

interface SectionHeaderProps {
  icon: IconName
  title: string
}

export function SectionHeader({ icon, title }: SectionHeaderProps) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={14} color={theme.colors.textSecondary} />
      <Label>{title}</Label>
    </View>
  )
}
