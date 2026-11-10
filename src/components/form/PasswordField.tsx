import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import FormField from './FormField';

/**
 * A password FormField with an eye button to see what you typed — on a
 * phone keyboard a mistyped password is otherwise invisible until sign-in
 * fails.
 */
export default function PasswordField({ label, ...inputProps }: TextInputProps & { label: string }) {
  const colors = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <FormField label={label} {...inputProps} secureTextEntry={!visible} style={styles.input} />
      <Pressable
        accessibilityRole="button"
        // (not "Show password": tests and screen readers find the field itself by "Password")
        accessibilityLabel={visible ? 'Hide what you typed' : 'Show what you typed'}
        onPress={() => setVisible((v) => !v)}
        style={styles.eye}
        testID="toggle-visible"
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.inkSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { paddingRight: 52 },
  // FormField: a 52pt input above an 18pt margin; the 44pt button sits centred in the input's right end.
  eye: {
    position: 'absolute',
    right: 4,
    bottom: 18 + 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
