import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import FormScreen from '../../components/form/FormScreen';
import { PHOTOS } from '../../lib/places';
import { supabase } from '../../lib/supabase';

export default function Register() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleRegister() {
    setError(null);

    if (!displayName.trim()) {
      setError('Enter your name.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // A Supabase project with email confirmation enabled (the default for
    // new projects) returns a user but no session here — the account isn't
    // usable until the confirmation link is clicked. Detect that case by
    // the absence of a session rather than assuming either behavior.
    if (data.user && !data.session) {
      setConfirmationSent(true);
    }
    // If a session came back immediately (confirmations disabled),
    // AuthProvider picks it up and (app)/_layout.tsx redirects on its own.
  }

  if (confirmationSent) {
    return (
      <FormScreen
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}. Click it, then come back and sign in.`}
      >
        <FormButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      hero={PHOTOS.beijingGreatWall}
      title="Join the trip"
      subtitle="Create your Epic Asia account"
      error={error}
      footer={
        <FormButton
          label="Already have an account? Sign in"
          variant="text"
          onPress={() => router.push('/(auth)/login')}
        />
      }
    >
      <FormField label="Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <FormField
        label="Password"
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
      <FormButton label="Create Account" onPress={handleRegister} loading={loading} />
    </FormScreen>
  );
}
