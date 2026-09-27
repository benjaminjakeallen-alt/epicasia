import { useRouter } from 'expo-router';
import { useState } from 'react';
import AuthButton from '../../components/auth/AuthButton';
import AuthField from '../../components/auth/AuthField';
import AuthScreen from '../../components/auth/AuthScreen';
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
      <AuthScreen
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}. Click it, then come back and sign in.`}
      >
        <AuthButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Create Account"
      subtitle="Join the trip"
      error={error}
      footer={
        <AuthButton
          label="Already have an account? Sign in"
          variant="text"
          onPress={() => router.push('/(auth)/login')}
        />
      }
    >
      <AuthField label="Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
      <AuthField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <AuthField
        label="Password"
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
      <AuthButton label="Create Account" onPress={handleRegister} loading={loading} />
    </AuthScreen>
  );
}
