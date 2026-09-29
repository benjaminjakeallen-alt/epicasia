import { type ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';
import SkyBackdrop from '../SkyBackdrop';

type Props = {
  title: ReactNode;
  subtitle?: string;
  error?: string | null;
  children?: ReactNode;
  footer?: ReactNode;
  /** Optional scenic photo across the top (login/register). */
  hero?: ImageSourcePropType;
};

export default function FormScreen({ title, subtitle, error, children, footer, hero }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {hero ? null : <SkyBackdrop />}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, !hero && { paddingTop: insets.top + 48 }]}
      >
        {hero ? (
          <View style={styles.heroWrap}>
            <Image source={hero} style={styles.hero} resizeMode="cover" />
          </View>
        ) : null}
        <View style={styles.body}>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingBottom: 40,
  },
  heroWrap: {
    height: 300,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    overflow: 'hidden',
    marginBottom: 28,
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  body: {
    paddingHorizontal: 24,
  },
  subtitle: {
    marginTop: 8,
  },
  error: {
    marginTop: 16,
  },
  form: {
    marginTop: 28,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
});
