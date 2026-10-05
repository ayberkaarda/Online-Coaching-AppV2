// Metin girişi — surfaceSunken zemin + borderControl kenarlık (≥3:1, brand-proposal §3),
// odakta accent (focusRing) kenarlık. Etiket + hata metni erişilebilir biçimde bağlanır.
// Opsiyonel sol Lucide ikon (mail/kilit vb.).

import { useState } from 'react'
import { TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'

import { fontFamily, useTheme } from '../../lib/theme'
import { Icon, type IconName } from './Icon'
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
      ? theme.colors.focusRing
      : theme.colors.borderControl

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: focused || error ? 2 : 1,
          // Kalınlık değişince içerik kaymasın diye yatay dolgu telafi edilir.
          paddingHorizontal: focused || error ? 13 : 14,
          borderColor,
          borderRadius: theme.radius.control,
          backgroundColor: theme.colors.surfaceSunken,
        }}
      >
        {leftIcon ? (
          <View style={{ marginRight: 10 }}>
            <Icon
              name={leftIcon}
              size={18}
              color={focused ? theme.colors.accent : theme.colors.textSecondary}
            />
          </View>
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
