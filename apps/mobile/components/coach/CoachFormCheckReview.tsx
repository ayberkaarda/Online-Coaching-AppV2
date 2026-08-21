import { usePendingFormChecks, useReviewFormCheck } from '@repo/api-client'
import type { FormCheckWithUrls } from '@repo/api-client'
import { useState } from 'react'
import { Image, View } from 'react-native'

import { useTheme, type Theme } from '../../lib/theme'
import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Mono,
  SectionHeader,
} from '../ui'

// KOÇ FORM-CHECK İNCELEME (ADR-0028 yetenek 3) — bu danışanın BEKLEYEN form-check'leri.
// `usePendingFormChecks()` TÜM danışanların bekleyenlerini döner; burada clientId'ye süzülür.
// İnceleme: `useReviewFormCheck().mutate({ formCheckId, clientId, coachFeedback })` → status
// 'reviewed' olur ve danışana sistem mesajı/bildirim HOOK İÇİNDE yayınlanır. Poz görselleri
// imzalı URL (PRIVATE bucket) ile `Image` olarak gösterilir.

function PoseImage({ url, label, theme }: { url: string | null; label: string; theme: Theme }) {
  if (!url) return null
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Body variant="bodySm" color="textSecondary">
        {label}
      </Body>
      <Image
        source={{ uri: url }}
        style={{
          width: '100%',
          height: 220,
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        resizeMode="cover"
        accessibilityLabel={`${label} pozu`}
      />
    </View>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

function FormCheckReviewCard({
  formCheck,
  clientId,
  theme,
}: {
  formCheck: FormCheckWithUrls
  clientId: string
  theme: Theme
}) {
  const review = useReviewFormCheck()
  const [feedback, setFeedback] = useState('')

  function handleSubmit() {
    review.mutate(
      { formCheckId: formCheck.id, clientId, coachFeedback: feedback.trim() },
      { onSuccess: () => setFeedback('') }
    )
  }

  return (
    <Card variant="panel" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Mono variant="monoMd">{formCheck.current_weight} kg</Mono>
          <Badge label={shortDate(formCheck.created_at)} tone="neutral" />
        </View>
      </View>

      {formCheck.notes ? (
        <Body variant="bodySm" color="textSecondary">
          Not: {formCheck.notes}
        </Body>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <PoseImage url={formCheck.frontPoseSignedUrl} label="Ön" theme={theme} />
        <PoseImage url={formCheck.backPoseSignedUrl} label="Arka" theme={theme} />
      </View>

      <Input
        label="Geri bildirim"
        value={feedback}
        onChangeText={setFeedback}
        placeholder="Danışana kısa geri bildirim…"
        multiline
        style={{ minHeight: 72, maxHeight: 160 }}
        editable={!review.isPending}
        accessibilityLabel="Form-check geri bildirimi"
      />
      <Button
        title="Gönder"
        onPress={handleSubmit}
        pending={review.isPending}
        disabled={feedback.trim().length === 0}
      />
    </Card>
  )
}

export function CoachFormCheckReview({ clientId }: { clientId: string }) {
  const theme = useTheme()
  const pending = usePendingFormChecks()

  if (pending.isLoading) {
    return <LoadingState label="Form-check yükleniyor" />
  }

  if (pending.isError) {
    return (
      <ErrorState message="Form-check'ler yüklenemedi." onRetry={() => void pending.refetch()} />
    )
  }

  const items = (pending.data ?? []).filter((fc) => fc.client_id === clientId)

  if (items.length === 0) {
    return (
      <EmptyState
        title="Bekleyen form-check yok"
        description="Bu danışanın incelenmeyi bekleyen bir form-check'i yok."
      />
    )
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <SectionHeader icon="clipboard-outline" title={`BEKLEYEN (${items.length})`} />
      {items.map((formCheck) => (
        <FormCheckReviewCard
          key={formCheck.id}
          formCheck={formCheck}
          clientId={clientId}
          theme={theme}
        />
      ))}
    </View>
  )
}
