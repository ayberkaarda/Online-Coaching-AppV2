// Bölüm başlığı — küçük satır-içi işlevsel ikon + büyük-harf etiket. Dokuyu artırır
// ama HALKA DEĞİLDİR (ADR-0017 tek anlam kuralı korunur; bu ikonlar dekoratif daire değil).

import { Ionicons } from '@expo/vector-icons'
import { View } from 'react-native'

import { useTheme } from '../../lib/theme'
import { Label } from './Text'
import type { IconName } from './IconButton'

interface SectionHeaderProps {
  icon: IconName
  title: string
}

export function SectionHeader({ icon, title }: SectionHeaderProps) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={14} color={theme.colors.textSecondary} />
      <Label>{title}</Label>
    </View>
  )
}
