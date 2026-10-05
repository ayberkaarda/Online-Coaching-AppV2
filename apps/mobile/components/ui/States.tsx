// Yükleniyor / hata / boş durum görünümleri — web'deki QueryState + EmptyState ruhu.
// Kimlikli (token'lı zemin, aktif fiil metin) ve erişilebilir (role/live region).
// Boş durum illüstrasyonu sarmal sembolünün ince çizgili 48'lik sürümüdür (brand-proposal §5).

import { ActivityIndicator, View } from 'react-native'

import { useTheme } from '../../lib/theme'
import { Button } from './Button'
import { Card } from './Card'
import { SarmalMark } from './SarmalMark'
import { Body, Heading } from './Text'

/** Tam ekran yükleniyor göstergesi (accent renkli). */
export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  const theme = useTheme()
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="large" color={theme.colors.accent} />
    </View>
  )
}

/** Hata kartı — danger tonlu, opsiyonel "Tekrar dene". */
export function ErrorState({
  message = 'Veriler yüklenemedi. Bağlantını kontrol edip tekrar dene.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const theme = useTheme()
  return (
    <View accessibilityRole="alert" style={{ gap: theme.spacing.md }}>
      <Card variant="panel">
        <Body color="danger" variant="bodyMedium">
          {message}
        </Body>
        {onRetry ? <Button title="Tekrar dene" variant="secondary" onPress={onRetry} /> : null}
      </Card>
    </View>
  )
}

/** Boş durum — kesikli kenarlıklı nötr kutu; opsiyonel başlık + açıklama + aksiyon. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      accessibilityRole="summary"
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: theme.radius.panel,
        paddingVertical: theme.spacing.xxxl,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <SarmalMark size={48} thin color="textSecondary" />
      <Heading variant="displaySm" style={{ textAlign: 'center' }}>
        {title}
      </Heading>
      {description ? (
        <Body variant="bodySm" color="textSecondary" style={{ textAlign: 'center' }}>
          {description}
        </Body>
      ) : null}
      {action}
    </View>
  )
}
