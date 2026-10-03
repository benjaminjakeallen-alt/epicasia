import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import FormButton from '../components/form/FormButton';
import FormField from '../components/form/FormField';
import FormScreen from '../components/form/FormScreen';
import { supabase } from '../lib/supabase';

// Landing screen for the link sent by forgot-password.tsx's
// resetPasswordForEmail(). NOT end-to-end verified — doing so requires a
// real email inbox and clicking a real link, which this dev environment
// doesn't have. The client is configured for the PKCE flow (see
// src/lib/supabase.ts), so Supabase's email link should carry the session
// as a `?code=` query param on the public site, exchanged below via
// exchangeCodeForSession. If this doesn't work when actually tested,
// start by logging `window.location.href` to see its actual shape.
export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [exchanging, setExchanging] = useState(true);
  const [exchangeFailure, setExchangeFailure] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const code = typeof params.code === 'string' && params.code ? params.code : null;
  const missingCode = code === null;
  const exchangeError = missingCode
    ? 'This reset link is missing its code — it may be malformed or expired.'
    : exchangeFailure;

  useEffect(() => {
    if (!code) return;
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      setExchanging(false);
      if (error) setExchangeFailure(error.message);
    });
  }, [code]);

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
      <FormScreen title="Password Updated" subtitle="Sign in with your new password.">
        <FormButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </FormScreen>
    );
  }

  if (exchanging && !missingCode) {
    return <FormScreen title="Reset Password" subtitle="Verifying your link..." />;
  }

  if (exchangeError) {
    return (
      <FormScreen title="Link Problem" error={exchangeError}>
        <FormButton
          label="Request a new link"
          onPress={() => router.replace('/(auth)/forgot-password')}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Set New Password" error={saveError}>
      <FormField
        label="New Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <FormField
        label="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <FormButton label="Save Password" onPress={handleSave} loading={saving} />
    </FormScreen>
  );
}
