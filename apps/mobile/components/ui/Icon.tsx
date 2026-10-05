// İkon — Lucide (lucide-react-native), 1.75px çizgi, 20px varsayılan (brand-proposal §5).
// Web'deki lucide-react ile aynı aile. Uygulamanın kullandığı ikonlar burada tek sözlükte
// toplanır; `IconName` bu sözlüğün anahtarıdır (Lucide kebab-case adları). Grafik/ok/merdiven
// tipi "büyüme" ikonografisi YASAK — trending-up vb. bilerek sözlükte yok.

import {
  Activity,
  Bed,
  Calendar,
  CheckCheck,
  ChevronRight,
  CirclePlay,
  CirclePlus,
  ClipboardList,
  CloudUpload,
  Dumbbell,
  Flag,
  Flame,
  House,
  Info,
  KeyRound,
  Layers,
  List,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Plus,
  Repeat,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  Users,
  Utensils,
  Weight,
  X,
  type LucideIcon,
} from 'lucide-react-native'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'

export const icons = {
  activity: Activity,
  bed: Bed,
  calendar: Calendar,
  'check-check': CheckCheck,
  'chevron-right': ChevronRight,
  'circle-play': CirclePlay,
  'circle-plus': CirclePlus,
  'clipboard-list': ClipboardList,
  'cloud-upload': CloudUpload,
  dumbbell: Dumbbell,
  flag: Flag,
  flame: Flame,
  house: House,
  info: Info,
  'key-round': KeyRound,
  layers: Layers,
  list: List,
  lock: Lock,
  'log-out': LogOut,
  mail: Mail,
  'message-circle': MessageCircle,
  plus: Plus,
  repeat: Repeat,
  send: Send,
  settings: Settings,
  shield: Shield,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  'trash-2': Trash2,
  trophy: Trophy,
  users: Users,
  utensils: Utensils,
  weight: Weight,
  x: X,
} as const satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

/** Varsayılan çizgi kalınlığı (§5). */
export const ICON_STROKE = 1.75

interface IconProps {
  name: IconName
  /** Renk — her zaman tema token'ından (theme.colors.*) ya da navigatör tint'inden gelmeli. */
  color: ColorValue
  size?: number
  style?: StyleProp<ViewStyle>
}

export function Icon({ name, color, size = 20, style }: IconProps) {
  const Glyph = icons[name]
  // Navigatör tint'leri pratikte hex string'dir; platforma özgü opak renk gelirse
  // Lucide varsayılanına (currentColor) düşülür.
  const stroke = typeof color === 'string' ? color : undefined
  return <Glyph size={size} color={stroke} strokeWidth={ICON_STROKE} style={style} />
}
