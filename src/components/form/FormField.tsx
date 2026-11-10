import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { shadow } from '../../theme/colors';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label: string;
};

export default function FormField({ label, style, onFocus, onBlur, ...inputProps }: Props) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[type.caption, styles.label, { color: colors.inkSecondary }]}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.inkTertiary}
        style={[
          styles.input,
          type.body,
          { backgroundColor: colors.card, borderColor: colors.border, color: colors.ink, boxShadow: shadow.card },
          // The field you're typing in wears a sage ring (in place of the browser's own outline).
          focused ? { outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.highlight } : styles.noOutline,
          style,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 18,
  },
  label: {
    marginBottom: 8,
  },
  noOutline: { outlineWidth: 0 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
  },
});
