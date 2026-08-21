// Metin girişi — token'lı kenarlık/zemin, odakta accent kenarlık. sign-in ve progress
// ekranları bunu paylaşır. Etiket + hata metni erişilebilir biçimde bağlanır. Opsiyonel
// sol ikon (mail/kilit vb.) doku katar.

import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'

import { fontFamily, useTheme } from '../../lib/theme'
import type { IconName } from './IconButton'
import { Body, Label } from './Text'

interface InputProps extends TextInputProps {
  label?: string
  error?: string | null
  /** Sayısal veri girişi mono fontla gösterilir (kg vb.). */
  mono?: boolean
  /** Sol tarafta gösterilecek işlevsel ikon. */
  leftIcon?: IconName
  containerStyle?: ViewStyle
}

export function Input({
  label,
  error,
  mono = false,
  leftIcon,
  containerStyle,
  style,
  ...rest
}: InputProps) {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.control,
          backgroundColor: theme.colors.surfaceRaised,
          paddingHorizontal: 14,
        }}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? theme.colors.accent : theme.colors.textSecondary}
            style={{ marginRight: 10 }}
          />
        ) : null}
        <TextInput
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.accent}
          onFocus={(e) => {
            setFocused(true)
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            rest.onBlur?.(e)
          }}
          style={[
            {
              flex: 1,
              minHeight: 48,
              color: theme.colors.textPrimary,
              paddingVertical: 12,
              fontFamily: mono ? fontFamily.mono : fontFamily.bodyRegular,
              fontSize: 16,
            },
            style,
          ]}
          {...rest}
        />
      </View>
      {error ? (
        <Body variant="bodySm" color="danger">
          {error}
        </Body>
      ) : null}
    </View>
  )
}
