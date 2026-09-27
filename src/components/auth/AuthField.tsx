import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

type Props = TextInputProps & {
  label: string;
};

export default function AuthField({ label, style, ...inputProps }: Props) {
  const colors = useTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[type.caption, styles.label, { color: colors.inkTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        placeholderTextColor={colors.inkTertiary}
        style={[
          styles.input,
          type.body,
          { backgroundColor: colors.card, borderColor: colors.border, color: colors.ink },
          style,
        ]}
        autoCapitalize="none"
        autoCorrect={false}
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
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
  },
});
