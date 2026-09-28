import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import FormScreen from '../../components/form/FormScreen';
import Wordmark from '../../components/Wordmark';
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
    <FormScreen
      title={<Wordmark size={40} />}
      subtitle="Sign in to your trip"
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
        textContentType="password"
        autoComplete="password"
      />
      <FormButton label="Sign In" onPress={handleSignIn} loading={loading} />
    </FormScreen>
  );
}
