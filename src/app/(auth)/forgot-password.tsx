import { useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import FormScreen from '../../components/form/FormScreen';
import { authReturnUrl } from '../../lib/site';
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
      redirectTo: authReturnUrl('/reset-password'),
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
      <FormScreen
        title="Check your email"
        subtitle={`If an account exists for ${email}, a reset link is on its way.`}
      >
        <FormButton label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Reset Password"
      subtitle="We'll email you a link to set a new one."
      error={error}
      footer={
        <FormButton label="Back to Sign In" variant="text" onPress={() => router.back()} />
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
      <FormButton label="Send Reset Link" onPress={handleSend} loading={loading} />
    </FormScreen>
  );
}
