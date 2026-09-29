import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { shadow } from '../../theme/colors';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'text';
};

export default function FormButton({ label, onPress, loading, disabled, variant = 'primary' }: Props) {
  const colors = useTheme();
  const isDisabled = disabled || loading;

  if (variant === 'text') {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={styles.textButton} hitSlop={8}>
        <Text style={[type.bodyStrong, { color: colors.highlight, opacity: isDisabled ? 0.5 : 1 }]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.accentPressed : colors.accent,
          opacity: isDisabled ? 0.6 : 1,
          boxShadow: shadow.card,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[type.button, { color: colors.onAccent }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
