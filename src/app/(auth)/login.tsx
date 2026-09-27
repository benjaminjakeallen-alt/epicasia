import { useRouter } from 'expo-router';
import { useState } from 'react';
import AuthButton from '../../components/auth/AuthButton';
import AuthField from '../../components/auth/AuthField';
import AuthScreen from '../../components/auth/AuthScreen';
import { supabase } from '../../lib/supabase';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    }
    // On success, AuthProvider's onAuthStateChange updates the session and
    // (app)/_layout.tsx's Redirect takes over — nothing else to do here.
  }

  return (
    <AuthScreen
      title="Epic Asia"
      subtitle="Sign in to your trip"
      error={error}
      footer={
        <>
          <AuthButton
            label="Forgot password?"
            variant="text"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
          <AuthButton
            label="Create an account"
            variant="text"
            onPress={() => router.push('/(auth)/register')}
          />
        </>
      }
    >
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
        textContentType="password"
        autoComplete="password"
      />
      <AuthButton label="Sign In" onPress={handleSignIn} loading={loading} />
    </AuthScreen>
  );
}
