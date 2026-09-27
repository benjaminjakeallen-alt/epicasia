import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import AuthButton from '../components/auth/AuthButton';
import AuthField from '../components/auth/AuthField';
import AuthScreen from '../components/auth/AuthScreen';
import { supabase } from '../lib/supabase';

// Landing screen for the link sent by forgot-password.tsx's
// resetPasswordForEmail(). NOT end-to-end verified — doing so requires a
// real device, a real email inbox, and clicking a real link, none of which
// are available in this dev environment. The client is configured for the
// PKCE flow (see src/lib/supabase.ts), so Supabase's email link should
// carry the session as a `?code=` query param, exchanged below via
// exchangeCodeForSession. If this doesn't work when actually tested,
// start by logging the incoming `url` to see its actual shape.
export default function ResetPassword() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const [exchanging, setExchanging] = useState(true);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!incomingUrl) return;

    const { queryParams } = Linking.parse(incomingUrl);
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;

    if (!code) {
      setExchangeError('This reset link is missing its code — it may be malformed or expired.');
      setExchanging(false);
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setExchanging(false);
      if (error) setExchangeError(error.message);
    });
  }, [incomingUrl]);

  async function handleSave() {
    setSaveError(null);
    if (password.length < 8) {
      setSaveError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setSaveError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthScreen title="Password Updated" subtitle="Sign in with your new password.">
        <AuthButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </AuthScreen>
    );
  }

  if (exchanging) {
    return <AuthScreen title="Reset Password" subtitle="Verifying your link..." />;
  }

  if (exchangeError) {
    return (
      <AuthScreen title="Link Problem" error={exchangeError}>
        <AuthButton
          label="Request a new link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Set New Password" error={saveError}>
      <AuthField
        label="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <AuthField
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <AuthButton label="Save Password" onPress={handleSave} loading={saving} />
    </AuthScreen>
  );
}
