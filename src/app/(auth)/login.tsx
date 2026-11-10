import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import PasswordField from '../../components/form/PasswordField';
import FormScreen from '../../components/form/FormScreen';
import Wordmark from '../../components/Wordmark';
import { PHOTOS } from '../../lib/places';
import { recordSignIn, REMEMBER_DAYS, savedEmail } from '../../lib/rememberMe';
import { supabase } from '../../lib/supabase';
import { type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

// Supabase's own wording, in plainer words.
function signInMessage(message: string) {
  if (/invalid login credentials/i.test(message)) {
    return 'That email and password don’t match. Check them, or use “Forgot password?” below.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Couldn’t reach Epic Asia. Check your connection and try again.';
  }
  return message;
}

export default function Login() {
  const router = useRouter();
  const colors = useTheme();
  // Arriving from the sign-up confirmation email (see register.tsx).
  const { confirmed } = useLocalSearchParams<{ confirmed?: string }>();
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the email from the last "keep me signed in" sign-in.
  useEffect(() => {
    savedEmail()
      .then((saved) => saved && setEmail((current) => current || saved))
      .catch(() => {});
  }, []);

  async function handleSignIn() {
    if (loading) return;
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setLoading(false);
    if (signInError) {
      setError(signInMessage(signInError.message));
      return;
    }
    await recordSignIn(remember, cleanEmail).catch(() => {});
    // On success, AuthProvider's onAuthStateChange updates the session and
    // (app)/_layout.tsx's Redirect takes over — nothing else to do here.
  }

  return (
    <FormScreen
      hero={PHOTOS.kyotoKinkakuji}
      title={<Wordmark size={42} />}
      subtitle="Japan, China & Hong Kong · June 2027"
      error={error}
      footer={
        <>
          <FormButton
            label="Forgot password?"
            variant="text"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
          <FormButton
            label="Create an account"
            variant="text"
            onPress={() => router.push('/(auth)/register')}
          />
        </>
      }
    >
      {confirmed ? (
        <View style={[styles.notice, { backgroundColor: colors.successSoft }]} accessibilityRole="alert" testID="email-confirmed">
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={[type.body, styles.noticeText, { color: colors.ink }]}>
            Your email is confirmed. Sign in to start.
          </Text>
        </View>
      ) : null}
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        textContentType="password"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
      />
      <Pressable
        testID="remember-me"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remember }}
        aria-checked={remember}
        onPress={() => setRemember((r) => !r)}
        style={styles.remember}
      >
        <View
          style={[
            styles.box,
            { borderColor: remember ? colors.accent : colors.inkTertiary },
            remember && { backgroundColor: colors.accent },
          ]}
        >
          {remember ? <Ionicons name="checkmark" size={14} color={colors.onAccent} /> : null}
        </View>
        <Text style={[type.body, { color: colors.inkSecondary }]}>
          Keep me signed in for {REMEMBER_DAYS} days
        </Text>
      </Pressable>
      <FormButton label="Sign In" onPress={handleSignIn} loading={loading} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, marginBottom: 14 },
  noticeText: { flex: 1 },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // a real 44pt row (the web ignores hitSlop)
    minHeight: 44,
    marginTop: -14,
    marginBottom: 12,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
