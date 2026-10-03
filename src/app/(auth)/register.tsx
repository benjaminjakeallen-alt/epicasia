import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import FormButton from '../../components/form/FormButton';
import FormField from '../../components/form/FormField';
import FormScreen from '../../components/form/FormScreen';
import { INVITE_PATTERN, joinErrorMessage, normalizeInvite } from '../../lib/invites';
import { PHOTOS } from '../../lib/places';
import { recordSignIn } from '../../lib/rememberMe';
import { supabase } from '../../lib/supabase';

export default function Register() {
  const router = useRouter();
  // An invite link (or scanned QR) opens /register?invite=CODE.
  const params = useLocalSearchParams<{ invite?: string }>();
  const [invite, setInvite] = useState(() => (params.invite ? normalizeInvite(String(params.invite)) : ''));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    setError(null);

    const code = normalizeInvite(invite);
    if (!INVITE_PATTERN.test(code)) {
      setError('Enter the invite code a trip organizer sent you (like K7QM-2XPA).');
      return;
    }
    if (!displayName.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter your email address.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    // Sign-up runs in the join-trip Edge Function: it checks the invite code
    // and creates the account already confirmed, so no confirmation email is
    // needed (Supabase's built-in sender only allows a few an hour, and
    // sign-ups were failing on it). Then we sign in with the same password.
    const cleanEmail = email.trim();
    const { error: joinError } = await supabase.functions.invoke('join-trip', {
      body: { email: cleanEmail, password, display_name: displayName.trim(), invite_code: code },
    });
    if (joinError) {
      setLoading(false);
      setError(await joinErrorMessage(joinError));
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (signInError) {
      setLoading(false);
      setError('Your account is ready — sign in with your email and password.');
      return;
    }
    await recordSignIn(true, cleanEmail);
    setLoading(false);
    // AuthProvider picks up the session and (auth)/_layout.tsx moves on to the app.
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
      <FormField
        label="Invite code"
        value={invite}
        onChangeText={setInvite}
        onBlur={() => setInvite((v) => normalizeInvite(v))}
        placeholder="K7QM-2XPA"
        autoCapitalize="characters"
        maxLength={12}
        testID="invite-code"
      />
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
