import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import AuthButton from '../../components/auth/AuthButton';
import AuthField from '../../components/auth/AuthField';
import AuthScreen from '../../components/auth/AuthScreen';
import { supabase } from '../../lib/supabase';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setError(null);
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={`If an account exists for ${email}, a reset link is on its way.`}
      >
        <AuthButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Reset Password"
      subtitle="We'll email you a link to set a new one."
      error={error}
      footer={
        <AuthButton label="Back to Sign In" variant="text" onPress={() => router.back()} />
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
      <AuthButton label="Send Reset Link" onPress={handleSend} loading={loading} />
    </AuthScreen>
  );
}
