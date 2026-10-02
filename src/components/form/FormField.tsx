import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { shadow } from '../../theme/colors';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label: string;
};

export default function FormField({ label, style, ...inputProps }: Props) {
  const colors = useTheme();

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
          style,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        {...inputProps}
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
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
  },
});
