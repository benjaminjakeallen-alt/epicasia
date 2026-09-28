import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import HeaderGlow from '../HeaderGlow';

type Props = {
  title: ReactNode;
  subtitle?: string;
  error?: string | null;
  children?: ReactNode;
  footer?: ReactNode;
};

export default function FormScreen({ title, subtitle, error, children, footer }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <HeaderGlow />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}
      >
        {/* A string title gets the standard heading style; a node (e.g. the
            Wordmark lockup, which contains a non-Text SVG) renders as-is,
            since Views can't safely nest inside Text on native. */}
        {typeof title === 'string' ? (
          <Text style={[type.largeTitle, { color: colors.ink }]}>{title}</Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text style={[type.subtitle, styles.subtitle, { color: colors.inkSecondary }]}>
            {subtitle}
          </Text>
        ) : null}

        {error ? (
          <Text style={[type.body, styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}

        <View style={styles.form}>{children}</View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  subtitle: {
    marginTop: 8,
  },
  error: {
    marginTop: 16,
  },
  form: {
    marginTop: 32,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
});
