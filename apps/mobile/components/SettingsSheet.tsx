// Ayar/menü sheet'i — Panel başlığındaki dişli ikonundan açılır. Çıkış yap buradadır
// (Panel gövdesinden çıkarıldı: gövdede havada bir çıkış linki hem bitmemiş görünüyor
// hem yanlış yerdi). React Native `Modal` ile alttan kayan panel + karartılmış zemin.

import { Modal, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '../lib/theme'
import { Body, Heading } from './ui'
import { IconButton } from './ui/IconButton'
import { SignOutButton } from './SignOutButton'

interface SettingsSheetProps {
  visible: boolean
  onClose: () => void
  userName?: string
}

export function SettingsSheet({ visible, onClose, userName }: SettingsSheetProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Karartılmış zemin — dışına dokununca kapanır. */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Menüyü kapat"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        {/* İçerik alanı — dokunuşu yut (arkaya geçip kapatmasın). */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: theme.colors.surfaceRaised,
            borderTopLeftRadius: theme.radius.panel,
            borderTopRightRadius: theme.radius.panel,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.xl,
            gap: theme.spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Heading variant="displaySm">Ayarlar</Heading>
            <IconButton name="close" onPress={onClose} accessibilityLabel="Menüyü kapat" />
          </View>

          {userName ? (
            <View style={{ gap: 2 }}>
              <Body variant="bodyMedium">{userName}</Body>
              <Body variant="bodySm" color="textSecondary">
                Danışan hesabı · Sarmal
              </Body>
            </View>
          ) : null}

          <SignOutButton />
        </Pressable>
      </Pressable>
    </Modal>
  )
}
